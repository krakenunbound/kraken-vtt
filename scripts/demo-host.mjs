// A demo table for looking at the player's side by hand: starts the app
// (throwaway profile), hosts a campaign on port 47395 (password "pw"),
// imports the C&C Player's Handbook and Backpack, builds a Common Room
// pregen for player "Ann", puts a Foundry map on the table, and stays up
// until stopped. Players then open http://<this computer>:47395/ in a browser.
// node scripts/demo-host.mjs [bundle.zip] [scene name]
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";

const require = createRequire(import.meta.url);
const { fgDataFolder } = require("../electron/importers/fgModule.cjs");
const bundle = process.argv[2] ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Keep on the Borderlands (Foundry).zip`;
const sceneName = process.argv[3] ?? "Bandit Camp (Desert)";
const PORT = 47395;

const profile = mkdtempSync(path.join(tmpdir(), "kraken-demo-"));
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
    waits.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "demo-host", version: "1" } });
const campaign = await tool("kraken_campaign_create", { name: "Demo Table", ruleset: "Castles & Crusades" });
await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "pw" });
await tool("kraken_import_fg_module", { module: "C&C Player's Handbook" });
await tool("kraken_import_fg_module", { module: "C&C Adventurer's Backpack" });
const spec = JSON.parse(readFileSync(path.join(fgDataFolder(), "cc-conversion", "pregens", "specs", "aldric-3.json"), "utf8"));
const built = await tool("kraken_build_character", { spec, owner: "Ann" });
await tool("kraken_build_character", { spec: { ...JSON.parse(readFileSync(path.join(fgDataFolder(), "cc-conversion", "pregens", "specs", "garrick-1.json"), "utf8")) }, owner: "Bob" });
await page.setInputFiles("input.file-input", bundle);
await page.waitForSelector("[data-scene]", { timeout: 180000 });
const scene = page.getByLabel("Scene");
if (await scene.count()) {
  const value = await scene.locator("option", { hasText: sceneName }).first().getAttribute("value");
  if (value) await scene.selectOption(value);
}
await tool("kraken_chat_send", { text: "Welcome to the Keep. Ann, your paladin is on the Characters tab." });
console.log(`DEMO_READY http://127.0.0.1:${PORT}/ password pw; Ann owns ${built.id}; agent file ${env.KRAKEN_AGENT_FILE}`);
await new Promise(() => undefined);
