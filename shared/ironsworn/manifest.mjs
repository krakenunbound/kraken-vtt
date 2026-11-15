// @ts-check
// Ironsworn (with Delve) and, as its variant, Starforged: one sheet (data.game says which).
// The sheet is core parts (docs/core-ui-design.md 7.15): momentum, experience and the initiative (or position)
// button on top, the last move over every tab, then Main (stats to roll, health, spirit, supply and momentum,
// debilities or impacts), Moves, Progress and Assets (the game's own pages) and Notes.
import { STAT_NAMES, STATS } from "./rules.mjs";

const SF = { is: { path: "game", values: ["starforged"] } };
// A meter's or momentum's step: the host adjusts it; a refusal shows on the sheet's error line.
/** @param {string} what @param {number} delta @returns {import("../rulesets/types").StepSpec} */
const step = (what, delta) => ({ hook: `${what}-${delta < 0 ? "down" : "up"}`, label: delta < 0 ? "−" : "+", aria: `${what} ${delta < 0 ? "down" : "up"}`, action: { message: "ironsworn", action: "adjust", args: { what, delta }, problem: "problem" } });
/** @param {string} meter @param {string | string[]} label @returns {import("../rulesets/types").BoxSpec} */
const meter = (meter, label) => ({ label, attr: { name: "meter", value: meter }, show: "text", path: `meters.${meter}`, hook: meter, text: [`{meters.${meter}|0}`, " / 5"], steps: [step(meter, -1), step(meter, 1)] });

/** @type {import("../rulesets/types").SheetSpec} */
const sheet = {
  level: "arrange",
  className: "sheet-5e sheet-ironsworn",
  attrs: [{ name: "game", value: { if: SF, then: "starforged", else: "classic" } }],
  header: {
    identity: [
      { path: "momentum", label: "Momentum (max {momentummax|0}, reset {momentumreset|0})", hook: "momentum", attr: "data-momentum", show: "{momentum|signed}" },
      { path: "experience", label: "Experience to spend / earned", hook: "experience", show: ["{experience.available|0}", " / ", "{experience.earned|0}"] },
    ],
    custom: ["ironsworn.control"],
  },
  top: [
    { part: "custom", component: "ironsworn.lastRoll" },
    { part: "custom", component: "ironsworn.problem" },
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
              label: "Stats",
              hook: "stat-row",
              className: "iron-stats",
              head: false,
              plain: true,
              rows: STATS.map((key) => ({ key, label: STAT_NAMES[/** @type {keyof typeof STAT_NAMES} */ (key)] })),
              columns: [],
              roll: { action: { roll: "check" }, label: "{stats.{key}|0}", title: "Roll +{key}: d6 + {stats.{key}|0} against two d10", aria: "{key} roll", hook: "roll-stat" },
            },
            {
              part: "derived",
              className: "iron-meters",
              boxes: [
                meter("health", "Health"),
                meter("spirit", "Spirit"),
                meter("supply", ["Supply", " (shared)"]),
                {
                  label: "Momentum",
                  attr: { name: "meter", value: "momentum" },
                  show: "value",
                  path: "momentum",
                  format: "signed",
                  steps: [step("momentum", -1), step("momentum", 1), { label: "Reset", className: "ghost", title: "Reset momentum to {momentumreset|0} (after burning it)", action: { message: "ironsworn", action: "burn-reset", problem: "problem" } }],
                },
              ],
            },
          ],
        },
        { part: "custom", component: "ironsworn.debilities" },
      ],
    },
    { id: "moves", page: "none", parts: [{ part: "custom", component: "ironsworn.moves" }] },
    { id: "progress", page: "none", parts: [{ part: "custom", component: "ironsworn.progress" }] },
    { id: "assets", page: "none", parts: [{ part: "custom", component: "ironsworn.assets" }] },
    {
      id: "notes",
      page: "panel",
      parts: [
        { part: "notes", className: "cc-boxes", when: SF, fields: [{ path: "pronouns", label: "Pronouns", kind: "text" }, { path: "callsign", label: "Callsign", kind: "text" }] },
        { part: "notes", fields: [{ path: "look", label: "Look", kind: "text" }] },
        { part: "notes", fields: [{ path: "background", label: { if: SF, then: "Backstory", else: "Background" }, kind: "textarea" }] },
        { part: "heading", text: "What they carry", hint: "Ironsworn has no money: wealth is supply; anything special is an asset" },
        { part: "list", path: "inventorylist", hook: "item", name: { path: "name", after: { if: { not: { below: { path: "count", value: 2 } } }, then: " ×{count}", else: "" } }, remove: { aria: "Drop {name}" } },
        { part: "custom", component: "ironsworn.carryLine" },
        { part: "notes", fields: [{ path: "notes", label: "Notes", kind: "textarea" }] },
      ],
    },
  ],
};

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "ironsworn",
  names: ["Ironsworn", "Starforged"],
  blurb: "Ironsworn and Ironsworn: Delve (Shawn Tomkin, CC BY 4.0; an unofficial adaptation): vows sworn upon iron, the action die against two challenge dice, momentum, progress tracks, assets, the oracles for play with or without a GM, Delve's sites. Its Reference, Foes and Sites and The Cinder Barrow come with Kraken.",
  engine: "shared/ironsworn/rules.mjs",
  host: { module: "electron/ironsworn.cjs", message: "ironsworn", tool: "kraken_ironsworn" },
  // No modifier stack: an action roll's adds are chosen on the move itself (the action die is never past 10).
  dice: { modifiers: false },
  records: { npc: { label: "Foes" } },
  sheet,
  wizard: "ironsworn.wizard",
  blank: false,
  features: ["oracles", "delve", "progressTracks", "momentum", "assetsCards"],
  party: { currency: ["Supply"], xp: "xp" },
  // A character's initiative on the tracker, in the game's words.
  tracker: { control: { on: "Initiative", off: "No initiative", title: "Initiative" } },
  // The words the sheet (and kraken_character_edit) may change: the host's whitelist (electron/ironsworn.cjs). Its
  // numbers, marks, tracks, assets and carried things stay the host's own (each with its own rule).
  edit: { text: ["look", "background", "notes", "pronouns", "callsign", "epilogue"], number: [], remove: ["inventorylist"] },
  windows: [
    // The oracles, for everyone (often played without a GM); Delve's sites, the GM's.
    { kind: "oracles", label: "Oracles", icon: "sparkle", title: "Oracles", feature: "oracles" },
    { kind: "delve", label: "Delve Sites", icon: "map", title: "Delve Sites", gm: true, feature: "delve" },
  ],
  variants: {
    Starforged: {
      blurb: "Ironsworn: Starforged (Shawn Tomkin, CC BY 4.0; an unofficial adaptation): a spacefarer's vows in the Forge, in control or in a bad spot, legacy tracks for experience, connections, your starship, the Forge's oracles. Its Reference, Foes and The Silent Hulk come with Kraken.",
      features: ["oracles", "progressTracks", "momentum", "assetsCards"],
      tracker: { control: { on: "In control", off: "Bad spot", title: "In control or in a bad spot" } },
    },
  },
};
