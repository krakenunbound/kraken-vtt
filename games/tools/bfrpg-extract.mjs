// Reads the Basic Fantasy Role-Playing Game 4th Edition book source (the
// Quarto markdown at github.com/Solomoriah/bfrpg, CC BY-SA 4.0) and writes
// the parts Kraken's Basic Fantasy books are built from, as plain JSON in
// games/basic-fantasy/data: the rules chapters (cleaned to the markdown
// games/lib/fg.mjs md() reads), the spells, the monsters (stat blocks and
// descriptions), the equipment and the magic items. The book's artwork is
// not read (it is all rights reserved); only its text, which stays CC BY-SA.
//
//   node games/tools/bfrpg-extract.mjs <path to the cloned bfrpg folder>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, "class.qmd"))) {
  console.error("Usage: node games/tools/bfrpg-extract.mjs <bfrpg source folder (with class.qmd)>");
  process.exit(1);
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "basic-fantasy", "data");
fs.mkdirSync(out, { recursive: true });
const read = (file) => fs.readFileSync(path.join(source, file), "utf8").replace(/\r\n/g, "\n");

// --- Cleaning Quarto markdown into md()'s markdown ---------------------------
// Asterisks that are not emphasis (a monster's "2*" hit dice, a reversible
// spell's "Bless*") become the asterisk operator, so md() does not read them
// as italics.
function asterisks(line) {
  const marks = [];
  const keep = (text) => `\u0001${marks.push(text) - 1}\u0002`;
  let text = line
    .replace(/(^|[\s(“"'\[|])\*\*\*(?=\S)(.+?\S)\*\*\*(?=$|[\s,.;:!?)”"'|\]])/g, (_, before, inner) => `${before}${keep(`***${inner}***`)}`)
    .replace(/(^|[\s(“"'\[|])\*\*(?=\S)(.+?\S)\*\*(?=$|[\s,.;:!?)”"'|\]-])/g, (_, before, inner) => `${before}${keep(`**${inner}**`)}`)
    .replace(/(^|[\s(“"'\[|])\*(?=[^\s*])([^*]+?[^\s*])\*(?=$|[\s,.;:!?)”"'|\]-])/g, (_, before, inner) => `${before}${keep(`*${inner}*`)}`);
  text = text.replace(/\*/g, "∗");
  return text.replace(/\u0001(\d+)\u0002/g, (_, index) => marks[Number(index)]);
}

export function clean(raw) {
  let text = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/\^([^^\s]{1,6})\^/g, "$1")
    .replace(/\\([.*_#|-])/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&emsp;|&nbsp;/g, " ");
  const lines = [];
  for (let line of text.split("\n")) {
    line = line.replace(/\s+$/, "");
    if (/^:::/.test(line.trim())) continue;
    if (/^\+[-=:+]+\+?$/.test(line.trim())) continue;
    if (/^\|[\s:|=+-]+\|?$/.test(line.trim()) && /-/.test(line)) continue;
    // A table's caption: ": Fighter Saving Throws {#tbl-save-fighter}".
    if (/^:\s/.test(line)) line = `*${line.replace(/^:\s*/, "").replace(/\{[^}]*\}/g, "").trim()}*`;
    line = line.replace(/\s*\{[#.][^}]*\}\s*$/, "").replace(/\{[#.][^}]*\}/g, "");
    if (/^#{1,6}\s/.test(line)) line = line.replace(/\*\*/g, "");
    if (/^\s*-\s{2,}/.test(line)) line = line.replace(/^\s*-\s+/, "- ");
    lines.push(line);
  }
  // Blocks: tables, lists and headings each in a block of their own.
  const blocks = [];
  let block = [];
  const flush = () => {
    if (block.length) blocks.push(block);
    block = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const kind = line.trim().startsWith("|") ? "table" : /^#{1,6}\s/.test(line) ? "heading" : "text";
    const last = block.length ? (block[0].trim().startsWith("|") ? "table" : "text") : null;
    if (kind === "heading") {
      flush();
      blocks.push([line]);
      continue;
    }
    if (last && last !== kind) flush();
    block.push(line);
  }
  flush();
  const done = blocks.map((lines) => {
    if (lines[0].trim().startsWith("|")) {
      const rows = lines.map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => asterisks(cell.trim())));
      // Grid tables' empty spacer rows go; a table needs its cells.
      const kept = rows.filter((row) => row.some((cell) => cell));
      return kept.map((row) => `| ${row.join(" | ")} |`).join("\n");
    }
    // A list item's wrapped lines join it.
    if (/^- /.test(lines[0].trim()) || /^\d+\. /.test(lines[0].trim())) {
      const items = [];
      for (const line of lines) {
        if (/^\s*(- |\d+\. )/.test(line)) items.push(line.trim());
        else if (items.length) items[items.length - 1] += ` ${line.trim()}`;
      }
      return items.map(asterisks).join("\n");
    }
    if (/^#{1,6}\s/.test(lines[0])) return lines[0];
    return lines.map((line) => asterisks(line.trim())).join("\n");
  });
  return done.join("\n\n").trim();
}

// A chapter split into pages at its "## " headings (its "# " title, and what
// comes before the first, the first page); "### " and below stay headings
// inside a page (md()'s "### ").
function pages(raw, firstName) {
  const text = clean(raw);
  const list = [];
  let current = { name: firstName, body: [] };
  for (const block of text.split("\n\n")) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(block);
    if (heading && heading[1].length <= 2) {
      if (heading[1].length === 1 && current.body.length === 0 && list.length === 0) {
        current.name = heading[2].trim() || firstName;
        continue;
      }
      if (current.body.length) list.push(current);
      current = { name: heading[2].trim(), body: [] };
      continue;
    }
    if (heading) {
      current.body.push(`### ${heading[2].trim()}`);
      continue;
    }
    current.body.push(block);
  }
  if (current.body.length) list.push(current);
  // A long page (a chapter whose sections are "### ") is split at its headings.
  const split = [];
  for (const page of list) {
    const size = page.body.join("\n\n").length;
    if (size < 9000 || !page.body.some((block) => block.startsWith("### "))) {
      split.push(page);
      continue;
    }
    let part = { name: page.name, body: [] };
    for (const block of page.body) {
      if (block.startsWith("### ") && part.body.length) {
        split.push(part);
        part = { name: block.slice(4).replace(/\*/g, "").trim(), body: [] };
        continue;
      }
      if (block.startsWith("### ") && !part.body.length && part.name === page.name && split.at(-1) !== part) {
        part.name = block.slice(4).replace(/\*/g, "").trim();
        continue;
      }
      part.body.push(block);
    }
    if (part.body.length) split.push(part);
  }
  // A heading with nothing under it before the next one is folded away.
  return split.map((page) => ({ name: page.name.replace(/∗/g, "*"), text: page.body.join("\n\n") })).filter((page) => page.text.trim());
}

const CHAPTERS = {
  introduction: ["whatIsThis.qmd", "Introduction"],
  creation: ["char-creation.qmd", "How to Create a Player Character"],
  abilities: ["abilities.qmd", "Character Abilities"],
  races: ["races.qmd", "Character Races"],
  classes: ["class.qmd", "Character Classes"],
  equipment: ["equipment.qmd", "Equipment"],
  vehicles: ["vehicles.qmd", "Vehicles"],
  spells: ["spells.qmd", "Spells"],
  dungeon: ["dungeonAdventures.qmd", "Dungeon Adventures"],
  wilderness: ["wildAdventures.qmd", "Wilderness Adventures"],
  hirelings: ["hirelings.qmd", "Hirelings"],
  advancement: ["advancement.qmd", "Advancement"],
  combat: ["combat.qmd", "Combat Encounters"],
  monsters: ["monsters.qmd", "Monsters"],
  treasure: ["treasure.qmd", "Treasure"],
  magicitems: ["magicItems.qmd", "Magic Items"],
  gm01: ["gm01.qmd", "Managing Encounters"],
  gm02: ["gm02.qmd", "Crafting Adventures"],
};
const chapters = {};
for (const [key, [file, title]] of Object.entries(CHAPTERS)) {
  let raw = read(file);
  // The spells chapter: its own pages are the rules of casting; each spell is a record.
  if (key === "spells") raw = raw.split(/\n# Cleric Spells/)[0] + "\n\n## Cleric Spells\n\n" + (/# Cleric Spells\n([\s\S]*?)::: \{\.callout/.exec(raw)?.[1] ?? "") + "\n\n## Magic-User Spells\n\n" + (/# Magic[- ]User Spells\n([\s\S]*?)::: \{\.callout/i.exec(raw)?.[1] ?? "");
  // Each spell's, monster's and magic item's own words go with its record, not the chapter.
  if (key === "magicitems") raw = raw.split(/\n## Explanation of Magic Items/)[0];
  chapters[key] = { title, pages: pages(raw, title) };
}
// The interactive book's own pages (its stat roller, a turn undead lookup) are left out above with their code.

// --- Spells -----------------------------------------------------------------
const spells = [];
for (const chunk of read("allSpells.qmd").split(/<div class="spell"/).slice(1)) {
  const name = /^##\s+(.+)$/m.exec(chunk)?.[1].trim();
  if (!name) continue;
  const body = chunk.replace(/^[^\n]*\n/, "").replace(/^##\s+.+$/m, "");
  const lines = body.split("\n");
  let range = "";
  let duration = "";
  let classes = "";
  const rest = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!range && /^Range:/i.test(trimmed)) range = trimmed.replace(/^Range:\s*/i, "");
    else if (!duration && /^Duration:/i.test(trimmed)) duration = trimmed.replace(/^Duration:\s*/i, "");
    else if (!classes && /^(Cleric|Magic[- ]User)\s+\d/i.test(trimmed)) classes = trimmed;
    else rest.push(line);
  }
  const levels = {};
  for (const match of classes.matchAll(/(Cleric|Magic[- ]User)\s+(\d)/gi)) levels[/cleric/i.test(match[1]) ? "cleric" : "magicuser"] = Number(match[2]);
  const reversible = /\*\s*$/.test(name);
  spells.push({
    name: name.replace(/\*+\s*$/, "").trim(),
    reversible,
    classes: classes.replace(/Magic User/gi, "Magic-User"),
    levels,
    range,
    duration,
    text: clean(rest.join("\n")),
  });
}

// --- Monsters ---------------------------------------------------------------
const norm = (name) => String(name).toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const sections = [];
for (const chunk of read("monstersAll.qmd").split(/<div class="monster"/).slice(1)) {
  const tags = [...chunk.slice(0, chunk.indexOf(">")).matchAll(/data-tag\d*="([^"]*)"/g)].map((match) => match[1]);
  const title = /^##\s+(.+)$/m.exec(chunk)?.[1].trim() ?? tags[0] ?? "";
  const body = chunk.slice(chunk.indexOf(">") + 1).replace(/<\/div>[\s\S]*$/, "");
  // The description: what follows the stat table.
  const lines = body.split("\n");
  let last = -1;
  lines.forEach((line, index) => {
    if (line.trim().startsWith("|")) last = index;
  });
  const text = clean(lines.slice(last + 1).join("\n").replace(/^##\s+.+$/m, ""));
  sections.push({ title, tags, text });
}
const byTag = new Map();
for (const section of sections) for (const tag of [section.title, ...section.tags]) byTag.set(norm(tag), section);
// (Some of its keys are written with no-break spaces: "No. of Attacks:".)
const statBlocks = JSON.parse(read("monsters.json")).map((block) => Object.fromEntries(Object.entries(block).map(([key, value]) => [key.replace(/ /g, " "), typeof value === "string" ? value.replace(/ /g, " ") : value])));
const field = (block, name) => String(block[`${name}:`] ?? "").replace(/’/g, "'").trim();
const monsters = [];
let previous = null;
for (const block of statBlocks) {
  const name = String(block.Name ?? "").trim();
  if (!name) continue;
  const section = byTag.get(norm(name)) ?? byTag.get(norm(name.replace(/\*+$/, ""))) ?? sections.find((item) => norm(name).split(" ").every((word) => norm(item.title).includes(word))) ?? null;
  // A blank cell in a table of several creatures is the first column's.
  const inherit = (key) => field(block, key) || (previous && section && previous.section === section ? previous[key] : "");
  const entry = {
    name: name.replace(/\*+$/, ""),
    group: section?.title ?? name,
    ac: field(block, "Armor Class"),
    hd: field(block, "Hit Dice"),
    attacks: inherit("No. of Attacks"),
    damage: inherit("Damage"),
    movement: inherit("Movement"),
    appearing: inherit("No. Appearing"),
    saveas: field(block, "Save As") || (block["Save As: Fighter:"] ? `Fighter: ${block["Save As: Fighter:"]}` : "") || inherit("Save As"),
    morale: inherit("Morale"),
    treasure: inherit("Treasure Type"),
    xp: field(block, "XP"),
    text: section?.text ?? "",
  };
  // (The source's monsters.json names a creature twice in places, and has a typo: "Dire Wold".)
  entry.name = entry.name.replace(/^Dire Wold$/, "Dire Wolf");
  if (!monsters.some((other) => other.name === entry.name)) monsters.push(entry);
  previous ={ section, "No. of Attacks": entry.attacks, Damage: entry.damage, Movement: entry.movement, "No. Appearing": entry.appearing, "Save As": entry.saveas, Morale: entry.morale, "Treasure Type": entry.treasure };
}

// --- Equipment --------------------------------------------------------------
const equipmentText = read("equipment.qmd");
// An item's explanation: the paragraph that names it in bold.
const explanations = new Map();
for (const paragraph of equipmentText.split(/\n\s*\n/)) {
  const names = [...paragraph.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].trim().toLowerCase());
  for (const name of names) if (!explanations.has(name)) explanations.set(name, clean(paragraph));
}
const explain = (name) => {
  const key = name.toLowerCase().replace(/,.*$/, "").replace(/\s*\(.*\)$/, "").trim();
  for (const [bold, text] of explanations) if (key.startsWith(bold) || bold.startsWith(key) || key.split(/[\s/]/)[0] === bold.split(/[\s/]/)[0]) return text;
  return "";
};
const [gear, weapons, armour, animals] = JSON.parse(read("equipment.json"));
const RANGES = { longbow: [70, 140, 210], shortbow: [50, 100, 150], "heavy crossbow": [80, 160, 240], "light crossbow": [60, 120, 180], dagger: [10, 20, 30], "hand axe": [10, 20, 30], sling: [30, 60, 90], spear: [10, 20, 30], warhammer: [10, 20, 30] };
const AMMO = { shortbow: "1d6", longbow: "1d8", "light crossbow": "1d6", "heavy crossbow": "1d8", sling: "1d4" };
const equipment = [];
for (const item of gear) equipment.push({ name: item.Item, type: "Adventuring Gear", cost: item.Price, weight: item.Weight, text: explain(item.Item) });
let groupName = "";
for (const item of weapons) {
  const name = String(item.Weapon ?? "").replace(/\*\*/g, "").replace(/\^†\^|†/g, "").trim();
  if (!item.Price && !item["Dmg."]) {
    groupName = name;
    continue;
  }
  if (!name || /^(thrown|melee) \(/i.test(name)) continue;
  const key = name.toLowerCase();
  const ammo = /arrow|quarrel|bullet|stone/i.test(name);
  const launcher = AMMO[key];
  const damage = key === "spear" ? "1d6" : item["Dmg."] || launcher || "";
  equipment.push({
    name,
    type: ammo ? "Ammunition" : "Weapon",
    subtype: groupName,
    cost: item.Price === "n/a" ? "0 gp" : item.Price,
    weight: item.Weight,
    size: item.Size ?? "",
    damage,
    ...(RANGES[key] ? { range: RANGES[key].join("/") } : {}),
    ...(launcher ? { missile: true } : {}),
    ...(["dagger", "silver dagger", "hand axe", "spear", "warhammer"].includes(key) ? { thrown: true } : {}),
    ...(key === "spear" ? { text: "A spear does 1d6 thrown or in one hand, 1d8 in two hands." } : {}),
  });
}
for (const item of armour) {
  const name = item["Armor Type"];
  if (/no armor/i.test(name)) continue;
  const shield = /shield/i.test(name);
  equipment.push({ name, type: "Armor", subtype: shield ? "Shield" : /leather/i.test(name) ? "Leather" : "Metal", cost: item.Price, weight: item.Weight, ...(shield ? { acbonus: 1 } : { ac: Number(item.AC) }) });
}
for (const item of animals) equipment.push({ name: item.Item.replace(/\*$/, ""), type: "Animal", cost: item.Price, text: /pony/i.test(item.Item) ? "Dwarves and Halflings generally ride ponies rather than horses." : "" });

// --- Magic items --------------------------------------------------------------
const magicText = read("magicItems.qmd");
const explanation = magicText.split(/\n## Explanation of Magic Items/)[1] ?? "";
const magicItems = [];
let section = "";
for (const paragraph of explanation.split(/\n\s*\n/)) {
  const heading = /^#{2,4}\s+(.+)$/m.exec(paragraph.trim());
  if (heading && paragraph.trim().startsWith("#")) {
    section = heading[1].replace(/\*\*/g, "").trim();
    continue;
  }
  const named = /^\s*\*\*([^*]{2,60}?):?\*\*:?\s*/.exec(paragraph);
  if (named && section && !/^Using Magic Items$/i.test(section)) {
    magicItems.push({ name: named[1].replace(/:$/, "").trim(), type: "Magic Item", subtype: section.replace(/^Miscellaneous Item Effects$/, "Miscellaneous").replace(/^Miscellaneous Items$/, "Miscellaneous"), text: clean(paragraph) });
  } else if (magicItems.length && section && !named && magicItems.at(-1).subtype === section.replace(/^Miscellaneous Item Effects$/, "Miscellaneous")) {
    // A description's further paragraphs.
    magicItems.at(-1).text += `\n\n${clean(paragraph)}`;
  }
}

const write = (file, value) => fs.writeFileSync(path.join(out, file), `${JSON.stringify(value, null, 1)}\n`);
write("chapters.json", chapters);
write("spells.json", spells);
write("monsters.json", monsters);
write("equipment.json", equipment);
write("magic-items.json", magicItems);
console.log(`chapters ${Object.keys(chapters).length} (${Object.values(chapters).reduce((sum, chapter) => sum + chapter.pages.length, 0)} pages), spells ${spells.length}, monsters ${monsters.length} (${monsters.filter((item) => item.text).length} described), equipment ${equipment.length}, magic items ${magicItems.length}`);
