// Cairn, Second Edition (Yochai Gal, CC BY-SA 4.0): its mechanics as plain
// functions (no Node, no DOM), used by the host (building, saves, combat,
// rest) and the sheet. The book's own words (tables, backgrounds, monsters)
// live in its books (games/cairn), not here: this file holds only how the
// numbers work.
//
// - Three attributes, STR, DEX and WIL (3d6 each, two may be swapped), and Hit
//   Protection (1d6). A save is a d20 at or under the attribute: a 1 always
//   succeeds, a 20 always fails.
// - Attacks always hit: the weapon's die, less the target's Armor (3 at most),
//   comes off HP; what goes past 0 comes off STR, and the target saves STR
//   (with the new score) or takes Critical Damage. Damage that takes a PC's HP
//   to exactly 0 is a Scar (by the HP lost). STR 0: dead; DEX 0: paralyzed;
//   WIL 0: delirious.
// - Impaired attacks roll d4, enhanced d12; two weapons (d6+d6) roll both and
//   keep the best; blast rolls for each target.
// - Ten inventory slots (four on the body and in the hands, six in the
//   backpack); bulky items take two, petty none; each Fatigue takes one; a
//   full inventory takes HP to 0.
//
// A character's record data:
//   ruleset "cairn", background, age, attributes {str, dex, wil: {score
//   (now), max}}, hp {max (rolled), total (0 while the inventory is full),
//   wounds}, ac {total (Armor)}, fatigue, deprived, critical ("" | "dying" |
//   "stable"), doomed, scars {id: {roll, name, text, pending, done}},
//   growth {id: {text}}, milestones {id: {name, done}}, traits {physique...},
//   bond, omen, inventorylist (items: slots via bulky/petty, damage, armor,
//   uses, charges, kind spellbook|scroll|relic; carried 2 on the body or in
//   hand, 1 in the backpack, 0 left elsewhere), coins (GP), slots {...}.

import { priceOf } from "../shop.mjs";

export const RULESET = "cairn";
export const RULESET_NAME = "Cairn";
export const STATS = ["str", "dex", "wil"];
export const STAT_NAMES = { str: "Strength", dex: "Dexterity", wil: "Willpower" };
export const SHORT = { str: "STR", dex: "DEX", wil: "WIL" };
export const SLOTS = 10;
export const BODY_SLOTS = 4;
export const PACK_SLOTS = 6;
export const MAX_ARMOR = 3;
// The traits a character rolls (d10 each), in the book's order.
export const TRAITS = ["physique", "skin", "hair", "face", "speech", "clothing", "virtue", "vice"];
export const TRAIT_NAMES = { physique: "Physique", skin: "Skin", hair: "Hair", face: "Face", speech: "Speech", clothing: "Clothing", virtue: "Virtue", vice: "Vice" };

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// --- Saves -------------------------------------------------------------------
// A d20 at or under the attribute; a 1 always succeeds, a 20 always fails.
export function saveResult(die, score) {
  const roll = Math.round(num(die, 20));
  if (roll <= 1) return true;
  if (roll >= 20) return false;
  return roll <= num(score, 0);
}

// --- Dice --------------------------------------------------------------------
// A weapon's damage as dice: "d8" -> 1d8; two weapons or two attacks
// ("d6+d6") roll both and keep the best (2d6kh1); impaired 1d4, enhanced 1d12.
export function damageFormula(damage, mode = "") {
  if (mode === "impaired") return "1d4";
  if (mode === "enhanced") return "1d12";
  const dice = String(damage ?? "").toLowerCase().replace(/\s+/g, "").match(/\d*d\d+/g) ?? [];
  if (dice.length === 0) return "1d4";
  const sides = dice.map((die) => Number(die.split("d")[1]));
  const counts = dice.map((die) => Number(die.split("d")[0]) || 1);
  if (dice.length === 1 && counts[0] === 1) return `1d${sides[0]}`;
  // The same die twice or more: keep the best. Mixed dice: the best of each, rolled as one pool of the largest.
  const total = counts.reduce((sum, count) => sum + count, 0);
  return `${total}d${Math.max(...sides)}kh1`;
}
// The best die of several rolls (multiple attackers on one foe keep the single highest).
export const highest = (values) => Math.max(0, ...values.map((value) => num(value, 0)));

