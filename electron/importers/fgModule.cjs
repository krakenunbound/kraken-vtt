const fs = require("fs");
const os = require("os");
const path = require("path");
const { unzipSync, strFromU8 } = require("fflate");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const packs = require("../packs.cjs");

// Reads a Fantasy Grounds module (.mod zip, or an unpacked folder) the user
// owns and turns its records into Kraken records. Nothing from the module is
// changed or shipped; the records keep FG's field names and shapes so a
// ruleset can read what its FG counterpart reads.
//
// FG layout: <root><TYPE><category?><RECORD>fields...</RECORD></category?></TYPE></root>
// db.xml holds GM content, client.xml content players may see.
//
// Field conversion (FG's type attribute):
//   number -> number, string/dice -> string, formattedtext -> its inner XML as
//   a string, windowreference -> { class, recordname }, no type with children
//   -> object, empty element -> true (a flag such as <public />).

// Roots that are not records: the library index, and FG's list views.
const SKIP_ROOTS = new Set(["library", "list"]);

// Fantasy Grounds' default data folder on each system (the user may have moved it).
function fgDataFolder() {
  const home = os.homedir();
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "SmiteWorks", "Fantasy Grounds");
  const candidates = process.platform === "darwin"
    ? [path.join(home, "SmiteWorks", "Fantasy Grounds"), path.join(home, "Library", "Application Support", "SmiteWorks", "Fantasy Grounds")]
    : [path.join(home, ".smiteworks", "fgdata"), path.join(home, "SmiteWorks", "Fantasy Grounds")];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0];
}

function elements(node) {
  const out = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) out.push(child);
  return out;
}

function innerXml(node) {
  const serializer = new XMLSerializer();
  let text = "";
  for (let child = node.firstChild; child; child = child.nextSibling) text += serializer.serializeToString(child);
  return text.trim();
}

const LIST_TAGS = new Set(["layer", "occluder", "light", "stroke", "path"]);

function convert(node) {
  const type = node.getAttribute("type");
  const kids = elements(node);
  if (type === "number") {
    const value = Number((node.textContent || "").trim());
    return Number.isFinite(value) ? value : 0;
  }
  if (type === "formattedtext") return innerXml(node);
  if (type === "windowreference") {
    const ref = {};
    for (const kid of kids) ref[kid.tagName] = (kid.textContent || "").trim();
    return ref;
  }
  if (type && kids.length === 0) return node.textContent || "";
  if (kids.length === 0) {
    const text = (node.textContent || "").trim();
    return text === "" ? true : text;
  }
  // An image's repeated elements (<layer>, <occluder>, <light>, <stroke>,
  // <path>) become a list. Anything else repeated keeps the last, as before
  // (a module may write a field twice: the PHB's Magic Missile repeatbase).
  const out = {};
  for (const kid of kids) {
    const value = convert(kid);
    if (!LIST_TAGS.has(kid.tagName)) out[kid.tagName] = value;
    else if (!(kid.tagName in out)) out[kid.tagName] = value;
    else if (Array.isArray(out[kid.tagName]) && out[`__list_${kid.tagName}`]) out[kid.tagName].push(value);
    else {
      out[kid.tagName] = [out[kid.tagName], value];
      out[`__list_${kid.tagName}`] = true;
    }
  }
  for (const key of Object.keys(out)) if (key.startsWith("__list_")) delete out[key];
  return out;
}

function parseXml(text) {
  const errors = [];
  const doc = new DOMParser({
    errorHandler: { warning: () => undefined, error: (message) => errors.push(message), fatalError: (message) => errors.push(message) },
  }).parseFromString(text.replace(/^﻿/, ""), "text/xml");
  if (!doc.documentElement || errors.length > 0) throw new Error(`Could not read the module's XML: ${errors[0] ?? "empty"}`);
  return doc.documentElement;
}

// A module's files. xmlOnly: decompress just its XML (the records), not its
// pictures (most of a big module), though every name is still listed.
function readFiles(source, { xmlOnly = false } = {}) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    const read = (name) => {
      const file = path.join(source, name);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    };
    return { get: read, list: () => fs.readdirSync(source, { recursive: true }).map((item) => String(item).replaceAll("\\", "/")) };
  }
  const names = [];
  const zip = unzipSync(new Uint8Array(fs.readFileSync(source)), {
    filter: (entry) => {
      names.push(entry.name.replaceAll("\\", "/"));
      return !xmlOnly || /\.xml$/i.test(entry.name);
    },
  });
  const byName = new Map(Object.entries(zip).map(([name, bytes]) => [name.replaceAll("\\", "/"), bytes]));
  return { get: (name) => byName.get(name) ?? null, list: () => names };
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

