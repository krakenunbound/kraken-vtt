// D&D 3.5E: the rules (base attack, saves, iterative attacks, spells per day,
// Armor Class, a creature's block read from FG 3.5E's fields), a character
// built from the books' records, and a fight on the tracker with fixed dice:
// initiative d20 + bonus, a threat confirmed into a critical (damage rolled
// twice), a threat not confirmed, a natural 1, a full attack's iteratives,
// saves (a natural 20 saves, a 1 fails), dying (10% to stabilize, else 1
// lost), disabled at 0, dead at -10; a check, a level up, the sheet's edits;
// 3.5E books on a 3.5E shelf. Made-up records in FG 3.5E's shapes, so it
// needs no licensed content.
import "./loopback.mjs";
import { createRequire } from "node:module";
import * as r35 from "../shared/dnd35/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { fitsRuleset } = require("../electron/books.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- The rules ---------------------------------------------------------------
assert(r35.babFor("Fast", 11) === 11 && r35.babFor("Medium", 4) === 3 && r35.babFor("Slow", 7) === 3, "base attack by progression");
assert(r35.saveFor("Good", 4) === 4 && r35.saveFor("Bad", 4) === 1 && r35.saveFor("Good", 1) === 2, "base saves good and poor");
assert(same(r35.iteratives(16), [16, 11, 6, 1]) && same(r35.iteratives(5), [5]) && same(r35.iteratives(6), [6, 1]), "iterative attacks");
assert(same(r35.spellsPerDay("Wizard", 1, 16), [3, 2]) && same(r35.spellsPerDay("Wizard", 5, 16), [4, 4, 3, 2]), `a wizard's spells per day with Int 16: ${JSON.stringify(r35.spellsPerDay("Wizard", 5, 16))}`);
assert(same(r35.spellsPerDay("Cleric", 1, 14), [3, 3]), "a cleric's: the domain spell and a Wisdom bonus spell");
assert(same(r35.spellsPerDay("Paladin", 4, 12), [null, 1]) && same(r35.spellsPerDay("Paladin", 3, 12), []), "a paladin from 4th level, 0 + a bonus spell");
assert(same(r35.spellsPerDay("Wizard", 3, 11), [4, 2, null]), "no spells above the ability's reach (Int 11: 1st level only)");
assert(r35.xpFor(2) === 1000 && r35.xpFor(3) === 3000 && r35.xpFor(20) === 190000, "experience by level");
assert(same(r35.parseCritical("19-20/x2"), { range: 19, mult: 2 }) && same(r35.parseCritical("x3"), { range: 20, mult: 3 }) && same(r35.parseCritical("18–20/×2"), { range: 18, mult: 2 }), "criticals");
const ogreData = { name: "Ogre", ac: "16 (-1 size, -1 Dex, +5 natural, +3 hide), touch 8, flat-footed 16", hd: "4d8+11", hp: 29, init: -1, babgrp: "+3/+12", atk: "Greatclub +8 melee (2d8+7)", fullatk: "Greatclub +8 melee (2d8+7) or javelin +1 ranged (1d8+5)", fortitudesave: 6, reflexsave: 0, willsave: 1, strength: 21, dexterity: 8 };
const ogre = r35.npcStats(ogreData);
assert(ogre.ac === 16 && ogre.touch === 8 && ogre.flatfooted === 16 && ogre.hp === 29 && ogre.init === -1 && ogre.bab === 3 && ogre.grapple === 12, `an ogre's block: ${JSON.stringify(ogre)}`);
assert(ogre.attacks.length === 2 && ogre.attacks[0].name === "Greatclub" && same(ogre.attacks[0].bonuses, [8]) && ogre.attacks[0].damage === "2d8+7" && ogre.attacks[1].type === "ranged", `its attacks: ${JSON.stringify(ogre.attacks)}`);
const trollData = { name: "Troll", ac: "16 (+2 Dex, +5 natural, -1 size), touch 11, flat-footed 14", hp: 63, init: 2, babgrp: "+4/+14", atk: "Claw +9 melee (1d6+6)", fullatk: "2 claws +9 melee (1d6+6) and bite +4 melee (1d6+3)", fortitudesave: 11, reflexsave: 4, willsave: 3 };
const troll = r35.npcStats(trollData);
assert(troll.attacks[0].name === "Claw" && same(troll.attacks[0].bonuses, [9, 9]) && troll.attacks[1].name === "Bite" && same(troll.attacks[1].bonuses, [4]), `two claws and a bite: ${JSON.stringify(troll.attacks)}`);
const orc = r35.npcStats({ ac: "13", hp: 5, atk: "Falchion +4 melee (2d4+4/18-20)" });
assert(same(orc.attacks[0].crit, { range: 18, mult: 2 }) && orc.attacks[0].damage === "2d4+4", `a falchion's threat range: ${JSON.stringify(orc.attacks[0])}`);
const fighter = { name: "Fighter", hitdie: "d10", bab: "Fast", fort: "Good", ref: "Bad", will: "Bad", skillranks: "2", classskills: "Climb (Str), Craft (Int), Handle Animal (Cha), Intimidate (Cha), Jump (Str), Ride (Dex), Swim (Str)" };
const wizard = { name: "Wizard", hitdie: "d4", bab: "Slow", fort: "Bad", ref: "Bad", will: "Good", skillranks: "2", classskills: "Concentration (Con), Craft (Int), Decipher Script (Int), Knowledge (arcana) (Int), Spellcraft (Int)" };
const info = r35.classInfo({ name: "Fighter", data: fighter });
assert(info.hitdie === 10 && info.classskills.includes("climb") && info.classskills.includes("handleanimal") && info.skillranks === 2, `a class read from its record: ${JSON.stringify(info)}`);
const trait = (name, text) => ({ name, text: `<p>${text}</p>` });
const dwarf = { name: "Dwarf", racialtraits: { "id-00001": trait("Ability Score Racial Traits", "+2 Constitution, -2 Charisma. Dwarves are stout."), "id-00002": trait("Medium", "As Medium creatures, dwarves have no special bonuses."), "id-00003": trait("Slow and Steady", "Dwarves have a base land speed of 20 feet.") } };
const human = { name: "Human", racialtraits: { "id-00001": trait("Medium", "Medium."), "id-00002": trait("Human Base Speed", "Human base land speed of 30 feet.") } };
const halfling = { name: "Halfling", racialtraits: { "id-00001": trait("Ability Score Racial Traits", "+2 Dexterity, -2 Strength."), "id-00002": trait("Small", "As a Small creature, a halfling gains a +1 size bonus to Armor Class."), "id-00003": trait("Lucky", "Halflings have a +1 racial bonus on all saving throws.") } };
const race = r35.raceInfo({ name: "Dwarf", data: dwarf });
assert(same(race.adjust, { constitution: 2, charisma: -2 }) && race.size === "medium" && race.speed === 20, `a race read from its traits: ${JSON.stringify(race)}`);
assert(r35.raceInfo({ name: "Halfling", data: halfling }).size === "small" && r35.raceInfo({ name: "Halfling", data: halfling }).saves === 1, "a halfling: small, +1 to saves");

