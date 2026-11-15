// @ts-check
// Ironsworn and Starforged: no spells; conditions (as harm and debilities read at the table) and lights for the Ironlands and the Forge.
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
    "entangled",
    "exhaustion",
    "bleeding",
    "sickened",
    "cursed",
    "confused",
    "surprised"
  ],
  lights: [
    "torch",
    "lantern",
    "candle",
    "flashlight",
    "headlamp",
    "glowstick",
    "flare"
  ]
};
