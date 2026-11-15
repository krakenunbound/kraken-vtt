// @ts-check
// Traveller (Mongoose 2E): what bookkeeping tracks (shared/bookkeeping). A firearm's magazine
// (its rounds counted down, a spare magazine loaded when it runs dry: "Magazine (spare)" in the
// shop); drugs and anything with uses written on it used up (a medikit is a tool, not used up);
// a hand torch kept (its batteries last); natural healing a day's rest, 1D + END's DM. The load
// is not counted: Kraken's Traveller gear list has no masses yet.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0, low: 3 },
  consumables: {},
  rations: false,
  light: { torch: false, flashlight: { item: "flashlight|\\btorch\\b|hand ?light", keep: true }, flare: {}, glowstick: {} },
  encumbrance: false,
  rest: {
    long: { hours: 24, hp: { dice: "1d6", mod: "characteristics.end.dm" } },
  },
};
