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
  const hero = await tool("kraken_record_create", { type: "character", name: "Aldric", owner: "A test player", visibility: "owner", data: {} });
  // Far from the middle, where a lost player would not find it.
  await tool("kraken_token_place", { recordId: hero.id, col: 4, row: 4 });

  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
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
