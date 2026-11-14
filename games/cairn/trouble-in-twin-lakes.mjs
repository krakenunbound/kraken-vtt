// CAS-1: Trouble in Twin Lakes, Cairn 2e's first adventure (Yochai Gal; its
// text CC BY-SA 4.0), read from its Markdown: story entries, its creatures
// (stat lines in the text), encounters, its relics, parcels, and two battle
// maps Kraken drew from the text (games/tools/mapgen.py: the Temple of the
// Fungal Lizards and Deadmill, with walls and doors). The book's own maps and
// art are not part of its text's licence and are not included.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids, imageRecord, link, slug } from "../lib/fg.mjs";
import { plain, read, richText, sections } from "./markdown.mjs";
import { itemRecord, noticePage, NOTICE, RULESET } from "./players-guide.mjs";
import { creature } from "./wardens-guide.mjs";
import { parseItem } from "../../shared/cairn/rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = "Trouble in Twin Lakes";
const { body: raw } = read("adventures/trouble-in-twin-lakes.md");
// The site's own lines (print and PDF links) before the title are not the adventure's.
const body = raw.slice(raw.indexOf("# CAS-1"));

// --- Story: each chapter (# heading); a long one, a page for each of its sections.
const STORY = [{ name: "00 About This Adventure", text: richText(`**Trouble in Twin Lakes** (CAS-1), an adventure for Cairn 2e by Yochai Gal.

> ${NOTICE}

The two battle maps (the Temple of the Fungal Lizards and Deadmill) were drawn by Kraken VTT from the adventure's text; the encounters put its creatures on the combat tracker.`), __category: NAME }];
let n = 0;
for (const part of sections(body, 1)) {
  const title = part.title.replace(/^CAS-1:\s*/, "");
  const subs = sections(part.body, 2);
  const entry = (name, text) => STORY.push({ name: `${String(++n).padStart(2, "0")} ${name}`, text: richText(text), __category: NAME });
  if (part.body.length > 7000 && subs.length > 2) {
    if (subs[0].title === "") entry(title, subs[0].body);
    for (const sub of subs.filter((item) => item.title)) entry(`${title}: ${sub.title}`, sub.body);
  } else entry(title, part.body || title);
}
STORY.push({ name: `${String(++n).padStart(2, "0")} Credits and License`, text: noticePage(NAME).text, __category: NAME });

// --- Creatures: the text's stat lines (a heading and its line, or a bullet "**Bandit Leader:** 6 HP, ...").
const STAT_BLOCKS = ["Annafranax", "Night Cat", "Suraru", "Suraru Imperator"];
const CREATURES = [];
for (const part of sections(body, 3).concat(sections(body, 2))) {
  // The adventure's creatures with a stat block of their own (other sections only mention numbers).
  if (!STAT_BLOCKS.includes(part.title) || !/^\d+\s*HP,/m.test(part.body) || CREATURES.some((item) => item.name === part.title)) continue;
  const lines = part.body.split("\n");
  const at = lines.findIndex((line) => /^\d+\s*HP,/.test(line.trim()));
  const rest = [];
  for (const line of lines.slice(at + 1)) {
    if (/^#/.test(line.trim())) break;
    rest.push(line);
  }
  CREATURES.push(creature(part.title, [lines[at], ...rest].join("\n"), "Trouble in Twin Lakes"));
}
for (const match of body.matchAll(/^-\s+\*\*([^*:]+?):?\*\*:?\s*(?:\(x\d+\))?:?\s*(\d+\s*HP,[^\n]*)$/gm)) {
  const name = match[1].trim().replace(/s$/, "");
  if (!CREATURES.some((item) => item.name === name)) CREATURES.push(creature(name, match[2], "Trouble in Twin Lakes"));
}

// --- Relics and items (the chapter "Relics & Items").
const relicPart = sections(body, 1).find((part) => /Relics/.test(part.title))?.body ?? "";
const RELICS = sections(relicPart, 3)
  .filter((part) => part.title)
  .map((part) => {
    const item = parseItem(part.title);
    const tags = /\b(bulky|petty)\b/i.exec(part.body)?.[1];
    const charges = /\b(one|two|three|\d+) charges?\b/i.exec(part.body)?.[1];
    const count = { one: 1, two: 2, three: 3 }[String(charges).toLowerCase()] ?? (Number(charges) || undefined);
    return { ...itemRecord(part.title, { type: "Relic", text: plain(part.body) }), ...item, ...(tags ? { [tags.toLowerCase()]: 1 } : {}), ...(count ? { charges: count } : {}), kind: "relic", description: richText(part.body), __category: "Relics" };
  });

// --- Encounters, parcels, maps.
const battle = (name, foes) => ({ name, npclist: ids(foes.map(([who, count]) => ({ name: who, count, faction: "foe", isidentified: 1, link: link("npc", `npc.${slug(who)}@${NAME}`) }))), __category: "Encounters" });
const BATTLES = [battle("Night Cats in the Stone Forest", [["Night Cat", 3]]), battle("Bandits on the Road", [["Bandit Leader", 1], ["Bandit", 2]]), battle("The Surarus (T9)", [["Suraru", 2]]), battle("The Suraru Imperator", [["Suraru Imperator", 1], ["Suraru", 2]]), battle("A Hatchling (T3)", [["Suraru", 1]])];
for (const item of BATTLES) for (const [, foe] of Object.entries(item.npclist)) if (!CREATURES.some((record) => record.name === foe.name)) throw new Error(`${item.name}: no creature ${foe.name} in the adventure.`);
const parcel = (name, gp, items) => ({ name, coinlist: ids([{ description: "GP", amount: gp }]), itemlist: ids(items.map(([item, count = 1]) => ({ name: item, count }))), __category: "Treasure" });
const PARCELS = [parcel("Jandy's Satchel (Deadmill)", 23, [["Dagger"], ["Rations"], ["Torch"]]), parcel("Box in the Stove (Fasha's Farm)", 130, [["Tideborn Pendant (25gp)"]]), parcel("The Shine's Belt (White Tower)", 82, [["Chainmail"], ["Torn Silk Rope (42ft)"]]), parcel("Statues of the Antechamber (T1)", 0, [["Temple Statue (50gp)", 3]])];
const map = (name, file, walls) => {
  const data = JSON.parse(fs.readFileSync(path.join(here, "maps", `${walls}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: data.width, height: data.height, grid: data.grid, walls: data.walls, category: "Maps" });
};

export const TROUBLE_IN_TWIN_LAKES = {
  name: NAME,
  displayName: "Trouble in Twin Lakes (Cairn)",
  category: "Cairn Adventures",
  ruleset: RULESET,
  author: "Yochai Gal (adapted for Kraken VTT)",
  gm: {
    encounter: STORY,
    npc: CREATURES,
    battle: BATTLES,
    item: RELICS,
    treasureparcels: PARCELS,
    image: [map("Temple of the Fungal Lizards", "temple-of-the-fungal-lizards", "temple"), map("Deadmill", "deadmill", "deadmill")],
  },
  pictures: Object.fromEntries(["temple-of-the-fungal-lizards", "deadmill"].map((file) => [`images/${file}.webp`, path.join(here, "art", `${file}.webp`)])),
};
export const ADVENTURE_COUNTS = () => ({ story: STORY.length, npcs: CREATURES.map((item) => item.name), relics: RELICS.length });
