// Two tiers of a person's own settings, both kept by the GM's app. The user
// tier: a test player's colour (their pings and ink on the map) and their
// own dice; the character tier: their character's own dice, kept on the
// character, which every roll made as that character uses. A test player in
// Chrome sits as Ann with a password, picks a red colour, gives her rogue the
// Wizard set and herself Frost Glass; her ping reaches the GM in red; a roll as
// the rogue comes in Wizard dice, one as herself in Frost Glass. All of it is
// still so after a reload, after signing in from another browser (nothing in
// its storage), and after the GM's app is closed and opened again.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const bundle = process.env.KRAKEN_BUNDLE ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Keep on the Borderlands (Foundry).zip`;
const profile = mkdtempSync(path.join(tmpdir(), "kraken-prefs-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const port = 47433;
const url = `http://127.0.0.1:${port}/`;
const RED = "#ff5a5a";
const WIZARD = "#142044";
const FROST = "#9fd8ff";

let app = null;
let page = null;
let child = null;
let rpc = null;
async function start() {
  app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  page = await app.firstWindow();
  await page.waitForSelector("text=My Campaigns");
  child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
  const answers = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    answers.get(message.id)?.(message);
  });
  let nextId = 0;
  rpc = (method, params) => {
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
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
}
async function stop() {
  child?.kill();
  await app?.close();
}
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}
const failures = [];

