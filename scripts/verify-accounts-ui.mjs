// Players' accounts (Foundry's users, kept by the GM's app): a test player
// in Chrome sits as "Ann" choosing a password; the browser stays signed in
// (a reload sits without it, taking the place of the old seat). Another
// device (a second browser profile) cannot sit as "ann" without the password
// or with a wrong one, and so cannot reach her characters; with the right one
// it sits as "Ann" and the first browser is told she signed in elsewhere. A
// name with no account cannot sit twice. The GM's Players window lists the
// account, sets a new password (the old browser's sign-in no longer works and
// the password is asked again) and makes one ahead; kraken_accounts lists,
// makes and removes. Sign out at the table forgets the browser. The accounts
// file holds no password.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-accounts-ui-"));
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
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));

let browser = null;
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Accounts UI", ruleset: "Worldbuilding" });
  const port = 47415;
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");
  const url = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const watch = (seat, who) => seat.on("pageerror", (error) => failures.push(`${who}: ${error.message}`));
  // What the host says to a join sent straight to it (as anyone could).
  const rawJoin = (seat, join) =>
    seat.evaluate(
      (message) =>
        new Promise((resolve) => {
          const socket = new WebSocket(`ws://${location.host}/`);
          socket.onopen = () => socket.send(JSON.stringify({ type: "join", ...message }));
          socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "no" || msg.type === "ok") {
              resolve({ type: msg.type, reason: msg.reason, name: msg.you?.name });
              if (msg.type === "no") socket.close();
            }
          };
        }),
      join,
    );

  // Ann sits down the first time, choosing her password.
  const laptop = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const ann = await laptop.newPage();
  watch(ann, "ann");
  await ann.goto(url);
  await ann.fill('input[name="name"]', "Ann");
  await ann.fill('input[name="account-password"]', "secret1");
  await ann.click('button[type="submit"]');
  await ann.waitForSelector(".sidebar");
  const kept = await ann.evaluate((key) => window.localStorage.getItem(key), `kraken-signin:127.0.0.1:${port}`);
  assert(kept && JSON.parse(kept).name === "Ann" && JSON.parse(kept).token && !kept.includes("secret1"), `the browser keeps a token, not the password: ${kept}`);
  let accounts = (await tool("kraken_accounts", { action: "list" })).accounts;
  assert(accounts.length === 1 && accounts[0].name === "Ann" && accounts[0].seated && accounts[0].devices === 1, `Ann's account: ${JSON.stringify(accounts)}`);
  // Her character.
  await tool("kraken_record_create", { type: "character", name: "Ann's Fighter", owner: "Ann", visibility: "owner", data: { level: 1 } });

  // A reload: signed in, no password asked; this seat takes the old one's place.
  const again = await laptop.newPage();
  watch(again, "ann again");
  await again.goto(url);
  await again.waitForSelector('[data-signed-in="Ann"]');
  assert(!(await again.$('input[name="account-password"]')), "no password asked of a signed-in browser");
  await again.click('button[type="submit"]');
  await again.waitForSelector(".sidebar");
  await ann.waitForFunction(() => document.body.textContent.includes("signed in somewhere else"), null, { timeout: 10000 });
  await ann.close();

  // Another device: not as "ann" without her password, nor with a wrong one; so not her characters.
  const other = await browser.newContext();
  const thief = await other.newPage();
  watch(thief, "other device");
  await thief.goto(url);
  const none = await rawJoin(thief, { name: "ann" });
  assert(none.type === "no" && /has an account: enter its password/.test(none.reason), `no password: ${JSON.stringify(none)}`);
  await thief.fill('input[name="name"]', "ann");
  await thief.fill('input[name="account-password"]', "guess");
  await thief.click('button[type="submit"]');
  await thief.waitForSelector("text=Wrong password for Ann", { timeout: 10000 });
  assert(!(await thief.$(".sidebar")), "the wrong password does not sit down");
  // The right one: sits as Ann (her spelling), with her character; the other browser is told.
  await thief.fill('input[name="account-password"]', "secret1");
  await thief.click('button[type="submit"]');
  await thief.waitForSelector(".sidebar");
  await again.waitForFunction(() => document.body.textContent.includes("signed in somewhere else"), null, { timeout: 10000 });
  await thief.click('.sidebar [data-launch="characters"]');
  await thief.waitForFunction(() => document.body.textContent.includes("Ann's Fighter"), null, { timeout: 10000 });
  await thief.close();

  // A name with no account cannot sit twice.
  const bobs = await browser.newContext();
  const bob = await bobs.newPage();
  await bob.goto(url);
  assert((await rawJoin(bob, { name: "Bob" })).type === "ok", "Bob sits (no account)");
  const twice = await rawJoin(bob, { name: "BOB" });
  assert(twice.type === "no" && /already at the table/.test(twice.reason), `a second Bob: ${JSON.stringify(twice)}`);

  // The GM's Players window: Ann's account; a new password; the old sign-in asks for it.
  await page.click('.sidebar [data-launch="players"]');
  await page.waitForSelector('[data-account="Ann"]');
  await page.click('[data-account="Ann"] [data-action="account-password"]');
  await page.fill('[aria-label="New password for Ann"]', "newpass2");
  await page.press('[aria-label="New password for Ann"]', "Enter");
  await page.waitForSelector("text=Done: password Ann");
  const back = await laptop.newPage();
  watch(back, "ann after reset");
  await back.goto(url);
  await back.waitForSelector('[data-signed-in="Ann"]');
  await back.click('button[type="submit"]');
  await back.waitForSelector('input[name="account-password"]', { timeout: 10000 });
  assert((await back.textContent("form[data-form=join]")).includes("has an account: enter its password"), "the old sign-in is refused and the password is asked again");
  await back.fill('input[name="name"]', "Ann");
  await back.fill('input[name="account-password"]', "newpass2");
  await back.click('button[type="submit"]');
  await back.waitForSelector(".sidebar");

  // Sign out at the table: the browser is forgotten, here and by the host.
  const before = (await tool("kraken_accounts", { action: "list" })).accounts.find((row) => row.name === "Ann").devices;
  await back.click('[data-action="sign-out"]');
  await back.waitForSelector('input[name="account-password"]', { timeout: 10000 });
  assert(!(await back.evaluate((key) => window.localStorage.getItem(key), `kraken-signin:127.0.0.1:${port}`)), "signed out: nothing kept");
  const after = (await tool("kraken_accounts", { action: "list" })).accounts.find((row) => row.name === "Ann").devices;
  assert(after === before - 1, `the host forgot that browser: ${before} -> ${after}`);

  // The GM makes one ahead (the window), and the agent lists, makes and removes.
  await page.fill('[aria-label="New account name"]', "Cara");
  await page.fill('[aria-label="New account password"]', "cara-pass");
  await page.click('[data-action="account-create"]');
  await page.waitForSelector('[data-account="Cara"]');
  await tool("kraken_accounts", { action: "create", name: "Dov", password: "dov-pass" });
  await tool("kraken_accounts", { action: "remove", name: "Dov" });
  accounts = (await tool("kraken_accounts", { action: "list" })).accounts;
  assert(accounts.map((row) => row.name).join(",") === "Ann,Cara", `accounts: ${JSON.stringify(accounts)}`);
  const cara = await rawJoin(bob, { name: "Cara", account: { password: "cara-pass" } });
  assert(cara.type === "ok" && cara.name === "Cara", `Cara sits with the GM's password: ${JSON.stringify(cara)}`);
  const caraRow = (await tool("kraken_accounts", { action: "list" })).accounts.find((row) => row.name === "Cara");
  assert(caraRow.devices === 1 && caraRow.seated, `the GM's making it signs no browser in; her own sitting does: ${JSON.stringify(caraRow)}`);

  // Kept as hashes only.
  const file = readFileSync(path.join(profile, "accounts.json"), "utf8");
  assert(!/secret1|newpass2|cara-pass/.test(file) && /"salt"/.test(file), "the accounts file holds no password");
  await page.screenshot({ path: path.join(tmpdir(), "kraken-accounts-gm.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok accounts ui: Ann sits choosing a password (the browser keeps a token, not it); a reload sits without it and takes the old seat's place; another device cannot sit as her without it or with a wrong one, and with it sits as Ann with her character; a name with no account cannot sit twice; the GM sets a new password (the old sign-in is asked for it) and makes one ahead; sign out forgets the browser; kraken_accounts lists, makes, removes; the file holds hashes only. ${path.join(tmpdir(), "kraken-accounts-gm.png")}`);
} finally {
  await browser?.close();
  child.kill();
  await app.close();
}
