// A Universal VTT map (.dd2vtt, as Dungeondraft exports; docs/feature-parity.md
// M13) opened as a scene: its picture, its grid, its walls, a door (a portal)
// and a light, all from the file. Made here from Maelstrom's own great hall
// picture: a room walled in grid squares with a closed door in its west wall
// and a torch inside. The agent opens it; the walls, door, light and grid are
// there; a test player's token is stopped by the closed door and walks in when
// it opens. A file that is not JSON is refused with a clear message.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-uvtt-map-"));
const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Universal VTT", ruleset: "Castles & Crusades" });
  const port = 47413;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // The file: the great hall (1792 x 1024) at 128 px a square, 14 x 8 squares. A room from (3,1) to (10,7), its west
  // wall open from y 3 to 4 where the door (a closed portal) is; a torch at (6.5, 4) reaching 4 squares.
  const P = (x, y) => ({ x, y });
  const uvtt = {
    format: 0.3,
    resolution: { map_origin: P(0, 0), map_size: P(14, 8), pixels_per_grid: 128 },
    line_of_sight: [[P(3, 3), P(3, 1), P(10, 1), P(10, 7), P(3, 7), P(3, 4)]],
    objects_line_of_sight: [],
    portals: [{ position: P(3, 3.5), bounds: [P(3, 4), P(3, 3)], rotation: 1.5708, closed: true, freestanding: false }],
    lights: [{ position: P(6.5, 4), range: 4, intensity: 1, color: "ffeccd8b", shadows: true }],
    environment: { baked_lighting: true, ambient_light: "ffffffff" },
    image: readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")).toString("base64"),
  };
  const file = path.join(profile, "Great_Hall.dd2vtt");
  writeFileSync(file, JSON.stringify(uvtt));
  const opened = await tool("kraken_open_adventure", { path: file });
  assert(/Great Hall/.test(opened.opened ?? ""), `the Universal VTT map opened: ${JSON.stringify(opened)}`);
  await page.waitForSelector(".map-toolbar");
  await settle(1200);

  // What the file holds, on the scene: 5 wall stretches and the door, the torch, the grid.
  const walls = await tool("kraken_wall", { action: "list" });
  const doors = await tool("kraken_wall", { action: "list", kind: "door" });
  assert(walls.total === 6 && doors.walls.length === 1, `5 walls and a door from the file: ${walls.total} walls, ${doors.walls.length} doors`);
  const door = doors.walls[0];
  assert(door.x1 === 384 && door.y1 === 512 && door.x2 === 384 && door.y2 === 384, `the door in the west wall, in pixels: ${JSON.stringify(door)}`);
  const lights = await tool("kraken_light", { action: "list" });
  const torch = (lights.lights ?? lights)[0];
  assert(torch && Math.round(torch.x) === 832 && Math.round(torch.y) === 512 && torch.dim === 20, `the torch at (6.5, 4) reaching 20 ft: ${JSON.stringify(lights).slice(0, 300)}`);
  const scene = (await tool("kraken_map", {})).scene;
  assert(scene?.grid?.size === 128 && scene.cols === 14 && scene.rows === 8, `the file's grid, 128 px, 14 x 8 squares: ${JSON.stringify(scene)}`);

  // Played: a test player's token west of the door is stopped by it closed and walks in when it opens.
  await tool("kraken_line_of_sight", { on: true });
  const hero = await tool("kraken_record_create", { type: "character", name: "Aldric", owner: "A test player", visibility: "owner", data: {} });
  const token = await tool("kraken_token_place", { recordId: hero.id, col: 1, row: 3 });
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector('.token[data-name="Aldric"]', { timeout: 15000 });
  const stopped = await tool("kraken_token_move", { id: token.id, col: 6, row: 3, asPlayer: true });
  assert(stopped.blocked && stopped.col < 3, `the closed door stops him: ${JSON.stringify(stopped)}`);
  await tool("kraken_door", { id: door.id, state: "open" });
  const through = await tool("kraken_token_move", { id: token.id, col: 6, row: 3, asPlayer: true });
  assert(!through.blocked, `the open door lets him in: ${JSON.stringify(through)}`);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-uvtt-map-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-uvtt-map-gm.png") });

  // A file that is not a Universal VTT map: refused, saying so.
  const broken = path.join(profile, "Broken.dd2vtt");
  writeFileSync(broken, "not json");
  const refused = await tool("kraken_open_adventure", { path: broken }).then(() => "", (error) => error.message);
  assert(/not a Universal VTT map/.test(refused), `a broken file refused clearly: ${refused}`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok uvtt map: a .dd2vtt opened as a scene with its picture, 128 px grid, 5 walls, a closed door and a 20 ft torch from the file; a test player is stopped by the door and walks in when it opens; a broken file is refused clearly. ${path.join(tmpdir(), "kraken-uvtt-map-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
