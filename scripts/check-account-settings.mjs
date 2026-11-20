// A player's account carries them: their layout and interface settings (each screen's "kraken-" settings: windows,
// sidebar, chat size, UI scale...) kept by the GM's app with their account, sent back wherever they sit down next
// (the app or any browser), saved across a restart; their characters stay theirs when they sign in again. What
// belongs to one device (signing in, the tables it joined) is never kept with the account.
import "./loopback.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer, diceLook } = require("../electron/tableServer.cjs");
const { createAccountStore } = require("../electron/accounts.cjs");
const { createPrefsStore } = require("../electron/prefs.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-account-settings-"));
const accounts = createAccountStore(path.join(dir, "accounts.json"));
accounts.create("Steve", "steve-pass");
const prefsFile = path.join(dir, "prefs.json");
const open = (prefs) => createTableServer({ accounts, prefs });
const sockets = [];
const sit = (port, join) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    ws.on("message", (raw) => inbox.push(JSON.parse(raw.toString())));
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", password: "", ...join })));
    const poll = setInterval(() => {
      const ok = inbox.find((msg) => msg.type === "ok");
      const refused = inbox.find((msg) => msg.type === "refused" || msg.type === "denied");
      if (ok) (clearInterval(poll), sockets.push(ws), resolve({ ws, inbox, ok }));
      else if (refused) (clearInterval(poll), reject(new Error(JSON.stringify(refused))));
    }, 10);
  });
const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  // Monday, in the app: Steve signs in, makes his character his, and arranges his screen.
  const server = open(createPrefsStore(prefsFile, diceLook));
  const { port } = await server.listen({ port: 0, password: "" });
  const zifnab = server.agent.records.create({ type: "character", name: "Zifnab the Terrible", owner: "", visibility: "all", data: {} }, server.agent.seat);
  const monday = await sit(port, { name: "steve", account: { password: "steve-pass" } });
  assert(monday.ok.you.name === "Steve", `signed in under his account's name: ${monday.ok.you.name}`);
  monday.ws.send(JSON.stringify({ type: "take-character", req: 1, id: zifnab.id }));
  monday.ws.send(JSON.stringify({ type: "prefs", patch: { ui: { "kraken-ui-scale": "1.25", "kraken-sidebar": '{"state":"open"}', "kraken-window:chat": '{"x":40,"y":600}', "kraken-signin:keep": "secret", "kraken-recent-games": "[]", "not-ours": "x" } } }));
  await settle(400);
  const kept = createPrefsStore(prefsFile, diceLook).get("Steve").ui ?? {};
  assert(kept["kraken-ui-scale"] === "1.25" && kept["kraken-sidebar"] === '{"state":"open"}' && kept["kraken-window:chat"] === '{"x":40,"y":600}', `his settings are kept with his account: ${JSON.stringify(kept)}`);
  assert(!("kraken-signin:keep" in kept) && !("kraken-recent-games" in kept) && !("not-ours" in kept), "signing in, the tables a device joined and anything else are not");
  monday.ws.close();
  await server.stop();

  // Next week, in Chrome, after the GM's app restarted: the settings and the character come back.
  const again = open(createPrefsStore(prefsFile, diceLook));
  const port2 = (await again.listen({ port: 0, password: "" })).port;
  again.agent.records.create({ ...zifnab, owner: "Steve" }, again.agent.seat);
  const nextWeek = await sit(port2, { name: "STEVE", account: { password: "steve-pass" } });
  assert(nextWeek.ok.prefs?.ui?.["kraken-ui-scale"] === "1.25" && nextWeek.ok.prefs.ui["kraken-window:chat"] === '{"x":40,"y":600}', `his settings arrive as he sits down: ${JSON.stringify(nextWeek.ok.prefs)}`);
  assert(nextWeek.ok.you.name === "Steve" && again.agent.records.list({ type: "character", owner: nextWeek.ok.you.name }).some((record) => record.name === "Zifnab the Terrible"), "his character is still his, whatever case he typed");
  // Signing in again elsewhere takes the seat; a change made there is his next time too.
  const second = await sit(port2, { name: "Steve", account: { token: nextWeek.ok.you.accountToken } });
  second.ws.send(JSON.stringify({ type: "prefs", patch: { ui: { "kraken-chat-size": '{"w":500,"h":400}', "kraken-ui-scale": null } } }));
  await settle(400);
  const third = await sit(port2, { name: "Steve", account: { token: nextWeek.ok.you.accountToken } });
  assert(third.ok.prefs.ui["kraken-chat-size"] === '{"w":500,"h":400}' && !("kraken-ui-scale" in third.ok.prefs.ui), `a change on one screen, and one taken away, are his next time: ${JSON.stringify(third.ok.prefs.ui)}`);
  console.log("ok account settings: layout and interface settings kept with the account (not signing in or a device's tables), back on any screen after a restart, changes from any screen; characters stay the account's");
  await again.stop();
} finally {
  for (const ws of sockets) ws.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
