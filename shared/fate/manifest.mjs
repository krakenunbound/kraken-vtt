// @ts-check
// Fate Core and, as its variant, Fate Accelerated (approaches for skills).
const APPROACHES = ["careful", "clever", "flashy", "forceful", "quick", "sneaky"];
import { FREE_STUNTS } from "./rules.mjs";

// The turn order without dice (Notice, FAE Quick), and the conflict (physical or mental) on the GM's header.
const ORDER = { rollAll: "Turn order", rollAllTitle: "The turn order, without dice: Notice (FAE Quick) in a physical conflict, Empathy (Careful) in a mental one", own: "Order", ownTitle: "My place in the turn order (Notice; FAE Quick)" };
/** @type {import("../rulesets/types").Ref[]} */
const HEADER = ["fate.conflict"];

const FAE = { is: { path: "game", values: ["fae"] } };
/** @param {string} id @param {string} label @returns {import("../rulesets/types").FieldSpec} */
const aspect = (id, label) => ({ path: `aspects.${id}`, label, kind: "text", fieldClass: "fate-aspect", box: { attr: { name: "aspect-key", value: id } } });
/** @param {1 | 2 | 3} n @param {string} title @returns {import("../rulesets/types").FieldSpec} */
const phase = (n, title) => ({
  path: `phases.p${n}.story`,
  label: `Phase ${n}`,
  kind: "textarea",
  note: ["Phase ", String(n), ": ", { if: { defined: `phases.p${n}.title` }, then: `{phases.p${n}.title}`, else: title }, { if: { has: `phases.p${n}.guest` }, then: ` (with {phases.p${n}.guest})`, else: "" }],
});