// --- A table of D&D 3.5E ----------------------------------------------------
const server = createTableServer({ ruleset: "D&D 3.5E" });
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
make("class", "Fighter", fighter);
make("class", "Wizard", wizard);
make("race", "Dwarf", dwarf);
make("race", "Human", human);
make("race", "Halfling", halfling);
make("item", "Longsword", { name: "Longsword", type: "Weapon", subtype: "Martial One-Handed Melee", properties: "One-Handed Melee", damage: "1d8", critical: "19-20/x2", damagetype: "Slashing" });
make("item", "Greataxe", { name: "Greataxe", type: "Weapon", subtype: "Martial Two-Handed Melee", properties: "Two-Handed Melee", damage: "1d12", critical: "x3", damagetype: "Slashing" });
make("item", "Scale mail", { name: "Scale mail", type: "Armor", subtype: "Medium", ac: 4, maxstatbonus: 3, checkpenalty: -4, spellfailure: 25 });
make("item", "Shield, heavy steel", { name: "Shield, heavy steel", type: "Armor", subtype: "Shield", ac: 2, checkpenalty: -2, spellfailure: 15 });
make("item", "Crossbow, light", { name: "Crossbow, light", type: "Weapon", properties: "Ranged", subtype: "Simple Ranged", damage: "1d8", critical: "19-20/x2", range: 80 });
const ogreRecord = make("npc", "Ogre", ogreData);
const trollRecord = make("npc", "Troll", trollData);

