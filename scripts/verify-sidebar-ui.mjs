// FG's sidebar and sheet drops in the real app. The GM's sidebar has FG's
// categories (Library, Player, Campaign, Character) under a row of tools; the
// Player's Handbook made active fills Character's Classes, Races and Spells,
// each its own list, the book's records under the book's name. A class and a
// race dragged from those lists onto a character's sheet go into its packages
// (1st level, primes, hit points), an item into its gear, a spell (the tool)
// into its powers; a second class is refused. A category folds away; the
// arrow at the bottom steps through FG's three states (icons and names,
// icons, a thin strip) and back. A test player in Chrome has the same lists
// (the book's shared records) and drags a race onto their own character.
// Skipped without the C&C Player's Handbook.
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

const profile = mkdtempSync(path.join(tmpdir(), "kraken-sidebar-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
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
  return JSON.parse(text);
}
const listOf = (value) => (Array.isArray(value) ? value : value.records ?? []);
const until = async (what, test, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};
// A record's link dropped on a sheet, as the browser's drag and drop gives it.
const dropLink = (target, selector, link) =>
  target.evaluate(
    ([where, data]) => {
      const element = document.querySelector(where);
      const transfer = new DataTransfer();
      transfer.setData("text/kraken-slot", JSON.stringify(data));
      for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    },
    [selector, link],
  );
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const PHB = "C&C Player's Handbook";

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Sidebar UI", ruleset: "Castles & Crusades" });
  const port = 47419;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  const phb = (shelf.books ?? shelf).find((item) => item.name === PHB || item.title === PHB);
  if (!phb) {
    console.log(`skip sidebar ui: no ${PHB}`);
    process.exit(0);
  }

  // FG's categories under the tools; Character empty until a book is active.
  for (const group of ["library", "player", "campaign"]) await page.waitForSelector(`.sidebar [data-sidebar-group="${group}"]`);
  for (const button of ["combat", "players", "settings"]) assert(await page.$(`.sidebar-tools [data-launch="${button}"]`), `the ${button} tool is along the top`);
  for (const button of ["books:activation", "books", "sound", "characters", "party", "notes", "adventure:battle", "library", "records:item", "records:npc", "adventure:parcel", "adventure:table"]) assert(await page.$(`.sidebar [data-launch="${button}"]`), `the sidebar has ${button}`);
  assert(!(await page.$('.sidebar [data-sidebar-group="character"]')), "no Character category before a book is active");

  // The Player's Handbook made active (Modules: Activation).
  await page.click('.sidebar [data-launch="books:activation"]');
  await page.waitForSelector('[data-books-tab="activation"][aria-selected="true"]');
  await tool("kraken_books", { action: "activate", book: phb.id });
  for (const list of ["siegepackage:class", "siegepackage:race", "siegepower"]) await page.waitForSelector(`.sidebar [data-sidebar-group="character"] [data-launch="records:${list}"]`, { timeout: 30000 });
  const labels = await page.$$eval('.sidebar [data-sidebar-group="character"] .sidebar-label', (list) => list.map((item) => item.textContent));
  assert(labels.join(",") === "Classes,Races,Spells", `Character: Classes, Races, Spells (FG's C&C): ${labels}`);

  // Classes: its own window, the book's under the book's name.
  await page.click('.sidebar [data-launch="records:siegepackage:class"]');
  await page.waitForSelector(`[data-records-only="siegepackage:class"] [data-records-book="${PHB}"]`);
  const classes = await page.$$eval('[data-records-only="siegepackage:class"] .records-name', (list) => list.map((item) => item.textContent));
  assert(classes.includes("Fighter") && classes.includes("Wizard") && !classes.includes("Human"), `the Classes list: ${classes.slice(0, 20)}`);
  await page.click('.sidebar [data-launch="records:siegepackage:race"]');
  await page.waitForSelector('[data-records-only="siegepackage:race"] .records-name:text-is("Human")');

  // A character, its sheet open.
  // A book's record by name and package type (the list gives names; the record its fields).
  const byName = async (name, kind, type = "siegepackage") => {
    for (const item of listOf(await tool("kraken_records_list", { type, name, limit: 50 })).filter((row) => row.name === name)) {
      const record = await tool("kraken_record_get", { id: item.id });
      if (!kind || String(record.data?.packagetype ?? "").toLowerCase() === kind) return record;
    }
    return null;
  };
  const fighter = await byName("Fighter", "class");
  const dwarf = await byName("Dwarf", "race");
  const human = await byName("Human", "race");
  assert(fighter && dwarf && human, "the book's Fighter, Dwarf and Human");
  const scores = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: stat === "constitution" ? 14 : 12 }]));
  const hero = await tool("kraken_record_create", { type: "character", name: "Brannoc", visibility: "gm", data: { attributes: scores } });
  await tool("kraken_windows", { action: "open", kind: "sheet", record: hero.id });
  const sheet = `.cc-sheet[data-character="${hero.id}"]`;
  await page.waitForSelector(sheet);

  // The class dragged from the list onto the sheet: a real drag.
  await page.click('.sidebar [data-launch="records:siegepackage:class"]');
  const fighterRow = `[data-records-only="siegepackage:class"] [data-record-row="${fighter.id}"] .records-name`;
  await page.waitForSelector(fighterRow);
  // Onto a part of the sheet the list window does not cover.
  const spot = await page.evaluate((where) => {
    const body = document.querySelector(where).getBoundingClientRect();
    const list = document.querySelector('[data-records-only="siegepackage:class"]').closest(".window").getBoundingClientRect();
    for (let y = body.top + 20; y < body.bottom - 10; y += 20) {
      for (let x = body.left + 20; x < body.right - 10; x += 20) {
        const inside = x > list.left && x < list.right && y > list.top && y < list.bottom;
        if (!inside && document.elementFromPoint(x, y)?.closest(where)) return { x: x - body.left, y: y - body.top };
      }
    }
    return null;
  }, `${sheet} .cc-body`);
  assert(spot, "some of the sheet shows beside the list");
  await page.dragAndDrop(fighterRow, `${sheet} .cc-body`, { targetPosition: spot, force: true });
  const withClass = await until("the Fighter on the sheet", async () => {
    const record = await tool("kraken_record_get", { id: hero.id });
    return Object.values(record.data.packages ?? {}).some((pkg) => pkg.name === "Fighter") ? record : null;
  });
  const fighterPkg = Object.values(withClass.data.packages).find((pkg) => pkg.name === "Fighter");
  // 1st level: the d10 at its highest, plus Constitution 14's +1.
  assert(withClass.data.level === 1 && fighterPkg.level === 1 && withClass.data.hp.total === 11 && fighterPkg.hplog.l1 === 11, `a 1st level fighter with 11 hit points: ${JSON.stringify({ level: withClass.data.level, hp: withClass.data.hp, hplog: fighterPkg.hplog })}`);
  assert(withClass.data.attributes.strength.prime === 1, "the fighter's prime, Strength");
  await page.waitForSelector(`${sheet} .cc-value:text-is("Fighter")`);

  // A race (the link a list row gives), then another race replaces it.
  await dropLink(page, `${sheet} .cc-body`, { kind: "record", record: dwarf.id, label: "Dwarf" });
  await until("the Dwarf on the sheet", async () => (await tool("kraken_record_get", { id: hero.id })).data.race === "Dwarf");
  await dropLink(page, `${sheet} .cc-body`, { kind: "record", record: human.id, label: "Human" });
  const human2 = await until("Human replaces Dwarf", async () => {
    const record = await tool("kraken_record_get", { id: hero.id });
    return record.data.race === "Human" ? record : null;
  });
  const races = Object.values(human2.data.packages).filter((pkg) => String(pkg.packagetype).toLowerCase() === "race").map((pkg) => pkg.name);
  assert(races.join() === "Human", `one race package: ${races}`);
  await page.waitForSelector(`${sheet} .cc-value:text-is("Human")`);

  // An item into the gear, equipped (a weapon); a spell by the tool; a second class refused.
  const sword = await byName("Sword, Long", "", "item");
  assert(sword, "the book's long sword");
  await dropLink(page, `${sheet} .cc-body`, { kind: "record", record: sword.id, label: sword.name });
  const armed = await until("the sword in the gear", async () => {
    const record = await tool("kraken_record_get", { id: hero.id });
    return Object.values(record.data.inventorylist ?? {}).find((item) => item.name === sword.name) ? record : null;
  });
  assert(Number(Object.values(armed.data.inventorylist).find((item) => item.name === sword.name).carried) === 2, "the sword is equipped");
  const spell = await tool("kraken_character_drop", { id: hero.id, record: "Light", type: "siegepower" });
  assert(spell.added === "power" && spell.powers.includes("Light"), `the spell into the powers: ${JSON.stringify(spell)}`);
  const second = await tool("kraken_character_drop", { id: hero.id, record: "Wizard", type: "siegepackage" }).catch((error) => error.message);
  assert(/already has a class/.test(String(second)), `a second class is refused: ${second}`);
  const log = (await tool("kraken_chat_log", { lines: 20 }).catch(() => null)) ?? null;
  if (log) assert(JSON.stringify(log).includes("Fighter"), "chat says what the sheet got");

  // A category folds away and opens again.
  await page.click('.sidebar [data-sidebar-group="campaign"] .sidebar-category');
  await page.waitForSelector('.sidebar [data-sidebar-group="campaign"].folded');
  assert(!(await page.$('.sidebar [data-launch="records:npc"]')), "folded: Campaign's buttons are away");
  const listed = await tool("kraken_sidebar", { action: "list" });
  assert(listed.groups.find((group) => group.id === "campaign").folded === true, "the tool sees Campaign folded");
  await tool("kraken_sidebar", { action: "fold", group: "Campaign", folded: false });
  await page.waitForSelector('.sidebar [data-launch="records:npc"]');

  // The arrow: icons only, then a thin strip, then icons and names again.
  const width = () => page.$eval(".sidebar", (element) => element.getBoundingClientRect().width);
  const full = await width();
  await page.screenshot({ path: path.join(tmpdir(), "kraken-sidebar-0.png") });
  await page.click('[data-action="sidebar-visibility"]');
  await page.waitForSelector('.sidebar[data-sidebar-state="1"]');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const icons = await width();
  const heading = await page.$eval('.sidebar [data-sidebar-group="campaign"] .sidebar-category span', (element) => element.textContent);
  assert(heading === "Camp" && !(await page.isVisible('.sidebar [data-launch="records:npc"] .sidebar-label')), `icons only, the category cut to four letters: ${heading}`);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-sidebar-1.png") });
  await page.click('[data-action="sidebar-visibility"]');
  await page.waitForSelector('.sidebar[data-sidebar-state="2"]');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const strip = await width();
  assert((await page.getAttribute('[data-action="sidebar-visibility"]', "aria-label")) === "Expand the sidebar", "the arrow turns round on the thin strip");
  await page.screenshot({ path: path.join(tmpdir(), "kraken-sidebar-2.png") });
  assert(full > icons && icons > strip, `the sidebar narrows: ${full}, ${icons}, ${strip}`);
  await page.click('.sidebar [data-launch="records:npc"]');
  await page.waitForSelector('[data-records-only="npc"]');
  await page.click('[data-action="sidebar-visibility"]');
  await page.waitForSelector('.sidebar[data-sidebar-state="0"]');
  assert((await tool("kraken_sidebar", { action: "state", state: 1 })).state === 1, "the tool sets the state");
  await page.waitForSelector('.sidebar[data-sidebar-state="1"]');
  await tool("kraken_sidebar", { action: "state", state: 0 });
  await tool("kraken_sidebar", { action: "press", entry: "Races" });
  await page.waitForSelector('[data-records-only="siegepackage:race"]');

  // An adventure made active: its encounters under Campaign, its story entries under World (each opens its text).
  const b1 = (shelf.books ?? shelf).find((item) => /^B1 In Search of the Unknown/.test(item.name ?? item.title ?? ""));
  let adventure = "no B1 here";
  if (b1) {
    await tool("kraken_books", { action: "activate", book: b1.id });
    await page.click('.sidebar [data-launch="adventure:battle"]');
    await page.waitForSelector(`[data-adventure-list="battle"] [data-records-book="${b1.name}"] [data-library-item]`, { timeout: 30000 });
    await page.click('.sidebar [data-launch="adventure:story"]');
    const entry = '[data-adventure-list="story"] [data-library-item="00.03 Introduction"] [data-action="library-story"]';
    await page.waitForSelector(entry, { timeout: 30000 });
    await page.click(entry);
    await page.waitForSelector('.story-window .book-text:has-text("IN SEARCH OF THE UNKNOWN")', { timeout: 15000 });
    assert(!(await page.$(".story-window script")), "no markup from the entry runs");
    adventure = `B1's encounters and its story (the Introduction read)`;
  }

  // A test player: the same Character lists (the book is shared), and a race dropped on their own character.
  const mine = await tool("kraken_record_create", { type: "character", name: "Wren", owner: "A test player", visibility: "owner", data: { attributes: scores } });
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector('.sidebar [data-launch="records:siegepackage:race"]', { timeout: 20000 });
  assert(!(await seat.$('.sidebar [data-launch="books:activation"]')) && !(await seat.$('.sidebar [data-launch="adventure:battle"]')) && !(await seat.$('.sidebar [data-launch="adventure:story"]')), "a player has no Modules, Encounters or Story");
  await seat.click('.sidebar [data-launch="records:siegepackage:race"]');
  await seat.waitForSelector('[data-records-only="siegepackage:race"] .records-name:text-is("Elf")');
  const elf = await byName("Elf", "race");
  await seat.keyboard.press("Escape");
  await seat.evaluate(() => document.querySelector('.sidebar [data-launch="characters"]')?.click());
  await seat.waitForSelector(`.cc-sheet[data-character="${mine.id}"]`, { timeout: 15000 });
  await dropLink(seat, `.cc-sheet[data-character="${mine.id}"] .cc-body`, { kind: "record", record: elf.id, label: "Elf" });
  await until("the player's Elf", async () => (await tool("kraken_record_get", { id: mine.id })).data.race === "Elf");
  // What the GM's hidden character got stays with the GM; the player's Elf is said to all.
  const heard = await seat.textContent(".chat-dock");
  assert(!/Brannoc/.test(heard) && /Elf/.test(heard), `the player hears their own drop, not the GM's hidden character's: ${heard.slice(-400)}`);
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-sidebar-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok sidebar ui: FG's categories under the tools; the Player's Handbook active fills Character (Classes, Races, Spells), each its own list under the book's name; the Fighter dragged onto a sheet (1st level, 11 hit points, Strength prime), a race and then another replacing it, a long sword equipped, a spell by the tool, a second class refused; Campaign folds away and back; the arrow steps icons and names (${Math.round(full)}px), icons (${Math.round(icons)}px), a thin strip (${Math.round(strip)}px) and back; ${adventure}; a test player has the lists and drops a race on their own character. ${path.join(tmpdir(), "kraken-sidebar-0.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
