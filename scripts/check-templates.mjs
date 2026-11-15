// Area spells (docs/targeting-actions-design.md 4.3): a template sized from the
// spell's area for the map's grid, placed where the caster points, targets
// every creature inside (any square it fills, walls stop it), and the spell
// lands by its words: Fireball's damage on everyone inside (friendly fire),
// half on a save; Sleep only on the caster's foes ("creatures of your
// choice"), ending when the sleeper takes damage; Bless only on allies, at most
// three; Burning Hands' cone from the caster; the template request a player's
// screen gets for an area spell cast with no targets; an instant spell's
// template gone at the next turn; kraken_template by hand.
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

// A 1000 x 600 field, 50 px squares of 5 feet; a wall down x = 700.
const scene = {
  id: "field",
  name: "Field",
  width: 1000,
  height: 600,
  padding: 0,
  backgroundColor: "#000",
  grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" },
  lights: [],
  tokens: [],
  walls: [{ id: "w1", x1: 700, y1: 0, x2: 700, y2: 600, sight: 20, move: 20, door: 0, ds: 0 }],
};

function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    ws.on("message", (data) => inbox.push(JSON.parse(data.toString())));
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
    const start = Date.now();
    const poll = setInterval(() => {
      const ok = inbox.find((m) => m.type === "ok");
      if (ok || Date.now() - start > 4000) {
        clearInterval(poll);
        if (ok) resolve({ ws, inbox, ok });
        else reject(new Error("join timed out"));
      }
    }, 10);
  });
}
async function latest(seat, type, test = () => true, label = type) {
  const start = Date.now();
  while (Date.now() - start < 3000) {
    const found = [...seat.inbox].reverse().find((m) => m.type === type);
    if (found && test(found)) return found;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`waiting for ${label}`);
}

