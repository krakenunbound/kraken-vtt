// The AD&D 2E character wizard's rules: Kraken's FG extension
// KrakenCharWizard2E (manager_charwizard2e.lua and bio_charwizard2e.lua)
// ported table for table, so Kraken's wizard makes a character the way the
// FG one does. Plain functions (no Node, no DOM), used by the wizard in the
// browser and by the host's build (rules.mjs buildFromSpec). Names and
// numbers only: no book text.
//
// The wizard's state (the "build"), as the extension's _tCharData:
//   abilities {strength..charisma: rolled score before the race's
//   adjustments}, strPercent, race (a RACES name), cls (the class chosen),
//   mode "single" | "multi" | "dual", classList (multi: every class, the
//   chosen one included; dual: the class taken up), dualLevel (dual: the
//   first class's level), level (the starting level), kit {name, book,
//   data} | null.
import { CLASSES, RACES, STATS, classKey, makeItem, raceKey, WEAPONS, ARMOR, SHIELDS, AMMO } from "./rules.mjs";

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const lower = (text) => String(text ?? "").toLowerCase();
const has = (text, word) => lower(text).includes(word);

export const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];

// --- The GM's options (the extension's Options > Kraken Character Wizard) ---
// rollLock: abilities rolled once only (CWRL); methods: the PHB methods a
// player may pick from (CWM1..CWM6); gold above 1st level (CWGOLD): "phb"
// one roll at any level, "perlevel" one roll per level added up, "xlevel"
// one roll times the level.
export const DEFAULT_OPTIONS = { rollLock: false, methods: [1, 2, 3, 4, 5, 6], gold: "phb" };
export function wizardOptions(value) {
  const raw = value && typeof value === "object" ? value : {};
  const methods = Array.isArray(raw.methods) ? [...new Set(raw.methods.map((n) => Math.round(num(n, 0))).filter((n) => n >= 1 && n <= 6))].sort() : DEFAULT_OPTIONS.methods;
  return { rollLock: Boolean(raw.rollLock), methods, gold: ["phb", "perlevel", "xlevel"].includes(raw.gold) ? raw.gold : "phb" };
}

// --- Abilities: the PHB's Methods I to VI ---------------------------------
// all: how Roll All rolls (each: a roll per ability; collect: a 3d6 group N
// times, the totals gathered; vipool: Method VI's 7d6). one: the per-ability
// dice (Method VI places a die instead). arrange: the scores may be swapped.
export const ABILITY_METHODS = {
  1: { name: "Method I", short: "3d6, in order", arrange: false, perAbility: true, all: { kind: "each", formula: "3d6", agg: "single" }, one: { formula: "3d6", agg: "single" } },
  2: { name: "Method II", short: "3d6 twice each, keep higher, in order", arrange: false, perAbility: true, all: { kind: "each", formula: "6d6", agg: "bestgroup" }, one: { formula: "6d6", agg: "bestgroup" } },
  3: { name: "Method III", short: "3d6 six times, arrange to taste", arrange: true, perAbility: false, all: { kind: "collect", formula: "3d6", count: 6, agg: "array6" }, one: { formula: "3d6", agg: "single" } },
  4: { name: "Method IV", short: "3d6 twelve times, keep best 6, arrange", arrange: true, perAbility: false, all: { kind: "collect", formula: "3d6", count: 12, agg: "keepbest6" }, one: { formula: "3d6", agg: "single" } },
  5: { name: "Method V", short: "4d6 drop lowest, arrange", arrange: true, perAbility: false, all: { kind: "each", formula: "4d6dl1", agg: "single" }, one: { formula: "4d6dl1", agg: "single" } },
  6: { name: "Method VI", short: "all 8s, then place 7d6 (max 18)", arrange: false, perAbility: true, all: { kind: "vipool", formula: "7d6", agg: "vipool" }, one: { kind: "viplace" } },
};
export const methodLabel = (n) => (ABILITY_METHODS[n] ? `${ABILITY_METHODS[n].name} (${ABILITY_METHODS[n].short})` : "");
// The methods the GM allows (never none: Method V).
export function allowedMethods(options) {
  const list = wizardOptions(options).methods;
  return list.length ? list : [5];
}
// The method in use: the one picked if allowed, else V if allowed, else the first.
export function methodFor(picked, options) {
  const list = allowedMethods(options);
  if (list.includes(picked)) return picked;
  return list.includes(5) ? 5 : list[0];
}
// Method II: the best of the 3d6 groups in the dice rolled.
export function bestGroup(dice, size = 3) {
  let best = 0;
  for (let i = 0; i < dice.length; i += size) best = Math.max(best, dice.slice(i, i + size).reduce((a, b) => a + b, 0));
  return best;
}
// Methods III and IV: the scores in the order they go to the abilities (IV: the best six first).
export function collectScores(totals, agg) {
  const scores = [...totals];
  if (agg === "keepbest6") scores.sort((a, b) => b - a);
  return scores.slice(0, 6);
}
// Method VI: the largest unplaced die that still fits (18 at most) onto the ability. null: none fits.
export function placeViDie(pool, current) {
  const score = Math.max(8, num(current, 8));
  const sorted = [...pool].sort((a, b) => b - a);
  const at = sorted.findIndex((die) => score + die <= 18);
  if (at < 0) return null;
  const [die] = sorted.splice(at, 1);
  return { pool: sorted, score: score + die };
}

// --- Races: PHB Table 7's ability ranges (before the race's adjustments) ---
const PHB_RACE_RANGE = {
  dwarf: { strength: [8, 18], dexterity: [3, 17], constitution: [11, 18], intelligence: [3, 18], wisdom: [3, 18], charisma: [3, 17] },
  elf: { strength: [3, 18], dexterity: [6, 18], constitution: [7, 18], intelligence: [8, 18], wisdom: [3, 18], charisma: [8, 18] },
  gnome: { strength: [6, 18], dexterity: [3, 18], constitution: [8, 18], intelligence: [6, 18], wisdom: [3, 18], charisma: [3, 18] },
  "half-elf": { strength: [3, 18], dexterity: [6, 18], constitution: [6, 18], intelligence: [4, 18], wisdom: [3, 18], charisma: [3, 18] },
  halfling: { strength: [7, 18], dexterity: [7, 18], constitution: [10, 18], intelligence: [6, 18], wisdom: [3, 17], charisma: [3, 18] },
};
export const hasAllAbilities = (abilities) => STATS.every((stat) => num(abilities?.[stat], 0) > 0);
// Why the scores rule a race out ("" when they don't; nothing is ruled out until all six are rolled).
export function raceBlocked(race, abilities) {
  if (!hasAllAbilities(abilities)) return "";
  const range = PHB_RACE_RANGE[raceKey(race)];
  if (!range) return "";
  for (const [stat, [low, high]] of Object.entries(range)) {
    const score = num(abilities[stat], 0);
    if (score < low) return `${stat[0].toUpperCase()}${stat.slice(1)} ${low} or more`;
    if (score > high) return `${stat[0].toUpperCase()}${stat.slice(1)} ${high} or less`;
  }
  return "";
}
const raceAdjust = (race) => RACES[raceKey(race)]?.adjust ?? {};
export const adjustedScore = (abilities, race, stat) => num(abilities?.[stat], 0) + num(raceAdjust(race)[stat], 0);

// --- Classes: their minimums (after the race's adjustments), by the words of their name.
const CLASS_MIN = [
  ["paladin", { strength: 12, constitution: 9, wisdom: 13, charisma: 17 }],
  ["ranger", { strength: 13, dexterity: 13, constitution: 14, wisdom: 14 }],
  ["druid", { wisdom: 12, charisma: 15 }],
  ["bard", { dexterity: 12, intelligence: 13, charisma: 15 }],
  ["abjurer", { intelligence: 9, wisdom: 15 }],
  ["conjurer", { intelligence: 9, constitution: 15 }],
  ["diviner", { intelligence: 9, wisdom: 16 }],
  ["enchanter", { intelligence: 9, charisma: 16 }],
  ["illusionist", { intelligence: 9, dexterity: 16 }],
  ["invoker", { intelligence: 9, constitution: 16 }],
  ["necromancer", { intelligence: 9, wisdom: 16 }],
  ["transmuter", { intelligence: 9, dexterity: 15 }],
  ["mage", { intelligence: 9 }],
  ["thief", { dexterity: 9 }],
  ["cleric", { wisdom: 9 }],
  ["priest", { wisdom: 9 }],
  ["fighter", { strength: 9 }],
];
export const classMinimums = (name) => CLASS_MIN.find(([word]) => has(name, word))?.[1] ?? {};
export function classBlockedByAbilities(name, abilities, race) {
  if (!hasAllAbilities(abilities)) return "";
  for (const [stat, need] of Object.entries(classMinimums(name))) if (adjustedScore(abilities, race, stat) < need) return `needs ${stat[0].toUpperCase()}${stat.slice(1)} ${need}`;
  return "";
}

// PHB Table 7: the classes a race may take (by words in the class's name); humans any.
const RACE_CLASSES = {
  dwarf: ["fighter", "cleric", "priest", "thief"],
  halfling: ["fighter", "cleric", "priest", "thief"],
  gnome: ["fighter", "cleric", "priest", "thief", "illusion"],
  elf: ["fighter", "ranger", "thief", "cleric", "priest", "mage", "wizard", "abjurer", "conjurer", "diviner", "enchanter", "invoker", "necromancer", "transmuter", "illusion"],
  "half-elf": ["fighter", "ranger", "cleric", "priest", "druid", "thief", "bard", "mage", "wizard", "abjurer", "conjurer", "diviner", "enchanter", "invoker", "necromancer", "transmuter", "illusion"],
};
export function raceCategory(name) {
  const s = lower(name);
  if (/half-elf|half elf/.test(s)) return "half-elf";
  if (s.includes("halfling")) return "halfling";
  if (s.includes("dwar")) return "dwarf";
  if (s.includes("gnome")) return "gnome";
  if (s.includes("elf") || s.includes("elv")) return "elf";
  if (s.includes("human")) return "human";
  return null;
}
export function classAllowedForRace(className, race) {
  const cat = raceCategory(race);
  if (!cat || cat === "human") return true;
  const allowed = RACE_CLASSES[cat];
  return !allowed || allowed.some((word) => has(className, word));
}

