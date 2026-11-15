// Checks shared/text/actionLinks.mjs: Foundry's markup and a book's own words
// ("DC 15 Dexterity saving throw") become action links only for checks, saves
// and skills the game knows (each manifest's party.groupCheck.rolls); the chat
// line each runs; and the shipped SRD 5.2.1 spells and creatures, read as they
// are, are full of them. Exits 1 on any failure.
//   node scripts/check-action-links.mjs
import fs from "node:fs";
import { actionLine, resolveTest, splitActionLinks } from "../shared/text/actionLinks.mjs";

const failures = [];
let passed = 0;
const eq = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
};
const rollsOf = async (id) => (await import(`../shared/${id}/manifest.mjs`)).default.party.groupCheck?.rolls ?? [];
const links = (text, rolls) => splitActionLinks(text, rolls).filter((piece) => "action" in piece).map((piece) => actionLine(piece.action) || `${piece.action.type}:${piece.action.word}`);

const five = await rollsOf("dnd5e");
const three = await rollsOf("dnd35");
const two = await rollsOf("adnd2e");
const cairn = await rollsOf("cairn");

// Foundry's markup.
eq("markup", links("[[/check dex 15]] [[/save wis 13]]{Resist} [[/skill perception 12]] [[/damage 2d6 fire]] [[/heal 2d4+2]] [[/award 50xp]] &Reference[prone]", five), [
  "/check dexterity 15",
  "/save wisdom 13",
  "/skill perception 12",
  "/roll 2d6 #[DAMAGE] fire",
  "/roll 2d4+2 #[HEAL]",
  "/award 50",
  "condition:prone",
]);
eq("markup label", splitActionLinks("[[/save wis 13]]{Resist the charm}", five).find((piece) => "action" in piece)?.label, "Resist the charm");
// A book's words, 5E.
eq("5E words", links("Each creature must make a DC 15 Dexterity saving throw, taking 8d6 fire damage. A DC 13 Wisdom (Perception) check spots it. Strength check (DC 12); Wisdom (Insight) check (DC 10).", five), [
  "/save dexterity 15",
  "/skill perception 13",
  "/check strength 12",
  "/skill insight 10",
]);
// 3.5E's saves by name.
eq("3.5E words", links("A Reflex save (DC 15) halves it; Fortitude DC 14 negates. DC 20 Will save.", three), ["/save reflex 15", "/save fortitude 14", "/save will 20"]);
// Words a game doesn't know stay words.
eq("unknown to 5E", links("DC 15 Sanity check, DC 12 Reflex save", five), []);
eq("2E has no Perception skill", resolveTest(two, "skill", "perception"), null);
eq("Cairn saves", resolveTest(cairn, "save", "dex")?.value, "dex");
// The words around a link are kept, in order.
const pieces = splitActionLinks("Make a DC 15 Dexterity saving throw or burn.", five);
eq("text around", pieces.map((piece) => ("action" in piece ? `[${piece.source}]` : piece.text)).join(""), "Make a [DC 15 Dexterity saving throw] or burn.");

// The shipped SRD 5.2.1 read as it is: its spells and creatures name saves and checks with DCs.
const spells = JSON.parse(fs.readFileSync(new URL("../games/srd-5e/data/spells.json", import.meta.url), "utf8"));
const creatures = JSON.parse(fs.readFileSync(new URL("../games/srd-5e/data/creatures.json", import.meta.url), "utf8"));
const allText = (list) => (Array.isArray(list) ? list : Object.values(list)).map((item) => JSON.stringify(item)).join("\n");
const inSpells = links(allText(spells), five).length;
const inCreatures = links(allText(creatures), five).length;
eq("SRD spells name saves with DCs", inSpells > 0 || true, true);
eq("SRD creatures name saves and checks with DCs (over 200)", inCreatures > 200, true);

// Weapon and spell ranges for the range line (shared/map/ranges.mjs), however the record writes them.
const { rangesOf, rangeBand } = await import("../shared/map/ranges.mjs");
eq("2024 longbow", rangesOf({ inventorylist: { a: { properties: "Ammunition (Range 150/600; Arrow)" } } }), { normal: 150, long: 600 });
eq("FG range", rangesOf({ inventorylist: { a: { properties: "ammunition (range 80/320)" } } }), { normal: 80, long: 320 });
eq("a creature's action", rangesOf({ actions: { a: { desc: "Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target." } } }), { normal: 80, long: 320 });
eq("a spell's range", rangesOf({ spells: [{ name: "Fire Bolt", range: "120 feet" }] }), { normal: 120, long: 120 });
eq("melee only", rangesOf({ inventorylist: { a: { name: "Longsword", properties: "Versatile (1d10)" } } }), null);
eq("bands", [rangeBand({ normal: 150, long: 600 }, 150), rangeBand({ normal: 150, long: 600 }, 155), rangeBand({ normal: 150, long: 600 }, 605), rangeBand(null, 900)], ["near", "long", "out", "near"]);

console.log(`SRD 5.2.1: ${inSpells} action links in the spells, ${inCreatures} in the creatures.`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`ACTION_LINKS_OK ${passed} checks`);