const server = createTableServer({ ruleset: "D&D 5E" });
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const ct = (args) => tool("kraken_combat", args);
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  sockets.push(dm.ws);
  dm.ws.send(JSON.stringify({ type: "scene", scene }));
  await latest(dm, "map", (m) => m.sceneId === "field", "the map");
  await agent.combat.ready;

  // The SRD's own spell records (the book Kraken ships).
  for (const name of ["Fireball", "Sleep", "Bless", "Burning Hands"]) {
    const spell = SPELLS.find((item) => item.name === name);
    const { __category, ...data } = spell;
    agent.records.create({ type: "spell", name, data }, agent.seat);
  }
  const abilities = (save) => Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 14, bonus: 2, save }]));
  const caster = (name, owner, stat) => agent.records.create({ type: "character", name, owner, visibility: owner ? "owner" : "all", data: { level: 5, hp: { total: 40, wounds: 0 }, ac: { total: 12 }, abilities: abilities(2), spellcasting: { stat, dc: 14, attack: 6 }, slots: { l1: { max: 4, used: 0 }, l2: { max: 3, used: 0 }, l3: { max: 2, used: 0 } } } }, agent.seat);
  const hagar = caster("Hagar", "a test player", "intelligence");
  const mira = caster("Mira", "", "wisdom");
  const bran = agent.records.create({ type: "character", name: "Bran", owner: "", visibility: "all", data: { level: 3, hp: { total: 60, wounds: 0 }, ac: { total: 15 }, abilities: abilities(0) } }, agent.seat);
  const cora = agent.records.create({ type: "character", name: "Cora", owner: "", visibility: "all", data: { level: 3, hp: { total: 60, wounds: 0 }, ac: { total: 15 }, abilities: abilities(0) } }, agent.seat);
  const goblin = agent.records.create({ type: "npc", name: "Goblin", data: { hp: 40, ac: 13, abilities: { dexterity: { score: 14, bonus: 2 }, wisdom: { score: 8, bonus: -1 } } } }, agent.seat);
  const place = (recordId, col, row) => tool("kraken_token_place", { recordId, col, row });
  await place(hagar.id, 2, 2);
  await place(mira.id, 3, 2);
  await place(bran.id, 13, 6);
  for (const col of [10, 11, 12]) await place(goblin.id, col, 4);
  await place(goblin.id, 14, 4);
  for (const token of agent.map.tokens()) await ct({ action: "add", entry: { recordId: token.recordId, tokenId: token.id, name: token.name, faction: token.recordId === goblin.id ? "foe" : "friend" } });
  let view = await ct({ action: "view" });
  const entry = (name) => view.entries.find((item) => item.name === name);
  const goblins = () => view.entries.filter((item) => item.name.startsWith("Goblin")).sort((a, b) => a.name.localeCompare(b.name));
  const behindWall = agent.map.tokens().find((token) => token.recordId === goblin.id && token.x > 700);

  // Fireball at the third square across, fourth down: its centre snaps to the corner (600, 250), 20 feet = 200 px.
  let out = await ct({ action: "cast", recordId: hagar.id, power: "Fireball", template: { x: 575, y: 225 } });
  assert(out.template.shape === "circle" && out.template.x === 600 && out.template.y === 250 && out.template.size === 20, `Fireball's sphere: ${JSON.stringify(out.template)}`);
  view = out.combat;
  const hit = out.targets;
  assert(hit.includes("Bran") && goblins().filter((g) => g.tokenId !== behindWall.id).every((g) => hit.includes(g.name)), `everyone inside, Bran too (friendly fire): ${hit}`);
  assert(!hit.includes(view.entries.find((item) => item.tokenId === behindWall.id).name), "the goblin behind the wall is not reached");
  assert(!hit.includes("Hagar") && !hit.includes("Mira"), "the casters far away are not inside");
  const damaged = out.cast.filter((row) => row.damage !== undefined);
  assert(damaged.length === hit.length, `each target took its share: ${JSON.stringify(out.cast)}`);
  const full = Math.max(...damaged.map((row) => (row.half ? row.damage * 2 : row.damage)));
  assert(damaged.every((row) => (row.half ? row.damage === Math.floor(full / 2) || row.damage === Math.floor(full / 2) : row.damage === full)), `one roll, half on a save: ${JSON.stringify(damaged)}`);
  assert(agent.records.get(hagar.id).data.slots.l3.used === 1, "a level 3 slot spent");
  assert(agent.map.templates().length === 1 && agent.map.templates()[0].label === "Fireball (Hagar)", "the template is on the map, named");
  // The players see it too, in the caster's colour.
  const player = await connect(info.port, { name: "a test player", password: "" });
  sockets.push(player.ws);
  const seen = player.ok.map?.templates?.length === 1 ? player.ok.map : await latest(player, "map", (m) => m.templates?.length === 1, "the player sees the template");
  assert(/^#[0-9a-fA-F]{6}$/.test(seen.templates[0].color), "drawn in a colour");
  // An instant spell's template goes when the next turn starts.
  await ct({ action: "next" });
  assert(agent.map.templates().length === 0, "Fireball's template is gone at the next turn");
  await ct({ action: "end" });

  // Sleep (5-foot-radius sphere, creatures of the caster's choice): Cora stands among two goblins and is spared.
  await ct({ action: "heal", id: entry("Bran").id, amount: 100 });
  for (const g of goblins()) await ct({ action: "heal", id: g.id, amount: 100 });
  await place(cora.id, 11, 3);
  await ct({ action: "add", entry: { recordId: cora.id, tokenId: agent.map.tokens().find((token) => token.recordId === cora.id).id, name: "Cora", faction: "friend" } });
  view = await ct({ action: "view" });
  agent.dice.force([1, 1, 1]);
  out = await ct({ action: "cast", recordId: hagar.id, power: "Sleep", template: { x: 550, y: 200 } });
  view = out.combat;
  assert(out.targets.includes("Cora") && out.targets.length === 3, `the sphere takes Cora and two goblins: ${out.targets}`);
  const asleep = view.entries.filter((item) => item.effects.some((effect) => /^Sleep/.test(effect.label)));
  assert(asleep.length === 2 && asleep.every((item) => item.name.startsWith("Goblin")), `only the goblins sleep: ${asleep.map((item) => item.name)}`);
  assert(agent.chatLog(40).some((line) => /Sleep: not on Cora \(an ally\)/.test(line.text ?? "")), "chat says Cora was spared");
  // Damage wakes a sleeper.
  const sleeper = asleep[0];
  await ct({ action: "damage", id: sleeper.id, amount: 1 });
  view = await ct({ action: "view" });
  assert(!view.entries.find((item) => item.id === sleeper.id).effects.some((effect) => /^Sleep/.test(effect.label)), "damage ends Sleep");
  assert(agent.chatLog(10).some((line) => /takes damage: Sleep ends/.test(line.text ?? "")), "the waking is in chat");
  // The sleeper's token shows the Zzz (the effects' visuals in the map view).
  const sleepToken = agent.map.viewFor({ role: "dm", name: "GM" }, "").tokens.find((token) => token.id === asleep[1].tokenId);
  assert(sleepToken.effects?.fx.includes("zzz"), `the other goblin's token shows Zzz: ${JSON.stringify(sleepToken.effects)}`);
  await tool("kraken_template", { action: "clear" });

  // Bless, picked by hand: Hagar, Mira, Cora and a goblin; the goblin is no ally, and three is the most.
  await ct({ action: "clear-targets", id: entry("Mira").id });
  for (const name of ["Hagar", "Mira", "Cora", goblins()[0].name]) await ct({ action: "target", id: entry("Mira").id, targetId: entry(name).id });
  out = await ct({ action: "cast", recordId: mira.id, power: "Bless" });
  view = out.combat;
  const blessed = view.entries.filter((item) => item.effects.some((effect) => /^Bless/.test(effect.label))).map((item) => item.name);
  assert(blessed.length === 3 && !blessed.some((name) => name.startsWith("Goblin")), `Bless on the three allies only: ${blessed}`);
  const blessToken = agent.map.viewFor({ role: "dm", name: "GM" }, "").tokens.find((token) => token.recordId === hagar.id);
  assert(blessToken.effects?.fx.includes("glow-good") && blessToken.effects.badges.some((badge) => badge.icon === "buff"), `Hagar's token glows with a buff badge: ${JSON.stringify(blessToken.effects)}`);

  // Burning Hands, a 15-foot cone pointing east from Hagar: Mira beside him is caught.
  await ct({ action: "clear-targets", id: entry("Hagar").id });
  out = await ct({ action: "cast", recordId: hagar.id, power: "Burning Hands", template: { angle: 0 } });
  assert(out.template.shape === "cone" && out.template.size === 15 && out.template.x === 150 && out.template.y === 125, `the cone starts at Hagar's edge: ${JSON.stringify(out.template)}`);
  assert(out.targets.length === 1 && out.targets[0] === "Mira", `Mira is in the cone: ${out.targets}`);

  // A player's screen casting an area spell with no targets is asked to place its template.
  await ct({ action: "clear-targets", id: entry("Hagar").id });
  player.ws.send(JSON.stringify({ type: "ct", action: "cast", recordId: hagar.id, power: "Fireball", place: true }));
  const ask = await latest(player, "template-request", () => true, "the template request").catch((error) => { console.log(player.inbox.filter((m) => m.type === "error").slice(-3)); throw error; });
  assert(ask.area.shape === "circle" && ask.area.size === 20 && ask.casterTokenId && ask.name === "Fireball", `asked for a 20-foot sphere: ${JSON.stringify(ask)}`);
  player.ws.send(JSON.stringify({ type: "ct", action: "cast", recordId: hagar.id, power: "Fireball", template: { x: 575, y: 225 } }));
  await latest(player, "map", (m) => m.templates?.some((t) => t.label === "Fireball (Hagar)"), "the player's Fireball on the map");
  assert(true, "the player placed it");

  // kraken_template by hand: a 10-foot circle targets the creatures in it for Mira.
  await tool("kraken_template", { action: "clear" });
  out = await tool("kraken_template", { action: "place", template: { shape: "circle", x: 550, y: 250, size: 10 }, target: true, id: entry("Mira").id });
  assert(out.inside.length >= 2 && out.templates.length === 1, `the circle's creatures: ${out.inside}`);
  out = await tool("kraken_template", { action: "remove", id: out.template.id });
  assert(out.templates.length === 0, "removed");

  console.log(`check-templates: ${passed} checks passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
