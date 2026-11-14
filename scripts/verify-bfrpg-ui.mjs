// Basic Fantasy, played as a table would: the GM hosts a Basic Fantasy
// campaign (nothing installed but Kraken: the GM's FG modules and packs
// folders are empty temp folders) and makes its three books active; a test
// player in Chrome makes a character with the wizard, the book's procedure:
// 3d6 in order (the host's dice), a race and class the scores allow, the hit
// die, 3d6 x 10 gp and the shop (what the class may use, within the money);
// the sheet shows the numbers; a save and an ability roll go from the sheet
// to chat; the GM opens The Mill at Hob's Ford's map (walls and doors); a
// goblin from the Game Master's Guide fights the character on the tracker:
// d6 initiative, the goblin's attack, the player's attack and damage from
// the sheet against ascending AC, dead at 0; a morale check; the party's
// parcel and experience.
//   node scripts/verify-bfrpg-ui.mjs
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-bfrpg-ui-"));
mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
mkdirSync(path.join(profile, "packs"), { recursive: true });
const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const dataOf = async (id) => {
  const got = await tool("kraken_record_get", { id });
  return got.data ?? got.record?.data;
};
const chatHas = async (pattern) => {
  for (let i = 0; i < 40; i++) {
    const lines = await tool("kraken_chat_log", { count: 60 });
    const found = (Array.isArray(lines) ? lines : []).find((line) => pattern.test(`${line.roll?.label ?? ""} ${line.text ?? ""}`));
    if (found) return found;
    await settle(250);
  }
  return null;
};
const shots = path.join(tmpdir(), "kraken-bfrpg-ui");
mkdirSync(shots, { recursive: true });

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "The Mill at Hob's Ford", ruleset: "Basic Fantasy" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47451, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  const ours = ["Basic Fantasy Player's Handbook", "Basic Fantasy Game Master's Guide", "The Mill at Hob's Ford (Basic Fantasy)"].map((title) => shelf.find((item) => item.title === title));
  assert(ours.every(Boolean), `its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
  assert(!shelf.some((item) => /Descending Darkness|Apeira Astra|Watchtower|Salvage/.test(item.title)), `no other game's books: ${shelf.map((item) => item.title).join(", ")}`);
  for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });

  // A test player in Chrome.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto("http://127.0.0.1:47451/");
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="bfrpg"]', { timeout: 10000 });
  const wizard = seat.locator('[data-wizard="bfrpg"]');
  assert(await wizard.locator('[data-action="wizard-finish"]').isDisabled(), "nothing rolled: Finish waits");
  // 1. 3d6 in order, on the host's dice: Str 15, Int 10, Wis 9, Dex 13, Con 14, Cha 10.
  await tool("kraken_dice_force", { values: [5, 5, 5, 3, 4, 3, 4, 3, 2, 5, 4, 4, 5, 4, 5, 3, 3, 4] });
  await wizard.locator('[data-action="roll-abilities"]').click();
  await seat.waitForFunction(() => document.querySelector('[data-wizard="bfrpg"] input[data-score="charisma"]')?.value === "10", null, { timeout: 20000 });
  const scores = await wizard.locator("input[data-score]").evaluateAll((list) => list.map((input) => Number(input.value)));
  assert(JSON.stringify(scores) === JSON.stringify([15, 10, 9, 13, 14, 10]), `3d6 in order: ${scores}`);
  assert(await chatHas(/\[CHARGEN\] Strength \(3d6 in order\)/), "the ability rolls are the host's, in chat");
  // 2-3. The race's and class's limits: a Dwarf (Con 9+) may, a Magic-User needs Int 9 (10: yes), a Cleric Wis 9 (yes); a Halfling needs Dex 9 (yes).
  const raceOptions = await wizard.locator('select[aria-label="Race"] option').evaluateAll((list) => list.map((option) => `${option.value}:${option.disabled}`));
  assert(raceOptions.every((option) => option.endsWith(":false")), `every race allowed with these scores: ${raceOptions}`);
  await wizard.locator('select[aria-label="Race"]').selectOption("dwarf");
  const dwarfClasses = await wizard.locator('select[aria-label="Class"] option').evaluateAll((list) => list.filter((option) => !option.disabled).map((option) => option.value));
  assert(JSON.stringify(dwarfClasses) === JSON.stringify(["cleric", "fighter", "thief"]), `a dwarf's classes: ${dwarfClasses}`);
  await wizard.locator('select[aria-label="Race"]').selectOption("human");
  await wizard.locator('select[aria-label="Class"]').selectOption("fighter");
  // 4. The hit die: d8 7 + Con 1 = 8.
  await tool("kraken_dice_force", { values: [7] });
  await wizard.locator('[data-action="roll-hp"]').click();
  await seat.waitForSelector('[data-wizard="bfrpg"] [data-hp="8"]', { timeout: 20000 });
  // 6. 3d6 x 10 gp: 4 + 4 + 4 = 120 gp; the shop.
  await tool("kraken_dice_force", { values: [4, 4, 4] });
  await wizard.locator('[data-action="roll-gold"]').click();
  await seat.waitForSelector('[data-wizard="bfrpg"] [data-coin-left="12000"]', { timeout: 20000 });
  const buy = async (name, times = 1) => {
    await seat.fill('[aria-label="Shop search"]', name);
    for (let i = 0; i < times; i++) await seat.locator(`[aria-label="Buy ${name}"]`).click();
  };
  await buy("Longsword/Scimitar");
  await buy("Chain Mail");
  await buy("Shield");
  await buy("Shortbow");
  await buy("Shortbow Arrow", 2);
  await buy("Torches, 6");
  // 120 - 10 - 60 - 7 - 25 - 0.2 - 1 = 16 gp 8 sp.
  assert((await seat.getAttribute("[data-coin-left]", "data-coin-left")) === "1680", `the money left: ${await seat.getAttribute("[data-coin-left]", "data-coin-left")}`);
  await seat.fill('[aria-label="Shop search"]', "Plate Mail");
  assert(await seat.locator('[aria-label="Buy Plate Mail"]').isDisabled(), "plate mail (300 gp) is too dear");
  await seat.fill('[aria-label="Shop search"]', "");
  await wizard.locator('input[aria-label="Character name"]').fill("Darion");
  await wizard.locator('select[aria-label="Alignment"]').selectOption("Lawful");
  await seat.screenshot({ path: path.join(shots, "wizard.png"), fullPage: true });
  await wizard.locator('[data-action="wizard-finish"]').click();
  await seat.waitForSelector('[data-ruleset="bfrpg"]', { timeout: 15000 });
  const sheet = seat.locator('[data-ruleset="bfrpg"]');
  const listedCharacters = await tool("kraken_records_list", { type: "character" });
  const darion = (listedCharacters.records ?? listedCharacters).find((item) => item.name === "Darion");
  assert(darion && darion.owner === "A test player", "Darion is the player's");
  const data = await dataOf(darion.id);
  assert(data.ruleset === "bfrpg" && data.className === "Fighter" && data.hp.total === 8 && data.ac.total === 17 && data.ab === 1 && data.attack.melee === 2 && data.movement === 20, `Darion's numbers: ${JSON.stringify({ hp: data.hp, ac: data.ac, ab: data.ab, attack: data.attack, movement: data.movement })}`);
  const gold = Object.values(data.coins).find((coin) => coin.name === "GP").amount;
  const silver = Object.values(data.coins).find((coin) => coin.name === "SP").amount;
  assert(gold === 16 && silver === 8 && Object.values(data.inventorylist).some((item) => item.name === "Shortbow Arrow" && item.count === 2), `16 gp 8 sp left, the gear bought: ${gold} ${silver}`);
  assert((await sheet.locator('[data-stat="ac"]').textContent()) === "17" && /8 \/ 8/.test(await sheet.locator('[data-stat="hp"]').textContent()) && (await sheet.locator('[data-stat="ab"]').textContent()) === "+1", "the sheet shows AC 17, 8/8 hit points, AB +1");
  // Rolls from the sheet: a save vs. Death Ray (12), the Strength roll (d20 + 1 at or above 17).
  await tool("kraken_dice_force", { values: [12] });
  await sheet.locator('[data-roll-save="death"]').click();
  assert(await chatHas(/Save vs\. Death Ray or Poison \[NEEDS 12\] \[SUCCESS 12 vs 12\]/), "a save from the sheet");
  await tool("kraken_dice_force", { values: [17] });
  await sheet.locator('[data-roll-check="strength"]').click();
  assert(await chatHas(/Strength roll \[NEEDS 17\] \[SUCCESS 18 vs 17\]/), "an ability roll from the sheet");
  await seat.screenshot({ path: path.join(shots, "sheet.png") });

  // The Mill's map: walls and doors.
  await tool("kraken_open_fg_module", { module: "The Mill at Hob's Ford", all: true });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  let map = await tool("kraken_map", {});
  for (let wait = 0; wait < 40 && !(map.doors ?? []).length; wait++) {
    await settle(250);
    map = await tool("kraken_map", {});
  }
  const walls = await tool("kraken_wall", { action: "list" });
  assert(walls.total >= 15 && (map.doors ?? []).length >= 2, `the mill's walls and doors: ${walls.total}, ${(map.doors ?? []).length}`);
  await settle(800);
  await page.screenshot({ path: path.join(shots, "map.png") });

  // A goblin from the Game Master's Guide against Darion.
  const goblinRecord = ((await tool("kraken_records_list", { type: "npc", name: "Goblin" })).records ?? []).find((record) => record.name === "Goblin");
  assert(goblinRecord, "the Game Master's Guide's goblin");
  await tool("kraken_dice_force", { values: [6] });
  await tool("kraken_combat", { action: "add", recordId: goblinRecord.id });
  await tool("kraken_combat", { action: "add", recordId: darion.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = view.find((entry) => entry.name === "Goblin");
  const mine = view.find((entry) => entry.recordId === darion.id);
  assert(foe.hp === 5 && foe.ac === 14 && foe.morale === 7 && foe.attacks?.[0]?.damage === "1d6", `the goblin: 1d8-1 = 5 hit points, AC 14, morale 7, 1d6: ${JSON.stringify(foe)}`);
  await tool("kraken_dice_force", { values: [5, 2] });
  await tool("kraken_combat", { action: "init", which: "all" });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view[0].name === "Goblin" && view[0].initresult === 5 && view[1].initresult === 3, `d6 initiative, highest first: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
  await tool("kraken_windows", { action: "open", kind: "combat" }).catch(() => undefined);
  // The goblin attacks: d20 + 0 against AC 17.
  await tool("kraken_combat", { action: "target", id: foe.id, targetId: mine.id, on: true });
  await tool("kraken_dice_force", { values: [17] });
  await tool("kraken_combat", { action: "attack", id: foe.id, weapon: "0" });
  assert(await chatHas(/\[ATTACK\].*Weapon \[AC 17\] \[HIT 17 vs 17\]/), "the goblin's attack against AC 17");
  await tool("kraken_dice_force", { values: [3] });
  await tool("kraken_combat", { action: "damage-roll", id: foe.id, weapon: "0" });
  assert((await dataOf(darion.id)).hp.wounds === 3, "Darion takes 3");
  await seat.waitForFunction(() => /5 \/ 8/.test(document.querySelector('[data-ruleset="bfrpg"] [data-stat="hp"]')?.textContent ?? ""), null, { timeout: 8000 });
  // The player attacks from the sheet: the longsword, d20 + 2 against AC 14.
  await tool("kraken_combat", { action: "next" });
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: foe.id, on: true });
  // The shared map's window lies over the sheet: the player closes it (as the e2e run does).
  for (const button of await seat.$$('[data-window="map"] button[aria-label^="Close"]')) await button.click().catch(() => undefined);
  await sheet.locator('[data-sheet-tab="combat"]').click();
  const swordRow = sheet.locator('[data-attack]', { hasText: "Longsword/Scimitar" }).first();
  assert((await swordRow.locator('[data-action="attack"]').textContent()) === "+2" && (await swordRow.locator('[data-action="damage"]').textContent()) === "1d8+1", "the longsword: +2, 1d8+1 (Strength 15)");
  await tool("kraken_dice_force", { values: [12] });
  await swordRow.locator('[data-action="attack"]').click();
  assert(await chatHas(/\[ATTACK\].*Longsword\/Scimitar \[AC 14\] \[HIT 14 vs 14\] -> \[at Goblin\]/), "the player's hit, from the sheet");
  await tool("kraken_dice_force", { values: [5] });
  await swordRow.locator('[data-action="damage"]').click();
  for (let i = 0; i < 30; i++) {
    view = (await tool("kraken_combat", { action: "view" })).entries;
    if (view.find((entry) => entry.id === foe.id)?.health.status === "Dead") break;
    await settle(250);
  }
  assert(view.find((entry) => entry.id === foe.id).health.status === "Dead", `5 + 1 = 6 damage: the goblin is dead at 0: ${JSON.stringify(view.find((entry) => entry.id === foe.id))}`);
  // A second goblin's morale (the GM's button: 2d6 against 7).
  await tool("kraken_dice_force", { values: [6] });
  await tool("kraken_combat", { action: "add", recordId: goblinRecord.id });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const second = view.find((entry) => entry.name === "Goblin 2");
  await page.waitForSelector('[data-action="morale"]', { timeout: 10000 });
  await tool("kraken_dice_force", { values: [2, 3] });
  await page.locator(`.ct-row:has-text("Goblin 2") [data-action="morale"]`).first().evaluate((button) => button.click()); // (the map window may lie over the tracker)
  assert(await chatHas(/\[MORALE\] Goblin 2 \[MORALE 7\] \[STANDS 5 vs 7\]/), "a morale check from the tracker");
  await page.screenshot({ path: path.join(shots, "combat.png") });
  void second;

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok bfrpg ui: a Basic Fantasy campaign's shelf has its three books (no other game's), made active with nothing else installed; a test player in Chrome makes Darion in the wizard (3d6 in order on the host's dice: 15 10 9 13 14 10; a dwarf may be Cleric, Fighter or Thief; Human Fighter; d8 7 + 1 = 8 hit points; 3d6 x 10 = 120 gp; a longsword, chain mail, a shield, a shortbow and arrows, torches; 16 gp 8 sp left; plate too dear); the sheet: AC 17, AB +1, melee +2; a save vs. Death Ray and a Strength roll from the sheet; The Mill's map with ${walls.total} walls and ${(map.doors ?? []).length} doors; a goblin (5 hp, AC 14): d6 initiative, its hit against AC 17, Darion's longsword from the sheet (14 vs 14), 6 damage, dead at 0; a morale check from the tracker. Pictures: ${shots}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
