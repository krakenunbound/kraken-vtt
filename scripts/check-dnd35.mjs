// D&D 3.5E: the rules (base attack, saves, iterative attacks, spells per day,
// Armor Class, a creature's block read from FG 3.5E's fields), a character
// built from the books' records, and a fight on the tracker with fixed dice:
// initiative d20 + bonus, a threat confirmed into a critical (damage rolled
// twice), a threat not confirmed, a natural 1, a full attack's iteratives,
// saves (a natural 20 saves, a 1 fails), dying (10% to stabilize, else 1
// lost), disabled at 0, dead at -10; a check, a level up, the sheet's edits;
// 3.5E books on a 3.5E shelf; the character wizard (the GM's
// KrakenCharWizard35E): its options, ability methods, race and class plan,
// skill points, languages, alignment, feats and their prerequisites and
// targets, starting gold and the class storefront, spells and class choices,
// and the character the host builds from its spec. Made-up records in FG 3.5E's shapes, so it
// needs no licensed content.
import "./loopback.mjs";
import { createRequire } from "node:module";
import * as r35 from "../shared/dnd35/rules.mjs";
import * as W from "../shared/dnd35/wizard.mjs";

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

// --- The character wizard (the GM's KrakenCharWizard35E, shared/dnd35/wizard.mjs) ---
// More of a book, in FG 3.5E's shapes: classes with starting wealth, feats
// with prerequisites, priced gear under reference.equipment, spells and the
// cleric domains as the 3.5E Spells book keeps them (spelldesc, spelllists).
const BOOK = "Test 3.5E Book";
const ref = (kind, id) => `reference.${kind}.${id}@${BOOK}`;
make("class", "Cleric", { name: "Cleric", hitdie: "d8", bab: "Medium", fort: "Good", ref: "Bad", will: "Good", skillranks: 2, classskills: "Concentration, Craft, Diplomacy, Heal, Knowledge (arcana), Knowledge (religion), Profession, Spellcraft", startingwealth: "5d4 x 10 gp (average 125 gp).", fgPath: ref("classes", "cleric") });
make("class", "Rogue", { name: "Rogue", hitdie: "d6", bab: "Medium", fort: "Bad", ref: "Good", will: "Bad", skillranks: 8, classskills: "Appraise, Balance, Bluff, Climb, Hide, Jump, Listen, Move Silently, Open Lock, Search, Spot, Tumble", startingwealth: "5d4 x 10 gp (average 125 gp).", fgPath: ref("classes", "rogue") });
make("class", "Paladin", { name: "Paladin", hitdie: "d10", bab: "Fast", fort: "Good", ref: "Bad", will: "Bad", skillranks: 2, classskills: "Concentration, Diplomacy, Heal, Ride", fgPath: ref("classes", "paladin") });
make("race", "Drow", { name: "Drow", racialtraits: {} });
const feat = (name, fields) => make("feat", name, { name, type: "General", fgPath: ref("feats", name.toLowerCase().replace(/\W/g, "")), ...fields });
feat("Power Attack", { prerequisites: "Str 13", special: "<p>A fighter may select Power Attack as one of his fighter bonus feats.</p>" });
feat("Cleave", { prerequisites: "Str 13, Power Attack", special: "<p>A fighter may select Cleave as one of his fighter bonus feats.</p>" });
feat("Weapon Focus", { prerequisites: "Proficiency with weapon, base attack bonus +1", special: "<p>You can gain this feat multiple times. A fighter may select Weapon Focus as one of his fighter bonus feats.</p>" });
feat("Dodge", { prerequisites: "Dex 13", special: "<p>A fighter may select Dodge as one of his fighter bonus feats.</p>" });
feat("Toughness", { special: "<p>You may gain this feat multiple times.</p>" });
feat("Alertness", {});
feat("Spell Focus", { special: "<p>You can gain this feat multiple times.</p>" });
feat("Empower Spell", { type: "Metamagic" });
feat("Brew Potion", { type: "Item Creation", prerequisites: "Caster level 3rd" });
feat("Armor Proficiency (Light)", {});
const gearItem = (name, fields) => make("item", name, { name, fgPath: ref("equipment", name.toLowerCase().replace(/\W/g, "")), ...fields });
gearItem("Longsword", { type: "Weapon", subtype: "Martial One-Handed Melee", properties: "One-Handed Melee", damage: "1d8", critical: "19-20/x2", cost: "15 gp" });
gearItem("Sword, short", { type: "Weapon", subtype: "Martial Light Melee", properties: "Light Melee", damage: "1d6", critical: "19-20/x2", cost: "10 gp" });
gearItem("Mace, heavy", { type: "Weapon", subtype: "Simple One-Handed Melee", properties: "One-Handed Melee", damage: "1d8", critical: "x2", cost: "12 gp" });
gearItem("Backpack", { type: "Goods and Services", subtype: "Adventuring Gear", cost: "2 gp" });
gearItem("Torch", { type: "Goods and Services", subtype: "Adventuring Gear", cost: "1 cp" });
gearItem("Spyglass", { type: "Goods and Services", subtype: "Adventuring Gear", cost: "1,000 gp" });
gearItem("Chainmail", { type: "Armor", subtype: "Medium", ac: 5, maxstatbonus: 2, checkpenalty: -5, cost: "150 gp" });
gearItem("Holy symbol, wooden", { type: "Goods and Services", subtype: "Tools", cost: "1 gp" });
const spellRecord = (name, level, school) => make("spelldesc", name, { name, level, school, fgPath: `spelldesc.${name.toLowerCase().replace(/\W/g, "")}@Test Spells` });
spellRecord("Detect Magic", "Brd 0, Clr 0, Drd 0, Sor/Wiz 0", "Divination");
spellRecord("Light", "Brd 0, Clr 0, Drd 0, Sor/Wiz 0", "Evocation [Light]");
spellRecord("Daze", "Brd 0, Sor/Wiz 0", "Enchantment (Compulsion) [Mind-Affecting]");
spellRecord("Magic Missile", "Sor/Wiz 1", "Evocation [Force]");
spellRecord("Sleep", "Brd 1, Sor/Wiz 1", "Enchantment (Compulsion) [Mind-Affecting]");
spellRecord("Shield", "Sor/Wiz 1", "Abjuration");
spellRecord("Burning Hands", "Fire 1, Sor/Wiz 1", "Evocation [Fire]");
spellRecord("Color Spray", "Sor/Wiz 1", "Illusion (Pattern) [Mind-Affecting]");
spellRecord("Charm Person", "Brd 1, Sor/Wiz 1", "Enchantment (Charm) [Mind-Affecting]");
spellRecord("Mage Armor", "Sor/Wiz 1", "Conjuration (Creation) [Force]");
spellRecord("Bless", "Clr 1, Pal 1", "Enchantment (Compulsion) [Mind-Affecting]");
spellRecord("Cure Light Wounds", "Brd 1, Clr 1, Drd 1, Pal 1, Rgr 2", "Conjuration (Healing)");
spellRecord("Protection from Good", "Clr 1, Sor/Wiz 1, Evil 1", "Abjuration [Evil]");
spellRecord("Protection from Evil", "Clr 1, Pal 1, Sor/Wiz 1, Good 1", "Abjuration [Good]");
spellRecord("Divine Favor", "Clr 1, Pal 1", "Evocation");
spellRecord("Aid", "Clr 2, Good 2, Luck 2", "Enchantment (Compulsion) [Mind-Affecting]");
const link = (name, level) => ({ link: { class: "spelldesc", recordname: `spelldesc.${name.toLowerCase().replace(/\W/g, "")}@Test Spells` }, level });
make("spelllists", "clericdomains", { description: "Cleric spells by domain", domains: { gooddomain: { description: "Good Domain", grantedpower: "You cast good spells at +1 caster level.", spells: { protectionfromevil: link("Protection from Evil", 1), aid: link("Aid", 2) } }, firedomain: { description: "Fire Domain", grantedpower: "Turn or destroy water creatures.", spells: { burninghands: link("Burning Hands", 1) } }, evildomain: { description: "Evil Domain", grantedpower: "You cast evil spells at +1 caster level.", spells: { protectionfromgood: link("Protection from Good", 1) } }, lawdomain: { description: "Law Domain", grantedpower: "You cast law spells at +1 caster level.", spells: {} } } });
const lib = W.makeLib(agent.records.list({}).filter((record) => ["race", "class", "feat", "item", "spell", "spelldesc", "spelllists"].includes(record.type)));
assert(lib.spells.length === 16 && lib.domains.length === 4 && same(lib.domains.find((d) => d.name === "Good Domain").spells, [{ level: 1, name: "Protection from Evil" }, { level: 2, name: "Aid" }]), `the books for the wizard: spells (spelldesc) and the cleric domains: ${lib.spells.length} ${JSON.stringify(lib.domains)}`);

