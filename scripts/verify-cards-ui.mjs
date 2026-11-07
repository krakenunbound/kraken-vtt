// Ability cards in the app: the GM hosts a Descending Darkness campaign; a test
// player in Chrome turns cards on in Settings (off until then: no Cards
// button), opens the Cards window and finds their wizard's spells and dagger
// as cards; turns one over, casts it twice from its back (the slots go, the
// card tips over, grey), and a long rest stands it up again. The GM turns
// cards on and opens the window for any character. Screenshots in the temp folder.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-cards-ui-"));
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
const shot = (name) => path.join(tmpdir(), `kraken-cards-${name}.png`);
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Cards UI", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47448, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  for (const book of (Array.isArray(listed) ? listed : listed.books ?? []).filter((item) => /Descending Darkness (Player's Handbook|Bestiary)/.test(item.title))) await tool("kraken_books", { action: "activate", book: book.id });
  const wizard = await tool("kraken_build_character", { owner: "A test player", spec: { name: "Ilse", species: "Human", class: "Wizard", level: 1, scores: { strength: 8, dexterity: 14, constitution: 13, intelligence: 17, wisdom: 12, charisma: 10 }, spells: ["Kindle", "Spark Lash", "Burning Fan", "Ember Ray", "Iron Will"], gear: [["Dagger", 1]] } });
  const slots = async () => (await tool("kraken_record_get", { id: wizard.id })).data?.slots?.l1?.used ?? (await tool("kraken_record_get", { id: wizard.id })).record?.data?.slots?.l1?.used;

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto("http://127.0.0.1:47448/");
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });

  // Off until the player turns it on.
  assert((await seat.locator('[data-launch="cards"]').count()) === 0, "no Cards button before the setting");
  await seat.click('[data-launch="settings"]');
  await seat.check('[data-setting="cards"]');
  await seat.waitForSelector('[data-launch="cards"]', { timeout: 5000 });
  await seat.click('[data-launch="cards"]');
  await seat.waitForSelector(".kcard", { timeout: 8000 });
  const ids = await seat.$$eval(".kcard", (cards) => cards.map((card) => card.getAttribute("data-card")));
  assert(["spell:spark-lash", "spell:burning-fan", "spell:ember-ray", "spell:iron-will"].every((id) => ids.includes(id)) && ids.some((id) => id.startsWith("weapon:")), `the wizard's spells and dagger as cards: ${ids.join(", ")}`);
  assert((await seat.getAttribute('[data-card="spell:ember-ray"]', "data-spent")) === "yes", "a 2nd-level spell with no 2nd-level slot is spent");
  // A spell with its picture shows it (Kindle's, from the handbook).
  await seat.waitForFunction(() => { const img = document.querySelector('[data-card="spell:kindle"] .kcard-art img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 8000 });
  await seat.locator('[data-launch="settings"]').click();
  await seat.screenshot({ path: shot("hand") });

  // Turned over, cast twice from its back: both slots used, the card spent.
  const fan = seat.locator('[data-card="spell:burning-fan"]');
  await fan.hover();
  await fan.click({ position: { x: 70, y: 60 } });
  await seat.waitForSelector('[data-card="spell:burning-fan"].flipped');
  await fan.locator('[data-action="card-cast"]').click();
  await seat.waitForTimeout(260);
  await seat.screenshot({ path: shot("casting") });
  await seat.waitForFunction(() => document.querySelector('[data-card="spell:burning-fan"] .kcard-sparks') === null, null, { timeout: 4000 });
  assert((await slots()) === 1, "one cast: one slot used");
  await fan.locator('[data-action="card-cast"]').click();
  await seat.waitForSelector('[data-card="spell:burning-fan"][data-spent="yes"]', { timeout: 5000 });
  assert((await slots()) === 2, "two casts: both slots used");
  assert(await fan.locator('[data-action="card-cast"]').isDisabled(), "a spent card's Cast is off");
  await seat.mouse.move(5, 5);
  await seat.waitForTimeout(700);
  await seat.screenshot({ path: shot("spent") });

  // A long rest stands it up again.
  await seat.click('[data-action="cards-rest"]');
  await seat.waitForSelector('[data-card="spell:burning-fan"][data-spent="no"]', { timeout: 5000 });
  assert((await slots()) === 0, "a long rest gives the slots back");

  // The GM: cards on, the window for any character.
  await page.click('[data-launch="settings"]');
  await page.check('[data-setting="cards"]');
  await page.waitForSelector('[data-launch="cards"]', { timeout: 5000 });
  await tool("kraken_windows", { action: "open", kind: "cards" });
  await page.waitForSelector('.cards-window[data-cards] .kcard', { timeout: 8000 });
  await page.click('[data-launch="settings"]');
  await page.locator('[data-card="spell:spark-lash"]').hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("gm") });
  assert(failures.length === 0, `no page errors: ${failures.join(" | ")}`);
  console.log(`ok cards ui: off until Settings turns them on; the wizard's spells and dagger as cards; a 2nd-level card spent at 1st level; turned over and cast twice, the card spent; a long rest stands it up; the GM's window. ${shot("hand")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
process.exit(0);
