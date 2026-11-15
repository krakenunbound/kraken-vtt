// Kestrel's Due, decks 1 and 2 (games/apeira-astra, "Salvage Rights"), made in Map
// Studio with its agent tools and the shipped art only (Kraken Map Art's sci-fi
// set), following skills/kraken-map-studio/SKILL.md, from the adventure's entries
// 03 to 07: the port airlock on manual with its panel on battery; the cargo hold
// of strapped crates (reactor housings, coolant cores), the drag stain and the
// Rust Crawlers' nest in the ducts; the crew deck's bunks, galley and forced
// medbay locker; the salvage drone wedged by the dead lift; on deck 2 the frosted
// bridge with the captain's chair turned to the door, the cryo bay's four pods
// (three humming, one open and empty), and engineering behind its sealed hatch,
// the reactor glowing a sick blue. Same rooms and doors as the hand-drawn maps.
//
// node scripts/studio-map-kestrel.mjs [out folder]   (default games/apeira-astra/maps)
// writes kestrel-deck1-studio and kestrel-deck2-studio (.webp, .walls.json) there;
// renders and the portable projects go to the system's temp folder (printed). The
// book keeps its old maps until these are reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/apeira-astra/maps");
const RENDERS = path.join(tmpdir(), "kraken-kestrel");

const ZONES = {
  airlock: { floor: "Deck plating, worn", wall: "Hull wall" },
  hold: { floor: "Deck plating", wall: "Bulkhead" },
  corridor: { floor: "Grating", wall: "Bulkhead" },
  crew: { floor: "Deck plating", wall: "Bulkhead" },
  med: { floor: "Deck plating", wall: "Bulkhead" },
  lift: { floor: "Grating", wall: "Bulkhead", opacity: 0.35 },
  bridge: { floor: "Deck plating", wall: "Bulkhead" },
  cryo: { floor: "Deck plating", wall: "Bulkhead" },
  engine: { floor: "Grating", wall: "Bulkhead, damaged" },
};
const screen = (color, bright = 5, dim = 10, speed = 15, strength = 30) => ({ preset: "custom", color, bright, dim, animation: "pulse", speed, strength });
const warning = { preset: "custom", color: "#ff3b30", bright: 0, dim: 15, animation: "pulse", speed: 60, strength: 90 };
const rails = (x, y) => [{ art: "Pipes, straight", at: [x, y], width: 0.32 }];

