// @ts-check
// AD&D 2E (and OSRIC): FG 2E spell actions (save vs. spell, damage per caster level), else the words; the five saves; rounds of a minute; a torch burns an hour (six turns), a lantern's flask of oil 24 hours of burning in the PHB's table (kept at 4 hours here, the common house rule, change it below).
// What this game declares for targeting, actions and effects (docs/targeting-actions-design.md 4.1):
// kept beside its manifest while core-UI stage 3 edits the manifests; the registry attaches it as manifest.actions.

/** @type {import("../rulesets/types").ActionsSpec} */
export default {
  spells: "fg2e",
  game: "2e",
  saves: {
    dc: "none"
  },
  damageTypes: false,
  roundSeconds: 60,
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
    "light-spell": 60,
    "faerie-fire": 4
  }
};
