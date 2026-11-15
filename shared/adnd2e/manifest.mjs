// @ts-check
// AD&D 2E, from the GM's 2E books.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "adnd2e",
  names: ["AD&D 2E"],
  blurb: "Second Edition with your 2E books: THAC0 and descending Armor Class, the five saving throws, d10 initiative lowest first, thief skills, multi-classing, your books' pregenerated characters.",
  engine: "shared/adnd2e/rules.mjs",
  host: { module: "electron/adnd2e.cjs" },
  sheet: "adnd2e.sheet",
  wizard: "adnd2e.wizard",
  blank: false,
  features: ["turnUndead", "multiAttack", "dying.save", "thiefSkills", "spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
  tracker: { saves: { keys: ["paralyzation", "rod", "petrification", "breath", "spell"], modLabel: "Mod", modAria: "Save modifier", button: "Roll save" } },
  settings: [{ component: "adnd2e.wizardSetting", gm: true }],
  calendar: "greyhawk",
};
