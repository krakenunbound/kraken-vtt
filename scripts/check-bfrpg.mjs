// Basic Fantasy: the rules' numbers against the book (ability bonuses, the
// attack bonus table for every class and for monsters by hit dice, the five
// saving throws by class and level with a demi-human's bonus, experience to
// 20th level and the combination classes', spells a day, thief abilities,
// turning the undead, hit points to 9th then fixed, monster XP), a monster's
// stat block read from the Game Master's Guide (attacks and their damage,
// saves as, morale), the books themselves (records and the licence notice),
// characters built as the wizard sends them (the race's limits, the class's
// Prime Requisite, the shop within 3d6 x 10 gp and what the class may use, a
// Magic-User's spellbook), and a fight on the tracker with fixed dice: d6 +
// Dexterity initiative highest first, d20 + attack bonus against ascending
// AC (a natural 20 hits, a 1 misses), a goblin's attack, damage at least 1,
// dead at 0; the five saves (a natural 1 fails), turning skeletons (2d6 hit
// dice), morale; the sheet's save, ability roll, thief ability and loyalty;
// a level up (the hit die to 9th, fixed after); a parcel's coins and a
// Human's +10% XP; Basic Fantasy books on a Basic Fantasy shelf only.
//   node scripts/check-bfrpg.mjs
import "./loopback.mjs";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as R from "../shared/bfrpg/rules.mjs";
import { calendarFor } from "../shared/calendars.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { fitsRuleset } = require("../electron/books.cjs");
const { readModule } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- The rules ------------------------------------------------------------------
assert([3, 4, 5, 6, 8, 9, 12, 13, 15, 16, 17, 18].map(R.abilityBonus).join(",") === "-3,-2,-2,-1,-1,0,0,1,1,2,2,3", "the ability bonus table");
// The Attack Bonus table: Fighter 1 +1, 2-3 +2, 4 +3, 5-6 +4, 7 +5, 8-10 +6, 11-12 +7, 13-15 +8, 16-17 +9, 18-20 +10.
assert(same([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 16, 18, 20].map((level) => R.attackBonus("fighter", level)), [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 10]), "the fighter's attack bonus");
assert(same([1, 2, 3, 5, 7, 9, 11, 12, 15, 18, 20].map((level) => R.attackBonus("cleric", level)), [1, 1, 2, 3, 4, 5, 5, 6, 7, 8, 8]) && same([1, 3, 5, 9, 11].map((level) => R.attackBonus("thief", level)), [1, 2, 3, 5, 5]), "the cleric's and thief's");
assert(same([1, 3, 4, 6, 8, 9, 12, 13, 16, 19, 20].map((level) => R.attackBonus("magicuser", level)), [1, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7]), "the magic-user's");
assert(R.attackBonus("fightermagicuser", 4) === 3 && R.attackBonus("magicuserthief", 3) === 2, "a combination class uses the better attack bonus");
assert(same(["1-1", "1", "2", "3+2", "4", "7", "8", "9", "10", "12", "14", "16", "19", "20", "24", "28", "32"].map((hd) => R.hitDiceOf(hd).ab), [0, 1, 2, 3, 4, 7, 8, 8, 9, 10, 11, 12, 12, 13, 14, 15, 16]), "a monster's attack bonus by hit dice (plusses ignored; 1-1 is under one)");
assert(R.hitDiceOf("10* (+9)").ab === 9 && R.hitDiceOf("10* (+9)").stars === 1 && R.hitDiceOf("1d4 Hit Points").dice === "1d4" && R.hitDiceOf("3+2").dice === "3d8+2" && R.hitDiceOf("1/2 (1d4 HP)").under, "hit dice as the book writes them");
// Saving throws: Death Ray, Wands, Paralysis, Breath, Spells.
assert(same(Object.values(R.savesFor("fighter", 1)), [12, 13, 14, 15, 17]) && same(Object.values(R.savesFor("fighter", 20)), [5, 6, 8, 9, 10]) && same(Object.values(R.savesFor("", 0)), [13, 14, 15, 16, 18]), "the fighter's saves, and a normal man's");
assert(same(Object.values(R.savesFor("cleric", 1)), [11, 12, 14, 16, 15]) && same(Object.values(R.savesFor("cleric", 5)), [9, 10, 13, 15, 14]) && same(Object.values(R.savesFor("magicuser", 9)), [11, 11, 10, 14, 12]) && same(Object.values(R.savesFor("thief", 13)), [9, 10, 10, 10, 11]), "the cleric's, magic-user's and thief's");
assert(same(Object.values(R.savesFor("fightermagicuser", 1)), [12, 13, 13, 15, 15]), "a fighter/magic-user's best of both");
// Experience.
assert(R.xpFor("fighter", 2) === 2000 && R.xpFor("cleric", 2) === 1500 && R.xpFor("magicuser", 2) === 2500 && R.xpFor("thief", 2) === 1250 && R.xpFor("fighter", 20) === 1560000 && R.xpFor("magicuser", 9) === 300000, "experience to each level");
assert(R.xpFor("fightermagicuser", 2) === 4500 && R.xpFor("magicuserthief", 3) === 7500 && R.levelForXp("thief", 2600) === 3 && R.levelForXp("fighter", 1999) === 1, "a combination class needs both classes' experience");
// Spells a day.
assert(same(R.spellsPerDay("cleric", 1), [0, 0, 0, 0, 0, 0]) && same(R.spellsPerDay("cleric", 4), [2, 1, 0, 0, 0, 0]) && same(R.spellsPerDay("magicuser", 1), [1, 0, 0, 0, 0, 0]) && same(R.spellsPerDay("magicuser", 9), [3, 3, 2, 2, 1, 0]) && same(R.spellsPerDay("fightermagicuser", 3), [2, 1, 0, 0, 0, 0]) && same(R.spellsPerDay("fighter", 9), [0, 0, 0, 0, 0, 0]), "spells a day");
// Thief abilities.
assert(R.thiefSkill("openlocks", 1) === 25 && R.thiefSkill("climbwalls", 1) === 80 && R.thiefSkill("pickpockets", 20) === 99 && R.thiefSkill("hide", 10) === 53 && R.thiefSkill("listen", 16) === 83, "thief abilities by level");
// Turning the undead.
assert(same(R.turnAgainst(1, 0), { need: 13 }) && R.turnAgainst(1, 3).impossible && R.turnAgainst(2, 3).need === 20 && R.turnAgainst(8, 0).auto && R.turnAgainst(11, 0).damage && R.turnAgainst(20, 8).need === 7, "the Clerics vs. Undead table");
assert(R.undeadRow("Skeleton") === 0 && R.undeadRow("Zombie 2") === 1 && R.undeadRow("Wight") === 3 && R.undeadRow("Goblin") === null && R.undeadRow("Barrow Thing", { undead: 1, hd: "5" }) === 4, "an undead's row by type, else hit dice");
// Monster XP.
assert(R.monsterXp(1) === 25 && R.monsterXp(2, 2) === 125 && R.monsterXp(0) === 10 && R.monsterXp(27, 1) === 9000 + 1500 + 375, "monster XP and the special-ability bonus (2** is 125)");
// A goblin and a black bear, as the Game Master's Guide gives them.
const monsters = JSON.parse(fs.readFileSync("games/basic-fantasy/data/monsters.json", "utf8"));
const goblinBlock = monsters.find((item) => item.name === "Goblin");
const goblin = R.npcStats(goblinBlock);
assert(goblin.ac === 14 && goblin.ab === 0 && goblin.attacks.length === 1 && goblin.attacks[0].damage === "1d6" && goblin.morale === 7 && goblin.xp === 10 && same(Object.values(goblin.saves), [12, 13, 14, 15, 17]), `the goblin: AC 14, AB +0, 1d6, morale 7, saves as Fighter 1: ${JSON.stringify(goblin)}`);
const bear = R.npcStats(monsters.find((item) => item.name === "Bear, Black"));
assert(same(bear.attacks.map((attack) => `${attack.name} ${attack.damage}`), ["Claw 1d4", "Claw 1d4", "Bite 1d6", "Hug 2d6"]) && bear.ab === 4, `a black bear: claw, claw, bite, hug: ${JSON.stringify(bear.attacks)}`);
const skeletonBlock = monsters.find((item) => item.name === "Skeleton");
assert(R.isUndead("Skeleton", skeletonBlock) && R.npcStats(skeletonBlock).morale === 12, "a skeleton: undead, morale 12");
assert(monsters.length >= 240 && monsters.filter((item) => item.text).length >= 230, `the monsters: ${monsters.length}`);
// Hit points: the die + Constitution to 9th, then the class's fixed gain.
const fighter9 = R.derive({ class: "fighter", race: "Human", level: 11, abilities: { constitution: { score: 16 } }, hp: { rolls: [8, 5, 5, 5, 5, 5, 5, 5, 5] } });
assert(fighter9.hp.total === 8 + 2 + 8 * 7 + 2 * 2, `a fighter at 11th: nine dice + Con 2 each, then +2 a level: ${fighter9.hp.total}`);
assert(R.hitDie("fighter", "Elf") === 6 && R.hitDie("fighter", "Dwarf") === 8 && R.hitDie("fightermagicuser", "Elf") === 6 && R.hitDie("magicuserthief", "Elf") === 4, "elves and halflings roll at most d6; combinations their book's die");
// The races' and classes' limits.
assert(R.raceProblems("Dwarf", { constitution: 8, charisma: 12 }).length === 1 && R.raceProblems("Dwarf", { constitution: 9, charisma: 18 }).length === 1 && R.raceProblems("Halfling", { dexterity: 12, strength: 18 }).length === 1 && R.raceProblems("Human", {}).length === 0, "the races' ability limits");
assert(R.classProblems("magicuser", "Dwarf", { intelligence: 14 }).length === 1 && R.classProblems("fightermagicuser", "Human", { strength: 12, intelligence: 12 }).length === 1 && R.classProblems("fightermagicuser", "Elf", { strength: 8, intelligence: 12 }).length === 1 && R.classProblems("thief", "Halfling", { dexterity: 9 }).length === 0, "classes by race and Prime Requisite (9)");
assert(R.itemProblem({ name: "Longsword/Scimitar", type: "Weapon", damage: "1d8", size: "M" }, "cleric", "Human") && !R.itemProblem({ name: "Mace", type: "Weapon", damage: "1d8" }, "cleric", "Human") && R.itemProblem({ name: "Chain Mail", type: "Armor", ac: 15, subtype: "Metal" }, "thief", "Human") && R.itemProblem({ name: "Longbow", type: "Weapon", damage: "1d8", size: "L" }, "fighter", "Halfling") && R.itemProblem({ name: "Two-Handed Sword", type: "Weapon", damage: "1d10", size: "L" }, "fighter", "Dwarf") && R.itemProblem({ name: "Leather Armor", type: "Armor", ac: 13, subtype: "Leather" }, "magicuser", "Elf"), "what each class and race may use");
assert(calendarFor("Basic Fantasy") === "gregorian", "the calendar");

