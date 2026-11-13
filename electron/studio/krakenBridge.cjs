// Map Studio and Kraken's images: an image's master (its walls, doors,
// windows, lights and weather, kept in the campaign by its scene id) opened in
// Map Studio's editor, and the editor's work saved back into that master. What
// Map Studio paints (stamps, textures, the Wall tool's art, a generated floor)
// becomes the image's own picture, used wherever the image is shown.
//
// The first time, the project is made from the master: the picture as the
// map layer, Kraken's walls and lights in Map Studio's shapes. After a save,
// Map Studio's own project is kept with the master and opened as it was, its
// walls, lights and weather refreshed from the master when the GM changed them
// in Kraken since.
//
// Map Studio's shapes are FG's (occluders with flags, lights in feet, weather
// with FG's settings and masks); Kraken's are Foundry's (wall segments with
// senses). Saving reads Map Studio's walls the way Kraken reads a book's FG
// walls (electron/importers/fgMaps.cjs), keeping the kinds Map Studio knows.

const crypto = require("crypto");

// The grid's top-left in scene pixels (Foundry's padding), as shared/map/geometry.mjs works it out.
function originOf(scene) {
  const size = Number(scene?.grid?.size) || 100;
  const pad = Number(scene?.padding) || 0;
  return { x: Math.ceil((pad * scene.width) / size) * size, y: Math.ceil((pad * scene.height) / size) * size };
}
const round = (value) => Math.round(value * 10) / 10;
const uid = (prefix) => `${prefix}-${crypto.randomBytes(6).toString("hex")}`;

// --- walls --------------------------------------------------------------------

// Kraken's wall kinds as Map Studio's types (its own default flags for each).
const STUDIO_TYPE = { wall: "wall", terrain: "terrain", door: "door", secret: "secret", toggle: "secret", window: "window", invisible: "invisible", illusion: "illusion", ethereal: "illusion", shadow: "shadow" };
const TYPE_FLAGS = {
  wall: [],
  terrain: ["terrain"],
  door: ["toggleable"],
  secret: ["toggleable", "hidden"],
  window: ["toggleable", "allow_vision"],
  invisible: ["allow_vision"],
  illusion: ["allow_move"],
  shadow: ["shadow"],
};
function studioWalls(walls, origin) {
  return walls.map((wall) => {
    const type = STUDIO_TYPE[wall.kind] ?? "wall";
    const flags = new Set(TYPE_FLAGS[type]);
    if (wall.door > 0 && wall.ds === 1) flags.add("open");
    if (wall.door > 0 && wall.ds === 2) flags.add("locked");
    if (wall.dir === 1 || wall.dir === 2) flags.add("single_sided");
    if (wall.dir === 2) flags.add("counterclockwise");
    return { id: String(wall.id).slice(0, 80), type, points: [wall.x1 - origin.x, wall.y1 - origin.y, wall.x2 - origin.x, wall.y2 - origin.y].map(round), flags: [...flags] };
  });
}
// Map Studio's walls as Kraken's segments: one per stretch of a wall's path.
function krakenWalls(walls, origin) {
  const out = [];
  for (const wall of walls ?? []) {
    const flags = new Set(wall.flags ?? []);
    const points = (wall.points ?? []).map(Number);
    if (flags.has("closed") && points.length >= 6) points.push(points[0], points[1]);
    const type = wall.type;
    // Map Studio's types Kraken keeps as they are; a pit (Kraken has none) stops movement only.
    const kind = { wall: "wall", terrain: "terrain", door: "door", secret: "secret", window: "window", invisible: "invisible", illusion: "illusion", shadow: "shadow", pit: "invisible" }[type] ?? (flags.has("toggleable") ? "door" : "wall");
    const door = kind === "door" ? 1 : kind === "secret" ? 2 : 0;
    const ds = door ? (flags.has("locked") ? 2 : flags.has("open") ? 1 : 0) : 0;
    const dir = flags.has("single_sided") ? (flags.has("counterclockwise") ? 2 : 1) : 0;
    for (let i = 0; i + 3 < points.length; i += 2) {
      const [x1, y1, x2, y2] = [points[i] + origin.x, points[i + 1] + origin.y, points[i + 2] + origin.x, points[i + 3] + origin.y];
      if (x1 === x2 && y1 === y2) continue;
      out.push({ id: `${String(wall.id ?? uid("w")).slice(0, 60)}-${i / 2}`, x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), kind, door, ds, dir, ...(flags.has("hidden") && kind !== "secret" ? { hidden: true } : {}) });
    }
  }
  return out;
}

