// The session's controls in the real app, the GM's window and a test player in
// Chrome: the player's connection dropped (the socket cut under the page) and
// the GM's too; each sees "Reconnecting..." with the table kept, and sits again
// in the same seat with the same character. The GM's Pause (the menubar's
// button, /pause, kraken_table_options): the player's veil, their roll refused,
// chat going on. Ring bell from the Players window; the player's raised hand
// on the GM's screen; /afk and the idle timer dimming the player's portrait;
// the right-click menu's View as and Ban (the player sent back to the join
// screen, refused there), Unban; the map shared (the players' title card) and
// Pull players to my view (the player's map glides to the GM's), and
// kraken_ping pull. Screenshots of each at 2560x1440 (SHOTS=folder).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = process.env.SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const profile = mkdtempSync(path.join(tmpdir(), "kraken-session-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_GRACE_MS: "20000" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
// A 1440p screen's worth, as the GM's.
await app.evaluate(({ BrowserWindow }, at) => { const win = BrowserWindow.getAllWindows()[0]; win?.setBounds({ x: at[0], y: at[1], width: 2560, height: 1440 }); win?.setFullScreen(true); }, AT);
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
const failures = [];
page.on("pageerror", (error) => failures.push(`gm: ${error.message}`));
page.on("dialog", (dialog) => void dialog.accept());
const shots = [];
async function shoot(where, name) {
  if (!SHOTS) return;
  const file = path.join(SHOTS, `${name}.png`);
  await settle(350);
  await where.screenshot({ path: file });
  shots.push(file);
}
const until = async (check, what, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    const value = await check();
    if (value) return value;
    await settle(250);
  }
  throw new Error(`waited for ${what}`);
};
const results = [];
let browser = null;
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
  const campaign = await tool("kraken_campaign_create", { name: "Session controls", ruleset: "Castles & Crusades" });
  const port = 47433;

  // The GM's own connection, cut under the page on demand (a socket we hold both ends of).
  let gmCut = null;
  await page.routeWebSocket(/:47433\/?$/, (ws) => {
    const server = ws.connectToServer();
    gmCut = () => {
      ws.close({ code: 4002, reason: "cut" });
      server.close({ code: 4002, reason: "cut" });
    };
  });
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_record_create", { type: "character", name: "Tamsin", owner: "a test player", visibility: "owner", data: { level: 1 } });

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
  const player = await context.newPage();
  player.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  let playerCut = null;
  // Unreachable: the player's new connections reach nothing (a sleeping host, Wi-Fi gone), so each attempt times out.
  let unreachable = false;
  await player.routeWebSocket(/:47433\/?$/, (ws) => {
    if (unreachable) return;
    const server = ws.connectToServer();
    playerCut = () => {
      ws.close({ code: 4002, reason: "cut" });
      server.close({ code: 4002, reason: "cut" });
    };
  });
  await player.addInitScript(() => window.localStorage.getItem("kraken-idle-seconds") || window.localStorage.setItem("kraken-idle-seconds", "600"));
  await player.goto(`http://127.0.0.1:${port}/`);
  await player.fill('input[name="name"]', "a test player");
  await player.fill('input[name="account-password"]', "secret1");
  await player.fill('input[name="password"]', "pw");
  await player.click('button[type="submit"]');
  await player.waitForSelector(".sidebar");
  await player.waitForSelector('[data-portrait]:has-text("Tamsin")');

  // --- 1. The player's connection drops: the table stays, "Reconnecting...", then the same seat.
  playerCut();
  await player.waitForSelector(".reconnect-veil");
  assert(await player.$(".sidebar"), "the table stays on screen while reconnecting");
  const seen = await tool("kraken_players");
  assert(seen.players.some((seat) => seat.name === "a test player" && seat.lost), `the GM sees the seat waiting: ${JSON.stringify(seen.players)}`);
  await shoot(player, "player-reconnecting");
  await player.waitForSelector(".reconnect-veil", { state: "detached", timeout: 15000 });
  const back = await tool("kraken_players");
  assert(back.players.filter((seat) => seat.name === "a test player").length === 1 && !back.players.some((seat) => seat.lost), `the same seat again: ${JSON.stringify(back.players)}`);
  await player.waitForSelector('[data-portrait]:has-text("Tamsin"):not(.theirs)');
  results.push("player reconnects to the same seat and character");

  // Unreachable for a while: each attempt times out and the next waits longer (the count climbs, never starts again).
  unreachable = true;
  playerCut();
  await player.waitForSelector(".reconnect-veil");
  const attemptOf = () => player.$eval(".reconnect-veil", (element) => Number(element.dataset.reconnecting)).catch(() => 0);
  await until(async () => (await attemptOf()) >= 3, "the third attempt after two timeouts", 140);
  unreachable = false;
  await player.waitForSelector(".reconnect-veil", { state: "detached", timeout: 30000 });
  results.push("attempts that time out back off");

  // --- The GM's own window: its connection drops and comes back as the GM.
  gmCut();
  await page.waitForSelector(".reconnect-veil");
  await shoot(page, "gm-reconnecting");
  await page.waitForSelector(".reconnect-veil", { state: "detached", timeout: 15000 });
  await page.waitForSelector("text=Hosting");
  const gmBack = await tool("kraken_players");
  assert(gmBack.players.filter((seat) => seat.role === "dm").length === 1, `one GM seat after the GM's reconnect: ${JSON.stringify(gmBack.players)}`);
  results.push("GM window reconnects as the GM");

  // --- 3. Pause: the GM's menubar button; the player's veil; a roll refused; chat goes on.
  await page.click('[data-action="pause"]');
  await player.waitForSelector(".pause-veil");
  await page.waitForSelector(".pause-badge");
  assert((await tool("kraken_table_options")).paused === true, "the pause is the table's option");
  await player.fill(".chat-entry input", "/r 1d20");
  await player.press(".chat-entry input", "Enter");
  await until(() => player.evaluate(() => document.body.textContent.includes("The GM has paused the game.")), "the refused roll's notice");
  await player.fill(".chat-entry input", "waiting patiently");
  await player.press(".chat-entry input", "Enter");
  await until(async () => (await tool("kraken_chat_log", { count: 5 })).some((line) => line.text === "waiting patiently"), "chat while paused");
  await shoot(player, "player-paused");
  await shoot(page, "gm-paused");
  await page.click('[data-action="resume"]');
  await player.waitForSelector(".pause-veil", { state: "detached" });
  // /pause and the tool.
  await page.fill(".chat-entry input", "/pause");
  await page.press(".chat-entry input", "Enter");
  await player.waitForSelector(".pause-veil");
  await tool("kraken_table_options", { paused: false });
  await player.waitForSelector(".pause-veil", { state: "detached" });
  results.push("pause");

  // --- 4. Players window: Ring bell; a raised hand; /afk and idle dimming the portrait.
  await page.click('[data-launch="players"]');
  await page.waitForSelector('.players-window li[data-player-name="a test player"]');
  await page.click('.players-window li[data-player-name="a test player"] [data-action="ring"]');
  await player.waitForSelector(".bell-flash");
  await shoot(player, "player-bell");
  await player.click('[data-action="raise-hand"]');
  await until(async () => (await tool("kraken_players")).players.some((seat) => seat.hand), "her hand up at the table");
  await page.waitForSelector(".bell-flash.hand");
  await page.waitForSelector('[data-portrait] .chip-hand');
  await page.waitForSelector('.players-window li[data-player-name="a test player"] .seat-hand');
  await shoot(page, "gm-hand-raised");
  await player.click('[data-action="raise-hand"]');
  await page.waitForSelector('.players-window .seat-hand', { state: "detached" });
  await player.fill(".chat-entry input", "/afk");
  await player.press(".chat-entry input", "Enter");
  await page.waitForSelector('[data-portrait][data-quiet="away"]');
  await page.waitForSelector('.players-window li[data-state="away"]');
  await player.fill(".chat-entry input", "/afk");
  await player.press(".chat-entry input", "Enter");
  await page.waitForSelector('[data-portrait][data-quiet]', { state: "detached" });
  // Idle: a second browser of hers with a short idle time (its own sign-in by token; the first is told).
  results.push("ring bell, raised hand, afk");

  // The right-click menu on the row: View as, Mark away.
  await page.click('.players-window li[data-player-name="a test player"]', { button: "right" });
  await page.waitForSelector(".player-menu:popover-open");
  await shoot(page, "gm-player-menu");
  await page.click('.player-menu [data-menu="afk"]');
  await page.waitForSelector('[data-portrait][data-quiet="away"]');
  assert((await tool("kraken_players", { action: "afk", name: "a test player", afk: false })).player.afk !== true, "the agent marks her back");
  await page.waitForSelector('[data-portrait][data-quiet]', { state: "detached" });
  // The portrait's right-click opens the same menu.
  await page.click('[data-portrait]:has-text("Tamsin")', { button: "right" });
  await page.waitForSelector(".player-menu:popover-open");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".player-menu:popover-open", { state: "detached" });
  results.push("player menu");

  // --- 6. A map shared: the players' title card; Pull players to my view.
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector('.window[data-window="map"] .map-toolbar');
  await until(() => tool("kraken_map", { share: true }).catch(() => null), "the map on the table to share");
  await player.waitForSelector(".scene-title-card");
  await shoot(player, "player-scene-title");
  await player.waitForSelector(".world[data-scale]");
  const scaleOf = (where) => where.$eval(".world[data-scale]", (element) => Number(element.dataset.scale));
  await settle(1200);
  const before = await scaleOf(player);
  // The GM zooms in, then pulls.
  const gmViewport = await page.$('.window[data-window="map"] .viewport');
  const box = await gmViewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
  await settle(500);
  const gmScale = await scaleOf(page);
  await page.click('[data-action="pull-view"]');
  await until(async () => Math.abs((await scaleOf(player)) - before) > 0.01, "the player's map moving to the GM's view");
  await settle(900);
  const after = await scaleOf(player);
  assert(after > before, `the player's map zoomed in with the GM's (${before} -> ${after}, GM ${gmScale})`);
  await shoot(page, "gm-pull-view");
  await shoot(player, "player-pulled");
  const pinged = await tool("kraken_ping", { col: 2, row: 2, pull: true, squares: 6 });
  assert(pinged.pulled === 1, `kraken_ping pull reaches the player: ${JSON.stringify(pinged)}`);
  results.push("title card and view pull");

  // View as the player (the GM's map through her eyes), from the menu.
  await page.$eval('.players-window li[data-player-name="a test player"] [data-action="player-menu"]', (button) => button.click());
  await page.click('.player-menu [data-menu="view-as"]');
  await until(async () => (await page.evaluate(() => document.querySelector('[data-action="vision-preview"]')?.getAttribute("aria-pressed"))) === "true", "the preview on, as her");
  await tool("kraken_players", { action: "view-as", name: "" });
  results.push("view as");

  // --- Ban from the menu: she is sent to the join screen and refused there; Unban lets her in.
  await page.$eval('.players-window li[data-player-name="a test player"] [data-action="player-menu"]', (button) => button.click());
  await page.click('.player-menu [data-menu="ban"]');
  await player.waitForSelector("text=The GM has banned you from this table.");
  await page.waitForSelector('.bans-panel li[data-ban="a test player"]');
  await shoot(page, "gm-banned-list");
  await player.click('button[type="submit"]');
  await player.waitForSelector("text=The GM has banned you from this table.");
  await shoot(player, "player-banned");
  await page.$eval('.bans-panel li[data-ban="a test player"] [data-action="unban"]', (button) => button.click());
  await page.waitForSelector(".bans-panel", { state: "detached" });
  await player.fill('input[name="password"]', "pw");
  await player.click('button[type="submit"]');
  await player.waitForSelector(".sidebar");
  results.push("ban and unban");

  // --- Idle: her portrait dims when she does nothing for a while.
  await player.evaluate(() => window.localStorage.setItem("kraken-idle-seconds", "2"));
  await player.reload();
  await player.fill('input[name="password"]', "pw");
  await player.click('button[type="submit"]');
  await player.waitForSelector(".sidebar");
  await page.waitForSelector('[data-portrait][data-quiet="idle"]', { timeout: 15000 });
  await shoot(page, "gm-player-idle");
  await player.mouse.move(400, 400);
  await player.mouse.move(420, 420);
  await page.waitForSelector('[data-portrait][data-quiet]', { state: "detached" });
  results.push("idle");

  // The GM closes the table: the player goes back to the join screen, told so (no reconnecting).
  await tool("kraken_leave");
  await player.waitForSelector("text=The GM closed the table.");
  assert(!(await player.$(".reconnect-veil")), "no reconnecting to a closed table");
  results.push("the GM closing the table sends players to the join screen");

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`SESSION_UI_OK ${results.join("; ")}${shots.length ? `\nshots: ${shots.join(", ")}` : ""}`);
} finally {
  if (failures.length) console.error(`page errors:\n${failures.join("\n")}`);
  child.kill();
  await browser?.close().catch(() => undefined);
  await app.close().catch(() => undefined);
}
