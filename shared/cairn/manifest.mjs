// @ts-check
// Cairn, Second Edition: its books ship with Kraken.
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "cairn",
  names: ["Cairn"],
  blurb: "Cairn, Second Edition (Yochai Gal, CC BY-SA 4.0): three attributes and Hit Protection, saves under a d20, attacks that always hit, Scars, Fatigue and ten inventory slots, backgrounds instead of classes. Its Player's Guide, Warden's Guide and Trouble in Twin Lakes come with Kraken.",
  engine: "shared/cairn/rules.mjs",
  host: { module: "electron/cairn.cjs", message: "cairn", tool: "kraken_cairn" },
  records: { background: { label: "Backgrounds" }, item: { label: "Gear and Relics" }, npc: { label: "Bestiary" }, cairntable: { label: "Tables" } },
  sheet: "cairn.sheet",
  wizard: "cairn.wizard",
  blank: false,
  features: ["slots", "fatigue", "scars", "spellbooks", "morale", "dying.save"],
  // Cairn has no experience: the party's tab is its Growth (Scars and what has changed).
  party: { currency: ["GP"], xp: "growth", groupCheck: { stats: ["str", "dex", "wil"] } },
  tracker: { saves: { keys: ["str", "dex", "wil"], modLabel: "CL", modAria: "Save CL", button: "Roll save" } },
};
