// Line of sight against live Foundry: a scene's walls go into a temporary
// Foundry scene, a token stands either side of every door (doors open, then
// closed), and Foundry's token vision is compared with Kraken's
// (shared/map/geometry.mjs sceneSight) on a 20px sample grid. The temporary
// scene is deleted afterwards.
// Needs Foundry running a world with the bridge's debug port (9333).
// node scripts/check-sight-parity.mjs [bundle.zip] [scene name]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import * as geometry from "../shared/map/geometry.mjs";

const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require("fflate");

const bundle = process.argv[2] ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\Cragmaw Castle (Post Foundry).zip`;
const wanted = process.argv[3] ?? "";
const files = unzipSync(new Uint8Array(readFileSync(bundle)), { filter: (file) => file.name.endsWith("bundle.json") && !file.name.includes("__MACOSX") });
const root = JSON.parse(strFromU8(Object.values(files)[0]));
const adventure = root.adventureData ?? root;
const source = (adventure.scenes ?? []).find((scene) => scene.name.includes(wanted) && (scene.walls ?? []).some((wall) => wall.door > 0));
if (!source) throw new Error("No scene with doors in that bundle.");

// Skipped when Foundry is not running with the bridge's debug port.
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333").catch(() => null);
if (!browser) {
  console.log("skip sight-parity: Foundry is not running with the bridge's debug port (9333)");
  process.exit(0);
}
const page = browser.contexts().flatMap((context) => context.pages()).find((item) => item.url().includes("/game"));
if (!page) throw new Error("Foundry is not in a world.");

const samples = await page.evaluate(async (scene) => {
  const created = await Scene.create({
    name: "KRAKEN SIGHT PARITY (temporary)",
    width: scene.width,
    height: scene.height,
    padding: scene.padding,
    grid: scene.grid,
    tokenVision: true,
    walls: scene.walls.map(({ _id, ...wall }) => ({ ...wall, ds: 0, flags: { kraken: { id: _id } } })),
  });
  const previous = canvas.scene?.id;
  try {
    await created.view();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const doors = canvas.walls.placeables.filter((wall) => wall.document.door > 0);
    const size = canvas.grid.size;
    const spots = [];
    for (const wall of doors) {
      const [x1, y1, x2, y2] = wall.document.c;
      const length = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / length;
      const ny = (x2 - x1) / length;
      for (const sign of [1, -1]) spots.push({ x: Math.round((x1 + x2) / 2 + sign * nx * 40), y: Math.round((y1 + y2) / 2 + sign * ny * 40) });
    }
    const [doc] = await created.createEmbeddedDocuments("Token", [
      { name: "Sight probe", x: spots[0].x - size / 2, y: spots[0].y - size / 2, width: 1, height: 1, sight: { enabled: true, range: 1000, visionMode: "basic" }, texture: { src: "icons/svg/mystery-man.svg" } },
    ]);
    canvas.tokens.activate();
    const out = [];
    for (const open of [0, 1]) {
      await created.updateEmbeddedDocuments("Wall", doors.map((wall) => ({ _id: wall.id, ds: open })));
      for (const spot of spots) {
        await doc.update({ x: spot.x - size / 2, y: spot.y - size / 2 }, { animate: false });
        await new Promise((resolve) => setTimeout(resolve, 60));
        const token = canvas.tokens.get(doc.id);
        if (!token.controlled) token.control({ releaseOthers: true });
        canvas.perception.update({ initializeVision: true }, true);
        await new Promise((resolve) => setTimeout(resolve, 40));
        const los = token.vision?.los;
        out.push({ open, x: token.center.x, y: token.center.y, externalRadius: los?.config.externalRadius ?? size / 2, points: los ? Array.from(los.points, Math.round) : [] });
      }
    }
    return { out, rect: canvas.dimensions.sceneRect };
  } finally {
    if (previous && game.scenes.get(previous)) await game.scenes.get(previous).view();
    await created.delete();
  }
}, source);
await browser.close();

const walls = source.walls.map((wall) => ({
  id: wall._id,
  x1: wall.c[0],
  y1: wall.c[1],
  x2: wall.c[2],
  y2: wall.c[3],
  sight: wall.sight ?? 20,
  move: wall.move ?? 20,
  door: wall.door ?? 0,
  ds: 0,
  dir: wall.dir ?? 0,
  threshold: wall.threshold?.sight ?? null,
}));
const scene = { width: source.width, height: source.height, padding: source.padding, grid: source.grid, walls };
const doorIds = walls.filter((wall) => wall.door > 0).map((wall) => wall.id);
const { x: rx, y: ry, width: rw, height: rh } = samples.rect;
let seen = 0;
let missing = 0;
let extra = 0;
for (const sample of samples.out) {
  if (sample.points.length === 0) throw new Error(`Foundry gave no vision at ${sample.x},${sample.y}`);
  const doors = Object.fromEntries(doorIds.map((id) => [id, sample.open]));
  const ours = geometry.sceneSight(scene, sample, doors, sample.externalRadius);
  for (let x = rx; x < rx + rw; x += 20) {
    for (let y = ry; y < ry + rh; y += 20) {
      const theirs = geometry.pointInPolygon(x, y, sample.points);
      const mine = geometry.pointInPolygon(x, y, ours);
      if (theirs) seen += 1;
      if (theirs && !mine) missing += 1;
      if (mine && !theirs) extra += 1;
    }
  }
}
const off = (missing + extra) / Math.max(1, seen);
console.log(`${source.name}: ${samples.out.length} views (doors closed and open), Foundry sees ${seen} sample points; Kraken misses ${missing}, adds ${extra} (${(off * 100).toFixed(2)}%)`);
if (off > 0.01) throw new Error("Line of sight differs from Foundry by more than 1%.");
console.log("SIGHT_PARITY_OK");
