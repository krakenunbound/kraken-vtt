// How long the GM's window stands still when a big map opens: B1's maps put
// on the table from the Library, then the scene switched between its two
// levels a few times; the frames are counted and the longest gap between two
// is the hitch. ZOOM=1 also zooms in and out (the map drawn at every size).
// (A probe, not a check.)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

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
  console.log(`B1's maps opened: ${opened.took} ms; longest frame gap ${opened.longest} ms, ${opened.over50} gaps over 50 ms`);
  await page.click('.sidebar [data-launch="library"]');
  const scenes = await page.$$eval('select[aria-label="Scene"] option', (list) => list.map((option) => option.value));
  for (let round = 0; round < 3; round++)
    for (const id of scenes.slice(0, 2)) {
      const switched = await frames(async () => {
        await page.selectOption('select[aria-label="Scene"]', id);
        await page.waitForFunction(() => document.querySelector('.world .map-picture[data-ready="true"]') || document.querySelector(".world > img")?.complete, null, { timeout: 60000 });
        await new Promise((resolve) => setTimeout(resolve, 1200));
      });
      const size = await page.$eval(".world .map-picture, .world > img", (element) => (element.dataset.width ? `${element.dataset.width}x${element.dataset.height}, ${element.dataset.tiles} tiles in view` : `${element.naturalWidth}x${element.naturalHeight}`));
      console.log(`  scene ${id.slice(0, 40)} (${size}): longest frame gap ${switched.longest} ms, ${switched.over50} over 50 ms`);
    }
  if (process.env.ZOOM) {
    const zoom = await frames(async () => {
      const box = await page.locator(".viewport").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let step = 0; step < 20; step++) {
        await page.mouse.wheel(0, step < 10 ? -240 : 240);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    });
    if (process.env.SHOT) {
      const box = await page.locator(".viewport").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let step = 0; step < 9; step++) await page.mouse.wheel(0, -240), await new Promise((resolve) => setTimeout(resolve, 80));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const tiles = await page.$eval(".world .map-picture", (element) => element.dataset.tiles);
      await page.screenshot({ path: process.env.SHOT });
      console.log(`zoomed in: ${tiles} tiles in view, ${await page.$eval(".world", (element) => element.dataset.scale)} scale; ${process.env.SHOT}`);
    }
    console.log(`zooming in and out: longest frame gap ${zoom.longest} ms, ${zoom.over50} over 50 ms, ${zoom.frames} frames in ${zoom.took} ms`);
  }
} finally {
  child.kill();
  await app.close();
}
