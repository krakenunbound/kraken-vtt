// The Cairn Player's Guide: Cairn Second Edition's player-facing rules (CC BY-SA
// 4.0, Yochai Gal), read from its Markdown (games/cairn/text), with the
// records Kraken's rules and wizard read: the twenty backgrounds (their
// names, starting gear and tables), the Marketplace's gear, and the tables a
// new character rolls on (traits, bonds, omens, the backgrounds, the Scars).
import { ids, md, rich } from "../lib/fg.mjs";
import { dieTable, plain, read, richText, sections } from "./markdown.mjs";
import { itemsIn, goldIn, parseItem } from "../../shared/cairn/rules.mjs";

export const RULESET = "Cairn";
export const NOTICE = `Cairn Second Edition by Yochai Gal, https://cairnrpg.com, licensed under CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/. This book is an adaptation made for Kraken VTT: the text of the official Markdown (github.com/yochaigal/cairn), its pages split into a reference book, its tables made into rollable tables and its items, backgrounds and creatures into records; pictures and the website's links left out. It is shared under the same licence (games/cairn/LICENSE.md).`;
export const noticePage = (what) => ({
  name: "Credits and License",
  keywords: "license credits cc by-sa",
  text: rich(`<p><b>${what}</b></p><p>${NOTICE.replace(/&/g, "&amp;")}</p><p>Kraken VTT's own code is not covered by this licence; only the Cairn text and its adaptations are.</p>`),
});

// --- Items -------------------------------------------------------------------
const CATEGORY = { Armor: "Armor", Weapon: "Weapons", Transport: "Transport", Service: "Upkeep and Recovery", Hireling: "Hirelings", Gear: "Gear" };
// An item record: its book line kept as its description.
export function itemRecord(line, { cost, type, text } = {}) {
  const parsed = parseItem(line);
  const kind = type ?? parsed.type ?? "Gear";
  const tags = [parsed.damage ? `${parsed.damage} damage` : "", parsed.armor ? `${parsed.bonusarmor ? "+" : ""}${parsed.armor} Armor` : "", parsed.bulky ? "bulky" : "", parsed.petty ? "petty" : "", parsed.blast ? "blast" : "", parsed.uses ? `${parsed.uses} uses` : "", parsed.charges ? `${parsed.charges} charges` : ""].filter(Boolean).join(", ");
  return {
    ...parsed,
    type: kind,
    ...(cost !== undefined ? { cost: `${cost} gp` } : {}),
    description: md(`${text ?? plain(line)}${tags ? `\n\n*${tags}*` : ""}`),
    __category: CATEGORY[kind] ?? "Gear",
  };
}

// The Marketplace's tables, as items (a line naming several weapons, "Spear,
// Sword, Mace, Axe, Flail, etc. (d8 damage)", is one item each).
function marketplace() {
  const { body } = read("players-guide/marketplace.md");
  const out = [];
  for (const part of sections(body, 2)) {
    const kind = { Armor: "Armor", Weapons: "Weapon", Transport: "Transport", "Upkeep & Recovery": "Service", "Hirelings (per day)": "Hireling", Gear: "Gear" }[part.title];
    if (!kind) continue;
    for (const line of part.body.split("\n").filter((row) => /^\|/.test(row.trim()) && !/^\|\s*:?-/.test(row.trim()) && !/\*\*Cost\*\*/.test(row))) {
      const [label, cost] = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      if (kind === "Weapon") {
        const match = /^(.*?)\s*\((.*)\)$/.exec(label);
        const names = match[1].split(",").map((name) => name.trim()).filter((name) => name && !/^etc\.?$/i.test(name));
        const tags = match[2].replace(/\s*damage/i, "");
        for (const name of names) out.push(itemRecord(`${name} (${tags})`, { cost: Number(cost), type: "Weapon", text: `${name}: ${plain(match[2])}.` }));
      } else if (kind === "Hireling") out.push({ name: label, type: "Hireling", cost: `${Number(cost)} gp`, perday: 1, description: md(`A hireling's day: ${Number(cost)} gp. Roll 3d6 for each attribute and 1d6 for HP; give them equipment fit for their station.`), __category: "Hirelings" });
      else if (kind === "Service") out.push({ ...itemRecord(label, { cost: Number(cost), type: /rations|feed/i.test(label) ? "Gear" : "Service" }) });
      else out.push(itemRecord(label, { cost: Number(cost), type: kind === "Armor" ? "Armor" : kind }));
    }
  }
  return out;
}
export const MARKETPLACE = marketplace();

