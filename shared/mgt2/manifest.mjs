// @ts-check
// Mongoose Traveller 2nd Edition: Kraken's own rules code; the GM's books add content.
// Its sheet is core parts (docs/core-ui-design.md 7.15): who they are on top (UPP, species, homeworld, age, careers),
// the task strip (the difficulty, a DM, a Boon or Bane), then Main, Skills, Combat, Gear and Notes. Click a number to
// roll a task (2d6 + DM + skill against the difficulty). The host works every number out again (shared/mgt2/rules.mjs).

import { DIFFICULTIES, SHORT, STAT_NAMES, STATS as KEYS } from "./rules.mjs";
import { SKILLS as PARTY_SKILLS, STATS as PARTY_STATS, STAT_NAMES as PARTY_STAT_NAMES } from "./rules.mjs";
// The party sheet's group rolls: what the game checks, saves and its skills (D6).

/** @type {{ key: string; label: string; short: string }[]} */
const STATS = KEYS.map((key) => ({ key, label: STAT_NAMES[/** @type {keyof typeof STAT_NAMES} */ (key)], short: SHORT[/** @type {keyof typeof SHORT} */ (key)] }));
// A task: the strip's difficulty, DM and Boon or Bane go with it.
/** @type {import("../rulesets/types").ActionCall} */
const TASK = { roll: "check", bonus: "mod", dc: "difficulty", advantage: "boon" };
/** @type {import("../rulesets/types").ActionCall} */
const SKILL_TASK = { roll: "skill", keyAs: "skill", bonus: "mod", dc: "difficulty", advantage: "boon" };
const DOWN = { is: { path: "hp.state", values: ["Unconscious", "Dead"] } };

