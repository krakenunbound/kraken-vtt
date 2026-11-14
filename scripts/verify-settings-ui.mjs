// The Settings window, as the GM and as a player see it: titled sections,
// each setting a short label with a line of what it does and its control on
// the right (a switch for on and off), and the ruleset's character wizard
// options as a checklist (AD&D 2E's here). The switches still set what they
// set: the GM's lock and an ability method reach the table's options, the
// player's chime reaches their own settings. Screenshots of both windows go to
// SHOTS (or the temp folder).
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = process.env.SHOTS || tmpdir();
const profile = mkdtempSync(path.join(tmpdir(), "kraken-settings-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = process.env.KRAKEN_APP
  ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
const report = [];
let browser = null;
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Settings look", ruleset: "AD&D 2E" });
  const port = 47469;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // The GM's Settings.
  await page.click('[data-launch="settings"]');
  const gmWindow = page.locator('.window[data-window="settings"]');
  await gmWindow.waitFor();
  await page.evaluate(() => {
    const win = document.querySelector('.window[data-window="settings"]');
    if (win) Object.assign(win.style, { height: "900px", width: "640px", top: "40px" });
  });
  await settle(300);
  for (const title of ["You at the table", "Ability cards", "Dice and the dice tower", "Combat", "AD&D 2E character wizard"]) {
    assert((await gmWindow.locator(".set-section > legend", { hasText: title }).count()) === 1, `the GM's Settings has the section ${title}`);
  }
  // No label runs into its explanation: each switch row has a short label and a hint apart.
  const rows = await gmWindow.locator("label.set-row").evaluateAll((items) => items.map((row) => ({ label: row.querySelector(".set-label")?.textContent ?? "", hint: row.querySelector(".set-hint")?.textContent ?? "", switch: row.querySelector('input[role="switch"]') !== null })));
  assert(rows.length >= 6 && rows.every((row) => row.switch && row.label.length > 0 && row.label.length <= 40), `switch rows with short labels: ${JSON.stringify(rows)}`);
  // The 2E methods sit in columns of whole lines, not squeezed: each box at least 12rem wide.
  const widths = await gmWindow.locator('[data-setting="wizard2e"] .set-check').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
  assert(widths.length === 6 && widths.every((width) => width >= 180), `the six methods are wide enough to read: ${widths.map(Math.round)}`);
  await gmWindow.screenshot({ path: path.join(SHOTS, "kraken-settings-gm.png") });
  const wizard = gmWindow.locator('[data-setting="wizard2e"]');
  await wizard.scrollIntoViewIfNeeded();
  await wizard.screenshot({ path: path.join(SHOTS, "kraken-settings-gm-2e.png") });
  // The switches still set the table's options.
  await page.click('[data-setting="wizard2e-lock"]');
  await page.click('[data-setting="wizard2e-method3"]');
  await settle(600);
  const options = await tool("kraken_table_options");
  assert(options.wizard2e?.rollLock === true && !options.wizard2e.methods.includes(3), `the lock and Method III reached the table: ${JSON.stringify(options.wizard2e)}`);
  await page.click('[data-setting="tower-external"]');
  await settle(500);
  assert((await tool("kraken_table_options")).towerExternal === true && (await page.locator('[data-setting="tower-look"]').count()) === 1, "the tower switch puts it on the table and offers its look");
  report.push("the GM's Settings: five sections, switch rows with short labels and their hints, the 2E methods as a readable checklist; the lock, a method and the tower switch reach the table's options");

  // A player's Settings, in Chrome.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('[data-launch="settings"]');
  const seatWindow = seat.locator('.window[data-window="settings"]');
  await seatWindow.waitFor();
  assert((await seatWindow.locator('[data-setting="wizard2e"]').count()) === 0 && (await seatWindow.locator('[data-setting="tower-external"]').count()) === 0, "a player sees only their own settings");
  await seatWindow.screenshot({ path: path.join(SHOTS, "kraken-settings-player.png") });
  await seat.click('[data-setting="turn-sound"]');
  await settle(300);
  assert((await seat.locator('[data-setting="turn-sound"]').isChecked()) === false, "the player's chime switch turns off");
  report.push("a player's Settings: their own sections only; the chime switch turns off");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok settings ui${process.env.KRAKEN_APP ? " (the built app)" : ""}:\n  ${report.join("\n  ")}\n  screenshots: ${path.join(SHOTS, "kraken-settings-gm.png")}, ${path.join(SHOTS, "kraken-settings-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
