// The Brine Street Counting-house (games/forged-dark, "The Brine Street Job"), made in
// Map Studio with its agent tools and the shipped art only, following
// skills/kraken-map-studio/SKILL.md, from "02 Brine Street Counting-house": the dock
// (cobbles, barrels, a mooring for a barge, lamps burning low, one door into the
// loading hall), the loading hall (crates of lamp-oil and candles, barrels, a
// lantern on a hook, two guards dicing), the guard room (bunks, a brazier, the
// alarm bell's rope), the clerks' office (desks, ink, the day ledgers, the secret
// door behind a bookcase), the counting room (the master's desk, the stairs up,
// the strongbox) and the vault behind its iron door (the true ledger among crates
// of fine wax). Same rooms and doors as the hand-drawn map, with the canal added
// south of the dock.
//
// node scripts/studio-map-counting-house.mjs [out folder]   (default games/forged-dark/maps)
// writes counting-house-studio.webp and .walls.json there; renders and the portable
// project go to the system's temp folder (printed). The book keeps its old map
// until this one is reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/forged-dark/maps");
const RENDERS = path.join(tmpdir(), "kraken-counting-house");
mkdirSync(RENDERS, { recursive: true });
const W = 26, H = 23;

const OUTER = "Soot brick wall";
const ZONES = {
  guard: { floor: "Flagstone", wall: "Timber and plaster wall", outer: OUTER, opacity: 0.7 },
  clerks: { floor: "Parquet", wall: "Timber and plaster wall", outer: OUTER, opacity: 0.72 },
  counting: { floor: "Worn oak", wall: "Timber and plaster wall", outer: OUTER, opacity: 0.85 },
  hall: { floor: "Warehouse floor", wall: "Timber and plaster wall", outer: OUTER, opacity: 0.85 },
  corridor: { floor: "Flagstone, cracked", wall: "Timber and plaster wall", outer: OUTER, opacity: 0.7 },
  vault: { floor: "Stone tiles", wall: "Brick wall", outer: OUTER, opacity: 0.6 },
  dock: { floor: "Wet cobbles", wall: null },
};
const AREAS = [
  { zone: "guard", x: 2, y: 2, w: 5, h: 5, name: "Guard room", room: true },
  { zone: "hall", x: 4, y: 7, w: 1, h: 2, name: "Guard room passage" },
  { zone: "clerks", x: 8, y: 2, w: 8, h: 5, name: "Clerks' office", room: true },
  { zone: "clerks", x: 10, y: 7, w: 1, h: 2, name: "Clerks' passage" },
  { zone: "counting", x: 16, y: 2, w: 8, h: 6, name: "Counting room", room: true },
  { zone: "corridor", x: 19, y: 8, w: 1, h: 2, name: "Counting room passage" },
  { zone: "hall", x: 2, y: 9, w: 11, h: 6, name: "Loading hall", room: true },
  { zone: "hall", x: 13, y: 10, w: 1, h: 1, name: "Hall passage" },
  { zone: "corridor", x: 14, y: 10, w: 10, h: 2, name: "Corridor", room: true },
  { zone: "corridor", x: 20, y: 12, w: 1, h: 1, name: "Vault passage" },
  { zone: "vault", x: 17, y: 13, w: 7, h: 2, name: "The vault", room: true },
];
const DOORS = [
  { from: [4, 7], to: [5, 7], art: "Door, wooden" },
  { from: [10, 9], to: [11, 9], art: "Door, wooden" },
  { from: [16, 4], to: [16, 5], kind: "secret", name: "Secret door behind the bookcase" },
  { from: [19, 8], to: [20, 8], art: "Door, old" },
  { from: [14, 10], to: [14, 11], art: "Door, wooden" },
  { from: [20, 13], to: [21, 13], art: "Door, iron", locked: true, name: "The vault door (Tier II lock)" },
  { from: [6, 15], to: [7, 15], art: "Door, wooden", locked: true, name: "Dock door" },
];

