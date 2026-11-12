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
// on a 2E shelf; the 2E character wizard's rules (Kraken's FG extension
// KrakenCharWizard2E's tables) and the character the host builds from what
// it chose. Made-up records in FG 2E's shapes: no licensed content.
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

// --- The 2E character wizard's rules (the FG extension's tables) -------------
const wz = await import("../shared/adnd2e/wizard.mjs");
assert(same(wz.allowedMethods(undefined), [1, 2, 3, 4, 5, 6]) && same(wz.allowedMethods({ methods: [] }), [5]) && wz.methodFor(1, { methods: [2, 5] }) === 5 && wz.methodFor(3, { methods: [3] }) === 3, "the GM's ability methods: all by default, Method V when none, V preferred");
assert(wz.bestGroup([1, 2, 3, 6, 5, 6]) === 17 && same(wz.collectScores([9, 14, 7, 16, 12, 11, 15, 8, 13, 10, 6, 17], "keepbest6"), [17, 16, 15, 14, 13, 12]), "Method II's better 3d6; Method IV keeps the best six");
assert(same(wz.placeViDie([3, 6, 5], 8), { pool: [5, 3], score: 14 }) && wz.placeViDie([6], 13) === null && wz.placeViDie([6, 5], 13).score === 18, "Method VI: the largest die that still fits under 18");
const rolled = { strength: 15, dexterity: 12, constitution: 10, intelligence: 14, wisdom: 13, charisma: 9 };
assert(wz.raceBlocked("Dwarf", rolled) && !wz.raceBlocked("Human", rolled) && !wz.raceBlocked("Elf", rolled) && !wz.raceBlocked("Dwarf", {}), "PHB Table 7's ranges: a Con 10 dwarf ruled out (only once all six are rolled)");
assert(!wz.classAllowedForRace("Mage", "Dwarf") && wz.classAllowedForRace("Illusionist", "Gnome") && wz.classAllowedForRace("Bard", "Half-Elf") && !wz.classAllowedForRace("Bard", "Elf"), "the classes a race may take");
assert(wz.classBlockedByAbilities("Paladin", rolled, "Human") && !wz.classBlockedByAbilities("Fighter", rolled, "Human") && wz.classBlockedByAbilities("Illusionist", rolled, "Human"), "class minimums (a paladin's Charisma 17, an illusionist's Dexterity 16)");
assert(wz.maxLevelFor("Halfling", "fighter") === 9 && wz.maxLevelFor("Elf", "thief") === 20 && wz.maxLevelFor("Human", "fighter") === 20 && wz.targetLevel({ race: "Halfling", cls: "Fighter", level: 12 }) === 9, "demihuman level limits cap the starting level");
const elfBuild = { abilities: { ...rolled, constitution: 12 }, race: "Elf", cls: "Fighter", level: 1 };
assert(wz.classTypeOptions(elfBuild).some((option) => option.label === "Multi-class: Fighter/Mage") && wz.classTypeOptions(elfBuild).some((option) => option.label === "Multi-class: Fighter/Mage/Thief"), `an elf fighter's multi-classes: ${JSON.stringify(wz.classTypeOptions(elfBuild).map((o) => o.label))}`);
const dualBuild = { abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 17, charisma: 9 }, race: "Human", cls: "Fighter", level: 3 };
assert(wz.classTypeOptions(dualBuild).some((option) => option.label === "Dual-class: then Cleric") && !wz.classTypeOptions(dualBuild).some((option) => option.label === "Dual-class: then Mage"), "a human fighter (Str 16) dual-classes into cleric (Wis 17), not mage");
assert(same(wz.alignmentOptions("paladin"), ["Lawful Good"]) && !wz.alignmentOptions("thief").includes("Lawful Good") && wz.alignmentOptions("bard").every((a) => a.includes("Neutral")) && same(wz.alignmentOptions("druid"), ["True Neutral"]), "class alignments");
const fighter = { abilities: rolled, race: "Human", cls: "Fighter", level: 1, mode: "single", classList: [] };
assert(wz.wealthInfo(fighter).dice === "5d4" && wz.wealthInfo(fighter).mult === 10 && wz.wealthInfo({ ...fighter, level: 3 }, { gold: "perlevel" }).dice === "15d4" && wz.wealthInfo({ ...fighter, level: 3 }, { gold: "xlevel" }).mult === 30 && wz.wealthInfo({ ...fighter, cls: "Mage" }).plus === 1, "starting wealth: 5d4 x 10 gp, per level, times the level, a wizard's 1d4+1");
assert(wz.weaponSlots(fighter) === 4 && wz.weaponSlots({ ...fighter, level: 3 }) === 5 && wz.nonweaponSlots(fighter) === 3 && wz.weaponSlots({ ...fighter, cls: "Mage" }) === 1 && wz.nonweaponSlots({ ...fighter, cls: "Mage" }) === 4, "proficiency slots (PHB Table 34)");
assert(wz.weaponSlots({ ...fighter, cls: "Mage", kit: { name: "Witch", book: "" } }) === 0 && wz.weaponSlots({ ...fighter, kit: { name: "Swashbuckler", book: "Complete Fighter's Handbook" } }) === 6, "a kit's own slots: a witch none, a fighter swashbuckler two more");
assert(wz.weaponSlots({ ...elfBuild, mode: "multi", classList: ["Fighter", "Mage"] }) === 4 && wz.nonweaponSlots({ ...elfBuild, mode: "multi", classList: ["Fighter", "Mage"] }) === 4, "a multi-class: the largest initial slots");
const names = (build) => wz.starterCatalog([], build).map((item) => item.name);
assert(!names({ ...fighter, cls: "Mage" }).some((name) => /armor|mail|shield/i.test(name)) && names({ ...fighter, cls: "Mage" }).includes("Dagger") && !names({ ...fighter, cls: "Mage" }).includes("Long sword"), "a mage's shop: no armor, a dagger, no sword");
assert(names({ ...fighter, cls: "Cleric" }).includes("Mace") && !names({ ...fighter, cls: "Cleric" }).includes("Long sword") && names({ ...fighter, cls: "Cleric" }).includes("Plate mail"), "a cleric's shop: blunt weapons, any armor");
assert(names({ ...fighter, cls: "Thief" }).includes("Leather armor") && !names({ ...fighter, cls: "Thief" }).includes("Chain mail") && !names({ ...fighter, cls: "Thief" }).some((name) => /shield|buckler/i.test(name)) && names({ ...fighter, cls: "Thief" }).includes("Arrows (12)"), "a thief's shop: leather, no shield, arrows for a bow");
assert(wz.starterCatalog([{ name: "Sword, Long", type: "Weapon", cost: "15 gp", fgPath: "item.x@Some Book" }, { name: "Cloak of Elvenkind", type: "Gear", subtype: "Magic", cost: "100 gp" }], fighter).filter((item) => /long/i.test(item.name) && /sword/i.test(item.name)).length === 1 && !wz.starterCatalog([{ name: "Cloak of Elvenkind", type: "Gear", subtype: "Magic", cost: "100 gp" }], fighter).some((item) => item.name === "Cloak of Elvenkind"), "a book's long sword stands for Kraken's; magic items are never starting gear");
assert(wz.languageCount(12) === 3 && wz.languageCount(18) === 7 && same(wz.raceLanguages("Dwarf"), ["Common", "Dwarvish"]), "languages by Intelligence and race");
const mageCaster = wz.casterEntries({ ...fighter, cls: "Mage" })[0];
const illusionist = wz.casterEntries({ ...fighter, cls: "Illusionist" })[0];
const clericCaster = wz.casterEntries({ ...fighter, cls: "Cleric" })[0];
assert(wz.spellSlots(mageCaster, 1) === 1 && wz.spellSlots(illusionist, 1) === 2 && wz.spellSlots(clericCaster, 1, 15) === 3 && wz.casterEntries({ ...fighter, cls: "Paladin" }).every((c) => wz.maxSpellLevel(c) === 0), "spells to pick: a mage's 1, a specialist's 2, a cleric's 1 + Wisdom 15's 2, a paladin's none at 1st");
const spellBook = [{ name: "Magic Missile", level: 1, school: "Evocation" }, { name: "Sleep", level: 1, school: "Enchantment/Charm" }, { name: "Cure Light Wounds", level: 1, sphere: "Healing" }, { name: "Entangle", level: 1, sphere: "Plant" }];
assert(same(wz.spellCatalog(spellBook, mageCaster).map((s) => s.name), ["Magic Missile", "Sleep"]) && same(wz.spellCatalog(spellBook, clericCaster).map((s) => s.name), ["Cure Light Wounds"]) && wz.spellCatalog(spellBook, wz.casterEntries({ ...fighter, cls: "Enchanter" })[0]).every((s) => s.name !== "Magic Missile") && wz.spellCatalog(spellBook, illusionist).every((s) => s.name !== "Magic Missile"), "the spell list: a wizard's schools, a cleric's spheres (no plant), a specialist's opposition barred");
assert(wz.kitBlocked({ name: "Swashbuckler", book: "Complete Fighter's Handbook", data: {} }, { ...fighter, cls: "Thief" }) && !wz.kitBlocked({ name: "Swashbuckler", book: "Complete Fighter's Handbook", data: {} }, fighter) && wz.kitBlocked({ name: "Test", book: "", data: { text: "<p>Requirements: Strength 17</p>" } }, fighter), "kits by their book and their requirements");
assert(wz.kitProfAllowed("Dagger", { name: "Thespian" }) && !wz.kitProfAllowed("Long sword", { name: "Thespian" }) && !wz.kitProfAllowed("Long bow", { name: "Berserker" }), "a kit's weapon limits");
// The host builds what the wizard chose.
const wizBuilt = r2.buildFromSpec({ wizard: true, name: "Corwin", race: "Human", class: "Fighter", level: 3, scores: { strength: 17, dexterity: 13, constitution: 16, intelligence: 12, wisdom: 10, charisma: 11 }, hpRolls: { Fighter: [7, 4] }, alignment: "Lawful Neutral", kit: "Swashbuckler", gear: [["Long sword", 1], ["Arrows (12)", 2], "Leather armor"], money: 12.34, weapons: ["Long sword", "Short bow"], specialize: "Long sword", weaponSlots: 7, nonweapon: ["Endurance"], languages: ["Common", "Orcish"], gender: "Male", age: "19", height: "6' 1\"", personalitytraits: "Quick to laugh." });
const wb = wizBuilt.data;
assert(wizBuilt.problems.length === 0 && wb.hp.total === 12 + 9 + 6 && wb.exp === 4000 && wb.profs.weaponslots === 7 && wb.profs.specialized === "Long sword", `the wizard's fighter: hit points 10+2, 7+2, 4+2; 4000 XP; a kit's 7 slots: ${wizBuilt.problems} ${wb.hp.total} ${wb.exp} ${JSON.stringify(wb.profs)}`);
const coin = (name) => Object.values(wb.coins).find((row) => row.name === name)?.amount;
assert(coin("GP") === 12 && coin("SP") === 3 && coin("CP") === 4 && coin("PP") === 0, `the purse laid out as coins: ${JSON.stringify(wb.coins)}`);
const arrows = Object.values(wb.inventorylist).find((item) => item.name === "Arrows (12)");
const swordAttack = Object.values(wb.attacks).find((attack) => attack.name === "Long sword");
assert(arrows?.count === 24 && arrows.cost === "3 sp" && swordAttack.tohit === 1 + 1 && swordAttack.damage === "1d8+3" && swordAttack.specialized, `two dozen arrows; the specialized long sword +1 hit, +2 damage: ${JSON.stringify(swordAttack)}`);
assert(wb.background === "Swashbuckler" && wb.languages === "Common, Orcish" && wb.gender === "Male" && wb.height === "6' 1\"" && /Personality: Quick to laugh/.test(wb.notes) && wb.profs.nonweapon[0] === "Endurance", "the kit, languages and details on the sheet");
const priest = r2.buildFromSpec({ wizard: true, race: "Human", class: "Cleric", scores: { strength: 12, dexterity: 10, constitution: 12, intelligence: 10, wisdom: 15, charisma: 10 }, money: 25 });
assert(Object.values(priest.data.coins).find((row) => row.name === "GP").amount === 3 && /3 gp/.test(priest.data.notes), "a priest keeps 3 gp; the rest goes to his order");
const dual = r2.buildFromSpec({ wizard: true, race: "Human", class: "Cleric", level: 5, dual: { class: "Fighter", level: 4 }, scores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 17, charisma: 9 }, hpRolls: { Fighter: [5, 5, 5], Cleric: [4, 4, 4, 6] } });
assert(dual.problems.length === 0 && dual.data.classes.length === 2 && dual.data.classes[0].active === false && dual.data.hp.total === 10 + 15 + 6 && dual.data.exp === r2.xpFor("Fighter", 4) + r2.xpFor("Cleric", 5), `a dual-class: fighter 4 (inactive), then cleric 5; hit points only past the fighter's level: ${dual.problems} ${dual.data.hp.total} ${JSON.stringify(dual.data.classes)}`);
const gnome = r2.buildFromSpec({ race: "Gnome", class: "Illusionist/Thief", scores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 14, wisdom: 10, charisma: 10 } });
assert(gnome.problems.length === 0 && gnome.data.spellcasting[0].perday[0] === 2, `a gnome illusionist/thief (the extension's combinations), a specialist's extra spell: ${gnome.problems} ${JSON.stringify(gnome.data.spellcasting)}`);

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
// The GM's options for the 2E character wizard (the FG extension's): roll lock, the methods, gold above 1st level.
const wizardOptions = await tool("kraken_table_options", { wizard2e: { rollLock: true, methods: [1, 5, 9] } });
const wizardGold = await tool("kraken_table_options", { wizard2e: { gold: "perlevel" } });
assert(wizardOptions.wizard2e.rollLock && same(wizardOptions.wizard2e.methods, [1, 5]) && wizardOptions.wizard2e.gold === "phb" && wizardGold.wizard2e.gold === "perlevel" && same(wizardGold.wizard2e.methods, [1, 5]) && wizardGold.wizard2e.rollLock, `the wizard's table options, a partial change keeps the rest: ${JSON.stringify(wizardGold.wizard2e)}`);
await tool("kraken_table_options", { wizard2e: { rollLock: false, methods: [1, 2, 3, 4, 5, 6], gold: "phb" } });
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

