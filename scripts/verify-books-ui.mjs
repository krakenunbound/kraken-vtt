// Books in the real app, as FG's Library: the GM opens Books from the sidebar
// (no "Open an adventure" on the table any more; map bundles open from
// Books), makes books active, reads an adventure (chapters, a page with its
// picture, a link to another page, the next page) and shows its map; a
// player in Chrome reads the handbook (never the adventure) and gets the map
// as a tab. A made-up module, so it
// needs no FG modules.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { makeBooks } from "./fake-books.mjs";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-books-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: makeBooks() };
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
const heading = (where) => where.evaluate(() => document.querySelector(".book-page h2")?.textContent ?? "");
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  // A campaign made as Worldbuilding, changed to Castles & Crusades on the campaign screen.
  const campaign = await tool("kraken_campaign_create", { name: "Books UI", ruleset: "Worldbuilding" });
  await page.reload();
  // Home first: My Campaigns leads to the campaign screen.
  await page.waitForSelector("text=My Campaigns");
  if (!(await page.$('select[aria-label="Ruleset"]'))) await page.click("text=My Campaigns");
  await page.waitForSelector("text=Books UI");
  await page.click("text=Books UI");
  await page.selectOption('select[aria-label="Ruleset"]', "Castles & Crusades");
  await page.waitForFunction(() => document.querySelector('select[aria-label="Ruleset"]')?.value === "Castles & Crusades");
  const saved = (await tool("kraken_campaigns")).find((item) => item.id === campaign.id);
  assert(saved?.ruleset === "Castles & Crusades", `the campaign's ruleset is changed (${saved?.ruleset})`);
  const port = 47395;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  assert((await page.$("text=Open an adventure")) === null, "no Open an adventure on the table");
  assert((await page.$('.sidebar [data-launch="adventure"]')) === null, "no Open map in the sidebar");

  // The GM opens Books from the sidebar: nothing active yet; Activation lists
  // the modules for the campaign's game (not another game's), and the GM
  // makes the adventure and the handbook active: the handbook opens to the
  // players, the adventure not.
  await page.click('.sidebar [data-launch="books"]');
  await page.waitForSelector("text=No books are active in this campaign yet.");
  await page.click('[data-books-tab="activation"]');
  await page.waitForSelector('.books-window [data-activate="Test Keep"]');
  assert((await page.$('.books-window [data-book="Other Game"]')) === null, "another game's book is not listed");
  assert(await page.$('.books-window [data-book="Not A Book"]'), "Activation lists modules without a book too");
  await page.click('[data-activate="Test Keep"]');
  await page.click('[data-activate="Test Handbook"]');
  await page.waitForSelector('[data-players="Test Handbook"]:checked');
  assert((await page.$('[data-players="Test Keep"]')) === null, "an adventure has no Players tick: it is the GM's alone");
  await page.click('[data-books-tab="books"]');
  await page.waitForSelector('.books-window [data-book="Test Keep"]');
  assert((await page.$$eval(".books-category h3", (heads) => heads.map((head) => head.textContent))).join() === "Core Rules,Test Adventures", "books by category");
  assert((await page.$('.books-window [data-book="Not A Book"]')) === null, "a module without a book is not under Books");
  assert(await page.$('.books-window [data-launch="adventure"]'), "map bundles open from Books");
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-book="Test Keep"] img');
    return img?.complete && img.naturalWidth > 0;
  });

  // Reading: chapters on the left, the first page with its picture and text.
  await page.click('.books-window [data-book="Test Keep"]');
  await page.waitForSelector(".book-page h2");
  assert((await heading(page)) === "The Gate", "the book opens at its first page");
  assert((await page.textContent(".book-chapter h3")) === "The Keep", "its chapters");
  await page.waitForFunction(() => [...document.querySelectorAll(".book-figure img")].every((img) => img.complete && img.naturalWidth > 0));
  assert((await page.textContent(".book-text")).includes("Two guards stand at the gate."), "its text");
  assert((await page.$$(".book-text script")).length === 0, "no script in a page");
  await page.click('.book-text a[data-page="inn"]');
  await page.waitForFunction(() => document.querySelector(".book-page h2")?.textContent === "The Inn");
  await page.click('[aria-label="Previous page"]');
  await page.waitForFunction(() => document.querySelector(".book-page h2")?.textContent === "The Gate");
  await page.click('[aria-label="Next page"]');
  await page.waitForFunction(() => document.querySelector(".book-page h2")?.textContent === "The Inn");

  // Sounds in the story, as FG's: the book's own sound link plays Kraken's
  // sound of its kind and name; a sound dropped on it changes it; a sound
  // dropped between paragraphs sits there and plays from the book.
  await page.click('.book-toc [data-page="gate"]');
  await page.waitForSelector("a.book-link.sound.bound", { timeout: 15000 });
  assert((await page.getAttribute("a.book-link.sound", "title")).includes("ambience/Forest"), `the link finds the forest loop (${await page.getAttribute("a.book-link.sound", "title")})`);
  await page.click("a.book-link.sound");
  let scape = await tool("kraken_sound", { action: "scape" });
  for (let wait = 0; wait < 20 && !JSON.stringify(scape).includes("ambience/Forest"); wait++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    scape = await tool("kraken_sound", { action: "scape" });
  }
  assert(JSON.stringify(scape).includes("ambience/Forest"), `clicking the link starts the loop for the table (${JSON.stringify(scape).slice(0, 200)})`);
  const dropSound = (selector, ref) =>
    page.evaluate(
      ([target, data]) => {
        const element = document.querySelector(target);
        const transfer = new DataTransfer();
        transfer.setData("text/kraken-sound", JSON.stringify(data));
        for (const type of ["dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
      },
      [selector, ref],
    );
  await dropSound("a.book-link.sound", { sound: "ambience/Rain", kind: "ambience", label: "Rain" });
  await page.waitForFunction(() => document.querySelector("a.book-link.sound")?.title.includes("ambience/Rain"), null, { timeout: 8000 });
  await dropSound('.book-block[data-block="1"] .book-text', { sound: "sfx/Effects/Door Creak", kind: "sfx", label: "Door creak" });
  await page.waitForSelector('.book-block[data-block="1"] .book-sound', { timeout: 8000 });
  const kept = await tool("kraken_books", { action: "sounds" });
  const here = kept["Test Keep|gate"];
  assert(here?.links["ss|6041|mood||Forest ambience"]?.sound === "ambience/Rain" && here.blocks[0].block === 1, `the host keeps the page's sounds (${JSON.stringify(kept)})`);
  await page.click('.book-block[data-block="1"] .book-sound-remove');
  await page.waitForFunction(() => !document.querySelector(".book-sound"), null, { timeout: 8000 });
  await tool("kraken_sound", { action: "ambience", ambience: "clear" }).catch(() => undefined);

  // Quick slots: a page dragged onto a slot opens the book at that page again;
  // a map dragged onto one opens it in Pictures; right-click empties a slot.
  await page.dragAndDrop('.book-toc [data-page="inn"]', '[data-quick-slot="0"]');
  await page.waitForSelector('[data-quick-slot="0"].full');
  await page.click('.book-toc [data-page="gate"]');
  await page.waitForFunction(() => document.querySelector(".book-page h2")?.textContent === "The Gate");
  await page.click('[data-quick-slot="0"]');
  await page.waitForFunction(() => document.querySelector(".book-page h2")?.textContent === "The Inn", null, { timeout: 8000 });
  await page.click('[data-book-view="pictures"]');
  await page.dragAndDrop('[data-picture="images/keep.png"]', '[data-quick-slot="1"]');
  await page.waitForSelector('[data-quick-slot="1"].full');
  await page.click('[data-quick-slot="1"]', { button: "right" });
  await page.waitForSelector('[data-quick-slot="1"]:not(.full)');
  const slots = await tool("kraken_quickslots", {});
  assert(slots[0]?.kind === "book" && slots[0].page === "inn" && slots[1] === null, `the GM's slots, kept by the host (${JSON.stringify(slots.slice(0, 2))})`);

  // The GM opens the adventure's map (not shared yet).
  assert((await page.$('.book-window [data-share="The Test Keep"]')) === null && (await page.$('.books-window [data-share]')) === null, "no share symbol for a book");
  await page.click('[data-book-view="pictures"]');
  await page.click('[data-picture="images/keep.png"]');
  await page.waitForSelector('.images-window [data-image="images/keep.png"]');
  assert((await page.textContent(".images-share span")) === "Not shared", "a picture the GM opens is not shared until shared");

  // Right-click on a map: out on its own, so the map stays up beside the book;
  // back in; shared and unshared from the menu.
  await page.click('[data-book-view="book"]');
  await page.click('.book-toc [data-page="gate"]');
  await page.waitForSelector(".book-figure");
  await page.click(".book-figure", { button: "right" });
  await page.waitForSelector('.context-menu [data-menu="Out on its own"]');
  assert(await page.$('.context-menu [data-menu="Share with the players"]'), "the GM's menu shares");
  await page.click('.context-menu [data-menu="Out on its own"]');
  await page.waitForSelector('.picture-window [data-image="images/keep.png"]');
  assert(await page.$(".book-window .book-page h2"), "the book stays open beside the map");
  assert((await page.$('.images-window:not(.picture-window) [data-image="images/keep.png"]')) === null, "out on its own, it leaves the Pictures tabs");
  await page.click(".picture-window .images-view", { button: "right" });
  await page.click('.context-menu [data-menu="Back in"]');
  await page.waitForSelector('.images-window:not(.picture-window) [data-image="images/keep.png"]');
  assert((await page.$(".picture-window")) === null, "back in, its own window closes");
  await page.click(".images-tab", { button: "right" });
  await page.click('.context-menu [data-menu="Share with the players"]');
  await page.waitForFunction(() => document.querySelector(".images-share span")?.textContent === "Shown to the players");
  await page.click(".images-tab", { button: "right" });
  await page.click('.context-menu [data-menu="Stop sharing"]');
  await page.waitForFunction(() => document.querySelector(".images-share span")?.textContent === "Not shared");

  // A player in Chrome: the shared book on the shelf, readable.
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('.sidebar [data-launch="books"]');
  await seat.waitForSelector('.books-window [data-book="Test Handbook"]');
  assert((await seat.$('.books-window [data-book="Test Keep"]')) === null, "the player never has the adventure");
  assert((await seat.$(".books-window [data-share]")) === null && (await seat.$('.books-window [data-launch="adventure"]')) === null, "a player cannot share or open maps");
  await seat.click('.books-window [data-book="Test Handbook"]');
  await seat.waitForFunction(() => document.querySelector(".book-page h2")?.textContent === "First");

  // The GM shows the map: it opens as a tab on the player's screen.
  await page.click(".images-share .share-button");
  await page.waitForFunction(() => document.querySelector(".images-share span")?.textContent === "Shown to the players");
  await seat.waitForSelector('.images-window [data-image="images/keep.png"]', { timeout: 10000 });
  await seat.waitForFunction(() => [...document.querySelectorAll(".images-window img")].every((img) => img.complete && img.naturalWidth > 0));
  assert((await seat.textContent(".images-tab")).includes("The Keep (map)"), "the map is a tab on the player's screen");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-books-player.png") });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-books-gm.png") });

  // The handbook made inactive, the player's shelf empties.
  await tool("kraken_books", { action: "deactivate", book: "Test Handbook" });
  // (The player's Books window is still open, behind the book.)
  await seat.waitForSelector("text=The GM has not shared any books yet.", { timeout: 10000 });
  assert(failures.length === 0, `no errors on screen: ${failures.join("; ")}`);
  console.log("BOOKS_UI_OK the GM reads, shares and shows a map; a player in Chrome reads it and gets the map as a tab");
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
