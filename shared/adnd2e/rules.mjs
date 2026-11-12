// AD&D Second Edition: Kraken's AD&D 2E ruleset. Plain functions (no Node,
// no DOM), used by the host (building, checks, combat) and by the 2E sheet.
// Kraken's own code: the game's mechanics as numbers and rules, no book text.
// FG's 2E ruleset is the model for how it plays:
//   six abilities, 3 to 25, Strength 18 with an exceptional percentage
//   (18/01 to 18/00); each ability's table: Strength's hit and damage
//   adjustments, Dexterity's reaction, missile and defensive adjustments,
//   Constitution's hit point adjustment (+3 and +4 for warriors only),
//   Wisdom's magical defense and bonus priest spells...;
//   four class groups (warrior, priest, rogue, wizard), each with its hit
//   die, THAC0 progression and saving throw table;
//   THAC0: an attack hits when d20 + modifiers reaches THAC0 - the target's
//   AC (Armor Class descending from 10); a natural 20 hits, a 1 misses;
//   weapons do one damage to Small and Medium creatures, another to Large;
//   five saving throws (Paralyzation, Poison or Death Magic; Rod, Staff or
//   Wand; Petrification or Polymorph; Breath Weapon; Spell): d20 at or above
//   the number;
//   initiative d10 + modifiers, lowest acts first;
//   hit points: at 0 to -9 unconscious and dying, a point lost each round
//   until someone binds the wounds; dead at -10 (a creature dies at 0);
//   thieves' and bards' skills as percentages: base + race + Dexterity +
//   the points the player spends.
//
// A 2E character's record data keeps the keys the core reads (hp {total,
// wounds}, ac {total}, level, exp, expnext, coins, inventorylist, packages)
// and its own: ruleset "adnd2e", race, classes [{name, level, group, exp}],
// abilities {stat: {score, percent, ...the table's numbers}}, thaco, saves
// {paralyzation|rod|petrification|breath|spell: {base, racial, misc,
// total}}, initiative {misc, total}, movement, attacks {key: {name, item,
// thaco, tohit, damage, damagelarge, speed, type, rate}}, thiefskills {key:
// {name, base, race, dex, points, misc, total}}, profs {weapon [names],
// nonweapon [names], weaponslots, nonweaponslots, penalty}, spellcasting
// [{class, kind, perday [..], used [..]}], spells [names], languages.

export const RULESET = "adnd2e";
export const RULESET_NAME = "AD&D 2E";
export const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
export const SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
export const SAVES = ["paralyzation", "rod", "petrification", "breath", "spell"];
export const SAVE_NAMES = { paralyzation: "Paralyzation, Poison or Death", rod: "Rod, Staff or Wand", petrification: "Petrification or Polymorph", breath: "Breath Weapon", spell: "Spell" };
export const SAVE_SHORT = { paralyzation: "Para/Poison/Death", rod: "Rod/Staff/Wand", petrification: "Petri/Poly", breath: "Breath", spell: "Spell" };
export const MAX_LEVEL = 20;
// The array the wizard puts in the class's order when no scores are given (a good 4d6-drop-lowest set).
export const STANDARD_ARRAY = [16, 15, 14, 13, 12, 10];

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const rows = (value) => Object.entries(value && typeof value === "object" ? value : {}).filter(([, row]) => row && typeof row === "object");
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const titled = (word) => String(word ?? "").replace(/^\w/, (letter) => letter.toUpperCase());
export const isAdnd2e = (thing) => (typeof thing === "string" ? thing === RULESET || thing === RULESET_NAME : thing?.ruleset === RULESET || thing?.data?.ruleset === RULESET);
const clampScore = (score) => Math.min(25, Math.max(1, Math.round(num(score, 10))));
// A table by score: the first row whose top is at or above the score.
const byScore = (table, score) => (table.find(([top]) => score <= top) ?? table[table.length - 1]).slice(1);

// --- Abilities ----------------------------------------------------------------
// Strength: hit adjustment, damage adjustment, weight allowance, open doors
// (locked, wizard-locked or barred in brackets), bend bars %. 18 with a
// percentage reads its own rows (18/01-50, 51-75, 76-90, 91-99, 00).
const STRENGTH = [
  [1, -5, -4, 1, "1", 0],
  [2, -3, -2, 1, "1", 0],
  [3, -3, -1, 5, "2", 0],
  [5, -2, -1, 10, "3", 0],
  [7, -1, 0, 20, "4", 0],
  [9, 0, 0, 35, "5", 1],
  [11, 0, 0, 40, "6", 2],
  [13, 0, 0, 45, "7", 4],
  [15, 0, 0, 55, "8", 7],
  [16, 0, 1, 70, "9", 10],
  [17, 1, 1, 85, "10", 13],
  [18, 1, 2, 110, "11", 16],
  [19, 3, 7, 485, "16(8)", 50],
  [20, 3, 8, 535, "17(10)", 60],
  [21, 4, 9, 635, "17(12)", 70],
  [22, 4, 10, 785, "18(14)", 80],
  [23, 5, 11, 935, "18(16)", 90],
  [24, 6, 12, 1235, "19(17)", 95],
  [25, 7, 14, 1535, "19(18)", 99],
];
const EXCEPTIONAL = [
  [50, 1, 3, 135, "12", 20],
  [75, 2, 3, 160, "13", 25],
  [90, 2, 4, 185, "14", 30],
  [99, 2, 5, 235, "15(3)", 35],
  [100, 3, 6, 335, "16(6)", 40],
];
export function strengthOf(score, percent = 0) {
  const s = clampScore(score);
  const p = Math.min(100, Math.max(0, Math.round(num(percent, 0))));
  const [hitadj, dmgadj, weightallow, opendoors, bendbars] = s === 18 && p > 0 ? byScore(EXCEPTIONAL, p === 0 ? 100 : p) : byScore(STRENGTH, s);
  return { hitadj, dmgadj, weightallow, opendoors, bendbars };
}
// Dexterity: reaction adjustment (surprise, and initiative: subtracted),
// missile attack adjustment, defensive adjustment (to AC).
const DEXTERITY = [
  [1, -6, -6, 5],
  [2, -4, -4, 5],
  [3, -3, -3, 4],
  [4, -2, -2, 3],
  [5, -1, -1, 2],
  [6, 0, 0, 1],
  [14, 0, 0, 0],
  [15, 0, 0, -1],
  [16, 1, 1, -2],
  [17, 2, 2, -3],
  [18, 2, 2, -4],
  [20, 3, 3, -4],
  [23, 4, 4, -5],
  [25, 5, 5, -6],
];
export function dexterityOf(score) {
  const [reactionadj, missileadj, defenseadj] = byScore(DEXTERITY, clampScore(score));
  return { reactionadj, missileadj, defenseadj };
}
// Constitution: hit point adjustment (others, warriors), system shock %,
// resurrection survival %, poison save adjustment.
const CONSTITUTION = [
  [1, -3, -3, 25, 30, -2],
  [2, -2, -2, 30, 35, -1],
  [3, -2, -2, 35, 40, 0],
  [4, -1, -1, 40, 45, 0],
  [5, -1, -1, 45, 50, 0],
  [6, -1, -1, 50, 55, 0],
  [7, 0, 0, 55, 60, 0],
  [8, 0, 0, 60, 65, 0],
  [9, 0, 0, 65, 70, 0],
  [10, 0, 0, 70, 75, 0],
  [11, 0, 0, 75, 80, 0],
  [12, 0, 0, 80, 85, 0],
  [13, 0, 0, 85, 90, 0],
  [14, 0, 0, 88, 92, 0],
  [15, 1, 1, 90, 94, 0],
  [16, 2, 2, 95, 96, 0],
  [17, 2, 3, 97, 98, 0],
  [18, 2, 4, 99, 100, 0],
  [19, 2, 5, 99, 100, 1],
  [20, 2, 5, 99, 100, 1],
  [22, 2, 6, 99, 100, 2],
  [25, 2, 7, 100, 100, 4],
];
export function constitutionOf(score) {
  const [hitpointadj, warriorhpadj, systemshock, resurrectionsurvival, poisonadj] = byScore(CONSTITUTION, clampScore(score));
  return { hitpointadj, warriorhpadj, systemshock, resurrectionsurvival, poisonadj };
}
// Intelligence: number of languages, highest wizard spell level, chance to
// learn a spell %, most spells a wizard knows of a level.
const INTELLIGENCE = [
  [1, 0, 0, 0, 0],
  [8, 1, 0, 0, 0],
  [9, 2, 4, 35, 6],
  [10, 2, 5, 40, 7],
  [11, 2, 5, 45, 7],
  [12, 3, 6, 50, 7],
  [13, 3, 6, 55, 9],
  [14, 4, 7, 60, 9],
  [15, 4, 7, 65, 11],
  [16, 5, 8, 70, 11],
  [17, 6, 8, 75, 14],
  [18, 7, 9, 85, 18],
  [19, 8, 9, 95, 99],
  [25, 9, 9, 100, 99],
];
export function intelligenceOf(score) {
  const [languages, spelllevel, learn, maxspells] = byScore(INTELLIGENCE, clampScore(score));
  return { languages, spelllevel, learn, maxspells };
}
// Wisdom: magical defense adjustment, bonus priest spells (cumulative, by
// spell level), spell failure %.
const WISDOM = [
  [1, -6, 80],
  [2, -4, 60],
  [3, -3, 50],
  [4, -2, 45],
  [5, -1, 40],
  [6, -1, 35],
  [7, -1, 30],
  [8, 0, 25],
  [9, 0, 20],
  [10, 0, 15],
  [11, 0, 10],
  [12, 0, 5],
  [14, 0, 0],
  [15, 1, 0],
  [16, 2, 0],
  [17, 3, 0],
  [25, 4, 0],
];
// The extra priest spells each Wisdom score adds (each score's added to every lower one's).
const WISDOM_SPELLS = { 13: [1], 14: [1], 15: [2], 16: [2], 17: [3], 18: [4], 19: [1, 3], 20: [2, 4], 21: [3, 5], 22: [4, 5], 23: [1, 6], 24: [5, 6], 25: [6, 7] };
export function bonusPriestSpells(score) {
  const out = Array(7).fill(0);
  for (let s = 13; s <= clampScore(score); s++) for (const level of WISDOM_SPELLS[s] ?? []) out[level - 1] += 1;
  return out;
}
export function wisdomOf(score) {
  const s = clampScore(score);
  const [magicdefenseadj, failure] = byScore(WISDOM, s);
  const bonus = bonusPriestSpells(s);
  const spellbonus = bonus.map((count, index) => (count ? `${count > 1 ? `${count}x` : ""}${["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"][index]}` : "")).filter(Boolean).join(", ") || "None";
  return { magicdefenseadj, failure, spellbonus };
}
// Charisma: most henchmen, loyalty base, reaction adjustment.
const CHARISMA = [
  [1, 0, -8, -7],
  [2, 1, -7, -6],
  [3, 1, -6, -5],
  [4, 1, -5, -4],
  [5, 2, -4, -3],
  [6, 2, -3, -2],
  [7, 3, -2, -1],
  [8, 3, -1, 0],
  [11, 4, 0, 0],
  [12, 5, 0, 0],
  [13, 5, 0, 1],
  [14, 6, 1, 2],
  [15, 7, 3, 3],
  [16, 8, 4, 5],
  [17, 10, 6, 6],
  [18, 15, 8, 7],
  [19, 20, 10, 8],
  [25, 25, 20, 14],
];
export function charismaOf(score) {
  const [maxhench, loyalty, reaction] = byScore(CHARISMA, clampScore(score));
  return { maxhench, loyalty, reaction };
}
const ABILITY_TABLES = { strength: null, dexterity: dexterityOf, constitution: constitutionOf, intelligence: intelligenceOf, wisdom: wisdomOf, charisma: charismaOf };

