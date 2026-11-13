// D&D 3.5 Edition, from the System Reference Document 3.5 (Open Game
// License): Kraken's D&D 3.5E ruleset. Plain functions (no Node, no DOM), used
// by the host (building, checks, combat) and by the 3.5E sheet. FG's 3.5E
// ruleset is the model for how it plays:
//   ability modifier (score - 10) / 2, rounded down;
//   base attack bonus by class (good = level, average = 3/4, poor = 1/2), and
//   an extra attack at -5 for each 5 of it above +1 (+6/+1, +11/+6/+1);
//   saves by class (good 2 + level/2, poor level/3) + Con / Dex / Wis;
//   Armor Class 10 + armor + shield + Dex (to the armor's maximum) + size +
//   natural + deflection + dodge; touch (no armor, shield or natural) and
//   flat-footed (no Dex or dodge);
//   an attack is d20 + bonus against AC (a natural 20 always hits, a natural
//   1 always misses); a roll in the weapon's threat range threatens a
//   critical, confirmed by a second attack roll that hits: the damage is
//   rolled as many times as the weapon's multiplier (19-20/x2, x3);
//   skills d20 + ranks + ability + misc (class skills up to level + 3 ranks,
//   others half), armor check penalty on Str and Dex skills;
//   at 0 hit points disabled, -1 to -9 dying (1 lost a round, 10% to
//   stabilize), dead at -10.
//
// A 3.5E character's record data keeps the keys the core reads (hp {total,
// wounds}, ac {total}, level, exp, expnext, coins, inventorylist, packages:
// its race and classes as packagetype Race / Class), and its own: ruleset
// "dnd35", race, size, classes [{name, level, hitdie, bab, fort, ref, will,
// skillranks, classskills}], abilities {stat: {score, bonus}}, bab, grapple,
// saves {fortitude|reflex|will: {base, ability, misc, total}}, initiative
// {misc, total}, skills {key: {name, ability, ranks, misc, total, classskill,
// trained, acp}}, feats [names], features [{name, level, class}], attacks
// {key: {name, item, bonuses [..], damage, crit {range, mult}, type,
// dmgtype}}, spellcasting {class, stat, dc, perday [..], used [..]}, spells
// [names], speed.

import { automaticLanguages, choiceFeatures, classKeyOf, knownRace, maxSpellLevelFor, PREPARED_CASTERS, raceLevelAdjustment, raceMods, alignmentCode, spellLevelForClass, spellSchool, COMBAT_STYLES } from "./wizard.mjs";
import { coinsOf } from "../shop.mjs";

export const RULESET = "dnd35";
export const RULESET_NAME = "D&D 3.5E";
export const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
export const SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const BY_SHORT = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
export const SAVES = { fortitude: "constitution", reflex: "dexterity", will: "wisdom" };
export const SAVE_NAMES = { fortitude: "Fortitude", reflex: "Reflex", will: "Will" };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const MAX_LEVEL = 20;

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const rows = (value) => Object.entries(value && typeof value === "object" ? value : {}).filter(([, row]) => row && typeof row === "object");
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const mod = (score) => Math.floor((num(score, 10) - 10) / 2);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const titled = (word) => String(word ?? "").replace(/^\w/, (letter) => letter.toUpperCase());
export const isD35 = (thing) => (typeof thing === "string" ? thing === RULESET || thing === RULESET_NAME : thing?.ruleset === RULESET || thing?.data?.ruleset === RULESET);

// Experience for each level: level n needs n(n-1)/2 x 1,000.
export const xpFor = (level) => ((level - 1) * level * 1000) / 2;

// Base attack bonus and base saves by the class's progression.
export function babFor(kind, level) {
  const l = Math.max(0, Math.round(num(level, 0)));
  const k = String(kind ?? "").toLowerCase();
  if (/fast|good|full|high/.test(k)) return l;
  if (/medium|average|3\/4/.test(k)) return Math.floor((l * 3) / 4);
  return Math.floor(l / 2);
}
export function saveFor(kind, level) {
  const l = Math.max(0, Math.round(num(level, 0)));
  return /good|high|fast/i.test(String(kind ?? "")) ? 2 + Math.floor(l / 2) : Math.floor(l / 3);
}
// +16 is +16/+11/+6/+1: an extra attack at -5 for each 5 above +1, four at most.
export function iteratives(bab) {
  const out = [Math.round(num(bab, 0))];
  while (out.length < 4 && out[out.length - 1] - 5 >= 1) out.push(out[out.length - 1] - 5);
  return out;
}

// Size: the modifier to AC and attacks, and the special size modifier to grapple.
export const SIZES = {
  fine: { ac: 8, grapple: -16 },
  diminutive: { ac: 4, grapple: -12 },
  tiny: { ac: 2, grapple: -8 },
  small: { ac: 1, grapple: -4 },
  medium: { ac: 0, grapple: 0 },
  large: { ac: -1, grapple: 4 },
  huge: { ac: -2, grapple: 8 },
  gargantuan: { ac: -4, grapple: 12 },
  colossal: { ac: -8, grapple: 16 },
};
const sizeOf = (name) => SIZES[String(name ?? "medium").toLowerCase()] ?? SIZES.medium;

