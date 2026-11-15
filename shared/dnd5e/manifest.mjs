// @ts-check
// D&D 5E and, as its variant, Descending Darkness (one sheet, as FG plays
// Descending Darkness on the 5E ruleset). Its sheet is the core's parts
// (docs/core-ui-design.md, migration step 6): the manifest lists its tabs
// (Main, Skills, Combat, Spells, Inventory, Notes) and arranges the core's
// strip, stat block, derived boxes, skills, lists, coins and notes on them;
// its own parts are the Spells page, Dread, bleeding out and death saves
// (src/rulesets/dnd5e.tsx). The variant changes the words ({@species}: Kin,
// {@ac}: Defense, {@hp}: Health), its features and its maximum level. The
// host's edit whitelist (electron/dnd5e.cjs) is built from `edit` below.
import { SKILLS, STATS } from "./rules.mjs";

const SIX = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const titled = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);
// A roll with the strip's DC (advantage is the chat bar's ADV and DIS keys, the modifier stack).
/** @param {"save" | "check" | "skill"} roll @param {Record<string, unknown>} [more] */
const roll = (roll, more = {}) => ({ roll, dc: "dc", ...more });
/** @type {Record<string, string[]>} */
const SKILL_LIST = SKILLS;

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "dnd5e",
  names: ["D&D 5E", "Descending Darkness"],
  blurb: "Played from your 5E books (the rulebooks you own, or the free SRD): 5E sheets and character building, d20 combat with criticals, saves, spells and death saves.",
  engine: "shared/dnd5e/rules.mjs",
  host: { module: "electron/dnd5e.cjs" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["adv", "dis", "plus2", "minus2", "opp", "cover", "scover", "crit", "max", "half"] } },
  // The sheet's words ({@word}) and its highest level.
  labels: { species: "Species", speciesLower: "species", ac: "AC", acLong: "Armor Class", hp: "Hit Points", hpLower: "hit points", maxLevel: "20" },
  sheet: {
    level: "arrange",
    className: "sheet-5e",
    art: ["race", "species"],
    header: {
      identity: [
        { path: "species", label: "{@species}" },
        { path: "className", label: "Class", hook: "class", format: "dnd5e.className" },
        { path: "background", label: "Background" },
      ],
    },
    top: [
      {
        part: "strip",
        items: [
          { kind: "level", path: "level", exp: "exp", next: "expnext", max: "{@maxLevel}", title: "Level up: the host rolls the hit die" },
          { kind: "xp", path: "exp", next: "expnext", label: "Experience" },
          { kind: "value", label: "Prof", path: "prof", hook: "prof", title: "Proficiency bonus", format: "signed" },
          { kind: "modifier", key: "dc", label: "DC", aria: "Difficulty class", title: "The DC a check or save is rolled against (0: none)", min: 0, max: 40 },
        ],
      },
    ],
    tabs: [
      {
        id: "main",
        parts: [
          {
            part: "row",
            className: "cc-main-grid five-main",
            parts: [
              {
                part: "statBlock",
                label: "Abilities",
                hook: "ability",
                plain: true,
                rows: STATS.map((key) => ({ key, label: titled(key) })),
                columns: [
                  { label: "Score", path: "abilities.{key}.score", field: { kind: "number", label: "{key} score" } },
                  { label: "Check", roll: { action: roll("check"), hook: "roll-check", label: "{abilities.{key}.bonus|signed}", title: "Roll a {key} check", aria: "{key} check" } },
                  { label: "Prof", path: "abilities.{key}.saveprof", field: { kind: "check", label: "{key} save proficiency", title: "Proficient in this saving throw" } },
                  { label: "Save", roll: { action: roll("save", { fight: true }), hook: "roll-save", className: "cc-save", label: "{abilities.{key}.save|signed}", title: "Roll a {key} saving throw", aria: "{key} save" } },
                ],
              },
              {
                part: "derived",
                boxes: [
                  { label: "{@ac}", show: "shield", path: "ac.total", hook: "ac", title: "{@acLong}[: {ac.armor}][ and a shield{?ac.shield}]" },
                  {
                    label: "{@hp}",
                    show: "remaining",
                    path: "hp.total",
                    minus: "hp.wounds",
                    hook: "hp",
                    danger: true,
                    lines: [{ items: [{ before: "Wounds", field: { path: "hp.wounds", kind: "number", label: "Wounds" } }] }, { items: [{ before: "Temp", field: { path: "hp.temp", kind: "number", label: "Temporary {@hpLower}" } }] }],
                  },
                  { label: "Initiative", show: "value", path: "initiative.total", hook: "init", format: "signed" },
                  { label: "Speed", show: "text", path: "speed", text: "{speed}" },
                  { label: "Passive Perception", show: "value", path: "passive", hook: "passive" },
                  // Descending Darkness's Dread, its bleeding out at 0 Health; 5E's death saves.
                  { custom: "dnd5e.dread", when: { feature: "dread" } },
                  { custom: "dnd5e.dying", when: { all: [{ feature: "dying.bleed" }, { zero: { path: "hp.total", minus: "hp.wounds" } }] } },
                  { custom: "dnd5e.deathSaves", when: { all: [{ feature: "deathSaves" }, { zero: { path: "hp.total", minus: "hp.wounds" } }] } },
                ],
                hint: "{senses}",
              },
            ],
          },
        ],
      },
      {
        id: "skills",
        page: "panel",
        pageClass: "cc-panel five-skills cc-page",
        parts: [
          {
            part: "skills",
            path: "skills",
            hook: "skill",
            rows: Object.entries(SKILL_LIST).map(([key, [label, stat]]) => ({ key, label, note: stat.slice(0, 3).toUpperCase() })),
            field: { path: "prof", kind: "select", number: true, label: "{label} proficiency", title: "Proficiency: none, proficient, expertise", options: [{ value: "0", label: "–" }, { value: "1", label: "●" }, { value: "2", label: "◆" }] },
            roll: { action: roll("skill", { keyAs: "skill" }), hook: "roll-skill", label: "{total|signed}", aria: "Roll {label}", send: "{label}" },
          },
        ],
      },
      {
        id: "combat",
        page: "panel",
        parts: [
          { part: "heading", text: ["Attacks "], targets: true },
          {
            part: "list",
            path: "attacks",
            hook: "attack",
            className: "five-attacks",
            name: { path: "name", bold: true, flat: true },
            rowActions: [
              { hook: "attack", label: "{bonus|signed}", title: "Attack roll", action: { ct: "attack", key: "weapon" } },
              { hook: "damage", label: ["{damage}", " ", "{dmgtype}"], title: "Damage roll", action: { ct: "damage-roll", key: "weapon" } },
            ],
            empty: "No weapon in hand: equip one on the Inventory tab.",
          },
        ],
      },
      { id: "spells", page: "none", parts: [{ part: "custom", component: "dnd5e.spells" }] },
      {
        id: "inventory",
        page: "panel",
        parts: [
          {
            part: "list",
            path: "inventorylist",
            hook: "item",
            // A count or carried of 0 shows as 1, as the hand-made sheet did.
            select: { path: "carried", kind: "select", number: true, label: "{name} carried", title: "Equipped, carried or not carried", options: [{ value: "2", label: "Equipped" }, { value: "1", label: "Carried" }, { value: "0", label: "Not carried" }], default: 1, zeroIsEmpty: true },
            fields: [{ path: "count", kind: "number", label: "{name} count", default: 1, zeroIsEmpty: true }],
            name: { path: "name" },
            details: [{ text: "{subtype}", when: { not: { isNull: "subtype" } } }, { text: "{type}", when: { isNull: "subtype" } }],
            remove: { aria: "Drop {name}", title: "Drop it" },
          },
          { part: "coins", path: "coins", aria: "{name}", upper: true },
        ],
      },
      {
        id: "notes",
        page: "panel",
        parts: [
          { part: "notes", fields: [{ path: "alignment", kind: "text", label: "Alignment" }, { path: "notes", kind: "textarea", label: "Notes" }] },
          // What the character wizard gave: feats, languages, proficiencies, traits and features.
          { part: "tags", label: "Feats", hook: "feats", from: ["feats"] },
          { part: "tags", label: "Languages", hook: "languages", from: ["languages"] },
          { part: "tags", label: "Proficiencies", hook: "proficiencies", from: ["proficiencylist.armor", "proficiencylist.weapons", "proficiencylist.tools"] },
          { part: "tags", label: "{@species} traits", hook: "{@speciesLower} traits", from: ["traits"] },
          { part: "tags", label: "Features", hook: "features", from: ["features"] },
        ],
      },
    ],
  },
  // What the sheet may change (the host's whitelist, electron/dnd5e.cjs): "*" one id-n key, "#" a digit, "%" a word,
  // "(a|b)" either; remove: the lists whose rows the sheet may drop. Death saves, hit dice and concentration are the agent's.
  edit: {
    text: ["playername", "alignment", "appearance", "notes", "senses", "speed", "background", "species", "gender", "age", "height", "weight", "concentration"],
    number: [
      "abilities.(strength|dexterity|constitution|intelligence|wisdom|charisma).(score|saveprof)",
      "skills.%.prof",
      "hp.(wounds|temp)",
      "exp",
      "ac.misc",
      "initiative.misc",
      "slots.l#.used",
      "deathsaves.(success|failure)",
      "hitdice.used",
      "dread",
      "coins.*.amount",
      "inventorylist.*.(count|carried)",
    ],
    remove: ["inventorylist"],
  },
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
      labels: { species: "Kin", speciesLower: "kin", ac: "Defense", acLong: "Defense", hp: "Health", hpLower: "health", maxLevel: "10" },
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
