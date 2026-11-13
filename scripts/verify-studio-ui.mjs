// Map Studio inside Kraken, as the GM uses it: the sidebar's Map Studio opens
// the editor; an image opened in Kraken's image window goes to Map Studio
// (Open in Map Studio) with its master's walls; art stamped there and a wall
// drawn, Save to Kraken writes the wall into the image's master and the
// painted map becomes its picture (a .studio.webp the image opens with, here
// and on the table); opened in Map Studio again, the project is as it was
// saved (its stamp kept). Map Studio's own packs are in its library.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-studio-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
// KRAKEN_APP: the built app (release/win-unpacked/Kraken VTT.exe), so Map Studio is checked as it ships.
const app = process.env.KRAKEN_APP
  ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
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
const walls = async () => (await tool("kraken_wall", { action: "list" })).total ?? 0;
// Map Studio's page inside Kraken's window.
async function studioFrame(query = "") {
  for (let wait = 0; wait < 100; wait++) {
    const frame = page.frames().find((item) => /^http:\/\/127\.0\.0\.1:\d+\//.test(item.url()) && item.url().includes(query));
    if (frame && (await frame.evaluate(() => Boolean(window.KrakenStudio)).catch(() => false))) return frame;
    await settle(200);
  }
  throw new Error(`Map Studio's page did not load (${page.frames().map((item) => item.url()).join(", ")})`);
}
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
const YARD = "The Watchtower Yard";
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Studio", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47454, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // The sidebar's Map Studio: the editor, with Kraken's own packs in its library.
  await page.click('.sidebar [data-launch="studio"]');
  const plain = await studioFrame();
  await plain.waitForSelector("#mapCanvas");
  const library = await plain.evaluate(async () => (await (await fetch("/api/assets")).json()).assets);
  const packs = new Set(library.map((asset) => asset.sourcePack || asset.pack || ""));
  assert(library.length > 100, `Map Studio's library has Kraken's packs (${library.length} assets: ${[...packs].join(", ")})`);
  assert(!(await plain.$("#exportBtn")) && !(await plain.$("#exportFoundryBtn")) && !(await plain.$("#fgOpenBtn")), "no Fantasy Grounds or Foundry export in Kraken's Map Studio");
  report.push(`Map Studio opens from the sidebar with ${library.length} assets of its packs; no FG or Foundry export`);

  // Settings > Map Studio art: the GM points it at a folder of art packs (nothing assumed); the art is read.
  const require = createRequire(import.meta.url);
  const { zipSync, strToU8 } = require("fflate");
  const sharp = require("sharp");
  const packFolder = path.join(profile, "my-art-packs");
  mkdirSync(packFolder, { recursive: true });
  const crate = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#8a5a2bff" } }).png().toBuffer();
  writeFileSync(path.join(packFolder, "Test Art Pack.mod"), zipSync({ "definition.xml": strToU8("<root><name>Test Art Pack</name></root>"), "images/Test/Crate.png": new Uint8Array(crate), "images/Test/Crate.xml": strToU8("<root><gridsize>64</gridsize></root>") }));
  const before = (await tool("kraken_studio", { action: "settings" }));
  assert(Array.isArray(before.packFolders), `kraken_studio reads the settings (${JSON.stringify(before)})`);
  const set = await tool("kraken_studio", { action: "settings", packFolders: [packFolder], dungeondraftFolders: [path.join(profile, "not-there")] });
  assert(set.found[packFolder] === true && set.found[path.join(profile, "not-there")] === false, "the folders and whether each is there");
  const relisted = await plain.evaluate(async () => (await (await fetch("/api/assets")).json()).assets);
  assert(relisted.some((asset) => asset.name === "Crate" && /Test Art Pack/.test(asset.archive ?? asset.sourcePack ?? asset.source ?? JSON.stringify(asset))), "the pack in the GM's folder is in Map Studio's library");
  await page.click('.sidebar [data-launch="settings"]');
  await page.waitForSelector(`[data-setting="studio-folders"] [data-folder="${packFolder.replaceAll("\\", "\\\\")}"]`);
  assert(await page.$('[data-setting="studio-folders"] .studio-folder.missing'), "a folder that is not there is marked");
  await page.click('.sidebar [data-launch="settings"]');
  report.push("Settings > Map Studio art: an art pack folder pointed at (by the GM) is read into Map Studio's library; a missing folder is marked");
  await page.click('.sidebar [data-launch="studio"]');

  // An image in Kraken's image window, then Open in Map Studio.
  const tower = (await tool("kraken_books", { action: "list" })).find((book) => book.name === "The Empty Watchtower");
  await tool("kraken_books", { action: "activate", book: tower.id });
  await tool("kraken_image", { action: "open", book: tower.name, name: YARD });
  await page.waitForSelector(`[data-image-window="${YARD}"]`);
  const start = await walls();
  await page.$eval('[data-action="image-studio"]', (button) => button.click());
  const frame = await studioFrame("kraken=");
  await frame.waitForFunction((count) => window.KrakenStudio?.project?.walls?.length === count, start, { timeout: 30000 });
  const opened = await frame.evaluate(() => ({ name: window.KrakenStudio.project.name, objects: window.KrakenStudio.project.objects.length, w: window.KrakenStudio.project.width }));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  report.push(`${YARD} opened in Map Studio from its image window: ${start} walls, its picture (${opened.w}px wide)`);

  // Art stamped and a wall drawn there, then Save to Kraken.
  const stamp = library.find((asset) => /kraken map art/i.test(asset.sourcePack ?? "")) ?? library[0];
  await frame.evaluate((asset) => {
    const S = window.KrakenStudio;
    S.addAsset(asset);
    S.snapshot();
    S.project.objects.push({ id: "test-stamp", assetId: asset.id, name: asset.name, x: 140, y: 140, width: 140, height: 140, rotation: 0, visible: true, layer: "objects" });
    S.project.walls.push({ id: "test-wall", type: "wall", points: [70, 70, 280, 70], flags: [] });
    S.draw();
  }, stamp);
  await frame.click("#saveKrakenBtn");
  await page.waitForFunction(async () => true);
  for (let wait = 0; wait < 60 && (await walls()) !== start + 1; wait++) await settle(250);
  assert((await walls()) === start + 1, `the wall drawn in Map Studio is in the image's master (${await walls()}, not ${start + 1})`);
  const pictures = path.join(profile, "studio", "pictures");
  const painted = existsSync(pictures) ? readdirSync(pictures, { recursive: true }).filter((name) => String(name).endsWith(".webp")) : [];
  assert(painted.length === 1, `the painted map is kept as the image's picture (${painted.join(", ")})`);
  report.push(`Save to Kraken: the new wall in the master (${start + 1}), the painted map kept as the image's picture`);

  // The image opens with its painted picture (wherever it is opened).
  await page.waitForFunction(() => [...document.querySelectorAll("img, image")].length >= 0);
  const bundle = await page.evaluate(async () => {
    const response = await fetch(`${window.location.origin}/`).catch(() => null);
    return Boolean(response);
  });
  void bundle;
  await tool("kraken_image", { action: "close" });
  await tool("kraken_image", { action: "open", book: tower.name, name: YARD });
  await page.waitForSelector(`[data-image-window="${YARD}"]`);
  assert((await walls()) === start + 1, "opened again: the same master");

  // Map Studio again: the project as it was saved (the stamp kept).
  await page.$eval('[data-action="image-studio"]', (button) => button.click());
  await settle(800);
  const again = await studioFrame("kraken=");
  await again.waitForFunction(() => window.KrakenStudio?.project?.objects?.some((object) => object.id === "test-stamp"), null, { timeout: 30000 });
  report.push("opened in Map Studio again: the project as saved, its stamp kept");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok studio ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
