// Saves and spells by SiegeCore's rules, with the PHB's own spell records:
// a save is d20 + attribute + level + SAVE effects against CB + CL (an NPC's
// level is its hit dice, its primes its primeset); casting spends a slot of
// the spell's level; Magic Missile fires 1 missile, +1 every 2 levels; Hold
// Person allows a Wisdom save that negates it, lasting 1 round per level;
// Cure Light Wounds heals its target.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { readModule } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const spells = readModule("C&C Player's Handbook").records.filter((record) => record.type === "siegepower");
const spell = (name) => structuredClone(spells.find((record) => record.name === name).data);

const server = createTableServer();
try {
  await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ct = async (args) => JSON.parse((await callTool("kraken_combat", args, { table: () => server })).content[0].text);
  agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none" } } }, agent.seat);
  const wizard = agent.records.create(
    {
      type: "character",
      name: "Elowen",
      owner: "Ann",
      visibility: "owner",
      data: {
        level: 3,
        hp: { total: 9, wounds: 0 },
        ac: { total: 11 },
        attributes: { intelligence: { score: 16, prime: 1 }, wisdom: { score: 13, prime: 0 } },
        slots: { l1: { max: 2, used: 0 } },
        powers: { "id-00001": spell("Magic Missile"), "id-00002": spell("Hold Person"), "id-00003": spell("Cure Light Wounds") },
      },
    },
    agent.seat,
  );
  const fighter = agent.records.create({ type: "character", name: "Garrick", owner: "Bob", visibility: "owner", data: { level: 1, hp: { total: 11, wounds: 8 }, ac: { total: 16 } } }, agent.seat);
  const orc = agent.records.create({ type: "npc", name: "Orc", data: { hptotal: 9, hd: "1d8", ac: { total: 13 }, primeset: "physical" } }, agent.seat);
  await ct({ action: "add", recordId: wizard.id });
  await ct({ action: "add", recordId: fighter.id });
  await ct({ action: "add", recordId: orc.id, count: 2 });
  let view = await ct({ action: "view" });
  const id = (name) => view.entries.find((entry) => entry.name === name).id;
  const wounds = (name) => (agent.combat.vitals(agent.combat.entries().find((entry) => entry.name === name)) ?? {}).wounds;

  // Magic Missile at caster level 3: 2 missiles of 1d4+1, both at Orc 1; a level 1 slot is spent.
  await ct({ action: "target", id: id("Elowen"), targetId: id("Orc 1") });
  agent.dice.force([3, 2]);
  let cast = (await ct({ action: "cast", recordId: wizard.id, power: "id-00001", castAction: "cc_action_001" })).cast;
  assert(cast.results[0].damage === 7 && wounds("Orc 1") === 7, `2 missiles (3+1, 2+1) = 7: ${JSON.stringify(cast)}`);
  assert(agent.records.get(wizard.id).data.slots.l1.used === 1, "a level 1 slot spent");
  assert(agent.chatLog(6).some((line) => line.roll?.label === "[DAMAGE] Magic Missile: Missile (2 of 2)"), "each missile its own roll");

  // Hold Person on both orcs: Wisdom saves against CB 18 (not prime for a physical
  // orc) + CL 3 = 21; d20 20 + level 1 = 21 saves, d20 2 fails; only Orc 2 is held, 3 rounds.
  await ct({ action: "target", id: id("Elowen"), targetId: id("Orc 1"), on: false });
  await ct({ action: "target", id: id("Elowen"), targetId: id("Orc 1") });
  await ct({ action: "target", id: id("Elowen"), targetId: id("Orc 2") });
  agent.dice.force([20, 2]);
  cast = (await ct({ action: "cast", recordId: wizard.id, power: "id-00002", castAction: "cc_effect_001" })).cast;
  assert(cast.saves.map((s) => `${s.target}:${s.success}`).join() === "Orc 1:true,Orc 2:false", `saves ${JSON.stringify(cast.saves)}`);
  view = cast && (await ct({ action: "view" }));
  const held = view.entries.find((entry) => entry.name === "Orc 2").effects;
  assert(held.length === 1 && held[0].label === "Hold Person; Paralyzed" && held[0].duration === 3, `held for 3 rounds: ${JSON.stringify(held)}`);
  assert(view.entries.find((entry) => entry.name === "Orc 1").effects.length === 0, "the orc that saved is not held");
  const saveLine = agent.chatLog(12).find((line) => line.roll?.label?.startsWith("[SAVE] Hold Person (Wisdom)"))?.roll.label;
  assert(saveLine === "[SAVE] Hold Person (Wisdom) (Secondary) [CB 18 CL 3 CC 21] [SUCCESS 21 vs 21]", `FG's save line: ${saveLine}`);

  // Cure Light Wounds on Garrick (8 wounds): d8 5 heals 5.
  await ct({ action: "clear-targets", id: id("Elowen") });
  await ct({ action: "target", id: id("Elowen"), targetId: id("Garrick") });
  agent.dice.force([5]);
  await ct({ action: "cast", recordId: wizard.id, power: "id-00003", castAction: "cc_action_001" });
  assert(agent.records.get(fighter.id).data.hp.wounds === 3, `healed 5: wounds ${agent.records.get(fighter.id).data.hp.wounds}`);

  // The second level 1 slot went on the cure; a third level 1 spell has none.
  let refused = "";
  try {
    await ct({ action: "cast", recordId: wizard.id, power: "id-00001", castAction: "cc_action_001" });
  } catch (error) {
    refused = String(error.message);
  }
  assert(/No level 1 spells left/.test(refused), `slots run out: ${refused}`);

  // A spell with no actions casts from its own fields: Burning Hands' CLd2+CL at caster
  // level 3 is 3d2+3 on every target (it takes the level 1 slot restored by a rest).
  agent.records.update(wizard.id, { data: { slots: { l1: { used: 0 } }, powers: { "id-00004": spell("Burning Hands") } } }, agent.seat);
  await ct({ action: "clear-targets", id: id("Elowen") });
  await ct({ action: "target", id: id("Elowen"), targetId: id("Orc 2") });
  const before = wounds("Orc 2");
  agent.dice.force([2, 1, 2]);
  cast = (await ct({ action: "cast", recordId: wizard.id, power: "id-00004" })).cast;
  assert(wounds("Orc 2") === before + 8 && agent.chatLog(4).some((line) => line.roll?.formula === "3d2+3"), `Burning Hands 3d2+3 = 8: ${JSON.stringify(cast)}`);

  // A plain save with a SAVE effect: Wisdom 13 (+1), level 3, Bless SAVE +1, CL 2: d20 10 = 15 vs 20 fails.
  await ct({ action: "effect", id: id("Elowen"), effect: { label: "Bless; ATK: 1; SAVE: 1" } });
  agent.dice.force([10]);
  const save = (await ct({ action: "save", id: id("Elowen"), attribute: "wisdom", cl: 2 })).save;
  assert(save.total === 15 && save.cc === 20 && save.success === false, `save ${JSON.stringify(save)}`);
  assert(agent.chatLog(1)[0].roll.label === "[SAVE] Wisdom (Secondary) [CB 18 CL 2 CC 20] [EFFECT +1] [FAILURE 15 vs 20]", agent.chatLog(1)[0].roll.label);
  console.log("SPELLS_OK");
} finally {
  await server.stop();
}
