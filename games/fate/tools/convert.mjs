// Fate's books are made from Evil Hat's official System Reference Documents
// (HTML, CC BY 3.0, https://www.faterpg.com/licensing/): this reads them into
// Markdown, a file a chapter (games/fate/text/<book>/NN-slug.md), which the
// books in games/fate read as Cairn's are read (games/cairn/markdown.mjs).
// Run once with the folder of the SRDs (the "CC-BY SRDs" of Evil Hat's zip):
//
//   node games/fate/tools/convert.mjs "path/to/CC-BY SRDs"
//
// Headings stay headings (a paragraph styled as a heading too); paragraphs,
// lists and tables are kept; bold and italic come from the SRD's styles
// (Strong, Inline-Header: bold; Emphasis, Aspect, Term, Book-Title: italic);
// sidebars and examples become block quotes; links keep their words. The
// licence paragraph at the top of each file is kept word for word.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "text");
const source = process.argv[2];
if (!source) {
  console.error("Usage: node games/fate/tools/convert.mjs <folder of the Fate SRD HTML files>");
  process.exit(1);
}

const BOOKS = [
  { file: "Fate-Core-SRD-CC.html", folder: "core" },
  { file: "Fate-Accelerated-SRD-CC.html", folder: "fae" },
  { file: "FST-SRD-CC.html", folder: "toolkit" },
  { file: "Fate-Adversary-Toolkit-SRD-Source-CCBY.html", folder: "adversaries" },
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", copy: "©", trade: "™", reg: "®", eacute: "é", times: "×", minus: "−", bull: "•", middot: "·", deg: "°", frac12: "½" };
const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z0-9]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);

const BOLD = /\b(Strong|Inline-Header|Bulleted-Inline-Header|Strong-Sidebar|Inline-Header--ih-|terminology)\b/;
const ITALIC = /\b(Emphasis|Aspect|Aspect-sidebar|Term|Book-Title|Chapter|Emphasis-Sidebar|Sidebar-Emphasis|aspect|booktitle)\b/;
const QUOTE = /\b(Sidebar|Sidebar-body|Sidebar-Body-First|Sidebar-Header|Sidebar-bullets|Sidebar-Numbered-List|Sidebar-Numbered-List-Start|Example|Example-start|Example-middle|Example-end|Example-bullets|Example-end-no-indent|Example-middle-no-indent|example|Box-Header|Box-Tab)\b/;

// Markers are kept as placeholders until a block is done, so an opening one
// never has a space after it, nor a closing one before it.
const OPEN = { "**": "\u0002", _: "\u0004" };
const CLOSE = { "**": "\u0003", _: "\u0005" };
function tidy(text) {
  let clean = text.replace(/\s+/g, " ");
  for (let i = 0; i < 4; i += 1) clean = clean.replace(/([\u0002\u0004]+)(\s+)/g, "$2$1").replace(/(\s+)([\u0003\u0005]+)/g, "$2$1");
  // Empty pairs go; a pair just closed and opened again joins up.
  for (let i = 0; i < 3; i += 1) clean = clean.replace(/\u0002\u0003|\u0004\u0005/g, "").replace(/\u0003\u0002|\u0005\u0004/g, "");
  // The SRD sometimes runs a styled word into the next ("the_Dazed_"): a space between.
  clean = clean.replace(/([A-Za-z0-9,;])([\u0002\u0004])/g, "$1 $2").replace(/([\u0003\u0005])([A-Za-z0-9])/g, "$1 $2");
  return clean.replace(/[\u0002\u0003]/g, "**").replace(/[\u0004\u0005]/g, "_").replace(/\s+/g, " ").trim();
}