// The GM's options: the methods players may use, a roll lock, the low reroll.
assert(same(W.wizardOptions({}), { methods: [1, 2, 3, 4], rollLock: false, lowReroll: false, vault: false }) && same(W.wizardOptions({ methods: [3, 9, 2] }).methods, [2, 3]), "the wizard's options: every method unless the GM says");
let wb = W.newBuild({ methods: [2, 3] });
assert(wb.method === 2 && W.methodPerAbility(wb, { methods: [2, 3] }) && !W.methodArranges(wb, { methods: [2, 3] }), "4d6 not allowed: the first allowed method, 3d6 in order, one score at a time, not arranged");
wb = W.setMethod(W.newBuild(), 1, {});
wb = { ...wb, rolled: true, abilities: { strength: 15, dexterity: 7, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 } };
assert(W.canLowReroll(wb, { lowReroll: true }, "dexterity") && !W.canLowReroll(wb, { lowReroll: true }, "charisma") && !W.canLowReroll(wb, {}, "dexterity") && !W.canLowReroll({ ...wb, lowRerolled: { dexterity: true } }, { lowReroll: true }, "dexterity"), "the house rule: a 4d6 score under 8 may be rerolled once");
wb = W.swapScores(wb, "dexterity", "charisma");
assert(wb.abilities.dexterity === 8 && wb.abilities.charisma === 7, "scores swap when arranged");

