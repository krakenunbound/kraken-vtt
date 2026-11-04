// FG's doors in the real app: B1's maps put on the table from the Library.
// The GM is in play mode (FG's): no wall lines; each door is one shape,
// invisible until hovered, then lit translucent blue with its door icon;
// one click opens all of it. The map editor (FG's Line of Sight) shows the
// lines and the hover shapes give way. Skipped without B1.
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

const profile = mkdtempSync(path.join(tmpdir(), "kraken-doors-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
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

const B1 = "B1 In Search of the Unknown (C&C)";
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const modules = await tool("kraken_fg_modules", { filter: "B1 In Search" });
  if (!modules.includes(B1)) {
    console.log("skip doors ui: no", B1);
    process.exit(0);
  }
  const campaign = await tool("kraken_campaign_create", { name: "Doors UI", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47417, password: "" });
  await page.waitForSelector("text=Hosting");
  await page.click('.sidebar [data-launch="library"]');
  await page.waitForSelector(".library-window");
  await page.selectOption('[aria-label="Library module"]', B1);
  await page.click('[data-action="library-maps"]');
  await page.waitForSelector("text=The maps are on the table", { timeout: 90000 });
  await page.click('.sidebar [data-launch="library"]');
  await settle(1500);

  // Play mode: no wall lines; one hover shape per door.
  const lines = await page.$$eval(".overlay line", (list) => list.length);
  const shapes = await page.$$eval(".overlay.doors .player-door", (list) => list.map((item) => item.getAttribute("data-door-group")));
  const map = await tool("kraken_map", {});
  const doorLines = map.doors ?? [];
  const groups = new Set(doorLines.map((door) => door.group ?? door.id));
  assert(lines === 0, `play mode: no wall lines (${lines})`);
  assert(shapes.length === groups.size && shapes.length > 0 && shapes.length < doorLines.length, `one shape per door: ${shapes.length} shapes, ${groups.size} doors, ${doorLines.length} door lines`);

  // A door of four sides: hover lights it, a click opens all of it.
  const four = [...groups].find((group) => doorLines.filter((door) => (door.group ?? door.id) === group).length >= 4);
  const target = `.overlay.doors .player-door[data-door-group="${four}"]`;
  const before = await page.$eval(`${target} .door-shape`, (shape) => getComputedStyle(shape).fill);
  await page.hover(`${target} .door-shape`, { force: true });
  await settle(300);
  const lit = await page.$eval(`${target} .door-shape`, (shape) => getComputedStyle(shape).fill);
  const iconShown = await page.$eval(`${target} .door-icon`, (icon) => getComputedStyle(icon).opacity);
  assert(/rgba\(0, 0, 0, 0\)|transparent/.test(before) && /rgba\(70, 90, 255/.test(lit) && iconShown === "1", `hovered, the door lights and shows its icon: ${before} -> ${lit}, icon ${iconShown}`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-doors-hover.png") });
  await page.click(`${target} .door-shape`, { force: true });
  await settle(600);
  const sides = ((await tool("kraken_map", {})).doors ?? []).filter((door) => (door.group ?? door.id) === four);
  assert(sides.length >= 4 && sides.every((door) => door.state === 1), `one click opened every side: ${JSON.stringify(sides.map((door) => door.state))}`);

  // Line of Sight (the editor's walls tab): the lines show, the hover shapes give way.
  await page.click('[data-action="map-editor"]');
  await settle(800);
  const editing = await page.$$eval(".overlay line", (list) => list.length);
  const shapesEditing = await page.$$eval(".overlay.doors .player-door", (list) => list.length);
  assert(editing > 0 && shapesEditing === 0, `editing walls shows the lines (${editing}) and not the shapes (${shapesEditing})`);
  await page.click('[data-action="map-editor"]');
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok doors ui: B1 in play mode shows no lines and ${shapes.length} door shapes (for ${doorLines.length} door lines); hovered, a door lights translucent blue with its icon; one click opened all ${sides.length} of its sides; the walls tab shows the ${editing} lines and hides the shapes. ${path.join(tmpdir(), "kraken-doors-hover.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
