// The core sheet parts (src/core/parts) in the real app, on Cairn's sheet,
// which is all core parts laid out by shared/cairn/manifest.mjs: every
// control a player or the GM uses is pressed once and the record checked
// (the field edits, the stat block's save, + and - on Fatigue, Deprived, the
// item select, Cast with In danger, Use, a relic's charge, a scroll used up,
// drop and add an item, the attack mode, a scar's Recover, growth added and
// dropped, the GM's growth roll, a milestone ticked, added and removed,
// Stabilize while dying). The same run passes on the hand-written sheet it
// replaced (the hooks and aria-labels are the same), so a build from before
// the change can be checked the same way. Full-screen shots of each tab go to
// OUT (default: the temp folder's kraken-core-parts), for before/after.
//   node scripts/verify-core-parts-ui.mjs [OUT]
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const OUT = process.argv[2] ?? path.join(tmpdir(), "kraken-core-parts");
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), "kraken-core-parts-"));
for (const dir of ["no-fg-modules", "Packs"]) mkdirSync(path.join(profile, dir), { recursive: true });
const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 90000);
    answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) throw new Error(message);
};
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
// The whole screen, and the sheet alone (for a pixel comparison: the chat and the dice differ run to run).
const shot = async (name) => {
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, `cairn-dressed-screen-${name}.png`), animations: "disabled", caret: "hide" });
  await page.locator(".cc-sheet").first().screenshot({ path: path.join(OUT, `cairn-dressed-sheet-${name}.png`), animations: "disabled", caret: "hide" });
};

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "core-parts", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Core parts", ruleset: "Cairn" });
  await tool("kraken_host", { campaignId: campaign.id, port: 48600 + Math.floor(Math.random() * 300), password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  for (const book of (Array.isArray(listed) ? listed : listed.books ?? []).filter((item) => /Cairn/.test(item.title))) await tool("kraken_books", { action: "activate", book: book.id });

  // A character made with the book's procedure (every roll given), then dressed with what the sheet has to show.
  const built = await tool("kraken_build_character", { spec: { name: "Sparrow", background: "Cutpurse", attributes: { str: 10, dex: 14, wil: 12 }, hp: 4, age: 31, gold: 10, results: [{ table: 0, roll: 1 }, { table: 1, roll: 3 }], traits: { physique: "Lanky", vice: "Greedy" }, bond: "A strange compass" } });
  const id = built.id ?? built.record?.id;
  assert(id, `a character: ${JSON.stringify(built).slice(0, 200)}`);
  await tool("kraken_record_update", {
    id,
    data: {
      inventorylist: {
        "id-901": { name: "Spellbook of Light", kind: "spellbook", text: "A light as bright as a torch.", carried: 1 },
        "id-902": { name: "Scroll of Sleep", kind: "scroll", petty: 1, carried: 1 },
        "id-903": { name: "Horn of Calling", kind: "relic", charges: 2, petty: 1, carried: 1 },
        "id-904": { name: "Waterskin", uses: 3, petty: 1, carried: 1 },
      },
      scars: { "id-1": { name: "Walloped", text: "Knocked flat.", pending: 1, roll: 1 } },
      growth: { "id-1": { text: "Learned to swim" } },
      milestones: { "id-1": { name: "Build a boat", done: 0 } },
    },
  });
  const data = async () => (await tool("kraken_record_get", { id })).data;
  const until = async (test, what) => {
    checks += 1;
    for (let i = 0; i < 40; i++) {
      const now = await data();
      if (test(now)) return now;
      await settle(150);
    }
    throw new Error(`never so: ${what}`);
  };
  const opening = Date.now();
  await tool("kraken_windows", { action: "open", kind: "sheet", record: id });
  const sheet = page.locator('.cc-sheet[data-ruleset="cairn"]');
  await sheet.waitFor({ timeout: 20000 });
  // How long the sheet takes to open and a tab to show (docs/core-ui-design.md, risk 3: the renderer must not be slower).
  const opened = Date.now() - opening;
  const switches = [];
  const tab = async (name) => {
    const started = Date.now();
    await sheet.locator(`[data-sheet-tab="${name}"]`).click();
    await sheet.locator(`[data-tab-page="${name}"]`).waitFor();
    switches.push(Date.now() - started);
    await settle(300);
  };
  const type = async (label, text, area = false) => {
    const box = sheet.locator(`[aria-label="${label}"]`).first();
    await box.fill(text);
    await box.press(area ? "Tab" : "Enter");
    await box.blur().catch(() => undefined);
  };

  // (A box the record decides is clicked, not checked: it ticks when the host says so.)
  // Main: the header's Age, the stat block's fields and save, Fatigue's + and -, Deprived.
  await shot("main");
  assert((await sheet.locator('[data-stat="background"]').textContent()) === "Cutpurse", "the background in the header");
  await type("Age", "40");
  await until((d) => d.age === 40, "Age typed");
  await type("str now", "9");
  await until((d) => d.attributes.str.score === 9, "STR now typed");
  assert(await sheet.locator('[data-attribute="dex"] [data-roll-save="dex"]').count(), "a save button per attribute");
  await sheet.locator('[data-action="fatigue-add"]').click();
  await until((d) => d.fatigue === 1, "a Fatigue added");
  await sheet.locator('[data-action="fatigue-remove"]').click();
  await until((d) => d.fatigue === 0, "the Fatigue removed");
  await sheet.locator('[data-action="cairn-deprived"]').click();
  await until((d) => d.deprived === 1, "deprived");
  await sheet.locator('[data-action="cairn-deprived"]').click();
  await until((d) => d.deprived === 0, "no longer deprived");

  // Inventory: the slots, the select, Cast (in danger), a relic's Use, a scroll used up, Use, drop and add.
  await tab("inventory");
  await shot("inventory");
  const slots = Number(await sheet.locator("[data-slots]").getAttribute("data-slots"));
  assert(slots === (await data()).slots.used, `the slots shown are the record's: ${slots}`);
  await sheet.locator('[data-item="id-903"] select').selectOption("2");
  await until((d) => d.inventorylist["id-903"].carried === 2, "the relic on the body");
  await sheet.getByText("In danger").click();
  await sheet.locator('[data-item="id-901"] [data-action="cast"]').click();
  await until((d) => d.fatigue === 1, "the spellbook cast: +1 Fatigue");
  const saveLines = await tool("kraken_chat_log", { count: 30 });
  assert(JSON.stringify(saveLines).includes("[SAVE] WIL"), "in danger, a WIL save first");
  assert((await sheet.locator('[data-item="id-903"] [data-action="cast"]').textContent()) === "Use", "a relic's button says Use");
  await sheet.locator('[data-item="id-903"] [data-action="cast"]').click();
  await until((d) => d.inventorylist["id-903"].charges === 1, "the relic's charge spent");
  await sheet.locator('[data-item="id-902"] [data-action="cast"]').click();
  await until((d) => !d.inventorylist["id-902"], "the scroll read and gone");
  await sheet.locator('[data-item="id-904"] [data-action="use"]').click();
  await until((d) => d.inventorylist["id-904"].uses === 2, "a use spent");
  await sheet.locator('[aria-label="Drop Waterskin"]').click();
  await until((d) => !d.inventorylist["id-904"], "the waterskin dropped");
  await type("Add an item", "Rope (25ft)");
  await until((d) => Object.values(d.inventorylist).some((item) => item.name === "Rope"), "a rope added");
  assert(await sheet.locator('[aria-label="GP coins"], [aria-label="gp coins"]').count(), "the coins");

  // Combat: the attack mode changes the die on the buttons.
  await tab("combat");
  assert(await sheet.locator("[data-attack] [data-action=attack]").count(), "an attack per weapon");
  await sheet.locator('[aria-label="Attack modifier"]').selectOption("enhanced");
  assert((await sheet.locator("[data-attack] [data-action=attack]").first().textContent()) === "d12", "enhanced: d12");
  await shot("combat");
  await sheet.locator('[aria-label="Attack modifier"]').selectOption("");

  // Character: a trait and the bond.
  await tab("character");
  await type("Bond", "A debt to the ferryman", true);
  await until((d) => d.bond === "A debt to the ferryman", "the bond typed");
  await shot("character");

  // Growth: a scar's Recover, growth added and dropped, the GM's roll, milestones.
  await tab("growth");
  await shot("growth");
  assert(Number(await sheet.locator("[data-scars]").getAttribute("data-scars")) === 1, "one scar");
  await sheet.locator('[data-scar="id-1"] [data-action="scar-recover"]').click();
  await until((d) => !d.scars["id-1"].pending, "the scar recovered");
  await type("New growth", "Can read the stars");
  await until((d) => Object.keys(d.growth).length === 2, "growth added");
  await sheet.locator('[data-growth="id-1"] [aria-label="Remove"]').click();
  await until((d) => !d.growth["id-1"], "growth dropped");
  await sheet.locator('[data-action="grow-hp"]').click();
  await until((d) => Object.values(d.growth).some((item) => /Growth:/.test(item.text)), "the GM's growth roll written in");
  await sheet.locator('[data-milestone="id-1"] input[type="checkbox"]').click();
  await until((d) => d.milestones["id-1"].done === 1, "the milestone ticked");
  await type("New milestone", "Find the lost lighthouse");
  await until((d) => Object.keys(d.milestones).length === 2, "a milestone added");
  await sheet.locator('[data-milestone="id-1"] [aria-label="Remove milestone"]').click();
  await until((d) => !d.milestones["id-1"], "the milestone removed");

  // Notes, then dying: the State box and Stabilize.
  await tab("notes");
  await type("Notes", "Owes the guild", true);
  await until((d) => d.notes === "Owes the guild", "the notes typed");
  await tool("kraken_record_update", { id, data: { critical: "dying", status: "Dying" } });
  await tab("main");
  await page.waitForSelector('[data-cairn-status="Dying"]', { timeout: 10000 });
  await shot("dying");
  await sheet.locator('[data-action="cairn-stabilize"]').click();
  await until((d) => d.critical === "stable", "stabilized");

  assert(failures.length === 0, `no page errors: ${failures.join(" | ")}`);
  console.log(`CORE_PARTS_UI_OK ${checks} checks; shots in ${OUT}; the sheet opened in ${opened} ms, a tab in ${Math.max(...switches)} ms at most (${switches.join(", ")})`);
} catch (error) {
  await page.screenshot({ path: path.join(OUT, "cairn-dressed-failure.png") }).catch(() => undefined);
  console.error(`CORE_PARTS_UI_FAIL after ${checks} checks: ${error.message}`);
  process.exitCode = 1;
} finally {
  child.kill();
  await app.close().catch(() => undefined);
}
