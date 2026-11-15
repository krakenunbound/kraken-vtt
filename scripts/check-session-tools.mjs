// The session's controls on the host (tableServer.cjs), with sockets of our own:
// a dropped player's seat waits for a reconnect (the grace), a seat left on
// purpose does not; a connection that stops answering is closed by the
// heartbeat, after which the same name sits again; the GM's window rejoining
// takes back its seat; an account's token takes the place of the old seat;
// the pause holds a player's rolls and moves (chat goes on, the GM is
// unaffected); Ban by name (never by this computer's address), kept with the
// campaign, and Unban; /afk, idle and a raised hand; Ring bell; the view pull.
import "./loopback.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

process.env.KRAKEN_GRACE_MS = "700";
process.env.KRAKEN_HEARTBEAT_MS = "250";
const { createTableServer } = await import("../electron/tableServer.cjs");
const { createAccountStore } = await import("../electron/accounts.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(port, join, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, options);
    const inbox = [];
    ws.inbox = inbox;
    ws.on("message", (data) => inbox.push(JSON.parse(data.toString())));
    const timer = setTimeout(() => reject(new Error("join timed out")), 4000);
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "ok" && msg.type !== "no") return;
      clearTimeout(timer);
      resolve({ ws, msg });
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
// The next message of a type (already come, or coming).
function nextOf(ws, type, test = () => true, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), ms);
    const look = () => {
      const index = ws.inbox.findIndex((msg) => msg.type === type && test(msg));
      if (index < 0) return false;
      const [found] = ws.inbox.splice(index, 1);
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(found);
      return true;
    };
    const onMessage = () => setImmediate(look);
    if (!look()) ws.on("message", onMessage);
  });
}
const drain = (ws) => ws.inbox.splice(0);
const send = (ws, message) => ws.send(JSON.stringify(message));
const names = (msg) => msg.players.map((seat) => `${seat.name}${seat.lost ? "(lost)" : ""}${seat.afk ? "(afk)" : ""}${seat.idle ? "(idle)" : ""}${seat.hand ? "(hand)" : ""}`).sort().join(",");

