// The GM's map editor, walls (FG's line-of-sight layer with Foundry's
// senses), on a live table with a test player: walls drawn as chains block a
// player's sight and movement; each kind does what FG says (an ethereal wall
// blocks sight only, an invisible one movement only, a window sight through
// but no walking, a shadow caster light only); one-way walls; a window the
// player opens; a toggled-off wall blocks nothing; split, close all doors,
// remove, undo; walls never reach a player.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// An empty room, 600 x 300, 50 px squares.
const scene = { id: "room", name: "Room", width: 600, height: 300, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, lights: [], tokens: [], walls: [] };

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
        if (ok) resolve({ ws, inbox });
        else reject(new Error("join timed out"));
      }
    }, 10);
  });
}

const server = createTableServer();
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  const player = await connect(info.port, { name: "Tester", password: "" });
  sockets.push(dm.ws, player.ws);
  dm.ws.send(JSON.stringify({ type: "scene", scene }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const map = server.agent.map;
  const seat = server.agent.seat;
  const hero = map.place({ name: "Hero", x: 75, y: 125, owner: "Tester" }, seat);
  map.update(hero.id, { owner: "Tester" }, seat);
  const orc = map.place({ name: "Orc", x: 475, y: 125 }, seat);
  const playerSeat = { role: "player", name: "Tester" };
  const sees = (token) => map.viewFor(playerSeat, "").tokens.some((item) => item.id === token.id);

  // No walls: the hero sees the orc. A chain of walls across the room, then a wall in its way.
  assert(sees(orc), "no walls: seen");
  const chain = await tool("kraken_wall", { action: "add", points: [300, 0, 300, 150, 300, 300] });
  assert(chain.added === 2, `a chain of two segments: ${chain.added}`);
  await tool("kraken_line_of_sight", { on: true });
  assert(!sees(orc), "a drawn wall blocks sight");
  const moved = map.move(hero.id, { x: 475, y: 125 }, playerSeat);
  assert(moved.blocked && moved.token.x < 300, `a drawn wall blocks movement: ${moved.token.x}`);
  map.move(hero.id, { x: 75, y: 125 }, seat);

  // The kinds: ethereal blocks sight only; invisible movement only; a window sight through, no walking.
  await tool("kraken_wall", { action: "update", ids: chain.ids, kind: "ethereal" });
  assert(!sees(orc), "ethereal blocks sight");
  assert(!map.move(hero.id, { x: 475, y: 125 }, playerSeat).blocked, "ethereal: walk through");
  map.move(hero.id, { x: 75, y: 125 }, seat);
  await tool("kraken_wall", { action: "update", ids: chain.ids, kind: "invisible" });
  assert(sees(orc), "invisible: seen through");
  assert(map.move(hero.id, { x: 475, y: 125 }, playerSeat).blocked, "invisible blocks movement");
  map.move(hero.id, { x: 75, y: 125 }, seat);
  await tool("kraken_wall", { action: "update", ids: chain.ids, kind: "window" });
  assert(sees(orc), "a window: seen through");
  assert(map.move(hero.id, { x: 475, y: 125 }, playerSeat).blocked, "a window blocks movement");
  map.move(hero.id, { x: 75, y: 125 }, seat);
  // The player opens the window (FG: players may toggle windows), then walks through.
  const windowDoor = map.viewFor(playerSeat, "").doors.find((door) => door.id === chain.ids[0]);
  assert(windowDoor, "the player sees the window's handle");
  map.setDoor(chain.ids[1], 1, playerSeat);
  map.setDoor(chain.ids[0], 1, playerSeat);
  assert(!map.move(hero.id, { x: 475, y: 125 }, playerSeat).blocked, "an open window lets them through");
  map.move(hero.id, { x: 75, y: 125 }, seat);
  await tool("kraken_wall", { action: "close_doors" });
  assert(map.move(hero.id, { x: 475, y: 125 }, playerSeat).blocked, "close all doors shuts the window");
  map.move(hero.id, { x: 75, y: 125 }, seat);

  // A toggle wall the GM switches: off, it blocks nothing; players cannot touch it.
  await tool("kraken_wall", { action: "update", ids: chain.ids, kind: "toggle" });
  assert(!sees(orc), "toggle wall on: blocks");
  let refused = "";
  try {
    map.setDoor(chain.ids[0], 1, playerSeat);
  } catch (error) {
    refused = error.message;
  }
  assert(refused, "a player cannot switch a GM toggle wall");
  await tool("kraken_wall", { action: "update", ids: chain.ids, hidden: true });
  assert(sees(orc), "a toggled-off wall blocks nothing");

  // One way: dir 1 blocks from one side only.
  await tool("kraken_wall", { action: "update", ids: chain.ids, kind: "wall", hidden: false, dir: 1 });
  const fromWest = sees(orc);
  map.move(hero.id, { x: 525, y: 125 }, seat);
  map.move(orc.id, { x: 75, y: 125 }, seat);
  const fromEast = sees(orc);
  assert(fromWest !== fromEast, `a one-way wall works from one side only (west ${fromWest}, east ${fromEast})`);
  map.move(hero.id, { x: 75, y: 125 }, seat);
  map.move(orc.id, { x: 475, y: 125 }, seat);
  await tool("kraken_wall", { action: "update", ids: chain.ids, dir: 0 });

  // A shadow caster stops a light's reach, not sight.
  await tool("kraken_wall", { action: "update", ids: chain.ids, kind: "shadow" });
  assert(sees(orc), "a shadow caster does not block sight");
  map.placeLight({ x: 100, y: 125, bright: 100, dim: 100 }, seat);
  const lights = map.viewFor(seat, "").lights;
  const light = lights.find((item) => !item.id.startsWith("token:"));
  const xs = light.polygon.filter((_, index) => index % 2 === 0);
  assert(Math.max(...xs) <= 301, `the light stops at the shadow caster: reaches x ${Math.max(...xs)}`);

  // Split, remove, undo; the player is never sent walls.
  const split = await tool("kraken_wall", { action: "split", id: chain.ids[0], x: 300, y: 75 });
  assert(split.walls.length === 2, "split in two");
  const listed = await tool("kraken_wall", { action: "list" });
  assert(listed.total === 3 && listed.byKind.shadow === 3, `three walls after the split: ${JSON.stringify(listed.byKind)}`);
  await tool("kraken_wall", { action: "remove", ids: listed.walls.map((wall) => wall.id) });
  assert((await tool("kraken_wall", { action: "list" })).total === 0, "removed");
  await tool("kraken_map_undo");
  assert((await tool("kraken_wall", { action: "list" })).total === 3, "undo brings them back");
  // From the table's own messages: the player's map has no walls; the GM's does.
  dm.ws.send(JSON.stringify({ type: "wall", action: "add", wall: { points: [0, 0, 50, 50], kind: "door" } }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const lastPlayer = [...player.inbox].reverse().find((m) => m.type === "map");
  const lastGM = [...dm.inbox].reverse().find((m) => m.type === "map");
  assert(!("walls" in lastPlayer) || lastPlayer.walls.length === 0, "the player is never sent walls");
  assert(lastGM.walls?.some((wall) => wall.kind === "door"), "the GM's map has the walls, the new door too");
  // The mask (FG's Mask tab): with the global mask on, nothing under it reaches the player.
  map.move(orc.id, { x: 475, y: 125 }, seat);
  assert(sees(orc), "no mask: seen");
  await tool("kraken_mask", { action: "on" });
  assert(!sees(orc), "under the global mask: not sent");
  assert(map.viewFor(playerSeat, "").tokens.some((item) => item.id === hero.id), "the player's own token still shows");
  await tool("kraken_mask", { action: "reveal", rect: { x: 400, y: 50, width: 150, height: 150 } });
  assert(sees(orc), "revealed: seen");
  await tool("kraken_mask", { action: "hide", cells: [[9, 2]] });
  assert(!sees(orc), "hidden again inside the reveal: not seen");
  await tool("kraken_map_undo");
  assert(sees(orc), "undo the hide");
  const masked = map.viewFor(playerSeat, "");
  assert(masked.mask?.on && masked.mask.shapes.length === 1, "the player gets the mask's shape to draw it");
  await tool("kraken_mask", { action: "off" });
  await tool("kraken_mask", { action: "on" });
  await tool("kraken_mask", { action: "clear" });
  assert(!sees(orc), "cleared shapes: all masked again");
  await tool("kraken_mask", { action: "off" });
  assert(sees(orc), "mask off");

  // Text, numbers and pins (FG's Text tab), in layer groups.
  const playerLabels = () => map.viewFor(playerSeat, "").labels.map((label) => label.text);
  await tool("kraken_label", { action: "add", x: 100, y: 50, text: "Throne Room" });
  await tool("kraken_label", { action: "add", x: 120, y: 60, text: "Secret stash", hidden: true });
  const one = await tool("kraken_label", { action: "number", x: 200, y: 200 });
  const two = await tool("kraken_label", { action: "number", x: 220, y: 200 });
  await tool("kraken_label", { action: "remove", id: two.id });
  const three = await tool("kraken_label", { action: "number", x: 240, y: 200 });
  assert([one.text, three.text].join() === "1,3", `numbers are not reused after a delete (FG): ${one.text}, ${three.text}`);
  await tool("kraken_label", { action: "renumber", group: "Numbers" });
  assert((await tool("kraken_label", { action: "list" })).labels.filter((label) => label.group === "Numbers").map((label) => label.text).join() === "1,2", "renumbered 1, 2");
  assert(playerLabels().includes("Throne Room") && !playerLabels().includes("Secret stash"), `hidden text is not sent: ${playerLabels().join(", ")}`);
  assert(playerLabels().includes("1"), "numbers reach players");
  // A group players may not see: everything in it is withheld; shown again, it comes back.
  await tool("kraken_map_group", { action: "update", name: "Numbers", players: false });
  assert(!playerLabels().includes("1"), "a GM-only group's text is not sent");
  await tool("kraken_map_group", { action: "update", name: "Numbers", players: true, prefix: "A" });
  await tool("kraken_label", { action: "renumber", group: "Numbers" });
  assert(playerLabels().includes("A1"), `a prefix: ${playerLabels().join(", ")}`);
  // Locked group: no changes.
  await tool("kraken_map_group", { action: "update", name: "Numbers", locked: true });
  let lockedRefusal = "";
  try {
    await tool("kraken_label", { action: "update", id: one.id, text: "Z" });
  } catch (error) {
    lockedRefusal = error.message;
  }
  assert(/locked/.test(lockedRefusal), `a locked group refuses edits: ${lockedRefusal}`);
  await tool("kraken_map_group", { action: "update", name: "Numbers", locked: false });
  // A pin linked to a record the player may not open keeps its place but loses the link.
  const secret = server.agent.records.create({ type: "note", name: "GM notes", visibility: "gm", data: {} }, seat);
  await tool("kraken_label", { action: "add", x: 300, y: 100, text: "Trap", icon: "trap", link: { kind: "record", id: secret.id } });
  const pin = map.viewFor(playerSeat, "").labels.find((label) => label.text === "Trap");
  assert(pin && pin.link === null && pin.icon === "trap", "a pin's GM-only link is not sent");
  // Under the mask: not sent.
  await tool("kraken_mask", { action: "on" });
  assert(!playerLabels().includes("Throne Room"), "text under the mask is not sent");
  await tool("kraken_mask", { action: "off" });
  await tool("kraken_map_undo");
  assert(map.mask().on && !playerLabels().includes("Throne Room"), "undo brings the mask back on, and the text is withheld again");
  await tool("kraken_mask", { action: "off" });

  // Saved with the campaign.
  const saved = server.agent.map.persisted();
  assert(saved.walls.room.length === 4, `walls are saved: ${saved.walls.room.length}`);
  console.log("ok walls: chains drawn; wall, ethereal, invisible, window (opened by the player, closed by Close all doors), toggle, one-way and shadow caster each as FG; split, remove, undo; the mask (global, reveal, hide again, undo) withholds what is under it; text, numbers (no reuse, renumber, prefix) and pins in layer groups (GM-only, locked); saved; never sent to players");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
