// Fate's books are Evil Hat's System Reference Documents (CC BY 3.0), read
// into Markdown once by tools/convert.mjs (games/fate/text: a folder a book,
// a file a chapter). This reads them as Cairn's Markdown is read (the same
// helpers: games/cairn/markdown.mjs), and holds the credits each book's
// first page carries word for word.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rich } from "../lib/fg.mjs";
import { plain, richText, sections } from "../cairn/markdown.mjs";

export { plain, richText, sections };
export const TEXT = path.join(path.dirname(fileURLToPath(import.meta.url)), "text");

// A chapter file's title (its front matter) and its body.
export function read(file) {
  const raw = fs.readFileSync(path.join(TEXT, file), "utf8").replace(/\r\n/g, "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const title = front ? (/^title:\s*"?(.*?)"?\s*$/m.exec(front[1])?.[1] ?? "") : "";
  return { title, body: front ? raw.slice(front[0].length).trim() : raw.trim() };
}
// A book's chapter files, in order.
export const files = (folder) => fs.readdirSync(path.join(TEXT, folder)).filter((name) => name.endsWith(".md")).sort().map((name) => `${folder}/${name}`);

// The SRDs' own attribution lines, word for word (each file's licence section).
export const CREDIT_CORE_FAE =
  "This work is based on Fate Core System and Fate Accelerated Edition (found at http://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).";
export const CREDIT_TOOLKIT =
  "This work is based on the Fate System Toolkit (found at http://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by Robert Donoghue, Brian Engard, Brennan Taylor, Mike Olson, Mark Diaz Truman, Fred Hicks, and Matthew Gandy, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).";
export const CREDIT_ADVERSARIES =
  "This work is based on the Fate Adversary Toolkit SRD (found at http://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by Brian Engard, Lara Turner, Joshua Yearsley, and Anna Meade, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).";
export const TRADEMARK = "Fate™ is a trademark of Evil Hat Productions, LLC.";
export const NOT_ENDORSED = "Kraken VTT is not affiliated with Evil Hat Productions, LLC, and this book is not endorsed by it. No Fate logo or Evil Hat art is used.";
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// A book's front page: what it is, the credits word for word, the trademark.
export function creditsPage(title, credits, what) {
  return {
    name: "Credits and License",
    keywords: "license credits cc by fate evil hat",
    text: rich(`<p><b>${escape(title)}</b></p>${what ? `<p>${escape(what)}</p>` : ""}${credits.map((line) => `<frame>${escape(line)}</frame>`).join("")}<p>${escape(TRADEMARK)}</p><p>${escape(NOT_ENDORSED)}</p><p>This book is Evil Hat's System Reference Document, read for Kraken VTT into pages and records (skills, stunts, characters): the text is theirs, under the Creative Commons Attribution 3.0 Unported license; Kraken VTT's own code is not covered by it (games/fate/LICENSE.md).</p>`),
  };
}

// A book's chapters as reference pages: a chapter a file, a page for each of
// its ## sections (a long one split at its ### sections), the licence file
// left out (its words are on the front page).
export function chapters(folder, { skip = [] } = {}) {
  const out = [];
  for (const file of files(folder)) {
    const { title, body } = read(file);
    if (/^licen[cs]e$/i.test(title) || skip.some((pattern) => pattern.test(title))) continue;
    const name = titled(title);
    const pages = [];
    for (const part of sections(body, 2)) {
      if (!part.body.trim()) continue;
      const subs = sections(part.body, 3);
      if (part.body.length > 14000 && subs.filter((sub) => sub.title).length > 2) {
        if (subs[0] && !subs[0].title && subs[0].body.trim()) pages.push({ name: titled(part.title || name), keywords: name.toLowerCase(), text: richText(subs[0].body) });
        for (const sub of subs.filter((item) => item.title && item.body.trim())) pages.push({ name: titled(sub.title), keywords: `${name} ${part.title}`.toLowerCase(), text: richText(sub.body) });
      } else pages.push({ name: titled(part.title || name), keywords: name.toLowerCase(), text: richText(part.body) });
    }
    if (pages.length) out.push({ name, sections: [{ name, pages }] });
  }
  return out;
}
// SRD headings are often in capitals: "THE FOUR OUTCOMES" -> "The Four Outcomes".
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs.", "with"]);
export function titled(text) {
  const words = plain(text).replace(/[_*]/g, "").trim();
  if (words !== words.toUpperCase() || !/[A-Z]/.test(words)) return words;
  return words
    .toLowerCase()
    .split(" ")
    .map((word, index) => (index > 0 && SMALL.has(word) ? word : word.replace(/^(\W*)(\w)/, (_, lead, c) => `${lead}${c.toUpperCase()}`)))
    .join(" ")
    .replace(/\bgm\b/gi, "GM")
    .replace(/\bnpc/gi, "NPC");
}
