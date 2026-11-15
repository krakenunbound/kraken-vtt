// Harrow-4, the Cut, and the Merry Dividend's midships (games/apeira-astra, "A Lamp
// in the Rock"), made in Map Studio with its agent tools and the shipped art only,
// following skills/kraken-map-studio/SKILL.md, from entries 03 to 06: the bite in
// the asteroid open to space at its mouth, the lamp, the gantry with its cable run
// (four Thread Lice) and Voss's claim beacon clamped to the rail, the crates the
// boarders fight behind, the gantry lock and the Dividend's own airlock; then
// midships: a ship for ten metres and a cave after that, the quarantine drone's
// panel and plate, Brin's cabin to the north, the strong room with the case to the
// south, the crushed drive compartment with the dead skein ring half buried in
// stone. Same rooms and doors as the hand-drawn maps.
//
// node scripts/studio-map-harrow.mjs [out folder]   (default games/apeira-astra/maps)
// writes harrow-cut-studio and harrow-midships-studio (.webp, .walls.json) there;
// renders and the portable projects go to the system's temp folder (printed). The
// book keeps its old maps until these are reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/apeira-astra/maps");
const RENDERS = path.join(tmpdir(), "kraken-harrow");
const screen = (color, bright = 0, dim = 10, speed = 15, strength = 30) => ({ preset: "custom", color, bright, dim, animation: "pulse", speed, strength });
const dead = (art, at, width, extra = {}) => ({ art, at, width, opacity: 0.8, ...extra });

async function base(step, { title, W, H, renders }) {
  mkdirSync(renders, { recursive: true });
  await step("new map", "new", { name: title, width: W, height: H, grid: 100, background: "#050608" });
  const rock = await step("rock", "floor", { art: "Asteroid rock", rect: { x: 0, y: 0, width: W, height: H }, name: "Harrow-4" });
  await step("rock dim", "update", { id: rock.id, opacity: 0.24 });
}
async function floors(step, zones, areas) {
  for (const a of areas) {
    const z = zones[a.zone];
    const made = await step(a.name, "floor", { art: z.floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: !!a.room });
    await step(`${a.name} dim`, "update", { id: made.id, opacity: z.opacity ?? 0.78 });
  }
}
async function paint(step, list) {
  for (const p of list) {
    const made = await step(`paint ${p.art}`, "paint", { art: p.art, path: p.path, size: p.size, softness: 80 });
    await step("paint soft", "update", { id: made.id, opacity: p.opacity });
  }
}