// --- Classes ------------------------------------------------------------------
// group, hit die, the level hit dice stop (then a fixed number a level),
// prime requisites, the scores it needs, the races that may take it, its XP table.
export const GROUPS = {
  warrior: { die: 10, top: 9, after: 3, thaco: (l) => 21 - l, weapon: [4, 3], nonweapon: [3, 3], penalty: -2 },
  priest: { die: 8, top: 9, after: 2, thaco: (l) => 20 - 2 * Math.floor((l - 1) / 3), weapon: [2, 4], nonweapon: [4, 3], penalty: -3 },
  rogue: { die: 6, top: 10, after: 2, thaco: (l) => 20 - Math.floor((l - 1) / 2), weapon: [2, 4], nonweapon: [3, 4], penalty: -3 },
  wizard: { die: 4, top: 10, after: 1, thaco: (l) => 20 - Math.floor((l - 1) / 3), weapon: [1, 6], nonweapon: [4, 3], penalty: -5 },
};
// Experience for each level from 2nd up; after the list, the last step again.
const XP = {
  fighter: [2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 750000],
  paladin: [2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000, 600000, 900000],
  ranger: [2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000, 600000, 900000],
  cleric: [1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000, 675000],
  druid: [2000, 4000, 7500, 12500, 20000, 35000, 60000, 90000, 125000, 200000, 300000, 750000, 1500000, 3000000, 3500000, 4000000, 4500000, 5000000, 5500000],
  thief: [1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000, 220000, 440000],
  bard: [1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000, 220000, 440000],
  mage: [2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000, 375000, 750000],
};
export const CLASSES = {
  fighter: { name: "Fighter", group: "warrior", prime: ["strength"], needs: { strength: 9 }, races: ["human", "dwarf", "elf", "gnome", "half-elf", "halfling"] },
  paladin: { name: "Paladin", group: "warrior", prime: ["strength", "charisma"], needs: { strength: 12, constitution: 9, wisdom: 13, charisma: 17 }, races: ["human"], alignment: "Lawful Good" },
  ranger: { name: "Ranger", group: "warrior", prime: ["strength", "dexterity", "wisdom"], needs: { strength: 13, dexterity: 13, constitution: 14, wisdom: 14 }, races: ["human", "elf", "half-elf"] },
  cleric: { name: "Cleric", group: "priest", prime: ["wisdom"], needs: { wisdom: 9 }, races: ["human", "dwarf", "elf", "gnome", "half-elf", "halfling"] },
  druid: { name: "Druid", group: "priest", prime: ["wisdom", "charisma"], needs: { wisdom: 12, charisma: 15 }, races: ["human", "half-elf"], alignment: "True Neutral" },
  thief: { name: "Thief", group: "rogue", prime: ["dexterity"], needs: { dexterity: 9 }, races: ["human", "dwarf", "elf", "gnome", "half-elf", "halfling"] },
  bard: { name: "Bard", group: "rogue", prime: ["dexterity", "charisma"], needs: { dexterity: 12, intelligence: 13, charisma: 15 }, races: ["human", "half-elf"] },
  mage: { name: "Mage", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9 }, races: ["human", "elf", "half-elf"] },
  // The specialist wizards (a mage's experience, spells and hit dice; one
  // more spell of each level; the opposition schools barred). Their needs
  // and races as Kraken's FG 2E character wizard has them.
  abjurer: { name: "Abjurer", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, wisdom: 15 }, races: ["human", "elf", "half-elf"], specialist: true },
  conjurer: { name: "Conjurer", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, constitution: 15 }, races: ["human", "elf", "half-elf"], specialist: true },
  diviner: { name: "Diviner", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, wisdom: 16 }, races: ["human", "elf", "half-elf"], specialist: true },
  enchanter: { name: "Enchanter", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, charisma: 16 }, races: ["human", "elf", "half-elf"], specialist: true },
  illusionist: { name: "Illusionist", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, dexterity: 16 }, races: ["human", "elf", "half-elf", "gnome"], specialist: true },
  invoker: { name: "Invoker", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, constitution: 16 }, races: ["human", "elf", "half-elf"], specialist: true },
  necromancer: { name: "Necromancer", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, wisdom: 16 }, races: ["human", "elf", "half-elf"], specialist: true },
  transmuter: { name: "Transmuter", group: "wizard", prime: ["intelligence"], needs: { intelligence: 9, dexterity: 15 }, races: ["human", "elf", "half-elf"], specialist: true },
};
export const classKey = (name) => {
  const key = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (key === "wizard" || key === "magicuser") return "mage";
  if (key === "rogue") return "thief";
  if (key === "warrior") return "fighter";
  if (key === "priest") return "cleric";
  return key;
};
export function xpFor(className, level) {
  const table = XP[classKey(className)] ?? (CLASSES[classKey(className)]?.group === "wizard" ? XP.mage : XP.fighter);
  if (level <= 1) return 0;
  if (level - 2 < table.length) return table[level - 2];
  const step = table[table.length - 1] - table[table.length - 2];
  return table[table.length - 1] + step * (level - 1 - table.length);
}
export function levelForXp(className, xp) {
  let level = 1;
  while (level < MAX_LEVEL && xpFor(className, level + 1) <= xp) level++;
  return level;
}
export function thacoFor(group, level) {
  const kind = GROUPS[group] ?? GROUPS.warrior;
  return Math.max(1, kind.thaco(Math.max(1, Math.round(num(level, 1)))));
}

// Saving throws by group and level (Paralyzation, Rod, Petrification, Breath, Spell).
const SAVE_TABLES = {
  warrior: [
    [0, 16, 18, 17, 20, 19],
    [2, 14, 16, 15, 17, 17],
    [4, 13, 15, 14, 16, 16],
    [6, 11, 13, 12, 13, 14],
    [8, 10, 12, 11, 12, 13],
    [10, 8, 10, 9, 9, 11],
    [12, 7, 9, 8, 8, 10],
    [14, 5, 7, 6, 5, 8],
    [16, 4, 6, 5, 4, 7],
    [99, 3, 5, 4, 4, 6],
  ],
  priest: [
    [3, 10, 14, 13, 16, 15],
    [6, 9, 13, 12, 15, 14],
    [9, 7, 11, 10, 13, 12],
    [12, 6, 10, 9, 12, 11],
    [15, 5, 9, 8, 11, 10],
    [18, 4, 8, 7, 10, 9],
    [99, 2, 6, 5, 8, 7],
  ],
  rogue: [
    [4, 13, 14, 12, 16, 15],
    [8, 12, 12, 11, 15, 13],
    [12, 11, 10, 10, 14, 11],
    [16, 10, 8, 9, 13, 9],
    [20, 9, 6, 8, 12, 7],
    [99, 8, 4, 7, 11, 5],
  ],
  wizard: [
    [5, 14, 11, 13, 15, 12],
    [10, 13, 9, 11, 13, 10],
    [15, 11, 7, 9, 11, 8],
    [20, 10, 5, 7, 9, 6],
    [99, 8, 3, 5, 7, 4],
  ],
};
export function savesFor(group, level) {
  const table = SAVE_TABLES[group] ?? SAVE_TABLES.warrior;
  const row = byScore(table, Math.max(0, Math.round(num(level, 0))));
  return Object.fromEntries(SAVES.map((save, index) => [save, row[index]]));
}

