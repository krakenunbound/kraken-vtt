// The .kpack format (docs/kpack-format.md) and how Maelstrom files and reads packs: shared/packs/organize.mjs files
// books by kind > group > parts (no group named after its kind); kpack-make makes a pack kpack-check passes, in its
// game's folder, with its thumbnail and contents; the shelf finds packs in game folders (the GM's and the shipped
// ones), reads pages kept inside the contents (FG's newer layout), and lists no book that has no pages.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { organize, shelfTree, KINDS } from "../shared/packs/organize.mjs";

const require = createRequire(import.meta.url);
const { createBookShelf } = require("../electron/books.cjs");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const done = [];

// Filing.
{
  assert(KINDS.find((kind) => kind.id === "rules").label === "Rulesets", "the rules kind reads Rulesets");
  const at = (item, all) => organize(item, all);
  assert(at({ title: "B4 The Lost City (AD&D 2E)", category: "Adventure" }).kind === "adventure" && at({ title: "B4 The Lost City", category: "Adventure" }).group === "B series", "an adventure by its code's series");
  assert(at({ title: "The Test Keep", category: "Test Adventures", hasBook: true }).kind === "adventure", "a category saying Adventures, in any case");
  assert(at({ title: "AD&D 2E Players Handbook", category: "2e", hasBook: true }).group === "Core Rules", "a Player's Handbook is Core Rules");
  assert(at({ title: "Mystara - The Known World", category: "Kraken Worlds" }).group === "Mystara", "a setting under its world");
  const plain = at({ title: "FG Battle Maps", category: "Maps" });
  assert(plain.kind === "maps" && plain.group === "", `no group named after its kind: ${JSON.stringify(plain)}`);
  const shelf = [{ id: "a", name: "I13 Adventure Pack 1", title: "I13 Adventure Pack 1", category: "Adventure" }, { id: "b", name: "I13 AP1 - Steaks", title: "I13 AP1 - Steaks", category: "Adventure" }];
  const tree = shelfTree(shelf);
  assert(tree[0].groups[0].books.length === 1 && tree[0].groups[0].books[0].parts[0].item.id === "b", "a part under its adventure pack");
  done.push("filing");
}

const root = mkdtempSync(path.join(tmpdir(), "kraken-kpack-"));
const packs = path.join(root, "Packs");
const bundled = path.join(root, "shipped");
const picture = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#446" } }).png().toBuffer();

// kpack-make: a folder of manifest, records and pictures into a checked pack in its game's folder.
{
  const src = path.join(root, "src");
  mkdirSync(path.join(src, "images"), { recursive: true });
  writeFileSync(path.join(src, "images", "cover.png"), picture);
  writeFileSync(path.join(src, "kraken-pack.json"), JSON.stringify({ name: "Demo Crypt", title: "X1 The Demo Crypt", ruleset: "D&D 5E", cover: "images/cover.png" }));
  writeFileSync(
    path.join(src, "records.json"),
    JSON.stringify([
      { id: "demo-crypt:reference.refmanualindex", type: "refindex", name: "Contents", visibility: "gm", source: "Demo Crypt", data: { fgPath: "reference.refmanualindex@Demo Crypt", chapters: { "id-00001": { name: "One", order: 1, subchapters: { "id-00001": { name: "Start", order: 1, refpages: { "id-00001": { name: "Start", order: 1, listlink: { class: "reference_manualtextwide", recordname: "reference.refmanualdata.p1@Demo Crypt" } } } } } } } } },
      { id: "demo-crypt:reference.refmanualdata.p1", type: "refpage", name: "Start", visibility: "gm", source: "Demo Crypt", data: { name: "Start", fgPath: "reference.refmanualdata.p1@Demo Crypt", text: "<p>Hello</p>" } },
      { id: "demo-crypt:encounter.e1", type: "encounter", name: "The door", visibility: "gm", source: "Demo Crypt", data: { name: "The door", text: "<p>A door.</p>" } },
    ]),
  );
  const out = execFileSync(process.execPath, ["scripts/kpack-make.mjs", src, "--out", packs], { encoding: "utf8" });
  assert(/OK {3}Demo Crypt\.kpack/.test(out) && existsSync(path.join(packs, "D&D 5E", "Demo Crypt.kpack")), `made and checked in its game's folder: ${out}`);
  done.push("kpack-make and kpack-check");
}

// A pack whose pages are kept inside its contents, one with no pages at all, and a shipped pack in a game folder.
function pack(folder, name, records, extra = {}) {
  mkdirSync(folder, { recursive: true });
  const manifest = { format: "kraken-pack", version: 3, name, title: name, ruleset: "D&D 5E", kind: "rules", hasBook: true, hasStory: false, records: records.length, ...extra };
  writeFileSync(path.join(folder, `${name}.kpack`), zipSync({ "kraken-pack.json": strToU8(JSON.stringify(manifest)), "records.json": strToU8(JSON.stringify(records)), "images/cover.png": new Uint8Array(picture) }));
}
const inlineIndex = { id: "inline:reference.refmanualindex", type: "refindex", name: "Contents", data: { fgPath: "reference.refmanualindex@Inline Book", chapters: { "id-00001": { name: "Chapter", subchapters: { "id-00001": { name: "Section", refpages: { "id-00001": { name: "Kept inside", listlink: { class: "reference_manualtextwide", recordname: "reference.refmanualdata.inside@Inline Book" }, blocks: { "id-00001": { blocktype: "singletext", order: 1, text: "<p>Read from the contents.</p>" } } } } } } } } } };
pack(path.join(packs, "D&D 5E"), "Inline Book", [inlineIndex]);
pack(path.join(packs, "D&D 5E"), "Empty Book", [{ id: "empty:reference.refmanualindex", type: "refindex", name: "Contents", data: { fgPath: "reference.refmanualindex@Empty Book", chapters: true } }]);
pack(path.join(bundled, "D&D 5E"), "Shipped Book", [inlineIndex].map((record) => ({ ...record, data: { ...record.data, fgPath: "reference.refmanualindex@Shipped Book" } })));
{
  const shelf = createBookShelf({ folder: path.join(root, "no-fg"), cache: path.join(root, "cache", "index.json"), also: [bundled], packsFolder: packs });
  const list = shelf.list();
  const named = (title) => list.find((book) => book.title === title || book.name === title);
  assert(named("X1 The Demo Crypt")?.kind === "adventure" && named("X1 The Demo Crypt").cover, `the made pack is listed, filed, with its picture: ${JSON.stringify(named("X1 The Demo Crypt"))}`);
  assert(named("Shipped Book"), "a shipped pack in a game folder is found");
  assert(named("Inline Book")?.hasBook && !named("Empty Book")?.hasBook, "a book with pages kept in its contents is a book; one with no pages is not");
  const contents = shelf.contents(named("Inline Book").id);
  const page = contents.chapters[0].sections[0].pages[0];
  const read = shelf.page(named("Inline Book").id, page.id);
  assert(read.blocks.some((block) => /Read from the contents/.test(block.html ?? "")), `a page kept in the contents reads: ${JSON.stringify(read)}`);
  // A link to that page by its own name finds it too.
  assert(shelf.page(named("Inline Book").id, "inside").name === "Kept inside", "and a link to it by name");
  done.push("packs in game folders (the GM's and shipped)", "pages kept in the contents", "no empty books");
}
console.log(`ok kpack: ${done.join("; ")}`);
