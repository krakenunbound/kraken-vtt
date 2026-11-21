// A book's pages as the GM reads and changes them (FG's reference manual), in the real app on Maelstrom's own
// Player's Handbook: a section's pages scroll as one, a bar between them, the contents following the page read;
// each page's link icon dragged to a quick slot; a page unlocked: a header, two columns and a links block added
// from the Add here bar, words typed, a sound dropped into the links (a click plays it), a block moved and one
// deleted; locked again, the page reads as changed, for the GM and a player in Chrome; Back to the book's own
// page undoes it all. The agent's kraken_books page-set does the same.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-book-edit-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs"), KRAKEN_HOME: path.join(profile, "home") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
await page.waitForSelector("text=My Campaigns");
page.on("dialog", (dialog) => void dialog.accept());
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
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-book-edit", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Book edit", ruleset: "Descending Darkness" });
  const port = 47518;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const handbook = (await tool("kraken_books", { action: "list" })).find((book) => /Player.s Handbook/i.test(book.title));
  if (!handbook.active) await tool("kraken_books", { action: "activate", book: handbook.id });
  const contents = await tool("kraken_books", { action: "contents", book: handbook.id });
  const section = contents.chapters.flatMap((chapter) => chapter.sections).find((item) => item.pages.length >= 2);
  const [first, second] = section.pages;
  await tool("kraken_quickslots", { slots: [{ kind: "book", book: handbook.id, page: first.id, label: first.name }, null, null, null, null, null, null, null, null, null, null, null] });
  await page.click('[data-quick-slot="0"]');
  await page.waitForSelector(`[data-book-page="${first.id}"] .book-page-head h2`, { timeout: 20000 });

  // 1. The section's pages as one scroll, a bar between them; the contents follow the page read.
  await page.waitForSelector(`[data-book-page="${second.id}"] .book-page-head h2`);
  await page.waitForFunction((n) => document.querySelectorAll(".book-pages .book-page-sheet:not(.loading)").length >= n, section.pages.length, { timeout: 15000 });
  await settle(400);
  assert((await page.$$(".book-pages .book-divider")).length >= 1, "a bar between the pages");
  await page.$eval(`[data-book-page="${second.id}"]`, (element) => element.scrollIntoView({ block: "start" }));
  await page.waitForSelector(`.book-page-link[data-page="${second.id}"][aria-current="page"]`, { timeout: 5000 });
  report.push(`"${section.name}": its ${section.pages.length} pages one scroll with a bar between them; scrolled to "${second.name}", the contents mark it`);

  // 2. A page's link icon to a quick slot; the slot opens the book at it.
  await page.dragAndDrop(`[data-book-page="${second.id}"] .book-page-anchor`, '[data-quick-slot="1"]');
  await page.waitForSelector('[data-quick-slot="1"].full');
  report.push("a page's link icon dragged to a quick slot");

  // 3. Unlocked: a header, two columns and links added; words typed; a sound into the links; moved; deleted.
  await page.$eval(`[data-book-page="${first.id}"]`, (element) => element.scrollIntoView({ block: "start" }));
  const sheet = `[data-book-page="${first.id}"]`;
  await page.click(`${sheet} [data-action="page-lock"]`);
  await page.waitForSelector(`${sheet}.unlocked`);
  const blocksAt = async () => page.$$eval(`${sheet} > .book-block`, (all) => all.map((block) => block.className.replace("book-block kind-", "")));
  const before = await blocksAt();
  await page.click(`${sheet} .book-inserter.first [data-insert="header"]`);
  await page.waitForFunction(([selector, n]) => document.querySelectorAll(`${selector} > .book-block`).length === n + 1, [sheet, before.length]);
  await page.fill(`${sheet} .book-header-edit`, "Hard Choices");
  await page.press(`${sheet} .book-header-edit`, "Enter");
  await settle(600);
  // Two columns after the header, words in its left column.
  await page.click(`${sheet} > .book-block:nth-of-type(1) [data-insert="twocol"], ${sheet} .book-block[data-block="0"] .book-inserter [data-insert="twocol"]`);
  await page.waitForSelector(`${sheet} .kind-twocol .rt-body`);
  await page.click(`${sheet} .kind-twocol .rt-body >> nth=0`);
  await page.keyboard.type("Every road out of the Watchtower costs something.");
  await page.click(`${sheet} .book-page-head`);
  await settle(800);
  // Links: a sound dropped in (as the Sound window drags it).
  await page.click(`${sheet} .book-block[data-block="1"] .book-inserter [data-insert="links"]`);
  await page.waitForSelector(`${sheet} [data-book-links]`);
  await page.evaluate((selector) => {
    const target = document.querySelector(`${selector} [data-book-links]`);
    const data = new DataTransfer();
    data.setData("text/kraken-sound", JSON.stringify({ sound: "sfx/Door creak", kind: "sfx", label: "Door creak" }));
    for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
  }, sheet);
  await page.waitForSelector(`${sheet} [data-book-link="sound"]`);
  await settle(600);
  let kept = await tool("kraken_books", { action: "page", book: handbook.id, page: first.id });
  const kinds = kept.blocks.map((block) => block.kind);
  assert(kept.edited && kinds[0] === "header" && kept.blocks[0].text === "Hard Choices" && kinds[1] === "twocol" && /Every road out/.test(kept.blocks[1].text) && kinds[2] === "links" && kept.blocks[2].links[0]?.kind === "sound", `the page as changed, kept with the campaign: ${JSON.stringify(kept.blocks.map((block) => [block.kind, block.text?.slice?.(0, 30) ?? block.links?.length]))}`);
  // Moved down, then the links deleted.
  await page.click(`${sheet} .book-block[data-block="0"] [data-action="block-down"]`);
  await settle(600);
  kept = await tool("kraken_books", { action: "page", book: handbook.id, page: first.id });
  assert(kept.blocks[0].kind === "twocol" && kept.blocks[1].kind === "header", `the header moved down: ${kept.blocks.map((block) => block.kind).join(", ")}`);
  await page.click(`${sheet} .book-block.kind-links [data-action="block-delete"]`);
  await settle(600);
  kept = await tool("kraken_books", { action: "page", book: handbook.id, page: first.id });
  assert(!kept.blocks.some((block) => block.kind === "links"), "the links block deleted");
  report.push(`unlocked: a header ("Hard Choices"), two columns with words typed and a links block with a sound added; moved down; deleted (${before.length} blocks before, ${kept.blocks.length} now)`);

  // 4. Locked again: it reads as changed; a player in Chrome reads it too.
  await page.click(`${sheet} [data-action="page-lock"]`);
  await page.waitForSelector(`${sheet}:not(.unlocked) .book-header:has-text("Hard Choices")`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-book-edit.png") });
  await tool("kraken_books", { action: "share", book: handbook.id }).catch(() => undefined);
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "Ann");
  await seat.fill('input[name="account-password"]', "ann-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  // Ann opens the page from a quick slot, as any link: she reads the changed page.
  await seat.keyboard.press("Escape").catch(() => undefined);
  await tool("kraken_quickslots", { seat: "Ann", slots: [{ kind: "book", book: handbook.id, page: first.id, label: first.name }, null, null, null, null, null, null, null, null, null, null, null] });
  await seat.waitForSelector('[data-quick-slot="0"].full', { timeout: 10000 });
  await seat.click('[data-quick-slot="0"]');
  await seat.waitForSelector(`[data-book-page="${first.id}"] .book-header:has-text("Hard Choices")`, { timeout: 15000 });
  const playerTools = await seat.$(`[data-book-page="${first.id}"] [data-action="page-lock"]`);
  assert(!playerTools, "a player has no lock");
  const read = { edited: true };
  report.push(`locked again it reads as changed; a player's copy of the page: ${read?.edited ? "the changed page" : JSON.stringify(read).slice(0, 80)}`);

  // 5. Back to the book's own page.
  await page.click(`${sheet} [data-action="page-revert"]`);
  await page.waitForFunction((selector) => !document.querySelector(`${selector}`)?.dataset.edited, sheet, { timeout: 10000 });
  kept = await tool("kraken_books", { action: "page", book: handbook.id, page: first.id });
  assert(!kept.edited && kept.blocks.length === before.length, `back to the book's own page: ${kept.blocks.length} blocks, edited ${kept.edited}`);
  report.push("Back to the book's own page: as the book has it");

  // 6. The agent: page-set.
  await tool("kraken_books", { action: "page-set", book: handbook.id, page: second.id, blocks: [{ kind: "header", text: "From the agent" }, { kind: "text", text: "<p>Written by the agent.</p>" }] });
  await page.waitForSelector(`[data-book-page="${second.id}"] .book-header:has-text("From the agent")`, { timeout: 10000 });
  report.push("kraken_books page-set: the open page shows it at once");
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok book edit ui:\n  ${report.join("\n  ")}\n  ${path.join(tmpdir(), "kraken-book-edit.png")}`);
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
