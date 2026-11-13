const fs = require("fs");
const os = require("os");
const path = require("path");
const { unzipSync, strFromU8, strToU8, Zip, ZipPassThrough, ZipDeflate } = require("fflate");

// Kraken packs: a book, an adventure or a rulebook in Kraken's own file, so it
// opens on any computer with Kraken and nothing else (no Fantasy Grounds, no
// .mod file). A pack is a zip named <book>.kpack holding:
//
//   kraken-pack.json   what it is: { format: "kraken-pack", version, name,
//                      title, category, ruleset (the Kraken ruleset it is
//                      for: "Castles & Crusades", "D&D 3.5E"...), author,
//                      cover, hasBook, records, pictures, made, from }
//   records.json       its records, as Kraken keeps them in a campaign:
//                      [{ id, type, name, visibility, source, data }]: the
//                      book's pages and contents, creatures, gear, spells,
//                      classes, races, story, encounters, treasure, tables,
//                      maps (an image record: its picture, grid, walls, doors
//                      and lights). Rich text is Kraken's small markup (p, h,
//                      b, i, u, list/li, table/tr/td, frame, link); a link
//                      names its target by the record's path and the pack's
//                      name ("npc.goblin@C&C Monsters & Treasure").
//   <pictures>         the book's pictures, maps and tokens, at the paths the
//                      records name ("images/map-1.webp", "tokens/ogre.webp").
//
// Packs live in one folder (Documents/Kraken VTT/Packs, or KRAKEN_PACKS):
// copy it to another computer and every book comes along. Kraken reads a pack
// wherever it reads a book (the Books window, activation into a campaign, the
// Library, maps with walls); when a book is both a pack and an FG module, the
// pack is read unless the module is newer.
//
// A pack is made from an FG module the GM owns (makePack): its records are
// read once by Kraken's importer and written as JSON; its pictures are copied
// as they are. A pack holds the GM's own books: it is never shipped with
// Kraken or put in its repository.

const MANIFEST = "kraken-pack.json";
const RECORDS = "records.json";
const FORMAT = "kraken-pack";
// 2: a book's pages kept in categories (a 3.5E Monster Manual's creatures)
// and a rulebook's tables are read; a pack made before is remade from its module.
const VERSION = 2;
const EXTENSION = ".kpack";

// Which Kraken ruleset an FG module's ruleset is for.
const KRAKEN_RULESET = {
  siegecore: "Castles & Crusades",
  cncrpg: "Castles & Crusades",
  "3.5e": "D&D 3.5E",
  "2e": "AD&D 2E",
  mgt2: "Traveller",
  "5e": "D&D 5E",
  descendingdarkness: "Descending Darkness",
  "descending darkness": "Descending Darkness",
  "apeira astra": "Apeira Astra",
  any: "Any",
  corerpg: "Any",
  "": "Any",
};
const krakenRuleset = (fgRuleset) => KRAKEN_RULESET[String(fgRuleset ?? "").trim().toLowerCase()] ?? String(fgRuleset ?? "").trim();

function packFolder() {
  return process.env.KRAKEN_PACKS || path.join(os.homedir(), "Documents", "Kraken VTT", "Packs");
}
// Kraken's own games' books, shipped as packs like any other (games/packs,
// made from games/modules by npm run build-packs): the app holds no book of
// its own in any other form.
const BUNDLED = path.join(__dirname, "..", "games", "packs");
const isPack = (file) => String(file).toLowerCase().endsWith(EXTENSION);
// A book's file name, safe on every system (the pack keeps its own name inside).
const fileName = (name) => `${String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 120) || "Book"}${EXTENSION}`;

// The pack's own description (only that entry is unpacked).
function readManifest(file) {
  const found = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (entry) => entry.name === MANIFEST });
  const bytes = found[MANIFEST];
  if (!bytes) throw new Error("That is not a Kraken pack (no kraken-pack.json).");
  const manifest = JSON.parse(strFromU8(bytes));
  if (manifest?.format !== FORMAT) throw new Error("That is not a Kraken pack.");
  if (Number(manifest.version) > VERSION) throw new Error("That pack was made by a newer Kraken: update Kraken to open it.");
  return manifest;
}

