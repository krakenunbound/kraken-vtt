// Cairn's books are its own Markdown (games/cairn/text, CC BY-SA 4.0, copied
// from github.com/yochaigal/cairn): this reads it. front matter off, pictures
// and site links dropped (the words of a link stay), and the rest made FG's
// formatted text (games/lib/fg.mjs rich()): headings, paragraphs, lists
// (a nested item flattened with a dash), tables, block quotes as frames.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rich } from "../lib/fg.mjs";

export const TEXT = path.join(path.dirname(fileURLToPath(import.meta.url)), "text");

// A file's title (its front matter) and its body.
export function read(file) {
  const raw = fs.readFileSync(path.join(TEXT, file), "utf8").replace(/\r\n/g, "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const title = front ? (/^title:\s*"?(.*?)"?\s*$/m.exec(front[1])?.[1] ?? "") : "";
  const body = (front ? raw.slice(front[0].length) : raw)
    // Pictures (the site's art is not part of the text's licence) and the site's own lines.
    .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
    .replace(/<br\s*\/?>/gi, " ");
  return { title, body };
}

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Inline markup: links to their words, **bold**, _italic_ / *italic*, `code`.
export function inline(text) {
  return escape(String(text))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*\*/g, "")
    .replace(/(^|[^A-Za-z0-9])_(.+?)_(?![A-Za-z0-9])/g, "$1<i>$2</i>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>");
}
// Plain words (no markup), for names and summaries.
export const plain = (text) => String(text ?? "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

// A pipe table's rows (cells as Markdown), its alignment line left out.
export function tableRows(lines) {
  return lines
    .filter((line) => line.trim().startsWith("|") && !/^\|?\s*:?-{2,}/.test(line.trim().replace(/^\|\s*/, "")))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim()));
}

// Markdown to FG formatted text.
export function toHtml(markdown) {
  const lines = String(markdown).split("\n");
  const out = [];
  let paragraph = [];
  let list = [];
  let quote = [];
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<list>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</list>`);
    list = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<frame>${inline(quote.join(" "))}</frame>`);
    quote = [];
  };
  const flush = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || /^\*{3,}$/.test(trimmed) || /^-{3,}$/.test(trimmed)) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      out.push(`<h>${inline(heading[2].replace(/\s*#+\s*$/, ""))}</h>`);
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
      i -= 1;
      const rowsOf = tableRows(block);
      out.push(`<table>${rowsOf.map((row, index) => `<tr${index === 0 ? ' decoration="underline"' : ""}>${row.map((cell) => `<td>${index === 0 ? `<b>${inline(cell.replace(/\*\*/g, ""))}</b>` : inline(cell)}</td>`).join("")}</tr>`).join("")}</table>`);
      continue;
    }
    const item = /^(\s*)[-*+]\s+(\[[ xX]\]\s+)?(.*)$/.exec(line) ?? /^(\s*)\d+\.\s+()(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      flushQuote();
      const nested = item[1].replace(/\t/g, "  ").length >= 2;
      list.push(`${nested ? "— " : ""}${item[2] ? "☐ " : ""}${item[3]}`);
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    // A line continuing a list item.
    if (list.length && /^\s+\S/.test(line)) {
      list[list.length - 1] += ` ${trimmed}`;
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }
  flush();
  return out.join("");
}
export const richText = (markdown) => rich(toHtml(markdown));

// A body split at headings of one level: [{ title, body }] (what comes before the first heading: title "").
export function sections(body, level = 2) {
  const marker = new RegExp(`^${"#".repeat(level)}\\s+(.*)$`);
  const out = [{ title: "", body: [] }];
  let fence = false;
  for (const line of String(body).split("\n")) {
    if (line.trim().startsWith("```")) fence = !fence;
    const match = fence ? null : marker.exec(line.trim());
    if (match && !line.trim().startsWith("#".repeat(level + 1))) out.push({ title: plain(match[1]), body: [] });
    else out.at(-1).body.push(line);
  }
  return out.map((part) => ({ title: part.title, body: part.body.join("\n").trim() })).filter((part) => part.title || part.body);
}

// A die table from a Markdown table: its first column the roll ("**1**",
// "**1-2**", "01-05"), the rest the result. rows: [{ from, to, cells }].
export function dieTable(markdown) {
  const all = tableRows(String(markdown).split("\n"));
  if (all.length < 2) return null;
  const head = all[0].map((cell) => plain(cell));
  const out = [];
  for (const row of all.slice(1)) {
    // A two-column-pair table ("d10 | Physique | d10 | Physique"): each pair is a row.
    const pairs = row.length >= 4 && /^\d+(\s*[-–]\s*\d+)?$/.test(plain(row[2]));
    for (let start = 0; start + 1 < row.length; start += pairs ? 2 : row.length) {
      const range = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(plain(row[start]));
      if (!range) continue;
      const from = Number(range[1]);
      const to = Number(range[2] ?? range[1]);
      const cells = pairs ? [row[start + 1]] : row.slice(1);
      out.push({ from, to, cells });
    }
  }
  return { head, rows: out.sort((a, b) => a.from - b.from) };
}
