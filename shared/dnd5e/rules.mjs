// D&D Fifth Edition, from the System Reference Document 5.2.1 (CC-BY-4.0):
// Kraken's second ruleset, to prove the core is neutral. The rules here are
// plain functions (no Node, no DOM), used by the host (building, combat,
// checks) and by the 5E sheet. FG's 5E ruleset is the model for how they
// play: d20 + ability modifier (+ proficiency) for checks, saves and attacks;
// initiative d20 + Dexterity; a natural 20 is a critical hit (the damage dice
// rolled twice), a natural 1 always misses; creatures at 0 hit points die, a
// character falls Dying (death saves) and dies outright when the damage left
// over is at least its hit point maximum.
//
// A 5E character's record data keeps the keys the core already reads (hp
// {total, wounds}, ac {total}, level, exp, expnext, coins, inventorylist,
// packages with the class as packagetype Class), and its own:
//   ruleset "dnd5e", species, background, abilities {stat: {score, bonus,
//   saveprof, save}}, prof, skills {key: {prof 0|1|2, total}}, attacks {key:
//   {name, bonus, damage, dmgtype, type}}, initiative {total}, speed, senses,
//   spellcasting {stat, dc, attack}, slots {l1: {max, used}}, spells [names],
//   deathsaves {success, failure}, hitdice {die, total, used}.

import { backgroundInfo, classInfo, currenciesOf, mainCurrency, speciesInfo, totalWealth } from "./wizard.mjs";

export const RULESET = "dnd5e";
export const RULESET_NAME = "D&D 5E";

// The games built on this engine (the d20 family): D&D 5E from the SRD, and
// Kraken's own Descending Darkness (dark fantasy: Defense and Health, a
// harsher array, levels 1-10, bleeding out at 0 Health, Dread). A record's
// data.ruleset says which; the campaign's ruleset name picks it for a new one.
export const PROFILES = {
  dnd5e: {
    id: "dnd5e",
    name: "D&D 5E",
    standardArray: [15, 14, 13, 12, 10, 8],
    xp: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
    maxLevel: 20,
    labels: { ac: "AC", acLong: "Armor Class", hp: "Hit Points", hpShort: "HP", species: "Species", game: "5E", hitDice: "Hit Dice" },
    dying: "saves",
    dread: false,
    dcs: [5, 10, 15, 20, 25, 30],
  },
  descending: {
    id: "descending",
    name: "Descending Darkness",
    standardArray: [17, 14, 14, 13, 12, 8],
    xp: [0, 250, 750, 1750, 3500, 6500, 11000, 17000, 25000, 35000],
    maxLevel: 10,
    labels: { ac: "Defense", acLong: "Defense", hp: "Health", hpShort: "Health", species: "Kin", game: "Descending Darkness", hitDice: "Recovery Dice" },
    // At 0 Health: dying, a Health lost at the end of each of its turns; dead at minus its maximum.
    dying: "bleed",
    // Dread 0-6: 3 or more, disadvantage on Wisdom; 6, the character breaks.
    dread: true,
    dcs: [10, 12, 15, 18],
  },
};
export const profileFor = (thing) => {
  const key = typeof thing === "string" ? thing : thing?.ruleset;
  return PROFILES[key] ?? Object.values(PROFILES).find((profile) => profile.name === key) ?? PROFILES.dnd5e;
};
export const isD20 = (thing) => Boolean(PROFILES[typeof thing === "string" ? thing : thing?.ruleset] ?? Object.values(PROFILES).find((profile) => profile.name === thing));
export const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
export const SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };

