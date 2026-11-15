// @ts-check
// D&D 3.5E: spells read from their Effect, Area, Save and words (Reflex half, Will negates; damage per caster level with its maximum); Fortitude, Reflex and Will against 10 + spell level + the casting modifier; rounds of 6 seconds; a torch burns an hour, a lantern's pint of oil 6 hours (PHB).
// What this game declares for targeting, actions and effects (docs/targeting-actions-design.md 4.1):
// kept beside its manifest while core-UI stage 3 edits the manifests; the registry attaches it as manifest.actions.

/** @type {import("../rulesets/types").ActionsSpec} */
export default {
  spells: "text",
  game: "35e",
  saves: {
    dc: "spell"
  },
  damageTypes: true,
  roundSeconds: 6,
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
    lantern: 360,
    candle: 60,
    lamp: 360,
    "light-spell": 100,
    daylight: 100,
    "faerie-fire": 10
  }
};
