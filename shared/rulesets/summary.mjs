// @ts-check
// What any game's records say about themselves, read the way its manifest declares it (as FG's CoreRPG reads a
// ruleset's data): a character's classes, and the classes that cast a spell. Nothing here knows a game; a ruleset
// formatted for Maelstrom says where its data is (manifest.classes, manifest.spells.casters).

/** @param {unknown} value @returns {string} */
const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));
/** @param {unknown} node @returns {any[]} */
const rowsOf = (node) => (node && typeof node === "object" ? Object.values(node).filter((row) => row && typeof row === "object") : []);
/** @param {any} data @param {unknown} path @returns {any} */
const at = (data, path) => String(path ?? "").split(".").filter(Boolean).reduce((node, key) => (node && typeof node === "object" ? node[key] : undefined), data);

/**
 * A character's classes, as its game's manifest declares them:
 * - { rows, name?, level?, where? }: a list of rows (FG's classes; C&C's packages, where packagetype is class);
 * - { field, level? }: one class in a field, its level in another.
 * @param {any} manifest @param {any} data @returns {{ name: string, level: number }[]}
 */
export function characterClasses(manifest, data) {
  const spec = manifest?.classes;
  if (!spec || !data || typeof data !== "object") return [];
  if (spec.rows) {
    const where = spec.where ?? {};
    return rowsOf(at(data, spec.rows))
      .filter((row) => Object.entries(where).every(([key, value]) => text(row[key]).toLowerCase() === text(value).toLowerCase()))
      .map((row) => ({ name: text(row[spec.name ?? "name"]).trim(), level: Number(row[spec.level ?? "level"]) || 1 }))
      .filter((row) => row.name);
  }
  if (spec.field) {
    const name = text(at(data, spec.field)).trim();
    return name ? [{ name, level: Number(at(data, spec.level ?? "level")) || 1 }] : [];
  }
  return [];
}
/** The classes as a line ("Fighter 3 / Mage 2"). @param {any} manifest @param {any} data */
export const classLine = (manifest, data) => characterClasses(manifest, data).map((row) => `${row.name} ${row.level}`).join(" / ");

/** @param {string} word */
const titled = (word) => word.trim().replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
/**
 * The classes that cast a spell, as its game's manifest declares (manifest.spells.casters):
 * { field, split?: a list of class names in the field ("Wizard, Sorcerer");
 *   levels?: class names with levels in the field ("Sor/Wiz 2, Clr 3"), abbreviations?: { sor: "Sorcerer" };
 *   traditions?: { Arcane: "a pattern of the classes that cast them", Divine: "..." }: the field names a tradition }.
 * @param {any} manifest @param {{ type?: string, data?: any }} record @returns {string[]}
 */
export function spellCasters(manifest, record) {
  const spec = manifest?.spells?.casters;
  if (!spec?.field) return [];
  const value = text(at(record?.data ?? {}, spec.field));
  const out = new Set();
  if (spec.traditions) {
    for (const name of Object.keys(spec.traditions)) if (new RegExp(`\\b${name}\\b`, "i").test(value)) out.add(name);
  } else if (spec.levels) {
    for (const part of value.split(",")) {
      const names = part.replace(/\d+/g, "").trim();
      for (const name of names.split("/")) {
        const key = name.trim().toLowerCase();
        if (key && /[a-z]/.test(key)) out.add(spec.abbreviations?.[key] ?? titled(name));
      }
    }
  } else {
    for (const part of value.split(spec.split ? new RegExp(spec.split) : /[,;/]/)) {
      const word = part.replace(/\d+/g, "").trim();
      if (word && /[a-z]/i.test(word)) out.add(titled(word));
    }
  }
  return [...out];
}
/**
 * Whether a class (Mage, Fighter 3, Cleric/Thief) casts a spell: among its casters, or of a tradition that does.
 * @param {any} manifest @param {string} className @param {{ type?: string, data?: any }} record
 */
export function castsSpell(manifest, className, record) {
  const name = text(className).replace(/\d+/g, "").trim().toLowerCase();
  if (!name) return false;
  const traditions = manifest?.spells?.casters?.traditions ?? null;
  return spellCasters(manifest, record).some((caster) => {
    if (traditions?.[caster]) return new RegExp(traditions[caster], "i").test(name);
    const lower = caster.toLowerCase();
    return name === lower || name.includes(lower) || lower.includes(name);
  });
}
