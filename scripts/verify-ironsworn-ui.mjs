// Ironsworn and Starforged, played as a table would, in the real app: for
// each game the GM hosts a campaign with nothing else installed (KRAKEN_BOOKS
// and KRAKEN_PACKS point at empty folders: only Kraken's own packs) and makes
// its three books active; a test player in Chrome builds a character in the
// wizard (stats 3, 2, 2, 1, 1 placed; the assets; a background vow; bonds or
// a first connection), makes a move from the sheet (Face Danger: the action
// and challenge dice in chat, the outcome on the sheet), swears an iron vow
// and marks progress on it; the GM rolls an oracle in the Oracles window (and
// Ironsworn's Delve Sites: a feature); then a fight: a foe on the tracker as a
// ranked progress track, the player's Enter the Fray and Strike against it
// from the sheet (its progress marked), the GM's mark from the tracker, and
// the fight ended with a progress roll. Windows open on the left monitor
// (KRAKEN_WINDOW_AT) and are closed at the end.
//   node scripts/verify-ironsworn-ui.mjs [Ironsworn|Starforged]
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
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const shots = path.join(tmpdir(), "kraken-ironsworn-ui");
mkdirSync(shots, { recursive: true });
const PLANS = {
  Ironsworn: {
    books: ["Ironsworn Reference", "Ironsworn Foes and Sites", "The Cinder Barrow"],
    assets: ["Hound", "Archer", "Alchemist"],
    foe: "Raider",
    end: "end_the_fight",
  },
  Starforged: {
    books: ["Starforged Reference", "Starforged Foes", "The Silent Hulk"],
    assets: ["Ace", "Blademaster", "Glowcat"],
    foe: "Drift pirate",
    end: "take_decisive_action",
  },
};
const wanted = process.argv[2] ? [process.argv[2]] : Object.keys(PLANS);
const results = [];
for (const game of wanted) results.push(await run(game, PLANS[game]));
console.log(`ok ironsworn ui: ${results.join(" | ")} Screenshots: ${shots}`);

