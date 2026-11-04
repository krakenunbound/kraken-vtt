// Map rules shared by the host and the browser: the grid, token footprints,
// distances, walls that stop movement, and line of sight. Positions are world
// coordinates (Foundry's padded scene origin); a token's x, y is its centre.

// The picture starts at the padded scene origin (see src/foundry/geometry.ts sceneFrame).
export function sceneOrigin(scene) {
  const size = gridSize(scene);
  return {
    x: Math.ceil(scene.padding * scene.width * (1 / size)) * size,
    y: Math.ceil(scene.padding * scene.height * (1 / size)) * size,
  };
}

// The grid starts there too, moved by the GM's offset (FG's Adjust Position).
export function gridOrigin(scene) {
  const origin = sceneOrigin(scene);
  return { x: origin.x + (Number(scene?.grid?.offsetX) || 0), y: origin.y + (Number(scene?.grid?.offsetY) || 0) };
}

export function gridSize(scene) {
  const size = Number(scene?.grid?.size);
  return size > 0 ? size : 100;
}

// The grid's kind from Foundry's type: 0 none, 1 square, 2-3 hex rows
// (pointy-topped), 4-5 hex columns (flat-topped).
export function gridKind(scene) {
  const type = Number(scene?.grid?.type ?? 1);
  if (type === 0) return "none";
  if (type === 2 || type === 3) return "hexrow";
  if (type === 4 || type === 5) return "hexcol";
  return "square";
}
const KIND_TYPE = { none: 0, square: 1, hexrow: 2, hexcol: 4 };

// The scene with the GM's grid settings over its own (FG's Grid tab: type,
// cell size, offset, colour, opacity, distance): what the rules and the map use.
export function withGrid(scene, settings) {
  if (!scene || !settings) return scene;
  const grid = { ...scene.grid };
  if (settings.type && KIND_TYPE[settings.type] !== undefined) grid.type = KIND_TYPE[settings.type];
  if (Number(settings.size) >= 10) grid.size = Number(settings.size);
  if (settings.offsetX != null) grid.offsetX = Number(settings.offsetX) || 0;
  if (settings.offsetY != null) grid.offsetY = Number(settings.offsetY) || 0;
  if (settings.color) grid.color = settings.color;
  if (settings.alpha != null) grid.alpha = Number(settings.alpha);
  if (Number(settings.distance) > 0) grid.distance = Number(settings.distance);
  if (settings.units) grid.units = settings.units;
  return { ...scene, grid };
}

// Hexes (size: the distance between neighbouring centres, flat side to flat
// side): the nearest centre, and hex steps between two points.
function hexAxes(scene) {
  const size = gridSize(scene);
  const radius = size / Math.sqrt(3);
  return { size, radius, columns: gridKind(scene) === "hexcol" };
}
function cubeRound(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}
export function hexOf(scene, x, y) {
  const { radius, columns } = hexAxes(scene);
  const origin = gridOrigin(scene);
  const px = x - origin.x;
  const py = y - origin.y;
  return columns ? cubeRound(((2 / 3) * px) / radius, ((-1 / 3) * px + (Math.sqrt(3) / 3) * py) / radius) : cubeRound(((Math.sqrt(3) / 3) * px - (1 / 3) * py) / radius, ((2 / 3) * py) / radius);
}
export function hexCenter(scene, q, r) {
  const { radius, columns } = hexAxes(scene);
  const origin = gridOrigin(scene);
  return columns ? { x: origin.x + radius * 1.5 * q, y: origin.y + radius * Math.sqrt(3) * (r + q / 2) } : { x: origin.x + radius * Math.sqrt(3) * (q + r / 2), y: origin.y + radius * 1.5 * r };
}
export function hexCorners(scene, q, r) {
  const { radius, columns } = hexAxes(scene);
  const c = hexCenter(scene, q, r);
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i + (columns ? 0 : 30));
    out.push(c.x + radius * Math.cos(angle), c.y + radius * Math.sin(angle));
  }
  return out;
}