// --- Damage ------------------------------------------------------------------
// One hit's damage: the roll less armor (unless it ignores armor), then HP,
// then STR. current: { hp (left now), str (now), armor }. Returns what it did:
// dealt (after armor), hpLost, strLoss, hpAfter, strAfter, scar (the HP lost,
// when it took HP to exactly 0 from above), save (STR damage: save STR with
// the new score or take Critical Damage), dead (STR 0).
export function applyDamage(current, rolled, { ignoresArmor = false } = {}) {
  const hp = Math.max(0, Math.round(num(current.hp, 0)));
  const str = Math.max(0, Math.round(num(current.str, 0)));
  const armor = ignoresArmor ? 0 : clamp(Math.round(num(current.armor, 0)), 0, MAX_ARMOR);
  const dealt = Math.max(0, Math.round(num(rolled, 0)) - armor);
  const hpLost = Math.min(hp, dealt);
  const strLoss = Math.min(str, dealt - hpLost);
  const hpAfter = hp - hpLost;
  const strAfter = str - strLoss;
  return {
    armor,
    dealt,
    hpLost,
    strLoss,
    hpAfter,
    strAfter,
    // HP to exactly 0, nothing past it: a Scar, looked up by the HP lost in the attack.
    scar: hp > 0 && hpAfter === 0 && dealt === hp ? Math.min(12, hpLost) : 0,
    save: strLoss > 0 && strAfter > 0,
    dead: str > 0 && strAfter <= 0,
  };
}

// What the Scars table does with its dice, by the HP lost (1 to 12): "now"
// steps happen at once, "later" ones when the character has recovered (the
// sheet's Recover button on the scar). A step: roll dice, then to "hp" (max),
// "str"/"dex"/"wil" (the attribute), or "attr" (the attribute a d6 picks:
// 1-2 STR, 3-4 DEX, 5-6 WIL); how "higher" (take it if it beats the maximum),
// "current" (if it beats the current score), "add", "set"; save "wil" first
// (only on a pass). where: a d6 picks the place.
export const SCAR_STEPS = {
  1: { where: ["Neck", "Hands", "Eye", "Chest", "Legs", "Ear"], now: [{ roll: "1d6", to: "hp", how: "higher" }] },
  2: { now: [{ roll: "1d6", to: "hp", how: "higher" }] },
  3: { deprived: true, later: [{ roll: "1d6", to: "hp", how: "add" }] },
  4: { where: ["Leg", "Leg", "Arm", "Arm", "Rib", "Skull"], later: [{ roll: "2d6", to: "hp", how: "higher" }] },
  5: { later: [{ roll: "2d6", to: "hp", how: "higher" }] },
  6: { now: [{ roll: "3d6", to: "attr", how: "current" }] },
  7: { later: [{ roll: "3d6", to: "dex", how: "higher" }] },
  8: { now: [{ save: "wil", roll: "1d4", to: "wil", how: "add" }] },
  9: { now: [{ roll: "3d6", to: "wil", how: "higher" }] },
  10: { now: [{ save: "wil", roll: "1d6", to: "wil", how: "add" }] },
  11: { deprived: true, mortal: true, later: [{ roll: "2d6", to: "hp", how: "set" }] },
  12: { doomed: true },
};
// Which attribute a d6 picks (Reorienting Head Wound).
export const attributeOf = (die) => (num(die, 1) <= 2 ? "str" : num(die, 1) <= 4 ? "dex" : "wil");

