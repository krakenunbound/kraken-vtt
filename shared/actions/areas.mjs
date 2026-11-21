// @ts-check
// Area templates (a Fireball's sphere, Burning Hands' cone, Lightning Bolt's
// line, Thunderwave's cube) on a map: their shape in pixels for the map's grid,
// where they sit when placed, and which tokens they cover. Shared by the host
// (it decides who is inside) and the browser (it draws the template and the
// squares it covers while it is being placed). Positions are world pixels; a
// token's x, y is its centre (shared/map/geometry.mjs).
//
// The rule for who is inside (the 5E DMG's, Foundry's "coverage"): a grid
// square is in the area when its centre is inside the shape; a creature is in
// when any square it fills is. On a gridless map, its centre must be inside.
// Walls that stop movement between the area's origin and a square stop the
// area there (a fireball does not burn through a wall; a closed door holds).

/** @typedef {{ shape: "circle" | "cone" | "line" | "square", x: number, y: number, size: number, width?: number, angle?: number, spread?: number }} Shape */
/** Feet: the shape's size in the game's units; px: in world pixels. */

// A 5E cone is as wide as it is long at its end: half its angle is atan(1/2).
export const CONE_HALF = Math.atan(0.5);

const EPS = 1e-6;

// A template in pixels from one in feet: size and width scaled by the grid
// (gridPx pixels a square, feetPerSquare feet a square).
/** @param {{ shape: Shape["shape"], x: number, y: number, size: number, width?: number, angle?: number, spread?: number }} template @param {number} gridPx @param {number} feetPerSquare @returns {Shape} */
export function toPixels(template, gridPx, feetPerSquare) {
  const per = gridPx / (feetPerSquare > 0 ? feetPerSquare : 5);
  return {
    shape: template.shape,
    x: template.x,
    y: template.y,
    size: Math.max(0, Number(template.size) || 0) * per,
    width: Math.max(0, Number(template.width ?? 5) || 5) * per,
    angle: Number(template.angle) || 0,
    ...(template.spread ? { spread: template.spread } : {}),
  };
}

// Whether a point is inside a shape (pixels). angle: degrees clockwise from
// east (the screen's atan2), the way the cone or line points.
/** @param {Shape} shape @param {number} px @param {number} py */
export function inside(shape, px, py) {
  const dx = px - shape.x;
  const dy = py - shape.y;
  if (shape.shape === "circle") return Math.hypot(dx, dy) <= shape.size + EPS;
  if (shape.shape === "square") {
    const half = shape.size / 2;
    return Math.abs(dx) <= half + EPS && Math.abs(dy) <= half + EPS;
  }
  const a = ((shape.angle ?? 0) * Math.PI) / 180;
  // Along and across the direction it points.
  const along = dx * Math.cos(a) + dy * Math.sin(a);
  const across = -dx * Math.sin(a) + dy * Math.cos(a);
  if (shape.shape === "line") {
    const half = (shape.width ?? 0) / 2;
    return along >= -EPS && along <= shape.size + EPS && Math.abs(across) <= half + EPS;
  }
  // cone: within its length (a round end, as Foundry's) and its angle.
  if (along < -EPS) return false;
  const reach = Math.hypot(dx, dy);
  if (reach > shape.size + EPS) return false;
  if (reach < EPS) return true;
  const half = shape.spread ? ((shape.spread / 2) * Math.PI) / 180 : CONE_HALF;
  return Math.abs(Math.atan2(across, along)) <= half + 1e-9;
}

