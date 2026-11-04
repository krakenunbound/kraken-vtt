// The GM's map editor in the real app (FG's image layer panel): the GM opens
// Edit map, draws a chain of walls with the line tool, selects one and makes
// it a door, deletes and undoes, sets the grid to hex rows; a test player in
// Chrome sees the hex grid and the new door's handle, and is never sent the
// walls. Needs a prepared map bundle: KRAKEN_BUNDLE, or the GM's Keep on the
// Borderlands; skipped without one.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const bundle = process.env.KRAKEN_BUNDLE ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Keep on the Borderlands (Foundry).zip`;
if (!existsSync(bundle)) {
  console.log("skip map editor: no bundle at", bundle);
  process.exit(0);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-mapedit-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
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
// Screen point of a world point, from the map's own transform.
const screenOf = (target, x, y) =>
  target.evaluate(
    ([wx, wy]) => {
      const world = document.querySelector(".world");
      const view = document.querySelector(".viewport").getBoundingClientRect();
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.e]+)\)/.exec(world.style.transform);
      const [tx, ty, scale] = match.slice(1).map(Number);
      return { x: view.left + tx + wx * scale, y: view.top + ty + wy * scale };
    },
    [x, y],
  );
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Map editor UI", ruleset: "Castles & Crusades" });
  const port = 47406;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_open_adventure", { path: bundle });
  await page.waitForSelector(".map-toolbar");
  await page.click('[aria-label="Fit"]');
  await settle(600);
  const before = (await tool("kraken_wall", { action: "list" })).total;
  // A clear spot in the middle of the map, in world pixels.
  const middle = await page.evaluate(() => {
    const world = document.querySelector(".world");
    return { w: parseFloat(world.style.width), h: parseFloat(world.style.height) };
  });
  const cx = Math.round(middle.w / 2);
  const cy = Math.round(middle.h / 2);

  // Edit map, Walls tab, line tool, draw three points: two walls in a chain.
  await page.click('[data-action="map-editor"]');
  await page.waitForSelector(".map-editor");
  await page.click('[data-edit-tab="walls"]');
  await page.click('[data-wall-kind="wall"]');
  await page.click('[data-edit-tool="line"]');
  for (const [x, y] of [
    [cx - 300, cy],
    [cx, cy],
    [cx, cy + 300],
  ]) {
    const at = await screenOf(page, x, y);
    await page.mouse.click(at.x, at.y);
    await settle(250);
  }
  await page.keyboard.press("Escape");
  await settle(400);
  let listed = await tool("kraken_wall", { action: "list" });
  assert(listed.total === before + 2, `two walls drawn: ${listed.total - before}`);

  // Select the first new wall and make it a door.
  await page.click('[data-edit-tool="select"]');
  const mid = await screenOf(page, cx - 150, cy);
  await page.mouse.click(mid.x, mid.y);
  await page.waitForSelector("[data-selected-walls]");
  await page.click('[data-wall-kind="door"]');
  await settle(400);
  listed = await tool("kraken_wall", { action: "list" });
  assert(listed.byKind.door >= 1 && listed.walls.some((wall) => wall.kind === "door" && Math.abs(wall.y1 - wall.y2) < 2), `the wall is a door now: ${JSON.stringify(listed.byKind)}`);

  // Delete it, then undo with Ctrl+Z.
  await page.keyboard.press("Delete");
  await settle(400);
  assert((await tool("kraken_wall", { action: "list" })).total === before + 1, "deleted");
  await page.keyboard.press("Control+z");
  await settle(400);
  assert((await tool("kraken_wall", { action: "list" })).total === before + 2, "undone");

  // Grid tab: hex rows.
  await page.click('[data-edit-tab="grid"]');
  await page.selectOption('[aria-label="Grid type"]', "hexrow");
  await page.waitForSelector('[data-grid="hex"]');
  await page.screenshot({ path: path.join(tmpdir(), "kraken-mapedit-gm.png") });

  // A test player in Chrome: the hex grid and the door's handle, never the walls.
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  const messages = [];
  seat.on("websocket", (ws) => ws.on("framereceived", (frame) => messages.push(typeof frame.payload === "string" ? frame.payload : Buffer.from(frame.payload).toString("utf8"))));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".map-toolbar");
  await seat.waitForSelector('[data-grid="hex"]', { timeout: 15000 });
  assert((await seat.$('[data-action="map-editor"]')) === null, "a player has no map editor");
  // Every frame the player got (the join reply carries the first map and scene): no walls anywhere.
  await settle(800);
  const frames = messages.map((text) => JSON.parse(text));
  const wallsIn = (value) => (value && typeof value === "object" ? (Array.isArray(value.walls) && value.walls.length > 0) || Object.values(value).some(wallsIn) : false);
  assert(frames.length > 0 && !frames.some(wallsIn), `the player is never sent the walls (${frames.filter(wallsIn).map((frame) => frame.type).join(", ")})`);
  const doorHandles = await seat.$$eval(".overlay.doors [data-door], .overlay.doors .door", (nodes) => nodes.length).catch(() => 0);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-mapedit-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok map editor: walls drawn as a chain, made a door, deleted and undone; hex grid for the GM and the player; walls never sent to the player. ${path.join(tmpdir(), "kraken-mapedit-gm.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
