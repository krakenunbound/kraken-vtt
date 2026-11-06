// Descending Darkness, Kraken's own dark fantasy, played as a table would:
// the GM hosts a Descending Darkness campaign and makes its three books active
// (shipped with Kraken in games/modules); a test player in Chrome makes a
// dwarf in the character wizard (only Fighter, Cleric and Thief are offered;
// Constitution +1 and Charisma -1 applied; Defense and Health on the sheet;
// the Dread track); the GM opens The Empty Watchtower's maps (their walls and
// doors) and runs the Grave Hound fight: the dwarf at 0 Health is Dying, bleeds
// 1 a turn, and an ally steadies her with a Wisdom check against 12.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-descending-ui-"));
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
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Descending UI", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47447, password: "" });
  await page.waitForSelector("text=Hosting");

  // Its books, shipped with Kraken: the shelf holds them (and no other game's), all made active.
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  const ours = ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary", "The Empty Watchtower (Descending Darkness)"].map((title) => shelf.find((item) => item.title === title));
  assert(ours.every(Boolean), `its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
  assert(!shelf.some((item) => /5E SRD|Castles|Player's Handbook v1/.test(item.title)), "no other game's books");
  for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });
  const classes = (await tool("kraken_records_list", { type: "class" })).records ?? (await tool("kraken_records_list", { type: "class" }));
  assert((Array.isArray(classes) ? classes : []).length === 7, `seven classes: ${JSON.stringify(classes).slice(0, 200)}`);

  // A test player makes a dwarf in the wizard.
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto("http://127.0.0.1:47447/");
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="descending"]', { timeout: 10000 });
  assert((await seat.textContent('[data-wizard="descending"] header')).includes("New Descending Darkness character"), "the wizard is Descending Darkness's");
  await seat.selectOption('[data-wizard="descending"] select[aria-label="Species"]', "Dwarf");
  await seat.waitForFunction(() => [...document.querySelectorAll('[data-wizard="descending"] select[aria-label="Class"] option')].map((o) => o.textContent).join() === "Cleric,Fighter,Thief", null, { timeout: 5000 });
  await seat.selectOption('[data-wizard="descending"] select[aria-label="Class"]', "Fighter");
  assert((await seat.inputValue('[data-wizard="descending"] input[aria-label="strength score"]')) === "17", "the array starts 17");
  assert(await seat.$('[data-wizard="descending"] [data-adjust="constitution"]'), "the dwarf's Constitution +1 shown");
  await seat.fill('[data-wizard="descending"] input[aria-label="Character name"]', "Brenna");
  for (const skill of ["athletics", "perception"]) await seat.check(`[data-wizard-skill="${skill}"]`);
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('[data-ruleset="descending"]', { timeout: 15000 });
  const sheet = seat.locator('[data-ruleset="descending"]');
  const text = await sheet.textContent();
  assert(/Defense/.test(text) && /Health/.test(text) && /Kin/.test(text), "the sheet says Defense, Health and Kin");
  assert(await sheet.locator('[data-stat="dread"] button').count() === 6, "the Dread track");
  const brenna = (await tool("kraken_records_list", { type: "character" })).records?.find?.((item) => item.name === "Brenna") ?? null;
  const record = brenna ?? (await tool("kraken_characters", {})).characters?.find?.((item) => item.name === "Brenna");
  const full = await tool("kraken_record_get", { id: record.id });
  const data = full.data ?? full.record?.data;
  assert(data.ruleset === "descending" && data.abilities.constitution.score === 15 && data.abilities.charisma.score === 7, `the dwarf's scores: con ${data.abilities.constitution.score}, cha ${data.abilities.charisma.score}`);
  assert(data.hp.total === 13 && data.ac.total === 18, `Health 13 (d10 + 2 + Hardy 1) and Defense 18 (chain and shield): ${data.hp.total}, ${data.ac.total}`);
  // Dread from the sheet.
  await sheet.locator('[data-stat="dread"] button').nth(2).click();
  await seat.waitForFunction(() => document.querySelector('[data-stat="dread"]')?.textContent?.includes("Shaken"), null, { timeout: 8000 });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-descending-sheet.png") });

  // The adventure's maps: walls and doors where they are drawn.
  const opened = await tool("kraken_open_fg_module", { module: "The Empty Watchtower", all: true });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  const scenes = opened.scenes ?? opened.maps ?? [];
  let map = await tool("kraken_map", {});
  for (let wait = 0; wait < 40 && !(map.doors ?? []).length; wait++) {
    await settle(250);
    map = await tool("kraken_map", {});
  }
  const walls = await tool("kraken_wall", { action: "list" });
  assert(walls.total > 30, `the yard's walls: ${walls.total}`);
  assert((map.doors ?? []).length >= 3, `the yard's doors: ${(map.doors ?? []).length}`);
  await settle(1200);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-descending-map.png") });

  // The Grave Hound fight: Brenna falls, bleeds, is steadied.
  const hound = (await tool("kraken_records_list", { type: "npc", name: "Grave Hound" })).records?.[0] ?? (await tool("kraken_records_list", { type: "npc" })).records?.find?.((item) => item.name === "Grave Hound");
  await tool("kraken_combat", { action: "add", recordId: hound.id });
  await tool("kraken_combat", { action: "add", recordId: record.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = view.find((entry) => entry.name === "Grave Hound");
  const hers = view.find((entry) => entry.recordId === record.id);
  assert(foe.hp === 32 && foe.ac === 13, `the hound's Health and Defense: ${foe.hp}, ${foe.ac}`);
  await tool("kraken_combat", { action: "update", id: foe.id, patch: { initresult: 15 } });
  await tool("kraken_combat", { action: "update", id: hers.id, patch: { initresult: 5 } });
  await tool("kraken_combat", { action: "damage", id: hers.id, amount: 13 });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === hers.id).health.status === "Dying", "at 0 Health she is Dying");
  await tool("kraken_combat", { action: "next" });
  await tool("kraken_combat", { action: "next" });
  const bled = await tool("kraken_record_get", { id: record.id });
  assert((bled.data ?? bled.record?.data).hp.wounds === 14, `she bled 1 at her turn: wounds ${(bled.data ?? bled.record?.data).hp.wounds}`);
  // A death save is not this game's: steadied instead (the GM's call here, until it succeeds).
  let steadied = null;
  for (let tries = 0; tries < 30 && !steadied?.success; tries++) steadied = (await tool("kraken_combat", { action: "stabilize", id: hers.id })).stabilize;
  assert(steadied?.success && steadied.status === "Unconscious", `steadied: ${JSON.stringify(steadied)}`);
  await tool("kraken_combat", { action: "next" });
  await tool("kraken_combat", { action: "next" });
  const after = await tool("kraken_record_get", { id: record.id });
  assert((after.data ?? after.record?.data).hp.wounds === 14, "steadied, she bleeds no more");
  const chat = (await tool("kraken_chat_log", { lines: 40 }).catch(() => ({ lines: [] }))).lines ?? [];
  await page.screenshot({ path: path.join(tmpdir(), "kraken-descending-combat.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok descending ui: a Descending Darkness campaign's shelf has its three books (no other game's), made active (7 classes); a test player makes a dwarf fighter in the wizard (only Cleric, Fighter, Thief offered; 17 to start; Con 15, Cha 7; Health 13, Defense 18; Defense, Health, Kin and Dread on the sheet; Shaken at 3); The Empty Watchtower's maps with ${walls.total} walls and ${(map.doors ?? []).length} doors on the yard; the Grave Hound (Health 32, Defense 13); at 0 Health she is Dying, bleeds 1 at her turn, is steadied (Wisdom 12) and bleeds no more. ${path.join(tmpdir(), "kraken-descending-sheet.png")} ${chat.length ? "" : ""}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