async function run(game, plan) {
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-ironsworn-ui-"));
  mkdirSync(path.join(profile, "no-fg-modules"), { recursive: true });
  mkdirSync(path.join(profile, "Packs"), { recursive: true });
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
  const rpc = (method, params) => {
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
  };
  const tool = async (name, args = {}) => {
    const result = await rpc("tools/call", { name, arguments: args });
    const text = result.content?.[0]?.text ?? "";
    if (result.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const dataOf = async (id) => {
    const got = await tool("kraken_record_get", { id });
    return got.data ?? got.record?.data;
  };
  const chat = async (pattern) => {
    const lines = await tool("kraken_chat_log", { count: 200 });
    return (Array.isArray(lines) ? lines : []).filter((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""}`));
  };
  const until = async (test, ms = 15000, what = "it") => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = await test().catch(() => null);
      if (value) return value;
      await settle(250);
    }
    throw new Error(`Timed out waiting for ${what}.`);
  };
  let browser = null;
  const PORT = 48500 + Math.floor(Math.random() * 400);
  try {
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
    const campaign = await tool("kraken_campaign_create", { name: `${game} UI`, ruleset: game });
    await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
    await page.waitForSelector("text=Hosting");
    const listed = await tool("kraken_books", { action: "list" });
    const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
    const ours = plan.books.map((name) => shelf.find((item) => item.name === name || item.title === name || String(item.title).startsWith(name)));
    assert(ours.every(Boolean), `its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
    assert(shelf.length === 3, `no other game's books: ${shelf.map((item) => item.title).join(", ")}`);
    for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });
    await until(async () => (await tool("kraken_records_list", { type: "ironmove" })).records?.length > 40, 30000, "the moves");

    // A test player makes a character in the wizard.
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
    await seat.waitForSelector('[data-wizard="ironsworn"]', { timeout: 10000 });
    const w = '[data-wizard="ironsworn"]';
    // Stats: Edge 1 and Wits 3 swapped from the spread's order.
    await seat.selectOption(`${w} [data-iron-stat="edge"]`, "1");
    assert(await seat.locator(`${w} [data-action="wizard-finish"]`).isDisabled(), "two 1s and no 3: the wizard waits");
    await seat.selectOption(`${w} [data-iron-stat="wits"]`, "3");
    for (const name of plan.assets) {
      const box = seat.locator(`${w} [data-iron-asset="${name}"]`);
      await box.evaluate((element) => element.closest("details")?.setAttribute("open", ""));
      await box.check();
    }
    await seat.fill(`${w} [data-background-vow]`, game === "Starforged" ? "Find the lost fleet" : "Avenge my clan");
    if (game === "Starforged") {
      await seat.fill(`${w} [data-ship-name]`, "Lantern");
      await seat.fill(`${w} [data-connection-name]`, "Ashe Varo");
      await seat.fill(`${w} [data-connection-role]`, "Broker");
    } else {
      await seat.fill(`${w} [data-bond="0"]`, "Brannoch");
      await seat.fill(`${w} [data-bond="1"]`, "Wenna Tull");
    }
    await seat.fill(`${w} input[aria-label="Character name"]`, game === "Starforged" ? "Vesna Kade" : "Kira Ashdown");
    await seat.click(`${w} [data-action="wizard-finish"]`);
    await seat.waitForSelector('[data-ruleset="ironsworn"]', { timeout: 15000 });
    const sheet = seat.locator('[data-ruleset="ironsworn"]');
    const list = await tool("kraken_records_list", { type: "character" });
    const mine = (list.records ?? list).find((item) => item.owner === "A test player");
    let data = await dataOf(mine.id);
    assert(data.stats.edge === 1 && data.stats.wits === 3 && Object.keys(data.assets).length === (game === "Starforged" ? 4 : 3) && data.meters.health === 5 && data.momentum === 2, `the character: ${JSON.stringify({ stats: data.stats, assets: Object.values(data.assets).map((asset) => asset.name) })}`);
    assert(game === "Starforged" ? Object.values(data.tracks).some((track) => track.kind === "connection") && Object.values(data.assets).some((asset) => asset.fields?.name === "Lantern") : data.bonds.ticks === 2, "bonds (Ironsworn) or the connection and the ship's name (Starforged)");
    await seat.screenshot({ path: path.join(shots, `${game}-sheet.png`) });

    // A move from the sheet: Face Danger +wits (3); fixed dice: a 4 against 2 and 9: a weak hit.
    await sheet.locator('[data-sheet-tab="moves"]').click();
    await sheet.locator('[data-move="face_danger"]').first().click();
    await sheet.locator("[data-move-option]").selectOption("4");
    await tool("kraken_dice_force", { values: [4, 2, 9] });
    await sheet.locator('[data-action="make-move"]').click();
    await seat.waitForSelector('[data-last-roll="weak"]', { timeout: 15000 });
    assert((await chat(/\[MOVE\] .*Face Danger \(\+Wits 3\)/)).length === 1, "Face Danger's roll in chat");
    // Its choices as buttons: the first (-1 momentum).
    // (Starforged's weak hit is a suffer move of the player's own: momentum down on the sheet.)
    if (game === "Ironsworn") await sheet.locator('[data-action="iron-choose"][data-choice="0"]').click();
    else {
      await sheet.locator('[data-sheet-tab="main"]').click();
      await sheet.locator('[data-action="momentum-down"]').click();
      await sheet.locator('[data-sheet-tab="moves"]').click();
    }
    await until(async () => (await dataOf(mine.id)).momentum === 1, 10000, "the choice's -1 momentum");

    // Swear an iron vow (dangerous) and mark progress.
    await sheet.locator('[data-move="swear_an_iron_vow"]').click();
    await sheet.locator("[data-vow-name]").fill("End the threat to the colony");
    await sheet.locator("[data-vow-rank]").selectOption("dangerous");
    await tool("kraken_dice_force", { values: [6, 1, 2] });
    await sheet.locator('[data-action="make-move"]').click();
    const vowKey = await until(async () => Object.entries((await dataOf(mine.id)).tracks).find(([, track]) => track.name === "End the threat to the colony")?.[0], 10000, "the vow");
    await sheet.locator('[data-sheet-tab="progress"]').click();
    await sheet.locator(`[data-track="${vowKey}"] [data-action="track-mark"]`).click();
    await until(async () => (await dataOf(mine.id)).tracks[vowKey].ticks === 8, 10000, "a dangerous mark of progress (8 ticks)");
    await seat.waitForSelector(`[data-track="${vowKey}"] .iron-boxes[data-ticks="8"]`, { timeout: 8000 });
    await seat.screenshot({ path: path.join(shots, `${game}-progress.png`) });

    // The GM rolls an oracle.
    await tool("kraken_windows", { action: "open", kind: "oracles" });
    await page.waitForSelector(".iron-oracles [data-ask]", { timeout: 10000 });
    await page.locator(".iron-oracles [data-ask]").first().click();
    await page.waitForSelector("[data-oracle-result]", { timeout: 10000 });
    await page.fill('[aria-label="Oracle search"]', game === "Starforged" ? "Action" : "Theme");
    await page.locator(".iron-oracle").first().click();
    await until(async () => (await chat(/\[ORACLE\]/)).length >= 2, 10000, "two oracles in chat");
    await page.screenshot({ path: path.join(shots, `${game}-oracles.png`) });
    if (game === "Ironsworn") {
      await tool("kraken_windows", { action: "open", kind: "delve" });
      await page.waitForSelector('[data-action="delve-feature"]', { timeout: 10000 });
      await page.locator('[data-action="delve-feature"]').click();
      await page.waitForSelector("[data-delve-result]", { timeout: 10000 });
    }

    // The fight: a foe on the tracker as a ranked progress track.
    const foeRecord = ((await tool("kraken_records_list", { type: "npc", name: plan.foe })).records ?? [])[0];
    await tool("kraken_combat", { action: "add", recordId: mine.id });
    await tool("kraken_combat", { action: "add", recordId: foeRecord.id });
    let view = (await tool("kraken_combat", { action: "view" })).entries;
    const foe = view.find((entry) => entry.recordId === foeRecord.id);
    await tool("kraken_windows", { action: "open", kind: "combat" });
    await page.waitForSelector(`.combat-tracker [data-ct="${foe.id}"] [data-iron-rank]`, { timeout: 10000 });
    await sheet.locator('[data-sheet-tab="moves"]').click();
    const moveAt = async (key, dice, option = null) => {
      await sheet.locator(`[data-move="${key}"]`).first().click();
      if (option !== null) await sheet.locator("[data-move-option]").selectOption(String(option));
      await seat.waitForSelector(`[data-move-track] option[value="target:${foe.id}"]`, { state: "attached", timeout: 10000 });
      await sheet.locator("[data-move-track]").selectOption(`target:${foe.id}`);
      await tool("kraken_dice_force", { values: dice });
      const before = (await dataOf(mine.id)).lastroll?.at ?? 0;
      await sheet.locator('[data-action="make-move"]').click();
      await until(async () => ((await dataOf(mine.id)).lastroll?.at ?? 0) > before, 10000, key);
    };
    // Enter the Fray: a strong hit (6 + heart 2 against 1 and 2): the initiative / in control.
    await sheet.locator('[data-move="enter_the_fray"]').click();
    await sheet.locator("[data-move-option]").selectOption(game === "Starforged" ? "1" : "0");
    await tool("kraken_dice_force", { values: [6, 1, 2] });
    await sheet.locator('[data-action="make-move"]').click();
    await until(async () => (await dataOf(mine.id)).control === true, 10000, "the initiative");
    // Strike: a strong hit (6 + iron against 1 and 1): progress marked on the foe.
    await moveAt("strike", [6, 1, 1], 0);
    view = (await tool("kraken_combat", { action: "view" })).entries;
    const ticks = view.find((entry) => entry.id === foe.id).iron.ticks;
    assert(ticks > 0, `Strike marked the foe's progress: ${ticks} ticks`);
    await page.waitForSelector(`.combat-tracker [data-ct="${foe.id}"] [data-iron-ticks="${ticks}"]`, { timeout: 10000 });
    assert(view.find((entry) => entry.recordId === mine.id).iron.control === true, "the tracker shows the initiative / in control");
    // The GM's mark from the tracker.
    await page.locator(`.combat-tracker [data-ct="${foe.id}"] [data-action="foe-mark"]`).click();
    const marked = await until(async () => {
      const now = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === foe.id).iron.ticks;
      return now > ticks ? now : null;
    }, 10000, "the GM's mark");
    // End the fight: its progress against 1 and 1: a strong hit.
    await moveAt(plan.end, [1, 1]);
    view = (await tool("kraken_combat", { action: "view" })).entries;
    assert(view.find((entry) => entry.id === foe.id).health.status === "Defeated", `the foe is out of the fight: ${view.find((entry) => entry.id === foe.id).health.status}`);
    await page.screenshot({ path: path.join(shots, `${game}-combat.png`) });
    await seat.screenshot({ path: path.join(shots, `${game}-player-combat.png`) });
    data = await dataOf(mine.id);
    assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
    return `${game}: a test player built ${mine.name} in the wizard (Edge 1, Wits 3; ${Object.values(data.assets).map((asset) => asset.name).join(", ")}); Face Danger from the sheet (a weak hit, its choice taken); a vow sworn and marked (8 ticks); the GM's oracles${game === "Ironsworn" ? " and a Delve feature" : ""}; a ${foe.iron?.rank ?? ""} ${plan.foe} on the tracker: Enter the Fray, Strike (${ticks} ticks), the GM's mark (${marked}), ${plan.end.replace(/_/g, " ")}: defeated.`;
  } finally {
    await browser?.close();
    child.kill();
    await app.close();
  }
}