// --- The books ---------------------------------------------------------------------
const books = Object.fromEntries(["Basic Fantasy Player's Handbook", "Basic Fantasy Game Master's Guide", "The Mill at Hob's Ford"].map((name) => [name, readModule(`games/modules/${name}`)]));
const count = (book, type) => book.records.filter((record) => record.type === type).length;
const ph = books["Basic Fantasy Player's Handbook"];
const gm = books["Basic Fantasy Game Master's Guide"];
const mill = books["The Mill at Hob's Ford"];
assert(count(ph, "race") === 4 && count(ph, "class") === 6 && count(ph, "spell") >= 100 && count(ph, "item") >= 80, `the Player's Handbook's records: ${["race", "class", "spell", "item"].map((type) => `${type} ${count(ph, type)}`)}`);
assert(count(gm, "npc") >= 240 && count(gm, "item") >= 120, `the Game Master's Guide: ${count(gm, "npc")} monsters, ${count(gm, "item")} magic items`);
assert(count(mill, "encounter") >= 8 && count(mill, "battle") === 3 && count(mill, "treasureparcels") === 3 && count(mill, "image") === 2, "the adventure: story, encounters, parcels, maps");
for (const [name, book] of Object.entries(books)) {
  assert(book.info.ruleset === "Basic Fantasy", `${name} is a Basic Fantasy book`);
  const all = JSON.stringify(book.records);
  assert(/CC BY-SA 4\.0/.test(all) && /Chris Gonnerman/.test(all) && /creativecommons\.org\/licenses\/by-sa\/4\.0/.test(all), `${name} carries the licence notice`);
}
const millMaps = mill.records.filter((record) => record.type === "image");
const occluders = (record) => [].concat(record.data.image?.layers?.layer ?? []).flatMap((layer) => [].concat(layer?.occluders?.occluder ?? []));
assert(millMaps.every((record) => occluders(record).length > 10 && occluders(record).some((wall) => wall.toggleable)), `the adventure's maps have their walls and doors: ${millMaps.map((record) => occluders(record).length)}`);
assert(fs.existsSync("games/basic-fantasy/LICENSE.md") && /what the share-alike covers/i.test(fs.readFileSync("games/basic-fantasy/LICENSE.md", "utf8")), "LICENSE.md: CC BY-SA, what it covers");
assert(fitsRuleset({ ruleset: "Basic Fantasy" }, "Basic Fantasy") && !fitsRuleset({ ruleset: "Basic Fantasy" }, "AD&D 2E") && !fitsRuleset({ ruleset: "2E" }, "Basic Fantasy") && !fitsRuleset({ kraken: "Basic Fantasy", ruleset: "Basic Fantasy" }, "Worldbuilding"), "Basic Fantasy books on a Basic Fantasy shelf only");

