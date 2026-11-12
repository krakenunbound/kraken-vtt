// Starships in the real app (a Traveller campaign): the GM makes the crew's
// Free Trader and a Corsair in the Starships window; a test player in Chrome
// opens Starships, takes the pulse laser's gunner station with their own
// Traveller (and not someone else's), the GM puts both ships on the tracker,
// and the player fires the laser at the Corsair (2d6 + Gunner (Turret) and
// DEX + the laser's DM + fire control + range against 8; the Effect on the
// damage, the Corsair's armour off it). Screenshots go to the temp folder.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-ships-ui-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "Ships UI", ruleset: "Traveller" });
  const port = 47419;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // The GM's Starships window: the crew's Free Trader and a Corsair.
  await page.click('.sidebar [data-launch="ships"]');
  await page.waitForSelector("[data-ships]");
  await page.fill('[aria-label="Ship name"]', "Rusty Lark");
  await page.selectOption('[aria-label="Ship design"]', "Free Trader");
  await page.click('[data-action="ship-create"]');
  await page.waitForSelector('[data-ship-sheet] [data-ship-stat="hull"]');
  await page.fill('[aria-label="Ship name"]', "Black Gull");
  await page.selectOption('[aria-label="Ship design"]', "Corsair");
  await page.click('[data-action="ship-create"]');
  const ships = await until(async () => {
    const list = await tool("kraken_starship", { action: "list" });
    return list.length === 2 ? list : null;
  }, "two ships");
  const lark = ships.find((ship) => ship.name === "Rusty Lark");
  const gull = ships.find((ship) => ship.name === "Black Gull");
  assert(lark.hull === "80/80" && gull.hull === "160/160" && gull.armour === 5, `the ships: ${JSON.stringify(ships)}`);

  // A test player and their Traveller (Gunner (Turret) 2, DEX 9: +3); someone else's.
  const hale = await tool("kraken_build_character", { spec: { name: "Gunner Hale", characteristics: { str: 7, dex: 9, end: 7, int: 8, edu: 8, soc: 7 }, skills: { "Gunner (Turret)": 2 } }, owner: "A test player" });
  await tool("kraken_build_character", { spec: { name: "Not Yours", characteristics: { str: 7, dex: 7, end: 7, int: 7, edu: 7, soc: 7 } }, owner: "Someone else" });
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('.sidebar [data-launch="ships"]');
  await seat.waitForSelector("[data-ships]");
  await seat.click(`[data-ship="${lark.id}"]`);
  const laserKey = lark.weapons[0].key;
  const gunnerSelect = `[data-ship-weapon="${laserKey}"] select`;
  const offered = await seat.$$eval(`${gunnerSelect} option`, (options) => options.map((option) => option.textContent));
  assert(offered.includes("Gunner Hale") && !offered.includes("Not Yours"), `a player's own characters only: ${offered}`);
  await seat.selectOption(gunnerSelect, hale.id);
  await until(async () => (await tool("kraken_starship", { action: "list" })).find((ship) => ship.id === lark.id).weapons[0].gunner === hale.id, "Hale at the laser");

  // The GM puts both on the tracker (the Lark, crewed by a player, as a friend).
  await page.click(`[data-ship="${lark.id}"]`);
  await page.click('[data-action="ship-to-tracker"]');
  await tool("kraken_combat", { action: "add", recordId: gull.id });
  const view = await until(async () => {
    const entries = (await tool("kraken_combat", { action: "view" })).entries;
    return entries.length === 2 ? entries : null;
  }, "both ships on the tracker");
  const larkEntry = view.find((entry) => entry.name === "Rusty Lark");
  const gullEntry = view.find((entry) => entry.name === "Black Gull");
  assert(larkEntry.faction === "friend" && gullEntry.faction === "foe" && gullEntry.hp === 160 && gullEntry.ac === 5, `on the tracker: ${JSON.stringify(view)}`);

  // The player fires: Short (+1); Gunner (Turret) 2 + DEX 1 + the laser's +2 + fire control 0 + 1 = +6: 4 + 4 + 6 = 14, Effect +6; 2D 5 + 5 + 6 - 5 = 11, and a critical (2d6 = 6: armour).
  await seat.waitForSelector(`[data-ship-weapon="${laserKey}"] [data-action="ship-fire"]:not([disabled])`);
  await seat.selectOption('[aria-label="Range"]', "Short");
  await tool("kraken_dice_force", { values: [4, 4, 5, 5, 3, 3] });
  await seat.click(`[data-ship-weapon="${laserKey}"] [data-action="ship-fire"]`);
  await chat(page, "[HIT 14 vs 8, Effect +6]");
  const hurt = await until(async () => {
    const list = await tool("kraken_starship", { action: "list" });
    const ship = list.find((item) => item.id === gull.id);
    return ship.hull !== "160/160" ? ship : null;
  }, "the Corsair's hull");
  assert(hurt.hull === "149/160" && hurt.criticals.armour === 1 && hurt.armour === 4, `11 off the hull, an armour critical: ${JSON.stringify(hurt)}`);
  await chat(seat, "[CRITICAL HIT] Black Gull: Armour");
  // The player cannot fire the Corsair's guns.
  await seat.click(`[data-ship="${gull.id}"]`);
  assert(await seat.$$eval('[data-action="ship-fire"]', (buttons) => buttons.every((button) => button.disabled)), "not the player's guns");

  await seat.click(`[data-ship="${lark.id}"]`);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-ships-player.png") });
  await page.click(`[data-ship="${gull.id}"]`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-ships-gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok starships ui: the GM makes a Free Trader and a Corsair in Starships; a test player takes the laser with their own Traveller (not someone else's); both ships on the tracker (the crew's a friend); the player's shot hits (14, Effect +6) for 11 off the Corsair's hull and an armour critical. ${path.join(tmpdir(), "kraken-ships-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
