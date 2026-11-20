// A player who joins from the Maelstrom app (Join a Game), not a browser: Steve, in his own copy of the app,
// joins the GM's table, takes the character the GM released and sets his UI scale; next week he joins from
// Chrome (a fresh profile) and finds both: the character his, the scale as he left it.
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
const launch = async (name) => {
  const profile = mkdtempSync(path.join(tmpdir(), `kraken-app-player-${name}-`));
  const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
  const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1600, height: 950 }).catch(() => undefined);
  await page.waitForSelector("text=My Campaigns");
  return { app, page, env };
};
const gm = await launch("gm");
const steveApp = await launch("steve");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env: gm.env, stdio: ["pipe", "pipe", "inherit"] });
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
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-app-player", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "App player", ruleset: "D&D 5E" });
  const port = 47513;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await gm.page.waitForSelector("text=Hosting");
  const zifnab = await tool("kraken_record_create", { type: "character", name: "Zifnab the Terrible", owner: "", visibility: "gm", data: { ruleset: "dnd5e", level: 3 } });
  await tool("kraken_characters", { action: "release", id: zifnab.id });

  // Steve joins from his own Maelstrom app: Join a Game, the GM's address and port.
  const page = steveApp.page;
  await page.click('[data-action="join-mode"]');
  await page.waitForSelector('input[name="address"]:not([type="hidden"])');
  await page.fill('input[name="name"]', "Steve");
  await page.fill('input[name="account-password"]', "steve-pass");
  await page.fill('input[name="address"]:not([type="hidden"])', "127.0.0.1");
  await page.fill('input[name="port"]:not([type="hidden"])', String(port));
  await page.fill('input[name="password"]', "pw");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".sidebar", { timeout: 30000 });
  report.push("Steve joins the GM's table from his own Maelstrom app (Join a Game)");

  // He looks Zifnab over, then takes him.
  if (!(await page.waitForSelector(`[data-charselect="${zifnab.id}"]`, { timeout: 5000 }).catch(() => null))) await page.click('.sidebar [data-launch="characters"]');
  await page.click(`[data-charselect="${zifnab.id}"]`);
  await page.waitForSelector('.window[data-window="sheet"]', { timeout: 15000 });
  assert((await tool("kraken_record_get", { id: zifnab.id })).owner === "", "looking binds nothing");
  await page.click(`[data-take="${zifnab.id}"]`);
  await settle(1000);
  assert((await tool("kraken_record_get", { id: zifnab.id })).owner === "Steve", "Zifnab is Steve's");
  report.push("in the app he looks Zifnab over, then Takes him");

  // His UI scale, set in the app.
  await page.click('.sidebar [data-launch="settings"]');
  await page.waitForSelector('[data-setting="ui-scale"]');
  await page.fill('[data-setting="ui-scale"]', "125");
  await page.press('[data-setting="ui-scale"]', "Enter");
  await settle(1500);
  await steveApp.app.close();
  report.push("he sets his UI scale to 125% in the app and closes it");

  // Next week, Chrome: his scale and his character are there.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const tab = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await tab.goto(`http://127.0.0.1:${port}/`);
  await tab.fill('input[name="name"]', "Steve");
  await tab.fill('input[name="account-password"]', "steve-pass");
  await tab.fill('input[name="password"]', "pw");
  await tab.click('button[type="submit"]');
  await tab.waitForSelector(".sidebar");
  await settle(800);
  const scale = await tab.evaluate(() => [window.localStorage.getItem("kraken-ui-scale"), document.documentElement.style.zoom]);
  assert(scale[0] === "1.25" && scale[1] === "1.25", `his app's UI scale is there in Chrome: ${scale}`);
  await tab.waitForSelector(`.portrait-strip [data-portrait="${zifnab.id}"]`);
  assert((await tab.textContent(`.portrait-strip [data-portrait="${zifnab.id}"]`)).includes("Steve") || (await tool("kraken_record_get", { id: zifnab.id })).owner === "Steve", "and Zifnab is still his");
  report.push("next week in Chrome: his 125% UI scale and Zifnab, his");
  console.log(`ok app player ui:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await steveApp.app.close().catch(() => undefined);
  await gm.app.close().catch(() => undefined);
}
