// Targeting, the FG way and better (docs/targeting-actions-design.md 4.2):
// target all friendlies / foes from the map toolbar, clear friends' or foes'
// targets, target mode's box, Ctrl+click on a tracker row (a target by entry),
// who may target with whom, the GM seeing everyone's targets, and a token's
// side kept the same as its tracker entry's.
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
  walls: [],
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

  // A party of two (one a test player's), three goblins, a neutral merchant; all on the map.
  const hero = agent.records.create({ type: "character", name: "Hagar", owner: "a test player", visibility: "owner", data: { hp: { total: 20, wounds: 0 }, ac: { total: 15 } } }, agent.seat);
  const cleric = agent.records.create({ type: "character", name: "Mira", owner: "", visibility: "all", data: { hp: { total: 16, wounds: 0 }, ac: { total: 16 } } }, agent.seat);
  const goblin = agent.records.create({ type: "npc", name: "Goblin", data: { hp: 7, ac: 13 } }, agent.seat);
  const merchant = agent.records.create({ type: "npc", name: "Merchant", data: { hp: 4, ac: 10 } }, agent.seat);
  const place = async (recordId, col, row) => tool("kraken_token_place", { recordId, col, row });
  await place(hero.id, 2, 2);
  await place(cleric.id, 3, 2);
  for (const col of [10, 11, 12]) await place(goblin.id, col, 4);
  await place(merchant.id, 16, 8);
  for (const token of agent.map.tokens()) await ct({ action: "add", entry: { recordId: token.recordId, tokenId: token.id, name: token.name, faction: token.recordId === goblin.id ? "foe" : token.recordId === merchant.id ? "neutral" : "friend" } });
  let view = await ct({ action: "view" });
  const named = (name) => view.entries.find((entry) => entry.name === name);
  const hagar = named("Hagar");
  const goblins = view.entries.filter((entry) => entry.name.startsWith("Goblin"));
  assert(goblins.length === 3, `three goblins on the tracker: ${view.entries.map((e) => e.name)}`);

  // Target all foes: the goblins, not the neutral merchant nor the party.
  let out = await ct({ action: "target-faction", id: hagar.id, faction: "foe" });
  assert(out.targeted.length === 3 && out.targeted.every((name) => name.startsWith("Goblin")), `foes are the goblins: ${out.targeted}`);
  // Target all friendlies too: the party (Hagar included) joins the goblins.
  out = await ct({ action: "target-faction", id: hagar.id, faction: "friend" });
  view = out.combat;
  assert(named("Hagar").targets.length === 5 && named("Hagar").targets.includes(hagar.id), `friends and foes: ${named("Hagar").targets.length}`);
  // Clear enemy targets: only the party stays.
  out = await ct({ action: "clear-targets", id: hagar.id, faction: "foe" });
  assert(out.targets.length === 2 && out.targets.includes(named("Mira").id), "clearing the foes keeps the friends");
  out = await ct({ action: "clear-targets", id: hagar.id, faction: "friend" });
  assert(out.targets.length === 0, "clearing the friends empties the list");
  // The dead are no one's target.
  await ct({ action: "damage", id: goblins[2].id, amount: 30 });
  out = await ct({ action: "target-faction", id: hagar.id, faction: "foe" });
  assert(out.targeted.length === 2, `the dead goblin is left out: ${out.targeted}`);
  await ct({ action: "clear-targets", id: hagar.id });

  // Target mode's box: a box around two goblins' squares (col 10-11, row 4: x 500-600, y 200-250).
  out = await ct({ action: "target-box", id: hagar.id, x1: 495, y1: 195, x2: 605, y2: 255 });
  assert(out.targeted.length === 2, `the box takes two goblins: ${out.targeted}`);
  out = await ct({ action: "target-box", id: hagar.id, x1: 795, y1: 395, x2: 860, y2: 460, add: true });
  assert(out.targeted.length === 1 && out.combat.entries.find((e) => e.id === hagar.id).targets.length === 3, "Shift adds the merchant");

  // A player targets with their own creature only; a row's Ctrl+click is a target by entry.
  const player = await connect(info.port, { name: "a test player", password: "" });
  sockets.push(player.ws);
  player.ws.send(JSON.stringify({ type: "ct", action: "clear-targets" }));
  player.ws.send(JSON.stringify({ type: "ct", action: "target", targetId: goblins[0].id }));
  let seen = await latest(player, "combat", (m) => m.combat?.entries?.find((e) => e.id === hagar.id)?.targets?.length === 1, "the player's target");
  assert(seen.combat.entries.find((e) => e.id === hagar.id).targets[0] === goblins[0].id, "a tracker row's Ctrl+click targets the goblin with the player's own Hagar");
  player.ws.send(JSON.stringify({ type: "ct", action: "target-faction", id: named("Mira").id, faction: "foe" }));
  seen = await latest(player, "combat", (m) => m.combat?.entries?.find((e) => e.id === hagar.id)?.targets?.length === 2, "a player's foes go to their own creature");
  assert(seen.combat.entries.find((e) => e.id === named("Mira").id).targets.length === 0, "a player cannot target with someone else's creature: the request falls to their own");
  // The GM is sent everyone's targets; the player only their own creature's.
  const gmView = await latest(dm, "combat", (m) => m.combat?.entries?.find((e) => e.id === hagar.id)?.targets?.length === 2, "the GM sees Hagar's targets");
  assert(gmView.combat.entries.find((e) => e.id === hagar.id).targets.length === 2, "the GM sees a player's targets");

  // Faction sync: the token menu's side reaches the tracker, and the tracker's the token.
  const merchantToken = agent.map.tokens().find((token) => token.recordId === merchant.id);
  await tool("kraken_token_update", { id: merchantToken.id, faction: "foe" });
  view = await ct({ action: "view" });
  assert(view.entries.find((e) => e.name === "Merchant").faction === "foe", "the token's new side reaches its tracker entry");
  await ct({ action: "update", id: view.entries.find((e) => e.name === "Merchant").id, patch: { faction: "friend" } });
  assert(agent.map.tokens().find((token) => token.id === merchantToken.id).faction === "friend", "the tracker's new side reaches the token");
  dm.ws.send(JSON.stringify({ type: "token-update", id: merchantToken.id, patch: { faction: "neutral" } }));
  await latest(dm, "combat", (m) => m.combat?.entries?.find((e) => e.name === "Merchant")?.faction === "neutral", "the GM's token menu reaches the tracker");
  assert(true, "token menu faction reached the tracker");

  console.log(`check-targeting: ${passed} checks passed`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
