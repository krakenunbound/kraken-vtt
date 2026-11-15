// The Mill at Hob's Ford (games/basic-fantasy): the mill on the river bank and the
// cellars under it, made in Map Studio with its agent tools and the shipped art
// only, following skills/kraken-map-studio/SKILL.md, from entries 02 to 06: the
// millroom (the millstone, a table, the dog's blood and bones by the inner door, the
// stairs down), the storeroom (flour sacks, beer barrels, crates of stolen goods),
// the door hanging open over a floury path; below, the landing cut from the rock
// with its cobwebs, the goblin den (iron brazier, straw bedding, gnawed bones,
// crates against the south wall hiding the way on), the old shrine (four pillars,
// two open stone coffins either side of a black pool, the altar, three skeletons)
// and the hidden room behind the secret door (Hennet's strongbox, a dead thief).
// Same rooms and doors as the hand-drawn maps.
//
// node scripts/studio-map-hobs-ford.mjs [out folder]   (default games/basic-fantasy/maps)
// writes hobs-ford-mill-studio and hobs-ford-cellars-studio (.webp, .walls.json)
// there; renders and portable projects go to the system's temp folder (printed). The
// book keeps its old maps until these are reviewed.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";
import { wallRuns, stepper, finish } from "./studio-map-plan.mjs";

const OUT = path.resolve(process.argv[2] || "games/basic-fantasy/maps");
const RENDERS = path.join(tmpdir(), "kraken-hobs-ford");

async function rooms(step, { zones, areas, doors }) {
  for (const a of areas) {
    const z = zones[a.zone];
    const made = await step(a.name, "floor", { art: z.floor, rect: { x: a.x, y: a.y, width: a.w, height: a.h }, name: a.name, room: !!a.room, feather: z.feather ?? 0 });
    if (z.opacity) await step(`${a.name} dim`, "update", { id: made.id, opacity: z.opacity });
  }
  return async () => {
    for (const run of wallRuns(areas, doors, { zones })) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
    for (const d of doors) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, kind: d.kind ?? "door", ...(d.art ? { art: d.art } : {}), ...(d.locked ? { locked: true } : {}), ...(d.open ? { open: true } : {}) });
  };
}
async function paint(step, list) {
  for (const p of list) {
    const made = await step(`paint ${p.art}`, "paint", { art: p.art, path: p.path, size: p.size, softness: 80 });
    if (p.opacity) await step("paint soft", "update", { id: made.id, opacity: p.opacity });
  }
}
async function column(step, x, y) {
  await step("column", "place", { art: "Stone column", at: [x, y], width: 1.0, layer: "walls" });
  await step("column wall", "wall", { type: "wall", closed: true, points: [[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]] });
}