// A dwarf fighter: Str 15 Dex 13 Con 14+2 Int 10 Wis 12 Cha 8-2; scale mail and a heavy shield.
const built = await tool("kraken_build_character", { spec: { name: "Tordek", race: "Dwarf", class: "Fighter", level: 1, gear: ["Longsword", "Scale mail", "Heavy steel shield"] } });
const tordek = agent.records.get(built.id);
const t = tordek.data;
assert(built.problems.length === 0, `the gear found by its words ("Heavy steel shield"): ${built.problems}`);
assert(t.ruleset === "dnd35" && t.abilities.constitution.score === 16 && t.abilities.charisma.score === 6 && t.abilities.strength.score === 15, `scores in the class's order, with the dwarf's: ${JSON.stringify(t.abilities)}`);
assert(t.hp.total === 13 && t.bab === 1 && t.grapple === 3 && t.saves.fortitude.total === 5 && t.saves.reflex.total === 1 && t.saves.will.total === 1 && t.speed === 20, `hit points, base attack, grapple, saves, speed: ${t.hp.total} ${t.bab} ${t.grapple} ${JSON.stringify(t.saves)}`);
assert(t.ac.total === 17 && t.ac.touch === 11 && t.ac.flatfooted === 16 && t.ac.acp === -6, `AC 17, touch 11, flat-footed 16, armor check -6: ${JSON.stringify(t.ac)}`);
const sword = Object.values(t.attacks).find((attack) => attack.name === "Longsword");
assert(sword && same(sword.bonuses, [4]) && sword.damage === "1d8+2" && same(sword.crit, { range: 19, mult: 2 }) && t.feats.includes("Weapon Focus (Longsword)"), `the longsword: +1 base, +2 Str, +1 Weapon Focus: ${JSON.stringify(sword)} ${t.feats}`);
assert(t.skills.climb.classskill && t.skills.climb.ranks > 0 && t.skills.climb.total === t.skills.climb.ranks + 2 - 6, `a class skill with ranks, Str and the armor check penalty: ${JSON.stringify(t.skills.climb)}`);
assert(t.skills.decipherscript.total === null, "a trained-only skill without ranks cannot be rolled");
assert(t.packages.class1.name === "Fighter" && t.packages.race.name === "Dwarf", "race and class as packages, for the lists");
const mialee = await tool("kraken_build_character", { spec: { name: "Mialee", race: "Human", class: "Wizard", level: 5, gear: ["Crossbow, light"] } });
const m = agent.records.get(mialee.id).data;
assert(m.abilities.intelligence.score === 16 && same(m.spellcasting.perday, [4, 4, 3, 2]) && m.spellcasting.dc === 13 && m.feats.includes("Scribe Scroll") && m.feats.length === 4, `a 5th-level wizard: Int 15+1, spells per day, DC, feats (2 + human + Scribe Scroll): ${JSON.stringify(m.spellcasting)} ${m.feats}`);
const bow = Object.values(m.attacks).find((attack) => attack.name === "Crossbow, light");
assert(bow.damage === "1d8" && same(bow.bonuses, [2 + 2]) && bow.type === "ranged", `a crossbow: no Strength to damage; Dex to hit: ${JSON.stringify(bow)}`);

