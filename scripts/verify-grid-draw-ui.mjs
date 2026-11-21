// The map editor's Grid tab in the real app: the GM opens a picture whose
// squares are printed in it (66 px, starting 23 px across and 17 down), unlocks
// the map, picks the Grid tab's draw tool and drags from one corner of a printed
// square to the opposite corner. The grid takes the square's size and lines up
// with the picture's lines. Then the tint's alpha goes to 0 and the eye hides the
// grid: its lines are gone, and it still measures. The agent's
// kraken_scene_settings grid.square does the same from a box.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const SQUARE = 66;
const OX = 23;
const OY = 17;
const W = 1320;
const H = 990;

// A white picture with black grid lines every 66 px from (23, 17): a PNG written by hand.
function gridPicture(file) {
  const raw = Buffer.alloc((W * 3 + 1) * H, 255);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    raw[row] = 0;
    const onRow = (y - OY) % SQUARE === 0 || (y - OY) % SQUARE === 1;
    for (let x = 0; x < W; x++) {
      const onCol = (x - OX) % SQUARE === 0 || (x - OX) % SQUARE === 1;
      if (onRow || onCol) raw.fill(0, row + 1 + x * 3, row + 4 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-grid-draw-ui-"));
const picture = path.join(profile, "Printed Grid.png");
gridPicture(picture);
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
    answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content?.[0]?.text ?? "null");
};
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const screenOf = (x, y) =>
  page.evaluate(
    ([wx, wy]) => {
      const world = document.querySelector(".world");
      const view = document.querySelector(".viewport").getBoundingClientRect();
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.e]+)\)/.exec(world.style.transform);
      const [tx, ty, scale] = match.slice(1).map(Number);
      return { x: view.left + tx + wx * scale, y: view.top + ty + wy * scale };
    },
    [x, y],
  );
const report = [];
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-grid-draw", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Grid draw", ruleset: "D&D 5E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47514, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector(".map-toolbar");
  await page.click('[aria-label="Fit"]');
  await settle(600);
  const pad = await page.evaluate(() => {
    const svg = document.querySelector("svg.grid");
    return svg ? { x: parseFloat(svg.style.left) || 0, y: parseFloat(svg.style.top) || 0 } : { x: 0, y: 0 };
  });

  // Unlock, Grid tab, the draw tool, a drag over the printed square at column 4, row 3.
  await page.click('[data-action="map-editor"]');
  await page.waitForSelector(".map-editor");
  await page.click('[data-edit-tab="grid"]');
  await page.click('[data-edit-tool="grid"]');
  const from = await screenOf(pad.x + OX + SQUARE * 4, pad.y + OY + SQUARE * 3);
  const to = await screenOf(pad.x + OX + SQUARE * 5, pad.y + OY + SQUARE * 4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.waitForSelector("[data-grid-draw]");
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await settle(800);
  let grid = (await tool("kraken_scene_settings")).grid;
  // A drag on screen is as exact as a screen pixel at this zoom.
  const scale = await page.evaluate(() => Number(/scale\(([-\d.e]+)\)/.exec(document.querySelector(".world").style.transform)[1]));
  const slack = 1.5 / scale;
  assert(Math.abs(grid.size - SQUARE) <= slack && Math.abs(grid.offsetX - OX) <= slack && Math.abs(grid.offsetY - OY) <= slack, `the grid follows the printed square (66 from 23, 17, within ${slack.toFixed(1)}): ${JSON.stringify(grid)}`);
  report.push(`a drag over one printed square sets the grid: ${grid.size} px from ${grid.offsetX}, ${grid.offsetY} (printed 66 from 23, 17)`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-grid-draw.png") });

  // Alpha to 0: no lines to see; the eye: hidden. It still measures 5 ft a square.
  await page.fill("[data-grid-alpha]", "0");
  await settle(400);
  grid = (await tool("kraken_scene_settings")).grid;
  assert(grid.alpha === 0, `alpha 0 kept: ${grid.alpha}`);
  await page.click("[data-grid-show]");
  await settle(400);
  grid = (await tool("kraken_scene_settings")).grid;
  assert(grid.show === false && (await page.$("svg.grid line")) === null, "the eye hides the grid's lines");
  const measured = await tool("kraken_ruler", { squares: [{ col: 2, row: 2 }, { col: 6, row: 2 }] });
  assert(JSON.stringify(measured).includes("20"), `four squares still measure 20 ft with the grid hidden: ${JSON.stringify(measured).slice(0, 200)}`);
  report.push("alpha 0 and the eye hide the lines; four squares still measure 20 ft");
  await page.selectOption("[data-grid-diagonal]", "raw");
  await settle(300);
  assert((await tool("kraken_scene_settings")).diagonal === "raw", "the Grid tab's Diagonals: straight line");
  report.push("the Grid tab's Diagonals sets this map's rule (straight line, the raw distance)");

  // The agent: grid.square, a box over one square in the picture's pixels.
  await tool("kraken_scene_settings", { grid: { square: { x1: 50, y1: 40, x2: 100, y2: 90 } } });
  grid = (await tool("kraken_scene_settings")).grid;
  assert(grid.size === 50 && grid.offsetX === 0 && grid.offsetY === 40, `the agent's square: ${JSON.stringify(grid)}`);
  report.push("kraken_scene_settings grid.square sets 50 px from 0, 40");
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok grid draw ui:\n  ${report.join("\n  ")}\n  ${path.join(tmpdir(), "kraken-grid-draw.png")}`);
} finally {
  child.kill();
  await app.close().catch(() => undefined);
}