// --- Turning undead -----------------------------------------------------------
assert(r2.turnLevel(m.data) === 2 && r2.turnLevel(after) === 0, "a cleric turns at its level; a fighter not at all");
assert(r2.turnLevel({ classes: [{ name: "Paladin", level: 5 }] }) === 3 && r2.turnLevel({ classes: [{ name: "Paladin", level: 2 }] }) === 0, "a paladin turns as a cleric two levels lower, from 3rd");
assert(r2.undeadRow("Skeleton") === 0 && r2.undeadRow("Ghast") === 5 && r2.undeadRow("Undead Knight", { hitDice: "7" }) === 7 && r2.undeadRow("Ogre", { hitDice: "4+1" }) === null, "the undead's row: by name, else an undead's hit dice; not undead: none");
assert(r2.turnAgainst(2, 0).need === 7 && r2.turnAgainst(4, 0).auto && !r2.turnAgainst(4, 0).destroy && r2.turnAgainst(9, 0).more && r2.turnAgainst(1, 5).impossible && r2.turnAgainst(14, 11).need === 4, "the turning table: 7, T, D*, no chance, a lich at 14th");
const undeadData = (hitDice) => ({ ac: 7, thaco: 19, hitDice, damage: "1d6" });
const skeleton = make("npc", "Skeleton", undeadData("1"));
const zombie = make("npc", "Zombie", undeadData("2"));
const ghoul = make("npc", "Ghoul", undeadData("2"));
await tool("kraken_combat", { action: "add", recordId: m.id });
for (const undead of [ghoul, zombie, skeleton]) await tool("kraken_combat", { action: "add", recordId: undead.id });
force(1, 2, 3, 4);
await tool("kraken_combat", { action: "init", which: "all" });
await tool("kraken_combat", { action: "next" });
view = (await tool("kraken_combat", { action: "view" })).entries;
const maraEntry = view.find((entry) => entry.recordId === m.id);
assert(maraEntry.turns === 2 && !view.find((entry) => entry.name === "Skeleton").turns, `the tracker shows who turns: ${maraEntry.turns}`);
// d20 11 against a 2nd-level cleric's 7 (skeleton), 10 (zombie), 13 (ghoul); 2d6 = 3 affected; 3d4 rounds each.
force(11, 1, 2, 1, 1, 1, 2, 2, 2);
const turned = (await tool("kraken_combat", { action: "turn-undead", recordId: m.id })).turn;
view = (await tool("kraken_combat", { action: "view" })).entries;
const effectsOf = (name) => view.find((entry) => entry.name === name).effects;
assert(turned.roll === 11 && effectsOf("Skeleton")[0]?.label === "Turned (flees the turner)" && effectsOf("Skeleton")[0].duration === 3 && effectsOf("Zombie")[0]?.duration === 6 && effectsOf("Ghoul").length === 0, `the weakest first: skeleton and zombie turned, the ghoul (13) not: ${JSON.stringify(turned)}`);
assert(said(/\[TURN UNDEAD\] Sister Mara, turning as a level 2 cleric: d20 = 11/) && said(/Ghoul \(Ghoul\): unaffected \(needs 13\)/), "the turning said in chat");
let turnRefused = "";
try {
  await tool("kraken_combat", { action: "turn-undead", recordId: brannoc.id });
} catch (error) {
  turnRefused = error.message;
}
assert(/cannot turn undead/.test(turnRefused), `a fighter cannot turn: ${turnRefused}`);
await tool("kraken_combat", { action: "end", removeNpcs: true });

