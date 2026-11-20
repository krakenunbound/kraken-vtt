// Lists by type in the real app, with the GM's own packs (KRAKEN_TEST_PACKS, the GM's by default, never written):
// an AD&D 2E campaign with the Dungeon Master Guide and Monstrous Manual active; Items grouped by type (Weapons,
// Armor & Shields, Magic Items...) with a Type filter; NPCs by creature type; Images by kind, filtered to Portraits.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-categories-"));
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
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
const shot = (name) => path.join(tmpdir(), `kraken-categories-${name}.png`);
const report = [];
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Categories", ruleset: "AD&D 2E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47419, password: "pw" });
  await page.waitForSelector("text=Hosting");
  for (const book of ["AD&D 2E Dungeon Master Guide", "AD&D 2E Monstrous Manual"]) await tool("kraken_books", { action: "activate", book });

  // Items: grouped by type, a Type filter with counts.
  await page.click('.sidebar [data-launch="records:item"]');
  await page.waitForSelector('[data-window="records"] [data-filter="type"]', { timeout: 120000 });
  const heads = await page.$$eval('[data-window="records"] [data-records-book] > h4', (nodes) => nodes.map((node) => node.textContent));
  assert(heads.includes("Weapons") && heads.includes("Armor & Shields") && heads.some((head) => /Magic Items|Potions/.test(head)), `items by type: ${heads}`);
  await page.screenshot({ path: shot("items") });
  await page.selectOption('[data-window="records"] [data-filter="type"]', "Armor & Shields");
  const only = await page.$$eval('[data-window="records"] [data-records-book] > h4', (nodes) => nodes.map((node) => node.textContent));
  assert(only.join() === "Armor & Shields", `the Type filter: ${only}`);
  report.push(`Items: ${heads.length} types (${heads.slice(0, 6).join(", ")}...), filtered to Armor & Shields`);

  // NPCs: by creature type.
  await page.click('.sidebar [data-launch="records:npc"]');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-window="records"] [data-records-book] > h4')].some((node) => /Humanoids|Dragons|Undead/.test(node.textContent ?? "")), null, { timeout: 60000 });
  const creatures = await page.$$eval('[data-window="records"] [data-records-book] > h4', (nodes) => nodes.map((node) => node.textContent));
  await page.screenshot({ path: shot("npcs") });
  report.push(`NPCs: ${creatures.slice(0, 6).join(", ")}...`);

  // Images: by kind, filtered to Portraits.
  await page.click('.sidebar [data-launch="imagelist"]');
  await page.waitForSelector("[data-images-list] [data-filter='type']", { timeout: 60000 });
  const kinds = await page.$$eval("[data-images-list] [data-images-type]", (nodes) => nodes.map((node) => node.getAttribute("data-images-type")));
  assert(kinds.length >= 2, `images by kind: ${kinds}`);
  await page.screenshot({ path: shot("images") });
  report.push(`Images: ${kinds.join(", ")}`);
  console.log(`ok categories ui: ${report.join("; ")}. ${shot("items")} ${shot("npcs")} ${shot("images")}`);
} finally {
  child.kill();
  await app.close();
}
