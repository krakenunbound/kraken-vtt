// Basic Fantasy Role-Playing Game, 4th Edition: Kraken's "Basic Fantasy"
// ruleset. Plain functions (no Node, no DOM), used by the host (building,
// checks, combat, level ups) and by the sheet and wizard in the browser.
// Kraken's own code; the numbers are the game's, from its 4th Edition
// (Release 128) by Chris Gonnerman, CC BY-SA 4.0 (www.basicfantasy.org).
//
// How it plays:
//   six abilities 3-18, each with one bonus (3: -3, 4-5: -2, 6-8: -1, 9-12:
//   0, 13-15: +1, 16-17: +2, 18: +3); Strength to melee attack and damage,
//   Dexterity to missile attacks, Armor Class and initiative, Constitution
//   to each hit die (no die below 1);
//   four races (Dwarf, Elf, Halfling, Human) with ability limits, the
//   classes they may take and saving throw bonuses; four classes (Cleric,
//   Fighter, Magic-User, Thief) and the Elf's combination classes
//   (Fighter/Magic-User, Magic-User/Thief: the best attack bonus and saves
//   of both, the experience of both added);
//   ascending Armor Class (11 unarmoured, leather 13, chain 15, plate 17, a
//   shield +1, + Dexterity); an attack is d20 + the attack bonus + Strength
//   (melee) or Dexterity (missile) at or above the target's AC: a natural
//   20 hits, a natural 1 misses;
//   initiative d6 + Dexterity, the highest first;
//   five saving throws (Death Ray or Poison, Magic Wands, Paralysis or
//   Petrify, Dragon Breath, Spells): d20 at or above the class's number, a
//   natural 1 fails, a 20 succeeds; a demi-human's bonus comes off the number;
//   a creature or character at 0 hit points is dead;
//   hit dice to 9th level, then a fixed number a level (no Constitution);
//   thief abilities as percentages by level; clerics turn the undead (d20
//   against the table, 2d6 hit dice affected); spells a day by class level;
//   monsters: hit dice (d8 each), attack bonus by hit dice, saves as a
//   class and level, a morale score (2d6 at or under to stand).
//
// A Basic Fantasy character's record data keeps the keys the core reads
// (hp {total, wounds}, ac {total}, level, exp, expnext, coins,
// inventorylist) and its own: ruleset "bfrpg", race, class (its key:
// fighter, cleric, magicuser, thief, fightermagicuser, magicuserthief),
// className, abilities {stat: {score, bonus}}, ab (the attack bonus),
// attack {melee, missile}, saves {death|wands|paralysis|breath|spells:
// {base, racial, misc, total}}, initiative {misc, total}, movement,
// attacks {key: {name, item, bonus, damage, type}}, thiefskills {key:
// {name, base, misc, total}}, turn (a cleric's level against the undead),
// spellcasting {kind, perday [6], used [6]}, spellbook [names], prepared
// [names], languages, alignment, loyalty (a retainer's).

export const RULESET = "bfrpg";
export const RULESET_NAME = "Basic Fantasy";
export const STATS = ["strength", "intelligence", "wisdom", "dexterity", "constitution", "charisma"];
export const SHORT = { strength: "STR", intelligence: "INT", wisdom: "WIS", dexterity: "DEX", constitution: "CON", charisma: "CHA" };
export const SAVES = ["death", "wands", "paralysis", "breath", "spells"];
export const SAVE_NAMES = { death: "Death Ray or Poison", wands: "Magic Wands", paralysis: "Paralysis or Petrify", breath: "Dragon Breath", spells: "Spells" };
export const MAX_LEVEL = 20;
export const ALIGNMENTS = ["Lawful", "Neutral", "Chaotic"];

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const rows = (value) => Object.entries(value && typeof value === "object" ? value : {}).filter(([, row]) => row && typeof row === "object");
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const isBfrpg = (thing) => (typeof thing === "string" ? thing === RULESET || thing === RULESET_NAME : thing?.ruleset === RULESET || thing?.data?.ruleset === RULESET);
const clampScore = (score) => Math.min(25, Math.max(1, Math.round(num(score, 10))));

// --- Abilities --------------------------------------------------------------
export function abilityBonus(score) {
  const s = clampScore(score);
  if (s <= 3) return -3;
  if (s <= 5) return -2;
  if (s <= 8) return -1;
  if (s <= 12) return 0;
  if (s <= 15) return 1;
  if (s <= 17) return 2;
  return 3;
}

// --- Classes ------------------------------------------------------------------
// Experience for each level (1st to 20th), the attack bonus at each, the hit
// die, the hit points a level after 9th, the saving throws by level (rows
// for 1, 2-3, 4-5 ... 18-19, 20: Death Ray, Wands, Paralysis, Breath, Spells).
const SAVE_ROWS = {
  cleric: [[11, 12, 14, 16, 15], [10, 11, 13, 15, 14], [9, 10, 13, 15, 14], [9, 10, 12, 14, 13], [8, 9, 12, 14, 13], [8, 9, 11, 13, 12], [7, 8, 11, 13, 12], [7, 8, 10, 12, 11], [6, 7, 10, 12, 11], [6, 7, 9, 11, 10], [5, 6, 9, 11, 10]],
  fighter: [[12, 13, 14, 15, 17], [11, 12, 14, 15, 16], [11, 11, 13, 14, 15], [10, 11, 12, 14, 15], [9, 10, 12, 13, 14], [9, 9, 11, 12, 13], [8, 9, 10, 12, 13], [7, 8, 10, 11, 12], [7, 7, 9, 10, 11], [6, 7, 8, 10, 11], [5, 6, 8, 9, 10]],
  magicuser: [[13, 14, 13, 16, 15], [13, 14, 13, 15, 14], [12, 13, 12, 15, 13], [12, 12, 11, 14, 13], [11, 11, 10, 14, 12], [11, 10, 9, 13, 11], [10, 10, 9, 13, 11], [10, 9, 8, 12, 10], [9, 8, 7, 12, 9], [9, 7, 6, 11, 9], [8, 6, 5, 11, 8]],
  thief: [[13, 14, 13, 16, 15], [12, 14, 12, 15, 14], [11, 13, 12, 14, 13], [11, 13, 11, 13, 13], [10, 12, 11, 12, 12], [9, 12, 10, 11, 11], [9, 10, 10, 10, 11], [8, 10, 9, 9, 10], [7, 9, 9, 8, 9], [7, 9, 8, 7, 9], [6, 8, 8, 6, 8]],
};
// A normal man (zero level): the Fighter's NM row.
export const NORMAL_MAN_SAVES = [13, 14, 15, 16, 18];
const saveRow = (level) => (level <= 1 ? 0 : level >= 20 ? 10 : Math.floor(level / 2));

