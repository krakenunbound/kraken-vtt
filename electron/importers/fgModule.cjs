const fs = require("fs");
const os = require("os");
const path = require("path");
const { unzipSync, strFromU8 } = require("fflate");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

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

function fgDataFolder() {
  return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "SmiteWorks", "Fantasy Grounds");
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
  const out = {};
  for (const kid of kids) out[kid.tagName] = convert(kid);
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

function readFiles(source) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    const read = (name) => {
      const file = path.join(source, name);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    };
    return { get: read, list: () => fs.readdirSync(source, { recursive: true }).map((item) => String(item).replaceAll("\\", "/")) };
  }
  const zip = unzipSync(new Uint8Array(fs.readFileSync(source)));
  const byName = new Map(Object.entries(zip).map(([name, bytes]) => [name.replaceAll("\\", "/"), bytes]));
  return { get: (name) => byName.get(name) ?? null, list: () => [...byName.keys()] };
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
        for (const page of elements(container)) out.push({ node: page, category: "", type: "refpage", parent: "reference.refmanualdata" });
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

// Resolve "C&C Player's Handbook" to <FG data>/modules/C&C Player's Handbook.mod.
function resolveModule(nameOrPath) {
  const given = String(nameOrPath || "").trim();
  if (!given) throw new Error("Give a module name or path.");
  if (fs.existsSync(given)) return given;
  const folder = path.join(fgDataFolder(), "modules");
  for (const candidate of [path.join(folder, `${given}.mod`), path.join(folder, given)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No module "${given}" in ${folder}.`);
}

function readModule(nameOrPath) {
  const file = resolveModule(nameOrPath);
  const files = readFiles(file);
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
    const root = parseXml(strFromU8(bytes));
    for (const typeNode of elements(root)) {
      const type = typeNode.tagName.toLowerCase();
      if (SKIP_ROOTS.has(type)) continue;
      for (const { node, category, type: innerType, parent } of rootRecords(typeNode)) {
        const fgPath = `${parent ?? typeNode.tagName}.${node.tagName}`;
        if (seen.has(fgPath)) continue;
        seen.add(fgPath);
        const data = convert(node);
        const fields = data && typeof data === "object" ? data : { value: data };
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
  return { info, records, images };
}

// Put a module's records into a campaign's record store, replacing any
// earlier import of the same module.
function importModule(store, seat, nameOrPath) {
  const { info, records, images } = readModule(nameOrPath);
  for (const old of store.list({ source: info.name })) store.remove(old.id, seat);
  const counts = {};
  for (const record of records) {
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
// (the record's own module) or "tokens/mt-ogre.webp@Other Module". The last
// few modules opened stay in memory.
const opened = new Map();
const PICTURE_TYPES = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };
function modulePicture(reference, ownModule) {
  const [inner, other] = String(reference ?? "").split("@");
  const moduleName = (other || ownModule || "").trim();
  const mime = PICTURE_TYPES[path.extname(inner).toLowerCase()];
  if (!inner || !moduleName || !mime) return null;
  let files = opened.get(moduleName);
  if (!files) {
    try {
      files = readFiles(resolveModule(moduleName));
    } catch {
      return null;
    }
    opened.set(moduleName, files);
    if (opened.size > 4) opened.delete(opened.keys().next().value);
  }
  const bytes = files.get(inner.replace(/^\/+/, ""));
  return bytes ? { bytes: Buffer.from(bytes), mime } : null;
}

module.exports = { readModule, importModule, listModules, fgDataFolder, convertXml, modulePicture };
