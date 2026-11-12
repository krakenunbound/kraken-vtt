// (setup shared with verify-mapedit-ui)
// The GM's map editor in the real app (FG's image layer panel): the GM opens
// Edit map, draws a chain of walls with the line tool, selects one and makes
// it a door, deletes and undoes, sets the grid to hex rows; a test player in
// Chrome sees the hex grid and the new door's handle, and is never sent the
// walls. Needs a prepared map bundle: KRAKEN_BUNDLE, or the GM's Keep on the
// Borderlands; skipped without one.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-mapedit-ui-"));
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
// Screen point of a world point, from the map's own transform.
const screenOf = (target, x, y) =>
  target.evaluate(
    ([wx, wy]) => {
      const world = document.querySelector(".world");
      const view = document.querySelector(".viewport").getBoundingClientRect();
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.e]+)\)/.exec(world.style.transform);
      const [tx, ty, scale] = match.slice(1).map(Number);
      return { x: view.left + tx + wx * scale, y: view.top + ty + wy * scale };
    },
    [x, y],
  );
// FG's Library in the real app (the GM's sidebar): B2's maps onto the table
// (playable maps only), an encounter onto the tracker, a table rolled; a map
// pin opens its story entry in the book. Skipped without B2.
const B2 = "B2 The Keep on the Borderlands (C&C)";
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const modules = await tool("kraken_fg_modules", { filter: "B2 The Keep" });
  if (!modules.includes(B2)) {
    console.log("skip library ui: no", B2);
    process.exit(0);
  }
  const campaign = await tool("kraken_campaign_create", { name: "Library UI", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47411, password: "" });
  await page.waitForSelector("text=Hosting");
  await page.click('.sidebar [data-launch="library"]');
  await page.waitForSelector(".library-window");
  await page.selectOption('[aria-label="Library module"]', B2);
  // The Maps tab: each map a picture, clicked to see it large (only the GM), then one put on the table.
  await page.waitForSelector('[data-action="library-map"][data-library-item="The Caves of Chaos"]', { timeout: 60000 });
  assert((await page.$$('[data-action="library-map"][data-library-item^="Handout"]')).length === 0, "the Maps tab lists maps, not handouts");
  await page.click('[data-action="library-map"][data-library-item="The Caves of Chaos"]');
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-library-preview="The Caves of Chaos"] img');
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 30000 });
  await page.click('[data-action="library-map-open"]');
  await page.waitForSelector("text=The Caves of Chaos is on the table", { timeout: 60000 });
  const one = (await tool("kraken_scenes", {})).scenes.map((scene) => scene.name);
  assert(one.length === 1 && one[0] === "The Caves of Chaos", `one map on the table: ${one.join(", ")}`);
  // All: every adventure's lists together.
  assert(await page.$('[aria-label="Library module"] option[value="*"]'), "an All choice");
  await page.click('[data-action="library-maps"]');
  await page.waitForSelector("text=The maps are on the table", { timeout: 60000 });
  const scenes = JSON.stringify(await tool("kraken_scenes", {}));
  assert(scenes.includes("The Caves of Chaos") && !scenes.includes("Handout - The Caves of Chaos"), "playable maps only, no handouts");
  await tool("kraken_scenes", { scene: "The Caves of Chaos" });
  await settle(1500);
  // An encounter onto the tracker (the Encounters tab).
  await page.click('[data-library-tab="battle"]');
  await page.fill('[aria-label="Library search"]', "Kobold ambush");
  await page.waitForSelector('[data-library-item*="Kobold ambush"]');
  await page.click('[data-library-item*="Kobold ambush"] [data-action="library-battle"]');
  await settle(1200);
  const combat = await tool("kraken_combat", { action: "view" });
  assert(combat.entries.filter((entry) => entry.name.startsWith("Kobold")).length >= 4, `kobolds on the tracker: ${combat.entries.map((entry) => entry.name).join(", ")}`);
  // A table rolled.
  await page.click('[data-library-tab="table"]');
  await page.fill('[aria-label="Library search"]', "Rumor");
  await page.waitForSelector('[data-library-item="Rumor Table"]');
  await page.click('[data-library-item="Rumor Table"] [data-action="library-table"]');
  await settle(800);
  const chat = await tool("kraken_chat_log", { count: 10 });
  assert(chat.some((line) => (line.roll?.label ?? "").startsWith("[TABLE] Rumor Table")), "the rumor table rolled in chat");
  // A pin opens its story entry.
  await page.evaluate(() => [...document.querySelectorAll("[data-label-text]")].find((node) => node.getAttribute("data-label-text") === "A. Kobold Lair")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForSelector('[data-window="book"]', { timeout: 15000 });
  // The adventure and its windows go by the book's name, never its file on disk.
  assert(!/\.kpack|\.mod\b|[A-Z]:\\/.test(await page.evaluate(() => [...document.querySelectorAll(".window-title, [data-window] header, .viewport-title")].map((node) => node.textContent).join(" | "))), "no file paths in window titles");
  await page.screenshot({ path: path.join(tmpdir(), "kraken-library-ui.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok library ui: B2's playable maps on the table, the kobold ambush on the tracker, the rumor table rolled, a pin opens its story entry. ${path.join(tmpdir(), "kraken-library-ui.png")}`);
} finally {
  child.kill();
  await app.close();
}
