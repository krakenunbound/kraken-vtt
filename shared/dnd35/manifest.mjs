// @ts-check
// D&D 3.5E, from the GM's 3.5E books. Its sheet is the core's parts
// (docs/core-ui-design.md, migration step 6): the manifest lists its tabs
// (Main, Skills, Combat, Spells, Feats, Inventory, Notes) and arranges the
// core's strip, the abilities with the three saves inside them, the derived
// boxes, every skill with its ranks, the attacks with their iterative and
// critical ranges, spells a day, lists, coins and notes. It has no part of its
// own. The host's edit whitelist (electron/dnd35.cjs) is built from `edit` below.
import { MAX_LEVEL, SAVE_NAMES, SAVES, SKILLS, STATS } from "./rules.mjs";
import { SAVES as PARTY_SAVES, SKILLS as PARTY_SKILLS, STATS as PARTY_STATS } from "./rules.mjs";
// The party sheet's group rolls: what the game checks, saves and its skills (D6).
const titleOf = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);

const titled = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);
// A roll with the strip's DC.
/** @param {"save" | "check" | "skill"} roll @param {Record<string, unknown>} [more] */
const roll = (roll, more = {}) => ({ roll, dc: "dc", ...more });
/** @type {Record<string, string>} */
const SAVE_WORDS = SAVE_NAMES;
/** @type {Record<string, unknown[]>} */
const SKILL_LIST = SKILLS;
const ORDINAL = ["0", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
// Whether a skill is the class's ("A class skill") or cross-class, trained only, its armor check.
const SKILL_MORE = "[; trained only{?trained}][; armor check {acp}]";

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "dnd35",
  names: ["D&D 3.5E"],
  blurb: "Played from your 3.5E books (the Player's Handbook, Dungeon Master's Guide and Monster Manual): 3.5E sheets and character building, base attack and iterative attacks, criticals by threat and confirmation, Fortitude, Reflex and Will, skills by ranks.",
  engine: "shared/dnd35/rules.mjs",
  host: { module: "electron/dnd35.cjs" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["plus2", "minus2", "crit", "max", "half"] } },
  records: { race: { label: "Races" } },
  sheet: {
    level: "arrange",
    className: "sheet-5e sheet-35",
    art: "race",
    header: {
      identity: [
        { path: "race", label: "Race" },
        { path: "classes", label: "Class", hook: "class", join: { item: "{name} {level|0}", sep: " / " } },
        { path: "alignment", label: "Alignment", kind: "text" },
      ],
    },
    top: [
      {
        part: "strip",
        items: [
          { kind: "level", path: "level", exp: "exp", next: "expnext", max: MAX_LEVEL, title: "Level up: the host rolls the hit die" },
          { kind: "xp", path: "exp", next: "expnext", label: "Experience" },
          { kind: "value", label: "BAB", path: "bab", hook: "bab", title: "Base attack bonus", format: "signed" },
          { kind: "value", label: "Grapple", path: "grapple", hook: "grapple", title: "Grapple: base attack + Strength + size", format: "signed" },
          { kind: "modifier", key: "dc", label: "DC", aria: "Difficulty class", title: "The DC a check or save is rolled against (0: none)", min: 0, max: 60 },
        ],
      },
    ],
    tabs: [
      {
        id: "main",
        parts: [
          {
            part: "row",
            className: "cc-main-grid five-main d35-main",
            parts: [
              {
                part: "statBlock",
                label: "Abilities",
                hook: "ability",
                plain: true,
                headClass: "five-ability-head d35-ability-head",
                rowClass: "five-ability d35-ability",
                rows: STATS.map((key) => ({ key, label: titled(key) })),
                columns: [
                  { label: "Score", path: "abilities.{key}.score", field: { kind: "number", label: "{key} score" } },
                  { label: "Mod", roll: { action: roll("check"), hook: "roll-check", label: "{abilities.{key}.bonus|signed}", title: "Roll a {key} check", aria: "{key} check" } },
                ],
              },
              // Fortitude, Reflex and Will in a column beside the abilities.
              {
                part: "statBlock",
                label: "Saving throws",
                hook: "save",
                base: "cc-panel d35-saves",
                heading: { text: "Saving throws", hint: "misc · roll" },
                plain: true,
                rowClass: "five-ability d35-save",
                rowTitle: "Base {saves.{key}.base|signed}, ability {saves.{key}.ability|signed}, misc {saves.{key}.misc|signed}",
                rows: Object.keys(SAVES).map((key) => ({ key, label: SAVE_WORDS[key] })),
                columns: [
                  { label: "Misc", path: "saves.{key}.misc", field: { kind: "number", label: "{key} misc" } },
                  { label: "Save", roll: { action: roll("save", { fight: true }), hook: "roll-save", className: "cc-save", label: "{saves.{key}.total|signed}", title: "Roll a {key} save", aria: "{key} save" } },
                ],
              },
              {
                part: "derived",
                className: "d35-combat",
                boxes: [
                  {
                    label: "Armor Class",
                    show: "shield",
                    path: "ac.total",
                    hook: "ac",
                    title: "10 + armor {ac.armor|0} + shield {ac.shield|0} + Dex {ac.dex|0} + size {ac.size|0} + natural {ac.natural|0} + deflection {ac.deflection|0} + dodge {ac.dodge|0} + misc {ac.misc|0}",
                    lines: [
                      { sep: " · ", items: [{ before: "Touch", value: "ac.touch", hook: "touch" }, { before: "Flat-footed", value: "ac.flatfooted", hook: "flatfooted" }] },
                      { items: [{ before: "Natural", field: { path: "ac.natural", kind: "number", label: "Natural armor" } }, { before: "Deflection", field: { path: "ac.deflection", kind: "number", label: "Deflection" } }] },
                    ],
                  },
                  {
                    label: "Hit Points",
                    show: "remaining",
                    path: "hp.total",
                    plus: "hp.temp",
                    minus: "hp.wounds",
                    quick: true,
                    hook: "hp",
                    danger: true,
                    lines: [
                      { items: [{ before: "Wounds", field: { path: "hp.wounds", kind: "number", label: "Wounds" } }, { before: "Nonlethal", field: { path: "hp.nonlethal", kind: "number", label: "Nonlethal damage" } }] },
                      { items: [{ before: "Temp", field: { path: "hp.temp", kind: "number", label: "Temporary hit points" } }] },
                    ],
                    states: [
                      { status: "Dead", atMost: -10, text: "Dead." },
                      { status: "Dying", under: 0, when: { not: { positive: "stable" } }, text: "Dying: 10% each turn to become stable, else 1 more hit point lost; dead at -10." },
                      { status: "Stable", under: 0, text: "Stable: unconscious, no longer losing hit points." },
                      { status: "Disabled", equals: 0, text: "Disabled: one move or standard action a round (a standard action costs 1 hit point)." },
                    ],
                  },
                  { label: "Initiative", show: "value", path: "initiative.total", hook: "init", format: "signed" },
                  { label: "Melee", show: "value", path: "bab", sum: ["abilities.strength.bonus", "ac.size"], hook: "melee", format: "signed", title: "Base attack + Strength + size, before a weapon" },
                  { label: "Ranged", show: "value", path: "bab", sum: ["abilities.dexterity.bonus", "ac.size"], hook: "ranged", format: "signed", title: "Base attack + Dexterity + size, before a weapon" },
                  { label: "Speed", show: "field", path: "speed", field: { path: "speed", kind: "number", label: "Speed" }, suffix: " ft." },
                  { label: "Size", show: "text", path: "size", text: "{size|medium|titled}" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "skills",
        page: "panel",
        pageClass: "cc-panel five-skills d35-skills cc-page",
        parts: [
          {
            part: "skills",
            path: "skills",
            hook: "skill",
            head: { className: "five-skill d35-skill-head", labels: ["Ranks", "Skill", "Total"] },
            rows: Object.entries(SKILL_LIST).map(([key, [label, stat]]) => ({ key, label: String(label), note: String(stat).slice(0, 3).toUpperCase() })),
            rowClass: { if: { has: "classskill" }, then: "five-skill class-skill", else: "five-skill" },
            rowTitle: { if: { has: "classskill" }, then: `A class skill${SKILL_MORE}`, else: `Cross-class (2 points a rank, half the ranks)${SKILL_MORE}` },
            mark: { when: { has: "classskill" }, text: "● " },
            field: { path: "ranks", kind: "number", label: "{label} ranks" },
            // A trained-only skill with no ranks has no total: a dash, and no roll.
            roll: { action: roll("skill", { keyAs: "skill" }), hook: "roll-skill", label: { if: { isNull: "total" }, then: "—", else: "{total|signed}" }, aria: "Roll {label}", send: "{label}", disabled: { isNull: "total" } },
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
              { hook: "attack", label: "{bonuses.0|signed}", title: "One attack roll at each target", action: { ct: "attack", key: "weapon" } },
              { hook: "full-attack", label: "{bonuses|signed|join:/}", title: "Full attack: every iterative bonus at the first target", when: { length: { path: "bonuses", min: 2 } }, action: { ct: "attack", key: "weapon", args: { full: true } } },
              { hook: "damage", label: ["{damage}", " ", "{dmgtype}"], title: "Damage roll (each hit; a confirmed critical multiplied)", action: { ct: "damage-roll", key: "weapon" } },
            ],
            // The threat range and multiplier: 19-20/x2.
            smalls: [{ place: "end", attr: { name: "crit", value: "true" }, text: [{ if: { below: { path: "crit.range", value: 20 } }, then: "{crit.range|0}-20", else: "20" }, "/x", "{crit.mult|nz:2}"] }],
          },
          {
            part: "hint",
            text: [
              "A roll in the threat range that hits is confirmed by a second roll; a confirmed critical's damage is rolled as many times as its multiplier. Armor check penalty ",
              "{ac.acp|0}",
              { if: { has: "spellcasting.arcane" }, then: ", arcane spell failure {ac.spellfailure|0}%", else: "" },
              ".",
            ],
          },
        ],
      },
      {
        id: "spells",
        page: "panel",
        parts: [
          {
            part: "hint",
            text: ["{spellcasting.class}", ": save DC ", "{spellcasting.dc|0}", " + the spell's level (", "{spellcasting.stat|titled}", "). Click a box to use a spell of that level, again to get it back."],
            when: { has: "spellcasting" },
          },
          {
            part: "track",
            style: "boxes",
            className: "d35-perday",
            attr: { name: "perday", value: "true" },
            max: "spellcasting.perday",
            used: "spellcasting.used",
            rowClass: "d35-slots",
            rowHook: "spell-level",
            first: 0,
            zero: "none yet",
            labels: ORDINAL,
            aria: "{label} level spell {n}",
            when: { has: "spellcasting" },
          },
          { part: "hint", text: "This character casts no spells.", when: { not: { has: "spellcasting" } } },
          { part: "heading", text: "Spells known or prepared" },
          { part: "notes", fields: [{ path: "spells", label: "Spells", kind: "textarea", lines: true, bare: true }] },
          { part: "hint", text: "One spell a line, or drop a spell from the Spells list on the sheet." },
          { part: "custom", component: "core.spellCasts" },
        ],
      },
      {
        id: "feats",
        page: "panel",
        parts: [
          { part: "heading", text: "Feats" },
          { part: "notes", fields: [{ path: "feats", label: "Feats", kind: "textarea", lines: true, bare: true }] },
          { part: "hint", text: "One feat a line (Dodge, Improved Initiative, Weapon Focus (Longsword)... count in the numbers), or drop a feat on the sheet." },
          { part: "heading", text: "Class features" },
          { part: "list", path: "features", className: "d35-features", name: { path: "name", bold: true, flat: true }, small: ["{class}", " ", "{level|0}"] },
          { part: "heading", text: "Racial traits", when: { length: { path: "traits", min: 1 } } },
          { part: "hint", plain: true, text: "{traits|join:, }", when: { length: { path: "traits", min: 1 } } },
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
            // A count or carried of 0 shows as 1, as the hand-made sheet did.
            select: { path: "carried", kind: "select", number: true, label: "{name} carried", title: "Equipped, carried or not carried", options: [{ value: "2", label: "Equipped" }, { value: "1", label: "Carried" }, { value: "0", label: "Not carried" }], default: 1 },
            fields: [{ path: "count", kind: "number", label: "{name} count", default: 1, zeroIsEmpty: true }],
            name: { path: "name" },
            head: { select: "Status", fields: ["#"], name: "Item" },
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
          { part: "notes", fields: [{ path: "deity", kind: "text", label: "Deity" }, { path: "languages", kind: "text", label: "Languages" }] },
          { part: "notes", fields: [{ path: "notes", kind: "textarea", label: "Notes", bare: true }] },
        ],
      },
    ],
  },
  // What the sheet may change (the host's whitelist, electron/dnd35.cjs): "*" one id-n key, "#" a digit, "%" a word,
  // "(a|b)" either; lists: one item a line; remove: the lists whose rows the sheet may drop.
  edit: {
    text: ["playername", "alignment", "deity", "appearance", "notes", "senses", "background", "race", "gender", "age", "height", "weight", "languages"],
    number: [
      "abilities.(strength|dexterity|constitution|intelligence|wisdom|charisma).score",
      "skills.%.(ranks|misc)",
      "saves.(fortitude|reflex|will).misc",
      "hp.(total|wounds|nonlethal|temp)",
      "exp",
      "ac.(natural|deflection|dodge|misc)",
      "initiative.misc",
      "speed",
      "stable",
      "spellcasting.used.#",
      "coins.*.amount",
      "inventorylist.*.(count|carried)",
    ],
    // The container an item is in (FG's location), set by dragging it onto a backpack on the sheet.
    string: ["inventorylist.*.location"],
    list: ["feats", "spells"],
    remove: ["inventorylist"],
  },
  wizard: "dnd35.wizard",
  blank: false,
  features: ["spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp", groupCheck: { stats: [], rolls: [{ kind: "check", label: "Check", options: PARTY_STATS.map((value) => ({ value, label: titleOf(value) })) }, { kind: "save", label: "Save", options: Object.keys(PARTY_SAVES).map((value) => ({ value, label: titleOf(value) })) }, { kind: "skill", label: "Skill", options: Object.entries(PARTY_SKILLS).map(([value, row]) => ({ value, label: String(row[0]) })) }] } },
  tracker: { saves: { keys: ["fortitude", "reflex", "will"], modLabel: "DC", modAria: "Save DC", button: "Roll save" } },
  settings: [{ component: "dnd35.wizardSetting", gm: true }],
  calendar: "greyhawk",
};
