// How long the books take in the real app, as the GM uses them: the Books
// window opened (every cover asked for), a book opened, pages clicked in its
// contents. Run twice to see a second start (covers kept on disk). PROFILE=<dir>
// keeps the profile between runs. (A probe, not a check.)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = process.env.PROFILE || mkdtempSync(path.join(tmpdir(), "kraken-book-probe-"));
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
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
const ms = (start) => `${Math.round(performance.now() - start)} ms`;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaigns = (await tool("kraken_campaigns", {}).catch(() => ({ campaigns: [] }))).campaigns ?? [];
  const campaign = campaigns.find((item) => item.name === "Book probe") ?? (await tool("kraken_campaign_create", { name: "Book probe", ruleset: "Castles & Crusades" }));
  await tool("kraken_host", { campaignId: campaign.id, port: 47443, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed = await tool("kraken_books", { action: "list" });
  const all = Array.isArray(listed) ? listed : listed.books ?? listed.modules ?? [];
  const b1 = all.find((item) => /^B1 In Search of the Unknown \(C&C\)/.test(item.title)) ?? null;
  if (!b1) console.log("no B1 in", Object.keys(listed), all.length);
  if (b1 && !b1.active) await tool("kraken_books", { action: "activate", book: b1.id });
  let start = performance.now();
  await page.click('.sidebar [data-launch="books"]');
  await page.waitForSelector("[data-book]", { timeout: 60000 });
  console.log(`Books window: ${ms(start)}`);
  const book = page.locator('[data-book]:has-text("B1 In Search of the Unknown")').first();
  start = performance.now();
  await book.click();
  await page.waitForSelector(".book-window .book-page-link", { timeout: 60000 });
  console.log(`B1 opened (its contents): ${ms(start)}`);
  for (const name of ["Scene 1: Evening at the Crossed Swords", "Legend Table", "2. KITCHEN", "The Dungeon"]) {
    const link = page.locator(`.book-window .book-page-link:has-text("${name}")`).first();
    if (!(await link.count())) continue;
    start = performance.now();
    await link.click();
    await page.waitForFunction((title) => document.querySelector(".book-window h2")?.textContent?.trim() === title, name, { timeout: 60000 });
    console.log(`  page "${name}": ${ms(start)}`);
  }
} finally {
  child.kill();
  await app.close();
}
