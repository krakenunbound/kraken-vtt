// Compares our scene placement with numbers read from a live Foundry v14
// (canvas.dimensions and the background mesh) for "Bandit Camp (Desert)".
import { readFileSync } from "node:fs";
import { backgroundRect, sceneFrame } from "../src/foundry/geometry";
import { inspectZip } from "../src/foundry/importBundle";

const zipPath = process.argv[2] ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Keep on the Borderlands (Foundry).zip`;

// From Foundry: canvas 5320x5320, scene rect at 910,910 sized 3500x3500, texture 7000x7000.
const foundry = { width: 5320, height: 5320, sceneX: 910, sceneY: 910, bgWidth: 3500, bgHeight: 3500, texture: 7000 };
const foundryWalls = [
  [2170, 2800, 2170, 2450],
  [2170, 2450, 2660, 2450],
  [2660, 2450, 2660, 2520],
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const candidate = inspectZip(new Uint8Array(readFileSync(zipPath)))[0];
assert(candidate, "no adventure in the zip");
const scene = candidate.load().scenes.find((item) => item.name === "Bandit Camp (Desert)");
assert(scene, "Bandit Camp (Desert) missing");

const frame = sceneFrame(scene);
assert(frame.worldWidth === foundry.width && frame.worldHeight === foundry.height, `canvas ${frame.worldWidth}x${frame.worldHeight}`);
assert(frame.padX === foundry.sceneX && frame.padY === foundry.sceneY, `scene origin ${frame.padX},${frame.padY}`);

const backdrop = backgroundRect(scene, frame, { width: foundry.texture, height: foundry.texture });
assert(backdrop.left === foundry.sceneX && backdrop.top === foundry.sceneY, `image at ${backdrop.left},${backdrop.top}`);
assert(backdrop.width === foundry.bgWidth && backdrop.height === foundry.bgHeight, `image ${backdrop.width}x${backdrop.height}`);

assert(scene.walls.length === 269, `walls ${scene.walls.length}`);
for (const [x1, y1, x2, y2] of foundryWalls) {
  assert(scene.walls.some((wall) => wall.x1 === x1 && wall.y1 === y1 && wall.x2 === x2 && wall.y2 === y2), `wall ${x1},${y1} ${x2},${y2}`);
}
assert(scene.lights.length === 8, `lights ${scene.lights.length}`);

console.log(`ok ${scene.name}: canvas ${frame.worldWidth}, scene at ${frame.padX}, image ${backdrop.width}x${backdrop.height} — matches Foundry`);
