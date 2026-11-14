// Ability cards in play: the GM hosts a Descending Darkness map with a Bone
// Sentinel on it; a test player in Chrome opens their wizard's cards and drags
// them onto the creature's token, as at the table. Not in the fight yet: the
// card says so and nothing is cast. In the fight: Spark Lash dropped on the
// Sentinel targets it (only it) and attacks; Burning Fan spends a slot and
// asks for its save; the dagger card attacks. Screenshots in the temp folder.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-cards-play-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
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
const listOf = (value) => (Array.isArray(value) ? value : value.records ?? value.books ?? []);
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const shot = (name) => path.join(tmpdir(), `kraken-cards-play-${name}.png`);
const until = async (test, what, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const value = await test();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out: ${what}`);
};
// A card dragged from the Cards window and dropped on a token, as the mouse does it.
const dropCard = (seat, card, token) =>
  seat.evaluate(
    ([from, to]) => {
      const start = document.querySelector(from);
      const end = document.querySelector(to);
      if (!start || !end) return `missing ${!start ? from : to}`;
      const transfer = new DataTransfer();
      const box = end.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      start.dispatchEvent(new DragEvent("dragstart", { dataTransfer: transfer, bubbles: true, cancelable: true }));
      for (const type of ["dragover", "drop"]) end.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      start.dispatchEvent(new DragEvent("dragend", { dataTransfer: transfer, bubbles: true }));
      return "ok";
    },
    [`[data-card="${card}"]`, `[data-token="${token}"]`],
  );

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Cards in play", ruleset: "Descending Darkness" });
  const port = 47449;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  for (const book of listOf(await tool("kraken_books", { action: "list" })).filter((item) => /Descending Darkness (Player's Handbook|Bestiary)/.test(item.title))) await tool("kraken_books", { action: "activate", book: book.id });
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector(".map-toolbar");

  const wizard = await tool("kraken_build_character", { owner: "A test player", spec: { name: "Ilse", species: "Human", class: "Wizard", level: 1, scores: { strength: 8, dexterity: 14, constitution: 13, intelligence: 17, wisdom: 12, charisma: 10 }, spells: ["Kindle", "Spark Lash", "Burning Fan", "Iron Will"], gear: [["Dagger", 1]] } });
  const sentinel = listOf(await tool("kraken_records_list", { type: "npc" })).find((item) => item.name === "Bone Sentinel");
  assert(sentinel, "the Bestiary's Bone Sentinel");
  await tool("kraken_token_place", { recordId: wizard.id, col: 5, row: 5 });
  const foeToken = await tool("kraken_token_place", { recordId: sentinel.id, col: 8, row: 5 });
  const foeTokenId = foeToken.id ?? foeToken.token?.id;
  assert(foeTokenId, `the Sentinel's token: ${JSON.stringify(foeToken)}`);

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector(`[data-token="${foeTokenId}"]`, { timeout: 15000 });
  await seat.click('[data-launch="settings"]');
  await seat.check('[data-setting="cards"]');
  await seat.click('[data-launch="settings"]');
  await seat.click('[data-launch="cards"]');
  await seat.waitForSelector('[data-card="spell:spark-lash"]', { timeout: 8000 });

  // Not in the fight: nothing is cast; the card says why.
  const chatBefore = await page.$$eval(".chat-line", (lines) => lines.length);
  assert((await dropCard(seat, "spell:spark-lash", foeTokenId)) === "ok", "the first drop");
  await seat.waitForSelector("text=not in the fight", { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert((await page.$$eval(".chat-line", (lines) => lines.length)) === chatBefore, "nothing cast out of the fight");

  // In the fight, Ilse's turn.
  await tool("kraken_combat", { action: "add", recordId: sentinel.id });
  await tool("kraken_combat", { action: "add", recordId: wizard.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = view.find((entry) => entry.recordId === sentinel.id);
  const mine = view.find((entry) => entry.recordId === wizard.id);
  await tool("kraken_combat", { action: "update", id: foe.id, patch: { initresult: 5 } });
  await tool("kraken_combat", { action: "update", id: mine.id, patch: { initresult: 15 } });
  await tool("kraken_combat", { action: "next" });
  // A stray target from before, which the card replaces.
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: mine.id, on: true });
  await seat.waitForFunction(() => document.querySelector('[data-card="spell:spark-lash"]'), null, { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Spark Lash on the Sentinel: it is the only target, and the spell attacks it.
  await tool("kraken_dice_force", { values: [17, 3] });
  assert((await dropCard(seat, "spell:spark-lash", foeTokenId)) === "ok", "the Spark Lash drop");
  await page.waitForFunction(() => /Spark Lash/.test(document.querySelector(".chat-log")?.textContent ?? ""), null, { timeout: 10000 });
  view = await until(async () => {
    const entries = (await tool("kraken_combat", { action: "view" })).entries;
    const me = entries.find((entry) => entry.id === mine.id);
    return me.targets.length === 1 && me.targets[0] === foe.id ? entries : null;
  }, "the Sentinel as Ilse's only target");
  await seat.waitForTimeout(250);
  await seat.screenshot({ path: shot("lash") });

  // Burning Fan: a slot spent, the save asked for.
  const slotsBefore = (await tool("kraken_record_get", { id: wizard.id })).data.slots.l1.used ?? 0;
  await tool("kraken_dice_force", { values: [2, 2, 2, 2, 2, 2] });
  assert((await dropCard(seat, "spell:burning-fan", foeTokenId)) === "ok", "the Burning Fan drop");
  await page.waitForFunction(() => /Burning Fan/.test(document.querySelector(".chat-log")?.textContent ?? ""), null, { timeout: 10000 });
  await until(async () => ((await tool("kraken_record_get", { id: wizard.id })).data.slots.l1.used ?? 0) === slotsBefore + 1, "Burning Fan spent a 1st-level slot");
  await seat.waitForFunction(() => document.querySelector(".pips")?.textContent !== null, null, { timeout: 2000 }).catch(() => undefined);

  assert(!(await seat.isVisible("text=not in the fight")), "a card that worked clears the message");

  // The dagger, with its card's picture (a blade).
  const dagger = await seat.$eval('[data-card^="weapon:"]', (card) => card.getAttribute("data-card"));
  await seat.waitForFunction((id) => { const img = document.querySelector(`[data-card="${id}"] .kcard-art img`); return img && img.complete && img.naturalWidth > 0 && /blade/.test(img.src); }, dagger, { timeout: 8000 });
  await tool("kraken_dice_force", { values: [15] });
  assert((await dropCard(seat, dagger, foeTokenId)) === "ok", "the dagger drop");
  await page.waitForFunction(() => /\[ATTACK|Dagger/.test(document.querySelector(".chat-log")?.textContent ?? "") && /Dagger/.test(document.querySelector(".chat-log")?.textContent ?? ""), null, { timeout: 10000 });
  await seat.waitForTimeout(400);
  await seat.screenshot({ path: shot("player") });
  await page.screenshot({ path: shot("gm") });
  const chat = await page.$eval(".chat-log", (log) => log.textContent);
  assert(failures.length === 0, `no page errors: ${failures.join(" | ")}`);
  console.log(`ok cards play: out of the fight the card says so; Spark Lash dropped on the Bone Sentinel made it the only target and attacked; Burning Fan spent a slot; the message cleared; the dagger card (its blade picture) attacked. Chat: ${chat.replace(/\s+/g, " ").slice(-400)} ${shot("player")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
process.exit(0);