// The skills as the Player's Handbook lists them (a book's own skill
// records, when active, win: their ability, trained only and armor check).
export const SKILLS = {
  appraise: ["Appraise", "intelligence", 0, 0],
  balance: ["Balance", "dexterity", 0, 1],
  bluff: ["Bluff", "charisma", 0, 0],
  climb: ["Climb", "strength", 0, 1],
  concentration: ["Concentration", "constitution", 0, 0],
  craft: ["Craft", "intelligence", 0, 0],
  decipherscript: ["Decipher Script", "intelligence", 1, 0],
  diplomacy: ["Diplomacy", "charisma", 0, 0],
  disabledevice: ["Disable Device", "intelligence", 1, 0],
  disguise: ["Disguise", "charisma", 0, 0],
  escapeartist: ["Escape Artist", "dexterity", 0, 1],
  forgery: ["Forgery", "intelligence", 0, 0],
  gatherinformation: ["Gather Information", "charisma", 0, 0],
  handleanimal: ["Handle Animal", "charisma", 1, 0],
  heal: ["Heal", "wisdom", 0, 0],
  hide: ["Hide", "dexterity", 0, 1],
  intimidate: ["Intimidate", "charisma", 0, 0],
  jump: ["Jump", "strength", 0, 1],
  knowledgearcana: ["Knowledge (arcana)", "intelligence", 1, 0],
  knowledgedungeoneering: ["Knowledge (dungeoneering)", "intelligence", 1, 0],
  knowledgegeography: ["Knowledge (geography)", "intelligence", 1, 0],
  knowledgehistory: ["Knowledge (history)", "intelligence", 1, 0],
  knowledgelocal: ["Knowledge (local)", "intelligence", 1, 0],
  knowledgenature: ["Knowledge (nature)", "intelligence", 1, 0],
  knowledgenobility: ["Knowledge (nobility and royalty)", "intelligence", 1, 0],
  knowledgereligion: ["Knowledge (religion)", "intelligence", 1, 0],
  knowledgeplanes: ["Knowledge (the planes)", "intelligence", 1, 0],
  listen: ["Listen", "wisdom", 0, 0],
  movesilently: ["Move Silently", "dexterity", 0, 1],
  openlock: ["Open Lock", "dexterity", 1, 0],
  perform: ["Perform", "charisma", 0, 0],
  profession: ["Profession", "wisdom", 1, 0],
  ride: ["Ride", "dexterity", 0, 0],
  search: ["Search", "intelligence", 0, 0],
  sensemotive: ["Sense Motive", "wisdom", 0, 0],
  sleightofhand: ["Sleight of Hand", "dexterity", 1, 1],
  speaklanguage: ["Speak Language", "intelligence", 1, 0],
  spellcraft: ["Spellcraft", "intelligence", 1, 0],
  spot: ["Spot", "wisdom", 0, 0],
  survival: ["Survival", "wisdom", 0, 0],
  swim: ["Swim", "strength", 0, 2],
  tumble: ["Tumble", "dexterity", 1, 1],
  usemagicdevice: ["Use Magic Device", "charisma", 1, 0],
  userope: ["Use Rope", "dexterity", 0, 0],
};
export const skillKey = (name) => {
  const key = String(name ?? "").toLowerCase().replace(/\(([^)]*)\)/g, "$1").replace(/and royalty/, "").replace(/the planes/, "planes").replace(/[^a-z]/g, "");
  if (SKILLS[key]) return key;
  return Object.keys(SKILLS).find((known) => key.startsWith(known) && known.length > 4) ?? key;
};

