// The whole table for a ruleset, in the real app, the way a GM and a player
// use it (the GM's checklist): the GM's Kraken launched and full screen, a
// campaign made with the ruleset and its books made active, a map put on the
// table; a test player in Chrome makes an account, uses the character
// wizard (buying starting gear with the starting money), fills every field
// of the sheet, picks a portrait, sets custom dice and rolls them; the GM
// places the token, puts the character on the combat tracker and the party
// sheet, brings in an enemy, a fight is played to its end, a parcel is made
// and handed out with experience. Every problem is noted (nothing stops at
// the first) and written out; screenshots go to the temp folder. Windows open
// on the left monitor (KRAKEN_WINDOW_AT) and are all closed at the end.
//   node scripts/e2e-ruleset.mjs "AD&D 2E"   (or "all")
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { RULESETS } from "./e2e/rulesets.mjs";

const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const wanted = process.argv[2] ?? "all";
const names = wanted === "all" ? Object.keys(RULESETS) : wanted.split(",");
const results = {};
const outDir = path.join(tmpdir(), "kraken-e2e");
mkdirSync(outDir, { recursive: true });

for (const ruleset of names) {
  const plan = RULESETS[ruleset];
  if (!plan) {
    console.log(`No plan for ${ruleset}.`);
    continue;
  }
  results[ruleset] = await runRuleset(ruleset, plan);
}
writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
console.log("\n=== Results ===");
for (const [ruleset, result] of Object.entries(results)) console.log(`${result.problems.length ? "FAIL" : "PASS"} ${ruleset}: ${result.problems.length} problem(s), ${result.steps.filter((step) => step.ok).length}/${result.steps.length} steps`);
for (const [ruleset, result] of Object.entries(results)) for (const item of result.problems) console.log(`  [${ruleset}] ${item.step}: ${item.text}${item.detail ? ` -- ${item.detail}` : ""}`);
process.exit(Object.values(results).some((result) => result.problems.length) ? 1 : 0);

