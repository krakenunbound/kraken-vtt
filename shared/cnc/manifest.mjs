// @ts-check
// Castles & Crusades (SiegeCore): the default ruleset. A character with no
// data.ruleset is C&C's (CCSheet), as FG's SC C&C sheet.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "cnc",
  names: ["Castles & Crusades"],
  blurb: "SiegeCore rules: character sheets, the SIEGE engine, combat and spells.",
  engine: "shared/siege/engine.mjs",
  host: { module: "electron/siege.cjs", message: "siege-check", tool: "kraken_siege_check" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["plus2", "minus2"] } },
  sheet: "cnc.sheet",
  wizard: "cnc.wizard",
  blank: true,
  features: ["encumbrance", "spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
  tracker: { saves: { keys: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"], modLabel: "CL", modAria: "Save CL", button: "Roll save" } },
  calendar: "greyhawk",
};
