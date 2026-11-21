// @ts-check
// Castles & Crusades (SiegeCore): the default ruleset. A character with no data.ruleset is C&C's.
// Its sheet is the core's parts (docs/core-ui-design.md 8): who they are on top (race, class with its Class & Level
// button, player), the strip (level and level-up, experience, the CL every check and save is rolled against), then
// Main, Combat, Abilities, Inventory, Spells and Notes. The host works out every number again from what is typed
// (the SIEGE rules); its own parts (src/rulesets/cnc.tsx) are the weapons, abilities, inventory, load, spells,
// languages and the Class & Level panel.

const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const NAMES = { strength: "Strength", dexterity: "Dexterity", constitution: "Constitution", intelligence: "Intelligence", wisdom: "Wisdom", charisma: "Charisma" };
const SHORT = { strength: "Str", dexterity: "Dex", constitution: "Con", intelligence: "Int", wisdom: "Wis", charisma: "Cha" };
// C&C's saving throws, by attribute (the Player's Handbook).
const SAVES = {
  strength: "Paralysis & Constriction",
  dexterity: "Breath Weapon & Traps",
  constitution: "Disease, Energy Drain & Poison",
  intelligence: "Arcane Magic & Illusion",
  wisdom: "Divine Magic, Confusion, Gaze Attack, Polymorph, Petrification",
  charisma: "Death Attack, Charm & Fear",
};
const ATTACKS = ["melee", "ranged", "grapple", "pummel", "overbear", "touch"];
const word = (/** @type {string} */ text) => text[0].toUpperCase() + text.slice(1);

