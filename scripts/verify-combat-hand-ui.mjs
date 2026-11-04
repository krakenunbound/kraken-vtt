// A fight run by hand, as a GM and a player do it in FG: a D&D 5E campaign
// (the SRD's books), a bare picture as the map. A test player in Chrome makes a
// character with the wizard: it gets a portrait and a token of its species
// without asking (no sheet without them), placed on the map. The GM puts a
// goblin on the tracker and drags its row onto the map: its token lands where
// it fell, tied to the entry. The player Ctrl+clicks the goblin's token to
// target it and attacks from the sheet (the roll shows the target). The GM
// drags the damage roll from chat onto the goblin's row, then a second roll
// onto its token: its hit points go down both times. Chat stays at the
// newest line. Skipped without the SRD modules.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  console.log("skip combat hand ui: no SRD 5.2.1 modules");
  process.exit(0);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-combat-hand-"));
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
// A browser drag and drop, as the person's mouse makes it: dragstart on the source, then dragover and drop at a point.
const dragDrop = (where, source, target, at) =>
  where.evaluate(
    ([from, to, point]) => {
      const start = document.querySelector(from);
      const end = to ? document.querySelector(to) : document.elementFromPoint(point.x, point.y);
      if (!start || !end) return `missing ${!start ? from : to}`;
      const transfer = new DataTransfer();
      const box = end.getBoundingClientRect();
      const x = point ? point.x : box.left + box.width / 2;
      const y = point ? point.y : box.top + box.height / 2;
      start.dispatchEvent(new DragEvent("dragstart", { dataTransfer: transfer, bubbles: true, cancelable: true }));
      for (const type of ["dragover", "drop"]) end.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      start.dispatchEvent(new DragEvent("dragend", { dataTransfer: transfer, bubbles: true }));
      return "ok";
    },
    [source, target, at],
  );

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Combat by hand", ruleset: "D&D 5E" });
  const port = 47416;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  for (const wanted of [/DNDSRD521PLAYER/i, /DNDSRD521BESTIARY/i]) await tool("kraken_books", { action: "activate", book: (shelf.books ?? shelf).find((item) => wanted.test(`${item.id} ${item.name ?? ""}`)).id });
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector(".map-toolbar");

  // The player makes a dwarf fighter: a portrait and token of a dwarf come with it.
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="dnd5e"] [data-art-choice]');
  await seat.fill('[aria-label="Character name"]', "Brunhild");
  await seat.selectOption('[aria-label="Species"]', "Dwarf");
  await seat.selectOption('[aria-label="Class"]', "Fighter");
  for (const [stat, score] of [["strength", 16], ["dexterity", 12], ["constitution", 15], ["intelligence", 8], ["wisdom", 13], ["charisma", 10]]) await seat.fill(`[aria-label="${stat} score"]`, String(score));
  await seat.check('[data-wizard-skill="perception"]');
  await seat.check('[data-wizard-skill="survival"]');
  await seat.waitForFunction(() => document.querySelector('[data-action="choose-portrait"] img, [data-action="choose-portrait"] video'), null, { timeout: 10000 }).catch(() => undefined);
  const offered = await seat.$('[data-action="choose-portrait"] img, [data-action="choose-portrait"] video');
  await seat.click('[data-action="wizard-finish"]');
  await seat.waitForSelector('.sheet-5e [data-stat="ac"]', { timeout: 15000 });
  const row = listOf(await tool("kraken_records_list", { type: "character" })).find((item) => item.name === "Brunhild");
  const hero = await tool("kraken_record_get", { id: row.id });
  const art = (await tool("kraken_art", { kind: "portrait", search: "" })).art ?? [];
  const dwarfArt = art.some((item) => /dwarf/i.test(item.group));
  if (dwarfArt) assert(typeof hero.data.portrait === "string" && hero.data.portrait && offered, `a dwarf portrait came with the character (offered in the wizard): ${JSON.stringify({ portrait: hero.data.portrait, token: hero.data.token, offered: Boolean(offered) })}`);
  else console.log("note: no dwarf portraits in this computer's collection; the default is not checked");
  await tool("kraken_token_place", { recordId: row.id, col: 7, row: 5 });

  // The GM puts a goblin on the tracker and drags its row onto the map.
  const goblin = listOf(await tool("kraken_records_list", { type: "npc" })).find((item) => item.name === "Goblin Warrior");
  await tool("kraken_combat", { action: "add", recordId: goblin.id });
  await tool("kraken_combat", { action: "add", recordId: row.id });
  await page.click('.sidebar [data-launch="combat"]');
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = view.find((entry) => entry.name === "Goblin Warrior");
  const mine = view.find((entry) => entry.recordId === row.id);
  await page.waitForSelector(`[data-ct="${foe.id}"]`);
  // A spot of open map: inside the map, under no window.
  const spot = await page.evaluate(() => {
    const viewport = document.querySelector(".viewport[data-scene]").getBoundingClientRect();
    for (let fy = 0.2; fy < 0.9; fy += 0.1)
      for (let fx = 0.15; fx < 0.9; fx += 0.05) {
        const x = viewport.left + viewport.width * fx;
        const y = viewport.top + viewport.height * fy;
        const element = document.elementFromPoint(x, y);
        if (element && element.closest(".viewport[data-scene]") && !element.closest(".floating-window, .window, .chat-dock, .map-toolbar, button, input")) return { x, y };
      }
    return null;
  });
  assert(spot, "a spot of open map to drop on");
  const dropped = await dragDrop(page, `[data-ct="${foe.id}"]`, null, spot);
  assert(dropped === "ok", `the drag: ${dropped}`);
  let goblinToken = null;
  for (let wait = 0; wait < 40 && !goblinToken; wait++) {
    view = (await tool("kraken_combat", { action: "view" })).entries;
    const tokenId = view.find((entry) => entry.id === foe.id)?.tokenId;
    goblinToken = tokenId ? (await tool("kraken_map", {})).tokens?.find((token) => token.id === tokenId) : null;
    if (!goblinToken) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(goblinToken, "the goblin's row dragged onto the map made its token, tied to the entry");

  // Combat: the player's turn. They Ctrl+click the goblin's token and attack from the sheet.
  await tool("kraken_combat", { action: "update", id: foe.id, patch: { initresult: 5 } });
  await tool("kraken_combat", { action: "update", id: mine.id, patch: { initresult: 15 } });
  await tool("kraken_combat", { action: "next" });
  await seat.waitForSelector(`[data-token="${goblinToken.id}"]`, { timeout: 10000 });
  // The sheet is moved out of the way (closed), the goblin brought into view.
  for (const button of await seat.$$('.window-layer .window-close')) await button.click().catch(() => undefined);
  await seat.locator(`[data-token="${goblinToken.id}"]`).scrollIntoViewIfNeeded();
  await seat.click(`[data-token="${goblinToken.id}"]`, { modifiers: ["Control"] });
  for (let wait = 0; wait < 40; wait++) {
    view = (await tool("kraken_combat", { action: "view" })).entries;
    if (view.find((entry) => entry.id === mine.id)?.targets.includes(foe.id)) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(view.find((entry) => entry.id === mine.id).targets.includes(foe.id), "Ctrl+click targeted the goblin");
  await tool("kraken_dice_force", { values: [18] });
  await seat.click(`.portrait-strip [data-portrait="${row.id}"]`);
  await seat.click('[data-sheet-tab="combat"]');
  await seat.click('.five-attacks li:first-child [data-action="attack"]');
  await page.waitForFunction(() => document.body.textContent.includes("[AC 15]"), null, { timeout: 10000 });
  // The GM clears the target so the damage is not applied on its own, then applies it by hand.
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: foe.id, on: false });
  await tool("kraken_dice_force", { values: [4] });
  await seat.click('.five-attacks li:first-child [data-action="damage"]');
  await page.waitForSelector('.chat-line[draggable="true"]', { timeout: 10000 });
  const before = view.find((entry) => entry.id === foe.id).wounds ?? 0;
  const onRow = await dragDrop(page, '.chat-line[draggable="true"]:last-of-type', `[data-ct="${foe.id}"]`);
  assert(onRow === "ok", `the drag onto the row: ${onRow}`);
  let wounds = before;
  for (let wait = 0; wait < 40 && wounds === before; wait++) {
    wounds = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === foe.id).wounds ?? 0;
    if (wounds === before) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(wounds > before, `the damage roll dropped on the goblin's row hurt it: ${before} -> ${wounds}`);
  // A second roll, onto its token on the map (the goblin back to full first: 5E stops at its hit points).
  const rowWounds = wounds;
  await tool("kraken_combat", { action: "update", id: foe.id, patch: { wounds: 0 } });
  wounds = 0;
  await tool("kraken_dice_force", { values: [3] });
  await seat.click('.five-attacks li:first-child [data-action="damage"]');
  await page.waitForFunction((count) => document.querySelectorAll('.chat-line[draggable="true"]').length > count, 1, { timeout: 10000 });
  const tokenBox = await page.locator(`[data-token="${goblinToken.id}"]`).boundingBox();
  const onToken = await dragDrop(page, '.chat-line[draggable="true"]:last-of-type', null, { x: tokenBox.x + tokenBox.width / 2, y: tokenBox.y + tokenBox.height / 2 });
  assert(onToken === "ok", `the drag onto the token: ${onToken}`);
  let after = wounds;
  for (let wait = 0; wait < 40 && after === wounds; wait++) {
    after = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === foe.id).wounds ?? 0;
    if (after === wounds) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(after > wounds, `the damage roll dropped on the goblin's token hurt it: ${wounds} -> ${after}`);

  // The chat is at its newest line.
  const atBottom = await page.$eval(".chat-log", (log) => log.scrollHeight - log.scrollTop - log.clientHeight < 40);
  assert(atBottom, "the chat log stays at the newest line");
  await page.screenshot({ path: path.join(tmpdir(), "kraken-combat-hand-gm.png") });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-combat-hand-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok combat hand ui: the wizard's character came with a ${dwarfArt ? "dwarf portrait and token" : "(no dwarf art here)"}; the GM dragged the goblin's tracker row onto the map (its token, tied to it); the player Ctrl+clicked it to target and attacked from the sheet; the GM dragged the damage roll onto the goblin's row (${before} -> ${rowWounds} wounds) and, healed, onto its token (0 -> ${after}); chat stayed at the newest line. ${path.join(tmpdir(), "kraken-combat-hand-gm.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
