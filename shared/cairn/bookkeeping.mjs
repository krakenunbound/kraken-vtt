// @ts-check
// Cairn, Second Edition: what bookkeeping tracks (shared/bookkeeping). From the Player's Guide in
// games/cairn/text: rations by their uses, lacking a crucial need is Deprived and Deprived for more
// than a day adds a Fatigue a day; torches and the lantern's oil can by their uses; the inventory's
// ten slots (the rules' derive: a full inventory is HP 0); rest, sleep and a week's recovery are
// Cairn's own (kraken_cairn). No ammunition (bows are an item, not a count).
// Kept beside the manifest (the registry attaches it as manifest.bookkeeping).

/** @type {import("../rulesets/types").BookkeepingSpec} */
export default {
  ammo: false,
  consumables: {},
  rations: {
    food: { match: "\\brations?\\b" },
    water: false,
    penalty: {
      food: { after: 0, kind: "deprived", text: "has no rations: Deprived (no HP, Attributes or Fatigue back); a Fatigue for each further day" },
    },
  },
  light: { torch: {}, lantern: { fuel: "oil ?can|^(?:flasks? of )?(?:lamp )?oil\\b(?!\\s+of\\b)" }, candle: {} },
  encumbrance: {
    mode: "derived",
    unit: "slots",
    label: "Slots",
    used: "slots.used",
    max: 10,
    offFlag: true,
    levels: [
      { id: "room", label: "Room to spare", upTo: 9 },
      { id: "full", label: "Full inventory", tone: "bad", text: "Every slot taken: HP 0." },
    ],
    note: "Bulky items 2 slots, petty 0; Fatigue takes a slot each.",
  },
  rest: {
    short: { via: { module: "cairn", action: "rest" } },
    long: { hours: 8, via: { module: "cairn", action: "sleep" }, rations: true },
  },
};
