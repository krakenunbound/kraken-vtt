// D&D 5E in the real app (the second ruleset): a campaign made as D&D 5E,
// its books (the SRD 5.2.1's player book and bestiary, FG's 5E modules)
// made active; a test player in Chrome makes a character with the 5E wizard,
// opens the 5E sheet and rolls a skill and a save from it; the GM puts a
// goblin on the tracker; the player targets it and attacks and rolls damage
// from the sheet; the goblin's hit points go down on the tracker. Skipped
// without the SRD modules.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const require = createRequire(import.meta.url);
const { listModules } = require("../electron/importers/fgModule.cjs");
if (!listModules().some((item) => (item.name ?? item) === "DNDSRD521PLAYER")) {
  console.log("skip dnd5e ui: no SRD 5.2.1 modules");
  process.exit(0);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-dnd5e-ui-"));
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
const listOf = (value) => (Array.isArray(value) ? value : value.records ?? []);
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "5E UI", ruleset: "D&D 5E" });
  const port = 47412;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  const list = shelf.books ?? shelf;
  const label = (book) => `${book.id} ${book.name ?? ""} ${book.title ?? ""}`;
  const player = list.find((book) => /DNDSRD521PLAYER/i.test(label(book)));
  const bestiary = list.find((book) => /DNDSRD521BESTIARY/i.test(label(book)));
  assert(player && bestiary, `the SRD books are on a 5E campaign's shelf: ${list.map(label).join(" | ").slice(0, 400)}`);
  assert(!list.some((book) => /Castles|SiegeCore|C&C/i.test(label(book))), "no C&C book on a 5E shelf");
  await tool("kraken_books", { action: "activate", book: player.id });
  await tool("kraken_books", { action: "activate", book: bestiary.id });
  assert(listOf(await tool("kraken_records_list", { type: "class" })).length === 12, "the twelve SRD classes are in the campaign");

  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The 5E wizard: a dwarf fighter, the scores typed, two skills, the starting gear.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="dnd5e"]');
  await seat.fill('[aria-label="Character name"]', "Brundar");
  await seat.selectOption('[aria-label="Species"]', "Dwarf");
  await seat.selectOption('[aria-label="Class"]', "Fighter");
  await seat.selectOption('[aria-label="Background"]', "Soldier");
  for (const [stat, score] of [["strength", 16], ["dexterity", 12], ["constitution", 15], ["intelligence", 8], ["wisdom", 13], ["charisma", 10]]) await seat.fill(`[aria-label="${stat} score"]`, String(score));
  await seat.check('[data-wizard-skill="perception"]');
  await seat.check('[data-wizard-skill="survival"]');
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-5e [data-stat="ac"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Brundar");
  const hero = await tool("kraken_record_get", { id: row.id });
  assert(hero.owner === "A test player" && hero.data.ruleset === "dnd5e" && hero.data.hp.total === 13 && hero.data.ac.total === 16, `the wizard built Brundar (13 HP; chain mail AC 16): ${JSON.stringify({ owner: hero.owner, hp: hero.data.hp, ac: hero.data.ac })}`);
  assert((await seat.textContent('.sheet-5e [data-stat="ac"]')).trim() === "16", "the sheet shows AC 16");

  // A skill and a save from the sheet, both in the GM's chat.
  await seat.click('[data-sheet-tab="skills"]');
  await seat.click('[data-roll-skill="athletics"]');
  await page.waitForFunction(() => document.body.textContent.includes("[SKILL] Athletics"), null, { timeout: 10000 });
  await seat.click('[data-sheet-tab="main"]');
  await seat.click('[data-roll-save="constitution"]');
  await page.waitForFunction(() => document.body.textContent.includes("[SAVE] Constitution"), null, { timeout: 10000 });

  // The GM puts a goblin on the tracker; the player attacks it from the sheet.
  const goblin = listOf(await tool("kraken_records_list", { type: "npc" })).find((item) => item.name === "Goblin Warrior");
  await tool("kraken_combat", { action: "add", recordId: goblin.id });
  await tool("kraken_combat", { action: "add", recordId: row.id });
  await tool("kraken_combat", { action: "init", which: "all" });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const mine = view.find((entry) => entry.recordId === row.id);
  const foe = view.find((entry) => entry.name === "Goblin Warrior");
  assert(foe.hp === 10 && foe.ac === 15, "the goblin warrior on the tracker: 10 HP, AC 15");
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: foe.id, on: true });
  await tool("kraken_dice_force", { values: [17] });
  await seat.click('[data-sheet-tab="combat"]');
  await seat.waitForSelector('[data-action="attack"]');
  const weapon = (await seat.textContent(".five-attacks li b")).trim();
  await seat.click('.five-attacks li:first-child [data-action="attack"]');
  await page.waitForFunction((name) => document.body.textContent.includes(`${name} [AC 15] [HIT`), weapon, { timeout: 10000 });
  await seat.click('.five-attacks li:first-child [data-action="damage"]');
  let hurt = null;
  for (let wait = 0; wait < 40; wait++) {
    view = (await tool("kraken_combat", { action: "view" })).entries;
    hurt = view.find((entry) => entry.id === foe.id);
    if (hurt.wounds > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(hurt.wounds > 0, `the goblin took the ${weapon}'s damage: ${JSON.stringify(hurt)}`);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-dnd5e-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-dnd5e-gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok dnd5e ui: a D&D 5E campaign's shelf holds the SRD books (no C&C); a test player makes Brundar with the 5E wizard (13 HP, AC 16), rolls Athletics and a Constitution save from the sheet, and hits a goblin warrior with the ${weapon} from the sheet's Combat tab (${hurt.wounds} damage). ${path.join(tmpdir(), "kraken-dnd5e-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
