// FG's campaign lists and sharing (the master index, Share / Unshare), with a
// player's lists: a D&D 5E campaign with the SRD's player book and bestiary
// active. The GM's Lists hold the bestiary's NPCs (hidden) and the player
// book's items and spells (a player book's, shared, as FG's player modules
// are). The GM shares the Goblin Warrior from its list's sharing icon; a test
// player in Chrome finds it in their NPCs list (the only NPC), opens it (its
// abilities, its actions in FG's text, no share button), and keeps it at hand
// in a quick slot (a record is a link). The GM's All / Shared filter; the GM
// hides it again and it leaves the player's list and window.
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
if (!listModules().some((item) => (item.name ?? item) === "DNDSRD521BESTIARY")) {
  console.log("skip records ui: no SRD 5.2.1 modules");
  process.exit(0);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-records-ui-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "Lists UI", ruleset: "D&D 5E" });
  const port = 47414;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  for (const wanted of [/DNDSRD521PLAYER/i, /DNDSRD521BESTIARY/i]) {
    const book = (shelf.books ?? shelf).find((item) => wanted.test(`${item.id} ${item.name ?? ""}`));
    await tool("kraken_books", { action: "activate", book: book.id });
  }
  const goblin = listOf(await tool("kraken_records_list", { type: "npc" })).find((item) => item.name === "Goblin Warrior");
  assert(goblin && goblin.visibility === "gm", `the bestiary's Goblin Warrior is hidden: ${JSON.stringify(goblin)}`);

  // The GM's Lists: NPCs, items, spells...; the goblin hidden.
  await page.click('.sidebar [data-launch="records"]');
  await page.waitForSelector('[data-records-list="npc"]');
  for (const list of ["npc", "item", "spell", "class"]) assert(await page.$(`[data-records-list="${list}"]`), `the GM has the ${list} list`);
  await page.click('[data-records-list="npc"]');
  await page.fill('[aria-label="Search the list"]', "Goblin Warrior");
  const row = `[data-record-row="${goblin.id}"]`;
  await page.waitForSelector(row);
  assert((await page.getAttribute(`${row} [data-action="record-share"]`, "aria-pressed")) === "false", "the goblin's sharing icon says hidden");

  // A test player before: no NPCs list at all, the player book's items are there.
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('.sidebar [data-launch="records"]');
  await seat.waitForSelector('[data-records-list="item"]');
  assert(!(await seat.$('[data-records-list="npc"]')), "the player has no NPCs list before the GM shares one");
  assert(!(await seat.$('[data-action="record-share"]')), "a player has no sharing icons");

  // The GM shares the goblin (FG's Share): the player's NPCs list holds it, and only it.
  await page.click(`${row} [data-action="record-share"]`);
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-pressed") === "true", `${row} [data-action="record-share"]`);
  assert((await tool("kraken_record_get", { id: goblin.id })).visibility === "all", "the goblin's record is shared");
  await seat.waitForSelector('[data-records-list="npc"]', { timeout: 10000 });
  await seat.click('[data-records-list="npc"]');
  const names = await seat.$$eval(".records-row .records-name", (list) => list.map((item) => item.textContent));
  assert(names.length === 1 && names[0] === "Goblin Warrior", `the player's NPCs: ${JSON.stringify(names)}`);

  // Open it: its abilities and actions, read only.
  await seat.click(`[data-record-row="${goblin.id}"] .records-name`);
  await seat.waitForSelector(`.record-window[data-record="${goblin.id}"]`);
  const shown = await seat.textContent(`.record-window[data-record="${goblin.id}"]`);
  assert(/DEX/.test(shown) && /Melee Attack Roll/.test(shown) && /Nimble Escape/.test(shown) && !/Summon|Lairactions|Damagethreshold/.test(shown), `the goblin's window shows its abilities and actions: ${shown.slice(0, 400)}`);
  assert(!(await seat.$(`.record-window[data-record="${goblin.id}"] [data-action="record-share"]`)), "no share button for a player");
  assert(!(await seat.$(`.record-window[data-record="${goblin.id}"] script`)), "no markup from the record runs");

  // A record is a link: onto a quick slot, opened from it.
  await seat.evaluate(
    ([selector, link]) => {
      const element = document.querySelector(selector);
      const transfer = new DataTransfer();
      transfer.setData("text/kraken-slot", JSON.stringify(link));
      for (const type of ["dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    },
    ['[data-quick-slot="0"]', { kind: "record", record: goblin.id, label: "Goblin Warrior" }],
  );
  await seat.waitForSelector('[data-quick-slot="0"].full', { timeout: 10000 });
  await seat.click(`.record-window[data-record="${goblin.id}"]`);
  await seat.keyboard.press("Escape");

  // The GM's All / Shared filter.
  await page.fill('[aria-label="Search the list"]', "");
  await page.click('[data-action="records-shared-only"]');
  await page.waitForFunction(() => document.querySelectorAll(".records-row").length === 1, null, { timeout: 10000 });
  await page.click('[data-action="records-shared-only"]');
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-records-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-records-gm.png") });

  // Hidden again (FG's Unshare): gone from the player's list and window.
  await tool("kraken_record_update", { id: goblin.id, visibility: "gm" });
  await seat.waitForFunction((id) => !document.querySelector(`[data-record-row="${id}"]`) && !document.querySelector(`.record-window[data-record="${id}"]`), goblin.id, { timeout: 10000 });
  await seat.click('[data-quick-slot="0"]');
  await seat.waitForSelector(".record-window:has-text('not shown to you')", { timeout: 10000 });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok records ui: the GM's Lists (NPCs hidden, the player book's items and spells shared); the GM shares the Goblin Warrior from its sharing icon and a test player's NPCs list holds it alone; its window shows its abilities and actions, read only; a quick slot keeps it; the All / Shared filter; hidden again, it leaves the player's list and window. ${path.join(tmpdir(), "kraken-records-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