// Spells per day by class level (the SRD's tables; index = spell level).
// null: none of that level; 0: only bonus spells from a high ability.
const FULL = [
  [3, 1], [4, 2], [4, 2, 1], [4, 3, 2], [4, 3, 2, 1], [4, 3, 3, 2], [4, 4, 3, 2, 1], [4, 4, 3, 3, 2], [4, 4, 4, 3, 2, 1], [4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 3, 2, 1], [4, 4, 4, 4, 3, 3, 2], [4, 4, 4, 4, 4, 3, 2, 1], [4, 4, 4, 4, 4, 3, 3, 2], [4, 4, 4, 4, 4, 4, 3, 2, 1], [4, 4, 4, 4, 4, 4, 3, 3, 2],
  [4, 4, 4, 4, 4, 4, 4, 3, 2, 1], [4, 4, 4, 4, 4, 4, 4, 3, 3, 2], [4, 4, 4, 4, 4, 4, 4, 4, 3, 3], [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
];
const DIVINE = FULL.map((row, index) => (index === 0 ? [3, 1] : index === 1 ? [4, 2] : row));
const SORCERER = [
  [5, 3], [6, 4], [6, 5], [6, 6, 3], [6, 6, 4], [6, 6, 5, 3], [6, 6, 6, 4], [6, 6, 6, 5, 3], [6, 6, 6, 6, 4], [6, 6, 6, 6, 5, 3],
  [6, 6, 6, 6, 6, 4], [6, 6, 6, 6, 6, 5, 3], [6, 6, 6, 6, 6, 6, 4], [6, 6, 6, 6, 6, 6, 5, 3], [6, 6, 6, 6, 6, 6, 6, 4], [6, 6, 6, 6, 6, 6, 6, 5, 3],
  [6, 6, 6, 6, 6, 6, 6, 6, 4], [6, 6, 6, 6, 6, 6, 6, 6, 5, 3], [6, 6, 6, 6, 6, 6, 6, 6, 6, 4], [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
];
const BARD = [
  [2], [3, 0], [3, 1], [3, 2, 0], [3, 3, 1], [3, 3, 2], [3, 3, 2, 0], [3, 3, 3, 1], [3, 3, 3, 2], [3, 3, 3, 2, 0],
  [3, 3, 3, 3, 1], [3, 3, 3, 3, 2], [3, 3, 3, 3, 2, 0], [4, 3, 3, 3, 3, 1], [4, 4, 3, 3, 3, 2], [4, 4, 4, 3, 3, 2, 0],
  [4, 4, 4, 4, 3, 3, 1], [4, 4, 4, 4, 4, 3, 2], [4, 4, 4, 4, 4, 4, 3], [4, 4, 4, 4, 4, 4, 4],
];
// Paladins and rangers: from 4th level, spells of 1st to 4th level (no 0-level).
const HALF = [
  [], [], [], [null, 0], [null, 0], [null, 1], [null, 1], [null, 1, 0], [null, 1, 0], [null, 1, 1],
  [null, 1, 1, 0], [null, 1, 1, 1], [null, 1, 1, 1], [null, 2, 1, 1, 0], [null, 2, 1, 1, 1], [null, 2, 2, 1, 1],
  [null, 2, 2, 2, 1], [null, 3, 2, 2, 1], [null, 3, 3, 3, 2], [null, 3, 3, 3, 3],
];
export const CASTERS = {
  wizard: { stat: "intelligence", table: FULL, arcane: true, prepares: true },
  sorcerer: { stat: "charisma", table: SORCERER, arcane: true, prepares: false },
  bard: { stat: "charisma", table: BARD, arcane: true, prepares: false },
  cleric: { stat: "wisdom", table: DIVINE, arcane: false, prepares: true, domain: true },
  druid: { stat: "wisdom", table: DIVINE, arcane: false, prepares: true },
  paladin: { stat: "wisdom", table: HALF, arcane: false, prepares: true },
  ranger: { stat: "wisdom", table: HALF, arcane: false, prepares: true },
};
const classKey = (name) => String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
// Bonus spells for a spell level from the casting ability's modifier.
export const bonusSpells = (abilityMod, spellLevel) => (spellLevel >= 1 && abilityMod >= spellLevel ? Math.floor((abilityMod - spellLevel) / 4) + 1 : 0);
// Spells per day for a class at a level, with bonus spells; a caster can cast
// spells of a level only with the ability at 10 + that level.
export function spellsPerDay(className, level, score) {
  const caster = CASTERS[classKey(className)];
  if (!caster) return [];
  const row = caster.table[Math.min(20, Math.max(1, Math.round(num(level, 1)))) - 1] ?? [];
  const abilityMod = mod(score);
  return row.map((base, spellLevel) => (base === null || base === undefined || num(score, 10) < 10 + spellLevel ? null : base + bonusSpells(abilityMod, spellLevel) + (caster.domain && spellLevel >= 1 ? 1 : 0)));
}

// A weapon's damage, critical and kind from its record (FG's 3.5E item: damage
// "1d8", critical "19-20/x2", properties "One-Handed Melee", subtype, range).
export function parseDamage(text) {
  const match = /(\d+)d(\d+)\s*([+-]\s*\d+)?/.exec(String(text ?? ""));
  if (!match) return null;
  return { count: Number(match[1]), die: Number(match[2]), bonus: match[3] ? Number(match[3].replace(/\s/g, "")) : 0 };
}
export function parseCritical(text) {
  const raw = String(text ?? "");
  const range = /(\d+)\s*[-–]\s*20/.exec(raw);
  const mult = /[x×]\s*(\d)/i.exec(raw);
  return { range: range ? Math.min(20, Math.max(2, Number(range[1]))) : 20, mult: mult ? Math.max(2, Number(mult[1])) : 2 };
}
export const isWeapon = (item) => /weapon/i.test(String(item?.type ?? "")) && Boolean(parseDamage(item?.damage));
export const isArmor = (item) => /armor/i.test(String(item?.type ?? "")) && !/shield/i.test(`${item?.subtype ?? ""} ${item?.name ?? ""}`);
export const isShield = (item) => /armor|shield/i.test(String(item?.type ?? "")) && /shield|buckler/i.test(`${item?.subtype ?? ""} ${item?.name ?? ""}`);
const worn = (item) => num(item?.carried, 1) === 2 || (num(item?.carried, 1) !== 0 && item?.equipped !== false && (isArmor(item) || isShield(item)));
export function weaponKind(item) {
  const words = `${item?.properties ?? ""} ${item?.subtype ?? ""}`.toLowerCase();
  const ranged = /ranged/.test(words) && !/melee/.test(words);
  return { ranged, thrown: /thrown/.test(words) || (/melee/.test(words) && num(item?.range, 0) > 0), twoHanded: /two-handed/.test(words), light: /light/.test(words) || /dagger|short ?sword|light/i.test(String(item?.name ?? "")) };
}

const hasFeat = (data, name) => (Array.isArray(data.feats) ? data.feats : []).some((feat) => String(feat).toLowerCase().startsWith(name.toLowerCase()));

// Armor Class: the total, touch and flat-footed, with each part.
export function armorClass(data) {
  const dex = num(data.abilities?.dexterity?.bonus, 0);
  let armor = 0;
  let shield = 0;
  let maxDex = 99;
  let acp = 0;
  let spellFailure = 0;
  for (const [, item] of rows(data.inventorylist)) {
    if (!worn(item)) continue;
    const bonus = num(item.ac, 0) + num(item.bonus, 0);
    if (isShield(item)) shield = Math.max(shield, bonus);
    else if (isArmor(item)) armor = Math.max(armor, bonus);
    else continue;
    if (item.maxstatbonus !== undefined && item.maxstatbonus !== "" && !isShield(item)) maxDex = Math.min(maxDex, num(item.maxstatbonus, 99));
    acp += Math.min(0, num(item.checkpenalty, 0));
    spellFailure += num(item.spellfailure, 0);
  }
  const keptDex = Math.min(dex, maxDex);
  const size = sizeOf(data.size).ac;
  const natural = num(data.ac?.natural, 0);
  const deflection = num(data.ac?.deflection, 0);
  const dodge = num(data.ac?.dodge, 0) + (hasFeat(data, "Dodge") ? 1 : 0);
  const misc = num(data.ac?.misc, 0);
  const total = 10 + armor + shield + keptDex + size + natural + deflection + dodge + misc;
  return {
    armor,
    shield,
    dex: keptDex,
    size,
    natural,
    deflection,
    dodge: num(data.ac?.dodge, 0),
    misc,
    total,
    touch: 10 + keptDex + size + deflection + dodge + misc,
    flatfooted: total - Math.max(0, keptDex) - dodge,
    maxdex: maxDex === 99 ? null : maxDex,
    acp,
    spellfailure: spellFailure,
  };
}

// A weapon's attack for a character: its bonuses (iteratives), damage, critical.
export function weaponAttack(data, item) {
  const damage = parseDamage(item.damage);
  if (!damage) return null;
  const kind = weaponKind(item);
  const str = num(data.abilities?.strength?.bonus, 0);
  const dex = num(data.abilities?.dexterity?.bonus, 0);
  const size = sizeOf(data.size).ac;
  const finesse = !kind.ranged && kind.light && hasFeat(data, "Weapon Finesse") && dex > str;
  const ability = kind.ranged ? dex : finesse ? dex : str;
  const focus = hasFeat(data, `Weapon Focus (${item.name}`) ? 1 : 0;
  const enhancement = num(item.bonus, 0);
  const first = num(data.bab, 0) + ability + size + focus + enhancement;
  const bonuses = iteratives(num(data.bab, 0)).map((bab) => bab - num(data.bab, 0) + first);
  // Strength to damage: x1.5 two-handed; a sling or bow its penalty only (a
  // composite bow its bonus too, to its rating); a crossbow none; thrown, all.
  const name = String(item.name ?? "");
  const strDamage = kind.ranged && !kind.thrown ? (/crossbow/i.test(name) ? 0 : /composite/i.test(name) ? Math.min(str, num(item.strength, 0) || str) : Math.min(0, str)) : kind.twoHanded ? Math.floor(str * 1.5) : str;
  const plus = damage.bonus + strDamage + enhancement + (hasFeat(data, `Weapon Specialization (${item.name}`) ? 2 : 0);
  return {
    name: String(item.name ?? "Weapon"),
    bonuses,
    damage: `${damage.count}d${damage.die}${plus ? signed(plus) : ""}`,
    crit: parseCritical(item.critical),
    type: kind.ranged ? "ranged" : "melee",
    dmgtype: String(item.damagetype ?? ""),
    range: num(item.range, 0),
  };
}

// A class's record (FG 3.5E: hitdie "d12", bab "Fast", fort/ref/will "Good",
// skillranks "4", classskills "Climb (Str), Craft (Int), ..."), plainly.
export function classInfo(record) {
  const data = record?.data ?? record ?? {};
  const skills = String(plain(data.classskills))
    .split(/,(?![^(]*\))/)
    .map((part) => part.replace(/\((str|dex|con|int|wis|cha)\)\s*$/i, "").trim())
    .filter(Boolean)
    .map(skillKey);
  return {
    name: String(data.name ?? record?.name ?? ""),
    hitdie: Math.max(4, num(/d(\d+)/.exec(String(data.hitdie ?? ""))?.[1], 8)),
    bab: String(data.bab || "Medium"),
    fort: String(data.fort || "Bad"),
    ref: String(data.ref || "Bad"),
    will: String(data.will || "Bad"),
    skillranks: Math.max(2, num(data.skillranks, 2)),
    classskills: [...new Set(skills)],
    features: rows(data.classfeatures).map(([, feature]) => ({ name: String(feature.name ?? ""), level: Math.max(1, num(feature.level, 1)) })),
  };
}
// A race's record: ability adjustments, size and speed from its traits' words
// ("+2 Constitution, -2 Charisma", "Small", "base land speed of 20 feet").
export function raceInfo(record) {
  const traits = rows(record?.data?.racialtraits).map(([, trait]) => ({ name: String(trait.name ?? ""), text: plain(trait.text) }));
  const adjust = {};
  const scores = traits.find((trait) => /ability score|attribute adjust/i.test(trait.name))?.text ?? "";
  for (const match of scores.matchAll(/([+-−–]\s*\d+)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma)/gi)) adjust[match[2].toLowerCase()] = Number(match[1].replace(/[−–]/, "-").replace(/\s/g, ""));
  const size = traits.find((trait) => /^(small|medium|large)$/i.test(trait.name))?.name.toLowerCase() ?? (/\bsmall\b/i.test(traits.map((trait) => trait.text).join(" ")) ? "small" : "medium");
  const speed = num(/base (?:land )?speed (?:is |of )(\d+) feet/i.exec(traits.map((trait) => trait.text).join(" "))?.[1], size === "small" ? 20 : 30);
  const all = traits.map((trait) => trait.text).join(" ");
  return {
    name: String(record?.name ?? record?.data?.name ?? ""),
    adjust,
    size,
    speed,
    saves: /\+1 racial bonus on all saving throws/i.test(all) ? 1 : 0,
    bonusFeat: /extra feat at 1st level/i.test(all) || /^human$/i.test(String(record?.name ?? "")),
    bonusSkills: /4 extra skill points at 1st level/i.test(all) || /^human$/i.test(String(record?.name ?? "")) ? 1 : 0,
    traits,
  };
}

// Every number of a character worked out again from its scores, classes and gear.
export function derive(input) {
  const data = { ...input, ruleset: RULESET };
  data.abilities = Object.fromEntries(
    STATS.map((stat) => {
      const score = Math.min(50, Math.max(1, Math.round(num(data.abilities?.[stat]?.score, 10))));
      return [stat, { score, bonus: mod(score) }];
    }),
  );
  data.classes = (Array.isArray(data.classes) ? data.classes : []).filter((item) => item && item.name).map((item) => ({ ...item, level: Math.min(MAX_LEVEL, Math.max(1, Math.round(num(item.level, 1)))) }));
  const level = Math.max(1, data.classes.reduce((sum, item) => sum + item.level, 0) || Math.round(num(data.level, 1)));
  data.level = Math.min(MAX_LEVEL, level);
  data.bab = data.classes.reduce((sum, item) => sum + babFor(item.bab, item.level), 0);
  data.size = String(data.size || "medium").toLowerCase();
  data.grapple = data.bab + data.abilities.strength.bonus + sizeOf(data.size).grapple;
  data.saves = Object.fromEntries(
    Object.entries(SAVES).map(([save, stat]) => {
      const key = save === "fortitude" ? "fort" : save === "reflex" ? "ref" : "will";
      // Multiclassed: each class's base save, added.
      const base = data.classes.reduce((sum, item) => sum + saveFor(item[key], item.level), 0);
      const misc = num(data.saves?.[save]?.misc, 0);
      const racial = num(data.racialsaves, 0);
      const feat = (save === "fortitude" && hasFeat(data, "Great Fortitude")) || (save === "reflex" && hasFeat(data, "Lightning Reflexes")) || (save === "will" && hasFeat(data, "Iron Will")) ? 2 : 0;
      const ability = data.abilities[stat].bonus;
      return [save, { base, ability, misc, total: base + ability + misc + racial + feat }];
    }),
  );
  data.ac = armorClass(data);
  data.initiative = { misc: num(data.initiative?.misc, 0), total: data.abilities.dexterity.bonus + (hasFeat(data, "Improved Initiative") ? 4 : 0) + num(data.initiative?.misc, 0) };
  const classSkills = new Set(data.classes.flatMap((item) => item.classskills ?? []));
  data.skills = Object.fromEntries(
    Object.entries(SKILLS).map(([key, [name, stat, trained, acpTimes]]) => {
      const row = data.skills?.[key] ?? {};
      const ranks = Math.max(0, num(row.ranks, 0));
      const misc = num(row.misc, 0);
      const ability = data.abilities[stat].bonus;
      const acp = acpTimes ? data.ac.acp * acpTimes : 0;
      const usable = !trained || ranks > 0;
      return [key, { name, ability: stat, ranks, misc, classskill: classSkills.has(key), trained: Boolean(trained), acp, total: usable ? Math.floor(ranks) + ability + misc + acp : null }];
    }),
  );
  data.attacks = {};
  for (const [key, item] of rows(data.inventorylist)) {
    if (!isWeapon(item) || num(item.carried, 1) === 0) continue;
    const attack = weaponAttack(data, item);
    if (attack) data.attacks[key] = { ...attack, item: key };
  }
  if (Object.keys(data.attacks).length === 0) {
    const str = data.abilities.strength.bonus;
    data.attacks.unarmed = { name: "Unarmed strike", item: "", bonuses: iteratives(data.bab).map((bab) => bab + str + sizeOf(data.size).ac), damage: `1d3${str ? signed(str) : ""}`, crit: { range: 20, mult: 2 }, type: "melee", dmgtype: "nonlethal", range: 0 };
  }
  const caster = data.classes.map((item) => ({ item, caster: CASTERS[classKey(item.name)] })).find((entry) => entry.caster);
  if (caster) {
    const score = data.abilities[caster.caster.stat].score;
    const perday = spellsPerDay(caster.item.name, caster.item.level, score);
    data.spellcasting = {
      class: caster.item.name,
      stat: caster.caster.stat,
      dc: 10 + data.abilities[caster.caster.stat].bonus,
      perday,
      used: perday.map((max, index) => (max === null ? 0 : Math.max(0, Math.min(max, Math.round(num(data.spellcasting?.used?.[index], 0)))))),
      arcane: caster.caster.arcane,
    };
  } else delete data.spellcasting;
  data.packages = {
    ...(data.race ? { race: { name: data.race, packagetype: "Race" } } : {}),
    ...Object.fromEntries(data.classes.map((item, index) => [`class${index + 1}`, { name: item.name, packagetype: "Class", level: item.level, hitdie: item.hitdie }])),
  };
  data.hp = { total: Math.max(1, Math.round(num(data.hp?.total, 1))), wounds: Math.max(0, Math.round(num(data.hp?.wounds, 0))), nonlethal: Math.max(0, Math.round(num(data.hp?.nonlethal, 0))), temp: Math.max(0, Math.round(num(data.hp?.temp, 0))) };
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  // A race with a level adjustment levels up as its effective character level.
  data.la = Math.max(0, Math.round(num(data.la, 0)));
  data.expnext = data.level + data.la >= MAX_LEVEL ? 0 : xpFor(data.level + data.la + 1);
  data.feats = (Array.isArray(data.feats) ? data.feats : []).map((feat) => String(feat).slice(0, 80)).filter(Boolean);
  data.spells = (Array.isArray(data.spells) ? data.spells : []).map((spell) => String(spell).slice(0, 80)).filter(Boolean);
  return data;
}

// Hit points: at 0 disabled, -1 to -9 dying, -10 dead (current = total - wounds).
export function healthOf(data) {
  const current = num(data?.hp?.total, 0) + num(data?.hp?.temp, 0) - num(data?.hp?.wounds, 0);
  if (current <= -10) return { current, status: "Dead" };
  if (current < 0) return { current, status: num(data?.stable, 0) ? "Stable" : "Dying" };
  if (current === 0) return { current, status: "Disabled" };
  return { current, status: current * 2 < num(data?.hp?.total, 1) ? "Wounded" : "Healthy" };
}

// A d20 test for a character: an ability check, a save, or a skill.
export function testModifier(data, kind, key) {
  if (kind === "save") {
    const save = SAVES[key] ? key : Object.entries(SAVES).find(([, stat]) => stat === key)?.[0] ?? "fortitude";
    return { modifier: num(data.saves?.[save]?.total, 0), label: `[SAVE] ${SAVE_NAMES[save]}` };
  }
  if (kind === "skill") {
    const skill = data.skills?.[key];
    if (!skill) throw new Error("No such skill.");
    if (skill.total === null) throw new Error(`${skill.name} needs ranks (trained only).`);
    return { modifier: num(skill.total, 0), label: `[SKILL] ${skill.name}` };
  }
  return { modifier: num(data.abilities?.[key]?.bonus, 0), label: `[CHECK] ${titled(key)}` };
}

// --- NPCs, from FG 3.5E's monster records ------------------------------------
// ac "27 (-2 size, +11 Dex, +8 natural), touch 19, flat-footed 16"; hd
// "24d8+96"; hp 204; init 15; babgrp "+18/+32"; atk "Slam +27 melee (2d8+6)";
// fullatk "2 slams +27 melee (2d8+6)" or "Longsword +5/+0 melee (1d8+2/19-20)
// and bite +3 melee (1d6)"; fortitudesave 12; reflexsave; willsave.
// Splits at a separator outside parentheses ("2d6+12 plus 3d6 sonic or 3d6
// electricity" stays whole inside its brackets).
function splitOutside(text, separator) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const match = separator.exec(text.slice(at));
      if (match && match.index === 0) {
        parts.push(text.slice(from, at));
        at += match[0].length - 1;
        from = at + 1;
      }
    }
  }
  parts.push(text.slice(from));
  return parts.filter((part) => part.trim());
}
// An attack line: "Longsword +5/+0 melee (1d8+2/19-20)", "2 claws +9 melee
// (1d6+6)", "+1 dagger +12/+7 melee (1d4/19-20)", "Pitchfork (as pole arm)
// +0 melee (2d4/x3)", "Ram -1 melee* (1d6+1)"; options split by "or", the
// attacks of one by "and" or commas.
const ATTACK = /^\s*(?:(\d+)\s+)?((?:[+\-–]\d+\s+)?(?:\([^)]*\)|[^+\-–(])*?)\s*((?:[+\-–]\d+\/?)+)\s*(melee|ranged)?\*?\s*(?:touch)?\s*\(([^)]*)\)/i;
export function parseAttacks(text) {
  const out = [];
  for (const option of splitOutside(String(plain(text)), /^(?:;|\bor\b)/i)) {
    for (const part of splitOutside(option, /^(?:,|\band\b)/i)) {
      const match = ATTACK.exec(part);
      if (!match) continue;
      const [, count, name, bonusText, kind, inside] = match;
      const bonuses = bonusText.split("/").filter(Boolean).map((bonus) => Number(bonus.replace(/[–]/, "-")));
      const damage = parseDamage(inside);
      const rest = inside.replace(/^\s*\d+d\d+\s*(?:[+\-–]\s*\d+)?/, "");
      const critText = /^\s*\/\s*((?:\d+\s*[-–]\s*20)?\s*\/?\s*(?:[x×]\d)?)/i.exec(rest);
      const crit = critText ? parseCritical(critText[1]) : { range: 20, mult: 2 };
      const extra = rest.replace(/^\s*\/\s*(?:\d+\s*[-–]\s*20)?\s*\/?\s*(?:[x×]\d)?/i, "").replace(/^[,\s]+/, "").trim();
      const times = Math.max(1, num(count, 1));
      const label = titled(name.trim().replace(/s$/, times > 1 ? "" : "s").trim() || "Attack");
      out.push({ name: label, bonuses: times > 1 ? Array(times).fill(bonuses[0]) : bonuses, damage: damage ? `${damage.count}d${damage.die}${damage.bonus ? signed(damage.bonus) : ""}` : "", crit, type: /ranged/i.test(kind ?? "") ? "ranged" : "melee", extra });
    }
  }
  return out;
}
export function npcStats(data) {
  const acText = String(data?.ac ?? "");
  const ac = num(/^\s*(-?\d+)/.exec(acText)?.[1], num(data?.ac, 10));
  const touch = num(/touch\s*(-?\d+)/i.exec(acText)?.[1], ac);
  const flatfooted = num(/flat-?footed\s*(-?\d+)/i.exec(acText)?.[1], ac);
  const [bab, grapple] = String(data?.babgrp ?? "").split("/").map((part) => num(part.replace(/[^\d-]/g, ""), 0));
  const hd = String(data?.hd ?? "");
  const hp = num(data?.hp, 0) || (() => {
    const dice = parseDamage(hd);
    return dice ? Math.max(1, Math.floor((dice.count * (dice.die + 1)) / 2) + dice.bonus) : 1;
  })();
  const attacks = parseAttacks(data?.fullatk || data?.atk);
  const single = parseAttacks(data?.atk);
  return {
    ac,
    touch,
    flatfooted,
    hp,
    init: num(data?.init, mod(data?.dexterity)),
    bab: bab ?? 0,
    grapple: grapple ?? 0,
    saves: { fortitude: num(data?.fortitudesave, 0), reflex: num(data?.reflexsave, 0), will: num(data?.willsave, 0) },
    attacks: attacks.length ? attacks : single,
    attack: single[0] ?? attacks[0] ?? null,
    cr: String(data?.cr ?? ""),
  };
}

