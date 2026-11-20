// The host's word to a seated GM, in the real app (audit 032): a refused command
// (/kick with nobody of that name) shows as a toast over the desktop and stays in
// the chat log; /save with no map open shows "Campaign saved." the same way.
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
const profile = mkdtempSync(path.join(tmpdir(), "kraken-table-toast-"));
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
const shot = path.join(tmpdir(), "kraken-table-toast.png");
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Toast", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47416, password: "pw" });
  await page.waitForSelector("text=Hosting");
  // A refusal from the host: on screen, and kept in the chat.
  await page.fill("form.chat-entry input", "/kick Nobody");
  await page.press("form.chat-entry input", "Enter");
  const error = await page.waitForSelector('[data-table-toast="error"]', { timeout: 10000 });
  const said = (await error.textContent()) ?? "";
  assert(said.trim().length > 0, "the refusal is shown");
  await page.screenshot({ path: shot });
  assert(await page.locator(".chat-dock").getByText(said.trim().slice(0, 30), { exact: false }).count(), `and kept in the chat: ${said}`);
  // Clicked away; then /save with no map: its notice shows too.
  await error.click();
  await page.waitForSelector('[data-table-toast="error"]', { state: "detached", timeout: 5000 });
  await page.fill("form.chat-entry input", "/save");
  await page.press("form.chat-entry input", "Enter");
  const notice = await page.waitForSelector('[data-table-toast="notice"]', { timeout: 10000 });
  assert(/saved/i.test((await notice.textContent()) ?? ""), "/save says it saved");
  console.log(`ok table toast: a refused /kick shows ("${said.trim()}") and stays in chat; /save with no map says it saved. ${shot}`);
} finally {
  child.kill();
  await app.close();
}
