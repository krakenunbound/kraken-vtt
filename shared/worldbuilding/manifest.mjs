// @ts-check
// Worldbuilding: no game rules. Its blank characters use the C&C sheet until
// the core's own (inherit) sheet exists (docs/core-ui-design.md, decision 7).
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "worldbuilding",
  names: ["Worldbuilding"],
  blurb: "No game rules: maps, tokens, chat and dice for any system.",
  engine: null,
  host: { module: null },
  sheet: "cnc.sheet",
  wizard: "cnc.wizard",
  blank: true,
  features: [],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
};
