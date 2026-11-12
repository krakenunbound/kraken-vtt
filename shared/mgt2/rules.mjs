// Traveller (Mongoose Traveller 2nd Edition, as FG's MGT2 ruleset plays it):
// Kraken's own code for the game's mechanics, as numbers (no book text). Plain
// functions (no Node, no DOM) used by the host (building, tasks, combat) and
// the sheet.
//
// The roll: 2d6 + a characteristic's DM + a skill's level, against a
// difficulty (Average 8); the margin is the Effect, added to damage. A Boon
// rolls 3d6 and keeps the best two, a Bane the worst two. Untrained in a
// skill: -3 (Jack-of-all-Trades takes that off, a level a point). Damage goes
// to Endurance first, then Strength, then Dexterity (FG's order); with
// Endurance and one more at 0 the Traveller is unconscious, with all three
// dead. Animals have Hits instead.
//
// A character's record data:
//   ruleset "mgt2", species, homeworld, careers [{name, terms, rank}], age,
//   characteristics {str, dex, end, int, edu, soc: {score, dm, now}}, upp,
//   skills {key: {name, level}} (key "guncombat-slug" for a speciality),
//   hp {total (STR + DEX + END), wounds}, ac {total (armour's protection),
//   armor}, initiative {total}, inventorylist (weapons: damage "3D", skill,
//   traits; armour: protection), coins (credits), attacks {key: {name, bonus,
//   damage, skill, type, range, ap}}.

export const RULESET = "mgt2";
export const RULESET_NAME = "Traveller";
export const STATS = ["str", "dex", "end", "int", "edu", "soc"];
export const STAT_NAMES = { str: "Strength", dex: "Dexterity", end: "Endurance", int: "Intellect", edu: "Education", soc: "Social Standing" };
export const SHORT = { str: "STR", dex: "DEX", end: "END", int: "INT", edu: "EDU", soc: "SOC" };
export const PHYSICAL = ["end", "str", "dex"];
export const UNTRAINED = -3;
// Difficulties: the number to reach.
export const DIFFICULTIES = [
  ["Simple", 2],
  ["Easy", 4],
  ["Routine", 6],
  ["Average", 8],
  ["Difficult", 10],
  ["Very Difficult", 12],
  ["Formidable", 14],
];
export const CAREERS = ["Agent", "Army", "Citizen", "Drifter", "Entertainer", "Marine", "Merchant", "Navy", "Noble", "Prisoner", "Rogue", "Scholar", "Scout"];

export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const titled = (word) => String(word ?? "").replace(/\b\w/g, (letter) => letter.toUpperCase());

// A characteristic's DM: 0 -3, 1-2 -2, 3-5 -1, 6-8 0, 9-11 +1, 12-14 +2, 15+ +3.
export function dm(score) {
  const value = Math.floor(num(score, 0));
  if (value <= 0) return -3;
  if (value <= 2) return -2;
  if (value <= 5) return -1;
  if (value <= 8) return 0;
  if (value <= 11) return 1;
  if (value <= 14) return 2;
  return 3;
}
// The Universal Personality Profile: each characteristic as one digit (10 is A).
export const hex = (value) => {
  const n = Math.max(0, Math.floor(num(value, 0)));
  return n < 10 ? String(n) : n < 34 ? "ABCDEFGHJKLMNPQRSTUVWXYZ"[n - 10] : "Z";
};
export const uppOf = (characteristics) => STATS.map((stat) => hex(characteristics?.[stat]?.score)).join("");

