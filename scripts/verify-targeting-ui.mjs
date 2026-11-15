// Targeting, area spells, effects and damage cards at the table, as the GM and a
// test player see them (docs/targeting-actions-design.md): the GM's app full
// screen on its monitor and a player's Chrome at 2560x1440. A D&D 5E campaign
// with the SRD's own spells; a party (Hagar, the player's; Mira, Cora) and
// goblins on a map in the dark.
// 1. The map toolbar's targeting: the player selects Hagar and presses Target all
//    foes, then Clear enemy targets; Ctrl+click on a token; the GM sees everyone's aim.
// 2. Area template by hand: the player drags a circle out with the Area template tool.
// 3. Fireball's template (20-foot sphere) placed for Hagar; the damage card in chat.
// 4. Sleep: Zzz drifting over the sleepers. 5. Bless: three allies glow, with icons.
// 6. "I light a torch!": the GM drags Torch from the Effects window onto Hagar's
//    token; the light follows him; the player sees its glow; an hour of game time
//    burns it out (with a warning first).
// Shots (GM and player, full screen) go to the folder printed at the end.
//   node scripts/verify-targeting-ui.mjs        (npm run build first)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { SPELLS } from "../games/srd-5e/spells.mjs";

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
};
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-targeting-ui-"));
mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
mkdirSync(path.join(profile, "packs"), { recursive: true });
const shots = path.join(tmpdir(), "kraken-targeting-ui");
mkdirSync(shots, { recursive: true });
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const env = { ...process.env, KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
});
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
page.on("pageerror", (error) => problems.push(`GM page: ${error.message}`));
const shoot = async (where, name) => {
  // The dice of the last rolls lie on the table a moment: the shot waits for them to go.
  await settle(1600);
  await where.screenshot({ path: path.join(shots, `${name}.png`) });
  console.log(`     shot ${path.join(shots, `${name}.png`)}`);
};

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Targets and torches", ruleset: "D&D 5E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47461, password: "" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_table_options", { diceHold: 0.5 });
  // The SRD's spells (Kraken's own book's records), a party and goblins.
  for (const name of ["Fireball", "Sleep", "Bless", "Burning Hands"]) {
    const { __category, ...data } = SPELLS.find((item) => item.name === name);
    await tool("kraken_record_create", { type: "spell", name, data, visibility: "all" });
  }
  const abilities = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 14, bonus: 2, save: 2 }]));
  const pc = (name, owner, extra = {}) => tool("kraken_record_create", { type: "character", name, owner, visibility: owner ? "owner" : "all", data: { level: 5, hp: { total: 40, wounds: 0 }, ac: { total: 14 }, abilities, ...extra } });
  const slots = { l1: { max: 4, used: 0 }, l2: { max: 3, used: 0 }, l3: { max: 2, used: 0 } };
  const hagar = await pc("Hagar", "a test player", { spellcasting: { stat: "intelligence", dc: 14, attack: 6 }, slots });
  const mira = await pc("Mira", "", { spellcasting: { stat: "wisdom", dc: 14, attack: 6 }, slots });
  const cora = await pc("Cora", "");
  const goblin = await tool("kraken_record_create", { type: "npc", name: "Goblin", data: { hp: 40, ac: 13, abilities: { dexterity: { score: 14, bonus: 2 }, wisdom: { score: 8, bonus: -1 } } } });
  const id = (record) => record.id ?? record.record?.id;
  await tool("kraken_open_adventure", { path: path.resolve("games/basic-fantasy/maps/hobs-ford-mill-studio.webp") });
  await settle(1500);
  await tool("kraken_map", { share: true });
  const place = (record, col, row) => tool("kraken_token_place", { recordId: id(record), col, row });
  await place(hagar, 4, 6);
  await place(mira, 5, 6);
  await place(cora, 4, 7);
  for (const [col, row] of [[10, 5], [11, 5], [10, 6], [12, 7]]) await place(goblin, col, row);
  const map = await tool("kraken_map", {});
  for (const token of map.tokens) await tool("kraken_combat", { action: "add", entry: { recordId: token.recordId, tokenId: token.id, name: token.name, faction: token.recordId === id(goblin) ? "foe" : "friend" } });
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "next" });
  const tokenOf = (record, nth = 0) => map.tokens.filter((token) => token.recordId === id(record))[nth];

  // The test player in Chrome, at 2560x1440.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage();
  seat.on("pageerror", (error) => problems.push(`player: ${error.message}`));
  await seat.goto("http://127.0.0.1:47461/");
  await seat.fill('input[name="name"]', "a test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector(`[data-token="${tokenOf(hagar).id}"]`, { timeout: 20000 });
  await settle(800);

  // 1. The toolbar: the player selects Hagar, then Target all foes.
  const toolbar = async (where) => {
    if (!(await where.locator(".map-toolbar").count())) await where.click('[data-action="map-tools"]');
    await where.waitForSelector('.map-toolbar [data-action="target-foe"]');
  };
  // Both screens zoomed in on the fight (the toolbar's Zoom in), so the tokens read at a glance.
  for (const where of [page, seat]) {
    await toolbar(where);
    for (let i = 0; i < 2; i++) await where.click('.map-toolbar [aria-label="Zoom in"]');
  }
  await settle(400);
  await toolbar(seat);
  await seat.click(`[data-token="${tokenOf(hagar).id}"]`);
  await seat.click('[data-action="target-foe"]');
  await settle(800);
  let combat = await tool("kraken_combat", { action: "view" });
  const hagarEntry = combat.entries.find((entry) => entry.name === "Hagar");
  check(hagarEntry.targets.length === 4, `the player's Target all foes targets the four goblins: ${hagarEntry.targets.length}`);
  check((await seat.locator(".target-reticle").count()) === 4, "the player sees four reticles");
  // The GM aims Mira at a goblin too (Ctrl+click on the token, with Mira selected): two colours on that goblin for the GM.
  await toolbar(page);
  await page.click(`[data-token="${tokenOf(mira).id}"]`);
  await page.click(`[data-token="${tokenOf(goblin, 0).id}"]`, { modifiers: ["Control"] });
  await settle(800);
  combat = await tool("kraken_combat", { action: "view" });
  check(combat.entries.find((entry) => entry.name === "Mira").targets.length === 1, "the GM's Ctrl+click targets with the selected Mira");
  const rings = await page.locator(`[data-token="${tokenOf(goblin, 0).id}"] .target-reticle circle`).count();
  check(rings === 2, `the GM sees both aims on the first goblin, a ring each: ${rings}`);
  await shoot(page, "1-gm-toolbar-targets");
  await shoot(seat, "1-player-toolbar-targets");
  await seat.click('[data-action="target-clear-foe"]');
  await settle(600);
  combat = await tool("kraken_combat", { action: "view" });
  check(combat.entries.find((entry) => entry.name === "Hagar").targets.length === 0, "Clear enemy targets clears them");
  // A tracker row's Ctrl+click (the GM's tracker).
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.waitForSelector(".ct-row");
  await page.locator(`.ct-row[data-ct="${combat.entries.find((entry) => entry.name === "Goblin 4").id}"] .ct-name`).click({ modifiers: ["Control"] });
  await settle(600);
  combat = await tool("kraken_combat", { action: "view" });
  check(combat.entries.some((entry) => entry.targets.includes(combat.entries.find((item) => item.name === "Goblin 4").id)), "a tracker row's Ctrl+click targets it");
  await tool("kraken_windows", { action: "close", kind: "combat" }).catch(() => undefined);

  // 2. The Area template tool: the player drags a circle over two goblins.
  await seat.click('[data-tool="template"]');
  await seat.click('[data-template-shape="circle"]');
  await seat.click(`[data-token="${tokenOf(hagar).id}"]`).catch(() => undefined);
  const g0 = await seat.locator(`[data-token="${tokenOf(goblin, 0).id}"]`).boundingBox();
  const g1 = await seat.locator(`[data-token="${tokenOf(goblin, 1).id}"]`).boundingBox();
  const cx = (g0.x + g0.width / 2 + g1.x + g1.width / 2) / 2;
  const cy = g0.y + g0.height / 2;
  await seat.mouse.move(cx, cy);
  await seat.mouse.down();
  await seat.mouse.move(cx + g0.width * 1.2, cy, { steps: 6 });
  await seat.mouse.up();
  await settle(800);
  const templates = (await tool("kraken_template", { action: "list" })).templates;
  check(templates.length === 1 && templates[0].shape === "circle", `the player's template is on the map: ${JSON.stringify(templates)}`);
  combat = await tool("kraken_combat", { action: "view" });
  check(combat.entries.find((entry) => entry.name === "Hagar").targets.length >= 2, "the creatures inside became Hagar's targets");
  await shoot(seat, "2-player-template-tool");
  await tool("kraken_template", { action: "clear" });
  await seat.click('[data-tool="pan"]');

  // 3. Fireball: Hagar's 20-foot sphere among the goblins; the damage card in chat.
  await tool("kraken_combat", { action: "clear-targets", id: hagarEntry.id });
  const fireAt = { x: Math.round((tokenOf(goblin, 0).x + tokenOf(goblin, 1).x) / 2), y: tokenOf(goblin, 0).y };
  const fire = await tool("kraken_combat", { action: "cast", recordId: id(hagar), power: "Fireball", template: fireAt });
  check(fire.template?.size === 20 && fire.targets.length >= 3, `Fireball's sphere takes the goblins: ${fire.targets}`);
  await settle(1200);
  check((await page.locator(".area-template").count()) === 1 && (await seat.locator(".area-template").count()) === 1, "GM and player both see the template");
  check((await page.locator(".damage-card li").count()) >= 3, "the GM's chat shows the damage card's creatures");
  check((await page.locator('.damage-card [data-mult="0.5"]').count()) >= 3, "with x0, x1/2, x1, x2 and heal buttons");
  await shoot(page, "3-gm-fireball-template-card");
  // The damage card in the GM's chat (the map's window set aside a moment to see it).
  await tool("kraken_windows", { action: "close", kind: "map" }).catch(() => undefined);
  await settle(600);
  await page.locator(".damage-card").last().scrollIntoViewIfNeeded();
  await shoot(page, "3-gm-damage-card");
  await page.locator(".chat-line:has(.damage-card)").last().screenshot({ path: path.join(shots, "3-gm-damage-card-closeup.png") });
  await tool("kraken_windows", { action: "open", kind: "map" }).catch(() => undefined);
  await page.waitForSelector(`[data-token="${tokenOf(hagar).id}"]`);
  await shoot(seat, "3-player-fireball-template");
  // The GM halves the first goblin's share from the card.
  // The chat may lie under the map's window: the button is pressed as a click would.
  await page.locator('.damage-card [data-mult="0.5"]').first().evaluate((button) => button.click());
  await settle(800);
  await tool("kraken_template", { action: "clear" });
  for (const entry of combat.entries.filter((item) => item.name.startsWith("Goblin"))) await tool("kraken_combat", { action: "heal", id: entry.id, amount: 100 });

  // 4. Sleep on the goblins: the Zzz.
  await tool("kraken_dice_force", { values: [1, 1, 1, 1] });
  const sleep = await tool("kraken_combat", { action: "cast", recordId: id(hagar), power: "Sleep", template: { x: tokenOf(goblin, 0).x + 30, y: tokenOf(goblin, 0).y + 30 } });
  await settle(1200);
  check((await page.locator(".token-fx .fx-zzz, .token [class*='zzz']").count()) >= 1, `Zzz over the sleepers (${sleep.targets})`);
  await shoot(page, "4-gm-sleep-zzz");
  await shoot(seat, "4-player-sleep-zzz");
  await tool("kraken_template", { action: "clear" });

  // 5. Bless: Mira blesses Hagar, Cora and herself.
  const miraEntry = combat.entries.find((entry) => entry.name === "Mira");
  await tool("kraken_combat", { action: "clear-targets", id: miraEntry.id });
  for (const name of ["Hagar", "Cora", "Mira"]) await tool("kraken_combat", { action: "target", id: miraEntry.id, targetId: combat.entries.find((entry) => entry.name === name).id });
  await tool("kraken_combat", { action: "cast", recordId: id(mira), power: "Bless" });
  await settle(1200);
  check((await page.locator(`[data-token="${tokenOf(hagar).id}"] .token-badge`).count()) >= 1, "Hagar's token wears the buff's badge");
  await shoot(page, "5-gm-bless-icons");
  await shoot(seat, "5-player-bless-icons");

  // 6. "I light a torch!": the GM drags Torch from the Effects window onto Hagar's token, in the dark.
  await tool("kraken_scene_settings", { darkness: 0.9 });
  await tool("kraken_windows", { action: "open", kind: "effects" });
  await page.waitForSelector('[data-effect-preset="torch"]');
  // The window moved off the party by its title bar, as the GM would.
  const title = await page.locator('.window[data-window="effects"] > .window-title').boundingBox();
  await page.mouse.move(title.x + 60, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 1300, title.y + title.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await settle(300);
  await page.locator('[data-effect-preset="torch"]').dragTo(page.locator(`[data-token="${tokenOf(hagar).id}"]`));
  await settle(1200);
  let on = (await tool("kraken_effects", { action: "on", to: { tokenId: tokenOf(hagar).id } })).effects;
  check(on.some((effect) => /^Torch/.test(effect.label)), "the dropped torch is on Hagar");
  await tool("kraken_windows", { action: "close", kind: "effects" }).catch(() => undefined);
  const viewed = await tool("kraken_map", {});
  await settle(800);
  await shoot(page, "6-gm-torch");
  await shoot(seat, "6-player-torch-glow");
  // He walks on: the light goes with him.
  await tool("kraken_token_move", { id: tokenOf(hagar).id, col: 8, row: 9 });
  await settle(1200);
  await shoot(seat, "6-player-torch-moved");
  // An hour of game time: a warning, then dark.
  await tool("kraken_calendar", { action: "advance", minutes: 55 });
  await settle(400);
  const log = await tool("kraken_chat_log", { count: 30 });
  check((Array.isArray(log) ? log : []).some((line) => /nearly out/.test(line.text ?? "")), "the torch warns it is nearly out");
  await tool("kraken_calendar", { action: "advance", minutes: 6 });
  await settle(800);
  on = (await tool("kraken_effects", { action: "on", to: { tokenId: tokenOf(hagar).id } })).effects;
  check(!on.some((effect) => /^Torch/.test(effect.label)), "after an hour the torch has burnt out");
  await shoot(seat, "6-player-torch-out");
  void viewed;
} catch (error) {
  problems.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
console.log(`\nshots: ${shots}`);
if (problems.length) {
  console.log(`FAIL verify-targeting-ui: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
} else console.log("ok verify-targeting-ui");
