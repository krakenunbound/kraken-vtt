// The Silent Hulk (games/ironsworn, the Starforged starter): the derelict colony
// transport Meridian Vow's habitation ring, made in Map Studio with its agent tools
// and the shipped art only (Kraken Map Art's sci-fi set), following
// skills/kraken-map-studio/SKILL.md, from "03 The Meridian Vow": the airlock (west)
// with a dead console, the ready room (lockers, old blood), the spine corridor,
// the cryo bay (five pods: three dead, two still cold and working), the crew
// quarters, the cargo hold (sealed crates of colony seed-stock), the reactor room
// (cold but not quite dead) and the bridge (east) where the beacon runs and the
// guardian drone waits. Same rooms and doors as the hand-drawn silent-hulk map.
//
// node scripts/studio-map-silent-hulk.mjs [out folder]   (default games/ironsworn/maps)
// writes silent-hulk-studio.webp and .walls.json there; renders and the portable
// project go to the system's temp folder (printed). The book keeps its old map
// until this one is reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/ironsworn/maps");
const RENDERS = path.join(tmpdir(), "kraken-silent-hulk");
mkdirSync(RENDERS, { recursive: true });
const W = 32, H = 18;

const ZONES = {
  airlock: { floor: "Deck plating, worn", wall: "Hull wall" },
  ready: { floor: "Deck plating", wall: "Bulkhead" },
  spine: { floor: "Grating", wall: "Bulkhead" },
  cryo: { floor: "Deck plating", wall: "Bulkhead" },
  quarters: { floor: "Deck plating, worn", wall: "Bulkhead" },
  cargo: { floor: "Deck plating, worn", wall: "Bulkhead" },
  reactor: { floor: "Grating", wall: "Bulkhead, damaged" },
  bridge: { floor: "Deck plating", wall: "Bulkhead" },
};
// The hand-drawn map's rooms; each side room joins the spine through a one-square neck.
const AREAS = [
  { zone: "airlock", x: 1, y: 8, w: 3, h: 2, name: "Airlock" },
  { zone: "ready", x: 4, y: 6, w: 5, h: 6, name: "Ready room" },
  { zone: "spine", x: 9, y: 8, w: 13, h: 2, name: "Spine corridor" },
  { zone: "cryo", x: 10, y: 2, w: 5, h: 5, name: "Cryo bay" },
  { zone: "cryo", x: 12, y: 7, w: 1, h: 1, group: "spine", name: "Cryo bay neck" },
  { zone: "quarters", x: 16, y: 2, w: 5, h: 5, name: "Crew quarters" },
  { zone: "quarters", x: 18, y: 7, w: 1, h: 1, group: "spine", name: "Quarters neck" },
  { zone: "cargo", x: 10, y: 11, w: 5, h: 5, name: "Cargo hold" },
  { zone: "cargo", x: 12, y: 10, w: 1, h: 1, group: "spine", name: "Cargo neck" },
  { zone: "reactor", x: 16, y: 11, w: 5, h: 5, name: "Reactor room" },
  { zone: "reactor", x: 18, y: 10, w: 1, h: 1, group: "spine", name: "Reactor neck" },
  { zone: "bridge", x: 22, y: 5, w: 8, h: 8, name: "Bridge" },
];
const ROOMS = new Set(["Airlock", "Ready room", "Spine corridor", "Cryo bay", "Crew quarters", "Cargo hold", "Reactor room", "Bridge"]);
const DOORS = [
  { from: [1, 8], to: [1, 10], art: "Airlock door", locked: true, name: "Outer airlock" },
  { from: [4, 8], to: [4, 10], art: "Airlock door", name: "Inner airlock" },
  { from: [9, 8], to: [9, 9], art: "Hatch" },
  { from: [12, 7], to: [13, 7], art: "Hatch" },
  { from: [18, 7], to: [19, 7], art: "Hatch" },
  { from: [12, 11], to: [13, 11], art: "Hatch", locked: true, name: "Cargo hold (sealed)" },
  { from: [18, 11], to: [19, 11], art: "Hatch" },
  { from: [22, 8], to: [22, 10], art: "Airlock door", name: "Bridge" },
];
// The ship's hull round the rooms (the structure between them), space beyond.
const HULL = [[0.55, 7.3], [3.4, 5.3], [9.4, 5.3], [9.4, 1.3], [21.6, 1.3], [21.6, 4.3], [28.6, 4.3], [31.5, 9], [28.6, 13.7], [21.6, 13.7], [21.6, 16.7], [9.4, 16.7], [9.4, 12.7], [3.4, 12.7], [0.55, 10.7]];

