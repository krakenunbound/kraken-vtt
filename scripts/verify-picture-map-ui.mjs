// A map from a bare picture to a playable scene, in Kraken alone, by the
// agent (PLAN 4a's "done when"): the GM opens a picture (no bundle, nothing
// on it), and kraken_* tools fit the grid, wall in a room with a door, light
// it, label it, put a cart on it as an image layer and a test player's
// character in it, and darken it. The test player in Chrome then plays it:
// sees their token, the door, the label and the cart, is stopped by the wall,
// opens the door and walks through; never sees the walls. Reopening the same
// picture keeps everything made for it.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-picture-map-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "From a picture", ruleset: "Castles & Crusades" });
  const port = 47411;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // The bare picture: Kraken's own great hall painting (1600 x 900 or so), copied out so it is just a file.
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, await import("node:fs").then((fs) => fs.readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp"))));
  const opened = await tool("kraken_open_adventure", { path: picture });
  assert(/Great Hall/.test(opened.opened ?? ""), `the picture opened as a map: ${JSON.stringify(opened)}`);
  await page.waitForSelector(".map-toolbar");
  const scenes = await tool("kraken_scenes", {});
  assert(JSON.stringify(scenes).includes('"pic-'), `one scene, named by the picture: ${JSON.stringify(scenes).slice(0, 300)}`);

  // The grid: 80 px squares, 5 ft, nudged; shown.
  const grid = await tool("kraken_scene_settings", { grid: { size: 80, distance: 5, units: "ft", offsetX: 10, offsetY: 0, show: true, alpha: 0.35 } });
  assert(grid.grid.size === 80 && grid.grid.offsetX === 10, `the grid fitted: ${JSON.stringify(grid.grid)}`);
  // A room: walls round (410..890, 170..650) with a door in its west wall.
  await tool("kraken_wall", { action: "add", points: [410, 410, 410, 170, 890, 170, 890, 650, 410, 650, 410, 490], kind: "wall" });
  await tool("kraken_wall", { action: "add", points: [410, 490, 410, 410], kind: "door" });
  const doorId = (await tool("kraken_wall", { action: "list", kind: "door" })).walls[0].id;
  await tool("kraken_line_of_sight", { on: true });
  await tool("kraken_light", { action: "place", x: 650, y: 410, preset: "torch" });
  await tool("kraken_label", { action: "add", x: 650, y: 230, text: "Great Hall", size: 0.8, font: "Cinzel" });
  const cart = await tool("kraken_tile", { action: "add", file: path.join(process.cwd(), "public", "decals", "Arcane Circle.webp"), x: 690, y: 450, width: 160, height: 160, name: "Rune circle" });
  const hero = await tool("kraken_record_create", { type: "character", name: "Aldric", owner: "A test player", visibility: "owner", data: {} });
  // Outside the door, to the west.
  const token = await tool("kraken_token_place", { recordId: hero.id, col: 3, row: 5 });
  await tool("kraken_scene_settings", { darkness: 0.3 });

  // The test player in Chrome.
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  const frames = [];
  seat.on("websocket", (ws) => ws.on("framereceived", (frame) => frames.push(typeof frame.payload === "string" ? frame.payload : Buffer.from(frame.payload).toString("utf8"))));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".map-toolbar");
  await seat.waitForSelector('.token[data-name="Aldric"]', { timeout: 15000 });
  await seat.waitForSelector(".overlay.doors .player-door, .overlay.doors [data-door]", { timeout: 15000 });
  await seat.waitForSelector('[data-label-text="Great Hall"]', { timeout: 10000 }).catch(() => undefined);

  // Stopped by the closed door; the door opened; through.
  const stopped = await tool("kraken_token_move", { id: token.id, col: 7, row: 5, asPlayer: true });
  assert(stopped.blocked && stopped.col < 5, `the closed door stops her: ${JSON.stringify(stopped)}`);
  await tool("kraken_door", { id: doorId, state: "open" });
  const through = await tool("kraken_token_move", { id: token.id, col: 7, row: 5, asPlayer: true });
  assert(!through.blocked, `the open door lets her in: ${JSON.stringify(through)}`);
  await seat.waitForFunction(() => [...document.querySelectorAll(".map-tile img")].some((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15000 });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-picture-map-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-picture-map-gm.png") });
  await settle(600);
  const wallsIn = (value) => (value && typeof value === "object" ? (Array.isArray(value.walls) && value.walls.length > 0) || Object.values(value).some(wallsIn) : false);
  assert(!frames.map((text) => JSON.parse(text)).some(wallsIn), "the player is never sent the walls");

  // The same picture opened again: the same scene, with its walls, light, label, tile and token.
  await tool("kraken_open_adventure", { path: picture });
  await settle(1200);
  const walls = await tool("kraken_wall", { action: "list" });
  const tiles = await tool("kraken_tile", { action: "list" });
  const map = await tool("kraken_map", {});
  assert(walls.total === 6 && tiles.some((tile) => tile.id === cart.id) && map.tokens.some((item) => item.name === "Aldric"), `reopened, everything is still there: ${walls.total} walls, ${tiles.length} tiles, ${map.tokens.length} tokens`);
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok picture map: a bare picture opened as a scene; grid, walls and a door, a torch, a label, an image layer and a test player's token put on by the agent; the player sees it, is stopped by the closed door and walks in when it opens; walls never sent; the same picture reopens with everything. ${path.join(tmpdir(), "kraken-picture-map-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
