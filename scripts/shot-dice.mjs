// The Dice window's sets, a group at a time, and a few of the Gilded Die's
// sets rolling and landing, in the real Kraken app (throwaway profile):
// screenshots for looking at, not a test. Build first (npm run build).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-dice-shot-"));
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
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const file = (name) => path.join(tmpdir(), `kraken-dice-${name}.png`);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Dice shot", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47403, password: "" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_windows", { action: "open", kind: "dice" });
  await page.waitForTimeout(4000);
  for (const group of ["Cores", "Relics", "Wilds", "Classes", "Worlds"]) {
    await page.click(`.dice-window >> text="${group}"`).catch(() => page.click(`text="${group}"`));
    await page.waitForTimeout(600);
    await page.screenshot({ path: file(`group-${group}`) });
  }
  await tool("kraken_windows", { action: "close", kind: "dice" });
  for (const preset of (process.env.SETS ?? "Aether Core,Reliquary,Bard,Rose Window,Magma Vein,Imperial").split(",")) {
    await tool("kraken_dice_settings", { preset });
    await tool("kraken_roll", { formula: "1d20+1d6+1d8+1d12", label: preset });
    await page.waitForTimeout(700);
    await page.screenshot({ path: file(`roll-${preset.replace(/\W+/g, "")}`) });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: file(`land-${preset.replace(/\W+/g, "")}`) });
  }
  console.log("saved", file("<name>"));
} finally {
  child.kill();
  await app.close();
}
