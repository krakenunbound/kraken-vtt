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
// Looks at an FG module's maps opened in Kraken (screenshots, not a test):
// node scripts/shot-fgmap.mjs ["B2 The Keep on the Borderlands (C&C)"] ["Caves"]
const moduleName = process.argv[2] ?? "B2 The Keep on the Borderlands (C&C)";
const only = process.argv[3] ? [process.argv[3]] : ["Caves of Chaos"];
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "FG map shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47407, password: "" });
  await page.waitForSelector("text=Hosting");
  const opened = await tool("kraken_open_fg_module", { module: moduleName, maps: only });
  console.log(JSON.stringify(opened.scenes));
  await settle(4000);
  await page.click('[aria-label="Fit"]').catch(() => undefined);
  await settle(1500);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-fgmap.png") });
  console.log("labels", JSON.stringify((await tool("kraken_label", { action: "list" })).labels.length), "fx", (await tool("kraken_fx", { action: "list" })).length);
  console.log("saved", path.join(tmpdir(), "kraken-fgmap.png"), failures.join(" | "));
} finally {
  child.kill();
  await app.close();
}