// The centre a token of `squares` squares snaps to when dropped at x, y: its
// footprint lines up with the grid, as FG and Foundry snap tokens.
export function snapCenter(scene, x, y, squares = 1) {
  const kind = gridKind(scene);
  if (kind === "hexrow" || kind === "hexcol") {
    const { q, r } = hexOf(scene, x, y);
    return hexCenter(scene, q, r);
  }
  if (kind === "none") return { x, y };
  const size = gridSize(scene);
  const origin = gridOrigin(scene);
  const span = Math.max(1, squares) * size;
  const left = Math.round((x - span / 2 - origin.x) / size) * size + origin.x;
  const top = Math.round((y - span / 2 - origin.y) / size) * size + origin.y;
  return { x: left + span / 2, y: top + span / 2 };
}

// Squares a creature of a given space (feet) fills, FG's calcTokenSpace:
// rounded up to a quarter square, never under a quarter.
export function tokenSquares(space, unitsPerSquare = 5) {
  const feet = Number(space);
  if (!(feet > 0) || !(unitsPerSquare > 0)) return 1;
  return Math.max(Math.ceil((feet / unitsPerSquare) * 4) / 4, 0.25);
}

// Distance from a to b in the scene's units. diagonal is FG's distance
// multiplier for a diagonal step (HRDD): 1 counts every square as one,
// 1.5 is the 5-10-5 variant, "raw" is a straight-line measure.
export function gridDistance(scene, a, b, diagonal = 1) {
  const size = gridSize(scene);
  const per = Number(scene?.grid?.distance) > 0 ? Number(scene.grid.distance) : 5;
  const kind = gridKind(scene);
  if ((kind === "hexrow" || kind === "hexcol") && diagonal !== "raw") {
    const from = hexOf(scene, a.x, a.y);
    const to = hexOf(scene, b.x, b.y);
    const steps = (Math.abs(from.q - to.q) + Math.abs(from.q + from.r - to.q - to.r) + Math.abs(from.r - to.r)) / 2;
    return Math.round(steps * per * 10) / 10;
  }
  const dx = Math.abs(Math.round((b.x - a.x) / size));
  const dy = Math.abs(Math.round((b.y - a.y) / size));
  let squares;
  if (diagonal === "raw") squares = Math.hypot((b.x - a.x) / size, (b.y - a.y) / size);
  else if (diagonal === 1.5) squares = Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
  else squares = Math.max(dx, dy);
  return Math.round(squares * per * 10) / 10;
}

// Foundry wall senses: 0 none, 10 limited, 20 normal, 30 proximity, 40 distance.
// doorState: 0 closed, 1 open, 2 locked.
// A door, a window or a toggle wall (FG's toggleable) that is open now.
export function doorOpen(wall, doors) {
  if (!(wall.door > 0) && !(wall.toggle && wall.toggle !== "none")) return false;
  const state = doors && wall.id in doors ? doors[wall.id] : wall.ds;
  return state === 1;
}

// FG's hidden occluder: a wall toggled off blocks nothing.
const off = (wall, doors) => Boolean(wall.hidden) || doorOpen(wall, doors);

export function blocksMove(wall, doors) {
  return Number(wall.move) !== 0 && !off(wall, doors);
}

// Whether a wall can block a sense at all (Foundry: sense NONE never does, an
// open door never does). sense: "sight" (default) or "light".
export function blocksSight(wall, doors, sense = "sight") {
  return Number(wall[sense] ?? wall.sight) !== 0 && !off(wall, doors);
}