// The skills: the characteristic each is usually rolled with, and its specialities.
export const SKILLS = {
  admin: ["Admin", "edu", []],
  advocate: ["Advocate", "edu", []],
  animals: ["Animals", "int", ["Handling", "Veterinary", "Training"]],
  art: ["Art", "int", ["Performer", "Holography", "Instrument", "Visual Media", "Write"]],
  astrogation: ["Astrogation", "edu", []],
  athletics: ["Athletics", "dex", ["Dexterity", "Endurance", "Strength"]],
  broker: ["Broker", "int", []],
  carouse: ["Carouse", "soc", []],
  deception: ["Deception", "int", []],
  diplomat: ["Diplomat", "soc", []],
  drive: ["Drive", "dex", ["Hovercraft", "Mole", "Track", "Walker", "Wheel"]],
  electronics: ["Electronics", "edu", ["Comms", "Computers", "Remote Ops", "Sensors"]],
  engineer: ["Engineer", "edu", ["M-Drive", "J-Drive", "Life Support", "Power"]],
  explosives: ["Explosives", "edu", []],
  flyer: ["Flyer", "dex", ["Airship", "Grav", "Ornithopter", "Rotor", "Wing"]],
  gambler: ["Gambler", "int", []],
  gunner: ["Gunner", "dex", ["Turret", "Ortillery", "Screen", "Capital"]],
  guncombat: ["Gun Combat", "dex", ["Archaic", "Energy", "Slug"]],
  heavyweapons: ["Heavy Weapons", "dex", ["Artillery", "Portable", "Vehicle"]],
  investigate: ["Investigate", "int", []],
  jackofalltrades: ["Jack-of-all-Trades", "int", []],
  language: ["Language", "edu", ["Galanglic", "Vilani", "Zdetl", "Oynprith", "Trokh", "Gvegh"]],
  leadership: ["Leadership", "soc", []],
  mechanic: ["Mechanic", "edu", []],
  medic: ["Medic", "edu", []],
  melee: ["Melee", "str", ["Unarmed", "Blade", "Bludgeon", "Natural"]],
  navigation: ["Navigation", "int", []],
  persuade: ["Persuade", "soc", []],
  pilot: ["Pilot", "dex", ["Small Craft", "Spacecraft", "Capital Ships"]],
  profession: ["Profession", "int", ["Belter", "Biologicals", "Civil Engineering", "Construction", "Hydroponics", "Polymers"]],
  recon: ["Recon", "int", []],
  science: ["Science", "edu", ["Archaeology", "Astronomy", "Biology", "Chemistry", "Cosmology", "Cybernetics", "Economics", "Genetics", "History", "Linguistics", "Philosophy", "Physics", "Planetology", "Psionicology", "Psychology", "Robotics", "Sophontology", "Xenology"]],
  seafarer: ["Seafarer", "dex", ["Ocean Ships", "Personal", "Sail", "Submarine"]],
  stealth: ["Stealth", "dex", []],
  steward: ["Steward", "soc", []],
  streetwise: ["Streetwise", "int", []],
  survival: ["Survival", "end", []],
  tactics: ["Tactics", "int", ["Military", "Naval"]],
  vaccsuit: ["Vacc Suit", "dex", []],
};
const slug = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// "Gun Combat (Slug)", "guncombat-slug", "Gun Combat" -> { base, spec, key }.
const baseOf = (text) => {
  const base = slug(text);
  return SKILLS[base] ? base : Object.keys(SKILLS).find((key) => slug(SKILLS[key][0]) === base) ?? null;
};
export function skillKey(name) {
  const text = String(name ?? "").trim();
  // The whole name a skill's ("Jack-of-all-Trades"); else "Skill (Speciality)"; else "skill-speciality".
  const whole = baseOf(text);
  if (whole) return { base: whole, spec: "", key: whole };
  const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(text);
  const dash = !paren ? /^([a-z]+)-(.+)$/i.exec(text) : null;
  const baseKey = baseOf(paren?.[1] ?? dash?.[1] ?? text) ?? slug(paren?.[1] ?? dash?.[1] ?? text);
  const specText = paren?.[2] ?? dash?.[2] ?? "";
  const spec = specText ? (SKILLS[baseKey]?.[2].find((item) => slug(item) === slug(specText)) ?? titled(specText)) : "";
  return { base: baseKey, spec, key: spec ? `${baseKey}-${slug(spec)}` : baseKey };
}
export const skillName = (key) => {
  const [base, spec] = String(key).split("-");
  const name = SKILLS[base]?.[0] ?? titled(base);
  const special = spec ? SKILLS[base]?.[2].find((item) => slug(item) === spec) ?? titled(spec) : "";
  return special ? `${name} (${special})` : name;
};
// "Gun Combat (Slug) 1, Pilot 0" -> { "guncombat-slug": 1, pilot: 0 }.
export function skillList(text) {
  const out = {};
  for (const part of String(text ?? "").split(/,(?![^(]*\))/)) {
    const match = /^\s*(.+?)\s*(-?\d+)?\s*$/.exec(part);
    if (!match) continue;
    const { base, key } = skillKey(match[1]);
    if (SKILLS[base]) out[key] = match[2] !== undefined ? Number(match[2]) : 0;
  }
  return out;
}
// A skill's level: the speciality's, else the skill held at all (0 for a skill
// with specialities, its own level for one without); null: untrained.
export function levelOf(data, name) {
  const { base, key, spec } = typeof name === "object" ? name : skillKey(name);
  const skills = data?.skills ?? {};
  if (spec && skills[key]) return num(skills[key].level, 0);
  if (skills[base]) return SKILLS[base]?.[2].length && spec ? 0 : num(skills[base].level, 0);
  const anySpec = Object.keys(skills).filter((item) => item.startsWith(`${base}-`));
  if (anySpec.length) return spec ? 0 : Math.max(...anySpec.map((item) => num(skills[item].level, 0)));
  return null;
}
export const untrainedDm = (data) => Math.min(0, UNTRAINED + Math.max(0, num(data?.skills?.jackofalltrades?.level, 0)));

