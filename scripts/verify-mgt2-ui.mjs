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
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The wizard: Ilsa, a Scout of two terms, UPP 7A8B96.
  await seat.click('.sidebar [data-launch="characters"]');
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="mgt2"]');
  await seat.fill('[aria-label="Character name"]', "Ilsa Varn");
  await seat.fill('[aria-label="Homeworld"]', "Regina");
  await seat.selectOption('[aria-label="Career"]', "Scout");
  await seat.fill('[aria-label="Terms"]', "2");
  assert((await seat.textContent("[data-age]"))?.includes("Age 26"), "two terms: age 26");
  for (const [stat, value] of Object.entries({ str: 7, dex: 10, end: 8, int: 11, edu: 9, soc: 6 })) await seat.fill(`[aria-label="${stat} score"]`, String(value));
  for (const skill of ["pilot-smallcraft", "guncombat-slug", "vaccsuit"]) {
    await seat.selectOption('[aria-label="Add a skill"]', skill);
    await seat.click('[data-action="mgt2-add-skill"]');
  }
  await seat.fill('[aria-label="Pilot (Small Craft) level"]', "2");
  await seat.check('[data-mgt2-gear="Autopistol"]');
  await seat.check('[data-mgt2-gear="Cloth"]');
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-mgt2 [data-stat="upp"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Ilsa Varn");
  const ilsa = await tool("kraken_record_get", { id: row.id });
  assert(ilsa.owner === "A test player" && ilsa.data.upp === "7A8B96" && ilsa.data.age === 26 && ilsa.data.skills["pilot-smallcraft"].level === 2 && ilsa.data.skills["guncombat-slug"].level === 1 && ilsa.data.ac.total === 5, `the wizard built Ilsa: ${JSON.stringify({ owner: ilsa.owner, upp: ilsa.data.upp, age: ilsa.data.age, skills: ilsa.data.skills, ac: ilsa.data.ac })}`);
  assert(/Frontier Scout/.test(String(ilsa.data.portrait ?? "")), `a Scout from the Frontier: Kraken's science fiction portrait: ${ilsa.data.portrait}`);
  assert((await seat.textContent('.sheet-mgt2 [data-stat="upp"]'))?.trim() === "7A8B96" && (await seat.textContent('.sheet-mgt2 [data-stat="careers"]'))?.includes("Scout 2"), "the sheet: the UPP and the career");

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
  console.log(`ok mgt2 ui: a campaign switched to Traveller; a test player makes Ilsa Varn in the wizard (UPP 7A8B96, a Scout of 2 terms, age 26, Pilot (Small Craft) 2, Cloth 5), rolls a Difficult task and an INT check with a Boon from the sheet; the autopistol hits the GM's pirate (11, Effect +3) for 6 + 3 - Mesh 2 = 7, its Endurance gone (an END check from the tracker at DM -3). ${path.join(tmpdir(), "kraken-mgt2-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
