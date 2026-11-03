// The Sound window's ▶ buttons in the real app play Kraken's own (shipped)
// sounds: every trigger's preview and a voice, ambience loop and music track
// from its tabs. Starts the app (throwaway profile, muted) and drives it as
// an MCP client, then clicks the buttons as the GM would.
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

const profile = mkdtempSync(path.join(tmpdir(), "kraken-sound-ui-"));
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

// Every sound file the window fetched, and how it answered.
const fetched = [];
page.on("response", (response) => {
  if (response.url().includes("/sound/file")) fetched.push({ url: response.url(), status: response.status() });
});

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Sound UI", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47393, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_windows", { action: "open", kind: "sound" });
  await page.waitForSelector('[data-tab="triggers"]');

  // Chat triggers: every ▶ fetches a real sound and plays it.
  await page.click('[data-tab="triggers"]');
  await page.waitForSelector("[data-try]");
  const tries = await page.$$eval("[data-try]", (buttons) => buttons.map((button) => button.getAttribute("data-try")));
  assert(tries.length >= 150, `the trigger list shows the triggers (${tries.length})`);
  let silent = [];
  for (const id of tries) {
    const before = fetched.length;
    await page.click(`[data-try="${id}"]`);
    for (let wait = 0; wait < 30 && fetched.length === before; wait++) await settle(50);
    const note = await page.$eval(".sound-note", (element) => element.textContent).catch(() => "");
    // A sound played before comes from the engine's cache (no new fetch); an
    // empty folder shows the window's note.
    if (note) silent.push(`${id} (${note})`);
  }
  assert(fetched.length >= tries.length / 2, `the previews fetched sounds (${fetched.length})`);
  assert(silent.length === 0, `every trigger's ▶ plays a sound; silent: ${silent.slice(0, 8).join(", ")}`);
  assert(fetched.every((one) => one.status === 200 || one.status === 206), `every sound file answered: ${JSON.stringify(fetched.filter((one) => one.status >= 300).slice(0, 3))}`);
  const heard = await page.evaluate(() => window.__krakenSound.playingHere());
  assert(heard.running, `the sound engine runs (${JSON.stringify(heard)})`);

  // A trigger opens to its sounds, each heard on its own (#1, #2), to tell them apart.
  await page.click('[data-trigger-sounds="attack-sword-attack-any"], [data-trigger*="sword"] [data-trigger-sounds]');
  const variants = await page.$$eval(".sound-trigger-files [data-hear]", (buttons) => buttons.map((button) => button.getAttribute("data-hear")));
  assert(variants.length >= 2, `the sword's trigger lists its sounds (${variants.join(", ")})`);
  for (const id of variants) {
    const before = await page.evaluate(() => window.__krakenSound.playingHere().effects);
    await page.click(`.sound-trigger-files [data-hear="${id}"]`);
    let now = before;
    for (let wait = 0; wait < 40 && now <= before; wait++) {
      await settle(50);
      now = await page.evaluate(() => window.__krakenSound.playingHere().effects);
    }
    assert(now > before, `${id} plays on its own`);
  }
  const labels = await page.$$eval(".sound-trigger-files .sound-file-name b", (marks) => marks.map((mark) => mark.textContent));
  assert(labels.includes("#1") && labels.includes("#2"), `each sound is numbered (${labels.join(" ")})`);

  // Sound effects as a tree: Weapons > Sword > Hit > #1, #2.
  await page.click('[data-tab="sfx"]');
  for (const folder of ["sfx/Weapons", "sfx/Weapons/Sword", "sfx/Weapons/Sword/Hit"]) await page.click(`[data-folder="${folder}"]`);
  const hits = await page.$$eval('[data-hear^="sfx/Weapons/Sword/Hit/"]', (buttons) => buttons.map((button) => button.getAttribute("data-hear")));
  assert(hits.length === 2, `Weapons > Sword > Hit opens to its two sounds (${hits.join(", ")})`);
  const tableBefore = fetched.length;
  await page.click(`[data-hear="${hits[1]}"]`);
  await settle(600);
  assert((await page.evaluate(() => window.__krakenSound.playingHere().effects)) > 0 || fetched.length > tableBefore, "a sound in the tree plays when heard");
  await page.click("[data-hear-stop]");

  // The other tabs have Kraken's own sounds in them.
  const library = await tool("kraken_sound", { action: "list" });
  const kinds = {};
  for (const group of library.groups ?? []) kinds[group.id.split("/")[0]] = (kinds[group.id.split("/")[0]] ?? 0) + group.count;
  assert(kinds.oneshots >= 71 && kinds.sfx >= 400 && kinds.ambience >= 32 && kinds.music >= 1, `the shipped library ${JSON.stringify(kinds)}`);
  console.log(`SOUND_UI_OK ${tries.length} trigger previews played, each sound of a trigger and the tree heard on its own (${fetched.length} files fetched); library ${JSON.stringify(kinds)}`);
} finally {
  child.kill();
  await app.close();
}
