const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

// The map side of the table, kept by the host: tokens on each scene, door
// states, and whether line of sight is on. Players are sent only what their
// tokens can see (FG with line of sight on): other tokens and doors outside
// their view stay on the host.

let geometry = null;
const geometryReady = import(pathToFileURL(path.join(__dirname, "..", "shared", "map", "geometry.mjs")).href).then((module) => {
  geometry = module;
  return module;
});

// Area templates and effects (shared/actions): which tokens a template covers,
// what effects show on a token and the light they shed.
let areas = null;
let effectsLib = null;
const actionsReady = Promise.all([
  import(pathToFileURL(path.join(__dirname, "..", "shared", "actions", "areas.mjs")).href).then((module) => (areas = module)),
  import(pathToFileURL(path.join(__dirname, "..", "shared", "actions", "effects.mjs")).href).then((module) => (effectsLib = module)),
]);
// An effect, as the tracker keeps it (combat.cjs): a token not in the fight carries its own (a torch lit while exploring).
const { cleanEffect } = require("./combat.cjs");
const MAX_TEMPLATES = 60;

// FG's faction colours (ColorManager token faction defaults).
const FACTION_COLOR = { friend: "#56B33F", neutral: "#A6A6A6", foe: "#C23741", none: "#18A9D1" };
const FACTIONS = Object.keys(FACTION_COLOR);
const PLAYER_COLORS = ["#d2a15a", "#6cb6ff", "#e07a6a", "#81b90c", "#ca81ff", "#77e7e8", "#ffb347", "#f4f1ea"];
const MAX_TOKENS = 400;

function text(value, fallback) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = raw.replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
}

function num(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// A player's colour stays the same from session to session.
function playerColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

function cleanToken(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: text(raw.id, "").slice(0, 40) || `t-${crypto.randomBytes(6).toString("hex")}`,
    recordId: raw.recordId ? text(raw.recordId, "").slice(0, 160) : null,
    sourceId: raw.sourceId ? text(raw.sourceId, "").slice(0, 80) : null,
    name: text(raw.name, "Token").slice(0, 48),
    x,
    y,
    squares: Math.min(10, Math.max(0.25, num(raw.squares, 1))),
    owner: text(raw.owner, "").slice(0, 24),
    faction: FACTIONS.includes(raw.faction) ? raw.faction : "none",
    hidden: Boolean(raw.hidden),
    // A carried light (feet; FG's LIGHT effect) and a sight range in the dark
    // (feet; null: from the character's senses).
    light: cleanCarried(raw.light),
    vision: raw.vision == null ? null : Math.min(1000, Math.max(0, num(raw.vision, 0))),
    // Which way it faces, degrees clockwise from up (FG's token orientation); null: not turned.
    facing: cleanFacing(raw.facing),
    // What players call it until it is known (FG's unidentified name); "": its name.
    unidentified: text(raw.unidentified, "").slice(0, 48),
    // How high it is, in the scene's units (FG's and Foundry's elevation): flying, on a ledge, under water.
    elevation: Math.round(Math.min(100000, Math.max(-100000, num(raw.elevation, 0))) * 10) / 10,
    // Its own senses line, over its character's ("Darkvision 60 ft, Blindsight 10 ft"); "": the record's.
    senses: text(raw.senses, "").slice(0, 200),
    // Effects on a creature that is not on the combat tracker (they move onto its entry when it joins).
    ...(Array.isArray(raw.effects) && raw.effects.length ? { effects: raw.effects.map(cleanEffect).filter(Boolean).slice(0, 30) } : {}),
  };
}

// An area template on a scene (a Fireball's sphere): shape, its origin in
// world pixels, size and width in feet, the way it points (degrees clockwise
// from east), the placer's colour, its label, a token it moves with (an
// emanation), and whether it goes when the next turn starts (an instant spell's).
const TEMPLATE_SHAPES = ["circle", "cone", "line", "square"];
function cleanTemplate(raw) {
  if (!raw || typeof raw !== "object" || !TEMPLATE_SHAPES.includes(raw.shape)) return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  const size = Math.min(1000, Math.max(0, num(raw.size, 0)));
  if (!Number.isFinite(x) || !Number.isFinite(y) || size <= 0) return null;
  return {
    id: text(raw.id, "").slice(0, 40) || `tp-${crypto.randomBytes(5).toString("hex")}`,
    shape: raw.shape,
    x,
    y,
    size,
    width: Math.min(200, Math.max(1, num(raw.width, 5))),
    angle: ((num(raw.angle, 0) % 360) + 360) % 360,
    ...(num(raw.spread, 0) > 0 ? { spread: Math.min(360, num(raw.spread, 0)) } : {}),
    color: /^#[0-9a-fA-F]{6}$/.test(String(raw.color ?? "")) ? raw.color : "#ff9e3d",
    label: text(raw.label, "").slice(0, 80),
    by: text(raw.by, "").slice(0, 24),
    ...(raw.attach ? { attach: text(raw.attach, "").slice(0, 40) } : {}),
    ...(raw.turn ? { turn: true } : {}),
    ...(raw.entryId ? { entryId: text(raw.entryId, "").slice(0, 40) } : {}),
  };
}
function cleanFacing(value) {
  if (value == null || value === "") return null;
  const n = num(value, NaN);
  return Number.isFinite(n) ? ((Math.round(n) % 360) + 360) % 360 : null;
}

function cleanCarried(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bright = Math.min(1000, Math.max(0, num(raw.bright, 0)));
  const dim = Math.min(1000, Math.max(bright, num(raw.dim, bright * 2)));
  if (dim <= 0) return null;
  return { name: text(raw.name, "Light").slice(0, 40), bright, dim, color: text(raw.color, "#FFF3E1").slice(0, 16) };
}

// A light on the scene (Foundry's ambient light), radii in scene units.
function cleanLight(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const bright = Math.min(1000, Math.max(0, num(raw.bright, 0)));
  return {
    id: text(raw.id, "").slice(0, 80) || `l-${crypto.randomBytes(6).toString("hex")}`,
    x,
    y,
    bright,
    dim: Math.min(2000, Math.max(bright, num(raw.dim, bright))),
    color: text(raw.color, "#FFB347").slice(0, 16),
    on: raw.on !== false,
    hidden: Boolean(raw.hidden),
    // FG's Angle and Rotation (a lantern's beam), Animation and Speed.
    angle: Math.min(360, Math.max(1, Math.round(num(raw.angle, 360)))),
    rotation: ((Math.round(num(raw.rotation, 0)) % 360) + 360) % 360,
    animation: ["none", "flicker", "pulse", "flash", "torch"].includes(raw.animation) ? raw.animation : "none",
    speed: Math.min(1, Math.max(0, num(raw.speed, 0.5))),
    // Magical darkness (the Darkness spell, Foundry's negative light): its dim
    // radius is dark whatever else lights it; darkvision does not see in it.
    darkness: Boolean(raw.darkness),
  };
}

// A wall the GM drew or imported: Foundry's senses (0 none, 10 limited, 20
// normal, 30 proximity, 40 distance), with FG's kinds.
const SENSES = [0, 10, 20, 30, 40];
// The door a wall is part of (FG's door is one shape, its sides Kraken's wall
// lines: "fg-<door>-<n>", or an explicit group): one state, opened as one.
function doorGroup(wall) {
  if (typeof wall.group === "string" && wall.group) return wall.group;
  const match = /^(fg-.+)-\d+$/.exec(String(wall.id ?? ""));
  return match ? match[1] : wall.id;
}

function cleanWall(raw) {
  if (!raw || typeof raw !== "object") return null;
  const coords = [raw.x1, raw.y1, raw.x2, raw.y2].map((value) => num(value, NaN));
  if (coords.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7)) return null;
  if (coords[0] === coords[2] && coords[1] === coords[3]) return null;
  const kinds = geometry?.WALL_KINDS ?? {};
  const kind = kinds[raw.kind] || ["wall", "terrain", "door", "secret", "toggle", "window", "illusion", "invisible", "ethereal", "shadow"].includes(raw.kind) ? raw.kind : "custom";
  const base = kinds[kind] ?? {};
  const sense = (key) => {
    const value = raw[key] ?? base[key] ?? 20;
    return SENSES.includes(Number(value)) ? Number(value) : 20;
  };
  return {
    id: text(raw.id, "").slice(0, 80) || `w-${crypto.randomBytes(6).toString("hex")}`,
    x1: Math.round(coords[0] * 10) / 10,
    y1: Math.round(coords[1] * 10) / 10,
    x2: Math.round(coords[2] * 10) / 10,
    y2: Math.round(coords[3] * 10) / 10,
    kind,
    sight: sense("sight"),
    light: sense("light"),
    sound: sense("sound"),
    move: [0, 20].includes(Number(raw.move ?? base.move ?? 20)) ? Number(raw.move ?? base.move ?? 20) : 20,
    dir: [0, 1, 2].includes(Number(raw.dir)) ? Number(raw.dir) : 0,
    door: [0, 1, 2].includes(Number(raw.door ?? base.door ?? 0)) ? Number(raw.door ?? base.door ?? 0) : 0,
    ds: [0, 1, 2].includes(Number(raw.ds)) ? Number(raw.ds) : 0,
    toggle: ["none", "gm", "players"].includes(raw.toggle) ? raw.toggle : (base.toggle ?? "none"),
    threshold: num(raw.threshold, 0) > 0 ? num(raw.threshold, 0) : null,
    hidden: Boolean(raw.hidden),
    // The door it is a side of (a door drawn as a box or shape opens as one, as FG's).
    ...(typeof raw.group === "string" && raw.group.trim() ? { group: raw.group.trim().slice(0, 60) } : {}),
  };
}
const MAX_WALLS = 5000;

// Text on the map (FG's text layers, Foundry's drawing text): a label, a
// number from the numbering tool, or a pin linked to a record. size is in
// squares (FG's units). group: the layer group (folder) it is in.
const FONTS = ["Bebas Neue", "Cinzel", "Georgia", "Signika", "Arial", "Courier New"];
const ANCHORS = ["center", "top", "bottom", "left", "right"];
function cleanLabel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const words = text(raw.text, "").slice(0, 200);
  if (!words) return null;
  const color = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback);
  return {
    id: text(raw.id, "").slice(0, 40) || `t-${crypto.randomBytes(5).toString("hex")}`,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    text: words,
    font: FONTS.includes(raw.font) ? raw.font : "Bebas Neue",
    size: Math.min(20, Math.max(0.2, num(raw.size, 1))),
    color: color(raw.color, "#ffffff"),
    rotation: ((num(raw.rotation, 0) % 360) + 360) % 360,
    anchor: ANCHORS.includes(raw.anchor) ? raw.anchor : "center",
    outline: { width: Math.min(10, Math.max(0, num(raw.outline?.width, 2))), color: color(raw.outline?.color, "#000000") },
    shadow: { offset: Math.min(10, Math.max(0, num(raw.shadow?.offset, 0))), blur: Math.min(10, Math.max(0, num(raw.shadow?.blur, 0))), color: color(raw.shadow?.color, "#000000") },
    hidden: Boolean(raw.hidden),
    group: text(raw.group, "").slice(0, 40),
    number: Number.isFinite(Number(raw.number)) && raw.number !== null && raw.number !== "" ? Math.round(Number(raw.number)) : null,
    icon: ["pin", "trap", "door", "chest", ""].includes(raw.icon) ? raw.icon : "",
    link: raw.link && typeof raw.link === "object" && raw.link.id ? { kind: text(raw.link.kind, "record").slice(0, 20), id: text(raw.link.id, "").slice(0, 160) } : null,
  };
}
// A layer group (FG's layer folder): what is in it is shown or not, seen by
// players or not, locked or not, all at once.
function cleanGroup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = text(raw.name, "").slice(0, 40);
  if (!name) return null;
  return { name, shown: raw.shown !== false, players: raw.players !== false, locked: Boolean(raw.locked), nextNumber: Math.max(1, Math.round(num(raw.nextNumber, 1))), prefix: text(raw.prefix, "").slice(0, 6) };
}

// FG's mask: a global mask over the picture and shapes, in order, that
// reveal it or hide it again. Points are scene pixels.
function cleanMask(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const shapes = (Array.isArray(value.shapes) ? value.shapes : [])
    .map((shape) => {
      if (!shape || !Array.isArray(shape.points)) return null;
      const points = shape.points.slice(0, 2000).map(Number);
      if (points.length < 6 || points.length % 2 || !points.every((n) => Number.isFinite(n) && Math.abs(n) < 1e7)) return null;
      return { id: text(shape.id, "").slice(0, 40) || crypto.randomBytes(5).toString("hex"), mode: shape.mode === "hide" ? "hide" : "reveal", points: points.map((n) => Math.round(n * 10) / 10) };
    })
    .filter(Boolean)
    .slice(-1000);
  return { on: Boolean(value.on), shapes };
}

const WEATHER = ["none", "rain", "storm", "snow", "blizzard", "fog", "clouds", "sandstorm", "embers", "ash", "leaves", "water"];

function cleanSettings(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const grid = value.grid && typeof value.grid === "object" ? value.grid : {};
  const weather = value.weather && typeof value.weather === "object" ? value.weather : {};
  const nullable = (value, clean) => (value == null || value === "" ? null : clean(value));
  return {
    darkness: value.darkness == null ? null : Math.min(1, Math.max(0, num(value.darkness, 0))),
    // FG's Grid tab (null: the scene's own).
    grid: {
      show: grid.show !== false,
      alpha: grid.alpha == null ? null : Math.min(1, Math.max(0, num(grid.alpha, 0.2))),
      color: grid.color == null ? null : text(grid.color, "#000000").slice(0, 16),
      type: ["square", "hexrow", "hexcol", "none"].includes(grid.type) ? grid.type : null,
      size: nullable(grid.size, (size) => Math.min(1000, Math.max(10, num(size, 100)))),
      offsetX: nullable(grid.offsetX, (offset) => Math.min(1000, Math.max(-1000, Math.round(num(offset, 0) * 10) / 10))),
      offsetY: nullable(grid.offsetY, (offset) => Math.min(1000, Math.max(-1000, Math.round(num(offset, 0) * 10) / 10))),
      distance: nullable(grid.distance, (distance) => Math.min(1000, Math.max(0.1, num(distance, 5)))),
      units: grid.units == null ? null : text(grid.units, "ft").slice(0, 12),
      style: ["solid", "dashed", "dotted"].includes(grid.style) ? grid.style : "solid",
      thickness: Math.min(8, Math.max(1, Math.round(num(grid.thickness, 1)))),
    },
    weather: {
      type: WEATHER.includes(weather.type) ? weather.type : "none",
      intensity: Math.min(1, Math.max(0, num(weather.intensity, 0.5))),
      direction: ((num(weather.direction, 250) % 360) + 360) % 360,
    },
    // This scene's diagonal rule ("1", "1.5", "raw"); null: the campaign's.
    diagonal: ["1", "1.5", "raw"].includes(String(value.diagonal)) ? String(value.diagonal) : null,
  };
}

