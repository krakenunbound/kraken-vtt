// Map rules shared by the host and the browser: the grid, token footprints,
// distances, walls that stop movement, and line of sight. Positions are world
// coordinates (Foundry's padded scene origin); a token's x, y is its centre.

// The grid starts at the padded scene origin (see src/foundry/geometry.ts sceneFrame).
export function gridOrigin(scene) {
  const size = gridSize(scene);
  return {
    x: Math.ceil(scene.padding * scene.width * (1 / size)) * size,
    y: Math.ceil(scene.padding * scene.height * (1 / size)) * size,
  };
}

export function gridSize(scene) {
  const size = Number(scene?.grid?.size);
  return size > 0 ? size : 100;
}

// The centre a token of `squares` squares snaps to when dropped at x, y: its
// footprint lines up with the grid, as FG and Foundry snap tokens.
export function snapCenter(scene, x, y, squares = 1) {
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
export function doorOpen(wall, doors) {
  if (!(wall.door > 0)) return false;
  const state = doors && wall.id in doors ? doors[wall.id] : wall.ds;
  return state === 1;
}

export function blocksMove(wall, doors) {
  return Number(wall.move) !== 0 && !doorOpen(wall, doors);
}

// Whether a wall can block sight at all (Foundry: sense NONE never does, an
// open door never does).
export function blocksSight(wall, doors) {
  return Number(wall.sight) !== 0 && !doorOpen(wall, doors);
}

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
export function sightEdges(origin, walls, doors, distancePixels = 1, externalRadius = 0) {
  const edges = [];
  for (const wall of walls) {
    if (!blocksSight(wall, doors)) continue;
    const where = side(wall, origin);
    if (!where) continue;
    if (wall.dir && where === Number(wall.dir)) continue;
    const sight = Number(wall.sight);
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
export function visibilityPolygon(origin, walls, doors, bounds, distancePixels = 1, externalRadius = 0) {
  const segments = [];
  const { x: bx, y: by, width: bw, height: bh } = bounds;
  segments.push([bx, by, bx + bw, by, false], [bx + bw, by, bx + bw, by + bh, false], [bx + bw, by + bh, bx, by + bh, false], [bx, by + bh, bx, by, false]);
  for (const edge of sightEdges(origin, walls, doors, distancePixels, externalRadius)) segments.push([edge.x1, edge.y1, edge.x2, edge.y2, edge.limited]);
  const anyLimited = segments.some((segment) => segment[4]);
  const angles = [];
  for (const [x1, y1, x2, y2] of segments) {
    for (const [px, py] of [
      [x1, y1],
      [x2, y2],
    ]) {
      const angle = Math.atan2(py - origin.y, px - origin.x);
      angles.push(angle - 1e-4, angle, angle + 1e-4);
    }
  }
  angles.sort((a, b) => a - b);
  const reach = (bw + bh) * 4;
  const points = [];
  let last = NaN;
  for (const angle of angles) {
    if (angle - last < 1e-7) continue;
    last = angle;
    const ex = origin.x + Math.cos(angle) * reach;
    const ey = origin.y + Math.sin(angle) * reach;
    let nearest = 1;
    const limited = anyLimited ? [] : null;
    for (const [x1, y1, x2, y2, isLimited] of segments) {
      const t = crossing(origin.x, origin.y, ex, ey, x1, y1, x2, y2);
      if (t === null) continue;
      if (isLimited) limited.push(t);
      else if (t < nearest) nearest = t;
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
export function sceneSight(scene, origin, doors, externalRadius = 0) {
  const offset = gridOrigin(scene);
  const per = Number(scene?.grid?.distance) > 0 ? Number(scene.grid.distance) : 5;
  return visibilityPolygon(origin, scene.walls ?? [], doors, { x: offset.x, y: offset.y, width: scene.width, height: scene.height }, gridSize(scene) / per, externalRadius);
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
