// @ts-check
// Apeira Astra: what bookkeeping tracks (shared/bookkeeping): ammunition (power packs, rounds),
// consumables (stims, medikits), lights kept (a hand torch's charge lasts). Its rules carry no
// load or rest of their own.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0, low: 3 },
  consumables: {},
  rations: false,
  light: { torch: false, flashlight: { item: "flashlight|\\btorch\\b|hand ?light", keep: true }, flare: {}, glowstick: {} },
  encumbrance: false,
  rest: false,
};
