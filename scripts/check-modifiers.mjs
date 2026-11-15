// The modifier stack (FG's modifier box) and its keys, on the host: each
// seat's own; read by every roll the seat starts (the tray, /roll, a sheet's
// check, the tracker's attacks, saves and damage); one action's rolls all read
// it (a full attack), then what it used is cleared; the card lists it. ADV and
// DIS change the d20 (and cancel), cover reads attacks only, Crit, Max and
// Half damage only; an empty stack changes nothing; the agent's tool.
import "./loopback.mjs";
import { WebSocket } from "ws";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { withDie, kindOf } = require("../electron/modifiers.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

const done = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const seat = { ws, lines: [], errors: [], stacks: [], send: (body) => ws.send(JSON.stringify(body)) };
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") seat.lines.push(msg);
      if (msg.type === "error") seat.errors.push(msg.reason);
      if (msg.type === "modifiers") seat.stacks.push(msg.modifiers);
      if (msg.type === "no") reject(new Error(`join refused: ${msg.reason}`));
      if (msg.type === "ok") {
        seat.first = msg.modifiers;
        resolve(seat);
      }
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const lastRoll = (seat) => [...seat.lines].reverse().find((line) => line.roll)?.roll;

// The formula changes.
assert(withDie("1d20+5", "adv").formula === "2d20kh1+5", "ADV: 1d20 -> 2d20kh1");
assert(withDie("1d20+5", "dis").formula === "2d20kl1+5", "DIS: 1d20 -> 2d20kl1");
assert(withDie("2d20kh1+5", "dis").formula === "1d20+5", "DIS on advantage cancels");
assert(withDie("2d20kh1+5", "adv").formula === "2d20kh1+5", "ADV on advantage stays one");
assert(withDie("2d6+1", "adv").formula === "3d6kh2+1", "a boon on 2d6: 3d6kh2");
assert(withDie("4d6!", "adv").applied === null, "an exploding die is left");
assert(kindOf("[DAMAGE] Longsword") === "damage" && kindOf("[ATTACK] (M) Longsword") === "attack" && kindOf("Hagar: Fighter 2 hit points") === "none" && kindOf("[DAMAGE] Ongoing damage (Burning)") === "none" && kindOf("") === "roll", "kinds read from labels");
done.push("formulas: ADV/DIS (cancelling), boon on 2d6, kinds from labels");

const server = createTableServer({ ruleset: "D&D 5E" });
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const ct = (args) => tool("kraken_combat", args);
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "a test player" });
  assert(ann.first && ann.first.slots.length === 0 && ann.first.total === 0, "a seat joins with its stack (empty)");

  // An empty stack changes nothing: the same dice give the same card, with no list.
  agent.dice.force([11]);
  ann.send({ type: "roll", formula: "1d20+2", label: "Plain" });
  await settle();
  let roll = lastRoll(ann);
  assert(roll.total === 13 && roll.formula === "1d20+2" && !roll.mods, `an empty stack changes nothing: ${JSON.stringify(roll)}`);

  // Two labelled slots (a number dropped on the box, /mod) and the box's own number; the tray's roll reads them.
  ann.send({ type: "modifiers", action: "add", value: 2, label: "Flanking" });
  ann.send({ type: "modifiers", action: "add", value: -1, label: "Bane" });
  await settle();
  let stack = ann.stacks.at(-1);
  assert(stack.slots.length === 2 && stack.total === 1, `two slots and their total: ${JSON.stringify(stack)}`);
  assert(gm.stacks.length === 0, "the GM's box is the GM's own");
  agent.dice.force([10]);
  ann.send({ type: "roll", formula: "1d20", label: "Tray" });
  await settle();
  roll = lastRoll(ann);
  assert(roll.total === 11 && roll.formula === "1d20+1" && roll.mods.length === 2 && roll.mods[0].label === "Flanking" && roll.mods[0].value === 2, `the tray's roll reads the stack, and lists it: ${JSON.stringify(roll)}`);
  assert(ann.stacks.at(-1).slots.length === 0, "and the stack clears after the roll");
  done.push("slots: added, totalled, read by the tray's roll, listed on the card, cleared");

  // Right-click takes one off; six at most; clear.
  for (const value of [1, 2, 3, 4, 5, 6]) ann.send({ type: "modifiers", action: "add", value });
  ann.send({ type: "modifiers", action: "add", value: 7 });
  await settle();
  assert(ann.stacks.at(-1).slots.length === 6 && ann.errors.some((reason) => /6 at most/.test(reason)), "six slots at most");
  ann.send({ type: "modifiers", action: "remove", index: 0 });
  await settle();
  assert(ann.stacks.at(-1).slots.length === 5 && ann.stacks.at(-1).total === 20, "right-click takes one off");
  ann.send({ type: "modifiers", action: "clear" });
  await settle();
  assert(ann.stacks.at(-1).slots.length === 0, "clear");
  done.push("six slots at most, one taken off, cleared");

  // A 5E character with a sword; a goblin in the fight.
  const hero = agent.records.create({ type: "character", name: "Hagar", owner: "a test player", visibility: "owner", data: { level: 3, prof: 2, hp: { total: 20, wounds: 0 }, ac: { total: 15 }, abilities: { strength: { score: 16, bonus: 3, save: 5 }, dexterity: { score: 12, bonus: 1, save: 1 }, constitution: { score: 14, bonus: 2, save: 4 }, intelligence: { score: 10, bonus: 0, save: 0 }, wisdom: { score: 10, bonus: 0, save: 0 }, charisma: { score: 10, bonus: 0, save: 0 } }, attacks: { w1: { name: "Longsword", type: "melee", bonus: 5, damage: "1d8", damageBonus: 3, dmgtype: "slashing" } } } }, agent.seat);
  const goblin = agent.records.create({ type: "npc", name: "Goblin", data: { hp: 30, ac: 13 } }, agent.seat);
  await ct({ action: "add", entry: { recordId: hero.id, name: "Hagar", faction: "friend" } });
  await ct({ action: "add", entry: { recordId: goblin.id, name: "Goblin", faction: "foe" } });
  const view = await ct({ action: "view" });
  const H = view.entries.find((entry) => entry.name === "Hagar").id;
  const G = view.entries.find((entry) => entry.name === "Goblin").id;
  await ct({ action: "target", id: H, targetId: G, on: true });

  // ADV and cover: the attack reads both (the d20 two, the higher kept; -2), the damage neither.
  ann.send({ type: "modifiers", action: "key", key: "adv" });
  ann.send({ type: "modifiers", action: "key", key: "cover" });
  ann.send({ type: "modifiers", action: "key", key: "scover" });
  await settle();
  stack = ann.stacks.at(-1);
  assert(stack.keys.includes("adv") && stack.keys.includes("scover") && !stack.keys.includes("cover"), `superior cover turns cover off: ${JSON.stringify(stack)}`);
  ann.send({ type: "modifiers", action: "key", key: "dis" });
  await settle();
  assert(!ann.stacks.at(-1).keys.includes("adv") && ann.stacks.at(-1).keys.includes("dis"), "DIS turns ADV off");
  ann.send({ type: "modifiers", action: "key", key: "adv" });
  ann.send({ type: "modifiers", action: "key", key: "crit" });
  await settle();
  agent.dice.force([4, 15]);
  ann.send({ type: "ct", action: "attack", recordId: hero.id, weapon: "w1" });
  await settle();
  roll = lastRoll(ann);
  assert(/^\[ATTACK\]/.test(roll.label) && roll.formula.startsWith("2d20kh1+5") && roll.formula.endsWith("-5") && roll.total === 15 && roll.mods.some((mod) => mod.label === "ADV") && roll.mods.some((mod) => mod.key === "scover"), `the attack reads ADV and superior cover: ${JSON.stringify(roll)}`);
  stack = ann.stacks.at(-1);
  assert(!stack.keys.includes("adv") && !stack.keys.includes("scover") && stack.keys.includes("crit"), `ADV and cover are used; Crit waits for damage: ${JSON.stringify(stack)}`);
  agent.dice.force([5, 6]);
  ann.send({ type: "ct", action: "damage-roll", recordId: hero.id, weapon: "w1" });
  await settle();
  roll = [...ann.lines].reverse().find((line) => /^\[DAMAGE\]/.test(line.roll?.label ?? ""))?.roll;
  assert(roll && roll.formula.startsWith("2d8") && roll.mods.some((mod) => mod.key === "crit") && roll.total === 14, `Crit doubles the damage dice: ${JSON.stringify(roll)}`);
  assert(!ann.stacks.at(-1).keys.length, "every key used once");
  done.push("5E attack: ADV (2d20kh1), superior cover over cover, DIS over ADV; Crit read by the damage alone");

  // Max and Half on damage; numbers on a save; the GM's own stack; a player's sheet check.
  await tool("kraken_modifiers", { action: "key", key: "max" });
  await tool("kraken_modifiers", { action: "add", value: 1, label: "Magic" });
  const damage = await ct({ action: "damage-roll", recordId: hero.id, weapon: "w1" });
  roll = agent.chatLog(5).reverse().find((line) => /^\[DAMAGE\]/.test(line.roll?.label ?? ""))?.roll;
  assert(roll.total === 8 + 3 + 1 && roll.mods.length === 2 && damage, `Max: every die its highest, and the GM's +1: ${JSON.stringify(roll)}`);
  assert((await tool("kraken_modifiers", {})).slots.length === 0, "the GM's stack cleared after the agent's roll");
  await tool("kraken_modifiers", { action: "key", key: "half" });
  agent.dice.force([7]);
  await ct({ action: "damage-roll", recordId: hero.id, weapon: "w1" });
  roll = agent.chatLog(5).reverse().find((line) => /^\[DAMAGE\]/.test(line.roll?.label ?? ""))?.roll;
  assert(roll.total === 5, `Half: (7 + 3) / 2 = 5: ${roll.total}`);
  // A sheet's check: the player's stack.
  ann.send({ type: "modifiers", action: "add", value: 3, label: "Guidance" });
  ann.send({ type: "modifiers", action: "key", key: "dis" });
  await settle();
  agent.dice.force([12, 6]);
  ann.send({ type: "siege-check", id: hero.id, kind: "check", attribute: "strength" });
  await settle();
  roll = lastRoll(ann);
  assert(roll.formula.startsWith("2d20kl1") && roll.formula.endsWith("+3") && roll.terms[0].rolls.length === 2 && roll.mods.length === 2, `a sheet check reads the player's stack: ${JSON.stringify(roll)}`);
  done.push("Max, Half, the GM's stack read by the agent's rolls; a sheet check with DIS and a slot");

  // Hit points and ongoing damage never read it.
  await tool("kraken_modifiers", { action: "add", value: 5 });
  agent.roll("1d8", "Hagar: Fighter 4 hit points", "Hagar");
  roll = agent.chatLog(1)[0].roll;
  assert(!roll.mods && (await tool("kraken_modifiers", {})).total === 5, "a hit point roll does not read the stack");
  await tool("kraken_modifiers", { action: "clear" });

  done.push("hit points left alone");

  // The chat bar's roll mode: every roll the seat makes, the tracker's too; the agent's own rolls ignore it.
  const bob = await connect(port, { name: "Bob" });
  const seen = () => ({ ann: ann.lines.length, bob: bob.lines.length, gm: gm.lines.length });
  ann.send({ type: "modifiers", action: "mode", mode: "gm" });
  await settle();
  assert(ann.stacks.at(-1).mode === "gm", "the mode is kept with the seat's stack");
  let before = seen();
  ann.send({ type: "roll", formula: "1d20", label: "Sneak" });
  await settle();
  assert(ann.lines.length === before.ann + 1 && gm.lines.length === before.gm + 1 && bob.lines.length === before.bob && ann.lines.at(-1).secret && ann.lines.at(-1).shownTo === "a test player", "GM and me: the GM and the roller see it, Bob does not");
  before = seen();
  ann.send({ type: "ct", action: "attack", recordId: hero.id, weapon: "w1" });
  await settle();
  assert(bob.lines.length === before.bob && ann.lines.length > before.ann, "a tracker attack in that mode too");
  ann.send({ type: "modifiers", action: "mode", mode: "blind" });
  await settle();
  before = seen();
  ann.send({ type: "roll", formula: "1d20", label: "Perception" });
  await settle();
  assert(gm.lines.at(-1).roll && ann.lines.at(-1).tower && !ann.lines.at(-1).roll && bob.lines.length === before.bob, "blind: the GM sees it, the roller only that they rolled");
  ann.send({ type: "modifiers", action: "mode", mode: "self" });
  await settle();
  before = seen();
  ann.send({ type: "roll", formula: "1d20", label: "Mine" });
  await settle();
  assert(ann.lines.at(-1).roll && gm.lines.length === before.gm && bob.lines.length === before.bob, "self: the roller alone");
  ann.send({ type: "modifiers", action: "mode", mode: "public" });
  await tool("kraken_modifiers", { action: "mode", mode: "gm" });
  before = seen();
  agent.roll("1d6", "The agent's roll", "Agent");
  await settle();
  assert(bob.lines.length === before.bob + 1, "the agent's own rolls ignore the GM's mode");
  gm.send({ type: "roll", formula: "1d6", label: "GM private" });
  await settle();
  assert(bob.lines.length === before.bob + 1 && gm.lines.at(-1).secret, "the GM's private roll");
  await tool("kraken_modifiers", { action: "mode", mode: "public" });
  bob.ws.close();
  done.push("roll modes: GM and me, blind, self; the tracker's rolls too; the agent's ignore it");
  console.log(`check-modifiers: ${done.length} groups passed`);
  for (const line of done) console.log(`  ok ${line}`);
  for (const seat of [gm, ann]) seat.ws.close();
} finally {
  await server.stop();
}
