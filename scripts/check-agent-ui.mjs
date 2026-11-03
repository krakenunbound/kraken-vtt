// The agent drives the GM's interface as the GM's clicks do: windows (open,
// pop out to a window of its own, dock, close, a character's sheet), the
// GM's 3D dice settings, opening an adventure bundle, switching scenes and
// pinging the map. Starts the real app and talks to it as an MCP client.
// The adventure part needs a Foundry bundle: KRAKEN_BUNDLE, or the GM's Keep
// on the Borderlands; it is skipped when there is none.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";
import WebSocket from "ws";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-agent-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
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
async function refused(name, args) {
  try {
    await tool(name, args);
  } catch (error) {
    return error.message;
  }
  throw new Error(`${name} ${JSON.stringify(args)} should have been refused`);
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const names = (await rpc("tools/list")).tools.map((item) => item.name);
  for (const needed of ["kraken_windows", "kraken_dice_settings", "kraken_open_adventure", "kraken_scenes", "kraken_ping"]) assert(names.includes(needed), `tool ${needed} listed`);

  const campaign = await tool("kraken_campaign_create", { name: "Agent UI", ruleset: "Castles & Crusades" });
  const port = 47391;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // Dice settings: read, a preset, a custom colour, nonsense refused.
  const dice = await tool("kraken_dice_settings");
  assert(dice.show === true && dice.preset === "Classic Ruby", `default dice ${JSON.stringify(dice)}`);
  const starfall = await tool("kraken_dice_settings", { preset: "starfall", volume: 0.3 });
  assert(starfall.preset === "Starfall" && starfall.volume === 0.3, `Starfall ${JSON.stringify(starfall)}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("kraken-dice") ?? "{}"));
  assert(saved.look?.theme === "starfall" && saved.volume === 0.3, "the window keeps the agent's dice settings");
  assert((await tool("kraken_dice_settings", { ink: "#ffcc00" })).preset === "custom", "a custom colour");
  assert((await refused("kraken_dice_settings", { preset: "Plaid" })).includes("Presets:"), "an unknown preset is refused");
  assert((await refused("kraken_dice_settings", { body: "red" })).includes("colour"), "a bad colour is refused");
  // The parts of a look: a set, then a material, an effect, a design and lettering on top of it.
  const custom = await tool("kraken_dice_settings", { preset: "Frost Glass", material: "metal", effect: "fire", design: "marble", accent: "#223344", font: "runic", crit: false });
  assert(custom.look.material === "metal" && custom.look.effect === "fire" && custom.look.theme === "marble" && custom.look.accent === "#223344" && custom.look.font === "runic" && custom.look.crit === false && custom.look.body === "#9fd8ff", `custom look ${JSON.stringify(custom.look)}`);
  assert((await tool("kraken_dice_settings", { preset: "Rune Steel" })).preset === "Rune Steel", "a set is named again when matched");
  assert((await refused("kraken_dice_settings", { effect: "lasers" })).includes("Choose from"), "an unknown effect is refused");
  // The Dice window opens from the chat's gear and shows the set chosen.
  await page.click(".dice-settings-button");
  await page.waitForSelector('.dice-window [data-preset="Rune Steel"][aria-pressed="true"]');
  await page.click('.dice-window [data-choice="glass"]');
  assert((await tool("kraken_dice_settings")).look.material === "glass", "a click in the Dice window changes the look");
  await tool("kraken_windows", { action: "close", kind: "dice" });
  // FG's tray: the dice are 3D in this seat's set; a right-click rolls several, the modifier's quick values add up.
  await page.waitForSelector(".tray-die img.tray-die-3d");
  await page.locator(".modifier-box").click({ button: "right" });
  await page.click('.tray-menu button:has-text("+2")');
  await page.click('.tray-die[aria-label="d6"]', { button: "right" });
  await page.click('[data-many="3"]');
  await settle(600);
  const thrown = (await tool("kraken_chat_log", { count: 3 })).at(-1);
  assert(thrown.roll?.formula === "3d6+2", `right-click rolled 3d6 with the +2: ${JSON.stringify(thrown.roll?.formula)}`);

  // The art library the pickers show (empty when this computer has no FG art).
  const art = await tool("kraken_art", { kind: "portrait", limit: 3 });
  assert(Number.isInteger(art.total) && art.art.length <= 3 && art.art.every((item) => item.kind === "portrait"), `art ${JSON.stringify(art)}`);

  // Windows: open, pop out, dock, close; a character's sheet by name.
  assert((await tool("kraken_windows")).open.length === 0, "no windows open at first");
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await page.waitForSelector(".window .combat-tracker, .window [class*=combat]");
  assert((await tool("kraken_windows")).open.some((item) => item.kind === "combat" && !item.poppedOut), "the combat tracker is open");
  await tool("kraken_windows", { action: "popout", kind: "combat" });
  await settle();
  assert((await tool("kraken_windows")).open.find((item) => item.kind === "combat")?.poppedOut, "it popped out");
  assert(app.windows().length === 2, `a window of its own (${app.windows().length} windows)`);
  await tool("kraken_windows", { action: "dock", kind: "combat" });
  await settle();
  assert(!(await tool("kraken_windows")).open.find((item) => item.kind === "combat").poppedOut && app.windows().length === 1, "docked back");
  await tool("kraken_windows", { action: "close", kind: "combat" });
  await settle(200);
  assert((await tool("kraken_windows")).open.length === 0, "closed");
  const hero = await tool("kraken_record_create", { type: "character", name: "Elowen", data: { level: 1 } });
  await tool("kraken_windows", { action: "open", kind: "sheet", record: "elowen" });
  await settle();
  assert((await tool("kraken_windows")).open.some((item) => item.key === `sheet:${hero.id}` && item.title === "Elowen"), "Elowen's sheet is open");
  assert((await refused("kraken_windows", { action: "close", kind: "party" })).includes("not open"), "closing a window that is not open is refused");
  assert((await refused("kraken_windows", { action: "open", kind: "sheet", record: "Nobody" })).includes("No character"), "an unknown character is refused");

  // The background decal: Settings and the picker are windows; the decal shows on the empty desktop.
  await tool("kraken_windows", { action: "open", kind: "settings" });
  await page.waitForSelector('[data-setting="decal"]');
  await page.click('[data-setting="decal"]');
  await page.waitForSelector('.decal-tile[data-decal="kraken/Floating Keep.webp"]');
  await page.click('.decal-tile[data-decal="kraken/Floating Keep.webp"]');
  await page.click('[data-action="decal-ok"]');
  await page.waitForSelector('img.decal[src*="Floating%20Keep"]');
  assert(!(await tool("kraken_windows")).open.some((item) => item.kind === "decals"), "OK closes the picker");
  assert((await tool("kraken_decal")).decal === "kraken/Floating Keep.webp", "the GM's pick is the table's decal");
  await tool("kraken_decal", { action: "set", id: "" });
  await page.waitForFunction(() => !document.querySelector(".desktop-empty img"));
  await tool("kraken_decal", { action: "set", id: "kraken" });
  await page.waitForSelector(".desktop-empty img.emblem");
  await tool("kraken_windows", { action: "close", kind: "settings" });

  // No map yet: nothing to ping or switch.
  assert((await refused("kraken_ping", { col: 1, row: 1 })).includes("No scene"), "no ping without a scene");
  assert((await refused("kraken_scenes", {})).includes("No adventure"), "no scenes without an adventure");

  const bundle = process.env.KRAKEN_BUNDLE ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Keep on the Borderlands (Foundry).zip`;
  if (!existsSync(bundle)) {
    console.log("skip adventure, scenes and ping: no bundle at", bundle);
  } else {
    const opened = await tool("kraken_open_adventure", { path: bundle });
    assert(opened.adventures.length >= 1 && opened.opened, `opened ${JSON.stringify(opened)}`);
    await page.waitForSelector(".toolbar[data-adventure]");
    const list = await tool("kraken_scenes");
    assert(list.scenes.length >= 1 && list.onTable, `scenes ${JSON.stringify(list).slice(0, 300)}`);
    const other = list.scenes.find((item) => item.id !== list.onTable.id) ?? list.scenes[0];
    const switched = await tool("kraken_scenes", { scene: other.name });
    assert(switched.onTable.id === other.id, "switched the scene on the table");
    await settle(800);
    assert((await tool("kraken_status")).scene?.id === other.id || (await tool("kraken_map")).scene.id === other.id, "the table has the new scene");
    assert((await refused("kraken_scenes", { scene: "No Such Place" })).includes("No scene"), "an unknown scene is refused");

    // A player sees the agent's ping.
    const ann = new WebSocket(`ws://127.0.0.1:${port}`);
    const pinged = new Promise((resolve) => ann.on("message", (data) => JSON.parse(data.toString()).type === "ping" && resolve(JSON.parse(data.toString()))));
    await new Promise((resolve) => ann.on("open", () => ann.send(JSON.stringify({ type: "join", name: "Ann", password: "pw" })) || setTimeout(resolve, 400)));
    await tool("kraken_ping", { col: 3, row: 2 });
    const ping = await Promise.race([pinged, settle(3000).then(() => null)]);
    assert(ping && Number.isFinite(ping.x) && ping.from === "Agent", `Ann saw the ping: ${JSON.stringify(ping)}`);
    ann.close();
  }
  await tool("kraken_leave");
  console.log("AGENT_UI_OK");
} finally {
  child.stdin.end();
  await app.close();
}
