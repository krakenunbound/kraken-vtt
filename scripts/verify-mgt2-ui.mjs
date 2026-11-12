// Traveller in the real app: a campaign made as Worldbuilding switched to
// Traveller on the campaign screen; a test player in Chrome makes a Traveller
// with the wizard (characteristics, a Scout's terms, skills with
// specialities, Kraken's kit), sees the UPP and age on the sheet, rolls a
// Difficult task from it; the GM's pirate on the tracker; the player's
// autopistol hits it (2d6 + skill + DM against 8, the Effect on the damage,
// less its armour), and the pirate's damage comes off Endurance first.
// Screenshots go to the temp folder.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-mgt2-ui-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "Traveller UI", ruleset: "Worldbuilding" });
  await page.reload();
  await page.waitForSelector("text=My Campaigns");
  if (!(await page.$('select[aria-label="Ruleset"]'))) await page.click("text=My Campaigns");
  await page.click("text=Traveller UI");
  await page.selectOption('select[aria-label="Ruleset"]', "Traveller");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Ruleset"]')?.value === "Traveller");
  const port = 47416;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message} ${error.stack}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The Traveller wizard (the GM's KrakenCharWizardMGT2 run on the host): every page, every roll the table's.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="mgt2"]');
  await seat.fill('[aria-label="Character name"]', "Mira Sol");
  await seat.click('[data-action="life-start"]');
  await seat.click('[data-action="tc-roll"]');
  await seat.waitForFunction(() => [...document.querySelectorAll("[data-tc-stat] b")].every((b) => /\d/.test(b.textContent ?? "")));
  // Swap two scores.
  const before = await seat.$$eval("[data-tc-stat] b", (list) => list.map((b) => b.textContent));
  await seat.click('[data-tc-stat="str"]');
  await seat.click('[data-tc-stat="soc"]');
  await seat.waitForFunction((first) => document.querySelector('[data-tc-stat="soc"] b')?.textContent === first, before[0]);
  await seat.click('[data-wizard-tab="species"]');
  await seat.locator("label:has([data-tc-species])").first().click();
  await seat.waitForFunction(() => document.querySelector("[data-tc-species]")?.checked);
  await seat.click('[data-wizard-tab="background"]');
  for (let i = 0; i < 8; i++) {
    const free = seat.locator("[data-tc-bg]:not(:checked):not(:disabled)");
    if (!(await free.count())) break;
    const skill = await free.first().getAttribute("data-tc-bg");
    await seat.locator(`label:has([data-tc-bg="${skill}"])`).click();
    await seat.waitForFunction((name) => document.querySelector(`[data-tc-bg="${name}"]`)?.checked, skill, { timeout: 5000 });
  }
  await seat.fill('[aria-label="Homeworld"]', "Regina");
  await seat.click('[data-wizard-tab="careers"]');
  await seat.waitForSelector("[data-life-task]", { timeout: 8000 }).catch(async (error) => {

    throw error;
  });
  // The terms, until the careers are done (staying until 30).
  for (let guard = 0; guard < 400; guard++) {
    if ((await seat.getAttribute("[data-wizard]", "data-life-done")) === "yes") break;
    const age = Number(await seat.getAttribute("[data-wizard]", "data-life-age"));
    const options = await seat.$$eval("[data-tc-option]:not(:disabled)", (list) => list.map((button) => ({ n: button.getAttribute("data-tc-option"), label: button.getAttribute("data-life-choice") })));
    if (!options.length) {
      await seat.waitForTimeout(200);
      continue;
    }
    const finish = options.find((option) => /finish|stop/i.test(option.label ?? ""));
    const rest = options.filter((option) => option !== finish);
    const pick = finish && (age >= 30 || !rest.length) ? finish : rest[Math.floor(Math.random() * rest.length)];
    await seat.click(`[data-tc-option="${pick.n}"]`);
    await seat.waitForTimeout(120);
  }
  assert((await seat.getAttribute("[data-wizard]", "data-life-done")) === "yes", "the careers played to mustering out");
  const age = Number(await seat.getAttribute("[data-wizard]", "data-life-age"));
  assert(age >= 26, `several terms: age ${age}`);
  await seat.click('[data-wizard-tab="benefits"]');
  for (const select of await seat.$$("[data-tc-benefit]")) {
    const value = await select.$$eval("option", (list) => list.map((option) => option.value).find(Boolean));
    if (value) await select.selectOption(value);
  }
  await seat.click('[data-wizard-tab="skills"]');
  await seat.fill('[aria-label="Connection 1 skill"]', "Streetwise");
  await seat.click('[data-tc-connection="1"] button');
  await seat.click('[data-wizard-tab="finish"]');
  await seat.fill('[aria-label="Traveller name"]', "Mira Sol");
  await seat.fill('[aria-label="Gender"]', "Female");
  const cash = Number(await seat.getAttribute("[data-coin-left]", "data-coin-left"));
  if (cash >= 25) await seat.click('[aria-label="Buy Backpack"]');
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-mgt2-lifepath.png") });
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-mgt2 [data-stat="upp"]', { timeout: 15000 });
  const miraRow = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Mira Sol");
  const mira = await tool("kraken_record_get", { id: miraRow.id });
  assert(mira.owner === "A test player" && mira.data.age === age && /CREATION LOG/.test(mira.data.notes) && mira.data.careers.length >= 1 && mira.data.gender === "Female", `the wizard built Mira: ${JSON.stringify({ owner: mira.owner, upp: mira.data.upp, age: mira.data.age, careers: mira.data.careers })}`);
  if (cash >= 25) assert(Object.values(mira.data.inventorylist).some((item) => item.name === "Backpack"), "the backpack bought");
  assert((await seat.textContent('.sheet-mgt2 [data-stat="upp"]'))?.trim() === mira.data.upp, "the sheet shows the UPP");

  // Ilsa Varn (the agent's build) for the rest: her sheet from the list.
  const built = await tool("kraken_build_character", { owner: "A test player", spec: { name: "Ilsa Varn", homeworld: "Regina", characteristics: { str: 7, dex: 10, end: 8, int: 11, edu: 9, soc: 6 }, career: "Scout", terms: 2, skills: { "Pilot (Small Craft)": 2, "Gun Combat (Slug)": 1, "Vacc Suit": 0 }, gear: ["Autopistol", "Cloth"] } });
  const row = { id: built.id };
  await seat.waitForFunction((id) => [...document.querySelectorAll('select[aria-label="Character"] option')].some((option) => option.value === id), built.id);
  await seat.selectOption('select[aria-label="Character"]', built.id);
  await seat.waitForFunction(() => document.querySelector('.sheet-mgt2 [data-stat="upp"]')?.textContent.trim() === "7A8B96");
  // A Difficult Pilot (Small Craft) task from the sheet: 2 + DEX 1 = +3; 4 + 3 = 7 against 10.
  await seat.selectOption('[aria-label="Difficulty"]', "10");
  await seat.click('[data-sheet-tab="skills"]');
  await tool("kraken_dice_force", { values: [2, 2] });
  await seat.click('[data-roll-skill="pilot-smallcraft"]');
  await chat(page, "[DIFFICULT 10+] [FAILURE 7 vs 10, Effect -3]");
  // A characteristic alone, with a Boon (the best two of 3d6).
  await seat.click('[data-sheet-tab="main"]');
  await seat.selectOption('[aria-label="Boon or bane"]', "boon");
  await seat.selectOption('[aria-label="Difficulty"]', "8");
  await tool("kraken_dice_force", { values: [1, 6, 5] });
  await seat.click('[data-roll-check="int"]');
  await chat(page, "[BOON] [SUCCESS 12 vs 8, Effect +4]");
  await seat.selectOption('[aria-label="Boon or bane"]', "");

  // The GM's pirate; the player's autopistol (Gun Combat (Slug) 1 + DEX 1 = +2): 9 + 2 = 11, Effect +3; 3D-3 = 9 - 3 = 6 + 3 - Mesh 2 = 7.
  const pirate = await tool("kraken_record_create", { type: "npc", name: "Pirate", data: { characteristics: { str: { score: 8 }, dex: { score: 9 }, end: { score: 7 }, int: { score: 6 }, edu: { score: 5 }, soc: { score: 4 } }, skills: "Gun Combat (Slug) 1", weapons: { a: { name: "Rifle", damage: "3D", skill: "Gun Combat (Slug)" } }, armour: 2 } });
  const pirateId = pirate.id ?? pirate.record?.id;
  await tool("kraken_combat", { action: "add", recordId: pirateId });
  await tool("kraken_combat", { action: "add", recordId: row.id });
  await tool("kraken_dice_force", { values: [3, 3, 5, 5] });
  await tool("kraken_combat", { action: "init", which: "all" });
  const view = (await tool("kraken_combat", { action: "view" })).entries;
  const mine = view.find((entry) => entry.recordId === row.id);
  const foe = view.find((entry) => entry.name === "Pirate");
  assert(foe.hp === 24 && foe.ac === 2, `the pirate: 24, Mesh 2: ${JSON.stringify(foe)}`);
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: foe.id, on: true });
  await seat.click('[data-sheet-tab="combat"]');
  const pistolRow = '.sheet-mgt2 [data-attack]:has(b:text-is("Autopistol"))';
  await seat.waitForSelector(`${pistolRow} [data-action="attack"]`);
  assert((await seat.textContent(`${pistolRow} [data-action="attack"]`))?.trim() === "+2" && (await seat.textContent(`${pistolRow} [data-action="damage"]`))?.trim() === "3d6-3", "the autopistol on the sheet: +2, 3d6-3");
  await tool("kraken_dice_force", { values: [4, 5] });
  await seat.click(`${pistolRow} [data-action="attack"]`);
  await chat(page, "[HIT 11 vs 8, Effect +3]");
  await tool("kraken_dice_force", { values: [2, 3, 4] });
  await seat.click(`${pistolRow} [data-action="damage"]`);
  const hurt = await until(async () => {
    const entry = (await tool("kraken_combat", { action: "view" })).entries.find((item) => item.id === foe.id);
    return entry.wounds > 0 ? entry : null;
  }, "the pirate's wounds");
  assert(hurt.wounds === 7, `6 + Effect 3 - Mesh 2 = 7: ${JSON.stringify(hurt)}`);
  // The tracker's characteristic checks for Traveller (the GM's).
  await page.click('.sidebar [data-launch="combat"]');
  await page.waitForSelector(".combat-tracker");
  // The pirate's own END check, from its panel on the tracker: its Endurance 7 is 0 after 7 damage, DM -3 (3 + 4 - 3 + 1 = 5).
  await page.click(`.combat-tracker [data-ct="${foe.id}"] [aria-expanded]`);
  await page.waitForSelector('select[aria-label="Save"]');
  assert(await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Save"] option')].some((option) => option.textContent === "END check")), "the tracker offers END checks");
  await page.selectOption('select[aria-label="Save"]', "end");
  await page.fill('[aria-label="Check DM"]', "1");
  await tool("kraken_dice_force", { values: [3, 4] });
  await page.click("text=Roll check");
  await chat(page, "[CHECK] Endurance [FAILURE 5 vs 8]");

  await seat.click('[data-sheet-tab="main"]');
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-mgt2-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-mgt2-gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok mgt2 ui: a campaign switched to Traveller; a test player makes Mira Sol in the GM's Traveller wizard (characteristics rolled and swapped, species, background, careers to mustering out, benefits, a Connection, a backpack bought); with Ilsa Varn the sheet rolls a Difficult task and an INT check with a Boon from the sheet; the autopistol hits the GM's pirate (11, Effect +3) for 6 + 3 - Mesh 2 = 7, its Endurance gone (an END check from the tracker at DM -3). ${path.join(tmpdir(), "kraken-mgt2-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
