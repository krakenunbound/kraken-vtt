// Spells read from their words, in the games whose books carry no actions
// Kraken plays (docs/targeting-actions-design.md 5): D&D 3.5E (Effect, Save
// "Reflex half", damage per caster level to its maximum, a slot of the
// caster's level spent) and AD&D 2E (FG 2E's actions, save vs. spell for
// half). Sleep puts the failed to sleep until they are hurt; Bless lands only
// on allies. The spell records here are written for this check in the books'
// field shapes (never a book's own words).
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

async function game(ruleset, run) {
  const server = createTableServer({ ruleset });
  try {
    await server.listen({ port: 0, password: "" });
    await server.agent.combat.ready;
    const tool = async (name, args) => JSON.parse((await callTool(name, args, { table: () => server })).content[0].text);
    await run(server.agent, (args) => tool("kraken_combat", args));
  } finally {
    await server.stop();
  }
}

// --- D&D 3.5E -----------------------------------------------------------------
await game("D&D 3.5E", async (agent, ct) => {
  const spell = (name, data) => agent.records.create({ type: "spelldesc", name, data: { name, ...data } }, agent.seat);
  spell("Flame Burst", { level: "Sor/Wiz 3", range: "Long (400 ft. + 40 ft./level)", effect: "20-ft.-radius spread", duration: "Instantaneous", save: "Reflex half", sr: "Yes", description: "<p>A roaring burst deals 1d6 points of fire damage per caster level (maximum 10d6) to each creature in the area.</p>" });
  spell("Slumber", { level: "Brd 1, Sor/Wiz 1", range: "Medium (100 ft. + 10 ft./level)", effect: "One or more living creatures within a 10-ft.-radius burst", duration: "1 min./level", save: "Will negates", sr: "Yes", description: "<p>Creatures in the area fall into a magical slumber. Wounding a sleeper wakes it.</p>" });
  spell("Blessing", { level: "Clr 1", range: "50 ft.", effect: "The caster and all allies within a 50-ft. burst, centered on the caster", duration: "1 min./level", save: "None", sr: "Yes (harmless)", description: "<p>Each ally gains a +1 morale bonus on attack rolls.</p>" });
  const wizard = agent.records.create({ type: "character", name: "Elan", owner: "", visibility: "all", data: { classes: [{ name: "Wizard", level: 5 }], level: 5, hp: { total: 20, wounds: 0 }, ac: { total: 12 }, spellcasting: { class: "Wizard", stat: "intelligence", dc: 13, perday: [4, 3, 2, 1], used: [0, 0, 0, 0] } } }, agent.seat);
  const cleric = agent.records.create({ type: "character", name: "Tor", owner: "", visibility: "all", data: { classes: [{ name: "Cleric", level: 3 }], level: 3, hp: { total: 20, wounds: 0 }, ac: { total: 15 }, spellcasting: { class: "Cleric", stat: "wisdom", dc: 12, perday: [4, 3, 2], used: [0, 0, 0] } } }, agent.seat);
  const orc = agent.records.create({ type: "npc", name: "Orc", data: { hp: 60, ac: 13 } }, agent.seat);
  await ct({ action: "add", recordId: wizard.id });
  await ct({ action: "add", recordId: cleric.id });
  await ct({ action: "add", recordId: orc.id, count: 2 });
  let view = await ct({ action: "view" });
  const id = (name) => view.entries.find((entry) => entry.name === name).id;
  const wounds = (name) => agent.combat.vitals(agent.combat.entries().find((entry) => entry.name === name)).wounds;

  // Flame Burst at caster level 5: 5d6 (each a 4: 20); Orc 1 fails its Reflex save (a 1), Orc 2 makes it (a 20): 10.
  await ct({ action: "target", id: id("Elan"), targetId: id("Orc 1") });
  await ct({ action: "target", id: id("Elan"), targetId: id("Orc 2") });
  agent.dice.force([1, 20, 4, 4, 4, 4, 4]);
  let cast = (await ct({ action: "cast", recordId: wizard.id, power: "Flame Burst" })).cast;
  assert(cast.level === 3 && cast.casterLevel === 5, `a 3rd-level spell at caster level 5: ${JSON.stringify(cast)}`);
  assert(wounds("Orc 1") === 20 && wounds("Orc 2") === 10, `20 on the failed save, half on the made one: ${wounds("Orc 1")}, ${wounds("Orc 2")}`);
  assert(agent.records.get(wizard.id).data.spellcasting.used[3] === 1, "a 3rd-level spell spent");
  assert(agent.chatLog(12).some((line) => /^\[SAVE\] Flame Burst/.test(line.roll?.label ?? "") && /DC 16/.test(line.roll.label)), "Reflex against DC 16 (10 + 3 + 3)");
  // Slumber: Orc 1 fails its Will save and sleeps; hurt, it wakes.
  agent.dice.force([2, 19]);
  cast = (await ct({ action: "cast", recordId: wizard.id, power: "Slumber" })).cast;
  view = await ct({ action: "view" });
  const sleeping = view.entries.filter((entry) => entry.effects.some((effect) => /Slumber/.test(effect.label)));
  assert(sleeping.length === 1 && sleeping[0].name === "Orc 1" && sleeping[0].effects[0].duration === 50, `Orc 1 sleeps for 5 minutes (50 rounds): ${JSON.stringify(sleeping.map((e) => e.effects))}`);
  await ct({ action: "damage", id: id("Orc 1"), amount: 1 });
  view = await ct({ action: "view" });
  assert(!view.entries.find((entry) => entry.name === "Orc 1").effects.some((effect) => /Slumber/.test(effect.label)), "wounded, it wakes");
  // Blessing on Tor, Elan and an orc: the orc is no ally.
  for (const name of ["Tor", "Elan", "Orc 2"]) await ct({ action: "target", id: id("Tor"), targetId: id(name) });
  await ct({ action: "cast", recordId: cleric.id, power: "Blessing" });
  view = await ct({ action: "view" });
  const blessed = view.entries.filter((entry) => entry.effects.some((effect) => /^Blessing; ATK: 1/.test(effect.label))).map((entry) => entry.name).sort();
  assert(blessed.join() === "Elan,Tor", `the allies are blessed (+1 to hit), not the orc: ${blessed}`);
});

