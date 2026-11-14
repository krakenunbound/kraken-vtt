// How long the dice stay on the table, in the real app: the GM sets the
// seconds in Settings (a slider and a number), every seat gets the option, a
// test player's browser too, and a roll's dice leave the table that long after
// they land (plus their short shrink); a longer setting keeps them there.
// Screenshots go to the temp folder.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-dice-hold-"));
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

// How long a roll's dice lie on a screen's table after they land (ms).
async function timeOnTable(where) {
  await where.waitForFunction(() => document.querySelector(".dice-layer")?.dataset.onTable === "0" || !document.querySelector(".dice-layer")?.dataset.onTable, null, { timeout: 30000 });
  await where.evaluate(() => delete document.querySelector(".dice-layer").dataset.landedAt);
  await tool("kraken_roll", { formula: "2d6", label: "Hold test" });
  await where.waitForFunction(() => Number(document.querySelector(".dice-layer")?.dataset.onTable) > 0, null, { timeout: 15000 });
  await where.waitForFunction(() => document.querySelector(".dice-layer")?.dataset.landedAt, null, { timeout: 15000 });
  const landed = Number(await where.evaluate(() => document.querySelector(".dice-layer").dataset.landedAt));
  await where.waitForFunction(() => document.querySelector(".dice-layer")?.dataset.onTable === "0", null, { timeout: 70000 });
  return (await where.evaluate(() => performance.now())) - landed;
}

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Dice hold", ruleset: "Worldbuilding" });
  const port = 47418;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  assert((await tool("kraken_table_options")).diceHold === 2.6, "2.6 seconds until the GM says otherwise");

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The GM's Settings: the seconds typed in.
  await page.click('[data-launch="settings"], [title="Settings"]');
  await page.waitForSelector('[data-setting="dice-hold"]');
  await page.fill('[data-setting="dice-hold"]', "1");
  await page.press('[data-setting="dice-hold"]', "Enter");
  for (let wait = 0; wait < 40 && (await tool("kraken_table_options")).diceHold !== 1; wait++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert((await tool("kraken_table_options")).diceHold === 1, "the GM's setting: 1 second");
  const short = await timeOnTable(seat);
  assert(short > 900 && short < 2600, `a test player's dice leave 1 s (and a shrink) after landing: ${Math.round(short)} ms`);
  const shortGM = await timeOnTable(page);
  assert(shortGM > 900 && shortGM < 2600, `and the GM's: ${Math.round(shortGM)} ms`);

  // The slider: 6 seconds; the dice stay that long.
  const slider = page.locator('[data-setting="dice-hold-slider"]');
  await slider.evaluate((element) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(element, "6");
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await slider.dispatchEvent("pointerup");
  for (let wait = 0; wait < 40 && (await tool("kraken_table_options")).diceHold !== 6; wait++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert((await tool("kraken_table_options")).diceHold === 6 && (await page.inputValue('[data-setting="dice-hold"]')) === "6", "the slider: 6 seconds, the number beside it too");
  const long = await timeOnTable(seat);
  assert(long > 5900 && long < 8000, `6 s on the test player's table: ${Math.round(long)} ms`);
  // Out of range: kept within 0.5 to 60.
  assert((await tool("kraken_table_options", { diceHold: 500 })).diceHold === 60 && (await tool("kraken_table_options", { diceHold: 0 })).diceHold === 0.5, "kept within 0.5 to 60 seconds");
  // Rolls one after another lie side by side, not inside each other (a picture to look at).
  await tool("kraken_table_options", { diceHold: 10 });
  for (let n = 0; n < 4; n++) {
    await tool("kraken_roll", { formula: "4d6", label: `Pile ${n}` });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 4500));
  await page.screenshot({ path: path.join(tmpdir(), "kraken-dice-pile.png") });
  await new Promise((resolve) => setTimeout(resolve, 11000));
  await page.locator(".settings-window").screenshot({ path: path.join(tmpdir(), "kraken-dice-hold-setting.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-dice-hold.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok dice hold: the GM's Settings set how long dice stay (typed 1 s: ${Math.round(short)} ms on a test player's table, ${Math.round(shortGM)} ms on the GM's; the slider's 6 s: ${Math.round(long)} ms), clamped to 0.5-60 s`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
