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
  tracker: {
    saves: { keys: ["paralyzation", "rod", "petrification", "breath", "spell"], modLabel: "Mod", modAria: "Save modifier", button: "Roll save" },
    rowActions: [
      // Binding the wounds stops the dying's bleeding.
      { hook: "stabilize", label: "Bind wounds", title: "Bind their wounds: unconscious, no longer losing a hit point each round", when: { all: [{ status: "Dying" }, { any: [{ gm: true }, { viewerHasCharacter: true }] }] }, call: { ct: "stabilize", with: "viewer" } },
      // A cleric (a paladin from 3rd level) turns the undead it targets, or every undead foe.
      { hook: "turn-undead", label: "Turn undead", title: "Turn undead as a level {turns} cleric: target the undead first, or every undead foe is tried", when: { all: [{ has: "turns" }, { gmOrMine: true }, { activeTurn: true }] }, call: { ct: "turn-undead", with: "record" } },
    ],
  },
  settings: [{ component: "adnd2e.wizardSetting", gm: true }],
  calendar: "greyhawk",
};
