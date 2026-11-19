// A player's browser at its default 90% UI scale (the page's CSS zoom): what the player drags stays under the
// pointer. A window by its title bar, the quick slots by their grip and the chat by its stretch grip, each dragged
// a known distance; each must follow the pointer that far on screen (within a few pixels), not 90% of it.
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-ui-scale-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "UI scale", ruleset: "Castles & Crusades" });
  const port = 47415;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  const zoom = await seat.evaluate(() => document.documentElement.style.zoom);
  assert(zoom === "0.9", `the player's page is at the default 90%: ${zoom}`);

  // Drag by (dx, dy) from a point; the box of what moved, before and after, on screen.
  const dragBy = async (handle, box, dx, dy) => {
    const grip = await seat.locator(handle).first().boundingBox();
    const before = await seat.locator(box).first().boundingBox();
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await seat.mouse.move(x, y);
    await seat.mouse.down();
    await seat.mouse.move(x + dx, y + dy, { steps: 10 });
    await seat.mouse.up();
    await settle();
    const after = await seat.locator(box).first().boundingBox();
    return { before, after };
  };
  const near = (a, b) => Math.abs(a - b) <= 4;
  const results = [];

  // A window by its title bar: Characters, moved 200 right and 120 down.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.waitForSelector(".window .window-title");
  const win = await dragBy(".window .window-title", ".window", 200, 120);
  results.push(`window ${Math.round(win.after.x - win.before.x)},${Math.round(win.after.y - win.before.y)}`);
  assert(near(win.after.x - win.before.x, 200) && near(win.after.y - win.before.y, 120), `the window follows the pointer 200,120: ${results.at(-1)}`);

  // The quick slots by their grip: moved 160 left and 100 up.
  const slots = await dragBy(".quick-slots-grip", ".quick-slots", -160, -100);
  results.push(`quick slots ${Math.round(slots.after.x - slots.before.x)},${Math.round(slots.after.y - slots.before.y)}`);
  assert(near(slots.after.x - slots.before.x, -160) && near(slots.after.y - slots.before.y, -100), `the quick slots follow the pointer -160,-100: ${results.at(-1)}`);

  // The chat stretched by its grip: 120 wider (the grip is on its top right corner).
  const chat = await dragBy(".chat-grip", ".chat-dock", 120, 0);
  results.push(`chat wider by ${Math.round(chat.after.width - chat.before.width)}`);
  assert(near(chat.after.width - chat.before.width, 120), `the chat stretches as far as the pointer goes, 120: ${results.at(-1)}`);

  await seat.screenshot({ path: path.join(tmpdir(), "kraken-ui-scale-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok ui scale: a player at 90% drags a window, the quick slots and the chat's stretch grip, each following the pointer (${results.join("; ")}). ${path.join(tmpdir(), "kraken-ui-scale-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
