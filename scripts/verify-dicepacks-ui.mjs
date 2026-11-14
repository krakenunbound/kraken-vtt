// Kraken's folders and dice packs.
//  - Documents/Kraken VTT (here, the test's own tree beside its packs) is
//    made with a folder for each kind of thing (Packs, Dice, Dice Towers, GM
//    Icons, Background Decals, Wallpapers), each with its README, plus the
//    top README and AGENTS.md (the kraken-content skill); the Dice folder
//    starts with the example pack; a GM icon from the app's old assets folder
//    is copied into GM Icons.
//  - kraken_dice_packs: list (the example's four sets, no problems), check (a
//    broken pack's problems, before it is dropped in), a .zip pack read too.
//  - The Dice window: each pack is a group; a picture set (Kraken Hide)
//    chosen, drawn with its picture; kraken_dice_settings takes a pack's set
//    by name; a roll on the table in it.
//  - A test player in Chrome sees the pack's sets too, their pictures drawn
//    (fetched from the host under the player's token).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { strToU8, zipSync } from "fflate";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = process.env.SHOTS || tmpdir();

const profile = mkdtempSync(path.join(tmpdir(), "kraken-dicepacks-ui-"));
// The app's old assets folder (before Documents/Kraken VTT): a GM icon in it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVR42mNk+M9Qz0AEYBxVMKpgVMGogoGhAwCHPQ4R4zAKMQAAAABJRU5ErkJggg==", "base64");
mkdirSync(path.join(profile, "assets", "gm-icons"), { recursive: true });
writeFileSync(path.join(profile, "assets", "gm-icons", "Old Icon.png"), PNG);
const home = path.join(profile, "Kraken VTT");
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(home, "Packs") };
delete env.KRAKEN_HOME;
const app = process.env.KRAKEN_APP
  ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
