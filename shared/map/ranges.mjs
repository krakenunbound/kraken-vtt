// @ts-check
// How far a creature's weapons and spells reach, read from its record's words
// (a weapon's "Range 150/600", FG's "range (80/320)", a creature's "range 80/320 ft.",
// a spell's "range": "120 feet"), for the range line to a target: within the
// normal range, at long range (disadvantage in 5E), or beyond everything it has.
// Melee alone (no range found) says nothing: a spellcaster's touch spells and a
// fighter's sword are judged at the table.

const PAIR = /\brange\s*:?\s*\(?\s*(\d+)\s*\/\s*(\d+)/gi;
const SPELL = /"range"\s*:\s*"(\d+)\s*(?:feet|foot|ft)/gi;

/**
 * The longest normal range and the longest long range in a record's data, in feet; null if it has none.
 * @param {unknown} data
 * @returns {{ normal: number; long: number } | null}
 */
export function rangesOf(data) {
  const text = JSON.stringify(data ?? {});
  let normal = 0;
  let long = 0;
  for (const match of text.matchAll(PAIR)) {
    normal = Math.max(normal, Number(match[1]));
    long = Math.max(long, Number(match[2]));
  }
  for (const match of text.matchAll(SPELL)) {
    normal = Math.max(normal, Number(match[1]));
    long = Math.max(long, Number(match[1]));
  }
  return long > 0 ? { normal, long: Math.max(long, normal) } : null;
}

/**
 * Where a distance falls for these ranges: "near" (within the normal range), "long", or "out".
 * @param {{ normal: number; long: number } | null} ranges
 * @param {number} distance
 */
export function rangeBand(ranges, distance) {
  if (!ranges) return "near";
  if (distance <= ranges.normal) return "near";
  if (distance <= ranges.long) return "long";
  return "out";
}
