// @ts-check
// D&D 5E, the SRD 5.2.1 and Descending Darkness: FG 5E spell actions (the words read where a spell has none), six saves against a DC, damage types, rounds of 6 seconds. A torch burns an hour, a lantern's pint of oil 6 hours (PHB).
// What this game declares for targeting, actions and effects (docs/targeting-actions-design.md 4.1):
// kept beside its manifest while core-UI stage 3 edits the manifests; the registry attaches it as manifest.actions.

/** @type {import("../rulesets/types").ActionsSpec} */
export default {
  spells: "fg5e",
  game: "5e",
  saves: {
    dc: "spell"
  },
  damageTypes: true,
  roundSeconds: 6,
  friendlyFire: true,
  buffs: [
    "bless",
    "bane",
    "shield-of-faith",
    "haste",
    "slow",
    "cover-half",
    "cover-three",
    "resist-fire"
  ],
  lights: [
    "torch",
    "lantern",
    "candle",
    "lamp",
    "light-spell",
    "daylight",
    "faerie-fire",
    "glowing-weapon"
  ],
  burn: {
    torch: 60,
    lantern: 360,
    candle: 60,
    lamp: 360,
    "light-spell": 60,
    daylight: 60,
    "faerie-fire": 1
  }
};
