// What each ruleset's shelf holds on this computer (the GM's FG modules and
// Kraken packs): for every ruleset, a campaign hosted in a fresh profile, its
// books listed (adventures, maps, creatures, parcels), then closed. A probe for
// planning play tests; it changes nothing of the GM's. Windows open on the
// left monitor (KRAKEN_WINDOW_AT).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const RULESETS = (process.argv[2] ?? "Castles & Crusades,D&D 5E,D&D 3.5E,AD&D 2E,Traveller,Descending Darkness,Apeira Astra,Cairn,Worldbuilding").split(",");
const profile = mkdtempSync(path.join(tmpdir(), "kraken-shelves-"));
const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => answers.get(JSON.parse(line).id)?.(JSON.parse(line)));
let nextId = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const report = {};
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  let port = 47500;
  for (const ruleset of RULESETS) {
    const out = (report[ruleset] = { books: [] });
    try {
      const campaign = await tool("kraken_campaign_create", { name: `Shelf ${ruleset}`, ruleset });
      await tool("kraken_host", { campaignId: campaign.id, port: port++, password: "" });
      const shelf = await tool("kraken_books", { action: "list" });
      for (const book of shelf.books ?? shelf) {
        const row = { id: book.id, title: book.title, category: book.category, adventure: book.adventure, hasBook: book.hasBook };
        if (book.adventure) {
          for (const kind of ["npc", "parcel", "battle"]) {
            try {
              row[kind] = (await tool("kraken_library", { action: "list", module: book.name ?? book.id, kind })).length ?? null;
            } catch (error) {
              row[kind] = `x ${String(error.message).slice(0, 60)}`;
            }
          }
        }
        out.books.push(row);
      }
      await tool("kraken_stop_host").catch(() => undefined);
    } catch (error) {
      out.error = error.message;
    }
    console.log(`${ruleset}: ${out.books.length} books${out.error ? ` (${out.error})` : ""}`);
    for (const book of out.books) console.log(`   ${book.adventure ? "A" : " "} ${book.title}${book.adventure ? ` | npc ${book.npc} parcel ${book.parcel} battle ${book.battle}` : ""}`);
  }
} finally {
  writeFileSync(path.join(tmpdir(), "kraken-shelves.json"), JSON.stringify(report, null, 1));
  child.kill();
  await app.close();
}
