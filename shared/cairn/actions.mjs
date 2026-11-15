// @ts-check
// Cairn: no spells to roll (spellbooks are read aloud; the Warden rules); targeting, templates by hand, conditions and lights. A torch lasts an hour.
// What this game declares for targeting, actions and effects (docs/targeting-actions-design.md 4.1):
// kept beside its manifest while core-UI stage 3 edits the manifests; the registry attaches it as manifest.actions.

/** @type {import("../rulesets/types").ActionsSpec} */
export default {
  spells: "none",
  saves: {
    dc: "none"
  },
  damageTypes: false,
  roundSeconds: 10,
  friendlyFire: true,
  conditions: [
    "unconscious",
    "dying",
    "poisoned",
    "burning",
    "frozen",
    "petrified",
    "frightened",
    "stunned",
    "paralyzed",
    "charmed",
    "blinded",
    "deafened",
    "invisible",
    "prone",
    "restrained",
    "grappled",
    "entangled",
    "exhaustion",
    "surprised",
    "confused",
    "asleep",
    "bleeding",
    "cursed"
  ],
  lights: [
    "torch",
    "lantern",
    "candle",
    "lamp",
    "glowing-weapon"
  ],
  burn: {
    torch: 60,
    lantern: 240,
    candle: 60,
    lamp: 240
  }
};
