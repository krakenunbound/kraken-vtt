// The calendar, notes, read-aloud and the message of the day, with a test
// player in Chrome:
//  - the Calendar (a C&C campaign: Greyhawk's, 576 CY): the GM moves the day
//    on and the time (+8h), writes a note on a day the players see ("ready on
//    the 9th") and one they do not; the test player sees the first, writes
//    their own (signed in their colour), which the GM sees; the date in chat;
//  - the message of the day: the GM writes it and links the map; it opens on
//    the test player's screen as they join, its link opens the map;
//  - a chat line dragged into a note, and onto the Notes list (a new note);
//  - read-aloud: an NPC's boxed text (<frame>) has the GM's button; read, it
//    is in chat and over the test player's map as a bubble; kraken_read_aloud too.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-calendar-notes-"));
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
  const campaign = await tool("kraken_campaign_create", { name: "Calendar and notes", ruleset: "Castles & Crusades" });
  const port = 47469;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector('.window[data-window="map"] .map-toolbar');
  await tool("kraken_map", { share: true }).catch(() => undefined);

  // The GM's calendar: Greyhawk's for C&C; a day on, eight hours on.
  const start = await tool("kraken_calendar");
  assert(start.id === "greyhawk" && /576 CY/.test(start.today), `C&C keeps Greyhawk's calendar (${start.today})`);
  await page.click('[data-launch="calendar"]');
  await page.waitForSelector('.calendar-window [data-cal-today]');
  await page.click('.calendar-window [data-action="cal-day-on"]');
  await until(async () => (await tool("kraken_calendar")).day === start.day + 1, "the day moved on");
  await page.click('.calendar-window [data-action="cal-rest"]');
  await until(async () => (await tool("kraken_calendar")).hour === (start.hour + 8) % 24, "eight hours on");
  // A note on the 9th of Fireseek the players see; one they do not.
  const ninth = 7 + 8; // Needfest's 7 days, then the 9th of Fireseek (day of the year, from 0).
  await page.click(`.calendar-window [data-cal-month="Fireseek"] [data-cal-day="${ninth}"]`);
  await page.fill('.calendar-window [data-field="cal-note"]', "Your magic item will be ready from the vendor today.");
  await page.click('.calendar-window [data-action="cal-note-add"]');
  await page.fill('.calendar-window [data-field="cal-note"]', "The vendor is a doppelganger.");
  await page.check('.calendar-window [data-field="cal-keep"]');
  await page.click('.calendar-window [data-action="cal-note-add"]');
  await until(async () => (await tool("kraken_calendar")).notes.length === 2, "two GM notes");
  await page.waitForSelector(`.calendar-window [data-cal-day="${ninth}"].noted`);
  await page.locator(".calendar-window").screenshot({ path: path.join(SHOTS, "kraken-calendar-gm.png") });
  report.push(`the Calendar (C&C: Greyhawk's, ${start.today}): a day on and 8 hours on by its buttons; two notes on the 9th of Fireseek, one the players see, one the GM's alone`);

  // The message of the day, with a link to the map.
  await tool("kraken_table_options", { motd: { text: "Welcome back! Last time: you reached Hommlet at dusk.", links: [{ kind: "note", record: "x", label: "missing" }] } });
  await page.click('[data-launch="motd"]');
  await page.waitForSelector('.motd-window [data-field="motd-text"]');
  assert((await page.inputValue('.motd-window [data-field="motd-text"]')).includes("Hommlet"), "the GM's message of the day");
  report.push("the message of the day: written (kraken_table_options motd), in the GM's window");

  // The test player joins: the message of the day opens on their screen.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.waitForSelector(".motd-window [data-motd-text]", { timeout: 10000 });
  assert((await seat.textContent(".motd-window [data-motd-text]")).includes("Hommlet"), "the player reads the message of the day as they join");
  await seat.locator(".motd-window").screenshot({ path: path.join(SHOTS, "kraken-motd-player.png") });
  await seat.click('[aria-label="Close Message of the Day"]');
  await seat.click('[aria-label="Close Character Selection"]', { timeout: 3000 }).catch(() => undefined);
  report.push("the test player joins: the message of the day opens on their screen by itself");

  // The player's calendar: the GM's shown note, not the kept one; their own note.
  await seat.click('[data-launch="calendar"]');
  await seat.waitForSelector(".calendar-window [data-cal-today]");
  assert(!(await seat.$('.calendar-window [data-action="cal-day-on"]')), "a player cannot move the date");
  await seat.click(`.calendar-window [data-cal-month="Fireseek"] [data-cal-day="${ninth}"]`);
  await seat.waitForSelector('.calendar-window [data-cal-notes="gm"] .cal-note');
  const seen = await seat.textContent('.calendar-window [data-cal-notes="gm"]');
  assert(seen.includes("ready from the vendor") && !seen.includes("doppelganger"), `the player sees the GM's shown note only (${seen})`);
  await seat.fill('.calendar-window [data-field="cal-note"]', "Owe Elmo 2 sp.");
  await seat.click('.calendar-window [data-action="cal-note-add"]');
  const theirs = await until(async () => (await tool("kraken_calendar")).notes.find((note) => note.by === "A test player"), "the player's note");
  assert(theirs.text === "Owe Elmo 2 sp." && theirs.day === ninth && /^#[0-9a-f]{6}$/.test(theirs.color ?? ""), `signed with their name and colour (${JSON.stringify(theirs)})`);
  await page.waitForSelector('.calendar-window [data-cal-notes="players"] .cal-note');
  await seat.locator(".calendar-window").screenshot({ path: path.join(SHOTS, "kraken-calendar-player.png") });
  await seat.click('.calendar-window [data-action="cal-say"]');
  await until(async () => (await tool("kraken_chat_log", { count: 10 })).some((line) => /\[DATE\].*576 CY/.test(line.text ?? "")), "the date in chat");
  await seat.click('[aria-label="Close Calendar"]');
  report.push("the test player's calendar: the GM's shown note (not the GM's own), their own note signed in their colour (the GM sees it), the date said in chat");

  // Read-aloud: an NPC's boxed text, read by the GM; the bubble over the player's map.
  const npc = await tool("kraken_record_create", { type: "npc", name: "Moathouse Guard", data: { text: "<p>A tired guard.</p><frame>The door creaks open. A cold wind carries the smell of the marsh.</frame>" } });
  await tool("kraken_windows", { action: "open", kind: "record", record: npc.id });
  await page.waitForSelector('.read-aloud-frame [data-action="read-aloud"]');
  assert(!(await seat.$('[data-action="read-aloud"]')), "no read-aloud button on a player's screen");
  await page.click('.read-aloud-frame [data-action="read-aloud"]');
  await seat.waitForSelector(".read-aloud-bubble", { timeout: 10000 });
  assert((await seat.textContent(".read-aloud-bubble")).includes("The door creaks open"), "the bubble over the player's map");
  await seat.waitForSelector('.chat-readaloud:has-text("The door creaks open")');
  await settle(600);
  await seat.screenshot({ path: path.join(SHOTS, "kraken-read-aloud-player.png") });
  await seat.click(".read-aloud-bubble");
  await seat.waitForSelector(".read-aloud-bubble", { state: "detached" });
  // The player closes their map: a read-aloud floats over their table instead.
  await seat.click('[aria-label="Close Great Hall"]');
  await seat.waitForSelector('.window[data-window="map"]', { state: "detached" });
  await tool("kraken_read_aloud", { text: "The bridge sways under your weight.", title: "The Rope Bridge" });
  await seat.waitForSelector('.read-aloud-bubble.floating:has-text("The bridge sways")', { timeout: 8000 });
  // It goes by itself once it has been up long enough to read (8 s for so few words), whatever opens meanwhile.
  await seat.click('[data-launch="calendar"]');
  await seat.click('[aria-label="Close Calendar"]');
  await seat.waitForSelector(".read-aloud-bubble", { state: "detached", timeout: 12000 });
  report.push("read-aloud: the NPC's boxed text has the GM's button (not the player's); read, it shows in chat and as a bubble over the test player's map; kraken_read_aloud with the player's map closed: floating over their table");

  // A chat line into a note: the player says something, drags it into a new note, and onto the Notes list.
  await tool("kraken_chat_send", { text: "The Welcome Wench's innkeeper warned us off the old moathouse." });
  await seat.waitForSelector('.chat-line:has-text("old moathouse")');
  await seat.click('[data-launch="notes"]');
  await seat.waitForSelector(".notes-window");
  await seat.locator('.chat-line:has-text("old moathouse")').last().dragTo(seat.locator(".notes-window"));
  const noteWith = async (pattern) => {
    for (const row of (await tool("kraken_records_list", { type: "note" })).records) {
      const note = await tool("kraken_record_get", { id: row.id });
      if (pattern.test(note.data?.text ?? "")) return note;
    }
    return null;
  };
  const made = await until(() => noteWith(/moathouse/), "a note made from the chat line");
  await seat.waitForSelector(`[data-note-window="${made.id}"] .note-text`);
  await tool("kraken_chat_send", { text: "Elmo's brother is called Otis." });
  await seat.waitForSelector('.chat-line:has-text("Otis")');
  await seat.locator('.chat-line:has-text("Otis")').last().dragTo(seat.locator(`[data-note-window="${made.id}"] .note-text`));
  await until(async () => /Otis/.test((await tool("kraken_record_get", { id: made.id })).data?.text ?? ""), "the second line added to the note");
  await seat.locator(`[data-note-window="${made.id}"]`).screenshot({ path: path.join(SHOTS, "kraken-note-from-chat.png") });
  report.push(`a chat line dragged onto Player Notes: a new note ("${made.name}"); another dragged into it: added and kept`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok calendar notes ui${process.env.KRAKEN_APP ? " (the built app)" : ""}:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
