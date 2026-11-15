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
  assert(view.tokens.find((t) => t.id === orc.id)?.sensed === true, "tremorsense feels the orc through the wall");
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
  await tool("kraken_token_update", { id: annToken.id, senses: "" });
  console.log("ok senses");

  console.log("MAP_PLAY_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
