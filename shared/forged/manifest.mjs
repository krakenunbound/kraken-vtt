// @ts-check
// Forged in the Dark (the Blades in the Dark SRD): its books ship with Kraken.
import { VICES } from "./rules.mjs";

// The sheet, in the core frame (docs/core-ui-design.md 7.17): the name and alias, playbook, heritage, background,
// vice and the state in the header; Main (the roll bar, attributes and actions, stress, trauma, harm, armor, coin,
// load), Playbook and Downtime are Forged's own parts (src/rulesets/forged.tsx); Notes is the core's.
/** @param {string} path @param {string} label @returns {import("../rulesets/types").FieldSpec} */
const text = (path, label) => ({ path, label, kind: "text" });
/** @type {import("../rulesets/types").SheetSpec} */
const sheet = {
  level: "arrange",
  className: "sheet-5e sheet-forged",
  header: {
    nameFields: [text("alias", "Alias")],
    identity: [
      { path: "playbook", label: "Playbook", hook: "playbook" },
      text("heritage", "Heritage"),
      text("background", "Background"),
      { path: "vice", label: "Vice", title: { by: "vice", map: VICES, else: "" } },
      { path: "status", label: "State", when: { has: "status" }, attr: "data-forged-status", color: "#c0392b" },
    ],
  },
  tabs: [
    {
      id: "main",
      parts: [
        { part: "custom", component: "forged.rollBar" },
        { part: "custom", component: "forged.attributes" },
        { part: "custom", component: "forged.condition" },
        { part: "custom", component: "forged.load" },
      ],
    },
    { id: "playbook", parts: [{ part: "custom", component: "forged.playbook" }] },
    { id: "downtime", parts: [{ part: "custom", component: "forged.downtime" }] },
    {
      id: "notes",
      page: "panel",
      parts: [{ part: "notes", fields: [text("look", "Look"), text("heritagedetail", "Heritage: family life"), text("backgrounddetail", "Background: before the crew"), text("vicedetail", "Vice"), text("purveyor", "Vice purveyor (name and where)"), { path: "notes", label: "Notes", kind: "textarea", bare: true }] }],
    },
  ],
};

/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "forged",
  names: ["Forged in the Dark"],
  blurb: "Forged in the Dark, based on Blades in the Dark (John Harper, One Seven Design; its SRD, CC BY 3.0): a crew of scoundrels in the haunted canal city of Brackwater. Twelve actions as d6 pools read by the highest die, position and effect, stress and trauma, harm, progress clocks for all to see, the score and downtime, a crew with its Tier, heat and claims. Its Scoundrel's Handbook, Game Master's Guide and The Brine Street Job come with Kraken.",
  engine: "shared/forged/rules.mjs",
  host: { module: "electron/forged.cjs", message: "forged", tool: "kraken_forged" },
  records: { item: { label: "Items" }, npc: { label: "Cohorts and People" }, forgedtable: { label: "Tables" } },
  sheet,
  wizard: "forged.wizard",
  blank: false,
  features: ["clocks", "crew", "scorePanel", "downtime"],
  combatLabel: "Score",
  // What the sheet (and kraken_character_edit) may change by hand: the host's whitelist (electron/forged.cjs), in its
  // order. The name, a fatal harm cleared and the action ratings' cap stay the host's own.
  edit: {
    text: ["alias", "look", "heritage", "heritagedetail", "background", "backgrounddetail", "vice", "vicedetail", "purveyor", "notes", "playername"],
    string: ["harm.[123].[01]", "inventorylist.*.(name|text)", "projects.*.name", "friends.#+.bond"],
    number: ["actions.(hunt|study|survey|tinker|finesse|prowl|skirmish|wreck|attune|command|consort|sway)", "stress", "healing", "stash", "xp.(playbook|insight|prowess|resolve)", "armor.(armor|heavy|special)", "coins.*.amount", "inventorylist.*.(carried|load)", "projects.*.(filled|segments)"],
    remove: ["inventorylist", "projects"],
  },
  tracker: { replace: "forged.scorePanel" },
  // The crew sheet is the party's first tab.
  party: { currency: ["Coin"], xp: "xp", groupCheck: false, tabs: [{ id: "crew", label: "Crew", first: true, feature: "crew" }] },
};