// Ann at a browser: signs in (with her password if this browser has no sign-in kept), opens the Dice window.
async function sit(context, password) {
  const seat = await context.newPage();
  seat.on("pageerror", (error) => failures.push(`ann: ${error.message}`));
  await seat.goto(url);
  if (await seat.$('input[name="account-password"]')) {
    await seat.fill('input[name="name"]', "Ann");
    await seat.fill('input[name="account-password"]', password);
  }
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  return seat;
}
async function openDice(seat) {
  if (!(await seat.$(".dice-window"))) {
    await seat.fill('input[aria-label="Message"]', "/dice");
    await seat.press('input[aria-label="Message"]', "Enter");
  }
  await seat.waitForSelector(".dice-window");
}
// What Ann's screen shows: her colour, her own dice, her rogue's.
async function shown(seat, rogueId) {
  await openDice(seat);
  await seat.click('[data-dice-whose="mine"]');
  const mine = await seat.getAttribute('.dice-window [data-active-set]', "data-active-set");
  const color = await seat.getAttribute('.your-colour [role="radio"][aria-checked="true"]', "data-ping-color");
  await seat.click(`[data-dice-whose="${rogueId}"]`);
  await seat.waitForFunction(() => /Rogue's dice/.test(document.querySelector(".dice-window .active-set h3")?.textContent ?? ""));
  const rogue = await seat.getAttribute('.dice-window [data-active-set]', "data-active-set");
  await seat.click('[data-dice-whose="mine"]');
  return { mine, color, rogue };
}
// A roll in chat as someone (the Speak as list), and the dice it came in.
async function rollAs(seat, who, label) {
  await seat.selectOption('select[aria-label="Speak as"]', who === "Ann" ? "" : who);
  await seat.fill('input[aria-label="Message"]', `/r 1d20 ${label}`);
  await seat.press('input[aria-label="Message"]', "Enter");
  const line = page.locator(`.chat-line[data-kind="roll"]:has-text("${label}")`).last();
  await line.waitFor({ timeout: 15000 });
  return line.getAttribute("data-dice-body");
}

let browser = null;
try {
  await start();
  page.on("pageerror", (error) => failures.push(error.message));
  const campaign = await tool("kraken_campaign_create", { name: "Prefs UI", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const withMap = existsSync(bundle);
  if (withMap) {
    await tool("kraken_open_adventure", { path: bundle });
    await page.waitForSelector(".map-toolbar", { timeout: 60000 });
  }
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const laptop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  let ann = await sit(laptop, "secret1");
  const rogue = await tool("kraken_record_create", { type: "character", name: "Ann's Rogue", owner: "Ann", visibility: "owner", data: { level: 1 } });

  // Her colour, her own dice, her rogue's dice.
  await openDice(ann);
  await ann.click(`.your-colour [data-ping-color="${RED}"]`);
  await ann.waitForSelector(`[data-dice-whose="${rogue.id}"]`, { timeout: 10000 });
  await ann.click('[data-dice-whose="mine"]');
  await ann.click('.dice-window [aria-label="Groups"] >> text=All');
  await ann.click('.dice-window [data-preset="Frost Glass"]');
  await ann.click(`[data-dice-whose="${rogue.id}"]`);
  await ann.click('.dice-window [data-dice-follow]');
  await ann.click('.dice-window [aria-label="Groups"] >> text=All');
  await ann.click('.dice-window [data-preset="Wizard"]');
  await ann.waitForFunction(() => document.querySelector(".dice-window [data-active-set]")?.getAttribute("data-active-set") === "Wizard", null, { timeout: 10000 });
  const kept = (await tool("kraken_record_get", { id: rogue.id })).data?.dice?.look;
  assert(kept?.body === WIZARD, `the rogue keeps the Wizard set on its record: ${JSON.stringify(kept)}`);
  const want = { mine: "Frost Glass", color: RED, rogue: "Wizard" };
  const same = (got, when) => assert(JSON.stringify(got) === JSON.stringify(want), `${when}: ${JSON.stringify(got)}`);
  same(await shown(ann, rogue.id), "as set");

  // The rolls: as the rogue in Wizard dice, as herself in Frost Glass.
  assert((await rollAs(ann, "Ann's Rogue", "Sneak")) === WIZARD, "a roll as the rogue comes in the rogue's dice");
  assert((await rollAs(ann, "Ann", "Luck")) === FROST, "a roll as herself comes in her own dice");

  // Her ping, in her colour, on the GM's map.
  if (withMap) {
    await ann.click('[aria-label="Close Dice"]');
    // The other windows sit over the map's window; Character Selection (shown on joining) goes first.
    if (await ann.$('[aria-label="Close Character Selection"]')) await ann.click('[aria-label="Close Character Selection"]');
    await ann.click('[data-tool="ping"]');
    const view = await ann.locator(".viewport").boundingBox();
    await ann.mouse.click(view.x + view.width - 250, view.y + view.height - 160);
    const ping = page.locator('.ping[data-ping-from="Ann"]');
    await ping.waitFor({ timeout: 8000 });
    const color = await ping.evaluate((element) => element.style.getPropertyValue("--ping"));
    assert(color === RED, `the GM sees Ann's ping in her colour: ${color}`);
    await page.screenshot({ path: path.join(tmpdir(), "kraken-ping.png") });
  }

  // A reload.
  await ann.reload();
  await ann.click('button[type="submit"]');
  await ann.waitForSelector(".sidebar", { timeout: 20000 });
  same(await shown(ann, rogue.id), "after a reload");

  // Another browser: nothing in its storage; her password.
  await ann.close();
  const desktop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  ann = await sit(desktop, "secret1");
  same(await shown(ann, rogue.id), "signed in at another browser");
  assert((await rollAs(ann, "Ann's Rogue", "Climb")) === WIZARD, "at another browser, the rogue still rolls Wizard dice");
  await ann.close();

  // The GM's app closed and opened again.
  await browser.close();
  browser = null;
  await stop();
  await start();
  page.on("pageerror", (error) => failures.push(error.message));
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const fresh = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  ann = await sit(fresh, "secret1");
  same(await shown(ann, rogue.id), "after the GM's app restarted");
  assert((await rollAs(ann, "Ann's Rogue", "Hide")) === WIZARD, "after a restart, the rogue still rolls Wizard dice");
  assert((await rollAs(ann, "Ann", "Fate")) === FROST, "after a restart, Ann still rolls Frost Glass");

  // The agent: the rogue back to her dice, the GM's colour, Ann's colour.
  const back = await tool("kraken_dice_settings", { character: "Ann's Rogue", same: true });
  assert(!back.dice?.look, `the rogue follows Ann's dice again: ${JSON.stringify(back)}`);
  const given = await tool("kraken_dice_settings", { character: "Ann's Rogue", preset: "Bard" });
  assert(given.dice?.look?.theme === "bard", `the agent gives the rogue the Bard set: ${JSON.stringify(given)}`);
  await tool("kraken_dice_settings", { color: "#5aa9ff" });
  await tool("kraken_dice_settings", { who: "Ann", color: "#6ee7a0" });
  await ann.waitForSelector('.your-colour [data-ping-color="#6ee7a0"][aria-checked="true"]', { timeout: 10000 });
  const file = JSON.parse(readFileSync(path.join(profile, "prefs.json"), "utf8"));
  assert(file.people["@gm"]?.color === "#5aa9ff" && file.people.ann?.color === "#6ee7a0", `kept in prefs.json: ${JSON.stringify(file.people)}`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(
    `ok prefs ui: a test player's colour (${RED}) and own dice (Frost Glass, the user tier) and her rogue's (Wizard, the character tier, on its record); a roll as the rogue in its dice, as herself in hers;${withMap ? " her ping reaches the GM in her colour;" : ""} all kept after a reload, at another browser and after the GM's app restarted; kraken_dice_settings sets a character's dice, the GM's colour and a player's. ${withMap ? path.join(tmpdir(), "kraken-ping.png") : ""}`,
  );
} finally {
  await browser?.close();
  await stop();
}
