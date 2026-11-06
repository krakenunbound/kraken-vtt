// Heavy work never freezes the GM's window: the backend (table server,
// books, libraries, agent) runs in a process of its own. While the agent opens
// ten books one after another (each a module unpacked and read), the window's
// process (Electron's main: the window's input and its calls) is asked the time
// every 50 ms, and always answers within 100 ms. (Before the backend had its
// own process the window stood still up to half a second at a time.) Skipped
// without FG books on this computer.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-freeze-probe-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
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
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Freeze probe", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47445, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const shelf = (Array.isArray(listed) ? listed : listed.books ?? []).filter((item) => item.hasBook).slice(0, 10);
  if (shelf.length < 3) {
    console.log("skip responsive ui: no FG books here");
    process.exit(0);
  }
  // The window's process, asked the time every 50 ms while the books are read.
  let busy = true;
  const waits = [];
  const watch = (async () => {
    while (busy) {
      const start = performance.now();
      await app.evaluate(() => Date.now());
      waits.push(performance.now() - start);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })();
  const start = performance.now();
  for (const book of shelf) await tool("kraken_books", { action: "contents", book: book.id }).catch(() => undefined);
  const took = performance.now() - start;
  busy = false;
  await watch;
  waits.sort((a, b) => a - b);
  if (waits[waits.length - 1] > 100) throw new Error(`the window's process stood still ${Math.round(waits[waits.length - 1])} ms while books were read`);
  console.log(`ok responsive ui: ${shelf.length} books read in ${Math.round(took)} ms; the window's process answered ${waits.length} times: median ${Math.round(waits[Math.floor(waits.length / 2)])} ms, longest ${Math.round(waits[waits.length - 1])} ms`);
} finally {
  child.kill();
  await app.close();
}
