// Effects as the Effects list puts them on (docs/targeting-actions-design.md 4.6),
// and the user's torch: "I light a torch!" says Hagar; the GM drops Torch on
// Hagar's token; the light is centred on him and moves with him, every player
// sees it as glow (line of sight and all), it burns an hour of game time (the
// calendar moving on), warns near the end and goes dark; it can be put out and
// lit again. Also: a torch carried into the fight moves onto the tracker and
// counts rounds there (and back with Back); leaving the tracker keeps it on the
// token; what players may put on (the GM's option), an invisible creature kept
// off other players' maps, and the GM's own effects in the list.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

// A dark room with a wall down x = 500; 50 px squares of 5 feet.
const scene = {
  id: "crypt",
  name: "Crypt",
  width: 1000,
  height: 600,
  padding: 0,
  backgroundColor: "#000",
  darkness: 1,
  grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" },
  lights: [],
  tokens: [],
  walls: [{ id: "w1", x1: 500, y1: 0, x2: 500, y2: 600, sight: 20, move: 20, light: 20, door: 0, ds: 0 }],
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
  const fx = (args) => tool("kraken_effects", args);
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  sockets.push(dm.ws);
  dm.ws.send(JSON.stringify({ type: "scene", scene }));
  await latest(dm, "map", (m) => m.sceneId === "crypt", "the map");
  await tool("kraken_scene_settings", { darkness: 1 }).catch(() => undefined);
  await agent.map.ready;

  const hagar = agent.records.create({ type: "character", name: "Hagar", owner: "a test player", visibility: "owner", data: { hp: { total: 20, wounds: 0 }, ac: { total: 15 } } }, agent.seat);
  const vex = agent.records.create({ type: "character", name: "Vex", owner: "another player", visibility: "owner", data: { hp: { total: 20, wounds: 0 }, ac: { total: 15 } } }, agent.seat);
  const goblin = agent.records.create({ type: "npc", name: "Goblin", data: { hp: 7, ac: 13 } }, agent.seat);
  await tool("kraken_token_place", { recordId: hagar.id, col: 2, row: 5 });
  await tool("kraken_token_place", { recordId: vex.id, col: 4, row: 5 });
  await tool("kraken_token_place", { recordId: goblin.id, col: 14, row: 5 });
  const tokenOf = (record) => agent.map.tokens().find((token) => token.recordId === record.id);

  // The list: this game's conditions, buffs and lights; a torch burns an hour.
  const list = (await fx({ action: "list" })).effects;
  const torch = list.find((item) => item.id === "torch");
  assert(torch && torch.kind === "light" && torch.burn === 60 && list.some((item) => item.id === "prone") && list.some((item) => item.id === "bless"), "5E lists conditions, buffs and a torch of an hour");

  // The GM drops Torch on Hagar's token: an hour of 6-second rounds.
  let out = await fx({ action: "apply", to: { tokenId: tokenOf(hagar).id }, preset: "torch" });
  assert(out.effect.duration === 600 && out.effect.total === 600, `an hour is 600 rounds: ${JSON.stringify(out.effect)}`);
  const torchId = out.effect.id;
  const gmLights = () => agent.map.viewFor({ role: "dm", name: "GM" }, "").lights.filter((light) => light.id.startsWith("fx:"));
  let light = gmLights()[0];
  assert(light && light.x === tokenOf(hagar).x && light.y === tokenOf(hagar).y && light.brightPx === 200 && light.dimPx === 400 && light.animation === "torch", `the torch's light on Hagar, 20/40 feet, flickering: ${JSON.stringify(light && { ...light, polygon: undefined })}`);
  assert(light.polygon.every((value, index) => index % 2 === 1 || value <= 501), "the wall stops the light (its outline stays this side of x = 500)");
  assert(agent.map.viewFor({ role: "dm", name: "GM" }, "").tokens.find((token) => token.recordId === hagar.id).effects.fx.includes("light"), "the token shows it carries a light");
  // It moves with him.
  await tool("kraken_token_move", { id: tokenOf(hagar).id, col: 3, row: 2 });
  light = gmLights()[0];
  assert(light.x === tokenOf(hagar).x && light.y === tokenOf(hagar).y, "the light moves with the token");
  // Every player sees it as glow: Vex's player (dark room) gets the light, not its settings.
  const vexSeat = agent.map.viewFor({ role: "player", name: "another player" }, "");
  assert(vexSeat.lights.some((item) => item.id.startsWith("fx:")) && vexSeat.sceneLights.length === 0, "another player sees the torch's glow");

  // Game time: 54 minutes on, it warns (6 minutes left); 7 more, it burns out.
  await tool("kraken_calendar", { action: "advance", minutes: 54 });
  let effects = (await fx({ action: "on", to: { tokenId: tokenOf(hagar).id } })).effects;
  assert(effects[0].duration === 60, `six minutes left: ${effects[0].duration} rounds`);
  assert(agent.chatLog(10).some((line) => /Torch is nearly out: Hagar's light has about 6 minutes left/.test(line.text ?? "")), "the warning is in chat");
  // Put out and lit again: no light while out, the time kept.
  await fx({ action: "snuff", to: { tokenId: tokenOf(hagar).id }, effectId: torchId });
  assert(gmLights().length === 0, "put out: no light");
  await tool("kraken_calendar", { action: "advance", minutes: 30 });
  effects = (await fx({ action: "on", to: { tokenId: tokenOf(hagar).id } })).effects;
  assert(effects[0].duration === 60, "a torch put out does not burn");
  await fx({ action: "relight", to: { tokenId: tokenOf(hagar).id }, effectId: torchId });
  assert(gmLights().length === 1, "lit again");
  await tool("kraken_calendar", { action: "advance", minutes: 7 });
  effects = (await fx({ action: "on", to: { tokenId: tokenOf(hagar).id } })).effects;
  assert(effects.length === 0 && gmLights().length === 0, "burnt out: gone, and the light with it");
  assert(agent.chatLog(10).some((line) => /Torch burns out: Hagar's light goes dark/.test(line.text ?? "")), "burning out is in chat");

  // A torch carried into the fight: it moves onto his entry and counts rounds there.
  out = await fx({ action: "apply", to: { tokenId: tokenOf(hagar).id }, preset: "torch" });
  await tool("kraken_combat", { action: "add", entry: { recordId: hagar.id, tokenId: tokenOf(hagar).id, name: "Hagar", faction: "friend" } });
  await tool("kraken_combat", { action: "add", entry: { recordId: goblin.id, tokenId: tokenOf(goblin).id, name: "Goblin", faction: "foe" } });
  let view = await tool("kraken_combat", { action: "view" });
  const hagarEntry = view.entries.find((entry) => entry.name === "Hagar");
  assert(hagarEntry.effects.some((effect) => /^Torch/.test(effect.label)) && !agent.map.tokens().find((token) => token.id === tokenOf(hagar).id).effects, "the torch moved onto the tracker");
  assert(gmLights().length === 1, "and still lights the map");
  for (let step = 0; step < 6; step += 1) view = await tool("kraken_combat", { action: "next" });
  const left = view.entries.find((entry) => entry.name === "Hagar").effects[0].duration;
  assert(left <= 598 && left >= 597, `rounds count down in the fight: ${left}`);
  view = await tool("kraken_combat", { action: "prev" });
  assert(view.entries.find((entry) => entry.name === "Hagar").effects[0].duration >= left, "Back gives a round back");
  // Leaving the tracker: the torch stays on his token.
  await tool("kraken_combat", { action: "remove", id: hagarEntry.id });
  assert(agent.map.tokens().find((token) => token.id === tokenOf(hagar).id).effects?.some((effect) => /^Torch/.test(effect.label)), "out of the fight, the torch is on the token again");

  // Players: their own character only, and what the GM allows (default: lights and conditions).
  const player = await connect(info.port, { name: "a test player", password: "" });
  sockets.push(player.ws);
  player.ws.send(JSON.stringify({ type: "effects", action: "apply", to: { tokenId: tokenOf(hagar).id }, preset: "prone" }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  effects = (await fx({ action: "on", to: { tokenId: tokenOf(hagar).id } })).effects;
  assert(effects.some((effect) => effect.label === "Prone"), "a player puts a condition on their own character");
  player.ws.send(JSON.stringify({ type: "effects", action: "apply", to: { tokenId: tokenOf(hagar).id }, preset: "bless" }));
  await latest(player, "error", (m) => /lights and conditions only/.test(m.reason), "a buff refused");
  player.ws.send(JSON.stringify({ type: "effects", action: "apply", to: { tokenId: tokenOf(goblin).id }, preset: "prone" }));
  await latest(player, "error", (m) => /only on your own character/.test(m.reason), "another's creature refused");
  assert(true, "players are held to their own and the GM's option");
  await tool("kraken_table_options", { playerEffects: "all" }).catch(async () => server.agent.setOptions?.({ playerEffects: "all" }));

  // Invisible: Hagar's owner and the GM see him (a shimmer); the other player is not sent his token.
  await fx({ action: "apply", to: { tokenId: tokenOf(hagar).id }, preset: "invisible" });
  assert(!agent.map.viewFor({ role: "player", name: "another player" }, "").tokens.some((token) => token.recordId === hagar.id), "another player is not sent an invisible creature");
  const own = agent.map.viewFor({ role: "player", name: "a test player" }, "").tokens.find((token) => token.recordId === hagar.id);
  assert(own && own.effects.fx.includes("shimmer"), "its owner sees it shimmer");

  // The GM's own effects: saved in the campaign, in the list, put on, deleted.
  const saved = (await fx({ action: "save", effect: { label: "Hunter's Mark; DMG: 1d6", kind: "debuff", duration: 600, text: "1d6 more damage from the hunter." } })).saved;
  const mine = (await fx({ action: "list" })).effects.find((item) => item.id === `custom:${saved.id}`);
  assert(mine && mine.custom && mine.label === "Hunter's Mark; DMG: 1d6", "the GM's effect is in the list");
  out = await fx({ action: "apply", to: { tokenId: tokenOf(goblin).id }, preset: `custom:${saved.id}` });
  assert(out.effect.label === "Hunter's Mark; DMG: 1d6" && out.effect.duration === 600, "and goes on like any other");
  await fx({ action: "delete", id: saved.id });
  assert(!(await fx({ action: "list" })).effects.some((item) => item.id === `custom:${saved.id}`), "deleted from the list");

  console.log(`check-effects: ${passed} checks passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
