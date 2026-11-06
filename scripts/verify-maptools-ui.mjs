// The map toolbar in the real app (FG's image toolbar): a player in Chrome,
// lost on a big map, presses Find my token and the map centres and zooms on
// their token with a flash; they draw a line in their colour (the GM sees it),
// then rub it out; they ping with the ping tool. Needs a prepared map bundle:
// KRAKEN_BUNDLE, or the GM's Keep on the Borderlands; skipped without one.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const bundle = process.env.KRAKEN_BUNDLE ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Keep on the Borderlands (Foundry).zip`;
if (!existsSync(bundle)) {
  console.log("skip map tools: no bundle at", bundle);
  process.exit(0);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-maptools-ui-"));
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Map tools UI", ruleset: "Castles & Crusades" });
  const port = 47400;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_open_adventure", { path: bundle });
  await page.waitForSelector(".map-toolbar");
  // The map in its own window (FG's image window), with its tools and the scene pickers, clear of the sidebar.
  const mapWindow = page.locator('.window[data-window="map"]');
  assert((await mapWindow.locator(".viewport .map-toolbar").count()) === 1 && (await mapWindow.locator(".scene-bar").count()) === 1, "the map, its tools and the scene's pickers are in the map window");
  const frame = await mapWindow.boundingBox();
  const side = await page.locator(".sidebar").boundingBox();
  assert(frame && side && frame.x + frame.width <= side.x + 1, `the map window leaves the sidebar clear: ${JSON.stringify({ frame, side })}`);
  await page.click(`[aria-label="Close ${await mapWindow.getAttribute("aria-label")}"]`);
  await page.waitForSelector('.window[data-window="map"]', { state: "detached" });
  await page.click('.sidebar [data-launch="map"]');
  await page.waitForSelector('.window[data-window="map"] .viewport');
  // Another window sits over it, and stays over it when the map is clicked.
  await page.click('.sidebar [data-launch="combat"]');
  await page.waitForSelector('.window[data-window="combat"]');
  await page.mouse.click(frame.x + 40, frame.y + frame.height - 60);
  const zs = await page.evaluate(() => ["map", "combat"].map((kind) => Number(getComputedStyle(document.querySelector(`.window[data-window="${kind}"]`)).zIndex)));
  assert(zs[0] < zs[1], `the map stays behind the other windows: ${zs}`);
  await page.click('.sidebar [data-launch="combat"]');
  await page.click(`[aria-label="Close ${await mapWindow.getAttribute("aria-label")}"]`);
  await tool("kraken_windows", { action: "open", kind: "map" });
  await page.waitForSelector('.window[data-window="map"] .viewport');
  // Out to a window of its own (another monitor), the map and its tools working there; then back.
  await tool("kraken_windows", { action: "popout", kind: "map" });
  let own = null;
  for (let wait = 0; wait < 40 && !own; wait++) {
    for (const other of app.windows()) if (other !== page && (await other.$(".viewport .map-toolbar").catch(() => null))) own = other;
    if (!own) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(own, "the map popped out into a window of its own, with its toolbar");
  const zoomBefore = Number(await own.getAttribute(".world", "data-scale"));
  await own.click('[aria-label="Zoom in"]');
  const zoomAfter = Number(await own.getAttribute(".world", "data-scale"));
  assert(zoomAfter > zoomBefore, `its tools work there: zoom ${zoomBefore} -> ${zoomAfter}`);
  await own.waitForTimeout(800);
  await own.click('[aria-label="Fit"]');
  await own.waitForTimeout(500);
  await own.screenshot({ path: path.join(tmpdir(), "kraken-map-popout.png") });
  await tool("kraken_windows", { action: "dock", kind: "map" });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 10000 });
  // Dragged by its title bar past the edge of the main window, as the GM does: one window of its own (not two), the map in view in it.
  const viewBefore = await page.getAttribute('.window[data-window="map"] .world', "style");
  const bar = await page.locator('.window[data-window="map"] .window-title').boundingBox();
  await page.mouse.move(bar.x + 120, bar.y + bar.height / 2);
  await page.mouse.down();
  for (let x = bar.x + 100; x >= 0; x -= 40) await page.mouse.move(Math.max(0, x), bar.y + bar.height / 2);
  for (let step = 0; step < 6; step++) await page.mouse.move(0, bar.y + bar.height / 2 + step);
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const others = app.windows().filter((other) => other !== page);
  assert(others.length === 1, `one window of its own, not ${others.length}`);
  const dragged = others[0];
  await dragged.waitForSelector(".viewport .world img", { timeout: 10000 });
  // Just as it was: not framed anew, not moved.
  await new Promise((resolve) => setTimeout(resolve, 800));
  const viewOut = await dragged.getAttribute(".viewport .world", "style");
  assert(viewOut === viewBefore, `the map in its own window shows just what it showed: ${viewBefore} -> ${viewOut}`);
  await dragged.screenshot({ path: path.join(tmpdir(), "kraken-map-dragged-out.png") });
  await tool("kraken_windows", { action: "dock", kind: "map" });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 10000 });
  assert(app.windows().length === 1, `docked back: ${app.windows().length} windows`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const viewBack = await page.getAttribute('.window[data-window="map"] .world', "style");
  assert(viewBack === viewBefore, `docked back, still just as it was: ${viewBefore} -> ${viewBack}`);

  // The pointer says what a press does, and the toolbar's tools work while the editor is open.
  const pointer = () => page.$eval('.window[data-window="map"] .viewport', (element) => [element.dataset.pointer, getComputedStyle(element).cursor]);
  assert((await pointer()).join() === "pan,grab", `the hand pans: ${await pointer()}`);
  await page.click('[data-action="map-editor"]');
  await page.click('[data-edit-tool="line"]');
  assert((await pointer()).join() === "place,crosshair", `drawing walls, a crosshair: ${await pointer()}`);
  await page.click('[data-edit-tool="select"]');
  assert((await pointer()).join() === "select,default", `selecting walls, the arrow: ${await pointer()}`);
  // Draw on the map, with the editor still open: it draws at once (the editor's tool is put down).
  await page.click('.window[data-window="map"] [data-tool="draw"]');
  assert((await pointer()).join() === "place,crosshair", `drawing, a crosshair: ${await pointer()}`);
  assert((await page.getAttribute('[data-edit-tool="select"]', "aria-pressed")) === "false", "the editor's tool is put down");
  const area = await page.locator('.window[data-window="map"] .viewport').boundingBox();
  const drawnBefore = await page.locator(".overlay.drawings polyline[data-drawing]").count();
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.6);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(area.x + area.width * 0.6 + step * 12, area.y + area.height * 0.6 + step * 6);
  await page.mouse.up();
  await page.waitForFunction((count) => document.querySelectorAll(".overlay.drawings polyline[data-drawing]").length > count, drawnBefore, { timeout: 8000 });
  // A wall tool picked again puts the toolbar back to the hand.
  await page.click('[data-edit-tool="line"]');
  assert((await page.getAttribute('.window[data-window="map"] [data-tool="pan"]', "aria-checked")) === "true", "an editor tool puts the toolbar back to pan");
  await page.keyboard.press("Escape");
  await page.click('[data-action="map-editor"]');
  await page.click('.window[data-window="map"] [data-tool="erase"]');
  await page.mouse.click(area.x + area.width * 0.6 + 48, area.y + area.height * 0.6 + 24);
  await page.waitForFunction((count) => document.querySelectorAll(".overlay.drawings polyline[data-drawing]").length === count, drawnBefore, { timeout: 8000 });
  await page.click('.window[data-window="map"] [data-tool="pan"]');
  const hero = await tool("kraken_record_create", { type: "character", name: "Aldric", owner: "A test player", visibility: "owner", data: {} });
  // Far from the middle, where a lost player would not find it.
  await tool("kraken_token_place", { recordId: hero.id, col: 4, row: 4 });

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".map-toolbar");
  assert((await seat.$('[data-action="scene-settings"]')) === null && (await seat.$('[data-action="clear-drawings"]')) === null, "a player has no GM tools");
  await seat.click('[aria-label="Fit"]');
  await settle(500);

  // Find my token: centred in the view, close in, with a flash.
  await seat.click('[data-action="find-token"]');
  await seat.waitForSelector(".found-ring");
  await settle(500);
  const where = await seat.evaluate(() => {
    const view = document.querySelector(".viewport").getBoundingClientRect();
    const token = [...document.querySelectorAll(".token")].find((element) => element.textContent?.includes("Aldric") || element.getAttribute("title")?.includes("Aldric")) ?? document.querySelector(".token.mine");
    const box = token?.getBoundingClientRect();
    return { dx: box ? box.left + box.width / 2 - (view.left + view.width / 2) : null, dy: box ? box.top + box.height / 2 - (view.top + view.height / 2) : null, size: box?.width ?? 0 };
  });
  assert(where.dx !== null && Math.abs(where.dx) < 40 && Math.abs(where.dy) < 40, `the token is in the middle of the view (${JSON.stringify(where)})`);
  assert(where.size > 60, `and close in (${Math.round(where.size)} px across)`);

  // Draw a line: the GM sees it, in the player's colour; then rub it out.
  await seat.click('[data-tool="draw"]');
  const view = await seat.$eval(".viewport", (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await seat.mouse.move(view.x - 200, view.y + 120);
  await seat.mouse.down();
  for (let step = 1; step <= 12; step++) await seat.mouse.move(view.x - 200 + step * 25, view.y + 120 - step * 8);
  await seat.mouse.up();
  await page.waitForSelector(".overlay.drawings polyline[data-drawing]", { timeout: 8000 });
  const lines = await tool("kraken_draw", { action: "list" });
  assert(lines.length === 1 && lines[0].by === "A test player" && lines[0].points.length >= 8, `the GM has the player's line (${JSON.stringify(lines).slice(0, 200)})`);
  await seat.click('[data-tool="erase"]');
  await seat.mouse.click(view.x - 200 + 6 * 25, view.y + 120 - 6 * 8);
  await page.waitForFunction(() => document.querySelectorAll(".overlay.drawings polyline[data-drawing]").length === 0, null, { timeout: 8000 });

  // Ping with the ping tool: the GM sees it.
  await seat.click('[data-tool="ping"]');
  await seat.mouse.click(view.x + 220, view.y - 160);
  await page.waitForSelector(".ping", { timeout: 8000 });

  // Several at once: a second token of hers beside Aldric; Shift+drag a box round both, drag one, both go; Shift+wheel turns him.
  const heroToken = (await tool("kraken_map", {})).tokens.find((token) => token.name === "Aldric");
  const hound = await tool("kraken_token_place", { name: "Hound", col: heroToken.col + 1, row: heroToken.row });
  await tool("kraken_token_update", { id: hound.id, owner: "A test player" });
  await seat.waitForSelector('.token[data-name="Hound"]');
  await seat.click('[data-tool="pan"]');
  const boxOf = (name) => seat.$eval(`.token[data-name="${name}"]`, (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width };
  });
  const a = await boxOf("Aldric");
  const b = await boxOf("Hound");
  await seat.keyboard.down("Shift");
  await seat.mouse.move(Math.min(a.x, b.x) - a.w, Math.min(a.y, b.y) - a.w);
  await seat.mouse.down();
  await seat.mouse.move(Math.max(a.x, b.x) + a.w, Math.max(a.y, b.y) + a.w, { steps: 8 });
  await seat.mouse.up();
  await seat.keyboard.up("Shift");
  await seat.waitForFunction(() => document.querySelectorAll(".token.token-picked").length === 2, null, { timeout: 5000 });
  const before = Object.fromEntries((await tool("kraken_map", {})).tokens.map((token) => [token.name, token]));
  await seat.mouse.move(a.x, a.y);
  await seat.mouse.down();
  await seat.mouse.move(a.x, a.y + a.w * 2.2, { steps: 10 });
  await seat.mouse.up();
  await settle(800);
  const after = Object.fromEntries((await tool("kraken_map", {})).tokens.map((token) => [token.name, token]));
  assert(after.Aldric.row === before.Aldric.row + 2 && after["Hound"].row === before["Hound"].row + 2, `both moved two squares down: ${before.Aldric.row}->${after.Aldric.row}, ${before["Hound"].row}->${after["Hound"].row}`);
  const turned = await boxOf("Aldric");
  await seat.mouse.move(turned.x, turned.y);
  await seat.keyboard.down("Shift");
  await seat.mouse.wheel(0, 100);
  await seat.keyboard.up("Shift");
  await seat.waitForSelector('.token[data-name="Aldric"] .token-facing[data-facing="45"]', { timeout: 5000 });
  await page.waitForSelector('.token[data-name="Aldric"] .token-facing[data-facing="45"]', { timeout: 5000 });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-maptools-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-maptools-gm.png") });
  assert(failures.length === 0, `no errors on screen: ${failures.join("; ")}`);
  console.log("MAPTOOLS_UI_OK find my token centres and zooms; a player draws, rubs out and pings; the GM sees it; she box-picks her two tokens and drags them together, and turns one with Shift+wheel");
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
