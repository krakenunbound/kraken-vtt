// Apeira Astra: Kraken's science fiction game. Plain functions (no Node, no
// DOM) used by the host (building, tasks, combat) and the sheet.
//
// The roll: 2d6 + skill level + characteristic modifier, against 8. The
// margin is the Effect: it says how well it went, and adds to damage. A Boon
// rolls 3d6 and keeps the best two; a Bane keeps the worst two. Untrained in
// a skill: -3. Difficulties shift the roll (Easy +2 ... Desperate -6).
//
// A character's record data:
//   ruleset "astra", origin, paths [major, minor], level 1 (Apeira Astra has no
//   levels: characters improve by spending experience), characteristics
//   {brawn, reflex, grit, intellect, training, presence: {score, dm}},
//   skills {key: {name, level}}, hp {total (Stamina), wounds}, ac {total
//   (Armour: what it takes off each hit), armor}, initiative {total},
//   inventorylist (weapons: damage "3d6", skill; armour: protection), coins
//   (credits), exp, attacks {key: {name, bonus, damage, skill, type}}.

export const RULESET = "astra";
export const RULESET_NAME = "Apeira Astra";
export const STATS = ["brawn", "reflex", "grit", "intellect", "training", "presence"];
export const STAT_NAMES = { brawn: "Brawn", reflex: "Reflex", grit: "Grit", intellect: "Intellect", training: "Training", presence: "Presence" };
export const SHORT = { brawn: "BRN", reflex: "REF", grit: "GRT", intellect: "INT", training: "TRN", presence: "PRS" };
export const TARGET = 8;
export const UNTRAINED = -3;
// The spread to assign at creation (or roll 2d6 for each).
export const SPREAD = [10, 9, 8, 7, 6, 5];
export const DIFFICULTIES = [
  ["Trivial", 4],
  ["Easy", 2],
  ["Standard", 0],
  ["Hard", -2],
  ["Daunting", -4],
  ["Desperate", -6],
];

// A characteristic's modifier.
export function dm(score) {
  const value = Number(score) || 0;
  if (value <= 2) return -2;
  if (value <= 5) return -1;
  if (value <= 8) return 0;
  if (value <= 11) return 1;
  if (value <= 14) return 2;
  return 3;
}
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);

// The skills, and the characteristic each is usually rolled with.
export const SKILLS = {
  athletics: ["Athletics", "brawn"],
  melee: ["Melee", "brawn"],
  firearms: ["Firearms", "reflex"],
  heavyweapons: ["Heavy Weapons", "brawn"],
  gunnery: ["Gunnery", "intellect"],
  pilot: ["Pilot", "reflex"],
  drive: ["Drive", "reflex"],
  astrogation: ["Astrogation", "training"],
  engineering: ["Engineering", "training"],
  mechanics: ["Mechanics", "intellect"],
  electronics: ["Electronics", "training"],
  medicine: ["Medicine", "training"],
  science: ["Science", "training"],
  streetwise: ["Streetwise", "presence"],
  persuade: ["Persuade", "presence"],
  deceive: ["Deceive", "presence"],
  leadership: ["Leadership", "presence"],
  stealth: ["Stealth", "reflex"],
  survival: ["Survival", "grit"],
  recon: ["Recon", "intellect"],
  zerog: ["Zero-G", "reflex"],
  trade: ["Trade", "presence"],
  tactics: ["Tactics", "intellect"],
};
export const skillKey = (name) => String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
export const skillName = (key) => SKILLS[key]?.[0] ?? key;

// "Firearms 1, Pilot 0" -> {firearms: 1, pilot: 0}.
export function skillList(text) {
  const out = {};
  for (const part of String(text ?? "").split(",")) {
    const match = /^\s*([A-Za-z -]+?)\s*(-?\d+)?\s*$/.exec(part);
    if (!match) continue;
    const key = skillKey(match[1]);
    if (SKILLS[key]) out[key] = match[2] !== undefined ? Number(match[2]) : 0;
  }
  return out;
}

export const isWeapon = (item) => /weapon/i.test(String(item?.type ?? "")) && /\d*d\d+/.test(String(item?.damage ?? ""));
export const isArmour = (item) => /armou?r/i.test(String(item?.type ?? ""));
const equipped = (item) => num(item?.carried, 1) === 2;

