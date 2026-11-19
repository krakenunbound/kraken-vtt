// A tablet player (docs/feature-parity.md S10): touch on the map in a full-screen player's browser with a touch
// screen, as real touch events (Chrome's DevTools Input.dispatchTouchEvent). One finger drags the map that far;
// two fingers moved apart zoom it by their spread about their midpoint (the map point under the fingers stays
// under them); a second finger landing on a token still makes a pinch, not a token drag.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-touch-"));
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
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Touch", ruleset: "Castles & Crusades" });
  const port = 47417;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await tool("kraken_map", { share: true }).catch(() => undefined);
  await tool("kraken_windows", { kind: "map", action: "open" }).catch(() => undefined);
  const hero = await tool("kraken_record_create", { type: "character", name: "Wren", owner: "A test player", visibility: "owner", data: {} });
  const token = await tool("kraken_token_place", { recordId: hero.id, col: 8, row: 5 });

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, hasTouch: true });
  const seat = await context.newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  const world = '.window[data-window="map"] .viewport .world';
  await seat.waitForSelector(`${world} [data-token="${token.id}"]`, { timeout: 20000 });
  const cdp = await context.newCDPSession(seat);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  // The world's box once it holds still (the map window fits its map on opening).
  const box = async () => {
    let last = null;
    for (let tries = 0; tries < 40; tries++) {
      const now = await seat.locator(world).boundingBox();
      if (last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.width - last.width) < 0.5) return now;
      last = now;
      await settle(150);
    }
    return last;
  };
  const viewport = await seat.locator('.window[data-window="map"] .viewport').boundingBox();
  // An empty spot on the map, away from the token.
  const spot = { x: viewport.x + viewport.width * 0.3, y: viewport.y + viewport.height * 0.7 };
  const results = [];

  // One finger: the map follows it 220 right, 90 up.
  const before = await box();
  await touch("touchStart", [[spot.x, spot.y]]);
  for (let step = 1; step <= 10; step++) await touch("touchMove", [[spot.x + 22 * step, spot.y - 9 * step]]);
  await touch("touchEnd", []);
  const panned = await box();
  results.push(`pan ${Math.round(panned.x - before.x)},${Math.round(panned.y - before.y)}`);
  assert(Math.abs(panned.x - before.x - 220) <= 4 && Math.abs(panned.y - before.y + 90) <= 4 && Math.abs(panned.width - before.width) < 1, `one finger pans the map with it: ${results.at(-1)}`);

  // Two fingers 200 apart, spread to 400: twice the size, the point between them stays between them.
  const mid = { x: viewport.x + viewport.width * 0.5, y: viewport.y + viewport.height * 0.5 };
  const pointBefore = { x: (mid.x - panned.x) / panned.width, y: (mid.y - panned.y) / panned.height };
  await touch("touchStart", [[mid.x - 100, mid.y]]);
  await touch("touchStart", [[mid.x - 100, mid.y], [mid.x + 100, mid.y]]);
  for (let step = 1; step <= 10; step++) await touch("touchMove", [[mid.x - 100 - 10 * step, mid.y], [mid.x + 100 + 10 * step, mid.y]]);
  await touch("touchEnd", []);
  const pinched = await box();
  const pointAfter = { x: (mid.x - pinched.x) / pinched.width, y: (mid.y - pinched.y) / pinched.height };
  results.push(`pinch x${(pinched.width / panned.width).toFixed(2)}, the midpoint's place on the map ${pointBefore.x.toFixed(3)} -> ${pointAfter.x.toFixed(3)}`);
  assert(Math.abs(pinched.width / panned.width - 2) < 0.05 && Math.abs(pointAfter.x - pointBefore.x) < 0.005 && Math.abs(pointAfter.y - pointBefore.y) < 0.005, `two fingers spread zoom about their midpoint: ${results.at(-1)}`);

  // A pinch whose second finger lands on the token: still a pinch (zooms back out to half), the token stays put.
  const tokenBox = await seat.locator(`${world} [data-token="${token.id}"]`).boundingBox();
  const onToken = { x: tokenBox.x + tokenBox.width / 2, y: tokenBox.y + tokenBox.height / 2 };
  const first = { x: onToken.x - 300, y: onToken.y };
  const beforeOut = await box();
  await touch("touchStart", [[first.x, first.y]]);
  await touch("touchStart", [[first.x, first.y], [onToken.x, onToken.y]]);
  for (let step = 1; step <= 10; step++) await touch("touchMove", [[first.x + 7.5 * step, first.y], [onToken.x - 7.5 * step, onToken.y]]);
  await touch("touchEnd", []);
  const out = await box();
  const where = (await tool("kraken_map", {})).tokens.find((item) => item.id === token.id);
  results.push(`pinch on a token x${(out.width / beforeOut.width).toFixed(2)}, token at ${where.col},${where.row}`);
  assert(Math.abs(out.width / beforeOut.width - 0.5) < 0.05 && where.col === 8 && where.row === 5, `a finger on a token still pinches, and the token stays: ${results.at(-1)}`);

  await seat.screenshot({ path: path.join(tmpdir(), "kraken-touch-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok touch: a full-screen touch player pans the map with one finger and pinch-zooms with two about their midpoint, a finger on a token included (${results.join("; ")}). ${path.join(tmpdir(), "kraken-touch-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
