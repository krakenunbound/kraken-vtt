// How smooth a die dragged from the tray is on a busy table: a map (B1, its
// lighting and doors), animated portraits and tokens, a long chat. Frames
// counted during the drag, and the longest gap between them. Each part can be
// left out to see what it costs: NOMAP=1, NOART=1, LINES=0. (A probe, not a check.)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const B1 = "B1 In Search of the Unknown (C&C)";
const profile = mkdtempSync(path.join(tmpdir(), "kraken-drag-probe-"));
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
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
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Drag probe", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47439, password: "" });
  await page.waitForSelector("text=Hosting");
  if (!process.env.NOMAP) {
    await page.click('.sidebar [data-launch="library"]');
    await page.waitForSelector(".library-window");
    await page.selectOption('[aria-label="Library module"]', B1);
    await page.click('[data-action="library-maps"]');
    await page.waitForSelector("text=The maps are on the table", { timeout: 120000 });
    await page.click('.sidebar [data-launch="library"]');
  }
  if (!process.env.NOART && !process.env.NOMAP) {
    const portraits = (await tool("kraken_art", { kind: "portrait", search: "Elf" })).art.filter((item) => item.id.endsWith(".webm"));
    const tokens = (await tool("kraken_art", { kind: "token", search: "Elf" })).art.filter((item) => item.id.endsWith(".webm"));
    for (let index = 0; index < 8; index++) {
      const hero = await tool("kraken_record_create", { type: "character", name: `Hero ${index + 1}`, visibility: "all", data: { portrait: portraits[index % portraits.length]?.id, token: tokens[index % tokens.length]?.id } });
      await tool("kraken_token_place", { recordId: hero.id, col: 10 + index, row: 10 });
    }
  }
  const lines = Number(process.env.LINES ?? 150);
  for (let index = 0; index < lines; index++) await tool("kraken_chat", { text: index % 3 ? `Line ${index}, a little long so that it wraps the way chat does.` : `/r 2d6+${index} Attack` }).catch(() => undefined);
  await page.waitForTimeout(4000);
  const die = await page.locator(".dice-tray .tray-die").first().boundingBox();
  await page.evaluate(() => {
    window.__frames = [];
    const tick = (t) => {
      window.__frames.push(t);
      if (window.__frames.length < 6000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(die.x + die.width / 2, die.y + die.height / 2);
  await page.mouse.down();
  const start = Date.now();
  for (let step = 0; step < 240; step++) await page.mouse.move(die.x + 20 + step * 3, die.y - 10 - step * 2);
  const took = Date.now() - start;
  const frames = await page.evaluate(() => window.__frames.slice());
  const ghost = await page.$(".dice-ghost");
  await page.mouse.up();
  // The throw: the dice rolling across the table for two seconds.
  const thrownFrom = await page.evaluate(() => window.__frames.length);
  await page.waitForTimeout(2000);
  const thrown = await page.evaluate((from) => window.__frames.slice(from), thrownFrom);
  const rollGaps = thrown.slice(1).map((t, index) => t - thrown[index]);
  console.log(`  throw: ${thrown.length} frames in 2 s, longest gap ${Math.round(Math.max(...rollGaps))} ms, ${rollGaps.filter((gap) => gap > 34).length} over 34 ms`);
  const gaps = frames.slice(1).map((t, index) => t - frames[index]);
  console.log(`map ${process.env.NOMAP ? "no" : "B1"}, art ${process.env.NOART || process.env.NOMAP ? "no" : "8 animated"}, chat ${lines}; ghost ${ghost ? "shown" : "MISSING"}; 240 moves in ${took} ms; ${frames.length} frames, longest gap ${Math.round(Math.max(...gaps))} ms, ${gaps.filter((gap) => gap > 34).length} over 34 ms, mean ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)} ms`);
} finally {
  child.kill();
  await app.close();
}
