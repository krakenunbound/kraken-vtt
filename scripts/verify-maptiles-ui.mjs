// Big maps as tiles (mapTiles.ts): B1's two levels (4776x6040 and 4628x6381)
// on the table from the Library; switching between them never stands the
// GM's window still over 100 ms (it stood ~300 ms when the whole picture was
// decoded on the window's thread); the map is tiles, and zoomed in, the
// full-detail level's tiles are the ones in view; zooming stays smooth.
// Skipped without B1. (probe-map-switch.mjs times it in more detail.)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { fgDataFolder } from "../electron/importers/fgModule.cjs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const B1 = "B1 In Search of the Unknown (C&C)";
if (!existsSync(path.join(fgDataFolder(), "modules", `${B1}.mod`))) {
  console.log("skip map tiles ui: no B1 here");
  process.exit(0);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
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
const frames = async (run) => {
  await page.evaluate(() => {
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
  const list = await page.evaluate(() => {
    window.__counting = false;
    return window.__frames;
  });
  const gaps = list.slice(1).map((t, index) => t - list[index]).sort((a, b) => b - a);
  return { took: Math.round(took), longest: Math.round(gaps[0] ?? 0), over50: gaps.filter((gap) => gap > 50).length, frames: list.length };
};
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Map probe", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47447, password: "" });
  await page.waitForSelector("text=Hosting");
  const cdp = process.env.PROFILE_OPEN ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
  }
  const opened = await frames(async () => {
    await page.click('.sidebar [data-launch="library"]');
    await page.waitForSelector(".library-window");
    await page.selectOption('[aria-label="Library module"]', B1);
    await page.click('[data-action="library-maps"]');
    await page.waitForSelector("text=The maps are on the table", { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('.world .map-picture[data-ready="true"]') || document.querySelector(".world > img")?.complete, null, { timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    // Self time by function, the heaviest first.
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    const self = new Map();
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, index) => {
      const node = byId.get(id);
      const key = `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url.split("/").pop()}:${node.callFrame.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (dt[index] ?? 0) / 1000);
    });
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([key, ms]) => `  ${Math.round(ms)} ms  ${key}`).join(String.fromCharCode(10)));
  }

  await page.click('.sidebar [data-launch="library"]');
  const gapsSeen = [];
  const scenes = await page.$$eval('select[aria-label="Scene"] option', (list) => list.map((option) => option.value));
  for (let round = 0; round < 3; round++)
    for (const id of scenes.slice(0, 2)) {
      const switched = await frames(async () => {
        await page.selectOption('select[aria-label="Scene"]', id);
        await page.waitForFunction(() => document.querySelector('.world .map-picture[data-ready="true"]') || document.querySelector(".world > img")?.complete, null, { timeout: 60000 });
        await new Promise((resolve) => setTimeout(resolve, 1200));
      });
      const size = await page.$eval(".world .map-picture, .world > img", (element) => (element.dataset.width ? `${element.dataset.width}x${element.dataset.height}, ${element.dataset.tiles} tiles in view` : `${element.naturalWidth}x${element.naturalHeight}`));
      assert(/tiles in view/.test(size), `the map is drawn as tiles: ${size}`);
      if (round > 0) assert(switched.longest <= 100, `switching to ${id} stood the window still ${switched.longest} ms`);
      gapsSeen.push(switched.longest);
    }
  {
    const zoom = await frames(async () => {
      const box = await page.locator(".viewport").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let step = 0; step < 20; step++) {
        await page.mouse.wheel(0, step < 10 ? -240 : 240);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    });
    {
      const box = await page.locator(".viewport").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let step = 0; step < 9; step++) await page.mouse.wheel(0, -240), await new Promise((resolve) => setTimeout(resolve, 80));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const tiles = await page.$eval(".world .map-picture", (element) => element.dataset.tiles);
      const finest = await page.$$eval(".world .map-picture img:not(.map-tile-under)", (list) => list.length);
      assert(finest > 0, "zoomed in, the full-detail tiles are drawn");
      await page.screenshot({ path: path.join(tmpdir(), "kraken-map-tiles.png") });
    }
    assert(zoom.longest <= 100, `zooming stood the window still ${zoom.longest} ms`);
    console.log(`ok map tiles ui: B1's levels as tiles; switching between them, the longest frame gap ${Math.max(...gapsSeen.slice(2))} ms; zoomed in, the full-detail tiles; zooming in and out, the longest gap ${zoom.longest} ms. ${path.join(tmpdir(), "kraken-map-tiles.png")}`);
  }
} finally {
  child.kill();
  await app.close();
}
