// The GM's books as Kraken shows them, page by page, against what FG shows:
// every book on the shelf (FG modules, Kraken packs, Kraken's own) opened,
// every page rendered, and what reads worse than FG counted: links that go
// nowhere (by the kind of record they name), FG tags Kraken drops, empty
// pages, pictures that do not load, text with markup showing. A report, not a
// pass or fail: node scripts/audit-books.mjs [part of a title] [--pages]
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createBookShelf } = require("../electron/books.cjs");
const { fgDataFolder } = require("../electron/importers/fgModule.cjs");
const packs = require("../electron/packs.cjs");

const wanted = (process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "").toLowerCase();
const showPages = process.argv.includes("--pages");
const shelf = createBookShelf({ folder: path.join(fgDataFolder(), "modules"), also: [path.resolve("games/modules")], packsFolder: packs.packFolder() });
const totals = { books: 0, pages: 0, dead: {}, empty: 0, pictures: 0, missingPictures: 0, leaked: 0 };
const rows = [];
for (const book of shelf.list().filter((item) => !wanted || item.title.toLowerCase().includes(wanted))) {
  let contents;
  try {
    contents = shelf.contents(book.id);
  } catch (error) {
    rows.push({ title: book.title, error: error.message });
    continue;
  }
  const pages = contents.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.pages));
  if (!pages.length) continue;
  totals.books += 1;
  const row = { title: book.title, ruleset: book.ruleset ?? "", pages: pages.length, dead: {}, empty: 0, pictures: 0, missingPictures: 0, leaked: 0, samples: [] };
  for (const item of pages) {
    let page;
    try {
      page = shelf.page(book.id, item.id);
    } catch (error) {
      row.samples.push(`${item.name}: ${error.message}`);
      continue;
    }
    const html = page.blocks.filter((block) => block.kind === "text").map((block) => block.html).join("");
    const text = html.replace(/<[^>]+>/g, "").trim();
    if (!text && !page.blocks.some((block) => block.kind === "picture")) {
      row.empty += 1;
      if (showPages) row.samples.push(`empty: ${item.name}`);
    }
    for (const block of page.blocks.filter((entry) => entry.kind === "picture")) {
      row.pictures += 1;
      if (!shelf.picture(book.id, block.file)) {
        row.missingPictures += 1;
        if (row.samples.length < 12) row.samples.push(`no picture ${block.file} on ${item.name}`);
      }
    }
    for (const match of html.matchAll(/<span class="book-link dead[^"]*" data-kind="([^"]*)"/g)) row.dead[match[1] || "?"] = (row.dead[match[1] || "?"] ?? 0) + 1;
    // Markup showing as text (an escaped tag the converter did not read).
    const leaks = text.match(/&lt;\/?[a-z]+[^&]*&gt;/g) ?? [];
    row.leaked += leaks.length;
    if (leaks.length && row.samples.length < 12) row.samples.push(`markup on ${item.name}: ${leaks.slice(0, 3).join(" ")}`);
  }
  for (const [kind, count] of Object.entries(row.dead)) totals.dead[kind] = (totals.dead[kind] ?? 0) + count;
  totals.pages += row.pages;
  totals.empty += row.empty;
  totals.pictures += row.pictures;
  totals.missingPictures += row.missingPictures;
  totals.leaked += row.leaked;
  rows.push(row);
}
for (const row of rows) {
  if (row.error) {
    console.log(`! ${row.title}: ${row.error}`);
    continue;
  }
  const dead = Object.entries(row.dead).map(([kind, count]) => `${kind} ${count}`).join(", ");
  console.log(`${row.title} [${row.ruleset}]: ${row.pages} pages, ${row.pictures} pictures${row.missingPictures ? ` (${row.missingPictures} missing)` : ""}${row.empty ? `, ${row.empty} empty` : ""}${dead ? `; dead links: ${dead}` : ""}${row.leaked ? `; markup showing ${row.leaked}` : ""}`);
  for (const sample of row.samples) console.log(`    ${sample}`);
}
console.log(`\n${totals.books} books, ${totals.pages} pages, ${totals.pictures} pictures (${totals.missingPictures} missing), ${totals.empty} empty pages, markup showing ${totals.leaked}; dead links by kind: ${JSON.stringify(totals.dead)}`);