// Race and class: the level adjustment, the class plan, the level increases.
wb = W.chooseRace({ ...W.newBuild(), targetLevel: 5 }, "Drow");
assert(W.levelAdjustment(wb) === 2 && W.targetClassLevel(wb) === 3 && W.maxClassLevels(wb) === 18, "a drow: level adjustment +2, three class levels at target level 5");
wb = W.chooseClass(W.chooseRace(W.newBuild(), "Dwarf"), "Fighter");
assert(same(wb.plan, [{ name: "Fighter", levels: 1 }]) && W.increasesDue(wb) === 0, "a 1st-level fighter");
wb = W.setTargetLevel(wb, 8);
assert(wb.plan[0].levels === 8 && W.increasesDue(wb) === 2 && !W.increasesComplete(wb), "target level 8: Fighter 8, two ability increases to place");
wb = W.chooseClass(W.startAddClass(W.setTargetLevel(wb, 4)), "Rogue", 2);
assert(same(wb.plan, [{ name: "Fighter", levels: 4 }, { name: "Rogue", levels: 2 }]) && wb.targetLevel === 6 && W.planSummary(wb) === "Fighter 4 / Rogue 2", `a multiclass plan, the target level from it: ${JSON.stringify(wb.plan)} ${wb.targetLevel}`);

// Skills: points by class, Intelligence and race; class skills 1 a rank, cross-class 2.
const scores = (overrides) => ({ ...{ strength: 15, dexterity: 13, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 }, ...overrides });
let hb = { ...W.chooseClass(W.chooseRace(W.newBuild(), "Human"), "Fighter"), abilities: scores({}) };
assert(W.skillBudget(hb, lib) === 12, `a human fighter: (2 + 0) x 4 + 4 = 12 skill points: ${W.skillBudget(hb, lib)}`);
let step = W.adjustSkill(hb, lib, "Climb", 1);
for (let i = 0; i < 5; i++) step = W.adjustSkill(step.b, lib, "Climb", 1);
assert(step.b.skills.Climb === 4, "a class skill: up to level + 3 ranks");
step = W.adjustSkill(step.b, lib, "Hide", 1);
assert(step.b.skills.Hide === 0.5 && W.skillsSpent(step.b, lib) === 5, `a cross-class skill: half a rank for a point: ${W.skillsSpent(step.b, lib)}`);
let mb = { ...W.chooseClass(W.startAddClass(W.chooseClass(W.chooseRace(W.newBuild(), "Human"), "Fighter", 1)), "Rogue", 1), abilities: scores({}) };
assert(W.skillBudget(mb, lib) === 12 + 9, `fighter 1 / rogue 1: 12 + (8 + 1): ${W.skillBudget(mb, lib)}`);
mb = { ...mb, skills: { Climb: 2, Hide: 2, Spellcraft: 1 } };
assert(W.skillsSpent(mb, lib) === 6, `multiclass: Climb and Hide a class skill of one class or another, Spellcraft cross-class: ${W.skillsSpent(mb, lib)}`);