// Collect the records under one root: direct children, or the children of
// <category> elements (FG flattens categories). Book pages sit one level
// deeper: reference.refmanualdata.<page> and reference.refmanualindex.
function rootRecords(root) {
  const out = [];
  if (root.tagName === "reference") {
    for (const container of elements(root)) {
      if (container.tagName === "refmanualdata") {
        // Pages, and pages kept in categories (FG flattens them: a 3.5E Monster Manual's creatures).
        for (const page of elements(container)) {
          if (page.tagName === "category") for (const inner of elements(page)) out.push({ node: inner, category: page.getAttribute("name") || "", type: "refpage", parent: "reference.refmanualdata" });
          else out.push({ node: page, category: "", type: "refpage", parent: "reference.refmanualdata" });
        }
      } else out.push({ node: container, category: "", type: "refindex", parent: "reference" });
    }
    return out;
  }
  for (const child of elements(root)) {
    if (child.tagName === "category") {
      const category = child.getAttribute("name") || "";
      for (const record of elements(child)) out.push({ node: record, category });
    } else out.push({ node: child, category: "" });
  }
  return out;
}

// Resolve "C&C Player's Handbook" to its file: a Kraken pack of that name
// (Documents/Kraken VTT/Packs), the GM's FG module (<FG data>/modules), or a
// book Kraken ships (games/modules). A pack is read unless the FG module it
// was made from is newer.
function moduleFile(given) {
  const folder = path.join(fgDataFolder(), "modules");
  const bundled = path.join(__dirname, "..", "..", "games", "modules");
  const fg = [path.join(folder, `${given}.mod`), path.join(folder, given), path.join(bundled, `${given}.mod`), path.join(bundled, given)].find((candidate) => fs.existsSync(candidate)) ?? null;
  return packs.preferPack(packs.packFor(given), fg);
}
function resolveModule(nameOrPath) {
  const given = String(nameOrPath || "").trim();
  if (!given) throw new Error("Give a module name or path.");
  if (fs.existsSync(given)) return given;
  const found = moduleFile(given);
  if (found) return found;
  throw new Error(`No book "${given}" in ${packs.packFolder()} or ${path.join(fgDataFolder(), "modules")}.`);
}

// Just the wanted top-level sections of a module's XML (<npc>, <item>...),
// found by a quick scan of its tags, so a big module's book pages (most of
// its XML) are not parsed when only its creatures and gear are wanted.
function pickRoots(xml, wanted) {
  const open = xml.indexOf("<root");
  const start = open < 0 ? -1 : xml.indexOf(">", open) + 1;
  if (start <= 0) return xml;
  const parts = [];
  let depth = 0;
  let sectionStart = -1;
  let sectionName = "";
  let at = start;
  while (at < xml.length) {
    const lt = xml.indexOf("<", at);
    if (lt < 0) break;
    const next = xml[lt + 1];
    if (next === "!" || next === "?") {
      // A comment, CDATA or declaration: skip over it whole.
      const close = xml.startsWith("<!--", lt) ? xml.indexOf("-->", lt) + 3 : xml.startsWith("<![CDATA[", lt) ? xml.indexOf("]]>", lt) + 3 : xml.indexOf(">", lt) + 1;
      at = close > lt ? close : xml.length;
      continue;
    }
    const gt = xml.indexOf(">", lt);
    if (gt < 0) break;
    if (next === "/") {
      depth -= 1;
      if (depth === 0 && sectionStart >= 0) {
        if (wanted.has(sectionName)) parts.push(xml.slice(sectionStart, gt + 1));
        sectionStart = -1;
      }
      if (depth < 0) break;
    } else {
      const selfClosing = xml[gt - 1] === "/";
      if (depth === 0) {
        sectionStart = lt;
        sectionName = /^<([\w.-]+)/.exec(xml.slice(lt, Math.min(gt + 1, lt + 80)))?.[1]?.toLowerCase() ?? "";
        if (selfClosing) {
          sectionStart = -1;
          at = gt + 1;
          continue;
        }
      }
      if (!selfClosing) depth += 1;
    }
    at = gt + 1;
  }
  return `<root>${parts.join("")}</root>`;
}