// --- Backgrounds -------------------------------------------------------------
const FILES = ["aurifex", "barber-surgeon", "beast-handler", "bonekeeper", "cutpurse", "fieldwarden", "fletchwind", "foundling", "fungal-forager", "greenwise", "half-witch", "hexenbane", "jongleur", "kettlewright", "marchguard", "mountebank", "outrider", "prowler", "rill-runner", "scrivener"];
// A starting-gear line: "Spellbook (Thicket: A thicket ... )" is that spell's book.
function gearItem(line) {
  const text = plain(line);
  const item = parseItem(line);
  const spell = /^spellbook$/i.test(item.name) && /^([^:]+):\s*(.*)$/.exec(String(item.note ?? ""));
  if (spell) return { ...item, name: `Spellbook: ${spell[1].trim()}`, kind: "spellbook", note: undefined, text: spell[2].trim() };
  return { ...item, text };
}
// A table's result: its items (bold words, with their parentheses), gold.
const USES = /\b\d+\s+(uses?|charges?)\b/i;
function resultItems(all, head) {
  const cells = all.filter((cell) => plain(cell));
  if (cells.length >= 2 && /item/i.test(head[1] ?? "")) {
    // "Item | Description": the item is the first cell, its tags in the description's parentheses and its uses.
    const name = plain(cells[0]);
    const description = plain(cells[1]);
    const tags = [...description.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
    const uses = USES.exec(description)?.[0];
    const item = parseItem(`${name}${tags.length || uses ? ` (${[...tags, ...(uses ? [uses] : [])].join(", ")})` : ""}`);
    if (/petty/i.test(description)) item.petty = 1;
    if (/\*\*recharge\*\*|recharge:/i.test(cells[1]) || /charges?/.test(tags.join(" "))) item.kind = "relic";
    return [{ ...item, note: undefined, text: description }];
  }
  const text = cells.at(-1) ?? "";
  const lines = itemsIn(text);
  // A result that opens with its item: "**Shrieking Trumpet**. ... 2 uses.", "A **Black Rose Fiddle** (_bulky_)".
  const lead = /^(?:an?\s+)?\*\*([^*]+)\*\*\s*(\([^)]*\))?/i.exec(text);
  if (lead && !lines.some((line) => line.startsWith(lead[1].trim())) && (lead[2] || /^an?\s/i.test(text) || USES.test(text))) {
    const uses = USES.exec(text)?.[0];
    lines.unshift(`${lead[1].trim()}${lead[2] ? ` ${lead[2]}` : uses ? ` (${uses})` : ""}`);
  }
  return lines.map((line) => {
    const item = parseItem(line);
    if (/^scroll\b/i.test(item.name)) item.kind = "scroll";
    else if (/^spellbook\b/i.test(item.name)) item.kind = "spellbook";
    return { ...item, text: plain(line === lines[0] && lead ? text : line) };
  });
}
function background(file) {
  const { title, body } = read(`backgrounds/${file}.md`);
  const parts = sections(body, 2);
  const intro = sections(body, 1)[0]?.body ?? "";
  const quote = /^>\s*(.*)$/m.exec(body)?.[1] ?? plain(intro);
  const names = parts.find((part) => part.title === "Names")?.body ?? "";
  const gearLines = [];
  for (const line of (parts.find((part) => part.title === "Starting Gear")?.body ?? "").split("\n")) {
    if (/^\s*-\s+/.test(line)) gearLines.push(line.replace(/^\s*-\s+/, "").trim());
    else if (line.trim() && gearLines.length) gearLines[gearLines.length - 1] += ` ${line.trim()}`;
  }
  const tables = parts
    .filter((part) => !["Names", "Starting Gear"].includes(part.title) && /\|/.test(part.body))
    .map((part) => {
      const table = dieTable(part.body);
      return {
        name: part.title.replace(/\s*Roll 1d6:?\s*$/i, "").trim(),
        dice: "d6",
        rows: ids(table.rows.map((row) => ({ from: row.from, to: row.to, text: plain(row.cells.filter((cell) => plain(cell)).join(": ")), items: ids(resultItems(row.cells, table.head)), gold: goldIn(row.cells.join(" ")) }))),
      };
    });
  return {
    name: title,
    quote: plain(quote),
    names: plain(names),
    gear: ids(gearLines.filter((line) => !/gold pieces?/i.test(line)).map((line) => ({ text: plain(line), item: gearItem(line) }))),
    gold: "3d6",
    tables: ids(tables),
    text: richText(body.replace(/^#\s.*$/m, "")),
    __category: "Backgrounds",
  };
}
export const BACKGROUNDS = FILES.map(background);

// --- The tables a character rolls ----------------------------------------------
// Rules records (type cairntable): what the wizard and the Scars read, in the book's words.
const table = (name, group, dice, list) => ({ name, group, dice, rows: ids(list.map((row) => ({ from: row.from, to: row.to, text: row.text }))), __category: "Tables" });
function creationTables() {
  const { body } = read("players-guide/character-creation.md");
  const out = [];
  const traits = sections(body, 2).find((part) => part.title.startsWith("Character Traits"))?.body ?? "";
  for (const part of sections(traits, 3)) {
    const parsed = dieTable(part.body);
    if (parsed) out.push(table(part.title, part.title.toLowerCase(), "d10", parsed.rows.map((row) => ({ from: row.from, to: row.to, text: plain(row.cells[0]) }))));
  }
  for (const [title, group] of [["Bonds", "bonds"], ["Omens", "omens"], ["Backgrounds", "backgrounds"]]) {
    const parsed = dieTable(sections(body, 2).find((part) => part.title === title)?.body ?? "");
    out.push(table(title, group, "d20", parsed.rows.map((row) => ({ from: row.from, to: row.to, text: plain(row.cells[0]) }))));
  }
  const core = read("players-guide/core-rules.md").body;
  const scars = dieTable(sections(core, 2).find((part) => part.title === "Scars")?.body ?? "");
  out.push(table("Scars", "scars", "", scars.rows.map((row) => ({ from: row.from, to: row.to, text: plain(row.cells[0]) }))));
  return out;
}
export const CREATION_TABLES = creationTables();

// --- The book's pages ------------------------------------------------------------
// A chapter from a file: a page for each ## section (what comes before them, its first page).
export function chapter(name, file, { level = 2, intro = name } = {}) {
  const { body } = read(file);
  const parts = sections(body.replace(/^#\s.*$/m, ""), level);
  return { name, sections: [{ name, pages: parts.filter((part) => part.body.trim()).map((part) => ({ name: part.title || intro, keywords: part.title.toLowerCase(), text: richText(part.body) })) }] };
}

export const PLAYERS_GUIDE = {
  name: "Cairn Player's Guide",
  displayName: "Cairn Player's Guide",
  category: "Cairn",
  ruleset: RULESET,
  author: "Yochai Gal (adapted for Kraken VTT)",
  playersBook: true,
  players: { background: BACKGROUNDS, item: MARKETPLACE, cairntable: CREATION_TABLES },
  reference: [
    {
      name: "Cairn",
      sections: [
        {
          name: "About This Book",
          pages: [
            { name: "Cairn, Second Edition", keywords: "cairn license", text: rich(`<p><b>Cairn</b> is an adventure game about exploring a dark and mysterious Wood filled with strange folk, hidden treasure, and unspeakable monstrosities, by Yochai Gal.</p><frame>${NOTICE.replace(/&/g, "&amp;")}</frame><p>In Kraken, the Characters window's character wizard follows the book's Character Creation; the sheet rolls saves (d20 at or under), keeps the ten slots and the Fatigue; the combat tracker plays Cairn's combat (a DEX save to act in the first round, attacks that always hit, Armor, HP then STR, Critical Damage, Scars and Morale).</p>`) },
          ],
        },
      ],
    },
    chapter("Overview and Principles", "players-guide/overview-and-principles.md", { intro: "Overview" }),
    chapter("Character Creation", "players-guide/character-creation.md", { intro: "Character Creation" }),
    { name: "Backgrounds", sections: [{ name: "Backgrounds", pages: FILES.map((file, index) => ({ name: BACKGROUNDS[index].name, keywords: "background", text: richText(read(`backgrounds/${file}.md`).body) })) }] },
    chapter("Core Rules", "players-guide/core-rules.md", { intro: "Core Rules" }),
    chapter("Procedures", "players-guide/procedures.md", { intro: "Procedures" }),
    chapter("Marketplace", "players-guide/marketplace.md", { intro: "Marketplace" }),
    chapter("Vald", "players-guide/vald.md", { intro: "Vald" }),
    { name: "Credits", sections: [{ name: "Credits", pages: [noticePage("Cairn Player's Guide")] }] },
  ],
};
