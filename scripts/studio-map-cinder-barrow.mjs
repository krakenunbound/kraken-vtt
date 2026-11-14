// The Cinder Barrow (games/ironsworn, the Ironsworn starter) made in Map Studio
// with its agent tools (kraken_map_studio) and the shipped art only (Kraken Map
// Art, Battle Map Forge), following skills/kraken-map-studio/SKILL.md: the rooms
// as "03 Into the Barrow" describes them, floors blended, wall art on every wall
// line with its line-of-sight wall, doors in the gaps, props that tell the
// story, lights on the braziers, smoke in the burning hall, traps on the coffins.
//
// node scripts/studio-map-cinder-barrow.mjs [out folder]   (default games/ironsworn/maps)
// writes cinder-barrow-studio.webp and cinder-barrow-studio.walls.json there, and
// renders (picture, editor, play test) plus the portable project in the
// system's temp folder (printed). The book still uses its old map until the
// new one is reviewed and swapped in.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { startKraken } from "./studio-agent-harness.mjs";

const OUT = path.resolve(process.argv[2] || "games/ironsworn/maps");
const RENDERS = path.join(tmpdir(), "kraken-cinder-barrow");
mkdirSync(RENDERS, { recursive: true });
const W = 30, H = 20;

// --- the plan, in squares ------------------------------------------------------------
// zone: which floor and which wall art. Rooms are boxes of whole squares.
const ZONES = {
  out: { floor: "Snow", wall: null },
  entry: { floor: "Dirt", wall: "Fieldstone wall, tumbled", dim: 0.75 },
  passage: { floor: "Flagstone, cracked", wall: "Dungeon wall" },
  hall: { floor: "Dungeon stone", wall: "Dungeon wall" },
  tomb: { floor: "Flagstone, cracked", wall: "Dungeon wall, crumbling", dim: 0.75 },
  burning: { floor: "Flagstone, cracked", wall: "Dungeon wall", dim: 0.8 },
  tunnel: { floor: "Cave floor", wall: "Cave wall" },
  vault: { floor: "Stone tiles, ruined", wall: "Dungeon wall, crumbling", dim: 0.7 },
};
const AREAS = [
  ["out", 0, 8, 2, 4, "The barrow's mouth"],
  ["entry", 2, 9, 3, 2, "Entry passage"],
  ["passage", 5, 9, 4, 2, "Entry passage, paved"],
  ["hall", 9, 6, 7, 8, "Hall of four pillars"],
  ["passage", 12, 3, 1, 3, "North passage"],
  ["tomb", 10, 0.5, 5, 2.5, "North tomb"],
  ["passage", 12, 14, 1, 2, "South passage"],
  ["tomb", 10, 16, 5, 3, "South tomb"],
  ["tunnel", 16, 9, 3, 2, "Smoke tunnel"],
  ["burning", 19, 7, 6, 6, "The burning hall"],
  ["tunnel", 25, 9, 2, 1, "Collapsed tunnel"],
  ["tunnel", 27, 5, 2, 9, "Collapsed tunnel"],
  ["passage", 22, 13, 1, 2, "Vault stair"],
  ["vault", 19, 15, 6, 4, "The hidden vault"],
];
// Openings: edges between floors that get a door (from, to on the wall line), and edges left open.
const DOORS = [
  { from: [9, 9], to: [9, 11], art: "Double door", name: "Hall doors" },
  { from: [12, 3], to: [13, 3], art: "Door, old" },
  { from: [12, 16], to: [13, 16], art: "Door, old" },
  { from: [19, 9], to: [19, 11], art: "Double door, iron", name: "Burning hall doors" },
  { from: [22, 13], to: [23, 13], kind: "secret" },
];

