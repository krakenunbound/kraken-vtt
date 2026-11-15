// @ts-check
// D&D 5E and, as its variant, Descending Darkness (one sheet through
// rules.mjs PROFILES, as FG plays Descending Darkness on the 5E ruleset).
const SIX = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "dnd5e",
  names: ["D&D 5E", "Descending Darkness"],
  blurb: "Played from your 5E books (the rulebooks you own, or the free SRD): 5E sheets and character building, d20 combat with criticals, saves, spells and death saves.",
  engine: "shared/dnd5e/rules.mjs",
  host: { module: "electron/dnd5e.cjs" },
  sheet: "dnd5e.sheet",
  wizard: "dnd5e.wizard",
  blank: false,
  features: ["deathSaves", "spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
  tracker: { saves: { keys: SIX, modLabel: "DC", modAria: "Save DC", button: "Roll save" } },
  calendar: "harptos",
  variants: {
    "Descending Darkness": {
      id: "descending",
      blurb: "Kraken's dark fantasy: d20, fragile heroes, light that runs out, dread that builds. Its books and a first adventure come with Kraken.",
      records: { race: { label: "Kin" } },
      features: ["dread", "dying.bleed", "spellbooks"],
      party: { currency: ["GC"], xp: "xp" },
      // Its save box says DC, as 5E's, but kept its old aria-label (the tracker's, before the manifest).
      tracker: { saves: { keys: SIX, modLabel: "DC", modAria: "Save CL", button: "Roll save" } },
      calendar: "waning",
    },
  },
};
