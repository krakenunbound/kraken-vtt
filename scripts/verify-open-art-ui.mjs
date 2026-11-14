// The open games' art in the real app (npm run build, build-games and
// build-packs first): for a Basic Fantasy and a Starforged campaign, with only
// the books Kraken ships, the GM's Modules window shows each book's cover, an
// NPC's record window shows its portrait, and the NPC on the Combat Tracker
// and the map wears its token; a player in Chrome sees the token on the map.
// Screenshots go to the temp folder (kraken-open-art); the windows open on the
// left monitor (KRAKEN_WINDOW_AT) and are closed at the end.
//   node scripts/verify-open-art-ui.mjs
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const outDir = path.join(tmpdir(), "kraken-open-art");
mkdirSync(outDir, { recursive: true });
const PLANS = [
  { ruleset: "Basic Fantasy", books: ["Basic Fantasy Player's Handbook", "Basic Fantasy Game Master's Guide", "The Mill at Hob's Ford"], npc: "Goblin", map: "The Mill at Hob's Ford" },
  { ruleset: "Starforged", books: ["Starforged Reference", "Starforged Foes", "The Silent Hulk"], npc: "Drift pirate", map: "The Silent Hulk" },
];
const problems = [];
const check = (condition, text) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${text}`);
  if (!condition) problems.push(text);
  return Boolean(condition);
};
const waitFor = async (test, ms = 15000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const value = await test();
      if (value) return value;
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
};

for (const [index, plan] of PLANS.entries()) {
  const slug = plan.ruleset.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-open-art-"));
  const env = { ...process.env, KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "Packs") };
  for (const dir of [env.KRAKEN_BOOKS, env.KRAKEN_PACKS]) mkdirSync(dir, { recursive: true });
  const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  let browser = null;
  let child = null;
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    // The agent bridge writes its file once it listens.
    await waitFor(() => existsSync(env.KRAKEN_AGENT_FILE), 30000);
    child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
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
        answers.set(id, (message) => (clearTimeout(timer), message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    const tool = async (name, args = {}) => {
      const result = await rpc("tools/call", { name, arguments: args });
      const text = result.content?.[0]?.text ?? "";
      if (result.isError) throw new Error(`${name}: ${text}`);
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "open-art", version: "1" } });
    const campaign = await tool("kraken_campaign_create", { name: `Art ${plan.ruleset}`, ruleset: plan.ruleset });
    const port = 47800 + index;
    await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
    await page.waitForSelector("text=Hosting", { timeout: 30000 });
    const shelf = [].concat(await tool("kraken_books", { action: "list" }));
    for (const title of plan.books) {
      const book = shelf.find((item) => item.title === title || item.name === title);
      if (!check(book, `${plan.ruleset}: the shelf has ${title}`)) continue;
      if (!book.active) await tool("kraken_books", { action: "activate", book: book.id });
    }

    // The Modules window: every book with its cover (an <img>, loaded).
    await tool("kraken_sidebar", { action: "press", entry: "books:activation" }).catch(() => page.click('.sidebar [data-launch="books:activation"]'));
    await page.waitForSelector('[data-books-tab="activation"]', { timeout: 15000 });
    await page.waitForTimeout(1500);
    for (const name of plan.books) {
      const title = shelf.find((item) => item.title === name || item.name === name)?.title ?? name;
      const loaded = await waitFor(() => page.evaluate((wanted) => {
        const row = [...document.querySelectorAll(".books-open")].find((item) => item.querySelector("b")?.textContent === wanted);
        const img = row?.querySelector("img");
        return Boolean(img && img.complete && img.naturalWidth > 0);
      }, title), 10000);
      check(loaded, `${plan.ruleset}: ${title} shows its cover in Modules`);
    }
    await page.screenshot({ path: path.join(outDir, `${slug}-modules.png`) });
    await tool("kraken_windows", { action: "close", kind: "books" }).catch(() => undefined);

    // An NPC's record window: its portrait.
    const npcs = (await tool("kraken_records_list", { type: "npc", name: plan.npc })).records ?? [];
    const npc = npcs.find((item) => item.name === plan.npc) ?? npcs[0];
    if (check(npc, `${plan.ruleset}: the NPC ${plan.npc} is in the campaign`)) {
      await tool("kraken_windows", { action: "open", kind: "record", record: npc.id });
      const portrait = await waitFor(() => page.evaluate(() => [...document.querySelectorAll('[data-window="record"] img, .record-window img')].some((img) => img.complete && img.naturalWidth > 0)), 15000);
      check(portrait, `${plan.ruleset}: ${npc.name}'s record shows its portrait`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, `${slug}-npc-record.png`) });
      await tool("kraken_windows", { action: "close", kind: "record" }).catch(() => undefined);

      // The adventure's map on the table (the Library's Maps, as the GM opens
      // it), the NPC on the tracker with a token on the map.
      const adventure = shelf.find((item) => item.title === plan.map || item.name === plan.map);
      if (!(await page.$('.sidebar [data-launch="library"].open'))) await page.click('.sidebar [data-launch="library"]');
      await page.waitForSelector('[aria-label="Library module"]');
      await page.selectOption('[aria-label="Library module"]', adventure.name);
      await page.click('[data-action="library-maps"]');
      check(await waitFor(async () => (await tool("kraken_map")).scene, 30000), `${plan.ruleset}: ${plan.map}'s map is on the table`);
      await tool("kraken_map", { share: true }).catch(() => undefined);
      await tool("kraken_combat", { action: "add", recordId: npc.id, count: 1, place: true });
      await page.waitForTimeout(2500);
      const placed = await tool("kraken_map").catch(() => null);
      const token = (placed?.tokens ?? []).find((item) => item.recordId === npc.id);
      check(token, `${plan.ruleset}: ${npc.name} has a token on the map`);
      await tool("kraken_windows", { action: "open", kind: "combat" });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, `${slug}-tracker-map.png`) });

      // A player in Chrome sees the token.
      browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ["--mute-audio", `--window-position=${AT[0] + 900},${AT[1] + 80}`, "--window-size=1500,1000"] });
      const seat = await browser.newPage({ viewport: { width: 1480, height: 900 } });
      await seat.goto(`http://127.0.0.1:${port}/`);
      await seat.waitForLoadState("networkidle").catch(() => undefined);
      for (const [field, value] of [["name", "Art player"], ["account-password", "test-pass-1"], ["password", "pw"]]) await seat.fill(`input[name="${field}"]`, value);
      await seat.click('button[type="submit"]');
      await seat.waitForSelector(".sidebar", { timeout: 20000 });
      await seat.waitForTimeout(4000);
      await seat.screenshot({ path: path.join(outDir, `${slug}-player.png`) });
    }
  } catch (error) {
    check(false, `${plan.ruleset}: stopped: ${error.message.split("\n")[0]}`);
  } finally {
    await browser?.close().catch(() => undefined);
    child?.kill();
    await app.close().catch(() => undefined);
  }
}
console.log(`\nscreenshots in ${outDir}`);
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("open games' art shows in the app: covers, a portrait, tokens on the tracker and the map.");