const DECK1 = {
  name: "kestrel-deck1-studio",
  title: "Kestrel's Due, Deck 1",
  W: 30, H: 18,
  hull: [[1.3, 6.3], [5.6, 6.3], [5.6, 1.3], [27.6, 1.3], [29.2, 3.5], [29.2, 14.5], [27.6, 16.7], [5.6, 16.7], [5.6, 11.7], [1.3, 11.7]],
  areas: [
    { zone: "airlock", x: 2, y: 7, w: 3, h: 4, name: "Port airlock", room: true },
    { zone: "hold", x: 5, y: 8, w: 1, h: 2, name: "Hold lock neck" },
    { zone: "hold", x: 6, y: 2, w: 11, h: 14, name: "Cargo hold", room: true },
    { zone: "hold", x: 17, y: 8, w: 1, h: 2, name: "Hold neck" },
    { zone: "corridor", x: 18, y: 7, w: 9, h: 4, name: "Crew corridor", room: true },
    { zone: "crew", x: 18, y: 2, w: 4, h: 4, group: "bunks", name: "Bunks", room: true },
    { zone: "crew", x: 19, y: 6, w: 1, h: 1, group: "bunks", name: "Bunks neck" },
    { zone: "crew", x: 23, y: 2, w: 4, h: 4, group: "galley", name: "Galley", room: true },
    { zone: "crew", x: 24, y: 6, w: 1, h: 1, group: "galley", name: "Galley neck" },
    { zone: "med", x: 18, y: 12, w: 4, h: 4, name: "Medbay", room: true },
    { zone: "med", x: 19, y: 11, w: 1, h: 1, name: "Medbay neck" },
    { zone: "lift", x: 23, y: 12, w: 3, h: 3, name: "Lift shaft", room: true },
    { zone: "lift", x: 24, y: 11, w: 1, h: 1, name: "Lift neck" },
  ],
  doors: [
    { from: [2, 8], to: [2, 10], art: "Airlock door", locked: true, name: "Port airlock, outer" },
    { from: [5, 8], to: [5, 10], art: "Airlock door", locked: true, name: "Port airlock, inner (manual)" },
    { from: [18, 8], to: [18, 10], art: "Airlock door", name: "Hold doors" },
    { from: [19, 7], to: [20, 7], art: "Hatch" },
    { from: [24, 7], to: [25, 7], art: "Hatch" },
    { from: [19, 11], to: [20, 11], art: "Hatch" },
    { from: [24, 11], to: [25, 11], art: "Hatch", name: "Lift (dead)" },
  ],
  props: [
    // The port airlock: its panel still on battery, breather masks in the suit lockers.
    { art: "Console", at: [2.55, 7.55], width: 0.65, light: screen("#ffb347", 0, 10, 10, 40), name: "Airlock console (battery: the captain's last log)" },
    { art: "Locker row", at: [3.5, 10.68], width: 1.8, rotation: 180 },
    { art: "Wreckage scatter", at: [4.1, 8.0], width: 0.6, rotation: 30 },
    // The cargo hold: reactor housings and coolant cores strapped down, cable ducts, the drag stain.
    { art: "Cargo containers, stacked", at: [7.9, 3.35], width: 1.85, name: "Reactor housings" },
    { art: "Cargo containers, stacked", at: [10.0, 3.35], width: 1.85, name: "Reactor housings" },
    { art: "Reactor core", at: [12.75, 3.5], width: 1.9, opacity: 0.9, name: "Spare reactor housing (strapped down)" },
    { art: "Cargo container", at: [15.4, 2.85], width: 2.2 },
    { art: "Cargo container", at: [15.4, 3.75], width: 2.2 },
    { art: "Cargo container", at: [7.0, 13.6], width: 2.1, rotation: 90 },
    { art: "Cargo containers, stacked", at: [15.0, 13.3], width: 2.3 },
    { art: "Cargo container", at: [15.0, 15.25], width: 2.2 },
    { art: "Oil drum", at: [10.4, 13.6], width: 0.75, name: "Coolant core" },
    { art: "Oil drum", at: [11.3, 13.5], width: 0.75, name: "Coolant core" },
    { art: "Oil drum", at: [10.6, 14.5], width: 0.75, name: "Coolant core" },
    { art: "Oil drum", at: [12.3, 15.3], width: 0.7, rotation: 40 },
    { art: "Wreckage scatter", at: [11.8, 8.6], width: 1.1, rotation: 20 },
    { art: "Wreckage scatter", at: [12.6, 9.5], width: 0.8, rotation: 200 },
    { art: "Blood stain", at: [14.6, 9.3], width: 1.1, rotation: 10, opacity: 0.75, name: "Pell's stain" },
    { art: "Blood stain", at: [15.9, 9.0], width: 0.55, rotation: 140, opacity: 0.55 },
    { art: "Blood stain", at: [16.7, 8.8], width: 0.4, rotation: 260, opacity: 0.45 },
    { art: "Pipes, straight", at: [6.2, 6.9], width: 0.38, name: "Cable duct" },
    { art: "Cargo container", at: [8.4, 6.5], width: 2.1 },
    { art: "Cargo container", at: [11.0, 6.5], width: 2.1, rotation: 180 },
    { art: "Cargo containers, stacked", at: [14.4, 6.2], width: 2.0 },
    { art: "Cargo container", at: [9.0, 11.5], width: 2.1 },
    { art: "Cargo containers, stacked", at: [12.2, 11.8], width: 2.0 },
    { art: "Oil drum", at: [15.6, 11.3], width: 0.7, name: "Coolant core" },
    { art: "Pipes, straight", at: [11.0, 15.78], width: 0.38, rotation: 90, name: "Cable duct" },
    // Bunks: blankets thrown back, lockers.
    { art: "Bunk", at: [18.45, 3.1], width: 0.7 },
    { art: "Bunk", at: [21.55, 3.1], width: 0.7 },
    { art: "Bunk", at: [18.45, 5.0], width: 0.7, rotation: 180 },
    { art: "Locker row", at: [20.0, 2.3], width: 1.3 },
    { art: "Wreckage scatter", at: [21.2, 5.3], width: 0.5, rotation: 70 },
    // Galley: half a meal frozen to the table.
    { art: "Mess table", at: [24.2, 3.6], width: 0.9, rotation: 90, name: "Half a meal, frozen" },
    { art: "Mess table", at: [25.9, 3.6], width: 0.9, rotation: 90 },
    { art: "Locker row", at: [26.68, 4.4], width: 1.5, rotation: 90 },
    { art: "Oil drum", at: [23.45, 5.5], width: 0.6 },
    // Medbay: two beds, the drug locker forced open, blood on the latch.
    { art: "Med bay bed", at: [18.6, 14.0], width: 0.95 },
    { art: "Med bay bed", at: [21.4, 14.0], width: 0.95 },
    { art: "Locker row", at: [20.0, 15.68], width: 1.3, rotation: 180, name: "Drug locker (forced)" },
    { art: "Blood stain", at: [20.3, 15.1], width: 0.45, rotation: 60, opacity: 0.8 },
    { art: "Console", at: [21.5, 12.5], width: 0.55, light: screen("#7fd8ff", 0, 5) },
    // The dead lift: its rails down the shaft.
    ...rails(23.25, 13.5), ...rails(25.75, 13.5),
    // Corridor: cable runs, the emergency panel, the drone's cutting marks by the lift.
    { art: "Pipes, straight", at: [22.0, 7.22], width: 0.42, rotation: 90 },
    { art: "Pipes, straight", at: [22.4, 10.78], width: 0.42, rotation: 90 },
    { art: "Console", at: [26.6, 9.0], width: 0.65, rotation: 90, light: screen("#ffb347", 0, 15, 10, 40), name: "Emergency console" },
    { art: "Wreckage scatter", at: [24.6, 10.3], width: 0.9, rotation: 160 },
    { art: "Scorch mark", at: [25.6, 9.5], width: 0.8, rotation: 30 },
  ],
  regions: [
    { kind: "trap", name: "Rust Crawler nest", note: "2d6 Rust Crawlers swarm out of the ducts when cargo is moved or a light shines into the ducts (a Hand Scanner's Recon, Standard, spots the nest first).", rect: { x: 6, y: 2, width: 6, height: 3.5 } },
    { kind: "trap", name: "Salvage drone", note: "Wedged in the corridor by the lift: turns its cutting arm on anything that moves. Electronics (Hard) at its access panel, or enough damage, shuts it down.", rect: { x: 23, y: 8.5, width: 3, height: 2.5 } },
    { kind: "pit", name: "Lift shaft", note: "The lift is dead. Climb the shaft to deck 2 in zero-g (Athletics or Zero-G, Standard).", rect: { x: 23.3, y: 12.3, width: 2.4, height: 2.4 } },
  ],
  plays: [{ name: "airlock", token: [3.5, 9], light: "torch" }, { name: "corridor", token: [20.5, 9], light: "torch" }],
};

