// A book's contents as the GM changes them (FG's contents unlocked), in the real app on Maelstrom's own Player's
// Handbook: the contents' lock opened; a page renamed (its page title follows), moved up with its arrow, dragged
// into another section; a page added (it opens, empty, and is written on); a chapter added, renamed, taken out;
// locked, the contents read as changed for the GM and for a player in Chrome; a page added then deleted takes its
// words with it; Back to the book's own contents. The agent's kraken_books contents-set and contents-revert too.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-book-contents-ui-"));
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
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-book-contents", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Book contents", ruleset: "Descending Darkness" });
  const port = 47519;
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

  const tocOf = async () => await tool("kraken_books", { action: "contents", book: handbook.id });
  const idsIn = (chapters) => chapters.flatMap((chapter) => chapter.sections.flatMap((item) => item.pages.map((p) => p.id)));
  const pagesOf = (chapters) => chapters.flatMap((chapter) => chapter.sections.flatMap((item) => item.pages));
  const ownIds = idsIn(contents.chapters);
  const other = contents.chapters.flatMap((chapter) => chapter.sections).find((item) => item !== section && item.pages.length >= 2);
  assert(other, "two sections with pages");

  // 1. The contents' lock: unlocked, the names are fields with arrows. A page renamed: its title follows.
  await page.click('[data-action="contents-lock"]');
  await page.waitForSelector("[data-contents-unlocked]");
  await page.fill(`[data-toc-page-name="${first.id}"]`, "Choosing a Path");
  await page.press(`[data-toc-page-name="${first.id}"]`, "Enter");
  await page.waitForSelector(`[data-book-page="${first.id}"] .book-page-head h2:has-text("Choosing a Path")`, { timeout: 10000 });
  let toc = await tocOf();
  assert(pagesOf(toc.chapters).find((p) => p.id === first.id)?.name === "Choosing a Path", "renamed in the contents, kept");
  report.push(`"${first.name}" renamed "Choosing a Path" in the contents; its page title follows`);

  // 2. The second page moved up with its arrow: it comes first.
  await page.click(`[data-toc-page="${second.id}"] [data-action="toc-up"]`);
  await page.waitForFunction(([a, b]) => {
    const rows = [...document.querySelectorAll("[data-toc-page]")].map((row) => row.dataset.tocPage);
    return rows.indexOf(a) >= 0 && rows.indexOf(a) < rows.indexOf(b);
  }, [second.id, first.id]);
  await settle(500);
  toc = await tocOf();
  let ids = idsIn(toc.chapters);
  assert(ids.indexOf(second.id) < ids.indexOf(first.id), "moved up, kept");
  report.push(`"${second.name}" moved up above it`);

  // 3. A page dragged onto a page of another section goes before it, in that section.
  const target = other.pages[0];
  await page.$eval(`[data-toc-page="${target.id}"]`, (row) => row.scrollIntoView({ block: "center" }));
  await page.dragAndDrop(`[data-toc-page="${first.id}"] [data-action="toc-open"]`, `[data-toc-page="${target.id}"] [data-action="toc-open"]`);
  await settle(800);
  toc = await tocOf();
  const into = toc.chapters.flatMap((c) => c.sections).find((s) => s.pages.some((p) => p.id === target.id));
  assert(into.pages.findIndex((p) => p.id === first.id) === into.pages.findIndex((p) => p.id === target.id) - 1, `dragged before "${target.name}": ${into.pages.map((p) => p.name).join(", ")}`);
  report.push(`"Choosing a Path" dragged into "${other.name || "another section"}", before "${target.name}"`);

  // 4. A page added: it opens, empty; unlocked, it is written on.
  await page.click(`[data-toc-section]:has([data-toc-page="${second.id}"]) [data-action="toc-add-page"]`);
  await page.waitForSelector('[data-toc-page^="new-"]');
  const added = await page.$eval('[data-toc-page^="new-"]', (row) => row.dataset.tocPage);
  await page.fill(`[data-toc-page-name="${added}"]`, "The Watchtower Road");
  await page.press(`[data-toc-page-name="${added}"]`, "Enter");
  const newSheet = `[data-book-page="${added}"]`;
  await page.waitForSelector(`${newSheet} .book-page-head h2:has-text("The Watchtower Road")`, { timeout: 15000 });
  await page.click(`${newSheet} [data-action="page-lock"]`);
  await page.click(`${newSheet} .book-inserter.first [data-insert="text"]`);
  await page.waitForSelector(`${newSheet} .kind-text .rt-body`);
  await page.click(`${newSheet} .kind-text .rt-body`);
  await page.keyboard.type("Three days north, through the Fenwood.");
  await page.click(`${newSheet} .book-page-head`);
  await settle(800);
  await page.click(`${newSheet} [data-action="page-lock"]`);
  let kept = await tool("kraken_books", { action: "page", book: handbook.id, page: added });
  assert(kept.name === "The Watchtower Road" && /Three days north/.test(kept.blocks[0]?.text ?? ""), `the new page kept: ${JSON.stringify(kept).slice(0, 200)}`);
  report.push(`a page added ("The Watchtower Road"): it opened empty, was unlocked and written on`);

  // 5. A chapter added, renamed, taken out.
  await page.click('[data-action="toc-add-chapter"]');
  await page.waitForFunction(() => [...document.querySelectorAll("[data-toc-chapter-name]")].some((field) => field.value === "New chapter"));
  const last = await page.$$eval("[data-toc-chapter-name]", (all) => all.length - 1);
  await page.fill(`[data-toc-chapter-name="${last}"]`, "GM Notes");
  await page.press(`[data-toc-chapter-name="${last}"]`, "Enter");
  await settle(600);
  toc = await tocOf();
  assert(toc.chapters.at(-1).name === "GM Notes", "chapter added and renamed");
  await page.$eval('[data-action="toc-add-chapter"]', (button) => button.scrollIntoView({ block: "end" }));
  await page.screenshot({ path: path.join(tmpdir(), "kraken-book-contents-unlocked.png") });
  await page.click(`[data-toc-chapter="${last}"] h3 [data-action="toc-remove"]`);
  await settle(600);
  toc = await tocOf();
  assert(toc.chapters.length === contents.chapters.length, "chapter taken out");
  report.push('a chapter added, named "GM Notes", taken out again');

  // 6. Locked: the contents read as changed; a player in Chrome reads them and the new page.
  await page.click('[data-action="contents-lock"]');
  await page.waitForSelector(`.book-page-link[data-page="${added}"]:has-text("The Watchtower Road")`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-book-contents.png") });
  await tool("kraken_books", { action: "share", book: handbook.id }).catch(() => undefined);
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "Ann");
  await seat.fill('input[name="account-password"]', "ann-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.keyboard.press("Escape").catch(() => undefined);
  await tool("kraken_quickslots", { seat: "Ann", slots: [{ kind: "book", book: handbook.id, page: second.id, label: second.name }, null, null, null, null, null, null, null, null, null, null, null] });
  await seat.waitForSelector('[data-quick-slot="0"].full', { timeout: 10000 });
  await seat.click('[data-quick-slot="0"]');
  await seat.waitForSelector(`.book-page-link[data-page="${added}"]:has-text("The Watchtower Road")`, { timeout: 15000 });
  assert(!(await seat.$('[data-action="contents-lock"]')), "a player has no contents lock");
  await seat.click(`.book-page-link[data-page="${added}"]`);
  await seat.waitForSelector(`[data-book-page="${added}"] :text("Three days north")`, { timeout: 15000 });
  // The GM renames it: Ann's contents follow.
  await page.click('[data-action="contents-lock"]');
  await page.fill(`[data-toc-page-name="${added}"]`, "The North Road");
  await page.press(`[data-toc-page-name="${added}"]`, "Enter");
  await seat.waitForSelector(`.book-page-link[data-page="${added}"]:has-text("The North Road")`, { timeout: 10000 });
  report.push("locked, the contents read as changed; Ann (Chrome) sees the new page, reads it, and its new name when the GM renames it; she has no lock");

  // 7. The new page deleted: its words go with it.
  await page.click(`[data-toc-page="${added}"] [data-action="toc-remove"]`);
  await page.waitForFunction((id) => !document.querySelector(`[data-toc-page="${id}"]`), added);
  await settle(600);
  const gone = await tool("kraken_books", { action: "page", book: handbook.id, page: added }).then(() => false, () => true);
  assert(gone, "the deleted page's words are gone");
  report.push("the added page deleted: gone, with its words");

  // 8. Back to the book's own contents.
  await page.click('[data-action="toc-revert"]');
  await page.waitForFunction(() => !document.querySelector('[data-action="toc-revert"]'), null, { timeout: 10000 });
  toc = await tocOf();
  assert(JSON.stringify(idsIn(toc.chapters)) === JSON.stringify(ownIds) && !toc.edited, "back as the book has it");
  await page.waitForFunction(([id, name]) => document.querySelector(`[data-toc-page-name="${id}"]`)?.value === name, [first.id, first.name], { timeout: 10000 });
  report.push(`Back to the book's own contents: its ${ownIds.length} pages in their order, "${first.name}" named so again`);

  // 9. The agent: a page added (no id), then the book's own contents again.
  const chapters = structuredClone(toc.chapters);
  chapters[0].sections[0].pages.unshift({ name: "Agent's Page" });
  const made = await tool("kraken_books", { action: "contents-set", book: handbook.id, chapters });
  const agentPage = made.pages.find((p) => p.name === "Agent's Page");
  assert(agentPage?.id.startsWith("new-"), "the agent's page has an id");
  await page.waitForSelector(`[data-toc-page="${agentPage.id}"]`, { timeout: 10000 });
  kept = await tool("kraken_books", { action: "page", book: handbook.id, page: agentPage.id });
  assert(kept.name === "Agent's Page" && kept.blocks.length === 0, "an empty page");
  await tool("kraken_books", { action: "contents-revert", book: handbook.id });
  await page.waitForFunction((id) => !document.querySelector(`[data-toc-page="${id}"]`), agentPage.id, { timeout: 10000 });
  report.push("kraken_books contents-set added an empty page (its id came back), contents-revert took it away; the open window followed both");
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok book contents ui:\n  ${report.join("\n  ")}\n  ${path.join(tmpdir(), "kraken-book-contents.png")}`);
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
