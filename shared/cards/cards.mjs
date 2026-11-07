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
  for (const name of Array.isArray(data?.spells) ? data.spells.map(String) : []) {
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
    });
  }
  return out;
}

// A long rest's change to the sheet: every slot back, concentration dropped.
export function restChanges(data) {
  const changes = Object.entries(data?.slots ?? {})
    .filter(([, slot]) => num(slot?.used) > 0)
    .map(([key]) => ({ path: `slots.${key}.used`, value: 0 }));
  if (data?.concentration) changes.push({ path: "concentration", value: "" });
  return changes;
}
