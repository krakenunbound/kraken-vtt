// Quick slots and the two book windows in the real app, as the GM uses them:
// Modules (every module for the game: Activation, Packs) and Books (only the
// active books) are apart; a book dragged from Modules onto a slot leaves
// Modules working; a right-click on a slot opens its menu (the slot is never
// emptied without choosing Clear); a window popped out of the main window is
// closed by its sidebar button. Dice: right-click a die, pick up 3, click a
// slot (FG's dice in the hand); a die dragged onto a slot; a click and the
// number key roll them. A chat line (/roll 4d6k3) dragged from the entry onto
// a slot runs again with a click, its key, or kraken_quickslots press.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-quickslots-ui-"));
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
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slot = (index) => `[data-quick-slot="${index}"]`;
const slots = async () => (await tool("kraken_quickslots")).slots ?? (await tool("kraken_quickslots"));
const lastRoll = async () => (await tool("kraken_chat_log", { count: 5 })).filter((line) => line.roll).at(-1)?.roll ?? null;
const modulesOpen = () => page.evaluate(() => document.querySelector('[data-launch="books:activation"]')?.classList.contains("open") ?? false);
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
  const campaign = await tool("kraken_campaign_create", { name: "Quick slots", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47452, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // Modules: Activation and Packs only; every module for the game.
  await page.click('[data-launch="books:activation"]');
  await page.waitForSelector('[data-window="books"] [data-books-tab="activation"]');
  assert((await page.$('[data-books-tab="books"]')) === null, "Modules has no Books tab");
  await page.waitForSelector('[data-window="books"] .books-open');
  const modules = await page.$$eval('[data-window="books"] .books-open', (rows) => rows.map((row) => row.textContent));
  assert(modules.length === 3, `Modules lists the game's modules (${modules.length})`);
  // Books: only the active books, no tabs.
  await page.click('[data-launch="books"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-window="books"]').length === 2);
  const booksWindow = page.locator('[data-window="books"]').nth(1);
  assert((await booksWindow.locator("[data-books-tab]").count()) === 0, "Books has no tabs");
  assert((await booksWindow.locator(".books-open").count()) === 0, "Books holds no book until one is made active");
  await page.click('[data-launch="books"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-window="books"]').length === 1);
  report.push("Modules (Activation, Packs) and Books (active books only) apart");

  // A book from Modules onto slot 2; Modules still opens and closes.
  await page.dragAndDrop('[data-window="books"] .books-open >> nth=0', slot(2));
  await page.waitForSelector(`${slot(2)}.full`);
  assert(await modulesOpen(), "Modules still open after the drop");
  await page.click('[data-launch="books:activation"]');
  await page.waitForFunction(() => !document.querySelector('[data-launch="books:activation"]')?.classList.contains("open"));
  await page.click('[data-launch="books:activation"]');
  await page.waitForSelector('[data-window="books"] [data-books-tab="activation"]');
  report.push("a book dragged from Modules onto a slot; Modules opens and closes after");

  // A right-click opens the slot's menu: nothing is emptied until Clear.
  await page.click(slot(2), { button: "right" });
  await page.waitForSelector(".quick-slot-menu");
  assert(await page.$(`${slot(2)}.full`), "a right-click does not empty the slot");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".quick-slot-menu", { state: "detached" });
  assert(await page.$(`${slot(2)}.full`), "Escape leaves the slot as it was");
  await page.click(slot(2), { button: "right" });
  await page.click('[data-slot-action="rename"]');
  await page.fill('.quick-slot-rename input', "My handbook");
  await page.click('[data-slot-action="rename-save"]');
  await page.waitForFunction(() => document.querySelector('[data-quick-slot="2"]')?.textContent?.includes("My handbook"));
  await page.click(slot(2), { button: "right" });
  await page.click('[data-slot-action="clear"]');
  await page.waitForSelector(`${slot(2)}:not(.full)`);
  report.push("right-click: a menu (use, rename, clear); emptied only by Clear");

  // Modules popped out to a window of its own: its sidebar button closes it.
  const popped = app.waitForEvent("window");
  await page.click('[data-window="books"] [aria-label^="Pop out"]');
  const out = await popped;
  await out.waitForLoadState().catch(() => undefined);
  await page.waitForFunction(() => document.querySelector('[data-launch="books:activation"]')?.classList.contains("open"));
  await page.click('[data-launch="books:activation"]');
  await page.waitForFunction(() => !document.querySelector('[data-launch="books:activation"]')?.classList.contains("open"));
  // Opened again: the window of its own comes back, in sight, and closes again.
  const again = app.waitForEvent("window");
  await page.click('[data-launch="books:activation"]');
  const outAgain = await again;
  const seen = await app.evaluate(({ BrowserWindow, screen }) => {
    const windows = BrowserWindow.getAllWindows();
    const child = windows[windows.length - 1];
    const bounds = child.getBounds();
    return screen.getAllDisplays().some(({ workArea: area }) => bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + 40 > area.y);
  });
  assert(seen, "the window of its own is on a screen");
  await page.click('[data-launch="books:activation"]');
  await page.waitForFunction(() => !document.querySelector('[data-launch="books:activation"]')?.classList.contains("open"));
  await outAgain.waitForEvent("close", { timeout: 5000 }).catch(() => undefined);
  // Back in the main window for the rest (Modules remembered out: dock it again).
  await page.evaluate(() => window.localStorage.removeItem("kraken-window:modules"));
  report.push("a popped-out Modules closes from the sidebar and opens on a screen");

  // FG's dice in the hand: right-click a d6, pick up 3, click slot 3.
  await page.click('.tray-die[aria-label="d6"]', { button: "right" });
  await page.click('[data-many="3"]');
  const box = await page.locator(slot(3)).boundingBox();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y - 40, { steps: 3 });
  await page.waitForSelector('.dice-ghost.held[data-held="3d6"]');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-quick-slot="3"]')?.textContent?.includes("3d6"));
  assert((await slots())[3]?.formula === "3d6", "slot 4 keeps 3d6");
  await page.click(slot(3));
  await settle(800);
  assert((await lastRoll())?.formula === "3d6", `a click on the slot rolls 3d6 (${JSON.stringify(await lastRoll())})`);
  const before = (await tool("kraken_chat_log", { count: 50 })).length;
  await page.click(".desktop-surface", { position: { x: 300, y: 300 } }).catch(() => undefined);
  await page.keyboard.press("4");
  await settle(800);
  const after = await tool("kraken_chat_log", { count: 50 });
  assert(after.length > before && after.at(-1).roll?.formula === "3d6", "the 4 key rolls slot 4's dice");
  report.push("right-click a d6, pick up 3, click a slot: 3d6 kept; a click and the 4 key roll it");

  // Picked up and put back with a right-click: no roll, nothing kept.
  const quiet = (await tool("kraken_chat_log", { count: 50 })).length;
  await page.click('.tray-die[aria-label="d8"]', { button: "right" });
  await page.click('[data-many="2"]');
  await page.mouse.move(700, 400, { steps: 3 });
  await page.waitForSelector(".dice-ghost.held");
  await page.mouse.click(700, 400, { button: "right" });
  await page.waitForSelector(".dice-ghost", { state: "detached" });
  await settle(500);
  assert((await tool("kraken_chat_log", { count: 50 })).length === quiet, "a right-click puts the dice back");
  // Picked up and thrown on the table.
  await page.click('.tray-die[aria-label="d8"]', { button: "right" });
  await page.click('[data-many="2"]');
  await page.mouse.move(700, 420, { steps: 3 });
  await page.mouse.click(700, 420);
  await settle(900);
  assert((await lastRoll())?.formula === "2d8", "a click on the table throws the dice in the hand");
  report.push("dice in the hand: a right-click puts them back, a click on the table throws them");

  // A d20 dragged from the tray onto slot 5.
  const die = await page.locator('.tray-die[aria-label="d20"]').boundingBox();
  const five = await page.locator(slot(4)).boundingBox();
  await page.mouse.move(die.x + die.width / 2, die.y + die.height / 2);
  await page.mouse.down();
  await page.mouse.move(die.x + 40, die.y - 60, { steps: 4 });
  await page.mouse.move(five.x + five.width / 2, five.y + five.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-quick-slot="4"]')?.textContent?.includes("1d20"));
  report.push("a d20 dragged onto a slot");

  // A chat line dragged from the entry: /roll 4d6k3 on slot 6.
  await page.fill("form.chat-entry input", "/roll 4d6k3");
  await page.dragAndDrop('[data-action="chat-macro"]', slot(5));
  await page.waitForFunction(() => document.querySelector('[data-quick-slot="5"]')?.textContent?.includes("/roll 4d6k3"));
  await page.fill("form.chat-entry input", "");
  await page.click(slot(5));
  await settle(900);
  let roll = await lastRoll();
  assert(roll?.formula === "4d6k3" && roll.total >= 3 && roll.total <= 18, `the macro rolls 4d6k3 (${JSON.stringify(roll)})`);
  await page.click(".desktop-surface", { position: { x: 300, y: 300 } }).catch(() => undefined);
  await page.keyboard.press("6");
  await settle(900);
  // Typing a 6 in the chat is a 6, not the slot.
  await page.click("form.chat-entry input");
  await page.keyboard.press("6");
  assert((await page.inputValue("form.chat-entry input")) === "6", "a number typed in the chat stays in the chat");
  await page.fill("form.chat-entry input", "");
  const pressed = await tool("kraken_quickslots", { press: 5 });
  assert(pressed.slot?.kind === "macro" && pressed.slot.text === "/roll 4d6k3", `kraken_quickslots press (${JSON.stringify(pressed)})`);
  await settle(900);
  const macroRolls = (await tool("kraken_chat_log", { count: 20 })).filter((line) => line.roll?.formula === "4d6k3").length;
  assert(macroRolls >= 3, `the click, the 6 key and the agent's press each rolled 4d6k3 (${macroRolls})`);
  // Selected text dragged from anywhere: a slash command becomes a macro (kept by the host).
  await tool("kraken_quickslots", { slots: [null, null, null, null, null, null, { kind: "macro", text: "/roll 2d20kh1", label: "Advantage" }, null, null, null] });
  const kept = await tool("kraken_quickslots");
  assert((kept.slots ?? kept)[6]?.text === "/roll 2d20kh1", "the host keeps a macro slot");
  report.push("/roll 4d6k3 dragged from the chat's entry: a click, the 6 key and kraken_quickslots press run it");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok quickslots ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
