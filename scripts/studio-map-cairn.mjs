// Trouble in Twin Lakes (games/cairn): Deadmill and the Temple of the Fungal Lizards,
// made in Map Studio with its agent tools and the shipped art only, following
// skills/kraken-map-studio/SKILL.md, from the adventure's text.
//
// Deadmill: the gristmill half-sunk in a dark grove, its south entrance on quicksand
// where Jandy falls every thirty seconds, the millstone with its rotted machinery and
// Jandy's satchel inside, the white paddles over the dry riverbed to the north, the
// Wisp Lamp hidden in the leaves.
// The temple: a fallen alien hull of blue-black alloy (the shipped sci-fi set):
// T1 antechamber with its statue pedestals, T2 columbarium (scrolls, urns, the seams),
// T3 breeding chamber (burst sacs and the intact nodule), T4 maintenance tunnels with
// the bird-like skeleton in moon cloth, T5 hall of glyphs, T6 waste disposal (the
// square well, the scalding nozzles), T7 light room (the board, the pad, the
// forcefield to T8), T8 preparation room, T9 chamber of worship (gore, the
// Imperator's growth blocking the west exit), T10 the interrogation room behind its
// gashed door; the corner sconces placed, all off. Same rooms and doors as the
// hand-drawn maps.
//
// node scripts/studio-map-cairn.mjs [out folder]   (default games/cairn/maps)
// writes deadmill-studio and temple-studio (.webp, .walls.json) there; renders and
// portable projects go to the system's temp folder (printed). The book keeps its old
// maps until these are reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/cairn/maps");
const RENDERS = path.join(tmpdir(), "kraken-cairn");

async function rooms(step, { zones, areas, doors }) {
  for (const a of areas) {
    const z = zones[a.zone];
    const made = await step(a.name, "floor", { art: z.floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: !!a.room });
    if (z.opacity) await step(`${a.name} dim`, "update", { id: made.id, opacity: z.opacity });
  }
  return async () => {
    for (const run of wallRuns(areas, doors, { zones })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
    for (const d of doors) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, kind: d.kind ?? "door", ...(d.art ? { art: d.art } : {}), ...(d.locked ? { locked: true } : {}) });
  };
}
async function paint(step, list) {
  for (const p of list) {
    const made = await step(`paint ${p.art}`, "paint", { art: p.art, path: p.path, size: p.size, softness: 80 });
    if (p.opacity) await step("paint soft", "update", { id: made.id, opacity: p.opacity });
  }
}

