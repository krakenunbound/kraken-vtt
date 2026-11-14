// The Blades in the Dark SRD's Markdown (games/forged-dark/text/srd.md, CC BY
// 3.0, from github.com/amazingrando/blades-in-the-dark-srd-content, linked
// from bladesinthedark.com/licensing), read into FG formatted text for
// Kraken's books: its chapters (# headings) and sections (##), paragraphs,
// lists, tables, block quotes as frames; the editors' "@TODO" notes and empty
// table headers left out, character entities decoded.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rich } from "../lib/fg.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRD = fs.readFileSync(path.join(HERE, "text", "srd.md"), "utf8").replace(/\r\n/g, "\n");

const decode = (text) =>
  String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ")
    .replace(/\\\|/g, "|");
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Plain words (no markup), for names and record text.
export const plain = (text) => decode(String(text ?? "")).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
// Inline markup: **bold**, *italic*; a stray, unpaired ** (the SRD has a few) dropped.
export function inline(text) {
  let out = escape(decode(text)).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*\*/g, "");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>").replace(/\*/g, "");
  // Bold and italic that cross each other (the SRD's "***word**") are made plain rather than mis-nested.
  return balanced(out) ? out : out.replace(/<\/?[bi]>/g, "");
}
function balanced(html) {
  const open = [];
  for (const match of html.matchAll(/<(\/?)([a-z]+)>/g)) {
    if (!match[1]) open.push(match[2]);
    else if (open.pop() !== match[2]) return false;
  }
  return open.length === 0;
}
const tableRows = (lines) =>
  lines
    .filter((line) => !/^\|?\s*:?-{2,}/.test(line.trim().replace(/^\|\s*/, "")))
    .map((line) => line.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => plain(cell) && cell !== "[]()"));

// Markdown to FG formatted text.
export function toHtml(markdown) {
  const lines = String(markdown).split("\n");
  const out = [];
  let paragraph = [];
  let list = [];
  let quote = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    if (list.length) out.push(`<list>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</list>`);
    if (quote.length) out.push(`<frame>${inline(quote.filter(Boolean).join(" "))}</frame>`);
    paragraph = [];
    list = [];
    quote = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || /^-{3,}$/.test(trimmed) || /^@TODO/i.test(trimmed)) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      out.push(`<h>${inline(heading[2])}</h>`);
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
      i -= 1;
      const rows = tableRows(block);
      if (rows.length) out.push(`<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</table>`);
      continue;
    }
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line) ?? /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (item) {
      if (paragraph.length || quote.length) {
        const keep = list;
        list = [];
        flush();
        list = keep;
      }
      list.push(`${item[1].length >= 2 ? "— " : ""}${item[2]}`);
      continue;
    }
    if (trimmed.startsWith(">")) {
      if (paragraph.length || list.length) flush();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    if (list.length && /^\s+\S/.test(line)) {
      list[list.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (list.length || quote.length) flush();
    paragraph.push(trimmed);
  }
  flush();
  return out.join("");
}
export const richText = (markdown) => rich(toHtml(markdown));

// The SRD split at a heading level: [{ title, body }].
export function sections(body, level) {
  const marker = new RegExp(`^${"#".repeat(level)}\\s+(.*)$`);
  const out = [{ title: "", body: [] }];
  for (const line of String(body).split("\n")) {
    const match = marker.exec(line.trim());
    if (match) out.push({ title: plain(match[1]), body: [] });
    else out.at(-1).body.push(line);
  }
  return out.map((part) => ({ title: part.title, body: part.body.join("\n").trim() })).filter((part) => part.title || part.body);
}
// A chapter of the SRD (a # heading) by its title.
export function chapterText(title) {
  const found = sections(SRD, 1).find((part) => part.title.toLowerCase() === title.toLowerCase());
  if (!found) throw new Error(`The SRD has no chapter "${title}".`);
  return found.body;
}
// A part of a chapter: from one ## heading up to (not including) another.
export function between(body, from, to) {
  const lines = String(body).split("\n");
  const start = lines.findIndex((line) => new RegExp(`^#{2,3}\\s+${from}\\s*$`, "i").test(line.trim()));
  if (start < 0) throw new Error(`No section "${from}".`);
  const end = to ? lines.findIndex((line, index) => index > start && new RegExp(`^#{2,3}\\s+${to}\\s*$`, "i").test(line.trim())) : -1;
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}
// Named entries in a part: headings (## or ###), each with its text and its note (the block quote).
export function entries(body) {
  const out = [];
  for (const line of String(body).split("\n")) {
    const heading = /^#{2,4}\s+(.*)$/.exec(line.trim());
    if (heading) out.push({ name: plain(heading[1]), lines: [] });
    else if (out.length) out.at(-1).lines.push(line);
  }
  return out.map(({ name, lines }) => {
    const text = lines.filter((line) => line.trim() && !line.trim().startsWith(">")).join("\n").trim();
    const note = lines.filter((line) => line.trim().startsWith(">")).map((line) => line.trim().replace(/^>\s?/, "")).filter(Boolean).join(" ");
    return { name, text: plain(text), note: plain(note), markdown: lines.join("\n").trim() };
  });
}
// Bulleted "**Name**: text" entries (the crew upgrades), or bold-led paragraphs (the claims).
export function boldEntries(body) {
  const out = [];
  for (const line of String(body).split("\n")) {
    const match = /^\s*(?:[-*]\s+)?\*\*([^*:]+?):?\*\*:?\**\s*:?\s*(.*)$/.exec(line);
    if (match && plain(match[2])) out.push({ name: plain(match[1]).replace(/:$/, ""), text: plain(match[2]) });
  }
  return out;
}
