// Foundation test: dice, records and the built-in agent MCP, end to end.
// 1. Unit checks for dice.cjs and records.cjs.
// 2. Starts the real app (throwaway profile), talks to it as an MCP client
//    through electron/agent/mcp-stdio.cjs, hosts a campaign, makes records,
//    rolls fixed dice, joins as a player over WebSocket to check what a player
//    may see, then re-hosts to check everything was saved.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const require = createRequire(import.meta.url);
const { createDice, parse } = require("../electron/dice.cjs");
const { createRecordStore } = require("../electron/records.cjs");
const WebSocket = require("ws");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- dice -----------------------------------------------------------------
{
  assert(parse("4d6dl1")[0].keep.mode === "dl", "drop lowest parses");
  const dice = createDice({ seed: "fixed" });
  const a = dice.roll("3d6+2");
  const again = createDice({ seed: "fixed" }).roll("3d6+2");
  assert(a.total === again.total, "same seed, same roll");
  const resumed = createDice(dice.toJSON()).roll("1d20");
  const straight = createDice({ seed: "fixed" });
  straight.roll("3d6+2");
  assert(resumed.total === straight.roll("1d20").total, "saved state continues the sequence");
  dice.force([6, 1, 4, 3]);
  const dropped = dice.roll("4d6dl1");
  assert(dropped.total === 13 && dropped.terms[0].kept.join() === "true,false,true,true", `4d6dl1 fixed ${JSON.stringify(dropped)}`);
  dice.force([17]);
  assert(dice.roll("1d20+3").total === 20, "1d20+3 fixed 17");
  dice.force([4, 15]);
  assert(dice.roll("2d20kh1").total === 15, "advantage keeps highest");
  for (const bad of ["", "d", "1d1", "201d6", "2d6+", "abc"]) {
    let threw = false;
    try {
      dice.roll(bad);
    } catch {
      threw = true;
    }
    assert(threw, `"${bad}" should be refused`);
  }
  for (let i = 0; i < 2000; i += 1) {
    const value = dice.roll("1d20").total;
    assert(value >= 1 && value <= 20, "1d20 range");
  }
}

// --- records --------------------------------------------------------------
{
  const gm = { role: "dm", name: "DM" };
  const ann = { role: "player", name: "Ann" };
  const bob = { role: "player", name: "Bob" };
  const store = createRecordStore();
  const secret = store.create({ type: "npc", name: "Troll" }, gm);
  const hero = store.create({ type: "character", name: "Halvar", owner: "Ann", visibility: "owner", data: { hp: { total: 9 } } }, gm);
  const map = store.create({ type: "note", name: "Rumors", visibility: "all" }, gm);
  assert(store.list({ seat: ann }).map((r) => r.id).sort().join() === [hero.id, map.id].sort().join(), "Ann sees her character and the public note");
  assert(store.list({ seat: bob }).map((r) => r.id).join() === map.id, "Bob sees only the public note");
  assert(store.get(secret.id, ann) === null, "players cannot read GM records");
  store.update(hero.id, { data: { hp: { wounds: 2 } } }, ann);
  assert(store.get(hero.id).data.hp.total === 9 && store.get(hero.id).data.hp.wounds === 2, "update deep-merges");
  let refused = false;
  try {
    store.update(hero.id, { name: "Stolen" }, bob);
  } catch {
    refused = true;
  }
  assert(refused, "Bob cannot edit Ann's character");
  const own = store.create({ type: "character", name: "Bob's", owner: "Ann" }, bob);
  assert(own.owner === "Bob" && own.visibility === "owner", "a player's new record is theirs");
  const reloaded = createRecordStore({ saved: JSON.parse(JSON.stringify(store.toJSON())) });
  assert(reloaded.list().length === 4, "records reload from JSON");
}
console.log("ok dice and records");

// --- the app, as an MCP client -------------------------------------------
const profile = mkdtempSync(path.join(tmpdir(), "kraken-agent-"));
const agentFile = path.join(profile, "agent.json");
const env = { ...process.env, KRAKEN_AGENT_FILE: agentFile, KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");

const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
function rpc(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 60000);
    answers.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return result.content[0].type === "text" ? JSON.parse(text) : result.content[0];
}

