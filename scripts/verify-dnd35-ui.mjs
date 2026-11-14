// D&D 3.5E in the real app: a campaign made as D&D 3.5E picked on the
// campaign screen, a 3.5E book (made up, in the shapes of the GM's 3.5E
// Player's Handbook and Monster Manual) on its shelf and made active, its
// classes, races, feats and gear in the campaign; a test player in Chrome
// makes a dwarf fighter with the 3.5E wizard (the GM's KrakenCharWizard35E:
// every page, the GM's methods and low reroll, host-rolled scores swapped,
// languages, alignment, skills, feats with a prerequisite and a target, gold
// rolled by the host spent in the fighter's storefront) and opens the 3.5E sheet (AC 17, touch,
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
  assert(classes.length === 2 && listOf(await tool("kraken_records_list", { type: "race" })).length === 2 && listOf(await tool("kraken_records_list", { type: "item" })).length === 7 && listOf(await tool("kraken_records_list", { type: "feat" })).length === 4, "the book's classes, races, gear and feats (kept under <reference>) are records in the campaign");

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The GM's options for the wizard (Settings): 4d6 or the standard array; the low reroll house rule.
  await tool("kraken_table_options", { wizard35: { methods: [1, 3], lowReroll: true } });

  // The 3.5E wizard, every page, as the GM's FG extension: a dwarf fighter.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="dnd35"]');
  const tabs = await seat.$$eval("[data-wizard-tab]", (nodes) => nodes.map((node) => node.getAttribute("data-wizard-tab")));
  assert(tabs.join(",") === "basics,race,class,languages,alignment,skills,feats,equipment,spells,details,commit", `the extension's pages: ${tabs}`);
  const methods = await seat.$$eval('[aria-label="Ability method"] option', (nodes) => nodes.map((node) => node.textContent));
  assert(methods.length === 2 && /4d6 drop lowest/.test(methods[0]) && /15, 14, 13/.test(methods[1]), `only the methods the GM allows: ${methods}`);
  // Abilities: 4d6 drop lowest, rolled by the host; Strength 7 rerolled (3d6, it stands), then swapped with Charisma.
  await tool("kraken_dice_force", { values: [3, 2, 2, 1, 5, 4, 4, 1, 5, 5, 4, 1, 4, 3, 3, 1, 4, 4, 4, 1, 5, 5, 5, 1] });
  await seat.click('[data-action="roll-abilities"]');
  await chat(page, "[ABILITY SCORE GENERATION] Charisma (PHB Default)");
  await seat.waitForFunction(() => document.querySelector('[data-stat="charisma"]')?.textContent === "15");
  await seat.waitForSelector('[data-action="reroll-low"][data-stat="strength"]');
  await tool("kraken_dice_force", { values: [3, 3, 2] });
  await seat.click('[data-action="reroll-low"][data-stat="strength"]');
  await chat(page, "[HOUSE RULE ABILITY REROLL] Strength");
  await seat.waitForFunction(() => document.querySelector('[data-stat="strength"]')?.textContent === "8");
  assert((await seat.$('[data-action="reroll-low"]')) === null, "the reroll is used: it stands");
  await seat.click('[data-stat="strength"]');
  await seat.click('[data-stat="charisma"]');
  await seat.waitForFunction(() => document.querySelector('[data-stat="strength"]')?.textContent === "15" && document.querySelector('[data-stat="charisma"]')?.textContent === "8");
  // Race and class.
  await seat.click('[data-wizard-tab="race"]');
  await seat.click('[data-race="Dwarf"]');
  await seat.waitForSelector('[data-action="change-race"]');
  await seat.click('[data-wizard-tab="basics"]');
  assert((await seat.textContent('[data-final="constitution"]'))?.trim() === "16 (+3)" && (await seat.textContent('[data-final="charisma"]'))?.trim() === "6 (-2)", "the dwarf's +2 Constitution, -2 Charisma in the totals");
  await seat.click('[data-wizard-tab="class"]');
  await seat.click('[data-class="Fighter"]');
  await seat.waitForSelector("[data-class-plan]");
  assert((await seat.textContent("[data-class-plan]"))?.trim() === "Fighter 1", "Fighter 1");
  // Languages: a dwarf with Intelligence 10 has no bonus languages to choose.
  await seat.click('[data-wizard-tab="languages"]');
  assert((await seat.textContent("[data-languages-known]"))?.includes("Common, Dwarven") && (await seat.getAttribute('[data-wizard-tab="languages"] [data-tab-done]', "data-tab-done")) === "yes", "Common and Dwarven known; nothing to choose");
  // Alignment: a fighter may be any.
  await seat.click('[data-wizard-tab="alignment"]');
  assert((await seat.$$("[data-alignment]")).length === 9, "a fighter may take any alignment");
  await seat.click('[data-alignment="Lawful Good"]');
  // Skills: (2 + 0) x 4 = 8 points; Climb and Jump to 4 ranks, no more.
  await seat.click('[data-wizard-tab="skills"]');
  for (const skill of ["Climb", "Jump"]) for (let i = 0; i < 4; i++) await seat.getByRole("button", { name: `Raise ${skill}`, exact: true }).click();
  await seat.getByRole("button", { name: "Raise Swim", exact: true }).click();
  assert((await seat.textContent("[data-skill-points]"))?.includes("Spent 8 / 8"), `every skill point spent, and no more: ${await seat.textContent("[data-skill-points]")}`);
  // Feats: two (one, and the fighter's bonus feat); Combat Expertise needs Int 13; Weapon Focus asks for its weapon.
  await seat.click('[data-wizard-tab="feats"]');
  assert((await seat.textContent('.ccw-pick:has([data-feat="Combat Expertise"])'))?.includes("Needs Int 13"), "a feat whose prerequisites are not met says what it needs");
  await seat.click('[data-feat="Power Attack"]');
  await seat.click('[data-feat="Weapon Focus"]');
  await seat.getByRole("button", { name: "Choose Weapon Focus (longsword)", exact: true }).click();
  assert((await seat.textContent("[data-feat-count]"))?.includes("Selected 2 / 2"), `two feats: ${await seat.textContent("[data-feat-count]")}`);
  // Gear: the fighter's 6d4 x 10 gold, rolled by the host; the fighter's storefront; leftover coins to the sheet.
  await seat.click('[data-wizard-tab="equipment"]');
  assert((await seat.getByRole("button", { name: "Buy Quarterstaff", exact: true }).count()) === 0, "the shop sells a fighter only a fighter's starting gear");
  await tool("kraken_dice_force", { values: [4, 4, 4, 4, 4, 4] });
  await seat.click('[data-action="roll-gold"]');
  await chat(page, "[STARTING GOLD] Fighter (6d4*10)");
  await seat.waitForSelector('[data-coin-left="24000"]');
  for (const item of ["Longsword", "Scale mail", "Shield, heavy steel", "Backpack"]) await seat.getByRole("button", { name: `Buy ${item}`, exact: true }).click();
  await seat.waitForSelector('[data-coin-left="15300"]');
  // Spells: a fighter casts none.
  await seat.click('[data-wizard-tab="spells"]');
  assert((await seat.textContent(".ccw-page"))?.includes("No Spell Records Required"), "no spells for a fighter");
  await seat.click('[data-wizard-tab="details"]');
  await seat.fill('[aria-label="Character name"]', "Tordek");
  await seat.fill('[aria-label="gender"]', "Male");
  await seat.click('[data-wizard-tab="commit"]');
  await seat.waitForSelector("[data-warnings-none]");
  const badges = await seat.$$eval("[data-tab-done]", (nodes) => nodes.map((node) => node.getAttribute("data-tab-done")));
  assert(badges.every((value) => value === "yes"), `every tab ticked: ${badges}`);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-dnd35-wizard.png") });
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-35 [data-stat="ac"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Tordek");
  const hero = await tool("kraken_record_get", { id: row.id });
  const coins = Object.fromEntries(Object.values(hero.data.coins).map((coin) => [coin.name, coin.amount]));
  assert(coins.gp === 153 && coins.sp === 0 && hero.data.feats.includes("Weapon Focus (longsword)") && hero.data.feats.includes("Power Attack") && hero.data.skills.climb.ranks === 4 && hero.data.alignment === "Lawful Good" && hero.data.gender === "Male" && hero.data.languages === "Common, Dwarven", `the wizard's choices on the sheet (153 gp left, its feats, skills, alignment): ${JSON.stringify({ coins, feats: hero.data.feats })}`);
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
  console.log(`ok dnd35 ui: a D&D 3.5E campaign's shelf holds its 3.5E book, made active (classes, races, feats, gear as records); a test player makes Tordek with the 3.5E wizard's eleven pages (scores rolled by the host, the low reroll, swapped; Fighter 1, Lawful Good, Climb and Jump, Power Attack and Weapon Focus (longsword), 240 gp rolled and spent, 153 gp left; 13 HP, AC 17 / touch 11 / flat-footed 16, BAB +1, Fortitude +5), rolls Climb and Fortitude from the sheet, confirms a critical on the ogre from the sheet (15 damage); the troll's Full attack rolls both claws. ${path.join(tmpdir(), "kraken-dnd35-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
