// A real campaign's saved table map (a COPY of the GM's campaign; nothing of
// theirs is written): its map came from a book that is not active in it, saved
// by the book file's whole Windows path. Hosted, the map must not come back
// (nothing on the table, no map window, no window of its own) and the saved map
// is forgotten. The control: the same campaign with that book made active, the
// map does come back.
//
// KRAKEN_TEST_CAMPAIGN: the campaign's id in the GM's Kraken data (default the
// one that kept reopening); KRAKEN_TEST_PACKS: the GM's packs folder. Skipped
// when they are not on this computer.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const source = path.join(process.env.APPDATA ?? "", "kraken-vtt");
const id = process.env.KRAKEN_TEST_CAMPAIGN || "088a26dbfd3f84ae";
const packs = process.env.KRAKEN_TEST_PACKS || path.join(homedir(), "Documents", "Kraken VTT", "Packs");
if (!existsSync(path.join(source, "campaigns", id, "state.json")) || !existsSync(packs)) {
  console.log("skip restore ui: no such campaign or packs folder on this computer");
  process.exit(0);
}
const saved = JSON.parse(readFileSync(path.join(source, "campaigns", id, "state.json"), "utf8")).view;
const VAULT = String(saved?.adventure ?? "").split(/[\\/]/).pop()?.replace(/\.(mod|kpack|zip)$/i, "") ?? "";

// A copy of the GM's campaign in a profile of its own.
function copyProfile(activate = []) {
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-restore-ui-"));
  mkdirSync(path.join(profile, "campaigns"), { recursive: true });
  cpSync(path.join(source, "campaigns.json"), path.join(profile, "campaigns.json"));
  cpSync(path.join(source, "campaigns", id), path.join(profile, "campaigns", id), { recursive: true });
  if (activate.length) {
    const file = path.join(profile, "campaigns", id, "state.json");
    const state = JSON.parse(readFileSync(file, "utf8"));
    state.books = { ...state.books, active: [...new Set([...(state.books?.active ?? []), ...activate])] };
    writeFileSync(file, JSON.stringify(state));
  }
  return profile;
}

async function host(profile) {
  const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: packs };
  // KRAKEN_APP: the built app, as the GM runs it.
  const app = process.env.KRAKEN_APP
    ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
    : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
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
      const call = ++nextId;
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
      answers.set(call, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: call, method, params })}\n`);
    });
  const tool = async (name, args = {}) => {
    const result = await rpc("tools/call", { name, arguments: args });
    const text = result.content?.[0]?.text ?? "";
    if (result.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  await tool("kraken_host", { campaignId: id, port: 47460, password: "pw" });
  await page.waitForSelector("text=Hosting");
  // The restore reads the saved bundle and opens it (it takes a moment on a big map).
  await settle(8000);
  const onTable = (await tool("kraken_scenes", {}).catch(() => ({})))?.onTable ?? null;
  const mapWindow = Boolean(await page.$('.window[data-window="map"]'));
  const windows = app.windows().length;
  await tool("kraken_leave", {}).catch(() => undefined);
  await settle(1500);
  child.kill();
  await app.close();
  const view = JSON.parse(readFileSync(path.join(profile, "campaigns", id, "state.json"), "utf8")).view ?? null;
  return { onTable, mapWindow, windows, view };
}

const report = [];
// As the campaign is: the book not active.
const plain = await host(copyProfile());
assert(!plain.onTable, `the inactive book's map is not on the table (${JSON.stringify(plain.onTable)})`);
assert(!plain.mapWindow, "no map window opens");
assert(plain.windows === 1, `no window of its own opens (${plain.windows} windows)`);
assert(plain.view === null, `the saved map is forgotten (${JSON.stringify(plain.view)})`);
report.push(`your campaign as it is (${VAULT} not active): no map on the table, no map window, no window of its own; the saved map forgotten`);
// The control: that book made active, its map comes back.
const control = await host(copyProfile([VAULT]));
assert(control.onTable?.id === saved.sceneId, `the control: with ${VAULT} active, its map comes back (${JSON.stringify(control.onTable)})`);
report.push(`the control: ${VAULT} made active, its map (${control.onTable.name}) comes back`);
console.log(`ok restore ui:\n  ${report.join("\n  ")}`);