// Spells a day (spell levels 1 to 6) at each class level.
const CLERIC_SPELLS = [[0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0], [2, 2, 0, 0, 0, 0], [2, 2, 1, 0, 0, 0], [3, 2, 2, 0, 0, 0], [3, 2, 2, 1, 0, 0], [3, 3, 2, 2, 0, 0], [3, 3, 2, 2, 1, 0], [4, 3, 3, 2, 2, 0], [4, 4, 3, 2, 2, 1], [4, 4, 3, 3, 2, 2], [4, 4, 4, 3, 2, 2], [4, 4, 4, 3, 3, 2], [5, 4, 4, 3, 3, 2], [5, 5, 4, 3, 3, 2], [5, 5, 4, 4, 3, 3], [6, 5, 4, 4, 3, 3], [6, 5, 5, 4, 3, 3]];
const MAGIC_SPELLS = [[1, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0], [2, 2, 0, 0, 0, 0], [2, 2, 1, 0, 0, 0], [3, 2, 2, 0, 0, 0], [3, 2, 2, 1, 0, 0], [3, 3, 2, 2, 0, 0], [3, 3, 2, 2, 1, 0], [4, 3, 3, 2, 2, 0], [4, 4, 3, 2, 2, 1], [4, 4, 3, 3, 2, 2], [4, 4, 4, 3, 2, 2], [4, 4, 4, 3, 3, 2], [5, 4, 4, 3, 3, 2], [5, 5, 4, 3, 3, 2], [5, 5, 4, 4, 3, 3], [6, 5, 4, 4, 3, 3], [6, 5, 5, 4, 3, 3], [6, 5, 5, 4, 4, 3]];

export const BASE_CLASSES = {
  cleric: { key: "cleric", name: "Cleric", prime: "wisdom", die: 6, after9: 1, xp: [0, 1500, 3000, 6000, 12000, 24000, 48000, 90000, 180000, 270000, 360000, 450000, 540000, 630000, 720000, 810000, 900000, 990000, 1080000, 1170000], ab: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8], spells: CLERIC_SPELLS, kind: "divine" },
  fighter: { key: "fighter", name: "Fighter", prime: "strength", die: 8, after9: 2, xp: [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000, 960000, 1080000, 1200000, 1320000, 1440000, 1560000], ab: [1, 2, 2, 3, 4, 4, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 10, 10, 10] },
  magicuser: { key: "magicuser", name: "Magic-User", prime: "intelligence", die: 4, after9: 1, xp: [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000], ab: [1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7], spells: MAGIC_SPELLS, kind: "arcane" },
  thief: { key: "thief", name: "Thief", prime: "dexterity", die: 4, after9: 2, xp: [0, 1250, 2500, 5000, 10000, 20000, 40000, 75000, 150000, 225000, 300000, 375000, 450000, 525000, 600000, 675000, 750000, 825000, 900000, 975000], ab: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8] },
};
// The classes a character may be: the four, and the Elf's two combinations
// (both classes' experience added; a combination's hit die is the book's;
// after 9th level it gains the lower of the two classes' fixed hit points).
export const CLASSES = {
  ...BASE_CLASSES,
  fightermagicuser: { key: "fightermagicuser", name: "Fighter/Magic-User", parts: ["fighter", "magicuser"], die: 6, after9: 1 },
  magicuserthief: { key: "magicuserthief", name: "Magic-User/Thief", parts: ["magicuser", "thief"], die: 4, after9: 1 },
};
export const CLASS_ORDER = ["cleric", "fighter", "magicuser", "thief", "fightermagicuser", "magicuserthief"];
export function classKey(name) {
  const word = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (CLASSES[word]) return word;
  return Object.values(CLASSES).find((cls) => cls.name.toLowerCase().replace(/[^a-z]/g, "") === word)?.key ?? "";
}
const partsOf = (key) => CLASSES[key]?.parts ?? (CLASSES[key] ? [key] : []);
export const levelOf = (level) => Math.max(1, Math.min(MAX_LEVEL, Math.round(num(level, 1))));

export function xpFor(key, level) {
  const l = levelOf(level);
  return partsOf(classKey(key)).reduce((sum, part) => sum + BASE_CLASSES[part].xp[l - 1], 0);
}
export function levelForXp(key, xp) {
  let level = 1;
  while (level < MAX_LEVEL && num(xp) >= xpFor(key, level + 1)) level += 1;
  return level;
}
export const attackBonus = (key, level) => Math.max(0, ...partsOf(classKey(key)).map((part) => BASE_CLASSES[part].ab[levelOf(level) - 1]));
export function savesFor(key, level) {
  const parts = partsOf(classKey(key));
  if (parts.length === 0) return Object.fromEntries(SAVES.map((save, index) => [save, NORMAL_MAN_SAVES[index]]));
  return Object.fromEntries(SAVES.map((save, index) => [save, Math.min(...parts.map((part) => SAVE_ROWS[part][saveRow(levelOf(level))][index]))]));
}
// A caster's spells a day: a Cleric's, or a Magic-User's (the combinations cast as Magic-Users).
export function casterOf(key) {
  const parts = partsOf(classKey(key));
  if (parts.includes("magicuser")) return BASE_CLASSES.magicuser;
  if (parts.includes("cleric")) return BASE_CLASSES.cleric;
  return null;
}
export function spellsPerDay(key, level) {
  const caster = casterOf(key);
  return caster ? [...caster.spells[levelOf(level) - 1]] : [0, 0, 0, 0, 0, 0];
}

