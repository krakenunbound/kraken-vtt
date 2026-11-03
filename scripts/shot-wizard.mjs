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
  await page.waitForTimeout(1000);
  await shot("step1");
  const next = await page.$("text=Next");
  if (next) {
    await next.click().catch(() => undefined);
    await page.waitForTimeout(800);
    await shot("step2");
  }
  console.log("saved", ["list", "step1", "step2"].map((name) => path.join(tmpdir(), `kraken-wizard-${name}.png`)).join(", "));
} finally {
  child.kill();
  await app.close();
}
