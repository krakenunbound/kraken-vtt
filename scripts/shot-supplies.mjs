// Shots of the sheet's Supplies in other games (the GM's app full screen): Cairn (slots), Basic
// Fantasy (its loads and movement) and D&D 3.5E (light, medium and heavy loads).
//   node scripts/shot-supplies.mjs        (npm run build first)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-supplies-shots-"));
mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
mkdirSync(path.join(profile, "packs"), { recursive: true });
const shots = path.join(tmpdir(), "kraken-bookkeeping-ui");
mkdirSync(shots, { recursive: true });
const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
});
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
    answers.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const games = [
  ["Cairn", "cairn", "inventory", { ruleset: "cairn", attributes: { str: { score: 12 }, dex: { score: 10 }, wil: { score: 9 } }, hp: { max: 5, wounds: 2 }, inventorylist: { "id-00001": { name: "Rations (3 uses)", uses: 3, carried: 1 }, "id-00002": { name: "Torch (3 uses)", uses: 3, carried: 1 }, "id-00003": { name: "Longsword", damage: "d8", bulky: 1, carried: 2 }, "id-00004": { name: "Lantern", carried: 1 }, "id-00005": { name: "Oil Can (6 uses)", uses: 6, carried: 1 }, "id-00006": { name: "Healing Salve", uses: 2, carried: 1 } } }],
  ["Basic Fantasy", "bfrpg", "inventory", { ruleset: "bfrpg", class: "fighter", race: "human", level: 2, abilities: { strength: { score: 9 }, constitution: { score: 12 } }, hp: { total: 12, wounds: 3 }, inventorylist: { "id-00001": { name: "Chain Mail", type: "Armor", ac: 15, weight: 40, carried: 2 }, "id-00002": { name: "Shortbow", type: "Weapon", damage: "1d6", weight: 2, carried: 2 }, "id-00003": { name: "Arrows (20)", weight: 1, carried: 1 }, "id-00004": { name: "Rations, Dry, one week", weight: 14, carried: 1 }, "id-00005": { name: "Waterskin", weight: 2, carried: 1 }, "id-00006": { name: "Torches, 6", count: 6, weight: 1, carried: 1 }, "id-00007": { name: "Iron spikes", weight: 12, carried: 1 } } }],
  ["D&D 3.5E", "dnd35", "inventory", { ruleset: "dnd35", level: 3, abilities: { strength: { score: 12 }, constitution: { score: 14 } }, speed: 30, hp: { total: 24, wounds: 6 }, inventorylist: { "id-00001": { name: "Chainmail", type: "Armor", weight: 40, carried: 2 }, "id-00002": { name: "Longbow", type: "Weapon", damage: "1d8", weight: 3, carried: 2 }, "id-00003": { name: "Arrows (20)", weight: 3, carried: 1 }, "id-00004": { name: "Trail rations", count: 4, weight: 1, carried: 1 }, "id-00005": { name: "Waterskin", weight: 4, carried: 1 }, "id-00006": { name: "Backpack", weight: 2, carried: 1 }, "id-00007": { name: "Bedroll", weight: 5, location: "Backpack", carried: 1 } } }],
];
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shots", version: "1" } });
  for (const [game, id, tab, data] of games.filter(([name]) => !process.env.ONLY || process.env.ONLY === name)) {
    const campaign = await tool("kraken_campaign_create", { name: `Supplies ${game}`, ruleset: game });
    await tool("kraken_host", { campaignId: campaign.id, port: 47464, password: "" });
    await page.waitForSelector("text=Hosting");
    const made = await tool("kraken_record_create", { type: "character", name: "Tamsin", owner: "", visibility: "all", data });
    const recordId = made.id ?? made.record?.id;
    // A pack action works the rules' numbers out (the load, slots, movement).
    await tool("kraken_bookkeeping", { id: recordId, action: "pack", item: "id-00001", into: "" });
    await tool("kraken_windows", { action: "open", kind: "sheet", record: recordId });
    const sheet = page.locator(`.cc-sheet[data-ruleset="${id}"]`);
    await sheet.waitFor({ timeout: 15000 });
    await sheet.locator(`[data-sheet-tab="${tab}"]`).click();
    await sheet.locator('[data-part="supplies"]').scrollIntoViewIfNeeded();
    await settle(1200);
    await page.screenshot({ path: path.join(shots, `9-gm-supplies-${id}.png`) });
    console.log(`shot ${path.join(shots, `9-gm-supplies-${id}.png`)}`);
    await tool("kraken_leave", {});
    await settle(800);
  }
} finally {
  child.kill();
  await app.close();
}
