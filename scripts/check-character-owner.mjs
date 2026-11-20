// Who holds a character, the GM's say: Steve can't come tonight, so the GM gives Zifnab to Brenda (her tokens
// now, she plays it); next week the GM gives it back to Steve. Steve's character dies: the GM releases the pregens,
// Steve looks them over (he may read them, nothing is his yet) and takes one; the GM keeps the rest (hidden, not
// to be taken). Only the GM gives, releases or keeps; a player takes only what is released.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const server = createTableServer();
const sockets = [];
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const tool = async (name, args = {}) => JSON.parse((await callTool(name, args, { table: () => server })).content[0].text);
  const join = (name, extra = {}) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const inbox = [];
      ws.on("message", (raw) => inbox.push(JSON.parse(raw.toString())));
      ws.on("error", reject);
      ws.on("open", () => ws.send(JSON.stringify({ type: "join", name, password: "", ...extra })));
      const poll = setInterval(() => inbox.some((msg) => msg.type === "ok") && (clearInterval(poll), sockets.push(ws), resolve({ ws, inbox })), 10);
    });
  const reply = async (seat, body) => {
    const req = Math.floor(Math.random() * 1e9);
    seat.ws.send(JSON.stringify({ ...body, req }));
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const found = seat.inbox.find((msg) => msg.type === "op-result" && msg.req === req);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`no answer to ${body.type}`);
  };
  const gm = await join("GM", { hostToken });
  const steve = await join("Steve");
  const brenda = await join("Brenda");
  const zifnab = agent.records.create({ type: "character", name: "Zifnab the Terrible", owner: "Steve", visibility: "owner", data: { level: 3 } }, agent.seat);
  agent.map.setScene({ id: "keep", name: "Keep", width: 500, height: 500, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, walls: [], lights: [], tokens: [] });
  const token = agent.map.place({ recordId: zifnab.id, col: 2, row: 2 }, agent.seat);
  assert(token.owner === "Steve", `Zifnab's token is Steve's: ${token.owner}`);

  // Tonight Brenda plays Zifnab.
  assert((await reply(brenda, { type: "character-owner", id: zifnab.id, action: "give", player: "Brenda" })).ok === false, "a player cannot give a character");
  assert((await reply(gm, { type: "character-owner", id: zifnab.id, action: "give", player: "Brenda" })).ok, "the GM gives Zifnab to Brenda");
  assert(agent.records.get(zifnab.id).owner === "Brenda", "Zifnab is Brenda's");
  assert(agent.map.tokens().find((item) => item.id === token.id).owner === "Brenda", "and so is his token: she moves it");
  // Next week Steve is back.
  await tool("kraken_characters", { action: "give", id: zifnab.id, owner: "Steve" });
  assert(agent.records.get(zifnab.id).owner === "Steve" && agent.map.tokens().find((item) => item.id === token.id).owner === "Steve", "given back to Steve, with his token");

  // Steve's character died: the GM's pregens. Kept (the GM's own), Steve can neither read nor take them.
  const pregen = agent.records.create({ type: "character", name: "Pregen Fighter", owner: "", visibility: "gm", data: { level: 1 } }, agent.seat);
  const other = agent.records.create({ type: "character", name: "Pregen Mage", owner: "", visibility: "gm", data: { level: 1 } }, agent.seat);
  const taken = await reply(steve, { type: "take-character", id: pregen.id });
  assert(taken.ok === false && /GM's/.test(taken.error), `the GM's own cannot be taken: ${JSON.stringify(taken)}`);
  // Released: Steve may look them over (they reach his screen) before choosing.
  assert((await reply(gm, { type: "character-owner", id: pregen.id, action: "release" })).ok, "the GM releases the fighter");
  await tool("kraken_characters", { action: "release", id: other.id });
  const roster = (await tool("kraken_characters", { action: "roster" })).roster;
  assert(roster.find((item) => item.id === pregen.id).released === true && roster.find((item) => item.id === zifnab.id).released === false, `the roster says what is released: ${JSON.stringify(roster)}`);
  const seesPregens = async () => {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const ids = new Set();
      for (const msg of steve.inbox) {
        for (const record of msg.records ?? msg.state?.records ?? []) ids.add(record.id);
        if (msg.record?.id) ids.add(msg.record.id);
      }
      if (ids.has(pregen.id) && ids.has(other.id)) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };
  assert(await seesPregens(), "Steve can read the released pregens before choosing");
  assert(agent.records.get(pregen.id).owner === "" && agent.records.get(other.id).owner === "", "looking binds nothing: no one holds them");
  assert((await reply(steve, { type: "take-character", id: other.id })).ok, "Steve takes the mage");
  assert(agent.records.get(other.id).owner === "Steve", "the mage is Steve's");
  assert((await reply(brenda, { type: "take-character", id: other.id })).ok === false, "and no one else's");
  // The GM keeps the fighter again: hidden, not to be taken.
  await tool("kraken_characters", { action: "keep", id: pregen.id });
  assert(agent.records.get(pregen.id).visibility === "gm" && (await reply(brenda, { type: "take-character", id: pregen.id })).ok === false, "kept: the GM's again");
  console.log("ok character owner: the GM gives a character to another player and back (its tokens follow), releases pregens for a player to look over and take, and keeps its own; players take only what is released");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop?.();
}
process.exit(0);
