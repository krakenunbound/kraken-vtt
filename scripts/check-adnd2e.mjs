// AD&D 2E: the rules (the ability tables, exceptional Strength, THAC0 and
// saves by class group, experience, spells per day with Wisdom's bonus, a
// weapon's damage to Small/Medium and Large, a creature's block read from FG
// 2E's fields), characters built by the wizard (a fighter with 18/76
// Strength, an elf fighter/mage, a halfling thief's skills) and from a book's
// pregen, and a fight on the tracker with fixed dice: d10 initiative lowest
// first, THAC0 attacks (a natural 20 hits, a 1 misses), damage by the
// target's size, a creature's claw/claw/bite, the five saves, an effect's
// rounds counted the lowest-first way, Death's Door (a point lost a round,
// bound wounds, dead at -10; a creature dead at 0); a save, an ability check
// and a thief skill from the sheet, a level up, the sheet's edits; 2E books
// on a 2E shelf. Made-up records in FG 2E's shapes: no licensed content.
import "./loopback.mjs";
import { createRequire } from "node:module";
import * as r2 from "../shared/adnd2e/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { fitsRuleset } = require("../electron/books.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- The rules ---------------------------------------------------------------
assert(r2.strengthOf(17).hitadj === 1 && r2.strengthOf(17).dmgadj === 1 && r2.strengthOf(18, 0).dmgadj === 2, "Strength 17 and 18");
assert(r2.strengthOf(18, 50).dmgadj === 3 && r2.strengthOf(18, 76).hitadj === 2 && r2.strengthOf(18, 76).dmgadj === 4 && r2.strengthOf(18, 100).hitadj === 3 && r2.strengthOf(18, 100).dmgadj === 6 && r2.strengthOf(18, 100).opendoors === "16(6)", "exceptional Strength: 18/50, 18/76, 18/00");
assert(same(r2.dexterityOf(16), { reactionadj: 1, missileadj: 1, defenseadj: -2 }) && r2.dexterityOf(5).defenseadj === 2, "Dexterity's adjustments");
assert(r2.constitutionOf(17).hitpointadj === 2 && r2.constitutionOf(17).warriorhpadj === 3 && r2.constitutionOf(14).systemshock === 88 && r2.constitutionOf(14).resurrectionsurvival === 92, "Constitution: +3 for a warrior only; system shock, resurrection");
assert(r2.intelligenceOf(12).languages === 3 && r2.intelligenceOf(12).learn === 50 && r2.wisdomOf(14).spellbonus === "2x1st" && r2.wisdomOf(10).failure === 15 && r2.charismaOf(17).maxhench === 10, "Intelligence, Wisdom, Charisma");
assert(r2.thacoFor("warrior", 1) === 20 && r2.thacoFor("warrior", 7) === 14 && r2.thacoFor("priest", 4) === 18 && r2.thacoFor("rogue", 5) === 18 && r2.thacoFor("wizard", 7) === 18, "THAC0 by class group");
assert(same(r2.savesFor("warrior", 1), { paralyzation: 14, rod: 16, petrification: 15, breath: 17, spell: 17 }) && same(r2.savesFor("wizard", 6), { paralyzation: 13, rod: 9, petrification: 11, breath: 13, spell: 10 }) && r2.savesFor("warrior", 0).breath === 20, "saving throws by group and level");
assert(r2.xpFor("Fighter", 2) === 2000 && r2.xpFor("Paladin", 2) === 2250 && r2.xpFor("Mage", 12) === 750000 && r2.xpFor("Mage", 13) === 1125000 && r2.levelForXp("Thief", 2600) === 3, "experience by class");
assert(same(r2.spellsPerDay("Cleric", 1, 14), [3, 0, 0, 0, 0, 0, 0]) && same(r2.spellsPerDay("Mage", 5, 10).slice(0, 4), [4, 2, 1, 0]) && same(r2.spellsPerDay("Paladin", 8, 18), [0, 0, 0, 0]) && r2.spellsPerDay("Paladin", 9, 18)[0] === 1, "spells a day: a cleric's with Wisdom 14, a mage's, a paladin from 9th");
assert(same(r2.weaponDamage({ type: "Weapon", damage: "1d8 slashing;1d12 slashing, large;" }), { small: "1d8", large: "1d12" }) && same(r2.weaponDamage({ name: "Two-handed sword" }), { small: "1d10", large: "3d6" }), "a weapon's damage to Small/Medium and Large");
const lionData = { name: "Mountain Lion", ac: 6, thaco: 17, hp: 18, hitDice: "3+1", damage: "1d3/1d3/1d6", numberattacks: "3", size: "M", saves: { death: { score: 14 }, rod: { score: 16 }, petrification: { score: 15 }, breath: { score: 17 }, spell: { score: 17 } } };
const lion = r2.npcStats(lionData);
assert(lion.ac === 6 && lion.thaco === 17 && lion.hp === 18 && lion.attacks.length === 3 && lion.attacks[2].damage === "1d6" && lion.saves.paralyzation === 14 && !lion.large, `a mountain lion's block: claw, claw, bite: ${JSON.stringify(lion)}`);
const ogreData = { name: "Ogre", ac: 4, thaco: 17, hp: 25, hitDice: "4+1", size: "Large (9'+)", damage: "1d10+2", numberattacks: "1", weaponlist: { "id-00001": { name: "Club", attackbonus: 0, damagelist: { "id-00001": { dice: "1d10", bonus: 2, type: "" } } } }, saves: { death: { score: 13 }, rod: { score: 15 }, petrification: { score: 14 }, breath: { score: 16 }, spell: { score: 16 } } };
const ogre = r2.npcStats(ogreData);
assert(ogre.large && ogre.attacks.length === 1 && ogre.attacks[0].name === "Club" && ogre.attacks[0].damage === "1d10+2", `an ogre: Large, its club from the weapon list: ${JSON.stringify(ogre.attacks)}`);
const goblin = r2.npcStats({ ac: 6, hitDice: "1-1", damage: "1d6" });
assert(goblin.thaco === 20 && goblin.hp === 3 && goblin.saves.breath === 20, `no THAC0 or saves given: worked out from the hit dice (under one die: THAC0 20, saves at 0): ${JSON.stringify(goblin)}`);
assert(r2.monsterThaco(r2.hitDiceOf("4+1")) === 17 && r2.monsterThaco(r2.hitDiceOf("2")) === 19 && r2.monsterThaco(r2.hitDiceOf("7")) === 13 && r2.monsterThaco(r2.hitDiceOf("20")) === 3, "a monster's THAC0 by hit dice");