// --- Deadmill (24 x 18) -------------------------------------------------------------------
async function deadmill(step) {
  const renders = path.join(RENDERS, "deadmill-studio");
  mkdirSync(renders, { recursive: true });
  const W = 24, H = 18;
  await step("new map", "new", { name: "Deadmill", width: W, height: H, grid: 100, background: "#141810" });
  const ground = await step("grove", "floor", { art: "Forest floor", rect: { x: 0, y: 0, width: W, height: H }, name: "The grove" });
  await step("grove dim", "update", { id: ground.id, opacity: 0.85 });
  const bed = await step("riverbed", "floor", { art: "Gravel", polygon: [[0, 1.2], [8, 0.8], [16, 1.3], [24, 0.9], [24, 3.9], [16, 4.3], [8, 4.0], [0, 4.2]], feather: 0.6, name: "The dry riverbed" });
  await step("riverbed dim", "update", { id: bed.id, opacity: 0.8 });
  const sand = await step("quicksand", "floor", { art: "Mud", polygon: [[9.6, 12.4], [14.4, 12.4], [15.0, 14.2], [13.8, 16.2], [11.2, 16.0], [9.4, 14.4]], feather: 0.7, name: "Quicksand" });
  await step("quicksand dim", "update", { id: sand.id, opacity: 0.9 });
  await paint(step, [{ art: "Dirt", path: [[12.6, 18], [12.3, 16]], size: 1.4, opacity: 0.7 }]);
  const zones = { mill: { floor: "Old planks", wall: "Stone wall, mossy", opacity: 0.85 } };
  const areas = [{ zone: "mill", x: 8, y: 6, w: 8, h: 6, name: "The mill", room: true }];
  const doors = [{ from: [11, 12], to: [13, 12], art: "Double door", name: "South door (every 30 seconds it opens: Jandy)" }];
  const walls = await rooms(step, { zones, areas, doors });
  await paint(step, [
    { art: "Mud", path: [[9, 11.3], [15, 11.3]], size: 1.1, opacity: 0.55 },
    { art: "Dirt", path: [[3, 2.4], [7, 2.8]], size: 1.4, opacity: 0.6 },
    { art: "Dirt", path: [[17, 2.6], [21, 2.2]], size: 1.4, opacity: 0.6 },
  ]);
  await walls();
  await step("props", "place", {
    items: [
      // Inside: the millstone and its machinery, Jandy's satchel against the south wall.
      { art: "Ritual platform", at: [11.5, 8.4], width: 2.8, opacity: 0.9, name: "The millstone (something metallic and glowing beneath)" },
      { art: "Mine timber brace", at: [14.4, 8.4], width: 1.4, rotation: 90, name: "Machinery (the lever rotted away)" },
      { art: "Loose iron chain", at: [13.9, 6.9], width: 1.0, rotation: 30 },
      { art: "Sack, torn", at: [10.6, 11.4], width: 0.5, rotation: 20, name: "Jandy's satchel" },
      { art: "Rubble, small", at: [9.0, 10.4], width: 0.9, rotation: 40 },
      { art: "Crate, broken", at: [14.6, 10.6], width: 0.8, rotation: 15 },
      { art: "Spider web, corner", at: [8.6, 6.6], width: 1.0 },
      // North: the white paddles over the dry riverbed; the Wisp Lamp in the leaves.
      { art: "Log", at: [12.0, 4.8], width: 3.0, name: "Wheel axle" },
      { art: "Door, wooden", at: [11.0, 3.6], width: 1.6, rotation: 90, name: "Paddle (white, a carved script: 'To prime, turn counter-clockwise')" },
      { art: "Door, wooden", at: [13.0, 3.6], width: 1.6, rotation: 90, name: "Paddle (white, a carved script)" },
      { art: "Lantern, broken", at: [16.6, 2.4], width: 0.4, name: "Wisp Lamp (an iron cage, half buried in leaves)", light: { preset: "glow", color: "#bfe6ff", bright: 5, dim: 15, animation: "pulse", speed: 30, strength: 70 } },
      { art: "Bones", at: [17.4, 2.9], width: 0.5, rotation: 60 },
      { art: "Driftwood", at: [5.2, 2.6], width: 1.6, rotation: 15 },
      { art: "Rocks", at: [20.6, 3.0], width: 0.7 },
      // The grove: overgrown arboreal pillars round the mill, near-constant dark.
      { art: "Tree, oak", at: [1.8, 6.2], width: 3.4 },
      { art: "Tree, dead", at: [4.0, 10.2], width: 3 },
      { art: "Tree, pine", at: [20.0, 7.0], width: 3 },
      { art: "Tree, oak", at: [21.0, 12.0], width: 3.6 },
      { art: "Tree, willow", at: [2.0, 15.0], width: 3.6 },
      { art: "Tree, oak small", at: [17.8, 16.0], width: 2.8 },
      { art: "Hollow tree", at: [6.0, 16.0], width: 1.8 },
      { art: "Tree, pine", at: [22.8, 16.2], width: 2.8 },
      { art: "Bush", at: [5.6, 7.4], width: 1.1 },
      { art: "Fern", at: [18.4, 9.6], width: 1 },
      { art: "Bush, dead", at: [8.4, 14.4], width: 1 },
      { art: "Fern", at: [15.6, 13.4], width: 0.9 },
      { art: "Mushrooms", at: [17.2, 12.6], width: 0.6 },
      { art: "Stump", at: [7.0, 12.8], width: 0.9 },
    ],
  });
  await step("ambient", "ambient", { preset: "dusk" });
  await step("quicksand trap", "region", { kind: "trap", name: "Quicksand at the south entrance", note: "DEX save to escape; a failure sinks the victim further (max 3 attempts). Every 30 seconds the door opens, Jandy steps out, looks back, shrugs and falls into the quicksand.", rect: { x: 10, y: 12.3, width: 4.6, height: 3.4 } });
  await step("sinking", "region", { kind: "trap", name: "The sinking mill", note: "More than three people inside (Jandy included): it sinks fully into the earth (DEX save to escape or do anything of note).", rect: { x: 8.2, y: 10, width: 7.6, height: 1.8 } });
  return finish(step, { name: "deadmill-studio", out: OUT, renders, plays: [{ name: "road", token: [12.2, 17], light: "torch" }, { name: "inside", token: [10, 9], light: "torch" }] });
}

