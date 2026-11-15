// @ts-check
// The modifier stack's keys (FG's modifier window buttons: ADV, DIS, +2, -2,
// and each ruleset's own: 5E's cover and its damage keys). A manifest lists
// the ones its game shows (`dice.modifiers.presets`), by id from this list or
// as its own object. Read by the host (which applies them) and the chat bar
// (which shows them). Kraken's own code, written from how FG's keys act at
// the table: a key is used once, by the next roll that reads it; numbers on
// the stack go to every roll one action makes, then the stack clears.
//
// A key's fields:
//   die     "adv" | "dis": one more of the roll's first die, the highest (or
//           lowest) kept (1d20 -> 2d20kh1, 2d6 -> 3d6kh2); ADV and DIS cancel.
//   add     a number added to the roll.
//   on      the kinds of roll that read it (attack, damage, heal, check, save,
//           init, roll); none: every kind but damage and healing for a die
//           key, every kind for a number.
//   damage  "crit" (the dice doubled), "max" (every die its highest), "half"
//           (the total halved, rounded down): damage rolls only.
//   group   keys of one group exclude each other (cover, superior cover).

/** @typedef {{ id: string; label: string; tip: string; die?: "adv" | "dis"; add?: number; on?: string[]; damage?: "crit" | "max" | "half"; group?: string }} ModifierKey */

/** @type {Record<string, ModifierKey>} */
export const KEYS = {
  adv: { id: "adv", label: "ADV", tip: "Advantage: the next d20 roll rolls two and keeps the higher", die: "adv" },
  dis: { id: "dis", label: "DIS", tip: "Disadvantage: the next d20 roll rolls two and keeps the lower", die: "dis" },
  boon: { id: "boon", label: "Boon", tip: "Boon: the next roll adds a die and keeps the highest two", die: "adv" },
  bane: { id: "bane", label: "Bane", tip: "Bane: the next roll adds a die and keeps the lowest two", die: "dis" },
  plus1: { id: "plus1", label: "+1", tip: "+1 on the next roll", add: 1 },
  plus2: { id: "plus2", label: "+2", tip: "+2 on the next roll", add: 2 },
  minus2: { id: "minus2", label: "-2", tip: "-2 on the next roll", add: -2 },
  opp: { id: "opp", label: "Opp", tip: "An opportunity attack: the next attack is marked so", on: ["attack"] },
  cover: { id: "cover", label: "Cover", tip: "The target has half cover: -2 on the next attack", add: -2, on: ["attack"], group: "cover" },
  scover: { id: "scover", label: "S. cover", tip: "The target has three-quarters cover: -5 on the next attack", add: -5, on: ["attack"], group: "cover" },
  crit: { id: "crit", label: "Crit", tip: "The next damage roll is a critical: its dice doubled", damage: "crit", on: ["damage"] },
  max: { id: "max", label: "Max", tip: "The next damage roll does its most: every die at its highest", damage: "max", on: ["damage", "heal"] },
  half: { id: "half", label: "Half", tip: "The next damage roll is halved (rounded down)", damage: "half", on: ["damage"] },
};

// Most games: the two numbers. A game with a die key or its own lists them.
export const DEFAULT_PRESETS = ["plus2", "minus2"];

/**
 * The keys a game shows, its own objects read as they are.
 * @param {{ dice?: { modifiers?: false | { presets?: (string | ModifierKey)[] } } } | null | undefined} manifest
 * @returns {ModifierKey[]}
 */
export function keysFor(manifest) {
  const spec = manifest?.dice?.modifiers;
  if (spec === false) return [];
  const list = spec?.presets ?? DEFAULT_PRESETS;
  return list.map((item) => (typeof item === "string" ? KEYS[item] : item)).filter((item) => item && typeof item.id === "string");
}

/**
 * Whether the game has a modifier stack at all, and the kinds of roll it reads.
 * @param {{ dice?: { modifiers?: false | { kinds?: string[] } } } | null | undefined} manifest
 */
export function stackFor(manifest) {
  const spec = manifest?.dice?.modifiers;
  if (spec === false) return { on: false, kinds: [] };
  return { on: true, kinds: spec?.kinds ?? null };
}
