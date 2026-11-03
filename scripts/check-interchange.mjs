// Characters in and out (shared/siege/interchange.mjs), with the Player's
// Handbook as the campaign's books:
// - FG's SC C&C exports (the pregens FG built) come over whole, and survive
//   Kraken's FG export and a Kraken export read back;
// - a 5E character from an FG campaign, a Foundry dnd5e actor and a Roll20
//   character become working C&C characters (race, class, level, scores, hit
//   points, gear, coin), with what did not match in the notes.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { readCharacterFile, toFgXml, toKrakenFile, detectFormat } from "../shared/siege/interchange.mjs";

const require = createRequire(import.meta.url);
const { readModule, fgDataFolder, convertXml } = require("../electron/importers/fgModule.cjs");

let failed = 0;
function check(condition, message) {
  if (!condition) {
    failed += 1;
    console.log(`FAIL ${message}`);
  }
}

const books = readModule("C&C Player's Handbook").records;
const library = {
  packages: books.filter((r) => r.type === "siegepackage").map((r) => r.data),
  items: books.filter((r) => r.type === "item").map((r) => r.data),
  powers: books.filter((r) => r.type === "siegepower").map((r) => r.data),
  game: books.find((r) => r.type === "siegegame")?.data,
};
const read = (text) => readCharacterFile(text, library, { fgXml: convertXml });
const names = (list) => Object.values(list ?? {}).map((row) => `${row.name}x${row.count ?? 1}`).sort().join(",");
const powers = (list) => Object.values(list ?? {}).map((row) => row.name).sort().join(",");
const same = (a, b, label) => {
  for (const [field, x, y] of [
    ["name", a.name, b.name],
    ["level", a.level, b.level],
    ["hp", a.hp?.total, b.hp?.total],
    ["ac", a.ac?.total, b.ac?.total],
    ["bth", a.bth, b.bth],
    ["scores", JSON.stringify(Object.fromEntries(Object.entries(a.attributes).map(([k, v]) => [k, [v.score, v.prime]]))), JSON.stringify(Object.fromEntries(Object.entries(b.attributes).map(([k, v]) => [k, [v.score, v.prime]])))],
    ["inventory", names(a.inventorylist), names(b.inventorylist)],
    ["spells", powers(a.powers), powers(b.powers)],
    ["coins", names(Object.fromEntries(Object.entries(a.coins ?? {}).map(([k, v]) => [k, { name: v.name, count: v.amount }]))), names(Object.fromEntries(Object.entries(b.coins ?? {}).map(([k, v]) => [k, { name: v.name, count: v.amount }])))],
    ["load", a.load?.ev, b.load?.ev],
  ]) {
    check(x === y, `${label} ${field}: ${x} vs ${y}`);
  }
};

// 1. FG's own SC C&C exports, and both round trips.
const built = path.join(fgDataFolder(), "cc-conversion", "pregens", "built");
const files = existsSync(built) ? readdirSync(built).filter((name) => name.endsWith(".xml")) : [];
check(files.length > 0, "FG pregen exports found");
for (const file of files) {
  const text = readFileSync(path.join(built, file), "utf8");
  check(detectFormat(text) === "fg", `${file} detected as FG`);
  const fg = read(text);
  const record = { name: fg.character.name, data: fg.character };
  same(read(toFgXml(record)).character, fg.character, `${file} FG round trip`);
  same(read(toKrakenFile(record)).character, fg.character, `${file} Kraken round trip`);
  // Against FG's own numbers in the file.
  const raw = convertXml(text).character;
  check(Number(raw.hp?.total) === fg.character.hp.total, `${file} hp ${raw.hp?.total} vs ${fg.character.hp.total}`);
  check(Number(raw.ac?.total ?? fg.character.ac.total) === fg.character.ac.total, `${file} ac ${raw.ac?.total} vs ${fg.character.ac.total}`);
}
console.log(`${files.length} FG C&C exports read whole and round-tripped (FG XML and Kraken)`);

// 2. A 5E character from an FG campaign.
const fiveE = path.join(fgDataFolder(), "campaigns", "5th Edition One-Shots", "db.xml");
if (existsSync(fiveE)) {
  const sheet = Object.values(convertXml(readFileSync(fiveE, "utf8")).charsheet ?? {}).find((row) => row && typeof row === "object" && row.name);
  if (sheet) {
    const xml = toFgXml({ name: sheet.name, data: sheet });
    const made = read(xml);
    check(made.character.packages && Object.keys(made.character.packages).length > 0, `5E ${sheet.name}: has C&C packages (${made.report})`);
    check(made.character.attributes.strength.score === Number(sheet.abilities?.strength?.score), `5E strength ${made.character.attributes.strength.score} vs ${sheet.abilities?.strength?.score}`);
    check(made.character.hp.total === Number(sheet.hp?.total), `5E hp ${made.character.hp.total} vs ${sheet.hp?.total}`);
    console.log(`5E (FG) ${sheet.name}: ${made.character.race ?? "-"} level ${made.character.level}, HP ${made.character.hp.total}, AC ${made.character.ac?.total}. ${made.report}`);
  }
}

