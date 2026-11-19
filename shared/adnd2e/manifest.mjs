// @ts-check
// AD&D 2E, from the GM's 2E books. Its sheet is the core's parts
// (docs/core-ui-design.md, migration step 6), arranged its own way, as FG's
// 2E sheet rearranges CoreRPG's: its own tab order (Main, Combat, Skills,
// Spells, Inventory, Notes), a level per class in the strip, THAC0, the
// abilities with their tables' notes, the five saves under them, weapon and
// nonweapon proficiencies, thief skills by points, spells a day per casting
// class. Its own are two formatters (src/rulesets/adnd2e.tsx). The host's
// edit whitelist (electron/adnd2e.cjs) is built from `edit` below.
import { MAX_LEVEL, SAVE_NAMES, SAVES, STATS } from "./rules.mjs";
import { SAVES as PARTY_SAVES, STATS as PARTY_STATS, THIEF_SKILLS as PARTY_SKILLS } from "./rules.mjs";
// The party sheet's group rolls: what the game checks, saves and its skills (D6).
const titleOf = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);

const titled = (/** @type {string} */ word) => word[0].toUpperCase() + word.slice(1);
// A roll with the strip's modifier ("mod": added to a save, taken off an ability check or a thief skill's d100).
/** @param {"save" | "check" | "skill"} roll @param {Record<string, unknown>} [more] */
const roll = (roll, more = {}) => ({ roll, bonus: "mod", ...more });
/** @type {Record<string, string>} */
const SAVE_WORDS = SAVE_NAMES;
// What each ability's table gives at its score, as small boxes beside it (the Player's Handbook's tables).
/** @type {Record<string, import("../rulesets/types").DetailBox[]>} */
const ABILITY_BOXES = {
  strength: [
    { label: "Hit", path: "hitadj", format: "signed", title: "Hit probability adjustment" },
    { label: "Dmg", path: "dmgadj", format: "signed", title: "Damage adjustment" },
    { label: "Allow", path: "weightallow", title: "Weight allowance (lb.)" },
    { label: "Doors", path: "opendoors", format: "text", title: "Open doors (locked doors in brackets)" },
    { label: "Bars", path: "bendbars", format: "percent", title: "Bend bars / lift gates" },
  ],
  dexterity: [
    { label: "Reaction", path: "reactionadj", format: "signed", title: "Reaction adjustment (surprise)" },
    { label: "Missile", path: "missileadj", format: "signed", title: "Missile attack adjustment" },
    { label: "Defense", path: "defenseadj", format: "signed", title: "Defensive adjustment (to Armor Class)" },
  ],
  constitution: [
    { label: "HP", path: "hitpointadj", format: "signed", title: "Hit point adjustment a level" },
    { label: "Warrior", path: "warriorhpadj", format: "signed", title: "Hit point adjustment a level for warriors" },
    { label: "Shock", path: "systemshock", format: "percent", title: "System shock" },
    { label: "Res.", path: "resurrectionsurvival", format: "percent", title: "Resurrection survival" },
  ],
  intelligence: [
    { label: "Lang.", path: "languages", title: "Number of languages" },
    { label: "Spell lvl", path: "spelllevel", format: "dash", title: "Highest spell level (wizards)" },
    { label: "Learn", path: "learn", format: "percent", title: "Chance to learn a spell" },
    { label: "Max", path: "maxspells", format: "all", title: "Most spells known a level" },
  ],
  wisdom: [
    { label: "Magic def.", path: "magicdefenseadj", format: "signed", title: "Magical defense adjustment" },
    { label: "Bonus", path: "spellbonus", format: "text", title: "Bonus spells (priests)" },
    { label: "Failure", path: "failure", format: "percent", title: "Chance of spell failure (priests)" },
  ],
  charisma: [
    { label: "Hench.", path: "maxhench", title: "Most henchmen" },
    { label: "Loyalty", path: "loyalty", format: "signed", title: "Loyalty base" },
    { label: "Reaction", path: "reaction", format: "signed", title: "Reaction adjustment" },
  ],
};
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "adnd2e",
  names: ["AD&D 2E"],
  blurb: "Second Edition with your 2E books: THAC0 and descending Armor Class, the five saving throws, d10 initiative lowest first, thief skills, multi-classing, your books' pregenerated characters.",
  engine: "shared/adnd2e/rules.mjs",
  host: { module: "electron/adnd2e.cjs" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["plus2", "minus2", "max", "half"] } },
  sheet: {
    level: "arrange",
    className: "sheet-5e sheet-35 sheet-2e",
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
          { kind: "levels", path: "classes", exp: "exp", next: "expnext", max: MAX_LEVEL, title: "{name}: {exp|0} of {expnext|nz:—} XP", buttonTitle: "Level up as a {name|lower}: the host rolls the hit die", hook: "adnd2e.classKey" },
          { kind: "xp", path: "exp", next: "expnext", label: "Experience" },
          { kind: "value", label: "THAC0", path: "thaco", hook: "thaco", title: "To Hit Armor Class 0: an attack hits when d20 + modifiers reaches THAC0 - the target's AC" },
          { kind: "modifier", key: "mod", label: "Mod", aria: "Roll modifier", title: "A modifier for the next roll: added to a save, taken off an ability check or a thief skill's d100", min: -20, max: 20 },
        ],
      },
    ],
    tabs: [
      {
        id: "main",
        parts: [
          {
            part: "row",
            className: "cc-main-grid five-main d2e-main",
            parts: [
              {
                part: "statBlock",
                label: "Abilities",
                hook: "ability",
                head: false,
                plain: true,
                rowClass: "five-ability d2e-ability",
                rows: STATS.map((key) => ({ key, label: titled(key) })),
                columns: [
                  {
                    label: "Score",
                    path: "abilities.{key}.score",
                    field: { kind: "number", label: "{key} score" },
                    wrap: "d2e-score",
                    // A warrior's 18 Strength has its percentile (18/76).
                    extra: {
                      when: { all: [{ is: { path: "key", values: ["strength"] } }, { is: { path: "abilities.strength.score", values: ["18"] } }, { some: { path: "classes", cond: { is: { path: "group", values: ["warrior"] } } } }] },
                      before: "/",
                      field: { path: "abilities.strength.percent", kind: "number", label: "Exceptional strength" },
                    },
                  },
                  { label: "Check", roll: { action: roll("check"), hook: "roll-check", label: "d20", icon: "die", title: "Roll a {key} check: d20 at or under {abilities.{key}.score|0}", aria: "{key} check" } },
                ],
                // What each ability's table gives at this score, as small boxes beside it.
                rowBoxes: { row: "abilities.{key}", boxes: ABILITY_BOXES },
              },
              {
                part: "statBlock",
                label: "Saving throws",
                hook: "save",
                base: "cc-panel d2e-saves",
                heading: { text: "Saving throws", hint: "misc · roll d20 at or above" },
                rowClass: "five-ability d35-save",
                rowTitle: "Base {saves.{key}.base|0}[, racial -{saves.{key}.racial}][, misc -{saves.{key}.misc}]",
                plain: true,
                rows: SAVES.map((key) => ({ key, label: SAVE_WORDS[key] })),
                columns: [{ label: "Misc", path: "saves.{key}.misc", field: { kind: "number", label: "{key} misc" } }],
                roll: { action: roll("save", { fight: true }), hook: "roll-save", className: "cc-save", label: "{saves.{key}.total|0}", title: "Roll a save: d20 at or above {saves.{key}.total|0}", aria: "{key} save" },
                notes: "savenotes",
              },
          {
            part: "derived",
            className: "d2e-combat",
            boxes: [
                  {
                    label: "Armor Class",
                    show: "shield",
                    path: "ac.total",
                    hook: "ac",
                    title: "Armor {ac.armor|0}, shield -{ac.shield|0}, magic -{ac.magic|0}, Dexterity {ac.dex|signed}, misc {ac.misc|signed}",
                    lines: [{ sep: " · ", items: [{ before: "Rear", value: "ac.rear" }, { before: "No shield", value: "ac.shieldless" }, { before: "Misc", field: { path: "ac.misc", kind: "number", label: "AC misc" } }] }],
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
                    lines: [{ items: [{ before: "Wounds", field: { path: "hp.wounds", kind: "number", label: "Wounds" } }, { before: "Temp", field: { path: "hp.temp", kind: "number", label: "Temporary hit points" } }] }],
                    states: [
                      { status: "Dead", atMost: -10, text: "Dead." },
                      { status: "Dying", atMost: 0, when: { not: { positive: "stable" } }, text: "Dying: unconscious, 1 hit point lost each round until someone binds the wounds; dead at -10." },
                      { status: "Unconscious", atMost: 0, text: "Unconscious: the wounds are bound; no longer dying." },
                    ],
                  },
                  { label: "Initiative", show: "value", path: "initiative.total", hook: "init", format: "signed", title: "d10 + this, lowest acts first" },
                  { label: "Movement", show: "field", path: "movement", field: { path: "movement", kind: "number", label: "Movement" } },
            ],
          },
            ],
          },
        ],
      },
      {
        id: "combat",
        page: "panel",
        parts: [
          { part: "heading", text: ["Attacks "], targets: true },
          { part: "hint", text: ["THAC0 ", "{thaco|0}", ": d20 + to-hit at or above THAC0 - the target's AC. Attacks a round ", "{rate|1/1}", "."] },
          {
            part: "list",
            path: "attacks",
            hook: "attack",
            className: "five-attacks",
            name: { path: "name", bold: true, flat: true },
            smalls: [
              { place: "name", text: "(nonproficient)", title: "Not proficient", when: { is: { path: "proficient", values: ["false"] } } },
              { place: "end", text: ["SF ", "{speed|0}"], title: "Speed factor" },
            ],
            rowActions: [
              { hook: "attack", label: "{tohit|signed}", title: "One attack roll at each target", action: { ct: "attack", key: "weapon" } },
              { hook: "full-attack", label: "{rate}", title: "A full round's attacks ({rate}) at the first target", when: { not: { is: { path: "rate", values: ["1/1"] } } }, action: { ct: "attack", key: "weapon", args: { full: true } } },
              { hook: "damage", label: ["{damage}", " / ", "{damagelarge}"], title: "Damage roll: Small or Medium / Large (by the target)", action: { ct: "damage-roll", key: "weapon" } },
            ],
          },
          { part: "heading", text: ["Weapon proficiencies "], hint: ["{profs.weaponslots|0}", " slots; nonproficient ", "{profs.penalty|signed}", " to hit"] },
          { part: "notes", fields: [{ path: "profs.weapon", label: "Weapon proficiencies", kind: "textarea", lines: true, bare: true }] },
        ],
      },
      {
        id: "skills",
        page: "panel",
        parts: [
          { part: "heading", text: ["{skillclass|Thief}", " skills "], hint: ["d100 at or under; ", "{thiefskills|sum:points}", " of ", "{skillpoints|0}", " points spent"], when: { rows: "thiefskills" } },
          {
            part: "skills",
            path: "thiefskills",
            hook: "skill",
            className: "five-skills d2e-skills",
            rowTitle: "Base {base|0}, race {race|signed}, Dexterity {dex|signed}, points {points|0}, misc {misc|signed}",
            field: { path: "points", kind: "number", label: "{name} points" },
            name: "name",
            roll: { action: roll("skill", { keyAs: "skill" }), hook: "roll-skill", label: ["{total|0}", "%"], aria: "Roll {name}" },
            when: { rows: "thiefskills" },
          },
          { part: "heading", text: ["Nonweapon proficiencies "], hint: ["{profs.nonweaponslots|0}", " slots"] },
          { part: "notes", fields: [{ path: "profs.nonweapon", label: "Nonweapon proficiencies", kind: "textarea", lines: true, bare: true }] },
          { part: "hint", text: "One a line. A proficiency check is an ability check (Mod: the proficiency's modifier)." },
        ],
      },
      {
        id: "spells",
        page: "panel",
        parts: [
          {
            part: "track",
            style: "boxes",
            each: "spellcasting",
            className: "d35-perday",
            attr: { name: "perday", value: "{class}" },
            intro: ["{class}", " (", { if: { is: { path: "kind", values: ["arcane"] } }, then: "wizard", else: "priest" }, " spells a day). Click a box to use a spell of that level, again to get it back."],
            max: "perday",
            used: "used",
            rowClass: "d35-slots",
            rowHook: "spell-level",
            labels: ORDINAL,
            aria: "{class} {label} level spell {n}",
            when: { rows: "spellcasting" },
          },
          { part: "hint", text: "This character casts no spells (yet: paladins from 9th level, rangers from 8th, bards from 2nd).", when: { not: { rows: "spellcasting" } } },
          { part: "heading", text: "Spells known or memorized" },
          { part: "notes", fields: [{ path: "spells", label: "Spells", kind: "textarea", lines: true, bare: true }] },
          { part: "custom", component: "core.spellCasts" },
          { part: "hint", text: "One spell a line, or drop a spell on the sheet." },
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
          { part: "hint", text: ["Infravision ", "{infravision}", " feet."], when: { positive: "infravision" } },
          { part: "notes", fields: [{ path: "notes", kind: "textarea", label: "Notes", bare: true }] },
        ],
      },
    ],
  },
  // What the sheet may change (the host's whitelist, electron/adnd2e.cjs): "*" one id-n key, "#" a digit, "%" a word,
  // "(a|b)" either; lists: one item a line; remove: the lists whose rows the sheet may drop.
  edit: {
    text: ["playername", "alignment", "deity", "appearance", "notes", "background", "race", "gender", "age", "height", "weight", "languages"],
    number: [
      "abilities.(strength|dexterity|constitution|intelligence|wisdom|charisma).score",
      "abilities.strength.percent",
      "saves.(paralyzation|rod|petrification|breath|spell).misc",
      "thiefskills.%.(points|misc)",
      "hp.(total|wounds|temp)",
      "exp",
      "ac.misc",
      "initiative.misc",
      "movement",
      "stable",
      "spellcasting.#.used.#",
      "coins.*.amount",
      "inventorylist.*.(count|carried)",
    ],
    // The container an item is in (FG's location), set by dragging it onto a backpack on the sheet.
    string: ["inventorylist.*.location"],
    list: ["spells", "profs.(weapon|nonweapon)"],
    remove: ["inventorylist"],
  },
  wizard: "adnd2e.wizard",
  blank: false,
  features: ["turnUndead", "multiAttack", "dying.save", "thiefSkills", "spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp", groupCheck: { stats: [], rolls: [{ kind: "save", label: "Save", options: PARTY_SAVES.map((value) => ({ value, label: titleOf(value) })) }, { kind: "check", label: "Check", options: PARTY_STATS.map((value) => ({ value, label: titleOf(value) })) }, { kind: "skill", label: "Thief skill", options: Object.entries(PARTY_SKILLS).map(([value, row]) => ({ value, label: String(row[0]) })) }] } },
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