// The wall kinds the GM draws, FG's names with Foundry's senses (sight,
// light, sound, move: 0 none, 10 limited, 20 normal, 30 proximity; door: 1
// door, 2 secret). A window sees through (FG), or only close up (Foundry,
// windowStyle "proximity").
export const WALL_KINDS = {
  wall: { sight: 20, light: 20, sound: 20, move: 20, door: 0 },
  terrain: { sight: 10, light: 10, sound: 10, move: 20, door: 0 },
  door: { sight: 20, light: 20, sound: 20, move: 20, door: 1 },
  secret: { sight: 20, light: 20, sound: 20, move: 20, door: 2 },
  toggle: { sight: 20, light: 20, sound: 20, move: 20, door: 0, toggle: "gm" },
  window: { sight: 0, light: 0, sound: 20, move: 20, door: 0, toggle: "players" },
  illusion: { sight: 20, light: 20, sound: 0, move: 0, door: 0 },
  invisible: { sight: 0, light: 0, sound: 0, move: 20, door: 0 },
  ethereal: { sight: 20, light: 20, sound: 0, move: 0, door: 0 },
  shadow: { sight: 0, light: 20, sound: 0, move: 0, door: 0 },
};

// Foundry's Edge#orientPoint: which side of a -> b the point is on.
// 1 left, 2 right, 0 on the line.
function side(wall, point) {
  const orientation = (wall.y1 - point.y) * (wall.x2 - point.x) - (wall.x1 - point.x) * (wall.y2 - point.y);
  if (orientation === 0) return 0;
  return orientation < 0 ? 1 : 2;
}

function distanceToWall(point, wall) {
  return distanceToSegment(point.x, point.y, wall.x1, wall.y1, wall.x2, wall.y2);
}

// The walls that shape what a viewer at origin sees, as Foundry's clockwise
// sweep chooses them (_testEdgeInclusion): no sight-less walls or open doors,
// none collinear with the viewer, no one-way wall seen from its open side,
// and proximity / distance walls only when their threshold says so.
// Limited walls come back marked: sight passes the first and stops at the second.
export function sightEdges(origin, walls, doors, distancePixels = 1, externalRadius = 0, sense = "sight") {
  const edges = [];
  for (const wall of walls) {
    if (!blocksSight(wall, doors, sense)) continue;
    const where = side(wall, origin);
    if (!where) continue;
    if (wall.dir && where === Number(wall.dir)) continue;
    const sight = Number(wall[sense] ?? wall.sight);
    if (sight >= 30 && wall.threshold > 0) {
      const reach = wall.threshold * distancePixels;
      const d = distanceToWall(origin, wall);
      if (sight === 30 ? Math.max(d - externalRadius, 0) < reach : d + externalRadius > reach) continue;
    }
    edges.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, limited: sight === 10 });
  }
  return edges;
}

