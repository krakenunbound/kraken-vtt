// The map at play, beyond check-map: the shared ruler with waypoints and the
// diagonal rule; FG's token options (who sees names and health, unidentified
// names); fog of war kept on the host per player; senses beyond darkvision
// (blindsight, tremorsense, truesight, Devil's Sight) and magical darkness;
// undoing a move and this turn's path; the GM approving locked moves;
// elevation; Map Studio's regions at the table (traps, difficult terrain,
// teleports). Each through the table messages and the agent tools.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import * as geometry from "../shared/map/geometry.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- geometry ---------------------------------------------------------------
const plain = { width: 1000, height: 1000, padding: 0, grid: { size: 50, distance: 5, type: 1 } };
{
  const c = (col, row) => [col * 50 + 25, row * 50 + 25];
  // Two diagonal legs of one square each: 5 + 5 by rule 1; 5 then 10 by 5-10-5 (the count runs across the legs).
  const path = [...c(0, 0), ...c(1, 1), ...c(2, 2)];
  const one = geometry.pathDistance(plain, path, "1");
  assert(one.legs.join() === "5,5" && one.total === 10, `rule 1: ${JSON.stringify(one)}`);
  const alt = geometry.pathDistance(plain, path, "1.5");
  assert(alt.legs.join() === "5,10" && alt.total === 15, `5-10-5 across legs: ${JSON.stringify(alt)}`);
  const raw = geometry.pathDistance(plain, [...c(0, 0), ...c(3, 4)], "raw");
  assert(raw.total === 25, `straight line 3-4-5: ${JSON.stringify(raw)}`);
  // Difficult terrain: entering a square in it costs double.
  const mud = (x) => (x > 150 ? 2 : 1);
  assert(geometry.pathDistance(plain, [...c(0, 0), ...c(4, 0)], "1", mud).total === 30, "two squares of mud cost double");
  // Height: 3 squares across and 20 ft up is 20 ft by rule 1, 25 by 5-10-5.
  assert(geometry.gridDistance3(plain, { x: 25, y: 25 }, { x: 175, y: 25 }, "1", 20) === 20 && geometry.gridDistance3(plain, { x: 25, y: 25 }, { x: 175, y: 25 }, "1.5", 20) === 25, "elevation counts");
  const senses = geometry.parseSenses("Darkvision 60 ft., Blindsight 10 ft. (blind beyond), Tremorsense 30 ft., truesight 120 ft, Devil's Sight");
  assert(senses.darkvision === 60 && senses.blindsight === 10 && senses.tremorsense === 30 && senses.truesight === 120 && senses.devilsight === 120, `senses ${JSON.stringify(senses)}`);
  const square = [0, 0, 100, 0, 100, 100, 0, 100];
  const inner = [10, 10, 50, 10, 50, 50, 10, 50];
  const known = geometry.mergeExplored([], [inner]);
  assert(known.length === 1 && geometry.mergeExplored(known, [inner]) === known, "the same view adds nothing");
  assert(geometry.mergeExplored(known, [square]).length === 1, "a view round a known one replaces it");
}
console.log("ok geometry");

// --- the table ----------------------------------------------------------------
// A wall down x = 250; the party to its left, an orc to its right, a goblin near Ann.
const scene = {
  id: "crypt",
  name: "Crypt",
  width: 500,
  height: 300,
  padding: 0,
  backgroundColor: "#000",
  grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" },
  lights: [],
  tokens: [
    { id: "orc", name: "Orc", x: 275, y: 100, width: 50, height: 50, disposition: -1, hidden: false },
    { id: "gob", name: "Goblin", x: 150, y: 100, width: 50, height: 50, disposition: -1, hidden: false },
  ],
  walls: [{ id: "w1", x1: 250, y1: 0, x2: 250, y2: 300, sight: 20, move: 20, door: 0, ds: 0 }],
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
        if (ok) resolve({ ws, inbox, ok, send: (message) => ws.send(JSON.stringify(message)) });
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
    await wait(15);
  }
  throw new Error(`waiting for ${label}`);
}

