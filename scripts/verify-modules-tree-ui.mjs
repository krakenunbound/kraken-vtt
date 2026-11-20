// Modules filed as a tree, and the GM's Folders window, in the real app (KRAKEN_TEST_PACKS: a packs folder to
// read, the GM's by default, never written). Modules shows the seven kinds with their icons, groups inside them,
// a book's parts under it, and an icon for every pack with a picture; Folders lists Maelstrom's folders with what
// they hold, and Refresh reads them again with the table still running (the seat stays connected).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-modules-tree-"));
const packs = process.env.KRAKEN_TEST_PACKS || path.join(homedir(), "Documents", "Kraken VTT", "Packs");
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_PACKS: packs, KRAKEN_HOME: path.join(profile, "home") };
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
function rpc(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
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
const shots = [path.join(tmpdir(), "kraken-modules-tree.png"), path.join(tmpdir(), "kraken-folders.png")];
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Modules tree", ruleset: "AD&D 2E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47418, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await page.click('.sidebar [data-launch="books:activation"]');
  // As FG's library: the kinds as tiles; one opened shows its books as covers by series; Back to the tiles.
  await page.waitForSelector(".books-kind-tile", { timeout: 60000 });
  const kinds = await page.$$eval(".books-kind-tile b", (nodes) => nodes.map((node) => node.textContent));
  assert(kinds.length >= 2 && kinds.every((kind) => ["Rules", "Adventures", "Settings", "Maps & Tiles", "Tokens & Art", "Tables & Tools", "Other"].includes(kind)), `the kinds: ${kinds}`);
  await page.screenshot({ path: shots[0].replace(".png", "-kinds.png") });
  await page.click('.books-kind-tile[data-kind="adventure"]');
  await page.waitForSelector(".books-grid .books-tile");
  const groups = await page.$$eval(".books-series h4", (nodes) => nodes.map((node) => node.textContent));
  const rows = await page.$$eval(".books-tile", (nodes) => nodes.length);
  const icons = await page.$$eval(".books-tile img", (nodes) => nodes.length);
  assert(rows > 0 && groups.length > 0, `adventures as covers by series: ${rows} in ${groups}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shots[0] });
  await page.click('[data-action="books-back"]');
  await page.waitForSelector(".books-kind-tile");
  // A search finds a book whatever its kind.
  await page.fill(".books-search", "Monstrous");
  await page.waitForSelector(".books-tile");
  await page.fill(".books-search", "");
  // The GM's Folders window: its folders, then Refresh with the table running.
  await page.click('.sidebar [data-launch="folders"]');
  await page.waitForSelector('[data-folder="packs"]');
  const folders = await page.$$eval("[data-folder]", (nodes) => nodes.map((node) => node.getAttribute("data-folder")));
  assert(folders.includes("packs") && folders.includes("sounds") && folders.includes("maps"), `the folders: ${folders}`);
  await page.click('[data-action="folders-refresh"]');
  await page.waitForSelector(".folders-note", { timeout: 30000 });
  const note = await page.textContent(".folders-note");
  assert(/Read again/.test(note ?? ""), `refreshed: ${note}`);
  assert(await page.isVisible("text=Hosting"), "the table is still hosted");
  await page.screenshot({ path: shots[1] });
  console.log(`ok modules tree: kinds ${kinds.join(", ")}; adventures in ${groups.length} series (${groups.join(", ")}), ${rows} covers, ${icons} with a picture; Folders lists ${folders.join(", ")} and refreshes with the table up. ${shots.join(" ")}`);
} finally {
  child.kill();
  await app.close();
}
