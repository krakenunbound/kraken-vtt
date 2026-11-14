// The Cairn Warden's Guide: Cairn Second Edition's Warden's chapters (CC BY-SA
// 4.0, Yochai Gal), read from its Markdown: its pages, the bestiary's
// creatures as NPC records (stat line, attacks, Critical Damage), the d100
// spellbooks and the reliquary's relics as items, and every die table as a
// table the Library rolls.
import fs from "node:fs";
import path from "node:path";
import { ids } from "../lib/fg.mjs";
import { TEXT, dieTable, plain, read, richText, sections } from "./markdown.mjs";
import { chapter, noticePage, RULESET } from "./players-guide.mjs";
import { parseItem, parseStatline } from "../../shared/cairn/rules.mjs";

// --- Creatures ---------------------------------------------------------------------
// A creature from its section: the stat line, then its bullets (a "Critical Damage" bullet is its own field).
export function creature(name, body, category = "") {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const statline = lines.find((line) => /\d+\s*HP\b/.test(line) && /\bWIL\b/.test(line)) ?? "";
  const stats = parseStatline(statline);
  const bullets = lines.filter((line) => /^[-*]\s/.test(line)).map((line) => line.replace(/^[-*]\s+/, ""));
  const critical = bullets.find((line) => /^\*\*critical damage\*\*/i.test(line)) ?? "";
  return {
    name,
    type: category || "Creature",
    statline: plain(statline),
    hp: stats.hp,
    armor: stats.armor,
    ac: stats.armor,
    str: stats.str,
    dex: stats.dex,
    wil: stats.wil,
    detachment: stats.detachment,
    attacks: ids(stats.attacks),
    critical: plain(critical.replace(/^\*\*critical damage\*\*:?\s*/i, "")),
    text: richText(`${plain(statline)}\n\n${bullets.map((line) => `- ${line}`).join("\n")}`),
    __category: category || "Creatures",
  };
}
function bestiary() {
  const { body } = read("wardens-guide/bestiary.md");
  const parts = sections(body, 2);
  const groups = {};
  const categories = dieTable(parts.find((part) => part.title === "Monster Categories")?.body ?? "");
  for (const row of categories?.rows ?? []) for (const name of plain(row.cells[1]).split(",")) groups[name.trim().toLowerCase()] ??= plain(row.cells[0]);
  return parts.filter((part) => part.title !== "Monster Categories" && /\bHP\b/.test(part.body)).map((part) => creature(part.title, part.body, groups[part.title.toLowerCase()] ?? "Creatures"));
}
export const BESTIARY = bestiary();

// --- Spellbooks and relics -------------------------------------------------------------
function spellbooks() {
  const parsed = dieTable(read("wardens-guide/spellbooks.md").body);
  return parsed.rows.map((row) => {
    const spell = plain(row.cells[0]);
    const [effect, oddity = ""] = String(row.cells[1]).split(/(?=_[^_]+_\s*$)/);
    return { name: `Spellbook: ${spell}`, spell, type: "Spellbook", kind: "spellbook", roll: row.from, effect: plain(effect), oddity: plain(oddity), text: plain(row.cells[1]), description: richText(`**${spell}**: ${row.cells[1]}\n\nA Spellbook holds one spell and takes a slot. Hold it in both hands and read it aloud to cast it, then add a **Fatigue**. Deprived or in danger, the Warden may call for a WIL save to avoid ill effects.`), __category: "Spellbooks" };
  });
}
export const SPELLBOOKS = spellbooks();
function relics() {
  const parts = sections(read("wardens-guide/reliquary.md").body, 2);
  return parts
    .filter((part) => part.title)
    .map((part) => {
      // "Babbleflask, 2 uses", "Barbed Epaulets, +1 Armor", "A Blade Called Hope (d6)".
      const [head, ...tags] = part.title.split(",").map((word) => word.trim());
      const item = parseItem(`${head.replace(/\s*\(([^)]*)\)\s*$/, "")} (${[/\(([^)]*)\)\s*$/.exec(head)?.[1], ...tags].filter(Boolean).join(", ")})`);
      const recharge = /\*\*Recharge\*\*:?\s*(.*)$/m.exec(part.body)?.[1] ?? "";
      return { ...item, name: head.replace(/\s*\([^)]*\)\s*$/, ""), note: undefined, type: "Relic", kind: "relic", recharge: plain(recharge), text: plain(part.body.replace(/^\s*-\s+/gm, "")), description: richText(part.body), __category: "Relics" };
    });
}
export const RELICS = relics();

