// The DM assistant's window in the real Kraken app (throwaway profile, no
// key): screenshots for looking at, not a test. Build first (npm run build).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-assistant-shot-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
page.on("console", (message) => { if (message.type() === "error") console.log("CONSOLE", message.text().slice(0, 400)); });
page.on("pageerror", (error) => console.log("PAGEERROR", (error.stack ?? error.message).slice(0, 900)));
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
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const file = (name) => path.join(tmpdir(), `kraken-assistant-${name}.png`);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Assistant shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47404, password: "" });
  await page.waitForSelector("text=Hosting");
  await page.click('.sidebar [data-launch="assistant"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file("debug") });
  console.log(await page.evaluate(() => [typeof window.kraken?.assistant, document.querySelector(".window-layer")?.innerText.slice(0, 300)]));
  await page.waitForSelector(".assistant");
  await page.waitForTimeout(500);
  await page.screenshot({ path: file("window") });
  await page.fill('[aria-label="Ask the assistant"]', "Roll a random encounter for the party");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".assistant-note.error");
  await page.screenshot({ path: file("no-key") });
  console.log("saved", file("<name>"), await page.textContent(".assistant-note.error"));
} finally {
  child.kill();
  await app.close();
}