// The sheet (Fate Core and Fate Accelerated, one sheet; data.game says which), core parts
// (docs/core-ui-design.md 7.17): fate points, refresh and the state in the header; the aspects; Fate's own
// roll bar and skills (or approaches), stress and consequences, last roll and compels (src/rulesets/fate.tsx);
// stunts, milestones and the notes (the phase trio, Core's).
/** @type {import("../rulesets/types").SheetSpec} */
const sheet = {
  level: "arrange",
  className: "sheet-5e sheet-fate",
  attrs: [{ name: "game", value: { if: FAE, then: "fae", else: "core" } }],
  header: {
    note: ["Name · ", { if: FAE, then: "Fate Accelerated", else: "Fate Core" }],
    identity: [
      { path: "fatepoints", label: "Fate points", default: 0, attr: "data-fatepoints", box: { className: "fate-points", title: "Fate points: spend one to invoke an aspect; a compel accepted gives one" } },
      { path: "refresh", label: "Refresh", default: 0, attr: "data-refresh", box: { title: `Refresh: {refreshbase|nz:3}, less a point for each stunt past ${FREE_STUNTS}; your fate points come back up to it each session` } },
      { path: "status", label: "State", when: { has: "status" }, attr: "data-fate-status", color: { if: { is: { path: "status", values: ["Harmed"] } }, then: "#c08000", else: "#c0392b" } },
    ],
  },
  tabs: [
    {
      id: "main",
      parts: [
        { part: "notes", section: { className: "cc-panel fate-aspects", aria: "Aspects" }, fields: [aspect("highconcept", "High Concept"), aspect("trouble", "Trouble"), aspect("a1", "Aspect"), aspect("a2", "Aspect"), aspect("a3", "Aspect")] },
        { part: "custom", component: "fate.rollBar" },
        { part: "row", className: "cc-main-grid five-main", parts: [{ part: "custom", component: "fate.skills" }, { part: "custom", component: "fate.harm" }] },
        { part: "custom", component: "fate.lastRoll" },
        { part: "custom", component: "fate.compels" },
        { part: "custom", component: "fate.problem" },
      ],
    },
    {
      id: "stunts",
      page: "panel",
      parts: [
        { part: "hint", text: [String(FREE_STUNTS), " stunts are free; each one more costs a refresh (refresh ", "{refresh|0}", ", never below 1)."] },
        { part: "custom", component: "fate.stunts" },
        { part: "notes", fields: [{ path: "extras", label: "Extras", kind: "textarea", note: "Extras and what the party found (gear, allies, places: aspects or stunts to be)" }] },
      ],
    },
    {
      id: "milestones",
      page: "panel",
      parts: [
        { part: "hint", text: "Fate has no experience: characters change at milestones." },
        { part: "custom", component: "fate.milestones" },
      ],
    },
    {
      id: "notes",
      page: "panel",
      parts: [
        { part: "notes", when: { not: FAE }, fields: [phase(1, "Your adventure"), phase(2, "Crossing paths"), phase(3, "Crossing paths again")] },
        { part: "notes", fields: [{ path: "description", label: "Description", kind: "textarea" }, { path: "notes", label: "Notes", kind: "textarea", bare: true }] },
      ],
    },
  ],
};

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "fate",
  names: ["Fate Core", "Fate Accelerated"],
  blurb: "Fate Core System (Evil Hat, CC BY 3.0): four Fate dice and the ladder, aspects invoked and compelled with fate points, a pyramid of skills, stunts, stress and consequences, conflicts in shifts. Its book, the Toolkit and Adversaries and a starter scenario come with Kraken.",
  engine: "shared/fate/rules.mjs",
  host: { module: "electron/fate.cjs", message: "fate", tool: "kraken_fate" },
  records: { fateskill: { label: "Skills" }, fatestunt: { label: "Stunts" }, npc: { label: "NPCs" }, pregencharsheet: { label: "Pregenerated Characters" } },
  sheet,
  wizard: "fate.wizard",
  blank: false,
  features: ["fatePoints", "stressConsequences", "sceneAspects"],
  party: { currency: [], xp: "milestone", groupCheck: { stats: ["Athletics", "Notice", "Will", "Physique", "Stealth", "Investigate", "Lore", "Rapport"] } },
  tracker: { saves: { keys: ["Athletics", "Fight", "Notice", "Physique", "Provoke", "Shoot", "Stealth", "Will"], modLabel: "CL", modAria: "Save CL", button: "Roll save" }, initiative: ORDER, headerParts: HEADER },
  dice: { extraTray: ["dF"], modifiers: { presets: ["plus2", "minus2"] } },
  // The words and numbers the sheet (and kraken_character_edit) may change: the host's whitelist (electron/fate.cjs),
  // in its order. Its name and "out" (taken out or conceded) stay the host's own.
  edit: {
    text: ["description", "notes", "playername", "extras"],
    string: ["aspects.(highconcept|trouble|a1|a2|a3)", "phases.p[123].(title|story|aspect|guest)", "stunts.*.(name|text|skill)", "consequences.(mild|moderate|severe|extreme|mild2|mild3).text", "milestones.*.text"],
    number: ["skills.[A-Za-z][\\w' -]{0,39}", "approaches.(careful|clever|flashy|forceful|quick|sneaky)", "fatepoints", "refreshbase", "skillpoints", "stress.(physical|mental|stress).#", "consequences.(mild|moderate|severe|extreme|mild2|mild3).recovering"],
    remove: ["stunts", "milestones"],
  },
  strips: ["fate.sceneAspects"],
  variants: {
    "Fate Accelerated": {
      blurb: "Fate Accelerated Edition (Evil Hat, CC BY 3.0): Fate with six approaches (Careful, Clever, Flashy, Forceful, Quick, Sneaky) instead of skills, three stress boxes, a character in minutes. Its book, the Toolkit and Adversaries and a starter scenario come with Kraken.",
      records: { fateskill: { label: "Approaches" } },
      features: ["fatePoints", "stressConsequences", "sceneAspects", "approaches"],
      party: { currency: [], xp: "milestone", groupCheck: { stats: APPROACHES } },
      tracker: { saves: { keys: APPROACHES, modLabel: "CL", modAria: "Save CL", button: "Roll save" }, initiative: ORDER, headerParts: HEADER },
    },
  },
};
