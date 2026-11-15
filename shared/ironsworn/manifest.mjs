// @ts-check
// Ironsworn (with Delve) and, as its variant, Starforged: one sheet (data.game says which).
/** @type {import("../rulesets/types").RulesetManifest} */
export default {
  id: "ironsworn",
  names: ["Ironsworn", "Starforged"],
  blurb: "Ironsworn and Ironsworn: Delve (Shawn Tomkin, CC BY 4.0; an unofficial adaptation): vows sworn upon iron, the action die against two challenge dice, momentum, progress tracks, assets, the oracles for play with or without a GM, Delve's sites. Its Reference, Foes and Sites and The Cinder Barrow come with Kraken.",
  engine: "shared/ironsworn/rules.mjs",
  host: { module: "electron/ironsworn.cjs", message: "ironsworn", tool: "kraken_ironsworn" },
  records: { npc: { label: "Foes" } },
  sheet: "ironsworn.sheet",
  wizard: "ironsworn.wizard",
  blank: false,
  features: ["oracles", "delve", "progressTracks", "momentum", "assetsCards"],
  party: { currency: ["Supply"], xp: "xp" },
  // A character's initiative on the tracker, in the game's words.
  tracker: { control: { on: "Initiative", off: "No initiative", title: "Initiative" } },
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
