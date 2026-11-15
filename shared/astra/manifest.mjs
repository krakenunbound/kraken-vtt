// @ts-check
// Apeira Astra, Kraken's science fiction: its books ship with Kraken.
// Its crew sheet is core parts (docs/core-ui-design.md 7.15), in the same arrangement as Traveller's: who they are on
// top (Origin, Paths), the strip (experience, the task's difficulty, a Boon or Bane), then Main (with the Marks),
// Skills, Combat, Gear and Notes. The host works every number out again (shared/astra/rules.mjs).
import { DIFFICULTIES, STAT_NAMES, STATS } from "./rules.mjs";
import { SKILLS as PARTY_SKILLS, STATS as PARTY_STATS, STAT_NAMES as PARTY_STAT_NAMES } from "./rules.mjs";
// The party sheet's group rolls: what the game checks, saves and its skills (D6).

// A task: the strip's difficulty shifts the roll, with its Boon or Bane.
/** @type {import("../rulesets/types").ActionCall} */
const TASK = { roll: "check", bonus: "difficulty", advantage: "boon" };
/** @type {import("../rulesets/types").ActionCall} */
const SKILL_TASK = { roll: "skill", keyAs: "skill", bonus: "difficulty", advantage: "boon" };
const signed = (/** @type {number} */ n) => (n >= 0 ? `+${n}` : `${n}`);