// --- Races --------------------------------------------------------------------
export const RACES = {
  human: { name: "Human", adjust: {}, movement: 12, infravision: 0, classes: null, multi: [] },
  dwarf: { name: "Dwarf", adjust: { constitution: 1, charisma: -1 }, movement: 6, infravision: 60, conSaves: ["rod", "spell"], conPoison: true, multi: ["Fighter/Thief", "Fighter/Cleric"], languages: "Common, Dwarf, Gnome, Goblin, Kobold, Orc" },
  elf: { name: "Elf", adjust: { dexterity: 1, constitution: -1 }, movement: 12, infravision: 60, multi: ["Fighter/Mage", "Fighter/Thief", "Mage/Thief", "Fighter/Mage/Thief"], languages: "Common, Elf, Gnome, Halfling, Goblin, Hobgoblin, Orc, Gnoll", sleepCharm: 90 },
  gnome: { name: "Gnome", adjust: { intelligence: 1, wisdom: -1 }, movement: 6, infravision: 60, conSaves: ["rod", "spell"], multi: ["Fighter/Cleric", "Fighter/Illusionist", "Fighter/Thief", "Cleric/Illusionist", "Cleric/Thief", "Illusionist/Thief"], languages: "Common, Dwarf, Gnome, Halfling, Goblin, Kobold" },
  "half-elf": { name: "Half-Elf", adjust: {}, movement: 12, infravision: 60, multi: ["Fighter/Cleric", "Fighter/Druid", "Fighter/Thief", "Fighter/Mage", "Cleric/Ranger", "Druid/Ranger", "Cleric/Mage", "Druid/Mage", "Thief/Mage", "Fighter/Mage/Cleric", "Fighter/Mage/Druid", "Fighter/Mage/Thief"], languages: "Common, Elf, Gnome, Halfling, Goblin, Hobgoblin, Orc, Gnoll", sleepCharm: 30 },
  halfling: { name: "Halfling", adjust: { dexterity: 1, strength: -1 }, movement: 6, infravision: 30, conSaves: ["rod", "spell"], conPoison: true, multi: ["Fighter/Thief"], languages: "Common, Halfling, Dwarf, Elf, Gnome, Goblin, Orc" },
};
export const raceKey = (name) => {
  const key = String(name ?? "").toLowerCase().replace(/[^a-z-]/g, "").replace(/^halfelf$/, "half-elf");
  return RACES[key] ? key : /dwar/.test(key) ? "dwarf" : /half-?elf/.test(key) ? "half-elf" : /elf/.test(key) ? "elf" : /gnom/.test(key) ? "gnome" : /halfl|hobbit/.test(key) ? "halfling" : "human";
};
// A demihuman's save bonus from Constitution against rods, staves, wands and spells (and poison, a dwarf's or halfling's).
export const conSaveBonus = (con) => Math.min(5, Math.floor(num(con, 0) / 3.5));
// The classes a race may take, single and multi-class.
export function classesFor(race) {
  const r = RACES[raceKey(race)];
  const single = Object.values(CLASSES).filter((cls) => cls.races.includes(raceKey(race))).map((cls) => cls.name);
  return [...single, ...(r?.multi ?? [])];
}

// --- Thief and bard skills ----------------------------------------------------
export const THIEF_SKILLS = {
  pickpockets: ["Pick Pockets", 15, 10],
  openlocks: ["Open Locks", 10, null],
  findtraps: ["Find/Remove Traps", 5, null],
  movesilently: ["Move Silently", 10, null],
  hideinshadows: ["Hide in Shadows", 5, null],
  detectnoise: ["Detect Noise", 15, 20],
  climbwalls: ["Climb Walls", 60, 50],
  readlanguages: ["Read Languages", 0, 5],
};
const RACE_SKILLS = {
  dwarf: { openlocks: 10, findtraps: 15, climbwalls: -10, readlanguages: -5 },
  elf: { pickpockets: 5, openlocks: -5, movesilently: 5, hideinshadows: 10, detectnoise: 5 },
  gnome: { openlocks: 5, findtraps: 10, movesilently: 5, hideinshadows: 5, detectnoise: 10, climbwalls: -15 },
  "half-elf": { pickpockets: 10, hideinshadows: 5 },
  halfling: { pickpockets: 5, openlocks: 5, findtraps: 5, movesilently: 10, hideinshadows: 15, detectnoise: 5, climbwalls: -15, readlanguages: -5 },
};
const DEX_SKILLS = [
  [9, -15, -10, -10, -20, -10],
  [10, -10, -5, -10, -15, -5],
  [11, -5, 0, -5, -10, 0],
  [12, 0, 0, 0, -5, 0],
  [15, 0, 0, 0, 0, 0],
  [16, 0, 5, 0, 0, 0],
  [17, 5, 10, 0, 5, 5],
  [18, 10, 15, 5, 10, 10],
  [25, 15, 20, 10, 15, 15],
];
const DEX_SKILL_KEYS = ["pickpockets", "openlocks", "findtraps", "movesilently", "hideinshadows"];
// Discretionary points: a thief 60 at 1st and 30 a level; a bard 20 and 15.
export const skillPoints = (className, level) => (classKey(className) === "bard" ? 20 + 15 * (level - 1) : 60 + 30 * (level - 1));

// --- Spells per day -----------------------------------------------------------
const WIZARD_SPELLS = [
  [1],
  [2],
  [2, 1],
  [3, 2],
  [4, 2, 1],
  [4, 2, 2],
  [4, 3, 2, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2, 1],
  [4, 4, 3, 2, 2],
  [4, 4, 4, 3, 3],
  [4, 4, 4, 4, 4, 1],
  [5, 5, 5, 4, 4, 2],
  [5, 5, 5, 4, 4, 2, 1],
  [5, 5, 5, 5, 5, 2, 1],
  [5, 5, 5, 5, 5, 3, 2, 1],
  [5, 5, 5, 5, 5, 3, 3, 2],
  [5, 5, 5, 5, 5, 3, 3, 2, 1],
  [5, 5, 5, 5, 5, 3, 3, 3, 1],
  [5, 5, 5, 5, 5, 4, 3, 3, 2],
];
const PRIEST_SPELLS = [
  [1],
  [2],
  [2, 1],
  [3, 2],
  [3, 3, 1],
  [3, 3, 2],
  [3, 3, 2, 1],
  [3, 3, 3, 2],
  [4, 4, 3, 2, 1],
  [4, 4, 3, 3, 2],
  [5, 4, 4, 3, 2, 1],
  [6, 5, 5, 3, 2, 2],
  [6, 6, 6, 4, 2, 2],
  [6, 6, 6, 5, 3, 2, 1],
  [6, 6, 6, 6, 4, 2, 1],
  [7, 7, 7, 6, 4, 3, 1],
  [7, 7, 7, 7, 5, 3, 2],
  [8, 8, 8, 8, 6, 4, 2],
  [9, 9, 8, 8, 6, 4, 2],
  [9, 9, 9, 8, 7, 5, 2],
];
const BARD_SPELLS = [[], [1], [2], [2, 1], [3, 1], [3, 2], [3, 2, 1], [3, 3, 1], [3, 3, 2], [3, 3, 2, 1], [3, 3, 3, 1], [3, 3, 3, 2], [3, 3, 3, 2, 1], [3, 3, 3, 3, 1], [3, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 4, 3, 3, 3, 1], [4, 4, 4, 3, 3, 2], [4, 4, 4, 4, 3, 2], [4, 4, 4, 4, 4, 2]];
const PALADIN_SPELLS = [[], [], [], [], [], [], [], [], [1], [2], [2, 1], [2, 2], [2, 2, 1], [3, 2, 1], [3, 2, 1, 1], [3, 3, 1, 1], [3, 3, 2, 1], [3, 3, 3, 1], [3, 3, 3, 2], [3, 3, 3, 3]];
const RANGER_SPELLS = [[], [], [], [], [], [], [], [1], [2], [2, 1], [2, 2], [2, 2, 1], [3, 2, 1], [3, 2, 2], [3, 3, 2], [3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3]];
export const CASTERS = {
  mage: { kind: "arcane", table: WIZARD_SPELLS, levels: 9 },
  bard: { kind: "arcane", table: BARD_SPELLS, levels: 6 },
  cleric: { kind: "divine", table: PRIEST_SPELLS, levels: 7, wisdom: true },
  druid: { kind: "divine", table: PRIEST_SPELLS, levels: 7, wisdom: true },
  paladin: { kind: "divine", table: PALADIN_SPELLS, levels: 4 },
  ranger: { kind: "divine", table: RANGER_SPELLS, levels: 3 },
};
// A class's spell table: its own, a specialist wizard's the mage's.
export const casterOf = (className) => CASTERS[classKey(className)] ?? (CLASSES[classKey(className)]?.specialist ? CASTERS.mage : undefined);
export function spellsPerDay(className, level, wisdom = 10) {
  const caster = casterOf(className);
  if (!caster) return [];
  const row = caster.table[Math.min(caster.table.length, Math.max(1, Math.round(num(level, 1)))) - 1] ?? [];
  const bonus = caster.wisdom ? bonusPriestSpells(wisdom) : [];
  // A specialist: one more spell of each level he can cast.
  const extra = CLASSES[classKey(className)]?.specialist ? 1 : 0;
  const out = Array.from({ length: caster.levels }, (_, index) => num(row[index], 0));
  // Wisdom's bonus spells only at the levels the priest can already cast.
  return out.map((count, index) => (count > 0 ? count + num(bonus[index], 0) + extra : 0));
}

