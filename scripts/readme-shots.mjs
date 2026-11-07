// Screenshots for the README (docs/screenshots): the start screens, a
// Descending Darkness table (the crypt in torchlight, the combat tracker, a
// sheet), what a test player sees in Chrome, ability cards (the player's and
// the GM's), a book, an Apeira Astra table
// (the derelict's deck, a threat's record), the map editor.
// Run: node scripts/readme-shots.mjs (KRAKEN_WINDOW_AT places the window).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

const OUT = path.join(process.cwd(), "docs", "screenshots");
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), "kraken-shots-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
const SCREEN = await app.evaluate(async ({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows()[0];
  const display = screen.getDisplayMatching(win.getBounds());
  win.setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return { width: display.size.width, height: display.size.height };
});
console.log("screen", SCREEN);
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
const settle = (ms = 800) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (target, name) => {
  await target.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 86 });
  console.log("shot", name);
};
const npcId = async (name) => (await tool("kraken_records_list", { type: "npc", name })).records[0].id;
const waitDoors = async () => {
  for (let wait = 0; wait < 40; wait++) {
    const map = await tool("kraken_map", {});
    if ((map.doors ?? []).length || (map.walls ?? 0)) return map;
    await settle(250);
  }
  return tool("kraken_map", {});
};

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shots", version: "1" } });

  // The start screen, in three of its scenes.
  for (const id of ["keep", "station", "graveyard"]) {
    await page.click(`[data-backdrop-dot="${id}"]`);
    await page.mouse.move(SCREEN.width / 2, SCREEN.height / 3);
    await settle(3000);
    await shot(page, `start-${id}`);
  }

  // Descending Darkness: the crypt of The Empty Watchtower.
  const dd = await tool("kraken_campaign_create", { name: "The Empty Watchtower", ruleset: "Descending Darkness" });
  await tool("kraken_host", { campaignId: dd.id, port: 47461, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const ddBooks = (listed.books ?? listed).filter((item) => /Descending Darkness|Empty Watchtower/.test(item.title));
  for (const book of ddBooks) await tool("kraken_books", { action: "activate", book: book.id });

  // A test player joins and makes a character in the wizard.
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: SCREEN })).newPage();
  await seat.goto("http://127.0.0.1:47461/");
  await seat.fill('input[name="name"]', "Ann");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  const brenna = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Brenna Stoneward", species: "Dwarf", class: "Fighter", background: "Soldier", level: 2, alignment: "Lawful good", scores: { strength: 17, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 13, charisma: 10 }, skills: ["Athletics", "Perception"], gear: [["Chain Mail", 1], ["Shield", 1], ["Warhammer", 1], ["Handaxe", 2], ["Torch", 5], ["Rations (1 day)", 5], ["Rope, Hempen (50 feet)", 1]], gold: 24, notes: "Served twenty years on the Iron Road watch. Owes Mother Hesk a favour, and means to pay it." } });
  const brennaId = brenna.id ?? brenna.record?.id ?? brenna.character?.id;
  const tomas = await tool("kraken_build_character", { spec: { name: "Tomas Vell", species: "Human", class: "Cleric", background: "Acolyte", level: 2, alignment: "Neutral good", scores: { strength: 12, dexterity: 10, constitution: 14, intelligence: 13, wisdom: 17, charisma: 14 }, skills: ["Medicine", "Religion"], spells: ["Sacred Ember", "Guiding Glimmer", "Mend Wounds", "Word of Rest"], gear: [["Mace", 1], ["Scale Mail", 1], ["Shield", 1], ["Torch", 3], ["Rations (1 day)", 5]], gold: 18, notes: "A young priest of the Lantern, sent to find out why Brother Aldous stopped writing." } });
  const tomasId = tomas.id ?? tomas.record?.id ?? tomas.character?.id;
  await tool("kraken_character_edit", { id: brennaId, changes: [{ path: "exp", value: 450 }, { path: "hp.wounds", value: 6 }, { path: "appearance", value: "Red braids, a broken nose, and a hammer older than she is." }] });
  await tool("kraken_character_edit", { id: tomasId, changes: [{ path: "exp", value: 380 }, { path: "hp.wounds", value: 3 }, { path: "appearance", value: "Thin, earnest, ink on his fingers, a brass lantern at his belt." }] });

  await tool("kraken_open_fg_module", { module: "The Empty Watchtower", maps: ["Crypt"] });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  const crypt = await waitDoors();
  const cols = Math.floor((crypt.width ?? 1400) / (crypt.grid ?? 70));
  const rows = Math.floor((crypt.height ?? 1050) / (crypt.grid ?? 70));
  console.log("crypt", cols, rows);
  await tool("kraken_scene_settings", { darkness: 0.75, weather: { type: "ash", intensity: 0.25 } });
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);
  await tool("kraken_token_place", { recordId: brennaId, col: 6, row: 9 });
  const tomasToken = await tool("kraken_token_place", { recordId: tomasId, col: 4, row: 8 });
  await tool("kraken_token_update", { id: tomasToken.id ?? tomasToken.token?.id, light: "torch" });
  const sentinel = await npcId("Bone Sentinel");
  const warden = await npcId("Warden Saranth");
  for (const [recordId, col, row] of [[warden, 15, 6], [sentinel, 10, 7], [sentinel, 12, 8]]) {
    const placed = await tool("kraken_token_place", { recordId, col, row });
    const tokenId = placed.id ?? placed.token?.id;
    if (tokenId) await tool("kraken_token_update", { id: tokenId, hidden: false });
  }
  await tool("kraken_light", { action: "place", col: 15, row: 5, preset: "lantern", color: "#6fa8ff", animation: "pulse" });
  for (const id of [brennaId, tomasId, warden, sentinel]) await tool("kraken_combat", { action: "add", recordId: id });
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "next" });
  const book = (title) => ddBooks.find((item) => item.title.includes(title))?.id;
  const adventure = book("Empty Watchtower");
  await tool("kraken_quickslots", { slots: [
    { kind: "sheet", record: brennaId, label: "Brenna" },
    { kind: "sheet", record: tomasId, label: "Tomas" },
    { kind: "book", book: book("Player's Handbook"), label: "Handbook" },
    { kind: "book", book: book("Bestiary"), label: "Bestiary" },
    { kind: "picture", book: adventure, file: "images/handout-hollowmere.webp", label: "Hollowmere" },
    { kind: "picture", book: adventure, file: "images/handout-journal.webp", label: "Journal" },
    { kind: "picture", book: adventure, file: "images/handout-warden.webp", label: "The Warden" },
    { kind: "picture", book: adventure, file: "images/watchtower-yard.webp", label: "Yard" },
    { kind: "picture", book: adventure, file: "images/watchtower-upper.webp", label: "Upper floor" },
    { kind: "picture", book: adventure, file: "images/watchtower-crypt.webp", label: "Crypt" },
  ] });
  const handbook = book("Player's Handbook");
  const contents = await tool("kraken_books", { action: "contents", book: handbook });
  const pages = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.id && node.name && !node.sections && !node.pages && !node.chapters) pages.push({ id: node.id, name: node.name });
    for (const key of ["chapters", "sections", "pages"]) walk(node[key]);
  };
  walk(contents.chapters ?? contents);
  console.log("pages", pages.length, pages.slice(0, 10).map((item) => item.name).join(" | "));
  const pick = (re) => pages.find((item) => re.test(item.name)) ?? pages.shift();
  const pageSlots = [/dread/i, /light/i, /dying|bleed/i, /fighter/i, /cleric/i, /dwarf/i, /combat/i, /spell/i].map((re) => pick(re)).filter(Boolean).map((item) => ({ kind: "book", book: handbook, page: item.id, label: item.name }));
  await tool("kraken_quickslots", { seat: "Ann", slots: [{ kind: "sheet", record: brennaId, label: "Brenna" }, { kind: "book", book: handbook, label: "Handbook" }, ...pageSlots].slice(0, 10) });
  globalThis.dreadPage = pageSlots[0];
  await settle(8000);
  await shot(page, "gm-crypt");
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await settle(2500);
  await shot(page, "combat");

  // The sheet.
  await tool("kraken_windows", { action: "close", kind: "combat" });
  await tool("kraken_windows", { action: "open", kind: "sheet", record: tomasId });
  await settle(1500);
  await page.locator('[aria-label="Difficulty class"]').first().fill("12").catch(() => {});
  await settle(1000);
  await shot(page, "sheet-descending");
  await tool("kraken_windows", { action: "close", kind: "sheet", record: tomasId });

  // What Ann sees: her token's eyes, in the dark.
  await seat.waitForSelector(".viewport", { timeout: 20000 }).catch(() => {});
  await seat.locator('button[aria-label="Close Character Selection"]').click().catch(() => {});
  await settle(5000);
  await shot(seat, "player-crypt");

  // Ability cards: Ann's hand (Brenna's hammer and axes) in Chrome, and the
  // GM's window with Tomas's spells, one turned over.
  await seat.click('[data-launch="settings"]');
  await seat.check('[data-setting="cards"]');
  await seat.click('[data-launch="settings"]');
  await seat.click('[data-launch="cards"]');
  await seat.waitForSelector(".kcard", { timeout: 10000 });
  await settle(2500);
  await seat.locator(".kcard").first().hover();
  await settle(900);
  await shot(seat, "cards-player");
  await page.click('[data-launch="settings"]');
  await page.check('[data-setting="cards"]');
  await page.click('[data-launch="settings"]');
  await tool("kraken_windows", { action: "open", kind: "cards" });
  await page.waitForSelector(".cards-window[data-cards]", { timeout: 10000 });
  await page.selectOption('[data-action="cards-character"]', tomasId);
  await page.waitForSelector('[data-card^="spell:"]', { timeout: 10000 });
  await settle(2500);
  const flip = page.locator('[data-card^="spell:"]').nth(1);
  await flip.hover();
  await flip.click({ position: { x: 70, y: 60 } });
  await settle(1500);
  await page.locator('[data-card^="spell:"]').nth(2).hover();
  await settle(900);
  await shot(page, "cards-gm");
  await tool("kraken_windows", { action: "close", kind: "cards" });

  // A book: the Bestiary's Warden, and the handbook.
  await tool("kraken_windows", { action: "open", kind: "record", record: "Warden Saranth" });
  await tool("kraken_quickslots", { slots: [{ kind: "book", book: handbook, page: globalThis.dreadPage?.page, label: globalThis.dreadPage?.label ?? "Handbook" }, { kind: "sheet", record: brennaId, label: "Brenna" }, { kind: "sheet", record: tomasId, label: "Tomas" }, { kind: "book", book: book("Bestiary"), label: "Bestiary" }, { kind: "picture", book: adventure, file: "images/handout-hollowmere.webp", label: "Hollowmere" }, { kind: "picture", book: adventure, file: "images/handout-journal.webp", label: "Journal" }, { kind: "picture", book: adventure, file: "images/handout-warden.webp", label: "The Warden" }, { kind: "picture", book: adventure, file: "images/watchtower-yard.webp", label: "Yard" }, { kind: "picture", book: adventure, file: "images/watchtower-upper.webp", label: "Upper floor" }, { kind: "picture", book: adventure, file: "images/watchtower-crypt.webp", label: "Crypt" }] });
  await settle(800);
  await page.locator(`[data-quick-slot="0"]`).first().click().catch((error) => console.log("slot", error.message));
  await settle(3000);
  await shot(page, "books");
  await tool("kraken_windows", { action: "close", kind: "record", record: "Warden Saranth" });

  // Apeira Astra: the Kestrel's deck.
  await tool("kraken_leave", {});
  await page.waitForSelector("text=My Campaigns", { timeout: 20000 });
  const aa = await tool("kraken_campaign_create", { name: "Salvage Rights", ruleset: "Apeira Astra" });
  await tool("kraken_host", { campaignId: aa.id, port: 47462, password: "" });
  await page.waitForSelector("text=Hosting");
  const aaList = await tool("kraken_books", { action: "list" });
  for (const book of (aaList.books ?? aaList).filter((item) => /Apeira|Salvage/.test(item.title))) await tool("kraken_books", { action: "activate", book: book.id });
  const rook = await tool("kraken_build_character", { spec: { name: "Rook Tamsin", origin: "Spacer", major: "Marine", minor: "Engineer", majorSkills: ["firearms", "melee", "athletics", "zerog"], minorSkills: ["mechanics", "engineering"], characteristics: { brawn: 9, reflex: 10, grit: 8, intellect: 7, training: 6, presence: 5 }, gear: [["Flak Vest", 1], ["Carbine", 1], ["Knife", 1], ["Medkit", 1], ["Mag Boots", 1], ["Breather Mask", 1], ["Comm Bead", 1]], notes: "Ten years in the Accord Marines, two since. Takes salvage jobs because nobody asks about the discharge." } });
  const rookId = rook.id ?? rook.record?.id ?? rook.character?.id;
  const aaBook = (title) => (aaList.books ?? aaList).find((item) => item.title.includes(title))?.id;
  const salvage = aaBook("Salvage Rights");
  await tool("kraken_quickslots", { slots: [
    { kind: "sheet", record: rookId, label: "Rook" },
    { kind: "book", book: aaBook("Crew Handbook"), label: "Handbook" },
    { kind: "book", book: aaBook("Threat Dossier"), label: "Dossier" },
    { kind: "picture", book: salvage, file: "images/handout-lamp.webp", label: "The Lamp" },
    { kind: "picture", book: salvage, file: "images/handout-kestrel.webp", label: "Adrift" },
    { kind: "picture", book: salvage, file: "images/handout-cryo.webp", label: "Cryo bay" },
    { kind: "picture", book: salvage, file: "images/handout-reactor.webp", label: "Reactor" },
    { kind: "picture", book: salvage, file: "images/kestrel-deck1.webp", label: "Deck 1" },
    { kind: "picture", book: salvage, file: "images/kestrel-deck2.webp", label: "Deck 2" },
    { kind: "picture", book: aaBook("Threat Dossier"), file: "images/npc/mags-orrin.webp", label: "Mags Orrin" },
  ] });
  await tool("kraken_character_edit", { id: rookId, changes: [{ path: "exp", value: 3 }, { path: "hp.wounds", value: 4 }, { path: "appearance", value: "Shaved head, a burn scar up one arm, Marine tattoos half covered." }, { path: "homeworld", value: "Tessaly Station" }, { path: "contacts", value: "Dovan, tug pilot; Sergeant Ilse Marr, Accord Marines" }, { path: "ship", value: "None yet: the launch Gnat, rented" }] });
  await tool("kraken_open_fg_module", { module: "Salvage Rights", maps: ["Deck 1"] });
  await page.waitForSelector('.window[data-window="map"] .viewport', { timeout: 30000 });
  const deck = await waitDoors();
  const dc = Math.floor((deck.width ?? 1400) / (deck.grid ?? 70));
  const dr = Math.floor((deck.height ?? 1050) / (deck.grid ?? 70));
  console.log("deck", dc, dr);
  await tool("kraken_token_place", { recordId: rookId, col: 4, row: 8 });
  for (const [name, col, row] of [["Mags Orrin", 13, 7], ["Gull Crewman", 12, 9], ["Salvage Drone", 8, 4]]) {
    const placed = await tool("kraken_token_place", { recordId: await npcId(name), col, row });
    const tokenId = placed.id ?? placed.token?.id;
    if (tokenId) await tool("kraken_token_update", { id: tokenId, hidden: false });
  }
  for (const id of [rookId, await npcId("Mags Orrin"), await npcId("Gull Crewman"), await npcId("Salvage Drone")]) await tool("kraken_combat", { action: "add", recordId: id });
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "next" });
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await tool("kraken_windows", { action: "open", kind: "record", record: "Mags Orrin" });
  await settle(8000);
  await shot(page, "gm-kestrel");
  await tool("kraken_windows", { action: "close", kind: "record", record: "Mags Orrin" });
  await tool("kraken_windows", { action: "close", kind: "combat" });
  await tool("kraken_windows", { action: "open", kind: "sheet", record: rookId });
  await settle(2500);
  await shot(page, "sheet-astra");
  console.log("done");
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
