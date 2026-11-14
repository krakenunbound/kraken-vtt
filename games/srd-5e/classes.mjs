// The SRD 5.2.1's character options as FG 5E (2024) records, in the shape the
// 5E character wizard, sheet and level up read (shared/dnd5e/wizard.mjs,
// rules.mjs): classes (hit die, proficiencies, kits, a feature row for each
// level it is gained at, "Fighter Subclass" asking for the subclass,
// "Ability Score Improvement" for a feat or +2), subclasses (class_specialization,
// data.class), species (race) and their lineages (race_subrace, data.race),
// backgrounds (abilities, feat, skills, tool, kits) and feats (category).
import { ids, md } from "../lib/fg.mjs";
import { data, plain } from "./common.mjs";
import { kitList } from "./gear.mjs";

const CLASSES_DATA = data("classes");
const ORIGINS = data("origins");
const FEATS_DATA = data("feats");
const VERSION = "2024";

const tableMd = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---|").join("")}`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
const keyOf = (name) => plain(name).toLowerCase().replace(/\s*\(.*\)$/, "");

// A class's features by level: each name in its features table's row (an
// Ability Score Improvement at 4, 8, 12, 16 is a row each), its text from the
// "Level N: Name" section that describes it.
function featureRows(cls) {
  // Two features may share a name (Improved Brutal Strike at 13 and 17): the one
  // described at that level, else the last described before it.
  const describedAt = (name, level) => {
    const same = cls.features.filter((feature) => keyOf(feature.name) === keyOf(name));
    return same.find((feature) => feature.level === level) ?? same.filter((feature) => feature.level <= level).at(-1) ?? same[0];
  };
  const described = { get: (name, level) => describedAt(name, level) };
  // The options a feature offers (Metamagic Options, Eldritch Invocation Options) go with it.
  for (const option of cls.options) {
    const stem = keyOf(option.name.replace(/ Options$/, ""));
    const feature = cls.features.find((item) => keyOf(item.name).startsWith(stem) || stem.startsWith(keyOf(item.name)));
    if (feature) feature.text = `${feature.text}\n\n### ${option.name}\n\n${option.text}`;
  }
  const rows = [];
  const seen = new Set();
  const add = (level, name, text) => {
    const id = `${level}:${keyOf(name)}`;
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ level, name, text: md(text || name) });
  };
  for (const row of cls.table?.rows ?? []) {
    const level = Number(row[0]);
    for (const name of String(row[2] ?? "").split(/,\s*/)) {
      if (!name || /^(—|-|Subclass feature)$/i.test(name.trim())) continue;
      add(level, name.trim(), described.get(name, level)?.text ?? "");
    }
  }
  // A feature described but not in the table (none in the SRD; kept so nothing is lost).
  for (const feature of cls.features) add(feature.level, feature.name, feature.text);
  return rows.sort((a, b) => a.level - b.level);
}

export const CLASSES = CLASSES_DATA.map((cls) => {
  const t = cls.traits;
  const coreRows = Object.entries(t).map(([label, value]) => [label, value]);
  return {
    name: cls.name,
    version: VERSION,
    hp: { hitdice: { text: t["Hit Point Die"] } },
    primaryability: t["Primary Ability"],
    proficiencies: {
      armor: { text: t["Armor Training"] ?? "None" },
      weapons: { text: t["Weapon Proficiencies"] ?? "" },
      savingthrows: { text: t["Saving Throw Proficiencies"] ?? "" },
      skills: { text: t["Skill Proficiencies"] ?? "" },
      tools: { text: t["Tool Proficiencies"] ?? "None" },
    },
    startingequipment: t["Starting Equipment"],
    startingequipmentlist: kitList(t["Starting Equipment"]),
    text: md([cls.intro, `### Core ${cls.name} Traits`, tableMd(["Trait", ""], coreRows), ...(cls.table ? [`### ${cls.name} Features`, tableMd(cls.table.head, cls.table.rows)] : [])].filter(Boolean).join("\n\n")),
    features: ids(featureRows(cls)),
  };
});

export const SUBCLASSES = CLASSES_DATA.filter((cls) => cls.subclass).map((cls) => ({
  name: cls.subclass.name,
  class: cls.name,
  version: VERSION,
  text: md(cls.subclass.text || cls.subclass.name),
  features: ids(cls.subclass.features.map((feature) => ({ level: feature.level, name: feature.name, text: md(feature.text || feature.name) }))),
}));