// --- Weapons and armor (the Player's Handbook's mechanics) --------------------
// name, damage vs Small/Medium, vs Large, speed factor, type (S/P/B), ranged
// ("missile": thrown or fired), cost (the Player's Handbook's price; "0":
// free, not sold).
export const WEAPONS = [
  ["Battle axe", "1d8", "1d8", 7, "S", false, "5 gp"],
  ["Club", "1d6", "1d3", 4, "B", false, "0"],
  ["Dagger", "1d4", "1d3", 2, "P", false, "2 gp"],
  ["Dart", "1d3", "1d2", 2, "P", true, "5 sp"],
  ["Flail", "1d6+1", "2d4", 7, "B", false, "15 gp"],
  ["Hand axe", "1d6", "1d4", 4, "S", false, "1 gp"],
  ["Halberd", "1d10", "2d6", 9, "P/S", false, "10 gp"],
  ["Javelin", "1d6", "1d6", 4, "P", true, "5 sp"],
  ["Mace", "1d6+1", "1d6", 7, "B", false, "8 gp"],
  ["Morning star", "2d4", "1d6+1", 7, "B", false, "10 gp"],
  ["Quarterstaff", "1d6", "1d6", 4, "B", false, "0"],
  ["Scimitar", "1d8", "1d8", 5, "S", false, "15 gp"],
  ["Spear", "1d6", "1d8", 6, "P", false, "8 sp"],
  ["Long sword", "1d8", "1d12", 5, "S", false, "15 gp"],
  ["Short sword", "1d6", "1d8", 3, "P", false, "10 gp"],
  ["Bastard sword", "1d8", "1d12", 6, "S", false, "25 gp"],
  ["Two-handed sword", "1d10", "3d6", 10, "S", false, "50 gp"],
  ["Warhammer", "1d4+1", "1d4", 4, "B", false, "2 gp"],
  ["Sling", "1d4", "1d4", 6, "B", true, "5 cp"],
  ["Short bow", "1d6", "1d6", 7, "P", true, "30 gp"],
  ["Long bow", "1d6", "1d6", 8, "P", true, "75 gp"],
  ["Light crossbow", "1d4", "1d4", 7, "P", true, "35 gp"],
  ["Heavy crossbow", "1d4+1", "1d6+1", 10, "P", true, "50 gp"],
];
// name, AC, weight, cost; a shield is -1 to AC.
export const ARMOR = [
  ["Padded armor", 8, 10, "4 gp"],
  ["Leather armor", 8, 15, "5 gp"],
  ["Studded leather", 7, 25, "20 gp"],
  ["Ring mail", 7, 30, "100 gp"],
  ["Hide armor", 6, 30, "15 gp"],
  ["Scale mail", 6, 40, "120 gp"],
  ["Chain mail", 5, 40, "75 gp"],
  ["Splint mail", 4, 40, "80 gp"],
  ["Banded mail", 4, 35, "200 gp"],
  ["Plate mail", 3, 50, "600 gp"],
  ["Field plate", 2, 60, "2000 gp"],
  ["Full plate", 1, 70, "4000 gp"],
];
// name, weight, cost.
export const SHIELDS = [
  ["Buckler", 3, "1 gp"],
  ["Small shield", 5, "3 gp"],
  ["Medium shield", 10, "7 gp"],
  ["Body shield", 15, "10 gp"],
];
// name (a dozen), cost.
export const AMMO = [
  ["Arrows (12)", "3 sp"],
  ["Bolts (12)", "1 gp"],
  ["Sling bullets (12)", "1 sp"],
];
const wordsOf = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const same = (a, b) => wordsOf(a).join("") === wordsOf(b).join("");
export const weaponByName = (name) => {
  const text = String(name ?? "").toLowerCase().replace(/\+\d+/g, "").replace(/\s+/g, " ").trim();
  return WEAPONS.find(([weapon]) => same(weapon, text)) ?? WEAPONS.find(([weapon]) => text.includes(weapon.toLowerCase()) || text.replace(/[^a-z]/g, "").includes(weapon.toLowerCase().replace(/[^a-z]/g, "")));
};
// An item for the inventory, FG 2E's fields: a weapon's damage "1d8 slashing;1d12 slashing, large;", an armor's AC.
const DTYPE = { S: "slashing", P: "piercing", B: "bludgeoning", "P/S": "piercing" };
export function makeItem(name) {
  const weapon = weaponByName(name);
  if (weapon && same(weapon[0], name)) {
    const [title, small, large, speed, type, missile, cost] = weapon;
    return { name: title, type: "Weapon", subtype: missile ? "Ranged" : "Melee", damage: `${small} ${DTYPE[type]};${large} ${DTYPE[type]}, large;`, speedfactor: speed, dtype: type, cost, count: 1 };
  }
  const armor = ARMOR.find(([title]) => same(title, name));
  if (armor) return { name: armor[0], type: "Armor", subtype: "Armor", ac: armor[1], weight: armor[2], cost: armor[3], count: 1 };
  if (/^shield$|^(small|medium|body) shield$|^buckler$/i.test(String(name).trim())) {
    const shield = SHIELDS.find(([title]) => same(title, name)) ?? SHIELDS[2];
    return { name: String(name).trim().replace(/^\w/, (c) => c.toUpperCase()), type: "Armor", subtype: "Shield", ac: 1, weight: shield[1], cost: shield[2], count: 1 };
  }
  if (/^(arrows|bolts|sling bullets|crossbow bolts)/i.test(String(name).trim())) {
    const ammo = AMMO.find(([title]) => same(title, name));
    return { name: String(name).trim(), type: "Gear", subtype: "Ammunition", ...(ammo ? { cost: ammo[1] } : {}), count: num(/\((\d+)\)/.exec(String(name))?.[1], 20) || 20 };
  }
  return null;
}
export const isWeapon = (item) => /weapon/i.test(String(item?.type ?? "")) && Boolean(weaponDamage(item).small);
export const isShield = (item) => /armor|shield/i.test(String(item?.type ?? "")) && /shield|buckler/i.test(`${item?.subtype ?? ""} ${item?.name ?? ""}`);
export const isArmor = (item) => /armor/i.test(String(item?.type ?? "")) && !isShield(item) && num(item?.ac, 10) < 10;
// A dice formula: "1d8", "d10", "2d4+1".
const DICE = /(\d*)d(\d+)\s*([+-]\s*\d+)?/i;
export function diceOf(text) {
  const match = DICE.exec(String(text ?? ""));
  if (!match) return "";
  const count = match[1] || "1";
  const bonus = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;
  return `${count}d${match[2]}${bonus ? signed(bonus) : ""}`;
}
// A weapon item's damage to Small/Medium and to Large: its damage list (FG's
// weaponlist), else its damage text, else the weapon table by its name.
export function weaponDamage(item) {
  const out = { small: "", large: "" };
  for (const [, weapon] of rows(item?.weaponlist)) {
    for (const [, damage] of rows(weapon.damagelist)) {
      const dice = diceOf(`${damage.dice}${num(damage.bonus, 0) ? signed(num(damage.bonus, 0)) : ""}`);
      if (/large/i.test(String(damage.type ?? ""))) out.large ||= dice;
      else out.small ||= dice;
    }
    if (out.small) break;
  }
  if (!out.small && item?.damage) {
    const parts = String(item.damage).split(";").map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (/large/i.test(part)) out.large ||= diceOf(part);
      else out.small ||= diceOf(part);
    }
    if (!out.small && /\//.test(String(item.damage))) [out.small, out.large] = String(item.damage).split("/").map(diceOf);
  }
  if (!out.small) {
    const known = weaponByName(item?.name);
    if (known) [out.small, out.large] = [known[1], known[2]];
  }
  out.large ||= out.small;
  return out;
}
const magicOf = (item) => num(item?.bonus, 0) || num(/\+(\d)/.exec(String(item?.name ?? ""))?.[1], 0);

// --- A character --------------------------------------------------------------
const groupOf = (cls) => CLASSES[classKey(cls?.name)]?.group ?? cls?.group ?? "warrior";
export function armorClass(data) {
  let armor = 10;
  let shield = 0;
  let magic = 0;
  for (const [, item] of rows(data.inventorylist)) {
    if (num(item.carried, 1) !== 2) continue;
    if (isShield(item)) {
      shield = Math.max(shield, 1);
      magic += magicOf(item);
    } else if (isArmor(item)) {
      if (num(item.ac, 10) < armor) armor = num(item.ac, 10);
      magic += magicOf(item);
    }
  }
  const dex = num(data.abilities?.dexterity?.defenseadj, 0);
  const misc = num(data.ac?.misc, 0);
  const total = armor - shield - magic + dex + misc;
  return { armor, shield, magic, dex, misc, total, rear: armor - magic + misc, shieldless: armor - magic + dex + misc };
}
export function weaponAttack(data, item, key) {
  const { small, large } = weaponDamage(item);
  if (!small) return null;
  const known = weaponByName(item.name);
  const missile = /ranged|missile|bow|sling|crossbow|ammunition/i.test(`${item.subtype ?? ""}`) || Boolean(known?.[5]) || /bow|sling|crossbow|dart|javelin/i.test(String(item.name));
  const str = data.abilities.strength;
  const dex = data.abilities.dexterity;
  const magic = magicOf(item);
  // Bows take no Strength (a sling and thrown weapons do).
  const fired = /bow/i.test(String(item.name));
  const race = raceKey(data.race);
  const racial = (race === "elf" && /bow|long sword|short sword/i.test(String(item.name)) && !/crossbow/i.test(String(item.name))) || (race === "halfling" && missile && !/bow/i.test(String(item.name))) ? 1 : 0;
  // Proficient: a proficiency naming the weapon, or its kind ("Swords", "Bows", "Sling").
  const stem = (word) => word.replace(/(es|s)$/, "");
  const itemWords = [...wordsOf(item.name), ...wordsOf(known?.[0])].map(stem);
  const names = (name) => same(name, item.name) || (known && same(name, known[0])) || (wordsOf(name).length > 0 && wordsOf(name).every((word) => itemWords.includes(stem(word))));
  const proficient = (data.profs?.weapon ?? []).some(names);
  const penalty = proficient || (data.profs?.weapon ?? []).length === 0 ? 0 : num(data.profs?.penalty, 0);
  // A fighter's weapon specialization: +1 to hit, +2 damage.
  const special = data.profs?.specialized && names(data.profs.specialized) ? 1 : 0;
  const tohit = (missile ? dex.missileadj : str.hitadj) + magic + racial + penalty + special + num(item.attackbonus, 0);
  const dmg = (missile && fired ? 0 : str.dmgadj) + magic + 2 * special;
  const add = (dice) => (dice ? `${dice}${dmg ? signed(dmg) : ""}`.replace(/([+-]\d+)([+-]\d+)$/, (_, a, b) => signed(Number(a) + Number(b))) : "");
  return {
    name: String(item.name ?? known?.[0] ?? "Weapon"),
    item: key,
    thaco: data.thaco,
    tohit,
    damage: add(small),
    damagelarge: add(large),
    speed: num(item.speedfactor, known?.[3] ?? 0),
    type: missile ? "ranged" : "melee",
    dmgtype: known?.[4] ?? (/slash|pierc|bludg/i.exec(String(item.damage ?? ""))?.[0] ?? ""),
    rate: data.rate,
    proficient: penalty === 0,
    ...(special ? { specialized: true } : {}),
  };
}