// --- The Temple of the Fungal Lizards (35 x 19) ------------------------------------------------
async function temple(step) {
  const renders = path.join(RENDERS, "temple-studio");
  mkdirSync(renders, { recursive: true });
  const W = 35, H = 19;
  await step("new map", "new", { name: "Temple of the Fungal Lizards", width: W, height: H, grid: 100, background: "#0a0c12" });
  const rock = await step("rock", "floor", { art: "Cave floor", rect: { x: 0, y: 0, width: W, height: H }, name: "Earth" });
  await step("rock dim", "update", { id: rock.id, opacity: 0.18 });
  const zones = {
    tunnel: { floor: "Grating", wall: "Bulkhead", opacity: 0.7 },
    alloy: { floor: "Deck plating", wall: "Bulkhead", opacity: 0.5 },
    grate: { floor: "Grating", wall: "Bulkhead", opacity: 0.75 },
    gore: { floor: "Deck plating, worn", wall: "Bulkhead", opacity: 0.6 },
    fungus: { floor: "Cavern floor", wall: "Bulkhead, damaged", opacity: 0.8 },
  };
  const T = "temple";
  const areas = [
    // T4: the maintenance tunnels.
    { zone: "tunnel", x: 3, y: 1, w: 1, h: 12, group: "tunnel", name: "T4 Maintenance tunnel", room: true },
    { zone: "tunnel", x: 4, y: 1, w: 6, h: 1, group: "tunnel", name: "T4 tunnel (north)" },
    { zone: "tunnel", x: 10, y: 1, w: 1, h: 3, group: "tunnel", name: "T4 tunnel (east)" },
    { zone: "grate", x: 4, y: 2, w: 5, h: 5, group: "t6", name: "T6 Waste disposal", room: true },
    { zone: "alloy", x: 4, y: 8, w: 5, h: 5, group: T, name: "T2 Columbarium", room: true },
    { zone: "alloy", x: 9, y: 10, w: 2, h: 1, group: T, name: "Passage T2-T5" },
    { zone: "alloy", x: 11, y: 2, w: 5, h: 4, group: T, name: "T7 Light room", room: true },
    { zone: "alloy", x: 13, y: 6, w: 1, h: 3, group: T, name: "Passage T7-T5" },
    { zone: "alloy", x: 16, y: 3, w: 2, h: 1, group: T, name: "Hall T7-T8 (the forcefield)" },
    { zone: "grate", x: 18, y: 2, w: 4, h: 4, group: T, name: "T8 Preparation room", room: true },
    { zone: "gore", x: 22, y: 4, w: 1, h: 1, group: T, name: "T9 west exit (blocked)" },
    { zone: "gore", x: 23, y: 1, w: 5, h: 7, group: T, name: "T9 Chamber of worship", room: true },
    { zone: "alloy", x: 28, y: 3, w: 2, h: 1, group: T, name: "T10a Interrogation room door" },
    { zone: "gore", x: 30, y: 2, w: 4, h: 4, group: "t10", name: "T10b Interrogation room", room: true },
    { zone: "alloy", x: 11, y: 9, w: 8, h: 3, group: T, name: "T5 Hall of glyphs", room: true },
    { zone: "alloy", x: 19, y: 10, w: 1, h: 1, group: T, name: "Passage T5-T3" },
    { zone: "fungus", x: 20, y: 9, w: 6, h: 5, group: T, name: "T3 Breeding chamber", room: true },
    { zone: "alloy", x: 24, y: 8, w: 1, h: 1, group: T, name: "Passage T3-T9" },
    { zone: "alloy", x: 14, y: 12, w: 2, h: 1, group: T, name: "Passage T1-T5" },
    { zone: "alloy", x: 12, y: 13, w: 6, h: 3, group: T, name: "T1 Antechamber", room: true },
    { zone: "alloy", x: 11, y: 14, w: 1, h: 1, group: T, name: "T1 west chamber" },
    { zone: "alloy", x: 18, y: 14, w: 1, h: 1, group: T, name: "T1 east chamber" },
    { zone: "alloy", x: 14, y: 16, w: 2, h: 2, group: T, name: "Entrance stair" },
  ];
  const doors = [
    { from: [4, 10], to: [4, 11], kind: "secret", name: "T2 seams: hatch to T4 (the urn's twist opens it, loudly)" },
    { from: [4, 4], to: [4, 5], kind: "secret", name: "T6 seams: hatch to T4 (the southwest drain grate)" },
    { from: [11, 3], to: [11, 4], kind: "secret", name: "T7 seams: hatch to T4 (the switch under the board)" },
    { from: [30, 3], to: [30, 4], art: "Hatch", locked: true, name: "T10a door: a hooked gash for the Curved Dagger; a window six feet up" },
  ];
  const walls = await rooms(step, { zones, areas, doors });
  await paint(step, [
    { art: "Swamp", path: [[23.6, 4.8], [24.4, 6.8]], size: 1.4, opacity: 0.6 },
  ]);
  await walls();
  // The forcefield between T7 and T8: stops feet, not eyes.
  await step("forcefield", "wall", { type: "invisible", points: [[17, 3], [17, 4]] });
  const sconce = (x, y) => ({ art: "Spirit lantern", at: [x, y], width: 0.4, name: "Sconce lantern (diamond bulb, off)", light: { preset: "custom", color: "#9fd4ff", bright: 10, dim: 20, on: false } });
  const blood = (x, y, w, r) => ({ art: "Blood stain", at: [x, y], width: w, rotation: r, opacity: 0.8 });
  await step("props", "place", {
    items: [
      // T1: the stair down, the east and west chambers with their statues on pedestals.
      { art: "Narrow stairs", at: [15.0, 17.0], width: 1.8, name: "Stair down into the temple" },
      { art: "Statue pedestal", at: [11.5, 14.5], width: 0.95, name: "West pedestal: NW eggs in a scaled hand, SW spores on a salt pillar" },
      { art: "Statue pedestal", at: [18.5, 14.5], width: 0.95, name: "East pedestal: NE veined spore; SE only a copper ring" },
      sconce(12.3, 13.3), sconce(17.7, 15.7),
      // T5: the hall of glyphs, its carvings to the east.
      { art: "Temple weathered relief", at: [18.4, 9.3], width: 1.3, layer: "walls", name: "Carvings: the falling beetle" },
      { art: "Temple weathered relief", at: [18.4, 11.7], width: 1.3, rotation: 180, layer: "walls", name: "Carvings: the winged figures and their lizards" },
      { art: "Worn rune fragment", at: [16.4, 10.6], width: 0.9, rotation: 40 },
      sconce(11.3, 9.3),
      // T2: withered scrolls to the north, urns to the south.
      { art: "Books, scattered", at: [5.4, 8.7], width: 1.1, name: "Withered scrolls and eggshells (the Watersnatch tube beneath)" },
      { art: "Bones", at: [7.2, 8.6], width: 0.5, rotation: 30, name: "Eggshell fragments" },
      { art: "Ceramic urn cluster", at: [5.2, 12.2], width: 1.1, name: "Urns (one of mummified bird-like remains)" },
      { art: "Ceramic urn cluster", at: [7.0, 12.3], width: 1.1 },
      { art: "Burial urn", at: [8.4, 12.4], width: 0.6, name: "The fixed urn (twist: hatch to T4, loudly)" },
      { art: "Broken pottery", at: [6.4, 11.2], width: 0.6, rotation: 70 },
      sconce(8.7, 8.3),
      // T4: rubble, and the bird-like skeleton wrapped in moon cloth.
      { art: "Rubble, small", at: [3.5, 6.4], width: 0.8, rotation: 20 },
      { art: "Skeleton", at: [3.5, 7.6], width: 0.6, rotation: 5, name: "Bird-like skeleton in Moon Cloth (the Curved Dagger)" },
      // T6: the square well, the nozzles and drains on the south wall.
      { art: "Well", at: [6.5, 4.5], width: 1.3, name: "The square well (hundreds of feet deep)" },
      { art: "Pipes, straight", at: [5.0, 6.75], width: 0.25, rotation: 90, name: "Nozzle and drain" },
      { art: "Pipes, straight", at: [6.5, 6.75], width: 0.25, rotation: 90, name: "Nozzle and drain" },
      { art: "Pipes, straight", at: [8.0, 6.75], width: 0.25, rotation: 90, name: "Nozzle and drain" },
      sconce(8.7, 2.3),
      // T7: the board on the north wall, the pad by the east exit.
      { art: "Console", at: [13.5, 2.4], width: 0.8, opacity: 0.85, name: "Console: the diamond board (sconce dial; forcefield; the hatch switch)" },
      { art: "Console", at: [15.7, 3.4], width: 0.4, name: "Console: the pad (the forcefield)" },
      sconce(11.3, 5.7),
      // T8: bare, the grate, the nozzle overhead.
      { art: "Pipes, straight", at: [20.0, 4.0], width: 0.35, rotation: 45, opacity: 0.7, name: "Ceiling nozzle (seen from below)" },
      sconce(21.7, 2.3),
      // T9: gore, the Imperator's growth in the southwest blocking the west exit, the flesh pile.
      { art: "Fungal caps", at: [24.2, 5.8], width: 2.8, name: "The growth: a Suraru Imperator" },
      { art: "Bones, scattered", at: [25.6, 4.4], width: 1.1, rotation: 30, name: "Flesh piled by the growth" },
      blood(25.4, 2.2, 1.1, 0), blood(26.6, 5.6, 0.9, 120), blood(24.4, 1.6, 0.8, 200), blood(27.0, 3.4, 0.7, 60),
      { art: "Skeleton", at: [26.4, 3.2], width: 0.6, rotation: 80, name: "A victim, the heart cut out" },
      sconce(27.7, 1.3),
      // T10: the stone block under two chains, hearts in the slot, the ash.
      { art: "Stone altar top", at: [32.0, 4.0], width: 1.3, name: "The dark stone block (the memory prism inside)" },
      { art: "Loose iron chain", at: [31.6, 3.5], width: 0.7 },
      { art: "Loose iron chain", at: [32.5, 3.5], width: 0.7, rotation: 90 },
      blood(30.6, 2.6, 0.7, 30), blood(32.6, 5.2, 0.8, 150),
      sconce(33.7, 2.3),
      // T3: three burst sacs, one intact nodule.
      { art: "Fungal caps", at: [21.4, 10.3], width: 1.9, rotation: 40, name: "Burst sac" },
      { art: "Fungal caps", at: [24.6, 12.6], width: 1.9, rotation: 200, name: "Burst sac" },
      { art: "Fungal caps", at: [21.2, 12.8], width: 1.6, rotation: 110, name: "Burst sac" },
      { art: "Web cocoons", at: [24.4, 10.3], width: 1.6, name: "The intact nodule (pulsing, warm)" },
      sconce(25.7, 13.7),
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("ash", "weather", { type: "myst", name: "Vuk's cloud of ash", settings: { MystFade: 0.45, MystSpeed: 0.3 }, areas: [{ rect: { x: 30, y: 2, width: 4, height: 4 } }] });
  for (const r of [
    { name: "T3 The nodule", note: "A full-grown Suraru, ready to hatch: bursts at a loud noise nearby or an Encounter roll, and attacks anything in sight.", rect: { x: 23.4, y: 9.4, width: 2, height: 1.8 } },
    { name: "T6 Scalding nozzles", note: "Weight on a drain: scalding water from the nozzle above. One chirp from a corner sconce is the only warning.", rect: { x: 4.2, y: 6, width: 4.6, height: 0.9 } },
    { name: "T7-T8 Forcefield", note: "Invisible; a minor shock on contact; only the pad in T7 (or pulling the board) turns it off.", rect: { x: 16, y: 3, width: 2, height: 1 } },
    { name: "T8 The grate", note: "Weight on the grate: a massive gush of superheated water from the ceiling nozzle (3 STR damage). One chirp first.", rect: { x: 19, y: 3, width: 2, height: 2 } },
    { name: "T9 Two Surarus", note: "Sleeping, eating, piling flesh by the growth. If one dies, the others slash the sac to wake the Imperator.", rect: { x: 24, y: 1.5, width: 3.5, height: 3 } },
    { name: "T10b Vuk", note: "An ash phantom circling the room; she cannot leave until she has eaten three human hearts.", rect: { x: 30.5, y: 2.5, width: 3, height: 3 } },
  ]) await step(`region ${r.name}`, "region", { kind: "trap", ...r });
  return finish(step, { name: "temple-studio", out: OUT, renders, plays: [{ name: "antechamber", token: [15, 14.5], light: "torch" }, { name: "light-room", token: [12.5, 4], light: "torch" }, { name: "tunnel", token: [3.5, 9], light: "torch" }] });
}

const k = await startKraken({ name: "Trouble in Twin Lakes", port: 47469 });
const step = stepper(k);
try {
  const only = process.env.MAP;
  if (!only || only === "deadmill") await deadmill(step);
  if (!only || only === "temple") await temple(step);
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
