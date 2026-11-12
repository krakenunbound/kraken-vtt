// A starship's deck plans, worked out from the ship: Kraken's own layout of
// its decks (no published plan), the same every time for the same ship. A
// deck is a grid of squares (1.5 m), the nose to the left: the bridge (or a
// hold, below) forward, engineering aft, a corridor down the middle and the
// rooms packed along both sides of it, each with a door onto the corridor; a
// lift on the same square of every deck; an airlock with an outer door; fuel
// tanks sealed. The walls and doors are worked out from where the rooms meet
// (src/ships/deckRender.ts draws it and makes the map).

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const room = (kind, name, w, extra = {}) => ({ kind, name, w, ...extra });

// What each design carries, deck by deck (beyond the bridge, the staterooms,
// the turrets and engineering, which every ship has).
const PLANS = {
  Courier: { decks: [["common", "airlock", "cargo:4", "fuel:3"]] },
  "Free Trader": { decks: [["common", "medbay", "airlock"], ["cargo:9", "fuel:3", "airlock", "workshop"]], passengers: 4 },
  "Salvage Tug": { decks: [["common", "medbay", "workshop", "airlock"], ["cargo:10", "fuel:3", "airlock", "vehicle:4"]] },
  "Patrol Cutter": { decks: [["common", "medbay", "armoury", "brig", "airlock"], ["boat:6", "cargo:4", "fuel:3", "airlock", "armoury"]] },
  Corsair: { decks: [["common", "armoury", "brig", "airlock"], ["cargo:10", "fuel:3", "boat:5", "airlock"]] },
  Fighter: { fighter: true },
};
const NAMES = { common: "Galley", medbay: "Medbay", armoury: "Armoury", brig: "Cells", workshop: "Workshop", airlock: "Airlock", cargo: "Cargo Hold", fuel: "Fuel", boat: "Small Craft Bay", vehicle: "Vehicle Bay", stateroom: "Stateroom", turret: "Turret", lift: "Lift" };
const WIDTH = { common: 4, medbay: 3, armoury: 2, brig: 3, workshop: 3, airlock: 2, stateroom: 2, turret: 1 };

export function layout(ship) {
  const data = ship?.data ?? ship ?? {};
  const design = PLANS[data.class] ?? PLANS["Free Trader"];
  const tons = num(data.tons, 200);
  const weapons = Object.values(data.weapons ?? {}).filter((weapon) => !/fixed/i.test(String(weapon.mount ?? "")));
  if (design.fighter) return { decks: [fighterDeck(data)], square: 1.5 };
  const height = tons >= 350 ? 11 : tons >= 150 ? 9 : 7;
  const half = Math.floor(height / 2);
  const staterooms = Math.max(2, num(data.crewcount, 4) + (design.passengers ?? 0));
  const decks = design.decks.map((items, index) => {
    const extras = items.map((item) => {
      const [kind, width] = item.split(":");
      return room(kind, NAMES[kind], Number(width) || WIDTH[kind] || 3);
    });
    const list = [...(index === 0 ? Array.from({ length: staterooms }, (_, n) => room("stateroom", `${NAMES.stateroom} ${n + 1}`, 2)) : []), ...extras];
    if (index === 0) weapons.forEach((weapon, n) => list.push(room("turret", `Turret ${n + 1}`, 1, { weapon: weapon.name })));
    return { name: `Deck ${index + 1}`, front: index === 0 ? room("bridge", "Bridge", height >= 9 ? 4 : 3) : null, rear: room("engineering", index === 0 ? "Engineering" : "Drive Room", 4), list };
  });
  // Every deck the same length: the longest side of the longest deck.
  const sideLength = (list) => {
    const sides = [0, 0];
    for (const item of list.slice().sort((a, b) => b.w - a.w)) sides[sides[0] <= sides[1] ? 0 : 1] += item.w;
    return sides;
  };
  const middle = Math.max(...decks.map((deck) => Math.max(...sideLength(deck.list)))) + 1;
  const front = Math.max(...decks.map((deck) => deck.front?.w ?? 0), 3);
  const length = front + middle + 4;
  return { decks: decks.map((deck, index) => buildDeck(deck, index, length, height, half, front)), square: 1.5 };
}

