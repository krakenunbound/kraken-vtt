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
  tracker: {
    saves: { keys: SIX, modLabel: "DC", modAria: "Save DC", button: "Roll save" },
    // A Dying character's death saving throw.
    rowActions: [
      { hook: "death-save", label: ["Death save ", { if: { defined: "deathsaves" }, then: "({deathsaves.success}✓ {deathsaves.failure}✗)", else: "" }], title: "Death saves: {deathsaves.success|0} successes, {deathsaves.failure|0} failures", when: { all: [{ status: "Dying" }, { gmOrMine: true }] }, call: { ct: "death-save" } },
    ],
  },
  calendar: "harptos",
  variants: {
    "Descending Darkness": {
      id: "descending",
      blurb: "Kraken's dark fantasy: d20, fragile heroes, light that runs out, dread that builds. Its books and a first adventure come with Kraken.",
      records: { race: { label: "Kin" } },
      features: ["dread", "dying.bleed", "spellbooks"],
      party: { currency: ["GC"], xp: "xp" },
      // Its save box says DC, as 5E's, but kept its old aria-label (the tracker's, before the manifest).
      tracker: {
        saves: { keys: SIX, modLabel: "DC", modAria: "Save CL", button: "Roll save" },
        // An ally steadies the dying (Wisdom 12); the GM's call without one.
        rowActions: [
          { hook: "stabilize", label: "Steady", title: "Steady them: an ally's Wisdom check against 12 stops the bleeding", when: { all: [{ status: "Dying" }, { any: [{ gm: true }, { viewerHasCharacter: true }] }] }, call: { ct: "stabilize", with: "viewer" } },
        ],
      },
      calendar: "waning",
    },
  },
};