// --- The mill (24 x 18) ----------------------------------------------------------------------
async function mill(step) {
  const renders = path.join(RENDERS, "hobs-ford-mill-studio");
  mkdirSync(renders, { recursive: true });
  const W = 24, H = 18;
  await step("new map", "new", { name: "The Mill at Hob's Ford", width: W, height: H, grid: 100, background: "#1c2416" });
  await step("grass", "floor", { art: "Grass", rect: { x: 0, y: 0, width: W, height: H }, name: "The river bank" });
  // The river along the west, the millrace to the mill's wall, the path to the door.
  const bank = await step("bank", "floor", { art: "Mud", polygon: [[0, 0], [5.4, 0], [5.0, 6], [5.6, 12], [5.2, 18], [0, 18]], feather: 0.8, name: "Bank" });
  await step("bank soft", "update", { id: bank.id, opacity: 0.7 });
  await step("river", "wall", { art: "River", points: [[2.2, 0], [2.0, 6], [2.6, 12], [2.2, 18]] });
  await step("millrace", "wall", { art: "Stream", points: [[3.4, 6.5], [6, 6.6], [8.8, 6.6]] });
  await step("path", "wall", { art: "Dirt road", points: [[13.5, 11.2], [13.6, 14.5], [12.8, 18]] });
  await paint(step, [
    { art: "Sand", path: [[13.4, 11.4], [13.6, 13]], size: 0.9, opacity: 0.45 },
    { art: "Dirt", path: [[19, 13], [21, 13.6]], size: 1.4, opacity: 0.6 },
  ]);
  const zones = {
    mill: { floor: "Wood planks", wall: "Timber and plaster wall", outer: "Fieldstone wall", opacity: 0.85 },
    store: { floor: "Old planks", wall: "Timber and plaster wall", outer: "Fieldstone wall", opacity: 0.85 },
  };
  const areas = [
    { zone: "mill", x: 9, y: 4, w: 5, h: 7, name: "The millroom", room: true },
    { zone: "store", x: 14, y: 4, w: 4, h: 7, name: "The storeroom", room: true },
  ];
  const doors = [
    { from: [13, 11], to: [14, 11], art: "Door, wooden", open: true, name: "The mill door (hanging open)" },
    { from: [14, 7], to: [14, 8], art: "Door, wooden", name: "Inner door" },
  ];
  const walls = await rooms(step, { zones, areas, doors });
  await walls();
  await column(step, 12.5, 5.5);
  const lamp = { preset: "lantern", color: "#ffc070", bright: 10, dim: 25, animation: "flicker", speed: 20, strength: 30 };
  await step("props", "place", {
    items: [
      // The millroom: the millstone round its shaft, the table of stolen bread, the dog's blood.
      { art: "Ritual platform", at: [12.5, 5.5], width: 2.2, opacity: 0.85, name: "The millstone" },
      { art: "Narrow stairs", at: [9.95, 5.0], width: 1.5, rotation: 180, name: "Stairs down to the cellars" },
      { art: "Table, broken", at: [11.6, 8.6], width: 1.8 },
      { art: "Stools, scattered", at: [11.4, 9.8], width: 1.2, rotation: 30 },
      { art: "Sack, torn", at: [10.2, 10.2], width: 0.8, rotation: 50, name: "Flour, spilled" },
      { art: "Blood stain", at: [10.6, 7.6], width: 1, rotation: 20, opacity: 0.8 },
      { art: "Bones", at: [13.4, 7.6], width: 0.55, rotation: 70, name: "The miller's dog" },
      { art: "Lantern", at: [11.0, 8.4], width: 0.3, light: lamp },
      // The storeroom: flour sacks, beer barrels, the village's stolen goods.
      { art: "Sacks", at: [16.0, 4.8], width: 1.1 },
      { art: "Barrels", at: [16.9, 9.9], width: 1.3, name: "Beer barrels" },
      { art: "Crates", at: [16.3, 6.4], width: 1.2, rotation: 15, name: "Stolen goods: pots, a ham, a bolt of cloth" },
      { art: "Broken pottery", at: [15.7, 8.6], width: 0.6 },
      { art: "Crate", at: [17.4, 4.6], width: 0.7, rotation: -10 },
      // Outside: willows by the river, a boat, trees, bushes, the cart's load by the path.
      { art: "Tree, willow", at: [5.6, 2.2], width: 3.6 },
      { art: "Tree, oak", at: [21.8, 1.8], width: 3.6 },
      { art: "Tree, oak small", at: [21.4, 7.4], width: 2.6 },
      { art: "Tree, oak", at: [21.4, 16.2], width: 3.4 },
      { art: "Tree, willow", at: [6.2, 16.2], width: 3.4 },
      { art: "Rowboat", at: [2.4, 13.2], width: 2.6, rotation: 95 },
      { art: "Reeds", at: [4.4, 9.6], width: 1.3 },
      { art: "Reeds", at: [4.0, 4.4], width: 1.1, rotation: 90 },
      { art: "Lily pads", at: [1.6, 9.2], width: 1.2 },
      { art: "Bush", at: [7.4, 13.4], width: 1.1 },
      { art: "Bush, berry", at: [16.6, 14.2], width: 1 },
      { art: "Bush", at: [7.0, 2.4], width: 1 },
      { art: "Crates", at: [19.6, 13.2], width: 1.3, rotation: 20, name: "The cart's load, dumped" },
      { art: "Barrel, broken", at: [20.8, 13.8], width: 0.8 },
      { art: "Log", at: [7.6, 9.2], width: 2.2, rotation: 80, name: "Mill-wheel timbers" },
      { art: "Rocks", at: [3.6, 16.6], width: 0.8 },
    ],
  });
  await step("ambient", "ambient", { preset: "dusk" });
  await step("goblins", "region", { kind: "trap", name: "Three goblins", note: "Eating stolen bread; one watches the path. Surprise 1d6 each side (1-2). If two fall, the third flees down the stairs to warn Grisk (morale 7).", rect: { x: 10.5, y: 7.5, width: 3, height: 3 } });
  await step("ford", "region", { kind: "difficult", name: "The river", note: "Wide and shallow over stones.", rect: { x: 0.4, y: 0, width: 3.8, height: 18 } });
  return finish(step, { name: "hobs-ford-mill-studio", out: OUT, renders, plays: [{ name: "path", token: [13.5, 14], light: "none" }] });
}