/** @type {import("../rulesets/types").SheetSpec} */
const sheet = {
  level: "arrange",
  className: "sheet-5e sheet-cnc",
  art: ["race", "species"],
  header: {
    identity: [
      { path: "race", label: "Race", format: "cnc.race", hook: "race" },
      { path: "classes", label: "Class", format: "cnc.classes", hook: "class" },
    ],
    // The player's name (the owner's until one is typed), then the Class & Level button.
    custom: ["cnc.player", "cnc.classButton"],
  },
  top: [
    {
      part: "strip",
      items: [
        { kind: "level", path: "level", exp: "exp", next: "expnext", max: 99, title: "Level up: enough experience for the next level (the GM: any time)" },
        { kind: "xp", path: "exp", next: "expnext", label: "Experience" },
        { kind: "modifier", key: "cl", label: "CL", aria: "Challenge level", title: "The Challenge Level every check and save is rolled against", min: -10, max: 30 },
        { kind: "hint", text: "d20 + bonus against 12 + CL (prime) or 18 + CL" },
      ],
    },
  ],
  tabs: [
    {
      id: "main",
      parts: [
        { part: "custom", component: "cnc.classPanel" },
        {
          part: "row",
          className: "cc-main-grid five-main cnc-main",
          parts: [
            {
              part: "statBlock",
              label: "Attributes",
              hook: "attr",
              className: "cnc-attributes",
              rows: STATS.map((key) => ({ key, label: NAMES[/** @type {keyof typeof NAMES} */ (key)] })),
              columns: [
                { label: "Score", path: "attributes.{key}.score", field: { label: "{key} score", kind: "number" } },
                { label: "Check", roll: { action: { roll: "check", dc: "cl" }, label: "{attributes.{key}.bonus|signed}", title: "Roll a {key} check against the CL", aria: "{key} check", hook: "roll-check" } },
                { label: "Prime", path: "attributes.{key}.prime", field: { label: "{key} prime", kind: "check", title: "Prime: checks and saves against 12, not 18" } },
              ],
            },
            {
              part: "statBlock",
              label: "Saving throws",
              hook: "save",
              base: "cc-panel cnc-saves",
              heading: { text: "Saving throws", hint: "roll against the CL" },
              rowClass: "five-ability cnc-save",
              rows: STATS.map((key) => ({ key, label: SAVES[/** @type {keyof typeof SAVES} */ (key)], short: SHORT[/** @type {keyof typeof SHORT} */ (key)] })),
              columns: [{ label: "Save", roll: { action: { roll: "save", dc: "cl", fight: true }, label: "{label}", title: "Roll a {key} save against the CL", aria: "{key} save", hook: "roll-save", className: "cc-save" } }],
            },
            {
              part: "derived",
              className: "cnc-combat",
              boxes: [
                {
                  label: "Armor Class",
                  title: "Flat-footed (no Dexterity) {ac.flatfooted|0}, touch {ac.touch|0}",
                  show: "shield",
                  path: "ac.total",
                  hook: "ac",
                  lines: [{ items: [{ before: "-Dex", value: "ac.flatfooted" }, { before: "Touch", value: "ac.touch" }] }],
                },
                {
                  label: "Hit Points",
                  show: "remaining",
                  path: "hp.total",
                  minus: "hp.wounds",
                  quick: true,
                  hook: "hp",
                  danger: true,
                  fields: [
                    { path: "hp.wounds", label: "Wounds", kind: "number", before: "Wounds" },
                    { path: "hp.temp", label: "Temporary hit points", kind: "number", before: "Temp" },
                    { path: "hp.nonlethal", label: "Nonlethal damage", kind: "number", before: "Nonlethal" },
                  ],
                },
                { label: "Initiative", show: "value", path: "initiative.bonus", hook: "init", format: "signed" },
                { label: "Melee", title: "Bonus to hit + Strength", show: "value", path: "attack.melee.total", hook: "melee", format: "signed" },
                { label: "Ranged", title: "Bonus to hit + Dexterity", show: "value", path: "attack.ranged.total", hook: "ranged", format: "signed" },
                { label: "Move", show: "field", path: "speed", field: { path: "speed", label: "Move", kind: "text" } },
              ],
            },
            {
              part: "notes",
              section: { className: "cc-panel cnc-more", aria: "Defenses and senses" },
              fields: [
                { path: "specialdefenses", label: "Special defenses", kind: "textarea", plain: true },
                { path: "senses", label: "Senses", kind: "text" },
                { path: "specialmovement", label: "Special movement", kind: "text" },
              ],
            },
          ],
        },
        { part: "hint", text: ["Primes chosen ", "{primes.chosen|0}"] },
      ],
    },
    {
      id: "combat",
      parts: [
        {
          part: "row",
          className: "cc-main-grid five-main cnc-combat-tab",
          parts: [
            {
              part: "derived",
              className: "cnc-ac",
              boxes: [
                {
                  label: "Armor Class",
                  show: "shield",
                  path: "ac.total",
                  hook: "ac",
                  lines: [
                    { items: [{ before: "Armor", value: "ac.equipmentarmor" }, { before: "Shield", value: "ac.shield" }, { before: "Dex", value: "ac.dex" }] },
                    { items: [{ before: "-Dex", value: "ac.flatfooted" }, { before: "Touch", value: "ac.touch" }] },
                  ],
                  fields: [
                    { path: "ac.size", label: "Size modifier", kind: "number", before: "Size" },
                    { path: "ac.natural", label: "Natural armor", kind: "number", before: "Natural" },
                    { path: "ac.deflection", label: "Deflection modifier", kind: "number", before: "Deflection" },
                    { path: "ac.misc", label: "Misc modifier", kind: "number", before: "Misc" },
                  ],
                },
                { label: "Initiative", show: "value", path: "initiative.bonus", format: "signed", fields: [{ path: "initiative.misc", label: "Initiative misc", kind: "number", before: "Misc" }] },
                { label: "Spell Resistance", show: "value", path: "sr.item", sum: ["sr.misc"], fields: [{ path: "sr.item", label: "Spell resistance from items", kind: "number", before: "Item" }, { path: "sr.misc", label: "Spell resistance misc", kind: "number", before: "Misc" }] },
              ],
            },
            {
              part: "statBlock",
              label: "Bonus to hit",
              hook: "tohit",
              base: "cc-panel cnc-tohit",
              rows: ATTACKS.map((key) => ({ key, label: word(key) })),
              columns: [
                { label: "Total", path: "attack.{key}.total", field: { label: "{key} total", show: "{attack.{key}.total|signed}" } },
                { label: "Ability", path: "attack.{key}.attr", field: { label: "{key} ability", show: "{attack.{key}.attr|signed}" } },
                { label: "Misc", path: "attack.{key}.misc", field: { label: "{key} misc", kind: "number" } },
              ],
            },
          ],
        },
        { part: "derived", className: "cnc-bth", boxes: [{ label: "Bonus to Hit", title: "The class's bonus to hit at this level", show: "value", path: "bth", hook: "bth", format: "signed" }, { label: "Move", show: "text", path: "speed", text: "{speed}" }] },
        { part: "custom", component: "cnc.weapons" },
      ],
    },
    { id: "abilities", parts: [{ part: "custom", component: "cnc.abilities" }] },
    {
      id: "inventory",
      parts: [
        { part: "custom", component: "cnc.inventory" },
        {
          part: "row",
          className: "cc-main-grid even",
          parts: [
            { part: "custom", component: "cnc.load" },
            { part: "coins", path: "coins", className: "cc-panel cc-coins five-coins", upper: true, none: { text: "No coin.", unless: "." } },
          ],
        },
      ],
    },
    { id: "spells", parts: [{ part: "custom", component: "cnc.spells" }] },
    {
      id: "notes",
      parts: [
        {
          part: "notes",
          section: { className: "cc-panel cc-notes-who", aria: "Who they are" },
          fields: [
            { path: "gender", label: "Gender", kind: "text" },
            { path: "age", label: "Age", kind: "text" },
            { path: "height", label: "Height", kind: "text" },
            { path: "weight", label: "Weight", kind: "text" },
            { path: "size", label: "Size", kind: "text" },
            { path: "alignment", label: "Alignment", kind: "text" },
            { path: "deity", label: "Religion", kind: "text" },
            { path: "origin", label: "Place of origin", kind: "text" },
          ],
        },
        {
          part: "row",
          className: "cc-main-grid even",
          parts: [
            { part: "notes", section: { className: "cc-panel", aria: "How they look" }, fields: [{ path: "appearance", label: "Appearance", kind: "textarea", plain: true }] },
            { part: "custom", component: "cnc.languages" },
          ],
        },
        { part: "notes", section: { className: "cc-panel cnc-notes", aria: "Their notes" }, fields: [{ path: "notes", label: "Notes", kind: "textarea", plain: true }] },
      ],
    },
  ],
};

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "cnc",
  // Where a character keeps its classes: its class packages (SiegeCore's).
  classes: { rows: "packages", where: { packagetype: "class" }, name: "name", level: "level" },
  names: ["Castles & Crusades"],
  blurb: "SiegeCore rules: character sheets, the SIEGE engine, combat and spells.",
  engine: "shared/siege/engine.mjs",
  host: { module: "electron/siege.cjs", message: "siege-check", tool: "kraken_siege_check" },
  // The modifier box's keys beside the chat (shared/rulesets/modifiers.mjs).
  dice: { modifiers: { presets: ["plus2", "minus2"] } },
  sheet,
  wizard: "cnc.wizard",
  blank: true,
  features: ["encumbrance", "spellbooks"],
  party: { currency: ["PP", "GP", "EP", "SP", "CP"], xp: "xp" },
  tracker: { saves: { keys: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"], modLabel: "CL", modAria: "Save CL", button: "Roll save" } },
  calendar: "greyhawk",
  // What the sheet may change: electron/siege.cjs's own whitelist (TEXT_FIELDS, NUMBER_FIELDS), written here for
  // scripts/check-manifests.mjs; the host keeps its own. Items and languages are added by name and dropped (null).
  edit: {
    text: ["playername", "gender", "age", "height", "weight", "size", "alignment", "deity", "origin", "appearance", "notes", "specialdefenses", "specialmovement", "senses", "speed", "inventorylist.*.location"],
    number: ["attributes.(strength|dexterity|constitution|intelligence|wisdom|charisma).(score|prime)", "hp.(wounds|temp|nonlethal)", "exp", "initiative.misc", "attack.(melee|ranged|grapple|pummel|overbear|touch).misc", "ac.(misc|natural|deflection|size)", "sr.(item|misc)", "coins.*.amount", "inventorylist.*.(count|carried)"],
    remove: ["inventorylist", "languagelist"],
  },
};
