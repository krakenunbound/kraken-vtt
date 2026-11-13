// Kraken packs in the real app: the GM opens Books, the Packs tab lists the
// FG modules for the campaign's game, makes a pack of one with its button and
// the rest with "Make N packs" (kraken_packs too); the books then come from
// the packs (marked "Kraken pack" on the shelf) and a page reads from one.
// Made-up modules, so it needs no FG modules; the packs go to a folder of
// their own.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";
import { makeBooks } from "./fake-books.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-packs-ui-"));
const packsFolder = path.join(profile, "packs");
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: makeBooks(), KRAKEN_PACKS: packsFolder };
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
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Packs UI", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47396, password: "pw" });
  await page.waitForSelector("text=Hosting");

  // Modules, the Packs tab: this game's modules, none with a pack yet.
  await page.click('.sidebar [data-launch="books:activation"]');
  await page.click('[data-books-tab="packs"]');
  await page.waitForSelector('[data-packs] [data-pack-book="Test Keep"][data-pack-state="none"]');
  assert((await page.$('[data-packs] [data-pack-book="Other Game"]')) === null, "another game's module is not listed");
  await page.click('[data-packs-every]');
  await page.waitForSelector('[data-packs] [data-pack-book="Other Game"]');
  await page.click('[data-packs-every]');
  await page.waitForFunction(() => !document.querySelector('[data-packs] [data-pack-book="Other Game"]'));
  const listed = await tool("kraken_packs", { action: "list", ruleset: "Castles & Crusades" });
  assert(listed.folder === packsFolder && listed.books.some((book) => book.id === "Test Keep" && book.ruleset === "Castles & Crusades" && book.pack === null), `kraken_packs lists the modules: ${JSON.stringify(listed).slice(0, 400)}`);

  // One pack with its own button.
  await page.click('[data-pack-make="Test Keep"]');
  await page.waitForSelector('[data-packs] [data-pack-book="Test Keep"][data-pack-state="made"]', { timeout: 60000 });
  assert(existsSync(path.join(packsFolder, "Test Keep.kpack")), "Test Keep.kpack is in the packs folder");

  // The rest: "Make N packs", and the agent's make all for another game.
  const label = await page.textContent('[data-action="packs-make-all"]');
  assert(/Make \d+ packs?/.test(label ?? "") && !/no/.test(label ?? ""), `the button says how many: ${label}`);
  await page.click('[data-action="packs-make-all"]');
  await page.waitForFunction(() => [...document.querySelectorAll("[data-packs] [data-pack-book]")].every((row) => row.getAttribute("data-pack-state") === "made"), null, { timeout: 60000 });
  assert((await page.textContent('[data-action="packs-make-all"]'))?.includes("no packs"), "nothing left to make");
  const queued = await tool("kraken_packs", { action: "make", books: ["all"], ruleset: "" });
  assert(queued.queued.includes("Other Game"), `kraken_packs makes the other game's: ${JSON.stringify(queued)}`);
  for (let tries = 0; tries < 60 && !existsSync(path.join(packsFolder, "Other Game.kpack")); tries++) await new Promise((resolve) => setTimeout(resolve, 500));
  const packs = readdirSync(packsFolder).filter((name) => name.endsWith(".kpack")).sort();
  assert(packs.includes("Other Game.kpack") && packs.includes("Test Handbook.kpack") && packs.includes("Test Keep.kpack"), `the packs: ${packs.join(", ")}`);

  // The shelf reads the packs: marked, and a page comes from one.
  const shelf = await tool("kraken_books", { action: "list" });
  const keep = shelf.find((item) => item.id === "Test Keep");
  assert(keep?.pack === true, `the shelf's book is the pack: ${JSON.stringify(keep)}`);
  await tool("kraken_books", { action: "activate", book: "Test Keep" });
  const read = await tool("kraken_books", { action: "page", book: "Test Keep", page: "gate" });
  assert(JSON.stringify(read).includes("guards"), "a page read from the pack");
  await page.click('[data-books-tab="activation"]');
  await page.waitForSelector('.books-window [data-book="Test Keep"]');
  assert((await page.textContent('.books-window [data-book="Test Keep"]'))?.includes("Kraken pack"), "the shelf says it is a Kraken pack");
  assert(failures.length === 0, `no page errors: ${failures.join("; ")}`);
  console.log(`ok packs-ui: the Packs tab lists this game's modules (every game on a tick), makes one pack and then the rest, kraken_packs lists and makes them; the shelf reads the books from the packs (${packs.length} packs)`);
} finally {
  child.kill();
  await app.close();
}