// --- A table of AD&D 2E ------------------------------------------------------
const server = createTableServer({ ruleset: "AD&D 2E" });
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
const make = (type, name, data) => agent.records.create({ type, name, visibility: "gm", data }, agent.seat);
const ogreRecord = make("npc", "Ogre", ogreData);
const lionRecord = make("npc", "Mountain Lion", lionData);

// A human fighter: Str 18/76, Dex 16, Con 16; long sword, chain mail and a shield.
const built = await tool("kraken_build_character", { spec: { name: "Brannoc", race: "Human", class: "Fighter", level: 1, scores: { strength: 18, strengthPercent: 76, dexterity: 16, constitution: 16, intelligence: 10, wisdom: 12, charisma: 11 }, gear: ["Long sword", "Chain mail", "Shield"] } });
const brannoc = agent.records.get(built.id);
const b = brannoc.data;
assert(built.problems.length === 0, `no problems: ${built.problems}`);
assert(b.ruleset === "adnd2e" && b.abilities.strength.percent === 76 && b.thaco === 20 && built.thaco === 20, `a 2E fighter, THAC0 20: ${JSON.stringify(b.abilities.strength)}`);
assert(b.hp.total === 12 && b.ac.total === 2 && b.initiative.total === -1 && b.saves.paralyzation.total === 14 && b.saves.spell.total === 17, `hit points 10 + 2, AC 5 - shield - Dex 2 = 2, initiative -1, saves: ${b.hp.total} ${JSON.stringify(b.ac)} ${b.initiative.total}`);
const sword = Object.values(b.attacks).find((attack) => attack.name === "Long sword");
assert(sword && sword.tohit === 2 && sword.damage === "1d8+4" && sword.damagelarge === "1d12+4" && sword.proficient, `the long sword: +2 to hit, +4 damage, S/M and L: ${JSON.stringify(sword)}`);
assert(b.profs.weaponslots === 4 && b.profs.weapon.includes("Long sword") && b.profs.nonweaponslots === 3 && b.rate === "1/1", `proficiencies: ${JSON.stringify(b.profs)}`);
assert(b.packages.class1.name === "Fighter" && b.packages.race.name === "Human", "race and class as packages, for the lists");
const elf = await tool("kraken_build_character", { spec: { name: "Lirael", race: "Elf", class: "Fighter/Mage", level: 1 } });
const e = agent.records.get(elf.id).data;
assert(elf.problems.length === 0 && e.classes.length === 2 && e.abilities.strength.score === 16 && e.abilities.intelligence.score === 15 && e.abilities.dexterity.score === 14 && e.abilities.constitution.score === 13, `an elf fighter/mage: each class's prime first, the elf's +1 Dex -1 Con: ${elf.problems} ${JSON.stringify(e.abilities)}`);
assert(e.hp.total === Math.floor((10 + 4) / 2) && e.spellcasting[0].class === "Mage" && e.spellcasting[0].perday[0] === 1 && e.exp === 0 && e.expnext === 4000, `multi-class: hit points divided, a mage's spell, experience split: ${e.hp.total} ${JSON.stringify(e.spellcasting)} ${e.expnext}`);
const bad = await tool("kraken_build_character", { spec: { race: "Dwarf", class: "Mage" } });
assert(bad.problems.some((problem) => /dwarf cannot be a mage/.test(problem)), `a dwarf mage is flagged: ${bad.problems}`);
const thief = await tool("kraken_build_character", { spec: { name: "Pip", race: "Halfling", class: "Thief", level: 1, scores: { strength: 10, dexterity: 17, constitution: 14, intelligence: 12, wisdom: 10, charisma: 10 }, skills: { hideinshadows: 30 } } });
const p = agent.records.get(thief.id).data;
const hide = p.thiefskills.hideinshadows;
assert(p.abilities.dexterity.score === 18 && hide.base === 5 && hide.race === 15 && hide.dex === 10 && hide.points === 30 && hide.total === 60, `a halfling thief's Hide in Shadows: 5 + 15 + 10 + 30: ${JSON.stringify(hide)}`);
assert(Object.values(p.thiefskills).reduce((sum, row) => sum + row.points, 0) === 60 && p.skillpoints === 60, "all 60 points spent");
const sling = Object.values(p.attacks).find((attack) => /bow/i.test(attack.name));
assert(sling && sling.type === "ranged" && sling.tohit === 2 + 0, `a short bow: Dexterity's missile +2 (no halfling bonus with a bow): ${JSON.stringify(sling)}`);
// A book's pregenerated character, FG 2E's sheet.
const pregen = make("pregencharsheet", "Sister Mara", { name: "Sister Mara", race: "Human", alignment: "Lawful Good", abilities: { strength: { score: 12 }, dexterity: { score: 9 }, constitution: { score: 15 }, intelligence: { score: 10 }, wisdom: { score: 17 }, charisma: { score: 13 } }, classes: { "id-00001": { name: "Cleric", level: 2 } }, hp: { total: 14, wounds: 0 }, inventorylist: { "id-00001": { name: "Mace", type: "Weapon", carried: 2, damage: "1d6+1 bludgeoning;1d6 bludgeoning, large;", speedfactor: 7 }, "id-00002": { name: "Banded mail", type: "Armor", subtype: "Armor", ac: 4, carried: 2 } }, proficiencylist: { "id-00001": { name: "Mace" } }, skilllist: { "id-00001": { name: "Healing" } }, exp: 1600 });
const taken = await tool("kraken_build_character", { spec: { pregen: pregen.id } });
const m = agent.records.get(taken.id);
assert(m.name === "Sister Mara" && m.data.classes[0].name === "Cleric" && m.data.hp.total === 14 && m.data.ac.total === 4 && m.data.thaco === 20 && m.data.profs.nonweapon[0] === "Healing", `a pregen taken as the book made it: ${JSON.stringify({ ac: m.data.ac, hp: m.data.hp, thaco: m.data.thaco })}`);
assert(m.data.spellcasting[0].perday[0] === 2 + 2 && m.data.spellcasting[0].perday[1] === 0, `a 2nd-level cleric with Wisdom 17: two 1st-level spells and Wisdom's two (13, 14); the 2nd- and 3rd-level bonus spells wait: ${JSON.stringify(m.data.spellcasting)}`);

