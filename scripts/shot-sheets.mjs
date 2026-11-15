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
//   node scripts/shot-sheets.mjs wizard  <root> <out> [games]
//                                                       the character wizard, GM and player, the e2e plan's steps,
//                                                       a shot and the controls' signature after every action
//   node scripts/shot-sheets.mjs tracker <root> <out> [games]
//                                                       the combat tracker, GM and player: a fight, a PC dying, a
//                                                       cleric's turn; every ruleset button pressed and its chat line
//
//   node scripts/shot-sheets.mjs flow  <root> <out> [games]
//                                                       the way to a sheet, full screen, GM and player: the table,
//                                                       the sidebar's Characters, then a card in Character Selection
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
    const strict = file.includes("-sheet-") || (/-(wizard|tracker)-/.test(file) && !file.includes("-screen"));
    const line = `${differ === 0 ? "same" : strict ? "DIFF" : "diff"} ${file}${differ === -1 ? " (another size)" : differ ? ` (${differ} pixels)` : ""}`;
    if (differ && strict) bad += 1;
    report.push(line);
  }
  for (const file of readdirSync(before).filter((item) => item.endsWith(".png") && !files.includes(item))) report.push(`only before: ${file}`);
  // The controls' signatures and what the tracker's buttons posted: the same text, or a DIFF.
  for (const file of readdirSync(after).filter((item) => item.endsWith(".json"))) {
    if (!existsSync(path.join(before, file))) {
      report.push(`only after: ${file}`);
      continue;
    }
    const same = readFileSync(path.join(before, file), "utf8") === readFileSync(path.join(after, file), "utf8");
    if (!same) bad += 1;
    report.push(`${same ? "same" : "DIFF"} ${file}`);
  }
  writeFileSync(path.join(after, "diff.txt"), report.join("\n"));
  console.log(report.join("\n"));
  console.log(`\n${files.length} shots, ${bad} strict shot(s) or signature(s) differ`);
  process.exit(bad ? 1 : 0);
}

if (!["make", "shoot", "flow", "wizard", "tracker"].includes(mode)) {
  console.log("node scripts/shot-sheets.mjs make <root> [games] | shoot|flow|wizard|tracker <root> <out> [games] | diff <before> <after> [<before again>]");
  process.exit(2);
}
const root = rest[0];
const out = mode === "make" ? null : rest[1];
const games = gamesFrom(mode === "make" ? rest[1] : rest[2]);
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
    // Characters: their sheet (an older build), or Character Selection, where their card opens it (FG's way).
    await seat.click('.sidebar [data-launch="characters"]');
    await seat.waitForSelector(".cc-sheet, .charselect-card.mine", { timeout: 20000 });
    if (await seat.$(".charselect-card.mine")) await seat.click(".charselect-card.mine");
    await everyTab(seat, "player", ".cc-sheet");
    console.log(`${game}: shot`);
  } finally {
    await browser?.close().catch(() => undefined);
    child.kill();
    await app.close().catch(() => undefined);
  }
}

// The way to a sheet, full screen, for the GM and the player: the table, then the sidebar's
// Characters, then (where Characters is Character Selection) a card, which opens the sheet.
async function flow(game) {
  const plan = RULESETS[game];
  if (!existsSync(path.join(root, slugOf(game), "made.json"))) return note(`${game}: not made`);
  const slug = slugOf(game.replace(/\s*\(SRD\)/, "-srd"));
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-sheets-"));
  cpSync(path.join(root, slugOf(game)), profile, { recursive: true });
  const port = 47800 + Math.floor(Math.random() * 150);
  const { app, page, child, tool } = await launch(profile, plan);
  let browser = null;
  const shot = async (where, file) => {
    await where.mouse.move(2, 2);
    await settle(900);
    await where.screenshot({ path: path.join(out, `${slug}-${file}.png`), animations: "disabled", caret: "hide" }).catch((error) => note(`${file}: ${error.message.split("\n")[0]}`));
  };
  const walk = async (where, who, card) => {
    await shot(where, `${who}-flow-1-table`);
    await where.click('.sidebar [data-launch="characters"]');
    await settle(800);
    await shot(where, `${who}-flow-2-characters`);
    if (await where.$(card)) {
      await where.click(card);
      await where.waitForSelector(".cc-sheet", { timeout: 15000 });
      await shot(where, `${who}-flow-3-sheet`);
    }
  };
  try {
    const campaigns = await tool("kraken_campaigns");
    await tool("kraken_host", { campaignId: (Array.isArray(campaigns) ? campaigns : campaigns.campaigns ?? [])[0].id, port, password: PASSWORD });
    await page.waitForSelector("text=Hosting", { timeout: 30000 });
    await settle(2500);
    await walk(page, "gm", ".charselect-card");
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
    const seat = await join(browser, port);
    // (A player's Character Selection opens by itself only when they have no character; this one has one.)
    await walk(seat, "player", ".charselect-card.mine");
    console.log(`${game}: flow shot`);
  } finally {
    await browser?.close().catch(() => undefined);
    child.kill();
    await app.close().catch(() => undefined);
  }
}

