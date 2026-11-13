// The dice tower apart from the chat (the GM's Settings > External dice tower):
// ticked, the tower leaves the chat's tray and stands on the table (a 3D
// stone tower, dark when off, its door glowing and dice tumbling inside when
// on); a click turns it on and off, a drag moves it and the place is kept on
// this screen; a die dragged from the tray onto it rolls in the tower ([TOWER]).
// Dice held over it bring it alive (off or on). Its right-click menu, beside
// it: lock it where it stands, or fix it at x,y (kept on this screen); the
// GM's choice of look for everyone: Kraken's six drawn towers or the GM's own
// picture (kraken_tower does all of it).
// kraken_table_options towerExternal does the same; unticked, it is docked again.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), "kraken-tower-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1500, height: 950 }).catch(() => undefined);
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
const report = [];
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
  const campaign = await tool("kraken_campaign_create", { name: "Tower", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47455, password: "pw" });
  await page.waitForSelector("text=Hosting");
  assert(await page.$(".dice-tray .tower"), "the tower starts docked in the chat's tray");
  assert(!(await page.$(".tower-external")), "no tower on the table yet");

  // The GM ticks External dice tower in Settings.
  await page.click('.sidebar [data-launch="settings"]');
  await page.click('[data-setting="tower-external"]');
  await page.waitForSelector(".tower-external");
  assert(!(await page.$(".dice-tray .tower")), "the tray's tower is gone");
  assert((await tool("kraken_table_options")).towerExternal === true, "the table keeps the option");
  await page.click('.sidebar [data-launch="settings"]');
  assert(await page.$('.tower-external[aria-pressed="false"] .tower-art:not(.on)'), "off: the dark tower");
  if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-off.png") });

  // A click turns it on: the glowing door and the tumbling dice.
  await page.click(".tower-external");
  await page.waitForSelector('.tower-external[aria-pressed="true"] .tower-art.on .tower-die');
  const animated = await page.$eval(".tower-art.on .tower-die", (die) => getComputedStyle(die).animationName);
  assert(animated === "tower-tumble", `the dice tumble inside it (${animated})`);
  await settle(700);
  if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-on.png") });
  await page.click(".tower-external");
  await page.waitForSelector('.tower-external[aria-pressed="false"]');
  report.push("Settings > External dice tower: the tower leaves the tray for the table; a click turns it on (door glowing, dice tumbling) and off");

  // A drag moves it; the place is kept (this screen) through a reload.
  const from = await page.locator(".tower-external").boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 200, from.y - 150, { steps: 8 });
  await page.mouse.up();
  const to = await page.locator(".tower-external").boundingBox();
  assert(Math.abs(to.x - (from.x - 200 - from.width / 2)) < 6 && Math.abs(to.y - (from.y - 150 - from.height / 2)) < 6, `dragged (${JSON.stringify(from)} -> ${JSON.stringify(to)})`);
  assert(await page.$('.tower-external[aria-pressed="false"]'), "a drag does not turn it on");
  report.push("dragged to another place on the table (kept on this screen)");

  // Dice held over it: the tower comes alive (off as it is: dice tumbling,
  // quicker, the door glowing), and goes still again when they leave.
  {
    const die = await page.locator('.tray-die[aria-label="d6"]').boundingBox();
    const tower = await page.locator(".tower-external").boundingBox();
    assert(await page.$('.tower-external[aria-pressed="false"] .tower-art:not(.on)'), "off and still before the dice come");
    await page.mouse.move(die.x + die.width / 2, die.y + die.height / 2);
    await page.mouse.down();
    await page.mouse.move(die.x + 60, die.y - 80, { steps: 5 });
    await page.mouse.move(tower.x + tower.width / 2, tower.y + tower.height / 2, { steps: 10 });
    await page.waitForSelector('.tower-external[aria-pressed="false"] .tower-art.on.busy .tower-die');
    const hovering = await page.$eval(".tower-art.busy .tower-die", (die) => ({ name: getComputedStyle(die).animationName, time: getComputedStyle(die).animationDuration }));
    assert(hovering.name === "tower-tumble" && hovering.time === "0.9s", `a die over it: the dice tumble, quicker (${JSON.stringify(hovering)})`);
    if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-hover.png") });
    // Away again, and let go off the tower: nothing rolled, the tower still.
    await page.mouse.move(tower.x - 250, tower.y - 120, { steps: 6 });
    await page.waitForSelector(".tower-external .tower-art:not(.on)");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await settle(300);
    report.push("a die held over the tower (off): it comes alive, dice tumbling twice as fast; away again, it is still");
  }

  // Right-click: its menu beside it. Lock it: a drag no longer moves it.
  const box = await page.locator(".tower-external").boundingBox();
  await page.click(".tower-external", { button: "right" });
  await page.waitForSelector(".tower-menu");
  const menuBox = await page.locator(".tower-menu").boundingBox();
  assert(Math.abs(menuBox.y - box.y) < 40 && (menuBox.x >= box.x + box.width - 4 || menuBox.x + menuBox.width <= box.x + 4), `the menu stands beside the tower (${JSON.stringify(box)} ${JSON.stringify(menuBox)})`);
  assert(await page.$('.tower-menu [data-action="tower-look"]'), "the GM's menu changes its look");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(".png", "-menu.png"), clip: { x: Math.min(box.x, menuBox.x) - 10, y: box.y - 10, width: Math.abs(menuBox.x - box.x) + menuBox.width + box.width + 20, height: menuBox.height + 40 } });
  await page.click('.tower-menu [data-action="tower-lock"]');
  await page.waitForSelector('.tower-external[data-locked="true"] .tower-lock');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100, { steps: 8 });
  await page.mouse.up();
  const held = await page.locator(".tower-external").boundingBox();
  assert(Math.abs(held.x - box.x) < 2 && Math.abs(held.y - box.y) < 2, `locked: a drag leaves it where it is (${JSON.stringify(box)} -> ${JSON.stringify(held)})`);
  await page.waitForSelector('.tower-external[aria-pressed="true"]');
  await page.click(".tower-external");
  await page.waitForSelector('.tower-external[aria-pressed="false"]');
  report.push("right-click: its menu beside it; Lock it where it stands: a padlock, a drag leaves it put (a click still turns it on and off)");

  // Fix it at x,y from the menu: there, and locked; kept through a reload.
  await page.click(".tower-external", { button: "right" });
  await page.fill('.tower-menu [data-field="tower-x"]', "300");
  await page.fill('.tower-menu [data-field="tower-y"]', "200");
  await page.click('.tower-menu [data-action="tower-fix"]');
  await page.waitForSelector(".tower-menu", { state: "detached" });
  await page.mouse.move(5, 5);
  await settle(300);
  const fixed = await page.locator(".tower-external").boundingBox();
  assert(Math.round(fixed.x) === 300 && Math.round(fixed.y) === 200 && (await page.$('.tower-external[data-locked="true"]')), `fixed at 300,200 and locked (${JSON.stringify(fixed)})`);
  // Docked and back out again: it comes back where it was kept, still locked.
  await tool("kraken_table_options", { towerExternal: false });
  await page.waitForSelector(".tower-external", { state: "detached" });
  await tool("kraken_table_options", { towerExternal: true });
  await page.waitForSelector(".tower-external");
  await page.mouse.move(5, 5);
  await settle(300);
  const after = await page.locator(".tower-external").boundingBox();
  assert(Math.round(after.x) === 300 && Math.round(after.y) === 200 && (await page.$('.tower-external[data-locked="true"]')), `still at 300,200 and locked when it comes back (${JSON.stringify(after)})`);
  report.push("Fix it at 300,200: there and locked, and so when it comes back (kept on this screen)");

  // The agent: kraken_tower unlock, place, lock at x,y, view.
  assert((await tool("kraken_tower", { action: "unlock" })).locked === false, "kraken_tower unlock");
  await page.waitForSelector('.tower-external[data-locked="false"]');
  const placed = await tool("kraken_tower", { action: "lock", x: 420, y: 260 });
  assert(placed.x === 420 && placed.y === 260 && placed.locked, `kraken_tower lock at 420,260 (${JSON.stringify(placed)})`);
  await page.mouse.move(5, 5);
  await settle(300);
  const agentBox = await page.locator(".tower-external").boundingBox();
  assert(Math.round(agentBox.x) === 420 && Math.round(agentBox.y) === 260, "the tower stands where the agent fixed it");
  assert((await tool("kraken_tower", { action: "on" })).on === true && (await page.$('.tower-external[aria-pressed="true"]')), "kraken_tower on");
  await tool("kraken_tower", { action: "off" });
  report.push("kraken_tower: unlock, lock at 420,260, on and off, as the menu");

  // Its looks: Kraken's six drawn towers, from the menu's Change its look.
  const listed = await tool("kraken_tower", { action: "list" });
  assert(listed.drawn.length === 6 && listed.style === "stone", `six looks, stone to begin with (${JSON.stringify(listed)})`);
  // Kraken's lighthouse (the Kraken Ocean Theme's FG dice tower): a picture with its lit twin.
  const lighthouse = listed.pictures.find((item) => /Kraken Lighthouse\.png$/.test(item.id));
  assert(lighthouse && !listed.pictures.some((item) => / lit\./.test(item.id)), `the lighthouse is a look, its lit twin is not (${JSON.stringify(listed.pictures)})`);
  await page.click(".tower-external", { button: "right" });
  await page.click('.tower-menu [data-action="tower-look"]');
  await page.waitForSelector('.decal-picker[data-kind="tower"] [data-decal="obsidian"] svg[data-tower-style="obsidian"]');
  assert((await page.$$('.decal-picker[data-kind="tower"] .decal-tile')).length === 6 + listed.pictures.length && listed.pictures.length >= 6, "the picker shows the six drawn looks and the tower pictures (the lighthouse and Kraken's five)");
  if (process.env.SHOT) await page.locator('.decal-picker[data-kind="tower"]').screenshot({ path: process.env.SHOT.replace(".png", "-looks.png") });
  await page.dblclick('.decal-picker[data-kind="tower"] [data-decal="obsidian"]');
  await page.waitForSelector('.tower-external svg[data-tower-style="obsidian"]');
  assert((await tool("kraken_table_options")).towerStyle === "obsidian", "the table keeps the look");
  for (const look of listed.drawn) {
    await tool("kraken_tower", { action: "style", id: look });
    await page.waitForSelector(`.tower-external svg[data-tower-style="${look}"]`);
    await tool("kraken_tower", { action: "on" });
    await settle(500);
    if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", `-${look}.png`) });
    await tool("kraken_tower", { action: "off" });
  }
  const refused = await tool("kraken_tower", { action: "style", id: "nonsense" }).then(() => null, (error) => error.message);
  assert(/No dice tower look/.test(refused ?? ""), "an unknown look is refused");
  report.push(`the looks: ${listed.drawn.join(", ")}, chosen in the picker (from the menu) or by kraken_tower style`);

  // The lighthouse: off, its dark picture; on, or a die held over it, its lit picture.
  await tool("kraken_tower", { action: "style", id: lighthouse.id });
  await page.waitForSelector('.tower-external .tower-art.picture.paired[data-lit="false"]');
  await page.waitForFunction(() => [...document.querySelectorAll(".tower-external .tower-art.picture img")].every((img) => img.complete && img.naturalWidth > 0));
  await page.mouse.move(5, 5);
  if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-lighthouse-off.png") });
  await tool("kraken_tower", { action: "on" });
  await page.waitForSelector('.tower-external .tower-art.picture.paired[data-lit="true"]');
  await settle(600);
  const litShown = await page.$eval(".tower-external .tower-lit", (img) => getComputedStyle(img).opacity);
  assert(Number(litShown) > 0.5, `on: the lit lighthouse (${litShown})`);
  if (process.env.SHOT) await page.locator(".tower-external").screenshot({ path: process.env.SHOT.replace(".png", "-lighthouse-on.png") });
  await tool("kraken_tower", { action: "off" });
  {
    const die = await page.locator('.tray-die[aria-label="d8"]').boundingBox();
    const tower = await page.locator(".tower-external").boundingBox();
    await page.mouse.move(die.x + die.width / 2, die.y + die.height / 2);
    await page.mouse.down();
    await page.mouse.move(die.x + 60, die.y - 80, { steps: 5 });
    await page.mouse.move(tower.x + tower.width / 2, tower.y + tower.height / 2, { steps: 10 });
    await page.waitForSelector('.tower-external .tower-art.picture.paired.busy[data-lit="true"]');
    await page.mouse.move(tower.x - 250, tower.y - 120, { steps: 6 });
    await page.waitForSelector('.tower-external .tower-art.picture[data-lit="false"]');
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  report.push("Kraken's lighthouse (your FG tower): dark when off; lit when on, and when a die is held over it");

  // The GM's own picture of a tower: imported, and it stands on the table (lit when on).
  const picture = path.join(profile, "My Tower.png");
  writeFileSync(picture, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAYAAACEYr13AAAAKklEQVR42mNkYPj/n4ECwDiqgfH/BqgYw6gGxlEDGEc1MI4awDiqgVYNAEkTEhXh9P+bAAAAAElFTkSuQmCC", "base64"));
  const imported = await tool("kraken_tower", { action: "import", path: picture });
  await page.waitForSelector('.tower-external .tower-art.picture img');
  const loaded = await page.$eval(".tower-external .tower-art.picture img", (img) => img.complete && img.naturalWidth > 0);
  assert(loaded && imported.style === imported.imported.id, `the GM's own tower picture stands on the table (${JSON.stringify(imported)})`);
  await tool("kraken_tower", { action: "on" });
  await page.waitForSelector(".tower-external .tower-art.picture.on .tower-die");
  await tool("kraken_tower", { action: "off" });
  await tool("kraken_tower", { action: "style", id: "stone" });
  report.push("the GM's own tower picture (kraken_tower import, or Browse/drop in the picker): it stands on the table, dice falling in front of it when on");


  // A die from the tray dropped on it rolls in the tower.
  const before = (await tool("kraken_chat_log", { count: 50 })).length;
  const die = await page.locator('.tray-die[aria-label="d20"]').boundingBox();
  const tower = await page.locator(".tower-external").boundingBox();
  await page.mouse.move(die.x + die.width / 2, die.y + die.height / 2);
  await page.mouse.down();
  await page.mouse.move(die.x + 60, die.y - 80, { steps: 5 });
  await page.mouse.move(tower.x + tower.width / 2, tower.y + tower.height / 2, { steps: 10 });
  await page.waitForSelector(".tower-external.drop");
  await page.mouse.up();
  await settle(900);
  const lines = await tool("kraken_chat_log", { count: 50 });
  const rolled = lines.slice(before).find((line) => line.roll);
  assert(rolled && /\[TOWER\]/.test(rolled.roll.label ?? rolled.text ?? ""), `a die dropped on it rolls in the tower (${JSON.stringify(lines.slice(before))})`);
  report.push("a d20 dragged onto it rolls in the tower ([TOWER])");

  // Unticked (kraken_table_options), it is docked in the chat again.
  await tool("kraken_table_options", { towerExternal: false });
  await page.waitForSelector(".tower-external", { state: "detached" });
  await page.waitForSelector(".dice-tray .tower");
  report.push("kraken_table_options towerExternal false: docked in the chat again");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok tower ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