// The eighteen skills and their abilities (SRD 5.2.1, Playing the Game).
export const SKILLS = {
  acrobatics: ["Acrobatics", "dexterity"],
  animalhandling: ["Animal Handling", "wisdom"],
  arcana: ["Arcana", "intelligence"],
  athletics: ["Athletics", "strength"],
  deception: ["Deception", "charisma"],
  history: ["History", "intelligence"],
  insight: ["Insight", "wisdom"],
  intimidation: ["Intimidation", "charisma"],
  investigation: ["Investigation", "intelligence"],
  medicine: ["Medicine", "wisdom"],
  nature: ["Nature", "intelligence"],
  perception: ["Perception", "wisdom"],
  performance: ["Performance", "charisma"],
  persuasion: ["Persuasion", "charisma"],
  religion: ["Religion", "intelligence"],
  sleightofhand: ["Sleight of Hand", "dexterity"],
  stealth: ["Stealth", "dexterity"],
  survival: ["Survival", "wisdom"],
};
export const skillKey = (name) => String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");

// Experience for each level (SRD: Character Advancement).
export const XP = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const mod = (score) => Math.floor((Number(score) - 10) / 2);
export const proficiency = (level) => 2 + Math.floor((Math.max(1, Number(level) || 1) - 1) / 4);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const statOf = (word) => STATS.find((stat) => String(word ?? "").trim().toLowerCase().startsWith(stat.slice(0, 3))) ?? null;

