// @ts-check
// The Basic Fantasy Role-Playing Game, 4th Edition: its books ship with Kraken.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "bfrpg",
  names: ["Basic Fantasy"],
  blurb: "The Basic Fantasy Role-Playing Game, 4th Edition (free, CC BY-SA): old-school play with ascending Armor Class and an attack bonus, 3d6 in order, four races and four classes, the five saving throws, d6 initiative, thief abilities, turning the undead. Its Player's Handbook, Game Master's Guide and a first adventure come with Kraken.",
  engine: "shared/bfrpg/rules.mjs",
  host: { module: "electron/bfrpg.cjs" },
  records: { race: { label: "Races" }, npc: { label: "Monsters" } },
  sheet: "bfrpg.sheet",
  wizard: "bfrpg.wizard",
  blank: false,
  features: ["turnUndead", "morale", "multiAttack", "thiefSkills", "spellbooks", "encumbrance"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
  tracker: {
    saves: { keys: ["death", "wands", "paralysis", "breath", "spells"], modLabel: "Mod", modAria: "Save modifier", button: "Roll save" },
    rowActions: [
      // A Cleric turns the undead it targets (or every undead foe): d20 against the table, 2d6 hit dice affected.
      { hook: "turn-undead", label: "Turn undead", title: "Turn undead as a level {turns} Cleric: target the undead first, or every undead foe is tried", when: { all: [{ has: "turns" }, { gmOrMine: true }, { activeTurn: true }] }, call: { ct: "turn-undead", with: "record" } },
      // A monster's morale check, 2d6 at or under its score.
      { hook: "morale", label: ["Morale ", "{morale}"], title: { if: { atLeast: { path: "morale", value: 12 } }, then: "Morale {morale}: 2d6 at or under it stands (12: never fails)", else: "Morale {morale}: 2d6 at or under it stands" }, when: { all: [{ gm: true }, { has: "morale" }] }, call: { ct: "morale" } },
    ],
  },
  calendar: "gregorian",
};
