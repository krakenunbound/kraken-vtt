// The GM's asks of 2026-11-20, each as a person does it: every window's title-bar anchor links it (Notes
// dragged to a quick slot, closed, opened again from the slot); Notes' Private/Public at the top (new notes,
// and a note's own); a dropdown's open list readable (dark, light words); a backpack's contents dropped and
// picked up with it, and Put in on the sheet; a book's page turners staying at the bottom from page to page;
// Spells by school and class, and a player seeing only what their character's class casts (a Fighter: none).
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-desk-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs"), KRAKEN_HOME: path.join(profile, "home") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
    answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content?.[0]?.text ?? "null");
};
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
let browser = null;
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-desk", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Desk", ruleset: "D&D 5E" });
  const port = 47516;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // 1. Every window links: Notes' anchor dragged to a quick slot; closed; the slot opens it again.
  await page.click('.sidebar [data-launch="notes"]');
  await page.waitForSelector('[data-window-anchor="notes"]');
  await page.dragAndDrop('[data-window-anchor="notes"]', '[data-quick-slot="0"]');
  await page.waitForSelector('[data-quick-slot="0"].full');
  for (const launch of ["characters", "party"]) await page.click(`.sidebar [data-launch="${launch}"]`).catch(() => undefined);
  await settle(600);
  const unlinked = await page.$$eval(".window", (all) => all.filter((win) => !win.querySelector(".window-anchor")).map((win) => win.getAttribute("aria-label")));
  assert(unlinked.length === 0, `every open window has its anchor: ${unlinked.join(", ")}`);
  await tool("kraken_windows", { action: "close", kind: "notes" });
  await page.waitForSelector('[data-window-anchor="notes"]', { state: "detached" });
  await page.click('[data-quick-slot="0"]');
  await page.waitForSelector('[data-window-anchor="notes"]');
  report.push("Notes' anchor dragged to a quick slot, the window closed, the slot opens it again; every open window has an anchor");

  // 2. Notes: Private/Public at the top; new notes start as chosen; a note's own toggle.
  await page.click('[data-note-mode="new"] [data-mode="public"]');
  await page.click('[data-action="new-note"]');
  await page.waitForSelector("[data-note-window]");
  const noteId = await page.$eval("[data-note-window]", (element) => element.getAttribute("data-note-window"));
  assert((await tool("kraken_record_get", { id: noteId })).visibility === "all", "a new note started public, as the top toggle said");
  await page.click(`[data-note-window="${noteId}"] [data-note-mode="note"] [data-mode="private"]`);
  await settle(500);
  assert((await tool("kraken_record_get", { id: noteId })).visibility === "gm", "the note's own toggle made it private");
  report.push("Notes: the top toggle made the new note public; the note's own toggle made it private");

  // 3. A dropdown's list: dark, with light words.
  const colours = await page.evaluate(() => {
    const select = document.createElement("select");
    select.className = "cc-field";
    select.innerHTML = "<option>Equipped</option><option>Carried</option>";
    document.body.append(select);
    const style = getComputedStyle(select.options[1]);
    const out = { background: style.backgroundColor, color: style.color };
    select.remove();
    return out;
  });
  assert(colours.background === "rgb(26, 30, 36)" && colours.color === "rgb(236, 231, 220)", `a dropdown's options are dark with light words: ${JSON.stringify(colours)}`);
  report.push(`a dropdown's options: ${colours.background} with ${colours.color} words`);

  // 4. A backpack: what is packed in it is dropped and picked up with it; Put in on the sheet.
  const hero = await tool("kraken_record_create", {
    type: "character",
    name: "Brakka",
    owner: "",
    visibility: "gm",
    data: { ruleset: "dnd5e", level: 1, classes: { "id-00001": { name: "Fighter", level: 1 } }, inventorylist: { "id-00001": { name: "Backpack", count: 1, carried: 1 }, "id-00002": { name: "Rope, hempen (50 feet)", count: 1, carried: 1, location: "Backpack" }, "id-00003": { name: "Torch", count: 5, carried: 1, location: "Backpack" }, "id-00004": { name: "Dagger", count: 1, carried: 2 } } },
  });
  const carried = async () => Object.fromEntries(Object.values((await tool("kraken_record_get", { id: hero.id })).data.inventorylist).map((row) => [row.name, Number(row.carried)]));
  await tool("kraken_character_edit", { id: hero.id, changes: [{ path: "inventorylist.id-00001.carried", value: 0 }] });
  let now = await carried();
  assert(now.Backpack === 0 && now["Rope, hempen (50 feet)"] === 0 && now.Torch === 0 && now.Dagger === 2, `the backpack dropped, its contents with it, the dagger kept: ${JSON.stringify(now)}`);
  await tool("kraken_character_edit", { id: hero.id, changes: [{ path: "inventorylist.id-00001.carried", value: 1 }] });
  now = await carried();
  assert(now.Backpack === 1 && now["Rope, hempen (50 feet)"] === 1 && now.Torch === 1, `picked up again, its contents too: ${JSON.stringify(now)}`);
  // The sheet, opened from a quick slot (its link), then its Inventory tab.
  await tool("kraken_quickslots", { slots: [{ kind: "window", window: "notes", title: "Notes", label: "Notes" }, null, { kind: "sheet", record: hero.id, label: "Brakka" }, null, null, null, null, null, null, null, null, null] });
  await page.waitForSelector('[data-quick-slot="2"].full');
  await page.click('[data-quick-slot="2"]');
  await page.waitForSelector('[data-window-anchor="sheet:' + hero.id + '"], .window[aria-label="Brakka"]', { timeout: 15000 });
  const inventoryTab = await page.$('.window[aria-label="Brakka"] :is([role="tab"], button):has-text("Inventory")');
  if (inventoryTab) await inventoryTab.click();
  await page.waitForSelector('[data-action="put-in"]', { timeout: 10000 });
  await page.selectOption('[data-action="put-in"]', "Backpack");
  await settle(800);
  const dagger = Object.values((await tool("kraken_record_get", { id: hero.id })).data.inventorylist).find((row) => row.name === "Dagger");
  assert(dagger.location === "Backpack", `Put in puts the dagger in the backpack: ${JSON.stringify(dagger)}`);
  await page.click('[data-action="container-drop"]');
  await settle(800);
  now = await carried();
  assert(now.Backpack === 0 && now.Dagger === 0 && now.Torch === 0, `the sheet's Drop drops the backpack and all in it: ${JSON.stringify(now)}`);
  await page.click('[data-action="container-pickup"]');
  await settle(800);
  now = await carried();
  assert(now.Backpack === 1 && now.Dagger === 1 && now.Torch === 1, `Pick up picks it all up: ${JSON.stringify(now)}`);
  report.push("a backpack dropped (tool and sheet) drops what is in it, picked up picks it up; Put in on the sheet puts an item in");

  // 5. A book's page turners: at the bottom of the window, page after page.
  const srd = (await tool("kraken_books", { action: "list" })).find((book) => /SRD 5\.2\.1 Player/i.test(book.title ?? book.name ?? ""));
  if (srd) {
    if (!srd.active) await tool("kraken_books", { action: "activate", book: srd.id });
    const contents = await tool("kraken_books", { action: "contents", book: srd.id });
    const pages = JSON.stringify(contents).match(/"id":"([^"]+)"/g)?.map((item) => item.slice(6, -1)) ?? [];
    await tool("kraken_quickslots", { slots: [{ kind: "window", window: "notes", title: "Notes", label: "Notes" }, { kind: "book", book: srd.id, page: pages[1] ?? pages[0], label: "SRD" }, null, null, null, null, null, null, null, null, null, null] });
    await page.click('[data-quick-slot="1"]');
    await page.waitForSelector(".book-turn", { timeout: 20000 });
    const spots = [];
    for (let turn = 0; turn < 4; turn++) {
      await settle(500);
      spots.push(await page.evaluate(() => {
        const nav = document.querySelector(".book-page > .book-turn"), box = nav.closest(".book-page");
        return Math.round(box.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom);
      }));
      await page.click('.book-turn [aria-label="Next page"]');
    }
    assert(spots.every((gap) => gap === spots[0]) && spots[0] >= 0 && spots[0] < 40, `the page turners stay at the bottom, page after page: ${spots.join(", ")} px from the bottom`);
    report.push(`a book's page turners stay ${spots[0]} px from the window's bottom over four pages`);
  } else report.push("(no SRD book here: the page turners not checked)");

  // 6. Spells: School and Class for the GM; a player's Fighter sees none, a Wizard sees the wizard's.
  if (srd) await tool("kraken_books", { action: "share", book: srd.id });
  await page.click('.sidebar [data-launch="records:spell"]');
  await page.waitForSelector('[data-filter="school"]', { timeout: 15000 });
  await page.waitForSelector('[data-filter="class"]');
  await page.selectOption('[data-filter="class"]', "Wizard");
  await settle(400);
  const wizardRows = await page.$$eval('.window[data-window="records"] [data-record-row], [data-window="records"] [data-record-row]', (all) => all.length).catch(() => 0);
  report.push(`Spells: School and Class filters; Wizard shows ${wizardRows} spells`);
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "Ann");
  await seat.fill('input[name="account-password"]', "ann-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await tool("kraken_characters", { action: "give", id: hero.id, owner: "Ann" });
  await settle(800);
  await seat.keyboard.press("Escape").catch(() => undefined);
  await seat.click('.sidebar [data-launch="records:spell"]');
  await seat.waitForSelector("[data-records-empty]", { timeout: 15000 });
  const said = await seat.textContent("[data-records-empty]");
  assert(/class casts none/i.test(said), `Ann's Fighter sees no spells: "${said}"`);
  const mage = await tool("kraken_record_create", { type: "character", name: "Ilsa", owner: "", visibility: "gm", data: { ruleset: "dnd5e", level: 1, classes: { "id-00001": { name: "Wizard", level: 1 } } } });
  await tool("kraken_characters", { action: "give", id: mage.id, owner: "Ann" });
  await seat.waitForFunction(() => !document.querySelector("[data-records-empty]") && document.querySelectorAll('[data-window="records"] [data-record-row]').length > 0, null, { timeout: 15000 });
  const annSees = await seat.$$eval('[data-window="records"] [data-record-row]', (all) => all.length);
  report.push(`a player's Fighter sees no spells ("${said.trim()}"); with a Wizard too she sees ${annSees}`);
  assert(mage.id, "the wizard was made");
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok desk ui:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
