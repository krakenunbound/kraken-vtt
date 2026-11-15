// @ts-check
// AD&D 2E: what bookkeeping tracks (shared/bookkeeping). Encumbrance by Strength's weight
// allowance (the abilities table): unencumbered to the allowance, then light, moderate, heavy
// and severe each half an allowance more (movement 3/4, 1/2, 1/4, 1; -1, -2, -4 to hit from
// moderate on), coins 50 to the pound. An approximation of the PHB's encumbrance table (its
// steps, not its exact numbers). Natural healing: 1 hit point a day of rest. Going without food or water is the DM's
// call in 2E: Kraken says so in chat.
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

const ALLOW = "abilities.strength.weightallow";

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: { recover: 0.5, low: 5 },
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: { match: "waterskin|wineskin|canteen", days: 1 },
    penalty: {
      food: { after: 1, kind: "note", text: "goes hungry: the DM decides what that costs (2E leaves starvation to the DM)" },
      water: { after: 0, kind: "note", text: "goes thirsty: the DM decides what that costs" },
    },
  },
  light: { torch: {}, lantern: {}, lamp: {}, candle: {} },
  encumbrance: {
    mode: "weight",
    unit: "lb.",
    coins: 50,
    speed: "movement",
    max: { stat: ALLOW, times: 3 },
    levels: [
      { id: "none", label: "Unencumbered", upTo: { stat: ALLOW, times: 1 } },
      { id: "light", label: "Lightly encumbered", upTo: { stat: ALLOW, times: 1.5 }, speed: { times: 0.75 }, tone: "warn", text: "Movement 3/4." },
      { id: "moderate", label: "Moderately encumbered", upTo: { stat: ALLOW, times: 2 }, speed: { times: 0.5 }, tone: "warn", effect: "ATK: -1", text: "Movement 1/2, -1 to hit." },
      { id: "heavy", label: "Heavily encumbered", upTo: { stat: ALLOW, times: 2.5 }, speed: { times: 0.25 }, tone: "bad", effect: "ATK: -2", text: "Movement 1/4, -2 to hit." },
      { id: "severe", label: "Severely encumbered", speed: 1, tone: "bad", effect: "ATK: -4", text: "Movement 1, -4 to hit." },
    ],
  },
  rest: {
    long: { hours: 8, hp: 1, reset: ["spellcasting.*.used.*"], rations: true },
  },
};
