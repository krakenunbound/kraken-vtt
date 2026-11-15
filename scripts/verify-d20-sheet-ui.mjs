// A d20 game's character sheet (D&D 5E, Descending Darkness, D&D 3.5E, AD&D
// 2E), every tab and every control, in the real app, for a change that must not
// move a pixel or change what a control does (the core UI's step 6,
// docs/core-ui-design.md 7.13). The GM hosts a campaign of the game with its
// books and builds characters for a test player (kraken_build_character, fixed
// specs) that show each side of the sheet. Then:
//   - every tab of each sheet, GM (Kraken full screen) and player (Chrome
//     2560x1440): a shot of the sheet alone and its controls' signature (tag,
//     attributes, text, disabled, value), in <out>/
//   - the states the sheet shows on its own (dying, dread, a status), each set
//     through kraken_character_edit and shot the same way
//   - every control on every tab pressed once by the player, in order, with the
//     dice fixed first: what each did to the record (the paths that changed) and
//     the chat lines it posted, in <out>/<game>-presses.json; then the GM's
//     level-up
// Run it on two builds and compare the folders with shot-sheets.mjs diff.
//
//   node scripts/verify-d20-sheet-ui.mjs <dnd5e|descending|dnd35|adnd2e> <out>
//
// Windows open on the left monitor (KRAKEN_WINDOW_AT) and are closed at the end.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

