// @ts-check
// Fate Core and Fate Accelerated: what bookkeeping tracks (shared/bookkeeping): nothing counted.
// Fate keeps gear as aspects and stunts, and recovery as stress and consequences.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default { ammo: false, consumables: false, rations: false, light: false, encumbrance: false, rest: false };
