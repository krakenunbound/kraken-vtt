// Before/after shots of every ruleset's character sheet, for a change that
// must not move a pixel (the core UI's steps, docs/core-ui-design.md).
//
//   node scripts/shot-sheets.mjs make  <root> [games]   a profile per game in <root>: a campaign, its books, and a
//                                                       character made by a test player with the e2e plan's wizard
//   node scripts/shot-sheets.mjs shoot <root> <out> [games]
//                                                       each profile copied and reopened: the GM full screen with the
//                                                       sheet open, every tab (full screen and the sheet alone), then
//                                                       the player in Chrome at 2560x1440, every tab of their sheet
//   node scripts/shot-sheets.mjs diff  <before> <after> [<before again>]
//                                                       the shots compared pixel by pixel (the sheet-only shots must
//                                                       match exactly; full-screen ones report the pixels that differ)
//
// Make once with one build, then shoot with the build before the change and
// again with the build after it: the same characters in both. games is a
// comma-separated list of scripts/e2e/rulesets.mjs names (default all).
// Windows open on the left monitor (KRAKEN_WINDOW_AT) and are closed at the end.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";
import { RULESETS } from "./e2e/rulesets.mjs";

const [mode, ...rest] = process.argv.slice(2);
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const slugOf = (text) => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const gamesFrom = (list) => (list ? list.split(",").map((name) => name.trim()) : Object.keys(RULESETS));
const PASSWORD = "pw";
const PLAYER = { name: "A test player", account: "test-pass-1" };

if (mode === "diff") {
  const sharp = (await import("sharp")).default;
  // A second before (the same build shot twice) shows what moves on its own (an animated portrait):
  // a shot that matches either before is the same.
  const [before, after, again] = rest;
  const files = readdirSync(after).filter((file) => file.endsWith(".png"));
  const report = [];
  let bad = 0;
  const pixels = (dir, file) => sharp(path.join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const compare = (a, b) => {
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) return -1;
    let count = 0;
    for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) count += 1;
    return count;
  };
  for (const file of files) {
    if (!existsSync(path.join(before, file))) {
      report.push(`only after: ${file}`);
      continue;
    }
    const b = await pixels(after, file);
    let differ = compare(await pixels(before, file), b);
    if (differ !== 0 && again && existsSync(path.join(again, file))) {
      const other = compare(await pixels(again, file), b);
      if (other === 0 || (other > 0 && (differ < 0 || other < differ))) differ = other;
    }
    const strict = file.includes("-sheet-");
    const line = `${differ === 0 ? "same" : strict ? "DIFF" : "diff"} ${file}${differ === -1 ? " (another size)" : differ ? ` (${differ} pixels)` : ""}`;
    if (differ && strict) bad += 1;
    report.push(line);
  }
  for (const file of readdirSync(before).filter((item) => item.endsWith(".png") && !files.includes(item))) report.push(`only before: ${file}`);
  writeFileSync(path.join(after, "diff.txt"), report.join("\n"));
  console.log(report.join("\n"));
  console.log(`\n${files.length} shots, ${bad} sheet shot(s) differ`);
  process.exit(bad ? 1 : 0);
}

if (mode !== "make" && mode !== "shoot") {
  console.log("node scripts/shot-sheets.mjs make <root> [games] | shoot <root> <out> [games] | diff <before> <after>");
  process.exit(2);
}
const root = rest[0];
const out = mode === "shoot" ? rest[1] : null;
const games = gamesFrom(mode === "shoot" ? rest[2] : rest[1]);
mkdirSync(root, { recursive: true });
if (out) mkdirSync(out, { recursive: true });
const notes = [];
const note = (text) => (notes.push(text), console.log(`  note: ${text}`));

async function launch(profile, plan) {
  const env = { ...process.env, KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", ...(plan.shipped ? { KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Kraken VTT", "Packs") } : {}) };
  if (plan.shipped) for (const dir of [env.KRAKEN_BOOKS, env.KRAKEN_PACKS]) mkdirSync(dir, { recursive: true });
  const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  const page = await app.firstWindow();
  await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setFullScreen(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
  const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
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
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
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
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shot-sheets", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  return { app, page, child, tool };
}

async function join(browser, port) {
  const seat = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.waitForLoadState("networkidle").catch(() => undefined);
  for (const [field, value] of [["name", PLAYER.name], ["account-password", PLAYER.account], ["password", PASSWORD]]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await seat.fill(`input[name="${field}"]`, value);
      if ((await seat.inputValue(`input[name="${field}"]`)) === value) break;
      await settle(300);
    }
  }
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await settle(800);
  return seat;
}