// Languages: the race's, plus one per point of Intelligence bonus from its list.
let lb = { ...W.chooseClass(W.chooseRace(W.newBuild(), "Dwarf"), "Cleric"), abilities: scores({ intelligence: 14 }) };
assert(same(W.knownLanguages(lb), ["Common", "Dwarven"]) && W.languageLimit(lb) === 2 && W.languageOptions(lb).includes("Celestial") && W.languageOptions(lb).includes("Giant") && !W.languageOptions(lb).includes("Elven"), `a dwarf cleric: its languages and bonus list (and a cleric's): ${W.languageOptions(lb)}`);
lb = W.toggleLanguage(W.toggleLanguage(lb, "Giant").b, "Celestial").b;
assert(W.languagesComplete(lb) && W.toggleLanguage(lb, "Orc").error, "two chosen, no more");

// Alignment by class.
assert(same(W.allowedAlignments({ plan: [{ name: "Paladin", levels: 1 }] }), ["Lawful Good"]) && W.allowedAlignments({ plan: [{ name: "Druid", levels: 1 }] }).length === 5 && !W.alignmentAllowed({ plan: [{ name: "Bard", levels: 1 }] }, "Lawful Neutral"), "a paladin lawful good; a druid neutral; a bard not lawful");

// Feats: how many, the prerequisites, the targets, a fighter's bonus feat.
let fb = { ...W.chooseClass(W.chooseRace(W.newBuild(), "Human"), "Fighter"), abilities: scores({ strength: 12 }) };
assert(W.requiredFeatCount(fb) === 3, "a human fighter 1: a feat, the human's, the fighter's bonus feat");
const powerAttack = lib.feats.find((f) => f.name === "Power Attack");
assert(same(W.featProblems(fb, lib, powerAttack), ["Str 13"]) && W.addFeat(fb, lib, "Power Attack").error, "Power Attack needs Str 13");
fb = { ...fb, abilities: scores({}) };
fb = W.addFeat(fb, lib, "Power Attack").b;
assert(W.featProblems(fb, lib, lib.feats.find((f) => f.name === "Cleave")).length === 0, "Cleave, with Power Attack taken");
const pending = W.addFeat(fb, lib, "Weapon Focus").b;
assert(pending.pendingTarget === "Weapon Focus" && W.featTargets(pending, lib, "Weapon Focus").includes("long sword") === false && W.featTargets(pending, lib, "Weapon Focus").includes("longsword") && W.featTargets(pending, lib, "Weapon Focus").includes("ray"), `Weapon Focus asks for a weapon the fighter knows: ${W.featTargets(pending, lib, "Weapon Focus")}`);
fb = W.chooseFeatTarget(pending, "longsword");
assert(fb.feats.at(-1).name === "Weapon Focus (longsword)" && !W.featTargets(fb, lib, "Weapon Focus").includes("longsword"), "the target taken, not offered again");
fb = W.addFeat(fb, lib, "Alertness").b;
assert(W.featsComplete(fb, lib) && W.addFeat(fb, lib, "Dodge").error, `three feats, the fighter's bonus feat legal: ${W.featSummary(fb, lib)}`);
const notBonus = W.removeFeat(W.removeFeat(fb, "Power Attack"), "Weapon Focus");
assert(!W.bonusFeatsLegal(W.addFeat(W.addFeat(notBonus, lib, "Toughness").b, lib, "Toughness").b, lib), "Toughness and Alertness: no fighter bonus feat among them");
assert(W.featStatus(fb, lib, lib.feats.find((f) => f.name === "Brew Potion")).text === "Needs Caster level 3rd" && W.featStatus(fb, lib, lib.feats.find((f) => f.name === "Armor Proficiency (Light)")).text === "No benefit: has light armor", "what a feat needs, and a proficiency the fighter has");

