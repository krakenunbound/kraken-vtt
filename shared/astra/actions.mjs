// @ts-check
// Apeira Astra: no spells; conditions and modern lights; rounds of 6 seconds.
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
    "stunned",
    "dazed",
    "prone",
    "blinded",
    "deafened",
    "burning",
    "bleeding",
    "poisoned",
    "sickened",
    "restrained",
    "grappled",
    "frightened",
    "exhaustion",
    "surprised",
    "incapacitated",
    "confused",
    "invisible"
  ],
  lights: [
    "flashlight",
    "headlamp",
    "glowstick",
    "flare",
    "lamp",
    "candle"
  ]
};
