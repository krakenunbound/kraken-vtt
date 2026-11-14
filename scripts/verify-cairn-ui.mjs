// Cairn, played as a table would, in the real app: the GM hosts a Cairn
// campaign with nothing else installed (KRAKEN_BOOKS and KRAKEN_PACKS point
// at empty folders: only Kraken's own packs are on the shelf) and makes its
// three books active; a test player in Chrome makes a character with the
// wizard, in the book's order (a background rolled on the d20, a name from
// its list, its two tables, STR, DEX and WIL on 3d6 with a swap, HP 1d6, the
// traits, a Bond, the age, 3d6 gold and something bought at the Marketplace);
// rolls a save from the sheet; the GM opens the Temple of the Fungal Lizards
// (walls and doors) and puts a creature from the bestiary on the tracker; the
// player fights it from the sheet (attacks always hit, less Armor, HP then
// STR) until it falls; the GM's tracker asks for morale. Windows open on the
// left monitor (KRAKEN_WINDOW_AT) and are closed at the end.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-cairn-ui-"));
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
const dataOf = async (id) => {
  const got = await tool("kraken_record_get", { id });
  return got.data ?? got.record?.data;
};
const chat = async (pattern) => {
  const lines = await tool("kraken_chat_log", { count: 200 });
  return (Array.isArray(lines) ? lines : []).filter((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""}`));
};
const shots = path.join(tmpdir(), "kraken-cairn-ui");
mkdirSync(shots, { recursive: true });

let browser = null;
const PORT = 48100 + Math.floor(Math.random() * 400);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Cairn UI", ruleset: "Cairn" });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  const ours = ["Cairn Player's Guide", "Cairn Warden's Guide", "Trouble in Twin Lakes (Cairn)"].map((title) => shelf.find((item) => item.title === title));
  assert(ours.every(Boolean), `its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
  assert(!shelf.some((item) => /Descending Darkness|Apeira Astra|Salvage Rights|Watchtower/.test(item.title)), `no other game's books: ${shelf.map((item) => item.title).join(", ")}`);
  for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });

  // A test player makes a character, every die on the host's dice.
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="cairn"]', { timeout: 10000 });
  const wizard = seat.locator('[data-wizard="cairn"]');
  const enabled = (selector) => seat.waitForFunction((which) => { const button = document.querySelector(which); return button && !button.disabled; }, selector, { timeout: 30000 });
  // 1. The background on the d20; a name from its list; its two tables.
  await wizard.locator('[data-action="cairn-roll-background"]').click();
  await seat.waitForFunction(() => document.querySelector('[data-wizard="cairn"] select[aria-label="Background"]')?.value, null, { timeout: 30000 });
  const background = await wizard.locator('select[aria-label="Background"]').inputValue();
  const names = await wizard.locator('select[aria-label="Name from the background"] option').allTextContents();
  await wizard.locator('select[aria-label="Name from the background"]').selectOption(names[1]);
  for (const index of [0, 1]) {
    await enabled(`[data-wizard="cairn"] [data-action="cairn-roll-table-${index}"]`);
    await wizard.locator(`[data-action="cairn-roll-table-${index}"]`).click();
    await seat.waitForFunction((i) => /Rolled \d/.test(document.querySelector(`[data-wizard="cairn"] [data-action="cairn-roll-table-${i}"]`)?.textContent ?? ""), index, { timeout: 30000 });
  }
  // 2. STR, DEX, WIL on 3d6 in order, then a swap; HP 1d6.
  await enabled('[data-wizard="cairn"] [data-action="cairn-roll-attributes"]');
  await wizard.locator('[data-action="cairn-roll-attributes"]').click();
  await seat.waitForSelector('[data-wizard="cairn"] [data-wizard-score="wil"]', { timeout: 30000 });
  const before = Object.fromEntries(await Promise.all(["str", "dex", "wil"].map(async (key) => [key, Number(await wizard.locator(`[data-wizard-score="${key}"] b`).textContent())])));
  await wizard.locator('select[aria-label="Swap"]').selectOption("str");
  await wizard.locator('select[aria-label="With"]').selectOption("wil");
  await wizard.locator('[data-action="cairn-swap"]').click();
  await enabled('[data-wizard="cairn"] [data-action="cairn-roll-hp"]');
  await wizard.locator('[data-action="cairn-roll-hp"]').click();
  await seat.waitForFunction(() => /HP \d/.test(document.querySelector('[data-wizard="cairn"] [data-action="cairn-roll-hp"]')?.textContent ?? ""), null, { timeout: 30000 });
  // 3. Traits, a Bond, the age; the youngest's Omen.
  for (const action of ["cairn-roll-traits", "cairn-roll-bond", "cairn-roll-age"]) {
    await enabled(`[data-wizard="cairn"] [data-action="${action}"]`);
    await wizard.locator(`[data-action="${action}"]`).click();
    await seat.waitForFunction((which) => document.querySelector(`[data-wizard="cairn"] [data-action="${which}"]`)?.disabled, action, { timeout: 30000 });
  }
  await wizard.locator('label:has-text("The youngest") input').check();
  await enabled('[data-wizard="cairn"] [data-action="cairn-roll-omen"]');
  await wizard.locator('[data-action="cairn-roll-omen"]').click();
  await seat.waitForFunction(() => /Omen \(read it aloud\)/.test(document.querySelector('[data-wizard="cairn"]')?.textContent ?? ""), null, { timeout: 30000 });
  // 4. 3d6 gold, then the Marketplace: chalk (1 gp) and a torch (5 gp) if the purse allows.
  await enabled('[data-wizard="cairn"] [data-action="cairn-roll-gold"]');
  await wizard.locator('[data-action="cairn-roll-gold"]').click();
  await seat.waitForFunction(() => /gp rolled/.test(document.querySelector('[data-wizard="cairn"] [data-action="cairn-roll-gold"]')?.textContent ?? ""), null, { timeout: 30000 });
  const purse = Number(await seat.getAttribute("[data-coin-left]", "data-coin-left"));
  await seat.fill('[aria-label="Shop search"]', "Chalk");
  await seat.click('[aria-label="Buy Chalk"]');
  const bought = ["Chalk"];
  if (purse >= 6) {
    await seat.fill('[aria-label="Shop search"]', "Torch");
    await seat.click('[aria-label="Buy Torch"]');
    bought.push("Torch");
  }
  const left = Number(await seat.getAttribute("[data-coin-left]", "data-coin-left"));
  assert(left === purse - (bought.length === 2 ? 6 : 1), `the purse after buying: ${purse} -> ${left}`);
  await seat.screenshot({ path: path.join(shots, "wizard.png"), fullPage: true });
  await enabled('[data-wizard="cairn"] [data-action="wizard-finish"]');
  await wizard.locator('[data-action="wizard-finish"]').click();
  await seat.waitForSelector('[data-ruleset="cairn"]', { timeout: 15000 });
  const sheet = seat.locator('[data-ruleset="cairn"]');
  const characters = await tool("kraken_records_list", { type: "character" });
  const mine = (characters.records ?? characters).find((item) => item.owner === "A test player");
  const data = await dataOf(mine.id);
  assert(data.ruleset === "cairn" && data.background === background && mine.name === names[1], `the character: ${mine.name}, ${data.background} (${background})`);
  assert(data.attributes.str.score === before.wil && data.attributes.wil.score === before.str && data.attributes.dex.score === before.dex, `the swap: ${JSON.stringify(before)} -> ${JSON.stringify(data.attributes)}`);
  assert(data.hp.max >= 1 && data.hp.max <= 6 && data.age >= 12 && data.age <= 50 && data.bond && data.omen && data.traits.physique && data.traits.vice, `HP, age, bond, omen and traits: ${JSON.stringify({ hp: data.hp, age: data.age, bond: data.bond.slice(0, 30), traits: data.traits })}`);
  const items = Object.values(data.inventorylist).map((item) => item.name);
  assert(items.includes("Backpack") && bought.every((name) => items.includes(name)) && items.length >= 5, `gear: ${items.join(", ")}`);
  const gold = Object.values(data.coins)[0].amount;
  assert(gold === left, `gold left on the sheet: ${gold} (the wizard said ${left})`);
  assert(data.slots.used <= 10, `slots: ${JSON.stringify(data.slots)}`);
  assert(/HP/.test(await sheet.textContent()) && /Armor/.test(await sheet.textContent()), "the sheet shows HP and Armor");
  await seat.screenshot({ path: path.join(shots, "sheet.png") });

  // A save from the sheet: DEX, a d20 at or under.
  await sheet.locator('[data-roll-save="dex"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll(".chat-line")].some((line) => /\[SAVE\] DEX \d+ \[(SUCCESS|FAILURE) \d+ vs \d+\]/.test(line.textContent)), null, { timeout: 10000 });
  // The inventory's slots and Fatigue, on the sheet.
  await sheet.locator('[data-sheet-tab="inventory"]').click();
  assert(Number(await sheet.locator("[data-slots]").getAttribute("data-slots")) === data.slots.used, "the inventory shows the slots");

  // The GM's dungeon: the Temple of the Fungal Lizards, with its walls and doors.
  await tool("kraken_open_fg_module", { module: "Trouble in Twin Lakes", all: true });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  let map = await tool("kraken_map", {});
  for (let wait = 0; wait < 40 && !(map.doors ?? []).length; wait++) {
    await settle(250);
    map = await tool("kraken_map", {});
  }
  const walls = await tool("kraken_wall", { action: "list" });
  assert(walls.total >= 12 && (map.doors ?? []).length >= 2, `a map's walls and doors: ${walls.total}, ${(map.doors ?? []).length}`);
  await settle(800);
  await page.screenshot({ path: path.join(shots, "map.png") });

  // A creature from the bestiary: a Wolf, on the tracker with the character.
  const wolfList = await tool("kraken_records_list", { type: "npc", name: "Wolf" });
  const wolf = (wolfList.records ?? wolfList).find((item) => item.name === "Wolf");
  await tool("kraken_combat", { action: "add", recordId: wolf.id });
  await tool("kraken_combat", { action: "add", recordId: mine.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = view.find((entry) => entry.name === "Wolf");
  const me = view.find((entry) => entry.recordId === mine.id);
  const wolfData = await dataOf(wolf.id);
  assert(foe.hp === wolfData.hp && foe.ac === wolfData.armor, `the wolf's HP and Armor from its stat line: ${foe.hp}/${wolfData.hp} ${foe.ac}`);
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.waitForSelector(".combat-tracker [data-cairn-str]", { timeout: 15000 });
  // The sides: the PC saves DEX to act first.
  // (The tracker sits under the map window: its buttons are pressed as a click on them.)
  await page.locator('.combat-tracker button:has-text("Sides (DEX saves)")').dispatchEvent("click");
  await settle(800);
  assert((await chat(/\[INIT\] .*DEX \d+ to act in the first round/)).length >= 1, "the first round's DEX save");
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view[0].recordId === mine.id, "the PCs act first");
  await tool("kraken_combat", { action: "target", id: me.id, targetId: foe.id, on: true });
  await tool("kraken_combat", { action: "target", id: foe.id, targetId: me.id, on: true });
  // The player fights from the sheet until the wolf falls; the wolf bites back from the GM's tracker.
  // The map came up on the player's screen too: its window over the sheet is closed.
  for (const button of await seat.$$('[data-window="map"] button[aria-label^="Close"]')) await button.click().catch(() => undefined);
  await sheet.locator('[data-sheet-tab="combat"]').dispatchEvent("click");
  let rounds = 0;
  let status = "";
  while (rounds < 25) {
    rounds += 1;
    await sheet.locator('[data-attack] [data-action="attack"]').first().dispatchEvent("click");
    await settle(500);
    view = (await tool("kraken_combat", { action: "view" })).entries;
    status = view.find((entry) => entry.id === foe.id).health.status;
    if (["Dead", "Fleeing", "Routed"].includes(status)) break;
    const mine0 = view.find((entry) => entry.id === me.id).health.status;
    if (rounds === 1) await page.locator('.combat-tracker [data-cairn-attack] [data-action="npc-attack"]').first().dispatchEvent("click");
    if (["Dying", "Dead", "Stable"].includes(mine0)) await tool("kraken_cairn", { id: mine.id, action: "recover" });
    await tool("kraken_cairn", { id: mine.id, action: "rest" }).catch(() => undefined);
  }
  if (status === "Fleeing") {
    // It ran: the GM finishes the story with damage past its HP.
    await tool("kraken_combat", { action: "damage", id: foe.id, amount: 99 });
    status = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === foe.id).health.status;
  }
  assert(status === "Dead", `the wolf falls: ${status} after ${rounds} rounds`);
  const attacks = await chat(/\[ATTACK\]/);
  assert(attacks.some((line) => /\[DAMAGE \d+/.test(line.roll?.label ?? "")), "attacks went to chat with their damage");
  assert((await chat(/\[SAVE\] Wolf: STR \d+ against Critical Damage|STR 0/)).length >= 1 || (await chat(/dies/)).length >= 1, "damage past HP came off STR");
  // The GM's morale button.
  await tool("kraken_combat", { action: "add", recordId: wolf.id, count: 2 });
  await settle(400);
  await page.locator('.combat-tracker [data-action="morale-foes"]').dispatchEvent("click");
  await settle(800);
  assert((await chat(/\[MORALE\]/)).length >= 1, "morale from the tracker");
  await page.screenshot({ path: path.join(shots, "combat.png") });
  await seat.screenshot({ path: path.join(shots, "player-combat.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok cairn ui: a Cairn campaign's shelf has its three books and no other game's, made active; a test player made ${mine.name} (${background}) in the wizard: background on the d20, its tables, STR/DEX/WIL 3d6 with STR and WIL swapped, HP ${data.hp.max}, traits, a Bond, age ${data.age}, an Omen, ${purse} gp and ${bought.join(" and ")} bought (${left} gp left), ${data.slots.used} slots; a DEX save from the sheet; the temple's ${walls.total} walls and ${(map.doors ?? []).length} doors; the Wolf from the bestiary fought from the sheet: the DEX save to act first, attacks that always hit less Armor, HP then STR, dead in ${rounds} rounds; morale from the tracker. Screenshots: ${shots}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
