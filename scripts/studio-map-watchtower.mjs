// The Empty Watchtower (games/descending-darkness): the yard, the upper floor and the
// crypt of the watch, made in Map Studio with its agent tools and the shipped art
// only, following skills/kraken-map-studio/SKILL.md, from entries 03 to 08: the
// ruined curtain wall with its fallen gaps, the dry well, the supply cart's rotting
// stores, the dead soldier behind the tower with the badge of the watch, the jammed
// stone door; the hall (table and benches, a cold brazier, the blood smear toward
// the stairs), the storeroom (barrels, crates, fallen plaster, steps down; the rat
// swarm), the stair room (the spiral stair, rubble, webs); upstairs Aldous's room
// (bed, letters, chest) and the beacon platform with its cold iron basket and the
// Grave Hound's den among the barrels; below, the hall of six opened tombs, the
// warden's chamber with two braziers burning blue before the empty coffin, the
// altar with the oath-ring, and the pay-chest's niche behind a secret door. Same
// rooms and doors as the hand-drawn maps (the upper floor's passage joined up).
//
// node scripts/studio-map-watchtower.mjs [out folder]   (default games/descending-darkness/maps)
// writes watchtower-yard-studio, watchtower-upper-studio and watchtower-crypt-studio
// (.webp, .walls.json) there; renders and portable projects go to the system's temp
// folder (printed). The book keeps its old maps until these are reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/descending-darkness/maps");
const RENDERS = path.join(tmpdir(), "kraken-watchtower");

