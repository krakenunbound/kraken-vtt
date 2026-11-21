// Map Studio's Grid & map size as the GM uses it, on a scanned floor plan whose
// squares are printed in it (70 px): open the picture in Map Studio, open Grid &
// map size, press Draw the grid (as anyone would first), zoom in and drag over one
// printed square. The grid takes that square's size and lines up with the printed
// lines, and it is drawn on the map: tinted red at full alpha it shows red on the
// lines, at alpha 0 it is gone. Width and height unlinked, a 70 x 50 box gives
// 70 x 50 cells. Saved, the table's map has the same grid (size, height, offset,
// tint, alpha); changed at the table and opened in Map Studio again, Map Studio
// shows the table's grid. GRID_PICTURE: a scanned floor plan to use instead of the
// test's own (GRID_X1, GRID_Y1, GRID_SIZE: one printed square in it).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Where one printed square sits (its top-left corner), and its size.
const SQUARE = { x1: Number(process.env.GRID_X1 ?? 440), y1: Number(process.env.GRID_Y1 ?? 2449), size: Number(process.env.GRID_SIZE ?? 70) };

const profile = mkdtempSync(path.join(tmpdir(), "kraken-studio-grid-ui-"));
const picture = path.join(profile, "Guild House.png");
const source = process.env.GRID_PICTURE;
if (source && existsSync(source)) copyFileSync(source, picture);
else {
  // No scan given: a floor plan of our own, 2480 x 3207, its squares printed 70 px apart from (20, 69).
  const lines = [];
  for (let x = SQUARE.x1 % SQUARE.size; x < 2480; x += SQUARE.size) lines.push(`<rect x="${x}" y="0" width="2" height="3207"/>`);
  for (let y = SQUARE.y1 % SQUARE.size; y < 3207; y += SQUARE.size) lines.push(`<rect x="0" y="${y}" width="2480" height="2"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2480" height="3207"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${lines.join("")}</g></svg>`;
  await (await import("sharp")).default(Buffer.from(svg)).png().toFile(picture);
}
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
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
const seen = new Set();
async function studioFrame(query = "") {
  for (let wait = 0; wait < 100; wait++) {
    const frame = page.frames().find((item) => /^http:\/\/127\.0\.0\.1:\d+\//.test(item.url()) && item.url().includes(query) && !(query && seen.has(item.url())));
    if (frame && (await frame.evaluate(() => Boolean(window.KrakenStudio)).catch(() => false))) {
      if (query) seen.add(frame.url());
      return frame;
    }
    await settle(200);
  }
  throw new Error("Map Studio's page did not load");
}
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-studio-grid", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Studio grid", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47515, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // Map Studio, then Open a picture: the floor plan.
  await page.click('.sidebar [data-launch="studio"]');
  const plain = await studioFrame();
  await plain.waitForSelector("#mapCanvas");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, picture);
  await plain.click('[data-start="picture"]');
  const studio = await studioFrame("kraken=");
  await studio.waitForFunction(() => window.KrakenStudio?.project?.width > 1000, null, { timeout: 30000 });
  await settle(1500);
  const size = await studio.evaluate(() => ({ w: window.KrakenStudio.project.width, h: window.KrakenStudio.project.height }));

  // Grid & map size, then Draw the grid pressed first: drawing is on, not off.
  await studio.click('[data-mode="grid"]');
  await studio.waitForSelector(".grid-set.on");
  await studio.click(".grid-set");
  assert(await studio.$(".grid-set.on"), "pressing Draw the grid leaves drawing on");
  for (const control of ["#gridSize", "#gridSizeY", ".grid-link", "#gridColor", "#gridAlpha", "#gridStyle", "#gridDistance", "#gridUnits", ".grid-eye", ".grid-cross"]) assert(await studio.$(control), `Grid & map size has ${control}`);
  report.push("Grid & map size has Draw the grid (pressing it keeps drawing on), the eye, Width, link and Height, Tint, Alpha, Line, Distance a square, Suffix and the nudge cross");

  // Zoomed in on the printed square, a drag from one corner to the other.
  const screenOf = async (mx, my) => {
    const box = await studio.locator("#mapCanvas").boundingBox();
    const frameBox = await page.locator("iframe").last().boundingBox().catch(() => null);
    return { x: (frameBox?.x ?? 0) * 0 + box.x + (mx * box.width) / size.w, y: box.y + (my * box.height) / size.h };
  };
  const zoomAt = await screenOf(SQUARE.x1 + SQUARE.size / 2, SQUARE.y1 + SQUARE.size / 2);
  await page.mouse.move(zoomAt.x, zoomAt.y);
  for (let notch = 0; notch < 8; notch++) {
    await page.mouse.wheel(0, -120);
    await settle(60);
  }
  await settle(400);
  const drag = async (x1, y1, x2, y2) => {
    const a = await screenOf(x1, y1);
    const b = await screenOf(x2, y2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await settle(800);
  };
  await drag(SQUARE.x1, SQUARE.y1, SQUARE.x1 + SQUARE.size, SQUARE.y1 + SQUARE.size);
  let grid = await studio.evaluate(() => { const p = window.KrakenStudio.project; return { grid: p.grid, gridY: p.gridY ?? null, offset: p.gridOffset }; });
  const near = (value, target, slack) => Math.abs(value - target) <= slack;
  const wantX = SQUARE.x1 % SQUARE.size;
  const wantY = SQUARE.y1 % SQUARE.size;
  const ringDistance = (value, target, cell) => Math.min(Math.abs(value - target), cell - Math.abs(value - target));
  assert(near(grid.grid, SQUARE.size, 1.5) && grid.gridY === null && ringDistance(grid.offset.x, wantX, grid.grid) <= 3 && ringDistance(grid.offset.y, wantY, grid.grid) <= 3, `the grid follows the printed square (${SQUARE.size} px from ${wantX}, ${wantY}): ${JSON.stringify(grid)}`);
  report.push(`a drag over one printed square sets the grid: ${grid.grid} px from ${grid.offset.x}, ${grid.offset.y} (printed ${SQUARE.size} from ${wantX}, ${wantY})`);

  // It is drawn: red at full alpha shows red on a grid line; at alpha 0 nothing red.
  const lineRed = () =>
    studio.evaluate(() => {
      const p = window.KrakenStudio.project, canvas = document.querySelector("#mapCanvas"), ctx = canvas.getContext("2d");
      let red = 0, checked = 0;
      for (let k = 3; k < 12; k++) {
        const x = Math.round(p.gridOffset.x + k * p.grid), y = Math.round(p.gridOffset.y + (k + 0.5) * (p.gridY || p.grid));
        if (x >= p.width || y >= p.height) continue;
        for (const dx of [-1, 0, 1]) {
          const [r, g, b] = ctx.getImageData(x + dx, y, 1, 1).data;
          checked++;
          if (r > 180 && g < 90 && b < 90) red++;
        }
      }
      return { red, checked };
    });
  await studio.fill("#gridColor", "#ff0000");
  await studio.$eval("#gridColor", (input) => input.dispatchEvent(new Event("input", { bubbles: true })));
  await studio.fill("#gridAlpha", "255");
  await studio.$eval("#gridAlpha", (input) => input.dispatchEvent(new Event("change", { bubbles: true })));
  await settle(400);
  let lines = await lineRed();
  assert(lines.red >= 5, `the grid is drawn on the map, red on its lines: ${JSON.stringify(lines)}`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-studio-grid.png") });
  await studio.fill("#gridAlpha", "0");
  await studio.$eval("#gridAlpha", (input) => input.dispatchEvent(new Event("change", { bubbles: true })));
  await settle(400);
  lines = await lineRed();
  assert(lines.red === 0, `at alpha 0 the lines are gone: ${JSON.stringify(lines)}`);
  report.push("the grid is drawn on the map in its tint (red on the lines at alpha 255) and gone at alpha 0");
  await studio.fill("#gridAlpha", "160");
  await studio.$eval("#gridAlpha", (input) => input.dispatchEvent(new Event("change", { bubbles: true })));

  // Unlinked: a 70 x 50 box is the cell.
  await studio.click(".grid-link");
  await studio.waitForSelector('.grid-link[aria-pressed="false"]');
  await drag(SQUARE.x1, SQUARE.y1, SQUARE.x1 + SQUARE.size, SQUARE.y1 + 50);
  grid = await studio.evaluate(() => { const p = window.KrakenStudio.project; return { grid: p.grid, gridY: p.gridY ?? null, offset: p.gridOffset }; });
  assert(near(grid.grid, SQUARE.size, 1.5) && near(grid.gridY, 50, 1.5), `unlinked, the box is the cell: ${JSON.stringify(grid)}`);
  assert(near(await studio.$eval("#gridSizeY", (input) => Number(input.value)), grid.gridY, 0.01), "the Height field shows it");
  report.push(`width and height unlinked, a box gives ${grid.grid} x ${grid.gridY} cells`);

  // Saved into the campaign's map (by itself): the table's map has that grid.
  await studio.waitForFunction(() => Number(document.querySelector("#saveKrakenBtn")?.dataset.saved ?? 0) > 0, null, { timeout: 20000 });
  await settle(1500);
  await studio.evaluate(() => window.KrakenStudio.save());
  await settle(2500);
  const record = (await tool("kraken_records_list", { type: "image" })).records.find((item) => item.name === "Guild House");
  assert(record, "the picture is one of the campaign's maps");
  await page.click('.sidebar [data-launch="imagelist"]');
  await page.click(`[data-image-record="${record.id}"]`);
  await page.waitForSelector('[data-action="image-studio"]', { timeout: 20000 });
  await settle(1500);
  const table = (await tool("kraken_scene_settings")).grid;
  assert(near(table.size, grid.grid, 0.05) && near(table.sizeY, grid.gridY, 0.05) && near(table.offsetX, grid.offset.x, 0.15) && near(table.offsetY, grid.offset.y, 0.15) && table.color === "#ff0000" && near(table.alpha, 160 / 255, 0.01), `the table's map has Map Studio's grid: ${JSON.stringify(table)}`);
  report.push(`the table's map has the same grid: ${table.size} x ${table.sizeY} from ${table.offsetX}, ${table.offsetY}, ${table.color} at alpha ${Math.round(table.alpha * 255)}`);

  // Changed at the table, then Map Studio again from the image window: it opens with the table's grid.
  await tool("kraken_scene_settings", { grid: { color: "#00ff00", alpha: 0.25, sizeY: null } });
  await page.$eval('[data-action="image-studio"]', (button) => button.click());
  const again = await studioFrame("kraken=");
  await again.waitForFunction(() => window.KrakenStudio?.project?.width > 1000, null, { timeout: 30000 });
  const reopened = await again.evaluate(() => { const p = window.KrakenStudio.project; return { grid: p.grid, gridY: p.gridY ?? null, color: p.gridColor, alpha: p.gridAlpha }; });
  assert(reopened.color === "#00ff00" && near(reopened.alpha, 0.25, 0.001) && reopened.gridY === null && near(reopened.grid, grid.grid, 0.05), `Map Studio opens with the table's grid: ${JSON.stringify(reopened)}`);
  report.push("changed at the table (green, alpha 64, square), Map Studio opens with it");
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok studio grid ui:\n  ${report.join("\n  ")}\n  ${path.join(tmpdir(), "kraken-studio-grid.png")}`);
} finally {
  child.kill();
  await app.close().catch(() => undefined);
}