// --- Krits & Fumbles from the GM's book ---------------------------------------
// Made-up tables in the shapes of a Krits & Fumbles 2E book (FG 2E's table names).
const tableOf = (name, dice, rowsIn) => ({ type: "tables", name, data: { name, dice, tablerows: Object.fromEntries(rowsIn.map(([from, to, title, text], index) => [`id-${index}`, { fromrange: from, torange: to, results: { a: { result: title }, b: { result: text } } }])) } });
const kritBook = [
  tableOf("Critical Hit", "d6", [[1, 4, "CRITICAL HIT", "No complication."], [5, 6, "CRITICAL COMPLICATION", "Roll the matching Critical Hit - Slashing table."]]),
  tableOf("Critical Hit - Slashing", "d4", [[1, 1, "Gash", "Add 1d4 damage."], [2, 2, "Clean", "Deal maximum normal weapon damage before modifiers."], [3, 3, "Knocked", "The target must save vs. paralyzation or fall prone."], [4, 4, "Opened", "The next melee attack against the target gains +2 to hit."]]),
  tableOf("Fumble", "d6", [[1, 4, "AUTOMATIC MISS", "No complication."], [5, 6, "FUMBLE COMPLICATION", "Roll the matching Fumble - Slashing table."]]),
  tableOf("Fumble - Slashing", "d2", [[1, 1, "Wild", "The attacker suffers a 2-point AC penalty until the start of its next turn."], [2, 2, "Ally", "If an ally is adjacent, make a normal attack roll against that ally. Otherwise lose the next attack."]]),
];
const k2 = await import("../shared/adnd2e/krits.mjs");
assert(k2.attackKind({ name: "Long sword", dmgtype: "S" }) === "slashing" && k2.attackKind({ name: "Bite", npc: true }) === "natural" && k2.attackKind({ name: "Short bow", type: "ranged" }) === "missile" && k2.attackKind({ name: "Mace" }) === "bludgeoning", "the attack's kind");
assert(sword.dmgtype === "S", `a weapon's damage type from the table: ${sword.dmgtype}`);
agent.records.update(brannoc.id, { data: { hp: { wounds: 0 } } }, agent.seat);
const ogre2 = make("npc", "Ogre", ogreData);
await tool("kraken_combat", { action: "add", recordId: brannoc.id });
await tool("kraken_combat", { action: "add", recordId: ogre2.id });
force(1, 9);
await tool("kraken_combat", { action: "init", which: "all" });
await tool("kraken_combat", { action: "next" });
view = (await tool("kraken_combat", { action: "view" })).entries;
const fighter2 = view.find((entry) => entry.recordId === brannoc.id);
const ogre2Entry = view.find((entry) => entry.name === "Ogre");
await tool("kraken_combat", { action: "target", id: fighter2.id, targetId: ogre2Entry.id, on: true });
// No book active: a natural 20 is only a hit.
force(20);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].hit && !results[0].krit, "no Krits & Fumbles book: no krit");
force(1);
await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
agent.bookTables = () => kritBook;
// A natural 20: Critical Hit 5 (a complication), Slashing 2: the next damage at maximum (Large: 12 + 6, Strength 18/00 by now).
force(20, 5, 2);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].krit?.title === "Clean" && said(/\[KRAKEN CRITICAL\] Brannoc -> Ogre: Critical Hit d6 = 5: CRITICAL COMPLICATION\. Critical Hit - Slashing d4 = 2: Clean/), `a critical complication by the sword's kind: ${JSON.stringify(results[0].krit)}`);
damage = await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
assert(damage.damage.total === 18 && /KRAKEN KRIT: MAX/.test(last(/\[DAMAGE\]/).roll.label), `maximum damage, used up: ${JSON.stringify(damage.damage)} ${last(/\[DAMAGE\]/).roll.label}`);
force(3);
damage = await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
assert(damage.damage.total === 9, "the next roll is normal again");
// Slashing 3: the ogre saves vs. paralyzation (13) or falls prone; 10 fails.
force(20, 6, 3, 10);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === ogre2Entry.id).effects.some((effect) => effect.label === "Prone") && last(/\[SAVE\]/).roll.label.includes("Paralyzation"), `the save failed: prone: ${JSON.stringify(results[0].krit)}`);
force(1);
await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
// Critical Hit 2: no complication.
force(20, 2);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].krit && results[0].krit.title === "CRITICAL HIT" && results[0].krit.applied.length === 0, `1-4: only the hit: ${JSON.stringify(results[0].krit)}`);
force(1);
await tool("kraken_combat", { action: "damage-roll", recordId: brannoc.id, weapon: sword.item });
// A natural 1: Fumble 5, Slashing 1: the fighter's AC 2 worse until its next turn.
force(1, 5, 1);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === fighter2.id).effects.some((effect) => effect.label === "Kraken Wild; AC: -2" && effect.duration === 1), `a fumble on the attacker: ${JSON.stringify(results[0].krit)}`);
// "If an ally is adjacent": the GM's call, nothing applied.
force(1, 5, 2);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].krit.applied.every((line) => /GM:/.test(line)), `the GM's call: ${JSON.stringify(results[0].krit)}`);
// A krit-test: Slashing 4: the next attack against the ogre gains +2 (11 + 3 + 2 = 16 hits, THAC0 20 - AC 4).
await tool("kraken_combat", { action: "krit-test", kind: "crit", id: fighter2.id, targetId: ogre2Entry.id, entryRoll: 5, attackKind: "slashing", roll: 4 });
force(11);
results = (await tool("kraken_combat", { action: "attack", recordId: brannoc.id, weapon: sword.item })).results;
assert(results[0].hit && results[0].total === 16, `GRANTATK: +2 to the next attack against it: ${JSON.stringify(results)}`);
delete agent.bookTables;
await tool("kraken_combat", { action: "end", removeNpcs: true });

