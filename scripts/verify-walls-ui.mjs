// Walls and doors drawn and moved in the map editor, where the GM's hand puts
// them. A door box dragged on a picture map lands where it was drawn (grid
// snap is off unless turned on; a marker shows where each point goes) and is
// one door (its four sides share a group, opening as one). Dragging one of its
// sides moves the whole door; dragging a corner of a wall moves that end (and
// every wall end on it); Ctrl+Z puts it back. With grid snap on, a box clicked
// corner to corner lands on the half squares. kraken_wall move and move_point.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-walls-ui-"));
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
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (a, b, by = 1.5) => Math.abs(a - b) <= by;

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "Walls UI", ruleset: "Worldbuilding" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47441, password: "" });
  await page.waitForSelector("text=Hosting");
  const picture = path.join(profile, "Great Hall.webp");
  writeFileSync(picture, readFileSync(path.join(process.cwd(), "src", "assets", "great-hall.webp")));
  await tool("kraken_open_adventure", { path: picture });
  await page.waitForSelector('.window[data-window="map"] .map-toolbar');
  await settle(800);

  // Screen to scene pixels, as the map's camera has it.
  const view = page.locator('.window[data-window="map"] .viewport');
  const toScene = async (x, y) =>
    page.evaluate(
      ([cx, cy]) => {
        const viewport = document.querySelector('.window[data-window="map"] .viewport').getBoundingClientRect();
        const world = document.querySelector('.window[data-window="map"] .world');
        const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(world.style.transform);
        const [tx, ty, scale] = match.slice(1).map(Number);
        return { x: (cx - viewport.left - tx) / scale, y: (cy - viewport.top - ty) / scale, scale };
      },
      [x, y],
    );
  const toScreen = async (x, y) =>
    page.evaluate(
      ([wx, wy]) => {
        const viewport = document.querySelector('.window[data-window="map"] .viewport').getBoundingClientRect();
        const world = document.querySelector('.window[data-window="map"] .world');
        const [tx, ty, scale] = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(world.style.transform).slice(1).map(Number);
        return { x: viewport.left + tx + wx * scale, y: viewport.top + ty + wy * scale };
      },
      [x, y],
    );
  const box = await view.boundingBox();

  // The editor: a door, the box tool; the marker shows where the point goes.
  await page.click('[data-action="map-editor"]');
  await page.click('[data-wall-kind="door"]');
  await page.click('[data-edit-tool="rect"]');
  assert(!(await page.isChecked('.map-editor label:has-text("Grid snap") input')), "grid snap is off to begin with");
  const from = { x: box.x + box.width * 0.37 + 0.4, y: box.y + box.height * 0.41 + 0.3 };
  const to = { x: from.x + 83.7, y: from.y + 21.3 };
  await page.mouse.move(from.x, from.y);
  await page.waitForSelector(".wall-aim", { state: "attached" });
  const aim = (await page.getAttribute(".wall-aim", "data-aim")).split(",").map(Number);
  const want = await toScene(from.x, from.y);
  assert(near(aim[0], want.x) && near(aim[1], want.y), `the marker is under the pointer: ${aim} vs ${JSON.stringify(want)}`);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(from.x + ((to.x - from.x) * step) / 10, from.y + ((to.y - from.y) * step) / 10);
  await page.mouse.up();
  let walls = [];
  for (let wait = 0; wait < 30 && walls.length < 4; wait++) {
    walls = (await tool("kraken_wall", { action: "list" })).walls;
    if (walls.length < 4) await settle(150);
  }
  assert(walls.length === 4 && walls.every((wall) => wall.kind === "door"), `a door box of four sides: ${JSON.stringify(walls)}`);
  const a = await toScene(from.x, from.y);
  const b = await toScene(to.x, to.y);
  const xs = walls.flatMap((wall) => [wall.x1, wall.x2]);
  const ys = walls.flatMap((wall) => [wall.y1, wall.y2]);
  assert(near(Math.min(...xs), a.x) && near(Math.max(...xs), b.x) && near(Math.min(...ys), a.y) && near(Math.max(...ys), b.y), `the door is where it was drawn: x ${Math.min(...xs)}..${Math.max(...xs)} for ${a.x}..${b.x}, y ${Math.min(...ys)}..${Math.max(...ys)} for ${a.y}..${b.y}`);
  const group = walls[0].group;
  assert(group && walls.every((wall) => wall.group === group), `its sides are one door: ${walls.map((wall) => wall.group)}`);
  const doors = (await tool("kraken_map", {})).doors ?? [];
  assert(new Set(doors.filter((door) => door.group === group).map((door) => door.group)).size === 1, "the table sees one door");

  // Dragged by a side: the whole door moves, as far as the hand went.
  await page.click('[data-edit-tool="select"]');
  const top = walls.find((wall) => near(wall.y1, Math.min(...ys)) && near(wall.y2, Math.min(...ys)));
  const grab = await toScreen((top.x1 + top.x2) / 2, top.y1);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(grab.x + step * 6, grab.y + step * 4);
  await page.waitForSelector(".wall-dragging", { state: "attached" });
  await page.mouse.up();
  const shift = { x: (await toScene(grab.x + 60, grab.y + 40)).x - (await toScene(grab.x, grab.y)).x, y: (await toScene(grab.x + 60, grab.y + 40)).y - (await toScene(grab.x, grab.y)).y };
  let moved = [];
  for (let wait = 0; wait < 30; wait++) {
    moved = (await tool("kraken_wall", { action: "list" })).walls;
    if (moved.every((wall) => !near(wall.x1, walls.find((item) => item.id === wall.id).x1, 0.5))) break;
    await settle(150);
  }
  for (const wall of moved) {
    const was = walls.find((item) => item.id === wall.id);
    assert(near(wall.x1 - was.x1, shift.x, 2) && near(wall.y1 - was.y1, shift.y, 2) && near(wall.x2 - was.x2, shift.x, 2), `every side of the door moved with the drag: ${JSON.stringify({ was, wall, shift })}`);
  }

  // A corner dragged: that end moves, and the other wall meeting there goes with it.
  const corner = { x: moved[0].x1, y: moved[0].y1 };
  const meeting = moved.filter((wall) => (near(wall.x1, corner.x, 0.2) && near(wall.y1, corner.y, 0.2)) || (near(wall.x2, corner.x, 0.2) && near(wall.y2, corner.y, 0.2)));
  const at = await toScreen(corner.x, corner.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(at.x - step * 5, at.y - step * 5);
  await page.mouse.up();
  const goal = await toScene(at.x - 40, at.y - 40);
  let after = [];
  for (let wait = 0; wait < 30; wait++) {
    after = (await tool("kraken_wall", { action: "list" })).walls;
    if (after.some((wall) => near(wall.x1, goal.x, 2) || near(wall.x2, goal.x, 2))) break;
    await settle(150);
  }
  const ends = after.filter((wall) => meeting.some((item) => item.id === wall.id)).map((wall) => (near(wall.x1, goal.x, 2) && near(wall.y1, goal.y, 2)) || (near(wall.x2, goal.x, 2) && near(wall.y2, goal.y, 2)));
  assert(meeting.length === 2 && ends.every(Boolean), `the corner moved, both walls there with it: ${JSON.stringify({ meeting, after, goal })}`);

  // Ctrl+Z: the corner back.
  await page.keyboard.press("Control+z");
  await settle(500);
  const undone = (await tool("kraken_wall", { action: "list" })).walls;
  assert(undone.some((wall) => near(wall.x1, corner.x, 0.2) && near(wall.y1, corner.y, 0.2)), "undo puts the corner back");

  // Grid snap on: a box clicked corner to corner lands on the half squares.
  await page.check('.map-editor label:has-text("Grid snap") input');
  await page.click('[data-edit-tool="rect"]');
  await page.click('[data-wall-kind="wall"]');
  const c1 = { x: box.x + box.width * 0.62 + 3, y: box.y + box.height * 0.3 + 2 };
  await page.mouse.click(c1.x, c1.y);
  await page.mouse.click(c1.x + 97, c1.y + 61);
  let snapped = [];
  for (let wait = 0; wait < 30 && snapped.length < 4; wait++) {
    snapped = (await tool("kraken_wall", { action: "list", kind: "wall" })).walls;
    if (snapped.length < 4) await settle(150);
  }
  assert(snapped.length === 4 && !snapped[0].group, `a plain wall box: ${JSON.stringify(snapped)}`);
  // The grid's corners, from a wall the agent puts on square corners (then takes away).
  const probe = await tool("kraken_wall", { action: "add", cells: [[0, 0], [1, 0]] });
  const [origin] = probe.walls;
  const size = origin.x2 - origin.x1;
  await tool("kraken_wall", { action: "remove", ids: probe.ids });
  const onHalf = (value, base) => Math.abs((value - base) / (size / 2) - Math.round((value - base) / (size / 2))) < 0.01;
  assert(size > 0 && snapped.every((wall) => onHalf(wall.x1, origin.x1) && onHalf(wall.y1, origin.y1) && onHalf(wall.x2, origin.x1) && onHalf(wall.y2, origin.y1)), `with grid snap on, the box's corners are on the half squares (size ${size}): ${JSON.stringify(snapped)}`);
  // Turned off again, and kept off.
  await page.uncheck('.map-editor label:has-text("Grid snap") input');
  assert((await page.evaluate(() => window.localStorage.getItem("kraken-wall-snap"))) === "off", "the grid snap choice is kept");

  // The agent: move and move_point.
  const ids = moved.map((wall) => wall.id);
  const before = (await tool("kraken_wall", { action: "list" })).walls.filter((wall) => ids.includes(wall.id));
  await tool("kraken_wall", { action: "move", ids, dx: 10, dy: -5 });
  const shifted = (await tool("kraken_wall", { action: "list" })).walls.filter((wall) => ids.includes(wall.id));
  assert(shifted.every((wall) => near(wall.x1 - before.find((item) => item.id === wall.id).x1, 10, 0.2)), "kraken_wall move");
  const point = { x: shifted[0].x2, y: shifted[0].y2 };
  const moves = await tool("kraken_wall", { action: "move_point", from: point, to: { x: point.x + 7, y: point.y } });
  assert(moves.walls.length >= 2, `kraken_wall move_point moves every end there: ${moves.walls.length}`);

  await page.screenshot({ path: path.join(tmpdir(), "kraken-walls-ui.png") });
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok walls ui: a door box dragged lands where it was drawn (grid snap off to begin with, a marker under the pointer), its four sides one door; dragged by a side the whole door moves; a corner dragged takes both walls there; Ctrl+Z puts it back; grid snap on for a clicked box, then off and kept; kraken_wall move and move_point. ${path.join(tmpdir(), "kraken-walls-ui.png")}`);
} finally {
  child.kill();
  await app.close();
}