const SCORES = (str, dex, con, int, wis, cha) => ({ strength: str, dexterity: dex, constitution: con, intelligence: int, wisdom: wis, charisma: cha });
// Each game: its campaign name, books (shipped: only Kraken's own, no FG modules or packs), the characters,
// the states set on them for a shot, who is in the fight.
const GAMES = {
  dnd5e: {
    ruleset: "D&D 5E",
    shipped: true,
    books: ["SRD 5.2.1 Player's Rules", "SRD 5.2.1 Creatures"],
    tabs: "main,skills,combat,spells,inventory,notes",
    specs: [
      { name: "Lia Brightwater", class: "Cleric", species: "Human", background: "Acolyte", level: 3, scores: SCORES(10, 12, 14, 10, 16, 13), kits: { class: "A", background: "A" }, spells: ["Guidance", "Sacred Flame", "Cure Wounds", "Bless"], alignment: "Lawful Good" },
      { name: "Mira Holt", class: "Fighter", species: "Dwarf", background: "Soldier", level: 5, scores: SCORES(16, 12, 15, 10, 11, 8), kits: { class: "A", background: "A" }, alignment: "Neutral" },
    ],
    fight: ["Mira Holt"],
    states: [
      { who: "Mira Holt", label: "dying", changes: (data) => [{ path: "hp.wounds", value: data.hp.total }] },
      { who: "Mira Holt", label: "death-saves", changes: () => [{ path: "deathsaves.success", value: 2 }, { path: "deathsaves.failure", value: 1 }] },
      // Back on her feet for the presses: the death save's Roll is pressed while dying, below.
      { who: "Mira Holt", label: "healed", changes: () => [{ path: "hp.wounds", value: 0 }, { path: "deathsaves.success", value: 0 }, { path: "deathsaves.failure", value: 0 }] },
    ],
    // Pressed once in a state, then put back: [who, changes in, the control, changes back].
    extra: [{ who: "Mira Holt", into: (data) => [{ path: "hp.wounds", value: data.hp.total }], control: '[data-action="death-save"]', back: () => [{ path: "hp.wounds", value: 0 }] }],
  },
  descending: {
    ruleset: "Descending Darkness",
    shipped: true,
    books: ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary"],
    tabs: "main,skills,combat,spells,inventory,notes",
    specs: [
      { name: "Wren Hallow", class: "Fighter", species: "Dwarf", background: "Grave Digger", level: 2, scores: SCORES(15, 12, 14, 10, 12, 8), kits: { class: "A", background: "A" }, alignment: "Neutral" },
      { name: "Brother Ash", class: "Cleric", species: "Human", background: "Grave Digger", level: 3, scores: SCORES(10, 12, 13, 10, 16, 12), kits: { class: "A", background: "A" }, alignment: "Neutral" },
    ],
    fight: ["Wren Hallow"],
    states: [
      { who: "Wren Hallow", label: "dread-3", changes: () => [{ path: "dread", value: 3 }] },
      { who: "Wren Hallow", label: "dread-6", changes: () => [{ path: "dread", value: 6 }] },
      { who: "Wren Hallow", label: "dying", changes: (data) => [{ path: "dread", value: 1 }, { path: "hp.wounds", value: data.hp.total }] },
      { who: "Wren Hallow", label: "healed", changes: () => [{ path: "hp.wounds", value: 0 }, { path: "dread", value: 3 }] },
    ],
  },
  dnd35: {
    ruleset: "D&D 3.5E",
    books: ["3.5E Basic Rules", "3.5E Monsters"],
    tabs: "main,skills,combat,spells,feats,inventory,notes",
    specs: [
      { name: "Torvald Ash", race: "Dwarf", class: "Fighter", level: 6, scores: SCORES(16, 12, 15, 10, 11, 8), gear: ["Longsword", "Scale mail", "Shield, heavy steel", "Backpack", "Torch"], alignment: "Lawful Neutral" },
      { name: "Elsbeth", race: "Human", class: "Cleric", level: 3, scores: SCORES(12, 10, 13, 10, 16, 12), gear: ["Mace, heavy", "Chainmail", "Backpack"], alignment: "Neutral Good" },
      { name: "Sir Aldric", race: "Human", class: "Paladin", level: 4, scores: SCORES(15, 10, 14, 10, 10, 14), gear: ["Longsword", "Chainmail"], alignment: "Lawful Good" },
    ],
    fight: ["Torvald Ash"],
    states: [
      { who: "Torvald Ash", label: "disabled", changes: (data) => [{ path: "hp.wounds", value: data.hp.total + (data.hp.temp ?? 0) }] },
      { who: "Torvald Ash", label: "dying", changes: (data) => [{ path: "hp.wounds", value: data.hp.total + (data.hp.temp ?? 0) + 3 }] },
      { who: "Torvald Ash", label: "stable", changes: () => [{ path: "stable", value: 1 }] },
      { who: "Torvald Ash", label: "dead", changes: (data) => [{ path: "stable", value: 0 }, { path: "hp.wounds", value: data.hp.total + (data.hp.temp ?? 0) + 12 }] },
      { who: "Torvald Ash", label: "healed", changes: () => [{ path: "hp.wounds", value: 0 }] },
    ],
  },
  adnd2e: {
    ruleset: "AD&D 2E",
    books: ["B2 The Keep on the Borderlands (AD&D 2E)"],
    tabs: "main,combat,skills,spells,inventory,notes",
    specs: [
      { name: "Brannoc", race: "Human", class: "Fighter", level: 7, scores: SCORES(18, 13, 15, 9, 10, 11), strengthPercent: 76, weapons: ["Long sword"], gear: ["Long sword", "Dagger", "Chain mail", "Medium shield", "Backpack"], alignment: "Lawful Good" },
      { name: "Ilsa", race: "Half-Elf", class: "Cleric/Mage", level: 3, scores: SCORES(10, 13, 12, 15, 15, 10), gear: ["Mace", "Backpack"], alignment: "Neutral Good" },
      { name: "Pip", race: "Halfling", class: "Thief", level: 4, scores: SCORES(10, 17, 12, 11, 9, 10), gear: ["Short sword", "Leather armor", "Backpack"], alignment: "Neutral" },
    ],
    fight: ["Brannoc"],
    states: [
      { who: "Brannoc", label: "dying", changes: (data) => [{ path: "hp.wounds", value: data.hp.total + (data.hp.temp ?? 0) + 2 }] },
      { who: "Brannoc", label: "unconscious", changes: () => [{ path: "stable", value: 1 }] },
      { who: "Brannoc", label: "dead", changes: (data) => [{ path: "stable", value: 0 }, { path: "hp.wounds", value: data.hp.total + (data.hp.temp ?? 0) + 12 }] },
      { who: "Brannoc", label: "healed", changes: () => [{ path: "hp.wounds", value: 0 }] },
    ],
  },
};

