// The GM's own Kraken packs in the real app (a probe, not a check: it needs
// the GM's packs): a fresh profile, so no campaign of the GM's is touched;
// a D&D 3.5E campaign with the 3.5E Player's Handbook and Monster Manual
// packs active, a fighter built, the tracker; a C&C campaign with the C&C
// Player's Handbook's pack opened in Books. Screenshots go to the temp folder.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-packs-real-"));
// No FG modules folder at all: only the packs.
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: process.env.KRAKEN_PACKS || path.join(process.env.USERPROFILE || process.env.HOME || "", "Documents", "Kraken VTT", "Packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    answers.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const listOf = (value) => (Array.isArray(value) ? value : value.records ?? []);
const shot = (name) => page.screenshot({ path: path.join(tmpdir(), `kraken-packs-real-${name}.png`) });
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "3.5E from packs", ruleset: "D&D 3.5E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47451, password: "" });
  await page.waitForSelector("text=Hosting");
  let started = performance.now();
  const shelf = await tool("kraken_books", { action: "list" });
  const books = shelf.books ?? shelf;
  console.log(`3.5E shelf (${Math.round(performance.now() - started)} ms): ${books.length} books, all packs: ${books.every((book) => book.pack)}; ${books.map((book) => book.title).join(" | ")}`);
  for (const name of ["D&D 3.5e Player's Handbook v1", "D&D 3.5e Monster Manual v1"]) {
    started = performance.now();
    await tool("kraken_books", { action: "activate", book: name });
    console.log(`  ${name} active in ${Math.round(performance.now() - started)} ms`);
  }
  const count = async (type) => listOf(await tool("kraken_records_list", { type })).length;
  console.log(`  records: ${await count("class")} classes, ${await count("race")} races, ${await count("feat")} feats, ${await count("spell")} spells, ${await count("item")} items, ${await count("npc")} creatures`);
  const built = await tool("kraken_build_character", { spec: { name: "Regdar", race: "Human", class: "Fighter", level: 4 } });
  console.log(`  Regdar: ${JSON.stringify(built)}`);
  const npcs = listOf(await tool("kraken_records_list", { type: "npc" }));
  const owlbear = npcs.find((item) => item.name === "Owlbear");
  await tool("kraken_combat", { action: "add", recordId: built.id });
  await tool("kraken_combat", { action: "add", recordId: owlbear.id });
  await tool("kraken_combat", { action: "init", which: "all" });
  const view = (await tool("kraken_combat", { action: "view" })).entries;
  console.log(`  tracker: ${view.map((entry) => `${entry.name} init ${entry.initresult} hp ${entry.hp} ac ${entry.ac}${entry.attacks ? ` [${entry.attacks.map((attack) => `${attack.name} ${attack.bonuses?.join("/")} ${attack.damage}`).join("; ")}]` : ""}`).join(" | ")}`);
  await page.click('.sidebar [data-launch="characters"]');
  await page.waitForSelector('.sheet-35 [data-stat="ac"]', { timeout: 15000 }).catch(() => undefined);
  await shot("sheet");
  await page.click('.sidebar [data-launch="books"]');
  await page.click('[data-books-tab="activation"]');
  await page.waitForSelector(".books-window [data-book]");
  await shot("shelf");
  started = performance.now();
  await page.click('.books-window [data-book="D&D 3.5e Player\'s Handbook v1"]');
  await page.waitForSelector(".book-page", { timeout: 30000 });
  console.log(`  the handbook opened in ${Math.round(performance.now() - started)} ms`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await shot("book");
  await tool("kraken_stop_host").catch(() => undefined);
  console.log(`screenshots: ${path.join(tmpdir(), "kraken-packs-real-*.png")}`);
} finally {
  child.kill();
  await app.close();
}
