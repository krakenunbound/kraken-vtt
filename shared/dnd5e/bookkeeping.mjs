// @ts-check
// D&D 5E, the SRD 5.2.1 and Descending Darkness: what bookkeeping tracks (shared/bookkeeping).
// Numbers from the SRD 5.2.1 text shipped in games/srd-5e/data: carrying capacity (Strength x 15
// lb., by size), Malnutrition and Dehydration, Exhaustion, the Ammunition property (half the
// ammunition back after a fight), the Short and Long Rest. Long rests here give back half the
// Hit Point Dice (the 2014 rule the GM's FG books use; the SRD 5.2.1 gives back all).
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

const STR = "abilities.strength.score";
const D20 = "strength, dexterity, constitution";

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0.5, low: 5 },
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: { match: "waterskin|canteen|water ?skin", days: 1 },
    penalty: {
      food: { after: 4, kind: "exhaustion", text: "eats nothing for a fifth day: 1 Exhaustion level (Malnutrition)" },
      water: { after: 0, kind: "exhaustion", text: "drinks too little for a day: 1 Exhaustion level (Dehydration)" },
    },
  },
  light: { torch: {}, lantern: {}, lamp: {}, candle: {} },
  exhaustion: { path: "exhaustion", max: 6, effect: "Exhaustion {n}; ATK: -{2n}; SAVE: -{2n}; CHECK: -{2n}; SKILL: -{2n}; SPEED: -{5n}", text: "Each level: d20 Tests -2 and Speed -5 feet; a Long Rest removes one; level 6 is death." },
  encumbrance: {
    mode: "weight",
    unit: "lb.",
    coins: 50,
    speed: "speed",
    sizes: { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 4, gargantuan: 8 },
    max: { stat: STR, times: 15 },
    levels: [
      { id: "fine", label: "Unencumbered", upTo: { stat: STR, times: 15 } },
      { id: "over", label: "Over capacity", speed: 5, tone: "bad", text: "Carrying more than Strength x 15 lb.: Speed no more than 5 feet." },
    ],
    // The variant encumbrance (the GM's Settings: Variant encumbrance).
    variant: [
      { id: "fine", label: "Unencumbered", upTo: { stat: STR, times: 5 } },
      { id: "encumbered", label: "Encumbered", upTo: { stat: STR, times: 10 }, speed: -10, tone: "warn", effect: "SPEED: -10", text: "Over Strength x 5 lb.: Speed -10 feet." },
      { id: "heavy", label: "Heavily encumbered", upTo: { stat: STR, times: 15 }, speed: -20, tone: "bad", effect: `SPEED: -20; DISATK: ${D20}; DISCHK: ${D20}; DISSAV: ${D20}`, text: "Over Strength x 10 lb.: Speed -20 feet, Disadvantage on attack rolls, ability checks and saving throws that use Strength, Dexterity or Constitution." },
      { id: "over", label: "Over capacity", speed: 5, tone: "bad", text: "Carrying more than Strength x 15 lb.: Speed no more than 5 feet." },
    ],
    variantLabel: "Variant encumbrance (Strength x 5 and x 10)",
  },
  rest: {
    short: { hours: 1, hitDice: { die: "hitdice.die", total: "hitdice.total", used: "hitdice.used", mod: "abilities.constitution.bonus" } },
    long: { hours: 8, hp: "full", temp: true, hitDice: { back: "half", used: "hitdice.used", total: "hitdice.total" }, reset: ["slots.*.used", "deathsaves.success", "deathsaves.failure"], exhaustion: -1, rations: true, concentration: true },
  },
};
