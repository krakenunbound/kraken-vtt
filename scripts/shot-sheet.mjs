// Builds a C&C character with the GM's own Player's Handbook in the real
// Kraken app (throwaway profile) and saves a screenshot of each sheet tab:
// for looking at, not a test.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-sheet-shot-"));
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
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    answers.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => JSON.parse((await rpc("tools/call", { name, arguments: args })).content[0].text);
const shot = (name) => page.screenshot({ path: path.join(tmpdir(), `kraken-sheet-${name}.png`) });
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Sheet shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47402, password: "" });
  await page.waitForSelector("text=Hosting");
  for (const book of ["C&C Player's Handbook", "C&C Adventurer's Backpack"]) await tool("kraken_books", { action: "activate", book });
  const built = await tool("kraken_build_character", { spec: { name: "Halvar Runecarver", race: "Dwarf", class: "Fighter", level: 1, scores: { strength: 16, dexterity: 10, constitution: 15, intelligence: 12, wisdom: 12, charisma: 9 }, primes: ["constitution"], gold: 120, gear: [["Hammer, War", 1], ["Studded Leather", 1], ["Backpack", 1], ["Rations (1 day)", 2], ["Torch", 1]], worn: ["Hammer, War", "Studded Leather"], packed: ["Rations (1 day)", "Torch"], container: "Backpack", alignment: "Lawful Neutral", deity: "Moradin", appearance: "An elderly dwarf with a white beard woven with copper wire." } });
  console.log("built", JSON.stringify(built).slice(0, 160));
  await page.click('.sidebar [data-launch="characters"]');
  await page.waitForSelector(".cc-sheet", { timeout: 15000 });
  for (const tab of ["main", "combat", "abilities", "inventory", "spells", "notes"]) {
    await page.click(`[data-sheet-tab="${tab}"]`);
    await page.waitForTimeout(400);
    await (await page.$(".cc-sheet")).screenshot({ path: path.join(tmpdir(), `kraken-sheet-${tab}.png`) });
  }
  // The whole table: the tabs hanging off the window, the quick slots docked.
  await shot("window");
  const grip = await page.$('[data-action="quickslots-move"]');
  if (grip) {
    const box = await grip.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x - 300, box.y - 400, { steps: 8 });
    await page.mouse.up();
    await shot("slots-undocked");
  }
  console.log("saved", path.join(tmpdir(), "kraken-sheet-<tab>.png"));
} finally {
  child.kill();
  await app.close();
}