// A growth roll put on the sheet: data changed in place, and what changed in words.
export function applyGrowth(data, { to, how, value }) {
  const v = Math.max(0, Math.round(num(value, 0)));
  if (to === "hp") {
    const before = num(data.hp?.max, 1);
    const after = how === "add" ? before + v : how === "set" ? v : how === "higher" && v > before ? v : before;
    data.hp = { ...(data.hp ?? {}), max: Math.max(1, after) };
    return after !== before ? `max HP ${before} -> ${after}` : `max HP stays ${before} (rolled ${v})`;
  }
  if (!STATS.includes(to)) return "";
  const row = { ...(data.attributes?.[to] ?? {}) };
  const max = num(row.max, num(row.score, 10));
  const score = num(row.score, max);
  let words;
  if (how === "add") {
    row.max = max + v;
    row.score = score + v;
    words = `max ${SHORT[to]} ${max} -> ${row.max}`;
  } else if (how === "current") {
    if (v > score) {
      row.score = v;
      row.max = Math.max(max, v);
      words = `${SHORT[to]} ${score} -> ${v}`;
    } else words = `${SHORT[to]} stays ${score} (rolled ${v})`;
  } else if (how === "set") {
    row.max = v;
    row.score = Math.min(score, v);
    words = `max ${SHORT[to]} ${max} -> ${v}`;
  } else if (v > max) {
    row.score = score + (v - max);
    row.max = v;
    words = `max ${SHORT[to]} ${max} -> ${v}`;
  } else words = `max ${SHORT[to]} stays ${max} (rolled ${v})`;
  data.attributes = { ...(data.attributes ?? {}), [to]: row };
  return words;
}

