// Attacks by SiegeCore's rules (ActionAttack, CoreRPG ActionDamage): targets
// on the tracker; d20 + the attack bonus + ATK effects against the target's
// AC + AC effects, equal hits, one roll per target; damage is the weapon's dice
// + the damage attribute + DMG effects, at least 1, put on every target; NPCs
// attack with their record's attacks; an attack with no target says so.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = createTableServer();
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ct = async (args) => JSON.parse((await callTool("kraken_combat", args, { table: () => server })).content[0].text);
  agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none", SIEGE_MELEE_DMG_STAT: "strength" } } }, agent.seat);
  const hero = agent.records.create(
    {
      type: "character",
      name: "Aldric",
      owner: "Ann",
      visibility: "owner",
      data: {
        hp: { total: 20, wounds: 0 },
        ac: { total: 17 },
        bth: 2,
        attack: { melee: { attr: 1, total: 3 }, ranged: { attr: 0, total: 2 } },
        attributes: { strength: { score: 15 } },
        inventorylist: { "id-00001": { name: "Sword, Long", damage: "1d8", attacktype: "melee", dmgtype: "slashing", carried: 2 } },
      },
    },
    agent.seat,
  );
  const orcRecord = agent.records.create({ type: "npc", name: "Orc", data: { hptotal: 9, ac: { total: 13 }, bth: 1, attacks: { a01: { name: "By Weapon", bth: 0, attacktype: "melee", damage: "1d8" } } } }, agent.seat);
  await ct({ action: "add", recordId: hero.id });
  let view = await ct({ action: "add", recordId: orcRecord.id });
  const heroEntry = view.entries.find((e) => e.name === "Aldric");
  const orc = view.entries.find((e) => e.name === "Orc");
  assert(orc.attacks?.[0]?.bonus === 1, `the GM sees the orc's attacks: ${JSON.stringify(orc.attacks)}`);

  // No target: the roll says so.
  agent.dice.force([11]);
  let result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  assert(result.results[0].hit === null && agent.chatLog(1)[0].roll.result === "NO TARGET", "no target");

  // Target the orc. Bless (+1): d20 9 + 3 + 1 = 13 against AC 13 hits (equal hits).
  await ct({ action: "target", id: heroEntry.id, targetId: orc.id });
  await ct({ action: "effect", id: heroEntry.id, effect: { label: "Bless; ATK: 1" } });
  agent.dice.force([9]);
  result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  assert(result.results[0].hit === true && result.results[0].total === 13 && result.results[0].ac === 13, `equal hits: ${JSON.stringify(result.results)}`);
  const card = agent.chatLog(1)[0].roll;
  assert(card.label === "[ATTACK] (M) Sword, Long [AC 13] [HIT 13 vs 13] -> [at Orc]" && card.result === "HIT", `FG's attack line: ${card.label}`);
  agent.dice.force([8]);
  result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  assert(result.results[0].hit === false, "12 against 13 misses");

  // Damage: d8 5 + Strength 15 (+1) = 6 on the orc.
  agent.dice.force([5]);
  result = await ct({ action: "damage-roll", recordId: hero.id, weapon: "id-00001" });
  assert(result.damage.total === 6 && result.damage.targets.join() === "Orc", `damage ${JSON.stringify(result.damage)}`);
  view = result.combat;
  assert(view.entries.find((e) => e.id === orc.id).wounds === 6, "the orc took 6");
  assert(agent.chatLog(3).some((line) => line.roll?.label === "[DAMAGE] (M) Sword, Long [TYPE: slashing]"), "damage card");

  // The orc swings back: d20 15 + its BtH 1 = 16 against AC 17 + Shield (AC: 2) = 19 misses.
  await ct({ action: "target", id: orc.id, targetId: heroEntry.id });
  await ct({ action: "effect", id: heroEntry.id, effect: { label: "Shield; AC: 2" } });
  agent.dice.force([15]);
  result = await ct({ action: "attack", id: orc.id, weapon: "a01" });
  assert(result.results[0].ac === 19 && result.results[0].hit === false, `AC effects count: ${JSON.stringify(result.results)}`);
  agent.dice.force([3]);
  await ct({ action: "damage-roll", id: orc.id, weapon: "a01" });
  assert(agent.records.get(hero.id).data.hp.wounds === 3, "the orc's damage goes on Aldric's sheet");

  // Players: Ann attacks with her own character, not with Bob's or the orc.
  const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
  sockets.push(ws);
  const inbox = [];
  ws.on("message", (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise((resolve) => ws.on("open", resolve));
  ws.send(JSON.stringify({ type: "join", name: "Ann", password: "" }));
  const latest = async (test, label) => {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const found = [...inbox].reverse().find(test);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`waiting for ${label}`);
  };
  const ok = await latest((m) => m.type === "ok", "join");
  assert(ok.combat.entries.find((e) => e.name === "Aldric").targets.includes(orc.id) && ok.combat.entries.find((e) => e.name === "Orc").attacks === undefined, "players see their own targets, not NPC attacks");
  agent.dice.force([20]);
  ws.send(JSON.stringify({ type: "ct", action: "attack", recordId: hero.id, weapon: "id-00001" }));
  await latest((m) => m.type === "chat" && m.from === "Ann" && m.roll?.result === "HIT", "Ann's attack");
  ws.send(JSON.stringify({ type: "ct", action: "attack", id: orc.id, weapon: "a01" }));
  await latest((m) => m.type === "error" && /Only the GM/.test(m.reason), "players cannot attack with the orc");
  console.log("ATTACK_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
