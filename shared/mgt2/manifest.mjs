// @ts-check
// Mongoose Traveller 2nd Edition: Kraken's own rules code; the GM's books add content.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "mgt2",
  names: ["Traveller"],
  blurb: "Mongoose Traveller 2nd Edition: the UPP's six characteristics, skills and specialities, 2d6 tasks with Effect, Boon and Bane, careers and terms, damage to Endurance, Strength and Dexterity, armour and AP. Its rules are Kraken's own code; your Traveller books add their content.",
  engine: "shared/mgt2/rules.mjs",
  host: { module: "electron/mgt2.cjs", message: "mgt2-life", tool: "kraken_traveller_lifepath" },
  records: { item: { label: "Equipment" }, npc: { label: "NPCs and Animals", statblock: "mgt2.npcBlock" } },
  sheet: "mgt2.sheet",
  wizard: "mgt2.wizard",
  blank: false,
  features: ["starships", "careers"],
  party: { currency: ["MCr", "Cr"], xp: "xp" },
  tracker: { saves: { keys: ["str", "dex", "end", "int", "edu", "soc"], modLabel: "DM", modAria: "Check DM", button: "Roll check" } },
  windows: [{ kind: "ships", label: "Starships", icon: "ship", title: "Starships", feature: "starships" }],
  calendar: "imperial",
};
