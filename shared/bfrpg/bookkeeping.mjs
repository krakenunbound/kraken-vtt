// @ts-check
// Basic Fantasy (4th Edition): what bookkeeping tracks (shared/bookkeeping). From the Player's
// Handbook shipped in games/basic-fantasy: the light and heavy loads by Strength and the
// movement they leave (worked out by the rules' derive: load, loads, encumbrance, movement);
// a day's rations and a quart of water; past two days without food 1 hit point a day, a day
// without water 1d4 a day; a torch 1d4+4 turns, a lantern a flask of oil in 18+1d6 turns.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0.5, low: 5 },
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: { match: "waterskin|wineskin", days: 1 },
    penalty: {
      food: { after: 2, kind: "damage", damage: "1", path: "hp.wounds", text: "without food past two days: 1 hit point lost, no natural healing" },
      water: { after: 0, kind: "damage", damage: "1d4", path: "hp.wounds", text: "without water for a day: 1d4 hit points lost" },
    },
  },
  light: { torch: {}, lantern: {}, candle: {} },
  encumbrance: {
    mode: "derived",
    unit: "lb.",
    used: "load",
    speed: "movement",
    levelPath: "encumbrance",
    offFlag: true,
    levels: [
      { id: "light", label: "Lightly loaded", upTo: "loads.light" },
      { id: "heavy", label: "Heavily loaded", upTo: "loads.heavy", tone: "warn", text: "Movement 10' less (counted on the sheet)." },
      { id: "over", label: "Overloaded", tone: "bad", text: "Movement 20' less (counted on the sheet)." },
    ],
    max: "loads.heavy",
  },
  rest: {
    long: { hours: 8, hp: 1, reset: ["spellcasting.used.*"], rations: true },
  },
};
