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
// A look at painted water and rain kept off a roof, close up (no checks).
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "FX shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47420, password: "" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_open_adventure", { path: bundle });
  await page.waitForSelector(".map-toolbar");
  await page.click('[aria-label="Fit"]');
  await settle(600);
  const middle = await page.evaluate(() => {
    const world = document.querySelector(".world");
    return { w: parseFloat(world.style.width), h: parseFloat(world.style.height) };
  });
  const cx = Math.round(middle.w / 2);
  const cy = Math.round(middle.h / 2);
  const river = [];
  for (let i = 0; i <= 30; i += 1) river.push(cx - 900 + i * 60, Math.round(cy + 200 + Math.sin(i / 4) * 160));
  const water = await tool("kraken_fx", { action: "add", type: "water", name: "River" });
  await tool("kraken_fx", { action: "paint", id: water.id, area: { stroke: { width: 160, points: river } }, soft: 24 });
  await tool("kraken_fx", { action: "paint", id: water.id, area: { polygon: [cx + 300, cy - 500, cx + 650, cy - 560, cx + 720, cy - 300, cx + 380, cy - 220] } });
  const rain = await tool("kraken_fx", { action: "add", type: "rain", name: "Rain" });
  await tool("kraken_fx", { action: "paint", id: rain.id, area: { rect: { x: cx - 300, y: cy - 300, width: 600, height: 400 } }, maskMode: "outside" });
  for (let i = 0; i < 3; i += 1) {
    await page.click('[aria-label="Zoom in"]').catch(() => undefined);
    await settle(300);
  }
  await settle(1500);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-fx-shot.png") });
  console.log(path.join(tmpdir(), "kraken-fx-shot.png"));
} finally {
  child.kill();
  await app.close();
}
