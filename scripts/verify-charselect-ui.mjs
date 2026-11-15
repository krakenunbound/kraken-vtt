// FG's Character Selection and character list, checked against FG's own
// player client (a second FG copy joined as a player): the GM makes two
// characters no one holds and one another player holds. A test player in
// Chrome joins and is shown Character Selection by itself: every character as
// a card (no one's "Server", the other player's named and not pickable); a
// click takes one, which becomes theirs (the record's owner) and opens its
// sheet. The portrait bar along the top shows every character with whose it
// is, on the player's screen and the GM's. kraken_characters lists the roster,
// gives one and releases one; a released one is offered again. The sidebar's
// Characters is Character Selection for the GM too (empty: New character;
// kraken_windows characters opens and closes it); in edit mode (the pencil) a
// player exports their own card (not one no one holds; no Delete) and the GM
// sees Export and Delete on every card and deletes one. Full-screen shots go
// to the temp folder's kraken-charselect.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-charselect-ui-"));
const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
// Full screen on its monitor, as a GM plays (the shots below are of the whole screen).
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
});
const shots = path.join(tmpdir(), "kraken-charselect");
mkdirSync(shots, { recursive: true });
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
const spec = (name, species, cls) => ({ name, species, class: cls, background: "Soldier", level: 1, scores: { strength: 15, dexterity: 13, constitution: 14, intelligence: 10, wisdom: 12, charisma: 9 } });

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Character Selection UI", ruleset: "D&D 5E" });
  const port = 47413;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  const srd = (shelf.books ?? shelf).find((book) => /DNDSRD521PLAYER/i.test(`${book.id} ${book.name ?? ""}`));
  if (!srd) {
    console.log("skip charselect ui: no SRD 5.2.1 player book");
    process.exit(0);
  }
  await tool("kraken_books", { action: "activate", book: srd.id });
  // The GM's Characters: Character Selection (FG's charselect_host), empty before any character is made.
  await page.click('.sidebar [data-launch="characters"]');
  await page.waitForSelector('[data-window="charselect"] .empty-state', { timeout: 10000 });
  assert(await page.$('[data-window="charselect"] [data-action="new-character"]'), "the empty list offers New character");
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(shots, "gm-empty.png") });
  // kraken_windows: characters is that window; closed by the same name.
  await tool("kraken_windows", { action: "close", kind: "characters" });
  await page.waitForSelector('[data-window="charselect"]', { state: "detached", timeout: 10000 });
  await tool("kraken_windows", { action: "open", kind: "characters" });
  await page.waitForSelector('[data-window="charselect"]', { timeout: 10000 });
  await tool("kraken_windows", { action: "close", kind: "characters" });
  const maelis =await tool("kraken_build_character", { spec: spec("Maelis Voidtide", "Elf", "Wizard") });
  const zhree = await tool("kraken_build_character", { spec: spec("Zhree Limelight", "Human", "Bard") });
  const bimz = await tool("kraken_build_character", { owner: "Someone else", spec: spec("Bimz", "Halfling", "Rogue") });
  const idOf = (built) => built.id ?? built.record?.id;
  let roster = (await tool("kraken_characters", { action: "roster" })).roster;
  assert(roster.length === 3 && roster.filter((entry) => !entry.owner).length === 2, `the roster: three, two held by no one: ${JSON.stringify(roster)}`);

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // Character Selection opens by itself, as FG's does for a player with no character.
  await seat.waitForSelector('[data-window="charselect"] .charselect-card', { timeout: 10000 });
  const cards = await seat.$$eval(".charselect-card", (list) => list.map((card) => ({ text: card.textContent, disabled: card.disabled })));
  assert(cards.length === 3, `three cards: ${JSON.stringify(cards)}`);
  assert(cards.filter((card) => card.text.includes("Server") && !card.disabled).length === 2, `two no one holds ("Server"), pickable: ${JSON.stringify(cards)}`);
  assert(cards.some((card) => card.text.includes("Bimz") && card.text.includes("Someone else") && card.disabled), `Bimz shows its holder and cannot be picked: ${JSON.stringify(cards)}`);
  // The filter.
  await seat.fill('[aria-label="Filter characters"]', "zhr");
  assert((await seat.$$(".charselect-card")).length === 1, "the filter finds Zhree");
  await seat.fill('[aria-label="Filter characters"]', "");

  // Taking Maelis: hers, and the sheet opens.
  await seat.click(`[data-charselect="${idOf(maelis)}"]`);
  await seat.waitForSelector('[data-window="charselect"]', { state: "detached", timeout: 10000 });
  await seat.waitForSelector('.sheet-5e [data-stat="ac"]', { timeout: 10000 });
  const taken = await tool("kraken_record_get", { id: idOf(maelis) });
  assert(taken.owner === "A test player" && taken.visibility === "owner", `Maelis is the test player's: ${JSON.stringify({ owner: taken.owner, visibility: taken.visibility })}`);

  // Taking Maelis makes her who the player speaks and rolls as (FG's identity list under the chat).
  await seat.waitForFunction(() => document.querySelector('[aria-label="Speak as"]')?.value === "Maelis Voidtide", null, { timeout: 10000 });
  await seat.fill('[aria-label="Message"]', "Well met.");
  await seat.press('[aria-label="Message"]', "Enter");
  await page.waitForSelector('.chat-line[data-from="Maelis Voidtide"]:has-text("Well met.")', { timeout: 10000 });
  await seat.fill('[aria-label="Message"]', "/r 1d20 Perception");
  await seat.press('[aria-label="Message"]', "Enter");
  await page.waitForSelector('.chat-line[data-from="Maelis Voidtide"][data-kind="roll"]', { timeout: 10000 });
  // Out of character: the player's own name.
  await seat.selectOption('[aria-label="Speak as"]', "");
  await seat.fill('[aria-label="Message"]', "brb, pizza");
  await seat.press('[aria-label="Message"]', "Enter");
  await page.waitForSelector('.chat-line[data-from="A test player"]:has-text("brb, pizza")', { timeout: 10000 });
  await seat.selectOption('[aria-label="Speak as"]', "Maelis Voidtide");
  // The GM whispers to Maelis: it reaches her player.
  await page.fill('[aria-label="Message"]', "/w Maelis Voidtide you hear a whisper");
  await page.press('[aria-label="Message"]', "Enter");
  await seat.waitForSelector('.chat-line.whisper:has-text("you hear a whisper")', { timeout: 10000 });

  // The portrait bar: every character, with whose it is, on both screens.
  await seat.waitForFunction(() => document.querySelectorAll(".portrait-strip [data-portrait]").length === 3, null, { timeout: 10000 });
  const strip = await seat.$$eval(".portrait-strip [data-portrait]", (list) => list.map((chip) => chip.textContent));
  assert(strip.some((chip) => chip.includes("Maelis") && chip.includes("A test player")) && strip.some((chip) => chip.includes("Zhree") && chip.includes("Server")) && strip.some((chip) => chip.includes("Bimz") && chip.includes("Someone else")), `the player's portrait bar: ${JSON.stringify(strip)}`);
  assert(await seat.$eval(`[data-portrait="${idOf(bimz)}"]`, (chip) => chip.classList.contains("away")), "Bimz's holder is not seated: faded");
  await page.waitForFunction((id) => document.querySelector(`.portrait-strip [data-portrait="${id}"]`)?.textContent.includes("A test player"), idOf(maelis), { timeout: 10000 });
  roster = (await tool("kraken_characters", { action: "roster" })).roster;
  assert(roster.find((entry) => entry.id === idOf(maelis)).online === true, "the roster says Maelis's holder is seated");

  // Someone else's character cannot be taken, even by asking the host directly.
  const refused = await seat.evaluate(
    (id) =>
      new Promise((resolve) => {
        const socket = new WebSocket(`ws://${location.host}/`);
        socket.onopen = () => socket.send(JSON.stringify({ type: "join", name: "Sneaky" }));
        socket.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "ok") {
            // Speaking as a character not theirs: it goes out under their own name.
            socket.send(JSON.stringify({ type: "chat", text: "I am Maelis, honest", as: "Maelis Voidtide" }));
            socket.send(JSON.stringify({ type: "take-character", req: 1, id }));
          }
          if (msg.type === "op-result") {
            resolve(msg);
            socket.close();
          }
        };
      }),
    idOf(bimz),
  );
  assert(refused.ok === false && /Someone else/.test(refused.error), `taking another player's character is refused: ${JSON.stringify(refused)}`);
  await page.waitForSelector('.chat-line[data-from="Sneaky"]:has-text("I am Maelis, honest")', { timeout: 10000 });

  // The GM gives Zhree to the test player, then releases Maelis; Character Selection offers Maelis again.
  await tool("kraken_characters", { action: "give", id: idOf(zhree), owner: "A test player" });
  await seat.waitForFunction((id) => document.querySelector(`.portrait-strip [data-portrait="${id}"]`)?.textContent.includes("A test player"), idOf(zhree), { timeout: 10000 });
  await tool("kraken_characters", { action: "release", id: idOf(maelis) });
  await seat.waitForFunction((id) => document.querySelector(`.portrait-strip [data-portrait="${id}"]`)?.textContent.includes("Server"), idOf(maelis), { timeout: 10000 });
  // Maelis's sheet closes on the player's screen: it is not theirs to see any more.
  await seat.waitForFunction(() => ![...document.querySelectorAll(".window-title, .window header")].some((title) => title.textContent.includes("Maelis")), null, { timeout: 10000 });
  // The player opens it again from a portrait no one holds.
  await seat.click(`[data-portrait="${idOf(maelis)}"]`);
  await seat.waitForSelector(`[data-charselect="${idOf(maelis)}"]:not([disabled])`, { timeout: 10000 });
  assert((await seat.textContent(`[data-charselect="${idOf(maelis)}"]`)).includes("Server"), "Maelis is offered again");
  assert((await seat.textContent(`[data-charselect="${idOf(zhree)}"]`)).includes("Yours"), "Zhree is the player's");

  // The player's edit mode (FG's pencil): Export on their own card only, its two formats.
  await seat.click('[data-window="charselect"] [data-action="charselect-edit"]');
  const zhreeItem = seat.locator(".charselect-item", { has: seat.locator(`[data-charselect="${idOf(zhree)}"]`) });
  const maelisItem = seat.locator(".charselect-item", { has: seat.locator(`[data-charselect="${idOf(maelis)}"]`) });
  assert((await zhreeItem.locator('[data-action="export-character"]').count()) === 1 && (await maelisItem.locator('[data-action="export-character"]').count()) === 0, "Export on the player's own card, not on one no one holds");
  assert((await seat.locator('[data-action="delete-character"]').count()) === 0, "a player deletes nothing");
  await zhreeItem.locator('[data-action="export-character"]').click();
  await seat.waitForSelector('[data-export="kraken"]');
  await seat.waitForSelector('[data-export="fg"]');
  const download = seat.waitForEvent("download", { timeout: 10000 });
  await seat.click('[data-export="kraken"]');
  assert((await download).suggestedFilename() === "Zhree Limelight.kraken.json", "the player's export downloads the character as Kraken's file");
  await zhreeItem.locator('[data-action="export-character"]').click();
  await seat.mouse.move(2, 2);
  await seat.screenshot({ path: path.join(shots, "player-edit-export.png") });

  // The GM's list, every character: edit mode, Export and Delete on each card; Bimz deleted (after the GM confirms).
  await page.click('.sidebar [data-launch="characters"]');
  await page.waitForSelector('[data-window="charselect"] .charselect-card', { timeout: 10000 });
  assert((await page.$$('[data-window="charselect"] .charselect-card')).length === 3, "the GM's list has every character");
  await page.click('[data-window="charselect"] [data-action="charselect-edit"]');
  assert((await page.locator('[data-window="charselect"] [data-action="delete-character"]').count()) === 3, "Delete on every card for the GM");
  await page.locator(".charselect-item", { has: page.locator(`[data-charselect="${idOf(bimz)}"]`) }).locator('[data-action="export-character"]').click();
  await page.waitForSelector('[data-export="fg"]');
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(shots, "gm-list-edit-export.png") });
  await page.keyboard.press("Escape");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.click(`[aria-label="Delete Bimz"]`);
  for (let i = 0; i < 40 && (await tool("kraken_records_list", { type: "character" })).records.some((item) => item.name === "Bimz"); i++) await new Promise((resolve) => setTimeout(resolve, 150));
  assert(!(await tool("kraken_records_list", { type: "character" })).records.some((item) => item.name === "Bimz"), "Bimz deleted");
  await page.waitForFunction((id) => !document.querySelector(`[data-charselect="${id}"]`), idOf(bimz), { timeout: 10000 });

  await seat.screenshot({ path: path.join(shots, "player.png") });
  await page.screenshot({ path: path.join(shots, "gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok charselect ui: a test player is shown Character Selection on joining (two "Server", one another player's and not pickable), takes Maelis (theirs, the sheet opens) and speaks and rolls as her (out of character as themselves; a whisper to Maelis reaches them; speaking as a character not theirs goes out under their own name); the portrait bar shows all three with whose each is on both screens; another's character is refused; kraken_characters gives and releases, and a released one is offered again. ${path.join(tmpdir(), "kraken-charselect-player.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