// An NPC written in the official C&C ruleset's fields (monsterac, monsterhd,
// monsteratk text: the B series) in SiegeCore's, as the tracker reads them:
// ac.total, hd "4d8", hptotal, bth = hit dice (C&C), primeset from the saves
// (P, M, P/M), attacks parsed from "Pole arm (1d10), Dagger (1d4)".
function siegeNpc(data) {
  if (data.ac || data.monsterac === undefined) return data;
  const out = { ...data };
  const ac = parseInt(String(data.monsterac), 10);
  if (Number.isFinite(ac)) out.ac = { total: ac };
  const hdText = String(data.monsterhd ?? data.hd ?? "");
  const hd = /(\d+)\s*\(\s*(d\d+)\s*\)/i.exec(hdText);
  if (hd) {
    out.hd = `${hd[1]}${hd[2]}`;
    out.hdtext = hdText;
    out.bth = Number(hd[1]);
  } else if (/^\d+d\d+/.test(hdText)) out.hd = hdText.replace(/\s+/g, "");
  const hp = Number(data.monsterhp ?? data.hp);
  if (hp > 0) out.hptotal = hp;
  const saves = String(data.saves ?? data.Saves ?? "").toUpperCase();
  out.primeset = saves.includes("P") && saves.includes("M") ? "both" : saves.includes("M") ? "mental" : saves.includes("P") ? "physical" : "";
  if (data.monstermove) out.speed = String(data.monstermove);
  if (data.monsterintelligence) out.intelligence = String(data.monsterintelligence);
  if (data.monsteralignment && !data.alignment) out.alignment = String(data.monsteralignment);
  if (data.sa) out.specialabilities = String(data.sa);
  out.attackstext = String(data.monsteratk ?? "");
  const attacks = {};
  let n = 1;
  // "2 claws (1d4), bite (1d8)", "Pole arm (1d10), Dagger (1d4)", "Sword (1d8) or bow (1d6)".
  for (const part of String(data.monsteratk ?? "").split(/,|\bor\b|\band\b/i)) {
    const match = /^\s*(?:(\d+)\s+)?([^()]+?)\s*\(([^)]*)\)/.exec(part);
    if (!match) continue;
    const damage = /\d*d\d+(?:\s*[+-]\s*\d+)?/i.exec(match[3])?.[0]?.replace(/\s+/g, "") ?? "";
    const name = match[2].trim().replace(/^./, (c) => c.toUpperCase());
    const ranged = /bow|crossbow|sling|javelin|dart|spit|breath/i.test(name);
    for (let i = 0; i < Math.max(1, Math.min(4, Number(match[1]) || 1)); i += 1) {
      attacks[`a${String(n).padStart(2, "0")}`] = { name: Number(match[1]) > 1 ? `${name.replace(/s$/, "")} ${i + 1}` : name, bth: 0, attacktype: ranged ? "ranged" : "melee", damage };
      n += 1;
    }
  }
  // "By weapon": a weapon of the CK's choosing, 1d6 until it is set.
  if (n === 1 && /by weapon/i.test(String(data.monsteratk ?? ""))) attacks.a01 = { name: "By Weapon", bth: 0, attacktype: "melee", damage: "1d6" }, (n = 2);
  if (n > 1) out.attacks = attacks;
  return out;
}

// Prices the books leave out (C&C gives none for a staff or a sling; 3.5E
// neither): Kraken's own, after 5E's where it has one, so every common item
// can be bought. A natural weapon (Fist) stays without one.
const KRAKEN_PRICES = {
  staff: "5 gp",
  sling: "1 sp",
  club: "1 sp",
  rock: "0 cp",
  "dust, bag of": "1 cp",
  "holy symbol, chalk": "1 cp",
  "bedroll, fur lining": "5 sp",
  jewelry: "10 gp",
  "jewelry (varied)": "10 gp",
  "signet ring": "15 gp",
  "liquor, cask": "25 gp",
};
function priced(item) {
  const name = String(item.name ?? "").trim().toLowerCase();
  const cost = String(item.cost ?? "").trim();
  if (!(name in KRAKEN_PRICES) || /^[\d.]+\s*(pp|gp|ep|sp|cp)$/i.test(cost)) return item;
  return { ...item, cost: KRAKEN_PRICES[name], ...(cost ? { bookcost: cost } : {}), krakenprice: 1 };
}