async function rooms(step, { zones, areas, doors }) {
  for (const a of areas) {
    const z = zones[a.zone];
    const made = await step(a.name, "floor", { art: z.floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: !!a.room, feather: z.feather ?? 0 });
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
async function column(step, x, y, width = 1.0) {
  await step("column", "place", { art: "Stone column", at: [x, y], width, layer: "walls" });
  const r = 0.5; // on the half-square lines
  await step("column wall", "wall", { type: "wall", closed: true, points: [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]] });
}

// --- The yard (26 x 22) ------------------------------------------------------------------
async function yard(step) {
  const renders = path.join(RENDERS, "watchtower-yard-studio");
  mkdirSync(renders, { recursive: true });
  const W = 26, H = 22;
  await step("new map", "new", { name: "The Watchtower Yard", width: W, height: H, grid: 100, background: "#1b1a14" });
  const ground = await step("ground", "floor", { art: "Dry grass", rect: { x: 0, y: 0, width: W, height: H }, name: "The ridge" });
  await step("ground dim", "update", { id: ground.id, opacity: 0.6 });
  const dirt = await step("yard", "floor", { art: "Dirt", polygon: [[2.5, 2.5], [23.5, 2.5], [23.5, 19.5], [2.5, 19.5]], feather: 1, name: "The yard" });
  await step("yard soft", "update", { id: dirt.id, opacity: 0.55 });
  const court = await step("forecourt", "floor", { art: "Cobblestone", rect: { x: 12, y: 16, width: 5, height: 5 }, feather: 0.4, name: "Forecourt" });
  await step("forecourt dim", "update", { id: court.id, opacity: 0.85 });
  await paint(step, [
    { art: "Dirt", path: [[0.6, 1], [2, 4.5]], size: 2, opacity: 0.6 },
    { art: "Dirt", path: [[24.6, 16], [25.2, 20.5]], size: 2, opacity: 0.6 },
    { art: "Gravel", path: [[14.5, 21.8], [14.5, 20.6]], size: 1.4, opacity: 0.6 },
  ]);
  const zones = {
    hall: { floor: "Flagstone", wall: "Stone wall", outer: "Fieldstone wall", opacity: 0.75 },
    store: { floor: "Stone tiles, ruined", wall: "Stone wall", outer: "Fieldstone wall", opacity: 0.8 },
    stair: { floor: "Flagstone, cracked", wall: "Stone wall", outer: "Fieldstone wall", opacity: 0.8 },
  };
  const areas = [
    { zone: "hall", x: 10, y: 5, w: 9, h: 5, name: "The hall", room: true },
    { zone: "store", x: 10, y: 10, w: 4, h: 6, name: "The storeroom", room: true },
    { zone: "stair", x: 14, y: 10, w: 5, h: 6, name: "The stair room", room: true },
  ];
  const doors = [
    { from: [14, 10], to: [15, 10], art: "Door, old" },
    { from: [14, 13], to: [14, 14], art: "Door, old" },
    { from: [14, 16], to: [15, 16], art: "Door, iron", locked: true, name: "The stone door (jammed: Strength DC 12)" },
  ];
  const walls = await rooms(step, { zones, areas, doors });
  await walls();
  // The curtain wall, fallen in places (gaps west, east, north and the gate south).
  for (const pts of [[[2.5, 8], [2.5, 2.5], [9.5, 2.5]], [[21, 2.5], [23.5, 2.5], [23.5, 8]], [[2.5, 11], [2.5, 19.5], [7, 19.5]], [[19, 19.5], [23.5, 19.5], [23.5, 13]]]) await step("curtain wall", "wall", { art: "Fieldstone wall, tumbled", points: pts });
  await step("props", "place", {
    items: [
      // The yard: the dry well, the supply cart's rotting stores, the fallen wall, the dead watchman.
      { art: "Well, ruined", at: [6, 7], width: 1.5, name: "The well (deep and dry)" },
      { art: "Crates", at: [5.2, 15.4], width: 1.3, rotation: 10, name: "Supplies from the village (rotting)" },
      { art: "Sacks", at: [6.6, 15.6], width: 1, rotation: -15 },
      { art: "Barrel", at: [6.3, 16.6], width: 0.6 },
      { art: "Rubble", at: [2.6, 9.5], width: 1.5, rotation: 30 },
      { art: "Rubble, small", at: [3.3, 10.6], width: 0.8 },
      { art: "Rubble", at: [23.4, 10.4], width: 1.5, rotation: 110 },
      { art: "Boulder, cracked", at: [23.0, 12.0], width: 1.1 },
      { art: "Rubble, small", at: [15.2, 2.7], width: 1.0, rotation: 200 },
      { art: "Rocks", at: [11.6, 2.8], width: 0.8 },
      { art: "Skeleton", at: [20.6, 15.2], width: 0.8, rotation: 15, name: "Dead watchman (the badge of the watch in his fist)" },
      { art: "Bones", at: [21.4, 16.3], width: 0.5, rotation: 80 },
      // The burned ridge round the wall.
      { art: "Tree, dead", at: [1.2, 1.2], width: 3.2 },
      { art: "Tree, dead", at: [24.8, 1.0], width: 3.2, rotation: 90 },
      { art: "Tree, dead", at: [1.0, 20.6], width: 2.2, rotation: 200 },
      { art: "Tree, dead", at: [22.2, 21.0], width: 3.2, rotation: 300 },
      { art: "Tree, dead", at: [7.2, 0.8], width: 2, rotation: 150 },
      { art: "Bush, dead", at: [4.6, 11.6], width: 1 },
      { art: "Bush, dead", at: [21.4, 9.4], width: 1 },
      { art: "Bush, dead", at: [8.6, 19.4], width: 1 },
      { art: "Stump", at: [19.6, 0.9], width: 0.9 },
      { art: "Log", at: [4.0, 21.0], width: 2.4, rotation: 10 },
      { art: "Rocks", at: [8.0, 12.6], width: 0.6, rotation: 70 },
      // The hall: table and benches, the cold brazier, the blood smear toward the stairs.
      { art: "Table, tavern", at: [13.2, 6.6], width: 2.4 },
      { art: "Bench", at: [13.2, 5.75], width: 2.2 },
      { art: "Bench, broken", at: [13.2, 7.55], width: 2.2 },
      { art: "Lantern, broken", at: [12.6, 6.5], width: 0.35, name: "Cracked lamp; Aldous's note under the bowl" },
      { art: "Brazier", at: [18.2, 5.8], width: 0.85, name: "Cold brazier (wood in it: lit, bright light 20 ft)", light: { preset: "campfire", color: "#ff8a3d", bright: 20, dim: 40, animation: "flicker", speed: 40, strength: 60, on: false } },
      { art: "Blood stain", at: [13.6, 8.6], width: 0.9, rotation: 30, opacity: 0.8 },
      { art: "Blood stain", at: [14.4, 9.3], width: 0.7, rotation: 150, opacity: 0.7 },
      { art: "Spider web, corner", at: [10.6, 5.6], width: 1.1 },
      { art: "Weapon rack, toppled", at: [11.3, 8.9], width: 1.6, rotation: 10 },
      { art: "Chair, tipped over", at: [15.6, 6.4], width: 0.7, rotation: 30 },
      { art: "Barrel", at: [18.4, 9.4], width: 0.65 },
      { art: "Torch, burnt out", at: [16.8, 9.1], width: 0.25, rotation: 60 },
      { art: "Bones, scattered", at: [16.4, 7.9], width: 1.1, rotation: 40 },
      // The storeroom: barrels, crates, fallen plaster, the steps down to the crypt.
      { art: "Barrels", at: [11.0, 11.0], width: 1.4 },
      { art: "Crates", at: [12.9, 11.0], width: 1.2, rotation: 20 },
      { art: "Crate, broken", at: [12.9, 12.6], width: 0.9, rotation: 40, name: "Broken crate (the rats' nest)" },
      { art: "Rubble, small", at: [11.6, 13.0], width: 0.8, rotation: 60 },
      { art: "Narrow stairs", at: [11.0, 14.95], width: 1.5, rotation: 180, name: "Steps down to the crypt" },
      // The stair room: the spiral stair, rubble, webs.
      { art: "Semicircle stairs", at: [17.0, 11.4], width: 2.6, name: "Spiral stair (cracked steps near the top)" },
      { art: "Rubble, small", at: [15.5, 14.6], width: 0.9, rotation: 15 },
      { art: "Spider web, corner", at: [18.4, 15.4], width: 1.1, rotation: 180 },
      { art: "Spider web, torn", at: [15.0, 11.1], width: 0.9, rotation: 270 },
    ],
  });
  await step("ambient", "ambient", { preset: "dusk" });
  await step("wolves", "region", { kind: "trap", name: "Ash Wolves", note: "Three Ash Wolves attack where the road narrows by the ruined wall. Two lost and they flee; rations and Animal Handling DC 12 send them off.", rect: { x: 9, y: 19.5, width: 10, height: 2.5 } });
  await step("rats", "region", { kind: "trap", name: "Barrow Rats", note: "A swarm boils out of the broken crate when anyone comes near (two if the party is five).", rect: { x: 12, y: 11.8, width: 2, height: 1.6 } });
  await step("stair", "region", { kind: "trap", name: "Unsafe stair; the Gloomcrawler", note: "Cracked steps near the top: Perception DC 12 notices, Dexterity DC 12 each to cross or fall 15 ft (2d6). The Gloomcrawler drops from the webs on the last climber.", rect: { x: 15.6, y: 10.2, width: 2.8, height: 2.4 } });
  return finish(step, { name: "watchtower-yard-studio", out: OUT, renders, plays: [{ name: "gate", token: [14.5, 18], light: "torch" }, { name: "hall", token: [15, 8], light: "torch" }] });
}

// --- The upper floor (18 x 14) --------------------------------------------------------------
async function upper(step) {
  const renders = path.join(RENDERS, "watchtower-upper-studio");
  mkdirSync(renders, { recursive: true });
  await step("new map", "new", { name: "The Watchtower Upper Floor", width: 18, height: 14, grid: 100, background: "#0f0e0c" });
  const zones = {
    room: { floor: "Wood planks", wall: "Stone wall", opacity: 0.8 },
    roof: { floor: "Flagstone, mossy", wall: "Stone wall", outer: "Stone wall, ruined", opacity: 0.75 },
  };
  const areas = [
    { zone: "room", x: 2, y: 2, w: 6, h: 10, name: "Aldous's room", room: true },
    { zone: "room", x: 8, y: 6, w: 2, h: 1, name: "Passage" },
    { zone: "roof", x: 10, y: 2, w: 6, h: 10, name: "The beacon platform", room: true },
  ];
  const doors = [{ from: [10, 6], to: [10, 7], art: "Door, wooden" }];
  const walls = await rooms(step, { zones, areas, doors });
  await paint(step, [
    { art: "Moss", path: [[15.4, 11.4], [14.2, 11.6]], size: 0.9, opacity: 0.5 },
    { art: "Ash and soot", path: [[12.6, 6.4], [13.6, 6.8]], size: 1.6, opacity: 0.5 },
  ]);
  await walls();
  await step("props", "place", {
    items: [
      // Aldous's room: narrow bed, the table of letters, the chest; Aldous on the floor by the bed.
      { art: "Bed, single", at: [7.4, 3.2], width: 0.9 },
      { art: "Table, dark wood", at: [4.0, 3.4], width: 1.9, name: "Table: Aldous's journal, the muster roll" },
      { art: "Chair, dark wood", at: [4.0, 4.4], width: 0.45, rotation: 180 },
      { art: "Books, scattered", at: [4.2, 3.3], width: 0.8, rotation: 15, name: "Old letters" },
      { art: "Candles, melted", at: [3.3, 3.2], width: 0.4 },
      { art: "Chest", at: [7.3, 9.6], width: 0.8, rotation: 270 },
      { art: "Blood stain", at: [6.2, 4.9], width: 0.9, rotation: 70, opacity: 0.8, name: "Where Aldous lies" },
      { art: "Narrow stairs", at: [3.1, 10.2], width: 1.6, name: "Spiral stair down" },
      { art: "Rug, torn", at: [4.8, 7.2], width: 2.4, rotation: 90, opacity: 0.7 },
      { art: "Wardrobe", at: [2.7, 6.2], width: 1.2, rotation: 90 },
      // The beacon platform: the great iron basket, cold; the hound's den among the barrels.
      { art: "Campfire, cold", at: [13.5, 6.5], width: 2.6, name: "Beacon campfire (the great iron basket: wood and pitch, cold)", light: { preset: "campfire", color: "#ff8a3d", bright: 40, dim: 80, animation: "flicker", speed: 40, strength: 60, on: false } },
      { art: "Barrels", at: [14.9, 2.9], width: 1.5 },
      { art: "Barrel", at: [15.3, 4.3], width: 0.7 },
      { art: "Bones, scattered", at: [13.6, 9.6], width: 1.3, rotation: 40, name: "The Grave Hound's den" },
      { art: "Bones", at: [14.8, 5.2], width: 0.6, rotation: 120 },
      { art: "Rubble", at: [11.0, 10.7], width: 1.4, rotation: 70 },
      { art: "Rubble, small", at: [10.6, 2.6], width: 0.8 },
    ],
  });
  await step("ambient", "ambient", { preset: "dusk" });
  await step("hound", "region", { kind: "trap", name: "The Grave Hound", note: "Saranth's hound, from its den among the barrels: attacks anyone who comes near the beacon. Relighting the beacon takes an action with a flame (turn its light on).", rect: { x: 11.5, y: 4.5, width: 4, height: 4 } });
  return finish(step, { name: "watchtower-upper-studio", out: OUT, renders, plays: [{ name: "room", token: [5, 8], light: "torch" }] });
}

// --- The crypt of the watch (24 x 18) -----------------------------------------------------------
async function crypt(step) {
  const renders = path.join(RENDERS, "watchtower-crypt-studio");
  mkdirSync(renders, { recursive: true });
  const W = 24, H = 18;
  await step("new map", "new", { name: "The Crypt of the Watch", width: W, height: H, grid: 100, background: "#16130f" });
  const rock = await step("rock", "floor", { art: "Cave floor", rect: { x: 0, y: 0, width: W, height: H }, name: "Rock" });
  await step("rock dim", "update", { id: rock.id, opacity: 0.22 });
  const grit = await step("grit", "floor", { art: "Gravel", rect: { x: 0, y: 0, width: W, height: H }, name: "Grit" });
  await step("grit dim", "update", { id: grit.id, opacity: 0.14 });
  const zones = {
    hall: { floor: "Flagstone, cracked", wall: "Dungeon wall", opacity: 0.72 },
    tomb: { floor: "Flagstone, cracked", wall: "Dungeon wall, crumbling", opacity: 0.65 },
    warden: { floor: "Dungeon stone", wall: "Dungeon wall" },
    niche: { floor: "Stone tiles, ruined", wall: "Dungeon wall, crumbling", opacity: 0.7 },
  };
  const areas = [
    { zone: "hall", x: 2, y: 2, w: 4, h: 4, group: "hall", name: "Stair landing", room: true },
    { zone: "hall", x: 3, y: 6, w: 2, h: 2, group: "hall", name: "Passage" },
    { zone: "hall", x: 3, y: 8, w: 13, h: 3, group: "hall", name: "Hall of tombs", room: true },
    ...[6, 9, 12].flatMap((x) => [
      { zone: "tomb", x, y: 6, w: 1, h: 2, group: "hall", name: "Tomb (north)" },
      { zone: "tomb", x, y: 11, w: 1, h: 2, group: "hall", name: "Tomb (south)" },
    ]),
    { zone: "hall", x: 16, y: 9, w: 1, h: 1, group: "hall", name: "Door passage" },
    { zone: "warden", x: 17, y: 4, w: 5, h: 11, name: "The warden's chamber", room: true },
    { zone: "niche", x: 19, y: 15, w: 1, h: 1, name: "Niche passage" },
    { zone: "niche", x: 18, y: 16, w: 3, h: 1, name: "The treasure niche", room: true },
  ];
  const doors = [
    { from: [17, 9], to: [17, 10], art: "Door, old", name: "The warden's door (standing open)" },
    { from: [19, 15], to: [20, 15], kind: "secret", name: "Secret door behind the tomb (Investigation DC 15)" },
  ];
  const walls = await rooms(step, { zones, areas, doors });
  await paint(step, [
    { art: "Moss", path: [[3.4, 10.6], [4.2, 10.7]], size: 0.8, opacity: 0.6 },
    { art: "Gravel", path: [[8, 9.2], [9, 9.6]], size: 1.0, opacity: 0.6 },
    { art: "Moss", path: [[20.6, 16.6], [20.2, 16.7]], size: 0.6, opacity: 0.6 },
  ]);
  await walls();
  for (const [x, y] of [[17.5, 5.5], [21.5, 5.5], [17.5, 13.5], [21.5, 13.5]]) await column(step, x, y);
  const blue = { preset: "campfire", color: "#6fa8ff", bright: 10, dim: 25, animation: "flicker", speed: 30, strength: 60 };
  const tombs = [6.5, 9.5, 12.5].flatMap((x, i) => [
    { art: "Coffin, open", at: [x, 7.05], width: 0.62, rotation: 180, name: "Tomb of the watch (lid pushed aside)" },
    { art: "Coffin, open", at: [x, 11.95], width: 0.62, name: "Tomb of the watch (lid pushed aside)" },
  ]);
  await step("props", "place", {
    items: [
      { art: "Narrow stairs", at: [3.1, 3.0], width: 1.6, rotation: 180, name: "Stairs up to the storeroom" },
      { art: "Bones", at: [4.6, 4.6], width: 0.6, rotation: 30 },
      { art: "Spider web, corner", at: [5.4, 2.6], width: 1, rotation: 90 },
      ...tombs,
      { art: "Spider web, corner", at: [15.4, 8.6], width: 1, rotation: 90 },
      { art: "Rubble, small", at: [8.4, 9.4], width: 0.7, rotation: 40 },
      { art: "Bones, scattered", at: [11.0, 9.8], width: 1, rotation: 200 },
      { art: "Broken pottery", at: [14.2, 10.4], width: 0.6 },
      { art: "Temple weathered relief", at: [9.5, 8.2], width: 1.6, layer: "walls", opacity: 0.8 },
      // The warden's chamber: altar and oath-ring, the empty coffin, two braziers burning blue.
      { art: "Raised dais", at: [19.5, 5.4], width: 2.6, opacity: 0.9 },
      { art: "Altar", at: [19.5, 5.2], width: 1.6 },
      { art: "Grave goods", at: [19.5, 5.2], width: 0.45, name: "Saranth's oath-ring" },
      { art: "Sarcophagus, carved", at: [19.5, 9.2], width: 0.75, name: "The empty coffin ('The watch keeps what the watch is given')" },
      { art: "Brazier", at: [18.4, 7.5], width: 0.85, light: blue },
      { art: "Brazier", at: [20.6, 7.5], width: 0.85, light: blue },
      { art: "Bones", at: [20.6, 13.6], width: 0.6, rotation: 160 },
      { art: "Ceramic urn cluster", at: [18.0, 11.6], width: 1.0 },
      { art: "Broken pottery", at: [20.9, 11.9], width: 0.6, rotation: 80 },
      { art: "Spider web, corner", at: [21.4, 14.4], width: 1.0, rotation: 180 },
      { art: "Wall tapestry", at: [21.6, 9.5], width: 1.3, rotation: 90, layer: "walls", opacity: 0.85 },
      // The niche: the tower's last pay-chest.
      { art: "Chest", at: [19.5, 16.5], width: 0.75, name: "Pay-chest: 210 gc, healing water, Watchkeeper" },
      { art: "Spider web, corner", at: [18.4, 16.4], width: 0.8, rotation: 0 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("cold", "weather", { type: "myst", name: "Grave cold", settings: { MystFade: 0.3, MystSpeed: 0.15 }, areas: [{ rect: { x: 3, y: 6, width: 14, height: 7 } }] });
  await step("sentinels", "region", { kind: "trap", name: "Bone Sentinels", note: "Four Bone Sentinels stand in the hall: they attack anyone who enters without the badge of the watch; with it shown, they stand aside.", rect: { x: 5, y: 8, width: 9, height: 3 } });
  await step("saranth", "region", { kind: "trap", name: "Warden Saranth", note: "'Who comes? Give the word, or give your name to the dark.' He paces before his coffin. When the beacon burns, he lays down his sword and is still.", rect: { x: 17.5, y: 8, width: 4, height: 3 } });
  return finish(step, { name: "watchtower-crypt-studio", out: OUT, renders, plays: [{ name: "landing", token: [4, 4], light: "torch" }, { name: "hall", token: [10, 9.5], light: "torch" }, { name: "secret-door", token: [19.5, 13.5], light: "torch" }] });
}

const k = await startKraken({ name: "The Empty Watchtower", port: 47467 });
const step = stepper(k);
try {
  const only = process.env.MAP;
  if (!only || only === "yard") await yard(step);
  if (!only || only === "upper") await upper(step);
  if (!only || only === "crypt") await crypt(step);
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