const report = [];
let browser = null;
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Dice packs", ruleset: "Worldbuilding" });
  const port = 47463;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // The folders, their guides, the example pack, the old icon copied over.
  for (const name of ["Packs", "Dice", "Dice Towers", "GM Icons", "Background Decals", "Wallpapers"]) {
    const readme = path.join(home, name, "README.md");
    assert(existsSync(readme) && readFileSync(readme, "utf8").includes("kraken-vtt guide"), `${name} has its README`);
  }
  assert(readFileSync(path.join(home, "README.md"), "utf8").includes("| `Dice` |"), "the top README lists the folders");
  assert(readFileSync(path.join(home, "AGENTS.md"), "utf8").includes("kraken_dice_packs"), "AGENTS.md: the skill for agents");
  assert(existsSync(path.join(home, "Dice", "Kraken Sea Glass", "dice.json")), "the example dice pack came with the Dice folder");
  assert(existsSync(path.join(home, "GM Icons", "Old Icon.png")), "a GM icon from the old assets folder is copied into GM Icons");
  const icons = await tool("kraken_decal", { kind: "gmicon", action: "list", search: "Old Icon" });
  assert(icons.gmIcons.some((item) => item.name === "Old Icon"), `and it is a GM icon to choose (${JSON.stringify(icons.gmIcons)})`);
  report.push(`Documents/Kraken VTT: ${readdirSync(home).join(", ")}; each folder with its README; the example pack in Dice; an old GM icon moved to GM Icons`);

  // kraken_dice_packs: the example's sets; a broken pack checked; a zip read.
  const listed = await tool("kraken_dice_packs", { action: "list" });
  const example = listed.packs.find((pack) => pack.id === "Kraken Sea Glass");
  assert(example && example.sets.length === 4 && example.problems.length === 0, `the example: four sets, no problems (${JSON.stringify(listed)})`);
  assert(example.sets.find((set) => set.name === "Kraken Hide").texture === "Kraken Sea Glass/kraken-hide.webp", "a picture set names its picture");
  const broken = path.join(profile, "Broken Pack");
  mkdirSync(broken);
  writeFileSync(path.join(broken, "dice.json"), JSON.stringify({ kraken: "dice-pack", version: 1, name: "Broken", sets: [{ name: "No colours", theme: "marble" }, { name: "Lost picture", texture: "gone.png", body: "#000000", ink: "#ffffff" }, { name: "Fine", theme: "wood", body: "#8a5a2f", ink: "#f1dfb8" }] }));
  const checked = await tool("kraken_dice_packs", { action: "check", path: broken });
  assert(checked.sets.length === 1 && checked.problems.some((text) => text.includes("No colours")) && checked.problems.some((text) => text.includes("gone.png")), `check: its problems before it is dropped in (${JSON.stringify(checked)})`);
  const exampleFolder = path.join(home, "Dice", "Kraken Sea Glass");
  const zipped = zipSync({ "Zipped Sea/dice.json": strToU8(readFileSync(path.join(exampleFolder, "dice.json"), "utf8").replace('"name": "Kraken Sea Glass"', '"name": "Zipped Sea"')), "Zipped Sea/kraken-hide.webp": readFileSync(path.join(exampleFolder, "kraken-hide.webp")), "Zipped Sea/kraken-hide-glow.webp": readFileSync(path.join(exampleFolder, "kraken-hide-glow.webp")), "Zipped Sea/sea-glass.webp": readFileSync(path.join(exampleFolder, "sea-glass.webp")) });
  writeFileSync(path.join(home, "Dice", "Zipped Sea.zip"), zipped);
  const again = await tool("kraken_dice_packs", { action: "list" });
  const zipPack = again.packs.find((pack) => pack.id === "Zipped Sea");
  assert(zipPack && zipPack.name === "Zipped Sea" && zipPack.sets.length === 4 && zipPack.problems.length === 0, `a .zip pack is read too (${JSON.stringify(again.packs.map((pack) => [pack.id, pack.sets.length, pack.problems]))})`);
  report.push("kraken_dice_packs: list (Kraken Sea Glass: 4 sets), check (a broken pack: a set with no colours, a missing picture), a .zip pack read too");

  // The Dice window: the pack's group, its picture set chosen and drawn. (Hosted again, so the new zip is read by the seat.)
  await tool("kraken_leave");
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");
  await page.click('[data-launch="settings"]');
  await page.click('[data-setting="dice"]');
  await page.waitForSelector('.dice-window [aria-label="Groups"] >> text=Kraken Sea Glass');
  await page.click('.dice-window [aria-label="Groups"] >> text=Kraken Sea Glass');
  await page.waitForSelector('.dice-window [data-preset="Kraken Hide"] img');
  assert((await page.$$(".dice-window .dice-sets .dice-set")).length === 4, "the pack's group holds its four sets");
  await page.click('.dice-window [data-preset="Kraken Hide"]');
  await page.waitForSelector('.dice-window [data-active-set="Kraken Hide"]');
  await settle(1500);
  await page.locator(".dice-window").screenshot({ path: path.join(SHOTS, "kraken-dicepacks-window.png") });
  const mine = await tool("kraken_dice_settings");
  assert(mine.look.theme === "picture" && mine.look.texture === "Kraken Sea Glass/kraken-hide.webp" && mine.look.glowTexture === "Kraken Sea Glass/kraken-hide-glow.webp", `chosen: the picture dice (${JSON.stringify(mine.look)})`);
  // The tray's picture of it: the texture drawn (not a blank die).
  const tray = await page.$eval('.dice-window [data-preset="Kraken Hide"] img', (img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let purple = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && data[i + 2] > data[i + 1] + 20 && data[i] > data[i + 1]) purple++;
    return purple;
  });
  assert(tray > 200, `the set's picture shows the kraken hide (${tray} purple pixels)`);
  report.push("the Dice window: the pack is a group of its own; Kraken Hide chosen, drawn in its picture");

  // By name, for the agent: a pack's set as a preset; and a roll in it.
  const glass = await tool("kraken_dice_settings", { preset: "Sea Glass" });
  assert(glass.look.texture === "Kraken Sea Glass/sea-glass.webp" && glass.look.material === "glass", `kraken_dice_settings preset Sea Glass (${JSON.stringify(glass.look)})`);
  const back = await tool("kraken_dice_settings", { preset: "Rune Steel" });
  assert(back.look.theme === "runes" && !back.look.texture, `a set of Kraken's after it leaves no picture behind (${JSON.stringify(back.look)})`);
  await tool("kraken_dice_settings", { preset: "Kraken Hide" });
  await page.click('.window[data-window="dice"] [aria-label="Close"], .window[data-window="dice"] .window-close').catch(() => undefined);
  await tool("kraken_table_options", { diceHold: 8 });
  await tool("kraken_roll", { formula: "3d20", label: "Pack dice" });
  await page.waitForFunction(() => document.querySelector(".dice-layer")?.dataset.landedAt, null, { timeout: 15000 });
  await settle(600);
  await page.screenshot({ path: path.join(SHOTS, "kraken-dicepacks-roll.png") });
  report.push("kraken_dice_settings preset Sea Glass and Kraken Hide (a pack's sets by name), Rune Steel after leaves no picture; 3d20 rolled in Kraken Hide");

  // A test player in Chrome: the pack's sets, their pictures from the host.
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seat.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "A test player");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.fill('input[name="password"]', "pw");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar");
  await seat.click('[data-launch="settings"]');
  await seat.click('[data-setting="dice"]');
  await seat.waitForSelector('.dice-window [aria-label="Groups"] >> text=Kraken Sea Glass');
  assert(!(await seat.$('[data-action="dice-packs-folder"]')), "the player has no Dice packs folder button");
  await seat.click('.dice-window [aria-label="Groups"] >> text=Kraken Sea Glass');
  await seat.waitForSelector('.dice-window [data-preset="Sea Glass"] img', { timeout: 30000 });
  await seat.click('.dice-window [data-preset="Sea Glass"]');
  await seat.waitForSelector('.dice-window [data-active-set="Sea Glass"]');
  await settle(1500);
  await seat.locator(".dice-window").screenshot({ path: path.join(SHOTS, "kraken-dicepacks-player.png") });
  report.push("a test player in Chrome: the pack's group, its pictures drawn (from the host), Sea Glass chosen");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok dice packs ui${process.env.KRAKEN_APP ? " (the built app)" : ""}:\n  ${report.join("\n  ")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
