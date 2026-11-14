// The GM shares the map with the players (FG's Share on an image): a test
// player who closed the map window gets it back when the GM presses Share
// with players on the map window, and again when the agent shares it
// (kraken_map share). The map is a Traveller ship's deck plans.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-map-share-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
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
  return JSON.parse(text);
}
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const chat = (where, text) => where.waitForFunction((wanted) => document.body.textContent.includes(wanted), text, { timeout: 10000 });
// A token's picture (its art URL names the art id).
const agentArt = (tokens, recordId) => decodeURIComponent(String(tokens.find((token) => token.recordId === recordId)?.art ?? ""));
const until = async (test, what) => {
  for (let wait = 0; wait < 60; wait++) {
    const value = await test();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out: ${what}`);
};

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Map share", ruleset: "Traveller" });
  const port = 47431;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const ship = await tool("kraken_starship", { action: "create", name: "Rusty Lark", design: "Free Trader" });
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  // The GM opens the ship's deck plans: the map opens for the player.
  await page.click('.sidebar [data-launch="ships"]');
  await page.click(`[data-ship="${ship.id}"]`);
  await page.click('[data-action="ship-deck-plans"]');
  await seat.waitForSelector("[data-scene]", { timeout: 20000 });
  // The player closes it; the GM shares it: it opens again.
  const close = async () => {
    await seat.click('[data-window="map"] button[aria-label^="Close"]');
    await seat.waitForSelector("[data-scene]", { state: "detached", timeout: 5000 });
  };
  await close();
  await page.click('[data-window="ships"] button[aria-label^="Close"]');
  await page.click('[data-action="map-share"]');
  await seat.waitForSelector("[data-scene]", { timeout: 10000 });
  assert((await seat.getAttribute("[data-scene]", "data-scene")) === "Rusty Lark: Deck 1", "the shared map is the deck plan");
  await close();
  const shared = await tool("kraken_map", { share: true });
  assert(shared.shared === "Rusty Lark: Deck 1", `the agent shared it: ${JSON.stringify(shared)}`);
  await seat.waitForSelector("[data-scene]", { timeout: 10000 });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-map-share-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok map share ui: the GM's deck plan opens for a test player; closed, it opens again when the GM presses Share with players, and again by kraken_map share. ${path.join(tmpdir(), "kraken-map-share-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
