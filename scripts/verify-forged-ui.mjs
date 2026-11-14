// Forged in the Dark, played as a table would, in the real app: the GM hosts
// a Forged in the Dark campaign with nothing else installed (KRAKEN_BOOKS and
// KRAKEN_PACKS point at empty folders: only Kraken's own packs are on the
// shelf) and makes its three books active; a test player in Chrome makes a
// scoundrel with the wizard (a playbook, a heritage and a background, four
// action dots, a special ability, a friend and a rival, a vice and its
// purveyor, a name), then the crew on the party sheet's Crew tab (its type,
// reputation, lair, hunting grounds, ability, two upgrades, a contact); the
// GM sets the position and effect on the Score panel; the player makes an
// action roll from the sheet (on the 3D dice, its card in chat with the
// position and effect) and a resistance roll; the GM makes a clock in the
// Clocks window and ticks it, and the player sees it on the table's strip;
// the GM opens the Brine Street map (walls and doors); the GM begins
// downtime and the player indulges their vice from the sheet. Windows open
// on the left monitor (KRAKEN_WINDOW_AT) and are closed at the end.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-forged-ui-"));
mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
mkdirSync(path.join(profile, "Packs"), { recursive: true });
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const env = { ...process.env, KRAKEN_WINDOW_AT: AT, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const dataOf = async (id) => {
  const got = await tool("kraken_record_get", { id });
  return got.data ?? got.record?.data;
};
const chat = async (pattern) => {
  const lines = await tool("kraken_chat_log", { count: 200 });
  return (Array.isArray(lines) ? lines : lines.lines ?? []).filter((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""}`));
};
const until = async (what, test, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const value = await test();
    if (value) return value;
    await settle(250);
  }
  throw new Error(`${what}: timed out`);
};
const shots = path.join(tmpdir(), "kraken-forged-ui");
mkdirSync(shots, { recursive: true });

let browser = null;
const PORT = 48500 + Math.floor(Math.random() * 400);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Forged UI", ruleset: "Forged in the Dark" });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  const ours = ["Forged in the Dark: Scoundrel's Handbook", "Forged in the Dark: Game Master's Guide", "The Brine Street Job (Forged in the Dark)"].map((title) => shelf.find((item) => item.title === title));
  assert(ours.every(Boolean), `its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
  assert(!shelf.some((item) => /Cairn|Apeira Astra|Descending Darkness|Basic Fantasy|SRD 5\.2/.test(item.title)), `no other game's books: ${shelf.map((item) => item.title).join(", ")}`);
  for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });
  await until("the playbooks loaded", async () => ((await tool("kraken_records_list", { type: "playbook" })).records ?? []).length === 7);

  // A test player makes a scoundrel in the wizard.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="forged"]', { timeout: 10000 });
  const wizard = seat.locator('[data-wizard="forged"]');
  await wizard.locator('select[aria-label="Playbook"]').selectOption("Burglar");
  await wizard.locator('select[aria-label="Heritage"]').selectOption("Far Isles");
  await wizard.locator('input[aria-label="Heritage detail"]').fill("Pearl divers, now dockside refugees");
  await wizard.locator('select[aria-label="Background"]').selectOption("Underworld");
  await wizard.locator('input[aria-label="Background detail"]').fill("A fence's errand child");
  // Four dots: Finesse to 2 (the Burglar has 1), Survey, Tinker and Sway one each; no fifth.
  for (const action of ["finesse", "survey", "tinker", "sway"]) await wizard.locator(`[data-action="dot-${action}"]`).click();
  assert((await wizard.locator("[data-dots-left]").getAttribute("data-dots-left")) === "0", "four dots placed");
  assert(await wizard.locator('[data-action="dot-hunt"]').isDisabled(), "no fifth dot");
  assert(await wizard.locator('[data-action="dot-finesse"]').isDisabled(), "Finesse stops at 2");
  await wizard.locator('input[data-ability="Ambush"]').check();
  await wizard.locator('select[aria-label="Close friend"]').selectOption("Silke Ambry");
  await wizard.locator('select[aria-label="Rival"]').selectOption("Captain Ires Dole");
  await wizard.locator('select[aria-label="Vice"]').selectOption("Gambling");
  await wizard.locator('input[aria-label="Vice detail"]').fill("Cards, always cards");
  await wizard.locator('input[aria-label="Vice purveyor"]').fill("Madame Lisle's card room");
  await wizard.locator('input[aria-label="Character name"]').fill("Nell Ashby");
  await wizard.locator('input[aria-label="Alias"]').fill("Wren");
  await wizard.locator('input[aria-label="Look"]').fill("Small, quick, a grey hood");
  await seat.screenshot({ path: path.join(shots, "wizard.png"), fullPage: true });
  await wizard.locator('[data-action="wizard-finish"]').click();
  await seat.waitForSelector('[data-ruleset="forged"]', { timeout: 15000 });
  const sheet = seat.locator('[data-ruleset="forged"]');
  const characters = await tool("kraken_records_list", { type: "character" });
  const mine = (characters.records ?? characters).find((item) => item.owner === "A test player");
  const data = await dataOf(mine.id);
  assert(mine.name === "Nell Ashby" && data.playbook === "Burglar" && data.alias === "Wren" && data.heritage === "Far Isles" && data.background === "Underworld", `the scoundrel: ${mine.name}, ${data.playbook}`);
  assert(data.actions.prowl === 2 && data.actions.finesse === 2 && data.actions.survey === 1 && data.actions.tinker === 1 && data.actions.sway === 1 && data.attributes.insight === 2 && data.attributes.prowess === 2 && data.attributes.resolve === 1, `dots and attributes: ${JSON.stringify(data.actions)} ${JSON.stringify(data.attributes)}`);
  assert(data.abilities[0].name === "Ambush" && data.friends.find((friend) => friend.name === "Silke Ambry").bond === "friend" && data.friends.find((friend) => friend.name === "Captain Ires Dole").bond === "rival" && data.vice === "Gambling" && data.purveyor === "Madame Lisle's card room", "ability, friend, rival, vice and purveyor");
  assert(Object.values(data.inventorylist).some((item) => item.name === "Fine lockpicks") && Object.values(data.inventorylist).some((item) => item.name === "Burglary gear"), "the playbook's items and the standard items");
  await seat.screenshot({ path: path.join(shots, "sheet.png") });

  // The crew, on the party sheet's Crew tab.
  for (const button of await seat.$$('[data-window="characters"] button[aria-label^="Close"]')) await button.click().catch(() => undefined);
  await seat.click('.sidebar [data-launch="party"]');
  await seat.click('[data-window="party"] [role="tab"]:has-text("Crew")');
  await seat.waitForSelector('[data-wizard="forged-crew"]', { timeout: 10000 });
  const crewWizard = seat.locator('[data-wizard="forged-crew"]');
  await crewWizard.locator('select[aria-label="Crew type"]').selectOption("Shadows");
  await crewWizard.locator('select[aria-label="Reputation"]').selectOption("Daring");
  await crewWizard.locator('input[aria-label="Lair"]').fill("A flooded chapel by the tanneries");
  await crewWizard.locator('input[aria-label="Hunting grounds"]').fill("Brine Street");
  await crewWizard.locator('select[aria-label="Favored operation"]').selectOption("Burglary");
  await crewWizard.locator('input[aria-label="Claimed by"]').fill("The Grey Lanterns");
  await crewWizard.locator('select[aria-label="Hunting grounds deal"]').selectOption("pay1");
  await crewWizard.locator('input[data-crew-ability="Second story"]').check();
  await crewWizard.locator('input[data-upgrade="Quarters"]').check();
  await crewWizard.locator('input[data-upgrade="Workshop"]').check();
  await crewWizard.locator('input[aria-label="A faction helped"]').fill("The Widow's Hand");
  await crewWizard.locator('input[aria-label="A faction was harmed"]').fill("The Tallow Guild");
  await crewWizard.locator('select[aria-label="Favorite contact"]').selectOption("Dowling");
  await crewWizard.locator('input[aria-label="Crew name"]').fill("The Lamplighters");
  await crewWizard.locator('[data-action="crew-finish"]').click();
  await seat.waitForSelector('[data-crew="The Lamplighters"]', { timeout: 15000 });
  const crew = (await tool("kraken_party")).crew;
  assert(crew && crew.type === "Shadows" && crew.coin === 1 && crew.upgrades.Quarters === 1 && crew.upgrades.Workshop === 1 && crew.upgrades["Hidden Lair"] === 1 && crew.factions["The Tallow Guild"].status === -2 && crew.factions["The Widow's Hand"].status === 1, `the crew: ${JSON.stringify(crew)}`);
  assert(await seat.locator('.crew-claim.lair').count() === 1 && (await seat.locator(".crew-claim").count()) === 15, "the claim map: 14 claims around the lair");
  await seat.screenshot({ path: path.join(shots, "crew.png") });
  for (const button of await seat.$$('[data-window="party"] button[aria-label^="Close"]')) await button.click().catch(() => undefined);
  await tool("kraken_party_edit", { members: [mine.id] }).catch(() => undefined);

  // The GM's Score panel: desperate, great.
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.waitForSelector(".score-panel", { timeout: 15000 });
  await page.locator('.score-panel select[aria-label="Position"]').selectOption("desperate");
  await page.locator('.score-panel select[aria-label="Effect"]').selectOption("great");
  await until("the score's position", async () => (await tool("kraken_clocks")).score.position === "desperate" && (await tool("kraken_clocks")).score.effect === "great");
  await page.screenshot({ path: path.join(shots, "score.png") });
  // The player's sheet takes them; an action roll: Prowl 2d, desperate (1 Prowess xp).
  await seat.click('.sidebar [data-launch="characters"]').catch(() => undefined);
  await seat.waitForSelector('[data-ruleset="forged"]', { timeout: 10000 });
  await seat.waitForFunction(() => document.querySelector('[data-ruleset="forged"] select[aria-label="Roll position"]')?.value === "desperate", null, { timeout: 10000 });
  await sheet.locator('[data-roll-action="prowl"]').click();
  const rolled = await until("the action roll's card", async () => (await chat(/\[ACTION\] Prowl 2d · Desperate \/ Great/)).length > 0);
  assert(rolled, "the action roll in chat");
  const card = (await chat(/\[ACTION\] Prowl 2d/))[0];
  assert(card.roll?.terms?.[0]?.rolls?.length === 2 && /\[(CRITICAL|SUCCESS|PARTIAL|BAD) \d\]/.test(card.roll.label), `the d6 pool and its highest: ${card.roll?.label}`);
  await until("desperate xp", async () => (await dataOf(mine.id)).xp.prowess === 1);
  // A resistance roll: Prowess 2d, 6 less the highest.
  await sheet.locator('[data-roll-resist="prowess"]').click();
  await until("the resistance roll", async () => (await chat(/\[RESIST\] Prowess 2d/)).length > 0);
  await until("resisting cost stress (or a critical cleared it)", async () => (await chat(/Nell Ashby resists: (\d stress|a critical)/)).length > 0);
  await seat.screenshot({ path: path.join(shots, "rolled.png") });

  // The GM's Clocks window: a 6-clock, ticked twice; the player sees it on the table's strip.
  await tool("kraken_windows", { action: "open", kind: "clocks" });
  await page.waitForSelector(".clocks-window", { timeout: 10000 });
  await page.locator('.clocks-window input[aria-label="Clock name"]').fill("Counting-house Alert");
  await page.locator('.clocks-window select[aria-label="Segments"]').selectOption("6");
  await page.locator('.clocks-window select[aria-label="Kind"]').selectOption("danger");
  await page.locator('.clocks-window [data-action="clock-add"]').dispatchEvent("click");
  await page.waitForSelector('.clocks-window [data-clock="Counting-house Alert"]', { timeout: 10000 });
  await page.locator('.clocks-window [data-clock="Counting-house Alert"] [data-action="clock-tick"]').dispatchEvent("click");
  await page.locator('.clocks-window [data-clock="Counting-house Alert"] [data-action="clock-tick"]').dispatchEvent("click");
  await seat.waitForSelector('.clocks-strip [data-clock="Counting-house Alert"][data-filled="2"]', { timeout: 10000 });
  assert((await tool("kraken_clocks")).clocks.find((clock) => clock.name === "Counting-house Alert").filled === 2, "the clock at 2 of 6");
  // A preset from the active adventure.
  await page.locator('.clocks-window [data-action="clock-preset"]', { hasText: "First Light" }).dispatchEvent("click");
  await seat.waitForSelector('.clocks-strip [data-clock="First Light"]', { timeout: 10000 });
  await seat.screenshot({ path: path.join(shots, "player-clocks.png") });

  // The Brine Street map: its walls and doors.
  await tool("kraken_open_fg_module", { module: "The Brine Street Job", all: true });
  let map = await tool("kraken_map", {});
  for (let wait = 0; wait < 40 && !(map.doors ?? []).length; wait++) {
    await settle(250);
    map = await tool("kraken_map", {});
  }
  const walls = await tool("kraken_wall", { action: "list" });
  assert(walls.total >= 20 && (map.doors ?? []).length >= 5, `the map's walls and doors: ${walls.total}, ${(map.doors ?? []).length}`);
  await settle(800);
  await page.screenshot({ path: path.join(shots, "gm.png") });

  // Downtime: the GM begins it on the Score panel; the player indulges their vice from the sheet.
  await page.locator('.score-panel [data-action="downtime-start"]').dispatchEvent("click");
  await until("downtime", async () => (await tool("kraken_clocks")).score.phase === "downtime");
  for (const button of await seat.$$('[data-window="map"] button[aria-label^="Close"]')) await button.click().catch(() => undefined);
  await sheet.locator('[data-sheet-tab="downtime"]').dispatchEvent("click");
  await sheet.locator('[data-action="vice"]').dispatchEvent("click");
  await until("the vice roll", async () => (await chat(/\[VICE\] Nell Ashby: Gambling at Madame Lisle's card room \(1d\)/)).length > 0);
  await until("the activity counted", async () => (await dataOf(mine.id)).downtime.indulged === 1);
  await seat.screenshot({ path: path.join(shots, "downtime.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok forged ui: a Forged in the Dark campaign's shelf has its three books and no other game's, made active; a test player made Nell Ashby "Wren" (Burglar, Far Isles, Underworld; four dots; Ambush; a friend and a rival; Gambling) in the wizard, then the crew The Lamplighters (Shadows, Daring, Second story, Quarters and Workshop, Dowling) on the Crew tab; the GM's Score panel set desperate / great and the player's sheet rolled Prowl 2d (the highest die read, desperate xp) and resisted with Prowess; the GM's Clocks window made Counting-house Alert and ticked it to 2/6 and added First Light from the adventure, both on the player's strip; the Brine Street map's ${walls.total} walls and ${(map.doors ?? []).length} doors; the GM began downtime and the player indulged their vice. Screenshots: ${shots}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
