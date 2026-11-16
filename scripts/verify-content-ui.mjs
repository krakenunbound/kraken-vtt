// The campaign's own content in the interface (RecordEditor.tsx, RichText.tsx,
// Library.tsx's Campaign sections), on a Cairn campaign with its shipped
// books (no FG modules, no packs of the GM's), the GM's app full screen on
// its monitor and a test player in Chrome at 2560x1440:
//   1. New on the NPCs list opens the record unlocked: its fields (from the
//      bestiary's), the editor's text with bold and boxed text; locked, it reads.
//   2. Right-click Duplicate ("(copy)") and Delete with Undo; Copy to campaign
//      for a book's creature.
//   3. The eye's menu: shared with the test player alone; the player's list has it.
//   4. The story: New under World > Story's Campaign, a text page with a heading
//      and boxed text, a picture dropped in as its own page; shared, the player reads it.
//   5. Tables: FG's Import Table pasted, Roll from its window, the editor's rows;
//      the player's /rollon.
//   6. An item made unidentified with its window's Identified box: the player sees
//      its unidentified name.
//   7. An encounter: New, an NPC dropped in, Add to tracker, End encounter (XP to the party).
//   8. A treasure parcel with the item and coins, To the party sheet; a quest onto the XP tab.
// Screenshots in %TEMP%/kraken-content-ui.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-content-ui-"));
for (const dir of ["no-fg-modules", "Packs"]) mkdirSync(path.join(profile, dir), { recursive: true });
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const env = { ...process.env, KRAKEN_WINDOW_AT: AT, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
const shots = path.join(tmpdir(), "kraken-content-ui");
mkdirSync(shots, { recursive: true });
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
const screen = await app.evaluate(async ({ BrowserWindow, screen: displays }) => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const display = displays.getDisplayMatching(win.getBounds());
  return `${display.size.width}x${display.size.height}`;
});
await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  try {
    const message = JSON.parse(line);
    answers.get(message.id)?.(message);
  } catch {
    // not an answer
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
page.on("console", (message) => message.type() === "error" && console.log("gm console:", message.text()));
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const records = async (type) => (await tool("kraken_records_list", { type, limit: 2000 })).records;
const get = (id) => tool("kraken_record_get", { id });
const until = async (test, label, ms = 10000) => {
  const start = Date.now();
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`waiting for ${label}`);
    await settle(150);
  }
};
// A link dropped somewhere (as a drag from a list would), in the page that has it.
const dropLink = (where, selector, link) =>
  where.evaluate(
    ([target, slot]) => {
      const element = document.querySelector(target);
      if (!element) throw new Error(`no ${target}`);
      const transfer = new DataTransfer();
      transfer.setData("text/kraken-slot", JSON.stringify(slot));
      const box = element.getBoundingClientRect();
      for (const type of ["dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 20 }));
    },
    [selector, link],
  );
const topRecord = () => page.locator(".window").filter({ has: page.locator(".record-window") }).last();
const closeRecords = async () => {
  for (const button of await page.$$('.window[data-window="record"] button[aria-label^="Close"]')) await button.click({ timeout: 2000 }).catch(() => undefined);
  await settle(150);
};
const closeAll = async () => {
  for (let pass = 0; pass < 3; pass++) {
    const buttons = await page.$$('.window:not([data-window="map"]) button[aria-label^="Close"]');
    if (!buttons.length) return;
    for (const button of buttons) await button.click({ timeout: 2000 }).catch(() => undefined);
    await settle(150);
  }
};

let browser = null;
const PORT = 48500 + Math.floor(Math.random() * 400);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Content UI", ruleset: "Cairn" });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  for (const book of (Array.isArray(listed) ? listed : listed.books ?? []).filter((item) => /Cairn|Twin Lakes/.test(item.title))) await tool("kraken_books", { action: "activate", book: book.id });
  await until(async () => (await records("npc")).length > 10, "the bestiary's creatures", 30000);

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });

  // 1. New on the NPCs list: unlocked, the bestiary's fields, the editor's text.
  await page.click('.sidebar [data-launch="records:npc"]');
  await page.fill('[aria-label="New NPC name"]', "Bog Hag");
  await page.click('[data-action="record-new"]');
  await page.waitForSelector('.record-window [data-record-editor]');
  const hag = (await records("npc")).find((item) => item.name === "Bog Hag");
  assert(hag, "the new NPC");
  const editor = page.locator(`[data-record-editor="${hag.id}"]`);
  const fieldLabels = await editor.locator("dl.record-fields dt").allTextContents();
  assert(fieldLabels.length > 3, `a new NPC offers the bestiary's fields: ${fieldLabels.join(", ")}`);
  const numberField = editor.locator("dl.record-fields input.cc-field.number").first();
  const numberLabel = await numberField.getAttribute("aria-label");
  await numberField.fill("12");
  await numberField.press("Enter");
  const body = editor.locator('.rt-body[aria-label="Description"]');
  await body.click();
  await page.keyboard.type("She waits in the reeds. ");
  await editor.locator('[data-rt="bold"]').click();
  await page.keyboard.type("Never bargain.");
  await editor.locator('[data-rt="bold"]').click();
  await page.keyboard.press("Enter");
  await editor.locator('[data-rt="frame"]').click();
  await page.keyboard.type("The water goes still.");
  await page.locator(`.record-window[data-record="${hag.id}"] h3`).click();
  const hagNow = await until(async () => {
    const record = await get(hag.id);
    return /<frame>/.test(record.data.text ?? "") ? record : null;
  }, "the text saved");
  assert(/<b>Never bargain\.<\/b>/.test(hagNow.data.text) && /<frame>The water goes still\.<\/frame>/.test(hagNow.data.text), `the text in FG's tags: ${hagNow.data.text}`);
  const key = Object.keys(hagNow.data).find((name) => hagNow.data[name] === 12);
  assert(key, `the number field (${numberLabel}) saved: ${JSON.stringify(hagNow.data)}`);
  await page.screenshot({ path: path.join(shots, "1-new-npc-editing.png") });
  await page.click(`.record-window[data-record="${hag.id}"] [data-action="record-lock"]`);
  await page.waitForSelector(`.record-window[data-record="${hag.id}"] .read-aloud-frame`);
  assert(await page.isVisible(`.record-window[data-record="${hag.id}"] .formatted-text b`), "locked, it reads: bold and boxed text with its read-aloud button");
  // 1b. FG's Vehicles (Campaign) and Locations (World): a new one starts with FG's fields to fill in.
  await page.click('.sidebar [data-launch="records:vehicle"]');
  await page.fill('[aria-label="New Vehicle name"]', "Supply wagon");
  await page.click('form:has([aria-label="New Vehicle name"]) [data-action="record-new"]');
  const wagon = await until(async () => (await records("vehicle")).find((item) => item.name === "Supply wagon"), "the new vehicle");
  await page.waitForSelector(`[data-record-editor="${wagon.id}"] dl.record-fields dt`);
  const wagonFields = await page.locator(`[data-record-editor="${wagon.id}"] dl.record-fields dt`).allTextContents();
  assert(["Speed", "Crew", "Cargo"].every((label) => wagonFields.includes(label)), `a vehicle's fields: ${wagonFields.join(", ")}`);
  await page.click('.sidebar [data-launch="records:location"]');
  await page.fill('[aria-label="New Location name"]', "Saltmarsh");
  await page.click('form:has([aria-label="New Location name"]) [data-action="record-new"]');
  await until(async () => (await records("location")).some((item) => item.name === "Saltmarsh"), "the new location");
  await page.screenshot({ path: path.join(shots, "1b-vehicle-location.png") });
  // Their windows closed again (the sidebar toggles a list), for the steps after.
  await closeRecords();
  for (const title of ["Locations", "Vehicles"]) await page.click(`.window[aria-label="${title}"] button[aria-label^="Close"]`);
  await page.waitForSelector('[aria-label="New Vehicle name"]', { state: "detached" });

  // 2. Duplicate and Delete with Undo; Copy to campaign for the bestiary's creature.
  await closeRecords();
  await page.fill('[aria-label="Search the list"]', "Bog Hag");
  await page.click(`[data-record-row="${hag.id}"] .records-name`, { button: "right" });
  await page.click('.context-menu [data-menu="Duplicate"]');
  const copy = await until(async () => (await records("npc")).find((item) => item.name === "Bog Hag (copy)"), "the copy");
  assert((await get(copy.id)).data.text === hagNow.data.text, "the copy has the text");
  await page.waitForSelector(`.record-window[data-record="${copy.id}"] [data-record-editor]`);
  await closeRecords();
  await page.waitForSelector(`[data-record-row="${copy.id}"]`);
  await page.click(`[data-record-row="${copy.id}"] .records-name`, { button: "right" });
  await page.click('.context-menu [data-menu="Delete"]');
  await page.waitForSelector(`[data-undo="${copy.id}"]`);
  await until(async () => !(await records("npc")).some((item) => item.id === copy.id), "the copy deleted");
  await page.click('[data-action="record-undo"]');
  await until(async () => (await records("npc")).some((item) => item.id === copy.id), "the copy back after Undo");
  const bookNpc = (await records("npc")).find((item) => item.source);
  await page.fill('[aria-label="Search the list"]', bookNpc.name);
  await page.click(`[data-record-row="${bookNpc.id}"] .records-name`, { button: "right" });
  await page.click('.context-menu [data-menu="Copy to campaign"]');
  const campaignCopy = await until(async () => (await records("npc")).find((item) => item.name === bookNpc.name && !item.source), "the campaign's copy of a book's creature");
  await page.waitForSelector(`.record-window[data-record="${campaignCopy.id}"] [data-record-editor]`);
  await page.screenshot({ path: path.join(shots, "2-copy-to-campaign.png") });
  assert(!(await get(campaignCopy.id)).data.fgPath, "the copy is the campaign's own (no book path)");

  // 3. The eye's menu: the Bog Hag shared with the test player alone.
  await closeAll();
  await page.click('.sidebar [data-launch="records:npc"]');
  await page.fill('[aria-label="Search the list"]', "Bog Hag");
  await page.click(`[data-record-row="${hag.id}"] [data-action="record-share"]`);
  await page.waitForSelector(`[data-share-menu="${hag.id}"]:popover-open`);
  await page.screenshot({ path: path.join(shots, "3-share-menu.png") });
  await page.click(`[data-share-menu="${hag.id}"] [data-share-player="A test player"]`);
  await until(async () => JSON.stringify((await get(hag.id)).visibility) === '["A test player"]', "shared with the test player alone");
  await page.keyboard.press("Escape");
  await seat.click('.sidebar [data-launch="records:npc"]');
  await seat.waitForSelector(`[data-record-row="${hag.id}"]`, { timeout: 10000 });
  await seat.click(`[data-record-row="${hag.id}"] .records-name`);
  await seat.waitForSelector(`.record-window[data-record="${hag.id}"] .read-aloud-frame`);
  assert(!(await seat.$(`.record-window[data-record="${hag.id}"] [data-action="record-lock"]`)), "the player has no pencil");

  // 4. The story: New under World > Story, a heading and boxed text, a picture as a page; shared.
  await closeAll();
  await page.click('.sidebar [data-launch="adventure:story"]');
  await page.waitForSelector('[data-campaign-list="story"]');
  await page.fill('[aria-label="New story name"]', "Arrival at Twin Lakes");
  await page.click('[data-campaign-list="story"] [data-action="campaign-new"]');
  await page.waitForSelector(".story-view .rt-body");
  const story = (await records("story")).find((item) => item.name === "Arrival at Twin Lakes");
  await page.click(".story-view .rt-body");
  await page.locator('.story-view [data-rt="heading"]').click();
  await page.keyboard.type("The Lakes");
  await page.keyboard.press("Enter");
  await page.locator('.story-view [data-rt="plain"]').click();
  await page.keyboard.type("Two lakes, one village, and a mill that turns at night.");
  await page.keyboard.press("Enter");
  await page.locator('.story-view [data-rt="frame"]').click();
  await page.keyboard.type("Fog lies on the water like wool.");
  await page.locator(".story-view .story-block").first().click({ position: { x: 2, y: 2 } }).catch(() => undefined);
  await page.locator(`.record-window[data-record="${story.id}"] h3`).click();
  await until(async () => /<frame>/.test(JSON.stringify((await get(story.id)).data.blocks)), "the story's text saved");
  const contents = await tool("kraken_books", { action: "contents", book: (await tool("kraken_books", { action: "list" })).find((item) => /Twin Lakes/.test(item.title)).id });
  const picture = (contents.pictures ?? contents.images ?? [])[0];
  if (picture) {
    await dropLink(page, `.story-view [data-record-drop="story"]`, { kind: "picture", book: picture.book ?? contents.id ?? "", file: picture.file, label: picture.name ?? "Map" });
    await until(async () => (await get(story.id)).data.blocks.some((block) => block.kind === "image"), "a picture page");
  }
  const blocks = (await get(story.id)).data.blocks;
  assert(/<h>The Lakes<\/h>/.test(blocks[0].text) && /<frame>Fog lies on the water like wool\.<\/frame>/.test(blocks[0].text), `the story's page in FG's tags: ${blocks[0].text}`);
  await page.screenshot({ path: path.join(shots, "4-story-editing.png") });
  await tool("kraken_record_update", { id: story.id, visibility: "all" });
  await seat.waitForSelector('.sidebar [data-launch="records:story"]', { timeout: 10000 });
  await seat.click('.sidebar [data-launch="records:story"]');
  await seat.click(`[data-record-row="${story.id}"] .records-name`);
  await seat.waitForSelector(`.record-window[data-record="${story.id}"] .story-view h4`);
  assert((await seat.textContent(`.record-window[data-record="${story.id}"] .story-view`)).includes("Fog lies on the water"), "the player reads the story");
  if (picture) await seat.waitForFunction((id) => { const image = document.querySelector(`.record-window[data-record="${id}"] .story-block img`); return image && image.complete && image.naturalWidth > 0; }, story.id, { timeout: 15000 });
  await seat.screenshot({ path: path.join(shots, "4-story-player.png") });

  // 5. Tables: Import pasted, the window's Roll, the rows edited; the player's /rollon.
  await closeAll();
  await page.click('.sidebar [data-launch="adventure:table"]');
  await page.waitForSelector('[data-campaign-list="table"]');
  await page.click('[data-campaign-list="table"] .table-import summary');
  await page.fill('[aria-label="Imported table\'s name"]', "Lake Rumours");
  await page.fill('[aria-label="The table, pasted"]', "1-2  The mill grinds bones\n3-4  The ferryman counts twice\n5-6  [1d4+1] lights on the far shore");
  await page.click('[data-action="table-import"]');
  await page.waitForSelector(".record-window [data-table-editor]");
  const rumours = (await records("table")).find((item) => item.name === "Lake Rumours");
  assert(Object.keys((await get(rumours.id)).data.tablerows).length === 3, "three rows imported");
  // The Bog Hag dropped on the first row's result: its link (FG's resultlink), kept through another row's edit.
  await dropLink(page, `[data-table-editor="${rumours.id}"] [data-table-cell="0-0"]`, { kind: "record", record: hag.id, label: "Bog Hag" });
  await page.waitForSelector(`[data-table-editor="${rumours.id}"] [data-result-link="${hag.id}"]`);
  await page.locator(`[data-table-editor="${rumours.id}"] [aria-label="Row 3 result 1"]`).fill("[1d4+1] lights on the far shore, moving");
  await page.locator(`[data-table-editor="${rumours.id}"] [aria-label="Row 3 result 1"]`).press("Enter");
  await until(async () => JSON.stringify((await get(rumours.id)).data.tablerows).includes("moving"), "a row edited");
  assert(JSON.stringify((await get(rumours.id)).data.tablerows).includes(`"recordname":"${hag.id}"`), "the first row's link kept through the edit");
  await tool("kraken_dice_force", { values: [6, 2] });
  await page.click(`.record-window[data-record="${rumours.id}"] [data-action="table-roll"]`);
  await until(async () => (await tool("kraken_chat_log", { count: 20 })).some((line) => line.roll?.label === "[TABLE] Lake Rumours = 6: 3 lights on the far shore, moving"), "the table's roll in chat");
  await page.screenshot({ path: path.join(shots, "5-table.png") });
  await tool("kraken_record_update", { id: rumours.id, visibility: "all" });
  await tool("kraken_dice_force", { values: [1] });
  await seat.fill("form.chat-entry input", "/rollon Lake Rumours");
  await seat.press("form.chat-entry input", "Enter");
  await until(async () => (await tool("kraken_chat_log", { count: 20 })).some((line) => line.roll?.label === "[TABLE] Lake Rumours = 1: The mill grinds bones" && line.from === "A test player"), "the player's /rollon");
  // A result dragged from the table's window into the chat's entry goes into the line being typed.
  await seat.click('.sidebar [data-launch="records:table"]');
  await seat.click('.window[data-window="records"] >> text=Lake Rumours');
  await seat.waitForSelector(`.record-window[data-record="${rumours.id}"] tr[data-table-row="1"]`);
  await seat.fill("form.chat-entry input", "Rumour:");
  await seat.dragAndDrop(`.record-window[data-record="${rumours.id}"] tr[data-table-row="1"]`, "form.chat-entry input");
  await seat.waitForFunction(() => document.querySelector("form.chat-entry input")?.value === "Rumour: The ferryman counts twice", null, { timeout: 5000 }).catch(async () => {
    throw new Error(`the dragged result in the chat entry: ${await seat.inputValue("form.chat-entry input")}`);
  });
  await seat.fill("form.chat-entry input", "");

  // A note's plain words as written (an old note, or a chat line dropped on Notes): "->" and "&" read as
  // themselves, and stay so through the editor.
  await closeAll();
  const plainNote = await tool("kraken_record_create", { type: "note", name: "XP line", data: { text: "[3 XP] -> Aldric & co" } });
  await page.click('.sidebar [data-launch="notes"]');
  await page.click(`[data-note="${plainNote.id}"]`);
  await page.waitForSelector(`[data-note-window="${plainNote.id}"] .rt-body`);
  assert((await page.textContent(`[data-note-window="${plainNote.id}"] .rt-body`)).includes("[3 XP] -> Aldric & co"), "the plain note reads as written");
  await page.click(`[data-note-window="${plainNote.id}"] .rt-body`);
  await page.keyboard.press("End");
  await page.keyboard.type(".");
  await page.click(`[data-note-window="${plainNote.id}"] .note-owner`);
  await until(async () => (await get(plainNote.id)).data.text === "<p>[3 XP] -&gt; Aldric &amp; co.</p>", `the note saved once escaped: ${(await get(plainNote.id)).data.text}`);
  await closeAll();

  // FG's share with one by a drop: the Bog Hag's copy dragged onto the test player's portrait.
  const hero = await tool("kraken_record_create", { type: "character", name: "Wren", owner: "A test player", visibility: "owner", data: {} });
  await page.waitForSelector(`[data-portrait="${hero.id}"]`, { timeout: 10000 });
  await dropLink(page, `[data-portrait="${hero.id}"]`, { kind: "record", record: copy.id, label: "Bog Hag (copy)" });
  await until(async () => JSON.stringify((await get(copy.id)).visibility) === '["A test player"]', "the copy shared with the player by the portrait drop");

  // 6. An item, unidentified from its window: the player sees the plain name.
  await closeAll();
  const ring = await tool("kraken_record_create", { type: "item", name: "Ring of the Drowned", visibility: "all", data: { nonid_name: "Tarnished ring", description: "Breathe water for an hour." } });
  await page.click('.sidebar [data-launch="records:item"]');
  await page.fill('[aria-label="Search the list"]', "Ring of the Drowned");
  await page.click(`[data-record-row="${ring.id}"] .records-name`);
  await page.click(`.record-window[data-record="${ring.id}"] [data-action="record-identified"]`);
  await until(async () => (await get(ring.id)).data.isidentified === 0, "unidentified");
  await seat.click('.sidebar [data-launch="records:item"]');
  await seat.fill('[aria-label="Search the list"]', "ring");
  await seat.waitForSelector(`[data-record-row="${ring.id}"]:has-text("Tarnished ring")`, { timeout: 10000 });
  assert(!(await seat.content()).includes("Ring of the Drowned") && !(await seat.content()).includes("Breathe water"), "the player's page holds no real name or text");
  await page.screenshot({ path: path.join(shots, "6-identify.png") });

  // 7. An encounter: New, the Bog Hag dropped in, Add to tracker, End encounter.
  await closeAll();
  await page.click('.sidebar [data-launch="adventure:battle"]');
  await page.fill('[aria-label="New encounter name"]', "Reeds at dusk");
  await page.click('[data-campaign-list="battle"] [data-action="campaign-new"]');
  await page.waitForSelector(".encounter-view");
  const ambush = (await records("battle")).find((item) => item.name === "Reeds at dusk");
  await dropLink(page, '[data-record-drop="encounter"]', { kind: "record", record: hag.id, label: "Bog Hag" });
  await page.waitForSelector(`[data-encounter="${ambush.id}"] [data-encounter-row]`);
  await page.locator(`[data-encounter="${ambush.id}"] [aria-label="Bog Hag count"]`).fill("2");
  await page.locator(`[data-encounter="${ambush.id}"] [aria-label="Bog Hag count"]`).press("Enter");
  await until(async () => Object.values((await get(ambush.id)).data.npclist)[0]?.count === "2", "the count");
  await page.click(`[data-encounter="${ambush.id}"] [data-action="encounter-run"]`);
  await until(async () => (await tool("kraken_combat", { action: "view" })).entries.filter((entry) => entry.name.startsWith("Bog Hag")).length === 2, "two hags on the tracker");
  await page.click(`[data-encounter="${ambush.id}"] [data-action="encounter-end"]`);
  await until(async () => (await get("party")).data.encounters?.[ambush.id], "the encounter on the party sheet");
  await page.screenshot({ path: path.join(shots, "7-encounter.png") });

  // 8. A treasure parcel: the ring dropped in, coins, to the party sheet; a quest onto the XP tab.
  await closeAll();
  await page.click('.sidebar [data-launch="adventure:parcel"]');
  await page.fill('[aria-label="New parcel name"]', "The hag's cache");
  await page.click('[data-campaign-list="treasureparcel"] [data-action="campaign-new"]');
  await page.waitForSelector(".parcel-view");
  const cache = (await records("treasureparcel")).find((item) => item.name === "The hag's cache");
  await dropLink(page, '[data-record-drop="parcel"]', { kind: "record", record: ring.id, label: "Ring of the Drowned" });
  await page.waitForSelector(`[data-parcel="${cache.id}"] [data-parcel-item]`);
  await page.fill(`[data-parcel="${cache.id}"] [aria-label="Coin amount"]`, "40");
  await page.click(`[data-parcel="${cache.id}"] [data-action="parcel-add-coin"]`);
  await until(async () => Object.values((await get(cache.id)).data.coinlist ?? {}).some((coin) => coin.amount === 40), "the coins");
  await page.click(`[data-parcel="${cache.id}"] [data-action="parcel-party"]`);
  await until(async () => Object.values((await get("party")).data.parcel.items).some((item) => item.name === "Ring of the Drowned"), "the parcel on the party sheet");
  await page.screenshot({ path: path.join(shots, "8-parcel.png") });
  const quest = await tool("kraken_quest", { action: "create", name: "Still the mill", xp: 0 });
  await page.click('.sidebar [data-launch="party"]');
  await page.waitForSelector(".party-sheet, [data-window='party']");
  await page.click('button:has-text("XP")').catch(() => undefined);
  if (await page.$("[data-xp-drop]")) {
    await dropLink(page, "[data-xp-drop]", { kind: "record", record: quest.id, label: "Still the mill" });
    await until(async () => (await get("party")).data.quests?.[quest.id], "the quest on the party sheet");
  } else await tool("kraken_quest", { action: "party", id: quest.id });
  await page.screenshot({ path: path.join(shots, "8-party.png") });
  await seat.screenshot({ path: path.join(shots, "9-player.png") });

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok content ui (the GM's screen ${screen}): a new NPC unlocked with the bestiary's fields and FG-tagged text; Duplicate, Delete and Undo, Copy to campaign; shared with one player by the eye's menu; a story with a heading, boxed text and a picture page read by the player; a table imported, edited, rolled and /rollon'd by the player; an item unidentified for the player; an encounter onto the tracker and its XP to the party; a parcel and a quest to the party sheet. Shots: ${shots}`);
} catch (error) {
  await page.screenshot({ path: path.join(shots, "failed.png") }).catch(() => undefined);
  throw error;
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