// PHB Table 7's level limits for demihumans (20: unlimited); humans none.
const LEVEL_LIMITS = {
  dwarf: { fighter: 15, cleric: 10, thief: 12, default: 12 },
  elf: { fighter: 12, ranger: 15, mage: 15, cleric: 12, thief: 20, druid: 12, default: 12 },
  gnome: { fighter: 11, cleric: 9, thief: 20, illusion: 15, mage: 15, default: 11 },
  "half-elf": { fighter: 14, ranger: 16, cleric: 14, mage: 12, druid: 20, thief: 20, bard: 20, default: 14 },
  halfling: { fighter: 9, cleric: 8, thief: 20, default: 12 },
  "half-orc": { fighter: 10, cleric: 4, thief: 8, default: 10 },
};
export function maxLevelFor(race, classWords) {
  const r = lower(race);
  if (!r || !classWords) return 20;
  const limits = r.includes("half") && r.includes("elf") ? LEVEL_LIMITS["half-elf"] : r.includes("half") && r.includes("orc") ? LEVEL_LIMITS["half-orc"] : r.includes("dwarf") || r.includes("dwarv") ? LEVEL_LIMITS.dwarf : r.includes("elf") || r.includes("elv") ? LEVEL_LIMITS.elf : r.includes("gnome") ? LEVEL_LIMITS.gnome : r.includes("halfling") ? LEVEL_LIMITS.halfling : null;
  if (!limits) return 20;
  for (const [word, cap] of Object.entries(limits)) if (word !== "default" && has(classWords, word)) return cap;
  return limits.default ?? 12;
}

// --- Multi- and dual-class (PHB Chapter 3) -----------------------------------
const MULTI_COMBOS = {
  dwarf: [["fighter", "thief"], ["fighter", "cleric"]],
  elf: [["fighter", "mage"], ["fighter", "thief"], ["mage", "thief"], ["fighter", "mage", "thief"]],
  gnome: [["fighter", "cleric"], ["fighter", "illusionist"], ["fighter", "thief"], ["cleric", "illusionist"], ["cleric", "thief"], ["illusionist", "thief"]],
  "half-elf": [["fighter", "cleric"], ["fighter", "druid"], ["fighter", "thief"], ["fighter", "mage"], ["cleric", "ranger"], ["druid", "ranger"], ["cleric", "mage"], ["druid", "mage"], ["thief", "mage"], ["fighter", "mage", "cleric"], ["fighter", "mage", "druid"], ["fighter", "mage", "thief"]],
  halfling: [["fighter", "thief"]],
};
const BASE_CLASS_NAME = { fighter: "Fighter", mage: "Mage", thief: "Thief", cleric: "Cleric", druid: "Druid", ranger: "Ranger", illusionist: "Illusionist" };
// The PHB class a class is for the combinations table; null for those that cannot multi-class.
export function baseClassKey(name) {
  const s = lower(name);
  for (const word of ["barbarian", "wild mage", "elementalist", "abjur", "conjur", "diviner", "enchant", "invok", "necrom", "transmut"]) if (s.includes(word)) return null;
  for (const key of ["paladin", "ranger", "druid", "cleric", "fighter", "illusion", "thief", "bard"]) if (s.includes(key)) return key === "illusion" ? "illusionist" : key;
  return s.includes("mage") || s.includes("wizard") ? "mage" : null;
}
// Prime requisites (PHB Table 13).
export function primeRequisites(words) {
  const s = lower(words);
  if (s.includes("paladin")) return ["strength", "charisma"];
  if (s.includes("ranger")) return ["strength", "dexterity", "wisdom"];
  if (s.includes("druid")) return ["wisdom", "charisma"];
  if (s.includes("bard")) return ["dexterity", "charisma"];
  if (s.includes("fighter") || s.includes("barbarian")) return ["strength"];
  if (s.includes("thief")) return ["dexterity"];
  if (s.includes("cleric") || s.includes("priest") || s.includes("shaman")) return ["wisdom"];
  return ["intelligence"];
}
const primesAtLeast = (words, min, abilities, race) => primeRequisites(words).every((stat) => adjustedScore(abilities, race, stat) >= min);
// Dual-class: may the first class leave? 15+ in its primes (a paladin: Strength, Constitution, Wisdom 15).
function dualFirstOk(words, abilities, race) {
  const s = lower(words);
  const atLeast = (stats, n) => stats.every((stat) => adjustedScore(abilities, race, stat) >= n);
  if (s.includes("paladin")) return atLeast(["strength", "constitution", "wisdom"], 15);
  if (s.includes("barbarian") && s.includes("shaman")) return atLeast(["wisdom"], 15);
  if (s.includes("barbarian")) return atLeast(["strength"], 15);
  return primesAtLeast(words, 15, abilities, race);
}
// ...and take up the new one? 17+ in its primes.
function dualNewOk(first, next, abilities, race) {
  const f = lower(first);
  const n = lower(next);
  const firstBarb = f.includes("barbarian");
  const newBarb = n.includes("barbarian");
  if (firstBarb !== newBarb) return false;
  if (newBarb) return ["dexterity", "constitution", n.includes("shaman") ? "wisdom" : "strength"].every((stat) => adjustedScore(abilities, race, stat) >= 17);
  return primesAtLeast(next, 17, abilities, race);
}
const anyAlignmentFor = (words) => ALIGNMENTS.some((align) => alignmentAllowed(align, words));

export const classNames = () => Object.values(CLASSES).map((cls) => cls.name);
// The build's mode (single unless a multi or dual class was chosen for this class and race).
export const classMode = (build) => (build?.cls && build?.race && (build.mode === "multi" || build.mode === "dual") && Array.isArray(build.classList) && build.classList.length ? build.mode : "single");
export const dualFirstLevel = (build) => Math.max(2, Math.min(20, Math.round(num(build?.dualLevel, 2))));
// Every class of the build: [{name, level, active}].
export function classEntries(build) {
  if (!build?.cls) return [];
  const mode = classMode(build);
  const target = Math.max(1, Math.round(num(build.level, 1)));
  if (mode === "multi") return build.classList.map((name) => ({ name, level: Math.max(1, Math.min(target, maxLevelFor(build.race, lower(name)))), active: true }));
  if (mode === "dual") return [{ name: build.cls, level: dualFirstLevel(build), active: false }, { name: build.classList[0], level: Math.max(1, Math.min(target, 20)), active: true }];
  return [{ name: build.cls, level: targetLevel(build), active: true }];
}
// The words the rules judge the class by (a multi- or dual-class's: all of them).
export function classWords(build) {
  if (!build?.cls) return "";
  if (classMode(build) !== "single") return classEntries(build).map((entry) => lower(entry.name)).join(" ");
  return lower(build.cls);
}
// Dual-class: the new class (whose limits apply); otherwise every class.
export const activeClassWords = (build) => (classMode(build) === "dual" ? lower(build.classList[0]) : classWords(build));
export function raceClassMax(build) {
  const mode = classMode(build);
  if (mode === "multi") return Math.max(1, ...build.classList.map((name) => maxLevelFor(build.race, lower(name))));
  if (mode === "dual") return maxLevelFor(build.race, lower(build.classList[0]));
  return maxLevelFor(build.race, classWords(build));
}
export const targetLevel = (build) => Math.max(1, Math.min(Math.round(num(build?.level, 1)), raceClassMax(build)));
export function levelCapText(build) {
  if (classMode(build) === "multi") return `(max: ${classEntries(build).map((entry) => `${entry.name} ${maxLevelFor(build.race, lower(entry.name))}`).join(", ")})`;
  return `(max ${raceClassMax(build)} for this race/class)`;
}
// "Fighter/Mage", "Fighter 4, then Mage", or the class.
export function classComboLabel(build) {
  const mode = classMode(build);
  const names = classEntries(build).map((entry) => entry.name);
  if (mode === "multi") return names.join("/");
  if (mode === "dual") return `${names[0]} ${dualFirstLevel(build)}, then ${names[1]}`;
  return build?.cls ?? "";
}
// The Class type box: single class, then the multi-class combinations (demihumans)
// or the classes to dual-class into (humans) the race, scores and alignments allow.
export function classTypeOptions(build) {
  const out = [{ label: "Single class", mode: "single", classes: [] }];
  if (!build?.cls) return out;
  const cat = raceCategory(build.race);
  const words = lower(build.cls);
  const abilities = build.abilities ?? {};
  if (cat === "human") {
    if (!dualFirstOk(words, abilities, build.race)) return out;
    const mine = baseClassKey(build.cls);
    for (const name of classNames()) {
      const next = lower(name);
      const key = baseClassKey(name);
      if (name === build.cls || (key !== null && key === mine) || (mine && next.includes(mine))) continue;
      if (dualNewOk(words, next, abilities, build.race) && !classBlockedByAbilities(name, abilities, build.race) && anyAlignmentFor(`${words} ${next}`)) out.push({ label: `Dual-class: then ${name}`, mode: "dual", classes: [name] });
    }
    return out;
  }
  const mine = baseClassKey(build.cls);
  if (!mine || !MULTI_COMBOS[cat ?? ""]) return out;
  for (const combo of MULTI_COMBOS[cat]) {
    if (!combo.includes(mine)) continue;
    const names = combo.map((key) => (key === mine ? build.cls : BASE_CLASS_NAME[key]));
    if (names.some((name) => !name || classBlockedByAbilities(name, abilities, build.race))) continue;
    if (anyAlignmentFor(names.map(lower).join(" "))) out.push({ label: `Multi-class: ${names.join("/")}`, mode: "multi", classes: names });
  }
  return out;
}
export const classTypeLabel = (build) => {
  const mode = classMode(build);
  if (mode === "multi") return `Multi-class: ${build.classList.join("/")}`;
  if (mode === "dual") return `Dual-class: then ${build.classList[0]}`;
  return "Single class";
};

