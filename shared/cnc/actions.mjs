// @ts-check
// Castles & Crusades (SiegeCore): powers on the sheet, saves against the caster level; rounds of 10 seconds; a torch an hour, a lantern 4 hours.
// What this game declares for targeting, actions and effects (docs/targeting-actions-design.md 4.1):
// kept beside its manifest while core-UI stage 3 edits the manifests; the registry attaches it as manifest.actions.

/** @type {import("../rulesets/types").ActionsSpec} */
export default {
  spells: "powers",
  game: "cnc",
  saves: {
    dc: "cl"
  },
  damageTypes: false,
  roundSeconds: 10,
  friendlyFire: true,
  buffs: [
    "morale-bonus",
    "haste",
    "slow",
    "cover-half",
    "cover-three"
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
    lantern: 240,
    candle: 60,
    lamp: 240,
    "light-spell": 60
  }
};