// --- Races --------------------------------------------------------------------
// min/max: the ability limits; classes the race may take; saves: the bonus
// added to the die (taken off the number on the sheet); hd: the largest hit
// die it rolls.
export const RACES = {
  dwarf: { key: "dwarf", name: "Dwarf", plural: "Dwarves", min: { constitution: 9 }, max: { charisma: 17 }, classes: ["cleric", "fighter", "thief"], saves: { death: 4, wands: 4, paralysis: 4, breath: 3, spells: 4 }, vision: 60, languages: "Common, Dwarvish", noweapons: ["two-handed sword", "pole arm", "longbow", "great axe", "maul"] },
  elf: { key: "elf", name: "Elf", plural: "Elves", min: { intelligence: 9 }, max: { constitution: 17 }, classes: ["cleric", "fighter", "magicuser", "thief", "fightermagicuser", "magicuserthief"], saves: { paralysis: 1, wands: 2, spells: 2 }, hd: 6, vision: 60, languages: "Common, Elvish" },
  halfling: { key: "halfling", name: "Halfling", plural: "Halflings", min: { dexterity: 9 }, max: { strength: 17 }, classes: ["cleric", "fighter", "thief"], saves: { death: 4, wands: 4, paralysis: 4, breath: 3, spells: 4 }, hd: 6, languages: "Common, Halfling", nolarge: true, missile: 1, initiative: 1 },
  human: { key: "human", name: "Human", plural: "Humans", min: {}, max: {}, classes: ["cleric", "fighter", "magicuser", "thief"], saves: {}, languages: "Common", xpBonus: 10 },
};
export const RACE_ORDER = ["dwarf", "elf", "halfling", "human"];
export const raceKey = (name) => {
  const word = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return RACES[word] ? word : Object.values(RACES).find((race) => word.startsWith(race.key))?.key ?? "human";
};
// What keeps a race out: its ability limits, for these scores.
export function raceProblems(race, abilities) {
  const r = RACES[raceKey(race)];
  const out = [];
  for (const [stat, low] of Object.entries(r.min)) if (num(abilities?.[stat], 0) < low) out.push(`${r.plural} need ${stat[0].toUpperCase() + stat.slice(1)} ${low} or more.`);
  for (const [stat, high] of Object.entries(r.max)) if (num(abilities?.[stat], 0) > high) out.push(`${r.plural} may not have ${stat[0].toUpperCase() + stat.slice(1)} above ${high}.`);
  return out;
}
// What keeps a class out: the race, and each part's Prime Requisite of 9.
export function classProblems(cls, race, abilities) {
  const key = classKey(cls);
  const r = RACES[raceKey(race)];
  if (!key) return ["Choose a class."];
  const out = [];
  if (!r.classes.includes(key)) out.push(`${r.plural} may not be ${CLASSES[key].name}s.`);
  for (const part of partsOf(key)) {
    const prime = BASE_CLASSES[part].prime;
    if (num(abilities?.[prime], 0) < 9) out.push(`${BASE_CLASSES[part].name}s need ${prime[0].toUpperCase() + prime.slice(1)} 9 or more.`);
  }
  return out;
}
export const hitDie = (cls, race) => Math.min(CLASSES[classKey(cls)]?.die ?? 4, RACES[raceKey(race)].hd ?? 99);

// --- Thief abilities ----------------------------------------------------------
export const THIEF_SKILLS = {
  openlocks: ["Open Locks", [25, 30, 35, 40, 45, 50, 55, 60, 65, 68, 71, 74, 77, 80, 83, 84, 85, 86, 87, 88]],
  removetraps: ["Remove Traps", [20, 25, 30, 35, 40, 45, 50, 55, 60, 63, 66, 69, 72, 75, 78, 79, 80, 81, 82, 83]],
  pickpockets: ["Pick Pockets", [30, 35, 40, 45, 50, 55, 60, 65, 70, 74, 78, 82, 86, 90, 94, 95, 96, 97, 98, 99]],
  movesilently: ["Move Silently", [25, 30, 35, 40, 45, 50, 55, 60, 65, 68, 71, 74, 77, 80, 83, 85, 87, 89, 91, 93]],
  climbwalls: ["Climb Walls", [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99]],
  hide: ["Hide", [10, 15, 20, 25, 30, 35, 40, 45, 50, 53, 56, 59, 62, 65, 68, 69, 70, 71, 72, 73]],
  listen: ["Listen", [30, 34, 38, 42, 46, 50, 54, 58, 62, 65, 68, 71, 74, 77, 80, 83, 86, 89, 92, 95]],
};
export const thiefSkill = (skill, level) => THIEF_SKILLS[skill]?.[1][levelOf(level) - 1] ?? 0;
export const isThief = (key) => partsOf(classKey(key)).includes("thief");
export const isCleric = (key) => partsOf(classKey(key)).includes("cleric");