// A weapon's attack for a character: the skill and the characteristic it uses.
export function weaponAttack(data, item) {
  const skill = skillKey(item.skill || (/melee|blade|club|knife|baton|axe|sword/i.test(`${item.subtype} ${item.name}`) ? "melee" : "firearms"));
  const stat = skill === "melee" || skill === "heavyweapons" ? "brawn" : "reflex";
  const level = data.skills?.[skill]?.level;
  const trained = level !== undefined && level !== null;
  const bonus = (trained ? num(level, 0) : UNTRAINED) + num(data.characteristics?.[stat]?.dm, 0) + num(item.bonus, 0);
  return { name: String(item.name), bonus, damage: String(item.damage).split(/\s/)[0], skill, stat, type: skill === "melee" ? "melee" : "ranged", range: String(item.range ?? "") };
}

// Everything worked out from the base fields.
export function derive(input) {
  const data = { ...input, ruleset: RULESET, level: 1 };
  data.characteristics = Object.fromEntries(
    STATS.map((stat) => {
      const score = Math.min(15, Math.max(1, Math.round(num(input.characteristics?.[stat]?.score, 7))));
      return [stat, { score, dm: dm(score) }];
    }),
  );
  data.skills = Object.fromEntries(
    rows(input.skills)
      .filter(([key]) => SKILLS[key])
      .map(([key, row]) => [key, { name: SKILLS[key][0], stat: SKILLS[key][1], level: Math.min(4, Math.max(0, Math.round(num(row.level, 0)))) }]),
  );
  const stamina = data.characteristics.brawn.score + data.characteristics.reflex.score + data.characteristics.grit.score;
  data.hp = { total: stamina, wounds: Math.max(0, Math.round(num(input.hp?.wounds, 0))) };
  // Armour: the best armour worn (protection), and what else adds (a helmet does not stack).
  let protection = 0;
  let wearing = "";
  for (const [, item] of rows(data.inventorylist)) {
    if (!isArmour(item) || !equipped(item)) continue;
    const value = num(item.protection, num(item.ac, 0));
    if (value > protection) {
      protection = value;
      wearing = String(item.name ?? "");
    }
  }
  data.ac = { total: protection + num(input.ac?.misc, 0), armor: wearing, misc: num(input.ac?.misc, 0) };
  data.initiative = { misc: num(input.initiative?.misc, 0), total: data.characteristics.reflex.dm + num(data.skills.tactics?.level, 0) + num(input.initiative?.misc, 0) };
  data.attacks = {};
  for (const [key, item] of rows(data.inventorylist)) {
    if (!isWeapon(item) || num(item.carried, 1) === 0) continue;
    data.attacks[key] = weaponAttack(data, item);
  }
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  data.expnext = 0;
  return data;
}

// A task's modifier: a skill (with its usual characteristic, or another named),
// or a characteristic alone.
export function taskModifier(data, skill, stat) {
  const key = skill ? skillKey(skill) : "";
  const useStat = stat || (key ? SKILLS[key]?.[1] : "") || "intellect";
  const characteristic = num(data.characteristics?.[useStat]?.dm, 0);
  if (!key) return { modifier: characteristic, label: `[CHECK] ${STAT_NAMES[useStat] ?? useStat}` };
  const level = data.skills?.[key]?.level;
  const trained = level !== undefined && level !== null;
  return { modifier: (trained ? num(level, 0) : UNTRAINED) + characteristic, label: `[SKILL] ${skillName(key)}${trained ? ` ${level}` : " (untrained)"} (${STAT_NAMES[useStat]})` };
}

// Experience: a skill's next level costs that level x 2 (level 0: 1); a
// characteristic +1 costs 6.
export const skillCost = (level) => (level <= 0 ? 1 : level * 2);

