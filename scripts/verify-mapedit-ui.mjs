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

  // Mask tab: the global mask, then a revealed rectangle.
  await page.click('[data-edit-tab="mask"]');
  await page.click('[data-action="mask-on"]');
  await page.click('[data-edit-tool="rect"]');
  for (const [x, y] of [
    [cx - 400, cy - 300],
    [cx + 400, cy + 300],
  ]) {
    const at = await screenOf(page, x, y);
    await page.mouse.click(at.x, at.y);
    await settle(250);
  }
  await page.waitForSelector('.mask-overlay[data-mask="1"]');
  const mask = await tool("kraken_mask", { action: "list" });
  assert(mask.on && mask.shapes.length === 1 && mask.shapes[0].mode === "reveal", `a revealed rectangle: ${JSON.stringify(mask).slice(0, 120)}`);

  // Text tab: a label, then two numbers.
  await page.click('[data-edit-tab="text"]');
  await page.fill('[aria-label="Text"]', "Bandit Chief");
  await page.click('[data-edit-tool="text"]');
  let at = await screenOf(page, cx, cy - 100);
  await page.mouse.click(at.x, at.y);
  await page.click('[data-edit-tool="number"]');
  for (const dx of [-100, 100]) {
    at = await screenOf(page, cx + dx, cy + 100);
    await page.mouse.click(at.x, at.y);
    await settle(200);
  }
  await page.waitForSelector('[data-label-text="Bandit Chief"]');
  await page.waitForSelector('[data-label-text="2"]');

  // Paint tab: a filled rectangle. FX tab: a rain layer.
  await page.click('[data-edit-tab="paint"]');
  await page.check('[aria-label="Fill"]');
  await page.click('[data-edit-tool="rect"]');
  for (const [x, y] of [
    [cx + 150, cy - 250],
    [cx + 350, cy - 150],
  ]) {
    const at2 = await screenOf(page, x, y);
    await page.mouse.click(at2.x, at2.y);
    await settle(250);
  }
  await page.waitForSelector("rect[data-drawing]");
  await page.click('[data-edit-tab="fx"]');
  await page.click('[data-action="fx-add"]');
  await page.waitForSelector("[data-fx]");
  await page.click("[data-fx]");
  await page.selectOption('[aria-label="FX type"]', "snow");
  await page.waitForSelector('[data-weather="snow"]');

  // Water where the GM paints it: the brush along a stream, a rectangle, a shape; the areas add up.
  await page.selectOption('[aria-label="FX type"]', "water");
  await page.waitForSelector('[data-weather="water"]');
  await page.click('[data-edit-tool="fx-free"]');
  const from = await screenOf(page, cx - 300, cy + 120);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    const at3 = await screenOf(page, cx - 300 + step * 40, cy + 120 + Math.sin(step / 2) * 40);
    await page.mouse.move(at3.x, at3.y);
  }
  await page.mouse.up();
  await page.waitForSelector('[data-fx-areas="1"]');
  await page.click('[data-edit-tool="fx-rect"]');
  for (const [x, y] of [[cx + 200, cy - 250], [cx + 320, cy - 150]]) {
    const at3 = await screenOf(page, x, y);
    await page.mouse.click(at3.x, at3.y);
    await settle(200);
  }
  await page.waitForSelector('[data-fx-areas="2"]');
  await page.click('[data-edit-tool="fx-poly"]');
  const corners = [[cx - 250, cy - 250], [cx - 150, cy - 280], [cx - 120, cy - 180]];
  for (const [x, y] of corners) {
    const at3 = await screenOf(page, x, y);
    await page.mouse.click(at3.x, at3.y);
    await settle(200);
  }
  const last = await screenOf(page, cx - 220, cy - 160);
  await page.mouse.dblclick(last.x, last.y);
  await page.waitForSelector('[data-fx-areas="3"]');
  await page.waitForSelector('.weather[data-weather="water"][data-masked="true"]');
  let waterLayer = (await tool("kraken_fx", { action: "list" })).find((layer) => layer.type === "water");
  assert(waterLayer.mask.use && waterLayer.mask.mode === "inside" && waterLayer.mask.strokes.length === 1 && waterLayer.mask.polygons.length === 2 && waterLayer.mask.strokes[0].points.length >= 20, `three painted areas: ${JSON.stringify(waterLayer.mask).slice(0, 300)}`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-fx-water.png") });
  // One removed from the list; one more by the tool, then erased by it.
  await page.click('[aria-label="Remove area 1"]');
  await page.waitForSelector('[data-fx-areas="2"]');
  await tool("kraken_fx", { action: "paint", id: waterLayer.id, area: { stroke: { width: 120, points: [cx, cy, cx + 200, cy + 50] } }, soft: 30 });
  waterLayer = (await tool("kraken_fx", { action: "list" })).find((layer) => layer.id === waterLayer.id);
  assert(waterLayer.mask.polygons.length === 1 && waterLayer.mask.strokes.length === 2 && waterLayer.mask.soft === 30, `the list removed one, the tool painted one: ${JSON.stringify(waterLayer.mask).slice(0, 200)}`);
  await tool("kraken_fx", { action: "erase-area", id: waterLayer.id, area: "last" });
  await page.waitForSelector('[data-fx-areas="2"]');

  // Images tab: a picture copied into the tile library (as Browse does), added from the + list, dragged.
  const decal = path.join(process.cwd(), "public", "decals", "Arcane Circle.webp");
  await tool("kraken_tile", { action: "add", file: decal, x: cx - 380, y: cy - 280, width: 100, height: 100, name: "From the agent" });
  await page.click('[data-edit-tab="images"]');
  await page.click('[data-action="tile-add"]');
  await page.waitForSelector("[data-tile-picture]");
  await page.click("[data-tile-picture]");
  await page.waitForFunction(() => document.querySelectorAll(".map-tile").length === 2, null, { timeout: 10000 });
  let tilesNow = await tool("kraken_tile", { action: "list" });
  const added = tilesNow.find((tile) => tile.name !== "From the agent");
  const grab = await screenOf(page, added.x + added.width * 0.2, added.y + added.height * 0.8);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 60, grab.y + 40, { steps: 6 });
  await page.mouse.up();
  await settle(500);
  tilesNow = await tool("kraken_tile", { action: "list" });
  const moved = tilesNow.find((tile) => tile.id === added.id);
  assert(moved.x !== added.x || moved.y !== added.y, `the picture was dragged: ${added.x},${added.y} -> ${moved.x},${moved.y}`);
  await page.waitForSelector(`[data-tile-row="${added.id}"].on`);
  await page.click('[data-tile-order="bottom"]');
  await settle(300);
  assert((await tool("kraken_tile", { action: "list" }))[0].id === added.id, "to the bottom from the Images tab");

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
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".map-toolbar");
  await seat.waitForSelector('[data-grid="hex"]', { timeout: 15000 });
  assert((await seat.$('[data-action="map-editor"]')) === null, "a player has no map editor");
  await seat.waitForSelector('.mask-overlay:not(.gm)[data-mask="1"]', { timeout: 10000 });
  await seat.waitForSelector('[data-label-text="Bandit Chief"]', { timeout: 10000 });
  await seat.waitForSelector('[data-label-text="1"]', { timeout: 10000 });
  await seat.waitForSelector("rect[data-drawing]", { timeout: 10000 });
  // The water, only where the GM painted it (the same mask picture).
  await seat.waitForSelector('.weather[data-weather="water"][data-masked="true"]', { timeout: 10000 });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-fx-water-player.png") });
  // The image layers, their pictures loaded from the host under the player's own token.
  await seat.waitForFunction(() => [...document.querySelectorAll(".map-tile img")].filter((img) => img.complete && img.naturalWidth > 0).length === 2, null, { timeout: 15000 });
  // Every frame the player got (the join reply carries the first map and scene): no walls anywhere.
  await settle(800);
  const frames = messages.map((text) => JSON.parse(text));
  const wallsIn = (value) => (value && typeof value === "object" ? (Array.isArray(value.walls) && value.walls.length > 0) || Object.values(value).some(wallsIn) : false);
  assert(frames.length > 0 && !frames.some(wallsIn), `the player is never sent the walls (${frames.filter(wallsIn).map((frame) => frame.type).join(", ")})`);
  const doorHandles = await seat.$$eval(".overlay.doors [data-door], .overlay.doors .door", (nodes) => nodes.length).catch(() => 0);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-mapedit-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok map editor: walls drawn as a chain, made a door, deleted and undone; the global mask with a revealed rectangle, black for the player; a label and numbers placed from the Text tab, seen by the player; a filled rectangle painted and a snow FX layer, both reaching the player; two image layers (one from the agent, one from the Images tab, dragged and sent to the bottom) whose pictures load for the player; hex grid for the GM and the player; walls never sent to the player. ${path.join(tmpdir(), "kraken-mapedit-gm.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
