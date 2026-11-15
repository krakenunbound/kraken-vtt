// The Basic Fantasy sheet, every tab and every control, in the real app, for a
// change that must not move a pixel or change what a control does (the core
// UI's step 5, docs/core-ui-design.md 7.10). The GM hosts a Basic Fantasy
// campaign with its books and builds three characters for a test player
// (kraken_build_character, fixed specs): a 3rd-level Cleric (spells a day,
// Turn undead, in a fight), a 2nd-level Elf Magic-User (a spellbook) and a
// 4th-level Halfling Thief (thief abilities). Then:
//   - every tab of each sheet, GM (Kraken full screen) and player (Chrome
//     2560x1440): a shot of the sheet alone and its controls' signature
//     (tag, attributes, text, disabled, value), in <out>/
//   - every control pressed once, by the player and (level-up, XP, loyalty) the
//     GM: what each did to the record, or the chat line it posted, in
//     <out>/bfrpg-presses.json (dice numbers left out)
// Run it on two builds and compare the folders with shot-sheets.mjs diff.
//
//   node scripts/verify-bfrpg-sheet-ui.mjs <out>
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

const out = process.argv[2] ?? path.join(tmpdir(), "kraken-bfrpg-sheet-ui");
mkdirSync(out, { recursive: true });
const checks = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const profile = mkdtempSync(path.join(tmpdir(), "kraken-bfrpg-sheet-"));
const env = { ...process.env, KRAKEN_WINDOW_AT: AT, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
});
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
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
const dataOf = async (id) => {
  const got = await tool("kraken_record_get", { id });
  return got.data ?? got.record?.data;
};
// Every element's tag, attributes (not style or ids), its own text (whitespace collapsed), disabled, value, checked.
const signature = (sheet) =>
  sheet.evaluate((sheet) =>
    [sheet, ...sheet.querySelectorAll("*")].map((item) => ({
      tag: item.tagName,
      attrs: Object.fromEntries([...item.attributes].filter((attr) => !["style", "id", "for", "src", "srcset", "data-test-sheet"].includes(attr.name)).map((attr) => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b))),
      text: [...item.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").replace(/\s+/g, " ").trim(),
      ...(item.disabled !== undefined ? { disabled: item.disabled } : {}),
      ...(item.value !== undefined && !["LI", "BUTTON"].includes(item.tagName) ? { value: item.value } : {}),
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
    })),
  );
const presses = [];
const chatSince = async (count) => {
  const lines = await tool("kraken_chat_log", { count: 400 });
  return (Array.isArray(lines) ? lines.slice(count) : []).map((line) => `${line.text ?? ""} ${line.roll?.label ?? ""}`.replace(/\d+/g, "#").trim());
};
const chatCount = async () => {
  const lines = await tool("kraken_chat_log", { count: 400 });
  return Array.isArray(lines) ? lines.length : 0;
};