// --- Building a character ---------------------------------------------------
// spec: { name, race, class, level (or classes [{name, level}], a multiclass
// plan), scores {stat: n} or array (the standard 15,14,13,12,10,8, put in the
// class's order), increases {stat: n} (the level increases; else +1 to the
// class's first ability every 4th level), feats, skills {name: ranks}, gear
// [item names or [name, count]], gold (gp left), spells [names or {name,
// class, level}], languages, alignment, choices {deity, domains, channel,
// school, prohibited, familiar, companion, mount, combatstyle,
// favoredenemies, febonus, roguespecials}, deity, gender, age, height,
// weight, appearance, notes, fill (false: exactly what is given, as the
// character wizard makes it) }. lib: { classes, races, items, feats, spells,
// domains } (the campaign's records). Hit points as FG adds each level: the
// die's highest at the character's 1st level, then its average (rounded) +
// Con.
const CLASS_ORDER = {
  barbarian: ["strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence"],
  bard: ["charisma", "dexterity", "constitution", "intelligence", "wisdom", "strength"],
  cleric: ["wisdom", "constitution", "strength", "charisma", "dexterity", "intelligence"],
  druid: ["wisdom", "constitution", "dexterity", "intelligence", "charisma", "strength"],
  fighter: ["strength", "constitution", "dexterity", "wisdom", "intelligence", "charisma"],
  monk: ["wisdom", "dexterity", "strength", "constitution", "intelligence", "charisma"],
  paladin: ["charisma", "strength", "constitution", "wisdom", "dexterity", "intelligence"],
  ranger: ["dexterity", "wisdom", "strength", "constitution", "intelligence", "charisma"],
  rogue: ["dexterity", "intelligence", "constitution", "charisma", "wisdom", "strength"],
  sorcerer: ["charisma", "dexterity", "constitution", "intelligence", "wisdom", "strength"],
  wizard: ["intelligence", "dexterity", "constitution", "wisdom", "charisma", "strength"],
};
// A starting kit by class (names as the Player's Handbook's equipment).
const KITS = {
  barbarian: ["Greataxe", "Studded leather", "Shortbow", "Arrows (20)"],
  bard: ["Rapier", "Studded leather", "Light crossbow", "Crossbow bolts (10)"],
  cleric: ["Heavy mace", "Scale mail", "Heavy wooden shield", "Light crossbow", "Crossbow bolts (10)"],
  druid: ["Scimitar", "Leather", "Light wooden shield", "Sling"],
  fighter: ["Longsword", "Scale mail", "Heavy steel shield", "Shortbow", "Arrows (20)"],
  monk: ["Quarterstaff", "Sling"],
  paladin: ["Longsword", "Scale mail", "Heavy steel shield"],
  ranger: ["Longsword", "Studded leather", "Longbow", "Short sword", "Arrows (20)"],
  rogue: ["Short sword", "Leather", "Shortbow", "Dagger", "Arrows (20)"],
  sorcerer: ["Quarterstaff", "Light crossbow", "Crossbow bolts (10)", "Dagger"],
  wizard: ["Quarterstaff", "Light crossbow", "Crossbow bolts (10)"],
};
const FEATS_BY_CLASS = {
  fighter: ["Weapon Focus (Longsword)", "Power Attack", "Cleave", "Dodge", "Improved Initiative", "Toughness"],
  barbarian: ["Power Attack", "Cleave", "Toughness"],
  paladin: ["Power Attack", "Weapon Focus (Longsword)", "Iron Will"],
  ranger: ["Point Blank Shot", "Precise Shot", "Weapon Focus (Longbow)"],
  rogue: ["Weapon Finesse", "Improved Initiative", "Dodge"],
  monk: ["Dodge", "Improved Initiative", "Combat Reflexes"],
  cleric: ["Combat Casting", "Toughness", "Extra Turning"],
  druid: ["Combat Casting", "Toughness", "Lightning Reflexes"],
  bard: ["Weapon Finesse", "Dodge", "Improved Initiative"],
  sorcerer: ["Combat Casting", "Improved Initiative", "Toughness"],
  wizard: ["Improved Initiative", "Combat Casting", "Toughness"],
};
// A record by name, as the books write it or in other words: "Heavy steel
// shield" is the Player's Handbook's "Shield, heavy steel".
const words = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const byName = (list, name) => {
  const wanted = String(name ?? "").toLowerCase().trim();
  if (!wanted) return undefined;
  return list.find((item) => String(item.name).toLowerCase() === wanted) ?? list.find((item) => words(item.name) === words(wanted)) ?? list.find((item) => String(item.name).toLowerCase().startsWith(wanted));
};
// The skills a class takes first when its points are spent for it.
const SKILL_FIRST = {
  barbarian: ["climb", "jump", "listen", "survival", "intimidate", "swim"],
  bard: ["perform", "diplomacy", "bluff", "knowledgehistory", "spellcraft", "tumble", "listen"],
  cleric: ["concentration", "heal", "knowledgereligion", "spellcraft"],
  druid: ["concentration", "knowledgenature", "survival", "heal", "spot", "listen"],
  fighter: ["climb", "jump", "intimidate", "ride", "swim"],
  monk: ["tumble", "listen", "spot", "jump", "balance", "movesilently", "hide"],
  paladin: ["diplomacy", "heal", "ride", "knowledgereligion", "sensemotive"],
  ranger: ["survival", "spot", "listen", "hide", "movesilently", "search", "knowledgenature"],
  rogue: ["hide", "movesilently", "spot", "listen", "search", "disabledevice", "openlock", "tumble", "sleightofhand", "bluff"],
  sorcerer: ["concentration", "spellcraft", "knowledgearcana", "bluff"],
  wizard: ["concentration", "spellcraft", "knowledgearcana", "decipherscript", "knowledgehistory"],
};
const featCount = (level) => 1 + Math.floor(Math.max(1, level) / 3);
const fighterBonus = (level) => 1 + Math.floor(Math.max(1, level) / 2);

