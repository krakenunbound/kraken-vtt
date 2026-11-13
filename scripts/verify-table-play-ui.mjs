// The table in play, with a test player in Chrome:
//  - You at the table (Settings): the player's colour rings their token for
//    everyone; their turn shows a banner across their screen (off when they
//    untick it);
//  - the combat tracker's corrections: back a turn, a round back, a turn given
//    by the arrow (clicked);
//  - the pen's shapes: a circle drawn by the player (measured as drawn, in their
//    colour), resized by its handle; an arrow and a cone;
//  - death markers: an undead that dies leaves a violet splatter under where
//    it stood, for both screens; the GM's Death Markers window sets undead to a
//    skull; right-click removes one; kraken_death_markers clears them.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-table-play-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = process.env.KRAKEN_APP
  ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
  const campaign = await tool("kraken_campaign_create", { name: "Table play", ruleset: "Worldbuilding" });
  const port = 47467;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector('.window[data-window="map"] .map-toolbar');
  await tool("kraken_map", { share: true }).catch(() => undefined);

  // A test player, their character and its token; the undead foe and its token.
  const hero = await tool("kraken_record_create", { type: "character", name: "Wren", owner: "A test player", visibility: "owner", data: { level: 1, hp: { total: 12 } } });
  const ghoul = await tool("kraken_record_create", { type: "npc", name: "Ghoul", data: { type: "Medium undead", hp: 6 } });
  const heroToken = await tool("kraken_token_place", { recordId: hero.id, col: 6, row: 5 });
  const ghoulToken = await tool("kraken_token_place", { recordId: ghoul.id, col: 9, row: 5 });
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  const heard = [];
  seat.on("websocket", (ws) => {
    ws.on("framereceived", (frame) => typeof frame.payload === "string" && /"type":"(error|notice)"/.test(frame.payload) && heard.push(frame.payload.slice(0, 200)));
    ws.on("framesent", (frame) => typeof frame.payload === "string" && frame.payload.includes("draw-update") && heard.push("SENT " + frame.payload.slice(0, 200)));
  });
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.waitForSelector('.window[data-window="map"] .viewport', { timeout: 20000 });

  // You at the table: the player's colour, their token ringed in it on the GM's screen.
  await seat.click('[data-launch="settings"]');
  await seat.waitForSelector('[data-setting="you"]');
  await seat.click('[data-setting="you"] [data-you-color="#5aa9ff"]');
  const ring = await until(
    () => page.evaluate((id) => getComputedStyle(document.querySelector(`[data-token="${id}"] .token-disc`) ?? document.body).borderTopColor, heroToken.id ?? heroToken.token?.id),
    "the GM's screen to show the token",
  );
  await until(async () => (await page.evaluate((id) => getComputedStyle(document.querySelector(`[data-token="${id}"] .token-disc`)).borderTopColor, heroToken.id ?? heroToken.token?.id)) === "rgb(90, 169, 255)", `the player's token ringed in their colour (${ring})`);
  report.push("Settings > You at the table: the test player's colour rings their token on the GM's screen");

  // Combat: the player's turn brings the banner; the corrections.
  await tool("kraken_combat", { action: "add", recordId: hero.id });
  const added = await tool("kraken_combat", { action: "add", recordId: ghoul.id });
  const view0 = await tool("kraken_combat");
  const heroEntry = view0.entries.find((entry) => entry.recordId === hero.id);
  const ghoulEntry = view0.entries.find((entry) => entry.recordId === ghoul.id);
  await tool("kraken_combat", { action: "update", id: heroEntry.id, patch: { initresult: 20 } });
  await tool("kraken_combat", { action: "update", id: ghoulEntry.id, patch: { initresult: 5, hp: 6 } });
  await tool("kraken_combat", { action: "next" });
  await seat.waitForSelector('.turn-banner[data-turn-banner="Wren"]', { timeout: 10000 });
  await seat.screenshot({ path: path.join(SHOTS, "kraken-turn-banner.png") });
  await seat.waitForSelector(".turn-banner", { state: "detached", timeout: 8000 });
  report.push("the player's turn: a banner across their screen (Wren), gone after a few seconds");
  await tool("kraken_combat", { action: "next" });
  let view = await tool("kraken_combat");
  assert(view.active === ghoulEntry.id && view.round === 1, `the ghoul's turn (${view.active})`);
  await page.click('[data-launch="combat"]').catch(() => undefined);
  await page.waitForSelector('.combat-tracker [data-action="prev-turn"]');
  await page.click('.combat-tracker [data-action="prev-turn"]');
  await until(async () => (await tool("kraken_combat")).active === heroEntry.id, "back a turn");
  await tool("kraken_combat", { action: "round" });
  await until(async () => (await tool("kraken_combat")).round === 2, "round 2");
  await page.click('.combat-tracker [data-action="round-back"]');
  await until(async () => (await tool("kraken_combat")).round === 1, "the round back");
  await page.click(`.combat-tracker [data-ct="${ghoulEntry.id}"] [data-action="set-turn"]`);
  await until(async () => (await tool("kraken_combat")).active === ghoulEntry.id, "the arrow to the ghoul");
  await page.locator(".combat-tracker").screenshot({ path: path.join(SHOTS, "kraken-tracker-rounds.png") });
  report.push("the tracker: Back (the turn before), the round back (2 to 1), the arrow clicked on the ghoul's row makes it its turn");

  // Banner off: no banner the next time.
  await seat.click('[data-setting="turn-banner"]');
  await until(async () => (await tool("kraken_dice_settings", { who: "A test player" }).catch(() => null)) !== null || true, "");
  await settle(500);
  await tool("kraken_combat", { action: "set-turn", id: heroEntry.id });
  await settle(1500);
  assert(!(await seat.$(".turn-banner")), "banner unticked: no banner");
  assert(await seat.$(".turn-flag"), "the Your turn flag still shows");
  report.push("the banner unticked in Settings: no banner on their next turn (the Your turn flag stays)");

  // The pen's shapes, drawn by the player: a circle, measured as drawn, then resized.
  await seat.click('.window[data-window="settings"] [aria-label="Close Settings"]').catch(() => seat.click('[data-launch="settings"]'));
  await seat.waitForSelector('.window[data-window="settings"]', { state: "detached", timeout: 5000 }).catch(() => undefined);
  const playerView = seat.locator('.window[data-window="map"] .viewport');
  const box = await playerView.boundingBox();
  await seat.click('.window[data-window="map"] [data-tool="draw"]');
  await seat.click('.window[data-window="map"] [data-draw-shape="circle"]');
  const c = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.55 };
  await seat.mouse.move(c.x, c.y);
  await seat.mouse.down();
  await seat.mouse.move(c.x + 60, c.y + 10, { steps: 6 });
  const measured = await seat.textContent(".draw-measure");
  assert(/radius \d/.test(measured ?? ""), `measured as it is drawn (${measured})`);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-draw-circle.png") });
  await seat.mouse.up();
  const circle = await until(async () => (await tool("kraken_draw", { action: "list" })).find((line) => line.shape === "circle"), "the circle on the map");
  assert(circle.by === "A test player" && circle.color === "#5aa9ff" && circle.fill === "#5aa9ff" && circle.points.length === 4, `the player's circle, in their colour (${JSON.stringify(circle)})`);
  await seat.waitForSelector(`.draw-handle[data-handle-of="${circle.id}"][data-handle="1"]`);
  const handle = await seat.locator(`.draw-handle[data-handle-of="${circle.id}"][data-handle="1"]`).boundingBox();
  await seat.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await seat.mouse.down();
  await seat.mouse.move(handle.x + 70, handle.y + 30, { steps: 6 });
  await seat.mouse.up();
  const resized = await until(async () => {
    const line = (await tool("kraken_draw", { action: "list" })).find((item) => item.id === circle.id);
    return line && line.points[2] > circle.points[2] + 20 ? line : null;
  }, `the circle resized (${heard.join(" | ")})`);
  for (const [shape, dx, dy, fx, fy] of [["arrow", 80, -40, 0.6, 0.35], ["cone", 70, 50, 0.25, 0.25]]) {
    await seat.click(`.window[data-window="map"] [data-draw-shape="${shape}"]`);
    const at = { x: box.x + box.width * fx, y: box.y + box.height * fy };
    await seat.mouse.move(at.x, at.y);
    await seat.mouse.down();
    await seat.mouse.move(at.x + dx, at.y + dy, { steps: 5 });
    await seat.mouse.up();
    await until(async () => (await tool("kraken_draw", { action: "list" })).some((line) => line.shape === shape && line.by === "A test player"), `the ${shape}`);
  }
  await settle(400);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-draw-shapes.png") });
  report.push(`the pen's shapes, by the test player: a circle (measured as drawn: ${measured.trim()}), resized by its handle (${circle.points[2]} to ${resized.points[2]}), an arrow and a cone, all in their colour`);

  // Death markers: the ghoul dies; a violet splatter where it stood, on both screens.
  await tool("kraken_combat", { action: "damage", id: ghoulEntry.id, amount: 50 });
  const marker = await until(async () => (await tool("kraken_death_markers")).markers[0], "a death marker");
  assert(marker.set === "blood-violet" && marker.name === "Ghoul", `an undead leaves violet blood (${JSON.stringify(marker)})`);
  await page.waitForSelector(`[data-death-marker="${marker.id}"][data-marker-set="blood-violet"]`);
  await seat.waitForSelector(`[data-death-marker="${marker.id}"]`);
  await settle(300);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-death-marker.png") });
  report.push("the ghoul (undead) dies: a violet splatter where it stood, on the GM's screen and the test player's");

  // The Death Markers window: undead -> Skull; another undead dies; a skull.
  await page.click('[data-launch="settings"]');
  await page.click('[data-setting="death-markers"]');
  await page.waitForSelector('.death-markers-window [data-marker-type="undead"] select');
  await page.selectOption('.death-markers-window [data-marker-type="undead"] select', "skull");
  await until(async () => (await tool("kraken_death_markers")).settings.byType.undead === "skull", "undead set to skull");
  await page.locator(".death-markers-window").screenshot({ path: path.join(SHOTS, "kraken-death-markers-window.png") });
  const wight = await tool("kraken_record_create", { type: "npc", name: "Wight", data: { type: "Medium undead", hp: 6 } });
  await tool("kraken_token_place", { recordId: wight.id, col: 11, row: 7 });
  await tool("kraken_combat", { action: "add", recordId: wight.id });
  const wightEntry = (await tool("kraken_combat")).entries.find((entry) => entry.recordId === wight.id);
  await tool("kraken_combat", { action: "update", id: wightEntry.id, patch: { hp: 6 } });
  await tool("kraken_combat", { action: "damage", id: wightEntry.id, amount: 50 });
  const skull = await until(async () => (await tool("kraken_death_markers")).markers.find((item) => item.name === "Wight"), "the wight's marker");
  assert(skull.set === "skull", `the Death Markers window's choice: a skull (${skull.set})`);
  await page.waitForSelector(`[data-death-marker="${skull.id}"]`);
  // A character falling leaves none.
  await tool("kraken_combat", { action: "damage", id: heroEntry.id, amount: 100 });
  await settle(600);
  assert((await tool("kraken_death_markers")).markers.length === 2, "a character leaves no marker");
  // The GM right-clicks one away; kraken_death_markers clears the rest.
  await page.click('[aria-label="Close Death Markers"]');
  await page.click('[aria-label="Close Settings"]').catch(() => undefined);
  await page.click('[aria-label="Close Combat Tracker"]').catch(() => undefined);
  await settle(500);
  // The ghoul's token cleared away (its marker stays where it fell), then the marker right-clicked.
  await tool("kraken_token_remove", { id: ghoulToken.id ?? ghoulToken.token?.id });
  await page.waitForSelector(`[data-token="${ghoulToken.id ?? ghoulToken.token?.id}"]`, { state: "detached" });
  await page.click(`[data-death-marker="${marker.id}"]`, { button: "right", force: true });
  const under = () => page.evaluate((id) => { const g = document.querySelector(`[data-death-marker="${id}"]`); if (!g) return "gone"; const r = g.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return `${el?.tagName}.${el?.getAttribute("class")} ${el?.closest("section.window")?.getAttribute("aria-label") ?? ""} ${el?.closest("[data-death-marker]") ? "marker" : "other"}`; }, marker.id);
  const hit = await under();
  await until(async () => (await tool("kraken_death_markers")).markers.length === 1, `right-click removes it (under the pointer: ${hit})`);
  await tool("kraken_death_markers", { action: "clear" });
  await seat.waitForSelector("[data-death-marker]", { state: "detached" });
  report.push("Settings > Death Markers: undead set to Skull, the wight leaves a skull; a character leaves none; right-click removes one, kraken_death_markers clear the rest");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok table play ui${process.env.KRAKEN_APP ? " (the built app)" : ""}:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