const accounts = createAccountStore(path.join(mkdtempSync(path.join(tmpdir(), "kraken-session-tools-")), "accounts.json"));
const server = createTableServer({ accounts });
const info = await server.listen({ port: 0, password: "pw" });
const { port } = info;
const results = [];
try {
  const gm = await connect(port, { name: "GM", password: "pw", hostToken: info.hostToken });
  assert(gm.msg.you.role === "dm" && Array.isArray(gm.msg.bans), "the GM is seated, with the Ban list");

  // --- The grace: a dropped player's seat waits; a rejoin takes it back without a flicker.
  const ann = await connect(port, { name: "Ann", password: "pw" });
  assert(ann.msg.type === "ok", `Ann sits: ${JSON.stringify(ann.msg)}`);
  drain(gm.ws);
  ann.ws.terminate();
  const lost = await nextOf(gm.ws, "players", (msg) => msg.players.some((seat) => seat.name === "Ann" && seat.lost));
  assert(names(lost) === "Ann(lost),GM", `a dropped seat waits, marked lost: ${names(lost)}`);
  const ann2 = await connect(port, { name: "Ann", password: "pw" });
  assert(ann2.msg.type === "ok" && ann2.msg.players.filter((seat) => seat.name === "Ann").length === 1 && !ann2.msg.players.some((seat) => seat.lost), `Ann sits again in her seat: ${JSON.stringify(ann2.msg.players)}`);
  results.push("grace and rejoin");

  // The grace runs out: gone from the table.
  ann2.ws.terminate();
  await wait(1100);
  assert(!server.snapshot().players.some((seat) => seat.name === "Ann"), "after the grace a dropped player has left");
  results.push("grace runs out");

  // Left on purpose (the page's Leave: close 4000): no seat kept.
  const bob = await connect(port, { name: "Bob", password: "pw" });
  bob.ws.close(4000, "leave");
  await wait(150);
  assert(!server.snapshot().players.some((seat) => seat.name === "Bob"), "a player who leaves on purpose has no seat kept");
  results.push("leave frees the seat");

  // A connection that stops answering (a laptop asleep): closed by the heartbeat; the name sits again.
  const sleeper = await connect(port, { name: "Cy", password: "pw" }, { autoPong: false });
  assert(sleeper.msg.type === "ok", "Cy sits");
  const twice = await connect(port, { name: "Cy", password: "pw" });
  assert(twice.msg.type === "no" && twice.msg.retry === true, `the same name while the old connection seems alive: try again: ${JSON.stringify(twice.msg)}`);
  await wait(900);
  const cyAgain = await connect(port, { name: "Cy", password: "pw" });
  assert(cyAgain.msg.type === "ok", `after the heartbeat closed the dead connection, Cy sits again: ${JSON.stringify(cyAgain.msg)}`);
  results.push("heartbeat closes a dead connection");

  // The GM's window rejoining (rejoin) takes back the GM's seat; without rejoin a second window stays a player.
  const second = await connect(port, { name: "GM2", password: "pw", hostToken: info.hostToken });
  assert(second.msg.you.role === "player", "a second window with the host token stays a player");
  second.ws.close(4000);
  const gmBack = await connect(port, { name: "GM", password: "pw", hostToken: info.hostToken, rejoin: true });
  assert(gmBack.msg.you.role === "dm", `the GM's window rejoining is the GM again: ${JSON.stringify(gmBack.msg.you)}`);
  await wait(100);
  assert(gm.ws.readyState !== WebSocket.OPEN, "the GM's old connection is closed");
  assert(server.snapshot().players.filter((seat) => seat.role === "dm").length === 1, "one GM seat");
  const host = gmBack.ws;
  results.push("GM window rejoin");

  // An account's token takes the place of the old seat (a reconnect before the host saw the drop).
  const dee = await connect(port, { name: "Dee", password: "pw", account: { password: "secret1" } });
  const token = dee.msg.you.accountToken;
  assert(token, "Dee's account token");
  const deeAgain = await connect(port, { name: "Dee", password: "pw", account: { token } });
  assert(deeAgain.msg.type === "ok", "Dee's token sits her again");
  const away = await nextOf(dee.ws, "kicked");
  assert(/signed in somewhere else/.test(away.reason), `the old seat is told: ${away.reason}`);
  await wait(100);
  assert(!server.snapshot().players.some((seat) => seat.lost), "a replaced seat is not kept waiting");
  results.push("account token replaces the old seat");

  // --- The pause: the players' rolls and moves wait; chat goes on; the GM is unaffected.
  drain(deeAgain.ws);
  send(host, { type: "table-options", options: { paused: true } });
  const paused = await nextOf(deeAgain.ws, "options", (msg) => msg.options.paused === true);
  assert(paused.options.paused, "the pause reaches the players");
  await nextOf(deeAgain.ws, "chat", (msg) => /paused the game/.test(msg.text));
  send(deeAgain.ws, { type: "roll", formula: "1d20", req: 7 });
  const held = await nextOf(deeAgain.ws, "op-result", (msg) => msg.req === 7);
  assert(held.ok === false && /paused/.test(held.error), `a player's roll waits: ${JSON.stringify(held)}`);
  await nextOf(deeAgain.ws, "notice", (msg) => /paused/.test(msg.text));
  send(deeAgain.ws, { type: "token-move", id: "x", x: 10, y: 10 });
  await nextOf(deeAgain.ws, "notice", (msg) => /paused/.test(msg.text));
  send(deeAgain.ws, { type: "chat", text: "still talking" });
  await nextOf(deeAgain.ws, "chat", (msg) => msg.text === "still talking");
  drain(host);
  send(host, { type: "roll", formula: "1d20" });
  const gmRoll = await nextOf(host, "chat", (msg) => Boolean(msg.roll));
  assert(gmRoll.roll.formula, "the GM rolls while paused");
  assert(server.agent.options().paused === true, "the agent reads the pause");
  server.agent.setOptions({ paused: false });
  await nextOf(deeAgain.ws, "options", (msg) => msg.options.paused === false);
  send(deeAgain.ws, { type: "roll", formula: "1d20" });
  await nextOf(deeAgain.ws, "chat", (msg) => Boolean(msg.roll));
  results.push("pause");

  // --- Presence: /afk, idle, a raised hand (the GM is told), the GM lowering it.
  drain(host);
  send(deeAgain.ws, { type: "presence", afk: true });
  let list = await nextOf(host, "players", (msg) => msg.players.some((seat) => seat.name === "Dee" && seat.afk));
  send(deeAgain.ws, { type: "presence", idle: true, hand: true });
  await nextOf(host, "hand", (msg) => msg.name === "Dee");
  list = await nextOf(host, "players", (msg) => msg.players.some((seat) => seat.name === "Dee" && seat.hand && seat.idle));
  send(host, { type: "presence", name: "Dee", hand: false, afk: false });
  list = await nextOf(host, "players", (msg) => msg.players.some((seat) => seat.name === "Dee" && !seat.hand && !seat.afk));
  assert(server.agent.presence("Dee", { afk: true }).afk === true, "the agent marks a player away");
  results.push("afk, idle, hand");

  // --- Ring bell: only that player hears it.
  drain(cyAgain.ws);
  send(host, { type: "ring", name: "Dee" });
  const bell = await nextOf(deeAgain.ws, "bell");
  assert(bell.from === "GM", "Dee's bell rings, from the GM");
  await wait(150);
  assert(!cyAgain.ws.inbox.some((msg) => msg.type === "bell"), "no one else's bell rings");
  assert(server.agent.ring("Cy") === "Cy", "the agent rings a bell");
  results.push("ring bell");

  // --- Ban and Unban: by name; this computer's address is never kept; saved with the campaign.
  drain(host);
  send(host, { type: "kick", name: "Dee", ban: true });
  const sent = await nextOf(deeAgain.ws, "kicked");
  assert(/banned/.test(sent.reason), `Dee is told she is banned: ${sent.reason}`);
  const bans = await nextOf(host, "bans");
  assert(bans.bans.length === 1 && bans.bans[0].name === "Dee" && bans.bans[0].address === "", `the ban keeps the name, not this computer's address: ${JSON.stringify(bans.bans)}`);
  const refused = await connect(port, { name: "dee", password: "pw", account: { token } });
  assert(refused.msg.type === "no" && refused.msg.banned, `a banned name is refused before the password: ${JSON.stringify(refused.msg)}`);
  const wrongPassword = await connect(port, { name: "Dee", password: "nope" });
  assert(wrongPassword.msg.banned, "refused for the ban, not the password");
  const elsewhere = await connect(port, { name: "Eve", password: "pw" });
  assert(elsewhere.msg.type === "ok", "others on this computer still sit (no address banned)");
  assert(server.persisted().bans.length === 1, "the Ban list is saved with the campaign");
  const reopened = createTableServer({ saved: server.persisted() });
  assert(reopened.agent.bans().length === 1, "and read back");
  assert(server.agent.kick("Zed", { ban: true }) === "Zed" && server.agent.bans().length === 2, "a name not at the table can be banned too");
  send(host, { type: "bans", action: "unban", name: "dee" });
  const unbanned = await nextOf(host, "bans", (msg) => msg.bans.length === 1);
  assert(unbanned.bans[0].name === "Zed", "Dee unbanned");
  const deeBack = await connect(port, { name: "Dee", password: "pw", account: { token } });
  assert(deeBack.msg.type === "ok", `Dee sits again after Unban: ${JSON.stringify(deeBack.msg)}`);
  assert(server.agent.unban("Zed") === "Zed", "the agent unbans");
  results.push("ban and unban");

  // --- The view pull: the players' maps are sent the GM's view; never while the map is not shared.
  let pullError = "";
  try {
    server.agent.pullView({ x: 1, y: 1, width: 100, height: 100 });
  } catch (error) {
    pullError = error.message;
  }
  assert(/No scene/.test(pullError), `no scene, no pull: ${pullError}`);
  send(host, { type: "scene", scene: { id: "hall", name: "Hall", width: 1000, height: 800, padding: 0, backgroundColor: "#111111", grid: { size: 50, type: 1, color: "#000000", alpha: 0.2, distance: 5, units: "ft" }, lights: [], tokens: [], walls: [] } });
  await nextOf(deeBack.ws, "scene", (msg) => msg.scene?.id === "hall");
  drain(deeBack.ws);
  send(host, { type: "view-pull", x: 400, y: 300, width: 600, height: 400 });
  const pulled = await nextOf(deeBack.ws, "view-pull");
  assert(pulled.x === 400 && pulled.y === 300 && pulled.width === 600 && pulled.from === "GM", `the GM's view reaches the player: ${JSON.stringify(pulled)}`);
  await nextOf(host, "notice", (msg) => /Pulled \d player/.test(msg.text));
  const square = server.agent.square(2, 3);
  assert(square.size === 50 && square.x === 125 && square.y === 175, `a square's centre for the agent's pull: ${JSON.stringify(square)}`);
  results.push("view pull");

  // --- View as: the GM's map through one player's eyes.
  drain(host);
  assert(server.agent.viewAs("Dee").viewingAs === "Dee", "view as Dee");
  const asDee = await nextOf(host, "map", (msg) => msg.previewing && msg.previewAs === "Dee");
  assert(asDee.previewAs === "Dee", "the GM's map says whose eyes");
  assert(server.agent.viewAs("").viewingAs === null, "view as ends");
  results.push("view as");

  console.log(`SESSION_TOOLS_OK ${results.join("; ")}`);
} finally {
  await server.stop();
}
process.exit(0);