// --- The cellars (22 x 16) -------------------------------------------------------------------
async function cellars(step) {
  const renders = path.join(RENDERS, "hobs-ford-cellars-studio");
  mkdirSync(renders, { recursive: true });
  const W = 22, H = 16;
  await step("new map", "new", { name: "The Cellars under the Mill", width: W, height: H, grid: 100, background: "#16130f" });
  const rock = await step("rock", "floor", { art: "Cave floor", rect: { x: 0, y: 0, width: W, height: H }, name: "Rock" });
  await step("rock dim", "update", { id: rock.id, opacity: 0.22 });
  const zones = {
    cave: { floor: "Cave floor", wall: "Cave wall", opacity: 0.9 },
    den: { floor: "Dirt", wall: "Cave wall", opacity: 0.8 },
    shrine: { floor: "Temple limestone", wall: "Dungeon wall, crumbling", opacity: 0.7 },
  };
  const areas = [
    { zone: "cave", x: 2, y: 2, w: 4, h: 4, group: "cellar", name: "The landing", room: true },
    { zone: "cave", x: 6, y: 3, w: 5, h: 1, group: "cellar", name: "East passage" },
    { zone: "cave", x: 3, y: 6, w: 1, h: 5, group: "cellar", name: "South passage" },
    { zone: "den", x: 11, y: 1, w: 7, h: 6, group: "den", name: "The goblin den", room: true },
    { zone: "den", x: 14, y: 7, w: 1, h: 3, group: "den", name: "Passage down" },
    { zone: "shrine", x: 10, y: 10, w: 9, h: 5, group: "den", name: "The old shrine", room: true },
    { zone: "cave", x: 2, y: 11, w: 5, h: 3, group: "hidden", name: "The hidden room", room: true },
  ];
  const doors = [
    { from: [11, 3], to: [11, 4], art: "Door, old", name: "Door to the den (unlocked)" },
    { from: [3, 11], to: [4, 11], kind: "secret", name: "Secret door (search: 1 on 1d6; 1-2 Dwarf or Elf)" },
  ];
  const walls = await rooms(step, { zones, areas, doors });
  await paint(step, [
    { art: "Moss", path: [[10.6, 14.4], [11.4, 14.6]], size: 0.8, opacity: 0.5 },
    { art: "Mud", path: [[14.5, 7.4], [14.5, 9.6]], size: 0.9, opacity: 0.5 },
  ]);
  const pool = await step("pool", "floor", { art: "Deep water", polygon: [[13.2, 11.1], [15.8, 11.1], [15.9, 12.0], [13.1, 12.0]], feather: 0.25, name: "The black pool", layer: "objects" });
  await step("pool dark", "update", { id: pool.id, opacity: 0.75 });
  await walls();
  for (const [x, y] of [[11.5, 11.5], [17.5, 11.5], [11.5, 13.5], [17.5, 13.5]]) await column(step, x, y);
  await step("props", "place", {
    items: [
      // The landing: the stair up, cobwebs.
      { art: "Narrow stairs", at: [3.0, 3.0], width: 1.5, name: "Stairs up to the millroom" },
      { art: "Spider web, corner", at: [5.3, 5.3], width: 1.1, rotation: 180 },
      { art: "Rocks", at: [4.9, 2.6], width: 0.6 },
      { art: "Rubble, small", at: [8.6, 3.5], width: 0.6, rotation: 30 },
      // The goblin den: iron brazier, straw bedding, gnawed bones, stolen crates; crates against the south wall.
      { art: "Brazier", at: [15.0, 3.4], width: 0.9, light: { preset: "campfire", color: "#ff8a3d", bright: 15, dim: 30, animation: "flicker", speed: 40, strength: 70 } },
      { art: "Bed, rotten", at: [12.0, 5.4], width: 0.9, rotation: 90, name: "Straw bedding" },
      { art: "Hide rug", at: [16.8, 5.2], width: 1.5, rotation: 80, name: "Grisk's bedding (the loot sack under it)" },
      { art: "Sack, torn", at: [17.3, 5.8], width: 0.6, name: "Goblin Den Loot" },
      { art: "Bones, scattered", at: [12.4, 2.2], width: 1.1, rotation: 20 },
      { art: "Crates", at: [16.8, 1.9], width: 1.3 },
      { art: "Crate", at: [13.8, 4.4], width: 0.7, rotation: 10, name: "Grisk's seat" },
      { art: "Crates", at: [14.5, 6.5], width: 1.3, rotation: 5, name: "Crates against the south wall (a crude skull scratched on them)" },
      { art: "Blood stain", at: [13.0, 3.8], width: 0.7, rotation: 120, opacity: 0.7 },
      { art: "Barrel", at: [17.5, 3.6], width: 0.6 },
      // The old shrine: open stone coffins, the altar, the dead lord's soldiers.
      { art: "Temple funerary slab", at: [12.6, 12.5], width: 1.6, rotation: 90, name: "Open stone coffin" },
      { art: "Temple funerary slab", at: [16.4, 12.5], width: 1.6, rotation: 90, name: "Open stone coffin" },
      { art: "Altar", at: [14.5, 13.8], width: 1.5, name: "Altar ('They kept faith'): holy symbol and holy water under the top" },
      { art: "Candles, melted", at: [14.0, 13.8], width: 0.4 },
      { art: "Rubble, small", at: [18.4, 14.5], width: 0.8, rotation: 60 },
      { art: "Bones", at: [13.1, 14.4], width: 0.5, rotation: 200 },
      { art: "Spider web, corner", at: [10.5, 10.5], width: 0.9 },
      // The hidden room: Hennet's strongbox, the dead thief.
      { art: "Chest", at: [5.7, 11.6], width: 0.8, name: "Old Hennet's strongbox (locked)" },
      { art: "Skeleton", at: [4.2, 13.1], width: 0.7, rotation: 100, name: "The dead thief (rusty dagger, three iron spikes)" },
      { art: "Spider web, corner", at: [6.4, 13.4], width: 0.8, rotation: 180 },
    ],
  });
  await step("ambient", "ambient", { preset: "night" });
  await step("skeletons", "region", { kind: "trap", name: "Three skeletons", note: "Stand up from the floor before the altar and attack anyone who enters; they pursue no further than the passage. Bones laid back in the coffins: they do not rise (+100 XP for a Cleric).", rect: { x: 12, y: 12.6, width: 5, height: 2 } });
  await step("grisk", "region", { kind: "trap", name: "Grisk and the goblins", note: "Grisk the hobgoblin (morale 8 at half hp) and three goblins (four if the mill's runner got away).", rect: { x: 12, y: 2.5, width: 5, height: 3 } });
  return finish(step, { name: "hobs-ford-cellars-studio", out: OUT, renders, plays: [{ name: "landing", token: [4, 4], light: "torch" }, { name: "den", token: [13, 4], light: "none" }] });
}

const k = await startKraken({ name: "The Mill at Hob's Ford", port: 47468 });
const step = stepper(k);
try {
  const only = process.env.MAP;
  if (!only || only === "mill") await mill(step);
  if (!only || only === "cellars") await cellars(step);
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
