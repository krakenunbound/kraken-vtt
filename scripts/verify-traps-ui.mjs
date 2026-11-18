// Traps and secret doors at the table, in the real app: the GM's window and a
// test player in Chrome, full screen (2560x1440):
//  - a door is a target along its whole length, not only at its middle;
//  - a player's token walks into a trap: it stops and is held there (only it),
//    the player sees it waiting; the GM's Traps sprung strip rolls its save,
//    applies it (half damage on a save) and lets it go;
//  - the trap's eye shows it to the player (its outline alone) and hides it;
//  - a secret door is not on the player's map until the GM right-clicks it found.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-traps-"));
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
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Traps", ruleset: "Castles & Crusades" });
  const port = 47496;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector('.window[data-window="map"] .map-toolbar');
  await tool("kraken_map", { share: true }).catch(() => undefined);

  const hero = await tool("kraken_record_create", { type: "character", name: "Wren", owner: "A test player", visibility: "owner", data: { level: 1, hp: { total: 12, wounds: 0 } } });
  const heroToken = await tool("kraken_token_place", { recordId: hero.id, col: 3, row: 4 });
  // A trap two squares on, a door further along, and a secret door beyond it.
  const trap = await tool("kraken_region", { action: "add", kind: "trap", name: "Spiked pit", note: "Hidden under the rug", rect: { col: 5, row: 4, cols: 1, rows: 1 }, trap: { damage: "2d6", damageType: "piercing", save: { attribute: "dex", dc: 12 }, half: true } });
  await tool("kraken_wall", { action: "add", cells: [[12, 2], [12, 6]], kind: "secret" });
  await tool("kraken_wall", { action: "add", cells: [[9, 2], [9, 6]], kind: "door" });
  const walls = await tool("kraken_wall", { action: "list" });
  const secret = (walls.walls ?? walls).find((wall) => wall.door === 2);
  const door = (walls.walls ?? walls).find((wall) => wall.door === 1);
  assert(secret && door, `a secret door and a door (${JSON.stringify(walls).slice(0, 300)})`);

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: W, height: H } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector('.window[data-window="map"] .viewport', { timeout: 20000 });
  const seatMap = '.window[data-window="map"] .viewport';
  await seat.waitForSelector(`${seatMap} [data-token="${heroToken.id}"]`);

  // 1. A door is a target along all of it: near its end, far from its middle, the pointer is on the door.
  await seat.waitForSelector(`${seatMap} [data-door="${door.id}"]`);
  const doorBox = await seat.locator(`${seatMap} [data-door="${door.id}"] .door-shape`).first().boundingBox();
  const nearEnd = { x: doorBox.x + doorBox.width / 2, y: doorBox.y + doorBox.height * 0.12 };
  const hit = await seat.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-door]")?.getAttribute("data-door") ?? null, [nearEnd.x, nearEnd.y]);
  assert(hit === door.id, `near the door's end the pointer is on the door (${hit})`);
  await seat.mouse.click(nearEnd.x, nearEnd.y);
  await until(async () => (await tool("kraken_map")).doors?.find?.((item) => item.id === door.id)?.state === 1 || (await seat.locator(`${seatMap} [data-door="${door.id}"][data-state="1"]`).count()) > 0, "the door opens from a click near its end");
  report.push("a door is a target along all of it: a click near its end opens it");

  // 2. The secret door is not on the player's map; the trap neither.
  assert((await seat.locator(`${seatMap} [data-door="${secret.id}"]`).count()) === 0, "the player has no secret door");
  assert((await seat.locator(`${seatMap} [data-revealed-trap]`).count()) === 0, "nor the trap");

  // 3. The player's token walks over the trap: held there, alone, waiting for the GM.
  await tool("kraken_token_move", { id: heroToken.id, col: 7, row: 4, asPlayer: true });
  await seat.waitForSelector(`${seatMap} [data-token="${heroToken.id}"].token-held`, { timeout: 5000 });
  const heldAt = (await tool("kraken_map")).tokens.find((token) => token.id === heroToken.id);
  assert(heldAt.col === 5, `the token stops on the trap's square (${heldAt.col})`);
  await page.waitForSelector(`.traps-sprung [data-trap-held="${heroToken.id}"]`, { timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, "kraken-trap-gm.png") });
  await seat.screenshot({ path: path.join(SHOTS, "kraken-trap-player.png") });
  const refused = await tool("kraken_token_move", { id: heroToken.id, col: 7, row: 4, asPlayer: true }).then(() => null, (error) => error.message);
  assert(/trap holds/.test(refused ?? ""), `its player cannot move it on (${refused})`);
  report.push("a player's token walking over a trap stops on it and is held, its player sees it waiting, the GM's Traps sprung strip has it");

  // 4. The GM rolls its save (forced 15 against DC 12: made) and applies it: half of 2d6 (forced 4+5 = 9: 4); it goes on.
  await tool("kraken_dice_force", { values: [15] });
  await page.click(`.traps-sprung [data-trap-held="${heroToken.id}"] [data-trap-action="save"]`);
  await page.waitForSelector(`.traps-sprung [data-trap-rolled="${heroToken.id}"]`, { timeout: 5000 });
  assert(/made/.test(await page.textContent(`.traps-sprung [data-trap-rolled="${heroToken.id}"]`)), "the save is made");
  await tool("kraken_dice_force", { values: [4, 5] });
  await page.click(`.traps-sprung [data-trap-held="${heroToken.id}"] [data-trap-action="apply"]`);
  await page.waitForSelector(".traps-sprung", { state: "detached", timeout: 5000 });
  await seat.waitForSelector(`${seatMap} [data-token="${heroToken.id}"]:not(.token-held)`, { timeout: 5000 });
  const entry = (await tool("kraken_combat")).entries.find((item) => item.recordId === hero.id);
  assert(entry && Number(entry.wounds ?? 0) === 4, `half the damage on a save: 4 wounds (${JSON.stringify(entry)})`);
  report.push("the GM's Save and Apply: the save made, half of the damage (4 of 9) through the tracker, the token goes on");

  // A torch from the Effects list dragged onto Wren's token on the GM's map: Wren carries it.
  await page.click('.sidebar [data-launch="effects"]');
  await page.waitForSelector('[data-effect-preset="torch"]');
  // Moved aside by its title bar, off the token.
  const bar = await page.locator('.window[data-window="effects"] .window-title').boundingBox();
  await page.mouse.move(bar.x + 60, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 1400, bar.y + bar.height / 2 + 300, { steps: 10 });
  await page.mouse.up();
  await page.locator('[data-effect-preset="torch"]').scrollIntoViewIfNeeded();
  await page.locator('[data-effect-preset="torch"]').dragTo(page.locator(`.window[data-window="map"] [data-token="${heroToken.id}"]`));
  await until(async () => ((await tool("kraken_effects", { action: "on", to: { tokenId: heroToken.id } })).effects ?? []).some((effect) => /Torch/.test(effect.label)), "the torch on Wren's token");
  await page.click('.sidebar [data-launch="effects"]');
  report.push("a torch from the Effects list dropped on a token on the table's map is that creature's");

  // 5. The trap's eye: shown to the player (its outline), then hidden again.
  await page.click(`[data-region-reveal="${trap.id}"]`);
  await seat.waitForSelector(`${seatMap} [data-revealed-trap="${trap.id}"]`, { timeout: 5000 });
  assert(!(await seat.content()).includes("Hidden under the rug"), "the player never gets its note");
  await seat.screenshot({ path: path.join(SHOTS, "kraken-trap-revealed.png") });
  await page.click(`[data-region-reveal="${trap.id}"]`);
  await seat.waitForSelector(`${seatMap} [data-revealed-trap="${trap.id}"]`, { state: "detached", timeout: 5000 });
  report.push("the trap's eye shows it to the player (its outline alone, no note) and hides it again");

  // 6. The secret door, found: the GM right-clicks it; the player sees it and opens it.
  const rightClickDoor = async (id) => {
    const box = await page.locator(`.window[data-window="map"] [data-door="${id}"] .door-shape`).first().boundingBox();
    assert(box, "the GM's map has the secret door");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3, { button: "right" });
  };
  await rightClickDoor(secret.id);
  await seat.waitForSelector(`${seatMap} [data-door="${secret.id}"]`, { timeout: 5000 });
  const secretBox = await seat.locator(`${seatMap} [data-door="${secret.id}"] .door-shape`).first().boundingBox();
  await seat.mouse.click(secretBox.x + secretBox.width / 2, secretBox.y + secretBox.height * 0.85);
  await until(async () => (await seat.locator(`${seatMap} [data-door="${secret.id}"][data-state="1"]`).count()) > 0, "the player opens the found secret door");
  await rightClickDoor(secret.id);
  await seat.waitForSelector(`${seatMap} [data-door="${secret.id}"]`, { state: "detached", timeout: 5000 });
  report.push("a secret door right-clicked found by the GM is on the player's map and opens; right-clicked again, it is hidden");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok traps ui:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