const [gameId, outArg] = process.argv.slice(2);
const game = GAMES[gameId];
if (!game) {
  console.log(`node scripts/verify-d20-sheet-ui.mjs <${Object.keys(GAMES).join("|")}> <out>`);
  process.exit(2);
}
const out = outArg ?? path.join(tmpdir(), `kraken-${gameId}-sheet-ui`);
mkdirSync(out, { recursive: true });
const checks = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const AT = process.env.KRAKEN_WINDOW_AT ?? "-2500,40";
const profile = mkdtempSync(path.join(tmpdir(), `kraken-${gameId}-sheet-`));
const env = { ...process.env, KRAKEN_WINDOW_AT: AT, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", ...(game.shipped ? { KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "no-packs") } : {}) };
if (game.shipped) for (const dir of [env.KRAKEN_BOOKS, env.KRAKEN_PACKS]) mkdirSync(dir, { recursive: true });
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
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const dataOf = async (id) => {
  const got = await tool("kraken_record_get", { id });
  return got.data ?? got.record?.data;
};
// Every element's tag, attributes (not style or ids), its own text (whitespace collapsed), disabled, value, checked.
const signature = (sheet) =>
  sheet.evaluate((sheet) =>
    [sheet, ...sheet.querySelectorAll("*")].map((item) => ({
      tag: item.tagName,
      attrs: Object.fromEntries([...item.attributes].filter((attr) => !["style", "id", "for", "src", "srcset", "data-test-sheet"].includes(attr.name)).map((attr) => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b))),
      text: [...item.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").replace(/\s+/g, " ").trim(),
      ...(item.disabled !== undefined ? { disabled: item.disabled } : {}),
      ...(item.value !== undefined && !["LI", "BUTTON"].includes(item.tagName) ? { value: item.value } : {}),
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
      ...(item.style?.color ? { color: item.style.color } : {}),
    })),
  );
// What changed between two records' data: each path whose value differs, with the new value.
const changed = (before, after, at = "") => {
  if (JSON.stringify(before) === JSON.stringify(after)) return {};
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) !== Array.isArray(after)) return { [at || "."]: after ?? null };
  const out = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) Object.assign(out, changed(before[key], after[key], at ? `${at}.${key}` : key));
  return out;
};
const chatLines = async () => {
  const lines = await tool("kraken_chat_log", { count: 400 });
  return Array.isArray(lines) ? lines : [];
};
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let browser = null;
const PORT = 48900 + Math.floor(Math.random() * 300);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: `${game.ruleset} sheet UI`, ruleset: game.ruleset });
  await tool("kraken_host", { campaignId: campaign.id, port: PORT, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = Array.isArray(listed) ? listed : listed.books ?? [];
  for (const title of game.books) {
    const book = shelf.find((item) => item.title === title || item.name === title);
    assert(book, `${title} on the shelf`);
    if (!book.active) await tool("kraken_books", { action: "activate", book: book.id });
  }
  await settle(1500);
  // The 3D dice off, so no die rolls across a shot.
  const diceOff = async (where) => {
    await where.fill('input[aria-label="Message"]', "/dice3d off");
    await where.press('input[aria-label="Message"]', "Enter");
    await settle(400);
  };
  await diceOff(page);

  const ids = {};
  for (const spec of game.specs) {
    const built = await tool("kraken_build_character", { spec, owner: "A test player" });
    ids[spec.name] = built.id ?? built.record?.id;
    assert(ids[spec.name], `${spec.name} built`);
    if (built.problems?.length) console.log(`  ${spec.name}: ${built.problems.join(" | ")}`);
  }
  for (const name of game.fight) await tool("kraken_combat", { action: "add", recordId: ids[name] });
  if (game.fight.length) {
    await tool("kraken_combat", { action: "next" });
    const fight = await tool("kraken_combat", { action: "view" });
    await tool("kraken_combat", { action: "set-turn", id: fight.entries.find((entry) => entry.recordId === ids[game.fight[0]]).id });
  }

  // A character's sheet among the open ones (marked by its name field, which is a property, not an attribute).
  const sheetOf = async (where, name) => {
    await where.waitForFunction((who) => [...document.querySelectorAll(".cc-sheet")].some((sheet) => sheet.querySelector(".cc-name")?.value === who), name, { timeout: 20000 });
    const mark = slug(name);
    await where.evaluate(([who, tag]) => [...document.querySelectorAll(".cc-sheet")].find((sheet) => sheet.querySelector(".cc-name")?.value === who)?.setAttribute("data-test-sheet", tag), [name, mark]);
    return where.locator(`.cc-sheet[data-test-sheet="${mark}"]`);
  };
  const shoot = async (sheet, file) => {
    await sheet.page().mouse.move(2, 2);
    await settle(700);
    await sheet.screenshot({ path: path.join(out, `${file}.png`), animations: "disabled", caret: "hide" });
    writeFileSync(path.join(out, `${file}.json`), JSON.stringify(await signature(sheet), null, 1));
  };
  const shootTabs = async (where, who, name, only) => {
    const sheet = await sheetOf(where, name);
    const tabs = await sheet.locator("[data-sheet-tab]").evaluateAll((items) => items.map((item) => item.getAttribute("data-sheet-tab")));
    assert(tabs.join() === game.tabs, `${name}'s tabs: ${tabs.join()}`);
    for (const tab of only ?? tabs) {
      await sheet.locator(`[data-sheet-tab="${tab}"]`).click();
      await shoot(sheet, `${gameId}-${who}-${slug(name)}-sheet-${tab}`);
    }
  };
  const gmOpen = async (name) => {
    await tool("kraken_windows", { action: "open", kind: "sheet", record: ids[name] });
    return sheetOf(page, name);
  };
  const gmClose = async (name) => {
    await tool("kraken_windows", { action: "close", kind: "sheet", record: ids[name] }).catch(() => undefined);
    await page.waitForSelector(".cc-sheet", { state: "detached", timeout: 10000 }).catch(() => undefined);
  };
  for (const spec of game.specs) {
    await gmOpen(spec.name);
    await shootTabs(page, "gm", spec.name);
    await gmClose(spec.name);
  }
  // The player, in Chrome at 2560x1440: Characters, then each card.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage();
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${PORT}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await diceOff(seat);
  const openCard = async (name) => {
    if (!(await seat.$(".charselect-card"))) await seat.click('.sidebar [data-launch="characters"]');
    await seat.waitForSelector(".charselect-card", { timeout: 15000 });
    await seat.locator(".charselect-card", { hasText: name }).first().click();
    return sheetOf(seat, name);
  };
  for (const spec of game.specs) {
    await openCard(spec.name);
    await shootTabs(seat, "player", spec.name);
  }

  // The states a sheet shows by itself, each shot on the main tab, GM and player.
  for (const state of game.states) {
    const data = await dataOf(ids[state.who]);
    await tool("kraken_character_edit", { id: ids[state.who], changes: state.changes(data) });
    await settle(600);
    const gm = await gmOpen(state.who);
    await gm.locator('[data-sheet-tab="main"]').click();
    await shoot(gm, `${gameId}-gm-${slug(state.who)}-state-${state.label}`);
    await gmClose(state.who);
    const mine = await openCard(state.who);
    await mine.locator('[data-sheet-tab="main"]').click();
    await shoot(mine, `${gameId}-player-${slug(state.who)}-state-${state.label}`);
  }

  // Every control on every tab, pressed once by the player, in order, the dice fixed first.
  const presses = [];
  const CONTROLS = "button:not([data-sheet-tab]):not(.cc-portrait):not(.cc-token), input:not(.cc-name), select, textarea";
  const press = async (sheet, id, what, act) => {
    const before = await dataOf(id);
    const lines = (await chatLines()).length;
    await tool("kraken_dice_clear");
    await tool("kraken_dice_force", { values: [3, 2, 4, 1, 3, 2, 4, 1, 3, 2, 4, 1] });
    await act();
    await settle(900);
    const after = await dataOf(id);
    const posted = (await chatLines()).slice(lines).map((line) => `${line.text ?? ""} ${line.roll?.label ?? ""} ${line.roll?.total ?? ""}`.trim());
    presses.push({ what, changed: changed(before, after), posted });
  };
  for (const spec of game.specs) {
    const id = ids[spec.name];
    const sheet = await openCard(spec.name);
    for (const tab of game.tabs.split(",")) {
      await sheet.locator(`[data-sheet-tab="${tab}"]`).click();
      await settle(300);
      const count = await sheet.locator(".cc-page").locator(CONTROLS).count();
      const strip = await sheet.locator(".five-strip").locator(CONTROLS).count();
      const header = await sheet.locator(".cc-boxes").locator(CONTROLS).count();
      // The header's boxes and the strip over every tab once (on the first tab), then the tab's own controls. The
      // strip's DC or Mod stays at what was typed (1), so every later roll and save carries it.
      const first = tab === game.tabs.split(",")[0];
      const targets = [
        ...(first ? Array.from({ length: header }, (_, index) => ({ in: ".cc-boxes", index })) : []),
        ...(first ? Array.from({ length: strip }, (_, index) => ({ in: ".five-strip", index })) : []),
        ...Array.from({ length: count }, (_, index) => ({ in: ".cc-page", index })),
      ];
      let dropped = false;
      for (const target of targets) {
        const control = sheet.locator(target.in).locator(CONTROLS).nth(target.index);
        if (!(await control.count())) continue;
        const info = await control.evaluate((item) => ({ tag: item.tagName, type: item.type, text: item.textContent?.trim(), aria: item.getAttribute("aria-label"), title: item.getAttribute("title"), ghost: item.classList.contains("ghost"), disabled: item.disabled, readonly: item.readOnly, value: item.value, checked: item.checked, options: item.tagName === "SELECT" ? [...item.options].map((option) => option.value) : [] }));
        const what = `${spec.name} ${tab}: ${info.tag.toLowerCase()} ${info.aria ?? info.title ?? info.text ?? ""}`.trim();
        if (info.disabled || info.readonly) {
          presses.push({ what, skipped: info.disabled ? "disabled" : "readonly" });
          continue;
        }
        if (info.ghost) {
          if (dropped) continue;
          dropped = true;
        }
        if (info.tag === "SELECT") {
          const next = info.options.find((value) => value !== info.value) ?? info.value;
          await press(sheet, id, `${what} -> ${next}`, () => control.selectOption(next));
        } else if (info.tag === "INPUT" && info.type === "checkbox") await press(sheet, id, what, () => control.click());
        else if (info.tag === "INPUT" || info.tag === "TEXTAREA") {
          const next = info.tag === "TEXTAREA" ? `${info.value ? `${info.value}\n` : ""}Test line` : info.type === "number" || /^-?\d+(\.\d+)?$/.test(info.value) ? String((Number(info.value) || 0) + 1) : `${info.value}x`;
          await press(sheet, id, `${what} = ${JSON.stringify(next)}`, async () => {
            await control.fill(next);
            await control.press("Tab");
          });
        } else await press(sheet, id, what, () => control.click());
      }
    }
  }
  // Controls that show only in a state (a death save's Roll): the state set, the control pressed, the state put back.
  for (const extra of game.extra ?? []) {
    await tool("kraken_character_edit", { id: ids[extra.who], changes: extra.into(await dataOf(ids[extra.who])) });
    const sheet = await openCard(extra.who);
    await sheet.locator('[data-sheet-tab="main"]').click();
    await sheet.locator(extra.control).waitFor({ timeout: 10000 });
    await press(sheet, ids[extra.who], `${extra.who}: ${extra.control}`, () => sheet.locator(extra.control).click());
    await tool("kraken_character_edit", { id: ids[extra.who], changes: extra.back() });
  }
  // The GM: a level up on each sheet.
  for (const spec of game.specs) {
    const sheet = await gmOpen(spec.name);
    const ups = await sheet.locator('[data-action="level-up"]').count();
    for (let index = 0; index < ups; index++) await press(sheet, ids[spec.name], `${spec.name}: level up (GM) ${index + 1}`, () => sheet.locator('[data-action="level-up"]').nth(index).click());
    await gmClose(spec.name);
  }

  writeFileSync(path.join(out, `${gameId}-presses.json`), JSON.stringify(presses, null, 1));
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok ${gameId} sheet ui: ${checks.length} checks, ${presses.length} controls pressed; shots, signatures and presses in ${out}`);
} catch (error) {
  console.error(`FAILED after ${checks.length} checks: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
