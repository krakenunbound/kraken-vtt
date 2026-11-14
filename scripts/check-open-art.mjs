// The open games' art as the built books carry it (npm run build-games first):
// every book of SRD 5.2.1, Basic Fantasy, Cairn, Ironsworn and Starforged,
// Fate and Forged in the Dark has its cover (thumbnail.webp and
// images/cover-*.webp), and every creature, NPC and pregenerated character
// its portrait (images/npc/<key>.webp) and map token (tokens/<key>.webp),
// named inside its own book so a copy in a campaign or an encounter finds
// them. The pictures are made by games/tools/make_art.py --open.
//   node scripts/check-open-art.mjs [--report]   (--report lists, never fails)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CREATURES_SPEC } from "../games/srd-5e/creatures.mjs";
import { PLAYERS_RULES } from "../games/srd-5e/players-rules.mjs";
import { MAGIC_ITEMS_SPEC } from "../games/srd-5e/magic-items.mjs";
import { PLAYERS_HANDBOOK as BF_PLAYERS } from "../games/basic-fantasy/players-handbook.mjs";
import { GM_GUIDE as BF_GM } from "../games/basic-fantasy/gm-guide.mjs";
import { MILL_AT_HOBS_FORD } from "../games/basic-fantasy/mill-at-hobs-ford.mjs";
import { PLAYERS_GUIDE } from "../games/cairn/players-guide.mjs";
import { WARDENS_GUIDE } from "../games/cairn/wardens-guide.mjs";
import { TROUBLE_IN_TWIN_LAKES } from "../games/cairn/trouble-in-twin-lakes.mjs";
import { IRONSWORN_BOOKS, STARFORGED_BOOKS } from "../games/ironsworn/books.mjs";
import { FATE_CORE } from "../games/fate/fate-core.mjs";
import { FATE_ACCELERATED } from "../games/fate/fate-accelerated.mjs";
import { TOOLKIT } from "../games/fate/toolkit.mjs";
import { GULLS_END } from "../games/fate/gulls-end.mjs";
import { SCOUNDRELS_HANDBOOK } from "../games/forged-dark/scoundrels-handbook.mjs";
import { GM_GUIDE as FORGED_GM } from "../games/forged-dark/gm-guide.mjs";
import { BRINE_STREET } from "../games/forged-dark/brine-street.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = process.argv.includes("--report");
const BOOKS = [CREATURES_SPEC, PLAYERS_RULES, MAGIC_ITEMS_SPEC, BF_PLAYERS, BF_GM, MILL_AT_HOBS_FORD, PLAYERS_GUIDE, WARDENS_GUIDE, TROUBLE_IN_TWIN_LAKES, ...IRONSWORN_BOOKS, ...STARFORGED_BOOKS, FATE_CORE, FATE_ACCELERATED, TOOLKIT, GULLS_END, SCOUNDRELS_HANDBOOK, FORGED_GM, BRINE_STREET];

let checks = 0;
const missing = [];
const totals = { covers: 0, portraits: 0, tokens: 0 };
for (const book of BOOKS) {
  const folder = path.join(ROOT, "games", "modules", book.name);
  if (!fs.existsSync(folder)) throw new Error(`${book.name}: not built (npm run build-games).`);
  checks += 1;
  if (book.thumbnail && fs.existsSync(path.join(folder, "thumbnail.webp")) && Object.keys(book.pictures ?? {}).some((file) => /^images\/cover-/.test(file))) totals.covers += 1;
  else missing.push(`${book.name}: no cover`);
  for (const side of ["gm", "players"]) for (const type of ["npc", "pregencharsheet"]) for (const record of book[side]?.[type] ?? []) {
    for (const field of ["picture", "token"]) {
      checks += 1;
      const value = record[field];
      const [file, owner] = String(value ?? "").split("@");
      if (!value) missing.push(`${book.name}: ${record.name} has no ${field}`);
      else if (owner !== book.name) missing.push(`${book.name}: ${record.name}'s ${field} names ${owner}`);
      else if (!fs.existsSync(path.join(folder, file))) missing.push(`${book.name}: ${record.name}'s ${field} ${file} is not in the book`);
      else totals[field === "picture" ? "portraits" : "tokens"] += 1;
    }
  }
}
console.log(`${BOOKS.length} books: ${totals.covers} covers, ${totals.portraits} portraits, ${totals.tokens} tokens (${checks} checks).`);
if (missing.length) {
  console.log(missing.slice(0, report ? missing.length : 40).join("\n"));
  if (!report) {
    console.error(`${missing.length} pictures missing.`);
    process.exit(1);
  }
}
if (!missing.length) console.log("open games' art: every book has its cover, every creature and NPC its portrait and token.");