// 3. Foundry VTT, dnd5e: Export Data of a Hill Dwarf Fighter 3.
const foundry = {
  name: "Thorin Ashbeard",
  type: "character",
  img: "systems/dnd5e/tokens/heroes/FighterDwarf.webp",
  system: {
    abilities: { str: { value: 16 }, dex: { value: 12 }, con: { value: 15 }, int: { value: 10 }, wis: { value: 13 }, cha: { value: 8 } },
    attributes: { hp: { value: 31, max: 31 } },
    details: { race: "Hill Dwarf", alignment: "Lawful Good", biography: { value: "<p>A smith of the Iron Hills.</p>" }, xp: { value: 900 } },
    currency: { pp: 0, gp: 15, ep: 0, sp: 4, cp: 0 },
    traits: { languages: { value: ["common", "dwarvish"], custom: "" } },
  },
  items: [
    { name: "Fighter", type: "class", system: { levels: 3 } },
    { name: "Longsword", type: "weapon", system: { quantity: 1, weight: 3, equipped: true } },
    { name: "Chain Mail", type: "equipment", system: { quantity: 1, weight: 55, equipped: true } },
    { name: "Backpack", type: "backpack", system: { quantity: 1, weight: 5 } },
    { name: "Torch", type: "consumable", system: { quantity: 10, weight: 1 } },
    { name: "Second Wind", type: "feat", system: {} },
  ],
};
{
  const made = read(JSON.stringify(foundry));
  const c = made.character;
  check(made.format === "foundry", `foundry format ${made.format}`);
  check(c.race === "Dwarf", `foundry race ${c.race}`);
  check(Object.values(c.packages).some((pkg) => pkg.name === "Fighter" && Number(pkg.level) === 3), "foundry Fighter 3");
  check(c.level === 3, `foundry level ${c.level}`);
  check(c.hp.total === 31, `foundry hp ${c.hp.total}`);
  check(c.attributes.strength.score === 16 && c.attributes.constitution.score === 15, "foundry scores");
  check(names(c.inventorylist).includes("Torchx10"), `foundry torches ${names(c.inventorylist)}`);
  check(Object.values(c.inventorylist).some((row) => /long/i.test(row.name) && row.fgPath), `foundry long sword from the book ${names(c.inventorylist)}`);
  check(names(Object.fromEntries(Object.entries(c.coins).map(([k, v]) => [k, { name: v.name, count: v.amount }]))) === "gpx15,spx4", "foundry coins");
  check(c.alignment === "Lawful Good" && c.exp === 900, "foundry alignment and xp");
  check(String(c.notes).includes("Iron Hills") && String(c.notes).includes("Imported from Foundry VTT"), `foundry notes ${c.notes}`);
  console.log(`Foundry ${c.name}: ${c.race} Fighter ${c.level}, HP ${c.hp.total}, AC ${c.ac?.total}, BtH ${c.bth}. ${made.report}`);
}

// 4. Roll20: a halfling thief (C&C's rogue).
const roll20 = {
  name: "Pip Underbough",
  bio: "Quick hands.",
  attribs: [
    ["strength", 9], ["dexterity", 17], ["constitution", 12], ["intelligence", 13], ["wisdom", 10], ["charisma", 14],
    ["hp", 9, 9], ["race", "Halfling"], ["class", "Thief"], ["level", 2], ["alignment", "Neutral"], ["gp", 22],
    ["repeating_inventory_-abc_itemname", "Dagger"], ["repeating_inventory_-abc_itemcount", 2],
    ["repeating_inventory_-def_itemname", "Thieves' Picks"], ["repeating_inventory_-def_itemcount", 1],
  ].map(([name, current, max]) => ({ name, current, max: max ?? "" })),
};
{
  const made = read(JSON.stringify(roll20));
  const c = made.character;
  check(made.format === "roll20", `roll20 format ${made.format}`);
  check(c.race === "Halfling", `roll20 race ${c.race}`);
  check(Object.values(c.packages).some((pkg) => pkg.name === "Rogue" && Number(pkg.level) === 2), `roll20 Rogue 2: ${Object.values(c.packages).map((p) => p.name)}`);
  check(c.hp.total === 9, `roll20 hp ${c.hp.total}`);
  check(names(c.inventorylist).includes("Daggerx2"), `roll20 daggers ${names(c.inventorylist)}`);
  console.log(`Roll20 ${c.name}: ${c.race} Rogue ${c.level}, HP ${c.hp.total}, AC ${c.ac?.total}. ${made.report}`);
}

// 5. Not a character.
for (const [what, text] of [["empty", ""], ["text", "hello"], ["json", "{}"]]) {
  let threw = false;
  try {
    read(text);
  } catch {
    threw = true;
  }
  check(threw, `${what} refused`);
}

if (failed) {
  console.log(`${failed} interchange checks failed`);
  process.exit(1);
}
console.log("ok interchange");