/** @type {import("../rulesets/types").SheetSpec} */
const sheet = {
  level: "arrange",
  className: "sheet-5e sheet-astra",
  header: {
    identity: [
      { path: "origin", label: "Origin" },
      { path: "paths", label: "Paths", hook: "paths", show: "{paths|join: / }" },
    ],
  },
  top: [
    {
      part: "strip",
      items: [
        { kind: "xp", path: "exp", label: "Experience", word: "Experience", edit: "gm" },
        { kind: "choice", key: "difficulty", label: "Task", aria: "Difficulty", title: "How hard the task is: it shifts the roll", number: true, start: 0, options: DIFFICULTIES.map(([name, shift]) => ({ value: String(shift), label: `${name} ${shift ? signed(Number(shift)) : ""}` })) },
        { kind: "choice", key: "boon", aria: "Boon or bane", title: "A Boon rolls 3d6 and keeps the best two; a Bane the worst two", options: [{ value: "", label: "No boon" }, { value: "boon", label: "Boon" }, { value: "bane", label: "Bane" }] },
        { kind: "hint", text: "2d6 + skill + characteristic, 8 or more" },
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
              label: "Characteristics",
              hook: "characteristic",
              className: "astra-stats",
              plain: true,
              rows: STATS.map((key) => ({ key, label: STAT_NAMES[/** @type {keyof typeof STAT_NAMES} */ (key)] })),
              columns: [{ label: "Score", path: "characteristics.{key}.score", field: { label: "{key} score", kind: "number" } }],
              roll: { column: "Mod", action: TASK, label: "{characteristics.{key}.dm|signed}", title: "Roll {key} alone (2d6 + its modifier)", aria: "{key} check", hook: "roll-check" },
            },
            {
              part: "derived",
              boxes: [
                {
                  label: "Stamina",
                  show: "remaining",
                  path: "hp.total",
                  minus: "hp.wounds",
                  hook: "hp",
                  danger: true,
                  fields: [{ path: "hp.wounds", label: "Damage taken", kind: "number", before: "Damage" }],
                  // Down at 0; dead at minus Grit.
                  warn: { when: { zero: { path: "hp.total", minus: "hp.wounds" } }, text: { if: { zero: { path: "hp.total", plus: "characteristics.grit.score", minus: "hp.wounds" } }, then: "Dead", else: "Down: out of the fight; dead at -{characteristics.grit.score|0}" }, attr: { name: "down", value: "true" } },
                },
                { label: "Armour", title: "Armour takes this off every hit[: {ac.armor}]", show: "shield", path: "ac.total", hook: "ac" },
                { label: "Initiative", show: "value", path: "initiative.total", hook: "init", format: "signed" },
              ],
            },
          ],
        },
        { part: "custom", component: "astra.marks" },
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
          sort: "name",
          field: { path: "level", label: "{name} level", kind: "number", edit: "never", locked: "num" },
          note: "{stat|cut:3|upper}",
          more: "astra.trickNotes",
          roll: { action: SKILL_TASK, label: { format: "astra.skillTotal" }, aria: "{name} task", hook: "roll-skill" },
          empty: "No skills yet.",
        },
        { part: "custom", component: "astra.skillPickers", props: { roll: SKILL_TASK } },
      ],
    },
    {
      id: "combat",
      page: "panel",
      parts: [
        { part: "heading", text: "Weapons", targets: true },
        {
          part: "list",
          path: "attacks",
          hook: "attack",
          className: "five-attacks",
          name: { path: "name", bold: true, flat: true },
          details: [{ text: "{range}" }],
          rowActions: [
            { hook: "attack", label: "{bonus|signed}", title: "Attack: 2d6 + this, 8 or more; the Effect adds to the damage", action: { ct: "attack", key: "weapon" } },
            { hook: "damage", label: "{damage}", title: "Damage: the dice + the attack's Effect, less the target's armour", action: { ct: "damage-roll", key: "weapon" } },
          ],
          empty: "No weapon ready: equip one on the Gear tab.",
        },
      ],
    },
    {
      id: "gear",
      page: "panel",
      parts: [
        {
          part: "list",
          path: "inventorylist",
          hook: "item",
          select: { path: "carried", label: "{name} carried", kind: "select", number: true, default: 1, zeroIsEmpty: true, title: "Ready (worn or in hand), carried or stowed", options: [{ value: "2", label: "Ready" }, { value: "1", label: "Carried" }, { value: "0", label: "Stowed" }] },
          fields: [{ path: "count", label: "{name} count", kind: "number", default: 1, zeroIsEmpty: true }],
          name: { path: "name" },
          small: [{ if: { defined: "subtype" }, then: "{subtype}", else: "{type}" }, { if: { has: "protection" }, then: " · protection {protection}", else: "" }, { if: { has: "damage" }, then: " · {damage}", else: "" }],
          remove: { aria: "Drop {name}", title: "Drop it" },
        },
        { part: "coins", path: "coins", aria: "Credits", word: "credits" },
      ],
    },
    {
      id: "notes",
      page: "panel",
      parts: [
        {
          part: "notes",
          fields: [
            { path: "contacts", label: "Contacts and rivals", kind: "text" },
            { path: "notes", label: "Notes", kind: "textarea" },
          ],
        },
      ],
    },
  ],
};

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "astra",
  names: ["Apeira Astra"],
  blurb: "Kraken's science fiction: 2d6 and skills, Paths to make a crew in minutes, armour that soaks. Its books and a first adventure come with Kraken.",
  engine: "shared/astra/rules.mjs",
  host: { module: "electron/astra.cjs", message: "character-improve", tool: "kraken_character_improve" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["boon", "bane", "plus1", "minus2"] } },
  records: { race: { label: "Origins" }, class: { label: "Paths" }, item: { label: "Gear" }, npc: { label: "Threats" } },
  sheet,
  wizard: "astra.wizard",
  blank: false,
  features: ["starships"],
  party: { currency: ["Cr"], xp: "xp", groupCheck: { stats: [], rolls: [{ kind: "skill", label: "Skill", options: Object.entries(PARTY_SKILLS).map(([value, row]) => ({ value, label: String(row[0]) })) }, { kind: "check", label: "Characteristic", options: PARTY_STATS.map((value) => ({ value, label: String(/** @type {Record<string, string>} */ (PARTY_STAT_NAMES)[value] ?? value) })) }] } },
  tracker: { saves: { keys: ["brawn", "reflex", "grit", "intellect", "training", "presence"], modLabel: "DM", modAria: "Check DM", button: "Roll check" } },
  windows: [{ kind: "ships", label: "Starships", icon: "ship", title: "Starships", feature: "starships" }],
  calendar: "astra",
  // What the sheet (and kraken_character_edit) may change: the host's whitelist (electron/astra.cjs). A skill dropped
  // stays the host's own.
  edit: {
    text: ["playername", "notes", "appearance", "origin", "homeworld", "contacts", "ship"],
    number: ["characteristics.(brawn|reflex|grit|intellect|training|presence).score", "skills.%.level", "hp.wounds", "exp", "ac.misc", "initiative.misc", "coins.*.amount", "inventorylist.*.(count|carried)"],
    remove: ["inventorylist"],
  },
};
