// Every control of the core wizard, pressed once on Cairn's wizard, in the
// real app (docs/core-ui-design.md 7.8): Cancel; a background chosen by hand,
// a name from its list, its tables rolled, then another background (which
// clears the tables and the name); the d20 background; a name chosen and one
// typed; STR, DEX and WIL with a swap; HP; the traits, a Bond, the age; the
// youngest's Omen (the heading grows); the gold; the Marketplace's search,
// Buy and Return; Finish greyed until every step is done. Every die is fixed
// first (kraken_dice_force), so the character made is the same on any build:
// its record is written to <out>/cairn-wizard-record.json for comparing.
//
//   node scripts/verify-core-wizard-ui.mjs [out]
//
// Windows open on the left monitor (KRAKEN_WINDOW_AT) and are closed at the end.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

const checks = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}
const out = process.argv[2] ?? path.join(tmpdir(), "kraken-core-wizard-ui");
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), "kraken-core-wizard-"));
mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
mkdirSync(path.join(profile, "Packs"), { recursive: true });
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const env = { ...process.env, KRAKEN_WINDOW_AT: AT, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  try {
    const message = JSON.parse(line);
    answers.get(message.id)?.(message);
  } catch {
    // (not an answer)
  }
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const force = (values) => tool("kraken_dice_force", { values });

let browser = null;
const PORT = 48500 + Math.floor(Math.random() * 400);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Core wizard UI", ruleset: "Cairn" });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  for (const title of ["Cairn Player's Guide", "Cairn Warden's Guide"]) await tool("kraken_books", { action: "activate", book: shelf.find((item) => item.title === title).id });

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  const open = async () => {
    if (!(await seat.$('[data-action="new-character"]'))) await seat.click('.sidebar [data-launch="characters"]');
    await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
    await seat.click('[data-action="new-character"]');
    await seat.waitForSelector('[data-wizard="cairn"]', { timeout: 10000 });
  };
  const W = '[data-wizard="cairn"]';
  const wizard = seat.locator(W);
  const button = (action) => wizard.locator(`[data-action="${action}"]`);
  const text = async (selector) => (await wizard.locator(selector).first().textContent())?.trim();
  const enabled = (action) => seat.waitForFunction((which) => { const item = document.querySelector(which); return item && !item.disabled; }, `${W} [data-action="${action}"]`, { timeout: 30000 });
  const isDisabled = (action) => button(action).isDisabled();
  // A roll: its dice fixed first, then the button, then its answer from the host.
  const roll = async (action, values, answered) => {
    await force(values);
    await enabled(action);
    await button(action).click();
    await seat.waitForFunction(answered, null, { timeout: 30000 });
  };

  // Cancel: the wizard closes, and opens again fresh.
  await open();
  assert(await isDisabled("wizard-finish"), "Finish is greyed in a fresh wizard");
  assert((await text("header b")) === "New Cairn character" && (await wizard.getAttribute("aria-label")) === "Cairn character wizard", "the wizard's title and name");
  const headings = await wizard.locator("h4").allTextContents();
  assert(headings.join("|") === "1. Background|2. Attributes and Hit Protection|3. Traits, Bond, Age|4. Gold and the Marketplace", `the four steps: ${headings.join(" | ")}`);
  await wizard.getByRole("button", { name: "Cancel" }).click();
  await seat.waitForSelector(W, { state: "detached", timeout: 10000 });
  assert(true, "Cancel closes the wizard");
  await open();

  // A background by hand: its names, its gear, its tables; then another background clears them.
  const backgrounds = (await wizard.locator('select[aria-label="Background"] option').allTextContents()).slice(1);
  assert(backgrounds.length >= 20, `the Player's Guide's backgrounds: ${backgrounds.length}`);
  await wizard.locator('select[aria-label="Background"]').selectOption(backgrounds[0]);
  const names0 = (await wizard.locator('select[aria-label="Name from the background"] option').allTextContents()).slice(1);
  assert(names0.length >= 3, `${backgrounds[0]}'s names: ${names0.join(", ")}`);
  assert(/^Starting gear: a backpack, .+\.$/.test((await wizard.locator("p.hint").nth(1).textContent()) ?? ""), "the background's starting gear");
  await wizard.locator('select[aria-label="Name from the background"]').selectOption(names0[1]);
  assert((await wizard.locator('input[aria-label="Character name"]').inputValue()) === names0[1], "a name from the list fills the name");
  await roll("cairn-roll-table-0", [3], () => /Rolled 3/.test(document.querySelector('[data-wizard="cairn"] [data-action="cairn-roll-table-0"]')?.textContent ?? ""));
  assert(await isDisabled("cairn-roll-table-0"), "a rolled table's button is greyed");
  assert((await wizard.locator('[data-cairn-table="0"] p.hint').count()) === 1, "the table's row is shown");
  await wizard.locator('select[aria-label="Background"]').selectOption(backgrounds[1]);
  assert((await text('[data-action="cairn-roll-table-0"]')) === "Roll d6" && !(await isDisabled("cairn-roll-table-0")), "another background clears the tables");
  assert((await wizard.locator('select[aria-label="Name from the background"]').inputValue()) === "", "and the name");

  // The background on the d20 (a fixed 7), a name typed over a chosen one, both tables.
  await force([7]);
  await button("cairn-roll-background").click();
  await seat.waitForFunction((was) => document.querySelector('[data-wizard="cairn"] select[aria-label="Background"]')?.value !== was, backgrounds[1], { timeout: 30000 });
  const background = await wizard.locator('select[aria-label="Background"]').inputValue();
  assert(backgrounds.includes(background), `the d20 picked a background: ${background}`);
  const names = (await wizard.locator('select[aria-label="Name from the background"] option').allTextContents()).slice(1);
  await wizard.locator('select[aria-label="Name from the background"]').selectOption(names[2] ?? names[0]);
  await wizard.locator('input[aria-label="Character name"]').fill("Ash Test");
  assert((await wizard.locator('select[aria-label="Name from the background"]').inputValue()) === "", "a typed name is no longer the list's");
  const tables = await wizard.locator("[data-cairn-table]").count();
  for (let index = 0; index < tables; index++) await roll(`cairn-roll-table-${index}`, [index + 2], () => true);
  await seat.waitForFunction((count) => [...document.querySelectorAll('[data-wizard="cairn"] [data-cairn-table] button')].filter((item) => /Rolled/.test(item.textContent)).length === count, tables, { timeout: 30000 });
  assert(await isDisabled("wizard-finish"), "Finish still greyed with steps to go");

  // STR, DEX and WIL (12, 18, 6), STR and WIL swapped; HP 4.
  await roll("cairn-roll-attributes", [3, 4, 5, 6, 6, 6, 1, 2, 3], () => Boolean(document.querySelector('[data-wizard="cairn"] [data-wizard-score="wil"]')));
  const scores = async () => Object.fromEntries(await Promise.all(["str", "dex", "wil"].map(async (key) => [key, Number(await wizard.locator(`[data-wizard-score="${key}"] b`).textContent())])));
  assert(JSON.stringify(await scores()) === JSON.stringify({ str: 12, dex: 18, wil: 6 }), `3d6 in order: ${JSON.stringify(await scores())}`);
  assert(await isDisabled("cairn-roll-attributes"), "the attributes are rolled once");
  await wizard.locator('select[aria-label="Swap"]').selectOption("wil");
  await wizard.locator('select[aria-label="With"]').selectOption("wil");
  assert(await isDisabled("cairn-swap"), "no swap of a score with itself");
  await wizard.locator('select[aria-label="With"]').selectOption("str");
  await button("cairn-swap").click();
  assert(JSON.stringify(await scores()) === JSON.stringify({ str: 6, dex: 18, wil: 12 }) && (await wizard.locator('select[aria-label="Swap"]').count()) === 0, "STR and WIL swapped, once");
  await roll("cairn-roll-hp", [4], () => /HP 4/.test(document.querySelector('[data-wizard="cairn"] [data-action="cairn-roll-hp"]')?.textContent ?? ""));

  // The traits, a Bond, the age; the youngest's Omen.
  await roll("cairn-roll-traits", [1, 2, 3, 4, 5, 6, 7, 8], () => Boolean(document.querySelector('[data-wizard="cairn"] [data-wizard-traits]')));
  assert(/^Physique: .+ · .+/.test((await text("[data-wizard-traits]")) ?? ""), `the traits: ${await text("[data-wizard-traits]")}`);
  await roll("cairn-roll-bond", [5], () => /Bond: ./.test(document.querySelector('[data-wizard="cairn"]')?.textContent ?? ""));
  await roll("cairn-roll-age", [10, 10], () => /Age 30/.test(document.querySelector('[data-wizard="cairn"] [data-action="cairn-roll-age"]')?.textContent ?? ""));
  assert((await button("cairn-roll-omen").count()) === 0, "no Omen for one who is not the youngest");
  await wizard.locator('label:has-text("The youngest") input').check();
  assert((await wizard.locator("h4").nth(2).textContent()) === "3. Traits, Bond, Age, Omen", "the youngest's step names the Omen");
  await roll("cairn-roll-omen", [3], () => /Omen \(read it aloud\): ./.test(document.querySelector('[data-wizard="cairn"]')?.textContent ?? ""));
  assert(await isDisabled("wizard-finish"), "Finish greyed until the gold is rolled");

  // 18 gold pieces; the Marketplace: search, Buy twice, Return once, Buy another.
  await roll("cairn-roll-gold", [6, 6, 6], () => /18 gp rolled/.test(document.querySelector('[data-wizard="cairn"] [data-action="cairn-roll-gold"]')?.textContent ?? ""));
  const left = async () => Number(await seat.getAttribute("[data-coin-left]", "data-coin-left"));
  const purse = await left();
  assert(purse >= 18, `the purse: ${purse} (18 rolled and the background's)`);
  await wizard.getByLabel("Shop search").fill("Torch");
  const shown = await wizard.locator(".life-shop li").allTextContents();
  assert(shown.length >= 1 && shown.every((line) => /torch/i.test(line)), `the search: ${shown.join(" | ")}`);
  await wizard.getByRole("button", { name: "Buy Torch", exact: true }).click();
  await wizard.getByRole("button", { name: "Buy Torch", exact: true }).click();
  const torch = purse - (await left());
  assert(torch > 0 && (await text('.life-shop li:has-text("Torch") b')) === "x2", `two torches: ${torch} gp`);
  await wizard.getByRole("button", { name: "Return Torch", exact: true }).click();
  assert((await left()) === purse - torch / 2 && (await text('.life-shop li:has-text("Torch") b')) === "x1", "one returned");
  await wizard.getByLabel("Shop search").fill("Rope");
  await wizard.getByRole("button", { name: /^Buy Rope/ }).first().click();
  const spent = purse - (await left());
  await wizard.getByLabel("Shop search").fill("");
  await seat.screenshot({ path: path.join(out, "cairn-wizard.png"), fullPage: true });
  assert(!(await isDisabled("wizard-finish")) && (await button("wizard-finish").getAttribute("title")) === "Every step rolled first", "Finish once every step is done");
  await button("wizard-finish").click();
  await seat.waitForSelector('[data-ruleset="cairn"]', { timeout: 15000 });

  // The character made: what the wizard said.
  const characters = await tool("kraken_records_list", { type: "character" });
  const mine = (characters.records ?? characters).find((item) => item.owner === "A test player");
  const got = await tool("kraken_record_get", { id: mine.id });
  const data = got.data ?? got.record?.data;
  assert(mine.name === "Ash Test" && data.background === background, `the character: ${mine.name}, ${data.background}`);
  assert(data.attributes.str.score === 6 && data.attributes.dex.score === 18 && data.attributes.wil.score === 12 && data.hp.max === 4 && data.age === 30 && data.bond && data.omen && data.traits.physique, "the scores, HP, age, Bond, Omen and traits");
  const items = Object.values(data.inventorylist).map((item) => item.name);
  assert(items.includes("Torch") && items.some((name) => /^Rope/.test(name)) && items.includes("Backpack"), `the gear: ${items.join(", ")}`);
  assert(Object.values(data.coins)[0].amount === purse - spent, `the gold left: ${Object.values(data.coins)[0].amount}`);
  // The record, without what differs between any two runs (ids, times), for comparing builds.
  const stable = JSON.stringify(data, (key, value) => (/^(id|created|updated|modified|portrait|token)$/.test(key) ? undefined : value), 1).replace(/"id-\d+"/g, '"id"');
  writeFileSync(path.join(out, "cairn-wizard-record.json"), `${JSON.stringify({ name: mine.name }, null, 1)}\n${stable}`);
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok core wizard ui: ${checks.length} checks on Cairn's wizard (${background}, ${tables} tables, ${purse} gp, ${spent} spent). Record and shot: ${out}`);
} catch (error) {
  console.error(`FAILED after ${checks.length} checks: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
