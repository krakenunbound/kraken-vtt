// Opens the character wizard in the real Kraken app (throwaway profile) and
// saves screenshots of the Characters window and each wizard step: for
// looking at, not a test.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-wizard-shot-"));
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
const shot = (name) => page.screenshot({ path: path.join(tmpdir(), `kraken-wizard-${name}.png`) });
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Wizard shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47398, password: "" });
  await page.waitForSelector("text=Hosting");
  for (const book of ["SC C&C Player's Handbook", "SC C&C Adventurer's Backpack"]) console.log(book, JSON.stringify(await tool("kraken_books", { action: "activate", book })).slice(0, 80));
  await page.click('.sidebar [data-launch="characters"]');
  await page.waitForSelector('[data-action="new-character"]');
  await shot("list");
  await page.click('[data-action="new-character"]');
  await page.waitForSelector(".ccw");
  const saved = [];
  const snap = async (name) => {
    await page.waitForTimeout(400);
    await page.locator(".ccw").screenshot({ path: path.join(tmpdir(), `kraken-wizard-${name}.png`) });
    saved.push(path.join(tmpdir(), `kraken-wizard-${name}.png`));
  };
  await page.click('[data-action="roll-abilities"]');
  await page.waitForFunction(() => document.querySelector('[data-final="charisma"]')?.textContent !== "", null, { timeout: 30000 });
  await snap("abilities");
  await page.click('[data-wizard-tab="race"]');
  await snap("race-list");
  await page.click('[data-race="Elf"]');
  await snap("race");
  await page.click('[data-wizard-tab="class"]');
  await snap("class-list");
  await page.click('[data-class="Wizard"]');
  await page.getByLabel("Higher starting level").click();
  await page.getByLabel("Higher starting level").click();
  await snap("class");
  await page.click('[data-action="combo-multi"]');
  await page.locator(".ccw-combo-list").scrollIntoViewIfNeeded();
  await snap("combine-list");
  await page.click('[data-combo-add="Fighter"]');
  await page.locator('[data-combo="multi"]').scrollIntoViewIfNeeded();
  await snap("combine");
  await page.click('[data-wizard-tab="primes"]');
  await snap("primes");
  await page.click('[data-wizard-tab="hp"]');
  await page.click('[data-action="roll-hp"]');
  await page.waitForFunction(() => Number(document.querySelector("[data-hp-total]")?.getAttribute("data-hp-total")) > 0, null, { timeout: 30000 });
  await snap("hp");
  await page.click('[data-wizard-tab="equipment"]');
  await page.click('[data-action="roll-gold"]');
  await page.waitForFunction(() => Number(document.querySelector("[data-coin-left]")?.getAttribute("data-coin-left")) > 0, null, { timeout: 30000 });
  await page.getByRole("button", { name: "Buy Dagger", exact: true }).click().catch((error) => console.log("dagger", error.message));
  await snap("equipment");
  await page.click('[data-wizard-tab="spells"]');
  await snap("spells");
  await page.click('[data-wizard-tab="finish"]');
  await snap("finish");
  console.log("saved", saved.join(", "));
} finally {
  child.kill();
  await app.close();
}