// Every number of a character worked out again from its scores, classes and gear.
export function derive(input) {
  const data = { ...input, ruleset: RULESET };
  data.abilities = Object.fromEntries(
    STATS.map((stat) => {
      const score = clampScore(data.abilities?.[stat]?.score);
      const percent = stat === "strength" && score === 18 ? Math.min(100, Math.max(0, Math.round(num(data.abilities?.strength?.percent, 0)))) : 0;
      const table = stat === "strength" ? strengthOf(score, percent) : ABILITY_TABLES[stat](score);
      return [stat, { score, ...(stat === "strength" ? { percent } : {}), ...table }];
    }),
  );
  // An exceptional Strength is a warrior's alone (others' 18 has no percentage).
  if (!data.classes?.some?.((cls) => groupOf(cls) === "warrior")) data.abilities.strength = { score: data.abilities.strength.score, percent: 0, ...strengthOf(data.abilities.strength.score, 0) };
  data.classes = (Array.isArray(data.classes) ? data.classes : [])
    .filter((item) => item && item.name)
    .map((item) => ({ name: CLASSES[classKey(item.name)]?.name ?? String(item.name), level: Math.min(MAX_LEVEL, Math.max(1, Math.round(num(item.level, 1)))), group: groupOf(item), ...(item.active === false ? { active: false } : {}) }));
  data.level = Math.max(1, ...data.classes.map((item) => item.level), 1);
  const race = RACES[raceKey(data.race)];
  data.race = data.race || race.name;
  // THAC0 and saves: the best of the classes'.
  data.thaco = data.classes.length ? Math.min(...data.classes.map((item) => thacoFor(item.group, item.level))) : 20;
  const con = data.abilities.constitution.score;
  data.saves = Object.fromEntries(
    SAVES.map((save) => {
      const base = data.classes.length ? Math.min(...data.classes.map((item) => savesFor(item.group, item.level)[save])) : savesFor("warrior", 0)[save];
      const racial = race.conSaves?.includes(save) ? conSaveBonus(con) : 0;
      const misc = num(data.saves?.[save]?.misc, 0);
      return [save, { base, racial, misc, total: Math.max(2, base - racial - misc) }];
    }),
  );
  data.savenotes = [
    data.abilities.wisdom.magicdefenseadj ? `Wisdom: ${signed(data.abilities.wisdom.magicdefenseadj)} on saves against mind-affecting spells` : "",
    race.conPoison ? `${race.name}: +${conSaveBonus(con)} on saves against poison` : "",
    race.sleepCharm ? `${race.name}: ${race.sleepCharm}% resistant to sleep and charm` : "",
  ].filter(Boolean);
  // Initiative: d10, lowest first; Dexterity's reaction adjustment comes off it.
  data.initiative = { misc: num(data.initiative?.misc, 0), total: -data.abilities.dexterity.reactionadj + num(data.initiative?.misc, 0) };
  data.movement = Math.round(num(input.movement, 0)) || race.movement;
  data.infravision = race.infravision;
  // Warriors: 3/2 attacks a round from 7th, 2 from 13th.
  const warrior = Math.max(0, ...data.classes.filter((item) => item.group === "warrior").map((item) => item.level));
  data.rate = warrior >= 13 ? "2/1" : warrior >= 7 ? "3/2" : "1/1";
  // Proficiencies: slots by the class group's (the best of a multi-class's), the nonproficient penalty its smallest.
  // A new slot at each level the group's number divides (PHB Table 34, as the FG wizard counts them);
  // weaponbonus: a kit's extra slots (or fewer).
  const groups = [...new Set(data.classes.map((item) => item.group))];
  const slots = (kind) => Math.max(0, ...data.classes.map((item) => GROUPS[item.group][kind][0] + Math.floor(item.level / GROUPS[item.group][kind][1])));
  const weaponbonus = Math.round(num(input.profs?.weaponbonus, 0));
  data.profs = {
    weapon: (Array.isArray(data.profs?.weapon) ? data.profs.weapon : []).map((name) => String(name).slice(0, 60)).filter(Boolean),
    nonweapon: (Array.isArray(data.profs?.nonweapon) ? data.profs.nonweapon : []).map((name) => String(name).slice(0, 60)).filter(Boolean),
    weaponslots: Math.max(0, slots("weapon") + weaponbonus),
    nonweaponslots: slots("nonweapon"),
    ...(weaponbonus ? { weaponbonus } : {}),
    ...(input.profs?.specialized ? { specialized: String(input.profs.specialized).slice(0, 60) } : {}),
    penalty: groups.length ? Math.max(...groups.map((group) => GROUPS[group].penalty)) : -2,
  };
  data.ac = armorClass(data);
  data.attacks = {};
  for (const [key, item] of rows(data.inventorylist)) {
    if (!isWeapon(item) || num(item.carried, 1) === 0) continue;
    const attack = weaponAttack(data, item, key);
    if (attack) data.attacks[key] = attack;
  }
  if (Object.keys(data.attacks).length === 0) {
    const str = data.abilities.strength;
    data.attacks.unarmed = { name: "Punch", item: "", thaco: data.thaco, tohit: str.hitadj, damage: `1d2${str.dmgadj ? signed(str.dmgadj) : ""}`, damagelarge: `1d2${str.dmgadj ? signed(str.dmgadj) : ""}`, speed: 1, type: "melee", rate: data.rate, proficient: true };
  }
  // Thief and bard skills.
  const skilled = data.classes.find((item) => ["thief", "bard"].includes(classKey(item.name)));
  if (skilled) {
    const bard = classKey(skilled.name) === "bard";
    const dexRow = byScore(DEX_SKILLS, data.abilities.dexterity.score);
    const raceRow = RACE_SKILLS[raceKey(data.race)] ?? {};
    data.thiefskills = Object.fromEntries(
      Object.entries(THIEF_SKILLS)
        .filter(([, [, , bardBase]]) => !bard || bardBase !== null)
        .map(([key, [name, thiefBase, bardBase]]) => {
          const row = data.thiefskills?.[key] ?? {};
          const base = bard ? bardBase : thiefBase;
          const race = num(raceRow[key], 0);
          const dexIndex = DEX_SKILL_KEYS.indexOf(key);
          const dex = dexIndex >= 0 && (!bard || key === "pickpockets") ? dexRow[dexIndex] : 0;
          const points = Math.max(0, Math.round(num(row.points, 0)));
          const misc = Math.round(num(row.misc, 0));
          return [key, { name, base, race, dex, points, misc, total: Math.min(95, Math.max(0, base + race + dex + points + misc)) }];
        }),
    );
    data.skillpoints = skillPoints(skilled.name, skilled.level);
    data.skillclass = skilled.name;
  } else {
    delete data.thiefskills;
    delete data.skillpoints;
    delete data.skillclass;
  }
  // Spells: each casting class's slots a day.
  data.spellcasting = data.classes
    .filter((item) => casterOf(item.name))
    .map((item) => {
      const perday = spellsPerDay(item.name, item.level, data.abilities.wisdom.score);
      const before = (Array.isArray(input.spellcasting) ? input.spellcasting : []).find((row) => row?.class === item.name);
      return { class: item.name, kind: casterOf(item.name).kind, perday, used: perday.map((max, index) => Math.max(0, Math.min(max, Math.round(num(before?.used?.[index], 0))))) };
    })
    .filter((row) => row.perday.some((count) => count > 0));
  data.packages = {
    ...(data.race ? { race: { name: data.race, packagetype: "Race" } } : {}),
    ...Object.fromEntries(data.classes.map((item, index) => [`class${index + 1}`, { name: item.name, packagetype: "Class", level: item.level }])),
  };
  data.hp = { total: Math.max(1, Math.round(num(data.hp?.total, 1))), wounds: Math.max(0, Math.round(num(data.hp?.wounds, 0))), temp: Math.max(0, Math.round(num(data.hp?.temp, 0))) };
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  // A multi-class character's experience is split evenly; the next level is the nearest of its classes'.
  const share = data.classes.length ? Math.floor(data.exp / data.classes.length) : data.exp;
  data.classes = data.classes.map((item) => ({ ...item, exp: share, expnext: item.level >= MAX_LEVEL ? 0 : xpFor(item.name, item.level + 1) }));
  const nexts = data.classes.filter((item) => item.expnext > 0).map((item) => item.expnext * data.classes.length);
  data.expnext = nexts.length ? Math.min(...nexts) : 0;
  data.spells = (Array.isArray(data.spells) ? data.spells : []).map((spell) => String(spell).slice(0, 80)).filter(Boolean);
  data.languages = String(data.languages ?? race.languages ?? "Common");
  return data;
}

// Hit points: 0 to -9 unconscious and dying (a point lost each round until the
// wounds are bound), -10 dead.
export function healthOf(data) {
  const current = num(data?.hp?.total, 0) + num(data?.hp?.temp, 0) - num(data?.hp?.wounds, 0);
  if (current <= -10) return { current, status: "Dead" };
  if (current <= 0) return { current, status: num(data?.stable, 0) ? "Unconscious" : "Dying" };
  return { current, status: current * 2 < num(data?.hp?.total, 1) ? "Wounded" : "Healthy" };
}

// A test for a character: a save (d20 at or above the number), an ability
// check (d20 at or under the score), or a thief skill (d100 at or under).
export function testOf(data, kind, key) {
  if (kind === "save") {
    const save = saveKey(key);
    return { die: "1d20", target: num(data.saves?.[save]?.total, 20), high: true, label: `[SAVE] ${SAVE_NAMES[save]}` };
  }
  if (kind === "skill") {
    const skill = data.thiefskills?.[key] ?? Object.values(data.thiefskills ?? {}).find((row) => row.name.toLowerCase() === String(key).toLowerCase());
    if (!skill) throw new Error("No such skill.");
    return { die: "1d100", target: num(skill.total, 0), high: false, label: `[SKILL] ${skill.name}` };
  }
  if (!STATS.includes(key)) throw new Error("Pick an ability.");
  return { die: "1d20", target: num(data.abilities?.[key]?.score, 10), high: false, label: `[CHECK] ${titled(key)}` };
}
export const saveKey = (key) => {
  const k = String(key ?? "").toLowerCase();
  if (SAVES.includes(k)) return k;
  if (/para|poison|death/.test(k)) return "paralyzation";
  if (/rod|staff|wand/.test(k)) return "rod";
  if (/petri|poly/.test(k)) return "petrification";
  if (/breath/.test(k)) return "breath";
  return "spell";
};

