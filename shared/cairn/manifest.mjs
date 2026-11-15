// @ts-check
// Cairn, Second Edition: its books ship with Kraken. The first game whose
// sheet is all core parts (docs/core-ui-design.md, migration step 2): the
// manifest lists its tabs and arranges the core's stat block, derived boxes,
// lists, coins, slots and notes on them; only the rest strip is Cairn's own
// (src/rulesets/cairn.tsx). The host's edit whitelist (electron/cairn.cjs) is
// built from `edit` below.
import { BODY_SLOTS, PACK_SLOTS, SHORT, SLOTS, STAT_NAMES, STATS, TRAIT_NAMES, TRAITS } from "./rules.mjs";

/** A Cairn message (session.cairnAction). @param {string} action @param {Record<string, unknown>} [more] */
const cairn = (action, more = {}) => ({ message: "cairn", action, ...more });
/** @type {Record<string, string>} */
const NAMES = STAT_NAMES;
/** @type {Record<string, string>} */
const SHORTS = SHORT;
/** @type {Record<string, string>} */
const TRAIT_WORDS = TRAIT_NAMES;

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "cairn",
  names: ["Cairn"],
  blurb: "Cairn, Second Edition (Yochai Gal, CC BY-SA 4.0): three attributes and Hit Protection, saves under a d20, attacks that always hit, Scars, Fatigue and ten inventory slots, backgrounds instead of classes. Its Player's Guide, Warden's Guide and Trouble in Twin Lakes come with Kraken.",
  engine: "shared/cairn/rules.mjs",
  host: { module: "electron/cairn.cjs", message: "cairn", tool: "kraken_cairn" },
  labels: { hp: "HP", ac: "Armor", xp: "Growth" },
  records: { background: { label: "Backgrounds" }, item: { label: "Gear and Relics" }, npc: { label: "Bestiary" }, cairntable: { label: "Tables" } },
  // The book's Character Creation in its order, on the core's wizard: a background (rolled d20 or chosen), a
  // name from its list, its starting gear, a roll on each of its tables; STR, DEX and WIL 3d6 in order (two
  // may be swapped once); Hit Protection 1d6; the traits (d10 each), a Bond (d20), the age (2d20+10) and, for
  // the youngest, an Omen (d20); 3d6 gold pieces and the Marketplace. Every die is the host's, in chat.
  wizard: {
    hook: "cairn",
    title: "New Cairn character",
    aria: "Cairn character wizard",
    chat: "[CHARGEN] ",
    tables: { type: "cairntable", key: "group" },
    empty: { type: "background", text: "No backgrounds yet: the GM makes the Cairn Player's Guide active (Modules)." },
    finish: { title: "Every step rolled first", build: "cairn.build" },
    steps: [
      {
        id: "background",
        title: "Background",
        parts: [
          { kind: "choose-record", fromType: "background", into: "background", aria: "Background", placeholder: "Choose a background…", resets: ["results", "name"], roll: { hook: "cairn-roll-background", formula: "1d20", label: "Background (d20)", button: "Roll d20", table: "backgrounds", pick: "cairn.backgroundOfRoll" } },
          { kind: "hint", record: "background", text: "{quote}" },
          { kind: "text", into: "name", label: "Name", aria: "Name from the background", placeholder: "Choose a name…", options: { record: "background", list: "names" }, free: { aria: "Character name", placeholder: "or your own" }, when: { has: "background" } },
          { kind: "hint", record: "background", text: "Starting gear: a backpack, {gear}." },
          { kind: "record-tables", record: "background", path: "tables", into: "results", formula: "1d6", hook: "cairn-roll-table-", label: "{record}: {table}", button: "Roll d6", done: "Rolled {value}", className: "cairn-table", attr: "cairn-table" },
        ],
      },
      {
        id: "attributes",
        title: "Attributes and Hit Protection",
        parts: [
          {
            kind: "row",
            parts: [
              { kind: "roll-stats", into: "attributes", hook: "cairn-roll-attributes", formula: "3d6", label: "{label} (3d6)", button: "Roll 3d6 in order", stats: STATS.map((key) => ({ key, label: NAMES[key], short: SHORTS[key] })), swap: { hook: "cairn-swap", title: "You may swap any two of the results", aria: ["Swap", "With"], start: ["str", "dex"], button: "Swap" } },
              { kind: "roll", into: "hp", hook: "cairn-roll-hp", formula: "1d6", label: "Hit Protection (1d6)", button: "Roll HP (1d6)", done: "HP {value}" },
            ],
          },
        ],
      },
      {
        id: "traits",
        title: "Traits, Bond, Age",
        more: { when: { has: "youngest" }, text: ", Omen" },
        parts: [
          {
            kind: "row",
            parts: [
              { kind: "roll-table", into: "traits", hook: "cairn-roll-traits", formula: "1d10", label: "{label} (d10)", button: "Roll the traits (d10 each)", table: "{key}", rows: TRAITS.map((key) => ({ key, label: TRAIT_WORDS[key] })) },
              { kind: "roll", into: "bond", table: "bonds", hook: "cairn-roll-bond", formula: "1d20", label: "Bond (d20)", button: "Roll a Bond (d20)" },
              { kind: "roll", into: "age", hook: "cairn-roll-age", formula: "2d20+10", label: "Age (2d20+10)", button: "Roll the age (2d20+10)", done: "Age {value}" },
              { kind: "check", into: "youngest", label: "The youngest", title: "The youngest character rolls an Omen and reads it aloud" },
              { kind: "roll", into: "omen", table: "omens", optional: true, hook: "cairn-roll-omen", formula: "1d20", label: "Omen (d20)", button: "Roll an Omen (d20)", when: { has: "youngest" } },
            ],
          },
          { kind: "hint", attr: "wizard-traits", join: { path: "traits", rows: TRAITS.map((key) => ({ key, label: TRAIT_WORDS[key] })), text: "{label}: {value}", sep: " · " }, when: { any: TRAITS.map((key) => ({ has: `traits.${key}` })) } },
          { kind: "hint", text: "Bond: {bond}", when: { has: "bond" } },
          { kind: "hint", text: "Omen (read it aloud): {omen}", when: { has: "omen" } },
        ],
      },
      {
        id: "gold",
        title: "Gold and the Marketplace",
        parts: [
          // The Marketplace: gear, weapons, armor and transport (not services or hirelings), in gold pieces.
          { kind: "shop", into: "buy", fromType: "item", exclude: { path: "type", values: ["Service", "Hireling", "Spellbook", "Relic"] }, price: { path: "cost", per: 100, unit: "gp" }, type: "type", gold: { into: "gold", hook: "cairn-roll-gold", formula: "3d6", label: "Gold pieces (3d6)", button: "Roll 3d6 gold pieces", done: "{value} gp rolled", bonus: "cairn.backgroundGold", bonusText: " ({value} from the background)" }, search: { aria: "Shop search", placeholder: "Search the Marketplace" }, limit: 80 },
        ],
      },
    ],
  },
  blank: false,
  features: ["slots", "fatigue", "scars", "spellbooks", "morale", "dying.save"],
  // Cairn has no experience: the party's tab is its Growth (Scars and what has changed).
  party: { currency: ["GP"], xp: "growth", groupCheck: { stats: ["str", "dex", "wil"] } },
  tracker: {
    saves: { keys: ["str", "dex", "wil"], modLabel: "CL", modAria: "Save CL", button: "Roll save" },
    // No initiative: the PCs act first, each saving DEX to act in the first round.
    initiative: { rollAll: "Sides (DEX saves)", rollAllTitle: "The PCs first (each saves DEX to act in the first round), then their opponents", own: "DEX", ownTitle: "My DEX save to act in the first round" },
    // Attacks always hit: the die less Armor (impaired d4, enhanced d12).
    attacks: {
      hook: "npc-attack",
      attr: "cairn-attack",
      label: ["{name}", " ", "{damage}"],
      title: "{name}: {damage}, always hits (less Armor)",
      modes: [
        { mode: "impaired", label: "d4", title: "Impaired (cover, bound hands): d4" },
        { mode: "enhanced", label: "d12", title: "Enhanced (a helpless foe, a daring maneuver): d12" },
      ],
    },
    rowActions: [
      // Critical Damage: aid (bandages) stabilizes; untreated, death within the hour.
      { hook: "stabilize", label: "Stabilize", title: "Give aid (bandages): stable, out of danger but out of action", when: { all: [{ status: "Dying" }, { has: "recordId" }, { any: [{ gm: true }, { viewerHasCharacter: true }] }] }, call: { message: "cairn", action: "stabilize" } },
      { hook: "morale", label: "Morale", title: "Morale: a WIL save to stand, else the creature flees", when: { all: [{ gm: true }, { faction: "not-friend" }, { not: { status: ["Dead", "Routed", "Fleeing"] } }] }, call: { ct: "morale" } },
    ],
    headerActions: [{ hook: "morale-foes", label: "Morale", title: "Morale: every foe still standing saves WIL, or flees", disabled: { not: { anyEntry: { faction: "foe" } } }, call: { ct: "morale", args: { faction: "foe" } } }],
  },

  // Who they are on top, tabs down the right (Main, Inventory, Combat, Character, Growth, Notes).
  sheet: {
    level: "arrange",
    className: "sheet-5e sheet-cairn",
    header: {
      identity: [
        { path: "background", label: "Background", kind: "readonly", hook: "background" },
        { path: "age", label: "Age", kind: "number" },
        { path: "status", label: "State", kind: "readonly", attr: "data-cairn-status", color: "#c0392b", when: { has: "status" } },
      ],
    },
    tabs: [
      {
        // Click an attribute to save against it: a d20 at or under, in front of the table.
        id: "main",
        parts: [
          {
            part: "row",
            className: "cc-main-grid five-main",
            parts: [
              {
                part: "statBlock",
                label: "Attributes",
                className: "cairn-stats",
                hook: "attribute",
                rows: STATS.map((key) => ({ key, label: NAMES[key], short: SHORTS[key] })),
                columns: [
                  { label: "Now", path: "attributes.{key}.score", field: { kind: "number", label: "{key} now" } },
                  { label: "Max", path: "attributes.{key}.max", field: { kind: "number", label: "{key} max" } },
                ],
                roll: { action: { roll: "save" }, label: "d20", column: "Save", hook: "roll-save", aria: "{key} save", title: "Save {label}: a d20 at or under {attributes.{key}.score} (a 1 always succeeds, a 20 always fails)" },
              },
              {
                part: "derived",
                boxes: [
                  {
                    label: "HP",
                    title: "Hit Protection: how well you avoid harm. Damage past it comes off STR. A full inventory takes it to 0.",
                    show: "remaining",
                    path: "hp.total",
                    minus: "hp.wounds",
                    hook: "hp",
                    danger: true,
                    fields: [
                      { path: "hp.wounds", label: "HP lost", kind: "number", before: "Lost" },
                      { path: "hp.max", label: "HP max", kind: "number", before: "Max" },
                    ],
                    warn: { when: { has: "encumbered" }, text: "A full inventory: HP 0" },
                  },
                  { label: "Armor", title: "Armor comes off every hit (3 at most)[: {ac.armor}]", show: "shield", path: "ac.total", hook: "ac" },
                  {
                    label: "Fatigue",
                    title: "Fatigue: one slot each, until a safe night's rest",
                    show: "value",
                    path: "fatigue",
                    hook: "fatigue",
                    steps: [
                      { hook: "fatigue-add", label: "+", title: "Add a Fatigue (it takes a free slot)", action: cairn("fatigue", { args: { amount: 1 } }) },
                      { hook: "fatigue-remove", label: "−", title: "Remove a Fatigue", action: cairn("fatigue", { args: { amount: -1 } }), disabled: { not: { positive: "fatigue" } } },
                    ],
                  },
                ],
              },
            ],
          },
          { part: "custom", component: "cairn.restStrip" },
        ],
      },
      {
        // Ten slots: four on the body, six in the backpack, a Fatigue one each.
        id: "inventory",
        page: "panel",
        parts: [
          { part: "load", mode: "slots", hook: "slots", used: "slots.used", total: SLOTS, text: `body {slots.body}/${BODY_SLOTS} · backpack {slots.pack}/${PACK_SLOTS} · Fatigue {slots.fatigue}[ · coin {slots.coins}] · bulky 2, petty 0` },
          {
            part: "list",
            path: "inventorylist",
            hook: "item",
            select: {
              path: "carried",
              label: "{name} carried",
              kind: "select",
              number: true,
              default: 1,
              title: "On the body or in hand, in the backpack, or left elsewhere (a mule, a cart, camp)",
              options: [
                { value: "2", label: "Body" },
                { value: "1", label: "Pack" },
                { value: "0", label: "Away" },
              ],
            },
            name: { path: "name", title: ["text", "note"] },
            details: [{ text: "{damage}", when: { has: "damage" } }, { text: "{armor} Armor", when: { positive: "armor" } }, { text: "{uses} uses", when: { defined: "uses" } }, { text: "{charges} charges", when: { defined: "charges" } }, { format: "cairn.itemSlots" }, { text: "{kind}", when: { has: "kind" } }],
            rowActions: [
              // A spellbook, a scroll or a relic: cast it (in danger or deprived, a WIL save first).
              {
                hook: "cast",
                label: { by: "kind", map: { relic: "Use" }, else: "Cast" },
                title: { by: "kind", map: { spellbook: "Read it aloud with both hands: +1 Fatigue (in danger, a WIL save first)", scroll: "Read it: no Fatigue, the scroll is gone" }, else: "Use the relic: a charge" },
                when: { all: [{ editable: true }, { is: { path: "kind", values: ["spellbook", "scroll", "relic"] } }] },
                action: cairn("cast", { key: "item", modifiers: ["danger"] }),
              },
              {
                hook: "use",
                label: "Use",
                title: "Spend a use",
                when: { all: [{ editable: true }, { not: { is: { path: "kind", values: ["spellbook", "scroll", "relic"] } } }, { any: [{ positive: "uses" }, { positive: "charges" }] }] },
                action: cairn("use", { key: "item" }),
              },
            ],
            remove: { aria: "Drop {name}", title: "Drop it" },
            add: { label: "Add an item", note: "Add an item, as the books write it: Rope (25ft), Bow (d6, bulky)", action: cairn("item-add", { value: "text" }) },
            modifier: { key: "danger", kind: "check", label: "In danger", title: "Casting in danger (in a fight) or deprived: a WIL save first", place: "bottom" },
          },
          { part: "coins", path: "coins", none: { text: "No gold.", unless: "gp" } },
        ],
      },
      {
        // Attacks always hit: the die, less the target's Armor.
        id: "combat",
        page: "panel",
        parts: [
          { part: "heading", text: "Attacks", targets: true },
          { part: "hint", text: "Attacks always hit: the die, less the target's Armor, off HP and then STR." },
          {
            part: "list",
            path: "attacks",
            hook: "attack",
            className: "five-attacks",
            name: { path: "name", bold: true, flat: true },
            sep: ", ",
            details: [{ text: "blast", when: { has: "blast" } }, { text: "bulky", when: { has: "bulky" } }, { text: "ignores armor", when: { has: "ignoresarmor" } }],
            rowActions: [
              { hook: "attack", label: { by: "modifier:mode", map: { impaired: "d4", enhanced: "d12" }, else: "{damage}" }, title: "Attack: it hits; the die less Armor", action: { ct: "attack", key: "weapon", modifiers: ["mode"] } },
            ],
            modifier: {
              key: "mode",
              kind: "select",
              label: "Attack modifier",
              place: "top",
              options: [
                { value: "", label: "Normal" },
                { value: "impaired", label: "Impaired: d4 (cover, bound hands)" },
                { value: "enhanced", label: "Enhanced: d12 (a helpless foe, a daring move)" },
              ],
            },
          },
          { part: "hint", text: "Two weapons (d6+d6) roll both and keep the best. In the first round, save DEX to act (the tracker asks)." },
        ],
      },
      {
        id: "character",
        page: "panel",
        parts: [
          { part: "notes", className: "cairn-traits", fields: TRAITS.map((key) => ({ path: `traits.${key}`, label: TRAIT_WORDS[key], kind: "text" })) },
          {
            part: "notes",
            fields: [
              { path: "bond", label: "Bond", kind: "textarea" },
              { path: "omen", label: "Omen", kind: "textarea" },
              { path: "history", label: "Background history", kind: "textarea", note: "From the background's tables" },
            ],
          },
        ],
      },
      {
        // Cairn has no experience: a character grows from what happens to them.
        id: "growth",
        page: "panel",
        parts: [
          { part: "hint", text: "Cairn has no experience: a character grows from what happens to them. Scars, changes and Downtime milestones are kept here." },
          {
            part: "list",
            label: "Scars",
            path: "scars",
            hook: "scar",
            count: "scars",
            name: { path: "name", else: "Scar", bold: true },
            details: [{ text: "{text}", when: { has: "text" } }],
            rowActions: [{ hook: "scar-recover", label: "Recover", title: "Recovered (mended, over it): roll what the scar gives", when: { all: [{ editable: true }, { positive: "pending" }] }, action: cairn("scar-recover", { key: "scar" }) }],
          },
          {
            part: "list",
            label: "Growth",
            path: "growth",
            hook: "growth",
            name: { path: "text" },
            remove: { aria: "Remove" },
            add: { label: "New growth", note: "What changed, and why (Enter to add)", action: cairn("growth", { value: "text" }) },
          },
          // Growth by a roll: kept if it beats the maximum (the Warden's call).
          {
            part: "advancement",
            mode: "growth",
            gm: true,
            title: "Growth by a roll: keep it if it beats the maximum (the Warden's call)",
            rolls: [
              { hook: "grow-hp", label: "Reroll HP", action: cairn("growth-roll", { args: { to: "hp", roll: "1d6", how: "higher", reason: "Growth" } }) },
              { hook: "grow-str", label: "Reroll STR", action: cairn("growth-roll", { args: { to: "str", roll: "3d6", how: "higher", reason: "Growth" } }) },
              { hook: "grow-dex", label: "Reroll DEX", action: cairn("growth-roll", { args: { to: "dex", roll: "3d6", how: "higher", reason: "Growth" } }) },
              { hook: "grow-wil", label: "Reroll WIL", action: cairn("growth-roll", { args: { to: "wil", roll: "3d6", how: "higher", reason: "Growth" } }) },
            ],
          },
          {
            part: "list",
            label: "Milestones",
            path: "milestones",
            hook: "milestone",
            name: { path: "name" },
            check: { path: "done", label: "{name} done", kind: "check", action: cairn("milestone", { key: "key", value: "done" }) },
            remove: { aria: "Remove milestone", action: cairn("milestone", { key: "key", args: { remove: true } }) },
            add: { label: "New milestone", note: "A Downtime milestone (Enter to add)", action: cairn("milestone", { value: "name" }) },
          },
        ],
      },
      {
        id: "notes",
        page: "panel",
        parts: [
          {
            part: "notes",
            fields: [
              { path: "appearance", label: "Appearance", kind: "text" },
              { path: "notes", label: "Notes", kind: "textarea", bare: true },
            ],
          },
        ],
      },
    ],
  },

  // What the sheet may change (the host's whitelist, electron/cairn.cjs): "*" is one id-n key.
  edit: {
    text: ["playername", "notes", "appearance", "background", "bond", "omen", "history", "contacts"],
    number: ["attributes.(str|dex|wil).(score|max)", "hp.(wounds|max)", "age", "fatigue", "deprived", "ac.misc", "coins.*.amount", "inventorylist.*.(count|carried|uses|charges|slots)", "milestones.*.done"],
    string: ["traits.(physique|skin|hair|face|speech|clothing|virtue|vice)", "inventorylist.*.(name|note|text)", "growth.*.text", "milestones.*.name", "scars.*.text"],
    // Lists whose rows the sheet may drop (an edit to null).
    remove: ["inventorylist", "growth", "milestones", "scars"],
  },
};
