// The dice tower apart from the chat (the GM's Settings > External dice tower):
// ticked, the tower leaves the chat's tray and stands on the table (a 3D
// stone tower, dark when off, its door glowing and dice tumbling inside when
// on); a click turns it on and off, a drag moves it and the place is kept on
// this screen; a die dragged from the tray onto it rolls in the tower ([TOWER]).
// kraken_table_options towerExternal does the same; unticked, it is docked again.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-tower-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
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
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Tower", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47455, password: "pw" });
  await page.waitForSelector("text=Hosting");
  assert(await page.$(".dice-tray .tower"), "the tower starts docked in the chat's tray");
  assert(!(await page.$(".tower-external")), "no tower on the table yet");

  // The GM ticks External dice tower in Settings.
  await page.click('.sidebar [data-launch="settings"]');
  await page.click('[data-setting="tower-external"]');
  await page.waitForSelector(".tower-external");
  assert(!(await page.$(".dice-tray .tower")), "the tray's tower is gone");
  assert((await tool("kraken_table_options")).towerExternal === true, "the table keeps the option");
  await page.click('.sidebar [data-launch="settings"]');
  assert(await page.$('.tower-external[aria-pressed="false"] .tower-art:not(.on)'), "off: the dark tower");
  if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-off.png") });

  // A click turns it on: the glowing door and the tumbling dice.
  await page.click(".tower-external");
  await page.waitForSelector('.tower-external[aria-pressed="true"] .tower-art.on .tower-die');
  const animated = await page.$eval(".tower-art.on .tower-die", (die) => getComputedStyle(die).animationName);
  assert(animated === "tower-tumble", `the dice tumble inside it (${animated})`);
  await settle(700);
  if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-on.png") });
  await page.click(".tower-external");
  await page.waitForSelector('.tower-external[aria-pressed="false"]');
  report.push("Settings > External dice tower: the tower leaves the tray for the table; a click turns it on (door glowing, dice tumbling) and off");

  // A drag moves it; the place is kept (this screen) through a reload.
  const from = await page.locator(".tower-external").boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 200, from.y - 150, { steps: 8 });
  await page.mouse.up();
  const to = await page.locator(".tower-external").boundingBox();
  assert(Math.abs(to.x - (from.x - 200 - from.width / 2)) < 6 && Math.abs(to.y - (from.y - 150 - from.height / 2)) < 6, `dragged (${JSON.stringify(from)} -> ${JSON.stringify(to)})`);
  assert(await page.$('.tower-external[aria-pressed="false"]'), "a drag does not turn it on");
  report.push("dragged to another place on the table (kept on this screen)");

  // A die from the tray dropped on it rolls in the tower.
  const before = (await tool("kraken_chat_log", { count: 50 })).length;
  const die = await page.locator('.tray-die[aria-label="d20"]').boundingBox();
  const tower = await page.locator(".tower-external").boundingBox();
  await page.mouse.move(die.x + die.width / 2, die.y + die.height / 2);
  await page.mouse.down();
  await page.mouse.move(die.x + 60, die.y - 80, { steps: 5 });
  await page.mouse.move(tower.x + tower.width / 2, tower.y + tower.height / 2, { steps: 10 });
  await page.waitForSelector(".tower-external.drop");
  await page.mouse.up();
  await settle(900);
  const lines = await tool("kraken_chat_log", { count: 50 });
  const rolled = lines.slice(before).find((line) => line.roll);
  assert(rolled && /\[TOWER\]/.test(rolled.roll.label ?? rolled.text ?? ""), `a die dropped on it rolls in the tower (${JSON.stringify(lines.slice(before))})`);
  report.push("a d20 dragged onto it rolls in the tower ([TOWER])");

  // Unticked (kraken_table_options), it is docked in the chat again.
  await tool("kraken_table_options", { towerExternal: false });
  await page.waitForSelector(".tower-external", { state: "detached" });
  await page.waitForSelector(".dice-tray .tower");
  report.push("kraken_table_options towerExternal false: docked in the chat again");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok tower ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
