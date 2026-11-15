// Ability cards: a character's spells and weapons as cards to lay out, the
// way some tables use printed spell cards. A card is a view of the sheet, never
// its own count: a spell card is spent when no slot of its level or higher is
// left, a cantrip or a weapon never; a long rest gives the slots back and the
// cards stand up again. Used by the Cards window (src/cards) and kraken_cards.

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const plain = (html) =>
  String(html ?? "")
    .replace(/<\/p>\s*<p>/g, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
export const cardKey = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// The schools' colours (the card's frame, its glow and its sparks).
export const SCHOOLS = {
  abjuration: { color: "#4f9de8", glyph: "shield" },
  conjuration: { color: "#e8a83c", glyph: "sparkle" },
  divination: { color: "#9fd6e8", glyph: "eye" },
  enchantment: { color: "#e86fbf", glyph: "heart" },
  evocation: { color: "#ef5b35", glyph: "damage" },
  illusion: { color: "#9a6ff0", glyph: "mood" },
  necromancy: { color: "#7fcf6b", glyph: "skull" },
  transmutation: { color: "#d9c255", glyph: "flask" },
  weapon: { color: "#b8b2a6", glyph: "combat" },
  // The other cards' frames (otherCards below).
  item: { color: "#d9a441", glyph: "flask" },
  feature: { color: "#c9b28a", glyph: "shield" },
  asset: { color: "#8fb3c9", glyph: "sparkle" },
  aspect: { color: "#e8c65a", glyph: "sparkle" },
  stunt: { color: "#e88a5a", glyph: "damage" },
  ability: { color: "#c98a4a", glyph: "mood" },
};
// What the sparks of a cast look like, by its damage type (or healing).
export const SPARKS = { fire: "embers", radiant: "motes", cold: "frost", lightning: "arcs", thunder: "rings", necrotic: "smoke", poison: "smoke", acid: "drops", psychic: "rings", force: "motes", healing: "motes" };

// The slot a spell of `level` would use: its own, else the lowest free one above.
export function freeSlot(slots, level) {
  if (level <= 0) return 0;
  const free = Object.entries(slots ?? {})
    .map(([key, slot]) => [num(String(key).slice(1)), slot])
    .filter(([at, slot]) => at >= level && num(slot?.used) < num(slot?.max))
    .sort((a, b) => a[0] - b[0])[0];
  return free ? free[0] : null;
}

// data: the character's data; spells: the campaign's spell records ({ id, name, data }).
export function cardsFor(data, spells = []) {
  const out = [];
  const slots = data?.slots ?? {};
  const byName = new Map(spells.map((spell) => [String(spell.name).toLowerCase(), spell]));
  const concentration = String(data?.concentration ?? "");
  // A spell listed twice (from two classes, say) is one card.
  const names = [...new Map((Array.isArray(data?.spells) ? data.spells.map(String) : []).map((name) => [cardKey(name), name])).values()];
  for (const name of names) {
    const spell = byName.get(name.toLowerCase());
    const sd = spell?.data ?? {};
    const level = Math.max(0, Math.round(num(sd.level)));
    const school = String(sd.school ?? "").toLowerCase();
    const rows = Object.values(sd.actions ?? {}).filter((row) => row && typeof row === "object");
    const damage = rows.find((row) => row.type === "damage");
    const damageType = String(Object.values(damage?.damagelist ?? {})[0]?.type ?? "").toLowerCase();
    const heals = rows.some((row) => row.type === "heal");
    const slot = freeSlot(slots, level);
    const pool = Object.entries(slots)
      .filter(([key]) => num(String(key).slice(1)) === level)
      .map(([, value]) => ({ max: num(value?.max), used: num(value?.used) }))[0] ?? null;
    out.push({
      id: `spell:${cardKey(name)}`,
      kind: "spell",
      name: spell?.name ?? name,
      recordId: spell?.id ?? "",
      level,
      school: SCHOOLS[school] ? school : "evocation",
      castingtime: String(sd.castingtime ?? ""),
      range: String(sd.range ?? ""),
      duration: String(sd.duration ?? ""),
      concentration: /concentration/i.test(String(sd.duration ?? "")),
      concentrating: concentration !== "" && concentration.toLowerCase() === name.toLowerCase(),
      text: plain(sd.description),
      sparks: heals ? "healing" : SPARKS[damageType] ?? "motes",
      art: Boolean(sd.picture || sd.card),
      // A cantrip is never spent; a spell is when no slot of its level or higher is left.
      spent: level > 0 && slot === null,
      slot,
      pool,
      known: Boolean(spell),
    });
  }
  for (const [key, attack] of Object.entries(data?.attacks ?? {})) {
    if (!attack || typeof attack !== "object" || !attack.name) continue;
    const bonus = num(attack.bonus);
    out.push({
      id: `weapon:${key}`,
      kind: "weapon",
      name: String(attack.name),
      weapon: key,
      level: 0,
      school: "weapon",
      castingtime: "Action",
      range: String(attack.type ?? "") === "ranged" ? "Ranged" : "Melee",
      duration: "",
      concentration: false,
      concentrating: false,
      text: `${bonus >= 0 ? "+" : ""}${bonus} to hit, ${String(attack.damage ?? attack.dice ?? "")}${attack.dmgtype ? ` ${attack.dmgtype}` : ""} damage.`,
      sparks: "sparks",
      art: false,
      spent: false,
      slot: 0,
      pool: null,
      known: true,
      damage: String(attack.damage ?? attack.dice ?? ""),
      bonus,
      weaponKind: weaponKind(String(attack.name), String(attack.type ?? "")),
    });
  }
  out.push(...otherCards(data));
  return out;
}

// What else tables print as cards, from each game's sheet: a d20 character's potions, scrolls,
// wands and kits (used through the Supplies) and class features; Cairn's spellbooks, scrolls and
// relics; Ironsworn's and Starforged's assets; Fate's aspects and stunts; Forged in the Dark's
// special abilities. artKey names its picture (src/assets/cards/<artKey>.webp); group, its row.
const rowsOf = (value) => (Array.isArray(value) ? value.map((row, index) => [String(index), row]) : Object.entries(value && typeof value === "object" ? value : {}));
const ITEM_ART = [
  ["potion", /potion|elixir|philter|philtre|draught|tonic|oil of/i],
  ["scroll", /scroll/i],
  ["wand", /\bwand\b|\brod of\b/i],
  ["kit", /\bkit\b|healer|herbalism|antitoxin/i],
];
const FEATURE_ART = [
  ["feature-divine", /divin|smite|lay on hands|turn undead|channel|blessing|aura|holy|sacred|prayer/i],
  ["feature-primal", /wild shape|rage|beast|nature|primal|druid|ranger|favored|companion|totem/i],
  ["feature-skill", /sneak|cunning|expertise|thie|evasion|reliable|uncanny|skill|lucky|trick/i],
];
const ASSET_ART = [
  ["asset-companion", /companion/i],
  ["asset-ritual", /ritual/i],
  ["asset-combat", /combat/i],
  ["asset-starship", /vehicle|ship/i],
  ["asset-module", /module/i],
];
const pick = (table, text, fallback) => table.find(([, pattern]) => pattern.test(text))?.[0] ?? fallback;
const card = (id, kind, name, artKey, group, text, more = {}) => ({
  id,
  kind,
  name,
  level: 0,
  school: kind,
  castingtime: "",
  range: "",
  duration: "",
  concentration: false,
  concentrating: false,
  text: plain(text),
  sparks: "motes",
  art: false,
  spent: false,
  slot: 0,
  pool: null,
  known: true,
  recordId: "",
  weapon: "",
  weaponKind: "",
  artKey,
  group,
  ...more,
});
function otherCards(data) {
  const out = [];
  // Inventory: Cairn's spellbooks, scrolls and relics; any game's potions, scrolls, wands and kits.
  for (const [key, item] of rowsOf(data?.inventorylist)) {
    if (!item || typeof item !== "object" || !item.name) continue;
    const name = String(item.name);
    const words = String(item.text ?? item.note ?? item.description ?? "");
    const count = item.count === undefined ? 1 : num(item.count);
    if (["spellbook", "scroll", "relic"].includes(String(item.kind))) {
      out.push(card(`item:${key}`, "item", name, item.kind === "relic" ? "cairn-relic" : item.kind === "scroll" ? "scroll" : "cairn-spellbook", item.kind === "relic" ? "Relics" : "Spellbooks", words));
      continue;
    }
    const art = pick(ITEM_ART, name, "");
    if (!art || count <= 0 || /\bweapon\b/i.test(String(item.type ?? ""))) continue;
    out.push(card(`item:${key}`, "item", name, art, "Items", words || `${count > 1 ? `${count} of them. ` : ""}Use it from here or drag it onto a creature.`, { item: key, use: true, castingtime: "Use" }));
  }
  // A d20 character's class features (5E's list of names, or rows with their words).
  for (const [key, feature] of rowsOf(data?.features)) {
    const name = String(feature?.name ?? feature ?? "").trim();
    if (!name) continue;
    out.push(card(`feature:${key}`, "feature", name, pick(FEATURE_ART, name, "feature-martial"), "Features", String(feature?.text ?? feature?.description ?? "")));
  }
  // Ironsworn's and Starforged's assets, by their category.
  for (const [key, asset] of rowsOf(data?.assets)) {
    if (!asset?.name) continue;
    const category = String(asset.category ?? "");
    out.push(card(`asset:${key}`, "asset", String(asset.name), pick(ASSET_ART, category, "asset-path"), "Assets", String(asset.text ?? asset.description ?? category), { castingtime: category }));
  }
  // Fate's aspects (the high concept, the trouble, the rest) and stunts.
  const aspects = data?.aspects && typeof data.aspects === "object" && !Array.isArray(data.aspects) ? data.aspects : {};
  for (const [key, value] of Object.entries(aspects)) {
    const name = String(value && typeof value === "object" ? value.name ?? "" : value ?? "").trim();
    if (!name || !data?.stunts) continue;
    const role = key === "high" || key === "highconcept" ? "High concept" : key === "trouble" ? "Trouble" : "Aspect";
    out.push(card(`aspect:${key}`, "aspect", name, "fate-aspect", "Aspects", `${role}: invoke it for +2 or a reroll (a fate point), or be compelled by it for one.`, { castingtime: role }));
  }
  for (const [key, stunt] of rowsOf(data?.stunts)) {
    const name = String(stunt?.name ?? stunt ?? "").trim();
    if (name) out.push(card(`stunt:${key}`, "stunt", name, "fate-stunt", "Stunts", String(stunt?.text ?? "")));
  }
  // Forged in the Dark's special abilities.
  for (const [key, ability] of rowsOf(data?.abilities)) {
    const name = String(ability?.name ?? "").trim();
    if (name && data?.playbook !== undefined) out.push(card(`ability:${key}`, "ability", name, "forged-ability", "Special abilities", String(ability?.text ?? "")));
  }
  return out;
}

// The kind of weapon a card's picture shows, from its name (the pictures are
// src/assets/cards/<kind>.webp): a ranged weapon with no better match is a bow.
/** @type {[string, RegExp][]} */
const WEAPON_KINDS = [
  // Whole words: a blowgun is not a gun, an elbow not a bow, a moonstone dagger not a sling stone.
  // Science fiction first: a grenade, a heavy weapon (plasma, a launcher, a cannon), an energy weapon (a laser, a blaster).
  ["grenade", /grenade|\bbombs?\b|explosive|satchel charge/],
  ["heavy", /plasma|launcher|cannon|gauss|fusion|heavy (?:rifle|gun|weapon)|flamer|flamethrower/],
  ["energy", /laser|blaster|\bray ?guns?\b|beam|stunner|needler|\bion\b|disruptor|phaser/],
  ["firearm", /pistol|rifle|carbine|\b(?:hand|shot|machine|stun|rail|needle)?guns?\b|revolver|musket/],
  ["crossbow", /crossbow/],
  ["bow", /\b(?:long|short|great|war|hand)?bows?\b/],
  // A blowgun is a simple ranged weapon: a sling's picture, not a firearm's.
  ["sling", /\bslings?\b|\bdarts?\b|\bblowguns?\b|\bblowpipes?\b|\bsling ?stones?\b/],
  ["axe", /axe|hatchet/],
  ["hammer", /hammer|mace|maul|morning ?star|flail|club|cudgel/],
  ["spear", /spear|javelin|trident|pike|halberd|glaive|lance|polearm|partisan/],
  ["staff", /staff|quarterstaff|rod|cane/],
  ["fist", /unarmed|fist|punch|claw|bite|gauntlet|knuckle/],
  ["blade", /sword|dagger|knife|rapier|scimitar|sabre|saber|blade|sickle|cutlass|machete|katana|dirk/],
];
export function weaponKind(name, type = "") {
  const text = name.toLowerCase();
  for (const [kind, pattern] of WEAPON_KINDS) if (pattern.test(text)) return kind;
  return type === "ranged" ? "bow" : "blade";
}

// A long rest's change to the sheet: every slot back, concentration dropped.
export function restChanges(data) {
  const changes = Object.entries(data?.slots ?? {})
    .filter(([, slot]) => num(slot?.used) > 0)
    .map(([key]) => ({ path: `slots.${key}.used`, value: 0 }));
  if (data?.concentration) changes.push({ path: "concentration", value: "" });
  return changes;
}
