// Step 1 test: import the GM's C&C modules into a hosted campaign through the
// agent MCP, and compare with what Fantasy Grounds itself holds, live, through
// the Kraken Agent Bridge daemon (127.0.0.1:47111). FG must be running with a
// SiegeCore campaign that has the modules loaded; modules FG has not loaded
// are compared with the file only.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const require = createRequire(import.meta.url);
const { readModule } = require("../electron/importers/fgModule.cjs");

const MODULES = ["C&C Player's Handbook", "C&C Monsters & Treasure", "C&C Castle Keeper's Guide", "C&C Adventurer's Backpack", "B2 The Keep on the Borderlands (C&C)"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fg(cmd, args) {
  const response = await fetch("http://127.0.0.1:47111/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd, args, timeout: 30 }),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(`FG ${cmd}: ${body.error}`);
  return body.data;
}

async function fgLoaded(name) {
  try {
    const info = await fg("call", { package: "Module", fn: "getModuleInfo", args: [name] });
    return info.result?.[0]?.loaded === true;
  } catch {
    return false;
  }
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-import-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const waits = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  waits.get(message.id)?.(message);
});
let next = 0;
function rpc(method, params) {
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    waits.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check-import", version: "1" } });
  const listed = await tool("kraken_fg_modules", { filter: "C&C" });
  for (const name of MODULES) assert(listed.includes(name), `module ${name} installed`);
  const campaign = await tool("kraken_campaign_create", { name: "Import Test", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47389, password: "" });

  for (const name of MODULES) {
    const result = await tool("kraken_import_fg_module", { module: name });
    const file = readModule(name);
    assert(result.records === file.records.length, `${name}: imported ${result.records} of ${file.records.length}`);
    const loaded = await fgLoaded(name);
    const checked = [];
    if (loaded) {
      // FG's own count of each record type in this module.
      for (const [type, count] of Object.entries(result.counts)) {
        if (type === "refpage" || type === "refindex") continue;
        const fgCount = (await fg("call", { package: "DB", fn: "getChildCount", args: [`${type}@${name}`] })).result?.[0];
        assert(fgCount === count, `${name} ${type}: Kraken ${count}, FG ${fgCount}`);
        checked.push(`${type} ${count}`);
      }
    }
    console.log(`ok ${name}: ${result.records} records${loaded ? ` (FG agrees: ${checked.join(", ")})` : " (not loaded in FG; file only)"}`);
  }

  // A record read through Kraken matches FG field for field.
  const fighter = await tool("kraken_record_get", { id: "c-c-player-s-handbook:siegepackage.cc_fighter" });
  const fgLevel = (await fg("db_get", { path: "siegepackage.cc_fighter.levels.l05@C&C Player's Handbook", depth: 2 })).value;
  assert(JSON.stringify(fighter.data.levels.l05) === JSON.stringify({ level: fgLevel.level, xp: fgLevel.xp, bth: fgLevel.bth, hd: fgLevel.hd }), "Fighter level 5 row matches FG");
  assert(fighter.visibility === "all" && fighter.source === "C&C Player's Handbook", "PHB records are public and sourced");

  // Re-import replaces rather than doubles.
  const before = (await tool("kraken_records_list", { source: "C&C Player's Handbook", limit: 1 })).total;
  await tool("kraken_import_fg_module", { module: "C&C Player's Handbook" });
  const after = (await tool("kraken_records_list", { source: "C&C Player's Handbook", limit: 1 })).total;
  assert(before === after, `re-import kept ${after} (was ${before})`);
  await tool("kraken_leave");
  console.log("ok import: counts and fields match Fantasy Grounds");
} finally {
  child.stdin.end();
  await app.close();
}
