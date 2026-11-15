// @ts-check
// Fate Core and Accelerated: no spells; conditions as visible aspects, every light.
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
  lights: [
    "torch",
    "lantern",
    "candle",
    "lamp",
    "light-spell",
    "flashlight",
    "headlamp",
    "glowstick",
    "flare"
  ]
};