const k = await startKraken({ name: "The Brine Street Job", port: 47466 });
const step = stepper(k);
try {
  await step("new map", "new", { name: "Brine Street Counting-house", width: W, height: H, grid: 100, background: "#100e0c" });
  // The canal, the quay and the dock; then the rooms.
  const canal = await step("canal", "floor", { art: "Deep water", rect: { x: 0, y: 19, width: W, height: H - 19 }, name: "The canal" });
  await step("canal dark", "update", { id: canal.id, opacity: 0.7 });
  const mass = await step("brickwork", "floor", { art: "Brick floor", rect: { x: 1.6, y: 1.6, width: 22.8, height: 13.4 }, name: "Brickwork" });
  await step("brickwork dark", "update", { id: mass.id, opacity: 0.22 });
  const dock = await step("dock", "floor", { art: "Wet cobbles", rect: { x: 0, y: 15, width: W, height: 4 }, name: "The dock", room: true });
  await step("dock dim", "update", { id: dock.id, opacity: 0.75 });
  for (const a of AREAS) {
    const z = ZONES[a.zone];
    const made = await step(a.name, "floor", { art: z.floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: !!a.room });
    if (z.opacity) await step(`${a.name} dim`, "update", { id: made.id, opacity: z.opacity });
  }
  const jetty = await step("jetty", "floor", { art: "Dock planks", rect: { x: 9, y: 18.7, width: 2, height: 3 }, name: "Mooring jetty", layer: "objects" });
  await step("jetty dim", "update", { id: jetty.id, opacity: 0.95 });
  for (const p of [
    { art: "Mud", path: [[3, 14.4], [5, 14.2]], size: 0.9, opacity: 0.35 },
    { art: "Moss", path: [[2.4, 2.4], [2.6, 3.2]], size: 0.7, opacity: 0.35 },
  ]) {
    const made = await step(`paint ${p.art}`, "paint", { art: p.art, path: p.path, size: p.size, softness: 80 });
    await step("paint soft", "update", { id: made.id, opacity: p.opacity });
  }

  for (const run of wallRuns(AREAS, DOORS, { zones: ZONES })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  for (const d of DOORS) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, kind: d.kind ?? "door", ...(d.art ? { art: d.art } : {}), ...(d.locked ? { locked: true } : {}) });
  // The quay's edge: its art, and a wall you can see over but not walk through (the jetty between).
  for (const pts of [[[0, 19], [9, 19]], [[11, 19], [26, 19]]]) {
    const q = await step("quay", "wall", { art: "Quay wall", points: pts });
    if (q.wall) await step("quay see-over", "update", { id: q.wall, type: "invisible" });
  }

  const lamp = { preset: "lantern", color: "#ffc070", bright: 10, dim: 25, animation: "flicker", speed: 20, strength: 30 };
  const low = { preset: "lantern", color: "#ffb060", bright: 5, dim: 20, animation: "flicker", speed: 20, strength: 40 };
  const candle = { preset: "candle", color: "#ffd08a", bright: 5, dim: 10, animation: "flicker", speed: 40, strength: 50 };
  await step("props", "place", {
    items: [
      // Guard room: bunks, the brazier, weapons, Haske's bottle; the bell rope by the door.
      { art: "Bed, single", at: [2.5, 3.1], width: 0.85 },
      { art: "Bed, rotten", at: [2.5, 5.6], width: 0.85 },
      { art: "Brazier", at: [5.2, 4.4], width: 0.85, light: { preset: "campfire", color: "#ff8a3d", bright: 10, dim: 25, animation: "flicker", speed: 40, strength: 70 } },
      { art: "Weapon rack", at: [5.2, 2.45], width: 1.6 },
      { art: "Chest", at: [3.7, 6.5], width: 0.7 },
      { art: "Broken pottery", at: [3.6, 4.3], width: 0.5, rotation: 40, name: "Haske's bottle" },
      { art: "Stool", at: [4.2, 3.4], width: 0.45 },
      { art: "Barrel", at: [6.5, 6.5], width: 0.6 },
      // Clerks' office: desks, ink, the day ledgers; the bookcase over the secret door.
      { art: "Desk", at: [9.3, 3.2], width: 1.4 },
      { art: "Desk", at: [12.2, 3.2], width: 1.4 },
      { art: "Desk", at: [9.3, 5.7], width: 1.4 },
      { art: "Chair, dark wood", at: [9.3, 4.1], width: 0.4, rotation: 180 },
      { art: "Chair, dark wood", at: [12.2, 4.1], width: 0.4, rotation: 180 },
      { art: "Chair, dark wood", at: [9.3, 6.55], width: 0.4, rotation: 180 },
      { art: "Candles", at: [12.75, 2.85], width: 0.45, light: candle },
      { art: "Books, scattered", at: [12.4, 5.6], width: 1.0, rotation: 20, name: "The day ledgers (false)" },
      { art: "Bookshelf", at: [15.78, 4.5], width: 1.8, rotation: 90, name: "Bookcase (the secret door behind it)" },
      // Counting room: the master's desk on a rug, the stairs up, the strongbox, a candelabra.
      { art: "Rug, rectangular", at: [19.4, 4.2], width: 3 },
      { art: "Desk", at: [19.4, 3.6], width: 1.9, name: "The master's desk" },
      { art: "Armchair", at: [19.4, 2.65], width: 0.8, rotation: 180 },
      { art: "Narrow stairs", at: [23.0, 6.6], width: 1.6, rotation: 90, name: "Stairs up to the Guild's apartments" },
      { art: "Chest, iron", at: [16.6, 7.3], width: 0.75, name: "Strongbox (4 coin)" },
      { art: "Candelabra", at: [23.4, 2.6], width: 0.55, light: candle },
      { art: "Bookshelf", at: [17.4, 2.25], width: 1.8 },
      // Loading hall: lamp-oil and candle crates, barrels, the guards' dice table under the lantern.
      { art: "Crates", at: [3.0, 10.1], width: 1.5 },
      { art: "Crates", at: [4.6, 10.0], width: 1.4, rotation: 90 },
      { art: "Barrels", at: [8.9, 10.0], width: 1.5 },
      { art: "Barrel", at: [10.3, 9.6], width: 0.7 },
      { art: "Sacks", at: [2.8, 11.7], width: 1.1, rotation: 15 },
      { art: "Table, round", at: [7.2, 12.4], width: 1.3 },
      { art: "Stool", at: [6.2, 12.6], width: 0.45 },
      { art: "Stool", at: [8.2, 12.2], width: 0.45 },
      { art: "Lantern", at: [7.2, 12.3], width: 0.3, light: lamp, name: "Lantern on a hook" },
      { art: "Crates", at: [11.6, 13.6], width: 1.5, rotation: 10 },
      { art: "Crate", at: [12.3, 14.4], width: 0.8, rotation: 20 },
      { art: "Barrel", at: [4.0, 14.3], width: 0.7 },
      // Corridor.
      { art: "Carpet runner, worn", at: [18.6, 11], width: 4, opacity: 0.7 },
      { art: "Lantern", at: [23.6, 10.35], width: 0.3, light: low },
      // The vault: the true ledger among crates of fine wax.
      { art: "Crates", at: [22.8, 14.0], width: 1.4 },
      { art: "Crate", at: [17.7, 14.4], width: 0.8, rotation: 10 },
      { art: "Crate", at: [18.6, 14.4], width: 0.8, rotation: -5 },
      { art: "Low cupboard", at: [21.3, 14.3], width: 1.1, name: "The true ledger (green leather)" },
      // The dock: barrels, crates, a mooring, lamps burning low; the barge at the jetty.
      { art: "Barrels", at: [2.4, 17.2], width: 1.5 },
      { art: "Barrel", at: [3.6, 16.7], width: 0.7 },
      { art: "Crates", at: [14.7, 17.1], width: 1.5 },
      { art: "Crate", at: [16.0, 16.7], width: 0.8, rotation: 15 },
      { art: "Lantern", at: [10.0, 16.45], width: 0.3, light: low },
      { art: "Lantern", at: [20.0, 16.45], width: 0.3, light: low },
      { art: "Gondola", at: [13.4, 20.5], width: 0.95, rotation: 90, name: "Barge at the mooring" },
      { art: "Oil drum", at: [22.8, 17.4], width: 0.7, name: "Lamp-oil drum" },
      { art: "Fishing net", at: [9.9, 21.0], width: 1.1, rotation: 30, opacity: 0.85 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("rain", "weather", { type: "rain", name: "Drizzle", settings: { RainIntensity: 0.3 }, areas: [{ rect: { x: 0, y: 15, width: W, height: H - 15 } }] });
  await step("canal", "weather", { type: "water", name: "Canal", areas: [{ rect: { x: 0, y: 19.4, width: W, height: H - 19.4 } }] });
  await step("bell", "region", { kind: "trap", name: "The alarm bell's rope", note: "Pulled: the bell rings, the guards gather, the Harbor Watch sends a patrol (Counting-house Alert fills).", rect: { x: 5.5, y: 5.5, width: 1.5, height: 1.5 } });
  await step("vault door", "region", { kind: "trap", name: "The vault door", note: "Iron, a Tier II lock: The Vault Door clock (4). Fenwick has the key on a chain at his neck.", rect: { x: 19.5, y: 12, width: 2, height: 1 } });

  await finish(step, { name: "counting-house-studio", out: OUT, renders: RENDERS, plays: [{ name: "dock", token: [6.5, 17.5], light: "none" }, { name: "hall", token: [7.5, 10.5], light: "none" }] });
  await step("save project", "save", {});
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