// --- AD&D 2E (FG 2E actions) --------------------------------------------------------
await game("AD&D 2E", async (agent, ct) => {
  agent.records.create({ type: "spell", name: "Fire Globe", data: { name: "Fire Globe", level: 3, aoe: "20 ft radius sphere", save: "Half", duration: "Instantaneous", range: "100 ft", actions: { "id-00001": { type: "cast", savetype: "spell", onmissdamage: "half" }, "id-00002": { type: "damage", damagelist: { "id-00001": { dice: "d6", castertype: "casterlevel", castermax: 10, type: "fire" } } } }, description: "<p>A globe of fire bursts at the chosen point.</p>" } }, agent.seat);
  const mage = agent.records.create({ type: "character", name: "Aldo", owner: "", visibility: "all", data: { classes: [{ name: "Mage", level: 6 }], level: 6, hp: { total: 18, wounds: 0 }, ac: { total: 8 }, spellcasting: [{ class: "Mage", kind: "arcane", perday: [4, 2, 2], used: [0, 0, 0] }] } }, agent.seat);
  const ogre = agent.records.create({ type: "npc", name: "Ogre", data: { hp: 80, ac: 5 } }, agent.seat);
  await ct({ action: "add", recordId: mage.id });
  await ct({ action: "add", recordId: ogre.id });
  const view = await ct({ action: "view" });
  const id = (name) => view.entries.find((entry) => entry.name === name).id;
  await ct({ action: "target", id: id("Aldo"), targetId: id("Ogre") });
  // The ogre's save vs. spell: a 20 saves; 6d6 (all 3s: 18) halves to 9.
  agent.dice.force([20, 3, 3, 3, 3, 3, 3]);
  const cast = (await ct({ action: "cast", recordId: mage.id, power: "Fire Globe" })).cast;
  assert(cast.saves[0]?.success === true, `the ogre saves vs. spell: ${JSON.stringify(cast.saves)}`);
  assert(agent.combat.vitals(agent.combat.entries().find((entry) => entry.name === "Ogre")).wounds === 9, "half of 6d6 at caster level 6");
  assert(agent.records.get(mage.id).data.spellcasting[0].used[2] === 1, "a 3rd-level slot spent");
});

console.log(`check-cast-text: ${passed} checks passed`);