// --- The fight ----------------------------------------------------------------
await tool("kraken_combat", { action: "add", recordId: tordek.id });
await tool("kraken_combat", { action: "add", recordId: ogreRecord.id });
await tool("kraken_combat", { action: "add", recordId: trollRecord.id });
let view = (await tool("kraken_combat", { action: "view" })).entries;
const fighterEntry = view.find((entry) => entry.recordId === tordek.id);
const ogreEntry = view.find((entry) => entry.name === "Ogre");
const trollEntry = view.find((entry) => entry.name === "Troll");
assert(ogreEntry.hp === 29 && ogreEntry.ac === 16 && ogreEntry.init === -1 && trollEntry.init === 2, `the ogre's numbers from its block: ${JSON.stringify(ogreEntry)}`);
assert(trollEntry.attacks?.[0]?.name === "Claw" && same(trollEntry.attacks[0].bonuses, [9, 9]), `the troll's attacks on the tracker: ${JSON.stringify(trollEntry.attacks)}`);
force(15, 10, 3);
await tool("kraken_combat", { action: "init", which: "all" });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === fighterEntry.id).initresult === 16 && view.find((entry) => entry.id === ogreEntry.id).initresult === 9 && view.find((entry) => entry.id === trollEntry.id).initresult === 5, `initiative d20 + bonus: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
await tool("kraken_combat", { action: "target", id: fighterEntry.id, targetId: ogreEntry.id, on: true });
// A threat (19) that hits, confirmed (15 + 4 = 19 against AC 16): a critical, damage twice.
force(19, 15);
let results = (await tool("kraken_combat", { action: "attack", recordId: tordek.id, weapon: sword.item })).results;
assert(results[0].hit && results[0].crit && results[0].confirm === 19, `a confirmed critical: ${JSON.stringify(results)}`);
assert(/CRITICAL HIT x2/.test(last(/\[ATTACK\]/).roll.label), "the card says CRITICAL HIT x2");
force(5, 6);
let damage = await tool("kraken_combat", { action: "damage-roll", recordId: tordek.id, weapon: sword.item });
assert(damage.damage.total === 15 && damage.damage.rolls[0].crit, `damage rolled twice, bonus and all: (5+2)+(6+2) = 15: ${JSON.stringify(damage.results)}`);
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === ogreEntry.id).wounds === 15, "the ogre takes 15");
// A threat not confirmed (2 + 4 = 6): a hit, damage once.
force(20, 2);
results = (await tool("kraken_combat", { action: "attack", recordId: tordek.id, weapon: sword.item })).results;
assert(results[0].hit && !results[0].crit && /threat not confirmed/.test(last(/\[ATTACK\]/).roll.label), `a natural 20 hits; not confirmed, no critical: ${JSON.stringify(results)}`);
force(3);
damage = await tool("kraken_combat", { action: "damage-roll", recordId: tordek.id, weapon: sword.item });
assert(damage.damage.total === 5 && !damage.damage.rolls[0].crit, "damage once: 3 + 2");
// A natural 1 misses, and its damage does not land.
force(1);
results = (await tool("kraken_combat", { action: "attack", recordId: tordek.id, weapon: sword.item })).results;
assert(!results[0].hit && /AUTOMATIC MISS/.test(last(/\[ATTACK\]/).roll.label), "a natural 1 misses");
await tool("kraken_combat", { action: "damage-roll", recordId: tordek.id, weapon: sword.item });
assert(said(/Longsword -> Ogre: the attack missed/), "no damage after a miss");
// The troll's full attack: both claws at the fighter, one hits.
await tool("kraken_combat", { action: "target", id: trollEntry.id, targetId: fighterEntry.id, on: true });
force(15, 3);
results = (await tool("kraken_combat", { action: "attack", id: trollEntry.id, weapon: "0", full: true })).results;
assert(results.length === 2 && results[0].hit && !results[1].hit && results[0].total === 24, `a full attack: each claw rolled: ${JSON.stringify(results)}`);
force(4);
damage = await tool("kraken_combat", { action: "damage-roll", id: trollEntry.id, weapon: "0" });
assert(damage.damage.total === 10 && damage.damage.rolls.length === 1, `one claw's damage, 4 + 6: ${JSON.stringify(damage.results)}`);
// Saves: d20 + the save against a DC; a natural 20 saves, a natural 1 fails.
force(10);
let save = (await tool("kraken_combat", { action: "save", id: fighterEntry.id, attribute: "fortitude", cl: 15 })).save;
assert(save.success === true && save.total === 15, `Fortitude 10 + 5 against 15: ${JSON.stringify(save)}`);
force(1);
save = (await tool("kraken_combat", { action: "save", id: fighterEntry.id, attribute: "constitution", cl: 2 })).save;
assert(save.success === false && save.save === "fortitude", "a natural 1 fails; Constitution means Fortitude");
force(20);
save = (await tool("kraken_combat", { action: "save", id: ogreEntry.id, attribute: "will", cl: 40 })).save;
assert(save.success === true, "a natural 20 saves");
// Hit points: 0 disabled, -1 dying, the turn's 10% to stabilize, else 1 more lost; -10 dead.
const status = async (id) => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === id).health.status;
await tool("kraken_combat", { action: "damage", id: fighterEntry.id, amount: 3 });
{ const s = await status(fighterEntry.id); assert(s === "Disabled", `0 hit points: Disabled (${s}, wounds ${agent.records.get(tordek.id).data.hp.wounds})`); }
await tool("kraken_combat", { action: "damage", id: fighterEntry.id, amount: 1 });
assert((await status(fighterEntry.id)) === "Dying", "-1: Dying");
let refused = "";
try {
  await tool("kraken_combat", { action: "attack", recordId: tordek.id, weapon: sword.item });
} catch (error) {
  refused = error.message;
}
assert(/dying and cannot act/.test(refused), `the dying cannot attack: ${refused}`);
force(50);
await tool("kraken_combat", { action: "next" });
assert(agent.records.get(tordek.id).data.hp.wounds === 15 && (await status(fighterEntry.id)) === "Dying", "its turn: 50 on d100, 1 more hit point lost");
await tool("kraken_combat", { action: "next" });
await tool("kraken_combat", { action: "next" });
force(7);
await tool("kraken_combat", { action: "next" });
assert((await status(fighterEntry.id)) === "Stable" && agent.records.get(tordek.id).data.hp.wounds === 15, "next round: 7 on d100, Stable");
await tool("kraken_combat", { action: "update", id: ogreEntry.id, patch: { wounds: 39 } });
assert((await status(ogreEntry.id)) === "Dead", "-10: Dead");
await tool("kraken_combat", { action: "end", removeNpcs: true });