// --- Turning the undead -------------------------------------------------------
// Rows: the cleric's level 1 to 20; columns: Skeleton (1 HD), Zombie (2),
// Ghoul (3), Wight (4), Wraith (5), Mummy (6), Spectre (7), Vampire (8),
// Ghost (9+). A number is what the d20 needs, T turned with no roll, D
// damaged (1d8 a cleric level, destroyed at 0, else turned), null no effect.
export const UNDEAD = ["Skeleton", "Zombie", "Ghoul", "Wight", "Wraith", "Mummy", "Spectre", "Vampire", "Ghost"];
const N = null;
const TURN_TABLE = [
  [13, 17, 19, N, N, N, N, N, N],
  [11, 15, 18, 20, N, N, N, N, N],
  [9, 13, 17, 19, N, N, N, N, N],
  [7, 11, 15, 18, 20, N, N, N, N],
  [5, 9, 13, 17, 19, N, N, N, N],
  [3, 7, 11, 15, 18, 20, N, N, N],
  [2, 5, 9, 13, 17, 19, N, N, N],
  ["T", 3, 7, 11, 15, 18, 20, N, N],
  ["T", 2, 5, 9, 13, 17, 19, N, N],
  ["T", "T", 3, 7, 11, 15, 18, 20, N],
  ["D", "T", 2, 5, 9, 13, 17, 19, N],
  ["D", "T", "T", 3, 7, 11, 15, 18, 20],
  ["D", "D", "T", 2, 5, 9, 13, 17, 19],
  ["D", "D", "T", "T", 3, 7, 11, 15, 18],
  ["D", "D", "D", "T", 2, 5, 9, 13, 17],
  ["D", "D", "D", "T", "T", 3, 7, 11, 15],
  ["D", "D", "D", "D", "T", 2, 5, 9, 13],
  ["D", "D", "D", "D", "T", "T", 3, 7, 11],
  ["D", "D", "D", "D", "D", "T", 2, 5, 9],
  ["D", "D", "D", "D", "D", "T", "T", 3, 7],
];
// The row an undead creature is turned on: its type by name, else its hit dice.
export function undeadRow(name, data = {}) {
  const text = `${name ?? ""} ${data?.group ?? ""}`.toLowerCase();
  const found = UNDEAD.findIndex((type) => new RegExp(`\\b${type.toLowerCase()}`).test(text));
  if (found >= 0) return found;
  if (!isUndead(name, data)) return null;
  const hd = hitDiceOf(data?.hd).level;
  return Math.max(0, Math.min(8, hd - 1));
}
export function isUndead(name, data = {}) {
  if (num(data?.undead, 0) === 1 || /undead/i.test(String(data?.type ?? ""))) return true;
  return UNDEAD.some((type) => new RegExp(`\\b${type.toLowerCase()}`).test(`${name ?? ""} ${data?.group ?? ""}`.toLowerCase()));
}
export function turnAgainst(level, row) {
  const cell = TURN_TABLE[levelOf(level) - 1]?.[row];
  if (cell === null || cell === undefined) return { impossible: true };
  if (cell === "T") return { auto: true, need: 0 };
  if (cell === "D") return { auto: true, need: 0, damage: true };
  return { need: cell };
}

