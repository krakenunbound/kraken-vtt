// @ts-check
// Forged in the Dark: no spells; conditions and Doskvol's lights (lamps, lanterns, candles, flares).
// What this game declares for targeting, actions and effects (docs/targeting-actions-design.md 4.1):
// kept beside its manifest while core-UI stage 3 edits the manifests; the registry attaches it as manifest.actions.

/** @type {import("../rulesets/types").ActionsSpec} */
export default {
  spells: "none",
  saves: {
    dc: "none"
  },
  damageTypes: false,
  roundSeconds: 6,
  friendlyFire: true,
  conditions: [
    "unconscious",
    "dying",
    "poisoned",
    "burning",
    "frozen",
    "frightened",
    "stunned",
    "blinded",
    "deafened",
    "prone",
    "restrained",
    "grappled",
    "bleeding",
    "sickened",
    "exhaustion",
    "surprised",
    "confused",
    "incapacitated"
  ],
  lights: [
    "lantern",
    "lamp",
    "candle",
    "torch",
    "flare"
  ]
};