async function runRuleset(ruleset, plan) {
  const slug = ruleset.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const problems = [];
  const steps = [];
  let current = "";
  const problem = (text, detail = "") => {
    problems.push({ step: current, text, detail: String(detail ?? "").slice(0, 400) });
    console.log(`  PROBLEM [${current}] ${text}${detail ? ` -- ${String(detail).slice(0, 240)}` : ""}`);
  };
  const check = (condition, text, detail) => {
    if (!condition) problem(text, detail);
    return Boolean(condition);
  };
  const step = async (name, fn) => {
    current = name;
    const before = problems.length;
    const started = Date.now();
    try {
      await fn();
    } catch (error) {
      // The first line, and what it waited for (the element a timed-out click wanted).
      problem(`stopped: ${error.message.split("\n")[0]}`, (/waiting for ([^\n]*)/.exec(error.message)?.[1] ?? "").slice(0, 200));
    }
    const ok = problems.length === before;
    // A failed step: both screens, to see why.
    if (!ok) {
      const tag = `fail-${name.split(" ")[0]}`;
      await ctx.page?.screenshot({ path: path.join(outDir, `${slug}-${tag}-gm.png`) }).catch(() => undefined);
      await ctx.seat?.screenshot({ path: path.join(outDir, `${slug}-${tag}-player.png`) }).catch(() => undefined);
    }
    steps.push({ name, ok, ms: Date.now() - started });
    console.log(`${ok ? "ok  " : "FAIL"} ${ruleset} · ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
    return ok;
  };
  console.log(`\n=== ${ruleset} ===`);

  const profile = mkdtempSync(path.join(tmpdir(), "kraken-e2e-"));
  const env = { ...process.env, KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
  let app = null;
  let browser = null;
  let child = null;
  const ctx = { ruleset, plan, problem, check, shot: null, page: null, seat: null, tool: null, port: 47600 + Math.floor(Math.random() * 300), slug, outDir };
  try {
    // 1. The GM's Kraken.
    await step("1 launch the GM's app", async () => {
      app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
      ctx.page = await app.firstWindow();
      ctx.page.on("pageerror", (error) => problem("GM page error", error.message));
      await ctx.page.waitForSelector("text=My Campaigns", { timeout: 60000 });
      child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
      const answers = new Map();
      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        const message = JSON.parse(line);
        answers.get(message.id)?.(message);
      });
      let nextId = 0;
      const rpc = (method, params) =>
        new Promise((resolve, reject) => {
          const id = ++nextId;
          const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
          answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        });
      ctx.tool = async (name, args = {}) => {
        const result = await rpc("tools/call", { name, arguments: args });
        const text = result.content?.[0]?.text ?? "";
        if (result.isError) throw new Error(`${name}: ${text}`);
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      };
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
      ctx.shot = async (where, name) => (where ?? ctx.page).screenshot({ path: path.join(outDir, `${slug}-${name}.png`) }).catch(() => undefined);
    });
    if (!ctx.page) return { problems, steps };
    const { page, tool } = ctx;

    // 3. Full screen (on the left monitor).
    await step("3 full screen", async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.maximize();
      });
      await page.waitForTimeout(600);
      const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
      check(bounds.width >= 1800 && bounds.x < 0, "the window fills the left monitor", JSON.stringify(bounds));
    });

    // 2. A campaign with the ruleset, hosted; its books made active.
    await step("2 campaign and books", async () => {
      if (!(await page.$('[data-action="new-campaign"]'))) await page.click('[data-action="campaigns-mode"]').catch(() => undefined);
      await page.click('[data-action="new-campaign"]');
      await page.fill('[aria-label="New campaign name"]', `E2E ${ruleset}`);
      await page.click(`[data-ruleset="${ruleset}"]`);
      await page.click('[data-action="create"]');
      await page.waitForSelector('[data-action="play"]', { timeout: 15000 });
      await page.fill('input[name="port"]', String(ctx.port));
      await page.fill('input[name="password"]', "pw");
      await page.click('[data-action="play"]');
      await page.waitForSelector("text=Hosting", { timeout: 30000 });
      const listed = await tool("kraken_books", { action: "list" });
      const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
      ctx.shelf = shelf;
      const want = plan.books ?? [];
      if (want.length) {
        await openSide(page, "books:activation");
        await page.waitForSelector('[data-books-tab="activation"]');
        for (const title of want) {
          const book = shelf.find((item) => item.title === title || item.name === title);
          if (!check(book, `the shelf has ${title}`, shelf.map((item) => item.title).join(" | ").slice(0, 400))) continue;
          const box = page.locator(`[data-activate="${book.id}"]`);
          // The box is the host's: it ticks when the host says the book is active.
          if (!(await box.isChecked())) {
            await box.click();
            await waitFor(() => box.isChecked(), 30000);
          }
        }
        await page.waitForTimeout(1500);
        const active = [].concat(await tool("kraken_books", { action: "list" })).filter((item) => item.active);
        for (const title of want) check(active.some((item) => item.title === title || item.name === title), `${title} is active`, active.map((item) => item.title).join(", "));
        await closeWindows(page);
      }
      await ctx.shot(page, "02-books");
    });

    // 4. A map for the table.
    await step("4 a map", async () => {
      await plan.map(ctx);
      const scene = (await tool("kraken_map")).scene;
      check(scene && scene.walls >= 0, "a scene is on the table", JSON.stringify(scene));
      ctx.scene = scene;
      await ctx.shot(page, "04-map");
    });

    // 5-6. A test player in Chrome, a new account.
    await step("5-6 a player in Chrome, a new account", async () => {
      browser = await chromium.launch({ executablePath: CHROME, headless: false, args: [`--window-position=${AT[0] + 900},${AT[1] + 80}`, "--window-size=1500,1000"] });
      ctx.seat = await browser.newPage({ viewport: { width: 1480, height: 900 } });
      ctx.seat.on("pageerror", (error) => problem("player page error", error.message));
      await ctx.seat.goto(`http://127.0.0.1:${ctx.port}/`);
      await ctx.seat.waitForLoadState("networkidle").catch(() => undefined);
      // Each field filled and read back (a field the page was still settling once took stray keys).
      for (const [field, value] of [["name", "A test player"], ["account-password", "test-pass-1"], ["password", "pw"]]) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await ctx.seat.fill(`input[name="${field}"]`, value);
          if ((await ctx.seat.inputValue(`input[name="${field}"]`)) === value) break;
          await ctx.seat.waitForTimeout(300);
        }
      }
      await ctx.seat.click('button[type="submit"]');
      await ctx.seat.waitForSelector(".sidebar", { timeout: 20000 });
      const accounts = await tool("kraken_accounts", { action: "list" }).catch(() => null);
      check(!accounts || JSON.stringify(accounts).includes("A test player"), "the account is on the host", JSON.stringify(accounts).slice(0, 200));
    });
    const { seat } = ctx;
    if (!seat) return { problems, steps };

    // 7, 9, 10. The wizard (a lifepath through several terms; starting gear bought).
    await step("7 the character wizard (9 several terms, 10 starting gear bought)", async () => {
      await openSide(seat, "characters");
      await seat.waitForSelector('[data-action="new-character"]', { timeout: 15000 });
      await seat.click('[data-action="new-character"]');
      await plan.wizard(ctx);
      const all = await tool("kraken_records_list", { type: "character" });
      const listed = (Array.isArray(all) ? all : all.records ?? []).filter((item) => item.owner === "A test player");
      const mine = listed;
      if (!check(listed.length >= 1, "the wizard made a character", JSON.stringify(mine).slice(0, 200))) return;
      ctx.character = await tool("kraken_record_get", { id: listed[listed.length - 1].id });
      const items = Object.values(ctx.character.data.inventorylist ?? {});
      check(items.length > 0, "the character has gear", JSON.stringify(ctx.character.data.inventorylist ?? {}).slice(0, 200));
      if (plan.bought) await plan.bought(ctx);
      await ctx.shot(seat, "07-sheet");
    });
    if (!ctx.character) return { problems, steps };

    // 8. Every field of the sheet.
    await step("8 every field of the sheet filled", async () => {
      await fillSheet(ctx);
    });

    // 11. A portrait.
    await step("11 a portrait", async () => {
      await seat.click('[data-sheet-tab="main"]').catch(() => undefined);
      await seat.click('[data-action="pick-portrait"]');
      await seat.waitForSelector('[role="dialog"][aria-label="Choose a portrait"] [data-art]', { timeout: 15000 });
      const cells = seat.locator('[role="dialog"][aria-label="Choose a portrait"] [data-art]');
      const pick = cells.nth(Math.min(3, (await cells.count()) - 1));
      const id = await pick.getAttribute("data-art");
      await pick.click();
      await seat.waitForTimeout(800);
      const record = await tool("kraken_record_get", { id: ctx.character.id });
      check(record.data.portrait === id, "the portrait chosen is the sheet's", `${record.data.portrait} vs ${id}`);
    });

    // 12. Custom dice, rolled.
    await step("12 custom dice, rolled", async () => {
      await seat.click('.sidebar [data-launch="settings"], [title="Settings"]');
      await seat.click('[data-setting="dice"]');
      await seat.waitForSelector("[data-preset]", { timeout: 10000 });
      const preset = seat.locator("[data-preset]").nth(5);
      const presetName = await preset.getAttribute("data-preset");
      await preset.click();
      await seat.waitForTimeout(500);
      await closeWindows(seat);
      // (The map the GM put on the table can lie over the chat dock: its buttons are pressed as clicks on them.)
      await seat.locator('.dice-tray button[aria-label="d20"]').dispatchEvent("click");
      await seat.locator('.dice-tray button[aria-label="d6"]').dispatchEvent("click");
      await seat.locator(".dice-pool .play-button").dispatchEvent("click");
      const line = await waitFor(async () => {
        const lines = await tool("kraken_chat_log", { count: 30 });
        return (Array.isArray(lines) ? lines : []).reverse().find((item) => item.roll && [`A test player`, ctx.character?.name ?? "A test player"].some((who) => `${item.from} ${item.roll.by ?? ""}`.includes(who)) && item.roll.terms?.some((term) => term.sides === 20));
      }, 15000);
      if (!check(line, "the player's roll is in chat")) return;
      check(line.roll.look && line.roll.look.theme !== undefined, `the roll carries the player's dice (${presetName})`, JSON.stringify(line.roll.look ?? {}).slice(0, 160));
      await ctx.shot(seat, "12-dice");
    });

    // 13. The map shared; the player sees it.
    await step("13 the map shared with the player", async () => {
      // The GM: the map on the table, shared (FG's Share), even with a player who closed it.
      await page.bringToFront();
      await closeWindows(page);
      await page.click('[data-action="map-share"]');
      await plan.share?.(ctx);
      const playerSees = await waitFor(() => seat.evaluate(() => Boolean(document.querySelector(".map-view, [data-scene], canvas.map-canvas, .scene-overlay"))), 15000);
      check(playerSees, "the player's screen shows the map");
    });

    // 14. The token on the map.
    await step("14 the character's token on the map", async () => {
      await page.bringToFront();
      const tray = page.locator(".token-tray");
      if (!(await page.$(`.token-tray li[data-tray="${ctx.character.id}"]`))) await page.click(".tray-toggle").catch(() => undefined);
      await page.click(`.token-tray li[data-tray="${ctx.character.id}"]`, { timeout: 10000 });
      const token = await waitFor(async () => (await tool("kraken_map")).tokens?.find((item) => item.recordId === ctx.character.id), 10000);
      check(token, "the token is on the map");
      ctx.token = token;
      await tray.isVisible();
      const seen = await waitFor(() => seat.evaluate((id) => Boolean(document.querySelector(`[data-token][data-record="${id}"]`)), ctx.character.id), 10000);
      check(seen, "the player sees their token");
    });

    // 14b. The character on the combat tracker and the party sheet.
    await step("14b the character on the combat tracker and the party sheet", async () => {
      await openSide(page, "party");
      await page.waitForSelector('[aria-label="Add to the party"]', { timeout: 10000 });
      await page.selectOption('[aria-label="Add to the party"]', ctx.character.id);
      await page.waitForTimeout(500);
      const party = await tool("kraken_party");
      check(JSON.stringify(party).includes(ctx.character.id), "the character is in the party");
      await closeWindows(page);
      await openSide(page, "combat");
      await page.waitForSelector(".combat-tracker", { timeout: 10000 });
      await tool("kraken_combat", { action: "add-party" });
      const view = await tool("kraken_combat", { action: "view" });
      ctx.pcEntry = view.entries.find((entry) => entry.recordId === ctx.character.id);
      check(ctx.pcEntry, "the character is on the combat tracker");
    });

    // 15. An enemy.
    await step("15 an enemy to fight", async () => {
      await plan.enemy(ctx);
      const view = await tool("kraken_combat", { action: "view" });
      ctx.foe = view.entries.find((entry) => entry.faction === "foe" && entry.recordId !== ctx.character.id);
      check(ctx.foe, "an enemy is on the tracker", JSON.stringify(view.entries.map((entry) => entry.name)));
    });

    // 16. The fight.
    await step("16 the fight", async () => {
      if (!ctx.foe) return;
      await fight(ctx);
      await ctx.shot(page, "16-fight");
    });

    // 17-18. A parcel, handed out; experience.
    await step("17 a parcel for the encounter", async () => {
      await plan.parcel(ctx);
    });
    await step("18 the parcel and experience to the character", async () => {
      const before = await tool("kraken_record_get", { id: ctx.character.id });
      const coinsBefore = coinTotal(before.data.coins);
      const itemsBefore = itemCount(before.data.inventorylist);
      const expBefore = Number(before.data.exp ?? 0);
      await openSide(page, "party");
      await page.click('[role="tab"]:has-text("Inventory")');
      for (const [index, name] of (ctx.parcelItems ?? []).entries()) {
        const box = page.locator(`[aria-label="Who gets ${name}"]`);
        if (await box.count()) await box.fill(ctx.character.name);
        void index;
      }
      await page.click('button:has-text("Distribute")');
      await page.waitForTimeout(800);
      // Experience, where the game has it (Traveller has none: FG's MGT2 neither).
      if (plan.xp !== null) {
        await page.click('[role="tab"]:has-text("XP")');
        await page.fill('[aria-label="XP"], .party-xp input[type="number"]', String(plan.xp ?? 100)).catch(async () => page.locator('input[type="number"]').first().fill(String(plan.xp ?? 100)));
        await page.click('button:has-text("Award to the party")');
        await page.waitForTimeout(800);
      }
      const after = await tool("kraken_record_get", { id: ctx.character.id });
      check(coinTotal(after.data.coins) > coinsBefore, "the parcel's money reached the character", `${coinsBefore} -> ${coinTotal(after.data.coins)} ${JSON.stringify(after.data.coins)}`);
      if (ctx.parcelItems?.length) check(itemCount(after.data.inventorylist) > itemsBefore, "the parcel's items reached the character", `${itemsBefore} -> ${itemCount(after.data.inventorylist)}`);
      if (plan.xp !== null) check(Number(after.data.exp ?? 0) >= expBefore + (plan.xp ?? 100), "the experience reached the character", `${expBefore} -> ${after.data.exp}`);
      // The player's sheet shows the experience.
      await seat.bringToFront();
      await openSide(seat, "characters").catch(() => undefined);
      if (plan.xp !== null) {
        const shown = await seat.evaluate((value) => document.body.innerText.includes(String(value)), after.data.exp);
        check(shown, "the player's sheet shows the experience", String(after.data.exp));
      }
      await ctx.shot(seat, "18-after");
      await closeWindows(page);
    });

    // 19. More: what the ruleset needs beyond the list.
    if (plan.extra) await step("19 more for this ruleset", () => plan.extra(ctx));
    await step("19 the campaign saved and the sheet kept", async () => {
      await tool("kraken_save").catch(() => undefined);
      const record = await tool("kraken_record_get", { id: ctx.character.id });
      check(record.data.portrait && record.data.notes !== undefined, "the character keeps its portrait and fields");
    });
  } finally {
    await browser?.close().catch(() => undefined);
    child?.kill();
    await app?.close().catch(() => undefined);
  }
  return { problems, steps };
}

