// Fate Core and Fate Accelerated, played as a table would, in the real app:
// the GM hosts with nothing else installed (KRAKEN_BOOKS and KRAKEN_PACKS
// point at empty folders: only Kraken's own packs are on the shelf) and
// makes the game's three books active. In a Fate Core campaign a test player
// in Chrome makes a character with the wizard (high concept and trouble, the
// phase trio, the skill pyramid, three stunts from the book), rolls four Fate
// dice from the sheet (the dice in chat as plus, minus and blank), invokes
// an aspect for a fate point; the GM starts a scene on the Scene Aspects
// strip, opens the scenario's map with its zones, and runs a conflict on the
// tracker against a nameless NPC (a Wrecker, taken out) and a supporting
// NPC (Tam Coller, whose hit on the player is absorbed on the tracker by
// the GM with a named consequence). Then a Fate Accelerated campaign: the
// test player makes a character with approaches in the wizard and rolls
// from the sheet. Windows open on the left monitor (KRAKEN_WINDOW_AT) and
// are closed at the end.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-fate-ui-"));
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
  return (Array.isArray(lines) ? lines : []).filter((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""}`));
};
const waitFor = async (check, what, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const value = await check();
    if (value) return value;
    await settle(250);
  }
  throw new Error(`Waited for ${what}.`);
};
const shots = path.join(tmpdir(), "kraken-fate-ui");
mkdirSync(shots, { recursive: true });

let browser = null;
const report = [];
// A campaign of the game hosted, its three books on the shelf (and no other game's), made active.
async function host(ruleset, port) {
  const campaign = await tool("kraken_campaign_create", { name: `${ruleset} UI`, ruleset });
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  const titles = [ruleset === "Fate Core" ? "Fate Core System (Player's Reference)" : "Fate Accelerated Edition (Player's Reference)", "Fate Toolkit and Adversaries (GM)", "The Lighthouse at Gull's End (Fate scenario)"];
  const ours = titles.map((title) => shelf.find((item) => item.title === title));
  assert(ours.every(Boolean), `${ruleset}: its three books on the shelf: ${shelf.map((item) => item.title).join(", ")}`);
  assert(!shelf.some((item) => /Cairn|Descending Darkness|Apeira Astra|SRD 5\.2\.1|Fate (Core|Accelerated)/.test(item.title) && !titles.includes(item.title)), `${ruleset}: no other game's books: ${shelf.map((item) => item.title).join(", ")}`);
  for (const book of ours) await tool("kraken_books", { action: "activate", book: book.id });
  return ours;
}
// A test player joins in Chrome and opens the character wizard.
async function join(port) {
  const seat = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "a test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await seat.waitForSelector('[data-action="new-character"]', { timeout: 10000 });
  await seat.click('[data-action="new-character"]');
  await seat.waitForSelector('[data-wizard="fate"]', { timeout: 15000 });
  return seat;
}
const mineOf = async () => {
  const characters = await tool("kraken_records_list", { type: "character" });
  return (characters.records ?? characters).find((item) => item.owner === "a test player");
};

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });

  // ---------------------------------------------------------------- Fate Core
  const PORT = 48500 + Math.floor(Math.random() * 300);
  await host("Fate Core", PORT);
  const seat = await join(PORT);
  const wizard = seat.locator('[data-wizard="fate"]');
  assert((await wizard.getAttribute("data-game")) === "core", "the Fate Core wizard");
  // The pregens are offered too (the scenario's, for Fate Core).
  assert((await wizard.locator("[data-pregen]").count()) === 3, "three Fate Core pregenerated characters offered");
  // 1. High concept, trouble, name.
  await wizard.locator('[data-field="highconcept"]').fill("Swordmaster of the Quiet Order");
  await wizard.locator('[data-field="trouble"]').fill("My Brother's Debts");
  await wizard.locator('[data-field="name"]').fill("Brennan Hale");
  // 2. The phase trio.
  for (const [index, aspect] of ["I Never Back Down", "Owes Rook a Favour", "Calm Before the Storm"].entries()) {
    await wizard.locator(`input[aria-label="Phase ${index + 1} title"]`).fill(["The Duel at Varn", "Crossing the Marsh", "The Bell Tower"][index]);
    await wizard.locator(`[data-field="a${index + 1}"]`).fill(aspect);
  }
  // 3. The pyramid: Great Fight; Good Athletics, Notice; Fair Physique, Will, Shoot; Average Lore, Stealth, Rapport, Provoke.
  const pyramid = ["Fight", "Athletics", "Notice", "Physique", "Will", "Shoot", "Lore", "Stealth", "Rapport", "Provoke"];
  for (const [index, skill] of pyramid.entries()) await wizard.locator(`[data-slot="${index}"] select`).selectOption(skill);
  assert((await wizard.locator("[data-wizard-problems]").count()) === 0, "the pyramid fits");
  // 4. Three stunts from the book's skill list.
  for (const stunt of ["Sprinter", "Heavy Hitter", "Strong Guy"]) {
    await wizard.locator('[aria-label="Stunt search"]').fill(stunt);
    const take = wizard.locator(`[aria-label="Take ${stunt}"]`);
    if (await take.count()) await take.first().click();
  }
  let stunts = await wizard.locator("[data-wizard-stunt]").count();
  if (stunts < 3) {
    await wizard.locator('[aria-label="Stunt search"]').fill("");
    while (stunts < 3) {
      await wizard.locator(".life-shop button").first().click();
      stunts = await wizard.locator("[data-wizard-stunt]").count();
    }
  }
  assert((await wizard.locator("[data-wizard-refresh]").getAttribute("data-wizard-refresh")) === "3", "three stunts: refresh 3");
  assert(/Physical stress 3 boxes .*mental 3/.test(await wizard.locator("[data-wizard-summary]").textContent()), "stress worked out in the wizard");
  await seat.screenshot({ path: path.join(shots, "core-wizard.png"), fullPage: true });
  await wizard.locator('[data-action="wizard-finish"]').click();
  await seat.waitForSelector('[data-ruleset="fate"]', { timeout: 15000 });
  const sheet = seat.locator('[data-ruleset="fate"]');
  const mine = await mineOf();
  let data = await dataOf(mine.id);
  assert(mine.name === "Brennan Hale" && data.game === "core" && data.aspects.highconcept === "Swordmaster of the Quiet Order" && data.aspects.a2 === "Owes Rook a Favour" && data.phases.p1.title === "The Duel at Varn", `the character's aspects and phases: ${JSON.stringify(data.aspects)}`);
  assert(data.skills.Fight === 4 && data.skills.Athletics === 3 && data.skills.Provoke === 1 && Object.keys(data.stunts).length === 3 && data.refresh === 3 && data.fatepoints === 3, `skills, stunts, refresh: ${JSON.stringify({ skills: data.skills, refresh: data.refresh })}`);
  assert(data.tracks.map((track) => track.boxes.length).join() === "3,3" && Object.keys(data.consequences).join() === "mild,moderate,severe,extreme", `stress and consequences: ${JSON.stringify(data.tracks)}`);
  await seat.screenshot({ path: path.join(shots, "core-sheet.png") });

  // A roll from the sheet: Fight against Fair, four Fate dice.
  await sheet.locator('[data-field="fate-opposition"]').selectOption("2");
  await sheet.locator('[data-roll-skill="Fight"]').click();
  await seat.waitForFunction(() => [...document.querySelectorAll(".chat-line")].some((line) => /\[FATE\] Fight \+4 · Overcome vs Fair \(\+2\)/.test(line.textContent ?? "") && line.querySelectorAll("[data-fate-die]").length === 4), null, { timeout: 15000 });
  const faces = await seat.$$eval(".chat-line [data-fate-die] text", (nodes) => nodes.slice(-4).map((node) => node.textContent));
  assert(faces.every((face) => ["+", "−", " "].includes(face)), `the chat's Fate dice show plus, minus or blank: ${JSON.stringify(faces)}`);
  const ladder = await seat.$$eval(".chat-line .roll-total[data-ladder]", (nodes) => nodes.at(-1)?.getAttribute("data-ladder"));
  assert(/\((\+|−)\d\)$/.test(ladder ?? ""), `the total on the ladder: ${ladder}`);
  await seat.waitForSelector(".fate-last", { timeout: 10000 });
  // An invoke on it: +2 for a fate point.
  const before = Number(await sheet.locator(".fate-last").getAttribute("data-last-total"));
  await sheet.locator('[data-invoke-aspect="I Never Back Down"] [data-action="fate-invoke"]').click();
  await waitFor(async () => (await dataOf(mine.id)).fatepoints === 2, "a fate point spent");
  data = await dataOf(mine.id);
  assert(data.lastroll.total === before + 2 && (await chat(/\[INVOKE\] Brennan Hale invokes "I Never Back Down" for \+2/)).length === 1, `the invoke: ${before} -> ${data.lastroll.total}`);
  await seat.screenshot({ path: path.join(shots, "core-roll.png") });

  // The GM's scene: a new scene on the strip (the pool: one a player character), an aspect.
  await page.waitForSelector("[data-fate-strip]", { timeout: 15000 });
  await page.locator('[data-fate-strip] [data-action="fate-strip-gm"]').click();
  await page.locator('[data-fate-strip] [data-field="scene-aspect"]').fill("Fog Rolling In");
  await page.locator('[data-fate-strip] [data-action="scene-aspect-add"]').click();
  await waitFor(async () => (await tool("kraken_fate", { action: "view" })).aspects.some((item) => item.name === "Fog Rolling In"), "the scene aspect");
  await page.locator('[data-fate-strip] [data-action="gm-pool-up"]').click();
  await page.locator('[data-fate-strip] [data-action="gm-pool-up"]').click();
  await waitFor(async () => (await tool("kraken_fate", { action: "view" })).gmpool === 2, "the GM's pool");
  await seat.waitForSelector('[data-fate-strip] [data-scene-aspect="Fog Rolling In"]', { timeout: 10000 });

  // The scenario's map, with its zones; the conflict on the tracker.
  await tool("kraken_open_fg_module", { module: "The Lighthouse at Gull's End", all: true });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  const walls = await waitFor(async () => {
    const list = await tool("kraken_wall", { action: "list" });
    return list.total > 10 ? list : null;
  }, "the map's walls");
  await settle(800);
  await page.screenshot({ path: path.join(shots, "map.png") });
  const npcs = (await tool("kraken_records_list", { type: "npc" })).records ?? [];
  const wrecker = npcs.find((item) => item.name === "Wrecker");
  const tam = npcs.find((item) => item.name === "Tam Coller, the Lamp-Snuffer");
  assert(wrecker && tam, `the scenario's NPCs: ${npcs.map((item) => item.name).join(", ")}`);
  await tool("kraken_combat", { action: "add", recordId: mine.id });
  await tool("kraken_combat", { action: "add", recordId: wrecker.id });
  await tool("kraken_combat", { action: "add", recordId: tam.id });
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.waitForSelector(".combat-tracker [data-fate-entry]", { timeout: 15000 });
  await page.locator('.combat-tracker [data-action="init-all"]').dispatchEvent("click");
  await waitFor(async () => (await chat(/\[INIT\] A physical conflict, in order of Notice/)).length > 0, "the turn order");
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const me = view.find((entry) => entry.recordId === mine.id);
  const foe = view.find((entry) => entry.name === "Wrecker");
  const boss = view.find((entry) => entry.name.startsWith("Tam Coller"));
  assert(view[0].id === me.id, `Brennan's Notice +3 goes first: ${view.map((entry) => `${entry.name} ${entry.initresult}`).join(", ")}`);
  // The player attacks the Wrecker from the sheet: Fight +4 (+ + blank blank) against Fight +2 (blank x4): 4 shifts, taken out.
  await tool("kraken_combat", { action: "target", id: me.id, targetId: foe.id, on: true });
  for (const button of await seat.$$('[data-window="map"] button[aria-label^="Close"]')) await button.click().catch(() => undefined);
  await sheet.locator('[data-field="fate-action"]').selectOption("attack");
  await tool("kraken_dice_force", { values: [3, 3, 2, 2, 2, 2, 2, 2] });
  await sheet.locator('[data-roll-skill="Fight"]').dispatchEvent("click");
  await waitFor(async () => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === foe.id).health.status === "Taken Out", "the Wrecker taken out");
  assert((await chat(/\[ATTACK\] Brennan Hale: Fight \+4 -> \[at Wrecker\]/)).length === 1 && (await chat(/\[TAKEN OUT\] Wrecker/)).length === 1, "the attack and the Wrecker taken out in chat");
  // Tam Coller attacks from the GM's tracker: Fight +3 (+ + + +) against Brennan's Fight +4 (− − blank blank): 5 shifts, waiting.
  await tool("kraken_combat", { action: "target", id: boss.id, targetId: me.id, on: true });
  await settle(300);
  await tool("kraken_dice_force", { values: [3, 3, 3, 3, 1, 1, 2, 2] });
  await page.locator(`.combat-tracker [data-ct="${boss.id}"] .ct-attack button`).first().dispatchEvent("click");
  await page.waitForSelector(`.combat-tracker [data-ct="${me.id}"] [data-fate-pending="5"]`, { timeout: 15000 });
  // The GM absorbs it for the player on the tracker: a named consequence.
  const plans = await page.locator(`.combat-tracker [data-ct="${me.id}"] [data-action="fate-absorb"]`).allTextContents();
  const index = plans.findIndex((words) => /moderate/.test(words));
  assert(index >= 0, `a way with a moderate consequence: ${plans.join(" | ")}`);
  await page.locator(`.combat-tracker [data-ct="${me.id}"] [data-consequence-name="moderate"]`).fill("Gashed Sword Arm");
  await page.locator(`.combat-tracker [data-ct="${me.id}"] [data-action="fate-absorb"]`).nth(index).dispatchEvent("click");
  await waitFor(async () => (await dataOf(mine.id)).consequences.moderate.text === "Gashed Sword Arm", "the consequence on the sheet");
  // Tam takes 4 shifts from the GM's hand: a supporting NPC absorbs (a box and its mild consequence).
  await tool("kraken_combat", { action: "damage", id: boss.id, amount: 4 });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const tamNow = view.find((entry) => entry.id === boss.id);
  assert(tamNow.fate.consequences.some((item) => item.text) && tamNow.health.status === "Consequences", `Tam Coller absorbs: ${JSON.stringify(tamNow.fate)}`);
  // Tam concedes from the tracker (the GM's button).
  await page.locator(`.combat-tracker [data-ct="${boss.id}"] [data-action="fate-concede"]`).dispatchEvent("click");
  await waitFor(async () => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === boss.id).health.status === "Conceded", "Tam concedes");
  await page.screenshot({ path: path.join(shots, "core-conflict.png") });
  await tool("kraken_combat", { action: "end", removeNpcs: true });
  data = await dataOf(mine.id);
  assert(Object.values(data.stress.physical).every((value) => !value) && data.consequences.moderate.text === "Gashed Sword Arm", "the conflict over: stress clear, the consequence stays");
  report.push(`Fate Core: a test player made Brennan Hale in the wizard (phase trio, the pyramid, 3 stunts, refresh 3, stress 3/3), rolled 4dF Fight from the sheet (${faces.join("")} in chat, ${ladder}), invoked "I Never Back Down" for a fate point; the GM put "Fog Rolling In" and 2 fate points on the strip; the scenario's map (${walls.total} walls) and a conflict: turn order by Notice, the Wrecker (nameless) taken out from the sheet, Tam Coller (supporting) hit Brennan for 5 (absorbed with "Gashed Sword Arm"), took 4 (a box and a mild consequence) and conceded`);
  await seat.close();
  await tool("kraken_leave", {});
  await page.waitForSelector("text=My Campaigns", { timeout: 30000 });

  // ---------------------------------------------------------- Fate Accelerated
  const PORT2 = PORT + 7;
  await host("Fate Accelerated", PORT2);
  const seat2 = await join(PORT2);
  const wizard2 = seat2.locator('[data-wizard="fate"]');
  assert((await wizard2.getAttribute("data-game")) === "fae", "the Fate Accelerated wizard");
  assert((await wizard2.locator("[data-pregen]").count()) === 7, `FAE's pregens: the book's four and the scenario's three: ${await wizard2.locator("[data-pregen]").count()}`);
  await wizard2.locator('[data-field="highconcept"]').fill("Runaway Sky-Pirate");
  await wizard2.locator('[data-field="trouble"]').fill("Wanted by the Admiralty");
  await wizard2.locator('[data-field="a1"]').fill("Never Without My Kite");
  await wizard2.locator('[data-field="name"]').fill("Wren");
  for (const [key, value] of Object.entries({ careful: 1, clever: 2, flashy: 3, forceful: 0, quick: 2, sneaky: 1 })) await wizard2.locator(`[data-approach="${key}"] select`).selectOption(String(value));
  assert((await wizard2.locator("[data-wizard-problems]").count()) === 0, "the approaches fit");
  await wizard2.locator('[aria-label="Own stunt"]').fill("Daredevil: Because I am a Daredevil, I get a +2 when I Flashily overcome obstacles in the air.");
  await wizard2.locator('button:has-text("Add")').first().click();
  await wizard2.locator('[aria-label="Stunt search"]').fill("Swashbuckling");
  await wizard2.locator('[aria-label="Take Swashbuckling Swordswoman"]').first().click();
  await seat2.screenshot({ path: path.join(shots, "fae-wizard.png"), fullPage: true });
  await wizard2.locator('[data-action="wizard-finish"]').click();
  await seat2.waitForSelector('[data-ruleset="fate"][data-game="fae"]', { timeout: 15000 });
  const wren = await mineOf();
  const fae = await dataOf(wren.id);
  assert(fae.game === "fae" && fae.approaches.flashy === 3 && fae.approaches.forceful === 0 && fae.tracks.length === 1 && fae.tracks[0].boxes.length === 3 && Object.keys(fae.stunts).length === 2 && fae.refresh === 3, `the FAE character: ${JSON.stringify({ approaches: fae.approaches, tracks: fae.tracks, refresh: fae.refresh })}`);
  const sheet2 = seat2.locator('[data-ruleset="fate"]');
  await sheet2.locator('[data-roll-skill="Flashy"]').click();
  await seat2.waitForFunction(() => [...document.querySelectorAll(".chat-line")].some((line) => /\[FATE\] Flashy \+3 · Overcome/.test(line.textContent ?? "") && line.querySelectorAll("[data-fate-die]").length === 4), null, { timeout: 15000 });
  // The tray's Fate die: four of them rolled from the chat's tray.
  const fateDie = seat2.locator('.dice-tray [aria-label="dF"]');
  assert((await fateDie.count()) === 1, "the tray has a Fate die");
  for (let i = 0; i < 4; i++) await fateDie.click();
  await seat2.keyboard.press("Escape").catch(() => undefined);
  await seat2.screenshot({ path: path.join(shots, "fae-sheet.png") });
  report.push(`Fate Accelerated: the wizard's approaches (Flashy +3 ... Forceful +0), an own stunt and one from the book, three stress boxes, refresh 3; 4dF Flashy from the sheet; the tray's Fate die`);
  await seat2.close();
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok fate ui: ${report.join(". ")}. Screenshots: ${shots}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
