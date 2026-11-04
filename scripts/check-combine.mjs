// Combining classes (the Adventurer's Backpack, as the GM's FG Character
// Wizard): the rules (codes, dice, XP, alignment), and characters built from
// the Player's Handbook and the Adventurer's Backpack with multi-class,
// enhanced class and class plus, then levelled, dual-classed and reclassed.
// The numbers are worked out from FG's code (manager_classrules.lua,
// manager_cccombine.lua, manager_cclevelup.lua); live FG builds are compared
// where the bridge is up (scripts/check-combine-fg.mjs).
import { createRequire } from "node:module";
import { buildFromSpec } from "../shared/siege/builder.mjs";
import * as combine from "../shared/siege/combine.mjs";
import * as engine from "../shared/siege/engine.mjs";

const require = createRequire(import.meta.url);
const { readModule } = require("../electron/importers/fgModule.cjs");

let failed = 0;
const check = (condition, message) => {
  if (!condition) {
    failed += 1;
    console.log(`FAIL ${message}`);
  }
};
const eq = (got, want, message) => check(JSON.stringify(got) === JSON.stringify(want), `${message}: ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// The rules.
eq(combine.multiRule("Fighter", "Wizard", "Human").code, "A", "fighter/wizard");
eq(combine.multiRule("Knight", "Wizard", "Human").allowed, false, "knight/wizard for a human");
eq(combine.multiRule("Knight", "Wizard", "Half-Elf").allowed, true, "knight/wizard for a half-elf");
eq(combine.multiRule("Cleric", "Rogue", "Human").words, "Unusual: needs the Castle Keeper's agreement and a good reason.", "cleric/rogue unusual");
eq(combine.multiRule("Assassin", "Paladin", "Human").allowed, false, "assassin/paladin");
eq(combine.multiRule("Elf, Magi", "Fighter", "Elf").allowed, false, "race class");
eq([combine.multiRule("Ethereal Knight", "Divine Knight").code, combine.multiRule("Divine Knight", "Ethereal Knight").code], ["A", "U"], "direction");
eq(combine.enhancedRule("Monk", "wizard").words, "No table entry: the Castle Keeper decides.", "enhanced gap");
eq([combine.multiDie(["d10", "d4"]), combine.multiDie(["d12", "d6", "d8"]), combine.enhancedDie("d10", "d4"), combine.enhancedDie("d6", "d10")], ["d8", "d10", "d8", "d8"], "dice (Enhanced: [supporting][principal], as FG reads it)");
eq([combine.plusXP(2001, 1), combine.plusXP(2001, 2), combine.supportLevel("fighter", 6), combine.supportLevel("killer", 3), combine.supportLevel("wizard", 7)], [2107, 2224, 4, 1, 3], "plus XP and support levels");

// The books.
const records = [...readModule("C&C Player's Handbook").records, ...readModule("C&C Adventurer's Backpack").records];
const library = {
  packages: records.filter((r) => r.type === "siegepackage").map((r) => r.data),
  items: records.filter((r) => r.type === "item").map((r) => r.data),
  powers: records.filter((r) => r.type === "siegepower").map((r) => r.data),
  game: records.find((r) => r.type === "siegegame")?.data,
};
const cls = (name) => library.packages.find((pkg) => String(pkg.packagetype).toLowerCase() === "class" && pkg.name === name);
const xpAt = (name, level) => Number(engine.exactRow(cls(name), level)?.xp) || 0;
const scores = { strength: 14, dexterity: 14, constitution: 10, intelligence: 14, wisdom: 14, charisma: 10 };
const build = (spec) => buildFromSpec({ name: "Test", race: "Human", scores, gold: 0, ...spec }, library);
const classes = (character) => combine.classPackages(character).map(([, pkg]) => pkg);

// 11. Human Fighter/Wizard multi-class, level 3: d8 (d10 with d4); 8 + 5 + 5 = 18.
{
  const { character, report } = build({ class: "Fighter", multiclass: "Wizard", level: 3, primes: ["dexterity", "wisdom"] });
  const [fighter, wizard] = classes(character);
  eq([fighter.name, fighter.ccmulti, wizard.name, wizard.ccmulti, wizard.level], ["Fighter", 1, "Wizard", 1, 3], "multi packages");
  eq(character.hp.total, 18, "multi HP on d8");
  eq(character.exp, xpAt("Fighter", 3) + xpAt("Wizard", 3), "multi start XP");
  eq(character.expnext, xpAt("Fighter", 4) + xpAt("Wizard", 4), "multi next XP");
  eq(character.expnextsource, "Fighter/Wizard 4", "multi next source");
  eq([character.attributes.strength.prime, character.attributes.intelligence.prime], [1, 1], "both classes' primes");
  check(!report.problems.some((problem) => problem.startsWith("primes")), `multi primes count: ${report.problems.join("; ")}`);
  check(character.slots?.l1?.max > 0, "the wizard's slots");
}

// 13. Human Wizard + supporting Fighter, level 6: Fighter counts as 4; die HD_ENHANCED[d10][d4] = d8: 8 + 5 x 5 = 33.
{
  const { character } = build({ class: "Wizard", support: "fighter", level: 6 });
  const [wizard, fighter] = classes(character);
  eq([wizard.ccprincipal, fighter.ccsupport, fighter.level], [1, "fighter", 4], "enhanced packages");
  eq(character.hp.total, 8 + 5 * 5, "enhanced HP on d8");
  eq(character.exp, xpAt("Wizard", 6) + Number(combine.COMBO.SUPPORT.fighter.adv["6"].xp), "enhanced start XP");
  eq(character.expnext, xpAt("Wizard", 7) + Number(combine.COMBO.SUPPORT.fighter.adv["7"].xp), "enhanced next XP");
  eq(character.expnextsource, "Wizard 7 (with Fighter)", "enhanced source");
  eq(character.bth, Math.max(Number(engine.progressionRow(cls("Wizard"), 6).bth), Number(engine.progressionRow(cls("Fighter"), 4).bth)), "best BtH");
}

// 14. Human Fighter + Killer (an Assassin sub-class), level 3: d8 (d6 supporting d10): 8 + 5 + 5.
{
  const { character } = build({ class: "Fighter", support: "killer", level: 3 });
  const killer = classes(character)[1];
  eq([killer.name, killer.ccsupport, killer.level], ["Killer (Assassin)", "killer", 1], "sub-class package");
  eq(character.hp.total, 18, "killer HP on d8");
  eq(character.attributes.dexterity.prime, 1, "the killer's dexterity is forced prime");
  const kept = Object.values(killer.abilities ?? {}).filter((ability) => ability?.name && Number(ability.level || 1) <= 1 && combine.isSupportAbility("killer", ability.name)).map((ability) => ability.name);
  check(kept.length > 0 && kept.every((name) => /death attack|poison|sneak attack/i.test(name)), `killer keeps its named abilities: ${kept.join(", ")}`);
}

// 15. Fighter + supporting Wizard at level 2: slots from the option's own table (0: 4, 1: 2).
{
  const { character } = build({ class: "Fighter", support: "wizard", level: 2 });
  eq([character.slots.l0?.max, character.slots.l1?.max], [4, 2], "support spells table");
}

// 16. Fighter + Rogue plus, level 2: no package; the plus abilities; 5% of experience.
{
  const { character } = build({ class: "Fighter", plus: ["Rogue"], level: 2 });
  eq(classes(character).length, 1, "plus adds no package");
  check(character.ccplus?.rogue?.text?.includes("cant"), "plus text");
  check(Object.values(character.ccplus.rogue.abilities).some((row) => row.name === "Class Plus: Rogue"), "plus note row");
  eq(character.exp, combine.plusXP(xpAt("Fighter", 2), 1), "plus start XP");
  eq(character.expnext, combine.plusXP(xpAt("Fighter", 3), 1), "plus next XP");
  check(character.expnextsource.endsWith("(class plus: 5% of experience)"), `plus source ${character.expnextsource}`);
}

// 17. Cleric plus on a fighter: two 0-level cleric spells a day.
{
  const { character } = build({ class: "Fighter", plus: ["Cleric"], level: 1 });
  eq(character.slots.l0?.max, 2, "cleric plus slots");
}

// 19. Multi-class level up: either class raises both; the roll is on the combined die.
{
  const { character } = build({ class: "Fighter", multiclass: "Wizard", level: 3, primes: ["dexterity", "wisdom"] });
  const [key, pkg] = engine.levelUpPackage(character);
  const plan = engine.levelUpRoll(character, pkg, library.game);
  check(plan.formula.startsWith("1d8"), `multi level-up die: ${plan.formula}`);
  const up = engine.applyLevelUp(character, key, 6, library.game);
  eq(classes(up).map((item) => item.level), [4, 4], "both rise");
  eq(classes(up)[1].hplog.l4, 0, "the other gains no hit points");
  eq(up.expnext, xpAt("Fighter", 5) + xpAt("Wizard", 5), "next XP after");
}

// Enhanced level up: the principal rises; the support follows to its share.
{
  const { character } = build({ class: "Fighter", support: "killer", level: 3 });
  const [key] = engine.levelUpPackage(character);
  const up = engine.applyLevelUp(character, key, 5, library.game);
  eq(classes(up).map((item) => item.level), [4, 2], "support follows to 2");
  eq(engine.levelUpPackage(character, classes(character)[1] && Object.keys(character.packages).find((k) => character.packages[k].ccsupport)), null, "a supporting class cannot be levelled");
}

// 20. Dual class: Fighter 5 with Str and Dex prime at 20000 XP adds Rogue.
{
  const fighter = build({ class: "Fighter", level: 5, primes: ["dexterity"] }).character;
  fighter.exp = 20000;
  const { character } = engine.addDualClass(fighter, cls("Rogue"), library.game);
  const [orig, rogue] = classes(character);
  eq([orig.ccdualorigin, rogue.ccdualclass, rogue.ccdualbase, rogue.level], [1, 1, 20000, 1], "dual packages");
  const rogue2 = 20000 + 2 * Math.max(xpAt("Rogue", 2), 0);
  const fighter6 = 20000 + 2 * Math.max(xpAt("Fighter", 6) - 20000, 0);
  eq(character.expnext, Math.min(rogue2, fighter6), "dual next XP: the lower of the two");
  check(character.expnextsource.endsWith("(experience split between the classes)"), `dual source ${character.expnextsource}`);
  const rogueRoll = engine.levelUpRoll(character, rogue, library.game);
  eq([rogueRoll.formula, rogueRoll.flat], ["", 0], "the dual class's levels give no hit points");
  const fighterRoll = engine.levelUpRoll(character, orig, library.game);
  check(fighterRoll.formula.startsWith("1d8") && /Dual Class Hit Die/.test(fighterRoll.note), `fighter rolls d8 (d10 with d6): ${fighterRoll.formula} ${fighterRoll.note}`);
  character.exp = 30000;
  eq([combine.dualClassXP(character, orig), combine.dualClassXP(character, rogue)], [25000, 5000], "experience split");
}

// 22. Reclass from a deity class: Cleric 5 to Fighter loses two levels and their hit points; primes swap.
{
  const cleric = build({ class: "Cleric", level: 5, primes: [] }).character;
  cleric.exp = 20000;
  const before = cleric.hp.total;
  const lost = Number(Object.values(cleric.packages).find((pkg) => pkg.name === "Cleric").hplog.l4) + Number(Object.values(cleric.packages).find((pkg) => pkg.name === "Cleric").hplog.l5);
  const result = engine.reclass(cleric, cls("Fighter"), library.game);
  const [old, fighter] = classes(result.character);
  eq([old.level, old.ccreclassorigin, fighter.level, fighter.ccreclass], [3, 1, 1, 1], "reclass packages");
  eq(result.character.hp.total, before - lost + 1, "two levels' hit points off, +1 for Fighter 1 (d10 after d8)");
  eq([result.character.attributes.wisdom.prime, result.character.attributes.strength.prime], [0, 1], "primes swap");
  eq(result.character.expnext, 20000 + xpAt("Fighter", 2), "reclass next XP");
  const plan = engine.levelUpRoll(result.character, fighter, library.game);
  eq([plan.formula, plan.flat], ["", 1], "fixed 1 hit point until Fighter passes Cleric 3");
}

// 23. Reclass non-deity to a smaller die: Fighter 5 to Wizard loses one level; no hit points until it passes.
{
  const fighter = build({ class: "Fighter", level: 5 }).character;
  const result = engine.reclass(fighter, cls("Wizard"), library.game);
  eq(classes(result.character)[0].level, 4, "one level lost");
  eq(result.gain, 0, "no hit points for a smaller die");
}

if (failed) {
  console.log(`${failed} combine checks failed`);
  process.exit(1);
}
console.log("ok combine: rules, multi-class, enhanced class (full and sub-class), class plus built from the books; level up for multi and enhanced; dual class; reclass");