// Floor cells (half squares, so the north tomb's 2.5 squares fit) and their zones.
const S = 2;
const cells = new Map();
for (const [zone, x, y, w, h] of AREAS) for (let cx = x * S; cx < (x + w) * S; cx++) for (let cy = y * S; cy < (y + h) * S; cy++) cells.set(`${cx},${cy}`, zone);
const zoneAt = (cx, cy) => cells.get(`${cx},${cy}`);
// Door edges (unit edges, in half squares): walls stop there (a secret door's wall line carries on).
const doorEdges = new Set();
const secretEdges = new Set();
for (const d of DOORS) {
  const [x1, y1] = d.from.map((v) => v * S), [x2, y2] = d.to.map((v) => v * S);
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i < steps; i++) {
    const a = [x1 + Math.sign(x2 - x1) * i, y1 + Math.sign(y2 - y1) * i], b = [a[0] + Math.sign(x2 - x1), a[1] + Math.sign(y2 - y1)];
    (d.kind === "secret" ? secretEdges : doorEdges).add(`${a}|${b}`).add(`${b}|${a}`);
  }
}
// Boundary edges: floor beside rock (or the map's edge, except the open mouth), and the secret door's line.
// Each is drawn in the floor's wall art, in the direction that keeps the floor on its right.
const edges = [];
for (const [key, zone] of cells) {
  if (!ZONES[zone].wall) continue;
  const [cx, cy] = key.split(",").map(Number);
  for (const [dx, dy, a, b] of [[0, -1, [cx, cy], [cx + 1, cy]], [1, 0, [cx + 1, cy], [cx + 1, cy + 1]], [0, 1, [cx + 1, cy + 1], [cx, cy + 1]], [-1, 0, [cx, cy + 1], [cx, cy]]]) {
    const other = zoneAt(cx + dx, cy + dy), k = `${a}|${b}`;
    if (doorEdges.has(k)) continue;
    const secret = secretEdges.has(k) && zone === "burning";
    if (other && !secret) continue;
    if (other === "out" || (!other && zone === "entry" && cx + dx < 0)) continue;
    edges.push({ a, b, art: ZONES[zone].wall });
  }
}
// Joined into the longest paths of one wall art each (corners mitred by the Wall tool).
function chains(list) {
  const out = [];
  const byArt = new Map();
  for (const e of list) (byArt.get(e.art) ?? byArt.set(e.art, []).get(e.art)).push(e);
  for (const [art, group] of byArt) {
    const from = new Map();
    for (const e of group) (from.get(String(e.a)) ?? from.set(String(e.a), []).get(String(e.a))).push(e);
    const used = new Set();
    const into = new Map();
    for (const e of group) into.set(String(e.b), (into.get(String(e.b)) ?? 0) + 1);
    const starts = group.filter((e) => !group.some((f) => String(f.b) === String(e.a))).concat(group);
    for (const first of starts) {
      if (used.has(first)) continue;
      const pts = [first.a];
      let e = first;
      while (e && !used.has(e)) {
        used.add(e);
        pts.push(e.b);
        const next = (from.get(String(e.b)) ?? []).filter((f) => !used.has(f));
        // at a corner where two rooms touch diagonally, keep turning right (the floor stays on the right)
        e = next.length === 1 ? next[0] : next.find((f) => (f.b[0] - f.a[0]) * (e.b[1] - e.a[1]) - (f.b[1] - f.a[1]) * (e.b[0] - e.a[0]) < 0) ?? next[0];
      }
      const closed = String(pts[0]) === String(pts.at(-1));
      // straight runs: only the corners
      const corners = pts.filter((p, i) => {
        if (i === 0 || i === pts.length - 1) return true;
        const [a, b] = [pts[i - 1], pts[i + 1]];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      if (closed) corners.pop();
      out.push({ art, closed, points: corners.map(([x, y]) => [x / S, y / S]) });
    }
  }
  return out;
}

const k = await startKraken({ name: "The Cinder Barrow", port: 47462 });
const step = async (label, action, args) => {
  try {
    return await k.studio(action, args);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
};
try {
  await step("new map", "new", { name: "The Cinder Barrow", width: W, height: H, grid: 100, background: "#16130f" });
  // The rock the barrow is cut into, everywhere, then the floors, blended at their edges.
  const rock = await step("rock", "floor", { art: "Cave floor", rect: { x: 0, y: 0, width: W, height: H }, name: "Barrow rock" });
  await step("rock dim", "update", { id: rock.id, opacity: 0.22 });
  // A second ground with another tile size over it, so the rock's repeat does not show.
  const grit = await step("grit", "floor", { art: "Gravel", rect: { x: 0, y: 0, width: W, height: H }, name: "Barrow grit" });
  await step("grit dim", "update", { id: grit.id, opacity: 0.14 });
  for (const [zone, x, y, w, h, name] of AREAS) {
    const room = ["hall", "tomb", "burning", "vault"].includes(zone);
    const made = await step(name, "floor", { art: ZONES[zone].floor, rect: { x, y, width: w, height: h }, name, room, feather: zone === "out" ? 1 : zone === "tunnel" || zone === "entry" ? 0.35 : 0 });
    // Pale floors dimmed against the dark: a barrow, not a bathhouse.
    if (ZONES[zone].dim || zone === "out") await step(`${name} dim`, "update", { id: made.id, opacity: ZONES[zone].dim ?? 0.8 });
  }
  // Where one floor meets another: worn soft blends, grime along the walls, the cave's own floor over the collapse.
  // The mouth: snow blown into the passage, earth trodden over the first paving stones.
  const drift = await step("snow drift", "paint", { art: "Snow", path: [[1.6, 9.5], [2.8, 10.2], [2.2, 10.7]], size: 1.3, softness: 80 });
  await step("snow drift soft", "update", { id: drift.id, opacity: 0.7 });
  const entryDirt = await step("entry to paving", "paint", { art: "Dirt", path: [[4.6, 9.6], [5.8, 10.4]], size: 1.6, softness: 80 });
  await step("entry dirt soft", "update", { id: entryDirt.id, opacity: 0.65 });
  await step("ash before the altar", "paint", { art: "Gravel", path: [[19.6, 10], [21, 10]], size: 1.4, softness: 80 });
  await step("tomb moss", "paint", { art: "Moss", path: [[14.6, 2.6], [14.2, 2.8]], size: 0.8, softness: 80 });
  await step("collapse spill", "paint", { art: "Gravel", path: [[27.4, 6], [28.4, 7.6], [27.6, 9]], size: 1.6, softness: 70 });
  await step("tomb damp", "paint", { art: "Moss", path: [[10.3, 18.6], [11.2, 18.7]], size: 0.8, softness: 80 });
  const pool = await step("black pool", "floor", { art: "Deep water", polygon: [[27.3, 10.1], [28.7, 10.0], [28.9, 11.2], [28.2, 12.1], [27.2, 11.6]], feather: 0.45, name: "The black pool", layer: "objects" });
  await step("black pool dark", "update", { id: pool.id, opacity: 0.7 });

  // Wall art on every wall line (with its line-of-sight wall); gaps where the doors go.
  const runs = chains(edges);
  for (const run of runs) await step(`wall ${run.art}`, "wall", { art: run.art, points: run.points, closed: run.closed });
  // Doors in the gaps; the secret door cuts the wall's line of sight but keeps its art.
  for (const d of DOORS) await step(`door ${d.from}`, "door", { from: d.from, to: d.to, kind: d.kind ?? "door", art: d.art });

  // The hall of four pillars: columns (their own walls), two braziers that never go out.
  for (const [x, y] of [[11.5, 8.5], [13.5, 8.5], [11.5, 11.5], [13.5, 11.5]]) {
    await step("column", "place", { art: "Stone column", at: [x, y], width: 1.15, layer: "walls" });
    await step("column wall", "wall", { type: "wall", closed: true, points: [[x - 0.38, y - 0.38], [x + 0.38, y - 0.38], [x + 0.38, y + 0.38], [x - 0.38, y + 0.38]] });
  }
  const ember = { preset: "campfire", color: "#ff8a3d", bright: 15, dim: 30, animation: "flicker", speed: 40, strength: 75 };
  await step("hall props", "place", {
    items: [
      { art: "Ritual platform", at: [12.5, 10], width: 2.4, layer: "objects", opacity: 0.9 },
      { art: "Brazier", at: [12.5, 9.5], width: 0.85, light: ember },
      { art: "Brazier", at: [12.5, 10.5], width: 0.85, light: ember },
      { art: "Blood stain", at: [10.3, 12.6], width: 1.1, rotation: 30 },
      { art: "Bones, scattered", at: [14.6, 6.9], width: 1.2, rotation: -20 },
      { art: "Cracked flagstone scatter", at: [10.2, 7.2], width: 1.4 },
      { art: "Worn rune fragment", at: [15.2, 12.9], width: 1, rotation: 15 },
      { art: "Broken pottery", at: [9.6, 13.4], width: 0.7 },
      { art: "Temple weathered relief", at: [12.5, 6.45], width: 2, rotation: 0, layer: "walls" },
      { art: "Spider web, corner", at: [15.4, 6.6], width: 1.2, rotation: 90 },
    ],
  });
  // Entry passage: bones, the fallen stone, a dead torch, snow at the mouth.
  await step("entry props", "place", {
    items: [
      { art: "Boulder, cracked", at: [3.4, 9.6], width: 1.2, rotation: 40 },
      { art: "Rubble, small", at: [2.6, 10.6], width: 0.8 },
      { art: "Skeleton", at: [6.4, 10.3], width: 0.75, rotation: 75 },
      { art: "Bones", at: [7.6, 9.4], width: 0.6, rotation: 10 },
      { art: "Torch, burnt out", at: [8.4, 10.8], width: 0.3, rotation: -60 },
      { art: "Rocks", at: [0.8, 8.6], width: 1 },
      { art: "Bush, dead", at: [0.7, 11.4], width: 1.1 },
      { art: "Grass tuft", at: [1.5, 8.4], width: 0.6 },
    ],
  });
  // The north and south tombs: Hallar's oath-sworn on their slabs.
  for (const [y, flip] of [[1.75, 0], [17.5, 180]]) {
    await step("tomb props", "place", {
      items: [
        { art: "Temple funerary slab", at: [11, y], width: 1.7, rotation: flip },
        { art: "Temple funerary slab", at: [14, y], width: 1.7, rotation: flip },
        { art: "Ceramic urn cluster", at: [12.5, flip ? 18.4 : 1.1], width: 0.9 },
        { art: "Candles, melted", at: [12.5, flip ? 17.4 : 2.2], width: 0.6 },
        { art: "Spider web, corner", at: [flip ? 10.6 : 14.4, flip ? 18.4 : 1.1], width: 1, rotation: flip ? 180 : 90 },
        { art: "Bones", at: [flip ? 13.3 : 11.7, flip ? 16.6 : 2.6], width: 0.55, rotation: 40 },
      ],
    });
  }
  // The burning hall: the altar with the oath-stone, four braziers, scorched stone, the warden's smoke.
  const fierce = { preset: "campfire", color: "#ff6a26", bright: 15, dim: 35, animation: "flicker", speed: 60, strength: 80 };
  await step("burning hall props", "place", {
    items: [
      { art: "Raised dais", at: [22, 10], width: 3.2 },
      { art: "Altar, desecrated", at: [22, 10], width: 1.8 },
      { art: "Worn rune fragment", at: [22, 10.1], width: 0.5 },
      { art: "Brazier", at: [19.7, 7.7], width: 0.95, light: fierce },
      { art: "Brazier", at: [24.3, 7.7], width: 0.95, light: fierce },
      { art: "Brazier", at: [19.7, 12.3], width: 0.95, light: fierce },
      { art: "Brazier", at: [24.3, 12.3], width: 0.95, light: fierce },
      { art: "Bones, scattered", at: [23.6, 11.2], width: 1, rotation: 120 },
      { art: "Cracked flagstone scatter", at: [20.6, 11.6], width: 1.3, rotation: 90 },
      { art: "Wall tapestry", at: [22, 7.25], width: 1.6, layer: "walls" },
    ],
  });
  // The collapsed tunnel: rubble, the fall, the black pool, cave growth.
  await step("tunnel props", "place", {
    items: [
      { art: "Rubble", at: [28, 5.9], width: 1.8, rotation: 20 },
      { art: "Boulder", at: [27.6, 6.6], width: 1.1 },
      { art: "Rubble, small", at: [17.5, 9.4], width: 0.8, rotation: 70 },
      { art: "Rocks", at: [18.3, 10.6], width: 0.6 },
      { art: "Rocks", at: [28.6, 8.2], width: 0.7, rotation: 100 },
      { art: "Mushrooms", at: [27.5, 12.7], width: 0.6 },
      { art: "Fungal caps", at: [28.4, 13.3], width: 0.9 },
      { art: "Rubble, small", at: [26.2, 9.5], width: 0.6, rotation: 140 },
      { art: "Bones", at: [28.5, 9.4], width: 0.5, rotation: 200 },
    ],
  });
  // The hidden vault: the clan's stores rotted to dust, Hallar's oath-ring in an iron chest.
  await step("vault props", "place", {
    items: [
      { art: "Storage cache", at: [20.2, 16.1], width: 1.8 },
      { art: "Sack, torn", at: [21.6, 15.8], width: 0.8, rotation: 20 },
      { art: "Barrel, broken", at: [19.7, 18.1], width: 0.8 },
      { art: "Crate, broken", at: [20.8, 18.3], width: 0.9, rotation: 15 },
      { art: "Funerary lid", at: [23.6, 16.5], width: 1.6, rotation: 90 },
      { art: "Chest, iron", at: [23.8, 18.2], width: 0.9, rotation: -10 },
      { art: "Bones, scattered", at: [22.2, 17.6], width: 1, rotation: 60 },
      { art: "Spider web, corner", at: [24.4, 15.6], width: 1.1, rotation: 90 },
      { art: "Candles, melted", at: [22.6, 15.6], width: 0.5 },
    ],
  });
  // Night underground: only the braziers light the barrow; smoke hangs in the burning hall.
  await step("ambient", "ambient", { preset: "night" });
  await step("smoke", "weather", { type: "myst", name: "Brazier smoke", settings: { MystFade: 0.45, MystSpeed: 0.3 }, areas: [{ rect: { x: 19, y: 7, width: 6, height: 6 } }, { rect: { x: 16, y: 9, width: 3, height: 2 } }] });
  // The coffins: the oath-sworn rise when one is opened.
  for (const [x, y, name] of [[11, 1.75, "North coffin"], [14, 1.75, "North coffin"], [11, 17.5, "South coffin"], [14, 17.5, "South coffin"]])
    await step("trap", "region", { kind: "trap", name, note: "Opened: two Barrow Dead rise (The Oath-Sworn).", rect: { x: x - 0.9, y: y - 0.6, width: 1.8, height: 1.2 } });

  const check = await step("check", "check", {});
  console.log("check:", JSON.stringify(check, null, 1));
  // A map that ships with Kraken: the shipped packs' art and nothing else.
  if (check.art.outside.length) throw new Error(`art outside the shipped packs: ${check.art.outside.join(", ")}`);
  const summary = await step("map", "map", { detail: false });
  console.log("map:", JSON.stringify(summary));
  for (const [view, extra] of [["picture", {}], ["editor", { lighting: true }], ["play", { token: [3.5, 10.5], light: "torch", vision: "normal" }], ["play", { token: [21.5, 9.5], light: "none", vision: "normal", file: path.join(RENDERS, "play-burning-hall.png") }]]) {
    const made = await step(`render ${view}`, "render", { view, file: extra.file ?? path.join(RENDERS, `${view}.png`), ...extra });
    console.log("render:", made.file, made.width, made.height);
  }
  const exported = await step("export", "export", { folder: OUT, name: "cinder-barrow-studio", portable: false });
  console.log("export:", JSON.stringify(exported));
  const portable = await step("portable", "export", { folder: RENDERS, name: "cinder-barrow-studio" });
  console.log("portable:", portable.project);
  await step("save project", "save", {});
} finally {
  if (!process.env.KEEP_OPEN) await k.close();
}
