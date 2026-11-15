// Bookkeeping at the table, as the GM and a test player see it: the GM's app full screen on its
// monitor and a player's Chrome at 2560x1440. A D&D 5E campaign; Ryn (the test player's ranger)
// carries the SRD's own longbow, arrows, an Explorer's Pack, a bag of holding and a potion.
// 1. The player opens Ryn's sheet, Inventory: Supplies with the load meter; Unpack the pack
//    (torches, rations, oil, a waterskin, a backpack as a container); Light a torch (one fewer).
// 2. A fight: three arrows at a goblin; End combat; the player's Recover button picks one up.
// 3. The potion used from Supplies; the GM's Settings > Bookkeeping; encumbrance switched off
//    on the GM's screen, the player's meter says so.
// 4. The party sheet's Rest the party (Long rest): the clock moves on 8 hours; the tracker's rest
//    buttons after the fight.
// Shots (GM and player, full screen) go to the folder printed at the end.
//   node scripts/verify-bookkeeping-ui.mjs        (npm run build first)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { ITEMS } from "../games/srd-5e/gear.mjs";
import { MAGIC_ITEMS } from "../games/srd-5e/magic-items.mjs";

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
};
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-bookkeeping-ui-"));
mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
mkdirSync(path.join(profile, "packs"), { recursive: true });
const shots = path.join(tmpdir(), "kraken-bookkeeping-ui");
mkdirSync(shots, { recursive: true });
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const env = { ...process.env, KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
});
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
page.on("pageerror", (error) => problems.push(`GM page: ${error.message}`));
const shoot = async (where, name) => {
  await settle(1400);
  await where.screenshot({ path: path.join(shots, `${name}.png`) });
  console.log(`     shot ${path.join(shots, `${name}.png`)}`);
};
const item = (name) => {
  const { __category, ...data } = ITEMS.find((row) => row.name === name) ?? MAGIC_ITEMS.find((row) => row.name === name);
  return data;
};

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Arrows and rations", ruleset: "D&D 5E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47463, password: "" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_table_options", { diceHold: 0.5 });
  const abilities = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: stat === "dexterity" ? 16 : 12 }]));
  const inventorylist = {
    "id-00001": { ...item("Longbow"), carried: 2 },
    "id-00002": { ...item("Arrows (20)"), count: 1, carried: 1 },
    "id-00003": { ...item("Explorer's Pack"), carried: 1 },
    "id-00004": { ...item("Bag of Holding"), weight: 5, carried: 1 },
    "id-00005": { name: "Potion of Healing", type: "Potion", subtype: "Common", count: 2, weight: 0.5, description: "You regain 2d4 + 2 Hit Points when you drink this potion." },
    "id-00006": { ...item("Leather Armor"), carried: 2 },
    "id-00007": { ...item("Shortsword"), carried: 1 },
  };
  const ryn = await tool("kraken_record_create", { type: "character", name: "Ryn", owner: "a test player", visibility: "owner", data: { ruleset: "dnd5e", level: 3, abilities, hp: { total: 28, wounds: 9 }, hitdice: { die: 10, total: 3, used: 0 }, speed: "30 ft.", coins: { "id-00001": { name: "GP", amount: 40 } }, inventorylist } });
  const goblin = await tool("kraken_record_create", { type: "npc", name: "Goblin", data: { hp: 30, ac: 13 } });
  const id = (record) => record.id ?? record.record?.id;
  await tool("kraken_party_edit", { members: [id(ryn)] });
  await tool("kraken_open_adventure", { path: path.resolve("games/basic-fantasy/maps/hobs-ford-mill-studio.webp") });
  await settle(1500);
  await tool("kraken_map", { share: true });
  await tool("kraken_token_place", { recordId: id(ryn), col: 4, row: 6 });
  await tool("kraken_token_place", { recordId: id(goblin), col: 10, row: 6 });
  const map = await tool("kraken_map", {});
  const tokenOf = (record) => map.tokens.find((token) => token.recordId === id(record));

  // The test player in Chrome, at 2560x1440: Ryn's sheet, Inventory.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage();
  seat.on("pageerror", (error) => problems.push(`player: ${error.message}`));
  await seat.goto("http://127.0.0.1:47463/");
  await seat.fill('input[name="name"]', "a test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await settle(800);
  // The shared map lies over the desktop: closed, so the sheet can be seen.
  const closeMap = async (where) => {
    const close = where.locator('[data-window="map"] [aria-label="Close"]').first();
    if (await close.count()) await close.click().catch(() => undefined);
  };
  await closeMap(seat);
  if (!(await seat.$(".charselect-card"))) await seat.click('.sidebar [data-launch="characters"]');
  await seat.waitForSelector(".charselect-card", { timeout: 15000 });
  await seat.locator(".charselect-card", { hasText: "Ryn" }).first().click();
  const sheet = seat.locator('.cc-sheet[data-ruleset="dnd5e"]');
  await sheet.waitFor({ timeout: 15000 });
  await sheet.locator('[data-sheet-tab="inventory"]').click();
  const supplies = sheet.locator('[data-part="supplies"]');
  await supplies.waitFor({ timeout: 10000 });
  check(/Unencumbered/.test(await supplies.textContent()), "the player's Supplies: the load meter, unencumbered");
  await shoot(seat, "1-player-supplies");
  // Unpack the Explorer's Pack.
  await supplies.locator('[data-action="unpack"]').click();
  await seat.waitForFunction(() => /Light a torch/.test(document.querySelector('[data-part="supplies"]')?.textContent ?? ""), null, { timeout: 8000 });
  const view = async () => tool("kraken_bookkeeping", { id: id(ryn), action: "view" });
  let now = await view();
  check(now.rations.food === 10 && now.load.containers.some((box) => box.name === "Backpack"), `unpacked: 10 days of food, a backpack (${now.rations.food})`);
  await supplies.locator('[data-action="light-torch"]').click();
  await settle(800);
  const rows = async () => Object.values((await tool("kraken_record_get", { id: id(ryn) })).data?.inventorylist ?? (await tool("kraken_record_get", { id: id(ryn) })).record?.data?.inventorylist ?? {});
  check((await rows()).find((row) => row.name === "Torch")?.count === 9, "the torch lit from Supplies came out of the pack (9 left)");
  await shoot(seat, "2-player-unpacked-torch-lit");

  // A fight: three arrows at the goblin; End combat; Recover.
  for (const [record, faction] of [[ryn, "friend"], [goblin, "foe"]]) await tool("kraken_combat", { action: "add", entry: { recordId: id(record), tokenId: tokenOf(record).id, name: record.name ?? (record === ryn ? "Ryn" : "Goblin"), faction } });
  const ct = await tool("kraken_combat", { action: "view" });
  const rynEntry = ct.entries.find((entry) => entry.recordId === id(ryn));
  const gobEntry = ct.entries.find((entry) => entry.recordId === id(goblin));
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "target", id: rynEntry.id, targetId: gobEntry.id, on: true });
  for (let shot = 0; shot < 3; shot += 1) await tool("kraken_combat", { action: "attack", recordId: id(ryn), weapon: "id-00001" });
  now = await view();
  check(now.ammo.find((row) => row.weapon === "Longbow")?.left === 17, `three arrows fired: ${now.ammo.find((row) => row.weapon === "Longbow")?.left} left`);
  await tool("kraken_combat", { action: "end" });
  const recover = supplies.locator('[data-action="recover-ammo"]');
  await recover.waitFor({ timeout: 8000 });
  check(/Recover 1 Arrows/.test(await recover.textContent()), `the player is offered the arrows back: ${await recover.textContent()}`);
  await shoot(seat, "3-player-recover-offered");
  await recover.click();
  await settle(800);
  now = await view();
  check(now.ammo.find((row) => row.weapon === "Longbow")?.left === 18 && now.recoverable.length === 0, "one picked up (18)");

  // The potion from Supplies.
  await supplies.locator('[data-consumable="id-00005"] [data-action="use-item"]').click();
  await settle(800);
  check((await rows()).find((row) => row.name === "Potion of Healing")?.count === 1, "a potion drunk from Supplies");

  // The GM: Ryn's sheet, Settings > Bookkeeping, encumbrance off.
  await closeMap(page);
  await tool("kraken_windows", { action: "open", kind: "sheet", record: id(ryn) });
  const gmSheet = page.locator('.cc-sheet[data-ruleset="dnd5e"]');
  await gmSheet.waitFor({ timeout: 15000 });
  await gmSheet.locator('[data-sheet-tab="inventory"]').click();
  await gmSheet.locator('[data-part="supplies"]').waitFor();
  await shoot(page, "4-gm-supplies");
  await tool("kraken_windows", { action: "open", kind: "settings" });
  const section = page.locator('section[data-setting="bookkeeping"], [data-setting="bookkeeping"]').first();
  await section.waitFor({ timeout: 10000 });
  await section.scrollIntoViewIfNeeded();
  await shoot(page, "5-gm-settings-bookkeeping");
  await page.locator('input[data-setting="bookkeeping-encumbrance"]').click();
  await settle(800);
  check((await tool("kraken_table_options", {})).bookkeeping.encumbrance === false, "the GM switched encumbrance off in Settings");
  await seat.waitForFunction(() => /switched encumbrance off/.test(document.querySelector('[data-part="supplies"]')?.textContent ?? ""), null, { timeout: 8000 });
  check(true, "the player's meter says the load is not counted");
  await shoot(seat, "6-player-encumbrance-off");
  await page.locator('input[data-setting="bookkeeping-encumbrance"]').click();
  await tool("kraken_windows", { action: "close", kind: "settings" }).catch(() => undefined);

  // Rest the party from the party sheet: 8 hours on.
  const before = await tool("kraken_calendar", {});
  await tool("kraken_windows", { action: "open", kind: "party" });
  const rest = page.locator('[data-part="rest-party"] [data-action="party-long-rest"]').first();
  await rest.waitFor({ timeout: 10000 });
  await shoot(page, "7-gm-party-rest");
  await rest.click();
  await settle(1000);
  const after = await tool("kraken_calendar", {});
  check((before.hour + 8) % 24 === after.hour, `the party's long rest moved the clock 8 hours (${before.hour} to ${after.hour})`);
  now = await view();
  check(now.rations.food === 9, `the rest ate a ration (${now.rations.food} days left)`);
  // The tracker after the fight: its rest buttons.
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.locator('.ct-rest [data-action="party-short-rest"]').first().waitFor({ timeout: 10000 });
  await shoot(page, "8-gm-tracker-rest");
} catch (error) {
  problems.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
console.log(`\nshots: ${shots}`);
if (problems.length) {
  console.log(`FAIL verify-bookkeeping-ui: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
} else console.log("ok verify-bookkeeping-ui");
