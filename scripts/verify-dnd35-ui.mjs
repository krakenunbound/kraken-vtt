// D&D 3.5E in the real app: a campaign made as D&D 3.5E picked on the
// campaign screen, a 3.5E book (made up, in the shapes of the GM's 3.5E
// Player's Handbook and Monster Manual) on its shelf and made active, its
// classes, races and gear in the campaign; a test player in Chrome makes a
// dwarf fighter with the 3.5E wizard and opens the 3.5E sheet (AC 17, touch,
// flat-footed, BAB, saves), rolls Climb and a Fortitude save from it; the GM
// puts an ogre and a troll on the tracker; the player's attack from the sheet
// threatens and is confirmed (a critical, the damage twice); the troll's
// Full attack button rolls both claws. Needs no licensed content.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { makeDnd35Books } from "./fake-dnd35.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-dnd35-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: makeDnd35Books() };
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
const chat = (where, text) => where.waitForFunction((wanted) => document.body.textContent.includes(wanted), text, { timeout: 10000 });

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  // Made as Worldbuilding, D&D 3.5E picked on the campaign screen.
  const campaign = await tool("kraken_campaign_create", { name: "3.5E UI", ruleset: "Worldbuilding" });
  await page.reload();
  await page.waitForSelector("text=My Campaigns");
  if (!(await page.$('select[aria-label="Ruleset"]'))) await page.click("text=My Campaigns");
  await page.click("text=3.5E UI");
  await page.selectOption('select[aria-label="Ruleset"]', "D&D 3.5E");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Ruleset"]')?.value === "D&D 3.5E");
  const port = 47413;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  const book = (shelf.books ?? shelf).find((item) => item.name === "Test 3.5E Handbook");
  assert(book, `the 3.5E book is on a 3.5E campaign's shelf: ${JSON.stringify(shelf).slice(0, 300)}`);
  await tool("kraken_books", { action: "activate", book: book.id });
  let classes = [];
  for (let wait = 0; wait < 40 && classes.length < 2; wait++) {
    classes = listOf(await tool("kraken_records_list", { type: "class" }));
    if (classes.length < 2) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(classes.length === 2 && listOf(await tool("kraken_records_list", { type: "race" })).length === 2 && listOf(await tool("kraken_records_list", { type: "item" })).length === 6, "the book's classes, races and gear (kept under <reference>) are records in the campaign");

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The 3.5E wizard: a dwarf fighter, the standard array in the fighter's order.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="dnd35"]');
  await seat.fill('[aria-label="Character name"]', "Tordek");
  await seat.selectOption('[aria-label="Race"]', "Dwarf");
  await seat.selectOption('[aria-label="Class"]', "Fighter");
  assert((await seat.inputValue('[aria-label="strength score"]')) === "15" && (await seat.textContent('[data-adjust="constitution"]'))?.includes("+2"), "the array in the fighter's order, the dwarf's +2 Constitution shown");
  assert((await seat.textContent("[data-class-info]"))?.includes("hit die d10"), "the class's hit die, base attack and saves shown");
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-35 [data-stat="ac"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Tordek");
  const hero = await tool("kraken_record_get", { id: row.id });
  assert(hero.owner === "A test player" && hero.data.ruleset === "dnd35" && hero.data.hp.total === 13 && hero.data.ac.total === 17, `the wizard built Tordek (13 HP; scale mail and a heavy shield, AC 17): ${JSON.stringify({ owner: hero.owner, hp: hero.data.hp, ac: hero.data.ac.total })}`);
  const sheetText = async (stat) => (await seat.textContent(`.sheet-35 [data-stat="${stat}"]`))?.trim();
  assert((await sheetText("ac")) === "17" && (await sheetText("touch")) === "11" && (await sheetText("flatfooted")) === "16" && (await sheetText("bab")) === "+1" && (await sheetText("grapple")) === "+3", "the sheet: AC 17, touch 11, flat-footed 16, BAB +1, grapple +3");
  assert((await seat.textContent('.sheet-35 [data-roll-save="fortitude"]'))?.trim() === "+5", "Fortitude +5");

  // A skill and a save from the sheet, both in the GM's chat.
  await seat.click('[data-sheet-tab="skills"]');
  await seat.click('[data-roll-skill="climb"]');
  await chat(page, "[SKILL] Climb");
  await seat.click('[data-sheet-tab="main"]');
  await seat.click('[data-roll-save="fortitude"]');
  await chat(page, "[SAVE] Fortitude");

  // The GM's ogre and troll; the player's attack threatens (19) and is confirmed (15 + 4 = 19 vs AC 16).
  const npcs = listOf(await tool("kraken_records_list", { type: "npc" }));
  await tool("kraken_combat", { action: "add", recordId: npcs.find((item) => item.name === "Ogre").id });
  await tool("kraken_combat", { action: "add", recordId: npcs.find((item) => item.name === "Troll").id });
  await tool("kraken_combat", { action: "add", recordId: row.id });
  await tool("kraken_dice_force", { values: [15, 10, 3] });
  await tool("kraken_combat", { action: "init", which: "all" });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const mine = view.find((entry) => entry.recordId === row.id);
  const ogre = view.find((entry) => entry.name === "Ogre");
  const troll = view.find((entry) => entry.name === "Troll");
  assert(ogre.hp === 29 && ogre.ac === 16, "the ogre on the tracker: 29 HP, AC 16");
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: ogre.id, on: true });
  await tool("kraken_dice_force", { values: [19, 15] });
  await seat.click('[data-sheet-tab="combat"]');
  await seat.waitForSelector('.sheet-35 [data-attack] [data-action="attack"]');
  assert((await seat.textContent('.sheet-35 [data-attack] [data-crit]'))?.includes("19-20/x2"), "the longsword's threat range on the sheet");
  await seat.click('.sheet-35 [data-attack]:first-child [data-action="attack"]');
  await chat(page, "CRITICAL HIT x2");
  await tool("kraken_dice_force", { values: [5, 6] });
  await seat.click('.sheet-35 [data-attack]:first-child [data-action="damage"]');
  let hurt = null;
  for (let wait = 0; wait < 40; wait++) {
    view = (await tool("kraken_combat", { action: "view" })).entries;
    hurt = view.find((entry) => entry.id === ogre.id);
    if (hurt.wounds > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(hurt.wounds === 15, `the critical's damage rolled twice: (5+2)+(6+2) = 15: ${JSON.stringify(hurt)}`);

  // The GM: the tracker's troll, its Full attack button (both claws at the fighter).
  await tool("kraken_combat", { action: "target", id: troll.id, targetId: mine.id, on: true });
  await page.click('.sidebar [data-launch="combat"]');
  await page.waitForSelector('[data-full-attack="0"]');
  await tool("kraken_dice_force", { values: [15, 3] });
  await page.click('[data-full-attack="0"]');
  await chat(page, "Claw #2");
  assert(await page.evaluate(() => document.body.textContent.includes("Claw #1")), "both claws rolled");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-dnd35-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-dnd35-gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok dnd35 ui: a D&D 3.5E campaign's shelf holds its 3.5E book, made active (classes, races, gear as records); a test player makes Tordek with the 3.5E wizard (13 HP, AC 17 / touch 11 / flat-footed 16, BAB +1, Fortitude +5), rolls Climb and Fortitude from the sheet, confirms a critical on the ogre from the sheet (15 damage); the troll's Full attack rolls both claws. ${path.join(tmpdir(), "kraken-dnd35-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