// The outline to draw, as SVG path data (pixels).
/** @param {Shape} shape */
export function outline(shape) {
  const { x, y, size } = shape;
  if (shape.shape === "circle") return `M ${x - size} ${y} a ${size} ${size} 0 1 0 ${size * 2} 0 a ${size} ${size} 0 1 0 ${-size * 2} 0 Z`;
  if (shape.shape === "square") {
    const h = size / 2;
    return `M ${x - h} ${y - h} H ${x + h} V ${y + h} H ${x - h} Z`;
  }
  const a = ((shape.angle ?? 0) * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  if (shape.shape === "line") {
    const h = (shape.width ?? 0) / 2;
    /** @param {number} along @param {number} across */
    const p = (along, across) => `${x + ux * along - uy * across} ${y + uy * along + ux * across}`;
    return `M ${p(0, -h)} L ${p(size, -h)} L ${p(size, h)} L ${p(0, h)} Z`;
  }
  const half = shape.spread ? ((shape.spread / 2) * Math.PI) / 180 : CONE_HALF;
  const left = a - half;
  const right = a + half;
  const large = half * 2 > Math.PI ? 1 : 0;
  return `M ${x} ${y} L ${x + Math.cos(left) * size} ${y + Math.sin(left) * size} A ${size} ${size} 0 ${large} 1 ${x + Math.cos(right) * size} ${y + Math.sin(right) * size} Z`;
}

// Is this square kept from the area by a wall between the origin and it?
/** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to @param {{ walls?: any[], doors?: any, firstBlock?: Function }} world */
function walled(from, to, world) {
  if (!world.walls?.length || !world.firstBlock) return false;
  const t = world.firstBlock(world.walls, world.doors ?? {}, from, to);
  return t !== null && t !== undefined && t < 1 - 1e-6;
}

// The square centres a token fills: one for a token of a square or less, else
// each of its n x n squares (n rounded, a Large creature's four).
// gridPxY: a cell's height when it differs from its width (an unlinked grid).
/** @param {{ x: number, y: number, squares?: number }} token @param {number} gridPx @param {number} [gridPxY] */
export function footprint(token, gridPx, gridPxY = gridPx) {
  const n = Math.max(1, Math.round(Number(token.squares) || 1));
  if (n === 1) return [{ x: token.x, y: token.y }];
  const out = [];
  const start = -((n - 1) / 2) * gridPx;
  const startY = -((n - 1) / 2) * gridPxY;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) out.push({ x: token.x + start + i * gridPx, y: token.y + startY + j * gridPxY });
  return out;
}

// The tokens a template covers. world: { gridPx, gridless, walls, doors,
// firstBlock } (geometry.firstBlock: walls stop the area). A cone or line is
// measured from its point; a circle or square from its centre.
/** @template {{ id: string, x: number, y: number, squares?: number }} T @param {Shape} shape @param {T[]} tokens @param {{ gridPx: number, gridPxY?: number, gridless?: boolean, walls?: any[], doors?: any, firstBlock?: Function }} world @returns {T[]} */
export function tokensIn(shape, tokens, world) {
  const origin = { x: shape.x, y: shape.y };
  return tokens.filter((token) => {
    const points = world.gridless ? [{ x: token.x, y: token.y }] : footprint(token, world.gridPx, world.gridPxY ?? world.gridPx);
    return points.some((point) => inside(shape, point.x, point.y) && !walled(origin, point, world));
  });
}

