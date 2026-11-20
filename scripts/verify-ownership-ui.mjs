// In the real app with Chrome: the GM right-clicks a character's portrait and releases it; Steve (Chrome) opens it
// from Character Selection to look it over (nothing is his yet), then Takes it; the GM gives it to Brenda and back.
// Steve's settings follow his account: the UI scale he sets in one Chrome is there in another (a fresh profile,
// as next week's browser) as he signs in.
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
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-ownership-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1700, height: 1000 }).catch(() => undefined);
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
    answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content?.[0]?.text ?? "null");
};
let browser = null;
const report = [];
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-ownership", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Ownership", ruleset: "D&D 5E" });
  const port = 47511;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const zifnab = await tool("kraken_record_create", { type: "character", name: "Zifnab the Terrible", owner: "", visibility: "gm", data: { ruleset: "dnd5e", level: 3 } });

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = async (name) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const tab = await context.newPage();
    await tab.goto(`http://127.0.0.1:${port}/`);
    await tab.fill('input[name="name"]', name);
    await tab.fill('input[name="account-password"]', `${name.toLowerCase()}-pass`);
    await tab.fill('input[name="password"]', "pw");
    await tab.click('button[type="submit"]');
    await tab.waitForSelector(".sidebar");
    return { context, tab };
  };
  const steve = await seat("Steve");
  const brenda = await seat("Brenda");

  // The GM releases Zifnab from his portrait.
  await page.waitForSelector(`[data-portrait="${zifnab.id}"]`);
  await page.click(`[data-portrait="${zifnab.id}"]`, { button: "right" });
  await page.waitForSelector('.player-menu [data-menu="release"]');
  const offered = await page.$$eval(".player-menu button", (els) => els.map((el) => el.textContent.trim()));
  assert(offered.includes("Give to Steve") && offered.includes("Give to Brenda"), `the GM's menu: ${offered}`);
  await page.click('.player-menu [data-menu="release"]');
  await settle(800);
  report.push(`the GM's right-click on a portrait: ${offered.join(", ")}`);

  // Steve looks Zifnab over (his sheet opens; nothing is his yet), then takes him.
  // Character Selection is open already for a player with no character; else opened from the sidebar.
  if (!(await steve.tab.waitForSelector(`[data-charselect="${zifnab.id}"]`, { timeout: 4000 }).catch(() => null))) await steve.tab.click('.sidebar [data-launch="characters"]');
  await steve.tab.waitForSelector(`[data-charselect="${zifnab.id}"]`);
  await steve.tab.click(`[data-charselect="${zifnab.id}"]`);
  await steve.tab.waitForSelector('.window[data-window="sheet"]', { timeout: 15000 });
  assert((await tool("kraken_record_get", { id: zifnab.id })).owner === "", "looking binds nothing");
  await steve.tab.click(`[data-take="${zifnab.id}"]`);
  await settle(1000);
  assert((await tool("kraken_record_get", { id: zifnab.id })).owner === "Steve", "Take makes Zifnab Steve's");
  report.push("Steve opens a released character's sheet to look it over, then Takes it");

  // Tonight Brenda plays him; next week he goes back to Steve.
  await page.click(`[data-portrait="${zifnab.id}"]`, { button: "right" });
  await page.click('.player-menu [data-menu="give"][data-player="Brenda"]');
  await settle(800);
  assert((await tool("kraken_record_get", { id: zifnab.id })).owner === "Brenda", "given to Brenda");
  await page.click(`[data-portrait="${zifnab.id}"]`, { button: "right" });
  await page.click('.player-menu [data-menu="give"][data-player="Steve"]');
  await settle(800);
  assert((await tool("kraken_record_get", { id: zifnab.id })).owner === "Steve", "given back to Steve");
  report.push("the GM gives Zifnab to Brenda for the night, then back to Steve");

  // Steve's UI scale follows his account to another Chrome (a fresh profile: next week's browser).
  await steve.tab.click('.sidebar [data-launch="settings"]').catch(async () => steve.tab.click('[data-launch="settings"]'));
  await steve.tab.waitForSelector('[data-setting="ui-scale"]');
  await steve.tab.fill('[data-setting="ui-scale"]', "125");
  await steve.tab.press('[data-setting="ui-scale"]', "Enter");
  await settle(1500);
  await steve.context.close();
  const nextWeek = await seat("Steve");
  await settle(800);
  const scale = await nextWeek.tab.evaluate(() => [window.localStorage.getItem("kraken-ui-scale"), document.documentElement.style.zoom]);
  assert(scale[0] === "1.25" && scale[1] === "1.25", `his UI scale follows his account to another browser: ${scale}`);
  report.push("Steve's UI scale, set in one Chrome, is there in a fresh one as he signs in");
  console.log(`ok ownership ui:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
