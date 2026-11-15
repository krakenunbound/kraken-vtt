// The Lighthouse at Gull's End (games/fate): the strand and the lighthouse, made in
// Map Studio with its agent tools and the shipped art only, following
// skills/kraken-map-studio/SKILL.md, from scenes three and four: the surf, the
// Kittiwake's wreck with her last crates, the tidepools, the open strand with the
// wreckers' false beacon fire, the narrow cliff path up; the keeper's cottage (Isolde
// bound to a chair, the silver), the tower floor with its spiral stair and barrels of
// lamp oil, the lamp room upstairs (drawn beside the tower) with the great lamp cold,
// the wind-bent yard and the cliff's edge. A night gale over both. The scenario's
// zones are the map's own areas (Map Studio has no zone outlines); the aspects that
// make moving hard are difficult regions.
//
// node scripts/studio-map-gulls-end.mjs [out folder]   (default games/fate/maps)
// writes strand-studio and lighthouse-studio (.webp, .walls.json) there; renders and
// portable projects go to the system's temp folder (printed). The book keeps its old
// maps until these are reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/fate/maps");
const RENDERS = path.join(tmpdir(), "kraken-gulls-end");

async function paint(step, list) {
  for (const p of list) {
    const made = await step(`paint ${p.art}`, "paint", { art: p.art, path: p.path, size: p.size, softness: 80 });
    if (p.opacity) await step("paint soft", "update", { id: made.id, opacity: p.opacity });
  }
}
const gale = { RainIntensity: 0.6 };