const DECK2 = {
  name: "kestrel-deck2-studio",
  title: "Kestrel's Due, Deck 2",
  W: 28, H: 16,
  hull: [[0.8, 6.5], [1.3, 4.3], [8.6, 4.3], [8.6, 1.3], [19.6, 1.3], [19.6, 3.3], [26.7, 3.3], [27.3, 8], [26.7, 12.7], [14.6, 12.7], [14.6, 14.7], [8.6, 14.7], [8.6, 11.7], [1.3, 11.7], [0.8, 9.5]],
  areas: [
    { zone: "bridge", x: 2, y: 5, w: 5, h: 6, name: "Bridge", room: true },
    { zone: "corridor", x: 7, y: 7, w: 1, h: 2, name: "Bridge neck" },
    { zone: "corridor", x: 8, y: 6, w: 12, h: 4, name: "Deck 2 corridor", room: true },
    { zone: "cryo", x: 9, y: 2, w: 5, h: 3, name: "Cryo bay", room: true },
    { zone: "corridor", x: 11, y: 5, w: 1, h: 1, name: "Cryo neck" },
    { zone: "crew", x: 9, y: 11, w: 5, h: 3, name: "Captain's cabin", room: true },
    { zone: "corridor", x: 11, y: 10, w: 1, h: 1, name: "Cabin neck" },
    { zone: "lift", x: 16, y: 2, w: 3, h: 3, name: "Lift shaft", room: true },
    { zone: "corridor", x: 17, y: 5, w: 1, h: 1, name: "Lift neck" },
    { zone: "corridor", x: 20, y: 7, w: 1, h: 2, name: "Engineering neck" },
    { zone: "engine", x: 21, y: 4, w: 5, h: 8, name: "Engineering", room: true },
  ],
  doors: [
    { from: [7, 7], to: [7, 9], art: "Airlock door", name: "Bridge" },
    { from: [11, 5], to: [12, 5], art: "Hatch", name: "Cryo bay" },
    { from: [11, 11], to: [12, 11], art: "Hatch" },
    { from: [17, 5], to: [18, 5], art: "Hatch", name: "Lift (dead)" },
    { from: [21, 7], to: [21, 9], art: "Airlock door", locked: true, name: "Radiation hatch (sealed)" },
  ],
  props: [
    // The bridge: frost on the consoles, the captain's chair turned to face the door.
    { art: "Bridge console row", at: [2.85, 8], width: 2.6, rotation: 270, opacity: 0.9 },
    { art: "Console", at: [2.6, 5.6], width: 0.7, opacity: 0.85 },
    { art: "Console", at: [2.6, 10.4], width: 0.7, light: screen("#ffb347", 0, 10, 8, 40), name: "Bridge console (power to the pods)" },
    { art: "Captain's chair", at: [5.4, 8], width: 0.95, rotation: 270, name: "The captain's chair, turned to the door" },
    { art: "Locker row", at: [4.6, 5.32], width: 1.6 },
    { art: "Wreckage scatter", at: [4.8, 10.4], width: 0.6, rotation: 300 },
    // The cryo bay: four pods in a row, three humming, one open and empty (Pell's).
    { art: "Cryo pod", at: [9.62, 2.65], width: 1.05, name: "Pod: Capt. Ines Vale (alive)" },
    { art: "Cryo pod", at: [10.82, 2.65], width: 1.05, name: "Pod (alive)" },
    { art: "Cryo pod, open", at: [12.15, 3.05], width: 0.9, name: "Pell Okafor's pod (open, empty)" },
    { art: "Cryo pod", at: [13.38, 2.65], width: 1.05, name: "Pod (alive)" },
    { art: "Console", at: [9.6, 4.45], width: 0.5, light: screen("#7fd8ff", 0, 10) },
    { art: "Console", at: [13.4, 4.45], width: 0.5, light: screen("#7fd8ff", 0, 10) },
    // The captain's cabin.
    { art: "Bunk", at: [13.55, 12.5], width: 0.7 },
    { art: "Locker row", at: [9.32, 12.5], width: 1.4, rotation: 90 },
    { art: "Mess table", at: [11.6, 12.6], width: 0.85, rotation: 90 },
    { art: "Wreckage scatter", at: [12.4, 13.5], width: 0.5, rotation: 110 },
    // The dead lift.
    ...rails(16.25, 3.5), ...rails(18.75, 3.5),
    // Corridor: debris, cable runs, Pell's blood leading to engineering.
    { art: "Wreckage scatter", at: [14.8, 7.0], width: 1.1, rotation: 15 },
    { art: "Pipes, straight", at: [14.6, 9.78], width: 0.42, rotation: 90 },
    { art: "Pipes, straight", at: [9.5, 6.22], width: 0.38, rotation: 90 },
    { art: "Blood stain", at: [18.2, 8.4], width: 0.7, rotation: 30, opacity: 0.7, name: "Pell's blood" },
    { art: "Blood stain", at: [19.5, 8.1], width: 0.45, rotation: 200, opacity: 0.55 },
    { art: "Console", at: [8.4, 9.6], width: 0.5, light: screen("#ffb347", 0, 10, 10, 40) },
    // Engineering: the reactor glowing a sick blue, warnings strobing, the coolant pumps Pell hides behind.
    { art: "Reactor core", at: [23.4, 7.6], width: 2.9, light: { preset: "custom", color: "#4fd1ff", bright: 10, dim: 30, animation: "pulse", speed: 20, strength: 60 }, name: "The reactor (coolant failing)" },
    { art: "Console", at: [21.6, 4.6], width: 0.6, light: warning, name: "Radiation warning console" },
    { art: "Console", at: [25.4, 11.4], width: 0.6, light: warning, name: "Radiation warning console" },
    { art: "Pipes, straight", at: [25.75, 6.6], width: 0.42, name: "Coolant pump" },
    { art: "Pipes, straight", at: [25.75, 9.3], width: 0.42, name: "Coolant pump" },
    { art: "Oil drum", at: [24.9, 10.5], width: 0.75, name: "Coolant tank" },
    { art: "Oil drum", at: [22.0, 11.3], width: 0.7, name: "Coolant tank" },
    { art: "Wreckage scatter", at: [23.8, 10.6], width: 0.8, rotation: 60 },
    { art: "Scorch mark", at: [21.9, 9.9], width: 0.8, rotation: 0 },
  ],
  paint: [
    { art: "Ice", path: [[2.5, 6.4], [2.6, 9.6]], size: 1.0, opacity: 0.4 },
    { art: "Ice", path: [[9.6, 2.6], [13.4, 2.6]], size: 1.0, opacity: 0.35 },
  ],
  regions: [
    { kind: "trap", name: "Reactor radiation", note: "Standing beside the reactor costs a Grit check each turn (1d6 damage on a failure). Three Engineering tasks (Hard) fix it; three failures and it breaches: ten minutes to get off.", rect: { x: 21.3, y: 5.4, width: 4.3, height: 4.4 } },
    { kind: "pit", name: "Lift shaft", note: "The lift is dead; the shaft leads down to deck 1 (Athletics or Zero-G, Standard).", rect: { x: 16.3, y: 2.3, width: 2.4, height: 2.4 } },
  ],
  myst: [{ rect: { x: 21, y: 4, width: 5, height: 8 } }],
  plays: [{ name: "corridor", token: [12.5, 8], light: "torch" }, { name: "engineering", token: [22, 9.5], light: "none" }],
};