// --- Items -------------------------------------------------------------------
// An item as the books write it: "Twin Daggers (d6+d6, _bulky_)", "Padded
// Leather (1 Armor)", "Rations (3 uses)", "Shield (+1 Armor)", "Catring (2
// charges)", "Protective Gloves (_petty_)".
export function parseItem(text) {
  const raw = String(text ?? "").replace(/\*\*/g, "").trim();
  // The first parentheses are the item's tags; words after them, its note.
  const match = /^([^(]*?)\s*\((.*)\)\s*\.?$/.exec(raw) ?? /^([^(]*?)\s*\(([^)]*)\)(.*)$/.exec(raw);
  const name = (match ? match[1] : raw).replace(/^an?\s+/i, "").replace(/_/g, "").trim();
  const inside = match ? `${match[2]}${match[3] ? `, ${match[3]}` : ""}`.replace(/_/g, "") : "";
  const item = { name };
  const left = [];
  for (const original of inside.split(",").map((word) => word.trim())) {
    const part = original.toLowerCase();
    if (!part) continue;
    if (/^\d*d\d+(\s*\+\s*\d*d\d+)*$/.test(part.replace(/\s+/g, ""))) item.damage = part.replace(/\s+/g, "");
    else if (/^\+?\d+\s*armou?r$/.test(part)) {
      item.armor = Number(/\d+/.exec(part)[0]);
      if (part.startsWith("+")) item.bonusarmor = 1;
    } else if (part === "bulky") item.bulky = 1;
    else if (part === "petty") item.petty = 1;
    else if (part === "blast") item.blast = 1;
    else if (part === "ignores armor" || part === "ignores armour") item.ignoresarmor = 1;
    else if (/^\d+\s+uses?$/.test(part)) item.uses = Number(/\d+/.exec(part)[0]);
    else if (/^\d+\s+charges?$/.test(part)) item.charges = Number(/\d+/.exec(part)[0]);
    else if (/^\d+\s*ft$/.test(part)) item.length = part;
    else if (/^\+\d+\s+slots?$/.test(part)) item.carries = Number(/\d+/.exec(part)[0]);
    else left.push(original);
  }
  // What the parentheses say besides (a spellbook's spell, "restore 1 STR").
  if (left.length) item.note = left.join(", ");
  if (/\bspellbook\b/i.test(name)) item.kind = "spellbook";
  else if (/^scroll\b/i.test(name)) item.kind = "scroll";
  if (item.damage) item.type = "Weapon";
  else if (item.armor) item.type = "Armor";
  return item;
}
// How many slots an item takes: petty none, bulky two, otherwise one (each of a count).
export function itemSlots(item) {
  if (num(item?.petty, 0) || /^(scroll)$/i.test(String(item?.kind ?? ""))) return 0;
  const each = item?.slots !== undefined ? Math.max(0, num(item.slots, 1)) : num(item?.bulky, 0) ? 2 : 1;
  return each * Math.max(1, Math.round(num(item?.count, 1)));
}
export const isWeapon = (item) => Boolean(String(item?.damage ?? "").match(/d\d+/));
export const isArmor = (item) => num(item?.armor, 0) > 0;
const worn = (item) => num(item?.carried, 1) === 2;
// Coins: a bag worth less than 100 gp is petty; each full 100 gp is a bag of one slot.
export const coinSlots = (gp) => Math.floor(Math.max(0, num(gp, 0)) / 100);

// --- The character -------------------------------------------------------------
export function derive(input) {
  const data = { ...input, ruleset: RULESET, level: 1 };
  data.attributes = Object.fromEntries(
    STATS.map((stat) => {
      const row = input.attributes?.[stat] ?? {};
      const max = clamp(Math.round(num(row.max, num(row.score, 10))), 0, 30);
      const score = clamp(Math.round(num(row.score, max)), 0, Math.max(max, 30));
      return [stat, { score, max: Math.max(max, score) }];
    }),
  );
  data.fatigue = clamp(Math.round(num(input.fatigue, 0)), 0, SLOTS);
  data.deprived = num(input.deprived, 0) ? 1 : 0;
  data.critical = ["dying", "stable"].includes(input.critical) ? input.critical : "";
  // Slots: on the body (in hand, worn: 4), in the backpack (6), Fatigue (one each, anywhere), and coin.
  let body = 0;
  let pack = 0;
  let armor = 0;
  let wearing = [];
  for (const [, item] of rows(data.inventorylist)) {
    const carried = num(item?.carried, 1);
    if (carried === 0) continue;
    const slots = itemSlots(item);
    if (carried === 2) body += slots;
    else pack += slots;
    if (worn(item) && isArmor(item)) {
      armor += num(item.armor, 0);
      wearing.push(String(item.name ?? ""));
    }
  }
  const gp = rows(data.coins).reduce((sum, [, coin]) => sum + (/^gp$/i.test(String(coin?.name ?? "gp")) ? num(coin.amount, 0) : 0), 0);
  const coins = coinSlots(gp);
  const used = body + pack + data.fatigue + coins;
  data.slots = { body, pack, fatigue: data.fatigue, coins, used, free: Math.max(0, SLOTS - used), max: SLOTS, over: used > SLOTS, bodyOver: body > BODY_SLOTS, packOver: pack + data.fatigue + coins > PACK_SLOTS + Math.max(0, BODY_SLOTS - body) };
  data.encumbered = used >= SLOTS ? 1 : 0;
  data.ac = { total: clamp(armor + num(input.ac?.misc, 0), 0, MAX_ARMOR), misc: num(input.ac?.misc, 0), armor: wearing.join(", ") };
  const max = Math.max(1, Math.round(num(input.hp?.max, num(input.hp?.total, 1))));
  // A full inventory: HP 0.
  const total = data.encumbered ? 0 : max;
  data.hp = { max, total, wounds: clamp(Math.round(num(input.hp?.wounds, 0)), 0, Math.max(total, 0)) };
  data.attacks = {};
  for (const [key, item] of rows(data.inventorylist)) {
    if (!isWeapon(item) || !worn(item)) continue;
    data.attacks[key] = { name: String(item.name ?? "Weapon"), damage: String(item.damage).replace(/\s+/g, ""), blast: num(item.blast, 0) ? 1 : 0, ignoresarmor: num(item.ignoresarmor, 0) ? 1 : 0, bulky: num(item.bulky, 0) ? 1 : 0 };
  }
  // Unarmed: always d4.
  data.attacks.unarmed = { name: "Unarmed", damage: "d4", blast: 0, ignoresarmor: 0, bulky: 0 };
  data.status = statusOf(data);
  delete data.exp;
  delete data.expnext;
  return data;
}

// A character's state in words: dead at STR 0, paralyzed at DEX 0, delirious at WIL 0.
export function statusOf(data) {
  const at = (stat) => num(data.attributes?.[stat]?.score, 1);
  if (at("str") <= 0) return "Dead";
  if (data.critical === "dying") return "Dying";
  if (data.critical === "stable") return "Stable";
  if (at("dex") <= 0) return "Paralyzed";
  if (at("wil") <= 0) return "Delirious";
  if (num(data.deprived, 0)) return "Deprived";
  return "";
}

// --- Monsters ------------------------------------------------------------------
// The bestiary's stat line: "6 HP, 1 Armor, 14 STR, 12 DEX, 5 WIL, claws
// (d6+d6) or teeth (d8), _detachment_".
export function parseStatline(line) {
  const text = String(line ?? "").replace(/\*\*/g, "").replace(/_/g, "").trim();
  const out = { hp: 0, armor: 0, str: 10, dex: 10, wil: 10, attacks: [], detachment: 0 };
  const take = (pattern) => {
    const match = pattern.exec(text);
    return match ? Number(match[1]) : null;
  };
  out.hp = take(/(\d+)\s*HP\b/i) ?? 0;
  out.armor = clamp(take(/(\d+)\s*Armou?r\b/i) ?? 0, 0, MAX_ARMOR);
  out.str = take(/(\d+)\s*STR\b/) ?? 10;
  out.dex = take(/(\d+)\s*DEX\b/) ?? 10;
  out.wil = take(/(\d+)\s*WIL\b/) ?? 10;
  out.detachment = /\bdetachment\b/i.test(text) ? 1 : 0;
  // The attacks: everything after the attributes, "name (dice, tags)", by "," or "or".
  const rest = text.replace(/^.*?\d+\s*WIL\b,?/i, "");
  for (const match of rest.matchAll(/([A-Za-z][A-Za-z' -]*?)\s*\(([^)]*)\)/g)) {
    const name = match[1].replace(/^(or|and)\s+/i, "").trim();
    const parts = match[2].split(",").map((part) => part.trim().toLowerCase());
    const damage = parts.find((part) => /^\d*d\d+(\+\d*d\d+)*$/.test(part.replace(/\s+/g, "")));
    if (!damage) continue;
    out.attacks.push({ name: name[0].toUpperCase() + name.slice(1), damage: damage.replace(/\s+/g, ""), blast: parts.includes("blast") ? 1 : 0, ignoresarmor: parts.some((part) => /ignores armou?r/.test(part)) ? 1 : 0 });
  }
  return out;
}
// What the tracker needs of an NPC record (its stat line's numbers).
export function npcStats(data) {
  const attacks = rows(data?.attacks).map(([key, attack]) => ({ key, name: String(attack?.name ?? "Attack"), damage: String(attack?.damage ?? "d4"), blast: num(attack?.blast, 0) ? 1 : 0, ignoresarmor: num(attack?.ignoresarmor, 0) ? 1 : 0 }));
  return {
    hp: Math.max(0, Math.round(num(data?.hp, 0))),
    ac: clamp(Math.round(num(data?.armor ?? data?.ac, 0)), 0, MAX_ARMOR),
    str: Math.max(0, Math.round(num(data?.str, 10))),
    dex: Math.max(0, Math.round(num(data?.dex, 10))),
    wil: Math.max(0, Math.round(num(data?.wil, 10))),
    detachment: num(data?.detachment, 0) ? 1 : 0,
    attacks: attacks.length ? attacks : [{ key: "unarmed", name: "Unarmed", damage: "d4", blast: 0, ignoresarmor: 0 }],
    init: 0,
  };
}

// --- Morale ----------------------------------------------------------------------
// Enemies save WIL at their first casualty and again at half their number
// fallen; a lone foe when its HP reaches 0. Which checks are due now: given
// the side's size and how many have fallen, and which were made.
export function moraleDue({ size, fallen, done = {} }) {
  const due = [];
  if (size <= 1) return due;
  if (fallen >= 1 && !done.first) due.push("first");
  if (fallen >= Math.ceil(size / 2) && !done.half) due.push("half");
  return due;
}

// --- Building -----------------------------------------------------------------------
// The book's procedure, as the wizard sends it (every die rolled on the
// host's dice in front of the table):
//   { name, background, attributes {str, dex, wil} (3d6 each, two swapped),
//     hp (1d6), age (2d20+10), gold (3d6), traits {physique...}, bond,
//     omen, results [{ table (its place in the background, or its question),
//     roll }] (each of the background's tables, read from its record: the
//     row's items and gold), buy [[item name, count]] (from the
//     Marketplace, with the gold), notes, portrait, token }. The
//     background's starting gear comes from its record.
// lib: { backgrounds (background records), items (the Marketplace) }.
export function buildFromSpec(spec, lib) {
  const problems = [];
  const find = (list, name) => list.find((record) => String(record.name).toLowerCase() === String(name ?? "").toLowerCase()) ?? null;
  const background = find(lib.backgrounds ?? [], spec.background);
  if (!background) throw new Error(`No background ${spec.background ?? ""} in the books (make the Cairn Player's Guide active).`);
  const attributes = {};
  for (const stat of STATS) {
    const value = Math.round(num(spec.attributes?.[stat], NaN));
    if (!(value >= 3 && value <= 18)) throw new Error(`${STAT_NAMES[stat]} is 3d6: 3 to 18.`);
    attributes[stat] = { score: value, max: value };
  }
  const hp = Math.round(num(spec.hp, NaN));
  if (!(hp >= 1 && hp <= 6)) throw new Error("Hit Protection is 1d6: 1 to 6.");
  const age = Math.round(num(spec.age, 0));
  if (age && (age < 12 || age > 50)) problems.push("Age is 2d20+10: 12 to 50.");
  const rolledGold = Math.round(num(spec.gold, NaN));
  if (!(rolledGold >= 3 && rolledGold <= 18)) throw new Error("Starting gold is 3d6: 3 to 18.");
  const inventorylist = {};
  let n = 1;
  const add = (text, extra = {}) => {
    const parsed = typeof text === "string" ? parseItem(text) : { ...text };
    if (!parsed.name || /gold pieces?$|^\d+\s*gp$/i.test(parsed.name)) return;
    const known = find(lib.items ?? [], parsed.name);
    const data = known ? { ...known.data, ...parsed, name: known.name } : parsed;
    delete data.fgPath;
    delete data.cost;
    inventorylist[`id-${String(n++).padStart(5, "0")}`] = { ...data, count: Math.max(1, Math.round(num(data.count, 1))), carried: isArmor(data) || isWeapon(data) ? 2 : 1, ...extra };
  };
  // Every PC starts with a backpack.
  add({ name: "Backpack", petty: 1, text: "Holds up to six slots of items or Fatigue." });
  // The background's starting gear (its gold is the 3d6 rolled), from its record.
  for (const [, line] of rows(background.data?.gear)) add(line?.item && typeof line.item === "object" ? line.item : String(line?.text ?? ""));
  // Each of the background's tables, at the roll made: its result's items and gold.
  let bonusGold = 0;
  const results = [];
  const tables = rows(background.data?.tables).map(([, table]) => table);
  for (const [index, table] of tables.entries()) {
    const wanted = (Array.isArray(spec.results) ? spec.results : []).find((result) => Number(result?.table) === index || String(result?.table ?? "").toLowerCase() === String(table?.name ?? "").toLowerCase());
    const roll = Math.round(num(wanted?.roll, NaN));
    if (!Number.isFinite(roll)) {
      problems.push(`No roll for "${table?.name}".`);
      continue;
    }
    const row = rows(table?.rows).map(([, item]) => item).find((item) => roll >= num(item?.from, 0) && roll <= num(item?.to, 0));
    if (!row) throw new Error(`${roll} is not on "${table?.name}".`);
    for (const [, item] of rows(row.items)) add(item);
    bonusGold += Math.max(0, Math.round(num(row.gold, 0)));
    results.push(`${String(table?.name ?? "").replace(/\s*Roll 1d6:?\s*$/i, "")} (${roll}): ${String(row.text ?? "")}`);
  }
  let gold = rolledGold + bonusGold;
  // The Marketplace, paid in gold pieces, never past the purse.
  for (const [name, countIn = 1] of Array.isArray(spec.buy) ? spec.buy : []) {
    const item = find(lib.items ?? [], name);
    const price = item ? priceOf(item.data?.cost) : null;
    const count = Math.max(1, Math.min(20, Math.round(num(countIn, 1))));
    if (!item || price === null) throw new Error(`${name} is not for sale.`);
    // priceOf counts in copper pieces: 100 to the gold piece.
    const cost = (price / 100) * count;
    if (cost > gold) throw new Error(`${item.name} costs ${cost} gp; ${gold} gp is left.`);
    gold -= cost;
    for (let i = 0; i < count; i += 1) add({ ...item.data, name: item.name });
  }
  const traits = Object.fromEntries(TRAITS.map((trait) => [trait, String(spec.traits?.[trait] ?? "").slice(0, 60)]));
  for (const name of fitSlots(inventorylist)) problems.push(`${name} did not fit in ten slots: left behind (Away).`);
  const data = derive({
    background: background.name,
    race: "Human",
    packages: { "id-00001": { name: background.name, packagetype: "Class", level: 1 } },
    attributes,
    hp: { max: hp, wounds: 0 },
    age: age || 0,
    traits,
    bond: String(spec.bond ?? "").slice(0, 2000),
    omen: String(spec.omen ?? "").slice(0, 2000),
    history: results.join("\n").slice(0, 4000),
    inventorylist,
    coins: { "id-00001": { name: "GP", amount: Math.round(gold * 100) / 100 } },
    fatigue: 0,
    deprived: 0,
    critical: "",
    scars: {},
    growth: {},
    milestones: {},
    notes: String(spec.notes ?? ""),
  });
  return { name: String(spec.name ?? "").trim() || background.name, data, problems };
}

// A new character's gear packed: four slots on the body (armor first, then
// weapons; the rest in the backpack), and no more than ten in all (what
// does not fit, the last first, is left behind: carried 0). The names left.
export function fitSlots(inventorylist) {
  const list = rows(inventorylist).map(([, item]) => item);
  let body = 0;
  for (const item of [...list.filter((entry) => isArmor(entry)), ...list.filter((entry) => !isArmor(entry))]) {
    if (num(item.carried, 1) !== 2) continue;
    if (body + itemSlots(item) <= BODY_SLOTS) body += itemSlots(item);
    else item.carried = 1;
  }
  const left = [];
  let used = list.reduce((sum, item) => sum + (num(item.carried, 1) === 0 ? 0 : itemSlots(item)), 0);
  for (const item of [...list].reverse()) {
    if (used <= SLOTS) break;
    if (num(item.carried, 1) === 0 || itemSlots(item) === 0) continue;
    used -= itemSlots(item);
    item.carried = 0;
    left.push(String(item.name));
  }
  return left;
}

// The items a d6 result names: its bold words with their parentheses ("Take a
// **Ladder** (_bulky_, 10ft) and **Blinding Powder** (1 use)"), as item texts.
// Bold words that are the rules' own (Fatigue, Critical Damage...) are no item;
// an item has its parentheses, or is taken ("Take a **Lantern**").
const NOT_ITEMS = /^(fatigue|critical damage|recharge|roots|gates?|deprived|panicked|hp|attributes?|omens?|bonds?|scars?|warden|str|dex|wil|one step|enhanced|impaired|blast|bulky|petty|weapon type|specialty)$/i;
export function itemsIn(text) {
  const out = [];
  const source = String(text ?? "");
  for (const match of source.matchAll(/\*\*([^*]+)\*\*\s*(\([^)]*\))?/g)) {
    const name = match[1].trim().replace(/[.:,]$/, "");
    if (NOT_ITEMS.test(name) || /\d+\s*gp\b|^[+-]?d?\d/i.test(name)) continue;
    const before = source.slice(0, match.index).split(/[.!?]\s/).at(-1);
    if (!match[2] && !/\b(take|takes|carry|carries|gain|receive|keep|have|find)\b/i.test(before)) continue;
    out.push(`${name}${match[2] ? ` ${match[2]}` : ""}`);
  }
  return out;
}
// Gold a result gives: "(+20gp)", "Take 20Gp", "an extra 40gp".
export function goldIn(text) {
  const match = /(?:\+\s*|take\s+|extra\s+)(\d+)\s*gp\b/i.exec(String(text ?? "").replace(/\*\*/g, ""));
  return match ? Number(match[1]) : 0;
}