export function buildFromSpec(spec, lib) {
  const problems = [];
  const classes = lib.classes ?? [];
  // The class plan: classes [{name, level}] (the wizard's, a multiclass plan), or one class and its level.
  const wanted = Array.isArray(spec?.classes) && spec.classes.length ? spec.classes.map((entry) => ({ name: entry?.name ?? entry?.class, level: entry?.level ?? entry?.levels })) : [{ name: spec?.class, level: spec?.level }];
  const planned = wanted
    .map((entry) => ({ record: byName(classes, entry.name) ?? (wanted.length === 1 ? classes[0] : null), level: Math.min(MAX_LEVEL, Math.max(1, Math.round(num(entry.level, 1)))), asked: entry.name }))
    .filter((entry) => {
      if (!entry.record) problems.push(`No class "${entry.asked}" in the campaign's books.`);
      return Boolean(entry.record);
    });
  if (planned.length === 0) throw new Error("No classes: make the 3.5E Player's Handbook active (Books).");
  const raceRecord = byName(lib.races ?? [], spec?.race ?? "Human") ?? byName(lib.races ?? [], "Human") ?? (lib.races ?? [])[0] ?? null;
  const race = raceRecord ? raceInfo(raceRecord) : { name: String(spec?.race ?? "Human"), adjust: {}, size: "medium", speed: 30, saves: 0, bonusFeat: true, bonusSkills: 1, traits: [] };
  const plan = planned.map((entry) => ({ ...entry, info: classInfo(entry.record), key: classKey(entry.record.name) }));
  const cls = plan[0].info;
  const key = plan[0].key;
  const level = Math.min(MAX_LEVEL, plan.reduce((sum, entry) => sum + entry.level, 0));
  const levels = {};
  for (const entry of plan) levels[classKeyOf(entry.record.name)] = (levels[classKeyOf(entry.record.name)] ?? 0) + entry.level;
  const fill = spec?.fill !== false;
  // Scores: given, or the standard array in the class's order; the level
  // increases (given, else +1 to the class's first ability every 4th level);
  // then the race's adjustments (Kraken's table for the races it knows).
  const order = CLASS_ORDER[key] ?? STATS;
  const given = spec?.scores && typeof spec.scores === "object" ? spec.scores : null;
  const array = Array.isArray(spec?.array) && spec.array.length === 6 ? spec.array.map((value) => num(value, 10)) : STANDARD_ARRAY;
  const scores = Object.fromEntries(STATS.map((stat) => [stat, given ? num(given[stat] ?? given[SHORT[stat].toLowerCase()], 10) : array[order.indexOf(stat)]]));
  if (spec?.increases && typeof spec.increases === "object") for (const stat of STATS) scores[stat] += Math.max(0, Math.round(num(spec.increases[stat], 0)));
  else scores[order[0]] += Math.floor(level / 4);
  const adjust = knownRace(race.name) ? raceMods(race.name) : race.adjust;
  for (const [stat, change] of Object.entries(adjust)) scores[stat] = Math.max(3, (scores[stat] ?? 10) + change);
  // Hit points as FG adds each class level: the die's highest at the
  // character's 1st level, then its average (rounded) + Con.
  const con = mod(scores.constitution);
  let hp = 0;
  let total = 0;
  for (const entry of plan) {
    for (let l = 1; l <= entry.level; l++) {
      total += 1;
      hp += (total === 1 ? entry.info.hitdie : Math.floor((entry.info.hitdie + 1) / 2 + 0.5)) + con;
    }
  }
  hp = Math.max(1, hp);
  // Feats: the given (the wizard's, exactly), else filled with the class's usual ones.
  const feats = [];
  const wantedFeats = Array.isArray(spec?.feats) ? spec.feats.map(String) : [];
  const count = featCount(level) + (race.bonusFeat ? 1 : 0) + (key === "fighter" ? fighterBonus(level) : 0);
  for (const feat of fill ? [...wantedFeats, ...(FEATS_BY_CLASS[key] ?? []), "Toughness", "Alertness", "Iron Will", "Great Fortitude", "Lightning Reflexes"] : wantedFeats) {
    if (fill && feats.length >= count) break;
    if (!feats.some((had) => had.toLowerCase() === feat.toLowerCase()) || !fill) feats.push(feat);
  }
  const has = (name) => feats.some((feat) => feat.toLowerCase() === name.toLowerCase());
  if (levels.wizard && !has("Scribe Scroll")) feats.push("Scribe Scroll");
  // A ranger's combat style feats, as FG's wizard adds them.
  const choices = spec?.choices && typeof spec.choices === "object" ? spec.choices : {};
  for (const [at, feat] of COMBAT_STYLES[String(choices.combatstyle ?? "")] ?? []) if ((levels.ranger ?? 0) >= at && !has(feat)) feats.push(feat);
  hp += 3 * feats.filter((feat) => /^toughness/i.test(feat)).length;
  // Skills: the given ranks (half ranks too: cross-class), else spent for the class, class skills first.
  const intMod = mod(scores.intelligence);
  const perLevel = Math.max(1, cls.skillranks + intMod) + (race.bonusSkills ? 1 : 0);
  let points = perLevel * 4 + perLevel * (level - 1);
  const maxRanks = level + 3;
  const classSkills = new Set(plan.flatMap((entry) => entry.info.classskills));
  const skills = {};
  const wantedSkills = spec?.skills && typeof spec.skills === "object" ? Object.entries(spec.skills) : [];
  for (const [name, ranks] of wantedSkills) {
    const skill = skillKey(name);
    if (!SKILLS[skill]) {
      problems.push(`No skill "${name}".`);
      continue;
    }
    if (!fill) {
      // The wizard checked the costs and caps; Craft (alchemy) and Craft (...) add up.
      skills[skill] = { ranks: (skills[skill]?.ranks ?? 0) + Math.max(0, Math.round(num(ranks, 0) * 2) / 2) };
      continue;
    }
    const cost = classSkills.has(skill) ? 1 : 2;
    const max = classSkills.has(skill) ? maxRanks : maxRanks / 2;
    const take = Math.min(max, Math.max(0, num(ranks, 0)), Math.floor(points / cost));
    skills[skill] = { ranks: take };
    points -= take * cost;
  }
  if (fill) {
    const first = SKILL_FIRST[key] ?? [];
    for (const skill of [...first.filter((item) => cls.classskills.includes(item)), ...cls.classskills]) {
      if (points <= 0) break;
      if (!SKILLS[skill] || skills[skill]) continue;
      const take = Math.min(maxRanks, points);
      skills[skill] = { ranks: take };
      points -= take;
    }
  }
  // Gear: the given ([name, count] or names), else the class's kit, from the campaign's items.
  const inventorylist = {};
  const items = lib.items ?? [];
  const gear = Array.isArray(spec?.gear) && spec.gear.length ? spec.gear : fill ? KITS[key] ?? [] : [];
  gear.forEach((entry) => {
    const [name, qty] = Array.isArray(entry) ? entry : [entry, 0];
    const found = byName(items, name);
    if (!found) {
      problems.push(`No item "${name}" in the campaign's books.`);
      return;
    }
    const id = `id-${String(Object.keys(inventorylist).length + 1).padStart(5, "0")}`;
    const { fgPath, ...fields } = found.data ?? {};
    inventorylist[id] = { ...fields, name: found.name, count: Math.max(1, Math.round(num(qty, 0))) || num(fields.count, 1) || 1, carried: isArmor(found.data) || isShield(found.data) || isWeapon(found.data) ? 2 : 1 };
  });
  // Spells: the chosen (known, or a wizard's spellbook), and what FG's wizard
  // adds on commit: every 0-level spell to a wizard's spellbook (not of a
  // prohibited school), a prepared caster's whole class list for the levels it
  // casts (not of an alignment opposed to its own), a cleric's domain spells.
  const spells = [];
  const addSpell = (name) => {
    const text = String(name ?? "").trim().slice(0, 80);
    if (text && !spells.some((had) => had.toLowerCase() === text.toLowerCase())) spells.push(text);
  };
  for (const spell of Array.isArray(spec?.spells) ? spec.spells : []) addSpell(typeof spell === "object" && spell ? spell.name : spell);
  for (const name of Array.isArray(choices.advlearning) ? choices.advlearning : []) addSpell(name);
  const library = lib.spells ?? [];
  const spellRecords = library.map((record) => ({ name: String(record.name ?? record.data?.name ?? ""), data: record.data ?? {} }));
  const barred = new Set((Array.isArray(choices.prohibited) ? choices.prohibited : []).map((school) => String(school).toLowerCase()));
  for (const entry of plan) {
    const k = classKeyOf(entry.record.name);
    if (k === "wizard" || k === "necromancer") {
      for (const spell of spellRecords) if (spellLevelForClass(spell, k) === 0 && !(k === "wizard" && barred.has(spellSchool(spell)))) addSpell(spell.name);
    }
  }
  const code = alignmentCode(spec?.alignment);
  const opposed = (spell) => {
    if (!code) return false;
    const school = String(spell.data?.school ?? "");
    return (/\[[^\]]*Evil/.test(school) && code[1] === "G") || (/\[[^\]]*Good/.test(school) && code[1] === "E") || (/\[[^\]]*Chaotic/.test(school) && code[0] === "L") || (/\[[^\]]*Lawful/.test(school) && code[0] === "C");
  };
  for (const k of Object.keys(levels)) {
    if (!PREPARED_CASTERS[k]) continue;
    const max = maxSpellLevelFor(k, levels[k]);
    const min = k === "cleric" || k === "druid" ? 0 : 1;
    const found = spellRecords.map((spell) => ({ spell, at: spellLevelForClass(spell, k) })).filter(({ spell, at }) => at !== null && at >= min && at <= max && !opposed(spell));
    found.sort((a, b) => a.at - b.at || a.spell.name.localeCompare(b.spell.name)).forEach(({ spell }) => addSpell(spell.name));
  }
  // Class features the levels reach, and what the class choices add (domains, school, familiar...).
  const features = plan.flatMap((entry) => entry.info.features.filter((feature) => feature.level <= entry.level).map((feature) => ({ ...feature, class: entry.info.name })));
  for (const feature of choiceFeatures(choices, levels, lib)) {
    for (const spell of feature.spells ?? []) addSpell(spell);
    const { spells: _, ...kept } = feature;
    features.push(kept);
  }
  const la = raceLevelAdjustment(race.name);
  const speedBonus = (levels.barbarian ? 10 : 0) + ((levels.monk ?? 0) >= 3 ? 10 * Math.floor(levels.monk / 3) : 0);
  const known = Array.isArray(spec?.languages) ? spec.languages.map(String) : [];
  const languages = [...new Set([...automaticLanguages(race.name, Object.keys(levels)), ...known])].filter(Boolean);
  const coins = spec?.gold !== undefined && spec?.gold !== null && Number.isFinite(Number(spec.gold)) ? coinsOf(Math.round(Number(spec.gold) * 100)) : { "id-00001": { name: "GP", amount: 0 } };
  const text = (value) => String(value ?? "").slice(0, 8000);
  const data = derive({
    race: race.name,
    size: race.size,
    speed: race.speed + speedBonus,
    racialsaves: race.saves,
    alignment: text(spec?.alignment),
    classes: plan.map((entry) => ({ name: entry.info.name, level: entry.level, hitdie: entry.info.hitdie, bab: entry.info.bab, fort: entry.info.fort, ref: entry.info.ref, will: entry.info.will, skillranks: entry.info.skillranks, classskills: entry.info.classskills })),
    abilities: Object.fromEntries(STATS.map((stat) => [stat, { score: scores[stat] }])),
    hp: { total: hp, wounds: 0 },
    feats,
    features,
    skills,
    inventorylist,
    coins,
    spells,
    la,
    exp: xpFor(level + la),
    traits: race.traits.map((trait) => trait.name),
    ...(languages.length ? { languages: languages.join(", ") } : {}),
    ...Object.fromEntries(["deity", "gender", "age", "height", "weight", "appearance", "notes"].filter((field) => spec?.[field]).map((field) => [field, text(spec[field])])),
    ...(choices.deity && !spec?.deity ? { deity: choices.deity === "No deity (devoted to an ideal)" ? "None (devoted to an ideal)" : String(choices.deity) } : {}),
    ...(Array.isArray(choices.domains) && choices.domains.length ? { domains: choices.domains.join(", ") } : {}),
  });
  const plainName = plan.map((entry) => entry.info.name).join("/");
  return { name: String(spec?.name ?? "").trim() || `${race.name} ${plainName}`, data, problems };
}

// A level gained in the character's (first) class: hit points rolled (at
// least 1 with Con), every number again. rolled: the hit die's roll.
export function levelUp(input, rolled) {
  const data = derive(input);
  if (data.level >= MAX_LEVEL) throw new Error(`Already level ${MAX_LEVEL}.`);
  const classes = data.classes.map((item) => ({ ...item }));
  const first = classes[0];
  if (!first) throw new Error("No class to level up.");
  first.level += 1;
  const gain = Math.max(1, Math.round(num(rolled, Math.ceil((num(first.hitdie, 8) + 1) / 2))) + data.abilities.constitution.bonus);
  const next = derive({ ...data, classes, hp: { ...data.hp, total: data.hp.total + gain }, exp: Math.max(data.exp, xpFor(data.level + 1)) });
  return { data: next, gain };
}
