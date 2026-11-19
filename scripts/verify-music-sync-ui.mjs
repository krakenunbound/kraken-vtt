// Music in step (docs/feature-parity.md S9): the GM starts a music track; a test player joins some seconds
// later in a full-screen Chrome; the player's track starts where the table's is, not from the top. The player's
// position is read from the sound engine (window.__krakenSound.playingHere().musicAt).
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-music-sync-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "Music sync", ruleset: "Castles & Crusades" });
  const port = 47419;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  // One of the shipped music tracks, played on its own (a track, not a folder: it loops).
  const listed = await tool("kraken_sound", { action: "list", kind: "music" });
  const track = listed.sounds.find((item) => item.id.startsWith("music/"));
  assert(track, `a music track to play: ${JSON.stringify(listed).slice(0, 200)}`);
  const started = await tool("kraken_sound", { action: "music", do: "play", id: track.id });
  const startedAt = started.music.startedAt;
  await settle(6000);

  browser = await chromium.launch({ args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  // Where the player's track is once it plays, against where the table's is now.
  let heard = null;
  for (let tries = 0; tries < 40 && !(heard?.musicAt > 0); tries++) {
    await settle(250);
    heard = await seat.evaluate(() => window.__krakenSound?.playingHere());
  }
  const table = (Date.now() - startedAt) / 1000;
  assert(heard?.music === track.id, `the player hears the table's track: ${JSON.stringify(heard)}`);
  assert(Math.abs(heard.musicAt - table) < 2, `the player joins at the table's moment: theirs ${heard.musicAt.toFixed(1)} s, the table's ${table.toFixed(1)} s`);
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok music sync: a player joining ${table.toFixed(1)} s into ${track.id} hears it from ${heard.musicAt.toFixed(1)} s, not from the top.`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
