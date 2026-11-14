// A visual audit: every window, menu and screen of Kraken, as the GM and as a
// test player see them, screenshotted one at a time, for a designer to look
// over (form, not function). For each game: the start screen, the new
// campaign screen, the game hosted with its shipped books active, a map, a
// test player in Chrome making a character in the wizard (a shot each time the
// wizard changes), the character's token on the map, a fight with an NPC on
// the tracker, then every window kind the GM can open (kraken_windows), the
// sidebar, the chat dock, the right-click menus (token, dice tower, chat), and
// the player's sidebar and windows. Shots go to OUT/<game>-<window>.png.
//
//   node scripts/shot-all-windows.mjs [--out <folder>] [--games "Apeira Astra,Cairn"]
//   node scripts/shot-all-windows.mjs --compare <before folder> <after folder> <out folder> [names...]
//
// --compare makes before/after contact sheets (each shot's before beside its
// after) of the shots in both folders, or only those whose names contain one
// of the names given. The GM's window opens full screen on the left monitor
// (KRAKEN_WINDOW_AT, -2500,40 by default) and each window at the size and
// place it opens at; the test player's Chrome runs headless and muted at
// 2560x1440 (SHOTS_PLAYER=w,h). Every window is closed at the end.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { RULESETS } from "./e2e/rulesets.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const slugOf = (text) => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- Before/after contact sheets -------------------------------------------------
if (argv[0] === "--compare") {
  const [, before, after, out, ...names] = argv;
  mkdirSync(out, { recursive: true });
  const shots = readdirSync(after).filter((file) => file.endsWith(".png") && existsSync(path.join(before, file)) && (!names.length || names.some((name) => file.includes(name))));
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  const url = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  // A sheet per few shots: each row the shot's name, then before | after.
  const per = 4;
  for (let i = 0; i < shots.length; i += per) {
    const rows = shots.slice(i, i + per);
    await page.setContent(`<!doctype html><style>body{margin:0;background:#111;color:#ddd;font:14px system-ui}h2{margin:10px 12px 4px;font-size:15px;color:#d2a15a}.r{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 12px 14px}.r figure{margin:0}.r figcaption{font-size:12px;color:#888;margin-bottom:3px}.r img{max-width:100%;max-height:640px;display:block;border:1px solid #333}</style>${rows
      .map((file) => `<h2>${file}</h2><div class="r"><figure><figcaption>before</figcaption><img src="${url(path.join(before, file))}"></figure><figure><figcaption>after</figcaption><img src="${url(path.join(after, file))}"></figure></div>`)
      .join("")}`);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await page.screenshot({ path: path.join(out, `compare-${String(i / per + 1).padStart(2, "0")}.png`), fullPage: true });
  }
  await browser.close();
  console.log(`${Math.ceil(shots.length / per)} contact sheets of ${shots.length} shots in ${out}`);
  process.exit(0);
}

