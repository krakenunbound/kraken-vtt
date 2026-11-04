// The map rules: grid snapping and distance (shared/map/geometry.mjs), then a
// live table server with a walled scene: players see only what their tokens
// see, walls and closed doors stop their tokens, players open doors but not
// locked or secret ones, the GM is not stopped, and the agent's map tools
// drive the same rules.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import * as geometry from "../shared/map/geometry.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { createArtLibrary, defaultRoots } = require("../electron/artLibrary.cjs");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

// A stand-in FG data folder: one portrait, one campaign token.
const fgData = mkdtempSync(path.join(tmpdir(), "kraken-art-"));
mkdirSync(path.join(fgData, "portraits"));
mkdirSync(path.join(fgData, "campaigns", "Keep", "tokens"), { recursive: true });
writeFileSync(path.join(fgData, "portraits", "Ann Fighter.png"), Buffer.from("portrait-bytes"));
writeFileSync(path.join(fgData, "campaigns", "Keep", "tokens", "Orc.webp"), Buffer.from("token-bytes"));
writeFileSync(path.join(fgData, "secret.txt"), "not art");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- geometry ---------------------------------------------------------------
const plain = { width: 500, height: 300, padding: 0, grid: { size: 50, distance: 5 } };
{
  const one = geometry.snapCenter(plain, 61, 140, 1);
  assert(one.x === 75 && one.y === 125, `1-square snap ${JSON.stringify(one)}`);
  const two = geometry.snapCenter(plain, 61, 140, 2);
  assert(two.x === 50 && two.y === 150, `2-square snap lands on a grid corner ${JSON.stringify(two)}`);
  const padded = { width: 1000, height: 1000, padding: 0.25, grid: { size: 70, distance: 5 } };
  // Padding rounds up to whole squares: ceil(0.25 * 1000 / 70) * 70 = 280.
  const inPadding = geometry.snapCenter(padded, 300, 300, 1);
  assert(inPadding.x === 315 && inPadding.y === 315, `snap follows the padded origin ${JSON.stringify(inPadding)}`);
  // FG HRDD default here is a multiplier of 1: three diagonal squares are 15 ft.
  assert(geometry.gridDistance(plain, { x: 75, y: 75 }, { x: 225, y: 225 }, 1) === 15, "diagonal x1");
  assert(geometry.gridDistance(plain, { x: 75, y: 75 }, { x: 225, y: 225 }, 1.5) === 20, "diagonal 5-10-5");
  assert(geometry.gridDistance(plain, { x: 75, y: 75 }, { x: 275, y: 75 }, 1) === 20, "straight line");
  // FG calcTokenSpace: quarter squares, never under a quarter.
  assert(geometry.tokenSquares(10) === 2 && geometry.tokenSquares(2.5) === 0.5 && geometry.tokenSquares(1) === 0.25 && geometry.tokenSquares(undefined) === 1, "token space");
  const health = geometry.healthStatus(10, 12);
  assert(health.status === "Unconscious", `0 to -6 is unconscious: ${health.status}`);
  assert(geometry.healthStatus(10, 18).status === "Dying" && geometry.healthStatus(10, 20).status === "Dead", "dying at -7, dead at -10");
  assert(geometry.healthStatus(10, 0).color === "#00C000" && geometry.healthStatus(10, 2).status === "Wounded", "healthy and wounded");
}
console.log("ok geometry");