// Weapons: name, TL, range, damage, magazine, skill, traits.
export const WEAPONS = [
  ["Unarmed", 0, "Melee", "1D", 0, "Melee (Unarmed)", ""],
  ["Dagger", 1, "Melee", "1D+2", 0, "Melee (Blade)", ""],
  ["Blade", 2, "Melee", "2D", 0, "Melee (Blade)", ""],
  ["Cutlass", 2, "Melee", "3D", 0, "Melee (Blade)", ""],
  ["Broadsword", 2, "Melee", "4D", 0, "Melee (Blade)", "Bulky"],
  ["Club", 1, "Melee", "2D", 0, "Melee (Bludgeon)", ""],
  ["Stunstick", 8, "Melee", "2D", 0, "Melee (Bludgeon)", "Stun"],
  ["Body Pistol", 8, "5", "2D", 6, "Gun Combat (Slug)", ""],
  ["Snub Pistol", 8, "5", "3D-3", 6, "Gun Combat (Slug)", "Zero-G"],
  ["Revolver", 5, "10", "3D-3", 6, "Gun Combat (Slug)", ""],
  ["Autopistol", 6, "10", "3D-3", 15, "Gun Combat (Slug)", ""],
  ["Gauss Pistol", 13, "20", "3D", 40, "Gun Combat (Slug)", "AP 3, Auto 2"],
  ["Shotgun", 4, "50", "4D", 6, "Gun Combat (Slug)", "Bulky"],
  ["Submachine Gun", 6, "25", "3D", 20, "Gun Combat (Slug)", "Auto 3"],
  ["Rifle", 5, "250", "3D", 20, "Gun Combat (Slug)", ""],
  ["Autorifle", 6, "300", "3D", 20, "Gun Combat (Slug)", "Auto 2"],
  ["Assault Rifle", 7, "200", "3D", 30, "Gun Combat (Slug)", "Auto 2"],
  ["Gauss Rifle", 12, "600", "4D", 80, "Gun Combat (Slug)", "AP 5, Auto 3"],
  ["Laser Pistol", 9, "20", "3D", 100, "Gun Combat (Energy)", "Zero-G"],
  ["Laser Carbine", 10, "150", "4D", 50, "Gun Combat (Energy)", "Zero-G"],
  ["Laser Rifle", 9, "200", "5D", 100, "Gun Combat (Energy)", "Zero-G"],
  ["Frag Grenade", 6, "20", "5D", 0, "Athletics (Dexterity)", "Blast 9"],
];
// Armour: name, TL, protection.
export const ARMOUR = [
  ["Jack", 1, 1],
  ["Mesh", 6, 2],
  ["Flak Jacket", 7, 3],
  ["Vacc Suit", 8, 4],
  ["Cloth", 10, 5],
  ["Hostile Environment Vacc Suit", 12, 8],
  ["Combat Armour", 10, 13],
  ["Battle Dress", 13, 22],
];
const byName = (list, name) => list.find((row) => slug(row[0]) === slug(name)) ?? null;
// A weapon or armour as an inventory item.
export function makeItem(name) {
  const weapon = byName(WEAPONS, name);
  if (weapon) return { name: weapon[0], type: "Weapon", subtype: weapon[2] === "Melee" ? "Melee" : "Ranged", tl: weapon[1], range: weapon[2], damage: weapon[3], magazine: weapon[4], skill: weapon[5], traits: weapon[6] };
  const armour = byName(ARMOUR, name);
  if (armour) return { name: armour[0], type: "Armour", tl: armour[1], protection: armour[2] };
  return null;
}
export const isWeapon = (item) => /weapon/i.test(String(item?.type ?? "")) && /\d*\s*d/i.test(String(item?.damage ?? ""));
export const isArmour = (item) => /armou?r/i.test(String(item?.type ?? ""));
const equipped = (item) => num(item?.carried, 1) === 2;
// Traveller's damage ("3D-3", "2D+2", "1D", "4d6") as a dice formula.
export function diceOf(text) {
  const match = /(\d*)\s*d\s*(\d+)?\s*([+-]\s*\d+)?/i.exec(String(text ?? ""));
  if (!match) return "";
  const count = match[1] || "1";
  const sides = match[2] || "6";
  const bonus = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;
  return `${count}d${sides}${bonus ? signed(bonus) : ""}`;
}
// A weapon's AP (armour piercing) from its traits.
export const apOf = (traits) => num(/\bAP\s*(\d+)/i.exec(String(traits ?? ""))?.[1], 0);

