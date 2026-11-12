// Kraken's second ruleset, D&D 5E from the SRD 5.2.1 (the FG modules
// DNDSRD521PLAYER and DNDSRD521BESTIARY, when they are on this computer),
// played through the same agent tools as Castles & Crusades, with fixed dice:
// characters built (HP, AC, saves, skills, attacks as the SRD gives them), the
// tracker's initiative (d20 + DEX), attacks (a natural 20 a critical hit whose
// damage dice double; a natural 1 always misses), creatures dying at 0, saves
// against a DC, spells (Fireball half on a save, Magic Missile's darts, Cure
// Wounds from 0, Bless's d4), a Dying character's death saves, a level up,
// checks and skills with advantage, the party sheet. The core is the same.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { listModules, importModule } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const have = (name) => listModules().some((item) => (item.name ?? item) === name);
if (!have("DNDSRD521PLAYER") || !have("DNDSRD521BESTIARY")) {
  console.log("skip dnd5e: the SRD 5.2.1 FG modules are not on this computer");
  process.exit(0);
}

const server = createTableServer({ ruleset: "D&D 5E" });
try {
  await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const agent = server.agent;
  const force = (...values) => agent.dice.force(values);
  const chat = () => agent.chatLog(200);
  // The last roll card whose label fits.
  const last = (pattern) => [...chat()].reverse().find((line) => line.roll && pattern.test(line.roll.label ?? ""));
  importModule(agent.records, agent.seat, "DNDSRD521PLAYER");
  importModule(agent.records, agent.seat, "DNDSRD521BESTIARY");
  assert(agent.ruleset() === "D&D 5E", "the table knows its ruleset");

  // Characters, as the SRD's numbers give them.
  const fighter = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Bruenor", species: "Dwarf", class: "Fighter", background: "Soldier", level: 1, scores: { strength: 16, dexterity: 12, constitution: 15, intelligence: 8, wisdom: 13, charisma: 10 }, skills: ["Perception", "Survival"], gear: [["Chain Mail", 1], ["Shield", 1], ["Longsword", 1]], gold: 4 } });
  assert(fighter.created && fighter.hp === 13 && fighter.ac === 18 && fighter.problems.length === 0, `the fighter: d10 + CON 2 + the dwarf's toughness 1 = 13 HP, chain mail 16 + shield 2 = AC 18: ${JSON.stringify(fighter)}`);
  const bruenor = agent.records.get(fighter.id).data;
  const sword = Object.entries(bruenor.attacks).find(([, attack]) => attack.name === "Longsword");
  assert(sword && sword[1].bonus === 5 && sword[1].damage === "1d8+3", `longsword +5 (STR 3 + proficiency 2), 1d8+3: ${JSON.stringify(sword)}`);
  assert(bruenor.abilities.strength.save === 5 && bruenor.abilities.dexterity.save === 1 && bruenor.skills.athletics.total === 5 && bruenor.skills.intimidation.prof === 1 && bruenor.passive === 13, "saves (STR and CON proficient), the Soldier's Athletics and Intimidation, passive Perception 13");
  const wizard = await tool("kraken_build_character", { owner: "Bob", spec: { name: "Ilse", species: "Elf", class: "Wizard", level: 5, scores: { strength: 8, dexterity: 14, constitution: 13, intelligence: 16, wisdom: 12, charisma: 10 }, spells: ["Magic Missile", "Fireball", "Fire Bolt"] } });
  const ilse = agent.records.get(wizard.id).data;
  assert(wizard.hp === 27 && ilse.prof === 3 && ilse.spellcasting.dc === 14 && ilse.slots.l3.max === 2 && ilse.slots.l1.max === 4, `the wizard 5: 6 + 1 + 4 x (4 + 1) = 27 HP, proficiency 3, DC 8 + 3 + 3 = 14, slots 4/3/2: ${JSON.stringify({ hp: wizard.hp, dc: ilse.spellcasting, slots: ilse.slots })}`);

  // The character wizard's rules (FG 5E's wizard, shared/dnd5e/wizard.mjs) on the SRD's own records.
  const wiz = await import("../shared/dnd5e/wizard.mjs");
  const byName = (type, name) => agent.records.list({ type }).find((record) => record.name === name);
  assert(wiz.pointsSpent({ strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 }) === 27 && wiz.pointsSpent({ strength: 14, dexterity: 13, constitution: 12, intelligence: 11, wisdom: 10, charisma: 9 }) === 22, "point buy costs (9:1 10:2 11:3 12:4 13:5 14:7 15:9)");
  assert(JSON.stringify(wiz.swapAbility({ strength: 15, dexterity: 14 }, "strength", "right")) === JSON.stringify({ strength: 14, dexterity: 15 }), "the standard array's swap arrows");
  const human = wiz.speciesInfo(byName("race", "Human"));
  assert(human.is2024 && human.decisions.some((item) => item.type === "size") && human.decisions.filter((item) => item.type === "language").length === 2 && human.decisions.some((item) => item.type === "skill" && item.options.length === 18) && human.decisions.some((item) => item.type === "feat" && item.category === "Origin"), `a 2024 Human: size, two languages, Skillful's skill, Versatile's Origin feat: ${JSON.stringify(human.decisions.map((item) => item.id))}`);
  const elf = wiz.speciesInfo(byName("race", "Elf"), byName("race_subrace", "High Elf"));
  assert(elf.darkvision === 60 && elf.decisions.some((item) => item.type === "skill" && item.options.join() === "insight,perception,survival") && wiz.ancestriesOf(byName("race", "Elf"), agent.records.list({ type: "race_subrace" })).length === 3, "the Elf: Darkvision 60, Keen Senses (Insight, Perception or Survival), three lineages");
  const soldier = wiz.backgroundInfo(byName("background", "Soldier"), agent.records.list({ type: "item" }));
  assert(soldier.is2024 && soldier.abilities.join() === "strength,dexterity,constitution" && soldier.feat === "Savage Attacker" && soldier.kits.length === 2 && soldier.kits[0].wealth === 14 && soldier.kits[1].wealth === 50 && soldier.decisions.some((item) => item.type === "toolprof"), `the Soldier: STR/DEX/CON, Savage Attacker, kits A (… 14 GP) or B (50 GP), a gaming set: ${JSON.stringify({ kits: soldier.kits.map((kit) => wiz.kitText(kit)), decisions: soldier.decisions.map((item) => item.id) })}`);
  assert(wiz.backgroundAsiDecisions("Option 1: One +2, One +1", soldier.abilities).map((item) => item.adj).join() === "2,1" && Object.keys(wiz.backgroundFixedIncreases("Option 2: Three +1's", soldier.abilities)).length === 3, "the background's +2/+1, or +1 to each of its three abilities");
  const fighter4 = wiz.classInfo(byName("class", "Fighter"), 4);
  assert(fighter4.kits.length === 3 && fighter4.decisions.filter((item) => item.type === "skill").length === 2 && fighter4.decisions.some((item) => item.type === "subclass") && fighter4.decisions.some((item) => item.type === "asiorfeat") && fighter4.decisions.some((item) => item.type === "feat" && item.category === "Fighting Style"), `a Fighter 4: kits A/B/C, two skills, a subclass, an Ability Score Improvement, a Fighting Style feat: ${JSON.stringify(fighter4.decisions.map((item) => item.id))}`);
  assert(wiz.asiOrFeatDecisions("x", "Ability Score Increase", "Option 2: Two +1's").filter((item) => item.type === "asi").length === 2 && wiz.asiOrFeatDecisions("x", "Feat")[0].type === "feat", "an ASI: one +2, two +1s, or a feat");
  assert(wiz.spellCounts("Wizard", 1).cantrips === 3 && wiz.spellCounts("Wizard", 1).prepared === 4 && wiz.spellCounts("Paladin", 1).prepared === 2 && wiz.spellCounts("Fighter", 1).prepared === 0, "spells known by class table");
  assert(JSON.stringify(wiz.wealthRoll("5d4x10")) === JSON.stringify({ dice: "5d4", times: 10 }) && wiz.STARTING_WEALTH_2014.monk === "5d4", "a Legacy class's starting wealth roll");
  // A character as the wizard commits one: kits A (items and coin), the background's ASI and feat, languages, a size.
  const kitted = await tool("kraken_build_character", { owner: "Dee", spec: { name: "Kit", species: "Human", size: "Small", class: "Fighter", background: "Soldier", level: 1, scores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }, increases: { strength: 2, constitution: 1 }, skills: ["Perception", "Survival"], speciesSkills: ["Stealth"], languages: ["Elvish", "Dwarvish"], tools: ["Dice Set"], feats: ["Alert", "Defense"], kits: { class: "A", background: "A" }, gear: [["Rope", 1]], coins: { SP: 7 } } });
  const kit = agent.records.get(kitted.id).data;
  const has = (name) => Object.values(kit.inventorylist).find((item) => item.name === name);
  const coin = (name) => Object.values(kit.coins).find((item) => item.name === name)?.amount ?? 0;
  assert(kitted.problems.length === 0 && has("Chain Mail") && has("Javelin")?.count === 8 && has("Spear") && has("Rope") && kit.ac.total === 16, `kits A: the class's chain mail and 8 javelins, the background's spear, a rope added: ${JSON.stringify({ problems: kitted.problems, items: Object.values(kit.inventorylist).map((item) => `${item.count} ${item.name}`) })}`);
  assert(coin("GP") === 18 && coin("SP") === 7, `4 GP (class) + 14 GP (background) and 7 SP typed: ${JSON.stringify(kit.coins)}`);
  assert(kit.abilities.strength.score === 17 && kit.abilities.constitution.score === 14 && kit.skills.stealth.prof === 1 && kit.skills.athletics.prof === 1 && kit.size === "Small", "the +2/+1, the species' skill, the background's skills, the size");
  assert(kit.feats.join() === "Savage Attacker,Alert,Defense" && kit.languages.join() === "Common,Elvish,Dwarvish" && kit.proficiencylist.tools.includes("Dice Set") && kit.features.some((feature) => /^Fighting Style/.test(feature)), `feats, languages (Common and two), tools, features: ${JSON.stringify({ feats: kit.feats, languages: kit.languages, tools: kit.proficiencylist })}`);
  const wealthy = await tool("kraken_build_character", { owner: "Dee", spec: { name: "Coin", species: "Dwarf", class: "Fighter", background: "Soldier", scores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }, kits: { class: "C", background: "B" } } });
  const purse = agent.records.get(wealthy.id).data;
  const classC = fighter4.kits[2].wealth;
  assert(Object.keys(purse.inventorylist).length === 0 && Object.values(purse.coins).find((item) => item.name === "GP")?.amount === classC + 50, `kits C and B: only coin, ${classC} + 50 GP: ${JSON.stringify(purse.coins)}`);

  // The tracker: two goblins and the party; initiative d20 + DEX.
  const goblin = agent.records.list({ type: "npc" }).find((record) => record.name === "Goblin Warrior");
  await tool("kraken_combat", { action: "add", recordId: fighter.id });
  await tool("kraken_combat", { action: "add", recordId: wizard.id });
  await tool("kraken_combat", { action: "add", recordId: goblin.id, count: 2 });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const g1 = view.find((entry) => entry.name === "Goblin Warrior 1");
  const g2 = view.find((entry) => entry.name === "Goblin Warrior 2");
  const bru = view.find((entry) => entry.name === "Bruenor");
  const ils = view.find((entry) => entry.name === "Ilse");
  assert(g1 && g1.hp === 10 && g1.ac === 15, `a goblin warrior: 10 HP, AC 15 as its block: ${JSON.stringify(g1)}`);
  force(10, 10, 10, 10);
  await tool("kraken_combat", { action: "init", which: "all" });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const init = Object.fromEntries(view.map((entry) => [entry.name, entry.initresult]));
  assert(init.Bruenor === 11 && init.Ilse === 12 && init["Goblin Warrior 1"] === 12, `initiative d20 + DEX: ${JSON.stringify(init)}`);

  // Attacks: a hit, a miss, a natural 1, a natural 20 with doubled dice.
  await tool("kraken_combat", { action: "target", id: bru.id, targetId: g1.id, on: true });
  force(10);
  let swing = (await tool("kraken_combat", { action: "attack", recordId: fighter.id, weapon: sword[0] })).results[0];
  assert(swing.hit && swing.total === 15 && /\[HIT 15 vs 15\]/.test(last(/^\[ATTACK\]/).roll.label), `15 vs AC 15 hits: ${JSON.stringify(swing)}`);
  force(1);
  swing = (await tool("kraken_combat", { action: "attack", recordId: fighter.id, weapon: sword[0] })).results[0];
  assert(!swing.hit && /AUTOMATIC MISS/.test(last(/^\[ATTACK\]/).roll.label), "a natural 1 misses");
  force(20);
  swing = (await tool("kraken_combat", { action: "attack", recordId: fighter.id, weapon: sword[0] })).results[0];
  assert(swing.hit && swing.crit && /CRITICAL HIT/.test(last(/^\[ATTACK\]/).roll.label), "a natural 20 is a critical hit");
  force(2, 1);
  const hit = (await tool("kraken_combat", { action: "damage-roll", recordId: fighter.id, weapon: sword[0] })).damage;
  const damageLine = last(/^\[DAMAGE\]/).roll;
  assert(damageLine.formula === "2d8+3" && hit.total === 6 && /CRITICAL/.test(damageLine.label), `the critical's damage doubles the dice, not the bonus: ${damageLine.formula} = ${hit.total}`);
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === g1.id).health.status === "Heavy", "the goblin is badly hurt");
  force(6);
  await tool("kraken_combat", { action: "damage-roll", recordId: fighter.id, weapon: sword[0] });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const deadGoblin = view.find((entry) => entry.id === g1.id);
  assert(deadGoblin.health.status === "Dead" && deadGoblin.wounds === 10, `a creature at 0 hit points is dead, wounds kept at its maximum: ${JSON.stringify(deadGoblin)}`);

  // The goblin's scimitar from its stat block's text.
  const attacks = view.find((entry) => entry.id === g2.id).attacks;
  const scimitar = attacks.find((attack) => attack.name === "Scimitar");
  assert(scimitar && scimitar.bonus === 4 && /1d6\+2/.test(scimitar.damage), `the goblin's attacks from its actions: ${JSON.stringify(attacks)}`);
  await tool("kraken_combat", { action: "target", id: g2.id, targetId: bru.id, on: true });
  force(14);
  swing = (await tool("kraken_combat", { action: "attack", id: g2.id, weapon: scimitar.key })).results[0];
  assert(swing.hit && swing.total === 18 && swing.ac === 18, `18 vs AC 18 hits (meets it): ${JSON.stringify(swing)}`);
  force(13);
  swing = (await tool("kraken_combat", { action: "attack", id: g2.id, weapon: scimitar.key })).results[0];
  assert(swing.total === 17 && !swing.hit, `17 vs AC 18 misses: ${JSON.stringify(swing)}`);

  // Saves against a DC.
  force(9);
  const save = (await tool("kraken_combat", { action: "save", id: g2.id, attribute: "dexterity", cl: 14 })).save;
  assert(save.total === 11 && save.success === false && /\[DC 14\] \[FAILURE 11 vs 14\]/.test(last(/^\[SAVE\]/).roll.label), `DEX save +2 against DC 14: ${JSON.stringify(save)}`);

  // Spells: Fire Bolt (a spell attack, d10 x2 at 5th level), Fireball (DEX save, half on a success), Magic Missile's three darts.
  await tool("kraken_combat", { action: "target", id: ils.id, targetId: g2.id, on: true });
  force(15, 4, 4);
  const bolt = (await tool("kraken_combat", { action: "cast", recordId: wizard.id, power: "Fire Bolt" })).cast;
  assert(bolt[0].damage === 8 && last(/^\[DAMAGE\] Fire Bolt/).roll.formula === "2d10", `Fire Bolt hits (15 + 6 vs 15) for 2d10 at 5th level: ${JSON.stringify(bolt)}`);
  view = (await tool("kraken_combat", { action: "view" })).entries;
  await tool("kraken_combat", { action: "update", id: g2.id, patch: { wounds: 0 } });
  force(15, 3, 3, 3, 3, 3, 3, 3, 3);
  const fireball = (await tool("kraken_combat", { action: "cast", recordId: wizard.id, power: "Fireball" })).cast;
  assert(fireball[0].half && fireball[0].damage === 12, `a saved Fireball (17 vs DC 14) halves 8d6 = 24 to 12: ${JSON.stringify(fireball)}`);
  assert(agent.records.get(wizard.id).data.slots.l3.used === 1, "a 3rd-level slot spent");
  await tool("kraken_combat", { action: "update", id: g2.id, patch: { wounds: 0 } });
  force(1, 1, 1);
  const missiles = (await tool("kraken_combat", { action: "cast", recordId: wizard.id, power: "Magic Missile" })).cast;
  assert(missiles.length === 3 && missiles.every((dart) => dart.damage === 2), `three darts of 1d4+1: ${JSON.stringify(missiles)}`);
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === g2.id).wounds === 6, "they all landed");

  // A character at 0: Dying, death saves; damage while dying is a failure; healing from 0.
  await tool("kraken_combat", { action: "damage", id: bru.id, amount: 15 });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === bru.id).health.status === "Dying", `Bruenor at 0 is Dying: ${JSON.stringify(view.find((entry) => entry.id === bru.id).health)}`);
  force(12);
  let death = (await tool("kraken_combat", { action: "death-save", id: bru.id })).deathSave;
  assert(death.deathsaves.success === 1, "a 12 is a success");
  force(1);
  death = (await tool("kraken_combat", { action: "death-save", id: bru.id })).deathSave;
  assert(death.deathsaves.failure === 2, "a natural 1 is two failures");
  const cleric = await tool("kraken_build_character", { owner: "Cy", spec: { name: "Tamsin", species: "Human", class: "Cleric", level: 1, scores: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 16, charisma: 12 }, spells: ["Cure Wounds", "Bless"] } });
  await tool("kraken_combat", { action: "add", recordId: cleric.id });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const tam = view.find((entry) => entry.name === "Tamsin");
  await tool("kraken_combat", { action: "target", id: tam.id, targetId: bru.id, on: true });
  force(3, 4);
  const cure = (await tool("kraken_combat", { action: "cast", recordId: cleric.id, power: "Cure Wounds" })).cast;
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const healed = view.find((entry) => entry.id === bru.id);
  assert(cure[0].heal === 10 && healed.hp - healed.wounds === 10 && healed.health.status !== "Dying" && agent.records.get(fighter.id).data.deathsaves.failure === 0, `Cure Wounds 2d8 + WIS 3 = 10 from 0 hit points, death saves cleared: ${JSON.stringify({ cure, healed })}`);
  // Bless's d4 on an attack.
  await tool("kraken_combat", { action: "clear-targets", id: tam.id });
  await tool("kraken_combat", { action: "target", id: tam.id, targetId: bru.id, on: true });
  await tool("kraken_combat", { action: "cast", recordId: cleric.id, power: "Bless" });
  // No target: the goblin Bruenor had targeted is dead, and attacks on the dead have advantage (FG: Unconscious).
  await tool("kraken_combat", { action: "clear-targets", id: bru.id });
  force(10, 4);
  await tool("kraken_combat", { action: "attack", recordId: fighter.id, weapon: sword[0] });
  const blessed = last(/^\[ATTACK\]/).roll;
  assert(blessed.formula === "1d20+5+1d4" && blessed.total === 19, `Bless adds a d4 to the attack: ${blessed.formula} = ${blessed.total}`);

  // Checks, saves and skills from the sheet: advantage keeps the higher d20.
  force(4, 17);
  const stealth = await tool("kraken_siege_check", { id: fighter.id, kind: "skill", skill: "Athletics", dc: 15, advantage: "advantage" });
  assert(stealth.total === 22 && stealth.success, `Athletics +5 with advantage (4, 17) against DC 15: ${JSON.stringify(stealth)}`);
  force(8);
  const wis = await tool("kraken_siege_check", { id: wizard.id, kind: "save", attribute: "intelligence", dc: 12 });
  assert(wis.total === 14 && wis.success, "INT save +6 (proficient)");

  // A level up: the hit die rolled, CON added.
  force(7);
  const up = await tool("kraken_level_up", { id: fighter.id });
  assert(up.level === 2 && up.gain === 10 && up.hp === 23, `level 2: d10 (7) + CON 2 + toughness 1: ${JSON.stringify(up)}`);

  // The party sheet takes 5E characters as they are.
  await tool("kraken_party_edit", { allPlayers: true });
  const party = await tool("kraken_party");
  const member = party.members.find((item) => item.name === "Bruenor");
  assert(member && member.hp === 23 && member.ac === 18 && member.classes === "Fighter 2", `the party sheet: ${JSON.stringify(member)}`);
  console.log("ok dnd5e: SRD characters (HP, AC, saves, skills, attacks, spell DC and slots); the character wizard's rules (point buy, swaps, a 2024 species' and background's choices, a class's features and decisions, kits A/B/C with their coin, feats, languages, tools); initiative d20 + DEX; hits, automatic misses, a critical's doubled dice; a goblin's stat block attacks; creatures dead at 0; saves against a DC; Fire Bolt, a halved Fireball, Magic Missile's darts, Cure Wounds from 0, Bless's d4; Dying and death saves; advantage; a level up; the party sheet");
} finally {
  await server.stop();
}