// --- Helpers ---------------------------------------------------------------------
// A sidebar window opened (its button toggles: pressed again it would close).
async function openSide(where, launch) {
  if (await where.$(`.sidebar [data-launch="${launch}"].open`)) return;
  await where.click(`.sidebar [data-launch="${launch}"]`);
}
async function waitFor(test, ms = 10000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const value = await test();
      if (value) return value;
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}
async function closeWindows(where) {
  for (const button of await where.$$('[data-window]:not([data-window="map"]) button[aria-label^="Close"]')) await button.click().catch(() => undefined);
}
function coinTotal(coins) {
  return Object.values(coins ?? {}).reduce((sum, coin) => sum + (Number(coin?.amount) || 0) * ({ pp: 10, gp: 1, gc: 1, ep: 0.5, sp: 0.1, cp: 0.01, cr: 1 }[String(coin?.name ?? "gp").toLowerCase()] ?? 1), 0);
}

// Every editable field on every tab of the player's sheet: text a sentence,
// numbers left as the rules made them (they are the rules' to set); then the
// record is read back.
async function fillSheet(ctx) {
  const { seat, tool, check } = ctx;
  const filled = [];
  const seen = [];
  const tabs = await seat.$$eval("[data-sheet-tab]", (list) => list.map((tab) => tab.getAttribute("data-sheet-tab")));
  for (const tab of tabs) {
    await seat.click(`[data-sheet-tab="${tab}"]`);
    await seat.waitForTimeout(250);
    const fields = await seat.$$eval('[data-character] input[aria-label]:not([type="checkbox"]):not([type="number"]):not([type="radio"]):not([disabled]), [data-character] textarea[aria-label]:not([disabled])', (list) =>
      list.map((element) => ({ label: element.getAttribute("aria-label"), value: element.value, tag: element.tagName })),
    );
    for (const field of fields) {
      if (/^Name$|search|filter|Add a language/i.test(field.label)) continue;
      seen.push(field.label);
      if (field.value && field.value.trim()) continue;
      const text = `E2E ${field.label}`;
      const box = seat.locator(`[data-character] [aria-label="${field.label}"]`).first();
      await box.fill(text);
      await box.press(field.tag === "TEXTAREA" ? "Tab" : "Enter").catch(() => undefined);
      await box.blur().catch(() => undefined);
      filled.push(field.label);
    }
  }
  await seat.waitForTimeout(800);
  const record = await tool("kraken_record_get", { id: ctx.character.id });
  const blob = JSON.stringify(record);
  const missing = filled.filter((label) => !blob.includes(`E2E ${label}`));
  check(seen.length > 0, "the sheet has fields to fill", `${filled.length} of ${seen.length} were empty after the wizard`);
  check(missing.length === 0, "every field filled was saved", missing.join(", "));
  ctx.filled = filled;
}