// --- lights -------------------------------------------------------------------

// Kraken's light radii are in the scene's units (feet), as Map Studio's are.
function studioLights(lights, origin) {
  return lights.map((light) => ({
    id: String(light.id).slice(0, 80),
    x: round(light.x - origin.x),
    y: round(light.y - origin.y),
    color: /^#[0-9a-f]{6}$/i.test(light.color) ? light.color : "#ffb347",
    strength: 100,
    bright: Math.max(0, Number(light.bright) || 0),
    dim: Math.max(Number(light.bright) || 0, Number(light.dim) || 0),
    ...(light.animation === "flicker" || light.animation === "pulse" ? { animation: light.animation, speed: Math.round(Number(light.speed ?? 0.5) * 100) } : {}),
    ...(light.on === false ? { on: false } : {}),
  }));
}
function krakenLights(lights, origin) {
  return (lights ?? []).map((light) => ({
    id: String(light.id ?? uid("l")).slice(0, 80),
    x: Number(light.x) + origin.x,
    y: Number(light.y) + origin.y,
    bright: Math.max(0, Number(light.bright) || 0),
    dim: Math.max(Number(light.bright) || 0, Number(light.dim) || 0),
    color: /^#[0-9a-f]{6}$/i.test(light.color) ? light.color.toUpperCase() : "#FFB347",
    on: light.on !== false,
    ...(light.animation === "flicker" || light.animation === "pulse" ? { animation: light.animation, speed: Math.min(1, Math.max(0, (Number(light.speed) || 50) / 100)) } : {}),
  }));
}

// --- weather ------------------------------------------------------------------

// Map Studio's effects (FG's) and Kraken's FX: the same weather, FG's settings
// for each kind of effect, and where it falls (a mask, drawn as polygons).
const TO_KRAKEN_FX = { rain: "rain", snow: "snow", blizzard: "blizzard", myst: "fog", clouds: "clouds", water: "water", ocean: "water" };
const TO_STUDIO_FX = { rain: "rain", snow: "snow", blizzard: "blizzard", fog: "myst", clouds: "clouds", water: "water" };
const INTENSITY = { rain: "RainIntensity", snow: "SnowIntensity", water: "WaterIntensity", clouds: "CloudDensity", myst: "MystFade", blizzard: "BlizzardSize", ocean: "OceanDistortion" };
const SPEED = { rain: "RainSpeed", snow: "SnowSpeed", water: "WaterSpeed", clouds: "CloudSpeed", myst: "MystSpeed", blizzard: "BlizzardSpeed", ocean: "OceanSpeed" };
function krakenFx(effects, origin) {
  return (effects ?? [])
    .filter((effect) => TO_KRAKEN_FX[effect.type])
    .map((effect) => {
      const settings = effect.settings ?? {};
      // Its outline as Map Studio worked it out, else the mask's own shown polygons.
      const outline = Array.isArray(effect.polygons) && effect.polygons.length ? effect.polygons : (effect.mask?.ops ?? []).filter((op) => op.op === "show" && op.shape === "poly").map((op) => op.points);
      const polygons = outline.filter((points) => Array.isArray(points) && points.length >= 6).map((points) => points.map((value, index) => Number(value) + (index % 2 ? origin.y : origin.x)));
      return {
        id: String(effect.id ?? uid("fx")).slice(0, 40),
        name: String(effect.name ?? effect.type).slice(0, 40),
        type: TO_KRAKEN_FX[effect.type],
        intensity: Number(settings[INTENSITY[effect.type]] ?? 0.5),
        speed: Number(settings[SPEED[effect.type]] ?? 0.5),
        direction: effect.type === "rain" ? Math.round(((Number(settings.RainDirection ?? 0.7) % 1) + 1) % 1 * 360) : 250,
        mask: { use: effect.mask != null && polygons.length > 0, mode: "inside", polygons },
        shown: effect.visible !== false,
        players: true,
      };
    });
}
function studioEffects(fx, origin) {
  return (fx ?? [])
    .filter((layer) => TO_STUDIO_FX[layer.type])
    .map((layer) => {
      const type = TO_STUDIO_FX[layer.type];
      const settings = {};
      if (INTENSITY[type]) settings[INTENSITY[type]] = Math.min(1, Math.max(0, Number(layer.intensity) || 0));
      if (SPEED[type]) settings[SPEED[type]] = Math.min(1, Math.max(0, Number(layer.speed) || 0));
      if (type === "rain") settings.RainDirection = ((Number(layer.direction) || 0) % 360) / 360;
      const polygons = layer.mask?.use ? (layer.mask.polygons ?? []).map((points) => points.map((value, index) => round(Number(value) - (index % 2 ? origin.y : origin.x)))) : [];
      return {
        id: String(layer.id).slice(0, 40),
        type,
        name: String(layer.name || type).slice(0, 40),
        settings,
        visible: layer.shown !== false,
        mask: polygons.length ? { base: "none", ops: polygons.map((points) => ({ op: "show", shape: "poly", points })) } : null,
        // The outline Map Studio works out from the mask (kept with the effect).
        ...(polygons.length ? { polygons } : {}),
      };
    });
}

