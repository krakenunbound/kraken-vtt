// Apeira Astra, Kraken's own science fiction, played as a table would: the
// GM hosts an Apeira Astra campaign and makes its three books active (shipped
// with Kraken); a test player in Chrome makes a crew member in the crew wizard
// (Origin, a major Path's four picks, a minor Path's two); the sheet shows
// Stamina, Armour and the skills; a task rolls 2d6 + skill + characteristic
// against 8 with its Effect; experience buys a skill; the GM opens Salvage
// Rights's decks (walls and hatches) and runs the boarding fight: initiative
// 2d6, an attack against 8, damage + Effect - armour, Down at 0, dead at -Grit.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-astra-ui-"));
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
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const dataOf = async (id) => {
  const got = await tool("kraken_record_get", { id });
  return got.data ?? got.record?.data;
};

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Astra UI", ruleset: "Apeira Astra" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47449, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  const ours = ["Apeira Astra Crew Handbook", "Apeira Astra Threat Dossier", "Salvage Rights (Apeira Astra)"].map((title) => shelf.find((item) => item.title === title));
  assert(ours.every(Boolean), `its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
  assert(!shelf.some((item) => /Descending Darkness|5E SRD/.test(item.title)), "no other game's books");
  assert(ours.every((book) => book.cover), `each book has its cover: ${JSON.stringify(ours.map((book) => book.cover))}`);
  for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });

  // A test player makes a crew member.
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto("http://127.0.0.1:47449/");
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="astra"]', { timeout: 10000 });
  const wizard = seat.locator('[data-wizard="astra"]');
  await wizard.locator('input[aria-label="Character name"]').fill("Rook Tamsin");
  await wizard.locator('select[aria-label="Origin"]').selectOption("Spacer");
  await wizard.locator('select[aria-label="Major Path"]').selectOption("Marine");
  await wizard.locator('select[aria-label="Minor Path"]').selectOption("Engineer");
  for (const key of ["firearms", "melee", "athletics", "zerog"]) await seat.check(`[data-astra-skill="major:${key}"]`);
  for (const key of ["mechanics", "engineering"]) await seat.check(`[data-astra-skill="minor:${key}"]`);
  await seat.click('[data-wizard="astra"] [data-action="wizard-finish"]');
  await seat.waitForSelector('[data-ruleset="astra"]', { timeout: 15000 });
  const sheet = seat.locator('[data-ruleset="astra"]');
  const text = await sheet.textContent();
  assert(/Stamina/.test(text) && /Armour/.test(text) && /Spacer/.test(text) && /Marine \/ Engineer/.test(text), "the sheet: Stamina, Armour, Spacer, Marine / Engineer");
  const listedCharacters = await tool("kraken_records_list", { type: "character" });
  const rook = (listedCharacters.records ?? listedCharacters).find((item) => item.name === "Rook Tamsin");
  const data = await dataOf(rook.id);
  assert(data.ruleset === "astra" && data.skills.firearms.level === 2 && data.skills.zerog.level === 2 && data.hp.total === 27 && data.ac.total === 5, `Rook's numbers: ${JSON.stringify({ skills: data.skills, hp: data.hp, ac: data.ac })}`);
  assert(/^kraken-games\/portraits\/Spacer\/Spacer Marine\./.test(data.portrait ?? "") && /^kraken-games\/tokens\/Spacer\//.test(data.token ?? ""), `Kraken's Spacer Marine portrait and token: ${data.portrait}, ${data.token}`);
  // A task from the sheet: Zero-G, Hard.
  await sheet.locator('[data-sheet-tab="skills"]').click();
  await sheet.locator('select[aria-label="Difficulty"]').selectOption("-2");
  await sheet.locator('[data-roll-skill="zerog"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll(".chat-line")].some((line) => /\[SKILL\] Zero-G 2 \(Reflex\) \[-2\] \[(SUCCESS|FAILURE) \d+ vs 8, Effect [+-]\d+\]/.test(line.textContent)), null, { timeout: 10000 });
  // Experience buys Pilot 1 (it was 0 from Spacer: costs 2).
  await tool("kraken_character_edit", { id: rook.id, changes: [{ path: "exp", value: 3 }] });
  await seat.waitForFunction(() => document.querySelector('[data-ruleset="astra"]')?.textContent?.includes("3 to spend"), null, { timeout: 8000 });
  await sheet.locator('select[aria-label="Improve"]').selectOption("skill:pilot");
  await sheet.locator('[data-action="improve"]').click();
  await seat.waitForFunction(() => document.querySelector('[data-ruleset="astra"] [data-skill="pilot"] .cc-num')?.textContent === "1", null, { timeout: 8000 });
  assert((await dataOf(rook.id)).exp === 1, "Pilot 1 cost 2 experience");
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-astra-sheet.png") });

  // The derelict's decks: walls and hatches.
  await tool("kraken_open_fg_module", { module: "Salvage Rights", all: true });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  // The scene reaches the server a moment after its window opens.
  let map = await tool("kraken_map", {});
  for (let wait = 0; wait < 40 && !(map.doors ?? []).length; wait++) {
    await settle(250);
    map = await tool("kraken_map", {});
  }
  const walls = await tool("kraken_wall", { action: "list" });
  assert(walls.total > 40 && (map.doors ?? []).length >= 8, `deck 1's walls and hatches: ${walls.total}, ${(map.doors ?? []).length}`);
  await settle(1200);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-astra-map.png") });

  // The boarding fight: Rook against a Gull crewman.
  const listedNpc = await tool("kraken_records_list", { type: "npc", name: "Gull Crewman" });
  const crewman = (listedNpc.records ?? listedNpc)[0];
  await tool("kraken_combat", { action: "add", recordId: crewman.id });
  await tool("kraken_combat", { action: "add", recordId: rook.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = view.find((entry) => entry.name === "Gull Crewman");
  const hers = view.find((entry) => entry.recordId === rook.id);
  assert(foe.hp === 24 && foe.ac === 4, `the crewman's Stamina and Armour: ${foe.hp}, ${foe.ac}`);
  // The creature's portrait from its book, in the tracker.
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.waitForFunction(() => [...document.querySelectorAll(".ct-face img")].some((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15000 });
  const art = await dataOf(foe.recordId);
  // Its record window: the portrait and what the book says of it.
  await tool("kraken_windows", { action: "open", kind: "record", record: "Gull Crewman" });
  await page.waitForFunction(() => {
    const view = document.querySelector('.record-window img.record-portrait');
    return view && view.complete && view.naturalWidth > 0 && /patched vac suits/.test(view.closest(".record-window").textContent);
  }, null, { timeout: 15000 });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-astra-record.png") });
  assert(/^tokens\/[a-z-]+\.webp@/.test(art?.token ?? "") && /^images\/npc\//.test(art?.picture ?? ""), `its token and portrait: ${art?.token}, ${art?.picture}`);
  await tool("kraken_combat", { action: "init", which: "all" });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.every((entry) => entry.initresult >= 1 && entry.initresult <= 15), `initiative on 2d6: ${view.map((entry) => entry.initresult)}`);
  await tool("kraken_combat", { action: "target", id: hers.id, targetId: foe.id, on: true });
  const carbine = Object.entries(data.attacks).find(([, attack]) => attack.name === "Carbine")[0];
  let hit = null;
  for (let tries = 0; tries < 20 && !hit; tries++) {
    const result = await tool("kraken_combat", { action: "attack", recordId: rook.id, weapon: carbine });
    const list = result.attack ?? result.results ?? result;
    const first = Array.isArray(list) ? list[0] : list;
    if (first?.hit) hit = first;
  }
  assert(hit && hit.effect >= 0, `a hit, with its Effect: ${JSON.stringify(hit)}`);
  const damaged = await tool("kraken_combat", { action: "damage-roll", recordId: rook.id, weapon: carbine });
  const roll = damaged.damage ?? damaged.result ?? damaged;
  const dealt = roll.targets?.[0]?.damage ?? null;
  assert(dealt === Math.max(0, roll.total + hit.effect - 4), `damage = ${roll.total} + Effect ${hit.effect} - armour 4 = ${dealt}`);
  // Down at 0, dead at minus Grit.
  await tool("kraken_combat", { action: "damage", id: hers.id, amount: 27 });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === hers.id).health.status === "Down", `at 0 Stamina she is Down: ${view.find((entry) => entry.id === hers.id).health.status}`);
  await tool("kraken_combat", { action: "damage", id: hers.id, amount: 8 });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === hers.id).health.status === "Dead", `dead at minus her Grit (8): ${view.find((entry) => entry.id === hers.id).health.status}`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-astra-combat.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok astra ui: an Apeira Astra campaign's shelf has its three books (no other game's), made active; a test player makes Rook Tamsin in the crew wizard (Spacer; Marine's four picks, Engineer's two: Firearms 2, Zero-G 2; Stamina 27, Armour 5); a Hard Zero-G task from the sheet (2d6 + skill + Reflex against 8, its Effect); 2 experience buys Pilot 1; Salvage Rights's deck 1 with ${walls.total} walls and ${(map.doors ?? []).length} hatches; the boarding fight: initiative on 2d6, a carbine hit with Effect ${hit.effect}, damage ${roll.total} + ${hit.effect} - 4 armour = ${dealt}; Down at 0, dead at -8. ${path.join(tmpdir(), "kraken-astra-sheet.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