// Spellcasting classes: their ability and how fast slots come (SRD class tables).
export const CASTERS = {
  bard: { stat: "charisma", kind: "full" },
  cleric: { stat: "wisdom", kind: "full" },
  druid: { stat: "wisdom", kind: "full" },
  sorcerer: { stat: "charisma", kind: "full" },
  wizard: { stat: "intelligence", kind: "full" },
  paladin: { stat: "charisma", kind: "half" },
  ranger: { stat: "wisdom", kind: "half" },
  warlock: { stat: "charisma", kind: "pact" },
};
// Spell slots of a full caster by level (1..20), levels 1..9.
const FULL = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
// A half caster (2024 SRD) has slots from level 1, as a full caster of half its level, rounded up.
// A warlock's Pact Magic: slots all of one level.
const PACT = [[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];
export function slotsFor(className, level) {
  const caster = CASTERS[skillKey(className)];
  const at = Math.min(20, Math.max(1, Math.round(num(level, 1))));
  if (!caster) return {};
  if (caster.kind === "pact") {
    const [count, slotLevel] = PACT[at - 1];
    return { [`l${slotLevel}`]: { max: count, used: 0 } };
  }
  const row = FULL[(caster.kind === "half" ? Math.ceil(at / 2) : at) - 1] ?? [];
  return Object.fromEntries(row.map((count, index) => [`l${index + 1}`, { max: count, used: 0 }]));
}

// "1d8 Slashing" -> { dice: "1d8", type: "slashing" }; "1d4 + 2 Piercing" too.
export function parseDamage(text) {
  const raw = String(text ?? "").trim();
  const match = /^(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*([a-z]+)?/i.exec(raw);
  if (!match) return null;
  return { dice: match[1].replace(/\s+/g, ""), type: (match[2] ?? "").toLowerCase() };
}

// A weapon item (FG's 5E item): melee or ranged, finesse, its damage, its versatile die.
export function weaponInfo(item) {
  const properties = String(item?.properties ?? "");
  const subtype = String(item?.subtype ?? "");
  const damage = parseDamage(item?.damage);
  return {
    ranged: /ranged/i.test(subtype),
    finesse: /finesse/i.test(properties),
    thrown: /thrown/i.test(properties),
    damage,
    versatile: /versatile\s*\((\d*d\d+)\)/i.exec(properties)?.[1] ?? null,
    martial: /martial/i.test(subtype),
  };
}
export const isWeapon = (item) => /weapon/i.test(String(item?.type ?? "")) && Boolean(parseDamage(item?.damage));
export const isArmor = (item) => /armor/i.test(String(item?.type ?? ""));
const equipped = (item) => num(item?.carried, 1) === 2;

// Armor Class (SRD: Armor table): unarmored 10 + DEX; light armor + DEX;
// medium + DEX (at most 2); heavy, no DEX; a shield adds its bonus. Only what is worn (carried 2) counts.
export function armorClass(data) {
  const dex = mod(data.abilities?.dexterity?.score ?? 10);
  let base = 10 + dex;
  let shield = 0;
  let wearing = "";
  for (const [, item] of rows(data.inventorylist)) {
    if (!isArmor(item) || !equipped(item)) continue;
    const subtype = String(item.subtype ?? "");
    if (/shield/i.test(subtype)) shield = Math.max(shield, num(item.ac, 2) + num(item.bonus, 0));
    else {
      const ac = num(item.ac, 10) + num(item.bonus, 0);
      const dexbonus = String(item.dexbonus ?? "Yes");
      const capped = /max\s*(\d+)/i.exec(dexbonus);
      const fromDex = /^no/i.test(dexbonus) || /heavy/i.test(subtype) ? 0 : capped ? Math.min(dex, Number(capped[1])) : dex;
      const value = ac + fromDex;
      if (!wearing || value > base) {
        base = value;
        wearing = String(item.name ?? "");
      }
    }
  }
  return { total: base + shield + num(data.ac?.misc, 0), armor: wearing, shield };
}

// A character's weapon attack: proficiency (with its weapon kind), STR for
// melee, DEX for ranged, the better for finesse; damage the weapon's dice + that modifier.
export function weaponAttack(data, item) {
  const info = weaponInfo(item);
  if (!info.damage) return null;
  const str = mod(data.abilities?.strength?.score ?? 10);
  const dex = mod(data.abilities?.dexterity?.score ?? 10);
  const ability = info.ranged ? dex : info.finesse ? Math.max(str, dex) : str;
  const proficient = info.martial ? Boolean(data.proficiencies?.martial) : true;
  const bonus = ability + (proficient ? num(data.prof, 2) : 0) + num(item.bonus, 0);
  const dmg = ability + num(item.bonus, 0);
  return {
    name: String(item.name ?? "Weapon"),
    bonus,
    damage: `${info.damage.dice}${dmg ? signed(dmg) : ""}`,
    dice: info.damage.dice,
    damageBonus: dmg,
    dmgtype: info.damage.type,
    type: info.ranged ? "ranged" : "melee",
  };
}

// An NPC's attacks from its actions' text (SRD stat blocks): "Melee Attack Roll:
// +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage." (and 2014's "Melee
// Weapon Attack: +4 to hit"). Keys are the action keys.
export function npcAttacks(data) {
  const out = {};
  for (const [key, action] of rows(data?.actions)) {
    const desc = String(action?.desc ?? "");
    const roll = /(Melee or Ranged|Melee|Ranged)\s*(?:Weapon |Spell )?Attack(?: Roll)?\s*:\s*([+-]\d+)/i.exec(desc);
    if (!roll) continue;
    const hit = /Hit\s*:\s*\d+\s*\(([^)]+)\)\s*([A-Za-z]+)\s+damage/i.exec(desc);
    const flat = !hit ? /Hit\s*:\s*(\d+)\s+([A-Za-z]+)\s+damage/i.exec(desc) : null;
    const damage = hit ? hit[1].replace(/\s+/g, "") : flat ? flat[1] : "";
    out[key] = {
      name: String(action.name ?? "Attack"),
      bonus: Number(roll[2]),
      damage,
      dmgtype: String((hit ?? flat)?.[2] ?? "").toLowerCase(),
      type: /^ranged/i.test(roll[1]) ? "ranged" : "melee",
    };
  }
  return out;
}

// An NPC's numbers for the tracker: its hit points as listed (FG's default),
// its AC, its initiative bonus (DEX, or the block's own initiative), its saves.
export function npcStats(data) {
  const dex = num(data?.abilities?.dexterity?.bonus, mod(data?.abilities?.dexterity?.score ?? 10));
  const ac = typeof data?.ac === "object" ? num(data.ac?.total, 10) : num(/^\d+/.exec(String(data?.ac ?? ""))?.[0], 10);
  return { hp: Math.max(1, Math.round(num(data?.hp, 1))), ac, init: num(data?.initiative?.total, dex + num(data?.initiative?.misc, 0)), hd: String(data?.hd ?? "").replace(/[()]/g, "") };
}
export function npcSave(data, stat) {
  const row = data?.abilities?.[stat] ?? {};
  return num(row.bonus, mod(row.score ?? 10)) + num(row.savemodifier, 0);
}
export function npcCheck(data, stat) {
  const row = data?.abilities?.[stat] ?? {};
  return num(row.bonus, mod(row.score ?? 10));
}

// The hit die of a class record ("D10 per Fighter level").
export function hitDie(classRecord) {
  return Number(/d(\d+)/i.exec(String(classRecord?.data?.hp?.hitdice?.text ?? classRecord?.hitdie ?? "d8"))?.[1] ?? 8);
}
// Its saving throws ("Strength and Constitution").
export function classSaves(classRecord) {
  return String(classRecord?.data?.proficiencies?.savingthrows?.text ?? "")
    .split(/,|\band\b/i)
    .map(statOf)
    .filter(Boolean);
}
// The skills it lets a character choose from, and how many.
export function classSkillChoices(classRecord) {
  const text = String(classRecord?.data?.proficiencies?.skills?.text ?? "");
  const count = Number(/choose\s+(?:any\s+)?(\d+)/i.exec(text)?.[1] ?? 2);
  const any = /any/i.test(text);
  const names = any ? Object.keys(SKILLS) : text.replace(/^[^:]*:/, "").split(/,|\bor\b|\band\b/i).map(skillKey).filter((key) => SKILLS[key]);
  return { count, names };
}
const martialClass = (classRecord) => /martial/i.test(String(classRecord?.data?.proficiencies?.weapons?.text ?? ""));

// Everything worked out from the base fields: modifiers, proficiency, saves,
// skills, AC, initiative, attacks, passive Perception, spellcasting, the next
// level's XP. Base fields are kept as they are.
export function derive(input) {
  const profile = profileFor(input?.ruleset in PROFILES ? input.ruleset : RULESET);
  const data = { ...input, ruleset: profile.id };
  const level = Math.min(profile.maxLevel, Math.max(1, Math.round(num(data.level, 1))));
  data.level = level;
  data.prof = proficiency(level);
  data.abilities = Object.fromEntries(
    STATS.map((stat) => {
      const row = data.abilities?.[stat] ?? {};
      const score = Math.min(30, Math.max(1, Math.round(num(row.score, 10))));
      const bonus = mod(score);
      const saveprof = num(row.saveprof, 0) ? 1 : 0;
      return [stat, { score, bonus, saveprof, save: bonus + (saveprof ? data.prof : 0) }];
    }),
  );
  data.skills = Object.fromEntries(
    Object.entries(SKILLS).map(([key, [name, stat]]) => {
      const prof = Math.min(2, Math.max(0, Math.round(num(data.skills?.[key]?.prof, 0))));
      return [key, { name, stat, prof, total: data.abilities[stat].bonus + data.prof * prof }];
    }),
  );
  data.ac = { ...armorClass(data), misc: num(data.ac?.misc, 0) };
  data.initiative = { misc: num(data.initiative?.misc, 0), total: data.abilities.dexterity.bonus + num(data.initiative?.misc, 0) };
  data.passive = 10 + data.skills.perception.total;
  data.attacks = {};
  for (const [key, item] of rows(data.inventorylist)) {
    if (!isWeapon(item) || num(item.carried, 1) === 0) continue;
    const attack = weaponAttack(data, item);
    if (attack) data.attacks[key] = attack;
  }
  const className = rows(data.packages).find(([, pkg]) => String(pkg.packagetype).toLowerCase() === "class")?.[1]?.name ?? "";
  const caster = CASTERS[skillKey(className)];
  if (caster) {
    const bonus = data.abilities[caster.stat].bonus;
    data.spellcasting = { stat: caster.stat, dc: 8 + data.prof + bonus, attack: data.prof + bonus };
    const fresh = slotsFor(className, level);
    data.slots = Object.fromEntries(Object.entries(fresh).map(([key, slot]) => [key, { max: slot.max, used: Math.max(0, Math.min(slot.max, Math.round(num(data.slots?.[key]?.used, 0)))) }]));
  } else {
    delete data.spellcasting;
    data.slots = {};
  }
  data.hp = { total: Math.max(1, Math.round(num(data.hp?.total, 1))), wounds: Math.max(0, Math.round(num(data.hp?.wounds, 0))), temp: Math.max(0, Math.round(num(data.hp?.temp, 0))) };
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  data.expnext = profile.xp[level] ?? 0;
  data.deathsaves = { success: Math.max(0, Math.min(3, Math.round(num(data.deathsaves?.success, 0)))), failure: Math.max(0, Math.min(3, Math.round(num(data.deathsaves?.failure, 0)))) };
  if (data.hitdice && typeof data.hitdice === "object") data.hitdice = { ...data.hitdice, used: Math.max(0, Math.round(num(data.hitdice.used, 0))) };
  if (profile.dread) data.dread = Math.min(6, Math.max(0, Math.round(num(data.dread, 0))));
  return data;
}

// A d20 test (check, save, skill) for a character: the modifier and its label.
export function testModifier(data, kind, key) {
  if (kind === "save") return { modifier: num(data.abilities?.[key]?.save, 0), label: `[SAVE] ${titled(key)}` };
  if (kind === "skill") {
    const skill = data.skills?.[key];
    if (!skill) throw new Error(`No skill ${key}.`);
    return { modifier: num(skill.total, 0), label: `[SKILL] ${skill.name}` };
  }
  return { modifier: num(data.abilities?.[key]?.bonus, 0), label: `[CHECK] ${titled(key)}` };
}
// Descending Darkness: at 3 Dread or more, Wisdom checks and saves (and Wisdom
// skills) have disadvantage; chosen advantage cancels it to one die, as in 5E.
export function dreadAdvantage(data, kind, key, advantage = "") {
  if (!profileFor(data).dread || num(data?.dread, 0) < 3) return { advantage, dread: false };
  const stat = kind === "skill" ? SKILLS[skillKey(key)]?.[1] : String(key ?? "").toLowerCase();
  if (stat !== "wisdom") return { advantage, dread: false };
  return { advantage: advantage === "advantage" ? "" : "disadvantage", dread: true };
}
export const titled = (word) => String(word ?? "").replace(/^\w/, (letter) => letter.toUpperCase());

// Builds a character from a spec, as FG's 5E character wizard commits one
// (commitCharacter: basics, ability scores, skills, proficiencies, languages,
// feats, species, background, classes, spells, inventory, currency):
//   { name, species, ancestry, size, class, subclass, background, level,
//     scores {stat: score before the kin's adjustments}, increases {stat: n}
//     (a background's +2/+1, an Ability Score Improvement, misc),
//     skills [the class's choices], backgroundSkills, speciesSkills, expertise,
//     languages, tools, feats [names] (a background's own feat is added),
//     kits { class: "A" | "B" | "C", background: "A" | ... } (the books' starting
//     kits: items and wealth), gear [[item name, count]] (more items, free;
//     armor and shields worn, weapons in hand), coins { GP: n, ... } (custom),
//     wealth (a rolled Legacy starting wealth: kits then give nothing),
//     gold (the main coin, as before), spells [names], alignment, notes, warnings }
// lib: { classes, species, ancestries, backgrounds, subclasses, feats, items, spells }.
// Hit points: the hit die's maximum at level 1 plus CON, then the fixed value
// (half the die + 1) each level (FG's default; a level up from the sheet rolls).
// A kin's ability adjustments ("Dexterity +1, Constitution -1"): {stat: n}.
export function abilityAdjustments(speciesRecord) {
  const out = {};
  for (const match of String(speciesRecord?.data?.abilityadjust ?? "").matchAll(/([a-z]+)\s*([+-]\d+)/gi)) {
    const stat = statOf(match[1]);
    if (stat) out[stat] = (out[stat] ?? 0) + Number(match[2]);
  }
  return out;
}
// Extra hit points each level from the species (SRD 5E's dwarven toughness).
export const toughnessOf = (speciesRecord) => (/hit point maximum increases by 1/i.test(Object.values(speciesRecord?.data?.traits ?? {}).map((trait) => trait?.text ?? "").join(" ")) ? 1 : num(speciesRecord?.data?.hpperlevel, 0));

export function buildFromSpec(spec, lib, rulesetId = RULESET) {
  const profile = profileFor(rulesetId);
  const problems = [];
  const find = (list, name) => (list ?? []).find((record) => String(record.name).toLowerCase() === String(name ?? "").toLowerCase()) ?? null;
  const cls = find(lib.classes, spec.class);
  if (!cls) throw new Error(`No class ${spec.class} in the books (make a 5E Player's Handbook active in Modules).`);
  const species = spec.species || spec.race ? find(lib.species, spec.species ?? spec.race) : null;
  if ((spec.species || spec.race) && !species) problems.push(`No species ${spec.species ?? spec.race}.`);
  const ancestry = spec.ancestry ? find(lib.ancestries, spec.ancestry) : null;
  if (spec.ancestry && !ancestry) problems.push(`No ancestry ${spec.ancestry}.`);
  const background = spec.background ? find(lib.backgrounds, spec.background) : null;
  if (spec.background && !background) problems.push(`No background ${spec.background}.`);
  const subclass = spec.subclass ? find(lib.subclasses, spec.subclass) : null;
  if (spec.subclass && !subclass) problems.push(`No subclass ${spec.subclass}.`);
  const level = Math.min(profile.maxLevel, Math.max(1, Math.round(num(spec.level, 1))));
  const kin = speciesInfo(species, ancestry);
  const bg = backgroundInfo(background, lib.items ?? []);
  const klass = classInfo(cls, level, subclass);
  // The scores chosen, the kin's adjustments (Descending Darkness's kin; SRD species have none), the increases.
  const adjust = abilityAdjustments(species);
  // A Legacy species' own increases count unless a 2024 background gives them (updateAbilities).
  if (!bg?.is2024) for (const [stat, n] of Object.entries(kin?.increases ?? {})) adjust[stat] = (adjust[stat] ?? 0) + n;
  const scores = Object.fromEntries(STATS.map((stat) => [stat, num(spec.scores?.[stat], 10) + (adjust[stat] ?? 0) + num(spec.increases?.[stat], 0)]));
  const saves = classSaves(cls);
  const abilities = Object.fromEntries(STATS.map((stat) => [stat, { score: num(scores[stat], 10), saveprof: saves.includes(stat) ? 1 : 0 }]));
  // Skills: the background's and the species' own and chosen, the class's choices (the spec's, else the first allowed), expertise.
  const skills = {};
  const listed = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  for (const key of [...(bg?.skills.base ?? []), ...(kin?.skills.base ?? []), ...listed(spec.backgroundSkills).map(skillKey), ...listed(spec.speciesSkills).map(skillKey)]) if (SKILLS[key]) skills[key] = { prof: 1 };
  const choices = classSkillChoices(cls);
  const wanted = listed(spec.skills).map(skillKey).filter((key) => SKILLS[key] && !skills[key]);
  const allowed = wanted.filter((key) => choices.names.includes(key));
  for (const key of wanted.filter((key) => !choices.names.includes(key))) problems.push(`${SKILLS[key][0]} is not a ${cls.name} skill.`);
  for (const key of choices.names) if (allowed.length < choices.count && !skills[key] && !allowed.includes(key) && !wanted.length) allowed.push(key);
  for (const key of allowed.slice(0, choices.count)) skills[key] = { prof: 1 };
  for (const key of listed(spec.expertise).map(skillKey)) if (SKILLS[key]) skills[key] = { prof: 2 };
  // Inventory: the starting kits (FG's addCommitInventory: a 2024 class's kit,
  // or a Legacy class's when no wealth was rolled; the background's), then the
  // items added. Armor and shields worn, weapons in hand.
  const inventorylist = {};
  let n = 1;
  const add = (name, count, data) => {
    const existing = Object.values(inventorylist).find((item) => String(item.name).toLowerCase() === String(name).toLowerCase());
    if (existing) {
      existing.count += Math.max(1, Math.round(num(count, 1)));
      return;
    }
    const copy = { ...data };
    delete copy.fgPath;
    delete copy.count;
    inventorylist[`id-${String(n++).padStart(5, "0")}`] = { ...copy, name: copy.name ?? String(name), count: Math.max(1, Math.round(num(count, 1))), carried: isArmor(copy) || isWeapon(copy) ? 2 : 1 };
  };
  const rolled = Math.max(0, Math.round(num(spec.wealth, 0)));
  const processKits = klass.kits.length > 0 || rolled === 0;
  const pickKit = (options, letter, what) => {
    if (!letter) return null;
    const option = options.find((item) => item.letter === String(letter).toUpperCase());
    if (!option) problems.push(`No ${what} kit ${letter}.`);
    return option ?? null;
  };
  const classKit = processKits ? pickKit(klass.kits, spec.kits?.class, `${cls.name}`) : null;
  const backgroundKit = processKits && bg ? pickKit(bg.kits, spec.kits?.background, `${bg.name}`) : null;
  for (const item of [...(classKit?.items ?? []), ...(backgroundKit?.items ?? [])]) add(item.name, item.count, item.data);
  for (const [name, count = 1] of spec.gear ?? []) {
    const item = find(lib.items, name);
    if (!item) problems.push(`No item ${name}.`);
    add(item?.name ?? String(name), count, item ? item.data : { name: String(name) });
  }
  // Coins (updateTotalWealth): custom amounts, the main coin plus the rolled wealth, or the kits' wealth.
  const main = mainCurrency(profile.id);
  const custom = { ...(spec.coins ?? {}) };
  const coinKey = (name) => currenciesOf(profile.id).find((coin) => coin.toLowerCase() === String(name).toLowerCase()) ?? String(name).toUpperCase();
  const customByCoin = {};
  for (const [name, amount] of Object.entries(custom)) customByCoin[coinKey(name)] = (customByCoin[coinKey(name)] ?? 0) + num(amount, 0);
  customByCoin[main] = (customByCoin[main] ?? 0) + Math.max(0, num(spec.gold, 0));
  const backgroundGold = processKits ? (backgroundKit?.wealth ?? 0) + (bg && !bg.kits.length ? bg.gold : 0) : 0;
  const totals = totalWealth({ custom: customByCoin, rolled, classGold: classKit?.wealth ?? 0, backgroundGold, profileId: profile.id });
  for (const [name, amount] of Object.entries(customByCoin)) if (!(name in totals)) totals[name] = amount;
  const coins = {};
  let c = 1;
  for (const [name, amount] of Object.entries(totals)) if (Math.round(amount) > 0) coins[`id-${String(c++).padStart(5, "0")}`] = { name, amount: Math.round(amount) };
  // Feats: the background's own, then those chosen (species, background, class).
  const feats = [...new Set([...(bg?.feat ? [bg.feat] : []), ...listed(spec.feats).map(String)].filter(Boolean))];
  for (const feat of feats) if (lib.feats && !find(lib.feats, feat)) problems.push(`No feat ${feat}.`);
  // Languages: a 2024 species's Common and those chosen; tools.
  const languages = [...new Set([...(kin?.languages.base ?? []), ...(bg?.languages.base ?? []), ...listed(spec.languages).map(String)].filter(Boolean))];
  const tools = [...new Set([...(bg?.tools.base ?? []), ...listed(spec.tools).map(String)].filter(Boolean))];
  const die = hitDie(cls);
  const con = mod(abilities.constitution.score);
  const perLevel = toughnessOf(species);
  const toughness = perLevel * level;
  const hp = die + con + (level - 1) * (Math.floor(die / 2) + 1 + con) + toughness;
  const senses = (() => {
    const dark = /Darkvision with a range of (\d+) feet/i.exec([...Object.values(species?.data?.traits ?? {}), ...Object.values(ancestry?.data?.traits ?? {})].map((trait) => trait.text ?? "").join(" "));
    return dark ? `Darkvision ${dark[1]} ft` : "";
  })();
  const warnings = listed(spec.warnings).map(String).filter(Boolean);
  const data = derive({
    ruleset: profile.id,
    hpperlevel: perLevel,
    level,
    species: species?.name ?? String(spec.species ?? spec.race ?? ""),
    race: species?.name ?? String(spec.species ?? spec.race ?? ""),
    ...(ancestry ? { ancestry: ancestry.name } : {}),
    size: String(spec.size ?? kin?.size ?? "Medium"),
    background: background?.name ?? String(spec.background ?? ""),
    alignment: String(spec.alignment ?? ""),
    notes: [warnings.join("\n"), String(spec.notes ?? "")].filter(Boolean).join("\n\n"),
    abilities,
    skills,
    proficiencies: { martial: martialClass(cls) },
    proficiencylist: { armor: klass.armor, weapons: klass.weapons, tools },
    languages,
    feats,
    traits: (kin?.traits ?? []).map((trait) => String(trait.name)),
    features: klass.features.map((feature) => `${feature.name} (${feature.subclass || cls.name} ${feature.level})`),
    ...(subclass ? { subclass: subclass.name } : {}),
    packages: { "id-00001": { name: cls.name, packagetype: "Class", level, hitdie: die, ...(subclass ? { subclass: subclass.name } : {}) } },
    hitdice: { die, total: level, used: 0 },
    hp: { total: Math.max(1, hp), wounds: 0 },
    speed: String(species?.data?.speed ?? "30 feet").replace(/\s*feet/i, " ft."),
    senses,
    inventorylist,
    coins,
    spells: (spec.spells ?? []).map((name) => find(lib.spells, name)?.name ?? (problems.push(`No spell ${name}.`), null)).filter(Boolean),
    exp: profile.xp[level - 1] ?? 0,
  });
  return { name: String(spec.name ?? "").trim() || "Adventurer", data, problems };
}


// A level up: the hit die rolled (rolled: the die's number) + CON, at least 1; the next level's numbers.
export function levelUp(input, rolled) {
  const data = derive(input);
  const top = profileFor(data).maxLevel;
  if (data.level >= top) throw new Error(`Already level ${top}.`);
  const pkg = rows(data.packages).find(([, item]) => String(item.packagetype).toLowerCase() === "class");
  const die = num(pkg?.[1]?.hitdie, num(data.hitdice?.die, 8));
  const gain = Math.max(1, Math.round(num(rolled, Math.floor(die / 2) + 1)) + data.abilities.constitution.bonus + num(data.hpperlevel, /dwarf/i.test(String(data.species ?? "")) && data.ruleset === RULESET ? 1 : 0));
  const next = { ...data, level: data.level + 1, hp: { ...data.hp, total: data.hp.total + gain } };
  if (pkg) next.packages = { ...data.packages, [pkg[0]]: { ...pkg[1], level: data.level + 1 } };
  next.hitdice = { die, total: data.level + 1, used: num(data.hitdice?.used, 0) };
  return { data: derive(next), gain, die };
}
