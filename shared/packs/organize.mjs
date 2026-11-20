// How Maelstrom files a book or pack in the Modules and Books windows: a kind (one of seven, each with its icon),
// then a group in it (a product line or an adventure series), then the books, then a book's parts (an adventure
// pack's adventures). A pack made to format 3 says all of this in its kraken-pack.json (kind, group, order,
// parent); an older pack or an FG module has it worked out here from its category and title. docs/kpack-format.md
// is the format's description, for people and agents.

export const KINDS = [
  { id: "rules", label: "Rules", icon: "book", hint: "Core rulebooks, supplements, handbooks, monsters, spells" },
  { id: "adventure", label: "Adventures", icon: "map", hint: "Modules and adventures, by series" },
  { id: "setting", label: "Settings", icon: "locate", hint: "Worlds and gazetteers" },
  { id: "maps", label: "Maps & Tiles", icon: "walls", hint: "Battle maps, map packs, tiles" },
  { id: "art", label: "Tokens & Art", icon: "character", hint: "Tokens, portraits, pogs, decals, asset packs" },
  { id: "tools", label: "Tables & Tools", icon: "d20", hint: "Critical and fumble tables, calendars, pregenerated characters, name lists" },
  { id: "other", label: "Other", icon: "folder", hint: "Anything else" },
];
export const KIND_IDS = KINDS.map((kind) => kind.id);

