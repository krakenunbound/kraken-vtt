// The System Reference Document 5.2.1 as Kraken's own D&D 5E books: the
// data games/srd-5e/tools/ reads from the SRD's PDF (data/*.json), the
// notice every book carries, and what the books share.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const data = (name) => JSON.parse(fs.readFileSync(path.join(HERE, "data", `${name}.json`), "utf8"));

// FG's 5E ruleset: the books are FG 5E modules, so electron/books.cjs and
// packs.cjs give them to a D&D 5E campaign as they do any 5E module.
export const RULESET = "5E";
export const CATEGORY = "SRD 5.2.1";
export const PLAYERS = "SRD 5.2.1 Player's Rules";
export const CREATURES_BOOK = "SRD 5.2.1 Creatures";
export const MAGIC_ITEMS_BOOK = "SRD 5.2.1 Magic Items";

// The attribution the SRD's licence asks for, word for word (CC BY 4.0).
export const NOTICE = 'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

// Every book's first chapter: the notice, and what the book holds.
export const frontMatter = (about) => ({
  name: "SRD 5.2.1",
  sections: [
    {
      name: "About This Book",
      pages: [
        { name: "Legal Information", keywords: "license licence cc-by attribution", text: NOTICE },
        { name: "What Is in This Book", text: about },
      ],
    },
  ],
});

export const plain = (text) => String(text ?? "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();
// "1/4 lb." 0.25, "58½ lb." 58.5, "—" 0.
export function pounds(text) {
  const t = String(text ?? "").replace(/,/g, "");
  const frac = /(\d+)\/(\d+)/.exec(t);
  if (frac && !/\d+\s+\d+\//.test(t) && t.indexOf(frac[0]) === 0) return Number(frac[1]) / Number(frac[2]);
  const n = /(\d+(?:\.\d+)?)(½)?/.exec(t);
  if (!n) return /½/.test(t) ? 0.5 : 0;
  return Number(n[1]) + (n[2] ? 0.5 : 0);
}
// "1,500 GP" -> "1,500 GP" (kept as the SRD writes it); "Varies" -> "".
export const costOf = (text) => (/^\s*(\d[\d,]*)\s*(PP|GP|EP|SP|CP)\s*$/i.test(String(text ?? "")) ? String(text).trim() : "");
