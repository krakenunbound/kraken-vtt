// The dice, chat and combat flow in the real app (docs/feature-parity.md
// D1-D10), on a D&D 5E campaign, the GM's app full screen on its monitor and a
// test player in Chrome at 2560x1440:
//   1. The player's modifier box: /mod 2 Flanking, a number dropped on it, one
//      taken off with a right-click; ADV pressed; /r 1d20 + 3 #Climb reads them
//      all and its card lists them; the box and the key clear.
//   2. The roll mode: GM and me; the next roll is the GM's and theirs.
//   3. The GM drops a record into the chat's entry and Shares it: the line's
//      link and the record's words; the player sees the chip.
//   4. An inline roll [[1d20+5 #Attack]]: a chip in chat the player clicks.
//   5. The party sheet's group roll asked of the players: the card in the
//      player's chat, their Roll, the row filled.
//   6. The tracker: initiative by kind (one roll for the goblins), Delay on the
//      active row and Act now; the player's tracker shows the goblins' bars.
//   7. The Session Log window, and the chat's export.
// Screenshots in %TEMP%/kraken-dicechat-ui.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-dicechat-ui-"));
for (const dir of ["no-fg-modules", "Packs"]) mkdirSync(path.join(profile, dir), { recursive: true });
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const env = { ...process.env, KRAKEN_WINDOW_AT: AT, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
const shots = path.join(tmpdir(), "kraken-dicechat-ui");
mkdirSync(shots, { recursive: true });
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
const screen = await app.evaluate(async ({ BrowserWindow, screen: displays }) => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setFullScreen(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const display = displays.getDisplayMatching(win.getBounds());
  return `${display.size.width}x${display.size.height}`;
});
await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  try {
    const message = JSON.parse(line);
    answers.get(message.id)?.(message);
  } catch {
    // not an answer
  }
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
const until = async (test, label, ms = 10000) => {
  const start = Date.now();
  for (;;) {
    const value = await test();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`waiting for ${label}`);
    await settle(150);
  }
};
// A drag's data dropped on an element (as a drag from a list or a chat line would).
const drop = (where, selector, data) =>
  where.evaluate(
    ([target, items]) => {
      const element = document.querySelector(target);
      if (!element) throw new Error(`no ${target}`);
      const transfer = new DataTransfer();
      for (const [type, value] of Object.entries(items)) transfer.setData(type, value);
      const box = element.getBoundingClientRect();
      for (const type of ["dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 10 }));
    },
    [selector, data],
  );
const say = async (where, line) => {
  await where.fill('.chat-entry input[aria-label="Message"]', line);
  await where.press('.chat-entry input[aria-label="Message"]', "Enter");
  await settle(500);
};
const lastRoll = async () => (await tool("kraken_chat_log", { count: 12 })).reverse().find((line) => line.roll)?.roll;

let browser = null;
const PORT = 48900 + Math.floor(Math.random() * 400);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Dice and chat UI", ruleset: "D&D 5E" });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_dice_settings", { show: false }).catch(() => undefined);
  const abilities = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 14, bonus: 2, save: 2 }]));
  const hero = await tool("kraken_record_create", { type: "character", name: "Hagar", owner: "A test player", visibility: "owner", data: { ruleset: "dnd5e", level: 3, prof: 2, languages: ["Common", "Orc"], hp: { total: 24, wounds: 0 }, abilities, skills: { stealth: { name: "Stealth", total: 4 } } } });
  const goblin = await tool("kraken_record_create", { type: "npc", name: "Goblin", data: { hp: 7, ac: 13, size: "Small", speed: "30 ft.", senses: "darkvision 60 ft., passive Perception 9", traits: { "id-00001": { name: "Nimble Escape", desc: "The goblin can take the Disengage or Hide action as a bonus action on each of its turns." } }, actions: { "id-00001": { name: "Scimitar", desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target." } }, text: "<p>A small, vicious raider. Scimitar: [[1d20+4 #Scimitar]], 1d6 + 2 slashing.</p>" } });
  const relic = await tool("kraken_record_create", { type: "item", name: "Moon Amulet", visibility: "all", data: { description: "<p>A silver amulet that glows at night.</p>" } });
  await tool("kraken_party_edit", { members: [hero.id] });
  // A portrait from the art library, for the speaker's picture in chat.
  const portraits = await tool("kraken_art", { kind: "portrait", limit: 5 });
  const portrait = (Array.isArray(portraits) ? portraits : portraits.art ?? portraits.items ?? [])[0]?.id;
  if (portrait) await tool("kraken_record_update", { id: hero.id, data: { portrait } });
  const note = await tool("kraken_record_create", { type: "note", name: "Torches", owner: "A test player", visibility: "owner", data: { text: "<p>Each torch burns [[1d6]] hours.</p>" } });

  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await say(seat, "/dice3d off");

  // 1. The modifier box: /mod, a number dropped, one taken off; ADV; a roll reads them all.
  await say(seat, "/mod 2 Flanking");
  await drop(seat, ".modifier-box", { "application/x-kraken-number": JSON.stringify({ value: 1, label: "Bless" }) });
  await drop(seat, ".modifier-box", { "text/plain": "-3 Rain" });
  // An Effects-window entry dropped on the box: its number.
  await drop(seat, ".modifier-box", { "application/x-kraken-effect": JSON.stringify({ preset: "x" }), "text/plain": "Inspired; ATK: 2" });
  await seat.waitForSelector('.modifier-slots li[data-modifier-slot="3"]');
  assert((await seat.textContent('.modifier-slots li[data-modifier-slot="3"]')).includes("Inspired"), "an effect's number dropped on the box");
  await seat.click('.modifier-slots li[data-modifier-slot="3"]', { button: "right" });
  await until(async () => (await seat.$$(".modifier-slots li")).length === 3, "the effect's slot taken off");
  await seat.waitForSelector('.modifier-slots li[data-modifier-slot="2"]');
  await seat.click('.modifier-slots li[data-modifier-slot="2"]', { button: "right" });
  await until(async () => (await seat.$$(".modifier-slots li")).length === 2, "a slot taken off");
  assert((await seat.getAttribute(".modifier-box", "data-modifier-total")) === "3", "the box's total is 3");
  await seat.click('[data-modifier-key="adv"]');
  await until(async () => (await seat.getAttribute('[data-modifier-key="adv"]', "aria-pressed")) === "true", "ADV on");
  await seat.screenshot({ path: path.join(shots, "1-player-modifier-box.png") });
  await tool("kraken_dice_force", { values: [6, 15] });
  await say(seat, "/r 1d20 + 3 #Climb");
  const climb = await until(lastRoll, "the climb");
  assert(climb.label === "Climb [ADVANTAGE]" && climb.formula === "2d20kh1+3+3" && climb.total === 21 && climb.mods.length === 3, `the roll reads the box and ADV: ${JSON.stringify(climb)}`);
  await until(async () => (await seat.$$(".modifier-slots li")).length === 0 && (await seat.getAttribute('[data-modifier-key="adv"]', "aria-pressed")) === "false", "the box and the key clear");
  await seat.waitForSelector(".chat-line .roll-mods");
  await seat.screenshot({ path: path.join(shots, "1-player-roll-card.png") });
  // The GM's own modifiers (FG's Modifiers window): a chip beside the box puts its number in it.
  await tool("kraken_table_options", { modifierPresets: [{ label: "Higher ground", value: 1 }] });
  await seat.click('[data-modifier-preset="Higher ground"]');
  await until(async () => (await seat.getAttribute(".modifier-box", "data-modifier-total")) === "1", "the preset in the box");
  await seat.click('.modifier-slots li[data-modifier-slot="0"]', { button: "right" });
  await until(async () => (await seat.getAttribute(".modifier-box", "data-modifier-total")) === "0", "and taken off");

  // 2. The roll mode: GM and me.
  await seat.selectOption('select[aria-label="Roll mode"]', "gm");
  await until(async () => (await tool("kraken_modifiers", { who: "A test player" })).mode === "gm", "the mode kept by the host");
  await say(seat, "/r 1d20 #Sneak");
  const sneak = (await tool("kraken_chat_log", { count: 3 })).reverse().find((line) => line.roll?.label === "Sneak");
  assert(sneak?.secret && sneak.shownTo === "A test player", "GM and me");
  await seat.selectOption('select[aria-label="Roll mode"]', "public");

  // The speaker's portrait: the player speaks as Hagar.
  await say(seat, "I climb the wall.");
  if (portrait) {
    await page.waitForSelector(`.chat-portrait[data-chat-portrait="${hero.id}"]`);
    assert(await page.isVisible(`.chat-portrait[data-chat-portrait="${hero.id}"]`), "Hagar's portrait on his line");
  }

  // 2b. Chat languages (FG's chat language menu): Hagar speaks Orc; the GM reads it and who understood.
  // The GM's Elvish reaches the player as sounds only.
  await seat.selectOption('select[aria-label="Language"]', "Orc");
  await say(seat, "Grukk smash the door");
  await page.waitForSelector('.chat-line[data-from="Hagar"] .chat-understood');
  assert((await page.textContent('.chat-line[data-from="Hagar"] .chat-understood')).includes("Hagar"), "the GM sees Hagar understood");
  assert((await tool("kraken_chat_log", { count: 2 })).some((line) => line.lang === "Orc" && line.text === "Grukk smash the door"), "the line kept its language");
  await seat.selectOption('select[aria-label="Language"]', "");
  await page.selectOption('select[aria-label="Language"]', "Elvish");
  await say(page, "The door is warded");
  await seat.waitForSelector(".chat-line .chat-garbled");
  assert(!(await seat.textContent(".chat-log")).includes("The door is warded"), "the player hears only Elvish sounds");
  await seat.screenshot({ path: path.join(shots, "2b-player-language.png") });
  await page.selectOption('select[aria-label="Language"]', "");

  // 3. The GM drops a record into the chat's entry and shares it.
  await drop(page, ".chat-entry", { "text/kraken-slot": JSON.stringify({ kind: "record", record: relic.id, label: "Moon Amulet" }) });
  await page.waitForSelector(".chat-attached");
  await page.click(".chat-share-toggle");
  await page.fill('.chat-entry input[aria-label="Message"]', "You find this.");
  await page.press('.chat-entry input[aria-label="Message"]', "Enter");
  await seat.waitForSelector('.chat-line .chat-link[data-chat-link="record"]');
  await seat.waitForSelector(".chat-line .chat-share");
  assert((await seat.textContent(".chat-share")).includes("glows at night"), "the player reads the shared words");
  await page.screenshot({ path: path.join(shots, "3-gm-link-share.png") });
  await seat.screenshot({ path: path.join(shots, "3-player-link-share.png") });

  // 4. Inline rolls: a chip in chat the player clicks.
  await say(page, "Roll it: [[1d20+5 #Attack]]");
  await seat.waitForSelector('.chat-line .inline-roll[data-inline-roll="1d20+5"]');
  await tool("kraken_dice_force", { values: [9] });
  await seat.locator('.chat-line .inline-roll[data-inline-roll="1d20+5"]').last().click();
  const attack = await until(async () => {
    const roll = await lastRoll();
    return roll?.label === "Attack" ? roll : null;
  }, "the inline roll");
  assert(attack.total === 14, `the inline roll: ${JSON.stringify(attack)}`);
  await seat.screenshot({ path: path.join(shots, "4-player-inline-roll.png") });
  // In a record's text (the GM's Goblin) and in a note being edited (kept as typed).
  await tool("kraken_windows", { action: "open", kind: "record", record: goblin.id });
  await page.waitForSelector('.record-window .inline-roll[data-inline-roll="1d20+4"]');
  await tool("kraken_dice_force", { values: [12] });
  await page.click('.record-window .inline-roll[data-inline-roll="1d20+4"]');
  const scimitar = await until(async () => ((await lastRoll())?.label === "Scimitar" ? lastRoll() : null), "the record's inline roll");
  assert((await scimitar).total === 16, "the record's chip rolls");
  assert(await page.isVisible('.record-window .inline-roll[data-inline-roll="1d6+2"]'), "the bare dice in the record's words");
  await page.screenshot({ path: path.join(shots, "4-gm-record-inline-roll.png") });

  await seat.click('.sidebar [data-launch="notes"]');
  await seat.click(`text=Torches`).catch(() => undefined);
  const noteChip = await seat.waitForSelector('.note-window .inline-roll[data-inline-roll="1d6"]', { timeout: 10000 }).catch(() => null);
  assert(noteChip, "the note's [[1d6]] shows as a roll chip");
  await seat.click(".note-window .rt-body");
  // While typing in the note, a click on its chip places the cursor and rolls nothing.
  const linesBefore = await seat.locator(".chat-line").count();
  await noteChip.click();
  await settle(800);
  assert((await seat.locator(".chat-line").count()) === linesBefore, "a chip clicked while typing in the note rolls nothing");
  await seat.click(".note-window .note-title");
  await settle(600);
  const kept = (await tool("kraken_record_get", { id: note.id })).data.text;
  assert(kept === "<p>Each torch burns [[1d6]] hours.</p>", `the note keeps its words: ${kept}`);

  // 5. The party's group roll asked of the players.
  await page.click('.sidebar [data-launch="party"]');
  await page.waitForSelector(".party-group");
  // FG's party sheet main tab: the HP bar and each ability with its bonus.
  await page.waitForSelector(`[data-member="${hero.id}"] .party-meter.meter-hp[aria-valuenow="24"]`);
  assert((await page.$$(`[data-party-abilities="${hero.id}"] .party-ability`)).length === 6, "Hagar's six abilities on the party sheet");
  await page.screenshot({ path: path.join(shots, "5-gm-party-main.png") });
  await page.selectOption('.party-group select[aria-label="Roll kind"]', "skill");
  await page.selectOption('.party-group select[aria-label="What they roll"]', "stealth");
  await page.fill(".party-group input[type=number]", "12");
  await page.click('[data-party-mode="ask"]');
  await page.click('[data-action="party-roll"]');
  await seat.waitForSelector(".chat-prompt [data-prompt-roll]");
  await page.screenshot({ path: path.join(shots, "5-gm-party-ask.png") });
  await tool("kraken_dice_force", { values: [11] });
  await seat.click(".chat-prompt [data-prompt-roll]");
  await seat.waitForSelector('.chat-prompt [data-prompt-row="Hagar"][data-rolled]');
  assert((await seat.getAttribute('.chat-prompt [data-prompt-row="Hagar"]', "data-rolled")) === "15", "the player's row: 11 + 4");
  await seat.screenshot({ path: path.join(shots, "5-player-party-prompt.png") });

  // 5b. Action links: a book's "DC 13 Dexterity saving throw" in a chat line is a chip. The GM's click
  // asks the players (a new prompt card); the player's rolls Hagar's own save against the DC.
  await tool("kraken_chat_send", { text: "The floor gives way: make a DC 13 Dexterity saving throw." });
  const link = '.chat-line .action-link[data-action-link="test"]';
  await page.waitForSelector(link);
  await seat.waitForSelector(link);
  assert((await seat.textContent(link)).trim() === "DC 13 Dexterity saving throw", `the chip keeps the book's words: ${await seat.textContent(link)}`);
  const promptsBefore = await seat.locator(".chat-prompt").count();
  await page.locator(link).last().click();
  await seat.waitForFunction((before) => document.querySelectorAll(".chat-prompt").length > before, promptsBefore, { timeout: 10000 });
  assert(/Dexterity/.test(await seat.locator(".chat-prompt").last().textContent()) && /DC 13/.test(await seat.locator(".chat-prompt").last().textContent()), "the GM's click asks the players for a DC 13 Dexterity save");
  await tool("kraken_dice_force", { values: [9] });
  await seat.locator(link).last().click();
  await until(async () => (await tool("kraken_chat_log", { count: 10 })).some((line) => /Dexterity save/i.test(line.roll?.label ?? "") && line.from === "A test player"), "the player's click rolls Hagar's Dexterity save");
  await seat.screenshot({ path: path.join(shots, "5b-action-link.png") });

  // 6. The tracker: initiative by kind, Delay and Act now; the player's bars.
  await tool("kraken_table_options", { initGroup: "kind", healthNpc: "bar" });
  for (let i = 0; i < 3; i += 1) await tool("kraken_combat", { action: "add", recordId: goblin.id });
  await tool("kraken_combat", { action: "add", recordId: hero.id });
  await tool("kraken_dice_force", { values: [14, 8] });
  await tool("kraken_combat", { action: "init", which: "all" });
  let view = await tool("kraken_combat", { action: "view" });
  assert(new Set(view.entries.filter((entry) => /^Goblin/.test(entry.name)).map((entry) => entry.initresult)).size === 1, "one initiative for the goblins");
  await tool("kraken_combat", { action: "damage", id: view.entries.find((entry) => entry.name === "Goblin 1").id, amount: 4 });
  await page.click('.sidebar [data-launch="combat"]');
  await tool("kraken_combat", { action: "next" });
  view = await tool("kraken_combat", { action: "view" });
  await page.waitForSelector('[data-action="delay"]');
  const waiting = view.entries.find((entry) => entry.id === view.active);
  await page.click('[data-action="delay"]');
  await page.waitForSelector('[data-action="act-now"]');
  await page.screenshot({ path: path.join(shots, "6-gm-tracker-delay.png") });
  await page.click('[data-action="act-now"]');
  await until(async () => (await tool("kraken_combat", { action: "view" })).active === waiting.id, "act now");
  // Whose turn it is, on every screen: the actor's portrait card (the player sees the goblin's too).
  await page.waitForSelector(`.turn-card[data-turn-card="${waiting.name}"]`, { timeout: 3000 });
  await seat.waitForSelector(`.turn-card[data-turn-card="${waiting.name}"]`, { timeout: 3000 });
  await page.screenshot({ path: path.join(shots, "6-gm-turn-card.png") });
  await seat.click('.sidebar [data-launch="combat"]');
  await seat.waitForSelector(".ct-bar");
  await seat.screenshot({ path: path.join(shots, "6-player-tracker-bars.png") });
  // FG's tracker controls: a goblin's side clicked round to none, the round typed, the foes deleted after Cancel then Yes.
  const g3 = view.entries.find((entry) => entry.name === "Goblin 3").id;
  await page.click(`.ct-row:has-text("Goblin 3") [data-action="faction-cycle"]`);
  await until(async () => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === g3).faction === "neutral", "a click: foe to neutral");
  for (let i = 0; i < 2; i += 1) await page.click(`.ct-row:has-text("Goblin 3") [data-action="faction-cycle"]`), await settle(300);
  await until(async () => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === g3).faction === "none", "two more: no side");
  await page.fill('input[data-action="set-round"]', "4");
  await page.press('input[data-action="set-round"]', "Enter");
  await until(async () => (await tool("kraken_combat", { action: "view" })).round === 4, "the round typed in");
  await page.click('[data-action="remove-foes"]');
  await page.click('[data-action="remove-foes-no"]');
  assert((await tool("kraken_combat", { action: "view" })).entries.length === 4, "Cancel deletes nothing");
  await page.click('[data-action="remove-foes"]');
  await page.screenshot({ path: path.join(shots, "6-gm-tracker-confirm.png") });
  // FG's creature sections: Goblin 3's More shows its space and reach, offense, and Nimble Escape's text in place.
  await page.click('[data-action="remove-foes-no"]');
  await page.click(`.ct-row:has-text("Goblin 3") button[title="More"]`);
  await page.waitForSelector('[data-creature-details] .ct-creature-chip');
  assert((await page.textContent("[data-creature-details] .ct-creature-chip")).includes("reach 5 ft"), "space and reach");
  await page.click('[data-creature-details] [data-trait="Nimble Escape"] summary');
  assert(await page.isVisible('[data-creature-details] [data-trait="Nimble Escape"] p'), "a trait's text opens in place");
  await page.screenshot({ path: path.join(shots, "6-gm-tracker-creature.png") });
  await page.click(`.ct-row:has-text("Goblin 3") button[title="More"]`);
  await page.click('[data-action="remove-foes"]');
  await page.click('[data-action="remove-foes-yes"]');
  await until(async () => (await tool("kraken_combat", { action: "view" })).entries.map((entry) => entry.name).sort().join() === "Goblin 3,Hagar", "the foes deleted, the goblin with no side kept");

  // The GM's tray: a d20 thrown with ADV on and the 3D dice on.
  await page.click('[data-modifier-key="adv"]');
  await tool("kraken_dice_force", { values: [5, 17] });
  await page.click('.dice-tray .tray-die[aria-label="d20"]');
  await page.click('.dice-pool .play-button');
  const thrown = await until(async () => {
    const roll = await lastRoll();
    return roll?.formula === "2d20kh1" ? roll : null;
  }, "the tray's d20 with ADV");
  assert(thrown.total === 17, "two d20s, the higher kept");
  await settle(2500);
  await page.screenshot({ path: path.join(shots, "6-gm-tray-adv.png") });

  // 7. The Session Log, and the chat's export button.
  await page.click('.sidebar [data-launch="sessionlog"]');
  await page.waitForSelector(".session-log-lines li");
  assert((await page.$$(".session-log-lines li")).length > 8, "the session's lines");
  await page.screenshot({ path: path.join(shots, "7-gm-session-log.png") });
  const exported = await tool("kraken_chat_log", { action: "export", format: "md" });
  assert(/Climb/.test(exported.text), "the export");
  assert(await seat.isVisible('[data-action="chat-export"]'), "the player's chat export");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok dice chat ui (the GM's screen ${screen}): the modifier box (/mod, a dropped number, right-click off, ADV, read by /r 1d20 + 3 #Climb and cleared), the roll mode, a record dropped into chat and shared, an inline roll clicked, a party skill asked of the players and rolled from the card, initiative by kind, Delay and Act now, the player's health bars, the Session Log. Shots: ${shots}`);
} catch (error) {
  await page.screenshot({ path: path.join(shots, "failed-gm.png") }).catch(() => undefined);
  throw error;
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