let browser = null;
const PORT = 48900 + Math.floor(Math.random() * 300);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "BF sheet UI", ruleset: "Basic Fantasy" });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  for (const title of ["Basic Fantasy Player's Handbook", "Basic Fantasy Game Master's Guide"]) {
    const book = shelf.find((item) => item.title === title);
    assert(book, `${title} on the shelf`);
    if (!book.active) await tool("kraken_books", { action: "activate", book: book.id });
  }
  await settle(1500);
  // The 3D dice off on the GM's screen, so no die rolls across a shot.
  const diceOff = async (where) => {
    await where.fill('input[aria-label="Message"]', "/dice3d off");
    await where.press('input[aria-label="Message"]', "Enter");
    await settle(400);
  };
  await diceOff(page);

  // Three characters, each a different side of the sheet.
  const SPECS = [
    { name: "Sister Ada", race: "Human", class: "Cleric", level: 3, abilities: { strength: 12, intelligence: 10, wisdom: 15, dexterity: 11, constitution: 13, charisma: 10 }, hpRoll: 5, gold: 120, buy: [["Leather Armor", 1], ["Shield", 1], ["Backpack", 1]], alignment: "Lawful" },
    { name: "Corvin", race: "Elf", class: "Magic-User", level: 2, abilities: { strength: 9, intelligence: 16, wisdom: 10, dexterity: 13, constitution: 10, charisma: 11 }, hpRoll: 3, gold: 60, buy: [["Backpack", 1], ["Torches, 6", 1]], spells: ["Sleep"], alignment: "Neutral" },
    { name: "Pip Underbough", race: "Halfling", class: "Thief", level: 4, abilities: { strength: 10, intelligence: 11, wisdom: 9, dexterity: 16, constitution: 12, charisma: 10 }, hpRoll: 4, gold: 90, buy: [["Longsword/Scimitar", 1], ["Leather Armor", 1], ["Backpack", 1]], alignment: "Chaotic" },
  ];
  const ids = {};
  for (const spec of SPECS) {
    const built = await tool("kraken_build_character", { spec, owner: "A test player" });
    ids[spec.name] = built.id ?? built.record?.id;
    assert(ids[spec.name], `${spec.name} built`);
  }
  // The Cleric in a fight, on its turn (Turn undead on the sheet and the tracker).
  await tool("kraken_combat", { action: "add", recordId: ids["Sister Ada"] });
  await tool("kraken_combat", { action: "next" });
  // An undead foe for Turn undead to work on (the Game Master's Guide's Skeleton), the Cleric's turn kept.
  const npcs = await tool("kraken_records_list", { type: "npc", name: "skeleton" });
  const skeleton = (npcs.records ?? npcs).find((item) => /skeleton/i.test(item.name));
  assert(skeleton, "a Skeleton among the monsters");
  await tool("kraken_combat", { action: "add", recordId: skeleton.id });
  const fight = await tool("kraken_combat", { action: "view" });
  await tool("kraken_combat", { action: "set-turn", id: fight.entries.find((entry) => entry.recordId === ids["Sister Ada"]).id });

  // A character's sheet among the open ones (marked by its name field, which is a property, not an attribute).
  const sheetOf = async (where, name) => {
    await where.waitForFunction((who) => [...document.querySelectorAll(".cc-sheet")].some((sheet) => sheet.querySelector(".cc-name")?.value === who), name, { timeout: 20000 });
    const mark = name.toLowerCase().replace(/[^a-z]+/g, "-");
    await where.evaluate(([who, tag]) => [...document.querySelectorAll(".cc-sheet")].find((sheet) => sheet.querySelector(".cc-name")?.value === who)?.setAttribute("data-test-sheet", tag), [name, mark]);
    return where.locator(`.cc-sheet[data-test-sheet="${mark}"]`);
  };
  const shootTabs = async (where, who, name) => {
    const slug = `${who}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    const sheet = await sheetOf(where, name);
    const tabs = await sheet.locator("[data-sheet-tab]").evaluateAll((items) => items.map((item) => item.getAttribute("data-sheet-tab")));
    assert(tabs.join() === "main,combat,skills,spells,inventory,notes", `${name}'s tabs: ${tabs.join()}`);
    for (const tab of tabs) {
      await sheet.locator(`[data-sheet-tab="${tab}"]`).click();
      await where.mouse.move(2, 2);
      await settle(700);
      await sheet.screenshot({ path: path.join(out, `bfrpg-${slug}-sheet-${tab}.png`), animations: "disabled", caret: "hide" });
      writeFileSync(path.join(out, `bfrpg-${slug}-sheet-${tab}.json`), JSON.stringify(await signature(sheet), null, 1));
    }
  };
  // The GM: each sheet in its window.
  for (const spec of SPECS) {
    await tool("kraken_windows", { action: "open", kind: "sheet", record: ids[spec.name] });
    await shootTabs(page, "gm", spec.name);
    await tool("kraken_windows", { action: "close", kind: "sheet", record: ids[spec.name] }).catch(() => undefined);
    await page.waitForSelector(".cc-sheet", { state: "detached", timeout: 10000 }).catch(() => undefined);
  }
  // The player, in Chrome at 2560x1440: Characters, then each card.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await diceOff(seat);
  const openCard = async (name) => {
    if (!(await seat.$(".charselect-card"))) await seat.click('.sidebar [data-launch="characters"]');
    await seat.waitForSelector(".charselect-card", { timeout: 15000 });
    await seat.locator(".charselect-card", { hasText: name }).first().click();
    await sheetOf(seat, name);
  };
  for (const spec of SPECS) {
    await openCard(spec.name);
    await shootTabs(seat, "player", spec.name);
  }

  // Every control, pressed once by the player (the GM's own where only the GM may).
  // raw: keep the numbers in what was posted (a roll whose dice were fixed first).
  const press = async (what, act, read, raw = false) => {
    const before = await chatCount();
    await act();
    await settle(1200);
    const result = read ? await read() : null;
    const lines = await tool("kraken_chat_log", { count: 400 });
    presses.push({ what, result, posted: raw ? (Array.isArray(lines) ? lines.slice(before) : []).map((line) => `${line.text ?? ""} ${line.roll?.label ?? ""} ${line.roll?.total ?? ""}`.trim()) : await chatSince(before) });
  };
  const tab = async (sheet, id) => {
    await sheet.locator(`[data-sheet-tab="${id}"]`).click();
    await settle(300);
  };
  const type = async (locator, value) => {
    await locator.fill(String(value));
    await locator.press("Tab");
  };

  // The Cleric: the main tab's fields and rolls, the modifier, attacks, Turn undead, spell slots, prepared spells.
  await openCard("Sister Ada");
  let sheet = await sheetOf(seat, "Sister Ada");
  const ada = ids["Sister Ada"];
  await tab(sheet, "main");
  await press("strength score", () => type(sheet.locator('[aria-label="strength score"]'), 13), async () => (await dataOf(ada)).abilities.strength);
  await press("strength roll", () => sheet.locator('[data-roll-check="strength"]').click());
  await press("roll modifier then a wisdom roll (a 10 fixed)", async () => {
    await tool("kraken_dice_force", { values: [10] });
    await sheet.locator('[aria-label="Roll modifier"]').fill("2");
    await sheet.locator('[data-roll-check="wisdom"]').click();
  }, null, true);
  await sheet.locator('[aria-label="Roll modifier"]').fill("0");
  await press("AC misc", () => type(sheet.locator('[aria-label="AC misc"]'), 1), async () => (await dataOf(ada)).ac);
  await press("damage taken", () => type(sheet.locator('[aria-label="Damage taken"]'), 2), async () => (await dataOf(ada)).hp);
  await press("death save misc", () => type(sheet.locator('[aria-label="death misc"]'), 1), async () => (await dataOf(ada)).saves.death);
  await press("a save in the fight", () => sheet.locator('[data-roll-save="wands"]').click());
  await press("alignment", () => type(sheet.locator('[aria-label="Alignment"]'), "Neutral"), async () => (await dataOf(ada)).alignment);
  await tab(sheet, "combat");
  const attacks = await sheet.locator("[data-attack]").count();
  if (attacks) {
    await press("attack", () => sheet.locator('[data-attack] [data-action="attack"]').first().click());
    await press("damage", () => sheet.locator('[data-attack] [data-action="damage"]').first().click());
  }
  await press("turn undead", () => sheet.locator('.cc-page [data-action="turn-undead"]').click());
  await tab(sheet, "spells");
  await press("a spell slot used", () => sheet.locator('[aria-label="1st level spell 1"]').click(), async () => (await dataOf(ada)).spellcasting.used);
  await press("the slot back", () => sheet.locator('[aria-label="1st level spell 1"]').click(), async () => (await dataOf(ada)).spellcasting.used);
  await press("prepared spells", () => type(sheet.locator('textarea[aria-label="Prepared spells"]'), "Cure Light Wounds\nLight"), async () => (await dataOf(ada)).prepared);
  await tab(sheet, "inventory");
  const first = sheet.locator("[data-item]").first();
  const itemName = await first.locator("span").first().textContent();
  await press("carried", () => first.locator("select").selectOption("1"), async () => Object.values((await dataOf(ada)).inventorylist).map((item) => [item.name, item.carried]));
  await press("count", () => type(first.locator('input[aria-label$=" count"]'), 2), async () => Object.values((await dataOf(ada)).inventorylist).map((item) => [item.name, item.count]));
  await press("count 0", () => type(first.locator('input[aria-label$=" count"]'), 0), async () => first.locator('input[aria-label$=" count"]').inputValue());
  await press("a coin", () => type(sheet.locator('.five-coins input').first(), 7), async () => Object.values((await dataOf(ada)).coins).map((coin) => [coin.name, coin.amount]));
  await press("drop an item", () => sheet.locator(`[aria-label="Drop ${itemName?.split(" ")[0]}"], [data-item] button.ghost`).first().click(), async () => Object.values((await dataOf(ada)).inventorylist).map((item) => item.name).sort());
  await tab(sheet, "notes");
  await press("player", () => type(sheet.locator('[aria-label="Player"]'), "Tester"), async () => (await dataOf(ada)).playername);
  await press("roll loyalty", () => sheet.locator('[data-action="loyalty-roll"]').click());
  await press("appearance", () => type(sheet.locator('textarea[aria-label="Appearance"]'), "Grey robes"), async () => (await dataOf(ada)).appearance);
  assert(await sheet.locator('[aria-label="Loyalty"]').getAttribute("readonly") !== null, "a player cannot type the loyalty");

  // The Magic-User: the spellbook.
  await openCard("Corvin");
  sheet = await sheetOf(seat, "Corvin");
  await tab(sheet, "spells");
  await press("spellbook", () => type(sheet.locator('textarea[aria-label="Spellbook"]'), "Read Magic\nSleep\nLight"), async () => (await dataOf(ids.Corvin)).spellbook);

  // The Thief: a thief ability's misc and roll.
  await openCard("Pip Underbough");
  sheet = await sheetOf(seat, "Pip Underbough");
  await tab(sheet, "skills");
  const skill = await sheet.locator("[data-skill]").first().getAttribute("data-skill");
  await press("thief misc", () => type(sheet.locator(`[data-skill="${skill}"] input`), 5), async () => (await dataOf(ids["Pip Underbough"])).thiefskills[skill]);
  await press("thief roll", () => sheet.locator(`[data-roll-skill="${skill}"]`).click());
  await tab(sheet, "combat");
  await press("attack (not in a fight)", () => sheet.locator('[data-attack] [data-action="attack"]').first().click());
  await press("damage", () => sheet.locator('[data-attack] [data-action="damage"]').first().click());
  // At 0 hit points: the main tab's warning.
  await tab(sheet, "main");
  const pip = await dataOf(ids["Pip Underbough"]);
  await press("damage to 0 hit points", () => type(sheet.locator('[aria-label="Damage taken"]'), pip.hp.total), async () => [await sheet.locator('[data-status="Dead"]').count(), await sheet.locator('[data-stat="hp"]').textContent()]);

  // The GM: the experience, a level up, the loyalty.
  await tool("kraken_windows", { action: "open", kind: "sheet", record: ids["Pip Underbough"] });
  const gmSheet = await sheetOf(page, "Pip Underbough");
  await press("experience (GM)", () => type(gmSheet.locator('[aria-label="Experience"]'), 5000), async () => (await dataOf(ids["Pip Underbough"])).exp);
  await press("level up (GM)", () => gmSheet.locator('[data-action="level-up"]').click(), async () => (await dataOf(ids["Pip Underbough"])).level);
  await gmSheet.locator('[data-sheet-tab="notes"]').click();
  await press("loyalty (GM)", () => type(gmSheet.locator('[aria-label="Loyalty"]'), 9), async () => (await dataOf(ids["Pip Underbough"])).loyalty);

  writeFileSync(path.join(out, "bfrpg-presses.json"), JSON.stringify(presses, (key, value) => (key === "id" ? undefined : value), 1));
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok bfrpg sheet ui: ${checks.length} checks, ${presses.length} controls pressed; shots, signatures and presses in ${out}`);
} catch (error) {
  console.error(`FAILED after ${checks.length} checks: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
