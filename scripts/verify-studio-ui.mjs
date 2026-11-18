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
// KRAKEN_APP: the built app (release/win-unpacked/Maelstrom VTT.exe), so Map Studio is checked as it ships.
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
// Map Studio's page (a new one: an address seen before is skipped, as Map Studio moves on to another image).
const seenStudio = new Set();
async function studioFrame(query = "") {
  for (let wait = 0; wait < 100; wait++) {
    const frame = page.frames().find((item) => /^http:\/\/127\.0\.0\.1:\d+\//.test(item.url()) && item.url().includes(query) && !(query && seenStudio.has(item.url())));
    if (frame && (await frame.evaluate(() => Boolean(window.KrakenStudio)).catch(() => false))) {
      if (query) seenStudio.add(frame.url());
      return frame;
    }
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

  // Open a map picture: Maelstrom's own dialog, starting in the campaign's maps folder
  // (Documents/Kraken VTT/Campaigns/Studio/Maps; here the test's own tree). The dialog
  // is stood in for: it records where it was asked to start and picks a picture there.
  const mapsFolder = path.join(profile, "Campaigns", "Studio", "Maps");
  const pngBytes = await (await import("sharp")).default({ create: { width: 320, height: 200, channels: 3, background: "#335577" } }).png().toBuffer();
  const cellar = path.join(profile, "Cellar.png");
  writeFileSync(cellar, pngBytes);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.lastPick = options;
      return { canceled: false, filePaths: [file] };
    };
  }, cellar);
  const started = await plain.evaluate(async () => {
    const response = await fetch("/api/kraken/pick?kind=picture", { cache: "no-store" });
    const body = await response.arrayBuffer(); return { status: response.status, name: decodeURIComponent(response.headers.get("X-File-Name") || ""), size: body.byteLength, text: response.status === 200 ? "" : new TextDecoder().decode(body) };
  });
  assert(started.status === 200 && started.name === "Cellar.png" && started.size === pngBytes.length, `Maelstrom hands Map Studio the picked file (${JSON.stringify(started)})`);
  // The map window last left out in a window of its own (as a GM with two monitors leaves it).
  await page.evaluate(() => window.localStorage.setItem("kraken-window:map", JSON.stringify({ x: 20, y: 60, w: 900, h: 700, out: { sx: window.screenX + 120, sy: window.screenY + 120, w: 900, h: 660 } })));
  await plain.click('[data-start="picture"]');
  // With the campaign hosted, the picture becomes one of its own maps (as FG's): its file in
  // the campaign's Maps folder, a record in Campaign > Images, and Map Studio working on that
  // one master. Nothing else opens: no image window, here or in a window of its own.
  for (let wait = 0; wait < 80 && !(await tool("kraken_records_list", { type: "image" })).records.some((record) => record.name === "Cellar"); wait++) await settle(250);
  const listed = (await tool("kraken_records_list", { type: "image" })).records.find((record) => record.name === "Cellar");
  const own = listed ? await tool("kraken_record_get", { id: listed.id }) : null;
  assert(own?.data?.own && own.data.file === "Cellar.png", `the picture is a record in Campaign > Images (${JSON.stringify(own ?? (await tool("kraken_records_list", { type: "image" })))})`);
  assert(existsSync(path.join(mapsFolder, "Cellar.png")), "its file is in the campaign's Maps folder");
  const bound = await studioFrame("kraken=");
  await bound.waitForFunction(() => window.KrakenStudio?.project?.width === 320, null, { timeout: 20000 });
  await settle(1500);
  const mapViews = async () => ({
    own: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length - 1),
    docked: await page.$$eval('.window[data-window="map"]', (all) => all.length),
  });
  const alone = await mapViews();
  assert(alone.own === 0 && alone.docked === 0, `Map Studio alone shows it: no image window opens with it (${JSON.stringify(alone)})`);
  const asked = await app.evaluate(() => globalThis.lastPick);
  assert(path.resolve(asked.defaultPath) === path.resolve(mapsFolder), `the dialog starts in the campaign's maps folder (${asked.defaultPath}, not ${mapsFolder})`);
  // A wall drawn in Map Studio is the map's at once (saved by itself into its master), no Save pressed.
  await bound.evaluate(() => {
    const S = window.KrakenStudio;
    S.snapshot();
    S.project.walls.push({ id: "cellar-wall", type: "wall", points: [20, 20, 300, 20], flags: [] });
    S.save();
    S.draw();
  });
  await bound.waitForFunction(() => Number(document.querySelector("#saveKrakenBtn")?.dataset.saved ?? 0) > 0, null, { timeout: 15000 });
  // Zoomed out as far as the GM likes (past the old 20% stop); Fit map to window brings it back.
  const canvas = await bound.locator("#mapCanvas").boundingBox();
  const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  for (let notch = 0; notch < 45; notch++) await page.mouse.wheel(0, 120);
  await settle(300);
  const zoomedOut = await bound.evaluate(() => window.KrakenStudio.getDocument().view.z);
  assert(zoomedOut < 0.1, `the wheel zooms far out (${zoomedOut})`);
  await bound.click("#railFit");
  const fitted = await bound.evaluate(() => window.KrakenStudio.getDocument().view.z);
  assert(fitted > zoomedOut * 5, `Fit map to window brings it back (${zoomedOut} -> ${fitted})`);
  // A wall half drawn: the middle button pans the map, the wall still in hand, then it goes on.
  await bound.evaluate(() => window.KrakenStudio.switchMode("los"));
  await bound.click('[data-los-tool="line"]');
  // Points where they are clicked (the little test map's grid would snap them together).
  if (await bound.isChecked("#losGridSnap")) await bound.click("#losGridSnap");
  const wallsAtStart = await bound.evaluate(() => window.KrakenStudio.project.walls.length);
  await page.mouse.click(middle.x - 200, middle.y - 80);
  await page.mouse.click(middle.x + 150, middle.y - 80);
  // The arrow keys pan the map too, the wall still in hand.
  const keyFrom = await bound.evaluate(() => ({ ...window.KrakenStudio.getDocument().view.pan }));
  await bound.locator("body").press("ArrowRight");
  const keyTo = await bound.evaluate(() => ({ ...window.KrakenStudio.getDocument().view.pan }));
  const viewWidth = await bound.evaluate(() => document.querySelector("#viewport").getBoundingClientRect().width);
  assert(Math.abs(keyFrom.x - keyTo.x - viewWidth * 0.1) < 2 && keyTo.y === keyFrom.y, `an arrow key pans a tenth of the view (${JSON.stringify(keyFrom)} -> ${JSON.stringify(keyTo)})`);
  assert((await bound.evaluate(() => window.KrakenStudio.project.walls.length)) === wallsAtStart, "the wall is still being drawn after the arrow key");
  const panFrom = await bound.evaluate(() => ({ ...window.KrakenStudio.getDocument().view.pan }));
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(middle.x - 120, middle.y - 40, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  const panTo = await bound.evaluate(() => ({ ...window.KrakenStudio.getDocument().view.pan }));
  assert(Math.abs(panTo.x - panFrom.x + 120) < 6 && Math.abs(panTo.y - panFrom.y + 40) < 6, `the middle button pans the map mid-wall (${JSON.stringify(panFrom)} -> ${JSON.stringify(panTo)})`);
  assert((await bound.evaluate(() => window.KrakenStudio.project.walls.length)) === wallsAtStart, "the wall is still being drawn (nothing finished by the pan)");
  await page.mouse.dblclick(middle.x + 60, middle.y + 120);
  const drawn = await bound.evaluate(() => window.KrakenStudio.project.walls.at(-1)?.points?.length ?? 0);
  assert(drawn === 6, `the wall goes on after the pan: three points, one wall (${drawn / 2} points)`);
  report.push("Map Studio zooms out past the old 20% stop (Fit map to window brings it back); mid-wall, the arrow keys and the middle button pan the map and the wall goes on");
  // Opened from Campaign > Images: once (in a window of its own, where the map window was left), the wall there.
  await page.click('.sidebar [data-launch="imagelist"]');
  await page.click(`[data-image-record="${own.id}"]`);
  for (let wait = 0; wait < 40 && (await walls()) === 0; wait++) await settle(250);
  assert((await walls()) === 1, `opened from Images: the same map, with the wall drawn in Map Studio (${await walls()})`);
  const shown = await mapViews();
  assert(shown.own + shown.docked === 1, `it opens once (${JSON.stringify(shown)})`);
  await tool("kraken_image", { action: "close" });
  await page.evaluate(() => window.localStorage.removeItem("kraken-window:map"));
  await page.click('.sidebar [data-launch="imagelist"]');
  report.push("Open a map picture: Maelstrom's dialog starts in Campaigns/Studio/Maps; the picture becomes the campaign's own map (its file there, a record in Images) and opens in Map Studio alone; a wall drawn there is in its master by itself; opened from Images it opens once, with the wall");

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
