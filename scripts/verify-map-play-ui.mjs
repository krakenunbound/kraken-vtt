// The map at play in the real app, the GM's window and a test player in
// Chrome, full screen (2560x1440):
//  - the shared ruler: the player right-drags, drops a waypoint with a left
//    click, and the GM sees it in the player's colour, leg by leg; let go, gone;
//  - FG's token options: a health bar on the GM's creature for the player,
//    names off (the player sees no name but their own);
//  - fog of war on the host: the player's explored areas come from the host;
//  - locked movement: the player's drag waits on the GM's approval strip,
//    Accept moves it;
//  - undo: Ctrl+Z takes the player's last move back;
//  - elevation: Alt+wheel on the GM's screen, a badge for everyone;
//  - magical darkness and the GM's regions.
// SHOTS: where the screenshots go (default the temp folder).
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = process.env.SHOTS || tmpdir();
const W = 2560;
const H = 1440;
const profile = mkdtempSync(path.join(tmpdir(), "kraken-map-play-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = process.env.KRAKEN_APP
  ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: W, height: H }).catch(() => undefined);
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
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
let browser = null;
const until = async (check, what, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const value = await check();
    if (value) return value;
    await settle(250);
  }
  throw new Error(`waited for ${what}`);
};
const centre = async (where, selector) => {
  const box = await where.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
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
  const campaign = await tool("kraken_campaign_create", { name: "Map play", ruleset: "Worldbuilding" });
  const port = 47469;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector('.window[data-window="map"] .map-toolbar');
  await tool("kraken_map", { share: true }).catch(() => undefined);
  await tool("kraken_windows", { kind: "map", action: "open" }).catch(() => undefined);

  const hero = await tool("kraken_record_create", { type: "character", name: "Wren", owner: "A test player", visibility: "owner", data: { level: 1, hp: { total: 12, wounds: 2 } } });
  const orc = await tool("kraken_record_create", { type: "npc", name: "Orc Captain", data: { hp: { total: 20, wounds: 9 } } });
  const heroToken = await tool("kraken_token_place", { recordId: hero.id, col: 6, row: 5 });
  const orcToken = await tool("kraken_token_place", { recordId: orc.id, col: 10, row: 5 });
  // The GM's creature hurt on the tracker, so its health shows.
  await tool("kraken_combat", { action: "add", recordId: orc.id });
  const orcEntry = (await tool("kraken_combat")).entries.find((entry) => entry.recordId === orc.id);
  await tool("kraken_combat", { action: "update", id: orcEntry.id, patch: { hp: 20, wounds: 9 } });

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: W, height: H } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.waitForSelector('.window[data-window="map"] .viewport', { timeout: 20000 });
  const seatMap = '.window[data-window="map"] .viewport';
  await seat.waitForSelector(`${seatMap} [data-token="${heroToken.id}"]`);

  // 1. The shared ruler, with a waypoint: right-drag, a left click on the way.
  const from = await centre(seat, `${seatMap} [data-token="${heroToken.id}"]`);
  await seat.mouse.move(from.x, from.y);
  await seat.mouse.down({ button: "right" });
  await seat.mouse.move(from.x + 150, from.y + 150, { steps: 8 });
  await seat.mouse.down({ button: "left" });
  await seat.mouse.up({ button: "left" });
  await seat.mouse.move(from.x + 400, from.y + 150, { steps: 8 });
  await seat.waitForSelector(`${seatMap} .ruler-leg`, { timeout: 5000 });
  const seen = await page.waitForSelector('[data-ruler="A test player"]', { timeout: 5000 });
  const total = Number(await seen.getAttribute("data-ruler-total"));
  assert(total > 0 && (await page.locator(".ruler-leg").count()) >= 1, `the GM sees the player's ruler leg by leg (${total})`);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-ruler-player.png") });
  await page.screenshot({ path: path.join(SHOTS, "kraken-ruler-gm.png") });
  await seat.mouse.up({ button: "right" });
  await page.waitForSelector('[data-ruler="A test player"]', { state: "detached", timeout: 5000 });
  report.push(`the shared ruler: the player's right-drag with a waypoint is on the GM's screen, ${total} ft over two legs; let go, it is gone`);

  // 2. FG's token options: a health bar on the GM's creature for the player; names off.
  await tool("kraken_table_options", { healthNpc: "bar", names: "off" });
  await seat.waitForSelector(`${seatMap} [data-token="${orcToken.id}"] .health-bar`, { timeout: 8000 });
  const orcName = await seat.locator(`${seatMap} [data-token="${orcToken.id}"]`).evaluate((element) => element.textContent + " " + element.getAttribute("data-name") + " " + element.getAttribute("title"));
  assert(!/Orc Captain/.test(orcName), `names off: the player has no name for the orc (${orcName})`);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-health-bar-player.png") });
  await tool("kraken_table_options", { names: "hover" });
  await tool("kraken_token_update", { id: orcToken.id, unidentified: "Hulking brute" });
  await until(() => seat.locator(`${seatMap} [data-token="${orcToken.id}"]`).getAttribute("data-name").then((name) => name === "Hulking brute"), "the unidentified name");
  report.push("token options: a health bar on the orc for the player; names off sends none; the unidentified name instead of the real one");

  // 2b. The GM speaks as the orc: a bubble over its token on the player's screen. Damage floats off it on the
  // GM's screen; the player, shown a health bar and not numbers, gets no number.
  await tool("kraken_chat_send", { text: "None shall pass!", as: "Orc Captain" });
  await seat.waitForSelector(`${seatMap} .token-bubble[data-bubble="${orcToken.id}"]`, { timeout: 8000 });
  assert((await seat.textContent(`${seatMap} .token-bubble[data-bubble="${orcToken.id}"]`)).includes("None shall pass!"), "the orc's words over its token");
  await seat.screenshot({ path: path.join(SHOTS, "kraken-chat-bubble-player.png") });
  await tool("kraken_combat", { action: "damage", id: orcEntry.id, amount: 2 });
  await page.waitForSelector(`.token-float.hurt[data-float="${orcToken.id}"]`, { timeout: 8000 });
  assert((await page.textContent(`.token-float.hurt[data-float="${orcToken.id}"]`)).trim() === "−2", "the GM sees -2 float off the orc");
  await page.waitForTimeout(400);
  assert((await seat.locator(`.token-float[data-float="${orcToken.id}"]`).count()) === 0, "the player, shown a bar, gets no number");
  report.push("chat bubble over the speaking orc; its damage floats on the GM's screen, not the player's");

  // 2c. Range line: the hero targets the orc four squares away. An arrow in the player's colour with
  // "20 ft"; a short bow (range 10/15) puts the orc out of range, a longer one (30/60) within it.
  await tool("kraken_combat", { action: "add", recordId: hero.id });
  const heroEntry = (await tool("kraken_combat")).entries.find((entry) => entry.recordId === hero.id);
  await tool("kraken_record_update", { id: hero.id, data: { inventorylist: { "id-bow": { name: "Short test bow", properties: "Ammunition (Range 10/15; Arrow)", carried: 2 } } } });
  await tool("kraken_combat", { action: "target", id: heroEntry.id, targetId: orcEntry.id, on: true });
  const rangeLine = `${seatMap} .target-line[data-target-line="${heroToken.id}>${orcToken.id}"]`;
  await seat.waitForSelector(rangeLine, { timeout: 8000 });
  assert((await seat.getAttribute(rangeLine, "data-distance")) === "20", `the line says 20 ft: ${await seat.getAttribute(rangeLine, "data-distance")}`);
  await until(async () => (await seat.getAttribute(rangeLine, "data-range")) === "out", "a 10/15 bow: the orc is out of range");
  assert(/out of range/.test(await seat.textContent(rangeLine)), "the label says out of range");
  await seat.screenshot({ path: path.join(SHOTS, "kraken-range-line-player.png") });
  await tool("kraken_record_update", { id: hero.id, data: { inventorylist: { "id-bow": { properties: "Ammunition (Range 30/60; Arrow)" } } } });
  await until(async () => (await seat.getAttribute(rangeLine, "data-range")) === "near", "a 30/60 bow: within range");
  // The hero's turn: its portrait along the top gets the spinning ring and the Turn ribbon.
  await tool("kraken_combat", { action: "set-turn", id: heroEntry.id });
  await seat.waitForSelector(`.portrait-chip.active[data-portrait="${hero.id}"] .chip-turn-ring`, { timeout: 8000 });
  assert(await seat.isVisible(`.portrait-chip.active[data-portrait="${hero.id}"] [data-turn-badge]`), "the Turn ribbon on the hero's portrait");
  await seat.screenshot({ path: path.join(SHOTS, "kraken-turn-portrait-player.png"), clip: { x: 0, y: 0, width: 900, height: 70 } });
  await tool("kraken_combat", { action: "target", id: heroEntry.id, targetId: orcEntry.id, on: false });
  await tool("kraken_combat", { action: "remove", id: heroEntry.id });
  report.push("range line: the hero's arrow to the orc says 20 ft, out of range for a 10/15 bow, within for 30/60");

  // 2d. The map behind every window (FG's background panel), on the player's screen, and back.
  await seat.click('.window[data-window="map"] [data-action="map-backdrop"]');
  await seat.waitForSelector('.window[data-window="map"][data-backdrop="on"]', { timeout: 5000 });
  const filled = await seat.evaluate(() => {
    const map = document.querySelector('.window[data-window="map"]').getBoundingClientRect();
    const table = document.querySelector(".desktop-surface").getBoundingClientRect();
    return Math.abs(map.width - table.width) < 2 && Math.abs(map.height - table.height) < 2;
  });
  assert(filled, "the map fills the table area behind the windows");
  await seat.screenshot({ path: path.join(SHOTS, "kraken-map-backdrop-player.png") });
  await seat.click('.window[data-window="map"] [data-action="map-window"]');
  await seat.waitForSelector('.window[data-window="map"] .window-title', { timeout: 5000 });
  report.push("map behind every window: fills the table area on the player's screen, and back into its window");

  // 3. Fog of war on the host: walls, line of sight; the player's explored areas come from the host.
  await tool("kraken_wall", { action: "add", points: [700, 200, 700, 1200], kind: "wall" }).catch(() => undefined);
  await tool("kraken_line_of_sight", { on: true });
  await until(async () => ((await tool("kraken_line_of_sight", { player: "A test player" })).explored ?? 0) > 0, "the host keeps what the player explored");
  report.push("fog of war: the player's explored areas are kept by the host");

  // 4. Locked movement: the player's drag waits for the GM; Accept moves it.
  await tool("kraken_line_of_sight", { on: false, lockMovement: true });
  const tokenAt = await centre(seat, `${seatMap} [data-token="${heroToken.id}"]`);
  await seat.mouse.move(tokenAt.x, tokenAt.y);
  await seat.mouse.down();
  await seat.mouse.move(tokenAt.x - 200, tokenAt.y + 100, { steps: 10 });
  await seat.mouse.up();
  await page.waitForSelector(`[data-move-approval="${heroToken.id}"]`, { timeout: 8000 });
  await page.screenshot({ path: path.join(SHOTS, "kraken-move-approval-gm.png") });
  const before = (await tool("kraken_map")).tokens.find((token) => token.id === heroToken.id);
  await page.click(`[data-move-approval="${heroToken.id}"] button[aria-label^="Accept"]`);
  await until(async () => {
    const now = (await tool("kraken_map")).tokens.find((token) => token.id === heroToken.id);
    return now.col !== before.col || now.row !== before.row;
  }, "the accepted move");
  await tool("kraken_line_of_sight", { lockMovement: false });
  report.push("locked movement: the player's drag waits on the GM's approval strip; Accept moves the token");

  // 5. Undo: Ctrl+Z on the player's screen takes their last move back.
  const moved = (await tool("kraken_map")).tokens.find((token) => token.id === heroToken.id);
  await tool("kraken_token_move", { id: heroToken.id, col: moved.col + 2, row: moved.row, asPlayer: true });
  await seat.click(`${seatMap} [data-token="${heroToken.id}"]`);
  await seat.keyboard.press("Control+z");
  await until(async () => (await tool("kraken_map")).tokens.find((token) => token.id === heroToken.id).col === moved.col, "Ctrl+Z takes the move back");
  report.push("undo: Ctrl+Z on the player's screen takes the last move back");

  // 6. Elevation: Alt+wheel over the orc on the GM's screen; the badge reaches the player.
  const orcAt = await centre(page, `[data-token="${orcToken.id}"]`);
  await page.mouse.move(orcAt.x, orcAt.y);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Alt");
  await seat.waitForSelector(`${seatMap} [data-token="${orcToken.id}"] .token-elevation[data-elevation="10"]`, { timeout: 8000 });
  report.push("elevation: Alt+wheel raises the orc 10 ft, a badge on the player's screen");

  // 6b. The GM's keys: the orc selected, Ctrl+C, the pointer two squares right, Ctrl+V makes a second
  // Orc Captain there; + zooms in (the orc's token grows on screen); an arrow with nothing selected pans.
  const tokensBefore = (await tool("kraken_map")).tokens.length;
  await page.click(`[data-token="${orcToken.id}"]`);
  await page.keyboard.press("Control+c");
  const box = await page.locator(`[data-token="${orcToken.id}"]`).boundingBox();
  await page.mouse.move(box.x + box.width * 2.5, box.y + box.height / 2);
  await page.keyboard.press("Control+v");
  await until(async () => (await tool("kraken_map")).tokens.length === tokensBefore + 1, "Ctrl+V pastes a copy of the orc");
  const pasted = (await tool("kraken_map")).tokens.find((token) => token.id !== orcToken.id && token.recordId === orc.id);
  assert(pasted, "the pasted token is the Orc Captain's");
  await page.keyboard.press("Escape");
  await page.keyboard.press("+");
  await until(async () => (await page.locator(`[data-token="${orcToken.id}"]`).boundingBox()).width > box.width * 1.1, "+ zooms in");
  const before = await page.locator(`[data-token="${orcToken.id}"]`).boundingBox();
  await page.keyboard.press("ArrowLeft");
  await until(async () => (await page.locator(`[data-token="${orcToken.id}"]`).boundingBox()).x > before.x + 50, "an arrow with nothing selected pans the map");
  await page.keyboard.press("-");
  await tool("kraken_token_remove", { id: pasted.id });
  report.push("GM keys: Ctrl+C / Ctrl+V copies the orc to the pointer; + zooms; an arrow pans");

  // 7. Magical darkness over the orc, a trap the GM sees and the player does not.
  await tool("kraken_light", { action: "place", col: 10, row: 5, bright: 0, dim: 15, darkness: true });
  await tool("kraken_region", { action: "add", kind: "trap", name: "Rune trap", note: "Fire 3d6", rect: { col: 7, row: 3, cols: 2, rows: 2 } });
  await page.waitForSelector('.overlay.regions [data-region-kind="trap"]', { timeout: 8000 });
  await seat.waitForSelector(`${seatMap} .overlay.darkness-areas`, { timeout: 8000 });
  assert((await seat.locator(".overlay.regions").count()) === 0, "the player has no regions");
  // Past any notice (they fade after a few seconds).
  await settle(3200);
  await page.screenshot({ path: path.join(SHOTS, "kraken-map-play-gm.png") });
  await seat.screenshot({ path: path.join(SHOTS, "kraken-map-play-player.png") });
  report.push("magical darkness is black on the player's map; the rune trap is the GM's alone");

  // 8. Tremorsense through a wall: the orc behind it is a shape over the fog for the player.
  await tool("kraken_light", { action: "list" }).then((lights) => Promise.all(lights.map((light) => tool("kraken_light", { action: "remove", id: light.id }))));
  await tool("kraken_wall", { action: "add", points: [700, 200, 700, 1200], kind: "wall" }).catch(() => undefined);
  await tool("kraken_line_of_sight", { on: true });
  await tool("kraken_token_update", { id: orcToken.id, elevation: 0 });
  await tool("kraken_token_move", { id: heroToken.id, col: 6, row: 5 });
  await tool("kraken_token_move", { id: orcToken.id, col: 7, row: 5 });
  await tool("kraken_token_update", { id: heroToken.id, senses: "Tremorsense 30 ft" });
  await seat.waitForSelector(`${seatMap} [data-token="${orcToken.id}"].token-sensed`, { timeout: 8000 });
  const onTop = await seat.evaluate((id) => {
    const token = document.querySelector(`[data-token="${id}"]`);
    const box = token.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(hit?.closest(`[data-token="${id}"]`));
  }, orcToken.id);
  assert(onTop, "the felt orc is drawn above the fog");
  await settle(500);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-tremorsense-player.png") });
  await tool("kraken_token_update", { id: heroToken.id, senses: "" });
  await tool("kraken_line_of_sight", { on: false });
  report.push("tremorsense: the orc behind the wall is felt, drawn above the fog on the player's screen");

  // 9. A sound placed on the map: the player's browser fetches it to play near their token.
  const library = await tool("kraken_sound", { action: "list" });
  const loop = (library.sounds ?? []).find((item) => item.kind === "ambience") ?? (library.sounds ?? [])[0];
  if (loop) {
    const fetched = [];
    seat.on("request", (request) => request.url().includes("/sound/file") && fetched.push(request.url()));
    await tool("kraken_map_sound", { action: "add", sound: loop.id, col: 6, row: 5, radius: 30 });
    await until(() => fetched.some((url) => url.includes(encodeURIComponent(loop.id))), "the player's browser fetches the placed sound");
    report.push(`a sound placed on the map (${loop.name}): the player's browser fetches it to play near their token`);
  } else report.push("no sound in the library here: the placed sound was not tried in the browser");

  // 10. Settings > Tokens and measuring, on the GM's screen.
  await page.click('[data-launch="settings"]');
  await page.waitForSelector('[data-setting="tokens"]', { timeout: 8000 });
  await page.locator('[data-setting="tokens"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, "kraken-token-options-gm.png") });
  await page.keyboard.press("Escape");
  report.push("Settings > Tokens and measuring opens on the GM's screen");

  // 11. An animated map: a real .webm put on the table plays and loops on the player's screen.
  const webm = readFileSync(path.join(process.cwd(), "scripts", "fixtures", "animated-map.webm")).toString("base64");
  await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
    await window.__kraken.publish({ id: "animated-test", name: "Animated", width: 640, height: 400, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, imageUrl: url, video: true, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, fit: "fill", walls: [], darkness: 0, lights: [], tokens: [], markers: [], regions: [] });
  }, webm);
  await seat.waitForSelector(`${seatMap} video.map-video`, { timeout: 15000 });
  const playing = await until(async () => {
    const first = await seat.evaluate(() => document.querySelector("video.map-video")?.currentTime ?? 0);
    await settle(700);
    const later = await seat.evaluate(() => document.querySelector("video.map-video")?.currentTime ?? 0);
    return later !== first ? { first, later } : null;
  }, "the animated map plays", 20);
  let wrapped = false;
  let last = await seat.evaluate(() => document.querySelector("video.map-video").currentTime);
  for (let i = 0; i < 20 && !wrapped; i += 1) {
    await settle(250);
    const now = await seat.evaluate(() => document.querySelector("video.map-video").currentTime);
    if (now < last) wrapped = true;
    last = now;
  }
  assert(wrapped, "the animated map loops");
  await seat.screenshot({ path: path.join(SHOTS, "kraken-animated-map-player.png") });
  report.push(`an animated map (.webm): plays on the player's screen (${playing.first.toFixed(2)}s to ${playing.later.toFixed(2)}s) and loops`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok map play ui${process.env.KRAKEN_APP ? " (the built app)" : ""}:\n  ${report.join("\n  ")}\n  screenshots in ${SHOTS}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