// Endurance, Strength and Dexterity as they are now: damage off Endurance
// first, then Strength, then Dexterity.
export function physicalNow(scores, wounds) {
  let left = Math.max(0, num(wounds, 0));
  const out = {};
  for (const stat of PHYSICAL) {
    const score = Math.max(0, num(scores?.[stat], 0));
    const taken = Math.min(score, left);
    out[stat] = score - taken;
    left -= taken;
  }
  return out;
}
// The state of a body by its damage: Unconscious with Endurance and one more
// at 0, Dead with all three.
export function bodyState(scores, wounds) {
  const now = physicalNow(scores, wounds);
  const zero = PHYSICAL.filter((stat) => now[stat] <= 0).length;
  return zero >= 3 ? "Dead" : now.end <= 0 && zero >= 2 ? "Unconscious" : num(wounds, 0) > 0 ? "Wounded" : "Healthy";
}

// A weapon's attack for a character: its skill, and the DM it uses (Dexterity
// for guns; for a melee weapon the better of Strength and Dexterity).
export function weaponAttack(data, item) {
  const known = byName(WEAPONS, item.name);
  const skillText = String(item.skill || known?.[5] || (/melee/i.test(`${item.subtype ?? ""} ${item.range ?? ""}`) ? "Melee (Blade)" : "Gun Combat (Slug)"));
  const skill = skillKey(skillText);
  const melee = skill.base === "melee";
  const statDm = (stat) => num(data.characteristics?.[stat]?.dm, 0);
  const stat = melee && statDm("str") > statDm("dex") ? "str" : "dex";
  const level = levelOf(data, skill);
  const bonus = (level === null ? untrainedDm(data) : level) + statDm(stat) + num(item.bonus, 0);
  const traits = String(item.traits ?? known?.[6] ?? "");
  return { name: String(item.name), bonus, damage: diceOf(item.damage || known?.[3]), skill: skill.key, stat, type: melee ? "melee" : "ranged", range: String(item.range ?? known?.[2] ?? ""), traits, ap: apOf(traits) };
}

