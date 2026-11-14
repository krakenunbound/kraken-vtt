// A clean computer: Kraken with no Fantasy Grounds and no data of the GM's,
// whose books are only Kraken packs copied into the packs folder. Kraken's own
// games' books come from the packs it ships (games/packs); the GM's from the
// .kpack files copied in. Each is listed for its campaign's game, made active,
// read page by page, and an adventure's map goes on the table with its walls.
//
//   KRAKEN_APP     the built app to run (release/win-unpacked/Kraken VTT.exe);
//                  without it, this checkout (after npm run build-packs, so
//                  its games/packs are newer than games/modules and are read)
//   KRAKEN_TEST_PACKS  .kpack files to copy in, separated by ";" (else a pack
//                  is made of Kraken's own Empty Watchtower under another name)
//   KRAKEN_TEST_ADVENTURE  which copied pack is an adventure with a map
//   KRAKEN_TEST_RULESET    its campaign's game (Castles & Crusades...)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const require = createRequire(import.meta.url);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(path.join(tmpdir(), "kraken-clean-"));
// A computer with nothing on it: an empty APPDATA (no Fantasy Grounds, no
// Kraken data), an empty home (Documents), the packs folder Kraken would use.
const appData = path.join(root, "AppData", "Roaming");
const home = path.join(root, "home");
const packsFolder = path.join(home, "Documents", "Kraken VTT", "Packs");
for (const dir of [appData, path.join(root, "AppData", "Local"), packsFolder]) mkdirSync(dir, { recursive: true });

// The GM's packs, copied into the packs folder while Kraken is open (after
// Kraken's own games are checked): the shelf finds them without a restart.
const copied = [];
const toCopy = [];
const staging = path.join(root, "made");
if (process.env.KRAKEN_TEST_PACKS) {
  for (const file of process.env.KRAKEN_TEST_PACKS.split(";").filter(Boolean)) {
    toCopy.push(file);
    copied.push(path.basename(file, ".kpack"));
  }
} else {
  // A made-up book of the GM's: Kraken's adventure, renamed, as a pack.
  const { readModule } = require("../electron/importers/fgModule.cjs");
  const { describe } = require("../electron/books.cjs");
  const { makePack } = require("../electron/packs.cjs");
  const source = path.join(root, "made", "Clean Test Watchtower");
  cpSync(path.join("games", "modules", "The Empty Watchtower"), source, { recursive: true });
  for (const name of ["definition.xml", "db.xml", "client.xml"]) {
    const at = path.join(source, name);
    if (existsSync(at)) writeFileSync(at, readFileSync(at, "utf8").replaceAll("The Empty Watchtower", "Clean Test Watchtower"));
  }
  toCopy.push(makePack(source, { read: readModule, describe, folder: path.join(staging, "packs") }).file);
  copied.push("Clean Test Watchtower");
}
const adventure = process.env.KRAKEN_TEST_ADVENTURE || "Clean Test Watchtower";
const ruleset = process.env.KRAKEN_TEST_RULESET || "Descending Darkness";

const profile = path.join(appData, "kraken-vtt");
const env = {
  ...process.env,
  APPDATA: appData,
  LOCALAPPDATA: path.join(root, "AppData", "Local"),
  USERPROFILE: home,
  HOME: home,
  KRAKEN_AGENT_FILE: path.join(root, "agent.json"),
  KRAKEN_AGENT_PORT: "0",
};
delete env.KRAKEN_PACKS;
delete env.KRAKEN_BOOKS;
const packaged = process.env.KRAKEN_APP;
const app = packaged
  ? await electron.launch({ executablePath: packaged, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
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
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const fromPack = (book) => book.pack === true;

  // A book read from its pack: made active, its contents, one of its pages.
  async function readBook(book) {
    await tool("kraken_books", { action: "activate", book: book.id });
    const contents = await tool("kraken_books", { action: "contents", book: book.id });
    const pages = JSON.stringify(contents).match(/"id":"[^"]+"/g) ?? [];
    assert(pages.length > 0, `${book.title}: no contents`);
    return pages.length;
  }

  // Kraken's own games: their books are the packs Kraken ships.
  for (const game of ["Descending Darkness", "Apeira Astra", "Cairn", "Ironsworn", "Starforged"]) {
    const campaign = await tool("kraken_campaign_create", { name: `Clean ${game}`, ruleset: game });
    await tool("kraken_host", { campaignId: campaign.id, port: 47441 + report.length, password: "pw" });
    await page.waitForSelector("text=Hosting");
    const books = await tool("kraken_books", { action: "list" });
    const ours = books.filter((book) => !copied.includes(book.name));
    assert(ours.length === 3, `${game}: Kraken's own books (${books.map((book) => book.title).join(", ")})`);
    assert(ours.every(fromPack), `${game}: a book not read from a pack: ${ours.filter((book) => !fromPack(book)).map((book) => book.id).join(", ")}`);
    const handbook = ours.find((book) => book.hasBook && !book.adventure) ?? ours[0];
    report.push(`${game}: ${ours.length} shipped packs, ${handbook.title} read (${await readBook(handbook)} entries)`);
    await tool("kraken_leave", {});
    await page.waitForSelector("text=My Campaigns");
  }

  // The GM's books copied in, for their own game.
  for (const file of toCopy) copyFileSync(file, path.join(packsFolder, path.basename(file)));
  const campaign = await tool("kraken_campaign_create", { name: "Clean GM books", ruleset });
  await tool("kraken_host", { campaignId: campaign.id, port: 47444, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const books = await tool("kraken_books", { action: "list" });
  const theirs = books.filter((book) => copied.includes(book.name) || copied.some((name) => (book.id ?? "").includes(name)));
  assert(theirs.length > 0, `the copied packs are not on the shelf (${books.map((book) => book.title).join(", ")})`);
  assert(theirs.every(fromPack), "a copied book not read from its pack");
  for (const book of theirs.filter((item) => item.hasBook)) report.push(`${book.title}: ${await readBook(book)} entries`);
  const bundle = await tool("kraken_open_fg_module", { module: adventure });
  assert(bundle.scenes?.length > 0, `${adventure}: no maps`);
  // The first map on the table with the walls its pack holds (an FG map drawn without line of sight has none).
  const expected = bundle.scenes[0].walls;
  let count = -1;
  for (let wait = 0; wait < 40 && count !== expected; wait++) {
    count = (await tool("kraken_wall", { action: "list" })).total ?? 0;
    if (count !== expected) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(count === expected, `${adventure}: ${count} walls on the table, its pack has ${expected}`);
  report.push(`${adventure}: ${bundle.scenes.length} map(s) on the table, the first (${bundle.scenes[0].name}) with its ${count} walls`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok clean install${packaged ? " (the built app)" : ""}: books only from packs, no Fantasy Grounds\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
