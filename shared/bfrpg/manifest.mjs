// @ts-check
// The Basic Fantasy Role-Playing Game, 4th Edition: its books ship with Kraken.
// Its sheet is the core's parts (docs/core-ui-design.md, migration step 5):
// the manifest lists its tabs (Main, Combat, Skills, Spells, Inventory, Notes)
// and arranges the core's stat blocks, derived boxes, lists, the spell-slot
// track, coins and notes on them; only the strip over every tab and Turn
// undead are its own (src/rulesets/bfrpg.tsx). The host's edit whitelist
// (electron/bfrpg.cjs) is built from `edit` below.
import { MAX_LEVEL, SAVE_NAMES, SAVES, STATS } from "./rules.mjs";
import { SAVES as PARTY_SAVES, STATS as PARTY_STATS, THIEF_SKILLS as PARTY_SKILLS } from "./rules.mjs";
// The party sheet's group rolls: what the game checks, saves and its skills (D6).
const titleOf = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);

/** @type {Record<string, string>} */
const SAVE_WORDS = SAVE_NAMES;
const titled = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);
// A roll with the strip's modifier ("mod").
/** @param {"save" | "check" | "skill" | "morale"} roll @param {Record<string, unknown>} [more] */
const roll = (roll, more = {}) => ({ roll, bonus: "mod", ...more });
/** @type {import("../rulesets/types").FieldSpec[]} */
const DETAILS = ["playername", "deity", "languages", "gender", "age", "height", "weight"].map((key) => ({ path: key, kind: "text", label: key === "playername" ? "Player" : titled(key) }));

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "bfrpg",
  // Where a character keeps its class: one class, its level beside it.
  classes: { field: "className", level: "level" },
  names: ["Basic Fantasy"],
  blurb: "The Basic Fantasy Role-Playing Game, 4th Edition (free, CC BY-SA): old-school play with ascending Armor Class and an attack bonus, 3d6 in order, four races and four classes, the five saving throws, d6 initiative, thief abilities, turning the undead. Its Player's Handbook, Game Master's Guide and a first adventure come with Kraken.",
  engine: "shared/bfrpg/rules.mjs",
  host: { module: "electron/bfrpg.cjs" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["plus2", "minus2", "max", "half"] } },
  records: { race: { label: "Races" }, npc: { label: "Monsters" } },
  wizard: "bfrpg.wizard",
  blank: false,
  features: ["turnUndead", "morale", "multiAttack", "thiefSkills", "spellbooks", "encumbrance"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp", groupCheck: { stats: [], rolls: [{ kind: "save", label: "Save", options: PARTY_SAVES.map((value) => ({ value, label: titleOf(value) })) }, { kind: "check", label: "Check", options: PARTY_STATS.map((value) => ({ value, label: titleOf(value) })) }, { kind: "skill", label: "Thief ability", options: Object.entries(PARTY_SKILLS).map(([value, row]) => ({ value, label: String(row[0]) })) }] } },
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

  // Who they are on top, tabs down the right. Click a number to roll it in front of the table: a saving throw
  // (d20 at or above), the book's optional ability roll (d20 + the bonus at or above the level's target), a thief
  // ability (d100 at or under). Attacks go through the combat tracker. The host works every number out again.
  sheet: {
    level: "arrange",
    className: "sheet-5e sheet-35 sheet-2e sheet-bf",
    art: "race",
    header: {
      identity: [
        { path: "race", label: "Race", hook: "race" },
        { path: "className", label: "Class and level", hook: "class", show: "{className} {level|1}" },
        { path: "alignment", label: "Alignment", kind: "text" },
      ],
    },
    // The strip over every tab: the level (its level-up once the experience is there, or the GM's), the experience
    // (the GM types it), the attack bonus and the next roll's modifier (added to a save or an ability roll, taken off a
    // thief ability's d100).
    top: [
      {
        part: "strip",
        items: [
          { kind: "level", path: "level", exp: "exp", next: "expnext", max: MAX_LEVEL, atLeast: 1, hint: "{exp|0} of {expnext|nz:—} experience points for the next level", title: { if: { below: { path: "level", value: 9 } }, then: "Level up: the host rolls the hit die", else: "Level up: the class's fixed hit points" } },
          { kind: "xp", path: "exp", next: "expnext", label: "Experience", shown: { hook: "exp" }, note: { when: { positive: "xpbonus" }, text: ["+", "{xpbonus|0}", "% XP"] } },
          { kind: "value", label: "AB", path: "ab", hook: "ab", format: "signed", title: "Attack bonus: add Strength in melee, Dexterity with missiles" },
          { kind: "modifier", key: "mod", label: "Mod", aria: "Roll modifier", title: "A modifier for the next roll: added to a save or an ability roll, taken off a thief ability's d100", min: -20, max: 20 },
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
                head: false,
                plain: true,
                rows: STATS.map((key) => ({ key, label: titled(key) })),
                columns: [{ label: "Score", path: "abilities.{key}.score", field: { kind: "number", label: "{key} score" } }],
                roll: { action: roll("check"), hook: "roll-check", label: "{abilities.{key}.bonus|signed}", title: "Ability roll: d20 {abilities.{key}.bonus|signed} at or above {abilityTarget|0} (the book's optional rule)", aria: "{key} roll" },
              },
              {
                part: "derived",
                boxes: [
                  { label: "Armor Class", show: "shield", path: "ac.total", hook: "ac", title: "Armor {ac.armor|0}[ ({ac.worn})], shield +{ac.shield|0}, Dexterity {ac.dex|signed}, misc {ac.misc|signed}", fields: [{ before: "Misc", path: "ac.misc", kind: "number", label: "AC misc" }] },
                  { label: "Hit Points", show: "remaining", path: "hp.total", minus: "hp.wounds", quick: true, hook: "hp", danger: true, fields: [{ before: "Damage", path: "hp.wounds", kind: "number", label: "Damage taken" }], warn: { atZero: true, attr: { name: "status", value: "Dead" }, text: "At 0 hit points a character is dead (the book's rule; the GM may use an optional one)." } },
                  { label: "Initiative", show: "value", path: "initiative.total", hook: "init", format: "signed", title: "d6 + this, the highest acts first" },
                  { label: "Movement", show: "value", path: "movement", hook: "movement", suffix: "'", note: "{encumbrance}", title: "{encumbrance}: {load|0} lb. carried (light to {loads.light|0}, heavy to {loads.heavy|0})" },
                ],
              },
            ],
          },
          {
            part: "statBlock",
            label: "Saving throws",
            hook: "save",
            base: "cc-panel d2e-saves",
            heading: { text: "Saving throws", hint: "d20 at or above the number; a natural 1 fails, a 20 succeeds" },
            rowClass: "five-ability d35-save",
            rowTitle: "Class {saves.{key}.base|0}[, race -{saves.{key}.racial}][, misc -{saves.{key}.misc}]",
            plain: true,
            rows: SAVES.map((key) => ({ key, label: SAVE_WORDS[key] })),
            columns: [{ label: "Misc", path: "saves.{key}.misc", field: { kind: "number", label: "{key} misc" } }],
            roll: { action: roll("save", { fight: true }), hook: "roll-save", className: "cc-save", label: "{saves.{key}.total|0}", title: "Roll a save: d20 at or above {saves.{key}.total|0}", aria: "{key} save" },
            notes: "savenotes",
          },
        ],
      },
      {
        id: "combat",
        page: "panel",
        parts: [
          { part: "heading", text: "Attacks", targets: true },
          { part: "hint", text: "d20 + attack bonus at or above the target's Armor Class: melee {attack.melee|signed}, missile {attack.missile|signed}. A natural 20 hits, a 1 misses.[ Sneak attack (from behind, unseen): +4 to hit and double damage (add +4 in the tracker's ATK effect).{?sneakattack}]" },
          {
            part: "list",
            path: "attacks",
            hook: "attack",
            className: "five-attacks",
            name: { path: "name", bold: true, flat: true },
            details: [{ text: "{range}'", when: { has: "range" } }],
            hideEmpty: true,
            rowActions: [
              { hook: "attack", label: "{bonus|signed}", title: "One attack roll at each target", action: { ct: "attack", key: "weapon" } },
              { hook: "damage", label: "{damage}", title: "Damage roll (at least 1)", action: { ct: "damage-roll", key: "weapon" } },
            ],
            empty: "No weapon ready: ready one on the Inventory tab.",
          },
          { part: "custom", component: "bfrpg.turnUndead" },
        ],
      },
      {
        id: "skills",
        page: "panel",
        parts: [
          { part: "heading", text: "Thief abilities", hint: "d100 at or under; the GM rolls some in secret", when: { rows: "thiefskills" } },
          {
            part: "skills",
            path: "thiefskills",
            hook: "skill",
            className: "five-skills d2e-skills",
            rowTitle: "Level {level|1}: {base|0}%, misc {misc|signed}",
            field: { path: "misc", kind: "number", label: "{name} misc" },
            name: "name",
            roll: { action: roll("skill", { keyAs: "skill" }), hook: "roll-skill", label: "{total|0}%", aria: "Roll {name}" },
            when: { rows: "thiefskills" },
          },
          { part: "hint", text: "No thief abilities (a Thief's, or a Magic-User/Thief's).", when: { not: { rows: "thiefskills" } } },
          { part: "hint", text: "Halfling: hides with only a 10% chance of being seen outdoors (30% indoors); +1 with missiles and to initiative.", when: { is: { path: "race", values: ["Halfling"] } } },
          { part: "hint", text: "Darkvision {darkvision}'.", when: { positive: "darkvision" } },
          { part: "hint", text: "Ability rolls (the book's optional rule): d20 + the ability's bonus at or above {abilityTarget|0} at level {level|1}. Click an ability's bonus on the Main tab." },
        ],
      },
      {
        id: "spells",
        page: "panel",
        parts: [
          {
            part: "track",
            style: "boxes",
            className: "d35-perday",
            attr: { name: "perday", value: "{spellcasting.kind}" },
            intro: { by: "spellcasting.kind", map: { arcane: "Magic-User spells a day. Click a box to use a spell of that level, again to get it back." }, else: "Cleric spells a day. Click a box to use a spell of that level, again to get it back." },
            max: "spellcasting.perday",
            used: "spellcasting.used",
            rowClass: "d35-slots",
            rowHook: "spell-level",
            labels: ["1st", "2nd", "3rd", "4th", "5th", "6th"],
            aria: "{label} level spell {n}",
            empty: "No spells a day yet (a Cleric casts from 2nd level).",
            when: { has: "spellcasting" },
          },
          { part: "heading", text: "Spellbook", when: { is: { path: "spellcasting.kind", values: ["arcane"] } } },
          { part: "notes", fields: [{ path: "spellbook", label: "Spellbook", kind: "textarea", lines: true, bare: true }], when: { is: { path: "spellcasting.kind", values: ["arcane"] } } },
          { part: "heading", text: "Prepared today", when: { has: "spellcasting" } },
          { part: "notes", fields: [{ path: "prepared", label: "Prepared spells", kind: "textarea", lines: true, bare: true }], when: { has: "spellcasting" } },
          { part: "hint", text: "One spell a line, or drop a spell on the sheet.", when: { has: "spellcasting" } },
          { part: "hint", text: "This character casts no spells (Clerics and Magic-Users do).", when: { not: { has: "spellcasting" } } },
        ],
      },
      {
        id: "inventory",
        page: "panel",
        parts: [
          {
            part: "list",
            path: "inventorylist",
            hook: "item",
            select: { path: "carried", kind: "select", number: true, label: "{name} carried", title: "Ready (worn or in hand), carried or left behind", options: [{ value: "2", label: "Ready" }, { value: "1", label: "Carried" }, { value: "0", label: "Left behind" }] },
            fields: [{ path: "count", kind: "number", label: "{name} count", default: 1, zeroIsEmpty: true }],
            name: { path: "name" },
            head: { select: "Status", fields: ["#"], name: "Item" },
            details: [{ text: "{type}" }, { text: "{damage}" }, { text: "AC {ac}", when: { has: "ac" } }, { text: "AC +{acbonus}", when: { has: "acbonus" } }, { text: "{weight} lb.", when: { has: "weight" } }],
            remove: { aria: "Drop {name}", title: "Drop it" },
          },
          { part: "coins", path: "coins", aria: "{name}", upper: true },
          { part: "hint", text: "Load {load|0} lb. ({encumbrance}); 1 pp = 5 gp, 1 gp = 10 sp, 1 ep = 5 sp, 1 sp = 10 cp." },
        ],
      },
      {
        id: "notes",
        page: "panel",
        parts: [
          { part: "notes", fields: DETAILS },
          { part: "notes", fields: [{ path: "loyalty", label: "Loyalty", kind: "number", edit: "gm", note: "Loyalty (a retainer's: 7 + the employer's Charisma bonus)" }] },
          { part: "button", hook: "loyalty-roll", label: "Roll loyalty", title: "Loyalty check: 2d6 at or under", action: roll("morale"), disabled: { not: { editable: true } } },
          { part: "hint", text: "Retainers: at most {maxretainers|0}." },
          { part: "notes", fields: ["appearance", "background", "notes"].map((key) => ({ path: key, label: titled(key), kind: "textarea", bare: true })) },
        ],
      },
    ],
  },
  // What the sheet may change (the host's whitelist, electron/bfrpg.cjs): "*" one id-n key, "#" a digit, "%" a word,
  // "(a|b)" either; lists: a text of one item a line; remove: the lists whose rows the sheet may drop.
  edit: {
    text: ["playername", "alignment", "deity", "appearance", "notes", "background", "gender", "age", "height", "weight", "languages", "retainers", "specialabilities"],
    number: [
      "abilities.(strength|intelligence|wisdom|dexterity|constitution|charisma).score",
      "saves.(death|wands|paralysis|breath|spells).misc",
      "thiefskills.%.misc",
      "hp.(wounds|misc)",
      "exp",
      "ac.misc",
      "initiative.misc",
      "movemisc",
      "loyalty",
      "spellcasting.used.#",
      "coins.*.amount",
      "inventorylist.*.(count|carried)",
    ],
    // The container an item is in (FG's location), set by dragging it onto a backpack on the sheet.
    string: ["inventorylist.*.location"],
    list: ["spellbook", "prepared"],
    remove: ["inventorylist"],
  },
};
