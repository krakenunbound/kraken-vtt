const fs = require("fs");
const path = require("path");
const { zipEntries } = require("./decals.cjs");
const { inflateSync } = require("fflate");

// Dice packs: more dice sets for every seat, made by the GM (or an AI agent
// for them) and dropped in Documents/Kraken VTT/Dice. A pack is a folder, or
// a .zip of one, holding dice.json and, if its sets wear pictures, those
// pictures (PNG, WebP or JPEG). The format, with examples, is
// skills/kraken-content/folders/Dice/README.md (copied into the Dice folder).
//
// dice.json:
//   { "kraken": "dice-pack", "version": 1, "name", "author", "description",
//     "sets": [ { "name", "theme", "body", "ink", "accent", "material",
//                 "effect", "font", "crit", "pips",
//                 "texture": "face.png", "glow": "glow.png" } ] }
// A set with a texture is drawn with that picture wrapped on its faces (the
// "picture" design); glow is the part of it that shines in the dark.
// Ids: a pack is its folder's (or zip's) name; a picture is "<pack>/<file>".
// Ids are only ever looked up in the index, never used as paths.

const IMAGE = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const MAX_PICTURE = 8 * 1024 * 1024;
const MAX_SETS = 60;

function readZip(file, entry) {
  if (entry.encrypted || entry.unpacked > MAX_PICTURE * 2) return null;
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(30);
    fs.readSync(fd, head, 0, 30, entry.offset);
    if (head.readUInt32LE(0) !== 0x04034b50) return null;
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const data = Buffer.alloc(entry.packed);
    fs.readSync(fd, data, 0, entry.packed, start);
    if (entry.method === 0) return data;
    if (entry.method === 8) return Buffer.from(inflateSync(data));
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

// A pack's files, as { names, read(name) }: a folder's, or a zip's (a zip
// holding one folder is read inside that folder).
function source(at) {
  if (fs.statSync(at).isDirectory()) {
    const names = [];
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
        else names.push(`${prefix}${entry.name}`);
      }
    };
    walk(at, "");
    return { names, read: (name) => fs.readFileSync(path.join(at, ...name.split("/"))) };
  }
  const entries = zipEntries(at).filter((entry) => !entry.name.endsWith("/"));
  const top = entries.find((entry) => /(^|\/)dice\.json$/i.test(entry.name))?.name.replace(/dice\.json$/i, "") ?? "";
  const inside = entries.filter((entry) => entry.name.startsWith(top)).map((entry) => ({ ...entry, short: entry.name.slice(top.length) }));
  return {
    names: inside.map((entry) => entry.short),
    read: (name) => {
      const entry = inside.find((item) => item.short === name);
      const bytes = entry ? readZip(at, entry) : null;
      if (!bytes) throw new Error(`${name} could not be read from the zip.`);
      return bytes;
    },
  };
}

// lookOf: the table's dice-look cleaner (tableServer's diceLook), so a pack's
// set is held to the same rules as any other dice.
function readPack(at, id, lookOf) {
  const problems = [];
  const files = source(at);
  const jsonName = files.names.find((name) => name.toLowerCase() === "dice.json");
  if (!jsonName) return { id, name: id, sets: [], problems: ["No dice.json in the pack."] };
  let json;
  try {
    json = JSON.parse(files.read(jsonName).toString("utf8").replace(/^﻿/, ""));
  } catch (error) {
    return { id, name: id, sets: [], problems: [`dice.json is not valid JSON: ${error.message}`] };
  }
  if (json?.kraken !== "dice-pack") problems.push('dice.json should say "kraken": "dice-pack".');
  const pictures = new Map();
  const picture = (name, set, key) => {
    if (name === undefined || name === null || name === "") return undefined;
    const wanted = String(name).replace(/\\/g, "/").replace(/^\.\//, "");
    const found = files.names.find((item) => item.toLowerCase() === wanted.toLowerCase());
    if (!found) {
      problems.push(`${set}: its ${key} "${wanted}" is not in the pack.`);
      return null;
    }
    const mime = IMAGE[path.extname(found).toLowerCase()];
    if (!mime) {
      problems.push(`${set}: its ${key} "${found}" is not a PNG, WebP or JPEG picture.`);
      return null;
    }
    pictures.set(found, mime);
    return `${id}/${found}`;
  };
  const sets = [];
  const names = new Set();
  for (const [index, raw] of (Array.isArray(json?.sets) ? json.sets : []).slice(0, MAX_SETS).entries()) {
    const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 60) : `Set ${index + 1}`;
    if (names.has(name)) problems.push(`Two sets are called "${name}"; the second is left out.`);
    if (names.has(name)) continue;
    const texture = picture(raw?.texture, name, "texture");
    const glow = picture(raw?.glow, name, "glow");
    if (texture === null || glow === null) continue;
    if (glow && !texture) problems.push(`${name}: a glow picture needs a texture too; the glow is left out.`);
    const look = lookOf({ ...raw, theme: texture ? "picture" : raw?.theme, texture, glowTexture: texture ? glow : undefined });
    if (!look) {
      problems.push(`${name}: needs a known theme (or a texture) and body and ink colours as #rrggbb.`);
      continue;
    }
    names.add(name);
    sets.push({ name, ...look });
  }
  if (!Array.isArray(json?.sets) || json.sets.length === 0) problems.push("dice.json has no sets.");
  if (Array.isArray(json?.sets) && json.sets.length > MAX_SETS) problems.push(`Only the first ${MAX_SETS} sets are read.`);
  const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  return { id, name: text(json?.name, 80) || id, author: text(json?.author, 80), description: text(json?.description, 400), sets, problems, pictures, files };
}

function createDicePacks({ folder, lookOf }) {
  let index = null;
  let indexedAt = 0;
  function scan() {
    if (index && Date.now() - indexedAt < 10000) return index;
    const packs = new Map();
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      /* no folder yet */
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const at = path.join(folder, entry.name);
      const zip = entry.isFile() && entry.name.toLowerCase().endsWith(".zip");
      if (!entry.isDirectory() && !zip) continue;
      const id = zip ? entry.name.slice(0, -4) : entry.name;
      if (packs.has(id)) continue;
      try {
        packs.set(id, readPack(at, id, lookOf));
      } catch (error) {
        packs.set(id, { id, name: id, sets: [], problems: [String(error.message ?? error)] });
      }
    }
    index = packs;
    indexedAt = Date.now();
    return index;
  }
  const shown = (pack) => ({ id: pack.id, name: pack.name, author: pack.author ?? "", description: pack.description ?? "", sets: pack.sets, problems: pack.problems });
  return {
    folder,
    list: () => [...scan().values()].map(shown),
    // A pack anywhere (an agent's work before it is dropped in): what Kraken makes of it.
    check(at) {
      const full = path.resolve(String(at ?? ""));
      if (!fs.existsSync(full)) throw new Error(`Nothing at ${full}.`);
      return shown(readPack(full, path.basename(full).replace(/\.zip$/i, ""), lookOf));
    },
    file(id) {
      const text = String(id ?? "");
      const cut = text.indexOf("/");
      const pack = cut > 0 ? scan().get(text.slice(0, cut)) : null;
      const name = text.slice(cut + 1);
      const mime = pack?.pictures?.get(name);
      if (!mime) return null;
      try {
        const bytes = pack.files.read(name);
        return bytes.length <= MAX_PICTURE ? { bytes, mime } : null;
      } catch {
        return null;
      }
    },
    refresh() {
      index = null;
    },
  };
}

module.exports = { createDicePacks };
