// A book's maps, pictures and records are there only while it is active in the
// campaign (FG: a module's content once it is loaded): an inactive adventure's
// maps, Library lists and pictures are refused (the agent's tools, the image
// window), and opened once it is made active. A table map whose window the GM
// closed is not opened again when the campaign is hosted again (it is still on
// the table); a table map whose book was made inactive is not brought back.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-active-books-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
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
    return false;
  } catch (error) {
    return /not active/.test(error.message) ? error.message : `other: ${error.message}`;
  }
}
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const report = [];
const TOWER = "The Empty Watchtower";
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
  const campaign = await tool("kraken_campaign_create", { name: "Active books", ruleset: "Descending Darkness" });
  const host = async () => {
    await tool("kraken_host", { campaignId: campaign.id, port: 47458, password: "pw" });
    await page.waitForSelector("text=Hosting");
  };
  await host();
  const tower = (await tool("kraken_books", { action: "list" })).find((book) => book.name === TOWER);
  assert(tower && !tower.active, "the adventure starts inactive");

  // Inactive: its maps, lists and pictures are refused.
  const refusals = [
    await refused("kraken_open_fg_module", { module: TOWER }),
    await refused("kraken_library", { action: "list", module: TOWER, kind: "map" }),
    await refused("kraken_image", { action: "open", book: TOWER, name: "The Watchtower Yard" }),
  ];
  assert(refusals.every((item) => typeof item === "string" && !item.startsWith("other")), `an inactive book's maps, lists and pictures are refused: ${JSON.stringify(refusals)}`);
  // In Modules, its title does not open it.
  await page.click('.sidebar [data-launch="books:activation"]');
  await page.waitForSelector(`[data-window="books"] [data-book="${tower.id}"].inactive`);
  await page.$eval(`[data-window="books"] [data-book="${tower.id}"]`, (button) => button.click());
  await settle(600);
  assert(!(await page.$('[data-window="book"]')), "an inactive book does not open from Modules");
  await page.click('.sidebar [data-launch="books:activation"]');
  report.push(`inactive, ${TOWER}'s maps, Library lists and pictures are refused ("${refusals[0]}"); it does not open from Modules`);

  // Active: its maps open; one goes on the table.
  await tool("kraken_books", { action: "activate", book: tower.id });
  const opened = await tool("kraken_open_fg_module", { module: TOWER, maps: ["The Watchtower Yard"] });
  assert((opened.scenes?.length ?? 0) >= 1, "active, its map goes on the table");
  await page.waitForSelector('.window[data-window="map"]');
  report.push("made active, its map goes on the table");

  // The GM closes the table map's window; hosted again, it stays closed (still on the table).
  await page.$eval('.window[data-window="map"] [aria-label^="Close"]', (button) => button.click());
  await page.waitForSelector('.window[data-window="map"]', { state: "detached" });
  await settle(800);
  await tool("kraken_leave");
  await page.waitForSelector("text=My Campaigns");
  await host();
  await settle(2500);
  const onTable = await tool("kraken_scenes", {}).catch((error) => ({ error: error.message }));
  assert(onTable.onTable?.name === "The Watchtower Yard", `the map is still the table's (${JSON.stringify(onTable)})`);
  assert(!(await page.$('.window[data-window="map"]')), "the map window the GM closed is not opened again on hosting");
  report.push("its window closed by the GM, hosting again leaves it closed (the map is still the table's)");

  // The book made inactive: hosting again does not bring its map back.
  await tool("kraken_books", { action: "deactivate", book: tower.id });
  await tool("kraken_leave");
  await page.waitForSelector("text=My Campaigns");
  await host();
  await settle(2500);
  const after = await tool("kraken_scenes", {}).catch((error) => ({ error: error.message }));
  assert(!after.onTable, `an inactive book's map is not brought back (${JSON.stringify(after)})`);
  report.push("the book made inactive, hosting again does not bring its map back");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok active books ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