// --- the bridge ----------------------------------------------------------------

// What the GM opened (a token for the editor's page to name it by): the scene and its picture.
const sessions = new Map();

// A project for the editor from the image's master: Map Studio's own when it
// saved one (its walls, lights and weather the master's now), else made new.
function projectFor({ view, pictureId, size, name }) {
  const { scene, walls, lights, fx, studio } = view;
  const origin = originOf(scene);
  const grid = Number(scene.grid?.size) || 70;
  const kept = studio?.project && typeof studio.project === "object" ? JSON.parse(JSON.stringify(studio.project)) : null;
  const project = kept ?? {
    version: 1,
    name: String(name || scene.name || "Map").slice(0, 120),
    width: size.width,
    height: size.height,
    grid,
    gridOffset: { x: Number(scene.grid?.offsetX ?? 0) || 0, y: Number(scene.grid?.offsetY ?? 0) || 0 },
    gridDistance: Number(scene.grid?.distance) || 5,
    background: "#000000",
    layers: [
      { id: "map", name: "Map", visible: true, locked: true },
      { id: "objects", name: "Objects", visible: true, locked: false },
    ],
    objects: [{ id: "kraken-picture", assetId: pictureId, name: "Map picture", x: 0, y: 0, width: size.width, height: size.height, rotation: 0, visible: true, layer: "map", locked: true }],
    effects: [],
    regions: [],
  };
  // The master is the truth for what Kraken plays with.
  project.walls = studioWalls(walls, origin);
  project.lights = studioLights(lights, origin);
  // Map Studio's own weather is richer (brush masks, FG's every setting): kept
  // while Kraken's FX are what it saved; else Kraken's FX as Map Studio's.
  if (!kept || JSON.stringify(krakenFx(kept.effects ?? [], origin).map(fxKey)) !== JSON.stringify(fx.map(fxKey))) project.effects = studioEffects(fx, origin);
  return project;
}
const fxKey = (layer) => `${layer.type}|${layer.mask?.use ? layer.mask.polygons?.length : 0}`;

// Saved from the editor: the master's walls, lights and weather, and the project.
function masterFrom(project, scene) {
  const origin = originOf(scene);
  return { walls: krakenWalls(project.walls, origin), lights: krakenLights(project.lights, origin), fx: krakenFx(project.effects, origin) };
}

// Whether the project paints anything beyond the image's own picture (so its
// picture must be saved): objects other than the picture, or the picture moved.
function paintsArt(project) {
  return (project.objects ?? []).some((object) => object.id !== "kraken-picture" || object.x !== 0 || object.y !== 0 || object.visible === false || Number(object.rotation) || object.width !== project.width || object.height !== project.height);
}

function openSession(info) {
  const token = crypto.randomBytes(12).toString("hex");
  sessions.set(token, { ...info, at: Date.now() });
  // A GM opens a handful at most; the oldest go.
  if (sessions.size > 20) sessions.delete(sessions.keys().next().value);
  return token;
}
const session = (token) => sessions.get(String(token ?? "")) ?? null;

module.exports = { openSession, session, projectFor, masterFrom, paintsArt, studioWalls, krakenWalls, studioLights, krakenLights, studioEffects, krakenFx, originOf };