// The grid squares a template covers (their centres), to shade them while it
// is placed and once it is down. grid: { gridPx, originX, originY }. At most
// `limit` squares (a 100-foot line is 20).
/** @param {Shape} shape @param {{ gridPx: number, gridPxY?: number, originX: number, originY: number }} grid @param {number} [limit] */
export function coveredSquares(shape, grid, limit = 2500) {
  const reach = shape.shape === "square" ? (shape.size / 2) * Math.SQRT2 : shape.size + (shape.width ?? 0);
  const size = grid.gridPx;
  const sizeY = grid.gridPxY ?? size;
  const out = [];
  const col0 = Math.floor((shape.x - reach - grid.originX) / size);
  const col1 = Math.ceil((shape.x + reach - grid.originX) / size);
  const row0 = Math.floor((shape.y - reach - grid.originY) / sizeY);
  const row1 = Math.ceil((shape.y + reach - grid.originY) / sizeY);
  for (let col = col0; col <= col1; col += 1) {
    for (let row = row0; row <= row1; row += 1) {
      const x = grid.originX + (col + 0.5) * size;
      const y = grid.originY + (row + 0.5) * sizeY;
      if (inside(shape, x, y)) out.push({ x, y });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Where a template goes when its caster points at (atX, atY): the way FG and
// Foundry players lay them down on a square grid.
// - a circle from a point: centred on the nearest grid corner (a sphere's
//   point is an intersection);
// - an emanation (attach): centred on the caster, its radius grown by half the
//   caster's size;
// - a cone or line from the caster: from the caster's edge, pointing at the mouse;
// - a cube from the caster: beside the caster in the mouse's direction;
// - a cube at a point: lined up with the grid around the point.
// area: { shape, size, width?, origin: "point"|"self", attach? } in feet.
// caster: its token { x, y, squares } or null; grid: { gridPx, originX, originY, feetPerSquare, gridless }.
/** @param {{ shape: Shape["shape"], size: number, width?: number, origin?: string, attach?: boolean, spread?: number }} area @param {{ x: number, y: number, squares?: number } | null} caster @param {number} atX @param {number} atY @param {{ gridPx: number, gridPxY?: number, originX: number, originY: number, feetPerSquare: number, gridless?: boolean }} grid */
export function place(area, caster, atX, atY, grid) {
  const cellY = grid.gridPxY ?? grid.gridPx;
  const per = grid.gridPx / (grid.feetPerSquare > 0 ? grid.feetPerSquare : 5);
  const span = caster ? Math.max(1, Number(caster.squares) || 1) * grid.gridPx : grid.gridPx;
  const fromSelf = area.origin === "self" && caster !== null;
  const angle = fromSelf ? (Math.atan2(atY - caster.y, atX - caster.x) * 180) / Math.PI : 0;
  /** @param {number} v @param {number} o @param {number} [cell] */
  const snapCorner = (v, o, cell = grid.gridPx) => (grid.gridless ? v : Math.round((v - o) / cell) * cell + o);
  if (area.shape === "circle") {
    if (area.attach && caster) return { shape: "circle", x: caster.x, y: caster.y, size: area.size + span / 2 / per, angle: 0 };
    if (fromSelf) return { shape: "circle", x: caster.x, y: caster.y, size: area.size, angle: 0 };
    return { shape: "circle", x: snapCorner(atX, grid.originX), y: snapCorner(atY, grid.originY, cellY), size: area.size, angle: 0 };
  }
  if (area.shape === "cone" || area.shape === "line") {
    if (!fromSelf) return { shape: area.shape, x: atX, y: atY, size: area.size, width: area.width ?? 5, angle: 0, ...(area.spread ? { spread: area.spread } : {}) };
    const a = (angle * Math.PI) / 180;
    // From the edge of the caster's square (a circle's edge for odd angles reads the same).
    const edge = Math.min(Math.abs(Math.cos(a)) > 1e-9 ? span / 2 / Math.abs(Math.cos(a)) : Infinity, Math.abs(Math.sin(a)) > 1e-9 ? span / 2 / Math.abs(Math.sin(a)) : Infinity);
    return { shape: area.shape, x: caster.x + Math.cos(a) * edge, y: caster.y + Math.sin(a) * edge, size: area.size, width: area.width ?? 5, angle, ...(area.spread ? { spread: area.spread } : {}) };
  }
  // A cube (square).
  const side = area.size * per;
  /** @param {number} v @param {number} o @param {number} [cell] */
  const align = (v, o, cell = grid.gridPx) => {
    if (grid.gridless) return v;
    const cells = Math.max(1, Math.round(side / grid.gridPx));
    // An odd number of squares centres on a square's centre, an even number on a corner.
    const offset = cells % 2 === 1 ? cell / 2 : 0;
    return Math.round((v - o - offset) / cell) * cell + o + offset;
  };
  if (fromSelf) {
    // Beside the caster: the nearest of its four sides to the mouse (8 ways: corners too).
    const dx = atX - caster.x;
    const dy = atY - caster.y;
    /** @param {number} d */
    const step = (d) => (Math.abs(d) < span / 2 ? 0 : Math.sign(d));
    const sx = step(dx);
    const sy = step(dy);
    const wantX = sx === 0 ? caster.x : caster.x + sx * (span / 2 + side / 2);
    const wantY = sy === 0 && sx === 0 ? caster.y + Math.sign(dy || 1) * (span / 2 + side / 2) : sy === 0 ? caster.y : caster.y + sy * (span / 2 + side / 2);
    return { shape: "square", x: align(wantX, grid.originX), y: align(wantY, grid.originY, cellY), size: area.size, angle };
  }
  return { shape: "square", x: align(atX, grid.originX), y: align(atY, grid.originY, cellY), size: area.size, angle: 0 };
}