// Modules converted once, as Foundry's packs: a module's records (and the
// pictures it holds) kept on disk as JSON, by the module file's size and time
// and by this converter's own code, so reading one again takes milliseconds
// (C&C Monsters & Treasure: 7 s parsed, 12 ms from its copy). The folder is
// the app's (KRAKEN_MODULE_CACHE, else the backend's KRAKEN_USER_DATA); with
// none, modules are parsed each time.
const crypto = require("crypto");
const CONVERTER = crypto.createHash("sha1").update(fs.readFileSync(__filename)).digest("hex").slice(0, 12);
function cacheFolder() {
  if (process.env.KRAKEN_MODULE_CACHE) return process.env.KRAKEN_MODULE_CACHE;
  return process.env.KRAKEN_USER_DATA ? path.join(process.env.KRAKEN_USER_DATA, "module-cache") : "";
}
const converted = new Map(); // cache file -> the read module, the last few
function cachedPath(file) {
  const folder = cacheFolder();
  if (!folder) return "";
  const stat = fs.statSync(file);
  const key = crypto.createHash("sha1").update(`${path.resolve(file)}|${stat.size}|${Math.round(stat.mtimeMs)}|${CONVERTER}`).digest("hex");
  return path.join(folder, `${key}.json`);
}
// The sections a record came from (its FG path's first part), for a reader that wants only some.
const sectionOf = (record) => String(record.data?.fgPath ?? "").split(/[.@]/)[0].toLowerCase();
// A record a reader wants: by its section, or by its type (a 3.5E book's
// classes come from its <reference> section as records of type "class").
const wantedRecord = (only, record) => only.has(sectionOf(record)) || only.has(record.type);
function readModule(nameOrPath, { only = null } = {}) {
  const file = resolveModule(nameOrPath);
  const cached = cachedPath(file);
  if (cached) {
    let whole = converted.get(cached);
    if (!whole && fs.existsSync(cached)) {
      try {
        whole = JSON.parse(fs.readFileSync(cached, "utf8"));
        whole.info.file = file;
      } catch {
        whole = null;
      }
    }
    if (!whole) {
      whole = parseModule(file, null);
      try {
        fs.mkdirSync(path.dirname(cached), { recursive: true });
        fs.writeFileSync(`${cached}.tmp`, JSON.stringify(whole));
        fs.renameSync(`${cached}.tmp`, cached);
      } catch {
        /* read again next time */
      }
    }
    converted.set(cached, whole);
    if (converted.size > 6) converted.delete(converted.keys().next().value);
    return only ? { ...whole, records: whole.records.filter((record) => wantedRecord(only, record)) } : whole;
  }
  return parseModule(file, only);
}

// A module made ready to read in milliseconds: converted in a worker thread
// (one module at a time) if its copy is not on disk yet, so the backend's own
// thread (the table server) never parses one. Resolves when it is ready.
let converting = Promise.resolve();
const preparing = new Map();
function prepareModule(nameOrPath) {
  let file;
  let cached;
  try {
    file = resolveModule(nameOrPath);
    cached = cachedPath(file);
  } catch {
    return Promise.resolve(false);
  }
  if (!cached || fs.existsSync(cached)) return Promise.resolve(true);
  if (preparing.has(cached)) return preparing.get(cached);
  const { Worker } = require("worker_threads");
  const done = (converting = converting.then(
    () =>
      new Promise((resolve) => {
        const worker = new Worker(path.join(__dirname, "convertWorker.cjs"), { workerData: { file } });
        worker.once("message", (message) => resolve(Boolean(message?.ok)));
        worker.once("error", () => resolve(false));
        worker.once("exit", () => resolve(fs.existsSync(cached)));
      }),
  )).finally(() => preparing.delete(cached));
  preparing.set(cached, done);
  return done;
}