/** @type {import("../rulesets/types").SheetSpec} */
const sheet = {
  level: "arrange",
  className: "sheet-5e sheet-astra sheet-mgt2",
  header: {
    identity: [
      { path: "upp", label: "UPP", className: "mgt2-upp", hook: "upp", title: STATS.map((stat) => `${stat.short} {characteristics.${stat.key}.score|0}`).join(", ") },
      { path: "species", label: "Species", kind: "text", default: "Human" },
      { path: "homeworld", label: "Homeworld", kind: "text" },
      { path: "age", label: "Age", kind: "number" },
      { path: "careers", label: "Careers (terms)", hook: "careers", format: "mgt2.careers" },
    ],
  },
  top: [
    {
      part: "strip",
      items: [
        { kind: "choice", key: "difficulty", label: "Task", aria: "Difficulty", title: "The number the roll must reach", number: true, start: 8, options: DIFFICULTIES.map(([name, target]) => ({ value: String(target), label: `${name} (${target}+)` })) },
        { kind: "modifier", key: "mod", label: "DM", aria: "Task modifier", title: "A DM for the circumstances (cover, equipment, time)", plain: true, input: "cc-field", width: 4 },
        { kind: "choice", key: "boon", aria: "Boon or bane", title: "A Boon rolls 3d6 and keeps the best two; a Bane the worst two", options: [{ value: "", label: "No boon" }, { value: "boon", label: "Boon" }, { value: "bane", label: "Bane" }] },
        { kind: "hint", text: "2d6 + DM + skill; the margin is the Effect" },
      ],
    },
  ],
  tabs: [
    {
      id: "main",
      parts: [
        {
          part: "row",
          className: "cc-main-grid five-main mgt2-main",
          parts: [
            {
              part: "statBlock",
              label: "Characteristics",
              hook: "characteristic",
              className: "astra-stats",
              rows: STATS,
              columns: [{ label: "Score", path: "characteristics.{key}.score", field: { label: "{key} score", kind: "number" } }],
              roll: { column: "DM", action: TASK, label: "{characteristics.{key}.dm|signed}", title: "Roll {label} alone (2d6 + its DM)", aria: "{key} check", hook: "roll-check" },
              // A wounded characteristic: its value now, beside its name.
              nameSmall: { when: { less: { path: "characteristics.{key}.now", than: "characteristics.{key}.score" } }, className: "hint", attr: "now", text: ["now ", "{characteristics.{key}.now}"] },
            },
            {
              part: "derived",
              className: "mgt2-combat",
              boxes: [
                {
                  // END + STR + DEX left of their scores, with a bar; damage comes off them in that order.
                  label: "Physical",
                  title: "Damage comes off Endurance, then Strength, then Dexterity",
                  show: "remaining",
                  path: "characteristics.end.score",
                  sum: ["characteristics.str.score", "characteristics.dex.score"],
                  minus: "hp.wounds",
                  hook: "hp",
                  danger: true,
                  dangerWhen: DOWN,
                  note: "END {characteristics.end.now|0} · STR {characteristics.str.now|0} · DEX {characteristics.dex.now|0}",
                  fields: [{ path: "hp.wounds", label: "Damage taken", kind: "number", before: "Taken" }],
                  warn: { when: DOWN, text: { if: { is: { path: "hp.state", values: ["Dead"] } }, then: "Dead", else: "Unconscious" }, attr: { name: "down", value: "true" } },
                },
                { label: "Armour", title: "Armour's protection comes off every hit[: {ac.armor}]", show: "shield", path: "ac.total", hook: "ac" },
                { label: "Initiative", title: "2d6 + the better of DEX and INT DM", show: "value", path: "initiative.total", hook: "init", format: "signed" },
              ],
            },
            // The people a Traveller knows, on the front.
            { part: "notes", section: { className: "cc-panel mgt2-contacts", aria: "Allies and contacts" }, fields: [{ path: "contacts", label: "Allies, contacts, rivals and enemies", kind: "textarea" }] },
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
          sort: "name",
          field: { path: "level", label: "{name} level", kind: "number", locked: "num" },
          note: "{stat|upper}",
          roll: { action: SKILL_TASK, send: "{name}", label: { format: "mgt2.skillTotal" }, aria: "{name} task", hook: "roll-skill" },
          remove: { aria: "Remove {name}", title: "Forget this skill" },
          empty: "No skills yet.",
        },
        { part: "custom", component: "mgt2.skillPickers", props: { roll: SKILL_TASK } },
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
          details: [{ text: "{range}" }, { text: "{traits}" }],
          rowActions: [
            { hook: "attack", label: "{bonus|signed}", title: "Attack: 2d6 + this, 8 or more; the Effect adds to the damage", action: { ct: "attack", key: "weapon" } },
            { hook: "damage", label: "{damage}", title: "Damage: the dice + the attack's Effect, less the target's armour (less the weapon's AP)", action: { ct: "damage-roll", key: "weapon" } },
          ],
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
          head: { select: "Status", fields: ["#"], name: "Item" },
          small: [{ if: { defined: "tl" }, then: "TL{tl} · ", else: "" }, { if: { positive: "protection" }, then: "protection +{protection}", else: "" }, { if: { has: "damage" }, then: "{damage}[ · {traits}]", else: "" }],
          remove: { aria: "Drop {name}", title: "Drop it" },
        },
        { part: "coins", path: "coins", aria: "Credits", word: "Cr", before: true },
      ],
    },
    {
      id: "notes",
      page: "panel",
      parts: [
        {
          part: "notes",
          fields: [
            { path: "gender", label: "Gender", kind: "text" },
            { path: "appearance", label: "Appearance and background", kind: "textarea", bare: true },
            { path: "notes", label: "Notes", kind: "textarea", bare: true },
          ],
        },
      ],
    },
  ],
};

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "mgt2",
  names: ["Traveller"],
  blurb: "Mongoose Traveller 2nd Edition: the UPP's six characteristics, skills and specialities, 2d6 tasks with Effect, Boon and Bane, careers and terms, damage to Endurance, Strength and Dexterity, armour and AP. Its rules are Kraken's own code; your Traveller books add their content.",
  engine: "shared/mgt2/rules.mjs",
  host: { module: "electron/mgt2.cjs", message: "mgt2-life", tool: "kraken_traveller_lifepath" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["boon", "bane", "plus1", "minus2"] } },
  records: { item: { label: "Equipment" }, npc: { label: "NPCs and Animals", statblock: "mgt2.npcBlock" } },
  sheet,
  wizard: "mgt2.wizard",
  blank: false,
  features: ["starships", "careers"],
  party: { currency: ["MCr", "Cr"], xp: "xp", groupCheck: { stats: [], rolls: [{ kind: "skill", label: "Skill", options: Object.entries(PARTY_SKILLS).map(([value, row]) => ({ value, label: String(row[0]) })) }, { kind: "check", label: "Characteristic", options: PARTY_STATS.map((value) => ({ value, label: String(/** @type {Record<string, string>} */ (PARTY_STAT_NAMES)[value] ?? value) })) }] } },
  tracker: { saves: { keys: ["str", "dex", "end", "int", "edu", "soc"], modLabel: "DM", modAria: "Check DM", button: "Roll check" } },
  windows: [{ kind: "ships", label: "Starships", icon: "ship", title: "Starships", feature: "starships" }],
  calendar: "imperial",
  // What the sheet (and kraken_character_edit) may change: the host's whitelist (electron/mgt2.cjs). "&" is a skill's
  // key with its speciality (pilot-smallcraft), "#+" a number. A skill typed by its name, careers as a whole, a skill
  // dropped and the floor at 0 damage stay the host's own.
  edit: {
    text: ["playername", "notes", "appearance", "gender", "species", "homeworld", "contacts", "allies", "enemies", "ship", "background"],
    number: ["characteristics.(str|dex|end|int|edu|soc).score", "skills.&.level", "hp.wounds", "age", "ac.misc", "initiative.misc", "careers.#+.(terms|rank)", "coins.*.amount", "inventorylist.*.(count|carried)"],
    remove: ["inventorylist"],
  },
};
