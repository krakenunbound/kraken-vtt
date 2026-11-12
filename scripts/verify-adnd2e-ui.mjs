// AD&D 2E in the real app: a campaign made as AD&D 2E picked on the campaign
// screen, a 2E adventure (made up, in the shapes of the GM's 2E books: NPC
// blocks and a pregen) on its shelf and made active; a test player in Chrome
// makes a human fighter with the 2E wizard (18/76 Strength), opens the 2E
// sheet (THAC0 20, AC 2, 12 HP, the five saves), rolls a Strength check and
// a Paralyzation save from it, then takes the book's pregen as a second
// character; the GM puts an ogre and a mountain lion on the tracker
// (initiative lowest first); the player's attack from the sheet hits the ogre
// (THAC0 - AC) and the damage is the Large one; the GM's All attacks button
// rolls the lion's claw, claw and bite. Needs no licensed content.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { makeAdnd2eBooks } from "./fake-adnd2e.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-adnd2e-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: makeAdnd2eBooks() };
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
const until = async (test, what) => {
  for (let wait = 0; wait < 60; wait++) {
    const value = await test();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out: ${what}`);
};

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  // Made as Worldbuilding, AD&D 2E picked on the campaign screen.
  const campaign = await tool("kraken_campaign_create", { name: "2E UI", ruleset: "Worldbuilding" });
  await page.reload();
  await page.waitForSelector("text=My Campaigns");
  if (!(await page.$('select[aria-label="Ruleset"]'))) await page.click("text=My Campaigns");
  await page.click("text=2E UI");
  await page.selectOption('select[aria-label="Ruleset"]', "AD&D 2E");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Ruleset"]')?.value === "AD&D 2E");
  const port = 47414;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  const book = (shelf.books ?? shelf).find((item) => item.name === "Test 2E Adventure");
  assert(book, `the 2E book is on an AD&D 2E campaign's shelf: ${JSON.stringify(shelf).slice(0, 300)}`);
  await tool("kraken_books", { action: "activate", book: book.id });
  const npcs = await until(async () => {
    const list = listOf(await tool("kraken_records_list", { type: "npc" }));
    return list.length === 3 ? list : null;
  }, "the book's creatures");
  const pregens = listOf(await tool("kraken_records_list", { type: "pregencharsheet" }));
  assert(pregens.some((item) => item.name === "Sister Mara"), "the book's pregen is in the campaign");

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The 2E wizard: a human fighter, Strength 18/76.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="adnd2e"]');
  await seat.fill('[aria-label="Character name"]', "Brannoc");
  await seat.selectOption('[aria-label="Race"]', "Human");
  await seat.selectOption('[aria-label="Class"]', "Fighter");
  assert((await seat.textContent("[data-class-info]"))?.includes("hit die d10"), "the class's hit die and needs shown");
  for (const [stat, value] of Object.entries({ strength: 18, dexterity: 16, constitution: 16, intelligence: 10, wisdom: 12, charisma: 11 })) await seat.fill(`[aria-label="${stat} score"]`, String(value));
  await seat.waitForSelector('[aria-label="Exceptional strength"]');
  await seat.fill('[aria-label="Exceptional strength"]', "76");
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-2e [data-stat="thaco"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Brannoc");
  const hero = await tool("kraken_record_get", { id: row.id });
  assert(hero.owner === "A test player" && hero.data.ruleset === "adnd2e" && hero.data.hp.total === 12 && hero.data.ac.total === 2 && hero.data.abilities.strength.percent === 76, `the wizard built Brannoc (12 HP; chain mail, a shield and Dex 16: AC 2): ${JSON.stringify({ owner: hero.owner, hp: hero.data.hp, ac: hero.data.ac.total, str: hero.data.abilities.strength })}`);
  const sheetText = async (stat) => (await seat.textContent(`.sheet-2e [data-stat="${stat}"]`))?.trim();
  assert((await sheetText("thaco")) === "20" && (await sheetText("ac")) === "2" && (await sheetText("init")) === "-1", "the sheet: THAC0 20, AC 2, initiative -1");
  assert((await seat.textContent('.sheet-2e [data-roll-save="paralyzation"]'))?.trim() === "14" && (await seat.textContent('.sheet-2e [data-ability="strength"] .d2e-note'))?.includes("Hit +2, damage +4"), "Paralyzation 14; 18/76's hit +2, damage +4");

  // An ability check and a save from the sheet, both in the GM's chat.
  await seat.click('[data-roll-check="strength"]');
  await chat(page, "[CHECK] Strength");
  await seat.click('[data-roll-save="paralyzation"]');
  await chat(page, "[SAVE] Paralyzation");

  // The GM's ogre and lion; initiative lowest first; the player's attack from the sheet.
  const ogreRecord = npcs.find((item) => item.name === "Ogre");
  const lionRecord = npcs.find((item) => item.name === "Mountain Lion");
  await tool("kraken_combat", { action: "add", recordId: ogreRecord.id });
  await tool("kraken_combat", { action: "add", recordId: lionRecord.id });
  await tool("kraken_combat", { action: "add", recordId: row.id });
  await tool("kraken_dice_force", { values: [7, 5, 3] });
  await tool("kraken_combat", { action: "init", which: "all" });
  const view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.map((entry) => entry.name).join(",") === "Brannoc,Mountain Lion,Ogre", `lowest first: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
  const mine = view.find((entry) => entry.recordId === row.id);
  const ogre = view.find((entry) => entry.name === "Ogre");
  const lion = view.find((entry) => entry.name === "Mountain Lion");
  assert(ogre.hp === 25 && ogre.ac === 4, "the ogre on the tracker: 25 HP, AC 4");
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: ogre.id, on: true });
  await tool("kraken_dice_force", { values: [14] });
  await seat.click('[data-sheet-tab="combat"]');
  await seat.waitForSelector('.sheet-2e [data-attack] [data-action="attack"]');
  const swordRow = '.sheet-2e [data-attack]:has(b:text-is("Long sword"))';
  assert((await seat.textContent(`${swordRow} [data-action="damage"]`))?.includes("1d8+4 / 1d12+4"), "the long sword's damage, S/M and L, on the sheet");
  await seat.click(`${swordRow} [data-action="attack"]`);
  await chat(page, "[HIT 16 vs 16]");
  await tool("kraken_dice_force", { values: [6] });
  await seat.click(`${swordRow} [data-action="damage"]`);
  const hurt = await until(async () => {
    const entry = (await tool("kraken_combat", { action: "view" })).entries.find((item) => item.id === ogre.id);
    return entry.wounds > 0 ? entry : null;
  }, "the ogre's wounds");
  assert(hurt.wounds === 10, `the Large damage: 6 + 4 = 10: ${JSON.stringify(hurt)}`);

  // A natural 20 with the book's Krits & Fumbles tables: Critical Hit 5, the sword's slashing table: +1d4.
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: ogre.id, on: true });
  await tool("kraken_dice_force", { values: [20, 5, 2] });
  await seat.click('[data-sheet-tab="combat"]');
  await seat.click(`${swordRow} [data-action="attack"]`);
  await chat(page, "Critical Hit - Slashing d1 = 1: Test gash");
  const gashed = await until(async () => {
    const entry = (await tool("kraken_combat", { action: "view" })).entries.find((item) => item.id === ogre.id);
    return entry.wounds > 10 ? entry : null;
  }, "the krit's damage");
  assert(gashed.wounds === 12, `the krit's 1d4 (2) on the ogre: ${gashed.wounds}`);

  // The GM: the tracker's lion, its All attacks button (claw, claw, bite at the fighter).
  await tool("kraken_combat", { action: "target", id: lion.id, targetId: mine.id, on: true });
  await page.click('.sidebar [data-launch="combat"]');
  await page.waitForSelector('[data-full-attack="all"]');
  await tool("kraken_dice_force", { values: [15, 3, 20] });
  await page.click('[data-full-attack="all"]');
  await chat(page, "Bite #3");
  assert(await page.evaluate(() => document.body.textContent.includes("AUTOMATIC HIT")), "the bite's natural 20 hits");
  // The book's pregen, taken as a second character.
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="adnd2e"]');
  await seat.selectOption('[aria-label="Pregenerated character"]', { label: "Sister Mara (Human Cleric 2)" });
  await seat.click('[data-action="wizard-finish"]');
  await until(async () => listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Sister Mara"), "the pregen taken");
  const mara = await tool("kraken_record_get", { id: listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Sister Mara").id });
  assert(mara.owner === "A test player" && mara.data.ac.total === 4 && mara.data.hp.total === 14 && mara.data.spellcasting[0].perday[0] === 4, `the pregen as the book made it: ${JSON.stringify({ owner: mara.owner, ac: mara.data.ac.total, hp: mara.data.hp })}`);

  // Turning undead: Sister Mara (a 2nd-level cleric) on the tracker with a skeleton; the player's Turn undead button.
  const skeletonRecord = npcs.find((item) => item.name === "Skeleton");
  await tool("kraken_combat", { action: "add", recordId: mara.id });
  await tool("kraken_combat", { action: "add", recordId: skeletonRecord.id });
  await tool("kraken_dice_force", { values: [1, 9] });
  await tool("kraken_combat", { action: "init", which: "npcs" });
  const maraEntry = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.recordId === mara.id);
  await tool("kraken_combat", { action: "update", id: maraEntry.id, patch: { initresult: 0 } });
  await tool("kraken_combat", { action: "next" });
  await until(async () => (await tool("kraken_combat", { action: "view" })).active === maraEntry.id || (await tool("kraken_combat", { action: "next" }), false), "Sister Mara's turn");
  await seat.click('.sidebar [data-launch="combat"]');
  await seat.waitForSelector('[data-action="turn-undead"]', { timeout: 10000 });
  await tool("kraken_dice_force", { values: [15, 1, 2, 2, 2, 2] });
  await seat.click('[data-action="turn-undead"]');
  await chat(page, "Skeleton (Skeleton): TURNED for 6 rounds");
  const skeletonEntry = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.name === "Skeleton");
  assert(skeletonEntry.effects.some((effect) => effect.label === "Turned (flees the turner)"), `the skeleton turned: ${JSON.stringify(skeletonEntry.effects)}`);

  await seat.screenshot({ path: path.join(tmpdir(), "kraken-adnd2e-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-adnd2e-gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok adnd2e ui: an AD&D 2E campaign's shelf holds its 2E book, made active (creatures, a pregen); a test player makes Brannoc with the 2E wizard (18/76, THAC0 20, AC 2, 12 HP, Paralyzation 14), rolls a Strength check and a save from the sheet, takes the book's pregen; initiative lowest first; the sheet's attack hits the ogre (16 vs 16), Large damage 10; the lion's All attacks rolls claw, claw, bite; a natural 20 rolls the book's Critical Hit tables (+1d4); Sister Mara's Turn undead turns a skeleton. ${path.join(tmpdir(), "kraken-adnd2e-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