// Every control and text in a window, for a diff that sees what a picture does not (titles, aria-labels, disabled).
const signatureOf = (where, root) =>
  where
    .$$eval(`${root} *`, (items) =>
      items
        .filter((item) => /^(BUTTON|SELECT|INPUT|LABEL|H\d|P|B|SPAN|LI|OPTION)$/.test(item.tagName) || [...item.attributes].some((attr) => attr.name.startsWith("data-")))
        .map((item) => {
          const attrs = Object.fromEntries([...item.attributes].filter((attr) => attr.name !== "style" && attr.name !== "id" && attr.name !== "for").map((attr) => [attr.name, attr.value]));
          const own = [...item.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("|");
          return { tag: item.tagName, attrs, text: own, ...(item.disabled !== undefined ? { disabled: item.disabled } : {}), ...(item.value !== undefined && item.tagName !== "LI" ? { value: item.value } : {}), ...(item.checked !== undefined ? { checked: item.checked } : {}) };
        }),
    )
    .catch(() => []);

// The character wizard, step by step, for the GM (Kraken full screen) and the player (Chrome at 2560x1440):
// the e2e plan's own wizard is run, with a shot of the wizard, the whole screen and the wizard's controls
// after every click, choice and typing. Each seat starts from its own copy of the made profile, so the dice
// (saved with the campaign) fall the same for a build before and after a change.
async function wizardShots(game) {
  const plan = RULESETS[game];
  if (!existsSync(path.join(root, slugOf(game), "made.json"))) return note(`${game}: not made`);
  const slug = slugOf(game.replace(/\s*\(SRD\)/, "-srd"));
  for (const who of ["gm", "player"]) {
    const profile = mkdtempSync(path.join(tmpdir(), "kraken-sheets-"));
    cpSync(path.join(root, slugOf(game)), profile, { recursive: true });
    const port = 47800 + Math.floor(Math.random() * 150);
    const { app, page, child, tool } = await launch(profile, plan);
    let browser = null;
    let step = 0;
    try {
      const campaigns = await tool("kraken_campaigns");
      await tool("kraken_host", { campaignId: (Array.isArray(campaigns) ? campaigns : campaigns.campaigns ?? [])[0].id, port, password: PASSWORD });
      await page.waitForSelector("text=Hosting", { timeout: 30000 });
      await settle(2500);
      let where = page;
      if (who === "player") {
        browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
        where = await join(browser, port);
      }
      await diceOff(where);
      const snap = async () => {
        step += 1;
        const name = `${slug}-${who}-wizard-${String(step).padStart(2, "0")}`;
        await where.mouse.move(2, 2);
        await settle(900);
        const box = await where.$("[data-wizard]");
        if (box) await box.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled", caret: "hide", timeout: 10000 }).catch((error) => note(`${name}: ${error.message.split("\n")[0]}`));
        await where.screenshot({ path: path.join(out, `${name}-screen.png`), animations: "disabled", caret: "hide", timeout: 10000 }).catch((error) => note(`${name}: ${error.message.split("\n")[0]}`));
        writeFileSync(path.join(out, `${name}.json`), JSON.stringify(await signatureOf(where, "[data-wizard]"), null, 1));
      };
      const ACTS = new Set(["click", "selectOption", "fill", "check", "uncheck"]);
      const wrapLocator = (locator) =>
        new Proxy(locator, {
          get(target, key) {
            const value = target[key];
            if (typeof value !== "function") return value;
            if (ACTS.has(key)) return async (...args) => {
              const result = await value.apply(target, args);
              await snap();
              return result;
            };
            if (["first", "last", "nth", "locator", "getByLabel", "getByRole", "getByText", "filter"].includes(key)) return (...args) => wrapLocator(value.apply(target, args));
            return value.bind(target);
          },
        });
      const seat = new Proxy(where, {
        get(target, key) {
          const value = target[key];
          if (typeof value !== "function") return value;
          if (ACTS.has(key)) return async (...args) => {
            const result = await value.apply(target, args);
            await snap();
            return result;
          };
          if (["locator", "getByLabel", "getByRole", "getByText"].includes(key)) return (...args) => wrapLocator(value.apply(target, args));
          return value.bind(target);
        },
      });
      const ctx = { ruleset: game, plan, page, seat, tool, port, problem: (what, detail) => note(`${game}: ${what} ${detail ?? ""}`), check: (ok, what, detail) => (ok || note(`${game}: not so: ${what} ${String(detail ?? "").slice(0, 200)}`), Boolean(ok)) };
      await where.click('.sidebar [data-launch="characters"]');
      await where.waitForSelector('[data-action="new-character"]', { timeout: 15000 });
      await where.click('[data-action="new-character"]');
      await where.waitForSelector("[data-wizard]", { timeout: 20000 });
      await snap();
      await plan.wizard(ctx);
      console.log(`${game}: wizard shot (${who}, ${step} steps)`);
    } catch (error) {
      note(`${game} (${who}): wizard stopped at step ${step}: ${error.message.split("\n")[0]}`);
    } finally {
      await browser?.close().catch(() => undefined);
      child.kill();
      await app.close().catch(() => undefined);
    }
  }
}

// A Cleric for the games whose tracker offers Turn undead on the cleric's own turn.
const CLERICS = {
  "Basic Fantasy": { name: "Brother Test", race: "Human", class: "Cleric", abilities: { strength: 12, intelligence: 10, wisdom: 15, dexterity: 11, constitution: 13, charisma: 10 }, hpRoll: 5, gold: 60, alignment: "Lawful" },
  "AD&D 2E": { name: "Brother Test", race: "Human", class: "Cleric", level: 3, scores: { strength: 12, dexterity: 11, constitution: 13, intelligence: 10, wisdom: 16, charisma: 10 }, alignment: "Lawful Good" },
};
// The combat tracker, GM and player, in the states its ruleset's buttons need: the party and an enemy in a
// started fight; then the player's character dying and (where there is one) a cleric's turn. Then the GM
// presses every ruleset button the tracker shows, and what each did (the chat line it posted) is written down.
async function trackerShots(game) {
  const plan = RULESETS[game];
  const made = path.join(root, slugOf(game), "made.json");
  if (!existsSync(made)) return note(`${game}: not made`);
  const { character } = JSON.parse(readFileSync(made, "utf8"));
  const slug = slugOf(game.replace(/\s*\(SRD\)/, "-srd"));
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-sheets-"));
  cpSync(path.join(root, slugOf(game)), profile, { recursive: true });
  const port = 47800 + Math.floor(Math.random() * 150);
  const { app, page, child, tool } = await launch(profile, plan);
  let browser = null;
  const record = [];
  const shoot = async (where, who, stage) => {
    const name = `${slug}-${who}-tracker-${stage}`;
    await where.mouse.move(2, 2);
    await settle(1200);
    const box = await where.$(".combat-tracker, .score-panel");
    if (box) await box.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled", caret: "hide", timeout: 10000 }).catch((error) => note(`${name}: ${error.message.split("\n")[0]}`));
    await where.screenshot({ path: path.join(out, `${name}-screen.png`), animations: "disabled", caret: "hide", timeout: 10000 }).catch((error) => note(`${name}: ${error.message.split("\n")[0]}`));
    writeFileSync(path.join(out, `${name}.json`), JSON.stringify(await signatureOf(where, ".combat-tracker, .score-panel"), null, 1));
  };
  const view = async () => {
    const got = await tool("kraken_combat", { action: "view" });
    return got.entries ?? got.combat?.entries ?? [];
  };
  try {
    const campaigns = await tool("kraken_campaigns");
    await tool("kraken_host", { campaignId: (Array.isArray(campaigns) ? campaigns : campaigns.campaigns ?? [])[0].id, port, password: PASSWORD });
    await page.waitForSelector("text=Hosting", { timeout: 30000 });
    await settle(2500);
    const listed = await tool("kraken_books", { action: "list" });
    const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
    const ctx = { ruleset: game, plan, page, tool, port, shelf, problem: (what, detail) => note(`${game}: ${what} ${detail ?? ""}`), check: (ok) => Boolean(ok) };
    await diceOff(page);
    let cleric = null;
    if (CLERICS[game]) {
      const built = await tool("kraken_build_character", { spec: CLERICS[game], owner: PLAYER.name }).catch((error) => note(`${game}: cleric: ${error.message}`));
      cleric = built?.id ?? built?.record?.id ?? null;
    }
    await page.click('.sidebar [data-launch="combat"]');
    await page.waitForSelector(".combat-tracker, .score-panel", { timeout: 15000 });
    if (await page.$(".combat-tracker")) {
      await tool("kraken_combat", { action: "add", recordId: character });
      if (cleric) await tool("kraken_combat", { action: "add", recordId: cleric });
      if (plan.enemy) await plan.enemy(ctx).catch((error) => note(`${game}: enemy: ${error.message.split("\n")[0]}`));
      await tool("kraken_combat", { action: "init", which: "all" }).catch((error) => note(`${game}: init: ${error.message}`));
      await tool("kraken_combat", { action: "next" }).catch((error) => note(`${game}: start: ${error.message}`));
    }
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
    const seat = await join(browser, port);
    await diceOff(seat);
    await openSide(seat, "combat");
    await seat.waitForSelector(".combat-tracker, .score-panel", { timeout: 15000 });
    await shoot(page, "gm", "1-fight");
    await shoot(seat, "player", "1-fight");
    if (await page.$(".combat-tracker")) {
      // The player's character dying (Cairn: Critical Damage, as its STR save would leave it).
      const pc = (await view()).find((entry) => entry.recordId === character);
      if (pc && game === "Cairn") await tool("kraken_record_update", { id: character, data: { critical: "dying" } }).catch((error) => note(`${game}: dying: ${error.message}`));
      else if (pc) {
        for (let hit = 0; hit < 40; hit++) {
          const now = (await view()).find((entry) => entry.id === pc.id);
          const status = now?.health?.status ?? now?.status;
          if (["Dying", "Down", "Dead", "Unconscious", "Taken Out"].includes(status) || !now) break;
          await tool("kraken_combat", { action: "damage", id: pc.id, amount: 1 }).catch(() => undefined);
        }
        const status = (await view()).find((entry) => entry.id === pc.id);
        record.push({ dying: status?.health?.status ?? status?.status ?? "?" });
      }
      const priest = cleric ? (await view()).find((entry) => entry.recordId === cleric) : null;
      if (priest) await tool("kraken_combat", { action: "set-turn", id: priest.id }).catch((error) => note(`${game}: cleric's turn: ${error.message}`));
      await shoot(page, "gm", "2-dying");
      await shoot(seat, "player", "2-dying");
      // Every ruleset button on the GM's tracker, pressed once: what it posted.
      for (const selector of ['[data-action="stabilize"]', '[data-action="death-save"]', '[data-action="turn-undead"]', '[data-action="morale"]', '[data-action="morale-foes"]', '[data-action="npc-attack"]', '[data-mode="impaired"]', '[data-mode="enhanced"]', '[data-full-attack="all"]', '[data-action="init-all"]']) {
        const button = await page.$(`.combat-tracker ${selector}:not([disabled])`);
        if (!button) continue;
        const before = (await tool("kraken_chat_log", { count: 400 })).length ?? 0;
        await button.evaluate((item) => item.click());
        await settle(1500);
        const lines = await tool("kraken_chat_log", { count: 400 });
        const posted = (Array.isArray(lines) ? lines.slice(before) : []).map((line) => `${line.text ?? ""} ${line.roll?.label ?? ""}`.replace(/\d+/g, "#").trim());
        record.push({ pressed: selector, posted });
      }
      // The player's own initiative button.
      const own = await seat.$(".combat-tracker .ct-tools button");
      if (own) record.push({ player: await own.textContent(), title: await own.getAttribute("title") });
      await shoot(page, "gm", "3-pressed");
    }
    writeFileSync(path.join(out, `${slug}-tracker-presses.json`), JSON.stringify(record, null, 1));
    console.log(`${game}: tracker shot`);
  } finally {
    await browser?.close().catch(() => undefined);
    child.kill();
    await app.close().catch(() => undefined);
  }
}
// The 3D dice off on this screen (/dice3d off), so a die rolling across the window is not in the shots.
async function diceOff(where) {
  const box = await where.$('input[aria-label="Message"]');
  if (!box) return note("no chat box for /dice3d off");
  await box.fill("/dice3d off");
  await box.press("Enter");
  await settle(500);
}
async function openSide(where, launch) {
  if (await where.$(`.sidebar [data-launch="${launch}"].open`)) return;
  await where.click(`.sidebar [data-launch="${launch}"]`);
}

for (const game of games) {
  if (!RULESETS[game]) {
    note(`${game}: no plan in scripts/e2e/rulesets.mjs`);
    continue;
  }
  try {
    await (mode === "make" ? make(game) : mode === "flow" ? flow(game) : mode === "wizard" ? wizardShots(game) : mode === "tracker" ? trackerShots(game) : shoot(game));
  } catch (error) {
    note(`${game}: stopped: ${error.message.split("\n")[0]}`);
  }
}
if (out) console.log(`\n${readdirSync(out).filter((file) => file.endsWith(".png")).length} shots in ${out}`);
if (notes.length) console.log(`${notes.length} notes:\n  ${notes.join("\n  ")}`);
