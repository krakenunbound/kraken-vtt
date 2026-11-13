// Every picture a book shows opens its one master in the image window, for
// the GM (FG: clicking an image anywhere opens that image, to share, edit and
// test): a picture on a book's page, one from its Images & Maps tab, and one
// that is no map record (a page's painting) as an image of its own. A map
// opened from a page has its walls; edited there, opened again from the book
// it has the edit. A player still sees only what the GM shares.
//
// KRAKEN_TEST_PACKS: a packs folder holding "D&D 3.5e B2 The Keep on the
// Borderlands" (the GM's own book) for the map-on-a-page case, which needs it.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-book-pictures-ui-"));
const gmPacks = process.env.KRAKEN_TEST_PACKS || path.join(homedir(), "Documents", "Kraken VTT", "Packs");
const B2 = "D&D 3.5e B2 The Keep on the Borderlands";
const haveB2 = existsSync(path.join(gmPacks, `${B2}.kpack`));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: haveB2 ? gmPacks : path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1700, height: 1000 }).catch(() => undefined);
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
  return JSON.parse(text);
}
const walls = async () => (await tool("kraken_wall", { action: "list" })).total ?? 0;
// A click the way the GM makes it (the element itself: a hit test on a scaled second monitor is unreliable).
const press = (selector) => page.$eval(selector, (element) => element.click());
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }

  // A book's page with a painting (no map record): its own image, opened from the page.
  const dd = await tool("kraken_campaign_create", { name: "Pictures", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: dd.id, port: 47456, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const handbook = (await tool("kraken_books", { action: "list" })).find((book) => book.name === "Descending Darkness Player's Handbook");
  await tool("kraken_books", { action: "activate", book: handbook.id });
  const contents = await tool("kraken_books", { action: "contents", book: handbook.id });
  const pages = JSON.stringify(contents).match(/"id":"([^"]+)"/g).map((item) => item.slice(6, -1));
  let pictured = null;
  for (const id of pages) {
    const read = await tool("kraken_books", { action: "page", book: handbook.id, page: id }).catch(() => null);
    if (read && /images\//.test(JSON.stringify(read))) {
      pictured = { id, read };
      break;
    }
  }
  assert(pictured, "a handbook page with a picture");
  await page.click('.sidebar [data-launch="books"]');
  await page.waitForSelector(`[data-window="books"] [data-book="${handbook.id}"]`);
  await press(`[data-window="books"] [data-book="${handbook.id}"]`);
  await page.waitForSelector(`.book-toc [data-page="${pictured.id}"]`);
  await press(`.book-toc [data-page="${pictured.id}"]`);
  await page.waitForSelector(".book-figure-open");
  await press(".book-figure-open");
  await page.waitForSelector("[data-image-window]", { timeout: 30000 });
  await page.waitForSelector('[data-action="map-editor"][aria-pressed="true"]');
  const opened = await page.getAttribute("[data-image-window]", "data-image-window");
  // Its master: a wall drawn, then opened again from the page, the wall is there.
  await tool("kraken_wall", { action: "add", points: [10, 10, 120, 10], kind: "wall" });
  const kept = await walls();
  await tool("kraken_image", { action: "close" });
  await page.waitForSelector("[data-image-window]", { state: "detached" });
  await press(".book-figure-open");
  await page.waitForSelector("[data-image-window]", { timeout: 30000 });
  assert((await walls()) === kept && kept >= 1, `the page's picture opens the same master (${await walls()} walls, ${kept} before)`);
  report.push(`a picture on a handbook page (${opened}) opens in the image window, unlocked; a wall drawn there is there when it is clicked again`);
  await tool("kraken_image", { action: "close" });

  await tool("kraken_leave");
  await page.waitForSelector("text=My Campaigns");

  // The GM's own B2: The Caves of Chaos on its page opens the map, with its walls.
  if (haveB2) {
    const c = await tool("kraken_campaign_create", { name: "Keep", ruleset: "D&D 3.5E" });
    await tool("kraken_host", { campaignId: c.id, port: 47457, password: "pw" });
    await page.waitForSelector("text=Hosting");
    const b2 = (await tool("kraken_books", { action: "list" })).find((book) => book.name === B2 || book.title === B2);
    await tool("kraken_books", { action: "activate", book: b2.id });
    const toc = await tool("kraken_books", { action: "contents", book: b2.id });
    const caves = JSON.stringify(toc).match(/"id":"([^"]+)","name":"The Caves of Chaos"/)?.[1];
    assert(caves, "B2's page The Caves of Chaos");
    await page.click('.sidebar [data-launch="books"]');
    await page.waitForSelector(`[data-window="books"] [data-book="${b2.id}"]`);
    await press(`[data-window="books"] [data-book="${b2.id}"]`);
    await page.waitForSelector(`.book-toc [data-page="${caves}"]`);
    await press(`.book-toc [data-page="${caves}"]`);
    // The map on the page (it also shows a handout of the ravine and the original DM map).
    await page.waitForSelector('.book-figure-open[data-figure$="maps/caves.webp"]');
    await press('.book-figure-open[data-figure$="maps/caves.webp"]');
    await page.waitForSelector("[data-image-window]", { timeout: 60000 });
    await page.waitForSelector('[data-action="map-editor"][aria-pressed="true"]');
    const count = await walls();
    assert(count > 0, "the Caves of Chaos open with their walls");
    for (const action of ["image-play", "image-test", "image-studio", "image-close"]) assert(await page.$(`[data-action="${action}"]`), `the image window offers ${action}`);
    report.push(`B2 (3.5e): The Caves of Chaos clicked on its page opens the map in the image window, unlocked, with ${count} walls; put in play, play test, Map Studio and close offered`);
    await tool("kraken_image", { action: "close" });
    // The book's Images & Maps tab: a click opens the image.
    await page.waitForSelector('[data-book-view="pictures"]');
    await press('[data-book-view="pictures"]');
    await page.waitForSelector("[data-picture]", { state: "attached" });
    await press("[data-picture]");
    await page.waitForSelector("[data-image-window]", { timeout: 30000 });
    report.push("a picture in the book's Images & Maps tab opens in the image window");
    await tool("kraken_image", { action: "close" });
  } else report.push("B2 (3.5e) not in the packs folder: the map-on-a-page case skipped");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok book pictures ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
