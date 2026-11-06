// Animated portraits and tokens (looping WebM, the token with transparency)
// in the real app: Kraken's own animated pair is in the assets folder; a
// character given the animated portrait and token shows both moving: the
// portrait on the portrait bar and the token on the map, each a looping video
// that is playing. Skipped when this computer has no animated pair.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const assets = path.join(process.env.APPDATA ?? "", "kraken-vtt", "assets");
const pair = ["portraits", "tokens"].map((kind) => path.join(assets, kind, "Elf", "Elf Illusionist.webm"));
if (!pair.every(existsSync)) {
  console.log("skip animated art ui: no animated Elf Illusionist here (scripts/animate-portrait.py makes it)");
  process.exit(0);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-animated-art-"));
for (const [index, kind] of ["portraits", "tokens"].entries()) {
  mkdirSync(path.join(profile, "assets", kind, "Elf"), { recursive: true });
  cpSync(pair[index], path.join(profile, "assets", kind, "Elf", "Elf Illusionist.webm"));
}
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`, "--autoplay-policy=no-user-gesture-required"], cwd: process.cwd(), env });
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
page.on("pageerror", (error) => failures.push(error.message));
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Animated art", ruleset: "Worldbuilding" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47418, password: "" });
  await page.waitForSelector("text=Hosting");
  const portraits = (await tool("kraken_art", { kind: "portrait", search: "Illusionist" })).art;
  const tokens = (await tool("kraken_art", { kind: "token", search: "Illusionist" })).art;
  const portrait = portraits.find((item) => item.id.endsWith(".webm"));
  const token = tokens.find((item) => item.id.endsWith(".webm"));
  assert(portrait?.video && token?.video && portrait.group === "Kraken · Elf", `the animated pair is in the art library, Kraken's Elf folder: ${JSON.stringify({ portrait, token })}`);
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector(".map-toolbar");
  const hero = await tool("kraken_record_create", { type: "character", name: "Sylvaine", visibility: "all", data: { portrait: portrait.id, token: token.id, race: "Elf" } });
  await tool("kraken_party", { action: "add", recordId: hero.id }).catch(() => undefined);
  await tool("kraken_token_place", { recordId: hero.id, col: 8, row: 4 });
  await page.waitForSelector(".token video", { timeout: 15000 });
  const playing = async (selector) =>
    page.$eval(selector, async (video) => {
      const start = video.currentTime;
      await new Promise((resolve) => setTimeout(resolve, 900));
      return { loop: video.loop, moved: video.currentTime !== start, width: video.videoWidth, paused: video.paused };
    });
  const onMap = await playing(".token video");
  assert(onMap.loop && onMap.moved && !onMap.paused && onMap.width === 256, `the token on the map is a playing loop: ${JSON.stringify(onMap)}`);
  await page.waitForSelector(".portrait-strip video", { timeout: 10000 });
  const onBar = await playing(".portrait-strip video");
  assert(onBar.loop && onBar.moved && onBar.width === 512, `the portrait on the portrait bar is a playing loop: ${JSON.stringify(onBar)}`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-animated-art.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok animated art ui: the animated Elf Illusionist (portrait 512, token 256 with transparency) is in the art library; on the map and on the portrait bar each is a looping video, playing. ${path.join(tmpdir(), "kraken-animated-art.png")}`);
} finally {
  child.kill();
  await app.close();
}
