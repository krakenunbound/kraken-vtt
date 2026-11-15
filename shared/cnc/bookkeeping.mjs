// @ts-check
// Castles & Crusades (SiegeCore): what bookkeeping tracks (shared/bookkeeping). Ammunition is
// fired by SiegeCore's own fireAmmunition (readied first, by the unit); bookkeeping keeps the
// fight's tally and the half picked up after it. The load is SiegeCore's (encumbrance values
// against the encumbrance rating, its bands and their move: load.ev, load.er, load.category).
// Natural healing: 1 hit point a day of rest.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0.5, low: 5, engine: "siege" },
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: { match: "waterskin|wineskin", days: 1 },
    penalty: {
      food: { after: 1, kind: "note", text: "goes hungry: the Castle Keeper decides what that costs" },
      water: { after: 0, kind: "note", text: "goes thirsty: the Castle Keeper decides what that costs" },
    },
  },
  light: { torch: {}, lantern: {}, candle: {} },
  encumbrance: {
    mode: "derived",
    unit: "EV",
    label: "Encumbrance",
    used: "load.ev",
    max: "load.er",
    speed: "load.effectivemove",
    levelPath: "load.category",
    levels: [
      { id: "none", label: "Unburdened", upTo: "load.er" },
      { id: "over", label: "Burdened", tone: "warn" },
    ],
    note: "SiegeCore's encumbrance values (EV) against the rating (ER), its bands and moves.",
  },
  rest: {
    long: { hours: 8, hp: 1, rations: true },
  },
};
