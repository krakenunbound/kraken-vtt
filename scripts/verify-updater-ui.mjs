// Kraken's updater, against a stand-in for GitHub (a local server with a
// latest.yml for a "newer" Kraken and its installer, a made-up file with a
// matching checksum). The GM's rules, checked:
//  - Kraken looks once, when it starts (the server is asked for latest.yml
//    once, however long a campaign is hosted);
//  - the start screen alone shows it ("Kraken 99.0.0 is ready to install",
//    what's new); none of it while a campaign is hosted;
//  - downloading is refused while a campaign is hosted, and on the start
//    screen it fetches the installer and checks it (then "Restart and install"
//    is offered; this test does not install).
// KRAKEN_APP: the built app (release/win-unpacked/Kraken VTT.exe).
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The stand-in for GitHub's release: latest.yml and the "installer".
const installer = randomBytes(3 * 1024 * 1024);
const sha512 = createHash("sha512").update(installer).digest("base64");
const latest = [
  "version: 99.0.0",
  "files:",
  "  - url: Kraken-VTT-Setup.exe",
  `    sha512: ${sha512}`,
  `    size: ${installer.length}`,
  "path: Kraken-VTT-Setup.exe",
  `sha512: ${sha512}`,
  "releaseDate: '2026-11-14T00:00:00.000Z'",
  "releaseNotes: 'The test release: the updater found it.'",
  "",
].join("\n");
const asked = { latest: 0, installer: 0 };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.endsWith("/latest.yml")) {
    asked.latest += 1;
    res.writeHead(200, { "Content-Type": "text/yaml" });
    return res.end(latest);
  }
  if (url.pathname.endsWith("/Kraken-VTT-Setup.exe")) {
    asked.installer += 1;
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": installer.length });
    return res.end(installer);
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const feed = `http://127.0.0.1:${server.address().port}/`;

const profile = mkdtempSync(path.join(tmpdir(), "kraken-updater-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs"), KRAKEN_UPDATE_URL: feed, LOCALAPPDATA: path.join(profile, "local") };
const app = process.env.KRAKEN_APP
  ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
  : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
const report = [];
try {
  // The start screen: the newer Kraken, found at launch.
  await page.waitForSelector("text=My Campaigns");
  await page.waitForSelector('.update-notice[data-update="available"]', { timeout: 30000 });
  assert((await page.textContent(".update-notice b")).includes("99.0.0"), "the start screen names the new version");
  await page.click('[data-action="update-notes"]');
  await page.waitForSelector("text=The test release: the updater found it.");
  report.push("the start screen: Kraken 99.0.0 is ready to install, with what's new");

  // A campaign hosted: nothing about it, and no download.
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Updates", ruleset: "Worldbuilding" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47461, password: "pw" });
  await page.waitForSelector("text=Hosting");
  assert(!(await page.$(".update-notice")), "no update notice while a campaign is hosted");
  const refused = await tool("kraken_updates", { action: "download" }).then(() => null, (error) => error.message);
  assert(/Not while a campaign is hosted/.test(refused ?? ""), `no download during a game (${refused})`);
  await settle(6000);
  assert(asked.latest === 1, `looked for once, at launch, never during the game (${asked.latest} looks)`);
  assert(asked.installer === 0, "nothing downloaded during the game");
  report.push("hosting: no notice, a download refused, and no looking again (1 look in all)");

  // Back on the start screen: download it (checked against its checksum).
  await tool("kraken_leave");
  await page.waitForSelector('.update-notice[data-update="available"]');
  await page.click('[data-action="update-download"]');
  for (let wait = 0; wait < 120 && !(await page.$('.update-notice[data-update="ready"]')); wait++) await settle(500);
  if (!(await page.$('.update-notice[data-update="ready"]'))) throw new Error(`the download did not finish: ${JSON.stringify(await tool("kraken_updates", { action: "status" }))} ${await page.textContent(".update-notice").catch(() => "")}`);
  assert(await page.$('[data-action="update-install"]'), "Restart and install is offered");
  const status = await tool("kraken_updates", { action: "status" });
  assert(status.status === "ready" && status.version === "99.0.0" && asked.installer >= 1, `downloaded and checked (${JSON.stringify(status)})`);
  report.push(`back on the start screen: downloaded (${installer.length} bytes, its SHA-512 checked), Restart and install offered`);

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok updater ui${process.env.KRAKEN_APP ? " (the built app)" : ""}:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
  server.close();
}
