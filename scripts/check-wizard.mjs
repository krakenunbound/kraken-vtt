// The creation wizard, driven like a player in the real app with fixed dice:
// roll 3d6 arrange, swap two scores, Dwarf, Fighter, pick the race's extra
// prime, roll hit points and coin, buy gear, name, create. The new character
// must equal what the builder (already matched with FG, check-pregens) makes
// from the same choices, and the host must have rolled every die.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";
import { buildFromSpec } from "../shared/siege/builder.mjs";

const require = createRequire(import.meta.url);
const { readModule } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-wizard-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const waits = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  waits.get(message.id)?.(message);
});
let next = 0;
function rpc(method, params) {
  const id = ++next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    waits.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check-wizard", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Wizard Test", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47392, password: "" });
  await tool("kraken_import_fg_module", { module: "C&C Player's Handbook" });

  await page.getByRole("tab", { name: "Characters" }).click();
  await page.click('[data-action="new-character"]');

  // Abilities: 3d6 x 6, fixed: 15, 12, 16, 9, 13, 6; then swap STR and CON.
  await tool("kraken_dice_force", { values: [6, 5, 4, 3, 4, 5, 6, 6, 4, 2, 3, 4, 5, 5, 3, 1, 2, 3] });
  await page.click('[data-action="roll-abilities"]');
  await page.waitForFunction(() => document.querySelector('[data-final="charisma"]')?.textContent === "6");
  await page.click('[data-stat="strength"]');
  await page.click('[data-stat="constitution"]');
  await page.waitForFunction(() => document.querySelector('[data-final="strength"]')?.textContent === "16");

  // Race and class.
  await page.click('[data-wizard-tab="race"]');
  await page.click('[data-race="Dwarf"]');
  await page.click('[data-wizard-tab="class"]');
  assert(await page.locator('[data-class="Fighter"]').isEnabled(), "Fighter open to a dwarf");
  await page.click('[data-class="Fighter"]');

  // Primes: strength from the class, constitution from the dwarf's extra prime.
  await page.click('[data-wizard-tab="primes"]');
  await page.getByLabel("constitution prime").check();
  assert(await page.getByLabel("wisdom prime").isDisabled(), "no third prime");

  // Hit points: d10 fixed 8, + Constitution 16 (+2) = 10.
  await page.click('[data-wizard-tab="hp"]');
  await tool("kraken_dice_force", { values: [8] });
  await page.click('[data-action="roll-hp"]');
  await page.waitForSelector('[data-hp-total="10"]');

  // Coin, then gear.
  await page.click('[data-wizard-tab="equipment"]');
  await tool("kraken_dice_force", { values: [6, 6, 6, 6, 6, 6] });
  await page.click('[data-action="roll-gold"]');
  await page.waitForFunction(() => Number(document.querySelector("[data-coin-left]")?.getAttribute("data-coin-left")) > 0);
  const purse = Number(await page.locator("[data-coin-left]").getAttribute("data-coin-left"));
  for (const item of ["Sword, Long", "Scale Mail", "Shield, Medium Steel", "Backpack", "Torch", "Torch"]) {
    await page.getByLabel("Shop search").fill(item);
    await page.getByRole("button", { name: `Buy ${item}`, exact: true }).click();
  }
  await page.getByLabel("Shop search").fill("");
  await page.click('[data-wizard-tab="spells"]');
  await page.waitForSelector("text=This class casts no spells");

  // Finish.
  await page.click('[data-wizard-tab="finish"]');
  await page.getByLabel("Character name").fill("Borin Stonefist");
  await page.getByLabel("alignment").fill("Lawful Neutral");
  await page.getByLabel("deity").fill("Moradin");
  assert((await page.locator(".warnings li").count()) === 0, "nothing left to choose");
  await page.click('[data-action="create-character"]');
  await page.waitForSelector('[data-character] h2:has-text("Borin Stonefist")', { timeout: 30000 });

  const listed = await tool("kraken_records_list", { type: "character" });
  assert(listed.total === 1, `characters ${listed.total}`);
  const made = (await tool("kraken_record_get", { id: listed.records[0].id })).data;

  // The same choices through the builder directly.
  const books = readModule("C&C Player's Handbook").records;
  const library = {
    packages: books.filter((r) => r.type === "siegepackage").map((r) => r.data),
    items: books.filter((r) => r.type === "item").map((r) => r.data),
    powers: books.filter((r) => r.type === "siegepower").map((r) => r.data),
    game: books.find((r) => r.type === "siegegame")?.data,
  };
  const expected = buildFromSpec(
    {
      name: "Borin Stonefist",
      race: "Dwarf",
      class: "Fighter",
      level: 1,
      scores: { strength: 16, dexterity: 11, constitution: 16, intelligence: 9, wisdom: 13, charisma: 6 },
      primes: ["strength", "constitution"],
      hp: [10],
      gold: purse / 100,
      gear: [["Sword, Long", 1], ["Scale Mail", 1], ["Shield, Medium Steel", 1], ["Backpack", 1], ["Torch", 2]],
    },
    library,
  ).character;
  for (const [field, got, want] of [
    ["strength", made.attributes.strength.score, 16],
    ["dexterity (dwarf -1)", made.attributes.dexterity.score, 11],
    ["constitution (dwarf +1)", made.attributes.constitution.score, 16],
    ["constitution prime", made.attributes.constitution.prime, 1],
    ["hp", made.hp.total, 10],
    ["ac", made.ac.total, expected.ac.total],
    ["bth", made.bth, expected.bth],
    ["expnext", made.expnext, expected.expnext],
    ["coins", JSON.stringify(made.coins), JSON.stringify(expected.coins)],
    ["inventory", Object.values(made.inventorylist).map((i) => `${i.name}x${i.count}c${i.carried}`).join(","), Object.values(expected.inventorylist).map((i) => `${i.name}x${i.count}c${i.carried}`).join(",")],
    ["deity", made.deity, "Moradin"],
  ]) {
    assert(got === want, `${field}: ${got} want ${want}`);
  }
  const rolls = (await tool("kraken_chat_log", { count: 30 })).filter((line) => line.roll?.label?.startsWith("Wizard:"));
  assert(rolls.length === 8, `host rolled ${rolls.length} wizard rolls`);
  await page.screenshot({ path: path.join(profile, "wizard-result.png") });
  await tool("kraken_leave");
  console.log(`ok wizard: created Borin Stonefist (HP ${made.hp.total}, AC ${made.ac.total}, BtH ${made.bth}) equal to the builder; 8 host rolls. ${path.join(profile, "wizard-result.png")}`);
} finally {
  child.stdin.end();
  await app.close();
}