// FG categories that say only what kind of book it is, not which line or series: no group of their own.
const PLAIN = /^(other|module|modules|adventure|adventures|one-shot adventure|rules|map module|maps?|2e|3\.5e?|5e|kraken|kraken maps|kraken worlds|homebrew|.*\badventures)$/i;
// Group names said one way: FG's "Core Rulebook", "D&D 3.5e Core Rulebooks" and "Core Rules" are one group.
const SAME_GROUP = [
  [/^(.*\b)?core (rules|rulebooks?)$/i, "Core Rules"],
  [/^accessor(y|ies)$/i, "Accessories"],
  [/^handbooks?$/i, "Handbooks"],
];
// The worlds a setting book is filed under.
const WORLDS = [
  [/\bgreyhawk\b/i, "Greyhawk"],
  [/\b(mystara|known world|karameikos)\b/i, "Mystara"],
  [/\b(forgotten realms|faer[uû]n|sword coast)\b/i, "Forgotten Realms"],
  [/\bgolarion\b/i, "Golarion"],
  [/\b(eberron)\b/i, "Eberron"],
  [/\b(dragonlance|krynn)\b/i, "Dragonlance"],
  [/\b(ravenloft)\b/i, "Ravenloft"],
];
// A line known by its title, whatever its category says.
const LINES = [
  [/^osric\b/i, "OSRIC"],
  [/\b(player'?s'? handbook|players handbook|dungeon master'?s? guide|monstrous manual|monster manual|core rulebook)\b/i, "Core Rules"],
];

const TESTS = [
  ["tools", /\b(fumble|critical|krits?|calendars?|pregens?|pregenerated|one-shot pregens|names?|oracles?)\b/i],
  ["art", /\b(tokens?|pogs?|portraits?|decals?|asset pack|assets|props|heroic (fe)?male characters|fantasy monsters fm\d)\b/i],
  ["maps", /\b(battle ?maps?|map module|maps?|tiles?|high res maps|karameikos map)\b/i],
  ["setting", /\b(greyhawk|mystara|known world|forgotten realms|golarion|world builder|setting reference|campaign reference|gazetteer|worlds?)\b/i],
  ["adventure", /\b(adventures?|module|one-shot|scenario|adventure pack|AP\d|slave lords|campaign)\b/i],
  // An adventure's code ("B4 The Lost City"): capitals, so a title's ordinary words never match.
  ["adventure", /^[A-Z]{1,2}\d{1,2}[\s:-]/],
  ["rules", /\b(core|rules?|rulebooks?|handbook|player'?s|players|dungeon master|monstrous|manual|guide|tome|accessory|essentials|reference|osric|complete|deities|demihuman|siegecore|bestiary|monsters|spells?|magic items)\b/i],
];

// Its adventure code ("B4", "A1", "I13"), when the title starts with one.
export const codeOf = (title) => /^([A-Z]{1,2})(\d{1,2})\b/.exec(String(title ?? "").trim());

// kind, group, order and parent for one item ({ title, name, category, kind?, group?, order?, parent?, hasBook,
// hasStory }), given every item on the shelf (to find an adventure pack a part belongs to).
export function organize(item, all = []) {
  const title = String(item.title || item.name || "");
  const category = String(item.category ?? "").trim();
  const words = `${category} ${title}`;
  let kind = KIND_IDS.includes(item.kind) ? item.kind : "";
  if (!kind) kind = TESTS.find(([, test]) => test.test(category))?.[0] ?? TESTS.find(([, test]) => test.test(title))?.[0] ?? "";
  if (!kind && (item.hasStory || item.adventure)) kind = "adventure";
  if (!kind && item.hasBook) kind = "rules";
  if (!kind) kind = /\bno book\b/i.test(words) ? "art" : "other";

  // The part of an adventure pack: "I13 AP1 - Steaks" under the pack whose title starts with the same code and
  // has no " - " of its own ("I13 Adventure Pack 1").
  let parent = typeof item.parent === "string" ? item.parent : "";
  const code = codeOf(title);
  if (!parent && code && / - /.test(title)) {
    const head = all.find((other) => other !== item && codeOf(other.title || other.name)?.[0] === code[0] && !/ - /.test(String(other.title || other.name)));
    if (head) parent = String(head.name || head.title);
  }

  let group = typeof item.group === "string" && item.group.trim() ? item.group.trim() : "";
  if (!group && kind === "rules") group = LINES.find(([test]) => test.test(title))?.[1] ?? "";
  if (!group && category && !PLAIN.test(category)) group = SAME_GROUP.find(([test]) => test.test(category))?.[1] ?? category;
  if (!group && kind === "adventure" && code) group = `${code[1]} series`;
  // A setting under its world's name.
  if (!group && kind === "setting") group = WORLDS.find(([test]) => test.test(words))?.[1] ?? "";
  // No group: the book sits straight under its kind (never "Settings > Settings").

  // Within a group: by the adventure code's number (B2 before B10), else by title.
  const order = typeof item.order === "string" || typeof item.order === "number" ? String(item.order) : code ? `${code[1]}${String(code[2]).padStart(3, "0")}` : title.toLowerCase();
  return { kind, group, order, parent };
}

// The shelf as a tree: kinds (in KINDS order, those with books), their groups (by name), their books (by order),
// each book's parts. items: anything with an id and a title; extra fields are kept.
export function shelfTree(items) {
  const placed = items.map((item) => ({ item, ...organize(item, items) }));
  const byName = new Map(placed.map((entry) => [String(entry.item.name || entry.item.title), entry]));
  const partsOf = new Map();
  const tops = [];
  for (const entry of placed) {
    const head = entry.parent ? byName.get(entry.parent) : null;
    if (head && head !== entry) partsOf.set(head, [...(partsOf.get(head) ?? []), entry]);
    else tops.push(entry);
  }
  const sort = (list) => list.sort((a, b) => a.order.localeCompare(b.order, undefined, { numeric: true }) || String(a.item.title).localeCompare(String(b.item.title)));
  return KINDS.map((kind) => {
    const mine = tops.filter((entry) => entry.kind === kind.id);
    // Books with no group first (straight under the kind, name ""), then the groups by name.
    const groups = [...new Set(mine.map((entry) => entry.group))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, undefined, { numeric: true })));
    return {
      ...kind,
      count: placed.filter((entry) => entry.kind === kind.id).length,
      groups: groups.map((name) => ({
        name,
        books: sort(mine.filter((entry) => entry.group === name)).map((entry) => ({ ...entry, parts: sort(partsOf.get(entry) ?? []) })),
      })),
    };
  }).filter((kind) => kind.groups.length);
}