// Gear: starting gold by class (wealth by level above 1st), the class storefront, no overspending.
assert(W.parseCostToCopper("1,000 gp") === 100000 && W.parseCostToCopper("5 sp") === 50 && W.parseCostToCopper("1/2 cp") === 1 && W.parseCostToCopper("2 pp") === 2000 && W.parseCostToCopper("-") === 0, "prices as the books write them");
let gb = W.chooseClass(W.chooseRace(W.newBuild(), "Human"), "Fighter");
assert(W.goldInfo(gb, lib).expr === "6d4*10" && W.goldInfo(W.chooseClass(gb, "Cleric"), lib).expr === "5d4*10" && W.goldInfo(W.setTargetLevel(gb, 3), lib).average === 2700, "6d4 x 10 for a fighter, 5d4 x 10 for a cleric, 2,700 gp of wealth at 3rd level");
const shop = W.shopItems(gb, lib, {}).map((item) => item.name);
assert(shop.includes("Longsword") && shop.includes("Backpack") && shop.includes("Torch") && shop.includes("Chainmail") && !shop.includes("Spyglass") && !shop.includes("Mace, heavy") && !shop.includes("Holy symbol, wooden"), `a fighter's storefront: ${shop}`);
const key = (name) => lib.items.find((item) => item.name === name && item.data.cost).key;
assert(W.adjustEquipment(gb, lib, {}, key("Backpack"), 1).error, "no gold rolled: nothing to buy with");
gb = { ...gb, gold: 160 };
gb = W.adjustEquipment(gb, lib, {}, key("Chainmail"), 1).b;
gb = W.adjustEquipment(gb, lib, {}, key("Torch"), 1).b;
assert(W.remainingCopper(gb, lib, {}) === 999 && W.adjustEquipment(gb, lib, {}, key("Longsword"), 1).error && W.coinText(999) === "9 gp, 9 sp, 9 cp", `160 gp - 150 gp - 1 cp = 9 gp 9 sp 9 cp left; the longsword is too dear: ${W.remainingCopper(gb, lib, {})}`);

// Spells and class choices: a wizard's spellbook, school and familiar; a cleric's deity, domains, turning.
let sb = { ...W.chooseClass(W.chooseRace(W.newBuild(), "Human"), "Wizard"), abilities: scores({ intelligence: 16 }) };
let buckets = W.spellBuckets(sb);
assert(buckets["wizard:1"].needed === 6 && buckets["school:0"] && buckets["familiar:0"] && !buckets["prohibited:0"], `a wizard's spellbook: 3 + Int 3; its school and familiar: ${JSON.stringify(Object.keys(buckets))}`);
sb = W.addSpell(sb, lib, "school:0", { name: "Evocation", record: "@choice:school:Evocation" }).b;
buckets = W.spellBuckets(sb);
assert(buckets["prohibited:0"].needed === 2 && !W.choiceRows(sb, lib, buckets["prohibited:0"]).some((row) => row.name === "Divination" || row.name === "Evocation"), "a specialist: two prohibited schools, not Divination, not its own");
for (const school of ["Enchantment", "Illusion"]) sb = W.addSpell(sb, lib, "prohibited:0", { name: school, record: `@choice:prohibited:${school}` }).b;
const book = W.bucketRows(sb, lib, W.spellBuckets(sb)["wizard:1"]).map((row) => row.name);
assert(book.includes("Magic Missile") && !book.includes("Sleep") && !book.includes("Color Spray") && !book.includes("Detect Magic"), `no spells of a prohibited school, no cantrips (the spellbook has them all): ${book}`);
for (const name of ["Magic Missile", "Shield", "Mage Armor", "Burning Hands", "Protection from Evil", "Protection from Good"]) sb = W.addSpell(sb, lib, "wizard:1", W.bucketRows(sb, lib, W.spellBuckets(sb)["wizard:1"]).find((row) => row.name === name)).b;
sb = W.addSpell(sb, lib, "familiar:0", { name: "Cat", record: "@choice:familiar:Cat" }).b;
assert(W.spellsComplete(sb) && W.addSpell(sb, lib, "wizard:1", { name: "Sleep", record: "x", level: 1 }).error, "the spellbook full, the choices made");
let cb = { ...W.chooseClass(W.chooseRace(W.newBuild(), "Human"), "Cleric"), alignment: "Lawful Good", abilities: scores({ wisdom: 15 }) };
buckets = W.spellBuckets(cb);
assert(buckets["deity:0"] && buckets["domain:0"].needed === 2 && !buckets["channel:0"] && W.forcedChannel(cb) === "Turn Undead", "a good cleric turns undead; a deity and two domains to choose");
assert(!W.choiceRows(cb, lib, buckets["deity:0"]).some((row) => /Nerull/.test(row.name)) && W.choiceRows(cb, lib, buckets["deity:0"]).some((row) => /Heironeous/.test(row.name)), "deities within one step of the cleric's alignment");
cb = W.addSpell(cb, lib, "deity:0", { name: "Heironeous (LG; Good, Law, War)", record: "@choice:deity:Heironeous" }).b;
assert(same(W.choiceRows(cb, lib, W.spellBuckets(cb)["domain:0"]).map((row) => row.name), ["Good Domain", "Law Domain"]), "Heironeous: the Good and Law domains the books have");
for (const name of ["Good Domain", "Law Domain"]) cb = W.addSpell(cb, lib, "domain:0", { name, record: `@choice:domain:${name}` }).b;
assert(W.spellsComplete(cb) && /every Cleric spell of levels 0-1/.test(W.autoSpellNote(cb)), `a cleric's class list goes on the sheet by itself: ${W.autoSpellNote(cb)}`);