// Everything worked out from the base fields.
export function derive(input) {
  const data = { ...input, ruleset: RULESET, level: 1 };
  const scores = Object.fromEntries(STATS.map((stat) => [stat, Math.min(20, Math.max(0, Math.round(num(input.characteristics?.[stat]?.score, 7))))]));
  const total = scores.str + scores.dex + scores.end;
  const wounds = Math.min(total, Math.max(0, Math.round(num(input.hp?.wounds, 0))));
  const now = physicalNow(scores, wounds);
  // A characteristic's DM is its current value's: a wounded Strength is weaker.
  data.characteristics = Object.fromEntries(STATS.map((stat) => {
    const current = PHYSICAL.includes(stat) ? now[stat] : scores[stat];
    return [stat, { score: scores[stat], now: current, dm: dm(current) }];
  }));
  data.upp = uppOf(data.characteristics);
  data.skills = Object.fromEntries(
    rows(input.skills)
      .map(([key, row]) => [skillKey(key.includes("-") ? key.replace("-", " (") + ")" : key).key, row])
      .filter(([key]) => SKILLS[key.split("-")[0]])
      .map(([key, row]) => [key, { name: skillName(key), stat: SKILLS[key.split("-")[0]][1], level: Math.min(6, Math.max(0, Math.round(num(row?.level, 0)))) }]),
  );
  data.hp = { total, wounds, state: bodyState(scores, wounds) };
  let protection = 0;
  let wearing = "";
  for (const [, item] of rows(data.inventorylist)) {
    if (!isArmour(item) || !equipped(item)) continue;
    const value = num(item.protection, num(item.ac, 0));
    if (value > protection) [protection, wearing] = [value, String(item.name ?? "")];
  }
  data.ac = { total: protection + num(input.ac?.misc, 0), armor: wearing, misc: num(input.ac?.misc, 0) };
  // Initiative: 2d6 + the better of DEX and INT DM.
  data.initiative = { misc: num(input.initiative?.misc, 0), total: Math.max(data.characteristics.dex.dm, data.characteristics.int.dm) + num(input.initiative?.misc, 0) };
  data.attacks = {};
  for (const [key, item] of rows(data.inventorylist)) {
    if (!isWeapon(item) || num(item.carried, 1) === 0) continue;
    data.attacks[key] = weaponAttack(data, item);
  }
  data.attacks.unarmed = weaponAttack(data, { name: "Unarmed", damage: "1D", skill: "Melee (Unarmed)", range: "Melee" });
  const careers = Array.isArray(input.careers) ? input.careers.filter((item) => item && item.name).map((item) => ({ name: String(item.name), terms: Math.max(0, Math.round(num(item.terms, 1))), rank: Math.max(0, Math.round(num(item.rank, 0))) })) : [];
  data.careers = careers;
  data.terms = careers.reduce((sum, item) => sum + item.terms, 0);
  data.age = Math.round(num(input.age, 18 + 4 * data.terms));
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  return data;
}

// A task's modifier: a skill (with its usual characteristic, or another named),
// or a characteristic alone.
export function taskModifier(data, skill, stat) {
  const parsed = skill ? skillKey(skill) : null;
  const useStat = STATS.includes(stat) ? stat : parsed ? SKILLS[parsed.base]?.[1] ?? "int" : "int";
  const characteristic = num(data.characteristics?.[useStat]?.dm, 0);
  if (!parsed) return { modifier: characteristic, label: `[CHECK] ${STAT_NAMES[useStat]}` };
  const level = levelOf(data, parsed);
  const name = skillName(parsed.key);
  return { modifier: (level === null ? untrainedDm(data) : level) + characteristic, label: `[SKILL] ${name}${level === null ? " (untrained)" : ` ${level}`} (${SHORT[useStat]})` };
}

// An NPC: characteristics (FG MGT2's strength, dexterity... or Kraken's
// characteristics), skills, weapons, armour; or an animal's Hits.
const NPC_FIELDS = { str: "strength", dex: "dexterity", end: "endurance", int: "intelligence", edu: "education", soc: "social" };
export function npcScores(data) {
  const out = {};
  for (const stat of STATS) {
    const value = data?.characteristics?.[stat]?.score ?? data?.attributes?.[NPC_FIELDS[stat]] ?? data?.[NPC_FIELDS[stat]] ?? data?.[stat];
    if (value !== undefined && value !== "" && Number.isFinite(Number(value))) out[stat] = Number(value);
  }
  return PHYSICAL.every((stat) => out[stat] !== undefined) ? { ...Object.fromEntries(STATS.map((stat) => [stat, 7])), ...out } : null;
}
export function npcStats(data) {
  const scores = npcScores(data);
  const hits = num(data?.hits, 0);
  const total = scores ? scores.str + scores.dex + scores.end : Math.max(1, hits || 10);
  const sheet = derive({ characteristics: Object.fromEntries(STATS.map((stat) => [stat, { score: scores?.[stat] ?? 7 }])), skills: typeof data?.skills === "string" ? Object.fromEntries(Object.entries(skillList(data.skills)).map(([key, level]) => [key, { level }])) : data?.skills ?? {}, inventorylist: {} });
  const attacks = [];
  for (const [, weapon] of rows(data?.weapons ?? data?.weaponlist)) {
    const plan = weaponAttack(sheet, { ...weapon, name: weapon.name ?? "Attack" });
    if (!plan.damage) continue;
    attacks.push({ ...plan, bonus: weapon.bonus !== undefined ? num(weapon.bonus, 0) : plan.bonus });
  }
  for (const [, action] of rows(data?.actions)) {
    const match = /Attack\s*([+-]\d+)\s*\(([^)]+)\)/i.exec(String(action?.desc ?? ""));
    if (match) attacks.push({ name: String(action.name ?? "Attack"), bonus: Number(match[1]), damage: diceOf(match[2]), type: /melee|claw|bite|blade|club|natural/i.test(`${action.name} ${action.desc}`) ? "melee" : "ranged", ap: apOf(action.desc), traits: "" });
  }
  if (attacks.length === 0 && data?.damage) attacks.push({ name: titled(String(data.weapon ?? data.attackname ?? "Attack")), bonus: num(data.attack, 0), damage: diceOf(data.damage), type: "melee", ap: 0, traits: "" });
  return {
    animal: !scores,
    scores,
    hp: total,
    ac: Math.round(num(data?.armour ?? data?.armor ?? data?.protection ?? data?.ac, 0)),
    init: scores ? sheet.initiative.total : num(data?.initiative, 0),
    attacks,
  };
}