// --- Tables for the Library ---------------------------------------------------------------
// Every die table in the Warden's chapters, named by the heading above it.
export function fgTables(file, prefix) {
  const { title, body } = read(file);
  const out = [];
  let heading = title;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^#{1,6}\s+(.*)$/.exec(lines[i].trim());
    if (match) heading = plain(match[1]);
    if (!lines[i].trim().startsWith("|")) continue;
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
    const parsed = dieTable(block.join("\n"));
    const dice = /^d(\d+)$/i.exec(parsed?.head?.[0] ?? "");
    if (!parsed || !dice || parsed.rows.length < 2) continue;
    const name = `${prefix ? `${prefix}: ` : ""}${heading}${out.some((item) => item.name.endsWith(heading)) ? ` (${parsed.head[1] ?? out.length + 1})` : ""}`;
    out.push({
      name,
      dice: `d${dice[1]}`,
      mod: 0,
      tablerows: ids(parsed.rows.map((row) => ({ fromrange: row.from, torange: row.to, results: ids(row.cells.map((cell) => ({ result: plain(cell) }))) }))),
      __category: prefix || title,
    });
  }
  return out;
}

const FILES = [
  ["Saves", "saves.md"],
  ["Combat", "combat.md"],
  ["Detachments", "detachments.md"],
  ["Variable Difficulty", "variable-difficulty.md"],
  ["Knowledge and Perception", "knowledge-and-perception.md"],
  ["Growth", "growth.md"],
  ["Bonds and Omens", "bonds-and-omens.md"],
  ["Creating Backgrounds", "creating-backgrounds.md"],
  ["Creating Monsters", "creating-monsters.md"],
  ["Dungeon Exploration", "dungeon-exploration.md"],
  ["Wilderness Exploration", "wilderness-exploration.md"],
  ["Pointcrawls", "pointcrawls.md"],
  ["Dungeon Seeds", "dungeon-seeds.md"],
  ["Forest Seeds", "forest-seeds.md"],
  ["Setting Seeds", "setting-seeds.md"],
  ["NPC Tables", "npc-tables.md"],
  ["Naming Procedures", "naming-procedures.md"],
  ["Vald", "vald.md"],
  ["About the Example Party", "about-the-example-party.md"],
  ["Bibliography", "bibliography.md"],
];
const TABLE_FILES = ["spellbooks.md", "dungeon-seeds.md", "forest-seeds.md", "setting-seeds.md", "npc-tables.md", "naming-procedures.md", "dungeon-exploration.md", "wilderness-exploration.md", "creating-monsters.md", "creating-backgrounds.md", "vald.md"].filter((file) => fs.existsSync(path.join(TEXT, "wardens-guide", file)));
export const TABLES = TABLE_FILES.flatMap((file) => fgTables(`wardens-guide/${file}`, ""));

export const WARDENS_GUIDE = {
  name: "Cairn Warden's Guide",
  displayName: "Cairn Warden's Guide",
  category: "Cairn",
  ruleset: RULESET,
  author: "Yochai Gal (adapted for Kraken VTT)",
  gm: { npc: BESTIARY, item: [...SPELLBOOKS, ...RELICS], tables: TABLES },
  reference: [
    ...FILES.slice(0, 2).map(([name, file]) => chapter(name, `wardens-guide/${file}`)),
    { name: "Bestiary", sections: [{ name: "Bestiary", pages: [{ name: "Monster Categories", keywords: "bestiary categories", text: richText(sections(read("wardens-guide/bestiary.md").body, 2).find((part) => part.title === "Monster Categories")?.body ?? "") }, ...BESTIARY.map((record) => ({ name: record.name, keywords: `monster ${record.type}`.toLowerCase(), text: record.text }))] }] },
    { name: "Spellbooks", sections: [{ name: "Spellbooks", pages: [{ name: "Spellbooks (d100)", keywords: "spellbook spells magic", text: richText(read("wardens-guide/spellbooks.md").body.replace(/^#\s.*$/m, "")) }] }] },
    chapter("Reliquary", "wardens-guide/reliquary.md"),
    ...FILES.slice(2).map(([name, file]) => chapter(name, `wardens-guide/${file}`)),
    { name: "Credits", sections: [{ name: "Credits", pages: [noticePage("Cairn Warden's Guide")] }] },
  ],
};