// --- A table of Basic Fantasy ---------------------------------------------------
const server = createTableServer({ ruleset: "Basic Fantasy" });
await server.listen({ port: 0, password: "" });
const ctx = { table: () => server };
const tool = async (name, args = {}) => {
  const result = await callTool(name, args, ctx);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const agent = server.agent;
const force = (...values) => agent.dice.force(values);
const last = (pattern) => [...agent.chatLog(300)].reverse().find((line) => line.roll && pattern.test(line.roll.label ?? ""));
const said = (pattern) => agent.chatLog(300).some((line) => pattern.test(line.text ?? ""));
// The books' records, as an active book puts them in the campaign.
for (const book of [ph, gm]) for (const record of book.records) if (["item", "npc", "spell"].includes(record.type) && (record.type !== "npc" || ["Goblin", "Skeleton", "Zombie", "Orc"].includes(record.name))) agent.records.create({ type: record.type, name: record.name, visibility: "gm", data: record.data }, agent.seat);
const npc = (name) => agent.records.list({ type: "npc" }).find((record) => record.name === name);

// Darion, a human fighter: Str 16, Dex 13, Con 14; 3d6 x 10 = 120 gp; a longsword, chain mail, a shield, a shortbow and arrows, torches (105 gp).
const built = await tool("kraken_build_character", { spec: { name: "Darion", race: "Human", class: "Fighter", abilities: { strength: 16, intelligence: 10, wisdom: 9, dexterity: 13, constitution: 14, charisma: 11 }, hpRoll: 7, gold: 120, buy: [["Longsword/Scimitar", 1], ["Chain Mail", 1], ["Shield", 1], ["Shortbow", 1], ["Shortbow Arrow", 20], ["Torches, 6", 1]], alignment: "Lawful" } });
const darion = agent.records.get(built.id);
const d = darion.data;
assert(built.problems.length === 0, `no problems: ${built.problems}`);
assert(d.ruleset === "bfrpg" && d.hp.total === 8 && d.ac.total === 15 + 1 + 1 && d.ab === 1 && d.attack.melee === 3 && d.attack.missile === 2 && d.initiative.total === 1, `hit points 7 + 1, AC 15 + shield + Dex = 17, AB +1, melee +3, missile +2, initiative +1: ${JSON.stringify({ hp: d.hp, ac: d.ac, ab: d.ab, attack: d.attack, init: d.initiative })}`);
assert(same(Object.values(d.saves).map((save) => save.total), [12, 13, 14, 15, 17]) && d.expnext === 2000 && d.movement === 20, `the fighter's saves, 2000 XP to 2nd, 20' in metal armor: ${d.movement}`);
const gold = (data) => Object.values(data.coins).reduce((sum, coin) => sum + Number(coin.amount) * ({ PP: 500, GP: 100, EP: 50, SP: 10, CP: 1 }[coin.name] ?? 0), 0);
const sword = Object.values(d.attacks).find((attack) => attack.name === "Longsword/Scimitar");
const bow = Object.values(d.attacks).find((attack) => attack.name === "Shortbow");
assert(sword && sword.bonus === 3 && sword.damage === "1d8+2" && bow && bow.bonus === 2 && bow.damage === "1d6", `the longsword +3 1d8+2, the shortbow +2 1d6 (no Strength): ${JSON.stringify(d.attacks)}`);
// 120 gp - (10 + 60 + 7 + 25 + 20 x 1 sp + 1) = 15 gp left.
assert(gold(d) === 1500 && Object.values(d.coins).find((coin) => coin.name === "GP").amount === 15 && Object.values(d.inventorylist).find((item) => item.name === "Chain Mail").carried === 2, `15 gp left, the chain mail worn: ${JSON.stringify(d.coins)}`);
// What the host refuses, and why.
const refused = async (spec) => {
  try {
    await tool("kraken_build_character", { spec });
    return "";
  } catch (error) {
    return error.message;
  }
};
const tooDear = await refused({ name: "Spender", race: "Human", class: "Fighter", abilities: { strength: 12, intelligence: 10, wisdom: 10, dexterity: 10, constitution: 10, charisma: 10 }, hpRoll: 4, gold: 30, buy: [["Plate Mail", 1]] });
assert(/Not enough money for Plate Mail/.test(tooDear), `300 gp of plate on 30 gp: ${tooDear}`);
const wrongArmor = await refused({ race: "Human", class: "Thief", abilities: { strength: 12, intelligence: 10, wisdom: 10, dexterity: 12, constitution: 10, charisma: 10 }, hpRoll: 3, gold: 150, buy: [["Chain Mail", 1]] });
assert(/Thieves wear only leather/.test(wrongArmor), `a thief may not buy chain mail: ${wrongArmor}`);
const dwarfMage = await refused({ race: "Dwarf", class: "Magic-User", abilities: { strength: 12, intelligence: 14, wisdom: 10, dexterity: 12, constitution: 12, charisma: 10 }, hpRoll: 3, gold: 50 });
assert(/Dwarves may not be Magic-Users/.test(dwarfMage), `a dwarf magic-user is refused: ${dwarfMage}`);
// Morningstar, an elf fighter/magic-user: d6 hit die, Sleep in her spellbook; casts in armor.
const elf = await tool("kraken_build_character", { spec: { name: "Morningstar", race: "Elf", class: "Fighter/Magic-User", abilities: { strength: 13, intelligence: 15, wisdom: 10, dexterity: 14, constitution: 11, charisma: 12 }, hpRoll: 6, gold: 90, buy: [["Leather Armor", 1], ["Longsword/Scimitar", 1]], spells: ["Sleep"] } });
const e = agent.records.get(elf.id).data;
assert(e.className === "Fighter/Magic-User" && e.hp.total === 6 && same(e.spellbook, ["Read Magic", "Sleep"]) && same(e.spellcasting.perday, [1, 0, 0, 0, 0, 0]) && e.expnext === 4500 && e.saves.paralysis.total === 13 - 1 && e.saves.spells.total === 15 - 2 && e.darkvision === 60, `an elf fighter/magic-user: ${JSON.stringify({ hp: e.hp, spellbook: e.spellbook, perday: e.spellcasting, expnext: e.expnext, saves: e.saves })}`);
// Apoqulis, a dwarf cleric: Turns undead at 1st; a mace; +4 to most saves.
const cleric = await tool("kraken_build_character", { spec: { name: "Apoqulis", race: "Dwarf", class: "Cleric", abilities: { strength: 12, intelligence: 10, wisdom: 15, dexterity: 9, constitution: 13, charisma: 10 }, hpRoll: 5, gold: 100, buy: [["Mace", 1], ["Leather Armor", 1], ["Holy Symbol", 1]] } });
const c = agent.records.get(cleric.id).data;
assert(c.turn === 1 && c.saves.death.total === 11 - 4 && c.saves.breath.total === 16 - 3 && c.hp.total === 6, `a dwarf cleric: ${JSON.stringify(c.saves)} ${c.hp.total}`);
// Barthal, a halfling thief.
const thief = await tool("kraken_build_character", { spec: { name: "Barthal", race: "Halfling", class: "Thief", abilities: { strength: 10, intelligence: 12, wisdom: 10, dexterity: 16, constitution: 12, charisma: 10 }, hpRoll: 4, gold: 80, buy: [["Sling", 1], ["Shortsword", 1], ["Leather Armor", 1]] } });
const t = agent.records.get(thief.id).data;
const sling = Object.values(t.attacks).find((attack) => attack.name === "Sling");
assert(t.thiefskills.openlocks.total === 25 && t.thiefskills.climbwalls.total === 80 && t.initiative.total === 3 && sling.bonus === 1 + 2 + 1, `a halfling thief: open locks 25, climb 80, initiative +3, the sling +4: ${JSON.stringify(sling)}`);

// --- The fight ------------------------------------------------------------------
await tool("kraken_combat", { action: "add", recordId: darion.id });
force(5);
await tool("kraken_combat", { action: "add", recordId: npc("Goblin").id });
let view = (await tool("kraken_combat", { action: "view" })).entries;
const pc = view.find((entry) => entry.recordId === darion.id);
const gob = view.find((entry) => entry.name === "Goblin");
assert(gob.hp === 4 && gob.ac === 14 && gob.attacks[0].damage === "1d6" && gob.attacks[0].bonus === 0 && gob.morale === 7, `the goblin: 1d8-1 rolled (5 - 1 = 4 hit points), AC 14: ${JSON.stringify(gob)}`);
// Initiative: d6 + Dexterity, highest first.
force(2, 4);
await tool("kraken_combat", { action: "init", which: "all" });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === pc.id).initresult === 3 && view.find((entry) => entry.id === gob.id).initresult === 4 && view[0].name === "Goblin", `d6 initiative, highest first: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
await tool("kraken_combat", { action: "target", id: pc.id, targetId: gob.id, on: true });
// d20 + 3 against AC 14: 11 + 3 hits.
force(11);
let results = (await tool("kraken_combat", { action: "attack", recordId: darion.id, weapon: sword.item })).results;
assert(results[0].hit && /\[AC 14\] \[HIT 14 vs 14\]/.test(last(/\[ATTACK\]/).roll.label), `14 hits AC 14: ${last(/\[ATTACK\]/).roll.label}`);
force(1);
let damage = await tool("kraken_combat", { action: "damage-roll", recordId: darion.id, weapon: sword.item });
assert(damage.damage.total === 3, `1 + 2 damage: ${JSON.stringify(damage.damage)}`);
force(10);
results = (await tool("kraken_combat", { action: "attack", recordId: darion.id, weapon: sword.item })).results;
assert(!results[0].hit, "13 misses AC 14");
await tool("kraken_combat", { action: "damage-roll", recordId: darion.id, weapon: sword.item });
assert(said(/Longsword\/Scimitar -> Goblin: the attack missed/), "no damage after a miss");
force(1);
results = (await tool("kraken_combat", { action: "attack", recordId: darion.id, weapon: sword.item })).results;
assert(!results[0].hit && /AUTOMATIC MISS/.test(last(/\[ATTACK\]/).roll.label), "a natural 1 misses");
// The goblin strikes back: d20 + 0 against AC 17; a natural 20 hits.
await tool("kraken_combat", { action: "target", id: gob.id, targetId: pc.id, on: true });
force(20);
results = (await tool("kraken_combat", { action: "attack", id: gob.id, weapon: "0" })).results;
assert(results[0].hit && /AUTOMATIC HIT/.test(last(/\[ATTACK\]/).roll.label), "the goblin's natural 20 hits");
force(4);
await tool("kraken_combat", { action: "damage-roll", id: gob.id, weapon: "0" });
assert(agent.records.get(darion.id).data.hp.wounds === 4, "Darion takes 4");
// The goblin's save vs. Death Ray (Fighter 1: 12); a natural 1 fails.
force(12);
let save = await tool("kraken_combat", { action: "save", id: gob.id, attribute: "death", cl: 0 });
assert(save.save.success && save.save.target === 12, `a save at 12: ${JSON.stringify(save.save)}`);
force(1);
save = await tool("kraken_combat", { action: "save", id: pc.id, attribute: "spells", cl: 20 });
assert(!save.save.success && /NATURAL 1/.test(last(/\[SAVE\]/).roll.label), "a natural 1 fails whatever the bonus");
// Morale: 2d6 against 7.
force(5, 4);
const morale = await tool("kraken_combat", { action: "morale", id: gob.id });
assert(!morale.morale.stands && morale.morale.total === 9 && /BREAKS 9 vs 7/.test(last(/\[MORALE\]/).roll.label), `morale 9 against 7 breaks: ${JSON.stringify(morale.morale)}`);
// Dead at 0: the goblin has 1 left.
force(20);
await tool("kraken_combat", { action: "attack", recordId: darion.id, weapon: sword.item });
force(3);
await tool("kraken_combat", { action: "damage-roll", recordId: darion.id, weapon: sword.item });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === gob.id).health.status === "Dead" && view.find((entry) => entry.id === gob.id).wounds === 4, `dead at 0, no further: ${JSON.stringify(view.find((entry) => entry.id === gob.id))}`);
await tool("kraken_combat", { action: "heal", id: gob.id, amount: 5 });
assert(said(/cannot restore/), "healing does not raise the dead");

// Turning the undead: Apoqulis (Cleric 1) against three skeletons and a zombie: 13 turns skeletons, not the zombie (17).
await tool("kraken_combat", { action: "end", removeNpcs: true });
await tool("kraken_combat", { action: "add", recordId: cleric.id });
for (const name of ["Skeleton", "Skeleton", "Skeleton", "Zombie"]) {
  force(...(name === "Zombie" ? [4, 4] : [4]));
  await tool("kraken_combat", { action: "add", recordId: npc(name).id });
}
view = (await tool("kraken_combat", { action: "view" })).entries;
const clericEntry = view.find((entry) => entry.recordId === cleric.id);
assert(clericEntry.turns === 1, "the cleric turns at level 1");
force(1, 2, 3, 4, 5);
await tool("kraken_combat", { action: "init", which: "all" });
await tool("kraken_combat", { action: "set-turn", id: clericEntry.id });
force(14, 1, 1, 1, 1, 1, 1);
const turn = await tool("kraken_combat", { action: "turn-undead", recordId: cleric.id });
view = (await tool("kraken_combat", { action: "view" })).entries;
const turned = view.filter((entry) => entry.effects.some((effect) => /Turned/.test(effect.label)));
assert(turn.turn.roll === 14 && turn.turn.hitDice === 2 && turned.length === 2 && turned.every((entry) => /Skeleton/.test(entry.name)) && turn.turn.results.some((line) => /Zombie.*unaffected \(needs 17\)/.test(line)) && turn.turn.results.some((line) => /not reached/.test(line)), `14 turns two skeletons with 2 hit dice, the third not reached, the zombie needs 17: ${JSON.stringify(turn.turn.results)}`);
await tool("kraken_combat", { action: "end", removeNpcs: true });

// --- The sheet's rolls -----------------------------------------------------------------
force(12);
let check = await tool("kraken_siege_check", { id: darion.id, kind: "save", attribute: "death" });
assert(check.success && check.target === 12, "a save from the sheet: 12 vs 12");
force(16);
check = await tool("kraken_siege_check", { id: darion.id, kind: "check", attribute: "strength" });
assert(check.success && check.total === 18 && check.target === 17, "the ability roll: d20 + Strength's 2 at or above 17 at 1st level");
force(30);
check = await tool("kraken_siege_check", { id: thief.id, kind: "skill", skill: "openlocks" });
assert(!check.success && check.target === 25, "open locks: 30 over 25");
force(3, 4);
check = await tool("kraken_siege_check", { id: thief.id, kind: "morale" });
assert(check.success && check.target === 7, "loyalty: 2d6 at or under 7");
// The sheet's edits: a save's misc, a thief ability's misc, words.
await tool("kraken_character_edit", { id: thief.id, changes: [{ path: "thiefskills.openlocks.misc", value: 5 }, { path: "deity", value: "Tah" }, { path: "saves.death.misc", value: 1 }] });
const edited = agent.records.get(thief.id).data;
assert(edited.thiefskills.openlocks.total === 30 && edited.deity === "Tah" && edited.saves.death.total === 13 - 4 - 1, "the sheet's edits worked out again");

// --- Experience and levels ---------------------------------------------------------------
await tool("kraken_character_edit", { id: darion.id, changes: [{ path: "exp", value: 2000 }] });
force(6);
const up = await tool("kraken_level_up", { id: darion.id });
assert(up.level === 2 && up.gain === 6 + 1 && up.ab === 2 && agent.records.get(darion.id).data.expnext === 4000, `level 2: d8 6 + Con 1, AB +2: ${JSON.stringify(up)}`);
// To 10th: the 10th level's fixed +2, no roll.
for (let level = 3; level <= 9; level += 1) {
  force(4);
  await tool("kraken_level_up", { id: darion.id });
}
const nine = agent.records.get(darion.id).data.hp.total;
const ten = await tool("kraken_level_up", { id: darion.id });
assert(ten.level === 10 && ten.gain === 2 && ten.hp === nine + 2 && ten.ab === 6, `10th level: +2 fixed, AB +6: ${JSON.stringify(ten)}`);
// A Human's +10% experience from the party.
const humanShare = R.derive({ race: "Human", class: "fighter" }).xpbonus;
assert(humanShare === 10 && R.derive({ race: "Elf", class: "fighter" }).xpbonus === 0, "a Human earns +10% experience");

await server.close?.();
console.log(`ok bfrpg: ability bonuses, the attack bonus table (classes, combinations, monsters by hit dice), the five saves by class and level and a normal man's, experience to 20th, spells a day, thief abilities, the turning table, monster XP, hit points to 9th then fixed, race and class limits, what each class may use; the books (${count(ph, "race")} races, ${count(ph, "class")} classes, ${count(ph, "spell")} spells, ${count(ph, "item")} items; ${count(gm, "npc")} monsters, ${count(gm, "item")} magic items; the adventure's ${count(mill, "encounter")} story entries, 3 encounters, 3 parcels, 2 maps with walls), the licence; characters built (the shop's money and limits, a dwarf magic-user refused, an elf fighter/magic-user's spellbook, a dwarf cleric's saves, a halfling thief); d6 initiative highest first, attacks against ascending AC (natural 20 and 1), damage, dead at 0, saves (a natural 1 fails), morale, turning skeletons by 2d6 hit dice; the sheet's save, ability roll, thief ability and loyalty, its edits; level ups to 10th (fixed hit points after 9th)`);
process.exit(0);