// FG's 3.5E (and Pathfinder) rulebooks keep their classes, races, feats,
// skills, spells and gear under <reference> (reference.classes, by category),
// not as records of their own: each becomes a record of its type here
// (reference.classes.id-00001, type "class"), as a 5E book's are, so a
// campaign's activation and the 3.5E rules find them.
const REFERENCE_TYPES = { classes: "class", races: "race", feats: "feat", skills: "skill", spells: "spell", equipment: "item", tables: "table" };
function spreadReference(records) {
  const out = [];
  for (const record of records) {
    const match = record.type === "refindex" ? /^reference\.([a-z]+)@(.*)$/.exec(String(record.data?.fgPath ?? "")) : null;
    const type = match ? REFERENCE_TYPES[match[1]] : null;
    if (!type) {
      out.push(record);
      continue;
    }
    const prefix = String(record.id).split(":")[0];
    const groups = [];
    const category = record.data.category;
    if (Array.isArray(category)) groups.push(...category.map((group) => ({ name: "", items: group })));
    else if (category && typeof category === "object") groups.push({ name: "", items: category });
    for (const [key, value] of Object.entries(record.data)) if (key !== "category" && key !== "fgPath" && value && typeof value === "object" && typeof value.name === "string") groups.push({ name: "", items: { [key]: value } });
    for (const group of groups) {
      for (const [key, value] of Object.entries(group.items ?? {})) {
        if (!value || typeof value !== "object" || typeof value.name !== "string") continue;
        const fgPath = `reference.${match[1]}.${key}`;
        out.push({ id: `${prefix}:${fgPath}`.slice(0, 160), type, name: value.name, visibility: record.visibility, source: record.source, data: { ...value, fgPath: `${fgPath}@${match[2]}` } });
      }
    }
  }
  return out;
}

function parseModule(file, only) {
  // A Kraken pack: its records are already Kraken's, as JSON.
  if (packs.isPack(file)) {
    const pack = packs.readPack(file);
    pack.records = spreadReference(pack.records);
    return only ? { ...pack, records: pack.records.filter((record) => wantedRecord(only, record)) } : pack;
  }
  const files = readFiles(file, { xmlOnly: true });
  const definitionBytes = files.get("definition.xml");
  if (!definitionBytes) throw new Error("That is not a Fantasy Grounds module (no definition.xml).");
  const definition = parseXml(strFromU8(definitionBytes));
  const field = (tag) => {
    const found = elements(definition).find((node) => node.tagName === tag);
    return found ? (found.textContent || "").trim() : "";
  };
  const name = field("name") || path.basename(file, ".mod");
  const info = { name, displayName: field("displayname") || name, ruleset: field("ruleset"), author: field("author"), file };
  const prefix = slug(name);
  const records = [];
  const seen = new Set();
  // db.xml first: if a path is in both files, the GM copy wins.
  for (const [part, visibility] of [
    ["db.xml", "gm"],
    ["client.xml", "all"],
  ]) {
    const bytes = files.get(part);
    if (!bytes) continue;
    const text = strFromU8(bytes);
    // A 3.5E book keeps its classes, races, gear... under <reference>: that section too, when they are wanted.
    const wanted = only && [...only].some((type) => Object.values(REFERENCE_TYPES).includes(type)) && /<reference[\s>][\s\S]*?<(classes|races|equipment|feats|skills|spells|tables)[\s>]/.test(text) ? new Set([...only, "reference"]) : only;
    const root = parseXml(wanted ? pickRoots(text, wanted) : text);
    for (const typeNode of elements(root)) {
      const type = typeNode.tagName.toLowerCase();
      if (SKIP_ROOTS.has(type)) continue;
      for (const { node, category, type: innerType, parent } of rootRecords(typeNode)) {
        const fgPath = `${parent ?? typeNode.tagName}.${node.tagName}`;
        if (seen.has(fgPath)) continue;
        seen.add(fgPath);
        const data = convert(node);
        const converted = data && typeof data === "object" ? data : { value: data };
        const kind = innerType ?? type;
        const fields = kind === "npc" ? siegeNpc(converted) : kind === "item" ? priced(converted) : converted;
        const isPublic = visibility === "all" || fields.public === true;
        records.push({
          id: `${prefix}:${fgPath}`.slice(0, 160),
          type: innerType ?? type,
          name: typeof fields.name === "string" ? fields.name : node.tagName,
          visibility: isPublic ? "all" : "gm",
          source: name,
          data: { ...fields, fgPath: `${fgPath}@${name}`, ...(category ? { fgCategory: category } : {}) },
        });
      }
    }
  }
  const images = files.list().filter((item) => /\.(png|jpe?g|webp|gif)$/i.test(item));
  return { info, records: spreadReference(records), images };
}

// Put a module's records into a campaign's record store, replacing any
// earlier import of the same module. only: just these record types.
function importModule(store, seat, nameOrPath, { only = null } = {}) {
  const read = readModule(nameOrPath, { only });
  const { info, images } = read;
  const records = only ? read.records.filter((record) => only.has(record.type)) : read.records;
  for (const old of store.list({ source: info.name })) store.remove(old.id, seat);
  const counts = {};
  for (const record of records) {
    // One already there under this id (a creature the Library added from this
    // module before it was a book): the book's copy takes its place, same id.
    if (store.get(record.id)) store.remove(record.id, seat);
    store.create(record, seat);
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }
  return { module: info, records: records.length, counts, images: images.length };
}

