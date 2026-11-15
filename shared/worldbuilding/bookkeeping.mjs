// @ts-check
// Worldbuilding (the core alone): what bookkeeping tracks (shared/bookkeeping): ammunition fired
// from a stack (half back after a fight), consumables used up, torches and oil, rations and
// water by the day (going without is noted for the GM to rule on), a weight total.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0.5, low: 5 },
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: { match: "waterskin|canteen", days: 1 },
    penalty: { food: { after: 1, kind: "note", text: "goes hungry: the GM rules on it" }, water: { after: 0, kind: "note", text: "goes thirsty: the GM rules on it" } },
  },
  light: { torch: {}, lantern: {}, lamp: {}, candle: {} },
  encumbrance: { mode: "weight", unit: "lb.", coins: 0, levels: [{ id: "load", label: "Carried" }] },
  rest: false,
};
