// A busy table: B1's upper level with 16 tokens (8 of them a test player's,
// each with darkvision), darkness at 0.8, line of sight on; the GM and the
// test player (Chrome) each drag the map around while the frames are counted.
// Says whether the map's drawing (DOM and SVG) is what costs frames.
// (A probe, not a check.)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

const B1 = "B1 In Search of the Unknown (C&C)";
const profile = process.env.PROFILE || mkdtempSync(path.join(tmpdir(), "kraken-map-probe-"));
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
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    answers.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const frames = async (run, on = page) => {
  await on.evaluate(() => {
    window.__frames = [];
    window.__counting = true;
    const tick = (t) => {
      window.__frames.push(t);
      if (window.__counting) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const start = performance.now();
  await run();
  const took = performance.now() - start;
  const list = await on.evaluate(() => {
    window.__counting = false;
    return window.__frames;
  });
  const gaps = list.slice(1).map((t, index) => t - list[index]).sort((a, b) => b - a);
  return { took: Math.round(took), longest: Math.round(gaps[0] ?? 0), over50: gaps.filter((gap) => gap > 50).length, frames: list.length };
};
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Busy probe", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47449, password: "" });
  await page.waitForSelector("text=Hosting");
  await page.click('.sidebar [data-launch="library"]');
  await page.waitForSelector(".library-window");
  await page.selectOption('[aria-label="Library module"]', B1);
  await page.click('[data-action="library-maps"]');
  await page.waitForSelector("text=The maps are on the table", { timeout: 120000 });
  await page.click('.sidebar [data-launch="library"]');
  await page.waitForSelector('.world .map-picture[data-ready="true"]', { timeout: 60000 });
  for (let index = 0; index < 8; index++) {
    const hero = await tool("kraken_record_create", { type: "character", name: `Hero ${index + 1}`, owner: "A test player", visibility: "owner", data: { race: "Dwarf", senses: "Darkvision 60 ft" } });
    await tool("kraken_token_place", { recordId: hero.id, col: 30 + (index % 4), row: 20 + Math.floor(index / 4) });
  }
  for (let index = 0; index < 8; index++) await tool("kraken_token_place", { name: `Goblin ${index + 1}`, col: 36 + (index % 4), row: 24 + Math.floor(index / 4), faction: "foe" });
  await tool("kraken_scene_settings", { darkness: 0.8 });
  if ((await page.getAttribute('[data-action="sight"]', "aria-pressed")) !== "true") await page.click('[data-action="sight"]');
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await seat.goto("http://127.0.0.1:47449/");
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "probe-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".viewport .world", { state: "attached", timeout: 30000 }).catch(async (error) => { await seat.screenshot({ path: "C:/Users/THEKRA~1/AppData/Local/Temp/claude/0cf0f3268f2fac66/66e8579b-5a7e-4c06-9929-944d5d6eb983/scratchpad/seat.png" }); throw error; });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const pan = (on) => async () => {
    const box = await on.locator(".viewport").boundingBox();
    const at = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
    await on.mouse.move(at.x, at.y);
    await on.mouse.down();
    for (let step = 0; step < 120; step++) await on.mouse.move(at.x + Math.sin(step / 10) * 300, at.y + Math.cos(step / 10) * 200);
    await on.mouse.up();
  };
  for (const [who, on] of [["GM", page], ["player", seat]]) {
    for (const button of await on.$$(".window-layer .window:not([data-window=map]) .window-close")) await button.click().catch(() => undefined);
    const panned = await frames(pan(on), on);
    const svg = await on.$$eval(".viewport svg *", (list) => list.length);
    console.log(`${who}: ${panned.frames} frames in ${panned.took} ms (${Math.round((panned.frames * 1000) / panned.took)} fps), longest gap ${panned.longest} ms, ${panned.over50} over 50 ms; ${svg} SVG elements on the map`);
  }
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