// The whole wizard, Abilities to Commit, and the host's build of its spec.
let tb = W.newBuild();
tb = { ...tb, rolled: true, abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 15, wisdom: 12, charisma: 10 } };
tb = W.chooseClass(W.chooseRace(tb, "Human"), "Wizard");
tb = { ...tb, alignment: "Neutral Good" };
tb = W.toggleLanguage(W.toggleLanguage(tb, "Draconic").b, "Elven").b;
for (const [name, ranks] of [["Concentration", 4], ["Spellcraft", 4], ["Knowledge (arcana)", 4], ["Decipher Script", 4], ["Craft (alchemy)", 4]]) for (let i = 0; i < ranks; i++) tb = W.adjustSkill(tb, lib, name, 1).b;
assert(W.skillsComplete(tb, lib), `the skills all spent: ${W.skillSummary(tb, lib)}`);
tb = W.addFeat(W.addFeat(tb, lib, "Toughness").b, lib, "Alertness").b;
tb = W.addSpell(tb, lib, "school:0", { name: "Evocation", record: "@choice:school:Evocation" }).b;
for (const school of ["Enchantment", "Illusion"]) tb = W.addSpell(tb, lib, "prohibited:0", { name: school, record: `@choice:prohibited:${school}` }).b;
for (const name of ["Magic Missile", "Shield", "Mage Armor", "Burning Hands", "Protection from Evil"]) tb = W.addSpell(tb, lib, "wizard:1", W.bucketRows(tb, lib, W.spellBuckets(tb)["wizard:1"]).find((row) => row.name === name)).b;
tb = W.addSpell(tb, lib, "familiar:0", { name: "Toad", record: "@choice:familiar:Toad" }).b;
tb = { ...tb, gold: 75 };
tb = W.adjustEquipment(tb, lib, {}, key("Backpack"), 1).b;
tb = W.adjustEquipment(tb, lib, {}, key("Torch"), 1).b;
tb = W.adjustEquipment(tb, lib, {}, key("Torch"), 1).b;
tb = { ...tb, details: { name: "Mialee", gender: "Female", age: "92", appearance: "Grey robes" } };
const unfinished = W.warnings(tb, lib, {}).map((item) => item.page);
assert(unfinished.length === 0 && W.readyToCommit(tb, lib, {}), `every page done: ${unfinished}`);
const spec = W.toSpec(tb, lib, {});
assert(spec.fill === false && spec.gold === 72.98 && same(spec.gear, [["Backpack", 1], ["Torch", 2]]) && same(spec.choices.prohibited, ["Enchantment", "Illusion"]), `the spec: what was chosen, the gold left: ${JSON.stringify({ gold: spec.gold, gear: spec.gear })}`);
const wizardBuilt = await tool("kraken_build_character", { spec });
const wz = agent.records.get(wizardBuilt.id).data;
assert(wizardBuilt.problems.length === 0, `built from the wizard's spec: ${wizardBuilt.problems}`);
assert(wz.abilities.intelligence.score === 15 && wz.hp.total === 4 + 2 + 3 && same(wz.feats, ["Toughness", "Alertness", "Scribe Scroll"]) && wz.skills.craft.ranks === 4, `exactly the wizard's choices (no class feats added), Toughness's +3: ${wz.hp.total} ${wz.feats}`);
assert(wz.coins["id-00001"].amount === 72 && wz.coins["id-00002"].amount === 9 && wz.coins["id-00003"].amount === 8 && Object.values(wz.inventorylist).find((item) => item.name === "Torch").count === 2, `the coins left as gp, sp, cp; two torches: ${JSON.stringify(wz.coins)}`);
assert(wz.spells.includes("Magic Missile") && wz.spells.includes("Detect Magic") && wz.spells.includes("Light") && !wz.spells.includes("Daze"), `the spellbook: the chosen spells and every cantrip not of a prohibited school: ${wz.spells}`);
assert(wz.features.some((f) => f.name === "Specialist Wizard: Evocation" && /Prohibited schools: Enchantment, Illusion/.test(f.text)) && wz.features.some((f) => f.name === "Familiar: Toad"), "the school and the familiar on the sheet");
assert(wz.languages === "Common, Draconic, Elven" && wz.alignment === "Neutral Good" && wz.gender === "Female" && wz.appearance === "Grey robes" && !/Unfinished/.test(wz.notes ?? ""), `languages, alignment and details: ${wz.languages}`);
// A cleric: deity, domains (their spells), the class list for the levels it casts, not the opposed alignment's.
const clericSpec = { ...W.toSpec({ ...cb, details: { name: "Jozan" } }, lib, {}) };
const jozan = agent.records.get((await tool("kraken_build_character", { spec: clericSpec })).id).data;
assert(jozan.deity === "Heironeous" && jozan.domains === "Good Domain, Law Domain" && jozan.features.some((f) => f.name === "Turn Undead"), `the cleric's deity, domains, turning: ${jozan.deity} ${jozan.domains}`);
assert(jozan.spells.includes("Cure Light Wounds") && jozan.spells.includes("Light") && jozan.spells.includes("Protection from Evil") && !jozan.spells.includes("Protection from Good") && !jozan.spells.includes("Aid") && !jozan.spells.includes("Magic Missile"), `a lawful good cleric 1: every cleric spell of levels 0-1 but the evil one, a domain's 1st-level spell: ${jozan.spells}`);
assert(/Unfinished in the character wizard/.test(jozan.notes) && /skill points/.test(jozan.notes), "saved unfinished: what is left in its notes");
// A multiclass plan's hit points as FG adds them: d10 + 2, then a d6's average 4 (3.5 rounded) + 2.
const multi = agent.records.get((await tool("kraken_build_character", { spec: { name: "Lidda", race: "Human", classes: [{ name: "Fighter", level: 1 }, { name: "Rogue", level: 1 }], scores: scores({}), fill: false, increases: {} } })).id).data;
assert(multi.hp.total === 12 + 6 && multi.level === 2 && multi.bab === 1 && multi.classes.length === 2, `fighter 1 / rogue 1: ${multi.hp.total} hp, BAB ${multi.bab}`);
// A drow: its level adjustment counts in its experience.
const drow = agent.records.get((await tool("kraken_build_character", { spec: { name: "Viconia", race: "Drow", class: "Cleric", level: 1, scores: scores({ intelligence: 13 }), fill: false } })).id).data;
assert(drow.la === 2 && drow.exp === 3000 && drow.expnext === 6000 && drow.abilities.intelligence.score === 13 + 2, `a drow cleric 1: effective level 3 (3,000 XP), its ability adjustments from Kraken's table: ${drow.exp} ${drow.abilities.intelligence.score}`);

// The shelf: 3.5E books for a 3.5E campaign, not C&C's.
assert(fitsRuleset({ ruleset: "3.5E" }, "D&D 3.5E") && !fitsRuleset({ ruleset: "3.5E" }, "Castles & Crusades") && fitsRuleset({ kraken: "D&D 3.5E" }, "D&D 3.5E") && !fitsRuleset({ ruleset: "SiegeCore" }, "D&D 3.5E"), "3.5E books on a 3.5E shelf, and packs by their Kraken ruleset");
await server.close?.();
console.log("ok dnd35: base attack, saves, iteratives, spells per day, AC; a creature's block; a dwarf fighter and a wizard built from the books; initiative, a confirmed critical x2, an unconfirmed threat, a natural 1, a full attack, saves, disabled / dying / stable / dead; a skill check, a level up, the sheet's edits; the character wizard (methods, the low reroll, a drow's level adjustment, a multiclass plan, skill points and multiclass costs, languages, alignment by class, feats with prerequisites, targets and a fighter's bonus feat, starting gold, wealth by level and the class storefront, a wizard's spellbook, school and familiar, a cleric's deity and domains) and the characters the host builds from its spec; the shelf");
process.exit(0);