// --- NPCs, from FG 2E's monster records ---------------------------------------
// ac 4; thaco 17; hp 25; hitDice "4+1"; numberattacks "1" or "3"; damage
// "1d10+2" or "1d3/1d3/1d6"; weaponlist {id: {name, attackbonus, damagelist
// {id: {dice, bonus, type}}}}; saves {death|rod|petrification|breath|spell:
// {score}}; size "L", "Large (9'+)"; morale; xp; specialAttacks.
export const isLarge = (size) => /^\s*(l|h|g)\b|large|huge|gargantuan/i.test(String(size ?? ""));
export function hitDiceOf(text) {
  const match = /^\s*(\d+)\s*(?:d8)?\s*([+-]\s*\d+)?/i.exec(String(text ?? ""));
  if (!match) return null;
  const hd = Number(match[1]);
  const bonus = match[2] ? Number(match[2].replace(/\s+/g, "")) : 0;
  return { hd, bonus, formula: `${hd}d8${bonus ? signed(bonus) : ""}` };
}
// A monster's THAC0 by its hit dice (less than 1 die: 20; 1-2: 19; 3-4: 17...
// 2 better each two dice; 3 at 17 and up), and the level it saves at (its
// hit dice; under one die, 0).
export function monsterLevel(hd) {
  return hd ? (hd.hd <= 1 && hd.bonus < 0 ? 0 : hd.hd) : 1;
}
export function monsterThaco(hd) {
  const level = monsterLevel(hd);
  if (level < 1) return 20;
  if (level <= 2) return 19;
  return Math.max(3, 17 - 2 * Math.floor((level - 3) / 2));
}
export function npcStats(data) {
  const ac = num(data?.ac, num(data?.combat?.mac?.score, 10));
  const hd = hitDiceOf(data?.hitDice || data?.hdtext || data?.hd || data?.level);
  const thaco = num(data?.thaco, 0) || num(data?.combat?.mthaco?.score, 0) || monsterThaco(hd);
  const hp = num(data?.hp, 0) || (hd ? Math.max(1, Math.floor(hd.hd * 4.5) + hd.bonus) : 1);
  const attacks = [];
  for (const [, weapon] of rows(data?.weaponlist)) {
    const { small, large } = weaponDamage({ weaponlist: { one: weapon }, name: weapon.name });
    if (!small) continue;
    attacks.push({ name: titled(String(weapon.name || weapon.itemnote?.name || "Attack")), tohit: num(weapon.attackbonus, 0), damage: small, damagelarge: large, type: num(weapon.type, 0) === 1 || /bow|sling|crossbow/i.test(String(weapon.name)) ? "ranged" : "melee", dmgtype: String(rows(weapon.damagelist)[0]?.[1]?.type ?? ""), speed: num(weapon.speedfactor, 0) });
  }
  if (attacks.length === 0 && data?.damage) {
    const parts = String(data.damage).split(/\s*\/\s*|\s*,\s*/).map(diceOf).filter(Boolean);
    const count = Math.max(1, num(/\d+/.exec(String(data?.numberattacks ?? ""))?.[0], parts.length || 1));
    parts.forEach((dice, index) => attacks.push({ name: parts.length > 1 ? `Attack ${index + 1}` : "Attack", tohit: 0, damage: dice, damagelarge: dice, type: "melee", speed: 0 }));
    // "2" attacks with one damage listed: as many as it has.
    while (parts.length === 1 && attacks.length < count) attacks.push({ ...attacks[0], name: `Attack ${attacks.length + 1}` });
    if (parts.length === 1 && count > 1) attacks[0].name = "Attack 1";
  }
  const score = (...keys) => {
    for (const key of keys) if (Number.isFinite(Number(data?.saves?.[key]?.score))) return Number(data.saves[key].score);
    return null;
  };
  const fallback = savesFor("warrior", monsterLevel(hd));
  const saves = {
    paralyzation: score("paralyzation", "death", "poison") ?? fallback.paralyzation,
    rod: score("rod", "staff", "wand") ?? fallback.rod,
    petrification: score("petrification", "polymorph") ?? fallback.petrification,
    breath: score("breath") ?? fallback.breath,
    spell: score("spell") ?? fallback.spell,
  };
  return {
    ac,
    thaco,
    hp,
    hd: hd?.formula ?? "",
    init: num(data?.initiative?.total, 0),
    size: String(data?.size ?? "M"),
    large: isLarge(data?.size),
    attacks,
    saves,
    morale: String(data?.morale ?? ""),
    xp: num(data?.xp, 0),
    special: [data?.specialAttacks, data?.specialDefense].filter((text) => text && !/^nil$/i.test(String(text))).join("; "),
    magicresistance: String(data?.magicresistance ?? ""),
  };
}

// --- Turning undead -----------------------------------------------------------
// A cleric's (a paladin's from 3rd level, as a cleric two levels lower) turning:
// one d20 against the number for the undead's type and the turner's level; T
// turns them automatically, D destroys them, D* destroys them and 2d4 more are
// affected. 2d6 undead are affected, the weakest first. Turned undead flee for
// 3d4 rounds. An evil priest commands instead (the GM's call).
// The columns: levels 1-9, then 10-11, 12-13, 14 and up. 0: no chance.
export const UNDEAD = [
  ["Skeleton", /skeleton/i, 1, [10, 7, 4, "T", "T", "D", "D", "D*", "D*", "D*", "D*", "D*"]],
  ["Zombie", /zombie/i, null, [13, 10, 7, "T", "T", "D", "D", "D", "D*", "D*", "D*", "D*"]],
  ["Ghoul", /ghoul/i, 2, [16, 13, 10, 4, "T", "T", "D", "D", "D", "D*", "D*", "D*"]],
  ["Shadow", /shadow/i, 3, [19, 16, 13, 7, 4, "T", "T", "D", "D", "D", "D*", "D*"]],
  ["Wight", /wight/i, 5, [20, 19, 16, 10, 7, 4, "T", "T", "D", "D", "D", "D*"]],
  ["Ghast", /ghast/i, null, [0, 20, 19, 13, 10, 7, 4, "T", "T", "D", "D", "D"]],
  ["Wraith", /wraith/i, 6, [0, 0, 20, 16, 13, 10, 7, 4, "T", "D", "D", "D"]],
  ["Mummy", /mummy/i, 7, [0, 0, 0, 20, 16, 13, 10, 7, 4, "T", "D", "D"]],
  ["Spectre", /spectre|specter/i, 8, [0, 0, 0, 0, 20, 16, 13, 10, 7, "T", "T", "D"]],
  ["Vampire", /vampire/i, 9, [0, 0, 0, 0, 0, 20, 16, 13, 10, 4, "T", "T"]],
  ["Ghost", /ghost|haunt|banshee/i, 10, [0, 0, 0, 0, 0, 0, 20, 16, 13, 7, 4, "T"]],
  ["Lich", /lich/i, 11, [0, 0, 0, 0, 0, 0, 0, 19, 16, 10, 7, 4]],
  ["Special", /demilich|dracolich|special/i, null, [0, 0, 0, 0, 0, 0, 0, 20, 19, 13, 10, 7]],
];
const UNDEAD_WORDS = /skeleton|zombie|ghoul|ghast|shadow|wight|wraith|mummy|spectre|specter|vampire|ghost|haunt|banshee|lich|undead|revenant|skull|poltergeist|apparition|phantom/i;
// The level a character turns at (0: none): a cleric's level, a paladin's - 2 from 3rd.
export function turnLevel(input) {
  let best = 0;
  for (const cls of input?.classes ?? []) {
    const key = classKey(cls.name);
    if (key === "cleric") best = Math.max(best, num(cls.level, 0));
    if (key === "paladin" && num(cls.level, 0) >= 3) best = Math.max(best, num(cls.level, 0) - 2);
  }
  return best;
}
const turnColumn = (level) => (level <= 9 ? level - 1 : level <= 11 ? 9 : level <= 13 ? 10 : 11);
// An undead creature's row: by its name (a ghoul, a wight), else by its hit
// dice (1: skeleton, 2: ghoul, 3-4: shadow ... 11+: lich). null: not undead.
export function undeadRow(name, data = {}) {
  const text = `${name ?? ""} ${data?.type ?? ""} ${data?.name ?? ""}`;
  const named = UNDEAD.findIndex(([, pattern]) => pattern.test(String(name ?? "")));
  if (named >= 0 && UNDEAD[named][0] !== "Special") return named;
  if (!UNDEAD_WORDS.test(text)) return null;
  if (named >= 0) return named;
  const hd = hitDiceOf(data?.hitDice || data?.hdtext || data?.hd)?.hd ?? 1;
  const at = [...UNDEAD.entries()].reverse().find(([, [, , dice]]) => dice !== null && hd >= dice);
  return at ? at[0] : 0;
}
// What a turner of this level does to that row: { need (a d20 at or above), auto, destroy, more }.
export function turnAgainst(level, row) {
  const cell = UNDEAD[row]?.[3]?.[turnColumn(Math.max(1, level))];
  if (cell === undefined || cell === 0) return { need: 0, impossible: true };
  if (cell === "T") return { need: 0, auto: true };
  if (cell === "D" || cell === "D*") return { need: 0, auto: true, destroy: true, more: cell === "D*" };
  return { need: cell };
}

