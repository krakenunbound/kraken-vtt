// Throws a die from the tray in the real app (a fast drag, as a hand flicks)
// and prints the throw that reached the roll: where it left the hand and how
// fast (fractions of the window a second). For looking at, not a test.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-throw-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
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
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    answers.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => JSON.parse((await rpc("tools/call", { name, arguments: args })).content[0].text);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Throw probe", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47397, password: "" });
  await page.waitForSelector("text=Hosting");
  const die = await page.waitForSelector(".chat-tray [data-sides], .tray-die, [data-die]", { timeout: 15000 });
  const box = await die.boundingBox();
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  console.log("window", JSON.stringify(size), "die at", Math.round(box.x), Math.round(box.y));
  // A flick: 600 px up and right, as fast as the mouse moves here.
  for (const [name, pause] of [["fast", 0], ["brisk", 8], ["gentle", 30]]) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(box.x + box.width / 2 + step * 60, box.y + box.height / 2 - step * 40);
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    }
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    console.log(name, JSON.stringify(await page.evaluate(() => window.__krakenDice)));
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  // From the chat popped out into a window of its own.
  const [popped] = await Promise.all([app.waitForEvent("window"), page.click(".chat-popout")]);
  await popped.waitForSelector(".tray-die", { timeout: 15000 });
  const outBox = await (await popped.$(".tray-die")).boundingBox();
  await popped.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2);
  await popped.mouse.down();
  for (let step = 1; step <= 10; step++) await popped.mouse.move(outBox.x + outBox.width / 2 + step * 25, outBox.y + outBox.height / 2 - step * 30);
  await popped.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  console.log("popped out", JSON.stringify(await page.evaluate(() => window.__krakenDice)));
} finally {
  child.kill();
  await app.close();
}
