// Campaign management, backups and logs in the real app. The start screen's
// card menu (its more button, or a right-click): Rename in a dialog,
// Duplicate (the copy keeps the records), Backups and restore (a backup made
// at Play and every interval while hosting, KRAKEN_BACKUP_EVERY_MS; Restore
// brings back a deleted record, and keeps what was there as a backup), Open
// folder, Delete to the recycle bin after a confirm (the hosted campaign is
// refused). kraken_campaigns does the same: rename, duplicate, export (a .zip
// with the campaign's files), backups, backup, restore, folder, delete.
// Settings > Open logs, and kraken_logs reads a page error from the window's log.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";
import { unzipSync } from "fflate";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = process.env.SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);
const profile = mkdtempSync(path.join(tmpdir(), "kraken-campaigns-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_BIND: "127.0.0.1", KRAKEN_BACKUP_EVERY_MS: "2500", KRAKEN_NO_OPEN: "1" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }, at) => { const win = BrowserWindow.getAllWindows()[0]; win?.setBounds({ x: at[0], y: at[1], width: 2560, height: 1440 }); win?.setFullScreen(true); }, AT);
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
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120000);
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
async function refused(name, args) {
  try {
    await tool(name, args);
  } catch (error) {
    return error.message;
  }
  throw new Error(`${name} ${JSON.stringify(args)} was not refused`);
}
const failures = [];
page.on("pageerror", (error) => failures.push(`gm: ${error.message}`));
const shots = [];
async function shoot(name) {
  if (!SHOTS) return;
  const file = path.join(SHOTS, `${name}.png`);
  await settle(300);
  await page.screenshot({ path: file });
  shots.push(file);
}
const until = async (check, what, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    const value = await check();
    if (value) return value;
    await settle(250);
  }
  throw new Error(`waited for ${what}`);
};
const results = [];
try {
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
      break;
    } catch (error) {
      if (tries > 20) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name: "Keep on the Borderlands", ruleset: "Worldbuilding" });

  // Played once: a backup as it was played, then the interval's; a record made and saved.
  await tool("kraken_host", { campaignId: campaign.id, port: 47439, password: "" });
  await page.waitForSelector("text=Hosting");
  await tool("kraken_record_create", { type: "npc", name: "Castellan", data: {} });
  await tool("kraken_save");
  await until(async () => (await tool("kraken_campaigns", { action: "backups", id: campaign.id })).backups.some((item) => item.reason === "hourly"), "a backup made while hosting");
  const playing = await refused("kraken_campaigns", { action: "delete", id: campaign.id });
  assert(/being played/.test(playing), `the campaign being played is not deleted: ${playing}`);
  // Settings > Open logs; a page error lands in the window's log.
  await page.click('[data-launch="settings"]');
  await page.waitForSelector('[data-setting="open-logs"]');
  await page.click('[data-setting="open-logs"]');
  await tool("kraken_ui_eval", { code: "console.error('kraken log test ' + 42); 1" }).catch(() => undefined);
  const logs = await until(async () => {
    const read = await tool("kraken_logs", { lines: 50 });
    return read.window.some((line) => line.includes("kraken log test 42")) ? read : null;
  }, "the page's error in the window's log");
  assert(existsSync(path.join(logs.folder, "window.log")) && Array.isArray(logs.backend), `the logs folder and both logs: ${JSON.stringify(logs).slice(0, 300)}`);
  results.push("logs: Open logs, kraken_logs");
  await tool("kraken_leave");
  await page.waitForSelector("text=My Campaigns");

  // The start screen's help row: the wiki's quickstart and pages, release notes, a bug report, the community.
  await page.waitForSelector(".help-links .help-link");
  const help = await page.$$eval(".help-links .help-link", (links) => links.map((link) => [link.textContent.trim(), link.getAttribute("href"), link.getAttribute("target")]));
  const web = help.filter(([label]) => label !== "Release notes");
  assert(help.length === 7 && web.length === 6 && web.every(([, href, target]) => /^https:\/\//.test(href) && target === "_blank"), `seven help links, six to the web: ${JSON.stringify(help)}`);
  assert(help.some(([label, href]) => /quickstart/i.test(label) && /quickstart\.html$/.test(href)) && help.some(([label, href]) => label === "Tutorials" && /tutorials\.html$/.test(href)), "Quickstart and Tutorials go where they say");
  assert((await page.$$(".help-link .help-icon svg")).length === 7, "an icon on each");
  await shoot("start-help-links");
  // Release notes open here, read from GitHub's releases (offline: a line saying so, with the link).
  await page.click('[data-help-link="Release notes"]');
  await page.waitForSelector('dialog[data-dialog="release-notes"][open] :is(.release, .release-notes-error)', { timeout: 20000 });
  await shoot("start-release-notes");
  await page.keyboard.press("Escape");
  await page.waitForSelector('dialog[data-dialog="release-notes"][open]', { state: "detached", timeout: 5000 }).catch(async () => assert(!(await page.$('dialog[data-dialog="release-notes"][open]')), "the notes close with Esc"));
  results.push("start screen: seven help links with icons (quickstart, tutorials, wiki, game guides, release notes read here, report a bug, community)");

  // The start screen's menu: Rename.
  await page.reload();
  await page.click('[data-action="campaigns-mode"]');
  await page.hover('[data-campaign="Keep on the Borderlands"]');
  await page.click('[data-action="campaign-menu"]');
  await page.waitForSelector(".campaign-menu:popover-open");
  await shoot("gm-campaign-menu");
  await page.click('.campaign-menu [data-menu="rename"]');
  await page.waitForSelector('dialog[data-dialog="rename"][open]');
  await page.fill('dialog[data-dialog="rename"] input[name="name"]', "Keep on the Borderlands (B2)");
  await page.click('[data-action="rename-save"]');
  await page.waitForSelector('[data-campaign="Keep on the Borderlands (B2)"]');
  results.push("rename");

  // Duplicate: the copy has the record.
  await page.click('[data-campaign="Keep on the Borderlands (B2)"]', { button: "right" });
  await page.click('.campaign-menu:popover-open [data-menu="duplicate"]');
  await page.waitForSelector('[data-campaign="Keep on the Borderlands (B2) (copy)"]');
  const copy = (await tool("kraken_campaigns")).find((item) => item.name === "Keep on the Borderlands (B2) (copy)");
  const copyFiles = path.join(profile, "campaigns", copy.id, "records.json");
  assert(readFileSync(copyFiles, "utf8").includes("Castellan"), "the copy keeps the records");
  results.push("duplicate");

  // Backups and restore: the record deleted, then brought back from the backup.
  await tool("kraken_host", { campaignId: campaign.id, port: 47439, password: "" });
  await page.waitForSelector("text=Hosting");
  const listed0 = await tool("kraken_records_list", { type: "npc" });
  const npc = (Array.isArray(listed0) ? listed0 : listed0.records).find((record) => record.name === "Castellan");
  await tool("kraken_record_delete", { id: npc.id });
  await tool("kraken_leave");
  await page.waitForSelector("text=My Campaigns");
  await page.reload();
  await page.click('[data-action="campaigns-mode"]');
  await page.click('[data-campaign="Keep on the Borderlands (B2)"]', { button: "right" });
  await page.click('.campaign-menu:popover-open [data-menu="backups"]');
  await page.waitForSelector('dialog[data-dialog="backups"][open] [data-backup]');
  await shoot("gm-campaign-backups");
  const listed = (await tool("kraken_campaigns", { action: "backups", id: campaign.id })).backups;
  // The newest made before the delete: the second Play's backup has the record.
  const before = listed.find((item) => item.reason === "play");
  await page.click(`dialog[data-dialog="backups"] li[data-backup="${before.id}"] [data-action="restore"]`);
  await page.waitForSelector('dialog[data-dialog="backups"] [role="status"]');
  assert(readFileSync(path.join(profile, "campaigns", campaign.id, "records.json"), "utf8").includes("Castellan"), "the restored campaign has the record again");
  const after = (await tool("kraken_campaigns", { action: "backups", id: campaign.id })).backups;
  assert(after.some((item) => item.reason === "before-restore"), "what was there before is kept as a backup");
  assert(after.length <= 10, `ten backups at most: ${after.length}`);
  await page.click('dialog[data-dialog="backups"] button:has-text("Done")');
  results.push("backups and restore");

  // The agent: export a .zip, a backup now, open folder (KRAKEN_NO_OPEN: not opened in a test), rename.
  const zip = path.join(profile, "exports", "b2.zip");
  const exported = await tool("kraken_campaigns", { action: "export", id: campaign.id, path: zip });
  const entries = unzipSync(readFileSync(zip));
  assert(exported.bytes > 0 && entries["campaign.json"] && entries["campaign/records.json"] && !Object.keys(entries).some((name) => name.includes("backups")), `the .zip: ${Object.keys(entries).join(", ")}`);
  assert(JSON.parse(Buffer.from(entries["campaign.json"]).toString()).name === "Keep on the Borderlands (B2)", "the .zip's card");
  assert((await tool("kraken_campaigns", { action: "backup", id: campaign.id })).backup.reason === "manual", "a backup now");
  assert((await tool("kraken_campaigns", { action: "folder", id: campaign.id })).folder.endsWith(campaign.id), "its folder");
  assert((await tool("kraken_campaigns", { action: "rename", id: copy.id, name: "The copy" })).name === "The copy", "the agent renames");
  results.push("kraken_campaigns export, backup, folder, rename");

  // Delete the copy, to the recycle bin, after the confirm.
  await page.reload();
  await page.click('[data-action="campaigns-mode"]');
  await page.click('[data-campaign="The copy"]', { button: "right" });
  await page.click('.campaign-menu:popover-open [data-menu="delete"]');
  await page.waitForSelector('dialog[data-dialog="delete"][open]');
  await shoot("gm-campaign-delete");
  await page.click('[data-action="delete-confirm"]');
  await page.waitForSelector('[data-campaign="The copy"]', { state: "detached" });
  assert(!existsSync(path.join(profile, "campaigns", copy.id)), "the copy's folder went to the recycle bin");
  assert(!(await tool("kraken_campaigns")).some((item) => item.id === copy.id), "and off the list");
  results.push("delete to the recycle bin");

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`CAMPAIGNS_UI_OK ${results.join("; ")}${shots.length ? `\nshots: ${shots.join(", ")}` : ""}`);
} finally {
  if (failures.length) console.error(failures.join("\n"));
  child.kill();
  await app.close().catch(() => undefined);
}
