// The combat tracker by CoreRPG's and SiegeCore's rules: initiative order,
// turns and rounds with FG's chat lines, NPC hit dice and numbering, effect
// durations counting down at their initiative, damage and healing with the
// negative hit point rules, unconscious enemies losing their turns, hidden
// entries kept from players, and what players may do.
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
  const ctx = { table: () => server };
  const ct = async (args) => JSON.parse((await callTool("kraken_combat", args, ctx)).content[0].text);
  // This campaign's choices: no attribute on initiative, bleeding and the heal cap on.
  agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none", SIEGE_NEGATIVE_HP_BLEED: "on", SIEGE_NEGATIVE_HEAL_CAP: "on" } } }, agent.seat);
  const hero = agent.records.create({ type: "character", name: "Aldric", owner: "Ann", visibility: "owner", data: { hp: { total: 12, wounds: 0 }, ac: { total: 17 } } }, agent.seat);
  const orc = agent.records.create({ type: "npc", name: "Orc", data: { hd: "1d8", ac: { total: 13 } } }, agent.seat);

  // NPCs roll their hit dice; a second orc numbers both (NNPC append).
  agent.dice.force([5, 7]);
  await ct({ action: "add", recordId: orc.id });
  let view = await ct({ action: "add", recordId: orc.id });
  assert(view.entries.map((e) => e.name).sort().join() === "Orc 1,Orc 2", `numbered ${view.entries.map((e) => e.name)}`);
  assert(view.entries.map((e) => e.hp).sort().join() === "5,7" && view.entries.every((e) => e.ac === 13), "orcs rolled 1d8 hit points, AC from the record");
  await ct({ action: "add", recordId: hero.id });
  await ct({ action: "add", entry: { name: "Lurker", hp: 4, ac: 12, faction: "foe" }, hidden: true });
  view = await ct({ action: "view" });
  const lurker = view.entries.find((e) => e.name === "Lurker");
  await ct({ action: "update", id: lurker.id, patch: { hidden: true } });

  // Initiative: d10 + bonus, high to low, ties by name.
  const id = (name) => view.entries.find((e) => e.name === name).id;
  agent.dice.force([4, 9, 4, 2]);
  view = await ct({ action: "init", which: "all" });
  const order = view.entries.map((e) => `${e.name}:${e.initresult}`).join(" ");
  assert(view.entries.map((e) => e.initresult).every((v, i, a) => i === 0 || a[i - 1] >= v), `sorted high to low: ${order}`);

  // Players: they see no hidden entries, foes' health as a status, and may not run the fight.
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
  assert(!ok.combat.entries.some((e) => e.name === "Lurker"), "players never see hidden entries");
  const playerOrc = ok.combat.entries.find((e) => e.name === "Orc 1");
  assert(playerOrc.hp === undefined && playerOrc.health.status === "Healthy" && ok.combat.entries.find((e) => e.name === "Aldric").hp === 12, "foes show a status, friends their hit points");
  ws.send(JSON.stringify({ type: "ct", action: "next" }));
  await latest((m) => m.type === "error" && /not your turn/.test(m.reason), "players cannot advance someone else's turn");

  // Turns: round 1, then each in order; the hidden lurker's turn is GM-only.
  view = await ct({ action: "next" });
  const sorted = view.entries.map((e) => e.id);
  assert(view.round === 1 && view.active === sorted[0], "round 1 starts with the highest");
  const said = () => agent.chatLog(40).map((line) => `${line.secret ? "(gm) " : ""}${line.text || line.roll?.label}`);
  assert(said().includes("[ROUND 1]") && said().includes(`[TURN] ${view.entries[0].name}`), `turn lines ${JSON.stringify(said().slice(-4))}`);

  // An effect for 2 rounds on Aldric, applied on the current initiative,
  // expires two rounds later at that same count.
  await ct({ action: "effect", id: id("Aldric"), effect: { label: "Bless; ATK: 1", duration: 2 } });
  for (let step = 0; step < sorted.length; step += 1) view = await ct({ action: "next" });
  assert(view.round === 2 && view.entries.find((e) => e.name === "Aldric").effects[0]?.duration === 1, `after a round: ${JSON.stringify(view.entries.find((e) => e.name === "Aldric").effects)}`);
  for (let step = 0; step < sorted.length; step += 1) view = await ct({ action: "next" });
  assert(view.round === 3 && view.entries.find((e) => e.name === "Aldric").effects.length === 0, "the effect expired after two rounds");
  assert(said().some((line) => line.includes("Effect ['Bless; ATK: 1'] -> [EXPIRED] on Aldric")), "expiry in chat");
  assert(said().some((line) => line === "(gm) [TURN] Lurker") && !inbox.some((m) => m.type === "chat" && m.text === "[TURN] Lurker"), "the lurker's turn is never sent to players");

  // Damage: Aldric (PC) takes wounds on his sheet; an orc goes unconscious and loses its turns.
  await ct({ action: "damage", id: id("Aldric"), amount: 15 });
  assert(agent.records.get(hero.id).data.hp.wounds === 15, "a character's wounds go on the sheet");
  // -3: the heal cap stops healing at 0.
  await ct({ action: "heal", id: id("Aldric"), amount: 10 });
  assert(agent.records.get(hero.id).data.hp.wounds === 12, `heal cap: -3 healed to 0 only, wounds ${agent.records.get(hero.id).data.hp.wounds}`);
  const orc1 = id("Orc 1");
  const orcHp = view.entries.find((e) => e.id === orc1).hp;
  await ct({ action: "damage", id: orc1, amount: orcHp });
  view = await ct({ action: "view" });
  assert(view.entries.find((e) => e.id === orc1).health.status === "Unconscious", "at 0 the orc is unconscious");
  // Skip to the orc's place: its turn is passed over.
  const before = said().length;
  for (let step = 0; step < sorted.length; step += 1) view = await ct({ action: "next" });
  assert(view.active !== orc1, "an unconscious enemy loses its turn");

  // Bleeding: at -8 (dying) Aldric loses 1 at the start of his turn, once a round.
  await ct({ action: "damage", id: id("Aldric"), amount: 8 });
  const woundsBefore = agent.records.get(hero.id).data.hp.wounds;
  let guard = 0;
  do {
    view = await ct({ action: "next" });
    guard += 1;
  } while (view.active !== id("Aldric") && guard < 10);
  assert(agent.records.get(hero.id).data.hp.wounds === woundsBefore + 1, `dying bleed: wounds ${agent.records.get(hero.id).data.hp.wounds}`);
  assert(said().slice(before).some((line) => line.startsWith("[DAMAGE] Negative HP bleeding -> Aldric")), "bleeding in chat");
  // Healing the dying stabilises; healing the dead is refused.
  await ct({ action: "heal", id: id("Aldric"), amount: 1 });
  await ct({ action: "damage", id: orc1, amount: 30 });
  await ct({ action: "heal", id: orc1, amount: 5 });
  assert(said().includes("(gm) Healing cannot restore a dead creature. Explicit revival is required."), "the dead are not healed");

  // A player rolls their own initiative; the fight ends and the NPCs leave.
  ws.send(JSON.stringify({ type: "ct", action: "init", which: id("Aldric") }));
  await latest((m) => m.type === "chat" && m.roll?.label === "[INIT] Aldric", "player initiative");
  view = await ct({ action: "end", removeNpcs: true });
  assert(view.round === 0 && view.entries.length === 1 && view.entries[0].name === "Aldric", "end of combat");
  assert(server.persisted().combat.entries.length === 1, "the tracker is saved with the table");
  console.log("COMBAT_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
