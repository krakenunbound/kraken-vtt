// The item pictures as the built books carry them (npm run build-games first):
// every item record of every open game's book has its picture
// (images/item/<key>.webp), named inside its own book and found inside that
// book, never another's, so each game's packs stand alone (any can be removed
// or added). The same kind of item has the same key in every game, and each
// game keeps its own copy of the painting (games/<game>/art/item).
// The pictures are painted by games/tools/paint_items.py (prompts: item-art.mjs).
//   node scripts/check-item-art.mjs [--report]   (--report lists, never fails)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gameOfBook, itemKey } from "../games/lib/fg.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { readModule } = require(path.join(ROOT, "electron", "importers", "fgModule.cjs"));
const report = process.argv.includes("--report");

const problems = [];
let items = 0;
let books = 0;
const keysByGame = new Map();
for (const name of fs.readdirSync(path.join(ROOT, "games", "modules"))) {
  const dir = path.join(ROOT, "games", "modules", name);
  const game = gameOfBook(name);
  if (!game || !fs.existsSync(path.join(dir, "definition.xml"))) continue;
  const records = (readModule(dir).records ?? []).filter((record) => record.type === "item");
  if (!records.length) continue;
  books += 1;
  for (const record of records) {
    items += 1;
    const picture = String(record.data?.picture ?? "");
    const [file, book] = picture.split("@");
    if (!picture) problems.push(`${name}: ${record.name} has no picture`);
    else if (book !== name) problems.push(`${name}: ${record.name}'s picture is in another book (${book})`);
    else if (!fs.existsSync(path.join(dir, file))) problems.push(`${name}: ${record.name}'s picture ${file} is not in the book`);
    else if (file !== `images/item/${itemKey(record.name)}.webp`) problems.push(`${name}: ${record.name}'s picture is ${file}, not its kind's`);
    const keys = keysByGame.get(game) ?? new Set();
    keys.add(itemKey(record.name));
    keysByGame.set(game, keys);
  }
}
// Each game's own folder holds its own copy of every picture its books use.
for (const [game, keys] of keysByGame) for (const key of keys) if (!fs.existsSync(path.join(ROOT, "games", game, "art", "item", `${key}.webp`))) problems.push(`games/${game}/art/item/${key}.webp is missing`);

if (report) {
  console.log(`${items} items in ${books} books; ${problems.length} without their picture`);
  for (const line of problems.slice(0, 60)) console.log(`  ${line}`);
} else if (problems.length) {
  console.error(problems.slice(0, 20).join("\n"));
  throw new Error(`${problems.length} item pictures missing or misplaced`);
} else console.log(`ok item art: ${items} items in ${books} books, each with its own picture inside its own book`);
