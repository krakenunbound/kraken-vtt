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

  // A book from Modules onto slot 2 (an active one: an inactive book is off limits); Modules still opens and closes.
  const first = await page.getAttribute('[data-window="books"] .books-open >> nth=0', "data-book");
  await tool("kraken_books", { action: "activate", book: first });
  await page.waitForSelector(`[data-window="books"] .books-open[data-book="${first}"]:not(.inactive)`);
  await page.dragAndDrop(`[data-window="books"] .books-open[data-book="${first}"]`, slot(2));
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

  // The menu as a person sees it, on the docked bar: in the top layer above the bar (not inside it,
  // clipped, with scrollbars), and Clear clicked where it is on screen, five times in a row.
  for (let round = 0; round < 5; round++) {
    await page.dragAndDrop(`[data-window="books"] .books-open[data-book="${first}"]`, slot(2));
    await page.waitForSelector(`${slot(2)}.full`);
    const at = await page.locator(slot(2)).boundingBox();
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2, { button: "right" });
    await page.waitForSelector(".quick-slot-menu:popover-open");
    const pointerY = at.y + at.height / 2;
    const seen = await page.evaluate((y) => {
      const bar = document.querySelector(".quick-slots"), menu = document.querySelector(".quick-slot-menu"), clear = menu.querySelector('[data-slot-action="clear"]');
      const box = clear.getBoundingClientRect(), menuBox = menu.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { docked: bar.dataset.docked, onTop: hit === clear || clear.contains(hit), upward: menuBox.bottom <= y + 2 && menuBox.top >= 0, scrolls: bar.scrollHeight > bar.clientHeight + 1 || bar.scrollWidth > bar.clientWidth + 1 };
    }, pointerY);
    assert(seen.docked === "true" && seen.onTop && seen.upward && !seen.scrolls, `round ${round + 1}: the menu opens upward from the pointer on screen, Clear on top, no scrollbars on the bar: ${JSON.stringify(seen)}`);
    const clearBox = await page.locator('[data-slot-action="clear"]').boundingBox();
    await page.mouse.click(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2);
    await page.waitForSelector(`${slot(2)}:not(.full)`, { timeout: 3000 });
    await page.waitForSelector(".quick-slot-menu", { state: "detached" });
  }
  report.push("on the docked bar the menu opens upward from the pointer in the top layer (no scrollbars on the bar) and Clear clicked where it shows empties the slot, five times running");

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
  await page.keyboard.press("F4");
  await settle(800);
  const after = await tool("kraken_chat_log", { count: 50 });
  assert(after.length > before && after.at(-1).roll?.formula === "3d6", "the 4 key rolls slot 4's dice");
  report.push("right-click a d6, pick up 3, click a slot: 3d6 kept; a click and the 4 key roll it");

  // Dice in the hand thrown with the hand's swing (FG): the button pressed grips
  // them (nothing is rolled while it is held); let go mid-swing, they leave the
  // hand that fast. A slow swing rolls them gently, a hard one fast.
  const swing = async (pixels, ms) => {
    await page.click('.tray-die[aria-label="d20"]', { button: "right" });
    await page.click('[data-many="5"]');
    const startX = 700;
    const startY = 500;
    await page.mouse.move(startX, startY, { steps: 2 });
    await page.waitForSelector('.dice-ghost.held[data-held="5d20"]');
    const rolls = (await tool("kraken_chat_log", { count: 50 })).length;
    await page.mouse.down();
    await settle(600);
    assert((await tool("kraken_chat_log", { count: 50 })).length === rolls, "pressing the button only grips the dice: nothing is rolled");
    assert(await page.$('.dice-ghost.held[data-held="5d20"]'), "the dice are still in the hand while the button is held");
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(startX + (pixels * step) / 10, startY - (pixels * step) / 30);
      await settle(ms / 10);
    }
    await page.mouse.up();
    for (let tries = 0; (await tool("kraken_chat_log", { count: 50 })).length === rolls && tries < 20; tries++) await settle(200);
    assert((await tool("kraken_chat_log", { count: 50 })).length > rolls, "letting go of the button throws them");
    await settle(3500);
    return Number(await page.evaluate(() => document.documentElement.dataset.lastThrow ?? "0"));
  };
  // Not rolled after all (FG): let go with a still hand, or over the chat: nothing rolls, the hand is empty.
  for (const [how, x, y] of [["a still hand", 700, 500], ["over the chat", null, null]]) {
    await page.click('.tray-die[aria-label="d20"]', { button: "right" });
    await page.click('[data-many="2"]');
    const chatBox = await page.locator(".chat-dock .chat-log").boundingBox();
    const at = x === null ? { x: chatBox.x + chatBox.width / 2, y: chatBox.y + chatBox.height / 2 } : { x, y };
    await page.mouse.move(at.x - 40, at.y, { steps: 2 });
    await page.waitForSelector('.dice-ghost.held[data-held="2d20"]');
    const rolls = (await tool("kraken_chat_log", { count: 50 })).length;
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await settle(400);
    await page.mouse.down();
    await settle(300);
    await page.mouse.up();
    await settle(1500);
    assert((await tool("kraken_chat_log", { count: 50 })).length === rolls, `let go with ${how}: nothing rolled`);
    assert(!(await page.$(".dice-ghost.held")), `let go with ${how}: the hand is empty`);
  }
  report.push("dice picked up and let go with a still hand, or over the chat: not rolled, the hand empty (FG)");
  const gentle = await swing(120, 500);
  const hard = await swing(700, 120);
  assert(hard > gentle * 4, `a hard swing throws much faster than a gentle one (gentle ${gentle}, hard ${hard} screens a second)`);
  assert(gentle > 0.05 && gentle < 0.6 && hard > 1, `the speeds are the hand's (gentle ${gentle}, hard ${hard})`);
  report.push(`5d20 in the hand: pressing grips them (no roll), letting go mid-swing throws them that fast: gentle ${gentle}, hard ${hard} screens a second`);

  // A record's anchor (FG's link icon, top left of its window): a sheet's onto a quick slot, an NPC's onto the combat tracker.
  const linked = await tool("kraken_record_create", { type: "character", name: "Anchored Hero", data: { level: 1, hp: { total: 8, wounds: 0 } } });
  await tool("kraken_windows", { action: "open", kind: "sheet", record: linked.id });
  const sheetAnchor = page.locator(`[data-window-anchor="sheet:${linked.id}"]`);
  await sheetAnchor.waitFor();
  await sheetAnchor.dragTo(page.locator(slot(6)));
  for (let wait = 0; wait < 20 && (await slots())[6]?.record !== linked.id; wait++) await settle(150);
  const kept6 = (await slots())[6];
  assert(kept6?.kind === "sheet" && kept6.record === linked.id, `the sheet's anchor onto slot 7 keeps a link to it (${JSON.stringify(kept6)})`);
  await tool("kraken_windows", { action: "close", kind: "sheet", record: linked.id });
  const goblin = await tool("kraken_record_create", { type: "npc", name: "Anchor Goblin", data: { hp: 7, ac: 15 } });
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await tool("kraken_windows", { action: "open", kind: "record", record: goblin.id });
  const npcAnchor = page.locator(`[data-window-anchor="record:${goblin.id}"]`);
  await npcAnchor.waitFor();
  // The record window opened over the tracker: move it aside by its title bar, as a GM would.
  {
    const bar = await page.locator('.window[data-window="record"] .window-title').boundingBox();
    const tracker = await page.locator('.window[data-window="combat"]').boundingBox();
    await page.mouse.move(bar.x + 60, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(tracker.x + tracker.width + 80, bar.y + bar.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await npcAnchor.dragTo(page.locator('.window[data-window="combat"] .window-body'));
  let onTracker = false;
  for (let wait = 0; wait < 20 && !onTracker; wait++) {
    onTracker = (await tool("kraken_combat", { action: "view" })).entries.some((entry) => entry.name.startsWith("Anchor Goblin"));
    if (!onTracker) await settle(150);
  }
  assert(onTracker, "the NPC's anchor onto the combat tracker adds it to the fight");
  report.push("a record's anchor (top left of its window) dragged: a sheet onto a quick slot keeps its link; an NPC onto the combat tracker joins the fight");

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
  await page.keyboard.press("F6");
  await settle(900);
  // Typing a 6 in the chat is a 6 (the slots are on F1-F12).
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
  // The grip, docked: grabbed and moved a little, the bar moves with the pointer (no jump to the side).
  const grip = await page.locator('[data-action="quickslots-move"]').boundingBox();
  const barAt = async () => (await page.locator(".quick-slots").boundingBox()).x;
  const docked = await barAt();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 30, grip.y + grip.height / 2 - 40, { steps: 4 });
  const moved = await barAt();
  await page.mouse.up();
  assert(Math.abs(moved - docked - 30) < 3, `the bar follows its grip from the dock (${docked} -> ${moved}, moved 30)`);
  await page.dblclick('[data-action="quickslots-move"]');
  report.push("the quick slots' grip takes the bar off the dock without a jump");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok quickslots ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