// --- The fight ----------------------------------------------------------------
await tool("kraken_combat", { action: "add", recordId: brannoc.id });
await tool("kraken_combat", { action: "add", recordId: ogreRecord.id });
await tool("kraken_combat", { action: "add", recordId: lionRecord.id });
let view = (await tool("kraken_combat", { action: "view" })).entries;
const fighterEntry = view.find((entry) => entry.recordId === brannoc.id);
const ogreEntry = view.find((entry) => entry.name === "Ogre");
const lionEntry = view.find((entry) => entry.name === "Mountain Lion");
assert(ogreEntry.hp === 25 && ogreEntry.ac === 4 && lionEntry.attacks?.length === 3 && lionEntry.attacks[0].thaco === 17, `the creatures' numbers from their blocks: ${JSON.stringify(ogreEntry)} ${JSON.stringify(lionEntry.attacks)}`);
assert(ogreEntry.attacks[0].damage === "1d10+2", `the ogre's club: ${JSON.stringify(ogreEntry.attacks)}`);
// Initiative: d10 + modifiers, lowest first (the fighter's Dexterity takes 1 off).
force(3, 7, 5);
await tool("kraken_combat", { action: "init", which: "all" });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === fighterEntry.id).initresult === 2 && view.find((entry) => entry.id === ogreEntry.id).initresult === 7, `d10 initiative: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
assert(same(view.map((entry) => entry.name), ["Brannoc", "Mountain Lion", "Ogre"]), `lowest first: ${view.map((entry) => entry.name)}`);
await tool("kraken_combat", { action: "target", id: fighterEntry.id, targetId: ogreEntry.id, on: true });
// THAC0 20 against AC 4: 16 needed; 14 + 2 hits.
force(14);
let results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].hit && results[0].need === 16 && /\[THAC0 20\] \[AC 4\] \[HIT 16 vs 16\]/.test(last(/\[ATTACK\]/).roll.label), `a hit at THAC0 - AC: ${JSON.stringify(results)} ${last(/\[ATTACK\]/).roll.label}`);
// The ogre is Large: the long sword's 1d12 + 4.
force(6);
let damage = await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
assert(damage.damage.total === 10 && damage.damage.rolls[0].large && /\[LARGE\]/.test(last(/\[DAMAGE\]/).roll.label), `Large damage, 6 + 4: ${JSON.stringify(damage.damage)}`);
force(13);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(!results[0].hit, "15 against 16 misses");
await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
assert(said(/Long sword -> Ogre: the attack missed/), "no damage after a miss");
force(20);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].hit && /AUTOMATIC HIT/.test(last(/\[ATTACK\]/).roll.label), "a natural 20 hits");
force(1);
await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
force(1);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(!results[0].hit && /AUTOMATIC MISS/.test(last(/\[ATTACK\]/).roll.label), "a natural 1 misses");
// The mountain lion's whole round at the fighter (THAC0 17 against AC 2: 15 needed): claw hits, claw misses, bite hits.
await tool("kraken_combat", { action: "target", id: lionEntry.id, targetId: fighterEntry.id, on: true });
force(15, 3, 20);
results = (await tool("kraken_combat", { action: "attack", id: lionEntry.id, weapon: "0", full: true })).results;
assert(results.length === 3 && results[0].hit && !results[1].hit && results[2].hit && results[0].need === 15, `claw, claw, bite: ${JSON.stringify(results)}`);
force(2, 4);
damage = await tool("kraken_combat", { action: "damage-roll", id: lionEntry.id, weapon: "0" });
assert(damage.damage.total === 6 && damage.damage.rolls.length === 2 && !damage.damage.rolls[0].large, `each hit its own damage, a claw's 1d3 and the bite's 1d6: ${JSON.stringify(damage.damage)}`);
assert(agent.records.get(brannoc.id).data.hp.wounds === 6, "the fighter takes 6");
// Saves: d20 + modifier at or above the number.
force(13);
let save = (await tool("kraken_combat", { action: "save", id: fighterEntry.id, attribute: "paralyzation", cl: 1 })).save;
assert(save.success && save.target === 14 && save.total === 14, `Paralyzation 14: 13 + 1: ${JSON.stringify(save)}`);
force(13);
save = (await tool("kraken_combat", { action: "save", id: fighterEntry.id, attribute: "poison" })).save;
assert(!save.success && save.save === "paralyzation", "13 fails; poison is Paralyzation, Poison or Death");
force(16);
save = (await tool("kraken_combat", { action: "save", id: ogreEntry.id, attribute: "breath" })).save;
assert(save.success && save.target === 16, "the ogre's Breath Weapon save from its block");
// An effect's rounds, the lowest-first way: put on in the fighter's turn, it ends at the fighter's next.
await tool("kraken_combat", { action: "next" });
view = (await tool("kraken_combat", { action: "view" })).entries;
const active = () => tool("kraken_combat", { action: "view" }).then((state) => state.entries.find((entry) => entry.id === state.active)?.name);
assert((await active()) === "Brannoc", `round 1 starts with the lowest: ${await active()}`);
await tool("kraken_combat", { action: "effect", id: ogreEntry.id, effect: { label: "Blinded", duration: 1 } });
await tool("kraken_combat", { action: "next" });
assert((await active()) === "Mountain Lion", "then the mountain lion (5)");
await tool("kraken_combat", { action: "next" });
assert((await active()) === "Ogre" && (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === ogreEntry.id).effects.length === 1, "then the ogre (7), still blinded");
await tool("kraken_combat", { action: "next" });
assert((await active()) === "Brannoc" && (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === ogreEntry.id).effects.length === 0, "round 2, the fighter's turn: the effect is over");
// Death's Door: at 0 dying, a hit point lost each round; bound wounds stop it; -10 dead. A creature dies at 0.
const status = async (id) => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === id).health.status;
await tool("kraken_combat", { action: "damage", id: fighterEntry.id, amount: 6 });
assert((await status(fighterEntry.id)) === "Dying", `0 hit points: Dying (${await status(fighterEntry.id)})`);
let refused = "";
try {
  await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item });
} catch (error) {
  refused = error.message;
}
assert(/dying and cannot act/.test(refused), `the dying cannot attack: ${refused}`);
await tool("kraken_combat", { action: "next" });
await tool("kraken_combat", { action: "next" });
await tool("kraken_combat", { action: "next" });
assert((await active()) === "Brannoc" && agent.records.get(brannoc.id).data.hp.wounds === 13, `round 3, the fighter's turn: 1 more lost (${agent.records.get(brannoc.id).data.hp.wounds})`);
await tool("kraken_combat", { action: "stabilize", id: fighterEntry.id });
assert((await status(fighterEntry.id)) === "Unconscious" && said(/binds Brannoc's wounds/), "bound wounds: Unconscious, no longer dying");
await tool("kraken_combat", { action: "next" });
await tool("kraken_combat", { action: "next" });
await tool("kraken_combat", { action: "next" });
assert(agent.records.get(brannoc.id).data.hp.wounds === 13, "no more lost once bound");
await tool("kraken_combat", { action: "damage", id: fighterEntry.id, amount: 9 });
assert((await status(fighterEntry.id)) === "Dead", "-10: Dead");
await tool("kraken_combat", { action: "damage", id: lionEntry.id, amount: 18 });
assert((await status(lionEntry.id)) === "Dead", "a creature at 0: Dead");
await tool("kraken_combat", { action: "end", removeNpcs: true });

// From the sheet: a save, an ability check, a thief skill; a level up; the sheet's edits.
await tool("kraken_record_update", { id: brannoc.id, patch: { data: { hp: { wounds: 0 } } } }).catch(() => undefined);
force(17);
let check = await tool("kraken_siege_check", { id: brannoc.id, kind: "save", attribute: "spell" });
assert(check.success && check.target === 17, `a Spell save, 17 needed: ${JSON.stringify(check)}`);
force(19);
check = await tool("kraken_siege_check", { id: brannoc.id, kind: "check", attribute: "strength" });
assert(!check.success && check.target === 18 && /\[CHECK\] Strength \[UNDER 18\] \[FAILURE 19 under 18\]/.test(last(/\[CHECK\]/).roll.label), `a Strength check: d20 at or under 18: ${JSON.stringify(check)}`);
force(60);
check = await tool("kraken_siege_check", { id: thief.id, kind: "skill", skill: "hideinshadows" });
assert(check.success && check.target === 60, `Hide in Shadows: 60 on d100 under 60: ${JSON.stringify(check)}`);
force(7);
const up = await tool("kraken_level_up", { id: brannoc.id });
const after = agent.records.get(brannoc.id).data;
assert(up.level === 2 && after.thaco === 19 && up.thaco === 19 && after.hp.total === 12 + 7 + 2 && after.exp === 2000, `level 2: 7 + 2 hit points, THAC0 19: ${JSON.stringify(up)} ${after.hp.total}`);
force(3);
const elfUp = await tool("kraken_level_up", { id: elf.id, package: "Mage" });
const e2 = agent.records.get(elf.id).data;
assert(elfUp.level === 2 && e2.classes.find((cls) => cls.name === "Mage").level === 2 && e2.classes.find((cls) => cls.name === "Fighter").level === 1 && e2.hp.total === e.hp.total + 1, `a multi-class character levels one class; the hit die divided (3 / 2): ${JSON.stringify(e2.classes)} ${e2.hp.total}`);
await tool("kraken_character_edit", { id: brannoc.id, changes: [{ path: "abilities.strength.percent", value: 100 }, { path: "profs.weapon", value: "Long sword\nShort bow" }, { path: "saves.spell.misc", value: 2 }] });
const edited = agent.records.get(brannoc.id).data;
const sword2 = Object.values(edited.attacks).find((attack) => attack.name === "Long sword");
assert(sword2.tohit === 3 && sword2.damage === "1d8+6" && edited.saves.spell.total === 15 && edited.profs.weapon.length === 2, `18/00: +3 / +6; a save's misc bonus: ${JSON.stringify(sword2)} ${edited.saves.spell.total}`);
await tool("kraken_character_edit", { id: thief.id, changes: [{ path: "thiefskills.openlocks.points", value: 20 }] });
assert(agent.records.get(thief.id).data.thiefskills.openlocks.points === 20, "a thief skill's points from the sheet");

// The shelf: 2E books for a 2E campaign (a pack made as "2E" before Kraken played it, too), not Worldbuilding's.
assert(fitsRuleset({ ruleset: "2E" }, "AD&D 2E") && fitsRuleset({ kraken: "2E", ruleset: "2E" }, "AD&D 2E") && !fitsRuleset({ kraken: "2E", ruleset: "2E" }, "Worldbuilding") && !fitsRuleset({ ruleset: "2E" }, "D&D 3.5E"), "2E books on a 2E shelf");
await server.close?.();
console.log("ok adnd2e: the ability tables, exceptional Strength, THAC0 and saves by group, experience, spells a day, damage S/M and L, creatures' blocks; a fighter, an elf fighter/mage, a halfling thief, a pregen; d10 initiative lowest first, THAC0 hits and misses, Large damage, claw/claw/bite, the five saves, effect rounds, Death's Door, bound wounds; a save, a check and a thief skill from the sheet, level ups, the sheet's edits; the shelf");
process.exit(0);