// A line drawn on a scene, for everyone: who drew it, its colour and width
// (scene pixels), and its points (x, y, x, y, ...).
// A death marker: where a creature died, its set (shared/map/deathMarkers.mjs), which of the set's pictures, turned and sized.
function cleanDeathMarker(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7) return null;
  return {
    id: text(raw.id, "") || crypto.randomBytes(5).toString("hex"),
    x: Math.round(x),
    y: Math.round(y),
    set: text(raw.set, "blood-red").slice(0, 40),
    variant: Math.max(0, Math.min(63, Math.round(num(raw.variant, 0)))),
    rotation: Math.round(num(raw.rotation, 0)) % 360,
    size: Math.min(3, Math.max(0.5, num(raw.size, 1))),
    name: text(raw.name, "").slice(0, 60),
  };
}
const MAX_DEATH_MARKERS = 300;
const TWO_POINT = new Set(["line", "arrow", "rect", "ellipse", "circle", "cone"]);
function cleanDrawing(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.points)) return null;
  const points = raw.points.slice(0, 4000).map(Number);
  if (points.length < 4 || points.length % 2 || !points.every((value) => Number.isFinite(value) && Math.abs(value) < 1e7)) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? String(raw.color) : "#ffcc33";
  const line = { id: text(raw.id, "") || crypto.randomBytes(6).toString("hex"), by: text(raw.by, "").slice(0, 24), color, width: Math.min(80, Math.max(1, num(raw.width, 6))), points: points.map((value) => Math.round(value * 10) / 10) };
  // The GM's paint (FG's Paint tab, Foundry's drawings): a shape, a fill, an opacity, a group.
  const shape = ["free", "line", "arrow", "rect", "ellipse", "circle", "cone", "poly"].includes(raw.shape) ? raw.shape : "free";
  if (shape !== "free") line.shape = shape;
  // A two-point shape (a line, an arrow, a square, a circle from its centre, a cone from its point) keeps two points.
  if (TWO_POINT.has(shape)) line.points = line.points.slice(0, 4);
  if (raw.fill && /^#[0-9a-f]{6}$/i.test(String(raw.fill))) {
    line.fill = String(raw.fill);
    line.fillAlpha = Math.min(1, Math.max(0, num(raw.fillAlpha, 0.5)));
  }
  if (raw.alpha != null) line.alpha = Math.min(1, Math.max(0.05, num(raw.alpha, 1)));
  if (raw.group) line.group = text(raw.group, "").slice(0, 40);
  return line;
}

// An FX layer (FG's FX tab): rain, snow, fog... with FG's sliders (0..1) and
// a mask it fills (inside) or leaves (outside). players false: the GM's only.
// The mask is the GM's painted areas, as many as wanted: shapes (polygons:
// rectangles, corners clicked) and brush strokes (a line of points with a
// width), all together; soft: how far its edge fades, in map pixels.
const FX_TYPES = ["rain", "storm", "snow", "blizzard", "fog", "clouds", "sandstorm", "embers", "ash", "leaves", "water"];
function cleanFx(raw) {
  if (!raw || typeof raw !== "object") return null;
  const unit = (value, fallback) => Math.min(1, Math.max(0, num(value, fallback)));
  const polygons = (Array.isArray(raw.mask?.polygons) ? raw.mask.polygons : [])
    .map((points) => (Array.isArray(points) ? points.slice(0, 2000).map(Number) : []))
    .filter((points) => points.length >= 6 && points.length % 2 === 0 && points.every(Number.isFinite))
    .slice(0, 200);
  const strokes = (Array.isArray(raw.mask?.strokes) ? raw.mask.strokes : [])
    .map((stroke) => ({ width: Math.round(Math.min(800, Math.max(4, num(stroke?.width, 60)))), points: Array.isArray(stroke?.points) ? stroke.points.slice(0, 4000).map((value) => Math.round(Number(value))) : [] }))
    .filter((stroke) => stroke.points.length >= 2 && stroke.points.length % 2 === 0 && stroke.points.every(Number.isFinite))
    .slice(0, 200);
  const painted = polygons.length > 0 || strokes.length > 0;
  return {
    id: text(raw.id, "").slice(0, 40) || `fx-${crypto.randomBytes(5).toString("hex")}`,
    name: text(raw.name, "").slice(0, 40),
    type: FX_TYPES.includes(raw.type) ? raw.type : "rain",
    amount: unit(raw.amount, 1),
    intensity: unit(raw.intensity, 0.5),
    speed: unit(raw.speed, 0.5),
    direction: ((num(raw.direction, 250) % 360) + 360) % 360,
    mask: { use: Boolean(raw.mask?.use) && painted, mode: raw.mask?.mode === "outside" ? "outside" : "inside", polygons, strokes, soft: Math.round(Math.min(200, Math.max(0, num(raw.mask?.soft, 12)))) },
    group: text(raw.group, "").slice(0, 40),
    players: raw.players !== false,
    shown: raw.shown !== false,
  };
}

// An image layer (FG's image layers, Foundry's tiles): a picture from the
// tile library (lib/<file>) placed on the map, in scene pixels from its
// top-left corner, turned about its centre. level below: under the tokens
// (FG); above: over them (Foundry's overhead tiles: roofs, tree tops), faded
// on a seat's screen while one of its tokens is under it. The list's order is
// the drawing order: first at the bottom.
const MAX_TILES = 300;
function cleanTile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = text(raw.src, "").slice(0, 300);
  const width = num(raw.width, 0);
  const height = num(raw.height, 0);
  if (!src || !(width > 0) || !(height > 0)) return null;
  return {
    id: text(raw.id, "").slice(0, 40) || `tile-${crypto.randomBytes(5).toString("hex")}`,
    name: text(raw.name, "").slice(0, 60),
    src,
    x: Math.round(num(raw.x, 0) * 10) / 10,
    y: Math.round(num(raw.y, 0) * 10) / 10,
    width: Math.min(40000, Math.round(width * 10) / 10),
    height: Math.min(40000, Math.round(height * 10) / 10),
    rotation: ((Math.round(num(raw.rotation, 0)) % 360) + 360) % 360,
    alpha: Math.min(1, Math.max(0, num(raw.alpha, 1))),
    flipX: Boolean(raw.flipX),
    flipY: Boolean(raw.flipY),
    level: raw.level === "above" ? "above" : "below",
    hidden: Boolean(raw.hidden),
    locked: Boolean(raw.locked),
    group: text(raw.group, "").slice(0, 40),
  };
}

function savedMap(value) {
  const tokens = {};
  const doors = {};
  const sight = {};
  const locked = {};
  const settings = {};
  const lights = {};
  const drawings = {};
  const deathMarkers = {};
  const walls = {};
  const masks = {};
  const labels = {};
  const groups = {};
  const fx = {};
  const tiles = {};
  const templates = {};
  const frames = value && typeof value === "object" && value.frames && typeof value.frames === "object" ? Object.fromEntries(Object.entries(value.frames).slice(0, 500)) : {};
  // The characters that have had a token on each scene (a player cannot take
  // theirs off and put it back somewhere else: the GM places it again).
  const entered = {};
  // Map Studio's project for an image (its editor's own record, kept so the
  // next open is exact) and the picture it painted (a file kept beside the
  // campaign: its name and version), by scene id.
  const studio = value && typeof value === "object" && value.studio && typeof value.studio === "object" ? Object.fromEntries(Object.entries(value.studio).slice(0, 500).filter(([, item]) => item && typeof item === "object")) : {};
  // What each player has seen of each scene (fog of war, FG's and Foundry's
  // explored areas): kept by the host, saved with the campaign, sent to that player alone.
  const explored = {};
  const regions = {};
  const sounds = {};
  if (!value || typeof value !== "object") return { tokens, doors, sight, locked, settings, lights, drawings, deathMarkers, walls, masks, labels, groups, fx, tiles, frames, entered, studio, explored, regions, sounds, templates };
  for (const [sceneId, list] of Object.entries(value.sounds ?? {}).slice(0, 500)) if (Array.isArray(list)) sounds[sceneId.slice(0, 80)] = list.map(cleanMapSound).filter(Boolean).slice(0, MAX_MAP_SOUNDS);
  for (const [sceneId, list] of Object.entries(value.regions ?? {}).slice(0, 500)) if (Array.isArray(list)) regions[sceneId.slice(0, 80)] = list.map(cleanRegion).filter(Boolean).slice(0, MAX_REGIONS);
  for (const [sceneId, row] of Object.entries(value.explored ?? {}).slice(0, 500)) {
    if (!row || typeof row !== "object") continue;
    explored[sceneId.slice(0, 80)] = Object.fromEntries(
      Object.entries(row)
        .slice(0, 40)
        .filter(([, list]) => Array.isArray(list))
        .map(([name, list]) => [name.slice(0, 24), list.filter((polygon) => Array.isArray(polygon) && polygon.length >= 6 && polygon.length <= 8000).map((polygon) => polygon.map((value) => Math.round(Number(value) || 0))).slice(-EXPLORED_KEPT)]),
    );
  }
  for (const [sceneId, list] of Object.entries(value.templates ?? {}).slice(0, 500)) if (Array.isArray(list)) templates[sceneId.slice(0, 80)] = list.map(cleanTemplate).filter(Boolean).slice(-MAX_TEMPLATES);
  for (const [sceneId, list] of Object.entries(value.deathMarkers ?? {}).slice(0, 500)) {
    if (Array.isArray(list)) deathMarkers[sceneId.slice(0, 80)] = list.map(cleanDeathMarker).filter(Boolean).slice(-MAX_DEATH_MARKERS);
  }
  for (const [sceneId, list] of Object.entries(value.entered ?? {}).slice(0, 500)) if (Array.isArray(list)) entered[sceneId.slice(0, 80)] = list.map((id) => text(id, "").slice(0, 160)).filter(Boolean).slice(0, 1000);
  for (const [sceneId, list] of Object.entries(value.tiles ?? {}).slice(0, 500)) if (Array.isArray(list)) tiles[sceneId.slice(0, 80)] = list.map(cleanTile).filter(Boolean).slice(0, MAX_TILES);
  for (const [sceneId, list] of Object.entries(value.fx ?? {}).slice(0, 500)) if (Array.isArray(list)) fx[sceneId.slice(0, 80)] = list.map(cleanFx).filter(Boolean).slice(0, 20);
  for (const [sceneId, list] of Object.entries(value.labels ?? {}).slice(0, 500)) if (Array.isArray(list)) labels[sceneId.slice(0, 80)] = list.map(cleanLabel).filter(Boolean).slice(0, 2000);
  for (const [sceneId, list] of Object.entries(value.groups ?? {}).slice(0, 500)) if (Array.isArray(list)) groups[sceneId.slice(0, 80)] = list.map(cleanGroup).filter(Boolean).slice(0, 100);
  for (const [sceneId, mask] of Object.entries(value.masks ?? {}).slice(0, 500)) masks[sceneId.slice(0, 80)] = cleanMask(mask);
  for (const [sceneId, list] of Object.entries(value.walls ?? {}).slice(0, 500)) {
    if (Array.isArray(list)) walls[sceneId.slice(0, 80)] = list.map(cleanWall).filter(Boolean).slice(0, MAX_WALLS);
  }
  for (const [sceneId, list] of Object.entries(value.tokens ?? {}).slice(0, 500)) {
    if (!Array.isArray(list)) continue;
    tokens[sceneId.slice(0, 80)] = list.map(cleanToken).filter(Boolean).slice(0, MAX_TOKENS);
  }
  for (const [sceneId, row] of Object.entries(value.doors ?? {}).slice(0, 500)) {
    if (!row || typeof row !== "object") continue;
    doors[sceneId.slice(0, 80)] = Object.fromEntries(
      Object.entries(row)
        .filter(([, state]) => [0, 1, 2].includes(state))
        .slice(0, 2000),
    );
  }
  for (const [sceneId, on] of Object.entries(value.sight ?? {}).slice(0, 500)) sight[sceneId.slice(0, 80)] = Boolean(on);
  for (const [sceneId, on] of Object.entries(value.locked ?? {}).slice(0, 500)) locked[sceneId.slice(0, 80)] = Boolean(on);
  for (const [sceneId, row] of Object.entries(value.settings ?? {}).slice(0, 500)) settings[sceneId.slice(0, 80)] = cleanSettings(row);
  for (const [sceneId, list] of Object.entries(value.lights ?? {}).slice(0, 500)) {
    if (Array.isArray(list)) lights[sceneId.slice(0, 80)] = list.map(cleanLight).filter(Boolean).slice(0, 500);
  }
  for (const [sceneId, list] of Object.entries(value.drawings ?? {}).slice(0, 500)) {
    if (Array.isArray(list)) drawings[sceneId.slice(0, 80)] = list.map(cleanDrawing).filter(Boolean).slice(-MAX_DRAWINGS);
  }
  return { tokens, doors, sight, locked, settings, lights, drawings, deathMarkers, walls, masks, labels, groups, fx, tiles, frames, entered, studio, explored, regions, sounds, templates };
}
// Explored areas kept per player and scene (geometry.mjs EXPLORED_CAP).
const EXPLORED_KEPT = 400;

// A region of the map (Map Studio's Traps & regions, a Foundry region): trap
// and pit spring when a player's token steps in (the token stops there, the
// GM is told, movement locks); difficult terrain costs more to cross;
// teleport moves whoever steps in to its destination (a point here, another
// region by name, or a point on another scene). Players are never sent the
// traps, pits and teleports, nor any note.
const REGION_KINDS = ["trap", "pit", "difficult", "teleport"];
function cleanRegion(raw) {
  if (!raw || typeof raw !== "object" || !REGION_KINDS.includes(raw.kind)) return null;
  const points = Array.isArray(raw.points) ? raw.points.map(Number).filter(Number.isFinite).slice(0, 2000) : [];
  if (points.length < 6 || points.length % 2) return null;
  const to = raw.to;
  return {
    id: text(raw.id, "").slice(0, 64) || `r-${crypto.randomBytes(5).toString("hex")}`,
    kind: raw.kind,
    name: text(raw.name, raw.kind === "difficult" ? "Difficult terrain" : raw.kind[0].toUpperCase() + raw.kind.slice(1)).slice(0, 120),
    note: typeof raw.note === "string" ? raw.note.slice(0, 4000) : "",
    points: points.map((value) => Math.round(value * 10) / 10),
    on: raw.on !== false,
    ...(raw.kind === "difficult" ? { cost: Math.min(5, Math.max(1, num(raw.cost, 2))) } : {}),
    ...(raw.kind === "teleport"
      ? {
          to:
            typeof to === "string"
              ? text(to, "").slice(0, 120)
              : to && typeof to === "object" && Number.isFinite(Number(to.x)) && Number.isFinite(Number(to.y))
                ? { x: Number(to.x), y: Number(to.y), ...(typeof to.sceneId === "string" && to.sceneId ? { sceneId: to.sceneId.slice(0, 80) } : {}) }
                : "",
        }
      : {}),
  };
}
const MAX_REGIONS = 300;

