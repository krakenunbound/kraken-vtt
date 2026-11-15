// Chat damage cards (docs/targeting-actions-design.md 4.4, 4.5): a damage roll
// keeps a card of the creatures it landed on, each with what it took after its
// save and its resistance; the GM's buttons (x0, x1/2, x1, x2, heal) set what a
// creature takes now and only the difference lands; with autoApply off nothing
// lands until a button is pressed (Foundry's way); a chat roll dropped on a
// creature applies there: damage by its type, healing, an attack against its AC.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import { SPELLS } from "../games/srd-5e/spells.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

const server = createTableServer({ ruleset: "D&D 5E" });
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const ct = (args) => tool("kraken_combat", args);
  await agent.combat.ready;
  for (const name of ["Fireball", "Cure Wounds"]) {
    const { __category, ...data } = SPELLS.find((item) => item.name === name);
    agent.records.create({ type: "spell", name, data }, agent.seat);
  }
  const abilities = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 14, bonus: 2, save: 2 }]));
  const hagar = agent.records.create({ type: "character", name: "Hagar", owner: "", visibility: "all", data: { level: 5, hp: { total: 40, wounds: 0 }, ac: { total: 12 }, abilities, spellcasting: { stat: "intelligence", dc: 14, attack: 6 }, slots: { l1: { max: 4, used: 0 }, l3: { max: 3, used: 0 } } } }, agent.seat);
  const salamander = agent.records.create({ type: "npc", name: "Fire Imp", data: { hp: 60, ac: 14, damageresistances: "fire", abilities: { dexterity: { score: 10, bonus: 0 } } } }, agent.seat);
  const ogre = agent.records.create({ type: "npc", name: "Ogre", data: { hp: 80, ac: 11, abilities: { dexterity: { score: 8, bonus: -1 } } } }, agent.seat);
  await ct({ action: "add", recordId: hagar.id });
  await ct({ action: "add", recordId: salamander.id });
  await ct({ action: "add", recordId: ogre.id });
  let view = await ct({ action: "view" });
  const id = (name) => view.entries.find((entry) => entry.name === name).id;
  const wounds = (name) => agent.combat.vitals(agent.combat.entries().find((entry) => entry.name === name)).wounds;
  const dm = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
    const inbox = [];
    ws.on("message", (data) => inbox.push(JSON.parse(data.toString())));
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", name: "DM", password: "", hostToken: info.hostToken })));
    setTimeout(() => resolve({ ws, inbox }), 300);
  });
  sockets.push(dm.ws);

  // Fireball at both: one roll (forced 8 x 4 = 32), the imp resists fire; both fail their saves.
  for (const name of ["Fire Imp", "Ogre"]) await ct({ action: "target", id: id("Hagar"), targetId: id(name) });
  agent.dice.force([1, 4, 4, 4, 4, 4, 4, 4, 4, 1]);
  await ct({ action: "cast", recordId: hagar.id, power: "Fireball" });
  const line = [...agent.chatLog(30)].reverse().find((item) => item.roll?.card && /Fireball/.test(item.roll.label));
  assert(line?.roll.apply?.targets.length === 2, `the damage roll keeps a card of its two creatures: ${JSON.stringify(line?.roll.apply)}`);
  const card = line.roll.apply;
  const imp = card.targets.find((row) => row.name === "Fire Imp");
  const ogreRow = card.targets.find((row) => row.name === "Ogre");
  assert(card.total === 32 && ogreRow.taken === 32 && imp.taken === 16 && /RESISTED fire/.test(imp.note), `32 on the ogre, 16 on the resistant imp: ${JSON.stringify(card)}`);
  assert(wounds("Ogre") === 32 && wounds("Fire Imp") === 16, "the wounds are on the tracker");
  await new Promise((resolve) => setTimeout(resolve, 300));
  const sent = [...dm.inbox].reverse().find((m) => m.type === "card" && m.card === line.roll.card);
  if (!sent) console.log([...new Set(dm.inbox.map((m) => m.type))], dm.inbox.find((m) => m.type === "ok")?.role, dm.inbox.length);
  assert(sent && sent.apply.targets.length === 2, "the GM's screen is told");

  // The buttons: the ogre made its save after all (x1/2): 16 comes back; x2 on the imp: resisted, 32.
  let after = (await ct({ action: "apply-card", card: line.roll.card, targetId: id("Ogre"), mult: 0.5 })).card;
  assert(wounds("Ogre") === 16 && after.targets.find((row) => row.name === "Ogre").taken === 16, `half: 16 given back: ${wounds("Ogre")}`);
  after = (await ct({ action: "apply-card", card: line.roll.card, targetId: id("Fire Imp"), mult: 2 })).card;
  assert(wounds("Fire Imp") === 32, `double, then resisted: 32: ${wounds("Fire Imp")}`);
  after = (await ct({ action: "apply-card", card: line.roll.card, targetId: id("Fire Imp"), mult: 0 })).card;
  assert(wounds("Fire Imp") === 0, "x0 takes it all back");
  // Hagar was not on it: the GM applies it to him too (he joins the card).
  after = (await ct({ action: "apply-card", card: line.roll.card, targetId: id("Hagar"), mult: 1 })).card;
  assert(wounds("Hagar") === 32 && after.targets.length === 3, "a creature not on the card joins it");
  after = (await ct({ action: "apply-card", card: line.roll.card, targetId: id("Hagar"), mult: "heal" })).card;
  assert(wounds("Hagar") === 0, `heal: the damage given back and healed (capped at his wounds): ${wounds("Hagar")}`);

  // Foundry's way: with autoApply off, a roll waits for its buttons.
  await tool("kraken_table_options", { autoApply: false });
  await ct({ action: "clear-targets", id: id("Hagar") });
  await ct({ action: "target", id: id("Hagar"), targetId: id("Ogre") });
  const before = wounds("Ogre");
  agent.dice.force([1, 3, 3, 3, 3, 3, 3, 3, 3]);
  await ct({ action: "cast", recordId: hagar.id, power: "Fireball" });
  assert(wounds("Ogre") === before, "nothing lands yet");
  const waiting = [...agent.chatLog(30)].reverse().find((item) => item.roll?.card && /Fireball/.test(item.roll.label));
  assert(waiting.roll.apply.auto === false && waiting.roll.apply.targets[0].mult === null, "the card waits");
  await ct({ action: "apply-card", card: waiting.roll.card, targetId: id("Ogre"), mult: 1 });
  assert(wounds("Ogre") === before + 24, `x1 lands 24: ${wounds("Ogre") - before}`);
  await tool("kraken_table_options", { autoApply: true });

  // A chat roll dropped on a creature: 10 fire on the imp (resisted: 5), 7 healing on the ogre, an attack of 13 vs the ogre's AC 11.
  const impBefore = wounds("Fire Imp");
  await ct({ action: "apply-roll", targetId: id("Fire Imp"), rollDrop: { kind: "damage", total: 10, type: "fire", name: "Torch" } });
  assert(wounds("Fire Imp") === impBefore + 5, "dropped fire damage is resisted");
  const ogreBefore = wounds("Ogre");
  await ct({ action: "apply-roll", targetId: id("Ogre"), rollDrop: { kind: "heal", total: 7, name: "Potion" } });
  assert(wounds("Ogre") === ogreBefore - 7, "dropped healing heals");
  const attack = (await ct({ action: "apply-roll", targetId: id("Ogre"), rollDrop: { kind: "attack", total: 13, natural: 9, name: "Longsword", by: "Hagar" } })).applied;
  assert(attack.hit && attack.ac === 11, "a dropped attack is compared with the AC");
  assert(agent.combat.entries().find((entry) => entry.name === "Hagar").hitOn?.[id("Ogre")] === "hit", "the attacker's next damage knows it hit");

  console.log(`check-cards: ${passed} checks passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