function listModules() {
  const folder = path.join(fgDataFolder(), "modules");
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((name) => name.toLowerCase().endsWith(".mod"))
    .map((name) => name.slice(0, -4));
}

// An FG XML file (an exported character, say) as JSON, with the same field conversion.
function convertXml(text) {
  return convert(parseXml(text));
}

// A picture a record names, read from inside its module: "images/mt-101.webp"
// (the record's own module) or "tokens/mt-ogre.webp@Other Module". Only that
// picture is unpacked (a module's maps can be hundreds of megabytes; unpacking
// all of it for one cover froze the app). The last few modules' files stay in
// memory as they are on disk, and the pictures last asked for, unpacked.
const raw = new Map(); // module file -> { bytes, size, mtime }
const pictures = new Map(); // module file|picture -> bytes
let pictureBytes = 0;
const PICTURE_TYPES = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webm": "video/webm" };
// Whether a picture's path stays inside its module: no "..", no drive, no
// absolute path (a record's picture is words anyone may have written).
function insideModule(wanted) {
  return wanted !== "" && !/^[a-z]:/i.test(wanted) && !wanted.split("/").some((part) => part === ".." || part === ".");
}
// "<file>@<module>" names another module by its name only: a record's words
// never point at a folder or file of the GM's disk (only the module the record
// came from, set by the GM's import, may be a path).
function namedModule(name) {
  const given = String(name || "").trim();
  if (!given || /[\\/:]/.test(given) || given.startsWith(".")) throw new Error("Not a module name.");
  const found = moduleFile(given);
  if (found) return found;
  throw new Error(`No module "${given}".`);
}

function modulePicture(reference, ownModule) {
  const parts = String(reference ?? "").split("@");
  if (parts.length > 2) return null;
  const [inner, other] = parts;
  const moduleName = (other || ownModule || "").trim();
  const mime = PICTURE_TYPES[path.extname(inner).toLowerCase()];
  if (!inner || !moduleName || !mime) return null;
  const wanted = inner.replace(/^\/+/, "").replaceAll("\\", "/");
  if (!insideModule(wanted)) return null;
  let source;
  let stat;
  try {
    source = other && other.trim() !== String(ownModule ?? "").trim() ? namedModule(other) : resolveModule(moduleName);
    stat = fs.statSync(source);
  } catch {
    return null;
  }
  const key = `${source}|${stat.size}|${Math.round(stat.mtimeMs)}|${wanted.toLowerCase()}`;
  const kept = pictures.get(key);
  if (kept) {
    pictures.delete(key);
    pictures.set(key, kept);
    return { bytes: Buffer.from(kept), mime };
  }
  let bytes = null;
  try {
    if (stat.isDirectory()) {
      const file = path.resolve(source, wanted);
      bytes = file.startsWith(path.resolve(source) + path.sep) && fs.existsSync(file) ? fs.readFileSync(file) : null;
    } else {
      let zip = raw.get(source);
      if (!zip || zip.size !== stat.size || zip.mtime !== stat.mtimeMs) {
        zip = { bytes: new Uint8Array(fs.readFileSync(source)), size: stat.size, mtime: stat.mtimeMs };
        raw.set(source, zip);
        if (raw.size > 4) raw.delete(raw.keys().next().value);
      } else {
        raw.delete(source);
        raw.set(source, zip);
      }
      const lower = wanted.toLowerCase();
      const found = Object.values(unzipSync(zip.bytes, { filter: (entry) => entry.name.replaceAll("\\", "/").toLowerCase() === lower }));
      bytes = found[0] ?? null;
    }
  } catch {
    return null;
  }
  if (!bytes) return null;
  pictures.set(key, bytes);
  pictureBytes += bytes.length;
  // About 300 MB of pictures at most, the oldest let go first.
  while (pictureBytes > 300 * 1024 * 1024 && pictures.size > 1) {
    const [oldest, value] = pictures.entries().next().value;
    pictures.delete(oldest);
    pictureBytes -= value.length;
  }
  return { bytes: Buffer.from(bytes), mime };
}

module.exports = { readModule, prepareModule, importModule, listModules, fgDataFolder, convertXml, modulePicture, resolveModule };