// ---- The audit ---------------------------------------------------------------------
const OUT = flag("--out") ?? path.join(tmpdir(), "kraken-shots", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
mkdirSync(OUT, { recursive: true });
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
// The test player's browser viewport (a 1440p monitor, as the GM's).
const PLAYER = (process.env.SHOTS_PLAYER ?? "2560,1440").split(",").map(Number);
// The games: Kraken's own two first (the richest), then one of each kind shipped in the box.
const GAMES = (flag("--games") ?? "Descending Darkness,Apeira Astra,D&D 5E (SRD),Forged in the Dark,Fate Core,Ironsworn,Cairn,Basic Fantasy").split(",").map((name) => name.trim());
const notes = [];
const note = (text) => {
  notes.push(text);
  console.log(`  note: ${text}`);
};

async function shoot(where, name, file) {
  try {
    const target = typeof where.screenshot === "function" ? where : null;
    if (!target) return false;
    await target.screenshot({ path: path.join(OUT, `${file}.png`), timeout: 8000, animations: "disabled" });
    return true;
  } catch (error) {
    note(`${file}: no shot (${error.message.split("\n")[0]})`);
    return false;
  }
}
// Every window but the map closed (their Close buttons).
async function closeWindows(where) {
  for (let pass = 0; pass < 3; pass++) {
    const buttons = await where.$$('.window:not([data-window="map"]) > .window-title button[aria-label^="Close"]');
    if (!buttons.length) return;
    for (const button of buttons) await button.click({ timeout: 2000 }).catch(() => undefined);
    await settle(200);
  }
}
// The window opened last (the top one), not the map.
async function topWindow(where) {
  const handle = await where.evaluateHandle(() => {
    const all = [...document.querySelectorAll(".window:not(.popped)")].filter((item) => item.getAttribute("data-window") !== "map");
    return all.sort((a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex))[0] ?? null;
  });
  return handle.asElement();
}

async function audit(game) {
  const plan = RULESETS[game];
  if (!plan) {
    note(`${game}: no plan in scripts/e2e/rulesets.mjs`);
    return;
  }
  const ruleset = plan.ruleset ?? game;
  const slug = slugOf(game.replace(/\s*\(SRD\)/, "-srd"));
  console.log(`\n=== ${game} ===`);
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-shots-"));
  // Only what Kraken ships: an empty shelf of FG modules and an empty packs folder (never the GM's).
  const env = { ...process.env, KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
  for (const dir of [env.KRAKEN_BOOKS, env.KRAKEN_PACKS]) mkdirSync(dir, { recursive: true });
  const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  let browser = null;
  let child = null;
  try {
    const page = await app.firstWindow();
    // Full screen on its monitor, as a GM plays (readme-shots does the same): layouts squeezed into a small window look different.
    const screenSize = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const display = screen.getDisplayMatching(win.getBounds());
      win.setFullScreen(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return `${display.size.width}x${display.size.height}`;
    });
    console.log(`  the GM's screen: ${screenSize}`);
    await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
    child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
    const answers = new Map();
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line);
        answers.get(message.id)?.(message);
      } catch {
        // (not an answer)
      }
    });
    let nextId = 0;
    const rpc = (method, params) =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
        answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    const tool = async (name, args = {}) => {
      const result = await rpc("tools/call", { name, arguments: args });
      const text = result.content?.[0]?.text ?? "";
      if (result.isError) throw new Error(`${name}: ${text}`);
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };
    for (let tries = 0; ; tries++) {
      try {
        await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shots", version: "1" } });
        break;
      } catch (error) {
        if (tries > 20) throw error;
        await settle(500);
      }
    }
    const port = 47700 + Math.floor(Math.random() * 200);
    const ctx = { ruleset: game, plan, page, seat: null, tool, port, shelf: [], problem: (what, detail) => note(`${game}: ${what} ${detail ?? ""}`), check: (ok, what, detail) => (ok || note(`${game}: not so: ${what} ${detail ?? ""}`), Boolean(ok)) };
    const step = async (name, fn) => {
      try {
        await fn();
      } catch (error) {
        note(`${game}: ${name} stopped: ${error.message.split("\n")[0]}`);
      }
    };

    // The start screen and the new-campaign screen (once is enough for the start screen).
    if (!existsSync(path.join(OUT, "start-screen.png"))) await shoot(page, "start", "start-screen");
    await step("new campaign", async () => {
      if (!(await page.$('[data-action="new-campaign"]'))) await page.click('[data-action="campaigns-mode"]').catch(() => undefined);
      await page.click('[data-action="new-campaign"]');
      await page.fill('[aria-label="New campaign name"]', `Shots ${game}`);
      await page.click(`[data-ruleset="${ruleset}"]`);
      await settle(400);
      await shoot(page, "new", `${slug}-new-campaign`);
      await page.click('[data-action="create"]');
      await page.waitForSelector('[data-action="play"]', { timeout: 15000 });
      await shoot(page, "launch", `${slug}-campaign-launch`);
      await page.fill('input[name="port"]', String(port));
      await page.fill('input[name="password"]', "");
      await page.click('[data-action="play"]');
      await page.waitForSelector("text=Hosting", { timeout: 30000 });
    });
    await step("books", async () => {
      const listed = await tool("kraken_books", { action: "list" });
      ctx.shelf = Array.isArray(listed) ? listed : listed.books ?? [];
      for (const book of ctx.shelf) if (!book.active) await tool("kraken_books", { action: "activate", book: book.id }).catch((error) => note(`${game}: ${book.title} not active: ${error.message}`));
      await settle(1500);
    });
    await step("map", async () => {
      await plan.map(ctx);
      await closeWindows(page);
      await settle(1200);
    });

    // A test player, in Chrome (headless, muted).
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
    // The player at a full-size screen too.
    const seat = await browser.newPage({ viewport: { width: PLAYER[0], height: PLAYER[1] } });
    ctx.seat = seat;
    await step("player joins", async () => {
      await seat.goto(`http://127.0.0.1:${port}/`);
      await seat.waitForLoadState("networkidle").catch(() => undefined);
      await shoot(seat, "join", `${slug}-player-join`);
      await seat.fill('input[name="name"]', "A test player");
      await seat.fill('input[name="account-password"]', "test-pass-1");
      await seat.click('button[type="submit"]');
      await seat.waitForSelector(".sidebar", { timeout: 20000 });
      await settle(800);
    });

    // The wizard: a shot each time it changes while the plan fills it in.
    await step("wizard", async () => {
      await seat.click('.sidebar [data-launch="characters"]');
      await seat.waitForSelector('[data-action="new-character"]', { timeout: 15000 });
      await shoot(await topWindow(seat), "charselect", `${slug}-player-charselect`);
      await seat.click('[data-action="new-character"]');
      await seat.waitForSelector("[data-wizard]", { timeout: 15000 });
      await settle(600);
      let last = null;
      let count = 0;
      let running = true;
      const watcher = (async () => {
        while (running && count < 14) {
          const wizard = await seat.$("[data-wizard]");
          if (!wizard) break;
          const shot = await wizard.screenshot({ timeout: 4000 }).catch(() => null);
          if (shot && (!last || !shot.equals(last))) {
            count += 1;
            last = shot;
            await wizard.screenshot({ path: path.join(OUT, `${slug}-wizard-${String(count).padStart(2, "0")}.png`), timeout: 4000 }).catch(() => undefined);
          }
          await settle(900);
        }
      })();
      try {
        await plan.wizard(ctx);
      } finally {
        running = false;
        await watcher;
      }
    });
    const characters = await tool("kraken_records_list", { type: "character" }).catch(() => []);
    const character = (Array.isArray(characters) ? characters : characters.records ?? []).find((item) => item.owner === "A test player") ?? (Array.isArray(characters) ? characters : characters.records ?? [])[0];
    if (!character) note(`${game}: no character made`);

    // On the map, and a fight.
    await step("token and fight", async () => {
      if (!character) return;
      await tool("kraken_token_place", { recordId: character.id });
      await closeWindows(page);
      await plan.enemy?.(ctx);
      await closeWindows(page);
      await tool("kraken_combat", { action: "add-party" }).catch(() => undefined);
      await tool("kraken_combat", { action: "init", which: "all" }).catch(() => undefined);
      await settle(1200);
    });

    // The GM's screen, sidebar and chat dock.
    await closeWindows(page);
    await shoot(page, "gm", `${slug}-gm-screen`);
    await shoot(await page.$(".sidebar"), "sidebar", `${slug}-gm-sidebar`);
    // The chat dock, with the map window (which lies over it) out of the way for the shot.
    await page.evaluate(() => document.querySelectorAll('.window[data-window="map"]').forEach((item) => (item.style.visibility = "hidden")));
    await shoot(await page.$(".chat-dock"), "chat", `${slug}-gm-chat`);
    await page.evaluate(() => document.querySelectorAll('.window[data-window="map"]').forEach((item) => (item.style.visibility = "")));

    // Right-click menus: the character's token, the dice tower, a chat line.
    await step("token menu", async () => {
      if (!character) return;
      const token = await page.$(`[data-token][data-record="${character.id}"], .token[data-record="${character.id}"]`);
      if (!token) return note(`${game}: no token element to right-click`);
      await token.click({ button: "right" });
      await page.waitForSelector(".token-menu", { timeout: 3000 });
      await shoot(await page.$(".token-menu"), "token-menu", `${slug}-menu-token`);
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 300);
    });
    await step("tower menu", async () => {
      const tower = await page.$('[data-action="tower-external"]');
      if (!tower) return;
      await tower.click({ button: "right" });
      await page.waitForSelector(".tower-menu", { timeout: 3000 });
      await shoot(await page.$(".tower-menu"), "tower-menu", `${slug}-menu-tower`);
      await page.keyboard.press("Escape");
    });
    await step("chat menu", async () => {
      const line = (await page.$$(".chat-line")).pop();
      if (!line) return;
      await line.click({ button: "right", force: true, timeout: 3000 });
      await settle(400);
      const menu = await page.$('[role="menu"]:visible, .context-menu');
      if (menu) await shoot(menu, "chat-menu", `${slug}-menu-chat`);
      await page.keyboard.press("Escape");
    });

    // Every window the GM can open, one at a time.
    const listed = await tool("kraken_windows", { action: "list" }).catch(() => ({ kinds: [] }));
    const kinds = [...new Set([...(listed.kinds ?? []), "assistant", "decals", "wallpapers", "gmicons", "towers", "deathmarkers", "krits", "dice", "charselect"])].filter((kind) => !["book", "picture", "note", "sheet", "cards", "map", "images"].includes(kind));
    const extra = [];
    if (character) extra.push({ kind: "sheet", record: character.id, name: "sheet" });
    const book = ctx.shelf.find((item) => item.active) ?? ctx.shelf[0];
    if (book) extra.push({ kind: "book", record: book.id, name: "book" });
    for (const item of [...kinds.map((kind) => ({ kind, name: kind })), ...extra]) {
      await closeWindows(page);
      try {
        await tool("kraken_windows", { action: "open", kind: item.kind, record: item.record });
      } catch (error) {
        // A launcher id such as records:npc goes through as it is.
        note(`${game}: window ${item.name}: ${error.message.split("\n")[0].slice(0, 120)}`);
        continue;
      }
      await settle(1100);
      const win = await topWindow(page);
      if (!win) {
        note(`${game}: window ${item.name} did not open`);
        continue;
      }
      await shoot(win, item.name, `${slug}-gm-${slugOf(item.name)}`);
      // A sheet's other tabs.
      if (item.kind === "sheet" || item.kind === "party") {
        const tabs = await win.$$('[data-sheet-tab], [role="tab"]');
        for (const [i, tab] of tabs.entries()) {
          if (i === 0 || i > 8) continue;
          const label = slugOf((await tab.getAttribute("data-sheet-tab")) ?? (await tab.textContent()) ?? String(i));
          await tab.click({ timeout: 2000 }).catch(() => undefined);
          await settle(500);
          await shoot(win, item.name, `${slug}-gm-${slugOf(item.name)}-${label}`);
        }
      }
    }
    await closeWindows(page);

    // The player's view: sidebar, chat, and each window of theirs.
    await shoot(seat, "player", `${slug}-player-screen`);
    await shoot(await seat.$(".sidebar"), "player-sidebar", `${slug}-player-sidebar`);
    const launches = await seat.$$eval(".sidebar [data-launch]", (items) => items.map((item) => item.getAttribute("data-launch")));
    for (const launch of [...new Set(launches)]) {
      await closeWindows(seat);
      await seat.locator(`.sidebar [data-launch="${launch}"]`).first().dispatchEvent("click").catch(() => undefined);
      await settle(1000);
      const win = await topWindow(seat);
      if (!win) continue;
      await shoot(win, launch, `${slug}-player-${slugOf(launch)}`);
      if (launch === "characters") {
        const tabs = await win.$$("[data-sheet-tab]");
        for (const [i, tab] of tabs.entries()) {
          if (i === 0 || i > 8) continue;
          const label = slugOf((await tab.getAttribute("data-sheet-tab")) ?? String(i));
          await tab.click({ timeout: 2000 }).catch(() => undefined);
          await settle(500);
          await shoot(win, launch, `${slug}-player-sheet-${label}`);
        }
      }
      if (launch === "settings") {
        const dice = await seat.$('[data-setting="dice"]');
        if (dice) {
          await dice.click();
          await settle(1000);
          await shoot(await topWindow(seat), "dice", `${slug}-player-dice`);
        }
      }
    }
    await closeWindows(seat);
  } finally {
    await browser?.close().catch(() => undefined);
    child?.kill();
    await app.close().catch(() => undefined);
  }
}

for (const game of GAMES) {
  try {
    await audit(game);
  } catch (error) {
    note(`${game}: stopped: ${error.message.split("\n")[0]}`);
  }
}
const count = readdirSync(OUT).filter((file) => file.endsWith(".png")).length;
console.log(`\n${count} shots in ${OUT}${notes.length ? `\n${notes.length} notes:\n  ${notes.join("\n  ")}` : ""}`);