// A sound placed on the map (Foundry's ambient sound): a library sound that
// loops at a point, heard by players whose tokens are within its radius
// (feet), louder nearer, muffled by walls that stop sound.
function cleanMapSound(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  const sound = text(raw.sound, "").slice(0, 300);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !sound) return null;
  return {
    id: text(raw.id, "").slice(0, 64) || `s-${crypto.randomBytes(5).toString("hex")}`,
    name: text(raw.name, sound.split("/").pop() ?? "Sound").slice(0, 80),
    sound,
    x: Math.round(x),
    y: Math.round(y),
    radius: Math.min(1000, Math.max(5, num(raw.radius, 30))),
    volume: Math.min(1, Math.max(0, num(raw.volume, 0.8))),
    on: raw.on !== false,
  };
}
const MAX_MAP_SOUNDS = 60;
const MAX_DRAWINGS = 400;
const MAX_PLAYER_DRAWINGS = 60;

// A light from CoreRPG's presets (squares), in feet at 5 ft a square, or the
// game's own light profiles by name (SiegeCore: radius r is bright r, dim 2r).
function presetLight(name, profiles = []) {
  const key = String(name).toLowerCase();
  if (key === "none" || key === "") return null;
  const profile = profiles.find((item) => String(item.name).toLowerCase() === key);
  if (profile) return cleanCarried({ name: profile.name, bright: profile.radius, dim: profile.radius * 2, color: geometry.LIGHT_PRESETS[key.split(/[ ,]/)[0]]?.color ?? "#FFB45C" });
  const preset = geometry.LIGHT_PRESETS[key];
  return preset ? cleanCarried({ name: preset.name, bright: preset.bright * 5, dim: preset.dim * 5, color: preset.color }) : null;
}

// Walls an image may hold from Map Studio (FG maps run to many thousands of segments).
const MAX_WALLS_STUDIO = 20000;

