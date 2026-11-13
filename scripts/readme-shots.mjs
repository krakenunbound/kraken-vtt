// Screenshots for the README (docs/screenshots): the start screens, a
// Descending Darkness table (the crypt in torchlight, the combat tracker, a
// sheet), what a test player sees in Chrome, ability cards (the player's and
// the GM's), a book, an Apeira Astra table
// (the derelict's deck, a threat's record), the map editor; and the table in
// play: a player's turn banner, shapes drawn in a player's colour, death
// markers, the Calendar, the Message of the Day, read-aloud, the external dice
// tower (the Kraken Lighthouse) with picture dice from a dice pack, the Dice
// window, the hex-grid desktop, the map editor, Map Studio, the sci-fi desktop.
// Only Kraken's own games: the GM's FG modules and packs are kept out
// (KRAKEN_BOOKS and KRAKEN_PACKS point at empty folders).
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
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Kraken VTT", "Packs") };
delete env.KRAKEN_HOME;
// Only the scenes named (SHOTS=crypt,calendar,...), or all.
const ONLY = (process.env.SHOTS_ONLY || "").split(",").filter(Boolean);
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
// Every window but the map closed (a clear table for the next shot).
const clearWindows = async (where) => {
  await where.evaluate(() => document.querySelectorAll('section.window:not([data-window="map"]) button[aria-label^="Close "]').forEach((button) => button.click()));
  await settle(500);
};
// A scene of its own: shot if it can be, logged if not.
async function scene(name, run) {
  if (ONLY.length && !ONLY.includes(name)) return;
  try {
    await clearWindows(page);
    await run();
  } catch (error) {
    console.log("scene failed:", name, String(error?.message ?? error).split("\n")[0]);
  }
}
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
  await tool("kraken_windows", { action: "close", kind: "book", book: handbook }).catch(() => undefined);
  await page.keyboard.press("Escape").catch(() => undefined);
  const mapBox = async (where) => where.locator('.window[data-window="map"] .viewport').boundingBox();
  const entries = async () => (await tool("kraken_combat")).entries;
  const entryOf = async (recordId) => (await entries()).find((entry) => entry.recordId === recordId);
  // Ann's colour (Settings > You at the table): her token's ring, her pings and drawings.
  await tool("kraken_dice_settings", { who: "Ann", color: "#5aa9ff" });

  // Ann's turn: the banner across her screen.
  await scene("turn", async () => {
    await clearWindows(seat);
    await tool("kraken_combat", { action: "set-turn", id: (await entryOf(warden)).id });
    await settle(800);
    await tool("kraken_combat", { action: "set-turn", id: (await entryOf(brennaId)).id });
    await seat.waitForSelector(".turn-banner", { timeout: 10000 });
    await settle(700);
    await shot(seat, "player-turn");
    await seat.waitForSelector(".turn-banner", { state: "detached", timeout: 10000 }).catch(() => undefined);
  });

  // Ann aims: a cone, an arrow and a circle drawn in her colour, measured as drawn.
  await scene("shapes", async () => {
    const box = await mapBox(seat);
    await seat.click('.window[data-window="map"] [data-tool="draw"]');
    const draw = async (shape, from, to, hold = false) => {
      await seat.click(`.window[data-window="map"] [data-draw-shape="${shape}"]`);
      await seat.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
      await seat.mouse.down();
      await seat.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
      if (hold) return;
      await seat.mouse.up();
      await settle(300);
    };
    await draw("arrow", [0.36, 0.62], [0.55, 0.47]);
    await draw("cone", [0.33, 0.58], [0.47, 0.4]);
    await draw("circle", [0.62, 0.42], [0.69, 0.47], true);
    await settle(600);
    await shot(seat, "player-shapes");
    await seat.mouse.up();
    await seat.click('.window[data-window="map"] [data-tool="pan"]').catch(() => undefined);
  });

  // The Bone Sentinels fall: death markers where they stood (their tokens cleared).
  await scene("markers", async () => {
    const view = await tool("kraken_combat");
    const fallen = view.entries.filter((entry) => entry.recordId === sentinel);
    for (const entry of fallen) await tool("kraken_combat", { action: "damage", id: entry.id, amount: 99 });
    await settle(800);
    const map = await tool("kraken_map", {});
    for (const token of (map.tokens ?? []).filter((item) => item.recordId === sentinel)) await tool("kraken_token_remove", { id: token.id });
    await tool("kraken_death_markers", { action: "place", x: (map.tokens ?? []).find((item) => item.recordId === warden)?.x - 140, y: (map.tokens ?? []).find((item) => item.recordId === warden)?.y + 90, set: "skull-round", variant: 1, size: 1 }).catch(() => undefined);
    await tool("kraken_windows", { action: "open", kind: "deathmarkers" });
    await settle(2500);
    await shot(page, "death-markers");
    await tool("kraken_windows", { action: "close", kind: "deathmarkers" });
  });

  // The Calendar: the Waning Count, notes from the GM and from Ann on the days ahead.
  await scene("calendar", async () => {
    const cal = await tool("kraken_calendar");
    await tool("kraken_calendar", { action: "set", month: 5, day: 12, hour: 21, minute: 40 });
    await tool("kraken_calendar", { action: "note-add", month: 5, day: 14, text: "Mother Hesk's tonic is ready to collect from the herbalist." });
    await tool("kraken_calendar", { action: "note-add", month: 5, day: 19, text: "New moon: the dead walk the old road.", shown: false });
    await page.evaluate(() => undefined);
    await seat.click('[data-launch="calendar"]');
    await seat.waitForSelector(".calendar-window [data-cal-today]");
    void cal;
    const day = (await tool("kraken_calendar")).day + 1;
    await seat.click(`.calendar-window [data-cal-day="${day}"]`);
    await seat.fill('.calendar-window [data-field="cal-note"]', "Brenna owes the smith 3 silver for the new shield strap.");
    await seat.click('.calendar-window [data-action="cal-note-add"]');
    await settle(800);
    await seat.click('[aria-label="Close Calendar"]');
    await tool("kraken_windows", { action: "open", kind: "calendar" });
    await page.waitForSelector(".calendar-window [data-cal-today]");
    await page.click(`.calendar-window [data-cal-day="${day + 1}"]`);
    await settle(1500);
    await shot(page, "calendar");
    await tool("kraken_windows", { action: "close", kind: "calendar" });
  });

  // The Message of the Day: what a second player sees as they join.
  await scene("motd", async () => {
    await tool("kraken_table_options", { motd: { text: "Welcome back to Hollowmere.\n\nLast time: you broke the seal on the Watchtower's crypt and the Warden woke. Brenna is hurt; Tomas has two Mend Wounds left.\n\nTonight: the crypt, and whatever is still moving down there. Bring torches.", links: [{ kind: "picture", book: adventure, file: "images/watchtower-crypt.webp", label: "The crypt" }, { kind: "picture", book: adventure, file: "images/handout-journal.webp", label: "Aldous's journal" }, { kind: "book", book: handbook, page: globalThis.dreadPage?.page, label: "Dread" }] } });
    const second = await (await browser.newContext({ viewport: SCREEN })).newPage();
    await second.goto("http://127.0.0.1:47461/");
    await second.fill('input[name="name"]', "Cal");
    await second.fill('input[name="account-password"]', "test-pass");
    await second.click('button[type="submit"]');
    await second.waitForSelector(".motd-window", { timeout: 20000 });
    await second.locator('button[aria-label="Close Character Selection"]').click().catch(() => {});
    await settle(3000);
    await shot(second, "player-motd");
    await second.close();
  });

  // Read aloud: the adventure's boxed text, over Ann's map.
  await scene("readaloud", async () => {
    await tool("kraken_read_aloud", { title: "The Crypt", text: "The stair ends in cold dark. Your torchlight finds a long vault of niches, each holding a shape wrapped in grey cloth. At the far end a lantern burns with a blue flame that gives no warmth, and beneath it something tall turns its head toward you." });
    await clearWindows(seat);
    await seat.waitForSelector(".read-aloud-bubble", { timeout: 10000 });
    await settle(1200);
    await shot(seat, "player-read-aloud");
    await seat.click(".read-aloud-bubble").catch(() => undefined);
    await page.click(".read-aloud-bubble").catch(() => undefined);
  });

  // The dice tower on the table (the Kraken Lighthouse, lit), and picture dice from a dice pack rolling.
  await scene("tower", async () => {
    await tool("kraken_table_options", { towerExternal: true });
    const looks = await tool("kraken_tower", { action: "list" });
    const lighthouse = looks.pictures.find((item) => /Lighthouse/.test(item.id));
    if (lighthouse) await tool("kraken_tower", { action: "style", id: lighthouse.id });
    await tool("kraken_tower", { action: "lock", x: SCREEN.width - 470, y: SCREEN.height - 330 });
    await tool("kraken_tower", { action: "on" });
    await tool("kraken_dice_settings", { preset: "Kraken Hide" }).catch(() => tool("kraken_dice_settings", { preset: "Aether Core" }));
    await tool("kraken_table_options", { diceHold: 12 });
    await settle(1500);
    await tool("kraken_roll", { formula: "1d20+4", label: "Brenna: attack the Warden" });
    await tool("kraken_roll", { formula: "2d6+3", label: "[DAMAGE] Warhammer" });
    await settle(2600);
    await shot(page, "dice-tower");
  });

  // The Dice window: Kraken's sets and a dice pack's.
  await scene("dicewindow", async () => {
    await tool("kraken_windows", { action: "open", kind: "dice" });
    await page.waitForSelector(".dice-window");
    await page.click('.dice-window [aria-label="Groups"] >> text=Kraken Sea Glass').catch(() => undefined);
    await settle(3500);
    await shot(page, "dice-window");
    await tool("kraken_windows", { action: "close", kind: "dice" });
  });

  // The map editor, unlocked: walls, doors, lights.
  await scene("editor", async () => {
    await page.click('.window[data-window="map"] [data-action="map-editor"]');
    await settle(2500);
    await shot(page, "map-editor");
    await page.click('.window[data-window="map"] [data-action="map-editor"]');
  });

  // The desktop with no map up: the hex grid on black, the Kraken decal, the tower.
  await scene("desktop", async () => {
    const hex = (await tool("kraken_decal", { kind: "wallpaper", action: "list", search: "Hex Grid Slate" })).wallpapers[0];
    await tool("kraken_decal", { kind: "wallpaper", action: "set", id: hex.id });
    await page.click('.window[data-window="map"] [aria-label^="Close"]').catch(() => undefined);
    await settle(3000);
    await shot(page, "desktop-hex");
  });

  // Map Studio, Kraken's map maker.
  await scene("studio", async () => {
    await tool("kraken_windows", { action: "open", kind: "studio" });
    await settle(9000);
    await shot(page, "map-studio");
    await tool("kraken_windows", { action: "close", kind: "studio" });
  });

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
  await tool("kraken_windows", { action: "close", kind: "sheet", record: rookId }).catch(() => undefined);
  await scene("scifi", async () => {
    const amber = (await tool("kraken_decal", { kind: "wallpaper", action: "list", search: "Hex Grid Amber" })).wallpapers[0];
    if (amber) await tool("kraken_decal", { kind: "wallpaper", action: "set", id: amber.id });
    const ringed = (await tool("kraken_decal", { action: "list", search: "Ringed World" })).decals[0];
    if (ringed) await tool("kraken_decal", { action: "set", id: ringed.id });
    await page.click('.window[data-window="map"] [aria-label^="Close"]').catch(() => undefined);
    await clearWindows(page);
    await settle(3500);
    await shot(page, "desktop-scifi");
  });
  console.log("done");
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
