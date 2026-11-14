// D&D 5E in the real app (the second ruleset): a campaign made as D&D 5E,
// its books (the SRD 5.2.1's player book and creatures: Kraken's own SRD
// 5.2.1 books, shipped; with KRAKEN_DND5E_FG=1, FG's 5E modules instead)
// made active; a test player in Chrome makes a character with the 5E wizard,
// opens the 5E sheet and rolls a skill and a save from it; the GM puts a
// goblin on the tracker; the player targets it and attacks and rolls damage
// from the sheet; the goblin's hit points go down on the tracker. Played with
// only the books Kraken ships (KRAKEN_BOOKS and KRAKEN_PACKS empty) unless FG's are asked for.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const require = createRequire(import.meta.url);
const { listModules } = require("../electron/importers/fgModule.cjs");
const FG = process.env.KRAKEN_DND5E_FG === "1";
if (FG && !listModules().some((item) => (item.name ?? item) === "DNDSRD521PLAYER")) {
  console.log("skip dnd5e ui: no SRD 5.2.1 FG modules");
  process.exit(0);
}
const [PLAYER_BOOK, CREATURE_BOOK] = FG ? [/DNDSRD521PLAYER/i, /DNDSRD521BESTIARY/i] : [/SRD 5\.2\.1 Player's Rules/i, /SRD 5\.2\.1 Creatures/i];

const profile = mkdtempSync(path.join(tmpdir(), "kraken-dnd5e-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", ...(FG ? {} : { KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") }) };
if (!FG) for (const dir of [env.KRAKEN_BOOKS, env.KRAKEN_PACKS]) mkdirSync(dir, { recursive: true });
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
  const player = list.find((book) => PLAYER_BOOK.test(label(book)));
  const bestiary = list.find((book) => CREATURE_BOOK.test(label(book)));
  assert(player && bestiary, `the SRD books are on a 5E campaign's shelf: ${list.map(label).join(" | ").slice(0, 400)}`);
  assert(!list.some((book) => /Castles|SiegeCore|C&C/i.test(label(book))), "no C&C book on a 5E shelf");
  await tool("kraken_books", { action: "activate", book: player.id });
  await tool("kraken_books", { action: "activate", book: bestiary.id });
  assert(listOf(await tool("kraken_records_list", { type: "class" })).length === 12, "the twelve SRD classes are in the campaign");

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The 5E wizard, tab by tab as FG's: it opens on Class.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="dnd5e"][data-page="class"]');
  const wizard = '[data-wizard="dnd5e"]';
  const badge = (tab) => seat.getAttribute(`${wizard} [data-wizard-tab="${tab}"] [data-alert]`, "data-alert");
  for (const tab of ["species", "class", "abilities", "background"]) assert((await badge(tab)) === "todo", `${tab} starts with its alert`);
  const choose = async (id, label) => {
    await seat.selectOption(`${wizard} select[data-decision="${id}"]`, label ? { label } : { index: 1 });
  };
  // Class: the Fighter, its two skills, its Fighting Style feat.
  await seat.click(`${wizard} [data-class="Fighter"]`);
  await choose("class:proficiencies:skill:0", "Perception");
  await choose("class:proficiencies:skill:1", "Survival");
  assert(!(await seat.$$eval(`${wizard} select[data-decision="class:proficiencies:skill:1"] option`, (options) => options.map((o) => o.textContent))).includes("Perception"), "a skill taken is gone from the other choice");
  await choose("class:fightingstyle:1:feat", "Defense");
  assert((await badge("class")) === "done" && (await badge("equipment")) === "todo", "the class is done; its kit is to choose");
  // Species: a dwarf, Common and two languages.
  await seat.click(`${wizard} [data-wizard-tab="species"]`);
  await seat.click(`${wizard} [data-species="Dwarf"]`);
  await choose("species:language:0", "Elvish");
  await choose("species:language:1", "Dwarvish");
  assert((await badge("species")) === "done", "the species is done");
  // Abilities: the standard array's swap, point buy's points, then 4d6 drop the lowest rolled by the host.
  await seat.click(`${wizard} [data-wizard-tab="abilities"]`);
  await seat.selectOption(`${wizard} select[aria-label="Ability method"]`, "Standard Array");
  await seat.click(`${wizard} [data-swap="strength:right"]`);
  assert((await seat.textContent(`${wizard} b[data-base="strength"]`)) === "14" && (await seat.textContent(`${wizard} b[data-base="dexterity"]`)) === "15", "the array's arrows swap Strength and Dexterity");
  await seat.selectOption(`${wizard} select[aria-label="Ability method"]`, "Point Buy");
  for (let step = 0; step < 7; step++) await seat.click(`${wizard} [data-point="strength:up"]`);
  assert((await seat.textContent(`${wizard} [data-points-used]`)) === "9" && (await seat.isDisabled(`${wizard} [data-point="strength:up"]`)), "point buy: 15 costs 9, no higher");
  assert((await badge("abilities")) === "todo", "point buy waits for all 27 points");
  await seat.selectOption(`${wizard} select[aria-label="Ability method"]`, "Dice Roll");
  // 15, 12, 13, 8, 13, 10 after dropping each lowest die.
  await tool("kraken_dice_force", { values: [5, 5, 5, 1, 4, 4, 4, 1, 5, 4, 4, 1, 3, 3, 2, 1, 5, 4, 4, 1, 4, 3, 3, 1] });
  await seat.click(`${wizard} [data-action="roll-abilities"]`);
  await seat.waitForFunction(() => document.querySelector('[data-wizard="dnd5e"] input[data-base="charisma"]')?.value === "10", null, { timeout: 20000 });
  await page.waitForFunction(() => document.body.textContent.includes("[ABILITY SCORE GENERATION] Charisma"), null, { timeout: 10000 });
  assert((await seat.inputValue(`${wizard} input[data-base="strength"]`)) === "15" && (await seat.inputValue(`${wizard} input[data-base="intelligence"]`)) === "8", "the host's 4d6 drop the lowest in the Base column");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-dnd5e-wizard-abilities.png") });
  // Background: the Soldier, +2 Constitution and +1 Strength, a gaming set.
  await seat.click(`${wizard} [data-wizard-tab="background"]`);
  await seat.click(`${wizard} [data-background="Soldier"]`);
  await choose("background:asioption", "Option 1: One +2, One +1");
  await choose("background:asi:0", "Constitution");
  await choose("background:asi:1", "Strength");
  if (await seat.$(`${wizard} select[data-decision="background:toolprof:0"] option:nth-child(2)`)) await choose("background:toolprof:0");
  await seat.click(`${wizard} [data-wizard-tab="abilities"]`);
  assert((await seat.textContent(`${wizard} [data-total="strength"]`)).startsWith("16") && (await seat.textContent(`${wizard} [data-total="constitution"]`)).startsWith("15"), "the background's increases in the totals");
  // Equipment: the class's kit A and the background's kit A (their coin), a rope added.
  await seat.click(`${wizard} [data-wizard-tab="equipment"]`);
  await seat.click(`${wizard} [data-kit="class:A"]`);
  await seat.click(`${wizard} [data-kit="background:A"]`);
  await seat.fill(`${wizard} input[aria-label="Item name filter"]`, "Rope");
  await seat.click(`${wizard} [data-add-item="Rope"]`);
  assert((await seat.textContent(`${wizard} [data-total-coin="GP"] b`)) === "18", "4 GP (class kit A) + 14 GP (background kit A)");
  assert((await badge("equipment")) === "done" && (await badge("background")) === "done", "equipment and background done");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-dnd5e-wizard-equipment.png") });
  // Commit: no warnings left, the name, Save.
  await seat.click(`${wizard} [data-wizard-tab="commit"]`);
  assert(!(await seat.$(`${wizard} [data-warnings]`)), `no warnings: ${await seat.textContent(`${wizard} [data-warnings]`).catch(() => "")}`);
  await seat.fill(`${wizard} [aria-label="Character name"]`, "Brundar");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-dnd5e-wizard-commit.png") });
  await seat.click(`${wizard} [data-action="wizard-finish"]`);
  await seat.waitForSelector('.sheet-5e [data-stat="ac"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Brundar");
  const hero = await tool("kraken_record_get", { id: row.id });
  const carried = Object.values(hero.data.inventorylist).map((item) => item.name);
  const gp = Object.values(hero.data.coins).find((item) => item.name === "GP")?.amount;
  assert(hero.owner === "A test player" && hero.data.ruleset === "dnd5e" && hero.data.hp.total === 13 && hero.data.ac.total === 16, `the wizard built Brundar (13 HP; chain mail AC 16): ${JSON.stringify({ owner: hero.owner, hp: hero.data.hp, ac: hero.data.ac })}`);
  assert(["Chain Mail", "Greatsword", "Spear", "Rope"].every((item) => carried.includes(item)) && gp === 18, `kits and coin on the sheet: ${JSON.stringify({ carried, coins: hero.data.coins })}`);
  assert(hero.data.abilities.strength.score === 16 && hero.data.abilities.constitution.score === 15 && hero.data.skills.perception.prof === 1 && hero.data.skills.athletics.prof === 1 && hero.data.feats.includes("Savage Attacker") && hero.data.feats.includes("Defense") && hero.data.languages.join() === "Common,Elvish,Dwarvish", `scores, skills, feats, languages: ${JSON.stringify({ feats: hero.data.feats, languages: hero.data.languages })}`);
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
  console.log(`ok dnd5e ui: a D&D 5E campaign's shelf holds the SRD books (no C&C); a test player makes Brundar tab by tab in the 5E wizard (Class, Species, Abilities rolled 4d6 drop lowest by the host, Background +2/+1, kits A and 18 GP; 13 HP, AC 16), rolls Athletics and a Constitution save from the sheet, and hits a goblin warrior with the ${weapon} from the sheet's Combat tab (${hurt.wounds} damage). ${path.join(tmpdir(), "kraken-dnd5e-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
