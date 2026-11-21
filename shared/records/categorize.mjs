// Where a record sits in its list: a category and a subcategory, the same words whatever game or book it came from
// (each book spells them its own way: "Weapon / Martial Melee Weapons", "Medium Humanoid (Human)", "Alteration").
// The Items, NPCs, Spells and Images windows group and filter by these.

const ITEM = [
  ["Weapons", /\b(weapons?|melee|ranged|ammunition|ammo|firearms?|bows?|swords?|axes?)\b/i],
  ["Armor & Shields", /\b(armou?r|shields?|helms?|barding)\b/i],
  ["Potions & Oils", /\b(potions?|oils?|elixirs?|philters?)\b/i],
  ["Scrolls", /\b(scrolls?)\b/i],
  ["Rings", /\b(rings?)\b/i],
  ["Wands, Staffs & Rods", /\b(wands?|staffs?|staves|rods?)\b/i],
  ["Treasure", /\b(treasure|gems?|jewel(le)?ry|art objects?|coins?|valuables?|trade goods?)\b/i],
  ["Clothing", /\b(clothing|clothes|garments?)\b/i],
  ["Mounts & Vehicles", /\b(mounts?|vehicles?|transport|tack|harness|ships?|boats?|animals?)\b/i],
  ["Tools & Kits", /\b(tools?|kits?|instruments?)\b/i],
  ["Food, Drink & Lodging", /\b(food|drink|lodging|provisions?|goods and services|services?|meals?)\b/i],
  ["Spellbooks", /\b(spell ?books?)\b/i],
  ["Magic Items", /\b(magic|magical|wondrous|artifacts?|relics?)\b/i],
  ["Adventuring Gear", /\b(gear|equipment|adventuring|containers?|light sources?|supplies)\b/i],
];
const CREATURE = [
  ["Traps & Hazards", /\b(traps?|hazards?)\b/i],
  ["Humanoids", /\b(humanoids?|human|demi-?human|elf|dwarf|halfling|gnome|orc|goblin)\b/i],
  ["Undead", /\bundead\b/i],
  ["Dragons", /\bdragons?\b/i],
  ["Fiends", /\b(fiends?|demons?|devils?|daemons?|tanar'?ri|baatezu|outsider)\b/i],
  ["Giants", /\bgiants?\b/i],
  ["Beasts & Animals", /\b(beasts?|animals?|dinosaurs?|reptiles?|mammals?|birds?|fish|swarm)\b/i],
  ["Insects & Vermin", /\b(insects?|bugs?|vermin|spiders?|arachnids?)\b/i],
  ["Aberrations", /\baberrations?\b/i],
  ["Constructs", /\b(constructs?|golems?)\b/i],
  ["Elementals", /\belementals?\b/i],
  ["Fey", /\b(fey|faerie|fairy)\b/i],
  ["Celestials", /\bcelestials?\b/i],
  ["Oozes", /\b(oozes?|slimes?|jellies)\b/i],
  ["Plants & Fungi", /\b(plants?|fungus|fungi)\b/i],
  ["Monstrosities", /\b(monstrosit(y|ies)|magical beasts?|monsters?|lycanthropes?|shapechangers?)\b/i],
];
const IMAGE = [
  // A map by the word map only ("Dungeon Master Guide" is a book, not a map).
  ["Maps", /\b(maps?|battle ?maps?|battlemaps?)\b/i],
  ["Portraits", /\b(portraits?|npc|characters?|heroes)\b/i],
  ["Handouts", /\bhandouts?\b/i],
  ["Tokens", /\b(tokens?|pogs?)\b/i],
  ["Illustrations", /\b(illustrations?|artwork|art)\b/i],
];
const SCHOOLS = ["Abjuration", "Alteration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Invocation", "Necromancy", "Transmutation", "Summoning", "Charm", "Phantasm"];

const text = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const tidy = (value) => text(value).replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
const first = (rules, ...words) => {
  for (const word of words) {
    if (!word) continue;
    const hit = rules.find(([, test]) => test.test(word));
    if (hit) return hit[0];
  }
  return "";
};

// { category, sub } for a record (category "" when the record's kind has none of its own).
export function categoryOf(record) {
  const data = record?.data ?? {};
  switch (record?.type) {
    case "item": {
      const type = text(data.type);
      const sub = text(data.subtype);
      const magic = /magic/i.test(sub) || Boolean(data.isMagic) || /magic|wondrous/i.test(type);
      // The item's own type first ("Weapon / Magic" is a weapon), then its subtype, then its name.
      const category = first(ITEM.filter(([name]) => name !== "Magic Items"), type) || first(ITEM, sub, type) || (magic ? "Magic Items" : "") || first(ITEM, record.name) || "Other Items";
      return { category, sub: magic && category !== "Magic Items" ? "Magic" : /^magic$/i.test(sub) ? "" : tidy(sub), magic };
    }
    case "npc": {
      const kind = text(data.type ?? data.creaturetype);
      // "Medium Humanoid (Human)": the creature type without its size.
      const plain = kind.replace(/^(fine|diminutive|tiny|small|medium|large|huge|gargantuan|colossal)\s+/i, "");
      const category = first(CREATURE, plain, record.name) || (plain ? "Other Creatures" : "Creatures");
      const sub = /\(([^)]+)\)/.exec(plain)?.[1] ?? (plain.split(/[,;]/)[1] ?? "");
      return { category, sub: tidy(sub) };
    }
    case "spell":
    case "spelldesc": {
      const level = Number.parseInt(text(data.level), 10);
      const school = SCHOOLS.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text(data.school) || text(data.type))) ?? tidy(text(data.school).split(/[,;(]/)[0]);
      return { category: Number.isFinite(level) ? (level === 0 ? "Cantrips & Orisons" : `Level ${level}`) : "Spells", sub: school };
    }
    case "image": {
      const category = text(data.fgCategory);
      const isMap = Boolean(data.image?.grid === "on" || /occluder/.test(JSON.stringify(data.image ?? {}).slice(0, 20000)));
      return { category: isMap ? "Maps" : first(IMAGE, category, record.name) || "Pictures", sub: tidy(category), map: isMap };
    }
    default:
      return { category: tidy(text(data.fgCategory)), sub: "" };
  }
}

// Categories in a sensible order: the list's own order first, then anything else by name, "Other..." last.
const ORDER = [...ITEM.map(([name]) => name), "Other Items", ...CREATURE.map(([name]) => name), "Other Creatures", "Creatures", "Cantrips & Orisons", ...Array.from({ length: 10 }, (_, i) => `Level ${i + 1}`), "Spells", "Maps", "Portraits", "Handouts", "Tokens", "Illustrations", "Pictures"];
export function categoryOrder(a, b) {
  const ia = ORDER.indexOf(a);
  const ib = ORDER.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  return a.localeCompare(b, undefined, { numeric: true });
}

