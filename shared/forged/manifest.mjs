// @ts-check
// Forged in the Dark (the Blades in the Dark SRD): its books ship with Kraken.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "forged",
  names: ["Forged in the Dark"],
  blurb: "Forged in the Dark, based on Blades in the Dark (John Harper, One Seven Design; its SRD, CC BY 3.0): a crew of scoundrels in the haunted canal city of Brackwater. Twelve actions as d6 pools read by the highest die, position and effect, stress and trauma, harm, progress clocks for all to see, the score and downtime, a crew with its Tier, heat and claims. Its Scoundrel's Handbook, Game Master's Guide and The Brine Street Job come with Kraken.",
  engine: "shared/forged/rules.mjs",
  host: { module: "electron/forged.cjs", message: "forged", tool: "kraken_forged" },
  // No modifier stack: an action roll is a pool of d6 (bonus dice are the roll bar's).
  dice: { modifiers: false },
  records: { item: { label: "Items" }, npc: { label: "Cohorts and People" }, forgedtable: { label: "Tables" } },
  sheet: "forged.sheet",
  wizard: "forged.wizard",
  blank: false,
  features: ["clocks", "crew", "scorePanel", "downtime"],
  combatLabel: "Score",
  tracker: { replace: "forged.scorePanel" },
  // The crew sheet is the party's first tab.
  party: { currency: ["Coin"], xp: "xp", groupCheck: false, tabs: [{ id: "crew", label: "Crew", first: true, feature: "crew" }] },
};
