// The alpha.56 source audit (bugslist.md), each finding checked with Kraken's
// own games so it runs on any computer (no licensed content), fixed dice:
//  1 d20 damage lands only on the targets the attack hit; a critical doubles
//    only its own targets' dice and does not outlive the next attack
//  2 a player's raw record change cannot rewrite their character
//  3 Apeira Astra: Down loses its turns and cannot attack
//  4 Descending Darkness: Dread 3 is disadvantage on Wisdom (checks, saves, steadying)
//  5 a save with advantage in a fight keeps the tracker's effects
//  6 a spell's critical belongs to that cast
//  7 temporary hit points take damage first, and show on the tracker
//  8 0 maximum Health with wounds is Dead
//  9 Descending Darkness refuses a death save
// 10 Apeira Astra initiative: no Tactics is -3, Tactics 0 is +0
// 11 d20 damage can be 0
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { healthStatus } from "../shared/map/geometry.mjs";
import { derive } from "../shared/astra/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { importModule } = require("../electron/importers/fgModule.cjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const book = (name) => path.join(ROOT, "games", "modules", name);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function table(ruleset, books) {
  const server = createTableServer({ ruleset });
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const refused = async (name, args) => {
    try {
      const result = await callTool(name, args, ctx);
      return result.isError ? result.content[0].text : null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const agent = server.agent;
  for (const name of books) importModule(agent.records, agent.seat, book(name));
  const last = (pattern) => [...agent.chatLog(300)].reverse().find((line) => line.roll && pattern.test(line.roll.label ?? ""));
  const said = (pattern) => agent.chatLog(300).some((line) => pattern.test(line.text ?? ""));
  const view = async () => (await tool("kraken_combat", { action: "view" })).entries;
  return { server, port: info.port, tool, refused, agent, force: (...values) => agent.dice.force(values), last, said, view };
}

function connect(port, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => reject(new Error("join timed out")), 4000);
    ws.on("error", reject);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "ok" && msg.type !== "no") return;
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", name, password: "" })));
  });
}
let req = 0;
function op(ws, message) {
  return new Promise((resolve, reject) => {
    const id = ++req;
    const timer = setTimeout(() => reject(new Error("op timed out")), 3000);
    const onMessage = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "op-result" || msg.req !== id) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(msg);
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ type: "op", req: id, ...message }));
  });
}

const done = [];

