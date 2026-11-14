// The GM's sound is heard on a test player's screen (Chrome, joined over the
// network as any player): an ambience loop from Kraken's own library, a loop
// of the GM's own (assets/sounds in the GM's data; KRAKEN_TEST_SOUND names a
// file to use, else a made-up tone), and a one-shot. A meter on the player's
// audio output (everything the page plays passes through it) must read each
// sound while it plays, and fall quiet when the GM clears the loops.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// A one-second 220 Hz tone, 16-bit mono WAV.
function toneWav() {
  const rate = 22050;
  const samples = rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 12000), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-player-sound-"));
// The GM's own sound, in their data folder (never Kraken's shipped library).
const own = path.join(profile, "assets", "sounds", "ambience", "GM Test Loop");
mkdirSync(own, { recursive: true });
if (process.env.KRAKEN_TEST_SOUND) copyFileSync(process.env.KRAKEN_TEST_SOUND, path.join(own, `loop${path.extname(process.env.KRAKEN_TEST_SOUND)}`));
else writeFileSync(path.join(own, "loop.wav"), toneWav());

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

// The player's meter: every AudioContext's output passes through a tap with an
// analyser; each buffer started is noted (its length and whether it loops).
function meter() {
  const Real = window.AudioContext ?? window.webkitAudioContext;
  const state = { peak: 0, starts: [], contexts: [] };
  window.__playerSound = state;
  class Metered extends Real {
    constructor(...options) {
      super(...options);
      const tap = this.createGain();
      const analyser = this.createAnalyser();
      analyser.fftSize = 2048;
      tap.connect(analyser);
      tap.connect(super.destination);
      this.__tap = tap;
      state.contexts.push(this);
      const samples = new Float32Array(analyser.fftSize);
      setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        for (const value of samples) state.peak = Math.max(state.peak, Math.abs(value));
      }, 40);
    }
    get destination() {
      return this.__tap ?? super.destination;
    }
  }
  window.AudioContext = Metered;
  window.webkitAudioContext = Metered;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    state.starts.push({ seconds: Math.round((this.buffer?.duration ?? 0) * 10) / 10, loop: this.loop });
    return start.apply(this, args);
  };
}

const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Player sound", ruleset: "Castles & Crusades" });
  const port = 47438;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.addInitScript(meter);
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  // Joining is a click: the browser lets the page's audio start.
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  const read = () => seat.evaluate(() => {
    const s = window.__playerSound;
    return { peak: s.peak, starts: s.starts.length, last: s.starts.at(-1) ?? null, states: s.contexts.map((c) => c.state) };
  });
  const reset = () => seat.evaluate(() => { window.__playerSound.peak = 0; });
  const heard = async (what, loop) => {
    const before = (await read()).starts;
    await reset();
    for (let wait = 0; wait < 120; wait++) {
      const now = await read();
      if (now.starts > before && now.last?.loop === loop && now.peak > 0.005) {
        assert(now.states.includes("running"), `${what}: the player's audio is held shut (${now.states})`);
        return `${what} ${now.last.seconds}s peak ${now.peak.toFixed(3)}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`the player did not hear ${what}: ${JSON.stringify(await read())}`);
  };
  const quiet = async (what) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await reset();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const now = await read();
    assert(now.peak < 0.002, `${what}: still playing on the player's screen (peak ${now.peak})`);
  };

  const results = [];
  await tool("kraken_sound", { action: "ambience", do: "add", id: "ambience/Tavern" });
  results.push(await heard("Kraken's Tavern loop", true));
  await tool("kraken_sound", { action: "ambience", do: "clear" });
  await quiet("the Tavern loop, cleared");

  await tool("kraken_sound", { action: "ambience", do: "add", id: "ambience/GM Test Loop" });
  results.push(await heard("the GM's own loop", true));
  await tool("kraken_sound", { action: "ambience", do: "clear" });
  await quiet("the GM's own loop, cleared");

  await tool("kraken_sound", { action: "play", id: "oneshots/Innkeeper" });
  results.push(await heard("the Innkeeper one-shot", false));

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok player sound ui: a test player in Chrome hears the GM's sounds and the loops stop when cleared (${results.join("; ")})`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