// --- Alignment (PHB): every class named must allow it ------------------------
export function alignmentAllowed(align, words) {
  const s = lower(words);
  const a = String(align ?? "");
  if (s.includes("paladin") && a !== "Lawful Good") return false;
  if (s.includes("druid") && a !== "True Neutral") return false;
  if (s.includes("monk") && !a.startsWith("Lawful")) return false;
  if (s.includes("ranger") && !a.includes("Good")) return false;
  if (s.includes("bard") && !a.includes("Neutral")) return false;
  if (s.includes("thief") && a === "Lawful Good") return false;
  return true;
}
export const alignmentOptions = (words) => ALIGNMENTS.filter((align) => alignmentAllowed(align, words));
const ALIGNMENT_HINTS = {
  paladin: "Paladins must be Lawful Good.",
  druid: "Druids must be True Neutral.",
  monk: "Monks must be lawful (Lawful Good, Lawful Neutral, or Lawful Evil).",
  ranger: "Rangers are always good (Lawful, Neutral or Chaotic Good).",
  bard: "Bards must be at least partially neutral.",
  thief: "Thieves can be any alignment except Lawful Good.",
};
export const alignmentHint = (words) => Object.entries(ALIGNMENT_HINTS).filter(([word]) => has(words, word)).map(([, text]) => text).join(" ");

// --- Starting wealth (PHB Table 43) ------------------------------------------
export function wealthGroup(words) {
  const s = lower(words);
  if (s.includes("fighter") || s.includes("ranger") || s.includes("paladin")) return "warrior";
  if (s.includes("cleric") || s.includes("priest") || s.includes("druid")) return "priest";
  if (s.includes("thief") || s.includes("bard")) return "rogue";
  if (["mage", "wizard", "illusion", "conjur", "divin", "enchant", "invok", "necrom", "transmut"].some((word) => s.includes(word))) return "wizard";
  return "warrior";
}
// count, sides, plus per roll, the label.
export const WEALTH_DICE = {
  warrior: [5, 4, 0, "Warrior group - roll 5d4, multiply by 10 gp (Fighter, Ranger, Paladin)"],
  priest: [3, 6, 0, "Priest group - roll 3d6, multiply by 10 gp (Cleric, Druid); after shopping a priest keeps only 3 gp, the rest goes to his order"],
  rogue: [2, 6, 0, "Rogue group - roll 2d6, multiply by 10 gp (Thief, Bard)"],
  wizard: [1, 4, 1, "Wizard group - roll (1d4+1), multiply by 10 gp (Mage and specialists)"],
};
// The roll: dice (for the host), plus, mult; above 1st level the GM's gold option.
export function wealthInfo(build, options) {
  const [count, sides, plus, text] = WEALTH_DICE[wealthGroup(classWords(build))] ?? WEALTH_DICE.warrior;
  const level = targetLevel(build);
  const gold = wizardOptions(options).gold;
  let rolls = 1;
  let mult = 10;
  let label = text;
  if (level > 1 && gold === "perlevel") {
    rolls = level;
    label = `${text}, one roll per level: ${level} rolls`;
  } else if (level > 1 && gold === "xlevel") {
    mult = 10 * level;
    label = `${text}, times level ${level}`;
  }
  return { dice: `${count * rolls}d${sides}`, plus: plus * rolls, mult, label, expr: `${plus ? "(" : ""}${count * rolls}d${sides}${plus ? `+${plus * rolls})` : ""}*${mult}` };
}
// "Priest characters ... must return all but two or three of his remaining gold pieces": a priest keeps 3 gp.
export const PRIEST_KEEPS_GP = 3;
export const allPriests = (classNamesList) => classNamesList.length > 0 && classNamesList.every((name) => wealthGroup(name) === "priest");

// --- Kits ----------------------------------------------------------------------
// A kit's book and the races and classes it is for, by the book's name.
const HUMANOID_RACES = ["orc", "half-orc", "goblin", "hobgoblin", "kobold", "gnoll", "bugbear", "ogre", "troll", "lizard", "centaur", "minotaur", "satyr", "giant", "mongrel", "aarakocra", "alaghi", "bullywug", "flind", "swanmay", "wemic"];
const ARCANE = ["mage", "wizard", "abjurer", "conjurer", "diviner", "enchanter", "invoker", "necromancer", "transmuter", "illusion"];
const KIT_BOOKS = [
  { pattern: "gnomes and halflings", races: ["gnome", "halfling"] },
  { pattern: "dwarves", races: ["dwarf"] },
  { pattern: "dwarf", races: ["dwarf"] },
  { pattern: "elves", races: ["elf", "half-elf"] },
  { pattern: "elf", races: ["elf", "half-elf"] },
  { pattern: "gnomes", races: ["gnome"] },
  { pattern: "gnome", races: ["gnome"] },
  { pattern: "halflings", races: ["halfling"] },
  { pattern: "halfling", races: ["halfling"] },
  { pattern: "humanoids", races: HUMANOID_RACES },
  { pattern: "humanoid", races: HUMANOID_RACES },
  { pattern: "barbarian", classes: ["fighter", "ranger", "paladin", "barbarian"] },
  { pattern: "fighter", classes: ["fighter", "ranger", "paladin"] },
  { pattern: "ranger", classes: ["ranger"] },
  { pattern: "paladin", classes: ["paladin"] },
  { pattern: "demihuman deities", classes: ["cleric", "priest"], races: ["dwarf", "elf", "half-elf", "gnome", "halfling"] },
  { pattern: "priest", classes: ["cleric", "priest"] },
  { pattern: "druid", classes: ["druid"] },
  { pattern: "thief", classes: ["thief"] },
  { pattern: "bard", classes: ["bard"] },
  { pattern: "necromancer", classes: ["mage", "wizard", "necromancer"] },
  { pattern: "tome of magic", classes: [...ARCANE, "cleric", "priest"] },
  { pattern: "wizard", classes: ARCANE },
];
const nameMatches = (name, keyword) => Boolean(name && keyword && (name.includes(keyword) || keyword.includes(name)));
const restrictionList = (value) =>
  lower(value)
    .split(/[,;/]+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "any" && part !== "all");
// A record's book (FG's module name, after the @ of its path); "" the campaign's own.
export const bookOf = (data) => /@(.+)$/.exec(String(data?.fgPath ?? ""))?.[1] ?? "";
const plainText = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&");
// {stat: n} from a record's "Requirements" (a class's or kit's text).
export function recordRequirements(text) {
  const s = lower(plainText(text));
  const at = s.search(/requirements?:?\s/);
  if (at < 0) return {};
  const part = s.slice(at, at + 300);
  return Object.fromEntries(STATS.map((stat) => [stat, new RegExp(`${stat}\\s+(\\d+)`).exec(part)?.[1]]).filter(([, n]) => n).map(([stat, n]) => [stat, Number(n)]));
}
// Is a kit (a book's background record) for this character?
export function kitBlocked(kit, build) {
  const data = kit?.data ?? kit ?? {};
  const classes = [];
  const races = [];
  for (const field of ["class", "classes", "classrestriction", "allowedclass", "classreq"]) if (typeof data[field] === "string") classes.push(...restrictionList(data[field]));
  for (const field of ["race", "races", "racerestriction", "allowedrace", "racereq"]) if (typeof data[field] === "string") races.push(...restrictionList(data[field]));
  for (const [field, out] of [["classes", classes], ["classlist", classes], ["races", races], ["racelist", races]]) {
    const node = data[field];
    if (node && typeof node === "object") for (const row of Object.values(node)) if (row && typeof row === "object" && row.name) out.push(lower(String(row.name).trim()));
  }
  const words = classWords(build);
  const race = lower(raceCategory(build.race) ?? build.race);
  const book = lower(kit?.book ?? bookOf(data));
  // The Complete Fighter's and Thief's Handbooks' kits are for single-class characters.
  if (classMode(build) === "multi") {
    if (book.includes("complete fighter") || book.includes("complete thief")) return "single-class characters only";
    if (book.includes("complete barbarian") && !(race.includes("dwar") && words.includes("fighter") && words.includes("cleric"))) return "single-class characters only";
  }
  if (classes.length && !classes.some((need) => nameMatches(words, need))) return `for ${classes.join(", ")}`;
  if (races.length && !races.some((need) => nameMatches(race, need))) return `for ${races.join(", ")}`;
  if (!classes.length && !races.length && book) {
    const rule = KIT_BOOKS.find((entry) => book.includes(entry.pattern));
    if (rule?.classes && !rule.classes.some((word) => words.includes(word))) return `a ${rule.classes[0]}'s kit`;
    if (rule?.races && !rule.races.some((word) => nameMatches(race, word))) return `for ${rule.races.join(", ")}`;
  }
  if (hasAllAbilities(build.abilities)) for (const [stat, need] of Object.entries(recordRequirements(data.text))) if (adjustedScore(build.abilities, build.race, stat) < need) return `needs ${stat[0].toUpperCase()}${stat.slice(1)} ${need}`;
  return "";
}