// Builds a Traveller from a spec, as the Traveller wizard does:
//   { name, species, homeworld, characteristics {str: 7, ...} (2 to 15),
//     careers [{name, terms, rank}] (or career, terms, rank), skills
//     {"Gun Combat (Slug)": 1, ...} or "Pilot (Small Craft) 1, Vacc Suit 0",
//     gear [names or [name, count]], credits, age, notes }
// lib: { items } (the campaign's, from the books), else Kraken's weapon and
// armour table.
export function buildFromSpec(spec, lib = {}) {
  const problems = [];
  const characteristics = {};
  for (const stat of STATS) {
    const value = Math.round(num(spec?.characteristics?.[stat], 7));
    if (value < 2 || value > 15) problems.push(`${STAT_NAMES[stat]} ${value}: a new Traveller's are 2 to 15.`);
    characteristics[stat] = { score: Math.min(15, Math.max(1, value)) };
  }
  const careers = Array.isArray(spec?.careers) ? spec.careers : spec?.career ? [{ name: spec.career, terms: spec.terms ?? 1, rank: spec.rank ?? 0 }] : [];
  for (const career of careers) if (!CAREERS.some((name) => slug(name) === slug(career.name))) problems.push(`${career.name} is not one of the core careers (kept as written).`);
  const skillsIn = typeof spec?.skills === "string" ? skillList(spec.skills) : Object.fromEntries(Object.entries(spec?.skills ?? {}).map(([name, level]) => [skillKey(name).key, num(typeof level === "object" ? level?.level : level, 0)]));
  const skills = {};
  for (const [key, level] of Object.entries(skillsIn)) {
    if (!SKILLS[key.split("-")[0]]) {
      problems.push(`No skill ${key}.`);
      continue;
    }
    if (level > 4) problems.push(`${skillName(key)} ${level}: above 4 is rare for a new Traveller.`);
    skills[key] = { level: Math.max(0, Math.round(level)) };
  }
  const inventorylist = {};
  let n = 1;
  for (const entry of spec?.gear ?? []) {
    const [name, count = 1] = Array.isArray(entry) ? entry : [entry, 1];
    const fromBooks = (lib.items ?? []).find((item) => slug(item.name) === slug(name));
    const data = fromBooks ? { ...fromBooks.data, name: fromBooks.name } : makeItem(name);
    if (!data) {
      problems.push(`No item ${name}.`);
      continue;
    }
    delete data.fgPath;
    inventorylist[`id-${String(n++).padStart(5, "0")}`] = { ...data, count: Math.max(1, Math.round(num(count, 1))), carried: isArmour(data) || isWeapon(data) ? 2 : 1 };
  }
  const credits = Math.round(num(spec?.credits, 0));
  const data = derive({
    species: String(spec?.species ?? "Human"),
    race: String(spec?.species ?? "Human"),
    homeworld: String(spec?.homeworld ?? ""),
    careers,
    ...(spec?.age ? { age: spec.age } : {}),
    packages: Object.fromEntries(careers.map((career, index) => [`id-${String(index + 1).padStart(5, "0")}`, { name: String(career.name), packagetype: "Class", level: Math.max(1, Math.round(num(career.terms, 1))) }])),
    characteristics,
    skills,
    inventorylist,
    coins: credits > 0 ? { "id-00001": { name: "Cr", amount: credits } } : {},
    notes: String(spec?.notes ?? ""),
    exp: 0,
  });
  return { name: String(spec?.name ?? "").trim() || "Traveller", data, problems };
}
