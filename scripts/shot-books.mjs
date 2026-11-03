// Opens a real book in the real Kraken app (throwaway profile, the GM's own
// FG modules) and saves screenshots of the Books window, Activation and a
// page: for looking at, not a test. KRAKEN_BOOK picks the book (default B1).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const book = process.env.KRAKEN_BOOK || "B1 In Search of the Unknown (C&C)";
const profile = mkdtempSync(path.join(tmpdir(), "kraken-books-shot-"));
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
const shot = (name) => page.screenshot({ path: path.join(tmpdir(), `kraken-books-${name}.png`) });
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Books shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47396, password: "" });
  await page.waitForSelector("text=Hosting");
  await page.click('.sidebar [data-launch="books"]');
  await page.click('[data-books-tab="activation"]');
  await page.waitForSelector("[data-activate]", { timeout: 60000 });
  await shot("activation");
  for (const id of [book, "SC C&C Player's Handbook", "SC C&C Monsters & Treasure"]) await page.click(`[data-activate="${id}"]`).catch(() => undefined);
  await page.click('[data-books-tab="books"]');
  await page.waitForTimeout(800);
  await shot("list");
  await page.click(`.books-window [data-book="${book}"]`);
  await page.waitForSelector(".book-page h2", { timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".book-figure img")].every((img) => img.complete));
  await shot("page");
  console.log(`saved ${["activation", "list", "page"].map((name) => path.join(tmpdir(), `kraken-books-${name}.png`)).join(", ")}`);
} finally {
  child.kill();
  await app.close();
}