// --- Descending Darkness ---------------------------------------------------
const dd = await table("Descending Darkness", ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary"]);
let player;
try {
  const { tool, refused, agent, force, last, said, view } = dd;
  const built = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Ilse", species: "Human", class: "Wizard", level: 3, scores: { strength: 8, dexterity: 14, constitution: 13, intelligence: 17, wisdom: 12, charisma: 10 }, spells: ["Ember Ray"], gear: [["Dagger", 1]] } });
  const ilseId = built.id;
  const dagger = Object.entries(agent.records.get(ilseId).data.attacks).find(([, attack]) => attack.name === "Dagger");
  assert(dagger && dagger[1].bonus === 4 && dagger[1].damage === "1d4+2", `Ilse's dagger +4, 1d4+2: ${JSON.stringify(dagger)}`);
  const sentinel = agent.records.list({ type: "npc" }).find((record) => record.name === "Bone Sentinel");
  await tool("kraken_combat", { action: "add", recordId: ilseId });
  await tool("kraken_combat", { action: "add", recordId: sentinel.id, count: 2 });
  let entries = await view();
  const ilse = entries.find((entry) => entry.name === "Ilse");
  const s1 = entries.find((entry) => entry.name === "Bone Sentinel 1");
  const s2 = entries.find((entry) => entry.name === "Bone Sentinel 2");
  const wounds = async (id) => (await view()).find((entry) => entry.id === id).wounds;
  const reset = async () => {
    for (const entry of [s1, s2]) await tool("kraken_combat", { action: "update", id: entry.id, patch: { wounds: 0 } });
  };
  const attack = () => tool("kraken_combat", { action: "attack", recordId: ilseId, weapon: dagger[0] });
  const damage = async () => (await tool("kraken_combat", { action: "damage-roll", recordId: ilseId, weapon: dagger[0] })).damage;
  await tool("kraken_combat", { action: "target", id: ilse.id, targetId: s1.id, on: true });

  // 1. A miss, then damage: nothing lands.
  force(5);
  await attack();
  let hit = await damage();
  assert((await wounds(s1.id)) === 0 && hit.missed.includes("Bone Sentinel 1") && said(/Dagger -> Bone Sentinel 1: the attack missed/), `damage after a miss lands nowhere: ${JSON.stringify(hit)}`);
  // A critical, then a miss before any damage: the critical is gone.
  force(20);
  await attack();
  force(5);
  await attack();
  hit = await damage();
  assert(!hit.crit && (await wounds(s1.id)) === 0, `a critical does not outlive the next attack: ${JSON.stringify(hit)}`);
  // Two targets, a critical on one and a miss on the other: only the critical's target, dice doubled.
  await tool("kraken_combat", { action: "target", id: ilse.id, targetId: s2.id, on: true });
  force(20, 2);
  await attack();
  force(1, 1);
  hit = await damage();
  assert(hit.crit && last(/^\[DAMAGE\]/).roll.formula === "2d4+2" && (await wounds(s1.id)) === 4 && (await wounds(s2.id)) === 0, `a critical doubles only its own target's dice: ${JSON.stringify(hit)}`);
  // With no attack since, damage lands on every target (FG's Damage button).
  force(2);
  hit = await damage();
  assert(!hit.crit && (await wounds(s1.id)) === 8 && (await wounds(s2.id)) === 4, `damage with no attack before it lands on all targets: ${JSON.stringify(hit)}`);
  done.push("1 damage only on hits, criticals per target and per attack");

  // 11. Damage can be 0 (an effect of -6 against 1d4+2).
  await reset();
  await tool("kraken_combat", { action: "effect", id: ilse.id, effect: { label: "Weakened; DMG: -6" } });
  force(15, 15);
  await attack();
  force(1);
  hit = await damage();
  assert(hit.total === 0 && (await wounds(s1.id)) === 0 && said(/Dagger -> Bone Sentinel 1: no damage/), `1 + 2 - 6 deals 0, not 1: ${JSON.stringify(hit)}`);
  const weak = (await view()).find((entry) => entry.id === ilse.id).effects.find((effect) => /Weakened/.test(effect.label));
  await tool("kraken_combat", { action: "effect-remove", id: ilse.id, effectId: weak.id });
  done.push("11 damage can be 0");

  // 6. A spell's critical is that cast's: Ember Ray crits, the next cast does not.
  await tool("kraken_combat", { action: "target", id: ilse.id, targetId: s2.id, on: false });
  force(20, 1, 1, 1, 1);
  await tool("kraken_combat", { action: "cast", recordId: ilseId, power: "Ember Ray" });
  const crit = last(/^\[DAMAGE\] Ember Ray/).roll;
  force(15, 1, 1, 1, 1);
  await tool("kraken_combat", { action: "cast", recordId: ilseId, power: "Ember Ray" });
  const plain = last(/^\[DAMAGE\] Ember Ray/).roll;
  assert(/CRITICAL/.test(crit.label) && !/CRITICAL/.test(plain.label) && plain.formula !== crit.formula, `a spell's critical stays with its cast: ${crit.formula} then ${plain.formula}`);
  done.push("6 spell criticals per cast");

  // 7. Temporary hit points first.
  await tool("kraken_character_edit", { id: ilseId, changes: [{ path: "hp.temp", value: 5 }] });
  entries = await view();
  assert(entries.find((entry) => entry.id === ilse.id).temp === 5, "the tracker shows temporary hit points");
  await tool("kraken_combat", { action: "damage", id: ilse.id, amount: 3 });
  let hp = agent.records.get(ilseId).data.hp;
  assert(hp.wounds === 0 && hp.temp === 2, `3 damage against 5 temporary: wounds 0, temp 2: ${JSON.stringify(hp)}`);
  await tool("kraken_combat", { action: "damage", id: ilse.id, amount: 4 });
  hp = agent.records.get(ilseId).data.hp;
  assert(hp.wounds === 2 && hp.temp === 0, `4 more: the last 2 temporary, then 2 wounds: ${JSON.stringify(hp)}`);
  await tool("kraken_combat", { action: "heal", id: ilse.id, amount: 2 });
  hp = agent.records.get(ilseId).data.hp;
  assert(hp.wounds === 0 && hp.temp === 0, `healing does not restore temporary hit points: ${JSON.stringify(hp)}`);
  done.push("7 temporary hit points");

  // 5. A save with advantage in a fight: keep-highest, and the effect's bonus counts.
  await tool("kraken_combat", { action: "effect", id: ilse.id, effect: { label: "Blessed; SAVE: 2" } });
  force(3, 17);
  const blessed = (await tool("kraken_combat", { action: "save", id: ilse.id, attribute: "dexterity", cl: 15, advantage: "advantage" })).save;
  const saveRoll = last(/^\[SAVE\]/).roll;
  assert(/^2d20kh1/.test(saveRoll.formula) && /ADVANTAGE/.test(saveRoll.label) && blessed.total === 17 + 2 + 2 && blessed.success, `advantage keeps the high die and the effect's +2: ${saveRoll.formula} = ${blessed.total}`);
  done.push("5 advantage on a tracker save keeps effects");

  // 4. Dread: 2 is one die; 3 is disadvantage on Wisdom saves, checks and skills; advantage cancels it; Dexterity is untouched.
  await tool("kraken_character_edit", { id: ilseId, changes: [{ path: "dread", value: 2 }] });
  force(10);
  await tool("kraken_combat", { action: "save", id: ilse.id, attribute: "wisdom", cl: 10 });
  assert(/^1d20/.test(last(/^\[SAVE\]/).roll.formula), "Dread 2: one die");
  await tool("kraken_character_edit", { id: ilseId, changes: [{ path: "dread", value: 3 }] });
  force(15, 4);
  await tool("kraken_combat", { action: "save", id: ilse.id, attribute: "wisdom", cl: 10 });
  let roll = last(/^\[SAVE\]/).roll;
  assert(/^2d20kl1/.test(roll.formula) && /DREAD/.test(roll.label), `Dread 3: a Wisdom save at disadvantage: ${roll.formula} ${roll.label}`);
  force(15);
  await tool("kraken_combat", { action: "save", id: ilse.id, attribute: "wisdom", cl: 10, advantage: "advantage" });
  assert(/^1d20/.test(last(/^\[SAVE\]/).roll.formula), "Dread 3 with advantage: they cancel, one die");
  force(15);
  await tool("kraken_combat", { action: "save", id: ilse.id, attribute: "dexterity", cl: 10 });
  assert(/^1d20/.test(last(/^\[SAVE\]/).roll.formula), "Dread leaves Dexterity alone");
  force(15, 4);
  await tool("kraken_siege_check", { id: ilseId, kind: "skill", skill: "Insight" });
  roll = last(/Insight/).roll;
  assert(/^2d20kl1/.test(roll.formula) && /DREAD/.test(roll.label), `Dread 3: Insight (Wisdom) at disadvantage: ${roll.formula}`);
  force(15, 4);
  await tool("kraken_siege_check", { id: ilseId, kind: "check", attribute: "wisdom" });
  assert(/^2d20kl1/.test(last(/\[CHECK\] Wisdom/).roll.formula), "Dread 3: a Wisdom check at disadvantage");
  await tool("kraken_combat", { action: "effect-remove", id: ilse.id, effectId: (await view()).find((entry) => entry.id === ilse.id).effects.find((effect) => /Blessed/.test(effect.label)).id });

  // 9 and 4: Ilse at 0 Health is dying; no death saves; steadying by a shaken ally is at disadvantage.
  const helper = await tool("kraken_build_character", { owner: "Bob", spec: { name: "Tomas", species: "Human", class: "Cleric", level: 1, scores: { strength: 12, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 17, charisma: 13 } } });
  await tool("kraken_character_edit", { id: helper.id, changes: [{ path: "dread", value: 4 }] });
  await tool("kraken_combat", { action: "damage", id: ilse.id, amount: agent.records.get(ilseId).data.hp.total });
  assert((await view()).find((entry) => entry.id === ilse.id).health.status === "Dying", "Ilse at 0 is dying");
  const noSave = await refused("kraken_combat", { action: "death-save", id: ilse.id });
  assert(noSave && /does not use death saves/.test(noSave), `no death saves in Descending Darkness: ${noSave}`);
  force(18, 6);
  const steady = (await tool("kraken_combat", { action: "stabilize", id: ilse.id, helperId: helper.id, recordId: helper.id })).stabilize ?? null;
  roll = last(/steadying Ilse/).roll;
  assert(/^2d20kl1/.test(roll.formula) && /DREAD/.test(roll.label), `a shaken ally steadies at disadvantage: ${roll.formula} ${roll.label} ${JSON.stringify(steady)}`);
  done.push("4 Dread on Wisdom checks, saves, skills and steadying", "9 no death saves in Descending Darkness");

  // 2. A player's raw changes: pictures and notes yes, the sheet's numbers no.
  player = await connect(dd.port, "Ann");
  let result = await op(player, { op: "update", id: ilseId, patch: { data: { hp: { total: 99 } } } });
  assert(!result.ok && agent.records.get(ilseId).data.hp.total !== 99, `a player cannot set their own Health: ${JSON.stringify(result)}`);
  result = await op(player, { op: "update", id: ilseId, replace: true, patch: { data: { ...agent.records.get(ilseId).data, ac: { total: 30 } } } });
  assert(!result.ok, "a player cannot replace their character");
  result = await op(player, { op: "update", id: ilseId, patch: { data: { portrait: "kraken-games/portraits/test.webp" } } });
  assert(result.ok && agent.records.get(ilseId).data.portrait === "kraken-games/portraits/test.webp", `a player can choose their portrait: ${JSON.stringify(result)}`);
  result = await op(player, { op: "create", input: { type: "character", name: "Cheat", data: { hp: { total: 99 }, level: 9 } } });
  assert(result.ok && agent.records.get(result.id).data.hp.total === 0 && agent.records.get(result.id).data.level === 0, "a player's new character starts blank");
  result = await op(player, { op: "create", input: { type: "npc", name: "Pet dragon", data: {} } });
  assert(!result.ok, "a player cannot make an NPC");
  result = await op(player, { op: "create", input: { type: "note", name: "My note", data: { text: "hello" } } });
  const noteId = result.id;
  result = await op(player, { op: "update", id: noteId, patch: { data: { text: "changed" } } });
  assert(result.ok && agent.records.get(noteId).data.text === "changed", "a player's notes are their own");
  result = await tool("kraken_character_edit", { id: ilseId, changes: [{ path: "exp", value: 50 }] });
  assert(agent.records.get(ilseId).data.exp === 50, "the GM (and the sheet's edits) still change the character");
  done.push("2 player record changes limited");
} finally {
  player?.close();
  await dd.server.close?.();
}

// 8. 0 maximum Health.
assert(healthStatus(0, 0).status === "Healthy" && healthStatus(0, 1).status === "Dead", "0 max Health: untouched is Healthy, wounded is Dead");
done.push("8 0 max Health with wounds is Dead");

// 10. Apeira Astra initiative.
const astraBase = (skills) => derive({ characteristics: { brawn: { score: 7 }, reflex: { score: 9 }, grit: { score: 7 }, intellect: { score: 7 }, training: { score: 7 }, presence: { score: 7 } }, skills, inventorylist: {} });
const without = astraBase({});
const zero = astraBase({ tactics: { level: 0 } });
const two = astraBase({ tactics: { level: 2 } });
const dm = without.characteristics.reflex.dm;
assert(without.initiative.total === dm - 3 && zero.initiative.total === dm && two.initiative.total === dm + 2, `initiative: no Tactics -3, Tactics 0 +0, Tactics 2 +2: ${without.initiative.total}, ${zero.initiative.total}, ${two.initiative.total} (Reflex ${dm})`);
done.push("10 Astra initiative untrained -3");

// --- Apeira Astra: Down ---------------------------------------------------
const aa = await table("Apeira Astra", ["Apeira Astra Crew Handbook", "Apeira Astra Threat Dossier"]);
try {
  const { tool, refused, agent, view } = aa;
  const built = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Rook", origin: "Spacer", major: "Marine", majorSkills: ["Firearms", "Melee", "Athletics", "Zero-G"], minor: "Engineer", minorSkills: ["Mechanics", "Engineering"], gear: [["Carbine", 1]] } });
  const rookData = agent.records.get(built.id).data;
  const weapon = Object.keys(rookData.attacks ?? {})[0];
  const threat = agent.records.list({ type: "npc" })[0];
  await tool("kraken_combat", { action: "add", recordId: built.id });
  await tool("kraken_combat", { action: "add", recordId: threat.id });
  let entries = await view();
  const rook = entries.find((entry) => entry.name === "Rook");
  const foe = entries.find((entry) => entry.id !== rook.id);
  await tool("kraken_combat", { action: "update", id: rook.id, patch: { initresult: 12 } });
  await tool("kraken_combat", { action: "update", id: foe.id, patch: { initresult: 6 } });
  await tool("kraken_combat", { action: "target", id: rook.id, targetId: foe.id, on: true });
  await tool("kraken_combat", { action: "damage", id: rook.id, amount: rookData.hp.total });
  entries = await view();
  assert(entries.find((entry) => entry.id === rook.id).health.status === "Down", "Rook at 0 Stamina is Down");
  if (weapon) {
    const no = await refused("kraken_combat", { action: "attack", recordId: built.id, weapon });
    assert(no && /down/i.test(no), `Down cannot attack: ${no}`);
  }
  await tool("kraken_combat", { action: "next" });
  await tool("kraken_combat", { action: "next" });
  const active = (await tool("kraken_combat", { action: "view" })).active;
  assert(active === foe.id, `Down loses their turn: the active entry is ${active}`);
  await tool("kraken_combat", { action: "heal", id: rook.id, amount: 3 });
  entries = await view();
  assert(entries.find((entry) => entry.id === rook.id).health.status !== "Down", "healed, Rook is back in the fight");
  done.push(`3 Astra Down skips turns${weapon ? " and cannot attack" : ""}`);
} finally {
  await aa.server.close?.();
}

console.log(`ok audit: ${done.join("; ")}`);
process.exit(0);