// --- Monsters -------------------------------------------------------------------
// A monster's hit dice as the book writes them: "3", "3+2", "1-1", "2**",
// "10* (+9)" (its attack bonus given), "1/2 (1d4 HP)", "1d4 Hit Points".
export function hitDiceOf(text) {
  const source = String(text ?? "").replace(/[∗]/g, "*").trim();
  const stars = (/^[^(]*?(\*+)/.exec(source)?.[1] ?? "").length;
  const given = /\(\s*\+(\d+)\s*\)/.exec(source);
  const hp = /(\d+d\d+)\s*(hp|hit points?)/i.exec(source) ?? /^(\d+d\d+)/i.exec(source);
  if (hp) return { level: 0, dice: hp[1].toLowerCase(), plus: 0, stars, ab: 0, under: true };
  if (/^(1\/2|½)/.test(source)) return { level: 0, dice: "1d4", plus: 0, stars, ab: 0, under: true };
  if (/^1\s*(hp|hit point)/i.test(source)) return { level: 0, dice: "1", plus: 0, stars, ab: 0, under: true };
  const match = /^(\d+)\s*([+-]\s*\d+)?/.exec(source);
  if (!match) return { level: 1, dice: "1d8", plus: 0, stars, ab: 1, under: false };
  const level = Number(match[1]);
  const plus = match[2] ? Number(match[2].replace(/\s+/g, "")) : 0;
  const under = level <= 1 && plus < 0;
  const ab = given ? Number(given[1]) : under ? 0 : monsterAttackBonus(level);
  return { level, dice: `${level}d8${plus ? signed(plus) : ""}`, plus, stars, ab, under };
}
export function monsterAttackBonus(hd) {
  const level = Math.floor(num(hd, 1));
  if (level < 1) return 0;
  if (level <= 7) return level;
  const steps = [[9, 8], [11, 9], [13, 10], [15, 11], [19, 12], [23, 13], [27, 14], [31, 15]];
  return steps.find(([top]) => level <= top)?.[1] ?? 16;
}
// XP for a monster by hit dice and special abilities (asterisks).
const MONSTER_XP = [[10, 3], [25, 12], [75, 25], [145, 30], [240, 40], [360, 45], [500, 55], [670, 65], [875, 70], [1075, 75], [1300, 90], [1575, 95], [1875, 100], [2175, 110], [2500, 115], [2850, 125], [3250, 135], [3600, 145], [4000, 160], [4500, 175], [5250, 200], [6000, 225], [6750, 250], [7500, 275], [8250, 300], [9000, 325]];
export function monsterXp(hd, stars = 0) {
  const level = Math.max(0, Math.floor(num(hd, 0)));
  if (level > 25) return 9000 + 750 * (level - 25) + stars * (325 + 25 * (level - 25));
  const [base, bonus] = MONSTER_XP[level];
  return base + bonus * stars;
}
// "Fighter: 4", "Magic-User: 3", "Normal Man", "Fighter: 1 (with Dwarf bonuses)".
export function saveAsOf(text, hd = 1) {
  const source = String(text ?? "");
  if (/normal man/i.test(source)) return { key: "", level: 0, race: "" };
  const cls = /magic[- ]?user/i.test(source) ? "magicuser" : /cleric/i.test(source) ? "cleric" : /thief/i.test(source) ? "thief" : "fighter";
  const level = /:\s*(\d+)/.exec(source);
  const race = /dwarf/i.test(source) ? "dwarf" : /elf/i.test(source) ? "elf" : /halfling/i.test(source) ? "halfling" : "";
  return { key: cls, level: level ? Math.max(1, Number(level[1])) : Math.max(1, Math.floor(num(hd, 1))), race };
}
export function savesOfMonster(data) {
  const hd = hitDiceOf(data?.hd);
  const as = saveAsOf(data?.saveas, hd.level);
  const base = as.key ? savesFor(as.key, Math.min(20, as.level)) : savesFor("", 0);
  const racial = RACES[as.race]?.saves ?? {};
  return Object.fromEntries(SAVES.map((save) => [save, base[save] - num(racial[save], 0)]));
}
const singular = (word) => {
  const w = String(word).trim().toLowerCase();
  if (w === "hooves") return "hoof";
  if (/(ss|us)$/.test(w)) return w;
  return w.replace(/ies$/, "y").replace(/s$/, "");
};
const DICE = /\d+d\d+(?:\s*[+-]\s*\d+(?!d))?/gi;
// A monster's attacks: "2 claws/1 bite" with "1d4/1d4/1d6"; "1 weapon" with
// "1d6 or by weapon"; "2 claws, 1 bite" with "1d4 claw, 2d4 bite". Only the
// first routine (before "or"); each attack its damage dice.
export function monsterAttacks(attacksText, damageText, bonus = 0) {
  const first = (text) => String(text ?? "").replace(/[–—]/g, "-").split(/\s+or\s+|\(/i)[0];
  const groups = [];
  for (const part of first(attacksText).split(/[/,+]|\band\b/)) {
    const match = /^\s*(\d+)?\s*(?:to\s+\d+\s+)?([a-z][a-z\s'-]*)?/i.exec(part);
    const count = Math.min(8, Math.max(1, Number(match?.[1]) || 1));
    let name = String(match?.[2] ?? "").replace(/\b(per|pack|see|below|special|round)\b.*$/i, "").trim();
    if (!name && !match?.[1]) continue;
    name = name ? singular(name) : "attack";
    groups.push({ name, count });
  }
  // Damage: what is in brackets is an alternative ("2d4 (1d6 or by weapon)"); a "+ 2d6 hug" is an attack of its own.
  const damage = String(damageText ?? "").replace(/[–—]/g, "-").replace(/\([^)]*\)/g, " ").split(/\s+or\s+/i)[0];
  const raw = damage.split(/[/,]|\+(?=\s*\d+d\d)/).map((segment) => ({ dice: (segment.match(DICE) ?? [])[0]?.replace(/\s+/g, "") ?? "", words: segment.toLowerCase() }));
  const segments = raw.filter((segment) => segment.dice);
  const flat = groups.flatMap((group) => Array.from({ length: group.count }, () => group.name));
  const out = [];
  const titled = (name) => name.replace(/\b\w/g, (letter) => letter.toUpperCase());
  // One damage for each attack, some of them no dice ("1d10/petrification"): in order.
  if (raw.length > 1 && raw.length === flat.length && segments.length < raw.length) return flat.map((name, index) => ({ name: titled(name), bonus, damage: raw[index].dice }));
  if (segments.length === 0) {
    // No dice: a special attack only (a gaze, a touch): nothing to roll for damage.
    return flat.length ? [{ name: titled(flat[0]), bonus, damage: "" }] : [];
  }
  // Damage written with the attack's name ("1d4 claw, 2d4 bite"): matched by a word of the name.
  const words = (name) => name.split(/\s+/).filter((word) => word.length >= 3).map((word) => word.slice(0, 4));
  const names = (segment, name) => words(name).some((word) => segment.words.includes(word));
  const labelled = segments.length > 1 && segments.every((segment) => groups.some((group) => names(segment, group.name)));
  flat.forEach((name, index) => {
    let dice;
    if (labelled) dice = segments.find((segment) => names(segment, name))?.dice;
    else if (segments.length === 1) dice = segments[0].dice;
    else if (segments.length >= flat.length) dice = segments[index].dice;
    else if (segments.length === groups.length) {
      let seen = 0;
      const group = groups.findIndex((item) => (seen += item.count) > index);
      dice = segments[group]?.dice;
    } else dice = segments[Math.min(index, segments.length - 1)].dice;
    out.push({ name: titled(name), bonus, damage: dice ?? segments[0].dice });
  });
  return out.length ? out : [{ name: "Attack", bonus, damage: segments[0].dice }];
}
// An NPC record's numbers for the tracker.
export function npcStats(data = {}) {
  const hd = hitDiceOf(data.hd);
  const ac = num(/(\d+)/.exec(String(data.ac ?? ""))?.[1], 11);
  const avg = /^(\d+)d(\d+)([+-]\d+)?$/.exec(hd.dice);
  const hp = num(data.hp, 0) || (avg ? Math.max(1, Math.floor((Number(avg[1]) * (Number(avg[2]) + 1)) / 2) + num(avg[3], 0)) : Math.max(1, num(hd.dice, 1)));
  const attacks = monsterAttacks(data.attacks, data.damage, hd.ab);
  return {
    ac,
    hd,
    hp,
    dice: hd.dice,
    ab: hd.ab,
    attacks: attacks.length ? attacks : [{ name: "Attack", bonus: hd.ab, damage: "1d6" }],
    saves: savesOfMonster(data),
    morale: num(/(\d+)/.exec(String(data.morale ?? ""))?.[1], 0),
    xp: num(String(data.xp ?? "").replace(/,/g, ""), 0) || monsterXp(hd.level, hd.stars),
    init: 0,
  };
}

// --- Items --------------------------------------------------------------------
export const isWeapon = (item) => /weapon/i.test(String(item?.type ?? "")) && Boolean(String(item?.damage ?? "").trim());
export const isShield = (item) => /armor|armour/i.test(String(item?.type ?? "")) && /shield/i.test(`${item?.subtype ?? ""} ${item?.name ?? ""}`);
export const isArmor = (item) => /armor|armour/i.test(String(item?.type ?? "")) && !isShield(item) && num(item?.ac, 0) > 11;
const magicOf = (item) => num(/\+(\d)\b/.exec(String(item?.name ?? ""))?.[1], 0) + num(item?.bonus, 0);
const BLUNT = /warhammer|mace|maul|club|cudgel|quarterstaff|staff|sling|bullet|stone/i;
// What a class (and race) may use, and why not.
export function weaponProblem(item, cls, race) {
  const key = classKey(cls);
  const name = String(item?.name ?? "").toLowerCase();
  const parts = partsOf(key);
  if (key === "cleric" && !BLUNT.test(name)) return "Clerics use only blunt weapons.";
  if (key === "magicuser" && !/dagger|club|cudgel|walking staff/i.test(name)) return "Magic-Users use only the dagger and the walking staff.";
  const r = RACES[raceKey(race)];
  if (r.nolarge && String(item?.size ?? "").toUpperCase() === "L") return "Halflings may not use Large weapons.";
  if (r.noweapons?.some((word) => name.includes(word))) return "Dwarves may not use Large weapons over four feet long.";
  void parts;
  return "";
}
export function armorProblem(item, cls) {
  const key = classKey(cls);
  if (key === "magicuser" && (isArmor(item) || isShield(item))) return "Magic-Users wear no armor and carry no shield.";
  if ((key === "thief" || key === "magicuserthief") && isShield(item)) return "Thieves carry no shield.";
  if ((key === "thief" || key === "magicuserthief") && isArmor(item) && !/leather/i.test(`${item?.subtype ?? ""} ${item?.name ?? ""}`)) return "Thieves wear only leather armor.";
  return "";
}
export function itemProblem(item, cls, race) {
  if (isWeapon(item)) return weaponProblem(item, cls, race);
  if (isArmor(item) || isShield(item)) return armorProblem(item, cls);
  return "";
}

// --- The sheet worked out -----------------------------------------------------
const weightOf = (item) => {
  const text = String(item?.weight ?? "").trim();
  if (text === "*") return 0.1;
  if (text === "**" || !text) return 0;
  return num(text.replace("½", ".5"), 0);
};
// The loads (light, heavy) by Strength and race.
const LOADS = [[3, 25, 60, 20, 40], [5, 35, 90, 30, 60], [8, 50, 120, 40, 80], [12, 60, 150, 50, 100], [15, 65, 165, 55, 110], [17, 70, 180, 60, 120], [99, 80, 195, 65, 130]];
export function loadsFor(strength, race) {
  const row = LOADS.find(([top]) => clampScore(strength) <= top);
  return raceKey(race) === "halfling" ? { light: row[3], heavy: row[4] } : { light: row[1], heavy: row[2] };
}

export function derive(input) {
  const data = structuredClone(input ?? {});
  data.ruleset = RULESET;
  const key = classKey(data.class) || "fighter";
  data.class = key;
  data.className = CLASSES[key].name;
  const race = RACES[raceKey(data.race)];
  data.race = race.name;
  data.level = levelOf(data.level);
  const level = data.level;
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  data.expnext = level < MAX_LEVEL ? xpFor(key, level + 1) : 0;
  data.levelReady = data.expnext > 0 && data.exp >= data.expnext;
  // Abilities and their bonuses.
  const abilities = (data.abilities = data.abilities ?? {});
  for (const stat of STATS) {
    const row = (abilities[stat] = abilities[stat] ?? {});
    row.score = clampScore(row.score);
    row.bonus = abilityBonus(row.score);
  }
  const bonus = (stat) => abilities[stat].bonus;
  // Hit points: the dice rolled (kept), the Constitution bonus on each to 9th, the fixed gain after.
  const hp = (data.hp = data.hp ?? {});
  hp.wounds = Math.max(0, Math.round(num(hp.wounds, 0)));
  if (Array.isArray(hp.rolls) && hp.rolls.length) {
    const rolled = hp.rolls.slice(0, 9).reduce((sum, roll) => sum + Math.max(1, num(roll, 1) + bonus("constitution")), 0);
    hp.total = rolled + Math.max(0, level - 9) * CLASSES[key].after9 + num(hp.misc, 0);
  } else hp.total = Math.max(1, Math.round(num(hp.total, 1)));
  // Gear: worn armor and shield, the load.
  const items = rows(data.inventorylist);
  const worn = items.filter(([, item]) => num(item.carried, 1) === 2);
  const armor = worn.map(([, item]) => item).filter(isArmor).sort((a, b) => num(b.ac) - num(a.ac))[0] ?? null;
  const shield = worn.map(([, item]) => item).find(isShield) ?? null;
  const ac = (data.ac = data.ac ?? {});
  ac.armor = armor ? num(armor.ac, 11) + magicOf(armor) : 11;
  ac.shield = shield ? num(shield.acbonus, 1) + magicOf(shield) : 0;
  ac.dex = bonus("dexterity");
  ac.misc = Math.round(num(ac.misc, 0));
  ac.total = ac.armor + ac.shield + ac.dex + ac.misc;
  ac.worn = [armor?.name, shield?.name].filter(Boolean).join(", ");
  let load = 0;
  for (const [, item] of items) if (num(item.carried, 1) > 0) load += weightOf(item) * Math.max(1, num(item.count, 1)) * (raceKey(data.race) === "halfling" && (isArmor(item) || isShield(item)) ? 0.25 : 1);
  const coinCount = rows(data.coins).reduce((sum, [, coin]) => sum + num(coin.amount, 0), 0);
  load += coinCount / 10;
  data.load = Math.round(load * 10) / 10;
  const loads = loadsFor(abilities.strength.score, data.race);
  data.loads = loads;
  const heavy = data.load > loads.light;
  const metal = armor && !/leather/i.test(`${armor.subtype ?? ""} ${armor.name ?? ""}`);
  const magicArmor = armor && magicOf(armor) > 0;
  const base = !armor || (magicArmor && !metal) ? 40 : metal && !magicArmor ? 20 : 30;
  data.movement = Math.max(5, base - (heavy ? 10 : 0) - (data.load > loads.heavy ? 10 : 0) + Math.round(num(data.movemisc, 0)));
  data.encumbrance = data.load > loads.heavy ? "Overloaded" : heavy ? "Heavily loaded" : "Lightly loaded";
  // Attack bonus, melee and missile.
  data.ab = attackBonus(key, level);
  data.attack = { melee: data.ab + bonus("strength"), missile: data.ab + bonus("dexterity") + num(race.missile, 0) };
  // Initiative: d6 + Dexterity (+1 Halfling).
  data.initiative = { misc: Math.round(num(data.initiative?.misc, 0)), total: 0 };
  data.initiative.total = bonus("dexterity") + num(race.initiative, 0) + data.initiative.misc;
  // Saving throws: the class's numbers, the race's bonus off them, a misc.
  const baseSaves = savesFor(key, level);
  const saves = (data.saves = data.saves ?? {});
  for (const save of SAVES) {
    const row = (saves[save] = saves[save] ?? {});
    row.base = baseSaves[save];
    row.racial = num(race.saves[save], 0);
    row.misc = Math.round(num(row.misc, 0));
    row.total = row.base - row.racial - row.misc;
  }
  data.savenotes = ["Poison: + Constitution bonus; illusions: + Intelligence; charm and mind control: + Wisdom (add it to the roll in Mod)."];
  // Attacks: each ready weapon (melee with Strength, missile with Dexterity; a thrown weapon both ways).
  const attacks = {};
  for (const [id, item] of worn) {
    if (!isWeapon(item)) continue;
    const magic = magicOf(item);
    const dice = String(item.damage).replace(/\s+/g, "");
    const name = String(item.name);
    if (item.missile) {
      // Bows and crossbows add no Strength to damage; a sling does.
      const str = /sling/i.test(name) ? bonus("strength") : 0;
      attacks[id] = { name, item: id, type: "missile", bonus: data.attack.missile + magic, damage: `${dice}${str + magic ? signed(str + magic) : ""}`, range: item.range ?? "" };
    } else {
      attacks[id] = { name, item: id, type: "melee", bonus: data.attack.melee + magic, damage: `${dice}${bonus("strength") + magic ? signed(bonus("strength") + magic) : ""}` };
      if (item.thrown) attacks[`${id}-thrown`] = { name: `${name} (thrown)`, item: id, type: "missile", bonus: data.attack.missile + magic, damage: `${dice}${bonus("strength") + magic ? signed(bonus("strength") + magic) : ""}`, range: item.range ?? "" };
    }
  }
  data.attacks = attacks;
  // Thief abilities.
  if (isThief(key)) {
    const skills = (data.thiefskills = data.thiefskills ?? {});
    for (const [skill, [name]] of Object.entries(THIEF_SKILLS)) {
      const row = (skills[skill] = skills[skill] ?? {});
      row.name = name;
      row.base = thiefSkill(skill, level);
      row.misc = Math.round(num(row.misc, 0));
      row.total = Math.min(99, Math.max(1, row.base + row.misc));
    }
  } else delete data.thiefskills;
  data.sneakattack = isThief(key);
  // Turning the undead.
  data.turn = isCleric(key) ? level : 0;
  // Spells a day.
  const caster = casterOf(key);
  if (caster) {
    const perday = spellsPerDay(key, level);
    const used = Array.isArray(data.spellcasting?.used) ? data.spellcasting.used : [];
    data.spellcasting = { kind: caster.kind, perday, used: perday.map((max, index) => Math.max(0, Math.min(max, Math.round(num(used[index], 0))))) };
  } else delete data.spellcasting;
  data.spellbook = Array.isArray(data.spellbook) ? data.spellbook.map(String) : [];
  data.prepared = Array.isArray(data.prepared) ? data.prepared.map(String) : [];
  // The optional rule's ability roll: d20 + the bonus at or above this.
  data.abilityTarget = abilityTarget(level);
  data.darkvision = num(race.vision, 0);
  data.xpbonus = num(race.xpBonus, 0);
  data.maxretainers = Math.max(0, 4 + bonus("charisma"));
  data.loyalty = Math.round(num(data.loyalty, 7 + 0));
  return data;
}
// (NM or 1st: 17, 2nd-3rd: 16 ... 20th: 7.)
export const abilityTarget = (level) => 17 - Math.floor(levelOf(level) / 2);

export function healthOf(data) {
  const current = num(data?.hp?.total, 0) - num(data?.hp?.wounds, 0);
  return { current, dead: current <= 0 };
}

// A test for the sheet and the host: a save, an ability roll, a thief ability or morale.
export function testOf(data, kind, key) {
  if (kind === "save") {
    const save = saveKey(key);
    return { die: "1d20", target: num(data.saves?.[save]?.total, 20), high: true, label: `Save vs. ${SAVE_NAMES[save]}`, natural: true };
  }
  if (kind === "skill") {
    const row = data.thiefskills?.[key];
    if (!row) throw new Error("No such thief ability.");
    return { die: "1d100", target: num(row.total, 0), high: false, label: row.name };
  }
  if (kind === "morale") return { die: "2d6", target: num(data.loyalty, 7), high: false, label: "Loyalty (morale)" };
  const stat = STATS.includes(key) ? key : "strength";
  return { die: `1d20${abilityBonus(data.abilities?.[stat]?.score) ? signed(abilityBonus(data.abilities?.[stat]?.score)) : ""}`, target: num(data.abilityTarget, 17), high: true, label: `${stat[0].toUpperCase()}${stat.slice(1)} roll` };
}
export const saveKey = (key) => {
  const word = String(key ?? "").toLowerCase();
  if (SAVES.includes(word)) return word;
  if (/death|poison|ray/.test(word)) return "death";
  if (/wand/.test(word)) return "wands";
  if (/para|petri|stone/.test(word)) return "paralysis";
  if (/breath|dragon/.test(word)) return "breath";
  return "spells";
};

// --- Making and raising characters ------------------------------------------
// spec: { name, race, class, abilities {stat: score}, hpRoll (the hit die
// rolled at 1st level), gold (the 3d6 x 10 rolled), buy [[name, count]],
// spells [a Magic-User's first spells], alignment, level (above 1: the hit
// dice given in hpRolls, else their average), and the sheet's words }.
// lib.items: the campaign's item records ({ name, data }), for the shop.
export function buildFromSpec(spec, lib = {}, priceOf = defaultPrice) {
  const problems = [];
  const name = String(spec?.name ?? "").trim().slice(0, 80) || "Adventurer";
  const race = raceKey(spec?.race);
  const key = classKey(spec?.class ?? spec?.cls) || "fighter";
  const abilities = Object.fromEntries(STATS.map((stat) => [stat, { score: clampScore(spec?.abilities?.[stat] ?? 10) }]));
  const scores = Object.fromEntries(STATS.map((stat) => [stat, abilities[stat].score]));
  problems.push(...raceProblems(race, scores), ...classProblems(key, race, scores));
  const die = hitDie(key, race);
  const level = levelOf(spec?.level ?? 1);
  const rolls = [Math.max(1, Math.min(die, Math.round(num(spec?.hpRoll, die))))];
  for (let next = 2; next <= Math.min(9, level); next += 1) rolls.push(Math.max(1, Math.min(die, Math.round(num(spec?.hpRolls?.[next - 2], Math.ceil((die + 1) / 2))))));
  // Starting money: 3d6 x 10 gp, in copper; then the shop.
  const purse = Math.max(0, Math.round(num(spec?.gold, 0))) * 100;
  let spent = 0;
  const inventorylist = {};
  let next = 1;
  const add = (item) => {
    inventorylist[`id-${String(next++).padStart(5, "0")}`] = item;
  };
  let armorWorn = false;
  let shieldWorn = false;
  let weaponReady = 0;
  for (const [itemName, countIn] of Array.isArray(spec?.buy) ? spec.buy : []) {
    const count = Math.max(1, Math.min(99, Math.round(num(countIn, 1))));
    const found = (lib.items ?? []).find((item) => String(item.name).toLowerCase() === String(itemName).toLowerCase());
    if (!found) {
      problems.push(`${itemName} is not for sale.`);
      continue;
    }
    const price = priceOf(found.data?.cost);
    if (price === null) {
      problems.push(`${itemName} has no price.`);
      continue;
    }
    if (spent + price * count > purse) {
      problems.push(`Not enough money for ${itemName}.`);
      continue;
    }
    const why = itemProblem(found.data, key, race);
    if (why) {
      problems.push(`${itemName}: ${why}`);
      continue;
    }
    spent += price * count;
    const { fgPath: _path, ...copy } = found.data ?? {};
    let carried = 1;
    if (isArmor(copy) && !armorWorn) [carried, armorWorn] = [2, true];
    else if (isShield(copy) && !shieldWorn) [carried, shieldWorn] = [2, true];
    else if (isWeapon(copy) && weaponReady < 2) [carried, weaponReady] = [2, weaponReady + 1];
    add({ ...copy, name: found.name, count, carried });
  }
  const left = purse - spent;
  const coins = {
    "id-00001": { name: "PP", amount: 0 },
    "id-00002": { name: "GP", amount: Math.floor(left / 100) },
    "id-00003": { name: "EP", amount: 0 },
    "id-00004": { name: "SP", amount: Math.floor((left % 100) / 10) },
    "id-00005": { name: "CP", amount: left % 10 },
  };
  // A Magic-User's spellbook: read magic and one first-level spell (the GM's call; the wizard offers the choice).
  const caster = casterOf(key);
  const spellbook = caster?.kind === "arcane" ? [...new Set(["Read Magic", ...(Array.isArray(spec?.spells) ? spec.spells.map(String) : [])])] : [];
  const text = (field, max = 8000) => String(spec?.[field] ?? "").slice(0, max);
  const data = derive({
    ruleset: RULESET,
    race: RACES[race].name,
    class: key,
    level,
    exp: level > 1 ? xpFor(key, level) : 0,
    abilities,
    hp: { rolls, wounds: 0 },
    inventorylist,
    coins,
    spellbook,
    prepared: [],
    alignment: ALIGNMENTS.includes(spec?.alignment) ? spec.alignment : "Neutral",
    languages: RACES[race].languages,
    playername: text("playername", 80),
    appearance: text("appearance"),
    deity: text("deity", 120),
    notes: text("notes"),
    background: text("background"),
    gender: text("gender", 40),
    age: text("age", 20),
    height: text("height", 20),
    weight: text("weight", 20),
    ...(typeof spec?.portrait === "string" ? { portrait: spec.portrait } : {}),
    ...(typeof spec?.token === "string" ? { token: spec.token } : {}),
  });
  return { name, data, problems, spent, left };
}
function defaultPrice(text) {
  const match = /^([\d.]+)\s*(pp|gp|ep|sp|cp)\b/i.exec(String(text ?? "").replace(/,/g, "").trim());
  return match ? Math.round(Number(match[1]) * { pp: 500, gp: 100, ep: 50, sp: 10, cp: 1 }[match[2].toLowerCase()]) : null;
}

// One level up: the hit die rolled (to 9th: + Constitution, at least 1) or
// the class's fixed hit points after 9th; every number worked out again.
export function levelUp(input, rolled) {
  const data = derive(input);
  if (data.level >= MAX_LEVEL) throw new Error(`${data.className} is at its highest level (${MAX_LEVEL}).`);
  const key = data.class;
  const next = data.level + 1;
  const before = data.hp.total;
  const rolls = Array.isArray(data.hp.rolls) && data.hp.rolls.length ? [...data.hp.rolls] : [Math.max(1, data.hp.total - abilityBonus(data.abilities.constitution.score))];
  if (next <= 9) rolls.push(Math.max(1, Math.round(num(rolled, 1))));
  const out = derive({ ...data, level: next, hp: { ...data.hp, rolls } });
  return { data: out, gain: out.hp.total - before };
}
// Whether the level-up's hit points are rolled (to 9th) or fixed.
export const levelUpDie = (data) => (levelOf(data?.level) + 1 <= 9 ? hitDie(data?.class, data?.race) : 0);
