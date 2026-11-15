// @ts-check
// D&D 3.5E (the SRD 3.5): what bookkeeping tracks (shared/bookkeeping). Carrying capacity by
// Strength (light, medium and heavy loads: the heavy load is 10 x Strength to 10, then the table,
// x4 for each 10 above 20; light a third, medium two thirds), size (Small x3/4), 50 coins a pound;
// a medium load: speed 30 to 20 (20 to 15), check penalty -3; heavy: -6; starvation and thirst:
// a Constitution check (DC 10, +1 for each before) or 1d6 nonlethal damage; natural healing: 1 hit
// point a character level for a night's rest, nonlethal damage all back.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

const HEAVY = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400];
const STR = "abilities.strength.score";
const SPEED = { table: [[40, 30], [30, 20], [20, 15], [15, 10], [0, 5]] };

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0.5, low: 5 },
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: { match: "waterskin|canteen", days: 1 },
    penalty: {
      food: { after: 3, kind: "check-damage", check: { mod: "abilities.constitution.bonus", dc: 10, step: 1 }, damage: "1d6", path: "hp.nonlethal", text: "without food past three days: a Constitution check or 1d6 nonlethal damage (Starvation)" },
      water: { after: 1, kind: "check-damage", check: { mod: "abilities.constitution.bonus", dc: 10, step: 1 }, damage: "1d6", path: "hp.nonlethal", text: "without water past a day: a Constitution check or 1d6 nonlethal damage (Thirst)" },
    },
  },
  light: { torch: {}, lantern: {}, lamp: {}, candle: {} },
  encumbrance: {
    mode: "weight",
    unit: "lb.",
    coins: 50,
    speed: "speed",
    sizes: { fine: 0.125, diminutive: 0.25, tiny: 0.5, small: 0.75, medium: 1, large: 2, huge: 4, gargantuan: 8, colossal: 16 },
    max: { table: HEAVY, stat: STR },
    levels: [
      { id: "light", label: "Light load", upTo: { table: HEAVY, stat: STR, part: 1 / 3 } },
      { id: "medium", label: "Medium load", upTo: { table: HEAVY, stat: STR, part: 2 / 3 }, speed: SPEED, tone: "warn", effect: "SKILL: -3", text: "Max Dex +3, check penalty -3, speed reduced, run x4." },
      { id: "heavy", label: "Heavy load", upTo: { table: HEAVY, stat: STR }, speed: SPEED, tone: "bad", effect: "SKILL: -6", text: "Max Dex +1, check penalty -6, speed reduced, run x3." },
      { id: "over", label: "Overloaded", speed: 5, tone: "bad", effect: "SKILL: -6", text: "Over the heavy load: only a 5-foot step at a time." },
    ],
  },
  rest: {
    long: { hours: 8, hp: { perLevel: 1, level: "level" }, reset: ["hp.nonlethal", "spellcasting.used.*"], rations: true },
  },
};
