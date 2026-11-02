// Step 2 in the app: an agent (MCP) imports the C&C books into a hosted
// campaign, builds a Common Room pregen with kraken_build_character, and
// the numbers match FG's build report; a fixed-die SIEGE check gives the
// worked result; the Characters tab shows the sheet and its Check button
// rolls through the host; the owning player sees the character, another
// player does not.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const { fgDataFolder } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pregens = path.join(fgDataFolder(), "cc-conversion", "pregens");
const spec = JSON.parse(readFileSync(path.join(pregens, "specs", "aldric-3.json"), "utf8"));
const want = JSON.parse(readFileSync(path.join(pregens, "built", "report.json"), "utf8"))["aldric-3"];

const profile = mkdtempSync(path.join(tmpdir(), "kraken-character-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const waits = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  waits.get(message.id)?.(message);
});
let next = 0;
function rpc(method, params) {
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    waits.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

async function joinAs(port, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  ws.on("message", (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "join", name, password: "" }));
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const ok = inbox.find((m) => m.type === "ok");
    if (ok) return { ws, ok };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${name} could not join`);
}

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check-character", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Character Test", ruleset: "Castles & Crusades" });
  const port = 47391;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await tool("kraken_import_fg_module", { module: "C&C Player's Handbook" });
  await tool("kraken_import_fg_module", { module: "C&C Adventurer's Backpack" });

  const built = await tool("kraken_build_character", { spec, owner: "Ann" });
  assert(built.created && built.problems.length === 0, `built ${JSON.stringify(built)}`);
  const sheet = (await tool("kraken_record_get", { id: built.id })).data;
  for (const [field, value] of Object.entries({ level: sheet.level, exp: sheet.exp, expnext: sheet.expnext, hp: sheet.hp.total, ac: sheet.ac.total, bth: sheet.bth })) {
    assert(value === want.check[field], `${field} ${value}, FG ${want.check[field]}`);
  }
  assert(built.coinleft === want.coinleft, `coin ${built.coinleft}, FG ${want.coinleft}`);

  // SIEGE check, fixed d20 11: Aldric's Strength 15 (+1), prime, level 3, CL 4:
  // 11 + 1 + 3 = 15 vs 12 + 4 = 16, a failure; Dexterity 11 (+0), secondary: 14 vs 22.
  await tool("kraken_dice_force", { values: [11] });
  const strength = await tool("kraken_siege_check", { id: built.id, attribute: "strength", cl: 4 });
  assert(strength.total === 15 && strength.cc === 16 && strength.success === false, `strength ${JSON.stringify(strength)}`);
  await tool("kraken_dice_force", { values: [20] });
  const wisdom = await tool("kraken_siege_check", { id: built.id, attribute: "wisdom", cl: 0 });
  assert(wisdom.total === 24 && wisdom.cc === 12 && wisdom.success === true, `wisdom ${JSON.stringify(wisdom)}`);

  // Level up: Divine Knight 3 -> 4, its hit die fixed at 6. The gain is the
  // die plus Constitution 16 (+2); BtH, hit dice and XP to next level come
  // from the package's level 4 and 5 rows.
  const { readModule } = require("../electron/importers/fgModule.cjs");
  const knight = readModule("C&C Adventurer's Backpack").records.find((r) => r.type === "siegepackage" && r.name === "Divine Knight").data;
  const row4 = Object.values(knight.levels).find((row) => row.level === 4);
  const row5 = Object.values(knight.levels).find((row) => row.level === 5);
  await tool("kraken_dice_force", { values: [6] });
  const levelled = await tool("kraken_level_up", { id: built.id });
  const after = (await tool("kraken_record_get", { id: built.id })).data;
  assert(levelled.level === 4 && after.level === 4, `level ${after.level}`);
  assert(levelled.gain === 8 && after.hp.total === want.check.hp + 8, `hp ${after.hp.total} gain ${levelled.gain}`);
  assert(after.bth === row4.bth && after.hitdice === row4.hd && after.expnext === row5.xp, `bth ${after.bth} hd ${after.hitdice} next ${after.expnext}`);
  assert(Object.values(after.packages).some((pkg) => pkg.name === "Divine Knight" && pkg.hplog.l4 === 8), "hit points logged for level 4");
  assert((await tool("kraken_chat_log", { count: 5 })).some((line) => line.text?.startsWith("[LEVEL UP] Sir Aldric Fane is now Divine Knight 4")), "level up in chat");

  // The sheet in the GM's window, and its Check button.
  await page.getByRole("tab", { name: "Characters" }).click();
  await page.waitForSelector(`[data-character="${built.id}"]`);
  assert((await page.locator('[data-stat="ac"]').textContent()) === String(after.ac.total), "sheet AC");
  assert((await page.locator('[data-stat="bth"]').textContent()) === `+${after.bth}`, "sheet BtH");
  assert((await page.locator('[data-stat="level"]').textContent()) === "4", "sheet level");
  await tool("kraken_dice_force", { values: [7] });
  await page.getByRole("button", { name: "constitution check" }).click();
  const start = Date.now();
  let line = null;
  while (!line && Date.now() - start < 10000) {
    line = (await tool("kraken_chat_log", { count: 5 })).find((entry) => entry.roll?.label?.includes("Constitution check"));
    if (!line) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Constitution 16 (+2) + level 4 = +6, d20 7: 13.
  assert(line && line.roll.total === 13, `sheet check ${JSON.stringify(line)}`);

  // Ann owns the character and sees it; Bob does not.
  const ann = await joinAs(port, "Ann");
  const bob = await joinAs(port, "Bob");
  assert(ann.ok.records.some((record) => record.id === built.id), "Ann sees her character");
  assert(!bob.ok.records.some((record) => record.id === built.id), "Bob does not see Ann's character");

  // Bob makes his own character from the browser wizard: it is his, and Ann cannot see it.
  const garrick = JSON.parse(readFileSync(path.join(pregens, "specs", "garrick-1.json"), "utf8"));
  const replies = [];
  bob.ws.on("message", (raw) => replies.push(JSON.parse(raw.toString())));
  bob.ws.send(JSON.stringify({ type: "build-character", req: 7, spec: garrick, owner: "Ann" }));
  const waitStart = Date.now();
  let answer = null;
  while (!answer && Date.now() - waitStart < 15000) {
    answer = replies.find((m) => m.type === "op-result" && m.req === 7);
    if (!answer) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(answer?.ok, `Bob's build ${JSON.stringify(answer)}`);
  const bobs = await tool("kraken_record_get", { id: answer.id });
  assert(bobs.owner === "Bob" && bobs.visibility === "owner", `Bob's character owner ${bobs.owner}`);
  assert(bobs.data.hp.total === 11 && bobs.data.ac.total === 16, `Bob's Garrick hp ${bobs.data.hp.total} ac ${bobs.data.ac.total}`);
  ann.ws.close();
  bob.ws.close();

  await page.screenshot({ path: path.join(profile, "sheet.png") });
  await tool("kraken_leave");
  console.log(`ok character: ${spec.name} built by the agent matches FG (HP ${want.check.hp}, AC ${want.check.ac}, BtH ${want.check.bth}); SIEGE checks; sheet; permissions. Screenshot ${path.join(profile, "sheet.png")}`);
} finally {
  child.stdin.end();
  await app.close();
}
