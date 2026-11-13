/* Kraken Map Studio editor geometry.  Deliberately dependency-free so it can
 * run in the browser and in Node tests/export tooling. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.KrakenEditorCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const EPSILON = 1e-7;
  const radians = degrees => (Number(degrees) || 0) * Math.PI / 180;
  const vector = angle => ({ x: Math.cos(angle), y: Math.sin(angle) });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const length = a => Math.hypot(a.x, a.y);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const point = (x, y) => ({ x, y });

  function axes(rotation) {
    const x = vector(radians(rotation));
    return { x, y: { x: -x.y, y: x.x } };
  }

  // Studio objects store x/y at their unrotated top-left, matching app.js.
  function objectCenter(object) {
    return { x: (Number(object.x) || 0) + (Number(object.width) || 0) / 2, y: (Number(object.y) || 0) + (Number(object.height) || 0) / 2 };
  }

  /** Returns the four world corners of an object whose x/y is its top-left. */
  function rotatedCorners(object) {
    const center = objectCenter(object), a = axes(object.rotation);
    const halfWidth = (Number(object.width) || 0) / 2;
    const halfHeight = (Number(object.height) || 0) / 2;
    return {
      nw: add(add(center, { x: -a.x.x * halfWidth, y: -a.x.y * halfWidth }), { x: -a.y.x * halfHeight, y: -a.y.y * halfHeight }),
      ne: add(add(center, { x: a.x.x * halfWidth, y: a.x.y * halfWidth }), { x: -a.y.x * halfHeight, y: -a.y.y * halfHeight }),
      se: add(add(center, { x: a.x.x * halfWidth, y: a.x.y * halfWidth }), { x: a.y.x * halfHeight, y: a.y.y * halfHeight }),
      sw: add(add(center, { x: -a.x.x * halfWidth, y: -a.x.y * halfWidth }), { x: a.y.x * halfHeight, y: a.y.y * halfHeight })
    };
  }

  /** True when a point lies inside the object's rotated rectangular footprint. */
  function rotatedHitTest(object, candidate, padding) {
    const center = objectCenter(object), a = axes(object.rotation);
    const local = sub(candidate, center), extra = Number(padding) || 0;
    return Math.abs(dot(local, a.x)) <= (Number(object.width) || 0) / 2 + extra &&
      Math.abs(dot(local, a.y)) <= (Number(object.height) || 0) / 2 + extra;
  }

  /** Corner and rotation handles in world coordinates. */
  function getObjectHandles(object, options) {
    const corners = rotatedCorners(object), a = axes(object.rotation);
    const offset = options && Number.isFinite(options.rotationOffset) ? options.rotationOffset : 28;
    const center = objectCenter(object);
    const top = { x: center.x - a.y.x * (Number(object.height) || 0) / 2, y: center.y - a.y.y * (Number(object.height) || 0) / 2 };
    return Object.assign({}, corners, {
      rotate: { x: top.x - a.y.x * offset, y: top.y - a.y.y * offset }
    });
  }

  const HANDLE_SIGNS = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };

  /**
   * Resizes a rotated rectangle from one corner while its opposite corner stays
   * fixed. `point` is the drag position; preserves aspect ratio by default.
   */
  function resizeRotatedObject(object, handle, dragPoint, options) {
    const signs = HANDLE_SIGNS[handle];
    if (!signs) return null;
    const a = axes(object.rotation), corners = rotatedCorners(object);
    const oppositeName = ({ nw: "se", ne: "sw", se: "nw", sw: "ne" })[handle];
    const anchor = corners[oppositeName];
    const delta = sub(dragPoint, anchor);
    let width = Math.max(0, signs[0] * dot(delta, a.x));
    let height = Math.max(0, signs[1] * dot(delta, a.y));
    const minimum = (options && options.minSize) || 8;
    const preserveAspect = !options || options.preserveAspect !== false;
    if (preserveAspect) {
      const aspect = (Number(object.width) || 1) / Math.max(Number(object.height) || 1, EPSILON);
      if (width / Math.max(height, EPSILON) > aspect) height = width / aspect;
      else width = height * aspect;
    }
    width = Math.max(minimum, width);
    height = Math.max(minimum, height);
    if (preserveAspect) {
      const aspect = (Number(object.width) || 1) / Math.max(Number(object.height) || 1, EPSILON);
      if (width / height > aspect) height = width / aspect;
      else width = height * aspect;
    }
    const center = add(anchor, {
      x: a.x.x * signs[0] * width / 2 + a.y.x * signs[1] * height / 2,
      y: a.x.y * signs[0] * width / 2 + a.y.y * signs[1] * height / 2
    });
    return Object.assign({}, object, { x: center.x - width / 2, y: center.y - height / 2, width, height });
  }

  /** Creates a rectangular room with optional floor artwork and four wall segments. */
  function createRectRoom(rectangle, options) {
    const o = options || {}, x = Number(rectangle.x) || 0, y = Number(rectangle.y) || 0;
    const width = Math.max(1, Number(rectangle.width) || 0), height = Math.max(1, Number(rectangle.height) || 0);
    const groupId = o.groupId || `room-${o.idPrefix || `${x}-${y}-${width}-${height}`}`;
    const prefix = o.idPrefix || groupId;
    const walls = [
      { id: `${prefix}-wall-n`, kind: "wall", x1: x, y1: y, x2: x + width, y2: y, groupId },
      { id: `${prefix}-wall-e`, kind: "wall", x1: x + width, y1: y, x2: x + width, y2: y + height, groupId },
      { id: `${prefix}-wall-s`, kind: "wall", x1: x + width, y1: y + height, x2: x, y2: y + height, groupId },
      { id: `${prefix}-wall-w`, kind: "wall", x1: x, y1: y + height, x2: x, y2: y, groupId }
    ];
    const objects = o.floorAssetId ? [{
      id: o.floorId || `${prefix}-floor`, kind: "asset", assetId: o.floorAssetId,
      x, y, width, height, rotation: 0, groupId,
      layer: o.floorLayer || "floor"
    }] : [];
    return { groupId, objects, walls };
  }

  function segmentPoint(wall, t) { return { x: wall.x1 + (wall.x2 - wall.x1) * t, y: wall.y1 + (wall.y2 - wall.y1) * t }; }
  function makeSegment(wall, id, start, end, extra) {
    const a = segmentPoint(wall, start), b = segmentPoint(wall, end);
    return Object.assign({}, wall, extra || {}, { id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  /**
   * Splits the closest wall at a projected point to add a door/window. Returns
   * a new wall list, or null when no segment can safely contain the portal.
   */
  function insertPortalInWalls(walls, position, options) {
    const o = options || {}, tolerance = o.tolerance == null ? 16 : o.tolerance;
    const portalWidth = Math.max(1, Number(o.width) || 40), kind = o.kind === "window" ? "window" : "door";
    let choice = null;
    (walls || []).forEach((wall, index) => {
      if (!wall || (wall.kind && wall.kind !== "wall")) return;
      const direction = { x: wall.x2 - wall.x1, y: wall.y2 - wall.y1 }, squared = dot(direction, direction);
      if (squared < EPSILON) return;
      const t = clamp(dot(sub(position, { x: wall.x1, y: wall.y1 }), direction) / squared, 0, 1);
      const p = segmentPoint(wall, t), distance = length(sub(position, p));
      if (distance <= tolerance && (!choice || distance < choice.distance)) choice = { wall, index, t, distance, length: Math.sqrt(squared) };
    });
    if (!choice || portalWidth >= choice.length - EPSILON) return null;
    const half = portalWidth / (2 * choice.length), start = choice.t - half, end = choice.t + half;
    if (start < -EPSILON || end > 1 + EPSILON) return null;
    const baseId = o.id || `${choice.wall.id || "wall"}-portal`;
    const replacement = [];
    if (start > EPSILON) replacement.push(makeSegment(choice.wall, `${baseId}-before`, 0, start));
    replacement.push(makeSegment(choice.wall, baseId, start, end, Object.assign({}, o.portal || {}, { kind, open: kind === "door" && !!o.open, parentWallId: choice.wall.id })));
    if (end < 1 - EPSILON) replacement.push(makeSegment(choice.wall, `${baseId}-after`, end, 1));
    return [].concat(walls.slice(0, choice.index), replacement, walls.slice(choice.index + 1));
  }

  /** Returns only segments which stop vision: windows and open doors are transparent. */
  function effectiveVisionWalls(walls) {
    return (walls || []).filter(wall => wall && wall.kind !== "window" && !(wall.kind === "door" && wall.open));
  }

  function raySegmentIntersection(origin, direction, wall, maximum) {
    const start = { x: wall.x1, y: wall.y1 }, edge = { x: wall.x2 - wall.x1, y: wall.y2 - wall.y1 };
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < EPSILON) return null;
    const fromOrigin = sub(start, origin), t = cross(fromOrigin, edge) / denominator, u = cross(fromOrigin, direction) / denominator;
    if (t > EPSILON && t <= maximum + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) return { t, x: origin.x + direction.x * t, y: origin.y + direction.y * t };
    return null;
  }

  /** Ray-cast visibility polygon, clipped by radius and opaque wall segments. */
  function visibilityPolygon(origin, radius, walls, options) {
    const distance = Math.max(0, Number(radius) || 0), epsilon = (options && options.angleEpsilon) || 0.0001;
    // Only walls within reach matter (a light's radius): the nearest point of each wall.
    const reach = wall => {
      const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, l = dx * dx + dy * dy || 1;
      const t = clamp(((origin.x - wall.x1) * dx + (origin.y - wall.y1) * dy) / l, 0, 1);
      return Math.hypot(origin.x - wall.x1 - t * dx, origin.y - wall.y1 - t * dy) <= distance;
    };
    const opaque = effectiveVisionWalls(walls).filter(reach), angles = [];
    // Each wall in the angle buckets it covers seen from the origin, so a ray tests only the walls in its direction.
    const BINS = 720, binOf = a => Math.min(BINS - 1, Math.max(0, Math.floor((a + Math.PI) / (2 * Math.PI) * BINS)));
    const bins = Array.from({ length: BINS }, () => []);
    opaque.forEach(wall => {
      let a1 = Math.atan2(wall.y1 - origin.y, wall.x1 - origin.x), a2 = Math.atan2(wall.y2 - origin.y, wall.x2 - origin.x);
      let span = a2 - a1;
      while (span > Math.PI) span -= 2 * Math.PI;
      while (span < -Math.PI) span += 2 * Math.PI;
      if (span < 0) { a1 = a2; span = -span; }
      // A wall through (or almost through) the origin can cover half the circle or more: all buckets.
      if (span > Math.PI - 1e-6) { bins.forEach(b => b.push(wall)); return; }
      const first = binOf(a1), count = Math.ceil(span / (2 * Math.PI) * BINS) + 2;
      for (let k = -1; k < count; k++) bins[(first + k + BINS) % BINS].push(wall);
    });
    opaque.forEach(wall => [[wall.x1, wall.y1], [wall.x2, wall.y2]].forEach(([x, y]) => {
      const angle = Math.atan2(y - origin.y, x - origin.x);
      angles.push(angle - epsilon, angle, angle + epsilon);
    }));
    // Baseline rays keep the outline complete when a wall's endpoints do not
    // happen to bracket a cardinal direction; endpoint rays refine shadows.
    // Every angle in the same range as atan2's (-PI..PI], so they sort into one
    // sweep: baseline rays from 0 to 2PI sorted among atan2's negative angles
    // zig-zagged the outline and cut straight lines across rooms.
    for (let i = 0; i < 360; i++) angles.push(i * Math.PI * 2 / 360 - Math.PI);
    // Where two walls cross (an X, a plus-shaped wall), the shadow turns there
    // too: rays at each crossing. Pairwise, so only for maps of up to 1500 walls.
    if (opaque.length <= 1500) {
      for (let i = 0; i < opaque.length; i++) for (let j = i + 1; j < opaque.length; j++) {
        const a = opaque[i], b = opaque[j];
        const r = { x: a.x2 - a.x1, y: a.y2 - a.y1 }, s = { x: b.x2 - b.x1, y: b.y2 - b.y1 }, den = cross(r, s);
        if (Math.abs(den) < EPSILON) continue;
        const d = { x: b.x1 - a.x1, y: b.y1 - a.y1 }, t = cross(d, s) / den, u = cross(d, r) / den;
        if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) continue;
        const angle = Math.atan2(a.y1 + r.y * t - origin.y, a.x1 + r.x * t - origin.x);
        angles.push(angle - epsilon, angle, angle + epsilon);
      }
    }
    for (let i = 0; i < angles.length; i++) angles[i] = Math.atan2(Math.sin(angles[i]), Math.cos(angles[i]));
    const points = angles.map(angle => {
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      let nearest = { t: distance, x: origin.x + direction.x * distance, y: origin.y + direction.y * distance };
      // A limited wall (terrain: Foundry's LIMITED sense) is seen past once; the second one stops sight.
      const limited = [];
      bins[binOf(angle)].forEach(wall => {
        const hit = raySegmentIntersection(origin, direction, wall, distance);
        if (!hit) return;
        if (wall.limited) limited.push(hit); else if (hit.t < nearest.t) nearest = hit;
      });
      if (limited.length > 1) {
        limited.sort((a, b) => a.t - b.t);
        // the same crossing counted twice where two limited walls meet is one wall, not two
        const second = limited.find(h => h.t > limited[0].t + 1e-6);
        if (second && second.t < nearest.t) nearest = second;
      }
      return Object.assign(nearest, { angle });
    });
    points.sort((left, right) => left.angle - right.angle);
    return points.map(({ x, y }) => ({ x, y }));
  }

  function seededRandom(seed) {
    let state = 2166136261;
    String(seed == null ? 1 : seed).split("").forEach(character => { state ^= character.charCodeAt(0); state = Math.imul(state, 16777619); });
    return function () { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /** Deterministic placement points distributed along a multi-point brush stroke. */
  function scatterBrush(path, options) {
    const o = options || {}, points = (path || []).map(p => Array.isArray(p) ? point(p[0], p[1]) : point(p.x, p.y));
    if (!points.length) return [];
    const spacing = Math.max(1, Number(o.spacing) || 32), jitter = Math.max(0, Number(o.jitter) || 0);
    const random = seededRandom(o.seed), ranges = {
      rotation: o.rotationRange || [-180, 180], scale: o.scaleRange || [1, 1]
    };
    const segments = [], total = points.slice(1).reduce((sum, end, index) => { const start = points[index], d = length(sub(end, start)); segments.push({ start, end, d }); return sum + d; }, 0);
    if (total < EPSILON) return [{ x: points[0].x, y: points[0].y, rotation: ranges.rotation[0] + random() * (ranges.rotation[1] - ranges.rotation[0]), scale: ranges.scale[0] + random() * (ranges.scale[1] - ranges.scale[0]) }];
    const result = [];
    for (let travelled = o.startOffset == null ? spacing / 2 : Number(o.startOffset); travelled <= total + EPSILON; travelled += spacing) {
      let remaining = travelled, segment = segments[segments.length - 1];
      for (const candidate of segments) { if (remaining <= candidate.d || candidate === segments[segments.length - 1]) { segment = candidate; break; } remaining -= candidate.d; }
      const t = clamp(remaining / Math.max(segment.d, EPSILON), 0, 1), direction = { x: (segment.end.x - segment.start.x) / segment.d, y: (segment.end.y - segment.start.y) / segment.d };
      const normal = { x: -direction.y, y: direction.x }, along = (random() * 2 - 1) * jitter, across = (random() * 2 - 1) * jitter;
      result.push({ x: segment.start.x + (segment.end.x - segment.start.x) * t + direction.x * along + normal.x * across, y: segment.start.y + (segment.end.y - segment.start.y) * t + direction.y * along + normal.y * across, rotation: ranges.rotation[0] + random() * (ranges.rotation[1] - ranges.rotation[0]), scale: ranges.scale[0] + random() * (ranges.scale[1] - ranges.scale[0]) });
    }
    return result;
  }

  // FG 5.1.14 FX layer settings: saved field, panel label, FG default. FG saves
  // a field only when it differs from its default. FG's panel shows these 0..1
  // values as 0..100; maskblur (the mask's Blur) is saved as shown, 0..100.
  const FX_SETTINGS = {
    water: [["WaterHorizontal", "Horizontal", 0.15], ["WaterIntensity", "Intensity", 0.15], ["WaterSpeed", "Speed", 0.2], ["WaterDroplet", "Droplet", 0.25]],
    clouds: [["CloudSpeed", "Speed", 0.75], ["CloudDensity", "Clouds", 0.75], ["CloudShadowDensity", "Shadows", 0.5], ["CloudOffset", "Offset", 0.25]],
    myst: [["MystFade", "Amount", 0.75], ["MystSpeed", "Speed", 1]],
    snow: [["SnowFade", "Amount", 1], ["SnowIntensity", "Intensity", 0.204], ["SnowSpeed", "Speed", 0.55], ["SnowSize", "Size", 1]],
    // Rain's Direction is the wind: 0.5 falls straight down, lower or higher leans it.
    rain: [["RainFade", "Amount", 1], ["RainIntensity", "Intensity", 0.25], ["RainSpeed", "Speed", 0.6], ["RainDirection", "Wind", 0.5]],
    blizzard: [["BlizzardFade", "Amount", 1], ["BlizzardSize", "Size", 0.5], ["BlizzardSpeed", "Speed", 0.6]],
    ocean: [["OceanDistortion", "Ripples", 0.5], ["OceanSizeX", "Wave width", 0.5], ["OceanSizeY", "Wave height", 0.5], ["OceanSpeed", "Speed", 0.4]],
  };
  const FX_BLUR = ["maskblur", "Blur", 0, 100];
  function effectSettings(type, settings) {
    if (!FX_SETTINGS[type]) throw Error("Unknown effect type.");
    if (settings == null) return {};
    if (typeof settings !== "object" || Array.isArray(settings)) throw Error("Invalid effect settings.");
    const known = new Map([...FX_SETTINGS[type], FX_BLUR].map(s => [s[0], s])), clean = {};
    for (const [key, value] of Object.entries(settings)) {
      if (!known.has(key)) throw Error("Unknown " + type + " setting " + key + ".");
      const n = Number(value), [, label, , max = 1] = known.get(key);
      if (typeof value === "boolean" || value === "" || !Number.isFinite(n) || n < 0 || n > max) throw Error(label + " must be between 0 and " + max + ".");
      clean[key] = n;
    }
    return clean;
  }

  // An effect's mask, as Fantasy Grounds keeps it: the effect starts over the whole
  // map (base "all") or nowhere (base "none"), then each stroke, in order, shows it
  // or hides it again. Strokes are a brush (points and a radius), a freehand or
  // clicked shape (points), a rectangle (two corners) or ready-made outlines
  // (paths, filled even-odd: a shape inside another is a hole).
  //
  // maskPolygons turns that into outlines in map pixels, the same list FG saves
  // under <mask>: outer edges run one way and holes the other, so they fill right
  // with either rule. null means the whole map (FG: no mask at all).
  const MASK_CELLS = 1600;
  function polyArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) a += pts[j] * pts[i + 1] - pts[i] * pts[j + 1];
    return a / 2;
  }
  function maskPolygons(mask, width, height) {
    if (!mask) return null;
    const ops = mask.ops || [];
    if (mask.base === "all" && !ops.length) return null;
    if (mask.base !== "all" && !ops.length) return [];
    // One shape shown on an empty map: its own corners, exactly.
    if (mask.base !== "all" && ops.length === 1 && ops[0].op === "show" && ["rect", "poly"].includes(ops[0].shape)) {
      const o = ops[0], q = o.points;
      let pts = o.shape === "rect"
        ? [Math.min(q[0], q[2]), Math.min(q[1], q[3]), Math.max(q[0], q[2]), Math.min(q[1], q[3]), Math.max(q[0], q[2]), Math.max(q[1], q[3]), Math.min(q[0], q[2]), Math.max(q[1], q[3])]
        : q.slice();
      pts = pts.map((v, i) => clamp(v, 0, i % 2 ? height : width));
      if (Math.abs(polyArea(pts)) < 1) return [];
      if (polyArea(pts) > 0) pts = reverseLoop(pts);
      return [pts];
    }
    // Outlines edited corner by corner (Edit points): kept exactly, each loop as given.
    if (mask.base !== "all" && ops.length === 1 && ops[0].op === "show" && ops[0].shape === "paths") {
      return ops[0].paths.map(q => q.map((v, i) => clamp(v, 0, i % 2 ? height : width))).filter(q => q.length >= 6 && Math.abs(polyArea(q)) >= 1);
    }
    const cell = Math.max(1, Math.ceil(Math.max(width, height) / MASK_CELLS));
    const W = Math.ceil(width / cell), H = Math.ceil(height / cell), g = new Uint8Array(W * H);
    if (mask.base === "all") g.fill(1);
    for (const o of ops) rasterOp(g, W, H, cell, o, o.op === "show" ? 1 : 0);
    return traceMask(g, W, H, cell, width, height);
  }
  function reverseLoop(pts) {
    const out = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
    return out;
  }
  // Fill the cells whose centres fall in the stroke.
  function rasterOp(g, W, H, cell, o, v) {
    const q = o.points || [];
    if (o.shape === "rect") {
      const x0 = Math.min(q[0], q[2]) / cell, x1 = Math.max(q[0], q[2]) / cell, y0 = Math.min(q[1], q[3]) / cell, y1 = Math.max(q[1], q[3]) / cell;
      for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y++)
        for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) g[y * W + x] = v;
    } else if (o.shape === "brush") {
      const r = Math.max(0.5, (Number(o.radius) || 1) / cell), r2 = r * r;
      const pts = [];
      for (let i = 0; i + 1 < q.length; i += 2) pts.push([q[i] / cell, q[i + 1] / cell]);
      if (pts.length === 1) pts.push(pts[0]);
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
        const xa = Math.max(0, Math.floor(Math.min(ax, bx) - r)), xb = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
        const ya = Math.max(0, Math.floor(Math.min(ay, by) - r)), yb = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
          const cx = x + 0.5, cy = y + 0.5, t = l ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l, 0, 1) : 0;
          const ex = cx - ax - t * dx, ey = cy - ay - t * dy;
          if (ex * ex + ey * ey <= r2) g[y * W + x] = v;
        }
      }
    } else {
      // poly (one outline) or paths (several, even-odd): scanlines through the cell centres
      const paths = o.shape === "paths" ? (o.paths || []) : [q];
      const edges = [];
      for (const p of paths) for (let i = 0, j = p.length - 2; i + 1 < p.length; j = i, i += 2) edges.push([p[j] / cell, p[j + 1] / cell, p[i] / cell, p[i + 1] / cell]);
      let ymin = Infinity, ymax = -Infinity;
      for (const e of edges) { ymin = Math.min(ymin, e[1], e[3]); ymax = Math.max(ymax, e[1], e[3]); }
      const xs = [];
      for (let y = Math.max(0, Math.floor(ymin)); y < Math.min(H, Math.ceil(ymax)); y++) {
        const cy = y + 0.5;
        xs.length = 0;
        for (const [x1, y1, x2, y2] of edges) if ((y1 > cy) !== (y2 > cy)) xs.push(x1 + (cy - y1) * (x2 - x1) / (y2 - y1));
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) g[y * W + x] = v;
        }
      }
    }
  }
  // The edges between filled and empty cells, joined into loops (filled on the
  // right on screen), straight runs merged, then smoothed to within a cell.
  function traceMask(g, W, H, cell, width, height) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y * W + x] : 0);
    const V = W + 1, out = new Map(); // vertex -> outgoing directions (0 E, 1 S, 2 W, 3 N)
    const add = (x, y, d) => { const k = y * V + x, l = out.get(k); if (l) l.push(d); else out.set(k, [d]); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!g[y * W + x]) continue;
      if (!at(x, y - 1)) add(x, y, 0);
      if (!at(x + 1, y)) add(x + 1, y, 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, 2);
      if (!at(x - 1, y)) add(x, y + 1, 3);
    }
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], loops = [];
    for (const [start] of out) {
      while (out.get(start)?.length) {
        let k = start, d = out.get(k)[0], pts = [];
        for (let guard = 0; guard < 4 * W * H + 8; guard++) {
          const list = out.get(k);
          // at a corner where two filled cells touch diagonally, keep to the cell on the right
          let i = list.indexOf((d + 1) % 4);
          if (i < 0) i = list.indexOf(d);
          if (i < 0) i = list.indexOf((d + 3) % 4);
          if (i < 0) i = 0;
          const nd = list.splice(i, 1)[0];
          if (!list.length) out.delete(k);
          if (nd !== d || !pts.length) pts.push(k % V, Math.floor(k / V));
          d = nd;
          k += DY[d] * V + DX[d];
          if (k === start) break;
        }
        if (pts.length >= 6) loops.push(pts);
      }
    }
    const result = [];
    for (const loop of loops) {
      let pts = simplifyLoop(loop, 1.5).map((v, i) => clamp(v * cell, 0, i % 2 ? height : width));
      if (pts.length < 6 || Math.abs(polyArea(pts)) < 2 * cell * cell) continue;
      result.push(reverseLoop(pts)); // outer edges counter-clockwise on screen, as FG saves them
    }
    return result;
  }
  // Douglas-Peucker on a closed loop, keeping the turns that matter.
  function simplifyLoop(pts, eps) {
    const n = pts.length / 2;
    if (n <= 4) return pts;
    let far = 0, best = -1;
    for (let i = 1; i < n; i++) { const d = (pts[2 * i] - pts[0]) ** 2 + (pts[2 * i + 1] - pts[1]) ** 2; if (d > best) { best = d; far = i; } }
    const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
    const stack = [[0, far], [far, n]];
    while (stack.length) {
      const [a, b] = stack.pop(), bi = b % n;
      const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * bi], by = pts[2 * bi + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      let worst = -1, at = -1;
      for (let i = a + 1; i < b; i++) {
        const dist = Math.abs((pts[2 * i] - ax) * dy - (pts[2 * i + 1] - ay) * dx) / l;
        if (dist > worst) { worst = dist; at = i; }
      }
      if (worst > eps) { keep[at] = 1; stack.push([a, at], [at, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out;
  }
  // Is a map point inside the outlines (even-odd)?
  function inPolygons(polys, x, y) {
    let hit = false;
    for (const p of polys) for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit;
    }
    return hit;
  }

  // Wall art drawn along a path (like Dungeondraft's wall tool). Each segment gets a clip
  // quad [left start, left end, right end, right start], `half` wide each side, mitred where
  // it meets the next segment so a repeating texture joins without gaps. `start` is how far
  // along the path the segment begins, so the texture carries on round corners. `overlap`
  // pushes mitred ends past the joint by that much, hiding anti-aliased seams.
  function wallPathSegments(points, closed, half, overlap = 0) {
    const list = [];
    for (const v of points || []) if (!list.length || length(sub(v, list[list.length - 1])) > 1e-6) list.push(point(v.x, v.y));
    if (closed && list.length > 2 && length(sub(list[0], list[list.length - 1])) <= 1e-6) list.pop();
    const n = list.length, loop = closed && n > 2, count = loop ? n : n - 1, segments = [];
    let start = 0;
    for (let i = 0; i < count; i++) {
      const a = list[i], b = list[(i + 1) % n], len = length(sub(b, a)), d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      segments.push({ a, b, length: len, angle: Math.atan2(d.y, d.x), start, d, n: { x: -d.y, y: d.x } });
      start += len;
    }
    const joint = (s1, s2) => {  // offset from the shared point to the left miter point
      const m = add(s1.n, s2.n), ml = length(m);
      if (ml < 1e-9) return null;
      const c = dot({ x: m.x / ml, y: m.y / ml }, s1.n);
      return c < 0.3 ? null : { x: m.x / ml * half / c, y: m.y / ml * half / c };  // too sharp: square ends
    };
    segments.forEach((s, i) => {
      const prev = i ? segments[i - 1] : loop ? segments[count - 1] : null, next = i < count - 1 ? segments[i + 1] : loop ? segments[0] : null;
      const end = (v, other, sign) => {
        const off = other ? (sign < 0 ? joint(other, s) : joint(s, other)) : null, side = off || { x: s.n.x * half, y: s.n.y * half };
        const push = other && off ? { x: s.d.x * overlap * sign, y: s.d.y * overlap * sign } : { x: 0, y: 0 };
        return [add(add(v, side), push), add(sub(v, side), push)];
      };
      const [ls, rs] = end(s.a, prev, -1), [le, re] = end(s.b, next, 1);
      Object.assign(s, { clip: [ls, le, re, rs], capStart: !prev, capEnd: !next });
    });
    return segments;
  }

  return { rotatedCorners, rotatedHitTest, getObjectHandles, resizeRotatedObject, createRectRoom, insertPortalInWalls, effectiveVisionWalls, visibilityPolygon, scatterBrush, FX_SETTINGS, FX_BLUR, effectSettings, maskPolygons, polyArea, inPolygons, wallPathSegments };
});