const k = await startKraken({ name: "The Silent Hulk", port: 47463 });
const step = stepper(k);
try {
  await step("new map", "new", { name: "The Meridian Vow", width: W, height: H, grid: 100, background: "#06080c" });
  const hull = await step("hull", "floor", { art: "Hull plating", polygon: HULL, name: "Hull" });
  await step("hull dim", "update", { id: hull.id, opacity: 0.45 });
  for (const a of AREAS) {
    const made = await step(a.name, "floor", { art: ZONES[a.zone].floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: ROOMS.has(a.name) });
    await step(`${a.name} dim`, "update", { id: made.id, opacity: ZONES[a.zone].floor === "Deck plating" ? 0.72 : 0.85 });
  }
  // Wear: a worn patch where the bridge corner collapsed.
  const worn = await step("bridge wear", "paint", { art: "Deck plating, worn", path: [[22.9, 11.7], [24.6, 12.3]], size: 1.4, softness: 80 });
  await step("bridge wear soft", "update", { id: worn.id, opacity: 0.6 });

  for (const run of wallRuns(AREAS, DOORS, { zones: ZONES })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  for (const d of DOORS) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, art: d.art, ...(d.locked ? { locked: true } : {}) });

  const screen = (color, bright = 5, dim = 10) => ({ preset: "custom", color, bright, dim, animation: "pulse", speed: 15, strength: 30 });
  // Airlock: the dead console, frost-burnt debris blown in when the outer door last cycled.
  await step("airlock props", "place", {
    items: [
      { art: "Console", at: [3.45, 8.5], width: 0.8, rotation: 180, opacity: 0.75, name: "Dead console" },
      { art: "Wreckage scatter", at: [2.1, 9.6], width: 0.9, rotation: 15 },
      { art: "Scorch mark", at: [1.6, 8.6], width: 0.7, rotation: 40 },
    ],
  });
  // Ready room: suit lockers on both walls, the briefing table, old blood.
  await step("ready room props", "place", {
    items: [
      { art: "Locker row", at: [6.5, 6.32], width: 2 },
      { art: "Locker row", at: [6.5, 11.68], width: 2, rotation: 180 },
      { art: "Locker row", at: [8.68, 7.0], width: 1.4, rotation: 90 },
      { art: "Mess table", at: [6.3, 9.0], width: 0.95, rotation: 90 },
      { art: "Blood stain", at: [5.4, 10.5], width: 1.3, rotation: 20, opacity: 0.7 },
      { art: "Blood stain", at: [7.6, 10.9], width: 0.7, rotation: 200, opacity: 0.7 },
      { art: "Oil drum", at: [8.45, 11.3], width: 0.7 },
      { art: "Wreckage scatter", at: [4.9, 6.9], width: 0.8, rotation: -30 },
    ],
  });
  // Spine corridor: conduits along the walls, a torn panel, scorching.
  await step("spine props", "place", {
    items: [
      { art: "Pipes, straight", at: [10.55, 9.78], width: 0.42, rotation: 90 },
      { art: "Pipes, straight", at: [15.6, 9.78], width: 0.42, rotation: 90 },
      { art: "Pipes, straight", at: [20.5, 9.78], width: 0.42, rotation: 90 },
      { art: "Pipes, straight", at: [15.6, 8.22], width: 0.42, rotation: 90 },
      { art: "Wreckage scatter", at: [17.0, 8.9], width: 0.9, rotation: 160 },
      { art: "Scorch mark", at: [21.2, 9.0], width: 0.8, rotation: 75, opacity: 0.85 },
    ],
  });
  // Cryo bay: five pods, three dead and two still cold and working; their life-support consoles.
  await step("cryo props", "place", {
    items: [
      { art: "Cryo pod, dead", at: [10.65, 2.65], width: 1.05 },
      { art: "Cryo pod", at: [12.5, 2.65], width: 1.05, name: "Working pod (a colonist asleep)" },
      { art: "Cryo pod, dead", at: [14.35, 2.65], width: 1.05 },
      { art: "Cryo pod, dead", at: [10.65, 5.2], width: 1.05, rotation: 90 },
      { art: "Cryo pod", at: [14.35, 5.2], width: 1.05, rotation: 90, name: "Working pod (a colonist asleep)" },
      { art: "Console", at: [12.5, 3.75], width: 0.6, light: screen("#7fd8ff", 5, 15) },
      { art: "Console", at: [14.4, 6.45], width: 0.6, light: screen("#7fd8ff", 5, 10) },
      { art: "Pipes, straight", at: [10.22, 4.0], width: 0.32 },
      { art: "Wreckage scatter", at: [11.4, 6.3], width: 0.7, rotation: 200 },
    ],
  });
  // Crew quarters: bunks along the walls, the mess table, lockers.
  await step("quarters props", "place", {
    items: [
      { art: "Bunk", at: [16.45, 3.1], width: 0.7 },
      { art: "Bunk", at: [20.55, 3.1], width: 0.7 },
      { art: "Bunk", at: [16.45, 5.6], width: 0.7 },
      { art: "Bunk", at: [20.55, 5.6], width: 0.7, rotation: 180 },
      { art: "Mess table", at: [18.5, 4.1], width: 0.95, rotation: 90 },
      { art: "Locker row", at: [18.5, 2.3], width: 1.6 },
      { art: "Wreckage scatter", at: [19.4, 6.2], width: 0.6, rotation: 40 },
    ],
  });
  // Cargo hold: sealed containers of colony seed-stock, drums.
  await step("cargo props", "place", {
    items: [
      { art: "Cargo containers, stacked", at: [11.05, 12.1], width: 1.85, name: "Seed-stock (sealed)" },
      { art: "Cargo container", at: [14.25, 13.9], width: 1.9, rotation: 90, name: "Seed-stock (sealed)" },
      { art: "Cargo container", at: [11.6, 15.45], width: 2, name: "Seed-stock (sealed)" },
      { art: "Oil drum", at: [14.4, 11.65], width: 0.7 },
      { art: "Oil drum", at: [10.55, 14.2], width: 0.65 },
      { art: "Wreckage scatter", at: [13.3, 12.3], width: 0.6, rotation: 120 },
    ],
  });
  // Reactor room: the reactor, cold but not quite dead; its monitoring consoles; scorched deck.
  await step("reactor props", "place", {
    items: [
      { art: "Reactor core", at: [18.5, 13.75], width: 2.9, light: { preset: "custom", color: "#6fb4ff", bright: 5, dim: 20, animation: "pulse", speed: 8, strength: 50 } },
      { art: "Console", at: [16.55, 11.6], width: 0.7, opacity: 0.85 },
      { art: "Console", at: [20.45, 15.4], width: 0.7, light: screen("#ffb347", 0, 10) },
      { art: "Pipes, straight", at: [20.78, 12.9], width: 0.4 },
      { art: "Pipes, straight", at: [16.22, 13.9], width: 0.4 },
      { art: "Scorch mark", at: [17.2, 15.3], width: 1.1, rotation: 10 },
      { art: "Wreckage scatter", at: [20.1, 11.5], width: 0.7, rotation: 300 },
    ],
  });
  // Bridge: the console bank at the nose, the captain's chair and her remains, the tactical table,
  // the beacon console still pulsing, the collapsed corner.
  await step("bridge props", "place", {
    items: [
      { art: "Bridge console row", at: [28.85, 9], width: 2.6, rotation: 90, light: screen("#5fe0ff", 5, 15) },
      { art: "Captain's chair", at: [26.4, 9], width: 0.95, rotation: 270 },
      { art: "Skeleton", at: [26.95, 10.15], width: 0.6, rotation: 120, name: "The captain" },
      { art: "Console", at: [24.6, 9], width: 1.2, light: screen("#5fe0ff", 0, 10), name: "Tactical console" },
      { art: "Console", at: [29.35, 5.7], width: 0.85, light: { preset: "custom", color: "#ff3b30", bright: 5, dim: 15, animation: "pulse", speed: 30, strength: 80 }, name: "Beacon console" },
      { art: "Console", at: [22.7, 5.7], width: 0.75, opacity: 0.85 },
      { art: "Bridge console row", at: [26.0, 5.75], width: 2.4, light: screen("#5fe0ff", 0, 10) },
      { art: "Bridge console row", at: [27.2, 12.25], width: 2.4, rotation: 180, opacity: 0.8 },
      { art: "Scorch mark", at: [23.9, 11.6], width: 1, rotation: 30 },
      { art: "Wreckage scatter", at: [23.3, 11.9], width: 1.2, rotation: 20 },
      { art: "Wreckage scatter", at: [24.6, 12.3], width: 0.9, rotation: 190 },
    ],
  });

  // A dead ship: dark but for its screens and the reactor's glow; vapour off the reactor.
  await step("ambient", "ambient", { preset: "night" });
  await step("coolant vapour", "weather", { type: "myst", name: "Coolant vapour", settings: { MystFade: 0.35, MystSpeed: 0.2 }, areas: [{ rect: { x: 16, y: 11, width: 5, height: 5 } }] });
  await step("drone", "region", { kind: "trap", name: "Guardian drone", note: "The bridge's guardian drone (a Servitor or an Enforcer, Starforged Foes) wakes when anyone comes through the blast door.", rect: { x: 22, y: 7.5, width: 2, height: 3 } });
  await step("collapse", "region", { kind: "difficult", name: "Collapsed deck", note: "Torn plating and debris.", rect: { x: 22.3, y: 11.3, width: 3, height: 1.5 } });

  const check = await finish(step, {
    name: "silent-hulk-studio",
    out: OUT,
    renders: RENDERS,
    plays: [
      { name: "airlock", token: [2.5, 9], light: "torch" },
      { name: "spine", token: [15.5, 9], light: "none" },
    ],
  });
  if (check.notes?.length) console.log("NOTES REMAIN");
  await step("save project", "save", {});
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
