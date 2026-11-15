// @ts-check
// Ironsworn and Starforged: what bookkeeping tracks (shared/bookkeeping): nothing counted. Supply
// is a track the moves mark (Resupply, Make Camp), not a count of rations or arrows, and there is
// no load to carry.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default { ammo: false, consumables: false, rations: false, light: false, encumbrance: false, rest: false };