// The shelf: 2E books for a 2E campaign (a pack made as "2E" before Kraken played it, too), not Worldbuilding's.
assert(fitsRuleset({ ruleset: "2E" }, "AD&D 2E") && fitsRuleset({ kraken: "2E", ruleset: "2E" }, "AD&D 2E") && !fitsRuleset({ kraken: "2E", ruleset: "2E" }, "Worldbuilding") && !fitsRuleset({ ruleset: "2E" }, "D&D 3.5E"), "2E books on a 2E shelf");
await server.close?.();
console.log("ok adnd2e: the character wizard's rules (the FG extension's: Methods I-VI, race ranges and classes, level limits, multi- and dual-class, alignments, starting wealth, proficiency slots and kits, the class's shop, languages, spells by class and sphere or school) and the host building what it chose (hit dice rolled, coins, a kit, specialization, a priest's 3 gp, a dual-class); the ability tables, exceptional Strength, THAC0 and saves by group, experience, spells a day, damage S/M and L, creatures' blocks; a fighter, an elf fighter/mage, a halfling thief, a pregen; d10 initiative lowest first, THAC0 hits and misses, Large damage, claw/claw/bite, the five saves, effect rounds, Death's Door, bound wounds; a save, a check and a thief skill from the sheet, level ups, the sheet's edits; turning undead; krits and fumbles from the GM's book; the shelf");
process.exit(0);
