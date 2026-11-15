// @ts-check
// Apeira Astra, Kraken's science fiction: its books ship with Kraken.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "astra",
  names: ["Apeira Astra"],
  blurb: "Kraken's science fiction: 2d6 and skills, Paths to make a crew in minutes, armour that soaks. Its books and a first adventure come with Kraken.",
  engine: "shared/astra/rules.mjs",
  host: { module: "electron/astra.cjs", message: "character-improve", tool: "kraken_character_improve" },
  records: { race: { label: "Origins" }, class: { label: "Paths" }, item: { label: "Gear" }, npc: { label: "Threats" } },
  sheet: "astra.sheet",
  wizard: "astra.wizard",
  blank: false,
  features: ["starships"],
  party: { currency: ["Cr"], xp: "xp" },
  tracker: { saves: { keys: ["brawn", "reflex", "grit", "intellect", "training", "presence"], modLabel: "DM", modAria: "Check DM", button: "Roll check" } },
  windows: [{ kind: "ships", label: "Starships", icon: "ship", title: "Starships", feature: "starships" }],
  calendar: "astra",
};
