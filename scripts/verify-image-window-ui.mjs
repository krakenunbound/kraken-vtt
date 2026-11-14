// FG's image window in the real app: every picture of the active books in
// Campaign > Images; one opened there is the GM's alone (a test player in
// Chrome is not shown it), unlocked (the editor open), and what is drawn on it
// is its master's: opened again from the book's Pictures (its lock), it has
// the same walls. A play test puts a test token on it and the GM's view is a
// player's; ended, the token goes. Put in play, the test player's map is it,
// with its walls. kraken_image does the same.
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
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-image-window-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
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
const walls = async () => (await tool("kraken_wall", { action: "list" })).total ?? 0;
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
let browser = null;
const report = [];
const YARD = "The Watchtower Yard";
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
  const campaign = await tool("kraken_campaign_create", { name: "Image window", ruleset: "Descending Darkness" });
  const port = 47453;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const books = await tool("kraken_books", { action: "list" });
  const tower = books.find((book) => book.name === "The Empty Watchtower");
  await tool("kraken_books", { action: "activate", book: tower.id });

  // A test player in Chrome: they must not see an image the GM only opened.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // Campaign > Images: every picture of the active books.
  await page.click('.sidebar [data-launch="imagelist"]');
  await page.waitForSelector(`[data-images-list] [data-image="${YARD}"]`);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const listed = await page.$$eval("[data-images-list] [data-image]", (all) => all.length);
  report.push(`Images lists ${listed} pictures of the active books`);
  // Its pictures loaded (the list stops moving), then the yard.
  await page.waitForFunction(() => [...document.querySelectorAll("[data-images-list] img")].every((img) => img.complete));
  await page.locator(`[data-images-list] [data-image="${YARD}"]`).scrollIntoViewIfNeeded();
  await page.$eval(`[data-images-list] [data-image="${YARD}"]`, (button) => button.click());
  await page.waitForSelector(`[data-image-window="${YARD}"]`);
  await page.waitForSelector('[data-action="map-editor"][aria-pressed="true"]');
  const start = await walls();
  assert(start > 0, "the yard's walls are on the image");
  await settle(1500);
  assert(!(await seat.$(".map-window [data-scene], .map-window canvas")), "the test player is not shown the image the GM opened");
  report.push(`${YARD} open in the image window, unlocked, ${start} walls; the test player does not see it`);

  // Edited there: a wall more, on its master.
  await tool("kraken_wall", { action: "add", points: [70, 70, 210, 70], kind: "wall" });
  assert((await walls()) === start + 1, "the new wall is on the image");
  await page.click('[data-action="image-close"]');
  await page.waitForSelector("[data-image-window]", { state: "detached" });

  // The same image from the book's Pictures: its lock opens the same master.
  const contents = await tool("kraken_books", { action: "contents", book: tower.id });
  const picture = (contents.pictures ?? contents.images ?? []).find((item) => item.name === YARD) ?? (contents.pictures ?? contents.images ?? [])[0];
  assert(picture?.file, `the book lists its pictures: ${JSON.stringify(contents).slice(0, 300)}`);
  await page.evaluate(() => undefined);
  await tool("kraken_image", { action: "open", book: tower.name, file: picture.file });
  await page.waitForSelector("[data-image-window]");
  const again = await walls();
  assert(again === start + 1, `opened again, the image has the same walls (${again}, not ${start + 1})`);
  report.push("opened again by its file (the book's picture), the same master: the new wall is there");

  // Play test: a test token, the GM sees as a player sees; ended, it goes.
  await page.click('[data-action="image-test"]');
  await page.waitForSelector('[data-action="image-test"][aria-pressed="true"]');
  await page.waitForSelector('[data-action="map-editor"]', { state: "detached" });
  const during = await tool("kraken_map");
  const testing = during.tokens.some((token) => token.name === "Test player" && token.owner === "@test");
  assert(testing, "a test token is on the image");
  // Moved as a player moves it (the GM's own screen sends the move): walls stop it.
  const probe = during.tokens.find((token) => token.owner === "@test");
  const far = { x: 5, y: 5 };
  await page.evaluate(({ id, x, y }) => window.__kraken?.moveToken(id, x, y, false), { id: probe.id, ...far });
  await settle(700);
  const moved = (await tool("kraken_map")).tokens.find((token) => token.id === probe.id);
  if (process.env.DEBUG_IMAGES) console.log(JSON.stringify({ from: { x: probe.x, y: probe.y }, to: { x: moved.x, y: moved.y } }));
  assert(Math.hypot(moved.x - far.x, moved.y - far.y) > 30, "the test token is stopped by the walls, as a player's is");
  await page.click('[data-action="image-test"]');
  await page.waitForSelector('[data-action="map-editor"]');
  assert(!(await tool("kraken_map")).tokens.some((token) => token.owner === "@test"), "the test token goes when the test ends");
  report.push("play test: a test token and the player's view (no editor); ended, the GM's view again");

  // Put in play: the test player's map is the image, with its walls.
  await page.click('[data-action="image-play"]');
  await page.waitForSelector("[data-image-window]", { state: "detached" });
  await seat.waitForFunction((name) => document.body.textContent?.includes(name), YARD, { timeout: 20000 });
  assert((await walls()) === start + 1, "in play with its walls");
  report.push("put in play: the test player's map is the image, with the same walls");

  // kraken_image: open another, test, close.
  const second = (await tool("kraken_library", { action: "list", module: tower.name, kind: "image" })).find((item) => item.name !== YARD && item.map);
  if (second) {
    const opened = await tool("kraken_image", { action: "open", book: tower.name, name: second.name });
    assert(opened.opened === second.name && !opened.onTable, `kraken_image open (${JSON.stringify(opened)})`);
    await tool("kraken_image", { action: "test", on: true });
    await tool("kraken_image", { action: "test", on: false });
    await tool("kraken_image", { action: "close" });
    await page.waitForSelector("[data-image-window]", { state: "detached" });
    report.push(`kraken_image opened ${second.name}, tested and closed it`);
  }

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok image window ui:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