// An NPC's attacks from its actions' text: "Rifle: Attack +2 (3d6), 300 m."
export function npcAttacks(data) {
  const out = {};
  for (const [key, action] of rows(data?.actions)) {
    const match = /Attack\s*([+-]\d+)\s*\(([^)]+)\)/i.exec(String(action?.desc ?? ""));
    if (!match) continue;
    out[key] = { name: String(action.name ?? "Attack"), bonus: Number(match[1]), damage: match[2].replace(/\s+/g, ""), type: /melee|claw|bite|blade|club/i.test(`${action.name} ${action.desc}`) ? "melee" : "ranged" };
  }
  return out;
}
export function npcStats(data) {
  return { hp: Math.max(1, Math.round(num(data?.hp, 1))), ac: Math.round(num(data?.armour ?? data?.ac, 0)), init: num(data?.initiative?.total, dm(data?.characteristics?.reflex?.score ?? 7)) };
}

// Builds a character from a spec, as the Apeira Astra wizard does:
//   { name, origin, major, minor, characteristics {stat: score}, majorSkills
//     [names], minorSkills [names], gear [[item name, count]], credits }
// lib: { origins (race records), paths (class records), items }. The origin
// gives its skills; the major Path its signature skill at 1 and four picks
// (+1 each); the minor Path two picks; no skill above 3.
export function buildFromSpec(spec, lib) {
  const problems = [];
  const find = (list, name) => list.find((record) => String(record.name).toLowerCase() === String(name ?? "").toLowerCase()) ?? null;
  const origin = find(lib.origins, spec.origin);
  const major = find(lib.paths, spec.major);
  const minor = spec.minor ? find(lib.paths, spec.minor) : null;
  if (!major) throw new Error(`No Path ${spec.major} in the books (make the Apeira Astra Crew Handbook active).`);
  if (spec.origin && !origin) problems.push(`No origin ${spec.origin}.`);
  if (spec.minor && !minor) problems.push(`No Path ${spec.minor}.`);
  const skills = {};
  const raise = (key, to) => {
    if (!SKILLS[key]) return;
    skills[key] = { level: Math.min(3, Math.max(skills[key]?.level ?? -1, to)) };
  };
  // A pick: +1 to a skill (a new one starts at 1).
  const add = (key) => {
    if (!SKILLS[key]) return;
    skills[key] = { level: Math.min(3, skills[key] ? skills[key].level + 1 : 1) };
  };
  for (const [key, level] of Object.entries(skillList(origin?.data?.skills))) raise(key, level);
  const signature = skillKey(major.data?.signature);
  raise(signature, 1);
  const pickFrom = (path, picks, count) => {
    const allowed = Object.keys(skillList(path?.data?.skills));
    const wanted = (picks ?? []).map(skillKey).filter((key) => SKILLS[key]);
    for (const key of wanted.filter((key) => !allowed.includes(key))) problems.push(`${skillName(key)} is not a ${path.name} skill.`);
    const chosen = wanted.filter((key) => allowed.includes(key)).slice(0, count);
    for (const key of allowed) if (chosen.length < count && !chosen.includes(key) && !wanted.length) chosen.push(key);
    for (const key of chosen) add(key);
  };
  pickFrom(major, spec.majorSkills, 4);
  if (minor) pickFrom(minor, spec.minorSkills, 2);
  const characteristics = Object.fromEntries(STATS.map((stat) => [stat, { score: num(spec.characteristics?.[stat], 7) }]));
  const inventorylist = {};
  let n = 1;
  for (const [name, count = 1] of spec.gear ?? []) {
    const item = find(lib.items, name);
    if (!item) problems.push(`No item ${name}.`);
    const data = item ? { ...item.data } : { name: String(name) };
    delete data.fgPath;
    inventorylist[`id-${String(n++).padStart(5, "0")}`] = { ...data, name: data.name ?? String(name), count: Math.max(1, Math.round(num(count, 1))), carried: isArmour(data) || isWeapon(data) ? 2 : 1 };
  }
  const credits = Math.round(num(spec.credits, num(major.data?.credits, 0) + num(minor?.data?.credits, 0) / 2));
  const data = derive({
    origin: origin?.name ?? String(spec.origin ?? ""),
    race: origin?.name ?? "",
    paths: [major.name, ...(minor ? [minor.name] : [])],
    packages: { "id-00001": { name: major.name, packagetype: "Class", level: 1 } },
    characteristics,
    skills,
    inventorylist,
    coins: credits > 0 ? { "id-00001": { name: "cr", amount: credits } } : {},
    notes: String(spec.notes ?? ""),
    exp: 0,
  });
  return { name: String(spec.name ?? "").trim() || "Spacer", data, problems };
}
