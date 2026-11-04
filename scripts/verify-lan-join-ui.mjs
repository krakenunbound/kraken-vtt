// Hosting and joining through the front screens, as a GM and a player do it:
// one copy of the app makes a campaign and presses Play with LAN on; a second
// copy (its own profile) fills Take your seat with this computer's network
// address (not 127.0.0.1) and the port, and sits at the table; the GM sees the
// player. Before the GM hosts, the player's join says no table answered there.
// A test player in Chrome joins the same address too. Uses port 47390.
import { mkdtempSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, chromium } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const address = Object.values(networkInterfaces())
  .flat()
  .find((item) => item && item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254."))?.address;
if (!address) {
  console.log("skip lan join ui: no network address");
  process.exit(0);
}
const port = 47390;
const launch = () => {
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-lan-join-"));
  const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
  delete env.KRAKEN_BIND;
  return electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
};
const failures = [];
const gmApp = await launch();
const playerApp = await launch();
let browser = null;
try {
  const gm = await gmApp.firstWindow();
  const player = await playerApp.firstWindow();
  for (const [who, page] of [["gm", gm], ["player", player]]) page.on("pageerror", (error) => failures.push(`${who}: ${error.message}`));
  await gm.waitForSelector("text=My Campaigns");
  await player.waitForSelector("text=My Campaigns");

  // The player tries first: nothing is hosting yet.
  await player.click('[data-action="join-mode"]');
  await player.fill('form[data-form="join"] input[name="name"]', "A test player");
  await player.fill('form[data-form="join"] input[name="address"]', address);
  await player.fill('form[data-form="join"] input[name="port"]', String(port));
  await player.click('form[data-form="join"] button[type="submit"]');
  await player.waitForSelector("text=No table answered", { timeout: 15000 });
  const early = await player.textContent('form[data-form="join"]');
  assert(early.includes(`${address}:${port}`) && early.includes("pressed Play"), `the early join says no table answered: ${early}`);

  // The GM makes a campaign and presses Play with LAN on.
  await gm.click('[data-action="campaigns-mode"]');
  await gm.fill('input[name="new-campaign"]', "LAN test");
  await gm.locator('form[data-form="create"]').evaluate((form) => form.requestSubmit());
  await gm.waitForSelector('form[data-form="play"]');
  await gm.fill('form[data-form="play"] input[name="port"]', String(port));
  await gm.click('[data-action="play"]');
  await gm.waitForSelector(".sidebar", { timeout: 20000 });

  // The player takes the seat at the network address.
  await player.click('form[data-form="join"] button[type="submit"]');
  await player.waitForSelector(".sidebar", { timeout: 20000 });
  await gm.click('.sidebar [data-launch="players"]');
  await gm.waitForSelector('.roster-list li[data-role="player"]:has-text("A test player")', { timeout: 10000 });

  // A test player in Chrome at the same address.
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage();
  seat.on("pageerror", (error) => failures.push(`chrome: ${error.message}`));
  await seat.goto(`http://${address}:${port}/`);
  await seat.fill('input[name="name"]', "Chrome player");
  await seat.click('button[type="submit"]');
  await seat.waitForSelector(".sidebar", { timeout: 20000 });
  await gm.waitForSelector('.roster-list li[data-role="player"]:has-text("Chrome player")', { timeout: 10000 });
  await gm.screenshot({ path: path.join(tmpdir(), "kraken-lan-gm.png") });
  await player.screenshot({ path: path.join(tmpdir(), "kraken-lan-player.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok lan join ui: before Play the join says no table answered at ${address}:${port}; the GM hosts with LAN on; a second copy of the app and a test player in Chrome take their seats at ${address}:${port} and the GM sees both`);
} finally {
  await browser?.close();
  await playerApp.close();
  await gmApp.close();
}
