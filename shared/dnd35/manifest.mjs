// @ts-check
// D&D 3.5E, from the GM's 3.5E books.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "dnd35",
  names: ["D&D 3.5E"],
  blurb: "Played from your 3.5E books (the Player's Handbook, Dungeon Master's Guide and Monster Manual): 3.5E sheets and character building, base attack and iterative attacks, criticals by threat and confirmation, Fortitude, Reflex and Will, skills by ranks.",
  engine: "shared/dnd35/rules.mjs",
  host: { module: "electron/dnd35.cjs" },
  records: { race: { label: "Races" } },
  sheet: "dnd35.sheet",
  wizard: "dnd35.wizard",
  blank: false,
  features: ["spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
  tracker: { saves: { keys: ["fortitude", "reflex", "will"], modLabel: "DC", modAria: "Save DC", button: "Roll save" } },
  settings: [{ component: "dnd35.wizardSetting", gm: true }],
  calendar: "greyhawk",
};
