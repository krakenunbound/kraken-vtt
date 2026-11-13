// Kraken's own games' books as Kraken packs (games/packs/<book>.kpack), made
// from the module folders build-content writes (games/modules). The installer
// ships these packs, not the folders: Kraken's own books load exactly as the
// GM's packs do, from a file, with nothing about them in the app's code.
// Run: node scripts/build-packs.mjs   (npm run build-packs)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { readModule } = require("../electron/importers/fgModule.cjs");
const { describe } = require("../electron/books.cjs");
const packs = require("../electron/packs.cjs");

const from = path.join(root, "games", "modules");
const folder = packs.BUNDLED;
fs.rmSync(folder, { recursive: true, force: true });
fs.mkdirSync(folder, { recursive: true });
for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
  if (!entry.isDirectory() || !fs.existsSync(path.join(from, entry.name, "definition.xml"))) continue;
  const made = packs.makePack(path.join(from, entry.name), { read: readModule, describe, folder });
  console.log(`packed ${path.basename(made.file)}: ${made.records} records, ${made.pictures} pictures, ${(made.bytes / 1e6).toFixed(1)} MB (${made.ruleset})`);
}