// --- Harrow-4, the Cut (28 x 16) ---------------------------------------------------------
async function cut(step) {
  const renders = path.join(RENDERS, "harrow-cut-studio");
  await base(step, { title: "Harrow-4, the Cut", W: 28, H: 16, renders });
  // The bite: open to space at the west (the mouth), the Dividend's bow fused in at the east.
  const bite = [[0, 4.5], [2.5, 3.5], [5, 2.5], [8, 3], [10.5, 2.5], [13.5, 3], [16, 3.5], [17.5, 4.5], [18, 6], [18, 10], [17.5, 11.5], [15.5, 13], [12, 13.5], [9, 13], [6, 13.5], [3, 12.5], [0, 11.5]];
  const floor = await step("the cut", "floor", { art: "Asteroid rock", polygon: bite, feather: 0.5, name: "The cut", room: true });
  await step("cut bright", "update", { id: floor.id, opacity: 0.75 });
  // The gantry: a grated catwalk from the mouth to the lock.
  await step("gantry", "floor", { art: "Grating", rect: { x: 4.5, y: 7.3, width: 13.5, height: 1.4 }, name: "Gantry", layer: "objects" });
  // The Dividend's hull round its airlock, the miners' gantry lock before it.
  const hull = await step("hull", "floor", { art: "Hull plating", polygon: [[20.4, 4.3], [27.4, 4.3], [27.4, 11.7], [20.4, 11.7], [19.6, 10.4], [19.6, 5.6]], name: "The Merry Dividend's bow" });
  await step("hull dim", "update", { id: hull.id, opacity: 0.6 });
  const zones = { lock: { floor: "Grating", wall: "Bulkhead" }, ship: { floor: "Deck plating", wall: "Hull wall", opacity: 0.72 } };
  const areas = [
    { zone: "lock", x: 18, y: 6, w: 3, h: 4, name: "Gantry lock", room: true },
    { zone: "ship", x: 21, y: 5, w: 5, h: 6, name: "The Dividend's airlock", room: true },
  ];
  await floors(step, zones, areas);
  await paint(step, [
    { art: "Gravel", path: [[3, 6], [6, 5.4]], size: 1.6, opacity: 0.55 },
    { art: "Gravel", path: [[8, 11.6], [12, 12.0]], size: 1.6, opacity: 0.55 },
    { art: "Cave floor", path: [[13.5, 4.2], [16.5, 5.2]], size: 1.8, opacity: 0.6 },
    { art: "Cave floor", path: [[1.5, 9.8], [3.5, 11.6]], size: 1.8, opacity: 0.6 },
    { art: "Cave floor", path: [[7, 3.6], [11, 3.4]], size: 1.4, opacity: 0.5 },
  ]);
  const doors = [
    { from: [18, 7], to: [18, 9], art: "Airlock door", locked: true, name: "Gantry lock (cycle: Mechanics, Standard)" },
    { from: [21, 7], to: [21, 9], art: "Airlock door", locked: true, name: "The Dividend's airlock (forced, pulled shut: Mechanics, Standard)" },
  ];
  for (const run of wallRuns(areas, doors, { zones })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  // The rock walls of the bite, off the grid; the mouth (x 0) open to space.
  await step("cut wall north", "wall", { art: "Cave wall", points: bite.slice(0, 9) });
  await step("cut wall south", "wall", { art: "Cave wall", points: bite.slice(9) });
  for (const d of doors) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, art: d.art, locked: true });
  await step("props", "place", {
    items: [
      // The gantry from the mouth to the lock, its cable run beneath.
      { art: "Pipes, straight", at: [11.3, 8.85], width: 0.3, rotation: 90, name: "Cable run" },
      { art: "Pipes, straight", at: [15.6, 8.85], width: 0.3, rotation: 90, name: "Cable run" },
      { art: "Console", at: [10.2, 6.4], width: 0.75, light: { preset: "custom", color: "#fff1d0", bright: 20, dim: 40 }, name: "Lamp mast console" },
      { art: "Console", at: [15.4, 7.15], width: 0.45, light: screen("#ff3b30", 0, 10, 40, 80), name: "Voss's claim beacon console (her card under it)" },
      // Crates the boarders fight behind; drums; the rock that fell.
      { art: "Cargo containers, stacked", at: [4.6, 5.3], width: 1.9 },
      { art: "Cargo containers, stacked", at: [4.6, 10.9], width: 1.9, rotation: 90 },
      { art: "Cargo container", at: [12.8, 11.4], width: 2.1 },
      { art: "Oil drum", at: [8.4, 4.3], width: 0.7 },
      { art: "Oil drum", at: [9.3, 4.2], width: 0.7 },
      { art: "Oil drum", at: [14.5, 11.6], width: 0.65 },
      { art: "Rubble", at: [14.1, 4.5], width: 1.5, opacity: 0.85 },
      { art: "Boulder, cracked", at: [15.8, 4.6], width: 1.2, opacity: 0.85 },
      { art: "Rocks", at: [13.1, 5.6], width: 0.7, rotation: 40 },
      { art: "Boulder", at: [2.6, 12.0], width: 1.1, opacity: 0.85 },
      { art: "Rocks", at: [7.0, 12.4], width: 0.7, rotation: 110 },
      { art: "Rocks", at: [11.6, 3.3], width: 0.8, rotation: 20 },
      { art: "Rubble, small", at: [16.6, 11.9], width: 0.9, rotation: 80 },
      { art: "Rocks", at: [5.6, 3.4], width: 0.6, rotation: 250 },
      { art: "Rubble, small", at: [9.8, 12.6], width: 0.7, rotation: 10 },
      { art: "Wreckage scatter", at: [17.0, 10.4], width: 0.9, rotation: 70 },
      { art: "Wreckage scatter", at: [1.6, 6.0], width: 0.8, rotation: 200 },
      // The locks.
      { art: "Locker row", at: [19.5, 6.32], width: 1.8 },
      dead("Console", [20.45, 9.5], 0.55),
      { art: "Console", at: [21.6, 5.6], width: 0.6, light: screen("#ffb347", 0, 10, 10, 40), name: "Dividend airlock console" },
      { art: "Locker row", at: [25.68, 8], width: 1.8, rotation: 90 },
      { art: "Scorch mark", at: [21.6, 7.4], width: 0.7, rotation: 20 },
      { art: "Wreckage scatter", at: [23.8, 10.3], width: 0.7, rotation: 300 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("lice", "region", { kind: "trap", name: "Thread Lice (cable run)", note: "Four Thread Lice in the cable run under the gantry: they come out if anyone cuts power, salvages the cable, or fails a Recon task (Standard) and puts a hand in.", rect: { x: 9.5, y: 8.3, width: 7, height: 1.2 } });
  await step("mouth", "region", { kind: "difficult", name: "Loose scree at the mouth", note: "Weak pull toward the rock; loose stone.", rect: { x: 0, y: 4.8, width: 2, height: 6.5 } });
  return finish(step, { name: "harrow-cut-studio", out: OUT, renders, plays: [{ name: "gantry", token: [7, 8], light: "torch" }, { name: "lock", token: [19.5, 8], light: "torch" }] });
}

// --- The Merry Dividend, midships (30 x 16) -------------------------------------------------
async function midships(step) {
  const renders = path.join(RENDERS, "harrow-midships-studio");
  await base(step, { title: "Merry Dividend, Midships", W: 30, H: 16, renders });
  const hull = await step("hull", "floor", { art: "Hull plating", polygon: [[0.4, 5.4], [7.5, 5.4], [7.5, 2.4], [13.6, 2.4], [13.6, 6.6], [14, 6.6], [14, 9.4], [15.6, 9.4], [15.6, 13.6], [8.4, 13.6], [8.4, 10.6], [0.4, 10.6]], name: "Hull (west)" });
  await step("hull dim", "update", { id: hull.id, opacity: 0.45 });
  const zones = {
    lock: { floor: "Deck plating", wall: "Hull wall", opacity: 0.72 },
    hall: { floor: "Deck plating", wall: "Bulkhead", opacity: 0.72 },
    cavehall: { floor: "Deck plating, worn", wall: "Bulkhead, damaged" },
    cabin: { floor: "Deck plating", wall: "Bulkhead", opacity: 0.72 },
    strong: { floor: "Deck plating", wall: "Bulkhead", opacity: 0.72 },
    drive: { floor: "Grating", wall: "Bulkhead, damaged" },
  };
  const areas = [
    { zone: "lock", x: 1, y: 6, w: 4, h: 4, name: "Airlock", room: true },
    { zone: "hall", x: 5, y: 7, w: 9, h: 2, group: "hall", name: "Midships corridor", room: true },
    { zone: "cavehall", x: 14, y: 7, w: 7, h: 2, group: "hall", name: "Corridor, stone through the deck" },
    { zone: "cabin", x: 8, y: 3, w: 5, h: 4, name: "Brin's cabin", room: true },
    { zone: "cabin", x: 14, y: 3, w: 5, h: 4, group: "ops", name: "Crew cabin", room: true },
    { zone: "strong", x: 9, y: 9, w: 6, h: 4, name: "Strong room", room: true },
    { zone: "drive", x: 21, y: 6, w: 7, h: 4, name: "Drive compartment (crushed)", room: true },
  ];
  await floors(step, zones, areas);
  // Stone through the deck: the asteroid's floor over the east end of the corridor and the drive.
  await paint(step, [
    { art: "Asteroid rock", path: [[14.6, 8.2], [17.2, 7.6], [20.6, 8.2]], size: 1.8, opacity: 0.9 },
    { art: "Asteroid rock", path: [[24.6, 6.6], [27.4, 7.4], [26.8, 9.4]], size: 2, opacity: 0.9 },
    { art: "Asteroid rock", path: [[18.2, 3.6], [18.4, 6.4]], size: 1.2, opacity: 0.8 },
  ]);
  const doors = [
    { from: [5, 7], to: [5, 9], art: "Airlock door" },
    { from: [10, 7], to: [11, 7], art: "Hatch", name: "Brin's cabin" },
    { from: [16, 7], to: [17, 7], art: "Hatch" },
    { from: [11, 9], to: [13, 9], art: "Airlock door", locked: true, name: "Strong room (latch: Mechanics or Electronics, Standard)" },
    { from: [21, 7], to: [21, 9], art: "Airlock door", name: "Drive compartment" },
  ];
  for (const run of wallRuns(areas, doors, { zones })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  for (const d of doors) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, art: d.art, ...(d.locked ? { locked: true } : {}) });
  await step("props", "place", {
    items: [
      // Airlock.
      { art: "Locker row", at: [3, 6.32], width: 1.8 },
      dead("Console", [4.4, 9.5], 0.55),
      // Corridor: the quarantine panel and its plate under the frost; then the stone.
      { art: "Console", at: [7.3, 7.35], width: 0.6, light: screen("#ffb347", 0, 15, 20, 50), name: "Quarantine panel console (the plate: Dividend, berth clear)" },
      { art: "Pipes, straight", at: [8.0, 8.78], width: 0.38, rotation: 90 },
      { art: "Boulder", at: [17.9, 7.6], width: 1.1, opacity: 0.9 },
      { art: "Rubble, small", at: [19.4, 8.5], width: 0.8, rotation: 40 },
      { art: "Rocks", at: [15.3, 8.6], width: 0.6, rotation: 160 },
      { art: "Wreckage scatter", at: [14.6, 7.4], width: 0.8, rotation: 20 },
      // Brin's cabin: the bunk, a silver blanket, water, a wrench.
      { art: "Bunk", at: [8.45, 4.1], width: 0.7, name: "Brin's bunk" },
      { art: "Locker row", at: [11.0, 3.32], width: 1.5 },
      { art: "Mess table", at: [12.2, 5.4], width: 0.8, rotation: 90 },
      { art: "Console", at: [12.6, 3.55], width: 0.5, light: screen("#7fd8ff", 0, 10), name: "Cabin console" },
      // Crew cabin: the dead crew's bunks, rock through the corner.
      { art: "Bunk", at: [14.45, 4.1], width: 0.7 },
      { art: "Bunk", at: [16.6, 3.45], width: 0.7, rotation: 90 },
      { art: "Boulder, cracked", at: [18.3, 4.2], width: 1.1, opacity: 0.9 },
      { art: "Rubble, small", at: [18.2, 6.2], width: 0.7 },
      dead("Locker row", [15.5, 6.68], 1.2, { rotation: 180 }),
      // Strong room: lockers, the yard samples, the case.
      { art: "Locker row", at: [9.32, 11], width: 1.8, rotation: 90 },
      { art: "Locker row", at: [12, 12.68], width: 1.8, rotation: 180 },
      { art: "Cargo container", at: [13.6, 11.6], width: 0.9, rotation: 90, name: "The case (a thread spool, violet seam)" },
      { art: "Oil drum", at: [14.4, 9.6], width: 0.6, name: "Yard samples" },
      { art: "Cargo containers, stacked", at: [11.4, 11.3], width: 1.5, name: "Yard samples" },
      { art: "Oil drum", at: [10.0, 9.6], width: 0.6, name: "Yard samples" },
      // The drive compartment: the dead skein ring half buried, the crush.
      { art: "Reactor core", at: [23.9, 8], width: 2.6, opacity: 0.7, name: "Skein ring (dead, half buried)" },
      { art: "Boulder", at: [25.4, 7.0], width: 1.5 },
      { art: "Boulder, cracked", at: [26.9, 8.7], width: 1.4 },
      { art: "Rubble", at: [25.3, 9.1], width: 1.3 },
      { art: "Rocks", at: [27.3, 6.6], width: 0.8 },
      dead("Console", [21.6, 9.4], 0.55),
      { art: "Blood stain", at: [22.4, 6.8], width: 0.8, rotation: 50, opacity: 0.7 },
      { art: "Wreckage scatter", at: [22.6, 9.2], width: 0.8, rotation: 120 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("drone", "region", { kind: "trap", name: "Quarantine drone", note: "Hangs mid-hall, amber ring lit: 'this compartment is unclean.' Fires on anything that keeps coming. 'Dividend, berth clear' (the plate by the panel), or Electronics (Hard) at the panel, docks it.", rect: { x: 8.5, y: 7, width: 2.5, height: 2 } });
  await step("ring", "region", { kind: "trap", name: "Skein ring", note: "Powering the ring: a Desperate Engineering task that fails into a radiation flush (a Grit check each turn for anyone who stays, 1d6 on a failure) until the compartment is left alone.", rect: { x: 22.2, y: 6.3, width: 3.5, height: 3.4 } });
  await step("crush", "region", { kind: "difficult", name: "Stone through the deck", note: "Rock and buckled plating.", rect: { x: 17, y: 7, width: 4, height: 2 } });
  return finish(step, { name: "harrow-midships-studio", out: OUT, renders, plays: [{ name: "corridor", token: [6, 8], light: "torch" }, { name: "drive", token: [22, 8], light: "torch" }] });
}

const k = await startKraken({ name: "A Lamp in the Rock", port: 47465 });
const step = stepper(k);
try {
  const only = process.env.MAP;
  if (!only || only === "cut") await cut(step);
  if (!only || only === "midships") { await midships(step); }
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