// A check, a level up, the sheet's edits.
await tool("kraken_record_update", { id: tordek.id, patch: { data: { hp: { wounds: 0 } } } }).catch(() => undefined);
force(12);
const check = await tool("kraken_siege_check", { id: tordek.id, kind: "skill", skill: "Climb", dc: 10 });
assert(check.total === 12 + t.skills.climb.total && check.success === (12 + t.skills.climb.total >= 10), `a Climb check: ${JSON.stringify(check)}`);
force(7);
const up = await tool("kraken_level_up", { id: tordek.id });
const after = agent.records.get(tordek.id).data;
assert(up.level === 2 && after.bab === 2 && after.hp.total === 13 + 7 + 3 && after.saves.fortitude.total === 6 && up.bab === 2, `level 2: +7 +3 hit points, base attack 2, Fortitude 3 + 3: ${JSON.stringify(up)} ${after.hp.total}`);
await tool("kraken_character_edit", { id: tordek.id, changes: [{ path: "skills.swim.ranks", value: 2.5 }, { path: "feats", value: "Weapon Focus (Longsword)\nPower Attack\nImproved Initiative" }, { path: "abilities.dexterity.score", value: 15 }] });
const edited = agent.records.get(tordek.id).data;
assert(edited.skills.swim.ranks === 2.5 && edited.initiative.total === 2 + 4 && edited.ac.dex === 2, `edits worked out again (Improved Initiative +4, Dex 15): ${edited.initiative.total} ${JSON.stringify(edited.skills.swim)}`);

// The shelf: 3.5E books for a 3.5E campaign, not C&C's.
assert(fitsRuleset({ ruleset: "3.5E" }, "D&D 3.5E") && !fitsRuleset({ ruleset: "3.5E" }, "Castles & Crusades") && fitsRuleset({ kraken: "D&D 3.5E" }, "D&D 3.5E") && !fitsRuleset({ ruleset: "SiegeCore" }, "D&D 3.5E"), "3.5E books on a 3.5E shelf, and packs by their Kraken ruleset");
await server.close?.();
console.log("ok dnd35: base attack, saves, iteratives, spells per day, AC; a creature's block; a dwarf fighter and a wizard built from the books; initiative, a confirmed critical x2, an unconfirmed threat, a natural 1, a full attack, saves, disabled / dying / stable / dead; a skill check, a level up, the sheet's edits; the shelf");
process.exit(0);