// --- a walled scene ----------------------------------------------------------
// A wall down x = 250 with a door at y 100-150; a secret door in a wall at x = 400.
const scene = {
  id: "keep",
  name: "Keep",
  width: 500,
  height: 300,
  padding: 0,
  backgroundColor: "#000",
  grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" },
  lights: [],
  tokens: [{ id: "orc", name: "Orc", x: 350, y: 100, width: 50, height: 50, disposition: -1, hidden: false }],
  walls: [
    { id: "w1", x1: 250, y1: 0, x2: 250, y2: 100, sight: 20, move: 20, door: 0, ds: 0 },
    { id: "door", x1: 250, y1: 100, x2: 250, y2: 150, sight: 20, move: 20, door: 1, ds: 0 },
    { id: "w2", x1: 250, y1: 150, x2: 250, y2: 300, sight: 20, move: 20, door: 0, ds: 0 },
    { id: "w3", x1: 400, y1: 50, x2: 400, y2: 300, sight: 20, move: 20, door: 0, ds: 0 },
    { id: "secret", x1: 400, y1: 0, x2: 400, y2: 50, sight: 20, move: 20, door: 2, ds: 0 },
  ],
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

const server = createTableServer({ art: createArtLibrary({ base: fgData, roots: defaultRoots(fgData) }) });
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  const ann = await connect(info.port, { name: "Ann", password: "" });
  sockets.push(dm.ws, ann.ws);
  dm.ws.send(JSON.stringify({ type: "scene", scene }));
  await latest(ann, "map", (m) => m.sceneId === "keep", "Ann's first map");

  // Ann has no token yet: she sees the whole map, as in FG.
  let view = await latest(ann, "map", (m) => m.sceneId === "keep");
  assert(view.vision === null && view.tokens.some((t) => t.name === "Orc"), "no token of her own: Ann sees the map");
  assert(!view.doors.some((d) => d.id === "secret"), "players never see secret doors");

  const annRecord = server.agent.records.create({ type: "character", name: "Ann's Fighter", owner: "Ann", visibility: "owner", data: {} }, server.agent.seat);
  const placed = await tool("kraken_token_place", { recordId: annRecord.id, col: 1, row: 2 });
  assert(placed.col === 1 && placed.row === 2 && placed.owner === "Ann", `agent placed Ann's token ${JSON.stringify(placed)}`);
  const again = await tool("kraken_token_place", { recordId: annRecord.id });
  assert(again.id === placed.id, "a character gets one token per scene");

  const map = await tool("kraken_map", {});
  assert(map.sight === true && map.tokens.length === 2 && map.doors.length === 2, `kraken_map ${JSON.stringify(map)}`);

  // Line of sight: the wall hides the orc; the closed door in it is shown.
  view = await latest(ann, "map", (m) => Array.isArray(m.vision) && m.vision.length === 1, "Ann's view through her token");
  assert(!view.tokens.some((t) => t.name === "Orc"), "the orc behind the wall is not sent to Ann");
  assert(view.doors.some((d) => d.id === "door" && d.state === 0), "Ann sees the closed door in the wall");

  // Walls stop her: dragging through the closed door ends on the last square before it.
  ann.ws.send(JSON.stringify({ type: "token-move", id: placed.id, x: 375, y: 125 }));
  await latest(ann, "notice", (m) => m.text.includes("wall"), "wall notice");
  let token = server.snapshot().tokens.find((t) => t.id === placed.id);
  assert(token.x === 225 && token.y === 125, `stopped before the door at ${token.x},${token.y}`);

  // She opens the door: the orc comes into view, and she can walk through.
  ann.ws.send(JSON.stringify({ type: "door", id: "door" }));
  view = await latest(ann, "map", (m) => m.tokens.some((t) => t.name === "Orc"), "orc seen through the open door");
  assert(view.doors.find((d) => d.id === "door").state === 1, "door shows open");
  ann.ws.send(JSON.stringify({ type: "token-move", id: placed.id, x: 325, y: 125 }));
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === placed.id && t.x === 325), "walked through");

  // Players cannot lock doors, open a locked one, or use a secret door.
  ann.ws.send(JSON.stringify({ type: "door", id: "door", state: 2 }));
  assert((await latest(ann, "error", (m) => m.reason.includes("lock"))).reason, "player cannot lock");
  ann.ws.send(JSON.stringify({ type: "door", id: "secret" }));
  await latest(ann, "error", (m) => m.reason.includes("cannot see a door"), "secret door refused");
  await tool("kraken_door", { id: "door", state: "closed" });
  await tool("kraken_door", { id: "door", state: "locked" });
  ann.ws.send(JSON.stringify({ type: "door", id: "door" }));
  await latest(ann, "error", (m) => m.reason.includes("locked"), "locked door refused");

  // The GM is not stopped by walls; the agent can move a token the way its player would.
  const orcMap = (await tool("kraken_map", {})).tokens.find((t) => t.name === "Orc");
  const gmMove = await tool("kraken_token_move", { id: orcMap.id, col: 1, row: 1 });
  assert(!gmMove.blocked && gmMove.col === 1, "the GM moves through walls");
  const playerMove = await tool("kraken_token_move", { id: placed.id, col: 0, row: 2, asPlayer: true });
  assert(playerMove.blocked && playerMove.col === 5, `as a player, the locked door stops the move: ${JSON.stringify(playerMove)}`);

  // Several tokens at once (a picked group dragged together): the GM's through walls; a player's only their own, each stopped on its own.
  const annPet = server.agent.map.place({ name: "Ann's Dog", x: 325, y: 175, owner: "Ann" }, server.agent.seat);
  const before = server.snapshot().tokens.find((t) => t.id === placed.id);
  const group = await tool("kraken_token_move", { ids: [orcMap.id, annPet.id], dcol: 1, drow: 0 });
  assert(group.length === 2 && group.every((item) => !item.blocked), `the GM's group move: ${JSON.stringify(group)}`);
  ann.ws.send(JSON.stringify({ type: "token-move", moves: [{ id: placed.id, x: before.x, y: before.y + 50 }, { id: orcMap.id, x: 75, y: 75 }] }));
  await latest(ann, "error", (m) => m.reason.includes("not your token"), "a group with someone else's token is refused");
  assert(server.snapshot().tokens.find((t) => t.id === placed.id).y === before.y, "nothing of a refused group moves");
  const dogAt = server.snapshot().tokens.find((t) => t.id === annPet.id);
  ann.ws.send(JSON.stringify({ type: "token-move", moves: [{ id: placed.id, x: before.x, y: before.y + 50 }, { id: annPet.id, x: dogAt.x, y: dogAt.y + 50 }] }));
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === annPet.id && t.y === dogAt.y + 50), "her two tokens moved together");
  assert(server.snapshot().tokens.find((t) => t.id === placed.id).y === before.y + 50, "both of them");
  ann.ws.send(JSON.stringify({ type: "token-move", moves: [{ id: placed.id, x: before.x, y: before.y }] }));
  server.agent.map.remove(annPet.id, server.agent.seat);

  // Facing (FG's token orientation): the GM turns any token, a player her own.
  assert((await tool("kraken_token_update", { id: orcMap.id, facing: 450 })).facing === 90, "the GM turns the orc (450 is 90)");
  ann.ws.send(JSON.stringify({ type: "token-update", id: placed.id, patch: { facing: 225 } }));
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === placed.id && t.facing === 225), "Ann turns her token");
  ann.ws.send(JSON.stringify({ type: "token-update", id: orcMap.id, patch: { facing: 0 } }));
  await latest(ann, "error", (m) => m.reason.includes("Only the GM"), "she cannot turn the orc");
  assert((await tool("kraken_token_update", { id: placed.id, facing: null })).facing === null, "back to not turned");

  // The GM's token lock stops players moving, until it is lifted.
  assert((await tool("kraken_line_of_sight", { lockMovement: true })).lockMovement === true, "movement locked");
  ann.ws.send(JSON.stringify({ type: "token-move", id: placed.id, x: 325, y: 75 }));
  await latest(ann, "error", (m) => m.reason.includes("locked token movement"), "locked movement refused");
  assert(server.snapshot().tokens.find((t) => t.id === placed.id).y === 125, "the locked token stayed");
  await tool("kraken_line_of_sight", { lockMovement: false });

  // Hidden tokens stay off the player's map; line of sight off shows everything.
  await tool("kraken_token_update", { id: orcMap.id, hidden: true });
  const los = await tool("kraken_line_of_sight", { on: false, player: "Ann" });
  assert(los.sight === false && los.limited === false && !los.sees.includes("Orc"), `sight off, orc hidden: ${JSON.stringify(los)}`);
  await tool("kraken_token_update", { id: orcMap.id, hidden: false });
  assert((await tool("kraken_line_of_sight", { player: "Ann" })).sees.includes("Orc"), "sight off: Ann sees the orc");

  // Darkness: from 0.5 a player sees only lit places and their darkvision.
  const sees = async () => (await tool("kraken_line_of_sight", { player: "Ann" })).sees;
  await tool("kraken_scene_settings", { darkness: 1 });
  assert(!(await sees()).includes("Orc"), "in the dark Ann cannot see the orc");
  const torch = await tool("kraken_light", { action: "place", col: 1, row: 1, preset: "torch" });
  assert(torch.bright === 20 && torch.dim === 40, `a torch is CoreRPG's 4/8 squares: ${JSON.stringify(torch)}`);
  assert((await sees()).includes("Orc"), "the torch lights the orc");
  await tool("kraken_light", { action: "update", id: torch.id, on: false });
  assert(!(await sees()).includes("Orc"), "torch out, orc gone");
  await tool("kraken_token_update", { id: placed.id, vision: 60 });
  assert((await sees()).includes("Orc"), "60 ft of darkvision reaches the orc");
  await tool("kraken_token_update", { id: placed.id, vision: null });
  // C&C senses from the character: deepvision sees in darkness, twilight vision only by night light.
  server.agent.records.update(annRecord.id, { data: { senses: "Deepvision 120 ft" } }, server.agent.seat);
  const deep = server.agent.viewFor("Ann");
  assert(deep.seeing.length === 1 && deep.seeing[0].radiusPx === 1200 && deep.tokens.some((t) => t.name === "Orc"), `deepvision 120 ft: ${JSON.stringify(deep.seeing.map((v) => v.radiusPx))}`);
  server.agent.records.update(annRecord.id, { data: { senses: "Twilight Vision 60 ft" } }, server.agent.seat);
  assert(!(await sees()).includes("Orc"), "twilight vision sees nothing in pitch black");
  await tool("kraken_scene_settings", { darkness: 0.75 });
  assert((await sees()).includes("Orc") && server.agent.viewFor("Ann").twilight === true, "twilight vision sees by night");
  const weather = await tool("kraken_scene_settings", { darkness: null, weather: { type: "rain", intensity: 0.7 }, grid: { show: false } });
  assert(weather.weather.type === "rain" && weather.grid.show === false && weather.darknessNow === 0, `settings ${JSON.stringify(weather)}`);
  const annMap = await latest(ann, "map", (m) => m.settings.weather.type === "rain", "rain reaches the player");
  assert(annMap.settings.grid.show === false && !("sceneLights" in annMap && annMap.sceneLights.length), "players get the settings, not the GM's light list");
  await tool("kraken_light", { action: "remove", id: torch.id });

  // Tokens, doors and the sight setting are saved with the table.
  const saved = server.persisted().map;
  assert(saved.doors.keep.door === 2 && saved.sight.keep === false && saved.tokens.keep.length === 2, `saved map ${JSON.stringify(saved)}`);
  const reopened = createTableServer({ saved: { map: saved } });
  await reopened.listen({ port: 0, password: "" });
  reopened.agent.map.setScene(JSON.parse(JSON.stringify({ ...scene, tokens: [] })));
  assert(reopened.agent.map.tokens().length === 2 && reopened.agent.map.sightOn() === false, "the map comes back on reopen");
  await reopened.stop();

  // The art library: players list and fetch the GM's portraits and tokens by
  // id; nothing else in the data folder is served; a portrait shows on the token.
  const asset = ann.ok.you.assetToken;
  const base = `http://127.0.0.1:${info.port}`;
  const portraits = await (await fetch(`${base}/art/list?token=${asset}&kind=portrait`)).json();
  const tokens = await (await fetch(`${base}/art/list?token=${asset}&kind=token`)).json();
  assert(portraits.length === 1 && portraits[0].id === "portraits/Ann Fighter.png" && tokens[0].group === "Keep", `art lists ${JSON.stringify([portraits, tokens])}`);
  const file = await fetch(`${base}/art/file?token=${asset}&id=${encodeURIComponent(portraits[0].id)}`);
  assert(file.ok && (await file.text()) === "portrait-bytes" && file.headers.get("content-type") === "image/png", "portrait served");
  assert((await fetch(`${base}/art/file?token=${asset}&id=secret.txt`)).status === 404, "only indexed art is served");
  assert((await fetch(`${base}/art/file?token=${asset}&id=..%2F..%2Fsecret.txt`)).status === 404, "no paths outside the library");
  assert((await fetch(`${base}/art/list?token=nope`)).status === 404, "the library needs a seat's asset token");
  server.agent.records.update(annRecord.id, { data: { portrait: portraits[0].id } }, server.agent.seat);
  const withArt = await latest(ann, "map", (m) => m.tokens.some((t) => t.id === placed.id && t.art), "token shows the portrait");
  assert(withArt.tokens.find((t) => t.id === placed.id).art.includes(encodeURIComponent(portraits[0].id)), "token art is the portrait");

  // Drawing on the map, for everyone: Ann draws in her colour; she rubs out
  // only her own lines; the GM rubs out anyone's and clears them all; saved.
  ann.ws.send(JSON.stringify({ type: "draw", points: [10, 10, 60, 40, 90, 20], width: 5 }));
  const drawn = await latest(dm, "map", (m) => m.drawings?.length === 1, "the GM sees Ann's line");
  const line = drawn.drawings[0];
  assert(line.by === "Ann" && /^#[0-9a-f]{6}$/i.test(line.color) && line.points.length === 6, `Ann's line, in her colour: ${JSON.stringify(line)}`);
  const gmLine = await tool("kraken_draw", { action: "draw", points: [0, 0, 100, 100], color: "#ff5a5a" });
  await latest(ann, "map", (m) => m.drawings?.length === 2, "Ann sees the GM's line");
  ann.ws.send(JSON.stringify({ type: "draw-erase", id: gmLine.id }));
  await latest(ann, "error", (m) => /your own lines/.test(m.reason), "Ann cannot rub out the GM's line");
  ann.ws.send(JSON.stringify({ type: "draw-clear" }));
  await latest(ann, "error", (m) => /Only the GM/.test(m.reason), "Ann cannot clear the drawings");
  ann.ws.send(JSON.stringify({ type: "draw-erase", id: line.id }));
  await latest(dm, "map", (m) => m.drawings?.length === 1 && m.drawings[0].id === gmLine.id, "Ann rubs out her own line");
  ann.ws.send(JSON.stringify({ type: "draw", points: [5, 5] }));
  await latest(ann, "error", (m) => /two points/.test(m.reason), "a line needs two points");
  assert(server.persisted().map.drawings.keep.length === 1, "drawings are saved with the scene");
  await tool("kraken_draw", { action: "clear" });
  await latest(ann, "map", (m) => m.drawings?.length === 0, "the GM clears every line");

  await tool("kraken_token_remove", { id: placed.id });
  assert(!server.snapshot().tokens.some((t) => t.id === placed.id), "token removed");
  console.log("MAP_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