// A pack read whole (its description and records; pictures stay packed).
function readPack(file) {
  const found = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (entry) => entry.name === MANIFEST || entry.name === RECORDS });
  if (!found[MANIFEST]) throw new Error("That is not a Kraken pack (no kraken-pack.json).");
  const manifest = JSON.parse(strFromU8(found[MANIFEST]));
  if (manifest?.format !== FORMAT) throw new Error("That is not a Kraken pack.");
  if (Number(manifest.version) > VERSION) throw new Error("That pack was made by a newer Kraken: update Kraken to open it.");
  const records = found[RECORDS] ? JSON.parse(strFromU8(found[RECORDS])) : [];
  return {
    info: { name: manifest.name, displayName: manifest.title || manifest.name, ruleset: manifest.from?.ruleset ?? "", kraken: manifest.ruleset, author: manifest.author ?? "", file },
    records: Array.isArray(records) ? records : [],
    images: Array.isArray(manifest.pictures) ? manifest.pictures : [],
  };
}

// The packs in the packs folder, by their book's name and by their file's
// name (without .kpack): each pack's description is read once, again only
// when its file changes.
const described = new Map(); // file -> { key, manifest }
function packIndex(folder = packFolder()) {
  const byName = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(folder).filter(isPack);
  } catch {
    return byName;
  }
  for (const entry of entries) {
    const file = path.join(folder, entry);
    try {
      const stat = fs.statSync(file);
      const key = `${stat.size}|${Math.round(stat.mtimeMs)}`;
      let known = described.get(file);
      if (known?.key !== key) {
        known = { key, manifest: readManifest(file) };
        described.set(file, known);
      }
      byName.set(known.manifest.name, file);
      byName.set(entry.slice(0, -EXTENSION.length), file);
    } catch {
      /* not a pack Kraken can read */
    }
  }
  return byName;
}
// The pack of a book's name (or file name) in the packs folder, if there is one.
// The GM's own packs first, then the ones Kraken ships.
function packFor(name) {
  const wanted = String(name ?? "").trim();
  return packIndex().get(wanted) ?? packIndex(BUNDLED).get(wanted) ?? null;
}
// A pack's format version (its manifest's), read once a file.
function packVersion(file) {
  try {
    const stat = fs.statSync(file);
    const key = `${stat.size}|${Math.round(stat.mtimeMs)}`;
    let known = described.get(file);
    if (known?.key !== key) {
      known = { key, manifest: readManifest(file) };
      described.set(file, known);
    }
    return Number(known.manifest.version) || 1;
  } catch {
    return 0;
  }
}
// Whether a pack is as Kraken makes them now (else its module is read, until the pack is made again).
const packCurrent = (file) => packVersion(file) >= VERSION;
// The pack, unless the FG module it was made from is newer (the GM changed it
// since), or the pack was made by an older Kraken.
function preferPack(pack, module) {
  if (!pack) return module;
  if (!module) return pack;
  if (!packCurrent(pack)) return module;
  try {
    return fs.statSync(module).mtimeMs > fs.statSync(pack).mtimeMs + 1000 ? module : pack;
  } catch {
    return pack;
  }
}

