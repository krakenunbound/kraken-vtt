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

// Limited (terrain) and proximity/distance (window) walls let sight through.
export function blocksSight(wall, doors) {
  const sight = Number(wall.sight);
  return sight === 20 && !doorOpen(wall, doors);
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
// by the walls that block sight and the rectangle bounds {x, y, width, height}.
export function visibilityPolygon(origin, walls, doors, bounds) {
  const segments = [];
  const { x: bx, y: by, width: bw, height: bh } = bounds;
  segments.push([bx, by, bx + bw, by], [bx + bw, by, bx + bw, by + bh], [bx + bw, by + bh, bx, by + bh], [bx, by + bh, bx, by]);
  for (const wall of walls) {
    if (blocksSight(wall, doors)) segments.push([wall.x1, wall.y1, wall.x2, wall.y2]);
  }
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
    for (const [x1, y1, x2, y2] of segments) {
      const t = crossing(origin.x, origin.y, ex, ey, x1, y1, x2, y2);
      if (t !== null && t < nearest) nearest = t;
    }
    points.push(Math.round(origin.x + (ex - origin.x) * nearest), Math.round(origin.y + (ey - origin.y) * nearest));
  }
  return points;
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