// A fight to its end: initiative, the player's attacks from their sheet, the
// enemy's attacks from the tracker, until one side is down (at most 12 rounds;
// then the GM finishes the enemy off).
async function fight(ctx) {
  const { tool, seat, check } = ctx;
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "target", id: ctx.pcEntry.id, targetId: ctx.foe.id, on: true });
  await tool("kraken_combat", { action: "target", id: ctx.foe.id, targetId: ctx.pcEntry.id, on: true });
  let rounds = 0;
  let attacks = 0;
  const alive = async () => {
    const view = await tool("kraken_combat", { action: "view" });
    const foe = view.entries.find((entry) => entry.id === ctx.foe.id);
    const pc = view.entries.find((entry) => entry.id === ctx.pcEntry.id);
    // (Cairn: the routed and the fleeing are out of the fight; a stabilized PC is out of action.)
    return { foe: foe && !["Dead", "Destroyed", "Dying", "Down", "Unconscious", "Routed", "Fleeing"].includes(foe.health?.status), pc: pc && !["Dead", "Dying", "Down", "Unconscious", "Stable"].includes(pc.health?.status), view };
  };
  await seat.bringToFront();
  await openSide(seat, "characters").catch(() => undefined);
  while (rounds < 12) {
    rounds += 1;
    const state = await alive();
    if (!state.foe || !state.pc) break;
    // The player attacks from the sheet's combat tab (first taking a bought weapon in hand, as a player would).
    await seat.click('[data-sheet-tab="combat"]').catch(() => undefined);
    if (!(await seat.locator('[data-character] :is([data-attack], [data-weapon]) [data-action="attack"]').count()) && ctx.bought?.length && rounds === 1) {
      await seat.click('[data-sheet-tab="inventory"]').catch(() => undefined);
      for (const name of ctx.bought) {
        const carried = seat.locator(`[data-character] button[aria-label^="${name}"][aria-label$=": carried"]`).first();
        if (await carried.count()) {
          await carried.click();
          await seat.waitForTimeout(300);
        }
      }
      await seat.click('[data-sheet-tab="combat"]').catch(() => undefined);
    }
    const attack = seat.locator('[data-character] :is([data-attack], [data-weapon]) [data-action="attack"]').first();
    if (await attack.count()) {
      await attack.click();
      attacks += 1;
      await seat.waitForTimeout(400);
      const damage = seat.locator('[data-character] :is([data-attack], [data-weapon]) [data-action="damage"]').first();
      if (await damage.count()) await damage.click();
      await seat.waitForTimeout(400);
    } else if (await ctx.plan.playerAttack?.(ctx)) attacks += 1;
    // The enemy strikes back.
    const foeView = state.view.entries.find((entry) => entry.id === ctx.foe.id);
    if (foeView?.attacks?.length) await tool("kraken_combat", { action: "attack", id: ctx.foe.id, weapon: foeView.attacks[0].key }).then(() => tool("kraken_combat", { action: "damage-roll", id: ctx.foe.id, weapon: foeView.attacks[0].key })).catch(() => undefined);
    await tool("kraken_combat", { action: "round" }).catch(() => undefined);
  }
  check(attacks > 0, "the player attacked");
  let state = await alive();
  if (state.foe) {
    await tool("kraken_combat", { action: "damage", id: ctx.foe.id, amount: 999 });
    state = await alive();
  }
  check(!state.foe, "the enemy is down");
  // The character is healed for what follows.
  const pc = state.view.entries.find((entry) => entry.id === ctx.pcEntry.id);
  if (pc?.wounds) await tool("kraken_combat", { action: "heal", id: ctx.pcEntry.id, amount: pc.wounds }).catch(() => undefined);
  await tool("kraken_combat", { action: "end", removeNpcs: true });
  const lines = (await tool("kraken_chat_log", { count: 200 })) || [];
  check(lines.some((line) => /\[ATTACK\]|\[SHIP ATTACK\]/.test(line.roll?.label ?? "")), "attacks went to chat");
  check(lines.some((line) => /\[DAMAGE\]/.test(`${line.roll?.label ?? ""} ${line.text ?? ""}`)), "damage went to chat");
}
// How many things a character carries (counts, so a second rope counts).
function itemCount(list) {
  return Object.values(list ?? {}).reduce((sum, item) => sum + Math.max(1, Number(item?.count) || 1), 0);
}
