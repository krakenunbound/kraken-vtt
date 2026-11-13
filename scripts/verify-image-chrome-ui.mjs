// The image window's own controls (as FG's image window) and the Assets:
// the corner's Lock (the editor) and Tools (the tool strip; locked with it
// hidden, the picture alone); the navigation pad pans and zooms; the player
// vision preview shows the GM the players' view; pins are hidden and shown.
// Shared or not: a table map stopped sharing reaches no player (a test player
// in Chrome sees no map) until shared again. Assets: an active book's pictures
// by folder; one made a map joins Campaign > Images and opens unlocked.
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
const wallCount = (listed) => (Array.isArray(listed) ? listed : (listed?.walls ?? [])).length;

const profile = mkdtempSync(path.join(tmpdir(), "kraken-image-chrome-ui-"));
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
const press = (selector) => page.$eval(selector, (element) => element.click());
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
let browser = null;
const report = [];
const YARD = "The Watchtower Yard";
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
  const campaign = await tool("kraken_campaign_create", { name: "Image chrome", ruleset: "Descending Darkness" });
  const port = 47459;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const books = await tool("kraken_books", { action: "list" });
  const tower = books.find((book) => book.name === "The Empty Watchtower");
  const handbook = books.find((book) => book.name === "Descending Darkness Player's Handbook");
  await tool("kraken_books", { action: "activate", book: tower.id });
  await tool("kraken_books", { action: "activate", book: handbook.id });

  // The image window's corner: Lock and Tools.
  await tool("kraken_image", { action: "open", book: tower.name, name: YARD });
  await page.waitForSelector(`[data-image-window="${YARD}"]`);
  await page.waitForSelector('.map-corner [data-action="map-editor"][aria-pressed="true"]');
  assert(await page.$(".map-editor"), "unlocked: the editor at the side");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(".png", "-unlocked.png") });
  await press('.map-corner [data-action="map-editor"]');
  await page.waitForSelector(".map-editor", { state: "detached" });
  await press('.map-corner [data-action="map-tools"]');
  await page.waitForSelector(".map-controls", { state: "detached" });
  assert(!(await page.$(".map-editor")) && !(await page.$(".map-controls")), "locked with the tools hidden: the picture alone");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(".png", "-locked.png") });
  await press('.map-corner [data-action="map-tools"]');
  await page.waitForSelector(".map-controls");
  report.push("the corner: Lock opens and closes the editor; Tools hides the strip (locked: the picture alone) and shows it again");

  // The navigation pad: pan and zoom by buttons.
  await press('[data-action="map-nav"]');
  await page.waitForSelector(".map-nav");
  const before = await page.evaluate(() => getComputedStyle(document.querySelector(".map-window .world, .map-window [style*=transform]") ?? document.body).transform);
  await press('.map-nav [data-nav="right"]');
  await settle(300);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector(".map-window .world, .map-window [style*=transform]") ?? document.body).transform);
  assert(before !== after, `the pad pans the map (${before} -> ${after})`);
  await press('[data-action="map-nav"]');
  await page.waitForSelector(".map-nav", { state: "detached" });
  report.push("the navigation pad pans the map");

  // Pins hidden and shown; the player vision preview.
  await tool("kraken_label", { action: "add", text: "Story pin", x: 300, y: 300, link: { kind: "record", id: "nothing" } }).catch(() => undefined);
  const pinsBefore = await page.$$eval("[data-label]", (all) => all.length);
  await press('[data-action="map-pins"]');
  await settle(400);
  const pinsHidden = await page.$$eval("[data-label]", (all) => all.length);
  await press('[data-action="map-pins"]');
  report.push(`pins: ${pinsBefore} shown, ${pinsHidden} with pins hidden`);
  await press('[data-action="vision-preview"]');
  await page.waitForSelector('[data-action="vision-preview"][aria-pressed="true"]');
  assert(!(await page.$('.map-corner [data-action="map-editor"]')), "previewing: the GM sees as a player (no editor)");
  await press('[data-action="vision-preview"]');
  await page.waitForSelector('.map-corner [data-action="map-editor"]');
  report.push("the player vision preview: the GM's window as the players see it, and back");

  // Shared or not: the table map and a test player in Chrome.
  await page.$eval('[data-action="image-play"]', (button) => button.click());
  await page.waitForSelector('[data-action="table-share"][aria-pressed="true"]');
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  // The player's own socket, to try the map editor's messages behind the interface's back.
  await seat.addInitScript(() => {
    const Native = window.WebSocket;
    window.__sockets = [];
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.__sockets.push(this);
      }
    };
  });
  const heard = [];
  seat.on("websocket", (ws) => ws.on("framereceived", (frame) => heard.push(typeof frame.payload === "string" ? frame.payload : "")));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  // The player's map window (the map's name in its title), not the chat's lines.
  const playerMap = () => seat.evaluate(() => Boolean(document.querySelector('.window[data-window="map"] .viewport')));
  await seat.waitForSelector('.window[data-window="map"] .viewport', { timeout: 20000 });
  await press('[data-action="table-share"]');
  await page.waitForSelector('[data-action="table-share"][aria-pressed="false"]');
  await seat.waitForSelector('.window[data-window="map"] .viewport', { state: "detached", timeout: 20000 });
  assert(!(await playerMap()), "stopped sharing: the player has no map");
  await press('[data-action="table-share"]');
  await page.waitForSelector('[data-action="table-share"][aria-pressed="true"]');
  await seat.waitForSelector('.window[data-window="map"] .viewport', { timeout: 20000 });
  report.push("Share: the test player sees the table map, not when it is stopped sharing, and again when shared");

  // The map editor is the GM's alone: the player has no Lock (editor), no
  // player vision preview, no editor panel, even with the tools shown; and the
  // host refuses the editor's messages from a player's seat.
  const playerWindow = '.window[data-window="map"]';
  assert(!(await seat.$(`${playerWindow} [data-action="map-editor"]`)), "the player has no map editor (Lock)");
  assert(!(await seat.$(`${playerWindow} [data-action="vision-preview"]`)), "the player has no vision preview");
  if (await seat.$(`${playerWindow} [data-action="map-tools"][aria-pressed="false"]`)) await seat.click(`${playerWindow} [data-action="map-tools"]`);
  assert(!(await seat.$(".map-editor")) && !(await seat.$(`${playerWindow} [data-action="map-pins"]`)), "with the tools shown, still no editor or pins");
  await seat.keyboard.press("e").catch(() => undefined);
  assert(!(await seat.$(".map-editor")), "no editor by key either");
  const wallsBefore = wallCount(await tool("kraken_wall", { action: "list" }));
  await seat.evaluate(() => {
    const socket = window.__sockets.find((item) => item.readyState === 1);
    socket.send(JSON.stringify({ type: "wall", action: "add", wall: { points: [0, 0, 300, 0] } }));
    socket.send(JSON.stringify({ type: "light-place", light: { x: 50, y: 50, bright: 20, dim: 40 } }));
  });
  for (let wait = 0; wait < 20 && !heard.some((text) => text.includes("Only the GM can place lights")); wait++) await settle(150);
  assert(heard.some((text) => text.includes("Only the GM can draw walls")) && heard.some((text) => text.includes("Only the GM can place lights")), "the host refuses a player's wall and light");
  assert(wallCount(await tool("kraken_wall", { action: "list" })) === wallsBefore, "no wall added by the player");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-player-map-no-editor.png") });
  report.push("the map editor is the GM's alone: the test player has no Lock, preview, editor or pins, and the host refuses a player's wall and light");

  // Assets: a picture of the handbook made a map.
  await page.click('.sidebar [data-launch="assets"]');
  await page.waitForSelector("[data-assets] select");
  await page.selectOption("[data-assets] select", handbook.id);
  await page.waitForSelector("[data-asset-folder], [data-asset]");
  for (let depth = 0; depth < 4 && !(await page.$("[data-asset]")); depth++) await press("[data-asset-folder]");
  await page.waitForSelector("[data-asset]");
  await press("[data-asset]");
  await page.waitForSelector("[data-asset-preview]");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(".png", "-assets.png") });
  const file = await page.getAttribute("[data-asset-preview]", "data-asset-preview");
  await press('[data-action="asset-map"]');
  await page.waitForSelector("[data-image-window]", { timeout: 30000 });
  await page.waitForSelector('.map-corner [data-action="map-editor"][aria-pressed="true"]');
  const made = Object.values((await tool("kraken_records_list", { type: "image" })).records ?? (await tool("kraken_records_list", { type: "image" })));
  assert(JSON.stringify(made).includes(file.split("/").pop().replace(/\.[a-z0-9]+$/i, "")), `the picture is a campaign image now (${JSON.stringify(made).slice(0, 200)})`);
  await page.click('.sidebar [data-launch="imagelist"]');
  await page.waitForSelector('[data-images-book="campaign"] [data-image-record]');
  report.push(`Assets: ${file} made a map: it opens unlocked and is in Campaign > Images under This campaign`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok image chrome ui:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
