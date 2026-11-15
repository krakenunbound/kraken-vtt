// @ts-check
// Fate Core and, as its variant, Fate Accelerated (approaches for skills).
const APPROACHES = ["careful", "clever", "flashy", "forceful", "quick", "sneaky"];

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "fate",
  names: ["Fate Core", "Fate Accelerated"],
  blurb: "Fate Core System (Evil Hat, CC BY 3.0): four Fate dice and the ladder, aspects invoked and compelled with fate points, a pyramid of skills, stunts, stress and consequences, conflicts in shifts. Its book, the Toolkit and Adversaries and a starter scenario come with Kraken.",
  engine: "shared/fate/rules.mjs",
  host: { module: "electron/fate.cjs", message: "fate", tool: "kraken_fate" },
  records: { fateskill: { label: "Skills" }, fatestunt: { label: "Stunts" }, npc: { label: "NPCs" }, pregencharsheet: { label: "Pregenerated Characters" } },
  sheet: "fate.sheet",
  wizard: "fate.wizard",
  blank: false,
  features: ["fatePoints", "stressConsequences", "sceneAspects"],
  party: { currency: [], xp: "milestone", groupCheck: { stats: ["Athletics", "Notice", "Will", "Physique", "Stealth", "Investigate", "Lore", "Rapport"] } },
  tracker: { saves: { keys: ["Athletics", "Fight", "Notice", "Physique", "Provoke", "Shoot", "Stealth", "Will"], modLabel: "CL", modAria: "Save CL", button: "Roll save" } },
  dice: { extraTray: ["dF"] },
  strips: ["fate.sceneAspects"],
  variants: {
    "Fate Accelerated": {
      blurb: "Fate Accelerated Edition (Evil Hat, CC BY 3.0): Fate with six approaches (Careful, Clever, Flashy, Forceful, Quick, Sneaky) instead of skills, three stress boxes, a character in minutes. Its book, the Toolkit and Adversaries and a starter scenario come with Kraken.",
      records: { fateskill: { label: "Approaches" } },
      party: { currency: [], xp: "milestone", groupCheck: { stats: APPROACHES } },
      tracker: { saves: { keys: APPROACHES, modLabel: "CL", modAria: "Save CL", button: "Roll save" } },
    },
  },
};
