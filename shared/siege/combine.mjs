// Combining classes in Castles & Crusades (the Adventurer's Backpack), as the
// GM's FG Character Wizard does it (CCClassRules and CCCombine):
// - multi-class: two classes from 1st level, rising together; XP needed is
//   the two classes' added; the hit die from the Multi-Class Hit Die table;
// - enhanced class: a principal class and a supporting class (or sub-class)
//   counting as half its level (a fighter two thirds), adding its own XP;
// - class plus: another class's zero-level abilities, 5% of experience each;
// - dual class (at a level up): a second class at 1st level, experience
//   split between the two; hit points only when the original class rises;
// - reclass (at a level up): the old class abandoned and a level lost (two
//   leaving a deity's service); the new class gets fixed hit points until it
//   passes the old one.
// Packages carry FG's markers: ccmulti, ccprincipal, ccsupport (the option
// key), ccdualorigin / ccdualclass + ccdualbase, ccreclassorigin / ccreclass
// + ccreclassbase; character.ccplus.<classkey> = { name, text, abilities }.

import COMBO from "./classcombo.mjs";

export { COMBO };
export const DIE_STEP = { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 };
const DEITY = new Set(["cleric", "druid", "paladin"]);
const RACE_CLASS = /^(dwarf|elf|halfling|gnome)\b/i;
export const ALIGNMENTS = ["Lawful Good", "Lawful Neutral", "Lawful Evil", "Neutral Good", "Neutral", "Neutral Evil", "Chaotic Good", "Chaotic Neutral", "Chaotic Evil"];

// CCClassRules.key: "Arcane Thief" -> arcanethief, "Bard (Spell Caster)" -> bard.
export const classKey = (name) => String(name ?? "").toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/[^a-z]/g, "");
export function raceKey(race) {
  const text = String(race ?? "").toLowerCase();
  if (/half[- ]elf/.test(text)) return "halfelf";
  if (/half[- ]orc/.test(text)) return "halforc";
  return classKey(text);
}
export const isRaceClass = (name) => RACE_CLASS.test(String(name ?? "").trim());
const RACE_CLASS_MESSAGE = "A race class combines with no other class (Adventurer's Backpack).";
export const dieOf = (pkg) => /d\d+/i.exec(String(pkg?.hitdie ?? ""))?.[0]?.toLowerCase() ?? "";

// CCClassRules.describeCode: a table code for this race.
export function describeCode(code, race) {
  const text = String(code ?? "");
  if (!text) return { code: "", words: "No table entry: the Castle Keeper decides.", allowed: true };
  if (text === "x") return { code: text, words: "Same class.", allowed: false };
  const rk = raceKey(race);
  const raceFits = (text.includes("E") && (rk === "elf" || rk === "halfelf")) || (text.includes("G") && rk === "gnome") || (text.includes("H") && rk === "halfling") || (text.includes("O") && rk === "halforc");
  if (text.includes("A") || raceFits) return { code: text, words: "Allowed.", allowed: true };
  if (text.includes("S")) return { code: text, words: "Allowed, but the two classes share abilities (impractical).", allowed: true };
  if (text.includes("U")) return { code: text, words: "Unusual: needs the Castle Keeper's agreement and a good reason.", allowed: true };
  if (/[EGHO]/.test(text)) {
    const names = { E: "elf/half-elf ", G: "gnome ", H: "halfling ", O: "half-orc " };
    const which = [...text].filter((letter) => names[letter]).map((letter) => names[letter]).join("").trim();
    return { code: text, words: `Only for some races (${which}).`, allowed: false };
  }
  return { code: text, words: "Not allowed (Adventurer's Backpack).", allowed: false };
}

// Multi-class and dual class (the same table): a first, b second.
export function multiRule(a, b, race) {
  if (isRaceClass(a) || isRaceClass(b)) return { code: "", words: RACE_CLASS_MESSAGE, allowed: false };
  const ka = classKey(a);
  const kb = classKey(b);
  if (ka === kb) return { code: "x", words: "Same class.", allowed: false };
  return describeCode(COMBO.MULTI[ka]?.[kb] ?? COMBO.MULTI[kb]?.[ka], race);
}

