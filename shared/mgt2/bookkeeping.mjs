// @ts-check
// Traveller (Mongoose 2E): what bookkeeping tracks (shared/bookkeeping). A firearm's magazine
// (its rounds counted down, a spare magazine loaded when it runs dry); medikits and drugs used
// up; a hand torch kept (its batteries last); the load in kilograms against STR + END (more is
// encumbered: DM-1 on physical checks and attacks, double is too much); natural healing a day's
// rest, 1D + END's DM.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

const LIMIT = { sum: [{ stat: "characteristics.str.score" }, { stat: "characteristics.end.score" }] };

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0, low: 3 },
  consumables: {},
  rations: false,
  light: { torch: false, flashlight: { item: "flashlight|\\btorch\\b|hand ?light", keep: true }, flare: {}, glowstick: {} },
  encumbrance: {
    mode: "weight",
    unit: "kg",
    coins: 0,
    max: { ...LIMIT, times: 2 },
    levels: [
      { id: "fine", label: "Unencumbered", upTo: LIMIT },
      { id: "encumbered", label: "Encumbered", upTo: { ...LIMIT, times: 2 }, tone: "warn", effect: "ATK: -1; CHECK: -1", text: "Over STR + END kg: DM-1 to physical checks and attacks." },
      { id: "over", label: "Overloaded", tone: "bad", effect: "ATK: -2; CHECK: -2", text: "Over twice STR + END kg: too much to carry far." },
    ],
  },
  rest: {
    long: { hours: 24, hp: { dice: "1d6", mod: "characteristics.end.dm" } },
  },
};
