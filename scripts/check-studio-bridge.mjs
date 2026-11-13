// Map Studio and Kraken's images (electron/studio/krakenBridge.cjs): an
// image's master made into a Map Studio project and saved back gives the same
// walls (every kind, doors open and locked, one-sided), lights and weather;
// the project passes Map Studio's own checks; a project painting art is told
// apart from one that only draws walls.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bridge = require("../electron/studio/krakenBridge.cjs");
const assets = require("../electron/studio/assets.cjs");
const sharp = require("sharp");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
// Map Studio's library in a temp folder, with the map's picture in it.
await assets.configure({ dataDir: mkdtempSync(path.join(tmpdir(), "kraken-studio-bridge-")) });
await assets.whenReady();
const picture = await assets.imageImport(await sharp({ create: { width: 1400, height: 1000, channels: 3, background: "#334433" } }).png().toBuffer(), "Yard");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const scene = { id: "fg-test-yard", name: "Yard", width: 1400, height: 1000, padding: 0.25, grid: { size: 70, distance: 5 } };
const origin = bridge.originOf(scene);
assert(origin.x === 350 && origin.y === 280, `the grid's origin with padding (${JSON.stringify(origin)})`);
const kinds = ["wall", "terrain", "door", "secret", "window", "invisible", "illusion", "shadow"];
const walls = kinds.map((kind, i) => ({ id: `w${i}`, x1: origin.x + 10 * i, y1: origin.y + 5, x2: origin.x + 10 * i + 40, y2: origin.y + 60, kind, door: kind === "door" ? 1 : kind === "secret" ? 2 : 0, ds: kind === "door" ? 1 : kind === "secret" ? 2 : 0, dir: i === 0 ? 2 : 0 }));
const lights = [{ id: "l1", x: origin.x + 100, y: origin.y + 200, bright: 20, dim: 40, color: "#FFAA33", on: true, animation: "flicker", speed: 0.5 }];
const fx = [{ id: "f1", name: "Rain", type: "rain", intensity: 0.4, speed: 0.6, direction: 90, mask: { use: true, mode: "inside", polygons: [[origin.x, origin.y, origin.x + 200, origin.y, origin.x + 200, origin.y + 200]] }, shown: true }];
const view = { scene, walls, lights, fx, studio: null };
const project = bridge.projectFor({ view, pictureId: picture.id, size: { width: picture.width, height: picture.height }, name: "Yard" });
assert(project.walls.length === kinds.length && project.walls[2].type === "door" && project.walls[2].flags.includes("open"), "walls as Map Studio's");
assert(project.walls[3].type === "secret" && project.walls[3].flags.includes("locked"), "a locked secret door");
assert(project.walls[0].flags.includes("single_sided") && project.walls[0].flags.includes("counterclockwise"), "a one-sided wall");
assert(project.walls[0].points[0] === 0 && project.walls[0].points[1] === 5, "points from the picture's corner");
// Map Studio's own checks accept it (with the picture known).
const checked = assets.validateProject(JSON.parse(JSON.stringify(project)));
assert(checked.walls.length === kinds.length, "Map Studio accepts the project");
const back = bridge.masterFrom(project, scene);
for (const [i, wall] of walls.entries()) {
  const got = back.walls[i];
  for (const key of ["x1", "y1", "x2", "y2", "kind", "door", "ds", "dir"]) assert(got[key] === wall[key], `wall ${wall.kind} ${key}: ${got[key]} vs ${wall[key]}`);
}
assert(back.lights[0].x === lights[0].x && back.lights[0].bright === 20 && back.lights[0].dim === 40 && back.lights[0].animation === "flicker", "the light comes back");
assert(back.fx[0].type === "rain" && Math.abs(back.fx[0].intensity - 0.4) < 1e-9 && back.fx[0].mask.use, "the rain comes back masked");
assert(!bridge.paintsArt(project), "walls alone paint no art");
assert(bridge.paintsArt({ ...project, objects: [...project.objects, { id: "stamp", assetId: "x", x: 5, y: 5, width: 10, height: 10 }] }), "a stamp paints art");
// Saved once: Map Studio's project is kept, its walls the master's.
const kept = bridge.projectFor({ view: { ...view, walls: walls.slice(0, 2), studio: { project: { ...project, name: "Kept", regions: [{ id: "r", kind: "trap", name: "Trap", points: [0, 0, 10, 0, 10, 10] }] } } }, pictureId: picture.id, size: { width: 1400, height: 1000 } });
assert(kept.name === "Kept" && kept.regions.length === 1 && kept.walls.length === 2, "a saved project opens as it was, with the master's walls");
// The painted picture in place of the book's, wherever the image is opened (the map bundle Kraken builds).
const { fgModuleBundle } = require("../electron/importers/fgMaps.cjs");
const { unzipSync, strFromU8 } = require("fflate");
const paintedBytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#aa3333" } }).webp().toBuffer();
const book = path.join("games", "modules", "The Empty Watchtower");
const plainBundle = fgModuleBundle(book, { only: ["The Watchtower Yard"], all: true });
const yardId = plainBundle.scenes[0].id;
const paintedBundle = fgModuleBundle(book, { only: ["The Watchtower Yard"], all: true, picture: (id) => (id === yardId ? paintedBytes : null) });
const files = unzipSync(new Uint8Array(paintedBundle.bytes));
const sceneJson = JSON.parse(strFromU8(files["bundle.json"])).adventureData.scenes[0];
assert(sceneJson.background.src.endsWith(".studio.webp") && files[sceneJson.background.src]?.length === paintedBytes.length, `the bundle's picture is the painted one (${sceneJson.background.src})`);
assert(plainBundle.scenes[0].walls === paintedBundle.scenes[0].walls, "the same map otherwise");
console.log(`ok studio bridge: painted picture used in the image's bundle; ${kinds.length} wall kinds, doors open/locked, one-sided walls, a light and masked rain round-trip; Map Studio accepts the project; saved projects kept`);
