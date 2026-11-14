// The SRD 5.2.1's equipment as FG 5E item records (the fields Kraken's d20
// engine reads, shared/dnd5e/rules.mjs): weapons (damage "1d8 Slashing",
// properties, mastery, subtype "Martial Melee Weapons"), armor (ac, dexbonus
// "Yes" / "Max 2" / "No", strength, stealth), tools (subtype "Artisan's
// Tools", "Gaming Set", "Musical Instrument" for the wizard's tool choices),
// adventuring gear, ammunition, focuses, mounts and tack. And the starting
// kits of the classes and backgrounds, read from their "Choose A or B" text.
import { ids, md } from "../lib/fg.mjs";
import { costOf, data, plain, pounds } from "./common.mjs";

const EQUIPMENT = data("equipment");
// A property's own rule, without a sidebar or table that follows it on the page.
for (const [name, text] of Object.entries(EQUIPMENT.properties)) EQUIPMENT.properties[name] = text.split(/\n\n### /)[0];
const titled = (text) => String(text).replace(/\b([a-z])/g, (letter) => letter.toUpperCase()).replace(/\b(Of|The|Or|And)\b/g, (word) => word.toLowerCase());

export const WEAPONS = EQUIPMENT.weapons.map((weapon) => {
  const props = weapon.properties ? weapon.properties.split(/,\s*(?![^()]*\))/).map((part) => part.trim()) : [];
  const notes = props.map((prop) => EQUIPMENT.properties[prop.replace(/\s*\(.*$/, "")]).filter(Boolean);
  return {
    name: weapon.name,
    type: "Weapon",
    subtype: weapon.category,
    cost: costOf(weapon.cost),
    damage: weapon.damage,
    properties: weapon.properties,
    mastery: weapon.mastery,
    weight: pounds(weapon.weight),
    bonus: 0,
    rarity: "Common",
    description: md([`*${weapon.category.replace(/s$/, "")}.* **Damage** ${weapon.damage}. **Properties** ${weapon.properties || "—"}. **Mastery** ${weapon.mastery}.`, ...notes, EQUIPMENT.properties[weapon.mastery] ? `***${weapon.mastery} (Mastery).*** ${EQUIPMENT.properties[weapon.mastery]}` : ""].filter(Boolean).join("\n\n")),
    __category: "Weapons",
  };
});

const DEX = { "Light Armor": "Yes", "Medium Armor": "Max 2", "Heavy Armor": "No", Shield: "-" };
export const ARMOR = EQUIPMENT.armor.map((armor) => ({
  name: armor.name,
  type: "Armor",
  subtype: armor.category,
  cost: costOf(armor.cost),
  ac: Number(/\d+/.exec(armor.ac)?.[0] ?? 10),
  dexbonus: DEX[armor.category] ?? "Yes",
  strength: /\d+/.exec(armor.strength)?.[0] ?? "",
  stealth: /disadvantage/i.test(armor.stealth) ? "Disadvantage" : "-",
  weight: pounds(armor.weight),
  bonus: 0,
  rarity: "Common",
  description: md(`*${armor.category}* (${armor.don}). **Armor Class (AC)** ${armor.ac}. **Strength** ${armor.strength}. **Stealth** ${armor.stealth}.`),
  __category: "Armor",
}));

// A tool's fields as its description (Ability, Utilize, Craft).
const toolMd = (tool) => [...Object.entries(tool.fields).filter(([label]) => label !== "Variants").map(([label, value]) => `**${label}:** ${value}`), tool.text].filter(Boolean).join("\n\n");
const toolText = (tool) => md(toolMd(tool));
// Gaming sets and instruments come in kinds, each its own item (the wizard's choices).
const VARIANT_NAMES = { dice: "Dice Set", dragonchess: "Dragonchess Set", "playing cards": "Playing Cards", "three-dragon ante": "Three-Dragon Ante Set" };
export const TOOLS = EQUIPMENT.tools.flatMap((tool) => {
  const variants = tool.fields.Variants;
  if (variants) {
    const subtype = tool.name === "Gaming Set" ? "Gaming Set" : "Musical Instrument";
    return [...variants.matchAll(/([A-Za-z' -]+?)\s*\(([^)]*)\)/g)].map(([, raw, inside]) => {
      const key = raw.trim().toLowerCase();
      const name = VARIANT_NAMES[key] ?? titled(key);
      const cost = /(\d[\d,]*\s*(?:GP|SP|CP))/.exec(inside)?.[1] ?? "";
      const weight = /([\d½/]+)\s*lb/.exec(inside)?.[1] ?? "";
      return { name, type: "Tools", subtype, cost, weight: pounds(weight || tool.fields.Weight), rarity: "Common", description: md(`*${tool.name} (${raw.trim()}).*\n\n${toolMd(tool)}`), __category: "Tools" };
    });
  }
  return [{ name: tool.name, type: "Tools", subtype: tool.kind === "Artisan's Tools" ? "Artisan's Tools" : "Other Tools", cost: costOf(tool.cost), weight: pounds(tool.fields.Weight), rarity: "Common", description: toolText(tool), __category: "Tools" }];
});

const gearRecord = (name, cost, weight, text, subtype = "Adventuring Gear") => ({ name, type: "Adventuring Gear", subtype, cost: costOf(cost), weight: pounds(weight), rarity: "Common", description: md(text || name), __category: "Adventuring Gear" });
const table = (caption) => EQUIPMENT.gearTables[caption]?.rows ?? [];
const gearText = (name) => EQUIPMENT.gear.find((item) => item.name === name)?.text ?? "";
export const GEAR = [
  ...EQUIPMENT.gear
    .filter((item) => !["Ammunition", "Spell Scroll"].includes(item.name))
    .map((item) => gearRecord(item.name, item.cost, item.weight, item.text, /Pack$/.test(item.name) ? "Equipment Pack" : /Focus$|Holy Symbol/.test(item.name) ? "Spellcasting Focus" : "Adventuring Gear")),
  // Ammunition by its bundle (Arrows (20)), from the Ammunition table.
  ...table("Ammunition").map(([type, amount, storage, weight, cost]) => gearRecord(`${type} (${amount})`, cost, weight, `${amount} ${type.toLowerCase()}, kept in a ${storage}.\n\n${gearText("Ammunition").split("\n\n")[0]}`, "Ammunition")),
  // A focus of each form.
  ...[["Arcane Focus", "Arcane Focuses"], ["Druidic Focus", "Druidic Focuses"], ["Holy Symbol", "Holy Symbols"]].flatMap(([kind, caption]) =>
    table(caption).map(([form, weight, cost]) => gearRecord(`${kind} (${titled(form.replace(/\s*\(.*$/, ""))})`, cost, weight, `${form}.\n\n${gearText(kind).split("\n\n")[0]}`, "Spellcasting Focus")),
  ),
  ...["Cantrip", "Level 1"].map((level) => {
    const row = table("Adventuring Gear").find(([name]) => plain(name) === `Spell Scroll (${level})`);
    return gearRecord(`Spell Scroll (${level})`, row?.[2] ?? "", row?.[1] ?? "", gearText("Spell Scroll"));
  }),
];

export const MOUNTS = [...EQUIPMENT.mounts, ...EQUIPMENT.vehicles].map((row) => ({
  name: row.name,
  type: "Mounts and Vehicles",
  subtype: row.table,
  cost: costOf(row.cells.at(-1)),
  ...(/weight/i.test(row.head[1] ?? "") ? { weight: pounds(row.cells[1]) } : {}),
  rarity: "Common",
  description: md(row.head.map((head, index) => `**${head}:** ${row.cells[index] ?? ""}`).join(" ")),
  __category: "Mounts and Vehicles",
}));

export const ITEMS = [...WEAPONS, ...ARMOR, ...TOOLS, ...GEAR, ...MOUNTS];

// --- Starting kits ----------------------------------------------------------------------------
// "Traveler's Clothes" is the gear table's "Clothes, Traveler's".
const byName = new Map();
for (const item of ITEMS) {
  byName.set(item.name.toLowerCase(), item);
  const comma = /^(.+?), (.+)$/.exec(item.name);
  if (comma) byName.set(`${comma[2]} ${comma[1]}`.toLowerCase(), item);
}
const lookup = (name) => byName.get(String(name).toLowerCase()) ?? null;
const copy = (item, name, count) => {
  const { __category, ...fields } = item;
  return { ...fields, name: name ?? fields.name, count };
};
// One kit entry ("8 Javelins", "20 Arrows", "Parchment (10 sheets)", "Arcane Focus (crystal)") as an item.
export function kitItem(text) {
  let name = text.trim();
  let count = 1;
  const lead = /^(\d+)\s+(.+)$/.exec(name);
  if (lead) [count, name] = [Number(lead[1]), lead[2]];
  const sheets = /^(.+?)\s*\((\d+) sheets\)$/.exec(name);
  if (sheets) [name, count] = [sheets[1], Number(sheets[2])];
  // A focus that is a weapon too (a Quarterstaff): the weapon, to fight with.
  const weaponFocus = /^(?:Arcane|Druidic) Focus \((Quarterstaff)\)$/i.exec(name);
  if (weaponFocus) return copy(lookup(weaponFocus[1]), null, count);
  const bundle = lookup(`${name} (${count})`);
  if (bundle) return copy(bundle, null, 1);
  const direct = lookup(name) ?? lookup(name.replace(/es$/, "")) ?? lookup(name.replace(/s$/, ""));
  if (direct) return copy(direct, null, count);
  const form = /^(.+?) \((.+)\)$/.exec(name);
  if (form) {
    const kind = lookup(`${form[1]} (${titled(form[2])})`);
    if (kind) return copy(kind, null, count);
    const base = lookup(form[1]);
    // "Book (prayers)": a Book, named for what is in it. "Gaming Set (same as above)": the set chosen.
    if (base) return copy(base, /same as above/i.test(form[2]) ? form[1] : name, count);
    if (/same as above/i.test(form[2])) return { name: form[1], count };
  }
  // Something to choose in play ("Musical Instrument of your choice").
  return { name: name.replace(/\s+of your choice$/i, "").replace(/\s+chosen for the tool proficiency above$/i, ""), count };
}
// "Choose A or B: (A) Greataxe, 4 Handaxes, Explorer's Pack, and 15 GP; or (B) 75 GP"
// as FG's startingequipmentlist: { id-00001: { option, items, wealth } ... }.
export function kitList(text) {
  const body = String(text ?? "").replace(/^\s*Choose [^:]+:\s*/i, "");
  const options = body.split(/;\s*(?:or\s+)?(?=\([A-Z]\))/).map((part) => /^\(([A-Z])\)\s*(.*)$/.exec(part.trim())).filter(Boolean);
  const out = {};
  options.forEach(([, , list], index) => {
    const entries = list.replace(/\.$/, "").split(/,\s*(?:and\s+)?|\s+and\s+(?=\d+\s*GP$)/).map((part) => part.replace(/^and\s+/, "").trim()).filter(Boolean);
    let wealth = 0;
    const items = [];
    for (const entry of entries) {
      const gold = /^(\d+)\s*GP$/i.exec(entry);
      if (gold) wealth += Number(gold[1]);
      else items.push(kitItem(entry));
    }
    out[`id-${String(index + 1).padStart(5, "0")}`] = { option: `Option ${index + 1}`, ...(items.length ? { items: ids(items) } : {}), ...(wealth ? { wealth } : {}) };
  });
  return out;
}