// Where along a -> b (0..1) it first crosses segment c -> d, or null.
function crossing(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

// The first wall that stops a token moving in a straight line, as a fraction of the move.
export function firstBlock(walls, doors, from, to) {
  let best = null;
  for (const wall of walls) {
    if (!blocksMove(wall, doors)) continue;
    const t = crossing(from.x, from.y, to.x, to.y, wall.x1, wall.y1, wall.x2, wall.y2);
    if (t !== null && t > 1e-6 && (best === null || t < best)) best = t;
  }
  return best;
}

// Where a dragged token ends up: its snapped drop point, or, when a wall is in
// the way, the last square before the wall along its path (its start when
// none is free). snap false keeps the exact point (Alt held).
export function settleMove(scene, walls, doors, from, to, squares = 1, { snap = true, collide = true } = {}) {
  const place = (point) => (snap ? snapCenter(scene, point.x, point.y, squares) : point);
  const target = place(to);
  if (!collide || firstBlock(walls, doors, from, target) === null) return { ...target, blocked: false };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const step = gridSize(scene) / 4;
  for (let along = length; along > 0; along -= step) {
    const f = along / length;
    const candidate = place({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f });
    if (firstBlock(walls, doors, from, candidate) === null) return { ...candidate, blocked: true };
  }
  return { x: from.x, y: from.y, blocked: true };
}

// The area a viewer at origin can see: a polygon [x0, y0, x1, y1, ...] bounded
// by the walls that block sight and the rectangle bounds {x, y, width, height}
// (Foundry clips sight to the scene rectangle, not its padding).
// distancePixels: pixels per scene unit, for wall thresholds; externalRadius:
// the viewer's own radius (half a token), as Foundry's token vision uses.
export function visibilityPolygon(origin, walls, doors, bounds, distancePixels = 1, externalRadius = 0, sense = "sight", radius = 0, cone = null) {
  let { x: bx, y: by, width: bw, height: bh } = bounds;
  // A light reaches only so far: its square around it, inside the scene.
  if (radius > 0) {
    const left = Math.max(bx, origin.x - radius);
    const top = Math.max(by, origin.y - radius);
    const right = Math.min(bx + bw, origin.x + radius);
    const bottom = Math.min(by + bh, origin.y + radius);
    if (right > left && bottom > top) {
      bx = left;
      by = top;
      bw = right - left;
      bh = bottom - top;
    }
  }
  const segments = [];
  segments.push([bx, by, bx + bw, by, false], [bx + bw, by, bx + bw, by + bh, false], [bx + bw, by + bh, bx, by + bh, false], [bx, by + bh, bx, by, false]);
  const inBox = (x1, y1, x2, y2) => !(Math.max(x1, x2) < bx || Math.min(x1, x2) > bx + bw || Math.max(y1, y2) < by || Math.min(y1, y2) > by + bh);
  for (const edge of sightEdges(origin, walls, doors, distancePixels, externalRadius, sense)) if (inBox(edge.x1, edge.y1, edge.x2, edge.y2)) segments.push([edge.x1, edge.y1, edge.x2, edge.y2, edge.limited]);
  const anyLimited = segments.some((segment) => segment[4]);
  // Each corner once (chained walls share their ends), three rays round it.
  const angles = [];
  const corners = new Set();
  for (const [x1, y1, x2, y2] of segments) {
    for (const [px, py] of [
      [x1, y1],
      [x2, y2],
    ]) {
      const key = `${Math.round(px * 4)},${Math.round(py * 4)}`;
      if (corners.has(key)) continue;
      corners.add(key);
      const angle = Math.atan2(py - origin.y, px - origin.x);
      angles.push(angle - 1e-4, angle, angle + 1e-4);
    }
  }
  angles.sort((a, b) => a - b);
  // A cone (FG's light angle and rotation): only the rays inside it, from its
  // first edge round to its last, and the light itself as the first point.
  let rays = angles;
  if (cone && cone.angle < 360) {
    const start = cone.from;
    const span = (cone.angle * Math.PI) / 180;
    const rel = (angle) => ((angle - start) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
    rays = [start, ...angles.filter((angle) => rel(angle) > 1e-6 && rel(angle) < span - 1e-6).sort((a, b) => rel(a) - rel(b)), start + span];
  }
  const reach = (bw + bh) * 4;
  // Many walls: a grid of cells over the area, each listing the walls in it,
  // so a ray tests only the walls in the cells it crosses.
  const many = segments.length > 120;
  const cells = Math.max(8, Math.min(96, Math.round(Math.sqrt(segments.length) * 1.5)));
  const cw = bw / cells;
  const ch = bh / cells;
  const grid = many ? Array.from({ length: cells * cells }, () => []) : null;
  if (grid) {
    segments.forEach((segment, index) => {
      const [x1, y1, x2, y2] = segment;
      const c0 = Math.max(0, Math.min(cells - 1, Math.floor((Math.min(x1, x2) - bx) / cw)));
      const c1 = Math.max(0, Math.min(cells - 1, Math.floor((Math.max(x1, x2) - bx) / cw)));
      const r0 = Math.max(0, Math.min(cells - 1, Math.floor((Math.min(y1, y2) - by) / ch)));
      const r1 = Math.max(0, Math.min(cells - 1, Math.floor((Math.max(y1, y2) - by) / ch)));
      for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) grid[r * cells + c].push(index);
    });
  }
  const stamp = new Int32Array(segments.length);
  let ray = 0;
  const points = cone && cone.angle < 360 ? [Math.round(origin.x), Math.round(origin.y)] : [];
  let last = NaN;
  for (const angle of rays) {
    if (Math.abs(angle - last) < 1e-7) continue;
    last = angle;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const ex = origin.x + dx * reach;
    const ey = origin.y + dy * reach;
    let nearest = 1;
    const limited = anyLimited ? [] : null;
    const test = (index) => {
      const [x1, y1, x2, y2, isLimited] = segments[index];
      const t = crossing(origin.x, origin.y, ex, ey, x1, y1, x2, y2);
      if (t === null) return;
      if (isLimited) limited.push(t);
      else if (t < nearest) nearest = t;
    };
    if (!grid) for (let index = 0; index < segments.length; index += 1) test(index);
    else {
      // Amanatides & Woo: walk the cells along the ray, nearest first.
      ray += 1;
      let c = Math.max(0, Math.min(cells - 1, Math.floor((origin.x - bx) / cw)));
      let r = Math.max(0, Math.min(cells - 1, Math.floor((origin.y - by) / ch)));
      const stepC = dx > 0 ? 1 : -1;
      const stepR = dy > 0 ? 1 : -1;
      const tDeltaC = dx !== 0 ? Math.abs(cw / (dx * reach)) : Infinity;
      const tDeltaR = dy !== 0 ? Math.abs(ch / (dy * reach)) : Infinity;
      let tMaxC = dx !== 0 ? (bx + (c + (dx > 0 ? 1 : 0)) * cw - origin.x) / (dx * reach) : Infinity;
      let tMaxR = dy !== 0 ? (by + (r + (dy > 0 ? 1 : 0)) * ch - origin.y) / (dy * reach) : Infinity;
      for (let guard = 0; guard < cells * 2 + 4; guard += 1) {
        for (const index of grid[r * cells + c]) {
          if (stamp[index] === ray) continue;
          stamp[index] = ray;
          test(index);
        }
        const leave = Math.min(tMaxC, tMaxR);
        const limitedStop = limited && limited.length > 1 ? limited.slice().sort((a, b) => a - b)[1] : Infinity;
        if (Math.min(nearest, limitedStop) <= leave) break;
        if (tMaxC < tMaxR) {
          c += stepC;
          tMaxC += tDeltaC;
        } else {
          r += stepR;
          tMaxR += tDeltaR;
        }
        if (c < 0 || r < 0 || c >= cells || r >= cells) break;
      }
    }
    if (limited && limited.length > 1) {
      limited.sort((a, b) => a - b);
      if (limited[1] < nearest) nearest = limited[1];
    }
    points.push(Math.round(origin.x + (ex - origin.x) * nearest), Math.round(origin.y + (ey - origin.y) * nearest));
  }
  return points;
}

// What a viewer at origin sees on a scene: clipped to the scene rectangle,
// with wall thresholds in the scene's units.
export function sceneSight(scene, origin, doors, externalRadius = 0, sense = "sight", radius = 0, cone = null) {
  const offset = sceneOrigin(scene);
  const per = Number(scene?.grid?.distance) > 0 ? Number(scene.grid.distance) : 5;
  return visibilityPolygon(origin, scene.walls ?? [], doors, { x: offset.x, y: offset.y, width: scene.width, height: scene.height }, gridSize(scene) / per, externalRadius, sense, radius, cone);
}

export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const xi = polygon[i];
    const yi = polygon[i + 1];
    const xj = polygon[j];
    const yj = polygon[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Whether any of these polygons shows point x, y. A point on a polygon's
// edge (a door in the wall that bounds the view) counts within `slack`.
export function seen(x, y, polygons, slack = 0) {
  for (const polygon of polygons) {
    if (pointInPolygon(x, y, polygon)) return true;
    if (slack > 0) {
      for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        if (distanceToSegment(x, y, polygon[j], polygon[j + 1], polygon[i], polygon[i + 1]) <= slack) return true;
      }
    }
  }
  return false;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// SiegeCore's health status (onHealthStatus): dead at -10 current hit points,
// dying at -7, unconscious at 0, else CoreRPG's wounded / heavy by percent.
// The token dot colour follows CoreRPG's token health gradient.
export function healthStatus(total, wounds, { dead = -10, dying = -7 } = {}) {
  const hp = Number(total) || 0;
  const hurt = Number(wounds) || 0;
  const percent = hp > 0 ? Math.min(Math.max(hurt / hp, 0), 1) : 0;
  let status;
  if (hp <= 0 || hurt <= 0) status = "Healthy";
  else if (hp - hurt <= dead) status = "Dead";
  else if (hp - hurt <= dying) status = "Dying";
  else if (hp - hurt <= 0) status = "Unconscious";
  else status = percent >= 0.5 ? "Heavy" : "Wounded";
  return { status, percent, color: healthColor(status, percent) };
}

const STATUS_COLOR = { Dead: "#404040", Dying: "#404040", Unconscious: "#6C2DC7" };

function healthColor(status, percent) {
  if (STATUS_COLOR[status]) return STATUS_COLOR[status];
  if (percent >= 1) return "#C0C0C0";
  if (percent <= 0) return "#00C000";
  const top = [0, 192, 0];
  const mid = [255, 192, 0];
  const bottom = [255, 0, 0];
  const [from, to, grade] = percent >= 0.5 ? [mid, bottom, (percent - 0.5) * 2] : [top, mid, percent * 2];
  const channel = (i) => Math.floor(to[i] * grade + from[i] * (1 - grade) + 0.5);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// --- Light and darkness -------------------------------------------------------
// Darkness at or above this level (0 day .. 1 pitch black), players see only
// lit areas and what their darkvision reaches.
export const NEEDS_LIGHT = 0.5;

// CoreRPG's token light presets (VisionManager), bright and dim in squares.
// Colours are warmer than CoreRPG's near-white so flame reads as flame.
export const LIGHT_PRESETS = {
  candle: { name: "Candle", bright: 1, dim: 2, color: "#FFC46B" },
  lamp: { name: "Lamp", bright: 3, dim: 9, color: "#FFB45C" },
  torch: { name: "Torch", bright: 4, dim: 8, color: "#FF9E3D" },
  lantern: { name: "Lantern", bright: 6, dim: 12, color: "#FFD08A" },
  light: { name: "Light spell", bright: 4, dim: 8, color: "#F2F5FF" },
};

// How far a C&C character sees in complete darkness, in feet, from its
// senses line: Deepvision and Darkvision ("in shades of gray", PHB). 0 for none.
export function sensesRange(senses) {
  const text = String(senses ?? "").toLowerCase();
  let best = 0;
  for (const match of text.matchAll(/(darkvision|deepvision)\s*(\d+)/g)) best = Math.max(best, Number(match[2]));
  return best;
}

// Twilight Vision (elves, PHB): colour and detail under starlight, moonlight
// or torchlight, but no sight in complete darkness.
export function hasTwilightVision(senses) {
  return /twilight vision|low-light vision/i.test(String(senses ?? ""));
}

// Whether any light reaches point: inside its dim radius and its own line of sight.
export function lit(x, y, lights) {
  for (const light of lights) {
    if (Math.hypot(x - light.x, y - light.y) > light.dimPx) continue;
    if (!light.polygon || pointInPolygon(x, y, light.polygon)) return true;
  }
  return false;
}
