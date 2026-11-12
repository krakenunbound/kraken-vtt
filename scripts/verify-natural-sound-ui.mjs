// A natural 20 and a natural 1 are heard on every screen: the GM's (Kraken)
// and a test player's (Chrome). A d20 rolled to 20 (the agent's roll, for the
// table) and one rolled to 1 (the player's, from their dice tray): each screen
// plays the fanfare and the sad trombone, its meter reading the sound's own
// level as it plays, with the browser's audio running (not held shut).
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-natural-sound-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "Natural sound", ruleset: "Castles & Crusades" });
  const port = 47437;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  // Joining is a click: the browser lets the page's audio start (as for any player who took their seat).
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.waitForSelector(".dice-tray");
  const sound = (where) => where.evaluate(() => document.documentElement.dataset.naturalSound ?? "");
  const heard = async (where, kind, after, who) => {
    for (let wait = 0; wait < 100; wait++) {
      const value = await sound(where);
      const [k, state, peak, count] = value.split(":");
      if (k === kind && Number(count) > after) {
        assert(state === "running" && Number(peak) > 0.02, `${who} heard the ${kind === "high" ? "fanfare" : "trombone"}: ${value}`);
        return Number(count);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`${who}: no ${kind === "high" ? "fanfare" : "trombone"} (${await sound(where)})`);
  };
  // A natural 20, the table's roll: both screens.
  await tool("kraken_dice_force", { values: [20] });
  await tool("kraken_roll", { formula: "1d20+4", label: "[ATTACK] Longsword", as: "Agent" });
  const gmHigh = await heard(page, "high", 0, "the GM");
  const seatHigh = await heard(seat, "high", 0, "the player");
  // A natural 1, the player's own roll from their tray: both screens.
  await tool("kraken_dice_force", { values: [1] });
  await seat.click('.dice-tray button[aria-label="d20"]');
  await seat.click(".dice-pool .play-button");
  const seatLow = await heard(seat, "low", seatHigh, "the player");
  const gmLow = await heard(page, "low", gmHigh, "the GM");
  const levels = [await sound(page), await sound(seat)];
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok natural sound ui: a natural 20 plays the fanfare and a natural 1 the sad trombone on the GM's screen and a test player's, each with its audio running and its meter reading the sound (GM ${levels[0]}, player ${levels[1]}; plays ${gmLow}, ${seatLow})`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