// --- Building a character -----------------------------------------------------
// spec: { name, race, class ("Fighter", or "Fighter/Thief"), level, levels
// {class: n} (a multi-class's own levels), dual {class, level} (a human's
// first class; class is then the new one), scores {stat: n before the race's
// adjustments} (strengthPercent for 18), or array (six scores, put in the
// class's order), hpRolls {class: [2nd level's roll, 3rd's...]}, alignment,
// kit, gear [item names or [name, count]], money (gp left, or coins {pp, gp,
// ep, sp, cp}), weapons [proficiencies], specialize (a weapon), weaponSlots
// (a kit's own count), nonweapon [proficiencies], languages [names], skills
// {key: points}, spells [names], deity, gender, age, agemax, height, weight,
// size, appearance, personalitytraits, ideals, bonds, flaws, notes, wizard
// (true: empty lists stay empty) }. lib: { items } (the campaign's records,
// for gear the books have). Hit points: the die's highest at 1st level, then
// the rolls given, else the die's average (rounded up), to the level hit dice
// stop, then the fixed number; Constitution each hit-die level; a
// multi-class character's divided by its classes.
export const CLASS_ORDER = {
  fighter: ["strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence"],
  paladin: ["charisma", "wisdom", "strength", "constitution", "dexterity", "intelligence"],
  ranger: ["wisdom", "constitution", "strength", "dexterity", "intelligence", "charisma"],
  cleric: ["wisdom", "constitution", "strength", "charisma", "dexterity", "intelligence"],
  druid: ["wisdom", "charisma", "constitution", "dexterity", "strength", "intelligence"],
  thief: ["dexterity", "constitution", "intelligence", "strength", "wisdom", "charisma"],
  bard: ["charisma", "intelligence", "dexterity", "constitution", "wisdom", "strength"],
  mage: ["intelligence", "dexterity", "constitution", "wisdom", "charisma", "strength"],
};
// The order an array of scores goes in: the class's; a multi-class
// character's puts each class's first prime requisite first.
export function orderFor(classText) {
  const classes = splitClasses(classText);
  const base = CLASS_ORDER[classKey(classes[0]?.name)] ?? (classes[0]?.group === "wizard" ? CLASS_ORDER.mage : STATS);
  return classes.length > 1 ? [...new Set([...classes.map((cls) => cls.prime[0]), ...base])] : base;
}
const KITS = {
  fighter: ["Long sword", "Chain mail", "Shield", "Short bow", "Arrows (20)"],
  paladin: ["Long sword", "Chain mail", "Shield", "Dagger"],
  ranger: ["Long sword", "Short sword", "Studded leather", "Long bow", "Arrows (20)"],
  cleric: ["Mace", "Chain mail", "Shield", "Sling", "Sling bullets (20)"],
  druid: ["Scimitar", "Leather armor", "Shield", "Sling", "Sling bullets (20)"],
  thief: ["Short sword", "Leather armor", "Short bow", "Dagger", "Arrows (20)"],
  bard: ["Long sword", "Leather armor", "Dagger", "Short bow", "Arrows (20)"],
  mage: ["Quarterstaff", "Dagger", "Dart"],
};
const NONWEAPON = {
  warrior: ["Riding, Land-based", "Endurance", "Weaponsmithing", "Survival", "Blind-fighting"],
  priest: ["Healing", "Religion", "Reading/Writing", "Herbalism", "Spellcraft"],
  rogue: ["Tumbling", "Disguise", "Appraising", "Juggling", "Gaming"],
  wizard: ["Spellcraft", "Reading/Writing", "Ancient History", "Astrology", "Herbalism"],
};
// Points a thief or bard spends first, in this order.
const SKILL_FIRST = {
  thief: ["openlocks", "findtraps", "movesilently", "hideinshadows", "pickpockets", "detectnoise", "climbwalls", "readlanguages"],
  bard: ["pickpockets", "detectnoise", "climbwalls", "readlanguages"],
};
export const splitClasses = (text) => String(text ?? "").split(/\s*\/\s*/).map((name) => CLASSES[classKey(name)]).filter(Boolean);
const byName = (list, name) => {
  const wanted = String(name ?? "").toLowerCase().trim();
  if (!wanted) return undefined;
  return list.find((item) => String(item.name).toLowerCase() === wanted) ?? list.find((item) => same(item.name, wanted));
};
const average = (die) => Math.ceil((die + 1) / 2);
// from: the first level that counts (a dual-class character's new class: past the old one's level).
export function hitPointsFor(cls, level, con, { first = "max", rolls = [], from = 1 } = {}) {
  const kind = GROUPS[cls.group];
  const conAdj = cls.group === "warrior" ? constitutionOf(con).warriorhpadj : constitutionOf(con).hitpointadj;
  let hp = 0;
  for (let l = Math.max(1, from); l <= level; l++) {
    if (l <= kind.top) hp += Math.max(1, (l === 1 && first === "max" ? kind.die : num(rolls[l - 1], average(kind.die))) + conAdj);
    else hp += kind.after;
  }
  return hp;
}