// One file's HTML to Markdown.
function convert(html) {
  const body = html.replace(/<head[\s\S]*?<\/head>/i, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[^>]*>/i, "").replace(/<title[\s\S]*?<\/title>/i, "");
  const out = [];
  // The block being written: its kind (p, h, li), prefix, words, and a marker to close it with.
  let block = null;
  const marks = [];
  let table = null;
  let row = null;
  let cell = null;
  let depth = 0;
  const words = () => cell ?? block;
  function flush() {
    if (!block) return;
    const text = tidy(block.text + (block.closeWith ?? ""));
    if (text && !/^(\*\*|_)+$/.test(text) && !/^\*\*\d+\*\*$/.test(text) && !/^\d+$/.test(text)) out.push(`${block.quote ? "> " : ""}${block.prefix}${text}`, "");
    block = null;
  }
  const start = (kind, prefix = "", quote = false) => {
    flush();
    block = { kind, prefix, quote, text: "" };
  };
  const add = (text) => {
    if (!words()) block = { kind: "p", prefix: "", quote: false, text: "" };
    words().text += text;
  };
  const tags = /<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  for (const match of body.matchAll(tags)) {
    if (match[4] !== undefined) {
      const text = decode(match[4]);
      // A star in the text is no Markdown.
      if (text.trim() || (words() && /\s/.test(text))) add(text.replace(/\*/g, "∗"));
      continue;
    }
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const attrs = match[3] ?? "";
    const cls = /class\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
    if (/^h[1-6]$/.test(tag)) {
      if (closing) flush();
      else start("h", `${"#".repeat(Number(tag[1]))} `);
      continue;
    }
    if (tag === "table") {
      if (!closing) {
        flush();
        table = [];
      } else if (table) {
        const rows = table.filter((cells) => cells.some((text) => text));
        if (rows.length) {
          const width = Math.max(...rows.map((cells) => cells.length));
          const line = (cells) => `| ${Array.from({ length: width }, (_, index) => (cells[index] ?? "").replace(/\|/g, "/")).join(" | ")} |`;
          out.push(line(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line), "");
        }
        table = null;
      }
      continue;
    }
    if (table && tag === "tr") {
      if (!closing) row = [];
      else if (row) {
        table.push(row);
        row = null;
      }
      continue;
    }
    if (table && (tag === "td" || tag === "th")) {
      if (!closing) cell = { text: "" };
      else if (cell) {
        row?.push(tidy(cell.text));
        cell = null;
      }
      continue;
    }
    if (tag === "p" || tag === "div") {
      if (cell) {
        if (closing) cell.text += " ";
        continue;
      }
      if (closing) {
        if (tag === "p") flush();
        continue;
      }
      const heading = /\bHeading-(\d)\b/.exec(cls) ?? (/\bActions\b/.test(cls) ? [0, "3"] : null);
      if (tag === "p" && heading) start("h", `${"#".repeat(Math.min(6, Number(heading[1]) + 1))} `);
      else if (tag === "p" && /Statblock-Miniheader/.test(cls)) {
        start("p");
        block.text = OPEN["**"];
        block.closeWith = CLOSE["**"];
      } else if (tag === "p") start("p", "", QUOTE.test(cls));
      continue;
    }
    if (tag === "li") {
      if (cell) continue;
      if (!closing) start("li", `${"  ".repeat(Math.max(0, depth - 1))}- `, QUOTE.test(cls));
      else flush();
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      if (cell) continue;
      depth = Math.max(0, depth + (closing ? -1 : 1));
      if (closing && depth === 0) flush();
      continue;
    }
    if (tag === "br") {
      add(" ");
      continue;
    }
    if (tag === "hr") {
      flush();
      continue;
    }
    // Inline: bold and italic by tag or style; everything else keeps its words.
    if (["span", "b", "strong", "i", "em", "a", "dice", "font", "u", "sup", "sub", "strike"].includes(tag)) {
      if (!closing) {
        const mark = tag === "b" || tag === "strong" || BOLD.test(cls) ? "**" : tag === "i" || tag === "em" || ITALIC.test(cls) ? "_" : "";
        const used = (mark === "**" && marks.includes("**")) || (mark === "_" && marks.includes("_")) || (mark === "**" && block?.closeWith) ? "" : mark;
        marks.push(used);
        if (used) add(OPEN[used]);
      } else {
        const mark = marks.pop() ?? "";
        if (mark) add(CLOSE[mark]);
      }
      continue;
    }
  }
  flush();
  // List items of one list sit together; everything else a blank line apart.
  const lines = [];
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === "" && /^\s*(> )?- /.test(out[i - 1] ?? "") && /^\s*(> )?- /.test(out[i + 1] ?? "")) continue;
    lines.push(out[i]);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

const slug = (text) => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "part";

for (const book of BOOKS) {
  const html = fs.readFileSync(path.join(source, book.file), "utf8");
  const markdown = convert(html);
  const folder = path.join(OUT, book.folder);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  // A chapter a file: at each top-level heading (#), the licence before the first.
  const chapters = [];
  for (const line of markdown.split("\n")) {
    const top = /^#\s+(.*)$/.exec(line);
    if (top || chapters.length === 0) chapters.push({ title: top ? top[1].replace(/[*_]/g, "").trim() : "", lines: [] });
    if (!top) chapters.at(-1).lines.push(line);
  }
  let n = 0;
  for (const chapter of chapters) {
    const text = chapter.lines.join("\n").trim();
    if (!text && !chapter.title) continue;
    n += 1;
    const title = chapter.title || "Licence";
    const file = `${String(n).padStart(2, "0")}-${slug(title)}.md`;
    fs.writeFileSync(path.join(folder, file), `---\ntitle: "${title.replace(/"/g, "'")}"\n---\n\n${text}\n`);
  }
  console.log(`${book.file}: ${n} chapters -> ${path.relative(process.cwd(), folder)}`);
}
