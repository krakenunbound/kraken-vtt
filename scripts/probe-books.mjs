// How long the books take on this computer's FG modules: the shelf, every
// cover (as the Books window asks), a book's contents, its first pages and
// their pictures. (A probe, not a check.) BOOK=<title part> picks the book.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createBookShelf } = require("../electron/books.cjs");
const { fgDataFolder } = require("../electron/importers/fgModule.cjs");

const folder = process.env.KRAKEN_BOOKS || path.join(fgDataFolder(), "modules");
const time = (label, run) => {
  const start = performance.now();
  const value = run();
  console.log(`${label}: ${Math.round(performance.now() - start)} ms`);
  return value;
};
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const cacheDir = process.env.CACHE_DIR || mkdtempSync(path.join(tmpdir(), "kraken-books-probe-"));
const shelf = createBookShelf({ folder, cache: path.join(cacheDir, "books-index.json") });
const list = time("shelf (first)", () => shelf.list());
time("shelf (again)", () => shelf.list());
const covers = list.filter((item) => item.cover);
time(`${covers.length} covers`, () => covers.forEach((item) => shelf.cover(item.id)));
time(`${covers.length} covers again`, () => covers.forEach((item) => shelf.cover(item.id)));
const fresh = createBookShelf({ folder, cache: path.join(cacheDir, "books-index.json") });
time("a fresh start: the shelf", () => fresh.list());
time(`a fresh start: ${covers.length} covers (kept on disk)`, () => covers.forEach((item) => fresh.cover(item.id)));
const book = list.find((item) => item.hasBook && item.title.includes(process.env.BOOK ?? "B1 In Search"));
if (!book) process.exit(0);
const contents = time(`contents of ${book.title}`, () => shelf.contents(book.id));
const pages = contents.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.pages)).slice(0, 12);
for (const page of pages) {
  const shown = time(`  page ${page.name}`, () => shelf.page(book.id, page.id));
  for (const block of shown.blocks.filter((item) => item.kind === "picture")) time(`    picture ${block.file}`, () => shelf.picture(book.id, block.file));
}
time(`contents again`, () => shelf.contents(book.id));
time(`a page again`, () => shelf.page(book.id, pages[1].id));