// --- The strand (32 x 20) -------------------------------------------------------------------
async function strand(step) {
  const renders = path.join(RENDERS, "strand-studio");
  mkdirSync(renders, { recursive: true });
  const W = 32, H = 20;
  await step("new map", "new", { name: "The Strand at Gull's End", width: W, height: H, grid: 100, background: "#10141a" });
  await step("sand", "floor", { art: "Beach sand", rect: { x: 0, y: 0, width: 24, height: H }, name: "The strand", room: true });
  const sea = await step("sea", "floor", { art: "Ocean", polygon: [[0, 0], [24.5, 0], [24.5, 4.6], [18, 5.2], [12, 4.8], [6, 5.4], [0, 5.0]], feather: 0.8, name: "The surf" });
  await step("sea dim", "update", { id: sea.id, opacity: 0.95 });
  // The cliff and its path up to the lighthouse.
  const cliff = await step("cliff", "floor", { art: "Cavern limestone", polygon: [[23.8, 0], [32, 0], [32, 20], [23.4, 20], [23.6, 14.6], [24.2, 8], [23.8, 3]], name: "The cliff", room: true });
  await step("cliff dim", "update", { id: cliff.id, opacity: 0.55 });
  await step("cliff path", "wall", { art: "Dirt road", points: [[24, 16.5], [27, 16.5], [27, 12.5], [29, 12.5], [29, 8], [30.5, 8], [30.5, 0.5]] });
  // The tidepools among the rocks: ragged blobs of shallow water.
  const blob = (cx, cy, rx, ry, seed) => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2, r = 0.75 + 0.25 * Math.sin(i * 2.3 + seed);
    return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
  });
  for (const poly of [blob(13.5, 7.3, 1.0, 0.7, 1), blob(17.0, 10.8, 1.5, 1.2, 2), blob(21.0, 7.3, 1.3, 0.7, 3), blob(13.4, 11.3, 0.8, 0.7, 4)]) {
    const pool = await step("tidepool", "floor", { art: "Shallow water", polygon: poly, feather: 0.25, name: "Tidepool", layer: "objects" });
    await step("tidepool dim", "update", { id: pool.id, opacity: 0.8 });
  }
  // The cliff face (it hides the beach from the path above), open where the path starts.
  await step("cliff face", "wall", { art: "Cave wall", points: [[24, 0], [24, 3], [24, 8], [23.5, 14.5]] });
  await step("cliff face south", "wall", { art: "Cave wall", points: [[24, 18], [24, 20]] });
  await step("shore", "wall", { art: "Shoreline", points: [[0, 5.0], [6, 5.3], [12, 4.8], [18, 5.1], [23.8, 4.7]] });
  const fire = { preset: "campfire", color: "#ff8a3d", bright: 20, dim: 45, animation: "flicker", speed: 50, strength: 80 };
  await step("props", "place", {
    items: [
      // The wreck of the Kittiwake: splintered timbers, her last crates.
      { art: "Ship wreck", at: [6.6, 9.5], width: 9, rotation: -4, name: "The Kittiwake's hull" },
      { art: "Crates", at: [5.4, 8.6], width: 1.3, rotation: 15 },
      { art: "Crate, broken", at: [6.6, 9.8], width: 0.8, rotation: 30 },
      { art: "Barrels, washed up", at: [8.6, 9.8], width: 1.4 },
      { art: "Chest", at: [5.2, 10.6], width: 0.7, rotation: -20 },
      { art: "Driftwood", at: [2.4, 12.3], width: 1.8, rotation: 20 },
      { art: "Crate", at: [1.4, 7.4], width: 0.7, rotation: 40 },
      { art: "Barrel, broken", at: [11.4, 13.4], width: 0.7 },
      // The tidepools: rocks, weed, crabs.
      { art: "Boulder", at: [15.0, 8.4], width: 1.4 },
      { art: "Boulder, cracked", at: [19.5, 10.8], width: 1.3 },
      { art: "Rocks", at: [17.8, 7.4], width: 1 },
      { art: "Rocks", at: [21.8, 11.4], width: 1, rotation: 90 },
      { art: "Seaweed", at: [14.0, 9.6], width: 0.9 },
      { art: "Seaweed", at: [22.4, 9.0], width: 0.8, rotation: 120 },
      { art: "Crabs", at: [20.4, 12.4], width: 0.8 },
      { art: "Starfish", at: [13.4, 7.2], width: 0.35 },
      // The strand: the false beacon fire, the stripped cargo, the wreckers' haul.
      { art: "Campfire", at: [18.5, 15.5], width: 1.5, light: fire, name: "Campfire: the wreckers' false beacon" },
      { art: "Crates", at: [6.4, 16.6], width: 1.4, name: "The Kittiwake's cargo, stripped" },
      { art: "Sacks", at: [8.0, 17.0], width: 1.1 },
      { art: "Barrels", at: [9.4, 16.2], width: 1.3 },
      { art: "Rowboat, overturned", at: [3.0, 18.2], width: 2.8, rotation: 10 },
      { art: "Bones", at: [14.4, 17.4], width: 0.5, rotation: 60 },
      { art: "Crate", at: [20.5, 17.5], width: 0.7, rotation: 10 },
      { art: "Fishing net", at: [12.0, 15.0], width: 1.6, rotation: 40, opacity: 0.9 },
      { art: "Seashells", at: [16.4, 13.6], width: 0.5 },
      { art: "Anchor", at: [1.4, 14.6], width: 1, rotation: 70 },
      // The cliff path: loose stones, the wreckers' lookout lantern at the top.
      { art: "Rubble, small", at: [25.4, 16.4], width: 0.8 },
      { art: "Rubble, small", at: [28.4, 8.4], width: 0.7, rotation: 50 },
      { art: "Lantern", at: [30.4, 2.4], width: 0.3, light: { preset: "lantern", color: "#ffc070", bright: 5, dim: 20, animation: "flicker", speed: 30, strength: 50 }, name: "Lookout's lantern" },
      { art: "Grass tuft", at: [30.8, 4.6], width: 0.6 },
      { art: "Boulder", at: [26.2, 6.4], width: 1.6 },
      { art: "Boulder, cracked", at: [30.6, 12.4], width: 1.5 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("gale", "weather", { type: "rain", name: "Howling gale", settings: gale });
  await step("surf", "weather", { type: "ocean", name: "The surf", areas: [{ rect: { x: 0, y: 0, width: 24, height: 5 } }] });
  for (const r of [
    { kind: "difficult", name: "The Surf: Breaking Waves", note: "Waist-deep, freezing. Moving into or out of it: overcome (Athletics, Fair).", rect: { x: 0, y: 0, width: 23.8, height: 6 } },
    { kind: "difficult", name: "The Tidepools: Slippery Rock Pools", note: "Teal zone.", rect: { x: 12, y: 6, width: 11.8, height: 7 } },
    ...[[24, 15, 4, 3], [26, 10, 2, 5], [28, 6, 2, 4], [29, 1, 3, 5]].map(([x, y, width, height]) => ({ kind: "difficult", name: "The Cliff Path: Narrow Ledge", note: "Purple zone, up to the lighthouse.", rect: { x, y, width, height } })),
    { kind: "trap", name: "The False Beacon Fire", note: "Put it out: overcome against Good (+3), or as part of an attack's narration on a success with style. Another ship is saved.", rect: { x: 17.5, y: 14.5, width: 2, height: 2 } },
  ]) await step(`region ${r.name}`, "region", r);
  return finish(step, { name: "strand-studio", out: OUT, renders, plays: [{ name: "strand", token: [15, 16], light: "torch" }, { name: "cliff-path", token: [29, 8], light: "torch" }] });
}

// --- The lighthouse (26 x 18) --------------------------------------------------------------
async function lighthouse(step) {
  const renders = path.join(RENDERS, "lighthouse-studio");
  mkdirSync(renders, { recursive: true });
  const W = 26, H = 18;
  await step("new map", "new", { name: "The Lighthouse at Gull's End", width: W, height: H, grid: 100, background: "#10141a" });
  const grass = await step("yard", "floor", { art: "Dry grass", rect: { x: 0, y: 0, width: 22.5, height: H }, name: "The yard", room: true });
  await step("yard dim", "update", { id: grass.id, opacity: 0.75 });
  const edge = await step("edge", "floor", { art: "Gravel", polygon: [[21.6, 0], [24.4, 0], [24.0, 6], [24.6, 12], [24.2, 18], [21.4, 18]], feather: 0.6, name: "The cliff's edge" });
  await step("edge dim", "update", { id: edge.id, opacity: 0.55 });
  const sea = await step("sea", "floor", { art: "Ocean", polygon: [[24.4, 0], [26, 0], [26, 18], [24.2, 18], [24.6, 12], [24.0, 6]], feather: 0.3, name: "The rocks below" });
  await step("sea dim", "update", { id: sea.id, opacity: 0.8 });
  const path0 = await step("path", "floor", { art: "Dirt", rect: { x: 0, y: 15, width: 22, height: 3 }, feather: 0.6, name: "The path from the cliff" });
  await step("path dim", "update", { id: path0.id, opacity: 0.75 });
  const zones = {
    cottage: { floor: "Wood planks", wall: "Stone wall", opacity: 0.85 },
    tower: { floor: "Flagstone", wall: "Fieldstone wall", opacity: 0.75 },
    lamp: { floor: "Stone tiles", wall: "Stone wall", opacity: 0.75 },
  };
  const areas = [
    { zone: "cottage", x: 2, y: 8, w: 8, h: 6, name: "The keeper's cottage", room: true },
    { zone: "tower", x: 13, y: 6, w: 8, h: 7, name: "The tower floor", room: true },
    { zone: "lamp", x: 14, y: 1, w: 6, h: 3, name: "The lamp room (upstairs)", room: true },
  ];
  const doors = [
    { from: [5, 14], to: [6, 14], art: "Door, wooden" },
    { from: [10, 10], to: [10, 11], art: "Door, wooden" },
    { from: [16, 13], to: [17, 13], art: "Door, old" },
    { from: [13, 9], to: [13, 10], art: "Door, old" },
    { from: [16, 1], to: [18, 1], kind: "window", art: "Window, wide" },
    { from: [14, 2], to: [14, 3], kind: "window", art: "Window" },
    { from: [20, 2], to: [20, 3], kind: "window", art: "Window" },
  ];
  for (const a of areas) {
    const made = await step(a.name, "floor", { art: zones[a.zone].floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: true });
    await step(`${a.name} dim`, "update", { id: made.id, opacity: zones[a.zone].opacity });
  }
  await paint(step, [
    { art: "Mud", path: [[5.5, 14.4], [5.6, 15.4]], size: 0.9, opacity: 0.5 },
    { art: "Mud", path: [[16.5, 13.4], [16.4, 15.2]], size: 0.9, opacity: 0.5 },
    { art: "Dirt", path: [[10.4, 10.5], [12.6, 9.6]], size: 0.9, opacity: 0.5 },
  ]);
  for (const run of wallRuns(areas, doors, { zones })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  for (const d of doors) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, kind: d.kind ?? "door", art: d.art });
  const candle = { preset: "candle", color: "#ffd08a", bright: 5, dim: 15, animation: "flicker", speed: 40, strength: 50 };
  await step("props", "place", {
    items: [
      // The keeper's cottage: Isolde bound to a chair, the bed, the hearth, the silver.
      { art: "Bed, single", at: [2.6, 9.2], width: 0.85 },
      { art: "Table, round", at: [6.4, 10.4], width: 1.3 },
      { art: "Chair", at: [6.4, 11.5], width: 0.55, name: "Isolde Varr, bound to a chair" },
      { art: "Chair, tipped over", at: [7.6, 10.0], width: 0.6, rotation: 60 },
      { art: "Candles", at: [6.3, 10.3], width: 0.4, light: candle },
      { art: "Fireplace", at: [2.45, 12.4], width: 1.5, rotation: 270, light: { preset: "campfire", color: "#ff8a3d", bright: 10, dim: 20, animation: "flicker", speed: 40, strength: 60 } },
      { art: "Chest, open with gold", at: [8.8, 12.9], width: 0.7, name: "The keeper's silver (Sloane's last payment)" },
      { art: "Barrel", at: [9.3, 8.6], width: 0.6 },
      { art: "Rug, round", at: [5.0, 12.4], width: 1.8, opacity: 0.85 },
      { art: "Wardrobe", at: [4.6, 8.55], width: 1.2 },
      // The tower floor: the spiral stair up, barrels of lamp oil, a crate, fallen stone.
      { art: "Semicircle stairs", at: [17.0, 8.4], width: 2.4, name: "Spiral stair up to the lamp room" },
      { art: "Barrels", at: [19.7, 7.2], width: 1.4, name: "Barrels of lamp oil" },
      { art: "Barrel", at: [20.4, 8.6], width: 0.6, name: "Lamp oil" },
      { art: "Crate", at: [14.4, 11.4], width: 0.8, rotation: 10 },
      { art: "Rubble, small", at: [19.0, 11.6], width: 0.9, rotation: 30 },
      { art: "Lantern", at: [13.6, 6.6], width: 0.3, light: { preset: "lantern", color: "#ffc070", bright: 5, dim: 20, animation: "flicker", speed: 25, strength: 40 } },
      // The lamp room: the great lamp and lens, cold.
      { art: "Gas lamp", at: [17.0, 2.5], width: 1.7, name: "Gas lamp: the great lamp and lens (cold)", light: { preset: "custom", color: "#fff2c0", bright: 60, dim: 120, on: false } },
      { art: "Narrow stairs", at: [14.9, 3.3], width: 1.2, rotation: 270, name: "Stair down to the tower floor" },
      { art: "Oil drum", at: [19.4, 3.3], width: 0.6, name: "Lamp oil" },
      // The yard: wind-bent grass and trees; the cliff's edge.
      { art: "Tree, pine", at: [23.0, 2.6], width: 2.6, rotation: 20 },
      { art: "Bush, dead", at: [4.4, 3.4], width: 1.1 },
      { art: "Bush", at: [8.6, 2.6], width: 1 },
      { art: "Grass tuft", at: [11.4, 4.6], width: 0.6 },
      { art: "Grass tuft", at: [2.6, 6.2], width: 0.6 },
      { art: "Boulder", at: [23.0, 10.4], width: 1.4 },
      { art: "Rocks", at: [23.2, 14.2], width: 0.9, rotation: 70 },
      { art: "Boulder, cracked", at: [22.8, 4.6], width: 1.1 },
      { art: "Rocks", at: [23.6, 0.8], width: 0.7 },
      { art: "Rocks", at: [22.6, 6.6], width: 0.8 },
      { art: "Crates", at: [21.0, 16.0], width: 1.3, name: "Sloane's crates for the silver" },
      { art: "Sacks", at: [19.8, 16.6], width: 1 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("gale", "weather", { type: "rain", name: "Howling gale", settings: gale, areas: [{ rect: { x: 0, y: 0, width: 13, height: 7.5 } }, { rect: { x: 0, y: 14.2, width: W, height: 3.8 } }, { rect: { x: 21.2, y: 0, width: 4.8, height: H } }, { rect: { x: 10.2, y: 4.2, width: 2.6, height: 10 } }] });
  await step("rocks", "weather", { type: "ocean", name: "The rocks below", areas: [{ rect: { x: 24.4, y: 0, width: 1.6, height: H } }] });
  await step("edge region", "region", { kind: "pit", name: "The Cliff's Edge: A Long Fall to the Rocks", note: "Red zone.", rect: { x: 24.2, y: 0, width: 1.8, height: H } });
  await step("lens", "region", { kind: "trap", name: "Lighting the lamp", note: "Overcome against Great (+4) (Crafts, Lore; FAE Clever or Careful); +2 with Isolde's help, or a free invoke on Isolde Knows This Lamp. Turn its light on.", rect: { x: 16, y: 1.6, width: 2, height: 1.8 } });
  return finish(step, { name: "lighthouse-studio", out: OUT, renders, plays: [{ name: "yard", token: [8, 16], light: "torch" }, { name: "cottage", token: [5, 11], light: "none" }] });
}

const k = await startKraken({ name: "Gull's End", ruleset: "Ironsworn", port: 47470 });
const step = stepper(k);
try {
  const only = process.env.MAP;
  if (!only || only === "strand") await strand(step);
  if (!only || only === "lighthouse") await lighthouse(step);
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
