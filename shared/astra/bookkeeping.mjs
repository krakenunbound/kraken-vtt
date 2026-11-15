// @ts-check
// Apeira Astra: what bookkeeping tracks (shared/bookkeeping): consumables (stims, medikits) and
// lights kept (a hand torch's charge lasts). Its guns carry their own power or rounds (the Crew
// Handbook's kits sell no ammunition to count; a laser pistol's pack is part of it), so shots are
// not counted; its rules carry no load or rest of their own.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: false,
  consumables: {},
  rations: false,
  light: { torch: false, flashlight: { item: "flashlight|\\btorch\\b|hand ?light", keep: true }, flare: {}, glowstick: {} },
  encumbrance: false,
  rest: false,
};