// The grid: cells hold a zone (-1 outside the hull, 0 the corridor, 1.. a room).
function buildDeck(deck, index, length, height, half, front) {
  const cells = Array.from({ length: height }, () => Array(length).fill(-1));
  const rooms = [];
  const add = (spec, x, y, w, h, door) => {
    const id = rooms.length + 1;
    rooms.push({ id, ...spec, x, y, w, h, door });
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) if (cells[row]?.[col] !== undefined) cells[row][col] = id;
    return id;
  };
  // The corridor, nose to engineering.
  for (let col = front; col < length - 4; col++) cells[half][col] = 0;
  // Forward: the bridge (or, below, a store) across the hull; aft: engineering.
  const forward = deck.front ?? room("cargo", "Forward Hold", front);
  add({ ...forward, w: front }, 0, 0, front, height, { x: front, y: half, side: "left" });
  add(deck.rear, length - 4, 0, 4, height, { x: length - 4, y: half, side: "left" });
  // The lift, on the same square of every deck.
  const lift = add(room("lift", NAMES.lift, 1), front, half, 1, 1, null);
  rooms[lift - 1].open = true;
  // The rooms along both sides, the widest first, each side filled from the bow.
  const cursor = [front, front];
  const sorted = deck.list.slice().sort((a, b) => b.w - a.w);
  for (const item of sorted) {
    const side = cursor[0] <= cursor[1] ? 0 : 1;
    const x = cursor[side];
    const y = side === 0 ? 0 : half + 1;
    const h = half;
    const doorX = x + Math.floor((item.w - 1) / 2);
    // A sealed tank has no door; an airlock opens outward too.
    const door = item.kind === "fuel" ? null : { x: doorX, y: side === 0 ? half : half, side: side === 0 ? "top" : "bottom" };
    const id = add(item, x, y, item.w, h, door);
    if (item.kind === "airlock") rooms[id - 1].outer = { x: doorX, y: side === 0 ? 0 : height - 1, side: side === 0 ? "top" : "bottom" };
    cursor[side] += item.w;
  }
  // What is left between the rooms and engineering: passages of the corridor.
  for (const side of [0, 1]) {
    const from = cursor[side];
    const to = length - 4;
    if (to - from > 0) add(index > 0 && to - from >= 3 ? room("cargo", "Hold", to - from) : room("store", "Stores", to - from), from, side === 0 ? 0 : half + 1, to - from, half, { x: from + Math.floor((to - from - 1) / 2), y: half, side: side === 0 ? "top" : "bottom" });
  }
  // The hull tapers at the nose and is cut back at the stern corners.
  const taper = Math.max(1, Math.floor(half / 2));
  for (let row = 0; row < height; row++) {
    const fromEdge = Math.min(row, height - 1 - row);
    for (let col = 0; col < taper - fromEdge; col++) cells[row][col] = -1;
    if (fromEdge === 0) cells[row][length - 1] = -1;
  }
  return { name: deck.name, index, cols: length, rows: height, cells, rooms, walls: wallsOf(cells, rooms) };
}

function fighterDeck(data) {
  const cells = [
    [-1, 1, 1, 2, 2, -1],
    [1, 1, 1, 2, 2, 2],
    [-1, 1, 1, 2, 2, -1],
  ];
  const rooms = [
    { id: 1, kind: "bridge", name: "Cockpit", x: 0, y: 0, w: 3, h: 3, door: null },
    { id: 2, kind: "engineering", name: "Drive", x: 3, y: 0, w: 3, h: 3, door: { x: 3, y: 1, side: "left" } },
  ];
  return { name: "Cockpit", index: 0, cols: 6, rows: 3, cells, rooms, walls: wallsOf(cells, rooms), fighter: String(data.class ?? "") };
}

// Walls: every square's edge between two different zones (the hull's edge
// too), joined into runs; doors where a room's door is (and an airlock's
// outer door). In squares: { x1, y1, x2, y2, door }.
export function wallsOf(cells, rooms) {
  const rows = cells.length;
  const cols = cells[0].length;
  const zone = (col, row) => (row < 0 || col < 0 || row >= rows || col >= cols ? -1 : cells[row][col]);
  const doors = new Set();
  const open = new Set(rooms.filter((item) => item.open).map((item) => item.id));
  for (const item of rooms) {
    for (const door of [item.door, item.outer]) {
      if (!door) continue;
      // A door is the edge on the room's side facing the corridor (or space).
      if (door.side === "left") doors.add(`v:${door.x}:${door.y}`);
      if (door.side === "top") doors.add(`h:${door.x}:${door === item.outer ? door.y : door.y}`);
      if (door.side === "bottom") doors.add(`h:${door.x}:${door === item.outer ? door.y + 1 : door.y + 1}`);
    }
  }
  const walls = [];
  // Vertical edges (between col-1 and col, on row).
  for (let col = 0; col <= cols; col++) {
    let run = null;
    for (let row = 0; row <= rows; row++) {
      const a = zone(col - 1, row);
      const b = zone(col, row);
      const wall = row < rows && a !== b && !(a === -1 && b === -1) && !(open.has(a) && b === 0) && !(open.has(b) && a === 0);
      const door = wall && doors.has(`v:${col}:${row}`);
      if (door) walls.push({ x1: col, y1: row, x2: col, y2: row + 1, door: true });
      if (wall && !door) run = run ?? { x1: col, y1: row };
      if ((!wall || door) && run) {
        walls.push({ x1: col, y1: run.y1, x2: col, y2: row, door: false });
        run = null;
      }
    }
  }
  // Horizontal edges (between row-1 and row, on col).
  for (let row = 0; row <= rows; row++) {
    let run = null;
    for (let col = 0; col <= cols; col++) {
      const a = zone(col, row - 1);
      const b = zone(col, row);
      const wall = col < cols && a !== b && !(a === -1 && b === -1) && !(open.has(a) && b === 0) && !(open.has(b) && a === 0);
      const door = wall && doors.has(`h:${col}:${row}`);
      if (door) walls.push({ x1: col, y1: row, x2: col + 1, y2: row, door: true });
      if (wall && !door) run = run ?? { x1: col, y1: row };
      if ((!wall || door) && run) {
        walls.push({ x1: run.x1, y1: row, x2: col, y2: row, door: false });
        run = null;
      }
    }
  }
  return walls;
}