// Enhanced class: a supporting option for a principal class.
export function enhancedRule(principal, option, race) {
  if (isRaceClass(principal)) return { code: "", words: RACE_CLASS_MESSAGE, allowed: false };
  const key = classKey(option);
  const support = COMBO.SUPPORT[key];
  if (!support) return { code: "", words: "Not a supporting class.", allowed: false };
  if (support.class === classKey(principal)) return { code: "x", words: "Same class.", allowed: false };
  return describeCode(COMBO.ENHANCED[key]?.[classKey(principal)], race);
}

export const supportOptions = () =>
  Object.entries(COMBO.SUPPORT)
    .filter(([key]) => key !== "paladin" && key !== "divineknight")
    .map(([key, row]) => ({ key, name: row.name, class: row.class, sub: Boolean(row.sub), prime: row.prime ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
export const plusText = (name) => COMBO.PLUS[classKey(name)] || null;
export const canPlus = (name) => typeof COMBO.PLUS[classKey(name)] === "string" && !isRaceClass(name);

// Hit dice: the Multi-Class table (highest with lowest) and the Enhanced table.
export function multiDie(dice) {
  const known = dice.map((die) => String(die).toLowerCase()).filter((die) => DIE_STEP[die]);
  if (known.length === 0) return "";
  known.sort((a, b) => DIE_STEP[a] - DIE_STEP[b]);
  return COMBO.HD_MULTI[known.at(-1)]?.[known[0]] ?? "";
}
export const enhancedDie = (supportDie, principalDie) => COMBO.HD_ENHANCED[String(supportDie).toLowerCase()]?.[String(principalDie).toLowerCase()] ?? "";

// The supporting class's level: a fighter two thirds of the principal's, the rest half.
export function supportLevel(optionKey, level) {
  const support = COMBO.SUPPORT[optionKey];
  const fighter = optionKey === "fighter" && !support?.sub;
  return Math.max(1, Math.floor(fighter ? (level * 2) / 3 : level / 2));
}
// The option's own prime, else its class's first prime.
export function supportPrime(optionKey, classRecord) {
  const own = COMBO.SUPPORT[optionKey]?.prime;
  if (own) return own;
  return Object.entries(classRecord?.primes ?? {}).find(([, on]) => Number(on) === 1)?.[0] ?? "";
}
// A sub-class keeps only the abilities it names.
const bare = (text) => String(text ?? "").toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/\./g, "").trim();
export function isSupportAbility(optionKey, abilityName) {
  const support = COMBO.SUPPORT[optionKey];
  if (!support) return true;
  if (!support.sub) return true;
  const name = bare(abilityName);
  return String(support.abilities ?? "").split(",").map(bare).filter(Boolean).some((want) => want === name || name.includes(want) || want.includes(name));
}

// Class plus: 5% of all experience earned per plussed class.
export const plusXP = (xp, count) => (count > 0 && xp > 0 ? Math.ceil(xp / (1 - 0.05 * count)) : xp);

// A package's experience for a level: its row, else its published continuation.
export function packageXP(pkg, level) {
  const row = Object.values(pkg?.levels ?? {}).find((item) => item && Number(item.level) === level);
  if (row) return Number(row.xp) || 0;
  const from = Number(pkg?.xpcontinuationfrom) || 0;
  const base = Number(pkg?.xpcontinuationbase) || 0;
  const rate = Number(pkg?.xpcontinuationrate) || 0;
  if (from > 0 && base > 0 && rate > 0 && level >= from) return base + (level - from + 1) * rate;
  return 0;
}
const exactXP = (pkg, level) => Number(Object.values(pkg?.levels ?? {}).find((item) => item && Number(item.level) === level)?.xp) || 0;

// The experience a combined character starts with at level n.
export function startXP({ main, multi, supportKey, plusCount = 0 }, level) {
  if (level <= 1) return 0;
  let xp = exactXP(main, level) + (multi ? exactXP(multi, level) : 0) + (supportKey ? Number(COMBO.SUPPORT[supportKey]?.adv?.[String(level)]?.xp) || 0 : 0);
  return plusXP(xp, plusCount);
}

const hasLevels = (pkg) => pkg && typeof pkg === "object" && Object.values(pkg.levels ?? {}).some((row) => row && typeof row === "object");
export const classPackages = (character) =>
  Object.entries(character.packages ?? {})
    .filter(([, pkg]) => hasLevels(pkg))
    .sort(([a], [b]) => a.localeCompare(b));
export const isCombined = (character) => classPackages(character).some(([, pkg]) => pkg.ccmulti || pkg.ccprincipal || pkg.ccsupport || pkg.ccdualclass || pkg.ccreclass) || Object.keys(character.ccplus ?? {}).length > 0;

// CCCombine.getNextXP: the experience the next level needs, and why; null when nothing is combined.
export function nextXP(character) {
  const classes = classPackages(character).map(([, pkg]) => pkg);
  const lvl = (pkg) => Number(pkg.level) || 1;
  const plus = Object.keys(character.ccplus ?? {}).length;
  let result = null;
  const principal = classes.find((pkg) => pkg.ccprincipal);
  const support = classes.find((pkg) => pkg.ccsupport);
  const multis = classes.filter((pkg) => pkg.ccmulti);
  const reclass = classes.find((pkg) => pkg.ccreclass);
  const dual = classes.find((pkg) => pkg.ccdualclass);
  if (principal && support) {
    const n = lvl(principal) + 1;
    const option = COMBO.SUPPORT[support.ccsupport];
    result = { next: packageXP(principal, n) + (Number(option?.adv?.[String(n)]?.xp) || 0), source: `${principal.name} ${n} (with ${option?.name ?? support.name})` };
  } else if (multis.length >= 2) {
    result = { next: multis.reduce((sum, pkg) => sum + packageXP(pkg, lvl(pkg) + 1), 0), source: `${multis.map((pkg) => pkg.name).join("/")} ${lvl(multis[0]) + 1}` };
  } else if (reclass) {
    const n = lvl(reclass) + 1;
    result = { next: (Number(reclass.ccreclassbase) || 0) + packageXP(reclass, n), source: `${reclass.name} ${n}` };
  } else if (dual) {
    const base = Number(dual.ccdualbase) || 0;
    for (const pkg of classes) {
      const n = lvl(pkg) + 1;
      const need = packageXP(pkg, n);
      if (need <= 0) continue;
      const had = pkg === dual ? 0 : base;
      const xp = base + 2 * Math.max(need - had, 0);
      if (!result || xp < result.next) result = { next: xp, source: `${pkg.name} ${n} (experience split between the classes)` };
    }
  }
  if (plus > 0) {
    if (!result) {
      for (const pkg of classes) {
        const n = lvl(pkg) + 1;
        const xp = packageXP(pkg, n);
        if (xp > 0 && (!result || xp < result.next)) result = { next: xp, source: `${pkg.name} ${n}` };
      }
    }
    if (result) result = { next: plusXP(result.next, plus), source: `${result.source} (class plus: ${5 * plus}% of experience)` };
  }
  return result;
}

// A dual-classed character's experience in each class.
export function dualClassXP(character, pkg) {
  const dual = classPackages(character).map(([, item]) => item).find((item) => item.ccdualclass);
  const base = Number(dual?.ccdualbase) || 0;
  const since = Math.floor(Math.max((Number(character.exp) || 0) - base, 0) / 2);
  return pkg === dual ? since : base + since;
}

export function trainingNote(exp, newClass) {
  const cost = Math.max(Math.floor((Number(exp) || 0) * 0.05), 2500);
  const key = classKey(newClass);
  return `Training first (Adventurer's Backpack): with an instructor, ${cost} XP to reach zero level in the new class and ${cost} more to reach 1st level; without one, double (${2 * cost} and ${2 * cost}).${key === "wizard" || key === "illusionist" ? " A wizard or illusionist needs an instructor." : ""} Level Up here is for when the character reaches 1st level.`;
}

// CCClassRules.isAlignmentAllowed, with the text FG shows.
const ALIGN = {
  paladin: ["Lawful good", (l, m) => l === "lawful" && m === "good"],
  assassin: ["Any non-good", (l, m) => m !== "good"],
  druid: ["Neutral (any)", (l, m) => l === "neutral" || m === "neutral"],
  foresworn: ["Neutral, Neutral/Good, Neutral/Evil", (l) => l === "neutral"],
  primaldruid: ["Chaos/Neutral, Neutral, Law/Neutral", (l, m) => m === "neutral"],
  skald: ["Neutral or any Chaotic", (l, m) => l === "chaotic" || (l === "neutral" && m === "neutral")],
  thief: ["Any Neutral or Evil", (l, m) => l === "neutral" || m === "neutral" || m === "evil"],
  warlock: ["Any Chaotic", (l) => l === "chaotic"],
  elfmagi: ["Good/Neutral or Chaotic", (l, m) => l === "chaotic" || (l === "neutral" && m === "good")],
  gnomeprimeval: ["Neutral", (l, m) => l === "neutral" && m === "neutral"],
};
function axes(alignment) {
  const text = String(alignment ?? "").trim().toLowerCase();
  if (text === "neutral" || text === "true neutral") return ["neutral", "neutral"];
  const words = text.split(/\s+/);
  return [words[0], words.at(-1)];
}
export function alignmentAllowed(className, alignment) {
  const rule = ALIGN[classKey(className)];
  if (!rule) return true;
  const [l, m] = axes(alignment);
  return rule[1](l, m);
}
export const alignmentText = (className) => ALIGN[classKey(className)]?.[0] ?? "Any";

// The reclass rules: levels lost and the fixed hit points per level.
export const reclassLoss = (oldName, newName) => (DEITY.has(classKey(String(oldName).split(/\s+/)[0])) && !DEITY.has(classKey(String(newName).split(/\s+/)[0])) ? 2 : 1);
export const reclassStep = (oldDie, newDie) => (DIE_STEP[newDie] ?? 0) - (DIE_STEP[oldDie] ?? 0);

// Class plus: the plussed class's level-1 abilities its text names, and the note row.
export function plusAbilities(classRecord) {
  const key = classKey(classRecord?.name);
  const text = String(COMBO.PLUS[key] || "");
  const lower = text.toLowerCase();
  const rows = {};
  let n = 1;
  for (const ability of Object.values(classRecord?.abilities ?? {})) {
    if (!ability || typeof ability !== "object" || (Number(ability.level) || 1) > 1) continue;
    const name = bare(ability.name);
    if (!name || !lower.includes(name)) continue;
    rows[`id-${String(n++).padStart(5, "0")}`] = { name: ability.name, sourcename: `${classRecord.name} (class plus)`, text: ability.text ?? "", stat: ability.stat ?? "", addlevel: 0, level: 0, ccplus: key, displayname: `${ability.name} (${classRecord.name} plus, 0 level)` };
  }
  rows[`id-${String(n++).padStart(5, "0")}`] = { name: `Class Plus: ${classRecord.name}`, displayname: `Class Plus: ${classRecord.name}`, sourcename: `${classRecord.name} (class plus)`, addlevel: 0, level: 0, ccplus: key, text: `<p>${text}. These abilities never improve past zero level; the character's level is not added to their checks. Each plussed class costs 5% of all experience earned (Adventurer's Backpack).</p>` };
  return { name: classRecord.name, text, abilities: rows };
}

// Class plus 0-level spells: "may cast two 0 level wizard spells per day".
export function plusSlots(character) {
  const pools = {};
  for (const plus of Object.values(character.ccplus ?? {})) {
    const match = /two 0 level ([a-z ]+?) spells per day/i.exec(String(plus?.text ?? ""));
    if (match) pools[match[1].replace(/[^A-Za-z0-9_]/g, "").toLowerCase()] = 2;
  }
  return pools;
}
