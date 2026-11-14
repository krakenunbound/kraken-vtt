// Shared by the Basic Fantasy books: the ruleset's name (books.cjs reads a
// module's ruleset to pick its campaigns), the licence notice every book
// carries on its front page, and the extracted book text (data/*.json, made
// by games/tools/bfrpg-extract.mjs from the CC BY-SA 4.0 source).
// This folder is CC BY-SA 4.0: see LICENSE.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RULESET = "Basic Fantasy";
export const here = path.dirname(fileURLToPath(import.meta.url));
export const data = (file) => JSON.parse(fs.readFileSync(path.join(here, "data", `${file}.json`), "utf8"));

export const NOTICE = `**Basic Fantasy Role-Playing Game, 4th Edition**, Copyright © 2006-2023 Chris Gonnerman, https://www.basicfantasy.org, licensed under **CC BY-SA 4.0** https://creativecommons.org/licenses/by-sa/4.0/

This book is adapted from that game's text for Kraken VTT, and is itself licensed under the **Creative Commons Attribution-ShareAlike 4.0 International License**. You may share and adapt it, even commercially, if you credit the source and share your changes under the same licence.

**Changes made:** the text was arranged into Kraken books (rules chapters as pages; races, classes, spells, equipment, monsters and magic items as records) and its formatting converted. The book's artwork is not included (it belongs to its artists and is not covered by the licence). Kraken VTT's own program code is under its own licence; the share-alike covers this book's text.`;

export const credits = (about) => ({
  name: "About This Book",
  sections: [
    {
      name: "Credits and Licence",
      pages: [
        { name: "Licence", keywords: "license licence credits cc by-sa", text: `${about}\n\n${NOTICE}` },
      ],
    },
  ],
});

// A chapter of the source as reference pages.
export function chapter(chapters, key, sectionName) {
  const found = chapters[key];
  if (!found) throw new Error(`No chapter ${key} in the extracted data.`);
  return { name: sectionName ?? found.title, pages: found.pages.map((page) => ({ name: page.name, keywords: key, text: page.text })) };
}