function createMapState({ saved, records, onChange = () => undefined, hasArt = () => false, hasPicture = () => false, artFor = () => null, hasTile = () => true, combatFor = () => null, activeRecord = () => null, sharedWith = null, colorOf = playerColor, tableOptions = () => ({}), onRegion = () => undefined, onTracker = () => false, onFaction = () => undefined }) {
  // One master per map: a second state (the GM's private image window) works on
  // the very same walls, lights, tokens, paint and effects as the table's.
  const state = sharedWith ? sharedWith.rawState() : savedMap(saved);
  state.explored = state.explored ?? {};
  // Counts that move on when a player's explored areas change ("*": anyone's), so each is sent only its own news (not saved).
  if (!("exploredVersions" in state)) Object.defineProperty(state, "exploredVersions", { value: new Map(), enumerable: false });
  const bumpExplored = (key) => {
    state.exploredVersions.set(key, (state.exploredVersions.get(key) ?? 0) + 1);
    state.exploredVersions.set("*", (state.exploredVersions.get("*") ?? 0) + 1);
  };
  // The last views merged for each player, so the same view is not merged again.
  const lastMerged = new Map();
  state.regions = state.regions ?? {};
  state.sounds = state.sounds ?? {};
  function soundsHere() {
    if (!scene) return [];
    state.sounds[scene.id] = state.sounds[scene.id] ?? [];
    return state.sounds[scene.id];
  }
  // What a player hears of the placed sounds: by their nearest token in reach,
  // fading to nothing at the edge; through walls that stop sound, quieter and muffled.
  function soundsHeard(listeners) {
    const per = pixelsPerUnit();
    const out = [];
    for (const placed of soundsHere()) {
      if (!placed.on) continue;
      let best = null;
      for (const token of listeners) {
        const reach = placed.radius * per;
        const distance = Math.hypot(token.x - placed.x, token.y - placed.y);
        if (distance > reach) continue;
        const walls = geometry.soundWalls(wallsHere(), doorsHere(), token, placed);
        const gain = placed.volume * (1 - distance / reach) * (walls ? 0.45 / walls : 1);
        if (!best || gain > best.gain) best = { gain, muffled: walls > 0 };
      }
      if (best && best.gain > 0.01) out.push({ id: placed.id, sound: placed.sound, gain: Math.round(best.gain * 100) / 100, ...(best.muffled ? { muffled: true } : {}) });
    }
    return out;
  }
  // Each token's moves, to undo and to draw this turn's path (not saved), and
  // the moves players asked for while movement is locked (FG's TokenMoveManager).
  if (!("moveLog" in state)) Object.defineProperty(state, "moveLog", { value: new Map(), enumerable: false });
  if (!("moveRequests" in state)) Object.defineProperty(state, "moveRequests", { value: new Map(), enumerable: false });
  const logKey = (token) => `${scene.id}|${token.id}`;
  const logOf = (token) => state.moveLog.get(logKey(token)) ?? [];
  let scene = null;
  const visionCache = new Map();
  // The last edits on each scene's walls, to undo (FG has none; Foundry Ctrl+Z).
  const undoRing = new Map();

  function wallsHere() {
    if (!scene) return [];
    state.walls[scene.id] = state.walls[scene.id] ?? [];
    return state.walls[scene.id];
  }
  // The scene the rules see: its walls are the table's own, its grid the GM's.
  function liveScene() {
    if (!scene) return;
    scene.walls = wallsHere();
    // The scene's own grid is kept beside the GM's, so clearing a setting goes back to it.
    scene.baseGrid = scene.baseGrid ?? { ...scene.grid };
    scene.grid = geometry.withGrid({ grid: scene.baseGrid }, settingsHere().grid).grid;
  }
  function fxHere() {
    if (!scene) return [];
    state.fx[scene.id] = state.fx[scene.id] ?? [];
    return state.fx[scene.id];
  }
  function tilesHere() {
    if (!scene) return [];
    state.tiles[scene.id] = state.tiles[scene.id] ?? [];
    return state.tiles[scene.id];
  }
  function findTile(id) {
    const tile = tilesHere().find((item) => item.id === id);
    if (!tile) throw new Error(`No image layer ${id} on this scene.`);
    return tile;
  }
  const groupLocked = (name) => Boolean(name && groupsHere().find((group) => group.name === name)?.locked);
  // The picture's address for a seat (served under its asset token).
  const tileOut = (tile, assetToken) => ({ ...tile, url: `/tile/file?token=${assetToken}&id=${encodeURIComponent(tile.src)}` });
  function labelsHere() {
    if (!scene) return [];
    state.labels[scene.id] = state.labels[scene.id] ?? [];
    return state.labels[scene.id];
  }
  function groupsHere() {
    if (!scene) return [];
    state.groups[scene.id] = state.groups[scene.id] ?? [];
    return state.groups[scene.id];
  }
  function groupOf(name) {
    if (!name) return null;
    let group = groupsHere().find((item) => item.name === name);
    if (!group) {
      group = cleanGroup({ name });
      groupsHere().push(group);
    }
    return group;
  }
  // What a seat sees of a thing in a group: the group shown, players allowed.
  const groupLets = (name, seat) => {
    const group = name ? groupsHere().find((item) => item.name === name) : null;
    if (!group) return true;
    return seat.role === "dm" ? true : group.shown && group.players;
  };
  function maskHere() {
    if (!scene) return cleanMask({});
    state.masks[scene.id] = state.masks[scene.id] ?? cleanMask({});
    return state.masks[scene.id];
  }
  // Under the mask for players: the mask is on and the last shape over the point does not reveal it.
  function masked(x, y) {
    const mask = maskHere();
    if (!mask.on) return false;
    let hidden = true;
    for (const shape of mask.shapes) if (geometry.pointInPolygon(x, y, shape.points)) hidden = shape.mode === "hide";
    return hidden;
  }
  // Every undoable edit snapshots the same things (walls with their door
  // states, mask, text, groups, image layers), so undoing one edit never
  // brings back another's leftovers.
  // Whether a drawing is wholly under the mask: every point of it (up to 64
  // spread along it) and the middle of its box.
  function drawnUnderMask(line) {
    if (!maskHere().on) return false;
    const points = line.points;
    const count = points.length / 2;
    const step = Math.max(1, Math.ceil(count / 64));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < count; i += 1) {
      const x = points[i * 2];
      const y = points[i * 2 + 1];
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      if ((i % step === 0 || i === count - 1) && !masked(x, y)) return false;
    }
    return masked((x0 + x1) / 2, (y0 + y1) / 2);
  }
  function remember(label) {
    const ring = undoRing.get(scene.id) ?? [];
    ring.push({ label, walls: JSON.parse(JSON.stringify(wallsHere())), doors: { ...doorsHere() }, mask: JSON.parse(JSON.stringify(maskHere())), labels: JSON.parse(JSON.stringify(labelsHere())), groups: JSON.parse(JSON.stringify(groupsHere())), tiles: JSON.parse(JSON.stringify(tilesHere())) });
    if (ring.length > 50) ring.shift();
    undoRing.set(scene.id, ring);
  }

  function tokensHere() {
    if (!scene) return [];
    state.tokens[scene.id] = state.tokens[scene.id] ?? [];
    return state.tokens[scene.id];
  }

  function enteredHere() {
    if (!scene) return [];
    state.entered[scene.id] = state.entered[scene.id] ?? [];
    return state.entered[scene.id];
  }
  function markEntered(recordId) {
    const list = enteredHere();
    if (!list.includes(recordId) && list.length < 1000) list.push(recordId);
  }

  function doorsHere() {
    if (!scene) return {};
    state.doors[scene.id] = state.doors[scene.id] ?? {};
    return state.doors[scene.id];
  }

  function settingsHere() {
    if (!scene) return cleanSettings({});
    state.settings[scene.id] = state.settings[scene.id] ?? cleanSettings({});
    return state.settings[scene.id];
  }

  // The darkness now: the GM's setting, else the scene's own (from Foundry).
  function darkness() {
    const set = settingsHere().darkness;
    return set == null ? (scene?.darkness ?? 0) : set;
  }

  function deathMarkersHere() {
    if (!scene) return [];
    state.deathMarkers = state.deathMarkers ?? {};
    state.deathMarkers[scene.id] = state.deathMarkers[scene.id] ?? [];
    return state.deathMarkers[scene.id];
  }
  function drawingsHere() {
    if (!scene) return [];
    state.drawings[scene.id] = state.drawings[scene.id] ?? [];
    return state.drawings[scene.id];
  }

  function lightsHere() {
    if (!scene) return [];
    state.lights[scene.id] = state.lights[scene.id] ?? [];
    return state.lights[scene.id];
  }

  // The game's light profiles (SiegeCore Game Settings: Torch 40, lanterns...).
  function lightProfiles() {
    const game = records.list({ type: "siegegame" })[0];
    return Object.values(game?.data?.lightprofiles ?? {}).filter((row) => row && typeof row === "object" && Number(row.radius) > 0);
  }

  function pixelsPerUnit() {
    return geometry.gridSize(scene) / units();
  }

  // How far a token sees in the dark, in feet: its own setting, else its
  // character's senses (C&C deepvision, darkvision, twilight vision).
  function visionRange(token) {
    return sensesOf(token).darkvision;
  }

  // Every light shining now: the scene's lights that are on, and the lights
  // tokens carry. Each with its reach (pixels) and its own line of sight.
  function lightSources() {
    const per = pixelsPerUnit();
    const out = [];
    const add = (id, x, y, bright, dim, color, hidden, shape = {}) => {
      const reachPx = Math.max(bright, dim) * per;
      const angle = shape.angle ?? 360;
      const key = `L|${scene.id}|${Math.round(x)}|${Math.round(y)}|${Math.round(reachPx)}|${angle}|${shape.rotation ?? 0}`;
      let polygon = visionCache.get(key);
      if (!polygon) {
        // A light's polygon reaches only as far as its dim light (and a little); a beam only its cone.
        const cone = angle < 360 ? { angle, from: (((shape.rotation ?? 0) - angle / 2) * Math.PI) / 180 } : null;
        polygon = geometry.sceneSight(scene, { x, y }, doorsHere(), 0, "light", reachPx * 1.05 + 1, cone);
        visionCache.set(key, polygon);
      }
      out.push({ id, x, y, brightPx: bright * per, dimPx: dim * per, color, hidden, polygon, ...(shape.animation && shape.animation !== "none" ? { animation: shape.animation, speed: shape.speed } : {}) });
    };
    for (const light of lightsHere()) if (light.on && !light.hidden && !light.darkness) add(light.id, light.x, light.y, light.bright, light.dim, light.color, light.hidden, light);
    // A hidden token's light is marked hidden: it reaches the GM only.
    for (const token of tokensHere()) if (token.light) add(`token:${token.id}`, token.x, token.y, token.light.bright, token.light.dim, token.light.color, token.hidden);
    // Lights its effects shed (a torch, the Light spell): centred on the token, moving with it.
    if (effectsLib) {
      for (const token of tokensHere()) {
        for (const effect of effectsOn(token)) {
          if (effect.paused) continue;
          const light = effectsLib.lightOf(effect.label);
          if (light && light.dim > 0) add(`fx:${token.id}:${effect.id}`, token.x, token.y, light.bright, light.dim, light.color, token.hidden, { animation: light.animation === "flicker" ? "torch" : light.animation === "pulse" ? "pulse" : "none", speed: 0.5 });
        }
      }
    }
    return out;
  }

  // Magical darkness on the scene now: each with its reach (pixels) and its own outline.
  function darknessSources() {
    const per = pixelsPerUnit();
    const out = [];
    for (const light of lightsHere()) {
      if (!light.on || !light.darkness) continue;
      const reachPx = Math.max(light.bright, light.dim) * per;
      const key = `D|${scene.id}|${Math.round(light.x)}|${Math.round(light.y)}|${Math.round(reachPx)}`;
      let polygon = visionCache.get(key);
      if (!polygon) {
        polygon = geometry.sceneSight(scene, { x: light.x, y: light.y }, doorsHere(), 0, "light", reachPx * 1.05 + 1, null);
        visionCache.set(key, polygon);
      }
      out.push({ id: light.id, x: light.x, y: light.y, radiusPx: reachPx, polygon, hidden: light.hidden });
    }
    return out;
  }

  // A token's senses (its own line, else its character's), in feet; its sight
  // in the dark set on the token wins over darkvision.
  function sensesOf(token) {
    const record = token.recordId ? records.get(token.recordId) : null;
    const parsed = geometry.parseSenses(token.senses || record?.data?.senses);
    return { ...parsed, darkvision: token.vision != null ? token.vision : parsed.darkvision };
  }

  function sightOn() {
    if (!scene) return false;
    if (scene.id in state.sight) return state.sight[scene.id];
    return wallsHere().some((wall) => geometry.blocksSight(wall, {}));
  }

  // A change to the map. The cached sight and light polygons depend only on
  // the walls, doors, grid and each viewer's or light's own place and reach
  // (all in their keys), so edits that touch none of the first three (a token
  // moved, a slider dragged) keep them: keepVision.
  function changed({ keepVision = false } = {}) {
    if (!keepVision || visionCache.size > 4000) visionCache.clear();
    onChange();
  }

  // How a diagonal counts here: the scene's rule, else the campaign's (FG's HRDD).
  function diagonalNow() {
    return settingsHere().diagonal ?? tableOptions().diagonal ?? "1";
  }

  function regionsHere() {
    if (!scene) return [];
    state.regions[scene.id] = state.regions[scene.id] ?? [];
    return state.regions[scene.id];
  }
  // What entering a point costs (Map Studio's difficult terrain, cost 2 by
  // default), or null when the scene has none.
  function terrainCost() {
    const list = regionsHere().filter((region) => region.kind === "difficult" && region.on);
    if (!list.length) return null;
    return (x, y) => {
      let cost = 1;
      for (const region of list) if (region.cost > cost && geometry.pointInPolygon(x, y, region.points)) cost = region.cost;
      return cost;
    };
  }
  const terrainOut = () => regionsHere().filter((region) => region.kind === "difficult" && region.on).map((region) => ({ points: region.points, cost: region.cost }));
  const regionCentre = (region) => {
    const xs = region.points.filter((_, index) => index % 2 === 0);
    const ys = region.points.filter((_, index) => index % 2 === 1);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  // Where a move from a to b first steps into a trap, pit or teleport it did not start in.
  function enteredRegion(a, b) {
    const list = regionsHere().filter((region) => region.on && region.kind !== "difficult" && !geometry.pointInPolygon(a.x, a.y, region.points));
    if (!list.length) return null;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (geometry.gridSize(scene) / 4)));
    for (let step = 1; step <= steps; step += 1) {
      const at = { x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps };
      const region = list.find((item) => geometry.pointInPolygon(at.x, at.y, item.points));
      if (region) return { region, at };
    }
    return null;
  }
  // A token moved, as its mover may: stopped by walls (collide), at the edge of
  // a trap a player's token steps into, or sent on by a teleport. The move is
  // kept to undo and for this turn's path.
  function stepToken(token, to, seat, { snap, collide }) {
    const from = { x: token.x, y: token.y };
    const result = geometry.settleMove(scene, wallsHere(), doorsHere(), from, to, token.squares, { snap, collide });
    let at = { x: result.x, y: result.y };
    let sprang = null;
    // A play test's token (an "@" seat) springs traps too, but never locks the table.
    const tester = String(seat.name ?? "").startsWith("@");
    if (seat.role !== "dm") {
      const hit = enteredRegion(from, at);
      if (hit) {
        sprang = hit.region;
        if (hit.region.kind === "teleport") {
          const dest = hit.region.to;
          const named = typeof dest === "string" && dest ? regionsHere().find((item) => item.name.toLowerCase() === dest.toLowerCase() && item !== hit.region) : null;
          if (dest && typeof dest === "object" && dest.sceneId && dest.sceneId !== scene.id) {
            // To another scene (one the table has opened before): the token goes there.
            const there = state.tokens[dest.sceneId];
            if (Array.isArray(there) && there.length < MAX_TOKENS) {
              tokensHere().splice(tokensHere().indexOf(token), 1);
              there.push({ ...token, x: dest.x, y: dest.y });
              state.moveLog.delete(logKey(token));
              return { blocked: result.blocked, sprang, gone: dest.sceneId };
            }
          } else if (named || (dest && typeof dest === "object")) {
            const point = named ? regionCentre(named) : dest;
            at = geometry.snapCenter(scene, point.x, point.y, token.squares);
          }
        } else {
          // A trap or pit: the token stops on the first square of it.
          const stop = geometry.snapCenter(scene, hit.at.x, hit.at.y, token.squares);
          at = geometry.pointInPolygon(stop.x, stop.y, hit.region.points) ? stop : { x: Math.round(hit.at.x), y: Math.round(hit.at.y) };
          if (!tester) state.locked[scene.id] = true;
        }
      }
    }
    token.x = at.x;
    token.y = at.y;
    if (at.x !== from.x || at.y !== from.y) {
      const log = [...logOf(token), { from, to: { ...at }, by: seat.name }].slice(-40);
      state.moveLog.set(logKey(token), log);
    }
    if (sprang) onRegion({ region: sprang, token, seat, sceneId: scene.id });
    return { blocked: result.blocked, sprang };
  }
  // A player's move while the GM has locked movement: asked for, until the GM says.
  function requestMove(token, to, seat) {
    const point = geometry.snapCenter(scene, to.x, to.y, token.squares);
    state.moveRequests.set(logKey(token), { id: token.id, name: token.name, by: seat.name, from: { x: token.x, y: token.y }, to: point, at: Date.now() });
  }
  function requestsHere() {
    if (!scene) return [];
    const prefix = `${scene.id}|`;
    return [...state.moveRequests].filter(([key]) => key.startsWith(prefix)).map(([, request]) => request);
  }

  function units() {
    return scene && scene.grid.distance > 0 ? scene.grid.distance : 5;
  }

  // The centre of a square (col, row) for a token that many squares wide.
  function squareCenter(col, row, squares) {
    const size = geometry.gridSize(scene);
    const origin = geometry.gridOrigin(scene);
    return { x: origin.x + (col + squares / 2) * size, y: origin.y + (row + squares / 2) * size };
  }

  function squareOf(token) {
    const size = geometry.gridSize(scene);
    const origin = geometry.gridOrigin(scene);
    return { col: Math.round((token.x - origin.x) / size - token.squares / 2), row: Math.round((token.y - origin.y) / size - token.squares / 2) };
  }

  // A free square near x, y for a new token: the drop point, else the nearest
  // square no other token covers, spiralling out.
  function freeSpot(x, y, squares) {
    const size = geometry.gridSize(scene);
    const start = geometry.snapCenter(scene, x, y, squares);
    const taken = (point) => tokensHere().some((token) => Math.abs(token.x - point.x) < size / 2 && Math.abs(token.y - point.y) < size / 2);
    if (!taken(start)) return start;
    for (let ring = 1; ring < 12; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const point = { x: start.x + dx * size, y: start.y + dy * size };
          if (!taken(point)) return point;
        }
      }
    }
    return start;
  }

  function sceneCenter() {
    const origin = geometry.gridOrigin(scene);
    return { x: origin.x + scene.width / 2, y: origin.y + scene.height / 2 };
  }

  function canMove(token, seat) {
    return seat.role === "dm" || (token.owner !== "" && token.owner === seat.name);
  }

  // The effects on a token's creature: its tracker entry's while it is in the
  // fight, else the token's own.
  function effectsOn(token) {
    const tracked = combatFor(token.id);
    return tracked?.effects ?? token.effects ?? [];
  }
  // Can this seat see the token at all? An invisible creature is shown to its
  // owner and the GM only (as a shimmer); other players are not sent it.
  function invisibleTo(token, seat) {
    if (seat.role === "dm" || token.owner === seat.name || !effectsLib) return false;
    return effectsOn(token).some((effect) => !effect.paused && effectsLib.conditionsOf(effect.label).includes("invisible"));
  }
  // What its effects show (shared/actions/effects.mjs visualOf): the GM sees
  // every effect; a player sees all but the GM's secret ones on their own
  // creatures, and only the visible conditions on others (no numbers).
  function visualFor(token, seat) {
    if (!effectsLib) return null;
    const own = seat.role === "dm" || token.owner === seat.name;
    const list = effectsOn(token).filter((effect) => seat.role === "dm" || !effect.gmOnly).filter((effect) => own || effectsLib.conditionsOf(effect.label).length > 0 || effectsLib.lightOf(effect.label));
    const tracked = combatFor(token.id);
    const out = effectsLib.visualOf(list.map((effect) => (own ? effect : { label: effect.label, paused: effect.paused, icon: effect.icon })), { concentrating: own ? tracked?.concentrating : undefined });
    // Its owner and the GM get the effects themselves (the buff bar: remove, put out, relight).
    if (own && list.length) out.list = list.map(({ id, label, duration, total, paused, icon, source, gmOnly }) => ({ id, label, duration, ...(total ? { total } : {}), ...(paused ? { paused } : {}), ...(icon ? { icon } : {}), ...(source ? { source } : {}), ...(gmOnly ? { gmOnly } : {}) }));
    return out.fx.length || out.badges.length ? out : null;
  }

  // Health for the token's dot, from its record (FG's token health dot).
  function health(token) {
    const tracked = combatFor(token.id);
    if (tracked) return tracked.health;
    if (!token.recordId) return null;
    const record = records.get(token.recordId);
    const hp = record?.data?.hp;
    if (!hp || !(Number(hp.total) > 0)) return null;
    return geometry.healthStatus(hp.total, hp.wounds);
  }

  // Whether a token is a character's (a player's) for FG's token options, else the GM's creature.
  function isPc(token) {
    if (token.owner) return true;
    return Boolean(token.recordId && records.get(token.recordId)?.type === "character");
  }
  // FG's token options: what this seat is shown of a token's health (bar,
  // barhover, dot, dothover; off sends none to players) and its name (off:
  // only a player's own; an unidentified name replaces the real one).
  function tokenShows(token, seat) {
    const options = tableOptions();
    // numbers: a bar on the token (the tracker shows the numbers).
    const chosen = (isPc(token) ? options.healthPc : options.healthNpc) ?? "dot";
    const set = chosen === "numbers" ? "bar" : chosen;
    const names = options.names ?? "hover";
    if (seat.role === "dm") return { health: set === "off" ? "dothover" : set, names: names === "off" ? "hover" : names, name: token.name };
    const own = token.owner !== "" && token.owner === seat.name;
    return { health: set, names, name: own ? token.name : names === "off" ? "" : token.unidentified || token.name };
  }

  function movesOut(token) {
    const log = logOf(token);
    if (!log.length) return {};
    return { undo: log.length, ...(onTracker(token) ? { path: [log[0].from.x, log[0].from.y, ...log.flatMap((move) => [move.to.x, move.to.y])] } : {}) };
  }

  function publicToken(token, seat, assetToken) {
    const shows = tokenShows(token, seat);
    const out = {
      id: token.id,
      recordId: token.recordId,
      name: shows.name,
      // How health and the name are drawn on this seat (FG's token options).
      healthShow: shows.health,
      namesShow: shows.names,
      elevation: token.elevation ?? 0,
      ...(seat.role === "dm" ? { unidentified: token.unidentified ?? "", senses: token.senses ?? "" } : {}),
      x: token.x,
      y: token.y,
      squares: token.squares,
      owner: token.owner,
      faction: token.faction,
      // A player's token rings in the colour they chose (Settings > You at the table), as their pings and drawings.
      color: token.owner ? colorOf(token.owner) : FACTION_COLOR[token.faction],
      hidden: token.hidden,
      mine: seat.role === "player" && token.owner === seat.name,
      health: shows.health === "off" ? null : health(token),
      // The GM's and its owner's: how many moves can be undone, and (on the
      // combat tracker) this turn's path, where it went since its turn began.
      ...(seat.role === "dm" || (token.owner !== "" && token.owner === seat.name) ? movesOut(token) : {}),
      // Whose turn it is on the combat tracker.
      active: Boolean(combatFor(token.id)?.active) || (token.recordId != null && token.recordId === activeRecord()),
      light: token.light,
      vision: token.vision,
      facing: token.facing ?? null,
      seesFt: visionRange(token),
    };
    const visual = visualFor(token, seat);
    if (visual) out.effects = visual;
    // A character's token picture, else its portrait (FG's token from the sheet).
    const data = token.recordId ? records.get(token.recordId)?.data : null;
    // A character with none of its own: its race and class's (Kraken's pair).
    const own = [data?.token, data?.portrait].find((id) => typeof id === "string" && hasPicture(id));
    const picture = own ?? (data && records.get(token.recordId)?.type === "character" ? artFor(data) : null);
    if (picture) {
      out.art = `/art/file?token=${assetToken}&id=${encodeURIComponent(picture)}`;
      out.video = picture.toLowerCase().endsWith(".webm");
    } else if (token.sourceId && hasArt(token.sourceId)) out.art = `/table/token?token=${assetToken}&id=${encodeURIComponent(token.sourceId)}`;
    else if (token.recordId && (data?.token || data?.picture) && records.get(token.recordId)?.type !== "character") {
      // An NPC's own token picture, from its module.
      out.art = `/table/record-art?token=${assetToken}&record=${encodeURIComponent(token.recordId)}`;
    }
    return out;
  }

  function polygonFor(token) {
    const doors = doorsHere();
    const key = `${scene.id}|${token.x}|${token.y}|${token.squares}`;
    let polygon = visionCache.get(key);
    if (!polygon) {
      polygon = geometry.sceneSight(scene, { x: token.x, y: token.y }, doors, (token.squares * geometry.gridSize(scene)) / 2);
      visionCache.set(key, polygon);
    }
    return polygon;
  }

  // What a seat is shown of the map now. The GM sees everything. A player
  // with tokens on a line-of-sight scene sees what those tokens see; a player
  // with none sees the whole map, as in FG.
  function viewFor(seat, assetToken) {
    if (!scene) return { sceneId: null, tokens: [], doors: [], vision: null, sight: false, locked: false, darkness: 0, lights: [], seeing: [], settings: cleanSettings({}), sceneLights: [] };
    const locked = Boolean(state.locked[scene.id]);
    const settings = settingsHere();
    const dark = darkness();
    const sources = lightSources();
    const per = pixelsPerUnit();
    const doors = doorsHere();
    const all = tokensHere();
    // Doors, and windows and toggle walls players may open (FG's toggleable).
    const doorList = wallsHere()
      .filter((wall) => wall.door > 0 || wall.toggle === "players" || wall.toggle === "gm")
      .map((wall) => ({ id: wall.id, group: doorGroup(wall), x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, secret: wall.door === 2 || wall.toggle === "gm", kind: wall.door > 0 ? "door" : wall.kind, state: wall.id in doors ? doors[wall.id] : wall.ds }));
    const mask = maskHere();
    const groups = groupsHere();
    const shared = { sceneId: scene.id, sight: sightOn(), locked, darkness: dark, settings: { grid: settings.grid, weather: settings.weather, darkness: settings.darkness, diagonal: settings.diagonal, diagonalRule: diagonalNow() }, drawings: drawingsHere(), deathMarkers: deathMarkersHere(), mask: mask.on || mask.shapes.length ? mask : null, groups, fx: fxHere(), templates: templatesFor(seat) };
    const lightOut = (list) => list.map(({ id, x, y, brightPx, dimPx, color, polygon, animation, speed }) => ({ id, x, y, brightPx, dimPx, color, polygon, ...(animation ? { animation, speed } : {}) }));
    if (seat.role === "dm") {
      return {
        ...shared,
        tokens: all.map((token) => publicToken(token, seat, assetToken)),
        doors: doorList,
        vision: null,
        lights: lightOut(sources),
        // The sounds placed on the map (the GM hears them through the player vision preview).
        mapSounds: soundsHere(),
        sounds: [],
        // Moves players asked for while movement is locked, for the GM's approval strip.
        moveRequests: requestsHere(),
        // Every region (traps and their notes too), and the difficult terrain the ruler counts.
        regions: regionsHere(),
        terrain: terrainOut(),
        darkAreas: darknessSources(),
        trueSeeing: [],
        seeing: [],
        sceneLights: lightsHere(),
        walls: wallsHere(),
        labels: labelsHere(),
        tiles: tilesHere().map((tile) => tileOut(tile, assetToken)),
      };
    }
    const shown = all.filter((token) => !token.hidden && !invisibleTo(token, seat));
    // Player vision preview (the GM's): every player's tokens at once, as the table sees them.
    const mine = shown.filter((token) => token.owner === seat.name || (seat.everyone && token.owner && !token.owner.startsWith("@")));
    const vision = sightOn() && mine.length > 0 ? mine.map(polygonFor) : null;
    const slack = geometry.gridSize(scene) * 0.05;
    // A hidden token's light neither reaches a player nor lights anything for them.
    const shining = sources.filter((light) => !light.hidden);
    // In the dark, a player sees only lit places and what their own tokens'
    // darkvision reaches (inside that token's line of sight).
    // C&C (PHB): bright light, such as a lantern's or a torch's, spoils deepvision
    // and darkvision: a token standing in a light's bright light sees only by light.
    const spoils = records.list({ type: "siegegame" }).length > 0;
    const spoiled = spoils && dark > 0 ? mine.filter((token) => visionRange(token) > 0 && geometry.brightlyLit(token.x, token.y, shining)).map((token) => token.id) : [];
    // Each token's senses: blindsight perceives what is near as darkvision does (and in
    // magical darkness); truesight and Devil's Sight see in magical darkness.
    const senses = new Map(mine.map((token) => [token.id, sensesOf(token)]));
    const seeing = mine
      .map((token, index) => {
        // Darkvision (a bright light spoils it in C&C); blindsight, truesight and Devil's Sight see in the dark too.
        const sense = senses.get(token.id);
        return { x: token.x, y: token.y, radiusPx: Math.max(spoiled.includes(token.id) ? 0 : sense.darkvision, sense.blindsight, sense.truesight, sense.devilsight) * per, polygon: vision ? vision[index] : null };
      })
      .filter((item) => item.radiusPx > 0);
    const trueSeeing = mine
      .map((token, index) => {
        const sense = senses.get(token.id);
        return { x: token.x, y: token.y, radiusPx: Math.max(sense.truesight, sense.devilsight, sense.blindsight) * per, polygon: vision ? vision[index] : null };
      })
      .filter((item) => item.radiusPx > 0);
    const within = (list, x, y) => list.some((item) => Math.hypot(x - item.x, y - item.y) <= item.radiusPx && (!item.polygon || geometry.pointInPolygon(x, y, item.polygon)));
    const darkAreas = darknessSources();
    // Tremorsense: what touches the ground within its reach, through walls, by a token on the ground.
    const tremor = mine.filter((token) => senses.get(token.id).tremorsense > 0 && !(token.elevation > 0));
    const felt = (token) => !(token.elevation > 0) && tremor.some((by) => by !== token && Math.hypot(by.x - token.x, by.y - token.y) <= senses.get(by.id).tremorsense * per);
    // Twilight vision: a moonlit night is like dusk, and dim light is enough.
    const twilight = mine.some((token) => token.recordId && geometry.hasTwilightVision(records.get(token.recordId)?.data?.senses));
    const needsLight = mine.length > 0 && (twilight ? dark >= 1 : dark >= geometry.NEEDS_LIGHT);
    const visibleInDark = (x, y) =>
      mine.length > 0 && within(darkAreas, x, y) ? within(trueSeeing, x, y) : !needsLight || geometry.lit(x, y, shining) || within(seeing, x, y);
    // Nothing under the GM's mask reaches a player (FG: tokens under the mask are hidden), but their own tokens.
    const sighted = (token) => (!vision || geometry.seen(token.x, token.y, vision, slack)) && visibleInDark(token.x, token.y);
    const sensedOnly = new Set();
    const tokens = shown.filter((token) => {
      if (token.owner === seat.name || mine.includes(token)) return true;
      if (masked(token.x, token.y)) return false;
      if (sighted(token)) return true;
      if (!felt(token)) return false;
      sensedOnly.add(token.id);
      return true;
    });
    // A door a player sees any side of is shown whole (all its sides).
    const seenSide = (door) => !door.secret && !masked((door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2) && (!vision || geometry.seen((door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2, vision, slack));
    const seenGroups = new Set(doorList.filter(seenSide).map((door) => door.group));
    const playerDoors = doorList.filter((door) => !door.secret && seenGroups.has(door.group));
    return {
      // A token felt by tremorsense alone is marked so (a shape, not a sight of it).
      tokens: tokens.map((token) => (sensedOnly.has(token.id) ? { ...publicToken(token, seat, assetToken), name: "", health: null, art: undefined, video: undefined, light: null, sensed: true } : publicToken(token, seat, assetToken))),
      ...shared,
      // The placed sounds they hear now, and how loud (never where they are).
      sounds: soundsHeard(mine),
      // Their own moves waiting for the GM, and the difficult terrain (no traps, no notes) the ruler counts.
      moveRequests: requestsHere().filter((request) => request.by === seat.name),
      terrain: terrainOut(),
      // Magical darkness reaching what the player sees, and where their truesight sees through it.
      darkAreas: darkAreas.filter((area) => !area.hidden && (!vision || mine.some((token) => Math.hypot(token.x - area.x, token.y - area.y) <= area.radiusPx) || vision.some((polygon) => geometry.polygonsOverlap(area.polygon, polygon)))).map(({ hidden: _hidden, ...area }) => area),
      trueSeeing,
      doors: playerDoors.map(({ secret, ...door }) => door),
      vision,
      // Only the lights that reach what the player sees now: a light's polygon
      // is the outline of its room, and an unseen room's outline is the GM's.
      lights: lightOut(vision ? shining.filter((light) => geometry.seen(light.x, light.y, vision) || mine.some((token) => geometry.pointInPolygon(token.x, token.y, light.polygon)) || vision.some((polygon) => geometry.polygonsOverlap(light.polygon, polygon))) : shining),
      seeing,
      twilight,
      // Tokens of this player whose darkvision a bright light spoils now.
      ...(spoiled.length ? { spoiled } : {}),
      sceneLights: [],
      // Labels: not hidden, in a group players see, not under the mask; a pin's link only when the player may open the record.
      // Paint in a group players may not see, and the GM's own FX, stay with the GM.
      // Paint wholly under the mask stays with the GM too (a player's own lines are theirs).
      drawings: drawingsHere().filter((line) => groupLets(line.group, seat) && (line.by === seat.name || !drawnUnderMask(line))),
      deathMarkers: deathMarkersHere().filter((marker) => !masked(marker.x, marker.y)),
      fx: fxHere().filter((layer) => layer.players && layer.shown && groupLets(layer.group, seat)),
      labels: labelsHere()
        .filter((label) => !label.hidden && groupLets(label.group, seat) && !masked(label.x, label.y))
        .map((label) => (label.link && label.link.kind === "record" && !records.get(label.link.id, seat) ? { ...label, link: null } : label)),
      groups: groups.filter((group) => group.shown && group.players).map(({ name }) => ({ name })),
      // Image layers: not hidden, in a group players see, not wholly under the mask.
      tiles: tilesHere()
        .filter((tile) => !tile.hidden && groupLets(tile.group, seat) && ![[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]].every(([u, v]) => masked(tile.x + tile.width * u, tile.y + tile.height * v)))
        .map(({ locked: _locked, ...tile }) => tileOut(tile, assetToken)),
    };
  }

  function findToken(id) {
    const token = tokensHere().find((item) => item.id === id);
    if (!token) throw new Error(`No token ${id} on this scene.`);
    return token;
  }

  function templatesHere() {
    if (!scene) return [];
    state.templates = state.templates ?? {};
    state.templates[scene.id] = state.templates[scene.id] ?? [];
    return state.templates[scene.id];
  }
  // A template where it is now: an emanation sits on its token.
  function placed(template) {
    if (!template.attach) return template;
    const token = tokensHere().find((item) => item.id === template.attach);
    return token ? { ...template, x: token.x, y: token.y } : template;
  }
  // Everyone sees the templates, but one on a token they are not shown.
  function templatesFor(seat) {
    const tokens = tokensHere();
    return templatesHere()
      .filter((template) => !template.attach || seat.role === "dm" || (() => {
        const token = tokens.find((item) => item.id === template.attach);
        return token && !token.hidden && !invisibleTo(token, seat);
      })())
      .map(placed);
  }
  // The tokens a template covers (shared/actions/areas.mjs: any square they fill
  // whose centre is inside; walls that stop movement stop it).
  function tokensInTemplate(template) {
    if (!scene || !areas) return [];
    const shape = areas.toPixels(placed(template), geometry.gridSize(scene), units());
    return areas.tokensIn(shape, tokensHere(), { gridPx: geometry.gridSize(scene), gridless: geometry.gridKind(scene) === "none", walls: wallsHere(), doors: doorsHere(), firstBlock: geometry.firstBlock });
  }

  return {
    ready: Promise.all([geometryReady, actionsReady]),
    scene: () => scene,
    units,
    // Area templates: placed by anyone (a player's in their colour), moved or
    // removed by their placer or the GM; the GM clears them all.
    templates: () => templatesHere().map(placed),
    placeTemplate(input, seat) {
      if (!scene) throw new Error("No scene is open.");
      const template = cleanTemplate({ ...input, id: undefined, by: seat.role === "dm" ? "" : seat.name, color: input?.color ?? seat.color ?? colorOf(seat.name) });
      if (!template) throw new Error("A template needs a shape (circle, cone, line, square), a place and a size.");
      if (template.attach && !tokensHere().some((token) => token.id === template.attach)) delete template.attach;
      const list = templatesHere();
      list.push(template);
      if (list.length > MAX_TEMPLATES) list.splice(0, list.length - MAX_TEMPLATES);
      changed({ keepVision: true });
      return placed(template);
    },
    moveTemplate(id, patch, seat) {
      const template = templatesHere().find((item) => item.id === id);
      if (!template) throw new Error("That template is gone.");
      if (seat.role !== "dm" && template.by !== seat.name) throw new Error("You can move only your own templates.");
      Object.assign(template, cleanTemplate({ ...template, ...patch, id: template.id, by: template.by }) ?? {});
      changed({ keepVision: true });
      return placed(template);
    },
    removeTemplate(id, seat) {
      const list = templatesHere();
      const template = list.find((item) => item.id === id);
      if (!template) throw new Error("That template is gone.");
      if (seat.role !== "dm" && template.by !== seat.name) throw new Error("You can remove only your own templates.");
      list.splice(list.indexOf(template), 1);
      changed({ keepVision: true });
      return template;
    },
    clearTemplates(seat, { turn = false } = {}) {
      if (!turn && seat.role !== "dm") throw new Error("Only the GM clears every template.");
      const list = templatesHere();
      const kept = list.filter((template) => turn && !template.turn);
      const gone = list.length - kept.length;
      if (gone) {
        state.templates[scene.id] = kept;
        changed({ keepVision: true });
      }
      return gone;
    },
    tokensInTemplate,
    // Where a spell's area goes when its caster (a token, or null) points at x, y (shared/actions/areas.mjs place).
    areaAt(area, token, x, y) {
      if (!scene || !areas) throw new Error("No scene is open.");
      const origin = geometry.gridOrigin(scene);
      return areas.place(area, token, num(x, 0), num(y, 0), { gridPx: geometry.gridSize(scene), originX: origin.x, originY: origin.y, feetPerSquare: units(), gridless: geometry.gridKind(scene) === "none" });
    },
    // A token's own effects (one not on the tracker): put on, changed, taken off, all taken (it joins the tracker).
    tokenEffects(id) {
      return findToken(id).effects ?? [];
    },
    setTokenEffects(id, list) {
      const token = findToken(id);
      const clean = (Array.isArray(list) ? list : []).map(cleanEffect).filter(Boolean).slice(0, 30);
      if (clean.length) token.effects = clean;
      else delete token.effects;
      changed({ keepVision: true });
      return token.effects ?? [];
    },
    // Game time passes for the effects on tokens out of the fight (the calendar): see tableServer.
    tokensWithEffects: () => tokensHere().filter((token) => token.effects?.length),
    squareCenter,
    squareOf,
    squareSize: () => (scene ? geometry.gridSize(scene) : 0),
    // A new scene from the GM. Its Foundry tokens and lights become the
    // table's the first time it is shown; after that the table's own are kept.
    setScene(next) {
      scene = next;
      visionCache.clear();
      // The imported walls become the table's the first time; after that the table's own are kept.
      if (!state.walls[next.id]) {
        state.walls[next.id] = (next.walls ?? [])
          .map((wall) => cleanWall({ ...wall, kind: wall.door === 2 ? "secret" : wall.door === 1 ? "door" : Number(wall.sight) === 10 ? "terrain" : Number(wall.sight) === 0 && Number(wall.move) !== 0 ? "invisible" : Number(wall.move) === 0 && Number(wall.sight) !== 0 ? "ethereal" : Number(wall.sight) === 30 ? "window" : "wall", ...(Number(wall.sight) === 30 ? { sight: 30, light: Number(wall.light ?? 30), toggle: "none" } : {}) }))
          .filter(Boolean);
      }
      liveScene();
      // A bundle's regions the first time (Foundry's: a Pause Game behaviour is a trap,
      // Modify Movement Cost difficult terrain, Teleport Token a teleport).
      if (!state.regions[next.id]) {
        state.regions[next.id] = (Array.isArray(next.regions) ? next.regions : [])
          .flatMap((region) => (Array.isArray(region.polygons) ? region.polygons : []).map((points, index) => cleanRegion({ id: `${region.id}-${index}`.slice(0, 64), kind: region.kind ?? (region.trap ? "trap" : null), name: region.name, note: region.note ?? "", points, cost: region.cost, to: region.to })))
          .filter(Boolean)
          .slice(0, MAX_REGIONS);
      }
      if (!state.lights[next.id]) {
        state.lights[next.id] = (next.lights ?? [])
          .map((light) => cleanLight({ id: light.id, x: light.x, y: light.y, bright: light.bright, dim: light.dim, color: light.color, on: !light.hidden }))
          .filter(Boolean);
      }
      if (!state.tokens[next.id]) {
        const size = geometry.gridSize(next);
        state.tokens[next.id] = next.tokens
          .map((token) =>
            cleanToken({
              id: `f-${token.id}`.slice(0, 40),
              sourceId: token.id,
              name: token.name,
              x: token.x + token.width / 2,
              y: token.y + token.height / 2,
              squares: token.width / size,
              faction: token.disposition === 1 ? "friend" : token.disposition === -1 ? "foe" : "neutral",
              hidden: token.hidden,
            }),
          )
          .filter(Boolean)
          .slice(0, MAX_TOKENS);
        onChange();
      }
    },
    tokens: () => tokensHere(),
    viewFor,
    sightOn,
    setSight(on) {
      if (!scene) throw new Error("No scene is open.");
      state.sight[scene.id] = Boolean(on);
      changed();
    },
    // FG's token lock: players cannot move their tokens until the GM unlocks.
    lockedNow: () => Boolean(scene && state.locked[scene.id]),
    setLocked(on) {
      if (!scene) throw new Error("No scene is open.");
      state.locked[scene.id] = Boolean(on);
      changed({ keepVision: true });
    },
    // Places a token. A player may place only a character they own, once
    // (FG: a player drags their character onto a shared map), and only:
    // - while the GM has not locked token movement;
    // - on the map;
    // - on a line-of-sight scene where the party has tokens, where the party sees now;
    // - on one where the party has none, only if that character has never been
    //   on this map: once it has, the GM puts it back (no teleporting by
    //   taking a token off and dropping it somewhere new).
    place(input, seat) {
      if (!scene) throw new Error("No scene is open.");
      const record = input.recordId ? records.get(input.recordId, seat) : null;
      if (input.recordId && !record) throw new Error("You cannot place that.");
      const player = seat.role !== "dm";
      if (player && (!record || record.owner !== seat.name)) throw new Error("You can place only your own character.");
      const pc = record && record.type === "character";
      if (pc && !input.allowSecond) {
        const existing = tokensHere().find((token) => token.recordId === record.id);
        if (existing) return existing;
      }
      if (player && state.locked[scene.id]) throw new Error("The GM has locked token movement.");
      if (tokensHere().length >= MAX_TOKENS) throw new Error("This scene has too many tokens.");
      // A starship's by its tonnage; anyone else's by its space.
      const sized = record?.type === "starship" ? require("./starships.cjs").shipSquares(record.data?.tons) : record ? geometry.tokenSquares(record.data?.space, units()) : 1;
      const squares = Math.min(10, Math.max(0.25, num(input.squares, sized)));
      let point;
      if (Number.isFinite(input.col) && Number.isFinite(input.row)) point = squareCenter(input.col, input.row, squares);
      else if (Number.isFinite(input.x) && Number.isFinite(input.y)) point = { x: input.x, y: input.y };
      else point = sceneCenter();
      point = freeSpot(point.x, point.y, squares);
      if (player) {
        const offset = geometry.sceneOrigin(scene);
        if (!(point.x >= offset.x && point.y >= offset.y && point.x <= offset.x + scene.width && point.y <= offset.y + scene.height)) throw new Error("Place your token on the map.");
        if (sightOn()) {
          const party = tokensHere().filter((token) => token.owner !== "" && !token.hidden);
          if (party.length > 0) {
            if (!geometry.seen(point.x, point.y, party.map(polygonFor), 0)) throw new Error("Place your token where the party can see.");
          } else if (record && enteredHere().includes(record.id)) throw new Error(`${record.name} has been on this map: the GM places it again.`);
        }
      }
      const token = cleanToken({
        recordId: record?.id ?? null,
        name: input.name || record?.name || "Token",
        x: point.x,
        y: point.y,
        squares,
        owner: pc ? record.owner : seat.role === "dm" ? text(input.owner, "") : seat.name,
        faction: input.faction ?? (pc ? "friend" : "foe"),
        hidden: seat.role === "dm" && Boolean(input.hidden),
        // What players call it until it is known (an encounter's unidentified creature).
        ...(seat.role === "dm" && input.unidentified ? { unidentified: text(input.unidentified, "") } : {}),
      });
      tokensHere().push(token);
      if (pc) markEntered(record.id);
      changed({ keepVision: true });
      return token;
    },
    // Moves a token. Players are stopped by walls and closed doors on a
    // line-of-sight scene; the GM is not (as in FG).
    move(id, to, seat, { snap = true, collide } = {}) {
      if (!scene) throw new Error("No scene is open.");
      const token = findToken(id);
      if (!canMove(token, seat)) throw new Error("That is not your token.");
      if (seat.role !== "dm" && state.locked[scene.id] && !String(seat.name ?? "").startsWith("@")) {
        // Locked: the move becomes a request with its path on the GM's map (not a play test's token).
        requestMove(token, to, seat);
        changed({ keepVision: true });
        return { token, blocked: false, requested: true };
      }
      const blockByWalls = collide ?? (seat.role !== "dm" && sightOn());
      const result = stepToken(token, to, seat, { snap, collide: blockByWalls });
      changed({ keepVision: true });
      return { token, ...result };
    },
    // Several tokens at once (a group dragged together, a marching order):
    // every one must be the seat's to move; each is stopped by walls on its own.
    moveMany(moves, seat, { snap = true, collide } = {}) {
      if (!scene) throw new Error("No scene is open.");
      if (!Array.isArray(moves) || moves.length === 0) throw new Error("Which tokens?");
      if (moves.length > MAX_TOKENS) throw new Error("Too many tokens at once.");
      const list = moves.map((item) => ({ token: findToken(String(item.id)), to: { x: num(item.x, NaN), y: num(item.y, NaN) } }));
      if (list.some(({ to }) => !Number.isFinite(to.x) || !Number.isFinite(to.y))) throw new Error("Where to?");
      for (const { token } of list) if (!canMove(token, seat)) throw new Error(`${token.name} is not your token.`);
      if (seat.role !== "dm" && state.locked[scene.id] && !String(seat.name ?? "").startsWith("@")) {
        for (const { token, to } of list) requestMove(token, to, seat);
        changed({ keepVision: true });
        return list.map(({ token }) => ({ token, blocked: false, requested: true }));
      }
      const blockByWalls = collide ?? (seat.role !== "dm" && sightOn());
      const out = [];
      for (const { token, to } of list) out.push({ token, ...stepToken(token, to, seat, { snap, collide: blockByWalls }) });
      changed({ keepVision: true });
      return out;
    },
    // Undo a move (Ctrl+Z, the token menu): a player their own token's last
    // move, if it was theirs; the GM any token's. Back where it came from.
    undoMove(id, seat) {
      if (!scene) throw new Error("No scene is open.");
      const token = findToken(id);
      const log = logOf(token);
      if (!log.length) throw new Error(`${token.name} has no move to undo.`);
      const last = log[log.length - 1];
      if (seat.role !== "dm") {
        if (!canMove(token, seat)) throw new Error("That is not your token.");
        if (last.by !== seat.name) throw new Error("Its last move was not yours.");
        if (state.locked[scene.id]) throw new Error("The GM has locked token movement.");
      }
      token.x = last.from.x;
      token.y = last.from.y;
      state.moveLog.set(logKey(token), log.slice(0, -1));
      changed({ keepVision: true });
      return { token, undone: log.length };
    },
    // A token's turn begins on the combat tracker: its path starts again.
    clearPath(tokenId) {
      if (!scene) return;
      if (state.moveLog.delete(`${scene.id}|${tokenId}`)) changed({ keepVision: true });
    },
    path: (tokenId) => (scene ? (state.moveLog.get(`${scene.id}|${tokenId}`) ?? []).map((move) => ({ ...move })) : []),
    // The GM's approval of moves asked for while movement is locked: some (ids) or all, accepted or cancelled.
    approveMoves(ids, accept, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM approves moves.");
      if (!scene) throw new Error("No scene is open.");
      const wanted = requestsHere().filter((request) => ids === "all" || (Array.isArray(ids) && ids.includes(request.id)));
      const out = [];
      for (const request of wanted) {
        state.moveRequests.delete(`${scene.id}|${request.id}`);
        const token = tokensHere().find((item) => item.id === request.id);
        if (!token) continue;
        if (accept) {
          // The move as its player would make it: walls stop it, traps spring.
          const result = stepToken(token, request.to, { role: "player", name: request.by }, { snap: true, collide: sightOn() });
          out.push({ id: token.id, name: token.name, accepted: true, ...(result.blocked ? { blocked: true } : {}), ...(result.sprang ? { sprang: result.sprang.name } : {}) });
        } else out.push({ id: token.id, name: token.name, accepted: false });
      }
      changed({ keepVision: true });
      return out;
    },
    moveRequests: () => requestsHere(),
    // Sounds placed on the map (Foundry's ambient sounds): the GM's list, place, change, remove.
    mapSounds: () => soundsHere(),
    addMapSound(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM places sounds.");
      if (!scene) throw new Error("No scene is open.");
      const placed = cleanMapSound({ ...input, id: undefined });
      if (!placed) throw new Error("Give a sound and where (x, y).");
      if (soundsHere().length >= MAX_MAP_SOUNDS) throw new Error("This scene has too many sounds.");
      soundsHere().push(placed);
      changed({ keepVision: true });
      return placed;
    },
    updateMapSound(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM changes sounds.");
      const list = soundsHere();
      const index = list.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`No sound ${id} on this map.`);
      const next = cleanMapSound({ ...list[index], ...patch, id });
      if (!next) throw new Error("That is not a sound.");
      list[index] = next;
      changed({ keepVision: true });
      return next;
    },
    removeMapSound(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM removes sounds.");
      const list = soundsHere();
      const index = list.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`No sound ${id} on this map.`);
      list.splice(index, 1);
      changed({ keepVision: true });
    },
    soundsFor: (player) => soundsHeard(tokensHere().filter((token) => !token.hidden && token.owner === player)),
    // Regions (Map Studio's Traps & regions, Foundry's): the GM's list, add, change, remove.
    regions: () => regionsHere(),
    addRegion(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM makes regions.");
      if (!scene) throw new Error("No scene is open.");
      const region = cleanRegion({ ...input, id: undefined });
      if (!region) throw new Error("A region needs a kind (trap, pit, difficult, teleport) and three corners or more.");
      if (regionsHere().length >= MAX_REGIONS) throw new Error("This scene has too many regions.");
      regionsHere().push(region);
      changed({ keepVision: true });
      return region;
    },
    updateRegion(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM changes regions.");
      const list = regionsHere();
      const index = list.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`No region ${id}.`);
      const next = cleanRegion({ ...list[index], ...patch, id });
      if (!next) throw new Error("That is not a region.");
      list[index] = next;
      changed({ keepVision: true });
      return next;
    },
    removeRegion(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM removes regions.");
      const list = regionsHere();
      const index = list.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`No region ${id}.`);
      list.splice(index, 1);
      changed({ keepVision: true });
    },
    update(id, patch, seat) {
      const token = findToken(id);
      // A player may light or put out a light on their own token, and turn it; nothing else.
      if (seat.role !== "dm") {
        const keys = Object.keys(patch);
        if (!canMove(token, seat) || keys.some((key) => key !== "light" && key !== "facing" && key !== "elevation")) throw new Error("Only the GM can change tokens.");
      }
      if (patch.facing !== undefined) token.facing = cleanFacing(patch.facing);
      if (patch.elevation !== undefined) token.elevation = cleanToken({ x: 0, y: 0, elevation: patch.elevation }).elevation;
      if (patch.unidentified !== undefined) token.unidentified = text(patch.unidentified, "").slice(0, 48);
      if (patch.senses !== undefined) token.senses = text(patch.senses, "").slice(0, 200);
      if (patch.light !== undefined) token.light = typeof patch.light === "string" ? presetLight(patch.light, lightProfiles()) : cleanCarried(patch.light);
      if (patch.vision !== undefined) token.vision = patch.vision == null ? null : Math.min(1000, Math.max(0, num(patch.vision, 0)));
      if (patch.name !== undefined) token.name = text(patch.name, token.name).slice(0, 48);
      if (patch.hidden !== undefined) token.hidden = Boolean(patch.hidden);
      if (patch.squares !== undefined) token.squares = Math.min(10, Math.max(0.25, num(patch.squares, token.squares)));
      const wasFaction = token.faction;
      if (patch.faction !== undefined && FACTIONS.includes(patch.faction)) token.faction = patch.faction;
      if (patch.owner !== undefined) token.owner = text(patch.owner, "").slice(0, 24);
      changed({ keepVision: true });
      // Its tracker entry takes the same side (FG's friend/foe on both).
      if (token.faction !== wasFaction && token.faction !== "none") onFaction(token);
      return token;
    },
    remove(id, seat) {
      const list = tokensHere();
      const token = findToken(id);
      if (!canMove(token, seat)) throw new Error("That is not your token.");
      if (seat.role !== "dm" && state.locked[scene.id]) throw new Error("The GM has locked token movement.");
      list.splice(list.indexOf(token), 1);
      state.moveLog.delete(logKey(token));
      state.moveRequests.delete(logKey(token));
      if (token.recordId && records.get(token.recordId)?.type === "character") markEntered(token.recordId);
      changed({ keepVision: true });
      return token;
    },
    // Opens, closes or locks a door. Players may open and close doors they can
    // see; they cannot unlock a locked door or use a secret one.
    setDoor(wallId, wanted, seat) {
      if (!scene) throw new Error("No scene is open.");
      const wall = wallsHere().find((item) => item.id === wallId && (item.door > 0 || (item.toggle && item.toggle !== "none")));
      if (!wall) throw new Error(`No door ${wallId}.`);
      if (seat.role !== "dm" && wall.toggle === "gm") throw new Error("Only the GM can open that.");
      const doors = doorsHere();
      const current = wallId in doors ? doors[wallId] : wall.ds;
      const next = wanted === undefined ? (current === 1 ? 0 : 1) : wanted;
      if (![0, 1, 2].includes(next)) throw new Error("A door is open, closed or locked.");
      if (seat.role !== "dm") {
        if (wall.door === 2) throw new Error("You cannot see a door there.");
        if (current === 2) throw new Error("The door is locked.");
        if (next === 2) throw new Error("Only the GM can lock a door.");
        const view = viewFor(seat, "");
        if (!view.doors.some((door) => door.id === wallId)) throw new Error("You cannot see that door.");
      }
      // Every side of the same door opens and closes with it.
      const group = doorGroup(wall);
      for (const side of wallsHere()) if (side.id === wallId || ((side.door > 0 || (side.toggle && side.toggle !== "none")) && doorGroup(side) === group)) doors[side.id] = next;
      changed();
      return next;
    },
    darkness,
    diagonalNow,
    // Fog of war on the host: a player's view now added to what they have seen
    // of this scene (true when that grew). Test and preview seats keep nothing.
    explore(player, vision) {
      if (!scene || !Array.isArray(vision) || !player || String(player).startsWith("@")) return false;
      const key = `${scene.id}|${player}`;
      const last = lastMerged.get(key);
      if (last && last.length === vision.length && last.every((polygon, index) => polygon === vision[index])) return false;
      lastMerged.set(key, vision);
      const row = (state.explored[scene.id] = state.explored[scene.id] ?? {});
      const known = row[player] ?? [];
      const merged = geometry.mergeExplored(known, vision);
      if (merged === known) return false;
      row[player] = merged;
      bumpExplored(key);
      return true;
    },
    // What a player has seen of this scene; "*" every player's together (the GM's vision preview).
    exploredFor(player) {
      const row = scene ? state.explored[scene.id] ?? {} : {};
      if (player === "*") return Object.values(row).flat();
      return row[player] ?? [];
    },
    exploredVersion: (player) => state.exploredVersions.get(player === "*" ? "*" : `${scene?.id}|${player}`) ?? 0,
    exploredPlayers: () => Object.keys((scene && state.explored[scene.id]) ?? {}),
    // The GM's Reset explored: one player's memory of this scene, or everyone's.
    resetExplored(player, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can reset what players have explored.");
      if (!scene) throw new Error("No scene is open.");
      const row = state.explored[scene.id] ?? {};
      if (player) delete row[player];
      else state.explored[scene.id] = {};
      for (const key of [...lastMerged.keys()]) if (key.startsWith(`${scene.id}|`) && (!player || key === `${scene.id}|${player}`)) lastMerged.delete(key);
      for (const name of player ? [player] : Object.keys(row)) bumpExplored(`${scene.id}|${name}`);
      bumpExplored(`${scene.id}|*reset`);
      changed({ keepVision: true });
      return { reset: player || "everyone" };
    },
    // A path measured as the ruler does: each leg and the whole, by this scene's rule.
    measure(points) {
      if (!scene) throw new Error("No scene is open.");
      return geometry.pathDistance(scene, points, diagonalNow(), terrainCost());
    },
    lightProfiles,
    settings: settingsHere,
    lights: lightsHere,
    // Scene settings: darkness, grid, weather (the GM's map settings).
    updateSettings(patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change the scene.");
      if (!scene) throw new Error("No scene is open.");
      const current = settingsHere();
      state.settings[scene.id] = cleanSettings({
        darkness: patch.darkness !== undefined ? patch.darkness : current.darkness,
        grid: { ...current.grid, ...(patch.grid ?? {}) },
        weather: { ...current.weather, ...(patch.weather ?? {}) },
        diagonal: patch.diagonal !== undefined ? patch.diagonal : current.diagonal,
      });
      liveScene();
      // The grid changes wall thresholds (sight polygons); darkness and weather do not.
      changed({ keepVision: !patch.grid });
      return state.settings[scene.id];
    },
    // Drawing on the map, for everyone: anyone draws; a player rubs out
    // their own lines, the GM anyone's, or clears them all.
    drawings: () => drawingsHere(),
    draw(input, seat) {
      if (!scene) throw new Error("No scene is open.");
      // Players draw free lines and shapes (line, arrow, square, circle, cone; a
      // faint fill in their colour); the GM's paint also has polygons, fills and groups.
      const playerShape = ["line", "arrow", "rect", "circle", "cone"].includes(input?.shape) ? input.shape : undefined;
      const playerColor_ = input?.color ?? seat.color ?? colorOf(seat.name);
      const own = seat.role === "dm" ? input : { points: input?.points, color: input?.color, width: input?.width, shape: playerShape, ...(playerShape && playerShape !== "line" && playerShape !== "arrow" ? { fill: playerColor_, fillAlpha: 0.15 } : {}) };
      const line = cleanDrawing({ ...own, id: undefined, by: seat.role === "dm" ? "" : seat.name, color: input?.color ?? seat.color ?? colorOf(seat.name) });
      if (line?.group && groupsHere().find((group) => group.name === line.group)?.locked) throw new Error(`The group ${line.group} is locked.`);
      if (line?.group) groupOf(line.group);
      if (!line) throw new Error("A line needs two points or more.");
      const list = drawingsHere();
      // A player draws up to their own share and then their oldest line goes;
      // a player's lines never push out the GM's paint (or another player's).
      if (seat.role !== "dm") {
        const theirs = list.filter((item) => item.by === seat.name);
        if (theirs.length >= MAX_PLAYER_DRAWINGS) list.splice(list.indexOf(theirs[0]), 1);
        else if (list.length >= MAX_DRAWINGS) throw new Error("This map has as many drawings as it can hold: rub some out first.");
      }
      list.push(line);
      if (list.length > MAX_DRAWINGS) list.splice(0, list.length - MAX_DRAWINGS);
      changed();
      return line;
    },
    // A shape's two points moved (its handles dragged): its drawer's, or the GM's any.
    reshape(id, points, seat) {
      const list = drawingsHere();
      const line = list.find((item) => item.id === id);
      if (!line) throw new Error("That drawing is gone.");
      if (seat.role !== "dm" && line.by !== seat.name) throw new Error("You can only change your own drawings.");
      if (!TWO_POINT.has(line.shape)) throw new Error("Only a line, arrow, square, circle or cone can be resized.");
      const next = cleanDrawing({ ...line, points });
      if (!next) throw new Error("A shape needs two points.");
      line.points = next.points;
      changed();
      return line;
    },
    erase(id, seat) {
      const list = drawingsHere();
      const at = list.findIndex((line) => line.id === id);
      if (at < 0) throw new Error("That line is gone.");
      if (seat.role !== "dm" && list[at].by !== seat.name) throw new Error("You can only rub out your own lines.");
      list.splice(at, 1);
      changed();
    },
    // Death markers: one left where a creature died (the table's hook), the GM's to place, remove or clear.
    deathMarkers: () => deathMarkersHere(),
    addDeathMarker(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM places death markers.");
      if (!scene) throw new Error("No scene is open.");
      const marker = cleanDeathMarker({ ...input, id: undefined });
      if (!marker) throw new Error("Where? Give x and y.");
      const list = deathMarkersHere();
      list.push(marker);
      if (list.length > MAX_DEATH_MARKERS) list.splice(0, list.length - MAX_DEATH_MARKERS);
      changed();
      return marker;
    },
    removeDeathMarker(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM removes death markers.");
      const list = deathMarkersHere();
      const at = list.findIndex((item) => item.id === id);
      if (at < 0) throw new Error("That marker is gone.");
      list.splice(at, 1);
      changed();
    },
    clearDeathMarkers(seat) {
      if (seat.role !== "dm") throw new Error("Only the GM clears death markers.");
      if (!scene) return;
      state.deathMarkers[scene.id] = [];
      changed();
    },
    clearDrawings(seat, who = null) {
      if (seat.role !== "dm") throw new Error("Only the GM can clear the drawings.");
      if (!scene) return;
      state.drawings[scene.id] = who === null ? [] : drawingsHere().filter((line) => line.by !== who);
      changed();
    },
    placeLight(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can place lights.");
      if (!scene) throw new Error("No scene is open.");
      const preset = typeof input.preset === "string" ? presetLight(input.preset) : null;
      const light = cleanLight({ color: "#FFB347", bright: 20, dim: 40, ...(preset ?? {}), ...input, id: undefined });
      if (!light) throw new Error("Where?");
      if (lightsHere().length >= 500) throw new Error("This scene has too many lights.");
      lightsHere().push(light);
      changed();
      return light;
    },
    updateLight(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change lights.");
      const list = lightsHere();
      const index = list.findIndex((light) => light.id === id);
      if (index < 0) throw new Error(`No light ${id}.`);
      list[index] = cleanLight({ ...list[index], ...patch, id });
      // A light's polygon is cached by its place, reach and cone: a slider keeps the rest.
      changed({ keepVision: true });
      return list[index];
    },
    removeLight(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove lights.");
      const list = lightsHere();
      const index = list.findIndex((light) => light.id === id);
      if (index < 0) throw new Error(`No light ${id}.`);
      list.splice(index, 1);
      changed();
    },
    // Walls (the GM's map editor): drawn as chains of segments, changed, removed, undone.
    walls: () => wallsHere(),
    // Map Studio (electron/studio/krakenBridge.cjs): the open image's master as
    // the editor needs it, and the editor's work written back into it. The
    // walls, lights and weather replace the image's own; tokens, labels, paint
    // and image layers made in Kraken stay.
    studioView(of = null) {
      // A map's master by its scene (one of the campaign's own maps), open anywhere or not.
      if (of && of.id !== scene?.id) return { scene: of, walls: state.walls[of.id] ?? [], lights: state.lights[of.id] ?? [], fx: state.fx[of.id] ?? [], regions: state.regions[of.id] ?? [], studio: state.studio[of.id] ?? null };
      if (!scene) return null;
      return { scene, walls: wallsHere(), lights: lightsHere(), fx: fxHere(), regions: regionsHere(), studio: state.studio[scene.id] ?? null };
    },
    fromStudio({ walls = [], lights = [], fx = [], regions = null, project = null, picture = null, of = null }) {
      // Into the open scene, or (of) a map's master that is not open now: the same master wherever it is shown.
      const open = scene;
      const target = of ?? scene;
      if (!target) throw new Error("No scene is open.");
      state.walls[target.id] = walls.map(cleanWall).filter(Boolean).slice(0, MAX_WALLS_STUDIO);
      // Map Studio's traps and regions play at the table.
      // One the GM switched off at the table stays off (the same id, else the same kind and name).
      if (Array.isArray(regions)) {
        const was = state.regions[target.id] ?? [];
        const off = (region) => was.some((old) => old.on === false && (old.id === region.id || (old.kind === region.kind && old.name === region.name)));
        state.regions[target.id] = regions.map(cleanRegion).filter(Boolean).slice(0, MAX_REGIONS).map((region) => (off(region) ? { ...region, on: false } : region));
      }
      state.lights[target.id] = lights.map(cleanLight).filter(Boolean).slice(0, 500);
      state.fx[target.id] = fx.map(cleanFx).filter(Boolean).slice(0, 20);
      const before = state.studio[target.id] ?? {};
      state.studio[target.id] = { project, picture: picture ?? before.picture ?? null, saved: Date.now() };
      if (open && open.id === target.id) liveScene();
      changed();
      return { walls: state.walls[target.id].length, lights: state.lights[target.id].length, fx: state.fx[target.id].length, regions: (state.regions[target.id] ?? []).length };
    },
    // A map's grid as the GM set it in the Grid tab (for one not open now: Map Studio working on its master).
    gridOf(sceneId) {
      const grid = state.settings[sceneId]?.grid ?? {};
      return { size: grid.size ?? 100, type: 1, distance: grid.distance ?? 5, units: "ft", offsetX: grid.offsetX ?? 0, offsetY: grid.offsetY ?? 0 };
    },
    // The picture Map Studio painted for a scene (its file name and version), if any.
    studioPicture: (sceneId) => state.studio[sceneId]?.picture ?? null,
    addWalls(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can draw walls.");
      if (!scene) throw new Error("No scene is open.");
      const points = (Array.isArray(input.points) ? input.points : []).map(Number);
      if (points.length < 4 || points.length % 2 || !points.every(Number.isFinite)) throw new Error("A wall needs two points or more: [x1, y1, x2, y2, ...].");
      if (input.closed && points.length >= 6) points.push(points[0], points[1]);
      const list = wallsHere();
      if (list.length + points.length / 2 > MAX_WALLS) throw new Error("This scene has too many walls.");
      remember("add walls");
      const made = [];
      const { points: _points, closed: _closed, id: _id, ...fields } = input;
      for (let i = 0; i + 3 < points.length; i += 2) {
        const wall = cleanWall({ ...fields, x1: points[i], y1: points[i + 1], x2: points[i + 2], y2: points[i + 3] });
        if (wall) {
          list.push(wall);
          made.push(wall);
        }
      }
      changed();
      return made;
    },
    updateWalls(ids, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change walls.");
      const list = wallsHere();
      const wanted = new Set(ids);
      const found = list.filter((wall) => wanted.has(wall.id));
      if (found.length === 0) throw new Error("No such wall.");
      remember("change walls");
      // A new kind brings its senses unless they are given too.
      const fromKind = patch.kind && geometry?.WALL_KINDS?.[patch.kind] ? { ...geometry.WALL_KINDS[patch.kind], toggle: geometry.WALL_KINDS[patch.kind].toggle ?? "none" } : {};
      for (const wall of found) list[list.indexOf(wall)] = cleanWall({ ...wall, ...fromKind, ...patch, id: wall.id });
      changed();
      return list.filter((wall) => wanted.has(wall.id));
    },
    // Walls dragged: every one of them moved by dx, dy (scene pixels).
    moveWalls(ids, dx, dy, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can move walls.");
      const shift = [Number(dx), Number(dy)];
      if (!shift.every(Number.isFinite) || Math.max(Math.abs(shift[0]), Math.abs(shift[1])) > 1e6) throw new Error("Move by dx, dy in scene pixels.");
      const list = wallsHere();
      const wanted = new Set(ids);
      const found = list.filter((wall) => wanted.has(wall.id));
      if (found.length === 0) throw new Error("No such wall.");
      remember("move walls");
      for (const wall of found) list[list.indexOf(wall)] = cleanWall({ ...wall, x1: wall.x1 + shift[0], y1: wall.y1 + shift[1], x2: wall.x2 + shift[0], y2: wall.y2 + shift[1] });
      changed();
      return list.filter((wall) => wanted.has(wall.id));
    },
    // A corner dragged: every wall end at (x, y) (of the given walls, or of any)
    // goes to (toX, toY), so the walls meeting there stay joined.
    movePoint(from, to, ids, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can move walls.");
      const [x, y, toX, toY] = [from?.x, from?.y, to?.x, to?.y].map(Number);
      if (![x, y, toX, toY].every(Number.isFinite)) throw new Error("A corner moves from x, y to toX, toY.");
      const list = wallsHere();
      const only = Array.isArray(ids) && ids.length ? new Set(ids) : null;
      const near = (a, b) => Math.abs(a - b) < 0.6;
      const touched = list.filter((wall) => (!only || only.has(wall.id)) && ((near(wall.x1, x) && near(wall.y1, y)) || (near(wall.x2, x) && near(wall.y2, y))));
      if (touched.length === 0) throw new Error("No wall ends there.");
      remember("move a wall corner");
      for (const wall of touched) {
        const next = { ...wall };
        if (near(wall.x1, x) && near(wall.y1, y)) Object.assign(next, { x1: toX, y1: toY });
        if (near(wall.x2, x) && near(wall.y2, y)) Object.assign(next, { x2: toX, y2: toY });
        const clean = cleanWall(next);
        if (clean) list[list.indexOf(wall)] = clean;
      }
      changed();
      return touched.map((wall) => list.find((item) => item.id === wall.id)).filter(Boolean);
    },
    removeWalls(ids, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove walls.");
      const wanted = new Set(ids);
      const list = wallsHere();
      if (!list.some((wall) => wanted.has(wall.id))) throw new Error("No such wall.");
      remember("remove walls");
      state.walls[scene.id] = list.filter((wall) => !wanted.has(wall.id));
      for (const id of wanted) delete doorsHere()[id];
      liveScene();
      changed();
    },
    clearWalls(seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can clear the walls.");
      if (!scene) return;
      remember("clear walls");
      state.walls[scene.id] = [];
      state.doors[scene.id] = {};
      liveScene();
      changed();
    },
    // Splits a wall at a point (FG's razor).
    splitWall(id, x, y, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change walls.");
      const list = wallsHere();
      const wall = list.find((item) => item.id === id);
      if (!wall) throw new Error("No such wall.");
      remember("split wall");
      const first = cleanWall({ ...wall, id: undefined, x2: x, y2: y });
      const second = cleanWall({ ...wall, id: undefined, x1: x, y1: y });
      if (!first || !second) throw new Error("Split it somewhere along the wall.");
      list.splice(list.indexOf(wall), 1, first, second);
      changed();
      return [first, second];
    },
    // Foundry's Close all doors: every door and window shut (locks kept).
    closeDoors(seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can close every door.");
      const doors = doorsHere();
      for (const wall of wallsHere()) if (wall.door > 0 || (wall.toggle && wall.toggle !== "none")) doors[wall.id] = (wall.id in doors ? doors[wall.id] : wall.ds) === 2 ? 2 : 0;
      changed();
    },
    // An FG module's map, before it is first shown: its pins, FX layers and
    // grid offset, kept only when the scene has none of its own yet.
    seed(sceneId, { pins = [], fx = [], tiles = [], groups = [], gridOffset = null, frame = null } = {}) {
      const id = String(sceneId).slice(0, 80);
      // Which FG image the scene came from, and its size: to place an encounter's tokens where FG had them.
      if (frame) state.frames[id] = { image: String(frame.image).slice(0, 160), module: String(frame.module).slice(0, 160), width: num(frame.width, 0), height: num(frame.height, 0) };
      if (!state.labels[id]) {
        state.labels[id] = pins.map((pin) => cleanLabel({ ...pin, link: pin.link ? { kind: pin.link.kind, id: pin.link.id } : null })).filter(Boolean).slice(0, 2000);
        const names = [...new Set(state.labels[id].map((label) => label.group).filter(Boolean))];
        // Encounter pins are the GM's; map keys too, until the GM shares them. FG's own folders keep their settings.
        const own = groups.map(cleanGroup).filter(Boolean);
        state.groups[id] = [...own, ...names.filter((name) => !own.some((group) => group.name === name)).map((name) => cleanGroup({ name, players: false }))];
        // A group's numbers carry on after the module's.
        for (const group of state.groups[id]) {
          const top = Math.max(0, ...state.labels[id].filter((label) => label.group === group.name && label.number !== null).map((label) => label.number));
          if (top >= group.nextNumber) group.nextNumber = top + 1;
        }
      }
      if (!state.fx[id]) state.fx[id] = fx.map(cleanFx).filter(Boolean).slice(0, 20);
      if (!state.tiles[id] && tiles.length) {
        state.tiles[id] = tiles.map(cleanTile).filter(Boolean).slice(0, MAX_TILES);
        for (const name of new Set(state.tiles[id].map((tile) => tile.group).filter(Boolean))) if (!state.groups[id]?.some((group) => group.name === name)) (state.groups[id] = state.groups[id] ?? []).push(cleanGroup({ name }));
      }
      if (gridOffset && !state.settings[id]) state.settings[id] = cleanSettings({ grid: { offsetX: gridOffset.x, offsetY: gridOffset.y } });
      onChange();
    },
    // The FG image the open scene came from (fgMaps), or null.
    frame: () => (scene ? state.frames[scene.id] ?? null : null),
    // FX layers (FG's FX tab): several at once, each with its own mask.
    fx: () => fxHere(),
    addFx(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can add effects.");
      if (!scene) throw new Error("No scene is open.");
      if (fxHere().length >= 20) throw new Error("This scene has enough effects.");
      const layer = cleanFx({ ...input, id: undefined });
      if (layer.group) groupOf(layer.group);
      fxHere().push(layer);
      changed();
      return layer;
    },
    updateFx(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change effects.");
      const list = fxHere();
      const index = list.findIndex((layer) => layer.id === id);
      if (index < 0) throw new Error(`No effect ${id}.`);
      list[index] = cleanFx({ ...list[index], ...patch, mask: { ...list[index].mask, ...(patch.mask ?? {}) }, id });
      if (list[index].group) groupOf(list[index].group);
      changed();
      return list[index];
    },
    removeFx(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove effects.");
      const list = fxHere();
      const index = list.findIndex((layer) => layer.id === id);
      if (index < 0) throw new Error(`No effect ${id}.`);
      list.splice(index, 1);
      changed();
    },
    // Image layers (FG's image layers, Foundry's tiles): add, change, order, remove.
    tiles: () => tilesHere(),
    addTile(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can add image layers.");
      if (!scene) throw new Error("No scene is open.");
      if (tilesHere().length >= MAX_TILES) throw new Error("This scene has enough image layers.");
      const tile = cleanTile({ ...input, id: undefined });
      if (!tile) throw new Error("An image layer needs a picture (src) and a width and height.");
      if (!hasTile(tile.src)) throw new Error(`No picture ${tile.src} in the tile library.`);
      if (groupLocked(tile.group)) throw new Error(`The group ${tile.group} is locked.`);
      if (tile.group) groupOf(tile.group);
      remember("add image layer");
      tilesHere().push(tile);
      changed();
      return tile;
    },
    updateTile(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change image layers.");
      const list = tilesHere();
      const tile = findTile(id);
      // A locked layer (or group) keeps its place and size; unlocking is always allowed.
      const moves = ["x", "y", "width", "height", "rotation", "flipX", "flipY", "src"].some((key) => patch[key] !== undefined);
      if (moves && (tile.locked || groupLocked(tile.group)) && patch.locked !== false) throw new Error(`The image layer ${tile.name || id} is locked.`);
      if (patch.src !== undefined && !hasTile(String(patch.src))) throw new Error(`No picture ${patch.src} in the tile library.`);
      remember("change image layer");
      const next = cleanTile({ ...tile, ...patch, id }) ?? tile;
      list[list.indexOf(tile)] = next;
      if (next.group) groupOf(next.group);
      changed();
      return next;
    },
    // FG's layer order: up, down, to the top, to the bottom (or to an index).
    orderTile(id, where, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can order image layers.");
      const list = tilesHere();
      const tile = findTile(id);
      const from = list.indexOf(tile);
      const to =
        where === "top" ? list.length - 1 : where === "bottom" ? 0 : where === "up" ? Math.min(list.length - 1, from + 1) : where === "down" ? Math.max(0, from - 1) : Number.isInteger(where) ? Math.min(list.length - 1, Math.max(0, where)) : NaN;
      if (!Number.isFinite(to)) throw new Error("Order it up, down, top, bottom or to an index.");
      remember("order image layers");
      list.splice(from, 1);
      list.splice(to, 0, tile);
      changed();
      return list.map((item) => item.id);
    },
    removeTile(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove image layers.");
      const list = tilesHere();
      const tile = findTile(id);
      if (tile.locked || groupLocked(tile.group)) throw new Error(`The image layer ${tile.name || id} is locked.`);
      remember("remove image layer");
      list.splice(list.indexOf(tile), 1);
      changed();
    },
    // Text on the map (FG's Text tab): labels, numbers and pins, in groups.
    labels: () => labelsHere(),
    groups: () => groupsHere(),
    addLabel(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can put text on the map.");
      if (!scene) throw new Error("No scene is open.");
      if (labelsHere().length >= 2000) throw new Error("This scene has too much text.");
      let words = input.text;
      let number = null;
      // The numbering tool: the group's next number (never reused unless renumbered, as FG).
      if (input.numbering) {
        const group = groupOf(text(input.group, "") || "Numbers");
        input = { ...input, group: group.name };
        number = group.nextNumber;
        group.nextNumber += 1;
        words = `${group.prefix}${number}`;
      }
      const label = cleanLabel({ ...input, text: words, number, id: undefined });
      if (!label) throw new Error("Text needs words and a place.");
      if (label.group) groupOf(label.group);
      if (label.group && groupsHere().find((group) => group.name === label.group)?.locked) throw new Error(`The group ${label.group} is locked.`);
      remember("add text");
      labelsHere().push(label);
      changed();
      return label;
    },
    updateLabel(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change text on the map.");
      const list = labelsHere();
      const index = list.findIndex((label) => label.id === id);
      if (index < 0) throw new Error(`No text ${id}.`);
      if (list[index].group && groupsHere().find((group) => group.name === list[index].group)?.locked) throw new Error(`The group ${list[index].group} is locked.`);
      remember("change text");
      list[index] = cleanLabel({ ...list[index], ...patch, id }) ?? list[index];
      if (list[index].group) groupOf(list[index].group);
      changed();
      return list[index];
    },
    removeLabel(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove text from the map.");
      const list = labelsHere();
      const index = list.findIndex((label) => label.id === id);
      if (index < 0) throw new Error(`No text ${id}.`);
      remember("remove text");
      list.splice(index, 1);
      changed();
    },
    // Renumbers a group from 1 (or start), in the order the numbers were placed.
    renumber(groupName, seat, start = 1) {
      if (seat.role !== "dm") throw new Error("Only the GM can renumber.");
      const group = groupOf(groupName || "Numbers");
      remember("renumber");
      let n = Math.max(1, Math.round(start));
      for (const label of labelsHere().filter((item) => item.group === group.name && item.number !== null).sort((a, b) => a.number - b.number)) {
        label.number = n;
        label.text = `${group.prefix}${n}`;
        n += 1;
      }
      group.nextNumber = n;
      changed();
      return group;
    },
    // A layer group (FG's folder): shown, players, locked, prefix; renamed or removed (its things leave it).
    updateGroup(name, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change groups.");
      const group = groupOf(name);
      const list = groupsHere();
      const next = cleanGroup({ ...group, ...patch, name: patch.name ?? group.name });
      if (!next) throw new Error("A group needs a name.");
      remember("change group");
      if (next.name !== group.name) for (const label of labelsHere()) if (label.group === group.name) label.group = next.name;
      if (next.name !== group.name) for (const tile of tilesHere()) if (tile.group === group.name) tile.group = next.name;
      list[list.indexOf(group)] = next;
      changed();
      return next;
    },
    removeGroup(name, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove groups.");
      if (!scene) return;
      remember("remove group");
      state.groups[scene.id] = groupsHere().filter((group) => group.name !== name);
      for (const label of labelsHere()) if (label.group === name) label.group = "";
      for (const tile of tilesHere()) if (tile.group === name) tile.group = "";
      changed();
    },
    // The mask (FG's Mask tab): on (Add Global Mask), off (Remove Global Mask),
    // a shape that reveals or hides again, clear, a shape removed.
    mask: () => maskHere(),
    setMask(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can mask the map.");
      if (!scene) throw new Error("No scene is open.");
      const mask = maskHere();
      remember("mask");
      if (input.action === "on") mask.on = true;
      else if (input.action === "off") mask.on = false;
      else if (input.action === "clear") mask.shapes = [];
      else if (input.action === "remove") mask.shapes = mask.shapes.filter((shape) => shape.id !== input.id);
      else if (input.action === "reveal" || input.action === "hide") {
        const shape = cleanMask({ shapes: [{ mode: input.action, points: input.points }] }).shapes[0];
        if (!shape) throw new Error("A mask shape needs three points or more.");
        mask.shapes.push(shape);
        if (mask.shapes.length > 1000) mask.shapes.shift();
        mask.on = true;
      } else throw new Error("What should the mask do?");
      changed();
      return mask;
    },
    undo(seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can undo map edits.");
      if (!scene) throw new Error("No scene is open.");
      const ring = undoRing.get(scene.id) ?? [];
      const last = ring.pop();
      if (!last) throw new Error("Nothing to undo.");
      const before = new Set(wallsHere().map((wall) => wall.id));
      state.walls[scene.id] = last.walls.map(cleanWall).filter(Boolean);
      // Door states: a wall the undo brings back gets the state it had (a
      // locked door comes back locked); one it takes away loses its state;
      // the doors that stay keep theirs (opened or closed since, in play).
      if (last.doors) {
        const doors = doorsHere();
        const after = new Set(state.walls[scene.id].map((wall) => wall.id));
        for (const id of before) if (!after.has(id)) delete doors[id];
        for (const id of after) if (!before.has(id) && id in last.doors) doors[id] = last.doors[id];
      }
      if (last.mask) state.masks[scene.id] = cleanMask(last.mask);
      if (last.labels) state.labels[scene.id] = last.labels.map(cleanLabel).filter(Boolean);
      if (last.groups) state.groups[scene.id] = last.groups.map(cleanGroup).filter(Boolean);
      if (last.tiles) state.tiles[scene.id] = last.tiles.map(cleanTile).filter(Boolean);
      liveScene();
      changed();
      return last.label;
    },
    persisted: () => JSON.parse(JSON.stringify(state)),
    rawState: () => state,
    // The GM's private window closed: no scene.
    clearScene() {
      scene = null;
      visionCache.clear();
    },
  };
}

module.exports = { createMapState, playerColor, geometryReady, FACTION_COLOR };