// A module's files, as names (and sizes) and a reader for a batch of them.
function sourceFiles(source) {
  if (fs.statSync(source).isDirectory()) {
    const names = fs
      .readdirSync(source, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(source, path.join(entry.parentPath ?? entry.path, entry.name)).replaceAll("\\", "/"));
    return { names: names.map((name) => ({ name, size: fs.statSync(path.join(source, name)).size })), read: (batch) => Object.fromEntries(batch.map((name) => [name, new Uint8Array(fs.readFileSync(path.join(source, name)))])) };
  }
  const bytes = new Uint8Array(fs.readFileSync(source));
  const names = [];
  unzipSync(bytes, {
    filter: (entry) => {
      if (!entry.name.endsWith("/")) names.push({ name: entry.name, size: entry.originalSize });
      return false;
    },
  });
  return {
    names,
    read: (batch) => {
      const wanted = new Set(batch);
      return unzipSync(bytes, { filter: (entry) => wanted.has(entry.name) });
    },
  };
}
// What a pack carries of a module's files: its pictures, tokens and sounds, not FG's XML or scripts.
const KEEP = /\.(png|webp|jpe?g|gif|webm|mp4|ogg|mp3|wav|m4a)$/i;
const COMPRESSED = /\.(png|webp|jpe?g|gif|webm|mp4|ogg|mp3|m4a)$/i;

// Make a pack from an FG module (a .mod file or an unpacked folder). read: the
// importer's readModule; describe: the shelf's description of a module (its
// category, cover, whether it has a book). Writes <folder>/<name>.kpack (in
// place of an older one, only when whole) and says what it holds.
function makePack(source, { read, describe, folder = packFolder(), onProgress = () => undefined } = {}) {
  const module = read(source);
  const about = describe(source) ?? {};
  const { info } = module;
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, path.basename(source).replace(/\.mod$/i, "") + EXTENSION);
  const temporary = `${target}.part`;
  const files = sourceFiles(source);
  const kept = files.names.filter((item) => KEEP.test(item.name));
  const records = module.records.map(({ id, type, name, visibility, source: from, data }) => ({ id, type, name, visibility, source: from, data }));
  const manifest = {
    format: FORMAT,
    version: VERSION,
    name: info.name,
    title: info.displayName || about.title || info.name,
    category: about.category || "Other",
    ruleset: krakenRuleset(info.ruleset),
    author: info.author || "",
    cover: about.cover || "",
    hasBook: Boolean(about.hasBook),
    hasStory: records.some((record) => record.type === "encounter"),
    records: records.length,
    pictures: kept.map((item) => item.name),
    made: new Date().toISOString(),
    from: { kind: "fg-module", name: info.name, ruleset: info.ruleset || "" },
  };
  const fd = fs.openSync(temporary, "w");
  let failed = null;
  let finished = false;
  const zip = new Zip((error, data, final) => {
    if (error) failed = error;
    else fs.writeSync(fd, data);
    if (final) finished = true;
  });
  const add = (name, bytes, deflate) => {
    const entry = deflate ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
  };
  try {
    add(MANIFEST, strToU8(JSON.stringify(manifest, null, 1)), true);
    add(RECORDS, strToU8(JSON.stringify(records)), true);
    // The pictures in batches of about 64 MB, so a 400 MB module is never all unpacked at once.
    let batch = [];
    let size = 0;
    let done = 0;
    const flush = () => {
      if (!batch.length) return;
      const read = files.read(batch);
      for (const name of batch) if (read[name]) add(name, read[name], !COMPRESSED.test(name));
      done += batch.length;
      onProgress({ done, total: kept.length });
      batch = [];
      size = 0;
    };
    for (const item of kept) {
      batch.push(item.name);
      size += item.size;
      if (size > 64 * 1024 * 1024) flush();
    }
    flush();
    zip.end();
  } finally {
    fs.closeSync(fd);
  }
  if (failed || !finished) {
    fs.rmSync(temporary, { force: true });
    throw failed ?? new Error("The pack could not be written.");
  }
  fs.renameSync(temporary, target);
  return { file: target, name: manifest.name, title: manifest.title, ruleset: manifest.ruleset, records: records.length, pictures: kept.length, bytes: fs.statSync(target).size };
}

module.exports = { BUNDLED, packVersion, packCurrent, packFolder, isPack, fileName, readManifest, readPack, packFor, packIndex, preferPack, makePack, krakenRuleset, EXTENSION, FORMAT, VERSION };