async function make(game) {
  const plan = RULESETS[game];
  const profile = path.join(root, slugOf(game));
  if (existsSync(path.join(profile, "made.json"))) return console.log(`${game}: made already`);
  mkdirSync(profile, { recursive: true });
  const port = 47800 + Math.floor(Math.random() * 150);
  const { app, page, child, tool } = await launch(profile, plan);
  let browser = null;
  try {
    if (!(await page.$('[data-action="new-campaign"]'))) await page.click('[data-action="campaigns-mode"]').catch(() => undefined);
    await page.click('[data-action="new-campaign"]');
    await page.fill('[aria-label="New campaign name"]', `Sheets ${game}`);
    await page.click(`[data-ruleset="${plan.ruleset ?? game}"]`);
    await page.click('[data-action="create"]');
    await page.waitForSelector('[data-action="play"]', { timeout: 15000 });
    await page.fill('input[name="port"]', String(port));
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('[data-action="play"]');
    await page.waitForSelector("text=Hosting", { timeout: 30000 });
    const listed = await tool("kraken_books", { action: "list" });
    const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
    for (const title of plan.books ?? []) {
      const book = shelf.find((item) => item.title === title || item.name === title);
      if (!book) note(`${game}: no ${title} on the shelf`);
      else if (!book.active) await tool("kraken_books", { action: "activate", book: book.id }).catch((error) => note(`${game}: ${title}: ${error.message}`));
    }
    await settle(1500);
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
    const seat = await join(browser, port);
    const ctx = { ruleset: game, plan, page, seat, tool, port, shelf, problem: (what, detail) => note(`${game}: ${what} ${detail ?? ""}`), check: (ok, what, detail) => (ok || note(`${game}: not so: ${what} ${String(detail ?? "").slice(0, 200)}`), Boolean(ok)) };
    await seat.click('.sidebar [data-launch="characters"]');
    await seat.waitForSelector('[data-action="new-character"]', { timeout: 15000 });
    await seat.click('[data-action="new-character"]');
    await plan.wizard(ctx);
    const all = await tool("kraken_records_list", { type: "character" });
    const mine = (Array.isArray(all) ? all : all.records ?? []).filter((item) => item.owner === PLAYER.name);
    if (!mine.length) throw new Error("the wizard made no character");
    await tool("kraken_leave");
    await settle(1000);
    writeFileSync(path.join(profile, "made.json"), JSON.stringify({ game, character: mine[mine.length - 1].id, name: mine[mine.length - 1].name }));
    console.log(`${game}: made ${mine[mine.length - 1].name}`);
  } finally {
    await browser?.close().catch(() => undefined);
    child.kill();
    await app.close().catch(() => undefined);
  }
}

async function shoot(game) {
  const plan = RULESETS[game];
  const made = path.join(root, slugOf(game), "made.json");
  if (!existsSync(made)) return note(`${game}: not made`);
  const { character } = JSON.parse(readFileSync(made, "utf8"));
  const slug = slugOf(game.replace(/\s*\(SRD\)/, "-srd"));
  // A copy, so every shoot starts from the same saved table.
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-sheets-"));
  cpSync(path.join(root, slugOf(game)), profile, { recursive: true });
  const port = 47800 + Math.floor(Math.random() * 150);
  const { app, page, child, tool } = await launch(profile, plan);
  let browser = null;
  const shot = (where, file) => where.screenshot({ path: path.join(out, `${file}.png`), animations: "disabled", caret: "hide", timeout: 10000 }).catch((error) => note(`${file}: ${error.message.split("\n")[0]}`));
  try {
    const campaigns = await tool("kraken_campaigns");
    const campaign = (Array.isArray(campaigns) ? campaigns : campaigns.campaigns ?? [])[0];
    await tool("kraken_host", { campaignId: campaign.id, port, password: PASSWORD });
    await page.waitForSelector("text=Hosting", { timeout: 30000 });
    await settle(2500);
    const tabsOf = (where) => where.$$eval(".cc-sheet [data-sheet-tab]", (items) => items.map((item) => item.getAttribute("data-sheet-tab")));
    const everyTab = async (where, who, frame) => {
      await where.waitForSelector(".cc-sheet", { timeout: 20000 });
      for (const tab of await tabsOf(where)) {
        await where.click(`.cc-sheet [data-sheet-tab="${tab}"]`);
        await where.mouse.move(2, 2);
        await settle(700);
        await shot(where, `${slug}-${who}-screen-${tab}`);
        const sheet = await where.$(frame);
        if (sheet) await shot(sheet, `${slug}-${who}-sheet-${tab}`);
      }
    };
    // The GM: the sheet in its window, on the GM's full screen.
    await tool("kraken_windows", { action: "open", kind: "sheet", record: character });
    await everyTab(page, "gm", ".cc-sheet");
    // The player, in Chrome: their characters window.
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
    const seat = await join(browser, port);
    await seat.click('.sidebar [data-launch="characters"]');
    await everyTab(seat, "player", ".cc-sheet");
    console.log(`${game}: shot`);
  } finally {
    await browser?.close().catch(() => undefined);
    child.kill();
    await app.close().catch(() => undefined);
  }
}

for (const game of games) {
  if (!RULESETS[game]) {
    note(`${game}: no plan in scripts/e2e/rulesets.mjs`);
    continue;
  }
  try {
    await (mode === "make" ? make(game) : shoot(game));
  } catch (error) {
    note(`${game}: stopped: ${error.message.split("\n")[0]}`);
  }
}
if (out) console.log(`\n${readdirSync(out).filter((file) => file.endsWith(".png")).length} shots in ${out}`);
if (notes.length) console.log(`${notes.length} notes:\n  ${notes.join("\n  ")}`);
