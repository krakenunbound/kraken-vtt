// Ctrl+wheel over a token (the GM's): bigger a notch up, smaller a notch down, about a tenth each, in the real app.
// The map's zoom is not touched while the pointer is on a token.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

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
try {
  for (let tries = 0; ; tries++) {
    try { await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-token-wheel", version: "1" } }); break; } catch (error) { if (tries > 20) throw error; await settle(500); }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Wheel", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47501, password: "" });
  await page.waitForSelector("text=Hosting");
  const books = await tool("kraken_books", { action: "list" });
  const tower = books.find((book) => book.name === "The Empty Watchtower");
  await tool("kraken_books", { action: "activate", book: tower.id });
  await settle(2000);
  await tool("kraken_open_fg_module", { module: tower.name, maps: ["The Watchtower Yard"] });
  await settle(2500);
  const placed = await tool("kraken_token_place", { name: "Goblin", col: 4, row: 4 });
  await settle(1500);
  const squares = async () => (await tool("kraken_map", {})).tokens.find((token) => token.id === placed.id).squares;
  const start = await squares();
  const box = await page.$(`[data-token="${placed.id}"]`).then((el) => el.boundingBox());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await settle(150); }
  await page.keyboard.up("Control");
  await settle(1200);
  const bigger = await squares();
  await page.keyboard.down("Control");
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 100); await settle(150); }
  await page.keyboard.up("Control");
  await settle(1200);
  const smaller = await squares();
  const zoom = await page.$eval(".map-window .viewport .world", (el) => getComputedStyle(el).transform);
  console.log(JSON.stringify({ start, bigger, smaller }));
  assert(bigger > start * 1.5 && smaller < bigger && smaller > start, `Ctrl+wheel up grows the token, down shrinks it: ${start} -> ${bigger} -> ${smaller}`);
  console.log("ok ctrl+wheel sizes the token");
} finally {
  child.kill();
  await app.close().catch(() => undefined);
}
