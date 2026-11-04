// Notes in the real app, as FG's Player Notes, and links everywhere: a player
// in Chrome makes a note, types in it, drags their character into it, drags
// the note onto a quick slot and opens it from there; the GM cannot see it
// until the player shares it, then opens it and follows the link. Starts the
// app (throwaway profile).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-notes-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
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
// A drop as the browser makes it, onto what may be under another window.
const drop = (where, selector, link) =>
  where.evaluate(
    ([target, data]) => {
      const element = document.querySelector(target);
      const transfer = new DataTransfer();
      transfer.setData("text/kraken-slot", JSON.stringify(data));
      for (const type of ["dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    },
    [selector, link],
  );
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Notes UI", ruleset: "Castles & Crusades" });
  const port = 47401;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const hero = await tool("kraken_record_create", { type: "character", name: "Aldric", owner: "A test player", visibility: "owner", data: { level: 1, hp: { total: 10, wounds: 0 } } });

  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");

  // The player makes a note, names it and writes in it.
  await seat.click('.sidebar [data-launch="notes"]');
  await seat.click('[data-action="new-note"]');
  await seat.waitForSelector(".note-window");
  await seat.fill(".note-title", "Clues");
  await seat.fill(".note-text", "The innkeeper is lying about the cellar.");
  await seat.click(".note-owner");
  let note = null;
  for (let wait = 0; wait < 30 && !(note?.name === "Clues" && note.data?.text?.includes("innkeeper")); wait++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const listed = await tool("kraken_records_list", { type: "note" });
    const row = (Array.isArray(listed) ? listed : listed.records ?? []).find((item) => item.name === "Clues");
    note = row ? await tool("kraken_record_get", { id: row.id }) : null;
  }
  assert(note && note.owner === "A test player" && note.visibility === "owner", `the host has the player's note, theirs alone (${JSON.stringify(note).slice(0, 200)})`);

  // Links: the player's character into the note; the note onto a quick slot.
  await drop(seat, ".note-links", { kind: "sheet", record: hero.id, label: "Aldric" });
  await seat.waitForSelector('.note-chip[data-note-chip="sheet"]');
  await drop(seat, '[data-quick-slot="0"]', { kind: "note", record: note.id, label: "Clues" });
  await seat.waitForSelector('[data-quick-slot="0"].full');
  await seat.click('[data-quick-slot="0"]');
  await seat.waitForSelector('.note-window[data-note-window]');

  // Another player cannot see it until its writer shares it.
  const second = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await second.goto(`http://127.0.0.1:${port}/`);
  await second.fill('input[name="name"]', "Another player");
  await second.fill('input[name="account-password"]', "test-pass");
  await second.fill('input[name="password"]', "pw");
  await second.click('button[type="submit"]');
  await second.waitForSelector(".sidebar");
  await second.click('.sidebar [data-launch="notes"]');
  await second.waitForSelector(".notes-window");
  assert((await second.$(`[data-note="${note.id}"]`)) === null, "another player does not see an unshared note");
  await seat.click("[data-share-note]");
  await second.waitForSelector(`[data-note="${note.id}"]`, { timeout: 8000 });
  await second.click(`[data-note="${note.id}"]`);
  await second.waitForSelector(".note-text");
  assert((await second.inputValue(".note-text")).includes("innkeeper") && (await second.getAttribute(".note-text", "readonly")) !== null, "shared, they read it but cannot change it");

  // The GM sees every note (as FG's), opens it and follows its link to the sheet.
  await page.click('.sidebar [data-launch="notes"]');
  await page.click(`[data-note="${note.id}"]`);
  await page.click('.note-chip[data-note-chip="sheet"] button');
  await page.waitForSelector('.window-title:has-text("Aldric")', { timeout: 8000 });
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-notes-player.png") });
  assert(failures.length === 0, `no errors on screen: ${failures.join("; ")}`);
  console.log("NOTES_UI_OK a player writes a note, links their character, slots the note, shares it; another player reads it; the GM follows its link");
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