try {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  assert(init.serverInfo.name === "kraken-vtt", "MCP initialize");
  const { tools } = await rpc("tools/list");
  const names = tools.map((item) => item.name);
  for (const needed of ["kraken_status", "kraken_host", "kraken_record_create", "kraken_roll", "kraken_ui_screenshot"]) {
    assert(names.includes(needed), `tool ${needed} listed`);
  }

  const status = await tool("kraken_status");
  assert(status.hosting === false, "not hosting at start");
  const campaign = await tool("kraken_campaign_create", { name: "Agent Table", ruleset: "Castles & Crusades" });
  const port = 47388;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const hosting = await tool("kraken_status");
  assert(hosting.hosting === true && hosting.campaignId === campaign.id, `hosting ${JSON.stringify(hosting)}`);

  const npc = await tool("kraken_record_create", { type: "npc", name: "Troll", data: { hp: 30 } });
  const hero = await tool("kraken_record_create", { type: "character", name: "Halvar", owner: "Ann", visibility: "owner", data: { level: 1 } });
  await tool("kraken_record_update", { id: hero.id, data: { level: 2 } });
  assert((await tool("kraken_record_get", { id: hero.id })).data.level === 2, "agent update");

  await tool("kraken_dice_force", { values: [6, 1, 4, 3] });
  const roll = await tool("kraken_roll", { formula: "4d6dl1", label: "Strength" });
  assert(roll.total === 13, `fixed roll ${roll.total}`);
  const log = await tool("kraken_chat_log", { count: 5 });
  assert(log.some((line) => line.roll?.total === 13 && line.roll.label === "Strength"), "roll in chat");
  await page.waitForSelector('.chat-dock .roll-card[data-total="13"]');

  // Players open the host's address in a browser: the page and its script come from the host.
  const pageHtml = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert(pageHtml.includes("<title>Kraken VTT</title>"), "host serves the web client");
  const script = /src="\.?\/?(assets\/[^"]+\.js)"/.exec(pageHtml)?.[1];
  assert(script && (await fetch(`http://127.0.0.1:${port}/${script}`)).ok, `host serves ${script}`);
  assert((await fetch(`http://127.0.0.1:${port}/../package.json`)).status === 404, "no files outside the web client");

  // A player joins over the table's WebSocket.
  const player = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  player.on("message", (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    player.once("open", resolve);
    player.once("error", reject);
  });
  player.send(JSON.stringify({ type: "join", name: "Ann", password: "pw" }));
  const waitFor = async (test, label) => {
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const found = inbox.find(test);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(label);
  };
  const ok = await waitFor((m) => m.type === "ok", "player join");
  const seen = ok.records.map((record) => record.id);
  assert(seen.includes(hero.id) && !seen.includes(npc.id), `Ann sees ${seen.join(",")}`);

  // A GM-only record turned public reaches the player; the player cannot edit the NPC.
  await tool("kraken_record_update", { id: npc.id, visibility: "all" });
  await waitFor((m) => m.type === "record" && m.record.id === npc.id, "NPC reached player when made public");
  player.send(JSON.stringify({ type: "op", req: 1, op: "update", id: npc.id, patch: { name: "Mine" } }));
  const refused = await waitFor((m) => m.type === "op-result" && m.req === 1, "op answer");
  assert(refused.ok === false, "player cannot edit the NPC");
  player.send(JSON.stringify({ type: "op", req: 2, op: "update", id: hero.id, patch: { data: { notes: "brave" } } }));
  assert((await waitFor((m) => m.type === "op-result" && m.req === 2, "op answer")).ok === true, "player edits own character");
  await tool("kraken_record_update", { id: npc.id, visibility: "gm" });
  await waitFor((m) => m.type === "record-gone" && m.id === npc.id, "NPC removed from player when hidden again");
  player.close();

  const shot = await tool("kraken_ui_screenshot");
  assert(shot.type === "image" && shot.data.length > 1000, "screenshot");

  // Leave and host again: records, chat and dice state come back.
  await tool("kraken_leave");
  await page.waitForSelector("text=My Campaigns");
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  const again = await tool("kraken_records_list", {});
  const kept = again.records.filter((record) => record.type !== "party");
  assert(kept.length === 2, `records after re-host ${kept.length} (plus the party sheet)`);
  assert((await tool("kraken_record_get", { id: hero.id })).data.notes === "brave", "player's edit was saved");
  assert((await tool("kraken_chat_log", { count: 5 })).some((line) => line.roll?.total === 13), "chat was saved");
  await tool("kraken_leave");
  console.log("ok agent MCP: host, records, permissions, fixed dice, chat, screenshot, save and reload");
} finally {
  child.stdin.end();
  await app.close();
}