// The class spell lists ({ Wizard: { 0: [...], 1: [...] } }), for the spells' sources and the book's pages.
export const SPELL_LISTS = Object.fromEntries(CLASSES_DATA.filter((cls) => Object.keys(cls.spells).length).map((cls) => [cls.name, cls.spells]));

// --- Species and their lineages ------------------------------------------------------------------
export const SPECIES = ORIGINS.species.map((sp) => ({
  name: sp.name,
  version: VERSION,
  type: sp.fields["Creature Type"] ?? "Humanoid",
  size: sp.fields.Size,
  speed: sp.fields.Speed,
  text: md([`**Creature Type:** ${sp.fields["Creature Type"]}`, `**Size:** ${sp.fields.Size}`, `**Speed:** ${sp.fields.Speed}`, ...(sp.table ? [`### ${sp.table.caption}`, tableMd(sp.table.head, sp.table.rows)] : [])].join("\n\n")),
  traits: ids(sp.traits.map((trait) => ({ name: trait.name, text: md(trait.text) }))),
}));

// A lineage, legacy or ancestry from its species' table: the choice made once, in the wizard.
export const ANCESTRIES = ORIGINS.species.flatMap((sp) => {
  if (!sp.table) return [];
  const { caption, head, rows } = sp.table;
  if (sp.name === "Dragonborn") {
    // Two dragons a row (Dragon | Damage Type | Dragon | Damage Type).
    return rows.flatMap((row) => [[row[0], row[1]], [row[2], row[3]]]).filter(([dragon]) => dragon).map(([dragon, type]) => ({
      name: `${dragon} Dragonborn`,
      race: sp.name,
      version: VERSION,
      text: md(`Your Draconic Ancestry is the ${dragon} dragon (the ${caption} table): your Breath Weapon deals ${type} damage, and your Damage Resistance is to ${type} damage.`),
      traits: ids([{ name: "Draconic Ancestry", text: md(`${dragon} dragon: ${type} damage for your Breath Weapon and Damage Resistance traits.`) }]),
    }));
  }
  return rows.map((row) => ({
    name: sp.name === "Elf" ? (row[0] === "Drow" ? "Drow" : `${row[0]}`) : `${row[0]} Tiefling`,
    race: sp.name,
    version: VERSION,
    text: md(`From the ${caption} table.\n\n` + head.slice(1).map((label, index) => `**${label}:** ${row[index + 1]}`).join("\n\n")),
    traits: ids([{ name: `${row[0]} ${sp.name === "Elf" ? "Lineage" : "Legacy"}`, text: md(head.slice(1).map((label, index) => `**${label}:** ${row[index + 1]}`).join("\n\n")) }]),
  }));
});

// --- Backgrounds -------------------------------------------------------------------------------------
const seeAlso = (text) => String(text ?? "").replace(/\s*\(see "[^"]+"\)/g, "").trim();
export const BACKGROUNDS = ORIGINS.backgrounds.map((bg) => ({
  name: bg.name,
  version: VERSION,
  abilities: bg.fields["Ability Scores"],
  feat: seeAlso(bg.fields.Feat),
  skill: bg.fields["Skill Proficiencies"],
  tool: seeAlso(bg.fields["Tool Proficiency"]),
  equipment: bg.fields.Equipment,
  equipmentlist: kitList(bg.fields.Equipment),
  text: md([...Object.entries(bg.fields).map(([label, value]) => `**${label}:** ${value}`), bg.text].filter(Boolean).join("\n\n")),
}));

// --- Feats ---------------------------------------------------------------------------------------------
// Magic Initiate names its spell list ("Magic Initiate (Cleric)", as the
// Acolyte gives it): a record for each list, so a background's feat is found.
export const FEATS = FEATS_DATA.flatMap((feat) => {
  const record = (name) => ({
    name,
    version: VERSION,
    category: feat.category,
    prerequisite: feat.prerequisite,
    repeatable: feat.repeatable ? 1 : 0,
    text: md(`*${feat.category} Feat${feat.prerequisite ? ` (Prerequisite: ${feat.prerequisite})` : ""}*\n\n${feat.text}`),
    __category: `${feat.category} Feats`,
  });
  if (feat.name === "Magic Initiate") return ["Cleric", "Druid", "Wizard"].map((list) => record(`Magic Initiate (${list})`));
  return [record(feat.name)];
});
