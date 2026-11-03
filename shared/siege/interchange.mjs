// Characters in and out of Kraken, for players taking a character from one
// table to another.
//
// In: a Kraken export (everything, as it was), a Fantasy Grounds character
// XML (FG's own export; the SC C&C sheet's fields are Kraken's, so a C&C
// character comes over whole; another ruleset's is mapped), a Foundry VTT
// actor JSON (Export Data; dnd5e, pf1, pf2e and others with ability scores)
// and a Roll20 character JSON (attribs and repeating sections). Anything else
// that carries a name and ability scores is tried as well.
//
// A character from another game becomes a C&C character with the campaign's
// books: its race and class (when C&C has them), level, scores, hit points
// and spells go through the same builder as the creation wizard, so the sheet
// works; its gear and coin come over as they were. What could not be matched
// is listed in the sheet's notes for the player and the Castle Keeper.
//
// Out: a Kraken export (JSON, the whole sheet) and an FG character XML that
// FG's SC C&C sheet imports.

import { STATS, addItem, derive, nextId, plainName } from "./engine.mjs";
import { buildFromSpec } from "./builder.mjs";

export const KRAKEN_FORMAT = "kraken-character";

const SHORT = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const num = (value) => (value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
const text = (value) => (value === null || value === undefined ? "" : typeof value === "object" ? "" : String(value).trim());
const stripHtml = (value) =>
  String(value ?? "")
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const rows = (value) => (value && typeof value === "object" ? Object.values(value).filter((row) => row && typeof row === "object") : []);
const escapeXml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// What kind of file this is. text: its contents; parseXml (host side) turns
// FG XML into JSON (fgModule's convertXml).
export function detectFormat(fileText) {
  const body = String(fileText ?? "").replace(/^﻿/, "").trim();
  if (body.startsWith("<")) return "fg";
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (json?.format === KRAKEN_FORMAT) return "kraken";
  if (Array.isArray(json?.attribs)) return "roll20";
  if (json?.system || (json?.data && json?.items && json?.type)) return "foundry";
  if (json && typeof json === "object") return "json";
  return null;
}

// A plain description of a character from any game: the reader of each
// format fills it in, toCastles turns it into a C&C sheet.
function blankSheet(source) {
  return { source, name: "", race: "", classes: [], level: 0, scores: {}, primes: [], hp: null, alignment: "", deity: "", gender: "", age: "", height: "", weight: "", appearance: "", notes: "", items: [], coins: {}, spells: [], languages: [], exp: null, portrait: "", token: "" };
}

function scoresFrom(object) {
  const scores = {};
  if (!object || typeof object !== "object") return scores;
  for (const [key, row] of Object.entries(object)) {
    const stat = SHORT[key.toLowerCase().slice(0, 3)] && (key.length === 3 || STATS.includes(key.toLowerCase())) ? SHORT[key.toLowerCase().slice(0, 3)] : null;
    if (!stat) continue;
    const value = typeof row === "object" ? (num(row?.score) ?? num(row?.value) ?? num(row?.total) ?? (num(row?.mod) !== null ? 10 + 2 * num(row.mod) : null)) : num(row);
    if (value !== null) scores[stat] = Math.max(1, Math.min(25, Math.round(value)));
  }
  return scores;
}

// Foundry VTT: an actor's Export Data (any system; older ones keep "data").
function readFoundry(actor) {
  const sheet = blankSheet("Foundry VTT");
  const system = actor.system ?? actor.data ?? {};
  const items = Array.isArray(actor.items) ? actor.items : [];
  const itemSystem = (item) => item.system ?? item.data ?? {};
  sheet.name = text(actor.name);
  sheet.scores = scoresFrom(system.abilities ?? system.attributes?.abilities ?? system.stats);
  const hp = system.attributes?.hp ?? system.hp ?? system.health;
  sheet.hp = num(hp?.max) ?? num(hp?.value);
  const details = system.details ?? {};
  sheet.race = text(details.race?.name ?? details.race) || text(details.ancestry?.name) || text(items.find((item) => ["race", "ancestry", "species"].includes(item.type))?.name);
  for (const item of items.filter((row) => row.type === "class")) sheet.classes.push({ name: text(item.name), level: num(itemSystem(item).levels) ?? num(itemSystem(item).level?.value ?? itemSystem(item).level) ?? 1 });
  if (sheet.classes.length === 0 && text(details.class)) sheet.classes.push({ name: text(details.class), level: num(details.level?.value ?? details.level) ?? 1 });
  sheet.level = num(details.level?.value ?? details.level) ?? sheet.classes.reduce((sum, row) => sum + (row.level || 0), 0);
  sheet.alignment = text(details.alignment);
  sheet.deity = text(details.deity);
  sheet.gender = text(details.gender);
  sheet.age = text(details.age);
  sheet.height = text(details.height);
  sheet.weight = text(details.weight);
  sheet.appearance = text(details.appearance);
  sheet.notes = stripHtml(details.biography?.value ?? details.biography ?? system.biography ?? "");
  sheet.exp = num(details.xp?.value ?? details.xp);
  const currency = system.currency ?? system.coins ?? {};
  for (const coin of ["pp", "gp", "ep", "sp", "cp"]) if (num(currency[coin]?.value ?? currency[coin])) sheet.coins[coin] = num(currency[coin]?.value ?? currency[coin]);
  const languages = system.traits?.languages;
  for (const name of [...(Array.isArray(languages?.value) ? languages.value : languages?.value instanceof Object ? [...Object.values(languages.value)] : []), ...String(languages?.custom ?? "").split(/[;,]/)]) if (text(name)) sheet.languages.push(text(name).replace(/^./, (c) => c.toUpperCase()));
  const GEAR = new Set(["weapon", "equipment", "armor", "consumable", "tool", "loot", "backpack", "container", "treasure", "item", "gear", "shield"]);
  for (const item of items) {
    const data = itemSystem(item);
    if (item.type === "spell") sheet.spells.push(text(item.name));
    else if (GEAR.has(item.type)) {
      const weight = num(data.weight?.value ?? data.weight);
      const worn = data.equipped === true || data.equipped?.value === true || data.worn === true;
      sheet.items.push({ name: text(item.name), count: num(data.quantity?.value ?? data.quantity) ?? 1, weight, carried: worn ? 2 : 1, description: stripHtml(data.description?.value ?? data.description ?? "") });
    }
  }
  if (typeof actor.img === "string" && actor.img.startsWith("data:")) sheet.portrait = actor.img;
  return sheet;
}

// Roll20: a character's JSON (the API's or a vault export): attribs as
// name/current/max, repeating rows as repeating_<section>_<row>_<field>.
function readRoll20(character) {
  const sheet = blankSheet("Roll20");
  const attrs = new Map();
  for (const row of character.attribs ?? []) if (row?.name) attrs.set(String(row.name).toLowerCase(), row);
  const get = (...names) => {
    for (const name of names) {
      const row = attrs.get(name);
      if (row && text(row.current) !== "") return row;
    }
    return null;
  };
  sheet.name = text(character.name);
  for (const stat of STATS) {
    const row = get(stat, `${stat}_base`, stat.slice(0, 3));
    if (num(row?.current) !== null) sheet.scores[stat] = num(row.current);
  }
  const hp = get("hp", "hit_points", "hitpoints");
  sheet.hp = num(hp?.max) ?? num(hp?.current);
  sheet.race = text(get("race", "species", "ancestry")?.current);
  const level = num(get("level", "base_level")?.current);
  const cls = text(get("class", "class_display")?.current).replace(/\s+\d+$/, "");
  if (cls) sheet.classes.push({ name: cls, level: level ?? 1 });
  sheet.level = level ?? 1;
  sheet.alignment = text(get("alignment")?.current);
  sheet.deity = text(get("deity", "faith")?.current);
  sheet.gender = text(get("gender")?.current);
  sheet.age = text(get("age")?.current);
  sheet.height = text(get("height")?.current);
  sheet.weight = text(get("weight")?.current);
  sheet.exp = num(get("experience", "xp")?.current);
  sheet.notes = stripHtml(character.bio ?? "");
  for (const coin of ["pp", "gp", "ep", "sp", "cp"]) if (num(get(coin)?.current)) sheet.coins[coin] = num(get(coin).current);
  const repeating = new Map();
  for (const [name, row] of attrs) {
    const match = /^repeating_([a-z0-9-]+)_(-?[a-z0-9_-]+?)_([a-z_]+)$/i.exec(name);
    if (!match) continue;
    const key = `${match[1]}|${match[2]}`;
    repeating.set(key, { ...(repeating.get(key) ?? { section: match[1] }), [match[3]]: row.current });
  }
  for (const row of repeating.values()) {
    if (/spell/.test(row.section) && text(row.spellname)) sheet.spells.push(text(row.spellname));
    else if (/inventory|equipment|gear|item/.test(row.section) && text(row.itemname ?? row.name)) sheet.items.push({ name: text(row.itemname ?? row.name), count: num(row.itemcount ?? row.count) ?? 1, weight: num(row.itemweight ?? row.weight), carried: 1 });
  }
  return sheet;
}

// Fantasy Grounds: a character XML of another ruleset (5E, 3.5E, PFRPG, 2E...).
function readFgOther(character) {
  const sheet = blankSheet("Fantasy Grounds");
  sheet.name = text(character.name);
  sheet.scores = scoresFrom(character.abilities ?? character.attributes);
  sheet.hp = num(character.hp?.total) ?? num(character.hp?.max);
  sheet.race = text(character.race);
  for (const row of rows(character.classes)) sheet.classes.push({ name: text(row.name), level: num(row.level) ?? 1 });
  sheet.level = num(character.level) ?? sheet.classes.reduce((sum, row) => sum + (row.level || 0), 0);
  for (const field of ["alignment", "deity", "gender", "age", "height", "weight", "appearance"]) sheet[field] = text(character[field]);
  sheet.notes = stripHtml(character.notes ?? "");
  sheet.exp = num(character.exp);
  for (const row of rows(character.coins)) if (num(row.amount)) sheet.coins[text(row.name).toLowerCase()] = num(row.amount);
  for (const row of rows(character.languagelist)) if (text(row.name)) sheet.languages.push(text(row.name));
  for (const row of rows(character.inventorylist)) sheet.items.push({ name: text(row.name), count: num(row.count) ?? 1, weight: num(row.weight), carried: num(row.carried) ?? 1, description: stripHtml(row.description ?? "") });
  for (const row of [...rows(character.powers).filter((power) => !power.group || /spell|cantrip/i.test(String(power.group)) || Number.isFinite(Number(power.level))), ...rows(character.spellset).flatMap((set) => rows(set.levels).flatMap((level) => rows(level.spells)))]) if (text(row.name)) sheet.spells.push(text(row.name));
  return sheet;
}

// Any other JSON with a name and scores.
function readJson(object) {
  const sheet = blankSheet("JSON");
  sheet.name = text(object.name ?? object.character?.name);
  sheet.scores = scoresFrom(object.abilities ?? object.attributes ?? object.stats ?? object.scores ?? object);
  sheet.hp = num(object.hp?.max ?? object.hp?.total ?? object.hp ?? object.hitPoints);
  sheet.race = text(object.race ?? object.ancestry ?? object.species);
  const cls = text(object.class ?? object.className);
  sheet.level = num(object.level) ?? 1;
  if (cls) sheet.classes.push({ name: cls, level: sheet.level });
  sheet.alignment = text(object.alignment);
  sheet.notes = stripHtml(object.notes ?? object.biography ?? "");
  for (const item of Array.isArray(object.items ?? object.inventory) ? (object.items ?? object.inventory) : []) {
    if (typeof item === "string") sheet.items.push({ name: item, count: 1, carried: 1 });
    else if (text(item?.name)) sheet.items.push({ name: text(item.name), count: num(item.quantity ?? item.count) ?? 1, weight: num(item.weight), carried: 1 });
  }
  for (const spell of Array.isArray(object.spells) ? object.spells : []) if (text(spell?.name ?? spell)) sheet.spells.push(text(spell?.name ?? spell));
  return sheet;
}

// Other games' names for C&C's races and classes.
const RACE_ALIASES = { "half elf": "half-elf", halfelf: "half-elf", "half orc": "half-orc", halforc: "half-orc", hobbit: "halfling", "high elf": "elf", "wood elf": "elf", "hill dwarf": "dwarf", "mountain dwarf": "dwarf", "rock gnome": "gnome", "forest gnome": "gnome", "lightfoot halfling": "halfling", "stout halfling": "halfling" };
const CLASS_ALIASES = { thief: "rogue", "magic-user": "wizard", "magic user": "wizard", mage: "wizard", priest: "cleric", warrior: "fighter", cavalier: "knight" };

// A name's words in any order and spacing: "Longsword" is "Sword, Long".
const wordKey = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join("");
const bare = (name) => plainName(String(name ?? "").replace(/\(.*?\)/g, ""));
const ITEM_ALIASES = { "chain mail": "Mail Hauberk", "chainmail": "Mail Hauberk", "chain shirt": "Mail Shirt", "greatsword": "Sword, Two-Handed", "great sword": "Sword, Two-Handed", "leather": "Leather Armor", "half plate": "Coat of Plates", "plate": "Plate Mail", "plate armor": "Full Plate", "shield": "Shield, Medium Steel", "rope, hempen (50 feet)": "Rope, Hemp (50 feet)" };
function findItem(library, name) {
  const want = wordKey(name);
  const alias = ITEM_ALIASES[String(name).toLowerCase().trim()];
  const core = (row) => String(row.fgPath ?? "").endsWith("@C&C Player's Handbook");
  const pick = (test) => library.items.find((row) => test(row) && core(row)) ?? library.items.find(test);
  return pick((row) => plainName(row.name) === plainName(name)) ?? (alias ? pick((row) => plainName(row.name) === plainName(alias)) : null) ?? pick((row) => wordKey(row.name) === want) ?? null;
}

function findPackage(library, type, name) {
  const want = plainName(name);
  if (!want) return null;
  const all = library.packages.filter((pkg) => String(pkg.packagetype ?? "").toLowerCase() === type);
  const aliases = type === "race" ? RACE_ALIASES : CLASS_ALIASES;
  const alias = aliases[want] ?? aliases[String(name).toLowerCase().trim()];
  return (
    all.find((pkg) => plainName(pkg.name) === want) ??
    all.find((pkg) => bare(pkg.name) === bare(name)) ??
    (alias ? all.find((pkg) => bare(pkg.name) === bare(alias)) : null) ??
    // "Hill Dwarf", "Dwarf (Mountain)": the C&C race the name ends or starts with.
    all.find((pkg) => want.split(" ").includes(plainName(pkg.name))) ??
    null
  );
}

function coinRows(coins) {
  const out = {};
  let n = 1;
  for (const [name, amount] of Object.entries(coins)) if (Number(amount) > 0) out[`id-${String(n++).padStart(5, "0")}`] = { name, amount: Number(amount) };
  return out;
}

// A sheet from another game as a C&C character, with this campaign's books.
function toCastles(sheet, library) {
  const unmatched = [];
  const notes = [];
  const race = findPackage(library, "race", sheet.race);
  const classRow = sheet.classes.find((row) => findPackage(library, "class", row.name)) ?? sheet.classes[0];
  const cls = classRow ? findPackage(library, "class", classRow.name) : null;
  if (sheet.race && !race) unmatched.push(`race ${sheet.race}`);
  for (const row of sheet.classes) if (row !== classRow || !cls) unmatched.push(`class ${row.name}${row.level ? ` ${row.level}` : ""}`);
  const level = Math.max(1, Math.min(20, Number(classRow?.level) || Number(sheet.level) || 1));
  const scores = Object.fromEntries(STATS.map((stat) => [stat, Number(sheet.scores[stat]) || 10]));
  const missingScores = STATS.filter((stat) => !Number(sheet.scores[stat]));
  if (missingScores.length) notes.push(`No ${missingScores.join(", ")} score in the file: set to 10.`);

  let character;
  if (cls) {
    const built = buildFromSpec(
      {
        name: sheet.name,
        race: race?.name ?? "",
        class: cls.name,
        level,
        scores,
        primes: sheet.primes,
        // The file's hit points stand for the whole character.
        hp: sheet.hp ? [sheet.hp, ...Array(level - 1).fill(0)] : undefined,
        gold: 0,
        spells: sheet.spells,
      },
      library,
    );
    character = built.character;
    // Only the spells the character had, not the builder's picks for empty slots.
    const auto = new Set(built.report.auto.map(plainName));
    for (const [key, power] of Object.entries(character.powers ?? {})) if (auto.has(plainName(power.name)) && !sheet.spells.some((name) => plainName(name) === plainName(power.name))) delete character.powers[key];
    const kept = new Set(Object.values(character.powers ?? {}).map((power) => plainName(power.name)));
    for (const name of sheet.spells) if (!kept.has(plainName(name))) unmatched.push(`spell ${name}`);
    if (built.report.problems.some((problem) => problem.startsWith("primes"))) notes.push("Choose prime attributes with your Castle Keeper (the other game has none).");
    if (!sheet.hp) notes.push("No hit points in the file: worked out as a pregen's.");
  } else {
    character = { name: sheet.name, attributes: Object.fromEntries(STATS.map((stat) => [stat, { score: scores[stat], prime: 0 }])), packages: {}, inventorylist: {}, powers: {}, languagelist: {}, level, hp: { total: sheet.hp ?? 0, wounds: 0 } };
    if (race) character.race = race.name;
    notes.push("No C&C class matched: choose one with your Castle Keeper (the sheet has no class abilities, saves or to-hit yet).");
  }

  // Gear as it was: the campaign's item when it has one, else as written.
  for (const item of sheet.items) {
    if (!item.name) continue;
    const found = findItem(library, item.name);
    const count = Math.max(1, Math.round(Number(item.count) || 1));
    if (found) {
      for (let i = 0; i < Math.min(count, 200); i += 1) addItem(character, found, library.game);
      const row = Object.values(character.inventorylist).find((entry) => entry.name === found.name);
      if (row && item.carried === 2) row.carried = 2;
    } else {
      const list = (character.inventorylist = character.inventorylist ?? {});
      list[nextId(list)] = { name: item.name, count, weight: item.weight ?? 0, carried: item.carried ?? 1, ...(item.description ? { description: `<p>${escapeXml(item.description)}</p>` } : {}) };
    }
  }
  if (Object.keys(sheet.coins).length) character.coins = coinRows(sheet.coins);
  const languages = (character.languagelist = character.languagelist ?? {});
  for (const name of sheet.languages) if (!rows(languages).some((row) => plainName(row.name) === plainName(name))) languages[nextId(languages)] = { name };
  for (const field of ["alignment", "deity", "gender", "age", "height", "weight", "appearance"]) if (sheet[field]) character[field] = sheet[field];
  if (sheet.exp !== null && sheet.exp > 0) character.exp = sheet.exp;
  if (sheet.portrait) character.portrait = sheet.portrait;
  const report = [`Imported from ${sheet.source}.`, ...notes, unmatched.length ? `Not in this campaign's books (keep or replace with your Castle Keeper): ${unmatched.join(", ")}.` : ""].filter(Boolean).join(" ");
  character.notes = [sheet.notes ? `<p>${escapeXml(sheet.notes).replace(/\n+/g, "</p><p>")}</p>` : "", `<p>${escapeXml(report)}</p>`].filter(Boolean).join("");
  return { character: derive(character, library.game), report, unmatched };
}

// A character file, read into a C&C character for this campaign.
// fgXml: turns FG XML text into JSON (the host's convertXml).
export function readCharacterFile(fileText, library, { fgXml } = {}) {
  const format = detectFormat(fileText);
  if (!format) throw new Error("That file is not a character Kraken can read (Kraken, Fantasy Grounds XML, Foundry or Roll20 JSON).");
  if (format === "kraken") {
    const file = JSON.parse(fileText);
    if (!file.data || typeof file.data !== "object") throw new Error("That Kraken file has no character in it.");
    const character = derive(structuredClone(file.data), library.game);
    return { format, character, report: `Imported from Kraken${file.ruleset ? ` (${file.ruleset})` : ""}.` };
  }
  if (format === "fg") {
    if (!fgXml) throw new Error("Fantasy Grounds files are read by the host.");
    const root = fgXml(fileText);
    const character = root?.character ?? root;
    if (!character || typeof character !== "object" || !character.name) throw new Error("That XML has no Fantasy Grounds character in it.");
    // FG's SC C&C sheet: Kraken's own fields, so it comes over whole.
    if (character.attributes && rows(character.packages).length > 0) {
      for (const field of ["portrait", "token"]) delete character[field];
      return { format, character: derive(character, library.game), report: "Imported from Fantasy Grounds (SC C&C)." };
    }
    return { format, ...toCastles(readFgOther(character), library) };
  }
  const json = JSON.parse(fileText);
  if (format === "foundry") return { format, ...toCastles(readFoundry(json), library) };
  if (format === "roll20") return { format, ...toCastles(readRoll20(json), library) };
  const sheet = readJson(json);
  if (!sheet.name && Object.keys(sheet.scores).length === 0) throw new Error("That JSON has no character in it.");
  return { format, ...toCastles(sheet, library) };
}

// A Kraken export: the whole sheet.
export function toKrakenFile(record, ruleset = "Castles & Crusades") {
  return JSON.stringify({ format: KRAKEN_FORMAT, version: 1, ruleset, name: record.name, exported: new Date().toISOString(), data: record.data }, null, 2);
}

// FG's character XML, as FG exports it (and imports it, on the Characters
// list's import button): typed values, nested lists.
const FORMATTED = new Set(["text", "description", "notes", "appearance", "shortdescription", "special", "abilitiestext", "featuretext"]);
const SKIP = new Set(["portrait", "token", "fgPath"]);
function xmlNode(name, value, indent) {
  const tag = /^[A-Za-z_][\w.-]*$/.test(name) ? name : `id-${name.replace(/\W/g, "")}`;
  const pad = "\t".repeat(indent);
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return `${pad}<${tag} type="number">${Number.isFinite(value) ? value : 0}</${tag}>\n`;
  if (typeof value === "boolean") return `${pad}<${tag} />\n`;
  if (typeof value === "string") {
    if (FORMATTED.has(name) || /^\s*<(p|h|list|table|b|i|frame|linklist)\b/.test(value)) return `${pad}<${tag} type="formattedtext">${value}</${tag}>\n`;
    return `${pad}<${tag} type="string">${escapeXml(value)}</${tag}>\n`;
  }
  if (Array.isArray(value)) return value.map((item, index) => xmlNode(`id-${String(index + 1).padStart(5, "0")}`, item, indent)).join("");
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key) => ["class", "recordname"].includes(key))) return `${pad}<${tag} type="windowreference">\n${pad}\t<class>${escapeXml(value.class ?? "")}</class>\n${pad}\t<recordname>${escapeXml(value.recordname ?? "")}</recordname>\n${pad}</${tag}>\n`;
    return `${pad}<${tag}>\n${keys.filter((key) => !SKIP.has(key)).map((key) => xmlNode(key, value[key], indent + 1)).join("")}${pad}</${tag}>\n`;
  }
  return "";
}
export function toFgXml(record) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<root version="4.7" release="1.0|CoreRPG:7">\n${xmlNode("character", { ...record.data, name: record.name }, 1)}</root>\n`;
}