export function buildFromSpec(spec, lib = {}) {
  const problems = [];
  const raceId = raceKey(spec?.race ?? "Human");
  const race = RACES[raceId];
  let classes = splitClasses(spec?.class);
  if (classes.length === 0) classes = [CLASSES.fighter];
  // Dual-class (humans): dual { class: the first class, level: its level }; class is the new one.
  const dualFrom = spec?.dual && typeof spec.dual === "object" ? CLASSES[classKey(spec.dual.class)] : null;
  const dualLevel = dualFrom ? Math.min(MAX_LEVEL, Math.max(2, Math.round(num(spec.dual.level, 2)))) : 0;
  if (dualFrom && classes.length > 1) problems.push("A dual-class character takes up one class at a time.");
  const label = classes.map((cls) => cls.name).join("/");
  const sameCombo = (combo) => wordsOf(combo.replace(/\//g, " ")).sort().join() === wordsOf(label.replace(/\//g, " ")).sort().join();
  if (classes.length > 1 && !race.multi.some(sameCombo)) problems.push(`${race.name}: ${label} is not one of its multi-classes (${race.multi.join(", ") || "none"}).`);
  if (dualFrom && raceId !== "human") problems.push("Only humans dual-class (PHB).");
  for (const cls of [...classes, ...(dualFrom ? [dualFrom] : [])]) if (!cls.races.includes(raceId)) problems.push(`A ${race.name.toLowerCase()} cannot be a ${cls.name.toLowerCase()} by the book.`);
  const level = Math.min(MAX_LEVEL, Math.max(1, Math.round(num(spec?.level, 1))));
  // Each class's level: levels {class: n} (a multi-class's, each capped by the race), else the level.
  const levelOf = (cls) => Math.min(MAX_LEVEL, Math.max(1, Math.round(num(spec?.levels?.[cls.name] ?? spec?.levels?.[classKey(cls.name)], level))));
  const order = orderFor(label);
  const given = spec?.scores && typeof spec.scores === "object" ? spec.scores : null;
  const array = Array.isArray(spec?.array) && spec.array.length === 6 ? spec.array.map((value) => num(value, 10)) : STANDARD_ARRAY;
  const scores = Object.fromEntries(STATS.map((stat) => [stat, given ? num(given[stat] ?? given[SHORT[stat].toLowerCase()], 10) : array[order.indexOf(stat)]]));
  if (!given) {
    // The class's needs met first (a paladin's Charisma 17): the array's
    // scores moved to them, the race's adjustments counted.
    for (const cls of classes) {
      for (const [stat, need] of Object.entries(cls.needs)) {
        const after = scores[stat] + num(race.adjust[stat], 0);
        if (after < need) scores[stat] = need - num(race.adjust[stat], 0);
      }
    }
  }
  for (const [stat, change] of Object.entries(race.adjust)) scores[stat] = Math.max(3, Math.min(19, (scores[stat] ?? 10) + change));
  for (const cls of classes) for (const [stat, need] of Object.entries(cls.needs)) if (scores[stat] < need) problems.push(`A ${cls.name.toLowerCase()} needs ${titled(stat)} ${need} (has ${scores[stat]}).`);
  const warriorAny = [...classes, ...(dualFrom ? [dualFrom] : [])].some((cls) => cls.group === "warrior");
  const percent = scores.strength === 18 && warriorAny ? Math.min(100, Math.max(1, Math.round(num(spec?.strengthPercent ?? given?.strengthPercent, 50)))) : 0;
  // Hit points: the die's highest at 1st level, then the rolls the wizard made on
  // the host (hpRolls {class: [2nd level's, 3rd's...]}), else the die's average;
  // a multi-class character's divided by its classes; a dual-class character
  // gains none in the new class until it passes the old one's level.
  const rollsOf = (cls) => {
    const list = spec?.hpRolls?.[cls.name] ?? spec?.hpRolls?.[classKey(cls.name)];
    return Array.isArray(list) ? [0, ...list.map((value) => num(value, 0) || undefined)] : [];
  };
  const con = scores.constitution;
  let hp;
  const entries = dualFrom ? [{ cls: dualFrom, level: dualLevel, active: false }, { cls: classes[0], level, active: true }] : classes.map((cls) => ({ cls, level: levelOf(cls), active: true }));
  if (dualFrom) hp = hitPointsFor(dualFrom, dualLevel, con, { rolls: rollsOf(dualFrom) }) + hitPointsFor(classes[0], level, con, { rolls: rollsOf(classes[0]), from: dualLevel + 1 });
  else hp = Math.floor(entries.reduce((sum, entry) => sum + hitPointsFor(entry.cls, entry.level, con, { rolls: rollsOf(entry.cls) }), 0) / entries.length);
  hp = Math.max(1, hp);
  // Experience: each class's least for its level, added up (the FG wizard's).
  const exp = entries.reduce((sum, entry) => sum + xpFor(entry.cls.name, entry.level), 0);
  // Gear: the books' items by name, else Kraken's table of weapons and armor; [name, count] buys several.
  const inventorylist = {};
  const items = lib.items ?? [];
  const gear = Array.isArray(spec?.gear) && spec.gear.length ? spec.gear : [...new Set(classes.flatMap((cls) => KITS[classKey(cls.name)] ?? []))].slice(0, 6);
  for (const entry of gear) {
    const [name, count] = Array.isArray(entry) ? [String(entry[0] ?? ""), Math.max(1, Math.round(num(entry[1], 1)))] : [String(entry ?? ""), 1];
    const found = byName(items, name);
    const made = found ? { ...Object.fromEntries(Object.entries(found.data ?? {}).filter(([field]) => field !== "fgPath")), name: found.name } : makeItem(name);
    if (!made) {
      problems.push(`No item "${name}".`);
      continue;
    }
    // Starting gear is gear the character knows.
    if (made.isidentified !== undefined) made.isidentified = 1;
    const id = `id-${String(Object.keys(inventorylist).length + 1).padStart(5, "0")}`;
    // Worn: the best armor and one shield; weapons in hand.
    inventorylist[id] = { ...made, count: (num(made.count, 1) || 1) * count, carried: isWeapon(made) || isShield(made) || isArmor(made) ? 2 : 1 };
  }
  const armors = Object.values(inventorylist).filter(isArmor);
  for (const extra of armors.sort((a, b) => num(a.ac, 10) - num(b.ac, 10)).slice(1)) extra.carried = 1;
  const shields = Object.values(inventorylist).filter(isShield);
  for (const extra of shields.slice(1)) extra.carried = 1;
  // Proficiencies: the given, else the kit's weapons, as many as the slots allow.
  const group = classes[0].group;
  const slotsOf = (kind) => Math.max(...entries.map((entry) => GROUPS[entry.cls.group][kind][0] + Math.floor(entry.level / GROUPS[entry.cls.group][kind][1])));
  const weaponSlots = Number.isFinite(Number(spec?.weaponSlots)) ? Math.max(0, Math.round(Number(spec.weaponSlots))) : slotsOf("weapon");
  const nonweaponSlots = Number.isFinite(Number(spec?.nonweaponSlots)) ? Math.max(0, Math.round(Number(spec.nonweaponSlots))) : slotsOf("nonweapon");
  const kitWeapons = Object.values(inventorylist).filter(isWeapon).map((item) => item.name);
  const specialized = spec?.specialize ? String(spec.specialize) : "";
  // The wizard's choices stand as made (none is none); otherwise none given takes the defaults.
  const chosen = (list) => Array.isArray(list) && (list.length > 0 || spec?.wizard === true);
  const weapons = (chosen(spec?.weapons) ? spec.weapons.map(String) : kitWeapons).slice(0, Math.max(0, weaponSlots - (specialized ? 1 : 0)));
  if (specialized && !weapons.some((name) => same(name, specialized))) problems.push(`Specialized in ${specialized} without its proficiency.`);
  const nonweapon = chosen(spec?.nonweapon) ? spec.nonweapon.map(String) : NONWEAPON[group].slice(0, nonweaponSlots);
  // Thief and bard skills: the given points, else spent in the class's order (30 at most in one at 1st).
  const skilled = classes.find((cls) => ["thief", "bard"].includes(classKey(cls.name)));
  const thiefskills = {};
  if (skilled) {
    const skillLevel = levelOf(skilled);
    let points = skillPoints(skilled.name, skillLevel);
    const cap = (classKey(skilled.name) === "bard" ? 15 : 30) + 15 * (skillLevel - 1);
    const wanted = spec?.skills && typeof spec.skills === "object" ? Object.entries(spec.skills) : [];
    for (const [skill, value] of wanted) {
      if (!THIEF_SKILLS[skill]) {
        problems.push(`No thief skill "${skill}".`);
        continue;
      }
      const take = Math.max(0, Math.min(points, cap, Math.round(num(value, 0))));
      thiefskills[skill] = { points: take };
      points -= take;
    }
    const firsts = SKILL_FIRST[classKey(skilled.name)];
    while (points > 0 && firsts.some((skill) => num(thiefskills[skill]?.points, 0) < cap)) {
      for (const skill of firsts) {
        if (points <= 0) break;
        const had = num(thiefskills[skill]?.points, 0);
        const take = Math.min(5, points, cap - had);
        if (take <= 0) continue;
        thiefskills[skill] = { points: had + take };
        points -= take;
      }
    }
  }
  // Money: coins {pp, gp, ep, sp, cp}, or money (gp, the purse left after shopping, laid out as
  // gold, silver and copper). A priest keeps 3 gp of it; the rest goes to his order (PHB Table 43).
  const coinsIn = spec?.coins && typeof spec.coins === "object" ? spec.coins : null;
  let copper = coinsIn ? Math.round(num(coinsIn.pp, 0) * 500 + num(coinsIn.gp, 0) * 100 + num(coinsIn.ep, 0) * 50 + num(coinsIn.sp, 0) * 10 + num(coinsIn.cp, 0)) : Math.round(Math.max(0, num(spec?.money, 0)) * 100);
  let priestNote = "";
  const allPriest = entries.every((entry) => entry.cls.group === "priest");
  if (allPriest && copper > 300 && !coinsIn) {
    priestNote = `${(copper - 300) / 100} gp left after shopping went back to the priest's order; he keeps 3 gp (PHB Table 43).`;
    copper = 300;
  }
  const coins = coinsIn
    ? { "id-00001": { name: "PP", amount: Math.round(num(coinsIn.pp, 0)) }, "id-00002": { name: "GP", amount: Math.round(num(coinsIn.gp, 0)) }, "id-00003": { name: "EP", amount: Math.round(num(coinsIn.ep, 0)) }, "id-00004": { name: "SP", amount: Math.round(num(coinsIn.sp, 0)) }, "id-00005": { name: "CP", amount: Math.round(num(coinsIn.cp, 0)) } }
    : { "id-00001": { name: "PP", amount: 0 }, "id-00002": { name: "GP", amount: Math.floor(copper / 100) }, "id-00003": { name: "EP", amount: 0 }, "id-00004": { name: "SP", amount: Math.floor((copper % 100) / 10) }, "id-00005": { name: "CP", amount: copper % 10 } };
  // Languages: the race's own and the ones chosen for Intelligence.
  const languages = Array.isArray(spec?.languages) ? [...new Set(spec.languages.map(String).filter(Boolean))].join(", ") : undefined;
  const text = (key) => String(spec?.[key] ?? "").slice(0, 8000);
  const notes = [
    ["Personality", text("personalitytraits")],
    ["Ideals", text("ideals")],
    ["Bonds", text("bonds")],
    ["Flaws", text("flaws")],
  ]
    .filter(([, value]) => value)
    .map(([title, value]) => `${title}: ${value}`);
  if (text("notes")) notes.push(text("notes"));
  if (priestNote) notes.push(priestNote);
  const data = derive({
    race: race.name,
    alignment: String(spec?.alignment ?? classes.find((cls) => cls.alignment)?.alignment ?? ""),
    classes: entries.map((entry) => ({ name: entry.cls.name, level: entry.level, group: entry.cls.group, ...(entry.active ? {} : { active: false }) })),
    abilities: Object.fromEntries(STATS.map((stat) => [stat, { score: scores[stat], ...(stat === "strength" ? { percent } : {}) }])),
    hp: { total: hp, wounds: 0 },
    inventorylist,
    coins,
    // A kit's own weapon slots (more or fewer than the class's): the difference kept as weaponbonus.
    profs: { weapon: weapons, nonweapon, ...(specialized ? { specialized } : {}), ...(weaponSlots !== slotsOf("weapon") ? { weaponbonus: weaponSlots - slotsOf("weapon") } : {}) },
    thiefskills,
    spells: Array.isArray(spec?.spells) ? spec.spells.map(String) : [],
    exp,
    ...(spec?.kit ? { background: String(spec.kit).slice(0, 200), kit: String(spec.kit).slice(0, 200) } : {}),
    ...(languages ? { languages } : {}),
    ...Object.fromEntries(["deity", "gender", "age", "agemax", "height", "weight", "size", "appearance"].filter((key) => text(key)).map((key) => [key, text(key)])),
    ...(notes.length ? { notes: notes.join("\n\n") } : {}),
  });
  const name = String(spec?.name ?? "").trim() || `${race.name} ${dualFrom ? `${dualFrom.name}/` : ""}${label}`;
  return { name, data, problems, ...(priestNote ? { notes: [priestNote] } : {}) };
}

// A level gained in one class (the first, or the one named): its hit points
// (rolled: the die's roll, or past the hit-die levels the fixed number; a
// multi-class character's divided by its classes), every number again.
export function levelUp(input, rolled, className) {
  const data = derive(input);
  const classes = data.classes.map((item) => ({ name: item.name, level: item.level, group: item.group }));
  const cls = classes.find((item) => same(item.name, className)) ?? classes[0];
  if (!cls) throw new Error("No class to level up.");
  if (cls.level >= MAX_LEVEL) throw new Error(`Already level ${MAX_LEVEL}.`);
  cls.level += 1;
  const kind = GROUPS[cls.group];
  const con = data.abilities.constitution.score;
  const conAdj = cls.group === "warrior" ? constitutionOf(con).warriorhpadj : constitutionOf(con).hitpointadj;
  const raw = cls.level <= kind.top ? Math.max(1, Math.round(num(rolled, average(kind.die))) + conAdj) : kind.after;
  const gain = Math.max(1, Math.floor(raw / classes.length));
  const exp = Math.max(data.exp, xpFor(cls.name, cls.level) * classes.length);
  const next = derive({ ...data, classes, hp: { ...data.hp, total: data.hp.total + gain }, exp });
  return { data: next, gain, className: cls.name, hitDie: cls.level <= kind.top ? kind.die : 0 };
}

// --- FG 2E character sheets (a book's pregens) --------------------------------
// FG 2E's charsheet: abilities {stat: {score|base, percent}}, classes {id:
// {name, level}}, hp {total, wounds}, inventorylist, proficiencylist {id:
// {name}} (weapon), skilllist {id: {name}} (nonweapon), race, alignment...
export function fromFG(sheet) {
  const classes = rows(sheet?.classes).map(([, cls]) => ({ name: String(cls.name ?? "Fighter"), level: num(cls.level, 1) }));
  const abilities = Object.fromEntries(STATS.map((stat) => [stat, { score: num(sheet?.abilities?.[stat]?.score ?? sheet?.abilities?.[stat]?.base, 10), ...(stat === "strength" ? { percent: num(sheet?.abilities?.strength?.percent, 0) } : {}) }]));
  const inventorylist = {};
  for (const [key, item] of rows(sheet?.inventorylist)) {
    const { locked, dmonly, effectlist, subitems, abilitylist, savelist, powermode, ...rest } = item;
    inventorylist[key] = rest;
  }
  const names = (list) => rows(list).map(([, row]) => String(row.name ?? "").trim()).filter(Boolean);
  const text = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return derive({
    race: String(sheet?.race ?? "Human"),
    alignment: String(sheet?.alignment ?? ""),
    deity: String(sheet?.deity ?? ""),
    gender: String(sheet?.gender ?? ""),
    age: String(sheet?.age ?? ""),
    height: String(sheet?.height ?? ""),
    weight: String(sheet?.weight ?? ""),
    appearance: text(sheet?.appearance),
    notes: [sheet?.ideals, sheet?.bonds, sheet?.flaws, sheet?.notes].map(text).filter(Boolean).join("\n\n"),
    classes,
    abilities,
    hp: { total: num(sheet?.hp?.total, 1), wounds: num(sheet?.hp?.wounds, 0) },
    inventorylist,
    coins: sheet?.coins ?? {},
    profs: { weapon: names(sheet?.proficiencylist), nonweapon: names(sheet?.skilllist) },
    spells: rows(sheet?.powers).map(([, power]) => String(power.name ?? "")).filter(Boolean),
    exp: num(sheet?.exp, 0),
  });
}
