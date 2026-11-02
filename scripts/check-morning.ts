import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { backgroundRect, gridStops, preferredCandidateIndex, preferredSceneIndex, sceneFrame } from "../src/foundry/geometry";
import { inspectZip } from "../src/foundry/importBundle";
import { countCategories, readWalls } from "../src/foundry/sceneObjects";

const zipPath = process.argv[2] ?? String.raw`G:\TTRPG Books (pdf)\Professional Maps\Troll Trouble (prepared Foundry).zip`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const bytes = new Uint8Array(readFileSync(zipPath));
const candidates = inspectZip(bytes);
assert(candidates.length === 3, `expected 3 adventures, got ${candidates.length}: ${candidates.map((item) => item.name).join(", ")}`);

const morningIndex = preferredCandidateIndex(candidates);
assert(candidates[morningIndex]?.name === "Troll's Pot Morning", `preferred adventure was ${candidates[morningIndex]?.name}`);

const morning = candidates[morningIndex].load();
const sceneIndex = preferredSceneIndex(morning.scenes);
const scene = morning.scenes[sceneIndex];
assert(scene?.name === "Troll's Pot Morning", `preferred scene was ${scene?.name}`);
assert(scene.width === 9300 && scene.height === 7500, `scene size ${scene.width}x${scene.height}`);
assert(scene.padding === 0.25, `padding ${scene.padding}`);
assert(scene.grid.type === 1 && scene.grid.size === 150, `grid ${scene.grid.type} ${scene.grid.size}`);
assert(scene.grid.distance === 5 && scene.grid.units === "ft", `grid measure ${scene.grid.distance} ${scene.grid.units}`);
assert(scene.grid.color === "#000000" && scene.grid.alpha === 0.2, "grid color");
assert(scene.backgroundColor === "#999999", `background ${scene.backgroundColor}`);
assert(scene.backgroundSrc === "asset_0.jpg", `background src ${scene.backgroundSrc}`);
assert(scene.image?.byteLength === 12258921, `image bytes ${scene.image?.byteLength}`);
const wallCounts = countCategories(scene.walls);
assert(scene.walls.length === 141, `walls ${scene.walls.length}`);
assert(wallCounts.normal === 20, `normal ${wallCounts.normal}`);
assert(wallCounts.invisible === 56, `see-through ${wallCounts.invisible}`);
assert(wallCounts.terrain === 51, `terrain ${wallCounts.terrain}`);
assert(wallCounts.ethereal === 14, `los ${wallCounts.ethereal}`);
assert(wallCounts.window === 0 && wallCounts.door === 0 && wallCounts.secret === 0, "morning door/window counts");
assert(scene.tokens.length === 0 && scene.markers.length === 0, "morning has no creatures or notes");
assert(scene.walls.some((wall) => wall.x1 === 2400 && wall.y1 === 1950 && wall.category === "normal"), "wall coordinates");

const night = candidates.find((item) => item.name === "Troll's Pot Night");
assert(night, "night adventure missing");
const nightScene = night.load().scenes.find((item) => item.name === "Troll's Pot Night");
assert(nightScene?.lights.length === 2, `night lights ${nightScene?.lights.length}`);
assert((nightScene?.lights[0]?.brightPx ?? 0) > 0 && (nightScene?.lights[0]?.dimPx ?? 0) > nightScene.lights[0].brightPx, "light radii");

const frame = sceneFrame(scene);
// Foundry rounds padding up to whole squares: ceil(2325 / 150) * 150 and ceil(1875 / 150) * 150.
assert(frame.padX === 2400 && frame.padY === 1950, `pad ${frame.padX},${frame.padY}`);
assert(frame.worldWidth === 14100 && frame.worldHeight === 11400, `world ${frame.worldWidth}x${frame.worldHeight}`);
const backdrop = backgroundRect(scene, frame, { width: 9300, height: 7500 });
assert(backdrop.left === 2400 && backdrop.top === 1950, `image at ${backdrop.left},${backdrop.top}`);
assert(backdrop.width === 9300 && backdrop.height === 7500, `image ${backdrop.width}x${backdrop.height}`);
// A smaller texture is stretched to the scene rectangle, as Foundry's default "fill" does.
const stretched = backgroundRect(scene, frame, { width: 4650, height: 3750 });
assert(stretched.width === 9300 && stretched.height === 7500, `stretched ${stretched.width}x${stretched.height}`);
// The map's corner wall sits exactly on the image's top-left corner.
assert(scene.walls.some((wall) => wall.x1 === backdrop.left && wall.y1 === backdrop.top), "corner wall on image corner");

const vertical = gridStops(scene.width, scene.grid.size);
const horizontal = gridStops(scene.height, scene.grid.size);
assert(vertical.length === 63 && vertical[0] === 0 && vertical.at(-1) === 9300, "vertical grid");
assert(horizontal.length === 51 && horizontal.at(-1) === 7500, "horizontal grid");

const empty = morning.scenes.find((item) => item.name.includes("Empty"));
assert(empty?.backgroundSrc === "asset_2.jpg", `empty src ${empty?.backgroundSrc}`);
assert(empty?.image?.byteLength === 12121370, `empty bytes ${empty?.image?.byteLength}`);

const outer = unzipSync(bytes);
const innerName = Object.keys(outer).find((name) => /morning/i.test(name));
assert(innerName, "inner morning zip missing");
const direct = inspectZip(outer[innerName]);
assert(direct.length === 1 && direct[0]?.name === "Troll's Pot Morning", "direct bundle import");

const hommletPath = String.raw`G:\TTRPG Books (pdf)\Professional Maps\The Village of Hommlet (Foundry).zip`;
const hommletFiles = unzipSync(new Uint8Array(readFileSync(hommletPath)), {
  filter: (file) => file.name.endsWith("bundle.json"),
});
const hommletJson = JSON.parse(strFromU8(Object.values(hommletFiles)[0] ?? new Uint8Array())) as {
  adventureData?: { scenes?: { walls?: unknown }[] };
};
let windows = 0;
let doors = 0;
let secrets = 0;
for (const hommletScene of hommletJson.adventureData?.scenes ?? []) {
  const counts = countCategories(readWalls(hommletScene.walls));
  windows += counts.window;
  doors += counts.door;
  secrets += counts.secret;
}
assert(windows === 480, `hommlet windows ${windows}`);
assert(doors === 273, `hommlet doors ${doors}`);
assert(secrets === 26, `hommlet secret doors ${secrets}`);

console.log(`ok ${morning.name} / ${scene.name} ${scene.width}x${scene.height} grid ${scene.grid.size}`);