async function build(step, deck) {
  const renders = path.join(RENDERS, deck.name);
  mkdirSync(renders, { recursive: true });
  await step("new map", "new", { name: deck.title, width: deck.W, height: deck.H, grid: 100, background: "#06080c" });
  const hull = await step("hull", "floor", { art: "Hull plating", polygon: deck.hull, name: "Hull" });
  await step("hull dim", "update", { id: hull.id, opacity: 0.45 });
  for (const a of deck.areas) {
    const z = ZONES[a.zone];
    const made = await step(a.name, "floor", { art: z.floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: !!a.room });
    await step(`${a.name} dim`, "update", { id: made.id, opacity: z.opacity ?? (z.floor === "Deck plating" ? 0.72 : 0.85) });
  }
  for (const p of deck.paint ?? []) {
    const made = await step(`paint ${p.art}`, "paint", { art: p.art, path: p.path, size: p.size, softness: 80 });
    await step("paint soft", "update", { id: made.id, opacity: p.opacity });
  }
  for (const run of wallRuns(deck.areas, deck.doors, { zones: ZONES })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  for (const d of deck.doors) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, art: d.art, ...(d.locked ? { locked: true } : {}) });
  await step("props", "place", { items: deck.props });
  await step("ambient", "ambient", { preset: "night" });
  if (deck.myst) await step("vapour", "weather", { type: "myst", name: "Coolant vapour", settings: { MystFade: 0.35, MystSpeed: 0.2 }, areas: deck.myst });
  for (const r of deck.regions) await step(`region ${r.name}`, "region", r);
  const check = await finish(step, { name: deck.name, out: OUT, renders, plays: deck.plays });
  await step("save project", "save", {});
  return check;
}

const k = await startKraken({ name: "Salvage Rights", port: 47464 });
const step = stepper(k);
try {
  const only = process.env.DECK;
  for (const deck of [DECK1, DECK2]) if (!only || deck.name.includes(only)) await build(step, deck);
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
