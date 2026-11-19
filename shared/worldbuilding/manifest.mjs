// @ts-check
// Worldbuilding: no game rules. Its blank characters use the C&C sheet until
// the core's own (inherit) sheet exists (docs/core-ui-design.md, decision 7).
import cnc from "../cnc/manifest.mjs";
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "worldbuilding",
  names: ["Worldbuilding"],
  blurb: "No game rules: maps, tokens, chat and dice for any system.",
  engine: null,
  host: { module: null },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["plus2", "minus2"] } },
  sheet: cnc.sheet,
  edit: cnc.edit,
  wizard: "cnc.wizard",
  blank: true,
  features: [],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
};