const server = createTableServer({});
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  const ann = await connect(info.port, { name: "Ann", password: "" });
  const bob = await connect(info.port, { name: "Bob", password: "" });
  sockets.push(dm.ws, ann.ws, bob.ws);
  dm.send({ type: "scene", scene });
  await latest(ann, "map", (m) => m.sceneId === "crypt", "Ann's first map");
  const annRecord = server.agent.records.create({ type: "character", name: "Ann's Fighter", owner: "Ann", visibility: "owner", data: {} }, server.agent.seat);
  const annToken = await tool("kraken_token_place", { recordId: annRecord.id, col: 1, row: 2 });
  const orc = server.agent.map.tokens().find((token) => token.name === "Orc");
  const gob = server.agent.map.tokens().find((token) => token.name === "Goblin");

  // 1. The shared ruler: Ann measures with a waypoint; the GM and Bob see it in her colour; let go, it is gone.
  ann.send({ type: "ruler", points: [75, 125, 125, 175, 175, 225] });
  const seen = await latest(bob, "ruler", (m) => m.points.length === 6, "Bob sees Ann's ruler");
  assert(seen.from === "Ann" && seen.sceneId === "crypt" && /^#/.test(seen.color), `Ann's ruler: ${JSON.stringify(seen)}`);
  await latest(dm, "ruler", (m) => m.from === "Ann" && m.points.length === 6, "the GM sees it too");
  assert(!ann.inbox.some((m) => m.type === "ruler"), "her own ruler is not sent back to her");
  ann.send({ type: "ruler", points: [] });
  await latest(bob, "ruler", (m) => m.from === "Ann" && m.points.length === 0, "let go: cleared");
  // The diagonal rule: the campaign's, a scene's own over it; the agent's ruler measures by it and shows it.
  let measured = await tool("kraken_ruler", { squares: [{ col: 0, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 2 }] });
  assert(measured.total === 10 && measured.diagonal === "1", `rule 1: ${JSON.stringify(measured)}`);
  await tool("kraken_table_options", { diagonal: "1.5" });
  measured = await tool("kraken_ruler", { squares: [{ col: 0, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 2 }], show: true, seconds: 0.5 });
  assert(measured.legs.join() === "5,10" && measured.total === 15, `the campaign's 5-10-5: ${JSON.stringify(measured)}`);
  await latest(ann, "ruler", (m) => m.from === "Agent" && m.points.length === 6, "the agent's ruler is shown to the table");
  await latest(ann, "map", (m) => m.settings.diagonalRule === "1.5", "players measure by the campaign's rule");
  await tool("kraken_scene_settings", { diagonal: "raw" });
  await latest(ann, "map", (m) => m.settings.diagonalRule === "raw" && m.settings.diagonal === "raw", "the scene's own rule wins");
  await tool("kraken_scene_settings", { diagonal: null });
  await latest(ann, "map", (m) => m.settings.diagonalRule === "1.5" && m.settings.diagonal === null, "back to the campaign's");
  await latest(ann, "ruler", (m) => m.from === "Agent" && m.points.length === 0, "the agent's ruler goes after its seconds");
  console.log("ok ruler");

  // 2. Who sees names and health (FG's token options). The goblin is hurt, on the tracker.
  server.agent.records.update(annRecord.id, { data: { hp: { total: 10, wounds: 3 } } }, server.agent.seat);
  const goblinOf = (view) => view.tokens.find((token) => token.id === gob.id);
  let view = server.agent.viewFor("Ann");
  assert(goblinOf(view).name === "Goblin" && goblinOf(view).namesShow === "hover", "names on hover by default, as FG");
  assert(view.tokens.find((t) => t.id === annToken.id).health?.status === "Wounded" && view.tokens.find((t) => t.id === annToken.id).healthShow === "dot", "a character's health is a dot by default");
  await tool("kraken_table_options", { healthPc: "off", names: "off" });
  view = server.agent.viewFor("Ann");
  const annOwn = view.tokens.find((t) => t.id === annToken.id);
  assert(annOwn.health === null && annOwn.name === "Ann's Fighter", "health off: not sent; her own name stays");
  assert(goblinOf(view).name === "" && !JSON.stringify(view).includes("Goblin"), "names off: the goblin's name never reaches her");
  const gmView = server.agent.map.viewFor({ role: "dm", name: "GM" }, "");
  assert(gmView.tokens.find((t) => t.id === annToken.id).health?.status === "Wounded" && gmView.tokens.find((t) => t.id === gob.id).name === "Goblin", "the GM still sees health and names");
  await tool("kraken_table_options", { healthPc: "bar", names: "always" });
  await tool("kraken_token_update", { id: gob.id, unidentified: "Small shape" });
  view = server.agent.viewFor("Ann");
  assert(goblinOf(view).name === "Small shape" && !JSON.stringify(view).includes("Goblin") && !("unidentified" in goblinOf(view)), "the unidentified name, never the real one");
  assert(view.tokens.find((t) => t.id === annToken.id).healthShow === "bar", "a health bar");
  assert(server.agent.map.viewFor({ role: "dm", name: "GM" }, "").tokens.find((t) => t.id === gob.id).unidentified === "Small shape", "the GM sees what players call it");
  await tool("kraken_table_options", { healthPc: "dot", names: "hover" });
  console.log("ok names and health");

  // 3. Fog of war on the host: Ann's view becomes her explored area; she is sent hers alone; the GM resets it.
  const annExplored = await latest(ann, "explored", (m) => m.sceneId === "crypt" && m.polygons.length > 0, "Ann's explored areas");
  assert(annExplored.polygons.length >= 1, "her view is kept");
  assert(!bob.inbox.some((m) => m.type === "explored" && m.polygons.length > 0), "Bob is not sent Ann's");
  assert(server.persisted().map.explored.crypt.Ann.length >= 1, "saved with the campaign");
  dm.send({ type: "playtest", preview: true });
  await latest(dm, "explored", (m) => m.polygons.length > 0, "the GM's vision preview shows the players' explored areas");
  dm.send({ type: "playtest", preview: false });
  const reset = await tool("kraken_line_of_sight", { resetExplored: "Ann", player: "Ann" });
  assert(reset.player === "Ann" && server.agent.tableMap.exploredFor("Ann").length === 0, `reset ${JSON.stringify(reset)}`);
  // Then her token's view now (it is still there) is explored again, from where she stands.
  await tool("kraken_token_move", { id: annToken.id, col: 1, row: 3 });
  for (let tries = 0; tries < 100 && server.agent.tableMap.exploredFor("Ann").length === 0; tries += 1) await wait(20);
  assert(server.agent.tableMap.exploredFor("Ann").length >= 1, "explored again from where she stands");
  const reopened = createTableServer({ saved: { map: server.persisted().map } });
  await reopened.listen({ port: 0, password: "" });
  reopened.agent.map.setScene(JSON.parse(JSON.stringify({ ...scene, tokens: [] })));
  assert(reopened.agent.map.exploredFor("Ann").length >= 1, `explored areas come back on reopen: ${JSON.stringify(Object.keys(server.persisted().map.explored?.crypt ?? {}))} ${server.agent.tableMap.exploredFor("Ann").length}`);
  assert(reopened.agent.map.tokens().find((t) => t.id === gob.id).unidentified === "Small shape", "the unidentified name is saved");
  await reopened.stop();
  console.log("ok explored");

  // 4. Senses. Pitch black: Ann sees nothing; blindsight 10 ft finds the goblin beside her, not the orc.
  await tool("kraken_scene_settings", { darkness: 1 });
  await tool("kraken_token_move", { id: annToken.id, col: 2, row: 2 });
  await tool("kraken_token_move", { id: gob.id, col: 2, row: 1 });
  const names = () => server.agent.viewFor("Ann").tokens.map((t) => t.id);
  assert(!names().includes(gob.id), "in the dark she sees no goblin");
  await tool("kraken_token_update", { id: annToken.id, senses: "Blindsight 10 ft" });
  assert(names().includes(gob.id), "blindsight perceives the goblin beside her");
  // Tremorsense feels the orc through the wall while it stands on the ground, not while it flies.
  await tool("kraken_token_move", { id: orc.id, col: 5, row: 2 });
  await tool("kraken_token_update", { id: annToken.id, senses: "Tremorsense 30 ft" });
  view = server.agent.viewFor("Ann");
  const felt = view.tokens.find((t) => t.id === orc.id);
  assert(felt?.sensed === true && felt.name === "" && felt.health === null && !felt.art, "tremorsense feels the orc through the wall: a shape, no name, no health");
  await tool("kraken_token_update", { id: orc.id, elevation: 10 });
  assert(!names().includes(orc.id), "not while it is in the air");
  await tool("kraken_token_update", { id: orc.id, elevation: 0 });
  // Magical darkness: light does not help, darkvision does not see; truesight and Devil's Sight do.
  await tool("kraken_scene_settings", { darkness: 0 });
  assert(names().includes(gob.id), "by day she sees the goblin");
  const dark = await tool("kraken_light", { action: "place", col: 2, row: 1, bright: 0, dim: 10, darkness: true });
  assert(dark.darkness === true, "a darkness light");
  await tool("kraken_token_update", { id: annToken.id, senses: "Darkvision 60 ft" });
  view = server.agent.viewFor("Ann");
  assert(!view.tokens.some((t) => t.id === gob.id) && view.darkAreas.length === 1, "darkvision does not see in magical darkness");
  await tool("kraken_token_update", { id: annToken.id, senses: "Devil's Sight" });
  view = server.agent.viewFor("Ann");
  assert(view.tokens.some((t) => t.id === gob.id) && view.trueSeeing.length === 1, "Devil's Sight sees in it");
  await tool("kraken_light", { action: "remove", id: dark.id });
  // In plain darkness: a Darkvision line typed on the token, truesight and Devil's Sight all see.
  await tool("kraken_scene_settings", { darkness: 1 });
  for (const line of ["Darkvision 60 ft", "Truesight 30 ft", "Devil's Sight"]) {
    await tool("kraken_token_update", { id: annToken.id, senses: line });
    assert(names().includes(gob.id), `${line} sees the goblin in the dark`);
  }
  await tool("kraken_token_update", { id: annToken.id, senses: "" });
  assert(!names().includes(gob.id), "without them, not");
  await tool("kraken_scene_settings", { darkness: 0 });
  console.log("ok senses");

  // 5. Undo a move, and this turn's path. Ann walks two squares, then takes one back; Bob cannot.
  await tool("kraken_scene_settings", { darkness: 0 });
  const at = () => server.agent.map.tokens().find((t) => t.id === annToken.id);
  await tool("kraken_token_move", { id: annToken.id, col: 0, row: 4 });
  const start = { x: at().x, y: at().y };
  ann.send({ type: "token-move", id: annToken.id, x: 75, y: 225 });
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === annToken.id && t.x === 75 && t.y === 225), "Ann's first step");
  ann.send({ type: "token-move", id: annToken.id, x: 125, y: 225 });
  const walked = await latest(ann, "map", (m) => m.tokens.some((t) => t.id === annToken.id && t.x === 125 && t.undo >= 3), "Ann's second step, moves to undo");
  const undoable = walked.tokens.find((t) => t.id === annToken.id).undo;
  assert(!walked.tokens.find((t) => t.id === annToken.id).path, "off the tracker: no path drawn");
  assert(!server.agent.viewFor("Bob").tokens.find((t) => t.id === annToken.id)?.undo, "Bob is not sent her moves");
  bob.send({ type: "token-undo", id: annToken.id });
  await latest(bob, "error", (m) => /not your token/.test(m.reason), "Bob cannot undo her move");
  ann.send({ type: "token-undo", id: annToken.id });
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === annToken.id && t.x === 75 && t.undo === undoable - 1), "Ann's last step undone");
  const path = await tool("kraken_token_move", { id: annToken.id, path: true });
  assert(path.moves.length === undoable - 1 && path.moves.at(-1).to.x === 75, `her path: ${JSON.stringify(path)}`);
  // On the tracker her path is drawn; when her turn begins it starts again.
  const entry = (await tool("kraken_combat", { action: "add", recordId: annRecord.id })).entries?.find?.((item) => item.recordId === annRecord.id) ?? server.agent.combat.entries().find((item) => item.recordId === annRecord.id);
  assert(entry, "Ann's character on the tracker");
  const onTracker = server.agent.viewFor("Ann").tokens.find((t) => t.id === annToken.id);
  assert(onTracker.path?.length === undoable * 2 && onTracker.path.at(-2) === 75, `her path on the tracker: ${JSON.stringify(onTracker.path)}`);
  await tool("kraken_combat", { action: "set-turn", id: entry.id });
  for (let tries = 0; tries < 50 && server.agent.map.path(annToken.id).length; tries += 1) await wait(20);
  assert(server.agent.map.path(annToken.id).length === 0, "her turn begins: the path starts again");
  await tool("kraken_combat", { action: "end" });
  // The GM undoes anyone's move.
  await tool("kraken_token_move", { id: gob.id, col: 0, row: 0 });
  const back = await tool("kraken_token_move", { id: gob.id, undo: true });
  assert(back.col === 2 && back.row === 1, `the GM's undo: ${JSON.stringify(back)}`);
  console.log("ok undo and path");

  // 6. Locked: a player's move waits for the GM, who accepts or cancels it (FG's TokenMoveManager).
  await tool("kraken_line_of_sight", { lockMovement: true });
  const before = { x: at().x, y: at().y };
  ann.send({ type: "token-move", id: annToken.id, x: 175, y: 275 });
  await latest(ann, "notice", (m) => /waits for the GM/.test(m.text), "Ann is told her move waits");
  const asked = await latest(dm, "map", (m) => m.moveRequests?.length === 1, "the GM sees the move asked for");
  assert(asked.moveRequests[0].by === "Ann" && asked.moveRequests[0].to.x === 175 && at().x === before.x, `the request: ${JSON.stringify(asked.moveRequests)}`);
  assert(server.agent.viewFor("Ann").moveRequests.length === 1 && server.agent.viewFor("Bob").moveRequests.length === 0, "Ann sees her own request, Bob none");
  dm.send({ type: "move-approve", ids: [annToken.id], accept: true });
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === annToken.id && t.x === 175 && t.y === 275), "accepted: she moves");
  ann.send({ type: "token-move", id: annToken.id, x: 25, y: 275 });
  await latest(dm, "map", (m) => m.moveRequests?.length === 1, "another request");
  const cancelled = await tool("kraken_token_move", { approve: "all", accept: false });
  assert(cancelled.length === 1 && cancelled[0].accepted === false && at().x === 175, `cancelled: ${JSON.stringify(cancelled)}`);
  await tool("kraken_line_of_sight", { lockMovement: false });
  console.log("ok approvals");

  // 7. Elevation: Ann flies her own token up; everyone gets it.
  ann.send({ type: "token-update", id: annToken.id, patch: { elevation: 15 } });
  await latest(bob, "map", (m) => m.tokens.some((t) => t.id === annToken.id && t.elevation === 15), "Bob sees her 15 ft up");
  ann.send({ type: "token-update", id: annToken.id, patch: { elevation: 0 } });
  console.log("ok elevation");

  // 8. Regions: a trap stops a player's token on its first square, tells the GM alone and locks movement.
  const trap = await tool("kraken_region", { action: "add", kind: "trap", name: "Pit of spikes", note: "DC 12 Dex or 2d6", rect: { col: 2, row: 5, cols: 1, rows: 1 } });
  await tool("kraken_token_move", { id: annToken.id, col: 0, row: 5 });
  ann.send({ type: "token-move", id: annToken.id, x: 225, y: 275 });
  await latest(dm, "notice", (m) => /Pit of spikes/.test(m.text), "the GM is told");
  const stopped = at();
  assert(stopped.x === 125 && stopped.y === 275, `she stops on the trap: ${stopped.x},${stopped.y}`);
  assert(server.agent.map.lockedNow(), "the trap locks movement");
  const secret = server.agent.chatLog(5).find((line) => /Pit of spikes/.test(line.text));
  assert(secret?.secret === true && /DC 12/.test(secret.text), "a line only the GM sees, with its note");
  assert(!ann.inbox.some((m) => JSON.stringify(m).includes("DC 12")) && !("regions" in server.agent.viewFor("Ann")), "Ann never gets the trap or its note");
  await tool("kraken_line_of_sight", { lockMovement: false });
  await tool("kraken_region", { action: "update", id: trap.id, on: false });
  // Difficult terrain: the ruler counts it; players get its shape for measuring.
  await tool("kraken_region", { action: "add", kind: "difficult", cost: 2, rect: { col: 6, row: 0, cols: 2, rows: 1 } });
  measured = await tool("kraken_ruler", { squares: [{ col: 5, row: 0 }, { col: 8, row: 0 }] });
  assert(measured.total === 25, `two squares of difficult terrain: ${JSON.stringify(measured)}`);
  assert(server.agent.viewFor("Ann").terrain.length === 1, "players get the terrain to measure by");
  // A teleport sends her to the region it names.
  await tool("kraken_region", { action: "add", kind: "teleport", name: "Gate", to: "Far side", rect: { col: 3, row: 5, cols: 1, rows: 1 } });
  await tool("kraken_region", { action: "add", kind: "trap", name: "Far side", rect: { col: 8, row: 5, cols: 1, rows: 1 } });
  await tool("kraken_region", { action: "update", id: server.agent.map.regions().find((r) => r.name === "Far side").id, on: false });
  ann.send({ type: "token-move", id: annToken.id, x: 175, y: 275 });
  await latest(ann, "map", (m) => m.tokens.some((t) => t.id === annToken.id && t.x === 425 && t.y === 275), "the teleport sends her to the far side");
  // Map Studio's regions come to the table with its walls (krakenBridge masterFrom).
  const bridge = require("../electron/studio/krakenBridge.cjs");
  const master = bridge.masterFrom({ walls: [], lights: [], effects: [], regions: [{ id: "s1", kind: "pit", name: "Well", note: "10 ft down", points: [0, 0, 50, 0, 50, 50, 0, 50] }] }, server.agent.map.scene());
  const counts = server.agent.map.fromStudio({ ...master, walls: server.agent.map.walls().map((wall) => ({ ...wall })), project: null });
  assert(counts.regions === 1 && server.agent.map.regions()[0].kind === "pit", `Map Studio's regions: ${JSON.stringify(counts)}`);
  assert(server.persisted().map.regions.crypt.length === 1, "regions are saved");
  // A play test's token springs a trap, but never locks the table.
  await tool("kraken_region", { action: "add", kind: "trap", name: "Test trap", rect: { col: 0, row: 0, cols: 1, rows: 1 } });
  const tester = server.agent.map.place({ name: "Test player", owner: "@test", x: 75, y: 25 }, server.agent.seat);
  server.agent.map.move(tester.id, { x: 25, y: 25 }, { role: "player", name: "@test" });
  assert(!server.agent.map.lockedNow() && server.agent.map.tokens().find((t) => t.id === tester.id).x === 25, "the play test's token springs it without locking the table");
  server.agent.map.remove(tester.id, server.agent.seat);
  // A bundle's Foundry regions come with its scene, by their behaviours; players' scene has none.
  const bundle = { ...scene, id: "vault", name: "Vault", tokens: [], regions: [{ id: "fr1", name: "Collapsing floor", trap: false, kind: "pit", polygons: [[0, 0, 100, 0, 100, 100, 0, 100]] }, { id: "fr2", name: "Rubble", trap: false, kind: "difficult", cost: 2, polygons: [[200, 0, 300, 0, 300, 100, 200, 100]] }] };
  dm.send({ type: "scene", scene: bundle });
  const vaultScene = await latest(ann, "scene", (m) => m.scene?.id === "vault", "Ann gets the vault");
  assert(!("regions" in vaultScene.scene), "the players' scene carries no regions");
  await latest(ann, "map", (m) => m.sceneId === "vault", "the vault on the table");
  const listed = await tool("kraken_region", {});
  assert(listed.map((r) => r.kind).sort().join() === "difficult,pit", `the bundle's regions: ${JSON.stringify(listed)}`);
  dm.send({ type: "scene", scene });
  await latest(ann, "map", (m) => m.sceneId === "crypt", "back to the crypt");
  console.log("ok regions");

  // 9. Sounds placed on the map: heard near her token, louder nearer, muffled through the wall; never where they are.
  await tool("kraken_token_move", { id: annToken.id, col: 3, row: 2 });
  dm.send({ type: "map-sound", action: "add", sound: { sound: "ambience/Cave/drips.ogg", name: "Drips", x: 225, y: 125, radius: 20 } });
  const heard = await latest(ann, "map", (m) => m.sounds?.length === 1, "Ann hears the drips");
  assert(heard.sounds[0].gain > 0.3 && !heard.sounds[0].muffled && !("x" in heard.sounds[0]), `near and clear: ${JSON.stringify(heard.sounds)}`);
  assert(server.agent.viewFor("Bob").sounds.length === 0, "Bob has no token here: he hears nothing");
  const drips = (await tool("kraken_map_sound", {}))[0];
  await tool("kraken_map_sound", { action: "update", id: drips.id, x: 275, y: 125 });
  const through = (await tool("kraken_map_sound", { player: "Ann" }))[0];
  assert(through?.muffled === true && through.gain < heard.sounds[0].gain, `through the wall: ${JSON.stringify(through)}`);
  await tool("kraken_map_sound", { action: "remove", id: drips.id });
  assert(server.persisted().map.sounds.crypt.length === 0, "sounds are kept with the scene");
  // An animated map: a video background reaches players as a video.
  server.setImage(Buffer.from("webm-bytes"), "video/webm");
  dm.send({ type: "scene", scene });
  const videoScene = await latest(ann, "scene", (m) => m.scene?.video === true, "the animated map reaches Ann as a video");
  const served = await fetch(`http://127.0.0.1:${info.port}${videoScene.scene.image}`);
  assert(served.headers.get("content-type") === "video/webm", "served as a video");
  console.log("ok sounds and animated maps");

  // 10. Speed: a walled scene with 200 tokens and four players; what one burst of
  // map sends costs the host (every player's view, their explored areas merged).
  {
    const big = createTableServer({});
    await big.listen({ port: 0, password: "" });
    const walls = [];
    for (let i = 0; i < 30; i += 1) walls.push({ id: `bw${i}`, x1: 100 + i * 120, y1: 0, x2: 100 + i * 120, y2: 1500 + (i % 3) * 300, sight: 20, move: 20, door: 0, ds: 0 });
    for (let i = 0; i < 30; i += 1) walls.push({ id: `bh${i}`, x1: 0, y1: 100 + i * 120, x2: 1500 + (i % 4) * 400, y2: 100 + i * 120, sight: 20, move: 20, door: i % 2, ds: i % 4 === 0 ? 1 : 0 });
    const tokens = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, name: `Goblin ${i}`, x: 50 + (i % 20) * 150, y: 50 + Math.floor(i / 20) * 150, width: 50, height: 50, disposition: -1, hidden: false }));
    big.agent.map.setScene({ ...scene, id: "big", width: 3600, height: 3600, walls, tokens });
    big.agent.map.setSight(true);
    const players = ["P1", "P2", "P3", "P4"];
    for (const [index, name] of players.entries()) big.agent.map.place({ name, owner: name, x: 175 + index * 600, y: 175 + index * 300 }, big.agent.seat);
    const burst = () => {
      let bytes = 0;
      for (const name of players) {
        const view = big.agent.map.viewFor({ role: "player", name }, "x");
        if (view.vision) big.agent.map.explore(name, view.vision);
        bytes += JSON.stringify(view).length;
      }
      return bytes;
    };
    burst();
    const times = [];
    let bytes = 0;
    for (let step = 0; step < 20; step += 1) {
      const mover = big.agent.map.tokens().find((t) => t.owner === players[step % 4]);
      big.agent.map.move(mover.id, { x: mover.x + (step % 2 ? -150 : 150), y: mover.y }, big.agent.seat);
      const startAt = performance.now();
      bytes = burst();
      times.push(performance.now() - startAt);
    }
    times.sort((a, b) => a - b);
    const explored = JSON.stringify(players.map((name) => big.agent.map.exploredFor(name))).length;
    console.log(`speed: 200 tokens, 60 walls, 4 players: a burst of map views ${times[10].toFixed(1)} ms median, ${times[19].toFixed(1)} ms worst; views ${(bytes / 1024).toFixed(0)} KB for the four; explored areas ${(explored / 1024).toFixed(0)} KB in all`);
    assert(times[10] < 150, "a burst stays quick");
    await big.stop();
  }

  console.log("MAP_PLAY_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
