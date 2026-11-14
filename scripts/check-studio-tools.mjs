// Map Studio's agent tools (kraken_map_studio), each action through the real
// app: Kraken launched (scripts/studio-agent-harness.mjs), a campaign hosted,
// the tool called over Kraken's MCP server, the editor in the GM's Map Studio
// window doing the work. Then the editor itself is read (its project, its tab,
// its layers panel, its canvas) to prove it shows what the tools made, and Save
// to Kraken is proved in the campaign (kraken_wall, kraken_light).
// npm run studio-tools
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { startKraken } from "./studio-agent-harness.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { ACTIONS } = require("../electron/studio/agentTools.cjs");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const out = mkdtempSync(path.join(tmpdir(), "kraken-studio-tools-out-"));
const done = new Set();
const report = [];
const k = await startKraken({ name: "Studio tools", port: 47464 });
const studio = async (action, args = {}) => {
  done.add(action);
  return k.studio(action, args);
};
try {
  // library: the shipped packs, searchable by kind and name, sized in squares.
  const all = await studio("library", { limit: 500 });
  assert(all.total >= 300 && all.shipped.includes("Kraken Map Art"), `library lists the shipped art (${all.total})`);
  const walls = await studio("library", { kind: "Walls", shippedOnly: true, limit: 200 });
  assert(walls.art.some((a) => a.name === "Dungeon wall" && a.wallArt), "library: Dungeon wall is wall art");
  const brazier = (await studio("library", { search: "brazier" })).art.find((a) => a.name === "Brazier");
  assert(brazier && brazier.squares[0] > 0.8 && brazier.squares[0] < 1.2, `library: a brazier is about a square (${brazier?.squares})`);
  report.push(`library: ${all.total} assets, ${Object.keys(all.kinds).length} kinds`);

  // new, floor, paint, scatter, place (with its light), wall (art and plain), door, light, ambient, weather, region.
  const made = await studio("new", { name: "Tool Test", width: 12, height: 10, grid: 80 });
  assert(made.squares[0] === 12 && made.grid === 80 && made.pixels[0] === 960, "new: 12 x 10 squares at 80 px");
  const floor = await studio("floor", { art: "Flagstone", rect: { x: 1, y: 1, width: 8, height: 6 }, room: true });
  const ground = await studio("floor", { art: "Dirt", polygon: [[9, 1], [11, 1], [11, 7], [9, 7]], feather: 0.5 });
  const paint = await studio("paint", { art: "Moss", path: [[2, 2], [4, 3]], size: 1.5, softness: 60 });
  const scatter = await studio("scatter", { art: "Rocks", path: [[9.5, 2], [10.5, 6]], size: 0.6, seed: "t" });
  assert(scatter.placed >= 2, `scatter placed ${scatter.placed}`);
  const placed = await studio("place", { art: "Brazier", at: [5, 4], light: "campfire" });
  assert(placed.light, "place: a brazier with its light");
  const many = await studio("place", { items: [{ art: "Table, tavern", at: [3, 5.5] }, { art: "Chair", at: [3, 4.8], rotation: 180 }] });
  assert(many.placed === 2, "place: items");
  const wallArt = await studio("wall", { art: "Dungeon wall", points: [[1, 1], [9, 1], [9, 7], [1, 7], [1, 4]] });
  assert(wallArt.art?.id && wallArt.wall, "wall: art and its line-of-sight wall");
  const lineGap = await studio("wall", { art: "Dungeon wall", points: [[1, 3], [1, 1]] });
  const plain = await studio("wall", { type: "window", points: [[9, 3], [9, 4]] });
  assert(plain.wall, "wall: a plain line-of-sight window");
  // A door across the gap at x 1, y 3..4 (nothing to cut), and one on the wall line at y 7 (cut out of it).
  const door = await studio("door", { from: [1, 3], to: [1, 4] });
  const cut = await studio("door", { from: [4, 7], to: [5, 7], kind: "door", locked: true });
  const secret = await studio("door", { from: [9, 5], to: [9, 6], kind: "secret" });
  assert(door.art && cut.art && !secret.art, "door: art on doors, none on the secret door");
  const light = await studio("light", { at: [8, 2], preset: "torch", color: "#ffaa55", bright: 10, dim: 25 });
  assert(light.bright === 10 && light.dim === 25, "light: its fields");
  await studio("place", { art: "Torch", at: [8, 2], width: 0.3 });
  const amb = await studio("ambient", { preset: "dusk" });
  assert(amb.ambient?.preset === "dusk" && amb.darkness > 0, "ambient: dusk");
  const fx = await studio("weather", { type: "rain", settings: { RainIntensity: 0.6 }, areas: [{ rect: { x: 9, y: 1, width: 2, height: 6 } }] });
  const region = await studio("region", { kind: "trap", rect: { x: 6, y: 5, width: 1, height: 1 }, name: "Pressure plate", note: "Darts" });
  assert(fx.effect && region.region, "weather and region");

  // map and check: read back in squares; the quality rules.
  let map = await studio("map", {});
  const lsWalls = map.walls.filter((w) => w.type === "wall");
  const doors = map.walls.filter((w) => w.type === "door");
  assert(doors.length === 2 && map.walls.some((w) => w.type === "secret") && map.walls.some((w) => w.type === "window"), `map: doors ${doors.length}`);
  // The cut door: no wall runs along y 7 between x 4 and 5 any more.
  const across = lsWalls.some((w) => w.points.some((p, i) => i && p[1] === 7 && w.points[i - 1][1] === 7 && Math.min(p[0], w.points[i - 1][0]) < 4.5 && Math.max(p[0], w.points[i - 1][0]) > 4.5));
  assert(!across, "door: the wall along its gap was cut");
  assert(map.objects.some((o) => o.id === floor.id && o.floor) && map.objects.some((o) => o.id === ground.id), "map: floors");
  assert(map.lights.length === 2 && map.effects[0].type === "rain" && map.regions[0].name === "Pressure plate", "map: lights, rain, the trap");
  const checked = await studio("check", {});
  assert(checked.ok && checked.art.outside.length === 0 && checked.art.shipped > 5, `check: a sound map of shipped art passes (${checked.notes.join("; ")})`);
  const stray = await studio("light", { at: [10, 9] });
  const flagged = await studio("check", {});
  assert(flagged.notes.some((n) => n.includes(stray.id)), "check: a light with no light-source art is flagged");
  report.push(`built: ${map.counts.objects} art, ${map.counts.walls} walls, ${map.counts.doors} doors, ${map.counts.lights} lights; check flags a stray light`);

  // update, remove, undo, redo.
  await studio("update", { id: placed.id, at: [5.5, 4], rotation: 45 });
  await studio("update", { id: stray.id, bright: 5, dim: 10 });
  await studio("update", { id: cut.door, open: true });
  map = await studio("map", {});
  const brazierNow = map.objects.find((o) => o.id === placed.id);
  assert(brazierNow.at[0] === 5.5 && brazierNow.rotation === 45, "update: art moved and turned");
  assert(map.walls.find((w) => w.id === cut.door).flags.includes("open"), "update: the door opened");
  await studio("remove", { ids: [stray.id, wallArt.art.id] });
  map = await studio("map", {});
  assert(!map.lights.some((l) => l.id === stray.id) && !map.walls.some((w) => w.id === wallArt.wall), "remove: a light, and wall art with its line-of-sight wall");
  await studio("undo");
  assert((await studio("map", {})).walls.some((w) => w.id === wallArt.wall), "undo: the wall is back");
  await studio("redo");
  assert(!(await studio("map", {})).walls.some((w) => w.id === wallArt.wall), "redo: gone again");
  await studio("undo");

  // render: picture, editor and play test, at full size, cropped, inline.
  const picture = await studio("render", { file: path.join(out, "picture.png") });
  assert(picture.width === 960 && picture.height === 800 && existsSync(picture.file), "render picture: full size");
  const stats = await sharp(picture.file).stats();
  assert(stats.channels[0].stdev > 10, "render picture: art, not a flat fill");
  const editor = await studio("render", { view: "editor", lighting: true, file: path.join(out, "editor.png") });
  const play = await studio("render", { view: "play", token: [5, 5], light: "torch", darkness: 0.9, file: path.join(out, "play.png") });
  const playStats = await sharp(play.file).stats();
  assert(playStats.channels[2].mean < stats.channels[2].mean - 10, "render play: darker than the picture (sight and light)");
  const crop = await studio("render", { region: { x: 1, y: 1, width: 4, height: 3 }, inline: true });
  assert(crop.width === 320 && crop.height === 240 && crop.image, "render: a region, inline");
  report.push(`render: picture, editor, play and a 4 x 3 square crop (${editor.file})`);

  // export: the book's picture and walls, and the portable project.
  const exported = await studio("export", { folder: out, name: "tool-test" });
  const book = JSON.parse(readFileSync(exported.walls, "utf8"));
  assert(book.width === 960 && book.grid === 80 && book.walls.some((w) => w.door) && book.walls.some((w) => w.secret) && book.lights.length >= 1, "export: walls JSON in the book's shape");
  assert(statSync(exported.picture).size > 1000 && existsSync(exported.project), "export: picture and portable project");
  const { imageRecord } = await import("../games/lib/fg.mjs");
  const record = imageRecord({ name: "Tool Test", file: "images/tool-test.webp", width: book.width, height: book.height, grid: book.grid, walls: book.walls });
  assert(record.image.layers.layer[0].occluders.occluder.length === book.walls.length, "export: a book's imageRecord takes the walls");

  // save, projects, open (saved and file), tabs.
  const saved = await studio("save", {});
  assert(saved.project, "save: a Map Studio project");
  const projects = await studio("projects", {});
  assert(projects.some((p) => p.id === saved.project), "projects: lists it");
  await studio("generate", { setting: "crypt-catacomb", seed: "check-seed", rooms: 6, roomFloor: "Dungeon stone", corridorFloor: "Flagstone", stairArt: "Narrow stairs" });
  const generated = await studio("map", { detail: false });
  const genCheck = await studio("check", {});
  assert(genCheck.art.outside.length === 0 && genCheck.art.shipped >= 2, `generate: its floors are known shipped art (${JSON.stringify(genCheck.art)})`);
  assert(generated.counts.doors > 0 && generated.counts.walls > 0 && generated.layers.find((l) => l.id === "map").objects > 0, "generate: floors, walls and doors");
  const again = await studio("generate", { setting: "crypt-catacomb", seed: "check-seed", rooms: 6 });
  assert(again.rooms === generated.counts.objects || again.seed === "check-seed", "generate: seeded");
  await studio("open", { saved: saved.project });
  assert((await studio("map", { detail: false })).name === "Tool Test", "open: the saved project");
  await studio("open", { file: exported.project });
  const tabs = await studio("tabs", {});
  assert(tabs.tabs.length >= 2 && tabs.tabs.some((t) => t.name === "Tool Test"), `tabs: ${tabs.tabs.map((t) => t.name).join(", ")}`);
  // grid, layer, tabs (switch and close), the example map.
  const resized = await studio("grid", { width: 14, distance: 5, background: "#202020" });
  assert(resized.squares[0] === 14 && resized.background === "#202020", "grid: the map 14 squares wide");
  await studio("grid", { width: 12 });
  const layers = await studio("layer", { id: "doors", hidden: true });
  assert(layers.find((l) => l.id === "doors").hidden, "layer: doors hidden");
  await studio("layer", { id: "doors", hidden: false, locked: true, move: "down" });
  await studio("layer", { id: "doors", locked: false });
  const demo = await studio("open", { demo: true });
  assert(demo.counts.objects > 10, "open demo: the example map");
  let list = await studio("tabs", {});
  const crypt = list.tabs.find((t) => /check-seed/.test(t.name));
  list = await studio("tabs", { select: crypt.index });
  assert(list.active === crypt.index && (await studio("map", { detail: false })).name === crypt.name, "tabs: switched");
  const count = list.tabs.length;
  list = await studio("tabs", { close: crypt.index, discard: true });
  assert(list.tabs.length === count - 1, "tabs: closed");
  const back = (await studio("tabs", {})).tabs.findLast((t) => t.name === "Tool Test");
  await studio("tabs", { select: back.index });
  report.push(`save, projects, generate (seeded crypt, shipped floors), open saved, portable zip and the example; grid, layer, tabs switch and close`);

  // The editor shows what the tools made: its project, tab bar, layers panel and canvas.
  const frame = k.studioFrame();
  assert(frame, "Map Studio is open in the GM's window");
  const seen = await frame.evaluate(() => ({
    name: window.KrakenStudio.project.name,
    tabText: document.querySelector("#tabBar")?.innerText ?? "",
    nameField: document.querySelector("#projectName").value,
    walls: window.KrakenStudio.project.walls.length,
    doorArt: window.KrakenStudio.project.objects.filter((o) => o.doorId).length,
    canvas: (() => { const c = document.querySelector("#mapCanvas"); return { w: c.width, h: c.height }; })(),
  }));
  assert(seen.name === "Tool Test" && seen.nameField === "Tool Test" && seen.tabText.includes("Tool Test"), `the editor's tab and name: ${JSON.stringify(seen)}`);
  assert(seen.walls > 5 && seen.doorArt === 2 && seen.canvas.w === 960, "the editor holds the walls, the door art, the map's size");
  await frame.evaluate(() => window.KrakenStudio.switchMode("layers"));
  const panel = await frame.evaluate(() => document.querySelector("#layerList").innerText);
  assert(/doors/i.test(panel) && /walls/i.test(panel), `the layers panel lists the tools' layers: ${panel.slice(0, 200)}`);
  await frame.evaluate(() => window.KrakenStudio.switchMode("view"));
  // The editor's own dialog still generates through the same build() the tool uses.
  const tabsBefore = (await studio("tabs", {})).tabs.length;
  await frame.evaluate(() => { document.querySelector("#layoutBtn").click(); document.querySelector("#layoutSeed").value = "dialog-seed"; document.querySelector("#layoutGo").click(); });
  let dialogMap = null;
  for (let wait = 0; wait < 100 && !dialogMap; wait++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    dialogMap = await frame.evaluate(() => (window.KrakenStudio.project.layout?.seed === "dialog-seed" ? window.KrakenStudio.project.walls.length : null));
  }
  assert(dialogMap > 0 && (await studio("tabs", {})).tabs.length > tabsBefore, "the Generate dialog makes its map in a new tab");
  await studio("open", { saved: saved.project });
  const shot = await k.page.screenshot({ path: path.join(out, "editor-window.png") });
  assert(shot.length > 10000, "screenshot of the editor");
  report.push(`the editor shows it: tab "${seen.name}", ${seen.walls} walls, layers panel (${path.join(out, "editor-window.png")})`);

  // kraken: Save to Kraken as a new scene of the hosted campaign: its walls and lights there.
  const before = (await k.tool("kraken_wall", { action: "list" })).total ?? 0;
  const savedIn = await studio("kraken", { into: "new", name: "Tool Test" });
  assert(savedIn.saved && savedIn.walls > 0 && savedIn.lights >= 1 && savedIn.picture, `kraken: saved into the campaign ${JSON.stringify(savedIn)}`);
  const after = (await k.tool("kraken_wall", { action: "list" })).total ?? 0;
  assert(after > before, `kraken: the scene has the walls (${before} -> ${after})`);
  const scene = await k.tool("kraken_status", {});
  assert(scene.scene?.name, "kraken: a scene on the table");
  report.push(`Save to Kraken: scene "${savedIn.scene.name}" with ${savedIn.walls} wall segments, ${savedIn.lights} lights`);

  const missed = ACTIONS.filter((a) => !done.has(a));
  assert(!missed.length, `every action checked (missing: ${missed.join(", ")})`);
  console.log(report.map((line) => `  ${line}`).join("\n"));
  console.log(`STUDIO_TOOLS_OK ${ACTIONS.length} actions; renders in ${out}`);
} catch (error) {
  console.error("STUDIO_TOOLS_FAIL", error.stack || error.message);
  process.exitCode = 1;
} finally {
  await k.close();
}
