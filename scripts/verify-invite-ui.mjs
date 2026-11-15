// Internet hosting without router setup, and the invite link, in the real app.
// The GM's start screen offers "Open the port on my router" under Internet;
// kraken_host with upnp opens it on a fake UPnP gateway on this computer
// (KRAKEN_UPNP_LOCATION: never a real router) and returns the invite link.
// The Players window says the router opened the port, shows the link (the
// password in its #fragment), Copy and a QR code that decodes to the link
// (OpenCV, when Python has it). A test player opens the link: the table
// password is filled in and gone from the address bar (never sent to the
// server), and they sit down with only their name. Leaving closes the port.
import "./loopback.mjs";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = process.env.SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const AT = (process.env.KRAKEN_WINDOW_AT ?? "-2500,40").split(",").map(Number);

// The fake gateway.
const calls = [];
const gateway = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.url === "/desc.xml") {
      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(`<?xml version="1.0"?><root><device><serviceList><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl</controlURL></service></serviceList></device></root>`);
      return;
    }
    calls.push({ action: /#(\w+)"/.exec(String(req.headers.soapaction ?? ""))?.[1] ?? "", port: /<NewExternalPort>(\d+)</.exec(body)?.[1] ?? "" });
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(String(req.headers.soapaction).includes("GetExternalIPAddress") ? "<r><NewExternalIPAddress>203.0.113.7</NewExternalIPAddress></r>" : "<r/>");
  });
});
await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-invite-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_WINDOW_AT: AT.join(","), KRAKEN_BIND: "127.0.0.1", KRAKEN_UPNP_LOCATION: `http://127.0.0.1:${gateway.address().port}/desc.xml`, KRAKEN_NATPMP_GATEWAY: "127.0.0.1:9" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }, at) => BrowserWindow.getAllWindows()[0]?.setBounds({ x: at[0], y: at[1], width: 2560, height: 1440 }), AT);
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
const failures = [];
page.on("pageerror", (error) => failures.push(`gm: ${error.message}`));
const results = [];
const shots = [];
let browser = null;
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
  const campaign = await tool("kraken_campaign_create", { name: "Invites", ruleset: "Worldbuilding" });

  // The start screen's choice, under Internet.
  await page.reload();
  await page.click('[data-action="campaigns-mode"]');
  await page.click('[data-campaign="Invites"]');
  await page.click("text=Internet");
  await page.waitForSelector('[data-action="upnp"]:checked');
  if (SHOTS) {
    const file = path.join(SHOTS, "gm-start-upnp.png");
    await page.screenshot({ path: file });
    shots.push(file);
  }
  results.push("start screen offers the router");

  const port = 47437;
  const hosted = await tool("kraken_host", { campaignId: campaign.id, port, password: "open sesame", upnp: true });
  assert(hosted.invites && hosted.invite.endsWith(`:${port}/#pw=open%20sesame`), `kraken_host returns the invite link: ${JSON.stringify(hosted)}`);
  assert(calls.some((call) => call.action === "AddPortMapping" && call.port === String(port)), `the router was asked to open the port: ${JSON.stringify(calls)}`);
  results.push("kraken_host upnp and invite");

  await page.click('[data-launch="players"]');
  await page.waitForSelector('.upnp-line[data-upnp="mapped"]');
  const shown = await page.$eval("[data-invite]", (element) => element.dataset.invite);
  assert(shown === hosted.invite, `the Players window's link is the tool's: ${shown}`);
  const qr = await page.$(".invite-qr");
  const qrFile = path.join(profile, "qr.png");
  await qr.screenshot({ path: qrFile });
  if (SHOTS) {
    const file = path.join(SHOTS, "gm-invite.png");
    await page.screenshot({ path: file });
    shots.push(file);
  }
  const decoder = path.join(profile, "decode.py");
  writeFileSync(decoder, ["import sys, cv2", "image = cv2.imread(sys.argv[1])", "image = cv2.resize(image, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)", "print(cv2.QRCodeDetector().detectAndDecode(image)[0])"].join("\n"));
  const decoded = spawnSync("python", ["-I", decoder, qrFile], { encoding: "utf8" });
  if (decoded.status === 0) {
    assert(decoded.stdout.trim() === shown, `the QR code on screen decodes to the link: "${decoded.stdout.trim()}"`);
    results.push("QR code decodes");
  } else console.log("(QR decoding skipped: no Python with OpenCV)");
  await page.click('[data-action="copy-invite"]');
  await page.waitForSelector('[data-action="copy-invite"]:has-text("Copied")');
  results.push("Players window: router, link, copy, QR");

  // A test player opens the link (this computer's own address, the same fragment).
  const local = hosted.invites.local;
  assert(local === `http://127.0.0.1:${port}/#pw=open%20sesame`, `the link on this computer: ${local}`);
  browser = await chromium.launch({ args: ["--mute-audio"], executablePath: CHROME, headless: true });
  const player = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  player.on("pageerror", (error) => failures.push(`player: ${error.message}`));
  const requested = [];
  player.on("request", (request) => requested.push(request.url()));
  await player.goto(local);
  await player.waitForSelector('input[name="password"]');
  assert((await player.inputValue('input[name="password"]')) === "open sesame", "the table password is filled in from the link");
  assert(!player.url().includes("#"), `the password is gone from the address bar: ${player.url()}`);
  assert(!requested.some((url) => url.includes("sesame")), "the password was never sent to the server");
  await player.fill('input[name="name"]', "a test player");
  await player.fill('input[name="account-password"]', "secret1");
  if (SHOTS) {
    const file = path.join(SHOTS, "player-invite-join.png");
    await player.screenshot({ path: file });
    shots.push(file);
  }
  await player.click('button[type="submit"]');
  await player.waitForSelector(".sidebar");
  results.push("the link seats a player");

  await tool("kraken_leave");
  await settle(500);
  assert(calls.some((call) => call.action === "DeletePortMapping" && call.port === String(port)), `leaving closes the port: ${JSON.stringify(calls)}`);
  results.push("leaving closes the port");

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`INVITE_UI_OK ${results.join("; ")}${shots.length ? `\nshots: ${shots.join(", ")}` : ""}`);
} finally {
  if (failures.length) console.error(failures.join("\n"));
  child.kill();
  gateway.close();
  await browser?.close().catch(() => undefined);
  await app.close().catch(() => undefined);
}
