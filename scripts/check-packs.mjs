// Kraken packs: an FG module (a folder or a .mod) made into Kraken's own file
// (.kpack) and read with no FG module left: the same records, its book's
// contents and pages, its pictures byte for byte, its maps with the same walls
// and doors; the shelf shows a book once (the pack, unless the module is
// newer); a file that is not a pack, or is from a newer Kraken, is refused.
// Uses a copy of Kraken's own Empty Watchtower under another name, so it
// needs no FG modules.
import "./loopback.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-packs-"));
const fgFolder = path.join(work, "fg-modules");
const packsFolder = path.join(work, "packs");
process.env.KRAKEN_PACKS = packsFolder;
process.env.KRAKEN_MODULE_CACHE = path.join(work, "cache");
const { zipSync, strToU8 } = require("fflate");
const { readModule, modulePicture, resolveModule } = require("../electron/importers/fgModule.cjs");
const { createBookShelf, describe } = require("../electron/books.cjs");
const { makePack, readManifest, packFor, VERSION } = require("../electron/packs.cjs");
const { fgModuleBundle } = require("../electron/importers/fgMaps.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const NAME = "Pack Test Watchtower";
const HANDBOOK = "Pack Test Handbook";

// The fixtures: Kraken's adventure as a folder module, its handbook as a .mod, renamed.
function copyRenamed(from, to, oldName, newName) {
  fs.cpSync(from, to, { recursive: true });
  for (const file of ["definition.xml", "db.xml", "client.xml"]) {
    const at = path.join(to, file);
    if (fs.existsSync(at)) fs.writeFileSync(at, fs.readFileSync(at, "utf8").replaceAll(oldName, newName));
  }
}
fs.mkdirSync(fgFolder, { recursive: true });
copyRenamed(path.join("games", "modules", "The Empty Watchtower"), path.join(fgFolder, NAME), "The Empty Watchtower", NAME);
const handbookFolder = path.join(work, "handbook");
copyRenamed(path.join("games", "modules", "Descending Darkness Player's Handbook"), handbookFolder, "Descending Darkness Player's Handbook", HANDBOOK);
const entries = {};
for (const file of fs.readdirSync(handbookFolder, { recursive: true })) {
  const at = path.join(handbookFolder, String(file));
  if (fs.statSync(at).isFile()) entries[String(file).replaceAll("\\", "/")] = new Uint8Array(fs.readFileSync(at));
}
fs.writeFileSync(path.join(fgFolder, `${HANDBOOK}.mod`), zipSync(entries));
const at = (name) => path.join(fgFolder, name);

// From the modules, before any pack.
const before = readModule(at(NAME));
const beforeBook = readModule(at(`${HANDBOOK}.mod`));
const firstPicture = before.images.find((name) => /^images\//.test(name));
assert(before.records.length > 20 && firstPicture, "the fixture module reads");

// Packs made.
const made = makePack(at(NAME), { read: readModule, describe, folder: packsFolder });
const madeBook = makePack(at(`${HANDBOOK}.mod`), { read: readModule, describe, folder: packsFolder });
assert(made.file.endsWith(`${NAME}.kpack`) && made.records === before.records.length && made.pictures > 0, `a pack of the adventure: ${JSON.stringify(made)}`);
assert(madeBook.records === beforeBook.records.length, "a pack of the handbook (.mod)");
const manifest = readManifest(made.file);
assert(manifest.format === "kraken-pack" && manifest.version === VERSION && manifest.name === NAME && manifest.ruleset === "Descending Darkness" && manifest.from.kind === "fg-module" && manifest.hasBook === false && readManifest(madeBook.file).hasBook === true, `the pack describes itself: ${JSON.stringify(manifest).slice(0, 300)}`);
assert(!fs.readFileSync(made.file).includes(Buffer.from(work)), "a pack names no folder of the GM's computer");

// The FG modules gone: everything from the packs.
const pictureBefore = fs.readFileSync(path.join(at(NAME), firstPicture));
fs.rmSync(fgFolder, { recursive: true, force: true });
assert(packFor(NAME) === made.file && resolveModule(NAME) === made.file, "the book's name finds its pack");
const after = readModule(NAME);
assert(JSON.stringify(after.records) === JSON.stringify(before.records), "the pack's records are the module's");
const pictureAfter = modulePicture(firstPicture, NAME).bytes;
assert(Buffer.compare(pictureBefore, pictureAfter) === 0, "a picture comes out of the pack byte for byte");
const maps = fgModuleBundle(NAME);
assert(maps.scenes.length > 0 && maps.scenes.some((scene) => scene.walls > 0), `the maps, with their walls and doors: ${JSON.stringify(maps.scenes)}`);
const shelf = createBookShelf({ folder: fgFolder, cache: path.join(work, "shelf.json"), packsFolder });
const listed = shelf.list();
const adventure = listed.find((item) => item.name === NAME);
const handbook = listed.find((item) => item.name === HANDBOOK);
assert(listed.length === 2 && adventure?.pack === true && adventure.kraken === "Descending Darkness" && adventure.adventure === true && handbook?.forPlayers === true, `the shelf lists the packs: ${JSON.stringify(listed)}`);
const contents = shelf.contents(handbook.id);
assert(contents.chapters.length > 2 && contents.chapters[0].sections[0].pages.length > 0, "the handbook's contents from its pack");
const firstPage = contents.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.pages))[1];
const page = shelf.page(handbook.id, firstPage.id);
assert(page.blocks.some((block) => block.kind === "text" && block.html.length > 40), "a page from the pack");
assert(shelf.cover(handbook.id)?.bytes.length > 1000, "its cover");

// A module newer than its pack: the module is read, the shelf shows it once.
fs.mkdirSync(fgFolder, { recursive: true });
copyRenamed(path.join("games", "modules", "The Empty Watchtower"), at(NAME), "The Empty Watchtower", NAME);
const later = new Date(Date.now() + 60000);
fs.utimesSync(at(NAME), later, later);
shelf.refresh();
const again = shelf.list().filter((item) => item.name === NAME);
assert(again.length === 1 && !again[0].pack, `once on the shelf, the newer module: ${JSON.stringify(again)}`);
const old = new Date(Date.now() - 3600000);
fs.utimesSync(at(NAME), old, old);
shelf.refresh();
assert(shelf.list().filter((item) => item.name === NAME).map((item) => item.pack).join() === "true", "an older module: the pack");

// Not packs: a zip without the description, and one from a newer Kraken.
fs.writeFileSync(path.join(packsFolder, "Not a pack.kpack"), zipSync({ "hello.txt": strToU8("hi") }));
fs.writeFileSync(path.join(packsFolder, "Too new.kpack"), zipSync({ "kraken-pack.json": strToU8(JSON.stringify({ format: "kraken-pack", version: 99, name: "Too new" })) }));
let refused = 0;
for (const name of ["Not a pack.kpack", "Too new.kpack"]) {
  try {
    readManifest(path.join(packsFolder, name));
  } catch {
    refused += 1;
  }
}
shelf.refresh();
assert(refused === 2 && !shelf.list().some((item) => /Not a pack|Too new/.test(item.name)), "a file that is not a pack, or is too new, is left out");
fs.rmSync(work, { recursive: true, force: true });
console.log(`ok packs: ${made.records} records, ${made.pictures} pictures and ${maps.scenes.length} maps (walls and doors) read from the pack with no FG module; a handbook's book from a .mod's pack; a newer module wins; a non-pack refused`);
