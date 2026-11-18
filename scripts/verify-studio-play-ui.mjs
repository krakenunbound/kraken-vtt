// Map Studio and the table together, as a GM tests a map: a light placed by a wall
// stops at it in the editor's lighting preview (as in Play test and at the table);
// a character dragged from the Party Sheet, and a creature from the Combat Tracker,
// onto Map Studio's map starts Play test with their tokens there (the test sees with
// the last one; a click on the other looks through their eyes); the agent does the
// same with render play's party.
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
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-studio-play-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "none"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1800, height: 1050 });
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
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Studio play", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47494, password: "pw" });
  await page.waitForSelector("text=Hosting");
  const picked = (await tool("kraken_art", { kind: "token" })).art.find((item) => !item.id.endsWith(".webm"));
  assert(picked, "the art library has a token picture");
  const aldra = await tool("kraken_record_create", { type: "character", name: "Aldra", data: { level: 1, token: picked.id } });
  const goblin = await tool("kraken_record_create", { type: "npc", name: "Goblin", data: {} });
  await tool("kraken_party_edit", { members: [aldra.id] });
  await tool("kraken_combat", { action: "add", recordId: goblin.id });

  // A small map in Map Studio: a wall down the middle, a campfire to its left.
  await page.click('.sidebar [data-launch="studio"]');
  let frame = null;
  for (let wait = 0; wait < 100 && !frame; wait++) {
    frame = page.frames().find((item) => /^http:\/\/127\.0\.0\.1:\d+\//.test(item.url()));
    if (frame && !(await frame.evaluate(() => Boolean(window.KrakenStudio)).catch(() => false))) frame = null;
    if (!frame) await settle(200);
  }
  const studio = (action, args = {}) => tool("kraken_map_studio", { action, ...args });
  await studio("new", { name: "Test room", width: 12, height: 8, grid: 100, background: "#3a3a3a" });
  await studio("wall", { points: [[6, 0], [6, 8]], type: "wall" });
  await studio("light", { at: [4.5, 4], preset: "campfire", bright: 20, dim: 40 });

  // The lighting preview: lit left of the wall, nothing behind it.
  const lit = await frame.evaluate(async () => {
    const S = window.KrakenStudio, g = S.project.grid;
    const read = async (lighting) => { const img = new Image(); img.src = await S.capture({ grid: false, walls: false, lighting }); await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x; };
    const on = await read(true), off = await read(false);
    const at = (x, sx, sy) => [...x.getImageData(sx * g, sy * g, 1, 1).data.slice(0, 3)];
    const diff = (sx, sy) => at(on, sx, sy).reduce((sum, v, i) => sum + Math.abs(v - at(off, sx, sy)[i]), 0);
    return { near: diff(5.5, 4), behind: diff(7, 4), far: diff(8.5, 4) };
  });
  assert(lit.near > 30 && lit.behind < 4 && lit.far < 4, `the campfire's light stops at the wall in the editor's preview (beside it ${lit.near}, behind the wall ${lit.behind} and ${lit.far})`);
  report.push(`a light by a wall stops at it in the editor's lighting preview (lit ${lit.near} beside, ${lit.behind} behind)`);

  // The Party Sheet and the tracker beside Map Studio, then their rows dragged onto its map.
  await tool("kraken_windows", { action: "open", kind: "party" });
  await tool("kraken_windows", { action: "open", kind: "combat" });
  await settle(600);
  const viewport = await frame.locator("#viewport").boundingBox();
  // A spot on Map Studio's map that no window covers.
  const free = async () => {
    for (let fy = 0.2; fy < 0.95; fy += 0.1) for (let fx = 0.05; fx < 0.95; fx += 0.05) {
      const x = viewport.x + viewport.width * fx, y = viewport.y + viewport.height * fy;
      if (await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest?.(".studio-frame") !== null, [x, y])) return { x, y };
    }
    throw new Error("no part of Map Studio's map is uncovered");
  };
  // A row dragged with the mouse onto Map Studio's map: Maelstrom's drop zone over it catches the drop
  // (no browser carries a drag into another site's frame) and hands it to Map Studio. What the row carried is recorded.
  await page.evaluate(() => { const set = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (type, value) { (window.__carried ||= {})[type] = value; return set.call(this, type, value); }; });
  const drag = async (selector, to) => {
    await page.evaluate(() => { window.__carried = {}; });
    const from = await page.locator(selector).first().boundingBox();
    await page.mouse.move(from.x + 30, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 70, from.y + from.height / 2 + 10, { steps: 5 });
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.mouse.up();
    await settle(500);
    return page.evaluate(() => window.__carried);
  };
  const play = () => frame.evaluate(() => ({ mode: window.KrakenStudio.mode, party: window.KrakenPlay._state.party.map((c) => c.name), who: window.KrakenPlay._state.who?.name ?? null }));
  const fromParty = await drag(`[data-member="${aldra.id}"]`, await free());
  assert(JSON.parse(fromParty["application/x-kraken-token"] ?? "{}").name === "Aldra" && fromParty["application/x-kraken-record"] === aldra.id, `a Party Sheet member carries its token and record (${JSON.stringify(fromParty)})`);
  let state = await play();
  await settle(500);
  const drawn = await frame.evaluate(async () => {
    const c = window.KrakenPlay._state.party.find((item) => item.name === "Aldra");
    let capture = "";
    try { capture = (await window.KrakenStudio.capture({ grid: false, walls: false })).slice(0, 22); } catch (error) { capture = String(error.message); }
    return { picture: c?.picture?.slice(0, 15) ?? null, loaded: Boolean(c?.image?.naturalWidth), capture };
  });
  assert(drawn.loaded && drawn.picture === "data:image/png;" && drawn.capture === "data:image/png;base64,", `Aldra's own token picture is her token in Play test, and the map can still be captured (${JSON.stringify(drawn)})`);
  if (process.env.SHOT) { const box = await page.locator(".studio-frame").boundingBox(); await page.screenshot({ path: process.env.SHOT, clip: box }); }
  assert(state.mode === "play" && state.party.includes("Aldra") && state.who === "Aldra", `a character dragged from the Party Sheet onto Map Studio's map starts Play test with their token (${JSON.stringify(state)})`);
  const second = await free();
  await tool("kraken_windows", { action: "close", kind: "party" });
  await settle(300);
  const fromTracker = await drag(".combat-tracker .ct-row", { x: second.x + 220, y: second.y + 160 });
  assert(JSON.parse(fromTracker["application/x-kraken-token"] ?? "{}").name === "Goblin", `a tracker row carries its token (${JSON.stringify(fromTracker)})`);
  state = await play();
  assert(state.party.includes("Goblin") && state.who === "Goblin" && state.party.length === 2, `a creature dragged from the tracker is a token too, and the test sees with it (${JSON.stringify(state)})`);
  // A click on Aldra's token looks through her eyes again.
  const aldraAt = await frame.evaluate(() => { const c = window.KrakenPlay._state.party.find((item) => item.name === "Aldra"); const r = document.querySelector("#mapCanvas").getBoundingClientRect(), z = window.KrakenStudio.getDocument().view.z; return { x: r.left + c.x * z, y: r.top + c.y * z }; });
  const frameBox = await page.locator(".studio-frame").boundingBox();
  await page.mouse.click(frameBox.x + aldraAt.x, frameBox.y + aldraAt.y);
  await settle(300);
  state = await play();
  assert(state.who === "Aldra", `a click on another character's token looks through their eyes (${JSON.stringify(state)})`);
  report.push("Aldra (her own token picture) dragged from the Party Sheet and the Goblin from the tracker onto Map Studio's map: Play test starts with their tokens, a click switches whose eyes it uses");

  // Play test's doors: the whole door is the target (a click near its end opens it); a secret door is not there
  // until it is found. A trap on the way stops the token on its first square and says what it does.
  await studio("door", { from: [9, 2], to: [9, 6], art: false });
  await studio("door", { from: [11, 2], to: [11, 6], kind: "secret" });
  await studio("region", { kind: "trap", name: "Spikes", note: "Under the rug", rect: { x: 2, y: 6, width: 1, height: 1 }, trap: { damage: "2d6", save: { attribute: "dex", dc: 12 }, half: true } });
  const clickAt = async (sx, sy) => {
    const at = await frame.evaluate(([x, y]) => { const r = document.querySelector("#mapCanvas").getBoundingClientRect(), z = window.KrakenStudio.zoom, g = window.KrakenStudio.project.grid; return { x: r.left + x * g * z, y: r.top + y * g * z }; }, [sx, sy]);
    const box = await page.locator(".studio-frame").boundingBox();
    await page.mouse.click(box.x + at.x, box.y + at.y);
    await settle(200);
  };
  const doorState = () => frame.evaluate(() => { const p = window.KrakenStudio.project, s = window.KrakenPlay._state; const d = p.walls.find((w) => (w.flags || []).includes("toggleable") && !(w.flags || []).includes("hidden")); return Boolean(s.doors[d.id]?.open); });
  assert(!(await doorState()), "the door starts closed");
  await clickAt(9, 2.5);
  assert(await doorState(), "a click near the door's end (half a square from it) opens it");
  const secretShown = () => frame.evaluate(() => { const p = window.KrakenStudio.project, s = window.KrakenPlay._state; const d = p.walls.find((w) => (w.flags || []).includes("hidden") && (w.flags || []).includes("toggleable")); return d ? (d.id in s.doors) : "none"; });
  await clickAt(11, 4);
  assert((await secretShown()) === false, "a secret door is not there until it is found");
  await frame.check("#playSecrets");
  await clickAt(11, 4);
  assert((await secretShown()) === true, "found, it opens");
  await frame.evaluate(() => { const s = window.KrakenPlay._state; s.token = { x: 50, y: 650 }; });
  await clickAt(4.5, 6.5);
  const stoppedAt = await frame.evaluate(() => ({ x: window.KrakenPlay._state.token.x, toast: document.querySelector(".toast, #toast, [class*=toast]")?.textContent ?? "" }));
  assert(stoppedAt.x === 250 && /Spikes/.test(stoppedAt.toast) && /2d6/.test(stoppedAt.toast), `a trap on the way stops the token on its square and says what it does (${JSON.stringify(stoppedAt)})`);
  report.push("Play test: a door opens from a click near its end; a secret door is there only when found; a trap stops the token and says what it does");

  // The agent: render play with a party.
  const shot = await studio("render", { view: "play", party: [{ name: "Bram", at: [2.5, 2.5] }, { name: "Cleo", at: [9.5, 5.5] }] });
  assert(shot.party?.length === 2 && shot.party[1].name === "Cleo" && shot.party[1].looking, `kraken_map_studio render play with party (${JSON.stringify(shot.party)})`);
  report.push("kraken_map_studio render play takes the characters on the map (party)");

  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok studio play ui:\n  ${report.join("\n  ")}`);
} finally {
  child.kill();
  await app.close();
}
