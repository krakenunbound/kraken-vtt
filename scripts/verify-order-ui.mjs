// The party's watch order and formation in the real app, as FG's party sheet
// Order tab: a player in Chrome drags their own token into a formation slot
// and onto a watch (and cannot move another player's); the GM fills the rest
// three abreast and turns the formation. Starts the app (throwaway profile).
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

const profile = mkdtempSync(path.join(tmpdir(), "kraken-order-ui-"));
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
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Order UI", ruleset: "Castles & Crusades" });
  const port = 47399;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const make = (name, owner) => tool("kraken_record_create", { type: "character", name, owner, visibility: "owner", data: { level: 1, hp: { total: 10, wounds: 0 } } });
  const mine = await make("Aldric", "A test player");
  const theirs = await make("Borin", "Another player");
  const third = await make("Cyra", "");
  await tool("kraken_party_edit", { members: [mine.id, theirs.id, third.id] });

  // A player in Chrome opens the party sheet's Order tab and drags their token.
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('.sidebar [data-launch="party"]');
  await seat.click('.party-tabs [role="tab"]:has-text("Order")');
  await seat.waitForSelector(`[data-order-token="${mine.id}"]`);
  assert((await seat.$(`[data-order-token="${theirs.id}"]`)) === null, "a player has only their own token to drag");
  assert((await seat.$("[data-fill]")) === null, "a player has no fill, turn or clear");
  await seat.dragAndDrop(`[data-order-token="${mine.id}"]`, '[data-slot="0,3"]');
  await seat.waitForSelector(`[data-slot="0,3"] [data-slot-member="${mine.id}"]`, { timeout: 8000 });
  await seat.dragAndDrop(`[data-order-token="${mine.id}"]`, '[data-watch="1"]');
  await seat.waitForSelector(`[data-watch="1"] .order-watcher`, { timeout: 8000 });
  let state = await tool("kraken_party");
  assert(state.order.formation.slots.some((slot) => slot.id === mine.id && slot.x === 0 && slot.y === 3), "the host has the player's slot");
  assert(state.order.watches["watch-1"].members.includes(mine.id), "and their watch");

  // The GM fills the rest three abreast and turns the formation; the player sees it.
  await page.click('.sidebar [data-launch="party"]');
  await page.click('.party-tabs [role="tab"]:has-text("Order")');
  await page.click('[data-fill="3"]');
  await page.waitForFunction(() => document.querySelectorAll(".formation-slot [data-slot-member]").length === 3);
  await page.click('[data-rotate="right"]');
  await seat.waitForSelector(".formation-board.facing-1", { timeout: 8000 });
  state = await tool("kraken_party");
  assert(state.order.formation.facing === 1 && state.order.marching[0] === mine.id, `turned, the player's character still leads (${state.order.marching})`);
  // The player cannot drag another player's token: theirs is not draggable.
  assert(!(await seat.$eval(`[data-slot-member="${theirs.id}"]`, (element) => element.draggable)), "another player's token cannot be dragged by this player");
  // Drag and drop: the GM drags a character from Characters onto the combat tracker.
  await page.click('.sidebar [data-launch="party"]');
  await page.click('.sidebar [data-launch="characters"]');
  await page.click('.sidebar [data-launch="combat"]');
  await page.waitForSelector(".combat-tracker");
  // Move the tracker aside by its title bar, so the Characters list shows.
  const title = await (await page.$('.window-title:has-text("Combat Tracker")')).boundingBox();
  await page.mouse.move(title.x + 60, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 700, title.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.click('.window-title:has-text("Characters")');
  await page.dragAndDrop('.character-list li button:has-text("Borin")', ".combat-tracker");
  await page.waitForFunction(() => document.querySelector(".combat-tracker")?.textContent?.includes("Borin"), null, { timeout: 8000 });
  const fight = await tool("kraken_combat", {});
  assert(JSON.stringify(fight).includes("Borin"), "the host has the dropped character in the fight");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-order-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-order-gm.png") });
  assert(failures.length === 0, `no errors on screen: ${failures.join("; ")}`);
  console.log("ORDER_UI_OK a player drags their token into a slot and a watch; the GM fills three abreast and turns the formation");
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
