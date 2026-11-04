// The creation wizard, driven like a player in the real app with fixed dice:
// roll 3d6 arrange, swap two scores, Dwarf, Fighter, pick the race's extra
// prime, roll hit points and coin, buy gear, name, create. The new character
// must equal what the builder (already matched with FG, check-pregens) makes
// from the same choices, and the host must have rolled every die.
import "./loopback.mjs";
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
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
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

  await page.click('[data-launch="characters"]');
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
  await page.waitForSelector('[data-action="change-race"]');
  await page.click('[data-wizard-tab="class"]');
  assert(await page.locator('[data-class="Fighter"]').isEnabled(), "Fighter open to a dwarf");
  await page.click('[data-class="Fighter"]');

  // Primes: strength from the class, constitution from the dwarf's extra prime.
  await page.click('[data-wizard-tab="primes"]');
  await page.getByLabel("constitution prime").check();
  // A third prime is refused with a message, as FG's wizard does.
  await page.getByLabel("wisdom prime").click();
  assert(!(await page.getByLabel("wisdom prime").isChecked()), "no third prime");
  await page.waitForSelector(".ccw-note:has-text('2 primes in total')");

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
  assert((await page.locator('[data-wizard-tab="spells"]').count()) === 0, "no Spells page for a fighter");

  // Finish.
  await page.click('[data-wizard-tab="finish"]');
  await page.getByLabel("Character name").fill("Borin Stonefist");
  await page.getByLabel("alignment").selectOption("Lawful Neutral");
  await page.getByLabel("deity").fill("Moradin");
  assert((await page.locator(".ccw-warning").count()) === 0, "nothing left to choose");
  await page.click('[data-action="create-character"]');
  await page.waitForFunction(() => document.querySelector('[data-character] .cc-name')?.value === "Borin Stonefist", null, { timeout: 30000 });

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

  // A second character: an Elf Wizard started at level 3, so the class sets
  // three hit point rolls and spells, then dropped to level 2 to see the
  // spells trimmed, as FG's wizard does.
  await page.click('[data-action="new-character"]');
  await page.waitForSelector(".ccw");
  // STR 9, DEX 14, CON 13, INT 17, WIS 10, CHA 11.
  await tool("kraken_dice_clear");
  await tool("kraken_dice_force", { values: [3, 3, 3, 5, 5, 4, 5, 4, 4, 6, 6, 5, 4, 3, 3, 4, 4, 3] });
  await page.click('[data-action="roll-abilities"]');
  await page.waitForFunction(() => document.querySelector('[data-final="charisma"]')?.textContent === "11");
  await page.click('[data-wizard-tab="race"]');
  await page.click('[data-race="Elf"]');
  await page.waitForSelector('[data-action="change-race"]');
  await page.click('[data-wizard-tab="class"]');
  await page.click('[data-class="Wizard"]');
  for (let i = 0; i < 2; i++) await page.getByLabel("Higher starting level").click();
  assert((await page.locator("[data-start-level]").textContent()) === "3", "starting level 3");
  await page.click('[data-wizard-tab="primes"]');
  await page.getByLabel("dexterity prime").check();
  await page.click('[data-wizard-tab="hp"]');
  await tool("kraken_dice_force", { values: [3, 4, 2] });
  await page.click('[data-action="roll-hp"]');
  await page.waitForSelector('[data-hp-total="9"]');
  await page.click('[data-wizard-tab="equipment"]');
  await tool("kraken_dice_force", { values: [5] });
  await page.click('[data-action="roll-gold"]');
  await page.waitForSelector('[data-coin-left="5000"]');
  for (const item of ["Dagger", "Backpack"]) {
    await page.getByLabel("Shop search").fill(item);
    await page.getByRole("button", { name: `Buy ${item}`, exact: true }).click();
  }
  assert((await page.getByRole("button", { name: "Buy Sword, Long", exact: true }).count()) === 0, "no long sword for a wizard");
  await page.click('[data-wizard-tab="spells"]');
  // Tick every spell the wizard may: the first ones at each level.
  const levels = await page.$$eval('[aria-label="Spell level"] option', (options) => options.map((option) => option.value).filter((value) => value !== "all"));
  const picked = [];
  for (const level of levels) {
    await page.getByLabel("Spell level").selectOption(level);
    const plan = await page.locator(`.ccw-plan`).allTextContents();
    const allowed = Number(/of (\d+)/.exec(plan.find((line) => line.startsWith(level === "0" ? "0-level" : `Level ${level}`)) ?? "")?.[1]);
    const boxes = page.locator('.ccw-spell input[type="checkbox"]');
    for (let i = 0; i < allowed; i++) {
      await boxes.nth(i).check();
      picked.push((await page.locator(".ccw-spell .ccw-pick-name").nth(i).textContent()).trim());
    }
  }
  assert(picked.length > 0, "the wizard offers spells");
  await page.getByLabel("Spell level").selectOption("all");
  await page.waitForSelector('[data-wizard-tab="spells"] .ccw-tab-badge.done');
  // Down to level 2: the hit points go and the level-2 spell is trimmed.
  await page.click('[data-wizard-tab="class"]');
  await page.getByLabel("Lower starting level").click();
  await page.waitForSelector(".ccw-note:has-text('Spell choices exceeding')");
  await page.click('[data-wizard-tab="hp"]');
  await page.waitForSelector("text=Your previous HP roll was cleared");
  await tool("kraken_dice_force", { values: [3, 4] });
  await page.click('[data-action="roll-hp"]');
  await page.waitForSelector('[data-hp-total="7"]');
  await page.click('[data-wizard-tab="spells"]');
  const kept = await page.$$eval(".ccw-spell", (rows) => rows.filter((row) => row.querySelector("input")?.checked).map((row) => row.querySelector(".ccw-pick-name")?.textContent?.trim()));
  assert(kept.length < picked.length && kept.every((name) => picked.includes(name)), `spells after the level change: ${kept.join(", ")}`);
  await page.click('[data-wizard-tab="finish"]');
  // A wizard may take any alignment; a paladin only one (checked below).
  assert((await page.locator('[aria-label="alignment"] option').count()) === 10, "a wizard's alignments");
  await page.getByLabel("Character name").fill("Ilyana Starweave");
  await page.getByLabel("alignment").selectOption("Chaotic Good");
  await page.click('[data-action="create-character"]');
  await page.waitForFunction(() => document.querySelector('[data-character] .cc-name')?.value === "Ilyana Starweave", null, { timeout: 30000 });
  const all = await tool("kraken_records_list", { type: "character" });
  const elfId = all.records.find((record) => record.name === "Ilyana Starweave")?.id;
  const elf = (await tool("kraken_record_get", { id: elfId })).data;
  const elfExpected = buildFromSpec(
    {
      name: "Ilyana Starweave",
      race: "Elf",
      class: "Wizard",
      level: 2,
      scores: { strength: 9, dexterity: 15, constitution: 12, intelligence: 17, wisdom: 10, charisma: 11 },
      primes: ["intelligence", "dexterity"],
      hp: [3, 4],
      gold: 50,
      gear: [["Dagger", 1], ["Backpack", 1]],
      spells: kept,
    },
    library,
  ).character;
  const spellNames = (character) => Object.values(character.powers ?? {}).map((power) => power.name).sort().join(",");
  for (const [field, got, want] of [
    ["level", elf.level, elfExpected.level],
    ["hp", elf.hp.total, elfExpected.hp.total],
    ["ac", elf.ac.total, elfExpected.ac.total],
    ["dexterity prime", elf.attributes.dexterity.prime, 1],
    ["spells", spellNames(elf), spellNames(elfExpected)],
    ["coins", JSON.stringify(elf.coins), JSON.stringify(elfExpected.coins)],
    ["alignment", elf.alignment, "Chaotic Good"],
  ]) {
    assert(got === want, `elf ${field}: ${got} want ${want}`);
  }

  // A paladin: only lawful good.
  await page.click('[data-action="new-character"]');
  await page.click('[data-wizard-tab="race"]');
  await page.click('[data-race="Human"]');
  await page.click('[data-wizard-tab="class"]');
  await page.click('[data-class="Paladin"]');
  await page.click('[data-wizard-tab="finish"]');
  const paladin = await page.$$eval('[aria-label="alignment"] option', (options) => options.map((option) => option.textContent));
  assert(paladin.join("|") === "—|Lawful Good", `paladin alignments ${paladin.join("|")}`);
  // Created unfinished: what is left goes in the notes.
  await page.getByLabel("Character name").fill("Unfinished Paladin");
  await page.click('[data-action="create-character"]');
  await page.waitForFunction(() => document.querySelector('[data-character] .cc-name')?.value === "Unfinished Paladin", null, { timeout: 30000 });
  const rest = await tool("kraken_records_list", { type: "character" });
  const unfinished = (await tool("kraken_record_get", { id: rest.records.find((record) => record.name === "Unfinished Paladin").id })).data;
  assert(String(unfinished.notes).includes("Unfinished in the character wizard (finish with your Castle Keeper): Abilities, Primes, Hit Points, Equipment, Alignment."), `notes: ${unfinished.notes}`);

  // Combining classes: a Human Fighter/Wizard (multi-class) at level 2 with a Rogue plus.
  await page.click('[data-action="new-character"]');
  await tool("kraken_dice_clear");
  await tool("kraken_dice_force", { values: [4, 5, 5, 4, 4, 4, 4, 3, 3, 5, 5, 4, 4, 4, 4, 3, 3, 4] });
  await page.click('[data-action="roll-abilities"]');
  await page.waitForFunction(() => document.querySelector('[data-final="charisma"]')?.textContent === "10");
  await page.click('[data-wizard-tab="race"]');
  await page.click('[data-race="Human"]');
  await page.waitForSelector('[data-action="change-race"]');
  await page.click('[data-wizard-tab="class"]');
  await page.click('[data-class="Fighter"]');
  await page.getByLabel("Higher starting level").click();
  await page.click('[data-action="combo-multi"]');
  // Fighter/Knight is a race-limited pair for a human? Whatever the code, a refused row has no +.
  for (const row of await page.locator(".ccw-combo-list .ccw-pick.blocked").all()) assert((await row.locator("[data-combo-add]").count()) === 0, "a refused combination has no +");
  await page.click('[data-combo-add="Wizard"]');
  await page.waitForSelector('[data-combo="multi"]');
  assert(/Multi-Class Hit Die table \(d10 with d4: d8\)/.test(await page.locator('[data-combo="multi"]').textContent()), "multi card");
  await page.click('[data-action="combo-plus"]');
  await page.click('[data-combo-add="Rogue"]');
  await page.waitForSelector('[data-combo="plus"]');
  await page.click('[data-wizard-tab="primes"]');
  assert(await page.getByLabel("intelligence prime").isChecked(), "the wizard's prime is forced");
  await page.getByLabel("dexterity prime").check();
  await page.getByLabel("wisdom prime").check();
  await page.click('[data-wizard-tab="hp"]');
  await tool("kraken_dice_force", { values: [6] });
  await page.click('[data-action="roll-hp"]');
  // Level 1 on the d8 rolls 6 (+0 Con 10); level 2 likewise.
  await tool("kraken_dice_force", { values: [6] });
  await page.waitForFunction(() => Number(document.querySelector("[data-hp-total]")?.getAttribute("data-hp-total")) > 0);
  const multiHp = Number(await page.locator("[data-hp-total]").getAttribute("data-hp-total"));
  await page.click('[data-wizard-tab="spells"]');
  await page.click('[data-spell-list="second"]');
  const secondBoxes = page.locator('.ccw-spell input[type="checkbox"]');
  await secondBoxes.nth(0).check();
  const wizardSpell = (await page.locator(".ccw-spell .ccw-pick-name").nth(0).textContent()).trim();
  await page.click('[data-wizard-tab="finish"]');
  await page.getByLabel("Character name").fill("Varis Twohands");
  await page.getByLabel("alignment").selectOption("Neutral Good");
  await page.click('[data-action="create-character"]');
  await page.waitForFunction(() => document.querySelector('[data-character] .cc-name')?.value === "Varis Twohands", null, { timeout: 30000 });
  {
    const all = await tool("kraken_records_list", { type: "character" });
    const varis = (await tool("kraken_record_get", { id: all.records.find((record) => record.name === "Varis Twohands").id })).data;
    const pkgs = Object.values(varis.packages).filter((pkg) => pkg.levels);
    assert(pkgs.map((pkg) => `${pkg.name}${pkg.ccmulti ? "*" : ""}${pkg.level}`).join() === "Fighter*2,Wizard*2", `packages ${pkgs.map((pkg) => pkg.name).join()}`);
    assert(varis.hp.total === multiHp, `hp ${varis.hp.total} vs ${multiHp}`);
    assert(varis.ccplus?.rogue, "rogue plus");
    assert(String(varis.expnextsource).startsWith("Fighter/Wizard 3 (class plus"), `next ${varis.expnextsource}`);
    assert(Object.values(varis.powers ?? {}).some((power) => power.name === wizardSpell && power.spellpool === "wizard"), `wizard spell ${wizardSpell} in its pool`);
  }

  // Class & Level on the sheet: Level Up on the Wizard raises both classes of the multi-class.
  await page.click('[data-action="class-level"]');
  await page.click('[data-class-row="Wizard"] [data-action="level-up-class"]');
  await page.waitForFunction(() => document.querySelector('[data-class-row="Wizard"] .cc-num')?.textContent === "3", null, { timeout: 20000 });
  assert((await page.locator('[data-class-row="Fighter"] .cc-num').textContent()) === "3", "the fighter rose with it");
  assert((await page.locator(".cc-classlevel").textContent()).includes("The character already has two classes"), "a multi-class cannot dual class");

  // Borin (Dwarf Fighter, Constitution prime) dual-classes into Barbarian ([S] for a dwarf).
  await page.locator(".character-list li", { hasText: "Borin Stonefist" }).first().locator("button").click();
  await page.waitForFunction(() => document.querySelector('[data-character] .cc-name')?.value === "Borin Stonefist");
  if (!(await page.locator(".cc-classlevel").count())) await page.click('[data-action="class-level"]');
  await page.click('[data-action="change-class-open"]');
  assert((await page.locator('[data-change-row="Rogue"] [data-action="dual-class"]').count()) === 0, "no dual class into Rogue without Dexterity prime");
  await page.click('[data-change-row="Barbarian"] [data-action="dual-class"]');
  await page.waitForSelector('[data-class-row="Barbarian"]', { timeout: 20000 });
  assert((await page.locator('[data-class-row="Barbarian"]').textContent()).includes("dual class"), "barbarian is the dual class");

  // Out and back in: Borin exported as Kraken's file and as FG's XML, then
  // both imported through the Characters window's Import button.
  const { writeFileSync } = await import("node:fs");
  const borinId = rest.records.find((record) => record.name === "Borin Stonefist").id;
  const krakenFile = path.join(profile, "Borin.kraken.json");
  const fgFile = path.join(profile, "Borin.xml");
  await tool("kraken_character_export", { id: borinId, format: "kraken", path: krakenFile });
  await tool("kraken_character_export", { id: borinId, format: "fg", path: fgFile });
  const foundryFile = path.join(profile, "thorin.json");
  writeFileSync(foundryFile, JSON.stringify({ name: "Thorin Ashbeard", type: "character", system: { abilities: { str: { value: 16 }, dex: { value: 12 }, con: { value: 15 }, int: { value: 10 }, wis: { value: 13 }, cha: { value: 8 } }, attributes: { hp: { value: 31, max: 31 } }, details: { race: "Hill Dwarf" }, currency: { gp: 15 } }, items: [{ name: "Fighter", type: "class", system: { levels: 3 } }, { name: "Longsword", type: "weapon", system: { quantity: 1, equipped: true } }] }));
  for (const [file, name] of [[krakenFile, "Borin Stonefist"], [fgFile, "Borin Stonefist"], [foundryFile, "Thorin Ashbeard"]]) {
    const before = (await tool("kraken_records_list", { type: "character" })).total;
    await page.locator('[data-action="import-character-file"]').first().setInputFiles(file);
    await page.waitForSelector(".character-file-status:has-text('Imported')", { timeout: 30000 });
    const after = await tool("kraken_records_list", { type: "character" });
    assert(after.total === before + 1, `imported ${path.basename(file)}`);
    const newest = after.records.filter((record) => record.name === name).map((record) => record.id);
    const copy = (await tool("kraken_record_get", { id: newest[newest.length - 1] })).data;
    if (name === "Borin Stonefist") {
      for (const field of ["hp", "ac", "bth"]) assert(JSON.stringify(field === "hp" ? copy.hp.total : field === "ac" ? copy.ac.total : copy.bth) === JSON.stringify(field === "hp" ? made.hp.total : field === "ac" ? made.ac.total : made.bth), `${path.basename(file)} ${field}`);
      assert(Object.values(copy.inventorylist).map((i) => i.name).sort().join() === Object.values(made.inventorylist).map((i) => i.name).sort().join(), `${path.basename(file)} inventory`);
    } else assert(copy.level === 3 && copy.hp.total === 31 && copy.race === "Dwarf", `Thorin ${copy.race} ${copy.level} ${copy.hp.total}`);
  }
  await page.click('[data-action="export-character"]');
  await page.waitForSelector('[data-export="fg"]');
  await page.click('[data-action="export-character"]');

  await tool("kraken_leave");
  console.log(`ok wizard: Borin Stonefist (HP ${made.hp.total}, AC ${made.ac.total}, BtH ${made.bth}) and Ilyana Starweave (level ${elf.level}, HP ${elf.hp.total}, spells ${kept.length}) equal to the builder; spells trimmed on a level change; paladin alignment; an unfinished character lists what is left; a Fighter/Wizard multi-class with a Rogue plus made through Combine Classes, levelled from Class & Level; Borin dual-classed into Barbarian; exported (Kraken, FG) and imported back with Foundry's. ${path.join(profile, "wizard-result.png")}`);
} catch (error) {
  await page.screenshot({ path: path.join(profile, "wizard-failed.png") }).catch(() => undefined);
  console.log("failed:", path.join(profile, "wizard-failed.png"));
  throw error;
} finally {
  child.stdin.end();
  await app.close();
}