// Kit weapon rules, from each kit's "Weapon Proficiencies" paragraph (the extension's table):
// only, forbid, add, nomissile, required ("one of" groups), slots (replace the class's), extra,
// any, cleric, class (a group's limits), fixed (the whole career's), note.
const POLEARMS = ["polearm", "halberd", "glaive", "guisarme", "bardiche", "bill", "partisan", "ranseur", "spetum", "voulge", "awl pike", "lucern", "bec de corbin", "fauchard", "military fork", "pike"];
export const MISSILE = ["bow", "crossbow", "sling", "dart", "blowgun", "javelin", "throwing", "boomerang", "bola", "atlatl", "arquebus", "rabbit stick", "harpoon", "rock"];
export const KIT_WEAPONS = {
  ravager: { nomissile: true, add: ["spear"], note: "Ravager: no thrown or missile weapons (a spear is acceptable)." },
  brute: { slots: 2, only: ["club", "axe", "celt", "dagger", "knife", "spear"], required: [["club"]], note: "Brute: two weapon slots; club, then axe, celt, dagger, knife or spear." },
  brushrunner: { required: [["boomerang"]] },
  plainrider: { required: [["short bow"]] },
  witchman: { required: [["dagger", "knife"]] },
  "wizard slayer": { required: [["short bow"]] },
  flamespeaker: { note: "Flamespeaker: no weapons made only of wood." },
  thespian: { slots: 1, only: ["dagger"], note: "Thespian: dagger only at 1st level (knife at 2nd, short sword at 5th)." },
  "halfling whistler": { only: ["blowgun", "short bow", "club", "light crossbow", "dagger", "dart", "footman's mace", "hand axe", "harpoon", "javelin", "knife", "quarterstaff", "sling", "spear", "staff sling", "short sword", "war hammer"], note: "Whistler: at least half the weapons must be ones that can be hurled." },
  jongleur: { only: [...POLEARMS, "quarterstaff", "sling", "staff sling", "whip", "dagger", "dart", "javelin", "knife", "spear", "hand axe", "throwing"], note: "Jongleur: hurled weapons, polearms, quarterstaff, slings and whip." },
  meistersinger: { forbid: [...POLEARMS, "harpoon", "lance", "mancatcher", "trident"], note: "Meistersinger: one melee and one missile weapon at 1st level." },
  blade: { note: "Blade: half the slots on swords, daggers or knives; one purely missile weapon at most." },
  loremaster: { only: ["blowgun", "dagger", "dart", "hand crossbow", "knife", "quarterstaff", "sling", "staff sling"] },
  "dwarven chanter": { only: ["club", "flail", "mace", "javelin", "morning star", "quarterstaff", "sling", "spear", "staff sling", "war hammer"] },
  jester: { only: ["blowgun", "hand crossbow", "dagger", "dart", "hand axe", "javelin", "knife", "quarterstaff", "scourge", "sling", "short sword", "whip"] },
  "elven minstrel": { only: ["blowgun", "bow", "dagger", "dart", "hand axe", "javelin", "knife", "quarterstaff", "sling", "spear", "staff sling", "long sword", "short sword", "trident"] },
  "gypsy-bard": { forbid: [...POLEARMS, "battle axe", "lance", "trident", "two-handed sword", "bastard sword", "war hammer"], required: [["dagger", "knife"]], note: "Gypsy-bard: a first sword must be a khopesh or scimitar." },
  riddlemaster: { only: ["blowgun", "bow", "crossbow", "dagger", "dart", "hand axe", "javelin", "knife", "quarterstaff", "sling", "spear", "staff sling", "short sword", "whip"] },
  "gnome professor": { only: ["arquebus", "blowgun", "bow", "crossbow", "harpoon", "mancatcher", "scourge", "sling", "staff sling", "whip"] },
  skald: { required: [["broad sword", "hand axe", "battle axe", "spear"]], note: "Skald: half the slots on broad sword, hand axe, battle axe or spear." },
  charlatan: { required: [["dagger", "short sword", "long sword"]] },
  gallant: { required: [["lance"]] },
  vindicator: { nomissile: true, add: ["battle axe", "war hammer"], required: [["battle axe"], ["war hammer"]], note: "Vindicator: no ranged weapon but the warhammer." },
  battlerager: { nomissile: true, add: ["battle axe", "war hammer"], required: [["battle axe"], ["war hammer"]], note: "Battlerager: must specialize in battle axe and warhammer; no ranged weapons." },
  "hearth guard": { required: [["axe"], ["spear"], ["light crossbow"]] },
  highborn: { required: [["sword"], ["hammer"], ["light crossbow"]] },
  "ritual priest": { add: ["battle axe", "crossbow", "hand axe", "throwing axe", "morning star", "war hammer"] },
  "vermin slayer": { required: [["light crossbow"], ["hand axe", "hammer", "dagger"]] },
  sharpshooter: { required: [["light crossbow", "heavy crossbow"]] },
  "rapid response rider": { required: [["lance"]] },
  windrider: { extra: 1, add: ["lance"], required: [["lance"]], note: "Windrider: a bonus lance proficiency." },
  "healer|gnome": { slots: 1, cleric: true, note: "Healer: one weapon slot, from the weapons a cleric may use." },
  leaftender: { only: ["sling", "sickle", "spear", "scythe", "dagger", "staff", "club", "dart"] },
  rocktender: { note: "Rocktender: no metal weapons (stone-headed hammers and clubs, slings, flint spears)." },
  breachgnome: { required: [["short sword"], ["hammer", "axe"]] },
  "humanoid bard": { class: "rogue" },
  oracle: { class: "priest" },
  "tunnel rat|humanoid": { required: [["short sword"]] },
  "savage|druid": { only: ["blowgun", "club", "dagger", "harpoon", "knife", "spear", "staff"] },
  "village druid": { required: [["sickle", "scythe"]] },
  samurai: { note: "Samurai: katana and daikyu specialization are chosen for you; the last slot from samurai weapons." },
  amazon: { required: [["spear"], ["long bow"]] },
  berserker: { nomissile: true, note: "Berserker: no ranged weapons at the start." },
  "peasant hero": { forbid: [...POLEARMS, "horseman", "lance", "long sword", "trident"] },
  "barbarian|fighter": { required: [["battle axe"], ["bastard sword"]] },
  cavalier: { required: [["lance"], ["sword"]] },
  gladiator: { required: [["short sword"], ["trident"], ["net"]] },
  "noble warrior": { required: [["long sword", "bastard sword"], ["lance"], ["horseman's flail", "horseman's mace"]] },
  "savage|fighter": { only: ["blowgun", "long bow", "short bow", "club", "dagger", "javelin", "knife", "sling", "spear"] },
  "swashbuckler|fighter": { extra: 2, required: [["stiletto", "main-gauche", "rapier", "sabre"]], note: "Swashbuckler: two extra slots for stiletto, main-gauche, rapier or sabre." },
  wyrmslayer: { only: ["lance", "awl pike", "bardiche", "glaive-guisarme", "spetum", "long sword", "two-handed sword", "trident"] },
  envoy: { slots: 2, fixed: true, note: "Envoy: two weapon proficiencies for the whole career." },
  medician: { slots: 1, required: [["lance", "battle axe", "sword"]] },
  equerry: { slots: 3, required: [["lance"]] },
  "true paladin": { required: [["lance"]] },
  chevalier: { required: [["sword"], ["lance"]] },
  errant: { required: [["sword"]] },
  militarist: { required: [["sword", "lance", "battle axe", "horseman's flail", "horseman's mace", "horseman's pick"]] },
  "pacifist priest": { only: ["bow", "dart"], note: "Pacifist Priest: bow and dart only, and only if the priest's class allows them (a cleric's does not)." },
  "savage priest": { only: ["blowgun", "long bow", "short bow", "club", "dagger", "javelin", "knife", "sling", "spear"] },
  beastmaster: { only: ["axe", "club", "dagger", "dart", "javelin", "knife", "quarterstaff", "sling", "spear"] },
  "stalker|ranger": { only: ["blowgun", "dagger", "dart", "knife", "short sword", "staff", "sling", "garrote", "rapier", "stiletto"] },
  seeker: { slots: 1, only: ["club", "light crossbow", "dagger", "dart", "knife", "quarterstaff", "sickle", "sling"], forbid: ["sword"] },
  feralan: { only: ["club", "knife", "blowgun", "dagger", "short bow", "dart", "hand axe", "sling", "spear"], required: [["club"], ["knife"]] },
  "mountain man": { only: ["axe", "bow", "crossbow", "club", "dagger", "dart", "javelin", "knife", "quarterstaff", "spear", "staff sling", "war hammer"] },
  "forest runner": { required: [["long bow", "quarterstaff", "long sword", "dagger"]] },
  pathfinder: { required: [["machete", "hand axe", "sword"]] },
  beggar: { only: ["club", "dagger", "dart", "knife", "sling", "staff"] },
  bandit: { extra: 1, add: ["flail", "mace", "morning star", "war hammer"], required: [["knife"]], note: "Bandit: one bludgeoning weapon among the first slots; a third slot for any weapon." },
  assassin: { any: true },
  "bounty hunter": { any: true },
  "swashbuckler|thief": { extra: 1, add: ["stiletto", "main-gauche", "rapier", "sabre"], required: [["stiletto", "main-gauche", "rapier", "sabre"]] },
  witch: { slots: 0, fixed: true, note: "Witch: no weapon proficiencies." },
  "peasant wizard": { add: ["bow", "spear"], required: [["bow", "dagger", "knife", "spear", "dart", "sling"]] },
  "amazon sorceress": { add: ["spear", "long bow"] },
  anagakok: { add: ["bow", "harpoon", "javelin", "trident"], required: [["bow", "dagger", "harpoon", "javelin", "knife", "sling", "trident"]] },
  patrician: { required: [["dagger", "knife"]] },
  academician: { required: [["dagger", "dart", "knife", "sling"]] },
  "savage wizard": { add: ["spear", "blowgun"], required: [["spear", "blowgun", "dagger", "knife", "sling"]] },
  "wu jen": { add: ["blowgun", "short bow"], required: [["blowgun", "short bow", "dagger", "dart", "sling"]] },
  mystic: { required: [["dagger", "dart", "sling"]] },
  philosopher: { only: ["dagger", "dart", "knife"] },
};
const KIT_BOOK_WORD = { fighter: "fighter", thief: "thief", ranger: "ranger", druid: "druid", gnomes: "gnome", humanoids: "humanoid" };
// The rule for a kit ({name, book}), or null.
export function kitWeaponRule(kit) {
  if (!kit?.name) return null;
  const name = lower(kit.name)
    .replace(/\s*\([a-z]\)\s*$/, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim();
  const book = lower(kit.book);
  for (const [word, key] of Object.entries(KIT_BOOK_WORD)) if (book.includes(word) && KIT_WEAPONS[`${name}|${key}`]) return KIT_WEAPONS[`${name}|${key}`];
  return KIT_WEAPONS[name] ?? null;
}
// Every word of the keyword in the name ("short bow" matches "Bow, Short"), or the keyword without spaces in it ("war hammer" matches "Warhammer").
export function weaponNameMatches(name, keyword) {
  const s = ` ${lower(name)
    .replace(/[^a-z0-9\-' ]/g, " ")
    .replace(/\s+/g, " ")} `;
  const tight = s.replace(/[^a-z0-9]/g, "");
  const k = lower(keyword);
  if (tight.includes(k.replace(/[^a-z0-9]/g, ""))) return true;
  return (k.match(/[a-z0-9\-']+/g) ?? []).every((word) => s.includes(word));
}
const matchesAny = (name, keywords) => (keywords ?? []).some((keyword) => weaponNameMatches(name, keyword));
export const kitRequiredText = (rule) => (rule?.required ?? []).map((group) => group.join(" or ")).join("; ");
export function kitWeaponNote(kit) {
  const rule = kitWeaponRule(kit);
  if (!rule) return "";
  const parts = [];
  if (rule.note) parts.push(rule.note);
  const required = kitRequiredText(rule);
  if (required) parts.push(`${kit.name} must take: ${required}.`);
  if (rule.only && !rule.note) parts.push(`${kit.name} may only take the weapons listed.`);
  return parts.join(" ");
}

// --- Proficiencies (PHB Table 34) -------------------------------------------
export function profGroup(words) {
  const s = lower(words);
  if (s.includes("fighter") || s.includes("ranger") || s.includes("paladin") || s.includes("barbarian")) return "warrior";
  if (s.includes("bard")) return "bard";
  if (s.includes("thief")) return "rogue";
  if (s.includes("druid")) return "druid";
  if (s.includes("cleric") || s.includes("priest")) return "priest";
  if (["mage", "wizard", "illusion", "conjur", "divin", "enchant", "invok", "necrom", "transmut", "abjur"].some((word) => s.includes(word))) return "wizard";
  return "warrior";
}
// Initial weapon slots, a new one every N levels; initial nonweapon slots, every N levels.
const PROF_SLOTS = { warrior: [4, 3, 3, 3], wizard: [1, 6, 4, 3], priest: [2, 4, 4, 3], rogue: [2, 4, 3, 4] };
const slotRow = (words) => {
  let group = profGroup(words);
  if (group === "bard") group = "rogue";
  else if (group === "druid") group = "priest";
  return PROF_SLOTS[group] ?? PROF_SLOTS.priest;
};
// Multi-class: the largest initial number, then the fastest rate; dual-class: each class's own.
function slotParts(build, init, rate) {
  const mode = classMode(build);
  if (mode === "single") {
    const row = slotRow(classWords(build));
    return [row[init], Math.floor(targetLevel(build) / row[rate])];
  }
  let first = 0;
  let fastest = 99;
  let top = 1;
  let grow = 0;
  for (const entry of classEntries(build)) {
    const row = slotRow(entry.name);
    if (mode === "dual") {
      first += row[init];
      grow += Math.floor(entry.level / row[rate]);
    } else {
      first = Math.max(first, row[init]);
      fastest = Math.min(fastest, row[rate]);
      top = Math.max(top, entry.level);
    }
  }
  if (mode === "multi") grow = Math.floor(top / fastest);
  return [first, grow];
}
// Weapon slots; a kit may set its own number or add slots (its record's weaponprofs, or the rule's extra).
export function weaponSlots(build) {
  if (!build?.cls) return 0;
  const [init, grow] = slotParts(build, 0, 1);
  const rule = kitWeaponRule(build.kit) ?? {};
  let n = rule.slots ?? init;
  if (!rule.fixed) n += grow;
  const extra = rule.extra ?? num(build.kit?.data?.weaponprofs, 0);
  return n + extra;
}
export function nonweaponSlots(build) {
  if (!build?.cls) return 0;
  const [init, grow] = slotParts(build, 2, 3);
  return init + grow;
}
// null: any weapon; else the keywords the class's weapons must match (PHB).
const WEAPON_ALLOW = {
  wizard: ["dagger", "dart", "knife", "sling", "staff", "quarterstaff"],
  priest: ["club", "mace", "hammer", "warhammer", "staff", "quarterstaff", "sling", "flail", "morning star", "scourge", "mancatcher", "whip", "bludgeon"],
  druid: ["club", "dagger", "dart", "scimitar", "sling", "spear", "staff", "quarterstaff", "sickle", "dagger"],
  rogue: ["club", "dagger", "dirk", "dart", "crossbow", "knife", "lasso", "bow", "sling", "broad sword", "long sword", "rapier", "short sword", "scimitar", "staff"],
};
export function allowedWeaponKeywords(build) {
  const rule = kitWeaponRule(build.kit) ?? {};
  if (rule.any) return null;
  if (rule.class) return WEAPON_ALLOW[rule.class];
  if (classMode(build) !== "single" && activeClassWords(build).includes("druid")) return WEAPON_ALLOW.druid;
  const group = profGroup(classWords(build));
  if (group === "warrior" || group === "bard") return null;
  return WEAPON_ALLOW[group];
}
// A kit's limits on the proficiencies a new character takes; weapons it adds or requires are always allowed.
export function kitProfAllowed(name, kit) {
  const rule = kitWeaponRule(kit);
  if (!rule) return true;
  if (matchesAny(name, rule.add)) return true;
  if ((rule.required ?? []).some((group) => matchesAny(name, group))) return true;
  if (rule.only && !matchesAny(name, rule.only)) return false;
  if (rule.forbid && matchesAny(name, rule.forbid)) return false;
  if (rule.nomissile && matchesAny(name, MISSILE)) return false;
  return true;
}
// Weapon specialization: single-class fighters (not rangers or paladins).
export const canSpecialize = (build) => classMode(build) !== "multi" && classWords(build).includes("fighter");

// Recommended weapons by class group, a race's favourites first.
const CLASS_WEAPONS = {
  warrior: ["Long Sword", "Battle Axe", "War Hammer", "Two-Handed Sword", "Spear", "Halberd", "Mace", "Flail", "Short Sword", "Long Bow", "Short Bow", "Light Crossbow", "Dagger"],
  bard: ["Long Sword", "Short Sword", "Rapier", "Dagger", "Sling", "Short Bow", "Light Crossbow", "Quarterstaff"],
  rogue: ["Short Sword", "Long Sword", "Rapier", "Broad Sword", "Dagger", "Club", "Sling", "Dart", "Light Crossbow", "Quarterstaff"],
  priest: ["Mace", "War Hammer", "Club", "Flail", "Morning Star", "Quarterstaff", "Sling", "Staff Sling"],
  druid: ["Scimitar", "Spear", "Club", "Dagger", "Dart", "Sling", "Quarterstaff", "Sickle"],
  wizard: ["Dagger", "Dart", "Quarterstaff", "Sling", "Knife"],
};
const RACE_FAVORED = {
  dwarf: ["Battle Axe", "War Hammer", "Light Crossbow", "Hand Axe", "Military Pick"],
  elf: ["Long Sword", "Short Sword", "Long Bow", "Short Bow"],
  gnome: ["Light Crossbow", "War Hammer", "Short Sword", "Dagger"],
  halfling: ["Sling", "Short Sword", "Dagger", "Light Crossbow"],
  "half-elf": ["Long Sword", "Long Bow", "Short Sword"],
  "half-orc": ["Battle Axe", "Two-Handed Sword", "Spear"],
  human: [],
};
const bioRace = (race) => {
  const s = lower(race);
  if (s.includes("half") && s.includes("elf")) return "half-elf";
  if (s.includes("half") && s.includes("orc")) return "half-orc";
  if (s.includes("dwarf") || s.includes("dwarv")) return "dwarf";
  if (s.includes("elf") || s.includes("elv")) return "elf";
  if (s.includes("gnome")) return "gnome";
  if (s.includes("halfling") || s.includes("hobbit")) return "halfling";
  return "human";
};
export function recommendedWeapons(words, race) {
  let group = profGroup(words);
  if (!CLASS_WEAPONS[group]) group = "wizard";
  const base = CLASS_WEAPONS[group];
  const favored = RACE_FAVORED[bioRace(race)] ?? [];
  const any = group === "warrior" || group === "bard";
  const out = [];
  for (const name of favored) if (!out.some((row) => row.name === name) && (any || base.includes(name))) out.push({ name, favored: true });
  for (const name of base) if (!out.some((row) => row.name === name)) out.push({ name, favored: favored.includes(name) });
  return out;
}
const weaponKey = (name) => lower(name).replace(/[^a-z0-9]/g, "");
// The proficiency picker: the kit's required weapons, the recommended ones by the shop's
// own names, then every other weapon the shop sells this class, A-Z.
export function weaponCatalog(shopWeapons, build) {
  if (weaponSlots(build) <= 0) return [];
  const shop = [...new Set(shopWeapons)].sort();
  const out = [];
  const seen = new Set();
  const add = (name) => {
    const key = weaponKey(name);
    if (key && !seen.has(key) && kitProfAllowed(name, build.kit)) {
      seen.add(key);
      out.push(name);
    }
  };
  for (const group of kitWeaponRule(build.kit)?.required ?? []) for (const name of shop) if (matchesAny(name, group)) add(name);
  for (const wanted of recommendedWeapons(classWords(build), build.race)) {
    let found = false;
    for (const name of shop) if (weaponKey(name) === weaponKey(wanted.name)) (add(name), (found = true));
    if (!found) for (const name of shop) if (weaponNameMatches(name, wanted.name)) add(name);
  }
  for (const name of shop) add(name);
  return out;
}

// --- Languages ---------------------------------------------------------------
// Extra languages by Intelligence (PHB).
export function languageCount(int) {
  const n = num(int, 0);
  if (n <= 1) return 0;
  if (n <= 8) return 1;
  if (n <= 11) return 2;
  if (n <= 13) return 3;
  if (n <= 15) return 4;
  if (n <= 23) return [5, 6, 7, 8, 9, 10, 11, 12][n - 16];
  if (n === 24) return 15;
  return 20;
}
const RACE_LANGUAGES = { human: ["Common"], dwarf: ["Common", "Dwarvish"], elf: ["Common", "Elvish"], gnome: ["Common", "Gnomish"], "half-elf": ["Common", "Elvish"], halfling: ["Common", "Halfling"], "half-orc": ["Common", "Orcish"] };
export const raceLanguages = (race) => [...(RACE_LANGUAGES[bioRace(race)] ?? ["Common"])];
export const LANGUAGES = ["Common", "Dwarvish", "Elvish", "Gnomish", "Halfling", "Orcish", "Goblin", "Hobgoblin", "Kobold", "Gnoll", "Bugbear", "Ogre", "Giant", "Troll", "Dragon", "Sylvan", "Centaur", "Lizard Man", "Sprite", "Treant", "Minotaur", "Druidic", "Thieves' Cant"];
export const languageCatalog = (race) => {
  const known = new Set(raceLanguages(race).map(lower));
  return LANGUAGES.filter((name) => !known.has(lower(name)));
};

// --- Nonweapon proficiencies (PHB Table 37): General and the class's own group.
const normNWP = (name) =>
  lower(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const NWP_GROUPS = {
  general: ["Agriculture", "Animal Handling", "Animal Training", "Artistic Ability", "Blacksmithing", "Brewing", "Carpentry", "Cobbling", "Cooking", "Dancing", "Direction Sense", "Etiquette", "Fire-building", "Fishing", "Gaming", "Heraldry", "Languages, Modern", "Languages, Ancient", "Leatherworking", "Mining", "Pottery", "Riding, Land-based", "Riding, Airborne", "Rope Use", "Seamanship", "Seamstress", "Tailor", "Singing", "Stonemasonry", "Swimming", "Weather Sense", "Weaving"],
  warrior: ["Animal Handling", "Armorer", "Blind-fighting", "Bowyer", "Fletcher", "Charioteering", "Endurance", "Gaming", "Hunting", "Mountaineering", "Running", "Set Snares", "Survival", "Tracking", "Weaponsmithing"],
  priest: ["Agriculture", "Ancient History", "Astrology", "Brewing", "Ceremony", "Engineering", "Healing", "Herbalism", "Languages, Ancient", "Local History", "Musical Instrument", "Navigation", "Reading/Writing", "Religion", "Spellcraft"],
  wizard: ["Ancient History", "Astrology", "Engineering", "Herbalism", "Languages, Ancient", "Navigation", "Reading/Writing", "Religion", "Spellcraft"],
  rogue: ["Appraising", "Blind-fighting", "Disguise", "Forgery", "Gaming", "Gem Cutting", "Jumping", "Juggling", "Local History", "Musical Instrument", "Reading/Writing", "Set Snares", "Tightrope Walking", "Tumbling", "Ventriloquism"],
};
const nwpHit = (list, name) => list.some((entry) => {
  const a = normNWP(entry);
  return a === name || name.startsWith(a) || a.startsWith(name);
});
export function nwpAllowed(name, group) {
  const n = normNWP(name);
  if (!n) return false;
  if (nwpHit(NWP_GROUPS.general, n)) return true;
  const key = group === "druid" ? "priest" : group === "bard" ? "rogue" : group;
  return Boolean(NWP_GROUPS[key] && nwpHit(NWP_GROUPS[key], n));
}
// A proficiency's slot cost: FG 2E's "[N]" in its name ("Survival [2]"); else 1.
export const nwpCost = (name) => num(/\[(\d+)\]/.exec(String(name ?? ""))?.[1], 1) || 1;
// The books' nonweapon proficiencies (skill records) the class may take; with
// none in the books, the extension's own group lists.
export function nwpCatalog(skills, build) {
  const groups = classEntries(build).map((entry) => profGroup(entry.name));
  const allowed = (name) => groups.some((group) => nwpAllowed(name, group));
  const gather = (filter) => {
    const seen = new Set();
    const out = [];
    for (const row of skills) {
      const name = String(row?.name ?? "").trim();
      if (!name || seen.has(lower(name)) || (filter && !allowed(name))) continue;
      seen.add(lower(name));
      out.push({ name, data: row });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };
  const filtered = gather(true);
  if (filtered.length) return filtered;
  if (skills.length) return gather(false);
  const names = new Set(NWP_GROUPS.general);
  for (const group of groups) for (const name of NWP_GROUPS[group === "druid" ? "priest" : group === "bard" ? "rogue" : group] ?? []) names.add(name);
  return [...names].sort().map((name) => ({ name, data: null }));
}

// --- Spells ------------------------------------------------------------------
export function casterKeyForWords(words) {
  const s = lower(words);
  if (!s) return null;
  if (["mage", "wizard", "illusion", "conjur", "divin", "enchant", "invok", "necrom", "transmut", "abjur"].some((word) => s.includes(word))) return "wizard";
  if (["cleric", "priest", "druid", "shaman", "monk", "mystic"].some((word) => s.includes(word))) return "priest";
  if (s.includes("bard")) return "bard";
  if (s.includes("paladin")) return "paladin";
  if (s.includes("ranger")) return "ranger";
  return null;
}
// The build's casting classes: [{key, words, level, label}], each at its own level.
export function casterEntries(build) {
  const out = [];
  for (const entry of classEntries(build)) {
    const key = casterKeyForWords(entry.name);
    if (key && !out.some((row) => row.key === key)) out.push({ key, words: lower(entry.name), level: entry.level, label: entry.name });
  }
  return out;
}
const SPELL_TABLES = {
  wizard: { 1: [1], 2: [2], 3: [2, 1], 4: [3, 2], 5: [4, 2, 1], 6: [4, 2, 2], 7: [4, 3, 2, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 2, 1], 10: [4, 4, 3, 2, 2], 11: [4, 4, 4, 3, 3], 12: [4, 4, 4, 4, 4, 1], 13: [5, 5, 5, 4, 4, 2], 14: [5, 5, 5, 4, 4, 3, 1], 15: [5, 5, 5, 5, 5, 3, 2] },
  priest: { 1: [1], 2: [2], 3: [2, 1], 4: [3, 2], 5: [3, 3, 1], 6: [3, 3, 2], 7: [3, 3, 2, 1], 8: [3, 3, 3, 2], 9: [4, 4, 3, 2, 1], 10: [4, 4, 3, 3, 2], 11: [5, 4, 4, 3, 2, 1], 12: [6, 5, 5, 3, 2, 2], 13: [6, 6, 6, 4, 2, 2], 14: [6, 6, 6, 5, 3, 2, 1], 15: [6, 6, 6, 6, 4, 2, 1] },
  bard: { 2: [1], 3: [2], 4: [2, 1], 5: [3, 1], 6: [3, 2], 7: [3, 2, 1], 8: [3, 3, 1], 9: [3, 3, 2], 10: [3, 3, 2, 1], 11: [3, 3, 3, 1], 12: [3, 3, 3, 2], 13: [3, 3, 3, 2, 1], 14: [3, 3, 3, 3, 1], 15: [3, 3, 3, 3, 2], 16: [4, 3, 3, 3, 2, 1], 17: [4, 4, 3, 3, 3, 1], 18: [4, 4, 4, 3, 3, 2], 19: [4, 4, 4, 4, 3, 2], 20: [4, 4, 4, 4, 4, 3] },
  paladin: { 9: [1], 10: [2], 11: [2, 1], 12: [2, 2], 13: [2, 2, 1], 14: [3, 2, 1], 15: [3, 2, 1, 1], 16: [3, 3, 2, 1], 17: [3, 3, 3, 1], 18: [3, 3, 3, 1], 19: [3, 3, 3, 2], 20: [3, 3, 3, 3] },
  ranger: { 8: [1], 9: [2], 10: [2, 1], 11: [2, 2], 12: [2, 2, 1], 13: [3, 2, 1], 14: [3, 2, 2], 15: [3, 3, 2], 16: [3, 3, 3] },
};
const SPELL_CAP = { wizard: 15, priest: 15, bard: 20, paladin: 20, ranger: 16 };
// Priest bonus spells from Wisdom (PHB Table 5), per spell level.
const PRIEST_WIS_BONUS = { 13: [1], 14: [2], 15: [2, 1], 16: [2, 2], 17: [2, 2, 1], 18: [2, 2, 1, 1] };
export const spellRow = (caster) => (caster ? SPELL_TABLES[caster.key]?.[Math.min(caster.level, SPELL_CAP[caster.key])] ?? null : null);
export function maxSpellLevel(caster) {
  const row = spellRow(caster);
  if (!row) return 0;
  let top = 0;
  row.forEach((count, index) => count > 0 && (top = index + 1));
  return top;
}
const OPPOSED = {
  abjurer: ["alteration", "illusion", "phantasm"],
  conjurer: ["invocation", "evocation"],
  diviner: ["conjuration", "summoning"],
  enchanter: ["invocation", "evocation", "necromancy"],
  illusionist: ["necromancy", "invocation", "evocation", "abjuration"],
  invoker: ["enchantment", "charm", "conjuration", "summoning"],
  necromancer: ["illusion", "phantasm", "enchantment", "charm"],
  transmuter: ["abjuration", "necromancy"],
};
const OPPOSED_TEXT = {
  abjurer: "Alteration and Illusion",
  conjurer: "Invocation/Evocation (and greater Divination)",
  diviner: "Conjuration/Summoning",
  enchanter: "Invocation/Evocation and Necromancy",
  illusionist: "Necromancy, Invocation/Evocation and Abjuration",
  invoker: "Enchantment/Charm and Conjuration/Summoning",
  necromancer: "Illusion and Enchantment/Charm",
  transmuter: "Abjuration and Necromancy",
};
export const specialistKey = (caster) => (caster?.key === "wizard" ? Object.keys(OPPOSED).find((key) => caster.words.includes(key)) ?? null : null);
// Spells of a spell level the caster may pick (a specialist one more; a priest Wisdom's bonus where he has slots).
export function spellSlots(caster, level, wisdom) {
  const row = spellRow(caster);
  if (!row) return 0;
  let n = num(row[level - 1], 0);
  if (caster.key === "wizard" && n > 0 && specialistKey(caster)) n += 1;
  else if (caster.key === "priest" && n > 0 && num(wisdom, 0) >= 13) n += num(PRIEST_WIS_BONUS[Math.min(num(wisdom, 0), 18)]?.[level - 1], 0);
  return n;
}
const SPHERES = new Set(["all", "animal", "astral", "charm", "combat", "creation", "divination", "elemental", "air", "earth", "fire", "water", "guardian", "healing", "necromantic", "plant", "protection", "summoning", "sun", "weather", "chaos", "law", "numbers", "thought", "time", "travelers", "war", "wards"]);
const SPHERE_ACCESS = {
  cleric: { barred: new Set(["animal", "plant", "weather"]), minor: new Set(["elemental", "air", "earth", "fire", "water"]) },
  druid: { only: new Set(["all", "animal", "elemental", "air", "earth", "fire", "water", "healing", "plant", "weather", "divination"]), minor: new Set(["divination"]) },
  paladin: { only: new Set(["combat", "divination", "healing", "protection"]) },
  ranger: { only: new Set(["plant", "animal"]) },
};
export function priestSpellAllowed(sphere, level, caster) {
  const access = caster.key === "paladin" ? SPHERE_ACCESS.paladin : caster.key === "ranger" ? SPHERE_ACCESS.ranger : caster.words.includes("cleric") ? SPHERE_ACCESS.cleric : caster.words.includes("druid") ? SPHERE_ACCESS.druid : null;
  if (!access) return true;
  const parts = lower(sphere)
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => !SPHERES.has(part))) return false;
  return parts.some((part) => !access.barred?.has(part) && (!access.only || access.only.has(part)) && !(access.minor?.has(part) && level > 3));
}
export function wizardSpellAllowed(school, caster) {
  const s = lower(school);
  if (s.includes("wild magic") && !caster.words.includes("wild")) return false;
  const key = specialistKey(caster);
  if (!key) return true;
  if (s.split(/[,/]/).length >= 8) return true;
  return !OPPOSED[key].some((opp) => s.includes(opp));
}
// The books' spells for a caster: a priest's carry a sphere, a wizard's none.
export function spellCatalog(spells, caster) {
  if (!caster) return [];
  const divine = caster.key !== "wizard" && caster.key !== "bard";
  const top = maxSpellLevel(caster);
  const seen = new Set();
  const out = [];
  for (const row of spells) {
    const level = num(row?.level, 0);
    if (level < 1 || level > top) continue;
    const sphere = String(row.sphere ?? "").trim();
    const isDivine = sphere !== "";
    if (isDivine !== divine) continue;
    if (isDivine ? !priestSpellAllowed(sphere, level, caster) : !wizardSpellAllowed(String(row.school ?? ""), caster)) continue;
    const name = String(row.name ?? "").trim();
    if (!name || seen.has(lower(name))) continue;
    seen.add(lower(name));
    out.push({ name, level, school: isDivine ? sphere : String(row.school ?? "").trim(), data: row });
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
export const ordinal = (n) => ["1st", "2nd", "3rd"][n - 1] ?? `${n}th`;
export function spellGuidance(caster, wisdom) {
  const top = maxSpellLevel(caster);
  if (!caster || top <= 0) return "";
  const lines = [`${caster.label}, level ${caster.level}: ${Array.from({ length: top }, (_, i) => `${spellSlots(caster, i + 1, wisdom)} of ${ordinal(i + 1)} level`).join(", ")}.`];
  if (caster.key === "wizard") {
    const key = specialistKey(caster);
    lines.push(key ? `Specialist: one extra spell of each level (counted above); no ${OPPOSED_TEXT[key]} spells.` : "Every school of magic; Wild Magic spells are for wild mages.");
  } else if (caster.key === "bard") lines.push("Wizard spells of any school (a bard never specializes).");
  else if (caster.key === "paladin") lines.push("Priest spells of the combat, divination, healing and protection spheres; no bonus spells for Wisdom.");
  else if (caster.key === "ranger") lines.push("Priest spells of the plant and animal spheres; no bonus spells for Wisdom.");
  else {
    if (caster.words.includes("cleric")) lines.push("Every sphere but plant, animal and weather; elemental spells up to 3rd level.");
    else if (caster.words.includes("druid")) lines.push("Spheres all, animal, elemental, healing, plant and weather; divination up to 3rd level.");
    if (num(wisdom, 0) >= 13) lines.push(`Wisdom ${wisdom} bonus spells are counted above.`);
  }
  return lines.join(" ");
}

// --- The shop -------------------------------------------------------------------
// A price in copper ("5 gp", "2 sp", "10 cp", "1 pp"; no unit: gp); null without a number.
export function costCp(cost) {
  const s = lower(cost).replace(/,/g, "");
  const match = /([\d.]+)/.exec(s);
  if (!match) return null;
  const n = Number(match[1]);
  const per = s.includes("pp") ? 500 : s.includes("ep") ? 50 : s.includes("sp") ? 10 : s.includes("cp") ? 1 : 100;
  return Math.round(n * per);
}
export const copperText = (cp) => {
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  return [gp ? `${gp} gp` : "", sp ? `${sp} sp` : "", c ? `${c} cp` : ""].filter(Boolean).join(" ") || "0 cp";
};
// Magic items are never starting gear.
export function isMagicItem(item) {
  const sub = lower(item?.subtype);
  const rarity = lower(item?.rarity);
  if (sub === "magic" || rarity.includes("rare") || rarity.includes("legend") || rarity.includes("artifact")) return true;
  if (num(item?.bonus, 0) !== 0) return true;
  return item?.isidentified !== undefined && num(item.isidentified, 1) === 0;
}
const ammoLauncher = (name) => {
  const s = lower(name);
  if (s.includes("arrow")) return "bow";
  if (s.includes("quarrel") || s.includes("bolt")) return "crossbow";
  if (s.includes("sling bullet") || s.includes("sling stone")) return "sling";
  if (s.includes("needle")) return "blowgun";
  return null;
};
// A cleric's weapons: any whose damage includes bludgeoning.
function isBludgeoning(item, name) {
  const types = [String(item?.dtype ?? "")];
  for (const weapon of Object.values(item?.weaponlist ?? {})) for (const damage of Object.values(weapon?.damagelist ?? {})) types.push(String(damage?.type ?? ""));
  if (!item?.weaponlist && item?.damage) types.push(String(item.damage).replace(/\d*d\d+([+-]\d+)?/g, " "));
  let typed = false;
  for (const type of types)
    for (const token of lower(type).match(/[a-z]+/g) ?? []) {
      if (token === "b" || token.startsWith("blud")) return true;
      if (token === "p" || token === "s" || token.startsWith("pier") || token.startsWith("slas")) typed = true;
    }
  if (typed || lower(name).includes("spike")) return false;
  return ["club", "mace", "hammer", "staff", "sling", "flail", "morning star", "bludgeon"].some((word) => weaponNameMatches(name, word));
}
export function shopWeaponAllowed(name, item, build) {
  const rule = kitWeaponRule(build.kit) ?? {};
  if (rule.any || matchesAny(name, rule.add)) return true;
  if ((rule.required ?? []).some((group) => matchesAny(name, group))) return true;
  if (rule.cleric || (!rule.class && activeClassWords(build).includes("cleric"))) return isBludgeoning(item, name);
  const allow = allowedWeaponKeywords(build);
  if (!allow) return true;
  const s = lower(name).replace(/[^a-z0-9 ]/g, "");
  const tight = s.replace(/ /g, "");
  return allow.some((keyword) => s.includes(keyword) || tight.includes(keyword.replace(/ /g, "")));
}
export function shopArmorAllowed(group, name, subtype, ac) {
  const s = lower(name);
  const shield = lower(subtype).includes("shield") || s.includes("shield") || s.includes("buckler");
  if (group === "wizard") return false;
  if (group === "warrior" || group === "priest") return true;
  if (group === "druid") return shield ? s.includes("small") || s.includes("buckler") || s.includes("wood") : s.includes("leather") && !s.includes("studded");
  if (group === "rogue") return !shield && (s.includes("leather") || s.includes("padded") || s.includes("elven chain"));
  if (group === "bard") return !shield && (num(ac, 10) >= 5 || s.includes("elven chain"));
  return true;
}
const SHOP_GEAR = new Set(["other", "container", "equipment packs", "tool", "provisions", "clothing", "adventuring gear", ""]);
export function shopGearAllowed(group, name, subtype) {
  const sub = lower(subtype);
  if (!SHOP_GEAR.has(sub)) return false;
  const s = lower(name);
  if (sub === "provisions" && !s.includes("ration")) return false;
  if (s.includes("mage") || /spell ?book/.test(s)) return group === "wizard";
  if (s.includes("priest")) return group === "priest" || group === "druid";
  if (s.includes("thie")) return group === "rogue" || group === "bard";
  return true;
}
// Everyday gear from the Player's Handbook, the class's own Complete handbook,
// the race's Complete Book, The Drowned Archive and the campaign's own items.
const GEAR_BOOKS = ["bard", "thief", "ranger", "paladin", "fighter", "priest", "wizard", "druid", "barbarian", "necromancer"];
function gearBookAllowed(book, words, raceBook) {
  const m = lower(book);
  if (!m || m.includes("players handbook") || m.includes("player's handbook") || m.includes("drowned archive") || m === lower(raceBook)) return true;
  return GEAR_BOOKS.some((word) => m.includes(word) && words.includes(word));
}
const RACE_BOOK_WORDS = ["book of dwarves", "book of elves", "gnomes and halflings", "book of humanoids"];
const raceBookItemAllowed = (book, raceBook) => {
  const m = lower(book);
  const word = RACE_BOOK_WORDS.find((entry) => m.includes(entry));
  return word ? m === lower(raceBook) : true;
};
export const SHOP_TYPES = ["Armor", "Weapons", "Ammunition", "Gear"];
// Kraken's own 2E weapons, armor, shields and ammunition, priced, for what the books do not have.
export function krakenItems() {
  return [...WEAPONS.map(([name]) => name), ...ARMOR.map(([name]) => name), ...SHIELDS.map(([name]) => name), ...AMMO.map(([name]) => name)].map((name) => makeItem(name)).filter(Boolean);
}
const sortedWords = (name) =>
  lower(name)
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.replace(/s$/, ""))
    .sort()
    .join(" ");
// The shop: the books' mundane, priced items the class may use (its weapons,
// the armor it may wear, ammunition for its launchers, everyday gear), then
// Kraken's weapons and armor the books do not sell. [{name, cost, cp, cat, item, book}]
export function starterCatalog(items, build) {
  const words = classWords(build);
  const group = profGroup(words);
  const raceBook = build.raceBook ?? "";
  const out = [];
  const seen = new Set();
  const consider = (item, book) => {
    const name = String(item?.name ?? "").trim();
    const cost = String(item?.cost ?? "").trim();
    const cp = costCp(cost);
    const type = lower(item?.type).trim();
    const sub = lower(item?.subtype).trim();
    if (!name || !cp || cp <= 0 || seen.has(lower(name)) || seen.has(sortedWords(name)) || /[+-]\s*\d/.test(name) || isMagicItem(item) || !raceBookItemAllowed(book, raceBook)) return;
    let cat = "";
    let ok = false;
    const launcher = ammoLauncher(name);
    if (type === "magic") ok = false;
    else if (launcher && (type === "ammunition" || sub === "ammunition")) {
      cat = "Ammunition";
      ok = shopWeaponAllowed(launcher, null, build);
    } else if (type === "weapon" && /scabbard|sheath|baldric/i.test(name)) {
      cat = "Gear";
      ok = shopGearAllowed(group, name, sub);
    } else if (type === "weapon") {
      cat = "Weapons";
      ok = shopWeaponAllowed(name, item, build);
    } else if (type === "armor") {
      cat = "Armor";
      ok = shopArmorAllowed(group, name, sub, num(item.ac, 10));
    } else if (type === "gear" || type === "adventuring gear") {
      cat = "Gear";
      ok = shopGearAllowed(group, name, sub) && gearBookAllowed(book, words, raceBook);
    }
    if (!ok) return;
    seen.add(lower(name));
    seen.add(sortedWords(name));
    out.push({ name, cost, cp, cat, item, book });
  };
  for (const item of items) consider(item, bookOf(item));
  for (const item of krakenItems()) consider(item, "");
  return out.sort((a, b) => SHOP_TYPES.indexOf(a.cat) - SHOP_TYPES.indexOf(b.cat) || a.name.localeCompare(b.name));
}

// --- Character details: the extension's random tables (its own words) -------
const AGE = { human: [[15, 1, 4], [90, 2, 20]], dwarf: [[40, 5, 6], [325, 1, 100]], elf: [[100, 5, 6], [600, 2, 100]], gnome: [[60, 3, 12], [300, 1, 100]], "half-elf": [[20, 1, 6], [160, 2, 20]], halfling: [[20, 3, 4], [100, 2, 20]], "half-orc": [[13, 1, 4], [60, 2, 10]] };
const SIZE = { human: "M", elf: "M", "half-elf": "M", "half-orc": "M", dwarf: "M", gnome: "S", halfling: "S" };
const BODY = {
  human: { male: [[60, 2, 10], [140, 6, 10]], female: [[59, 2, 8], [100, 6, 8]] },
  dwarf: { male: [[43, 1, 8], [130, 4, 10]], female: [[41, 1, 8], [105, 4, 8]] },
  elf: { male: [[55, 2, 8], [85, 3, 10]], female: [[54, 2, 6], [70, 3, 8]] },
  gnome: { male: [[38, 1, 6], [72, 5, 4]], female: [[36, 1, 6], [65, 5, 4]] },
  "half-elf": { male: [[60, 2, 10], [110, 4, 10]], female: [[58, 2, 8], [90, 4, 8]] },
  halfling: { male: [[32, 2, 6], [52, 5, 3]], female: [[30, 2, 6], [48, 5, 3]] },
  "half-orc": { male: [[62, 2, 10], [150, 6, 10]], female: [[60, 2, 8], [120, 6, 8]] },
};
export const BIO_TABLES = {
  gender: ["Male", "Female"],
  deity: ["Pelor", "St. Cuthbert", "Heironeous", "Hextor", "Boccob", "Wee Jas", "Nerull", "Kord", "Olidammara", "Fharlanghn", "Pholtus", "Obad-Hai", "Ehlonna", "Rao", "Trithereon", "Erythnul", "Vecna", "Zilchus", "Istus", "Beory", "Corellon Larethian", "Moradin", "Yondalla", "Garl Glittergold", "Ulaa"],
  personalitytraits: ["Quick to laugh, slow to anger.", "Speaks bluntly, with little patience for flattery.", "Endlessly curious about anything new.", "Calm and deliberate, never rushes a decision.", "Boastful, certain of their own importance.", "Quiet and watchful; misses nothing.", "Fiercely loyal once your trust is earned.", "Restless - happiest on the move.", "Wry humor, especially in danger.", "Generous to a fault with friends and strangers alike.", "Suspicious of magic and those who wield it.", "Honor-bound; a promise given is a promise kept.", "Hot-headed and itching for a fight.", "Soft-spoken but absolutely immovable when resolved.", "Collects stories and trinkets from every road."],
  ideals: ["Freedom. Chains of any kind must be broken.", "Honor. My word is the truest coin I carry.", "Knowledge. The world rewards those who understand it.", "Power. Strength decides who shapes the future.", "Faith. My god's will is my compass.", "Glory. I will be remembered in song.", "Order. Law and tradition keep the dark at bay.", "Mercy. The strong protect the weak.", "Greed. Coin and comfort are their own reward.", "Nature. The wild is wiser than any throne.", "Redemption. I have wrongs to set right.", "Self-reliance. Trust your own hands above all."],
  bonds: ["Sworn to protect a younger sibling left behind.", "Indebted to a mentor who vanished without a trace.", "Carries a keepsake from a lost love.", "Owes a life-debt to a stranger met on the road.", "Loyal to a mercenary company or guild.", "Seeks a rival who bested them years ago.", "Guards a secret entrusted by a dying friend.", "Devoted to restoring a fallen family name.", "Bound to a homeland they may never see again.", "Watches over an orphan or apprentice.", "Hunts the band that destroyed their village.", "Honors a pact made with a strange patron."],
  flaws: ["Cannot resist a wager, however foolish.", "Holds grudges far longer than is wise.", "Trusts too easily and is often deceived.", "Drinks to forget, then forgets to stop.", "Pride blinds them to good counsel.", "Terrified of a particular creature or place.", "Greed overrides caution near treasure.", "Speaks first and thinks much, much later.", "Secretly a coward when truly alone.", "Owes money to dangerous people.", "Cannot abide authority of any kind.", "Haunted by a past failure they hide from all."],
  appearance: ["Weathered and scarred, with a steady gaze.", "Travel-worn clothes kept scrupulously clean.", "A crooked smile and laughing eyes.", "Tall and gaunt, moving with quiet economy.", "Broad-shouldered, with calloused, capable hands.", "A faded tattoo hints at an old allegiance.", "Bright, mismatched garments and too much jewelry.", "Plain features easily lost in a crowd.", "A notable scar across the brow or cheek.", "Close-cropped hair and a soldier's bearing.", "Long braided hair threaded with small charms.", "Eyes of an unusual, arresting color."],
};
export const BIO_FIELDS = ["gender", "age", "agemax", "height", "weight", "size", "deity", "personalitytraits", "ideals", "bonds", "flaws", "appearance", "notes"];
export const sizeOf = (race) => SIZE[bioRace(race)] ?? "M";
const genderKey = (gender) => (/female|^f$/i.test(String(gender ?? "").trim()) ? "female" : "male");
// The dice a detail is rolled with: {base, formula}; a table pick is 1dN.
export function bioRoll(field, race, gender) {
  const r = bioRace(race);
  const dice = ([base, count, sides]) => ({ base, formula: `${count}d${sides}` });
  if (field === "age") return dice((AGE[r] ?? AGE.human)[0]);
  if (field === "agemax") return dice((AGE[r] ?? AGE.human)[1]);
  if (field === "height") return dice((BODY[r] ?? BODY.human)[genderKey(gender)][0]);
  if (field === "weight") return dice((BODY[r] ?? BODY.human)[genderKey(gender)][1]);
  if (BIO_TABLES[field]) return { base: 0, formula: `1d${BIO_TABLES[field].length}`, table: BIO_TABLES[field] };
  return null;
}
// A rolled total as the detail's text (a table's entry; height in feet and inches).
export function bioValue(field, total) {
  if (BIO_TABLES[field]) return BIO_TABLES[field][Math.max(0, Math.min(BIO_TABLES[field].length - 1, total - 1))];
  if (field === "height") return `${Math.floor(total / 12)}' ${total % 12}"`;
  if (field === "weight") return `${total} lbs`;
  return String(total);
}
