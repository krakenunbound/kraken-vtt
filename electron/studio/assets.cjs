const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const sharp = require("sharp");
const { zipSync, unzipSync, strToU8, strFromU8 } = require("fflate");
const { DOMParser } = require("@xmldom/xmldom");
const ddPacks = require("./ddPacks.cjs");

// Map Studio's artwork and projects, ported from Map Studio's server.py for
// Kraken: the asset catalogue (Kraken's own art packs, the GM's FG map-art
// packs read in place, pictures added to the library, FG art opened from maps
// and Dungeondraft art), asset bytes and thumbnails, uploads, projects with
// their last ten revisions, portable zips and the demo map.
//
// Like server.py this keeps one catalogue per process (its ASSETS), so the FG
// and Foundry exporters can require this module and call assetBytes,
// getAsset and validateProject exactly where the Python calls asset_bytes,
// ASSETS[...] and validate_project. configure() points it at the GM's folders;
// everything it writes stays under dataDir.

const MiB = 1024 * 1024;
// Mutable so checks can lower them, as test_export.py patches server.MAX_BODY / MAX_PORTABLE.
const limits = { MAX_BODY: 100 * MiB, MAX_PORTABLE: 90 * MiB };
const IMAGE_EXT = new Set([".png", ".webp", ".jpg", ".jpeg"]);
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp", ".svg": "image/svg+xml" };
// FG maps opened for editing can be large; new maps stay well below this.
const MAX_SIDE = 16384;
const MAX_AREA = 120000000;

const config = { dataDir: null, packsDir: null, examplesDir: null, fgDataFolder: null, ddFolders: null, packFolders: null };
const ASSETS = new Map();
let ready = null;
let ddScanner = null;

const dirs = {
  get library() {
    return path.join(config.dataDir, "library");
  },
  get projects() {
    return path.join(config.dataDir, "projects");
  },
  get backups() {
    return path.join(config.dataDir, "backups");
  },
  get cache() {
    return path.join(config.dataDir, "cache");
  },
};
const fgArtFile = () => path.join(dirs.library, "fg-art.json");
const ddArtFile = () => path.join(dirs.library, "dd-art.json");

// ---------------------------------------------------------------------------
// Small helpers that behave like the Python they replace.

class StudioError extends Error {}
const fail = (message) => {
  throw new StudioError(message);
};
const hasOwn = (obj, key) => obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
const isDict = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value);
// Python slices strings by character, not by UTF-16 unit.
const clip = (text, n) => Array.from(String(text)).slice(0, n).join("");
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

// server.py's asset_id: the stable id a pack picture keeps across installs.
function assetId(value) {
  return sha256(Buffer.from(value, "utf8")).slice(0, 24);
}

// Python's Path(name).stem, accepting either slash.
function pyStem(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function pySuffix(name) {
  const base = String(name).split(/[\\/]/).pop();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

// Python's round(): halves go to the even neighbour.
function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// Python's float(): numbers, booleans and numeric strings (with inf/nan); anything else is an error.
function toFloat(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^[+-]?(inf|infinity)$/i.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
    if (/^[+-]?nan$/i.test(s)) return NaN;
    if (/^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)(e[+-]?\d(_?\d)*)?$/i.test(s)) return Number(s.replace(/_/g, ""));
  }
  return undefined;
}

// server.py's number(): a field as a finite number within bounds, else a ValueError the user can read.
function number(obj, field, fallback = 0, low = -1000000, high = 1000000) {
  const raw = hasOwn(obj, field) ? obj[field] : fallback;
  const n = toFloat(raw);
  if (n === undefined) fail(`Invalid ${field}.`);
  if (!Number.isFinite(n) || !(low <= n && n <= high)) fail(`${field} must be between ${low} and ${high}.`);
  return n;
}

// Python's json.dumps(..., sort_keys=True) orders every object's keys.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isDict(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

// base64.b64decode(..., validate=True): only the alphabet, with correct padding.
function strictBase64(text) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail("Non-base64 digit found");
  if (text.length % 4) fail("Incorrect padding");
  return Buffer.from(text, "base64");
}

async function imageSize(data) {
  const meta = await sharp(data, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) fail("Unreadable picture.");
  return [meta.width, meta.height, meta.format];
}

// Runs fn over items, a few at a time, so a big pack does not decode every picture at once.
async function eachLimited(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Zip archives read in place. A pack can be tens of megabytes and a picture is
// asked for one at a time, so only the central directory is kept and each
// entry is read from its own offset (as Python's zipfile does).

const CP437 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const zipCache = new Map();

function decodeName(bytes, utf8) {
  if (utf8) return bytes.toString("utf8");
  // Python's zipfile reads names without the UTF-8 flag as code page 437; ids depend on it.
  let out = "";
  for (const b of bytes) out += b < 128 ? String.fromCharCode(b) : CP437[b - 128];
  return out;
}

function readAt(fd, position, length) {
  const out = Buffer.alloc(length);
  const n = fs.readSync(fd, out, 0, length, position);
  return out.subarray(0, n);
}

// The archive's entries by name: { method, flags, compSize, size, offset }.
function zipEntries(file) {
  const stat = fs.statSync(file);
  const cached = zipCache.get(file);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.entries;
  const fd = fs.openSync(file, "r");
  try {
    const tailLength = Math.min(stat.size, 65557);
    const tail = readAt(fd, stat.size - tailLength, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) fail("File is not a zip file");
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      // Zip64: the locator sits just before the end record and points at the real one.
      const locatorAt = stat.size - tailLength + eocd - 20;
      const locator = readAt(fd, locatorAt, 20);
      if (locator.readUInt32LE(0) !== 0x07064b50) fail("File is not a zip file");
      const record = readAt(fd, Number(locator.readBigUInt64LE(8)), 56);
      count = Number(record.readBigUInt64LE(32));
      cdSize = Number(record.readBigUInt64LE(40));
      cdOffset = Number(record.readBigUInt64LE(48));
    }
    const cd = readAt(fd, cdOffset, cdSize);
    const entries = new Map();
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) fail("Bad magic number for central directory");
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      let compSize = cd.readUInt32LE(p + 20);
      let size = cd.readUInt32LE(p + 24);
      const nameLength = cd.readUInt16LE(p + 28);
      const extraLength = cd.readUInt16LE(p + 30);
      const commentLength = cd.readUInt16LE(p + 32);
      let offset = cd.readUInt32LE(p + 42);
      const name = decodeName(cd.subarray(p + 46, p + 46 + nameLength), flags & 0x800);
      // Zip64 sizes and offset live in extra field 1, in this order, when the short field is full.
      let x = p + 46 + nameLength;
      const extraEnd = x + extraLength;
      while (x + 4 <= extraEnd) {
        const id = cd.readUInt16LE(x);
        const length = cd.readUInt16LE(x + 2);
        if (id === 1) {
          let q = x + 4;
          if (size === 0xffffffff) (size = Number(cd.readBigUInt64LE(q))), (q += 8);
          if (compSize === 0xffffffff) (compSize = Number(cd.readBigUInt64LE(q))), (q += 8);
          if (offset === 0xffffffff) offset = Number(cd.readBigUInt64LE(q));
        }
        x += 4 + length;
      }
      entries.set(name, { method, flags, compSize, size, offset });
      p = extraEnd + commentLength;
    }
    if (zipCache.size > 64) zipCache.delete(zipCache.keys().next().value);
    zipCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, entries });
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

async function zipRead(file, name) {
  const entry = zipEntries(file).get(name);
  if (!entry) throw new StudioError(`There is no item named '${name}' in the archive`);
  if (entry.flags & 1) fail("File is encrypted, password required for extraction");
  const handle = await fs.promises.open(file, "r");
  try {
    const local = Buffer.alloc(30);
    await handle.read(local, 0, 30, entry.offset);
    if (local.readUInt32LE(0) !== 0x04034b50) fail("Bad magic number for file header");
    const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const raw = Buffer.alloc(entry.compSize);
    await handle.read(raw, 0, entry.compSize, start);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return zlib.inflateRawSync(raw);
    fail("That compression method is not supported");
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------
// Walls and lights as projects keep them. These mirror occluders.py and the
// normalising half of lighting.py, which validate_project needs; the FG
// exporter reads the same shapes.

// type id -> [FG label, flags FG writes for that type] (FG 5.1.14's own presets).
const WALL_TYPES = {
  wall: ["Wall", []],
  terrain: ["Terrain", ["toggleable", "hidden", "single_sided", "terrain", "allow_move", "closed", "counterclockwise"]],
  door: ["Door", ["toggleable"]],
  secret: ["Toggleable Wall", ["toggleable", "hidden"]],
  window: ["Window", ["toggleable", "allow_vision"]],
  invisible: ["Invisible Wall", ["allow_vision"]],
  illusion: ["Illusionary Wall", ["allow_move"]],
  pit: ["Pit", ["toggleable", "hidden", "single_sided", "pit", "closed", "counterclockwise"]],
  shadow: ["Shadow Caster", ["shadow"]],
};
const WALL_FLAGS = ["toggleable", "hidden", "open", "locked", "single_sided", "terrain", "pit", "allow_move", "allow_vision", "closed", "counterclockwise", "shadow"];
const LEGACY_KIND = { wall: "wall", door: "door", window: "window" };
const MAX_WALL_POINTS = 20000;

function wallTypeFromFlags(flags) {
  const f = new Set(flags);
  if (f.has("pit")) return "pit";
  if (f.has("terrain")) return "terrain";
  if (f.has("shadow")) return "shadow";
  if (f.has("toggleable") && f.has("allow_vision")) return "window";
  if (f.has("toggleable") && f.has("hidden")) return "secret";
  if (f.has("toggleable")) return "door";
  if (f.has("allow_move") && !f.has("allow_vision")) return "illusion";
  if (f.has("allow_vision") && !f.has("allow_move")) return "invisible";
  return "wall";
}

// occluders.normalize: a wall in the shape model; accepts the older two-point {kind, x1..y2} form.
function normalizeWall(o) {
  if (!isDict(o)) fail("Invalid wall.");
  if (!hasOwn(o, "points") && hasOwn(o, "x1")) {
    const kind = hasOwn(LEGACY_KIND, o.kind) ? LEGACY_KIND[o.kind] : null;
    if (!kind) fail("Unknown wall type.");
    const flags = [...WALL_TYPES[kind][1], ...(o.open && kind !== "wall" ? ["open"] : [])];
    const out = {};
    for (const [k, v] of Object.entries(o)) if (!["kind", "x1", "y1", "x2", "y2", "open"].includes(k)) out[k] = v;
    Object.assign(out, { type: kind, points: [o.x1, o.y1, o.x2, o.y2], flags });
    o = out;
  }
  const points = o.points;
  const flags = hasOwn(o, "flags") ? o.flags : [];
  if (!Array.isArray(points) || points.length < 4 || points.length % 2 || points.length > 2 * MAX_WALL_POINTS) fail("A wall needs at least two points.");
  for (const v of points) if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1000000) fail("Wall points must be numbers.");
  if (!Array.isArray(flags) || flags.some((f) => !WALL_FLAGS.includes(f))) fail("Unknown wall option.");
  const out = { ...o, flags: WALL_FLAGS.filter((f) => flags.includes(f)) };
  if (!hasOwn(WALL_TYPES, out.type)) out.type = wallTypeFromFlags(out.flags);
  return out;
}

const AMBIENT = {
  night: { darkness: 1.0 },
  dawn: { color: "#ffdfbd", alpha: 1, shadowColor: "#0057bd", shadowAlpha: 0x65 / 255, angle: 144, length: 2, darkness: 0.3 },
  sunlight: { color: "#fff7e6", alpha: 1, shadowColor: "#30525d", shadowAlpha: 0x91 / 255, angle: 280, length: 0.2, darkness: 0.0 },
  dusk: { color: "#ffc3a0", alpha: 1, shadowColor: "#3052bb", shadowAlpha: 0x31 / 255, angle: 316, length: 2, darkness: 0.4 },
  moonlight: { color: "#c9e7ff", alpha: 0x91 / 255, shadowColor: "#195263", shadowAlpha: 0x74 / 255, angle: 220, length: 0.6, darkness: 0.7 },
  custom: { color: "#8ea0c8", alpha: 0.8, shadowColor: "#202838", shadowAlpha: 0.5, angle: 225, length: 1 },
};
const FG_ANIM = { flicker: 1, pulse: 2 };
const FALLOFF = 25;
const DIM_FALLOFF = 50;
const HEX = /^#[0-9a-fA-F]{6}$/;

// lighting._num: a number clamped into range, or the default when it is not one.
function clampNum(v, lo, hi, fallback) {
  const n = toFloat(v);
  if (n === undefined || Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function normalizeAmbient(a) {
  if (!isDict(a) || typeof a.preset !== "string" || !hasOwn(AMBIENT, a.preset)) return null;
  if (a.preset === "night") return { preset: "night" };
  const d = AMBIENT[a.preset];
  const color = (k) => (typeof a[k] === "string" && HEX.test(a[k]) ? a[k].toLowerCase() : d[k]);
  return {
    preset: a.preset,
    color: color("color"),
    alpha: clampNum(a.alpha, 0.05, 1, d.alpha),
    shadows: a.shadows !== false,
    shadowColor: color("shadowColor"),
    shadowAlpha: clampNum(a.shadowAlpha, 0, 1, d.shadowAlpha),
    angle: pyRound(clampNum(a.angle, 0, 359, d.angle)),
    length: pyRound(clampNum(a.length, 0, 20, d.length) * 5) / 5,
  };
}

// lighting.normalize_light: changes the light in place, as the Python does.
function normalizeLight(o) {
  const old = o.animationSpeed;
  delete o.animationSpeed;
  if (!hasOwn(o, "speed") && old !== undefined && old !== null) o.speed = clampNum(old, 0, 10, 10) * 10;
  if (typeof o.animation !== "string" || !hasOwn(FG_ANIM, o.animation)) {
    delete o.animation;
    delete o.speed;
  } else o.speed = pyRound(clampNum(o.speed, 1, 100, 100));
  o.strength = pyRound(clampNum(o.strength, 1, 100, 100));
  o.falloff = pyRound(clampNum(o.falloff, 0, 100, FALLOFF));
  o.dimFalloff = pyRound(clampNum(o.dimFalloff, 0, 100, DIM_FALLOFF));
  if (o.inverse !== true) delete o.inverse;
  if (o.on !== false) delete o.on;
}

// lighting.darkness: 0 day .. 1 night outside the map's lights.
function darkness(p) {
  const a = p.ambient;
  if (!a) return Array.isArray(p.lights) && p.lights.length ? 0.85 : 0.0;
  if (a.preset !== "custom") return AMBIENT[a.preset].darkness;
  const n = parseInt(a.color.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return Math.round(Math.min(1, Math.max(0, 1 - lum * a.alpha)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Project validation (server.py's validate_project and its helpers).

// FG 5.1.14 FX layer settings per effect type: saved field -> FG default.
const FX_SETTINGS = {
  water: { WaterHorizontal: 0.15, WaterIntensity: 0.15, WaterSpeed: 0.2, WaterDroplet: 0.25 },
  clouds: { CloudSpeed: 0.75, CloudDensity: 0.75, CloudShadowDensity: 0.5, CloudOffset: 0.25 },
  myst: { MystFade: 0.75, MystSpeed: 1.0 },
  snow: { SnowFade: 1.0, SnowIntensity: 0.204, SnowSpeed: 0.55, SnowSize: 1.0 },
  rain: { RainFade: 1.0, RainIntensity: 0.25, RainSpeed: 0.6, RainDirection: 0.5 },
  blizzard: { BlizzardFade: 1.0, BlizzardSize: 0.5, BlizzardSpeed: 0.6 },
  ocean: { OceanDistortion: 0.5, OceanSizeX: 0.5, OceanSizeY: 0.5, OceanSpeed: 0.4 },
};
const FX_BLUR = "maskblur";
const FX_BLUR_MAX = 100;
const REGION_KINDS = { trap: "Trap", pit: "Pit", difficult: "Difficult terrain" };

// Where a grid line crosses, in map pixels from the top-left.
function gridOffset(p) {
  const off = p.gridOffset || {};
  if (!isDict(off)) fail("Invalid grid offset.");
  return [number(off, "x", 0), number(off, "y", 0)];
}

// An effect's mask outlines in map pixels (flat x, y lists), [] for nowhere, or
// null for the whole map. Older projects without a mask: their box.
function effectPolygons(o) {
  if (hasOwn(o, "polygons") || hasOwn(o, "mask")) {
    const polys = o.polygons;
    if (polys === undefined || polys === null) return o.mask === undefined || o.mask === null ? null : [];
    if (!Array.isArray(polys) || polys.length > 5000) fail("Invalid effect mask.");
    return polys.map((poly) => {
      if (!Array.isArray(poly) || poly.length < 6 || poly.length % 2 || poly.length > 200000) fail("Invalid effect mask outline.");
      return poly.map((v) => number({ v }, "v"));
    });
  }
  const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => number(o, k, 0));
  return [[x, y, x, y + h, x + w, y + h, x + w, y]]; // counter-clockwise on screen, as FG saves outlines
}

// Effects to export: not hidden, and shown somewhere.
function shownEffects(p) {
  return (p.effects || []).filter((o) => o.visible !== false && !(Array.isArray(effectPolygons(o)) && effectPolygons(o).length === 0));
}

// A trap, pit or difficult-terrain area: a polygon in map pixels, a name and a GM note.
function cleanRegion(r) {
  if (!isDict(r) || typeof r.kind !== "string" || !hasOwn(REGION_KINDS, r.kind)) fail("Unknown kind of region.");
  const pts = r.points;
  if (!Array.isArray(pts) || pts.length < 6 || pts.length % 2 || pts.length > 2000) fail("A region needs at least three corners.");
  for (const v of pts) if (typeof v !== "number" || !Number.isFinite(v)) fail("Region corners must be numbers.");
  const out = {
    id: clip(r.id || crypto.randomBytes(4).toString("hex"), 64),
    kind: r.kind,
    name: clip(r.name || REGION_KINDS[r.kind], 120),
    note: clip(r.note || "", 4000),
    points: pts.map(Number),
  };
  if (r.kind === "difficult") {
    const cost = toFloat(r.cost || 2);
    if (cost === undefined) fail(`could not convert string to float: '${r.cost}'`);
    out.cost = Math.min(5.0, Math.max(1.0, cost));
  }
  return out;
}

function regionCentre(r) {
  const xs = r.points.filter((_, i) => i % 2 === 0);
  const ys = r.points.filter((_, i) => i % 2 === 1);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

// Checks a project and returns it with its walls and regions normalised. Like
// the Python, it also normalises lights, effect masks and the ambient light in
// place on the project it was given.
function validateProject(p) {
  if (!isDict(p) || p.version !== 1) fail("This is not a supported Kraken Map Studio project.");
  number(p, "width", 1600, 100, MAX_SIDE);
  number(p, "height", 1000, 100, MAX_SIDE);
  if (number(p, "width") * number(p, "height") > MAX_AREA) fail("Map must be at most 36 million pixels.");
  number(p, "grid", 50, 5, 1000);
  for (const key of ["objects", "walls", "lights", "effects"]) {
    const list = hasOwn(p, key) ? p[key] : [];
    if (!Array.isArray(list) || list.length > (key === "walls" ? 50000 : 5000)) fail(`Too many or invalid ${key}.`);
  }
  for (const o of p.objects || []) {
    if (!isDict(o) || !ASSETS.has(o.assetId)) fail("Project references missing artwork. Import its portable ZIP first.");
    for (const k of ["x", "y", "rotation"]) number(o, k);
    for (const k of ["width", "height"]) number(o, k, 100, 1, 100000);
  }
  if (hasOwn(p, "exportLayers") && typeof p.exportLayers !== "boolean") fail("exportLayers must be true or false.");
  const walls = (p.walls || []).map(normalizeWall);
  gridOffset(p);
  if (hasOwn(p, "peek")) number(p, "peek", 0, 0, 10);
  for (const o of p.lights || []) {
    if (!isDict(o)) fail("Invalid light.");
    for (const k of ["x", "y"]) number(o, k);
    const bright = number(o, "bright", 10, 0, 10000);
    const dim = number(o, "dim", 20, 0.01, 10000);
    if (dim < bright) fail("Dim light radius must be at least the bright radius.");
    const color = hasOwn(o, "color") ? o.color : "#ffbb66";
    if (typeof color !== "string" || !HEX.test(color)) fail("Invalid light color.");
    normalizeLight(o);
  }
  const ambient = normalizeAmbient(p.ambient);
  if (ambient) {
    p.ambient = ambient;
    p.darkness = darkness(p);
  } else delete p.ambient;
  for (const o of p.effects || []) {
    if (!isDict(o) || typeof o.type !== "string" || !hasOwn(FX_SETTINGS, o.type)) fail("Unknown environmental effect.");
    o.polygons = effectPolygons(o);
    for (const k of ["x", "y"]) number(o, k);
    for (const k of ["width", "height"]) number(o, k, 1, 1, 100000);
    // Rain's drop size (Map Studio, its Foundry rain and Kraken VTT; FG has none).
    if (o.dropSize !== undefined && o.dropSize !== null && o.type === "rain") number(o, "dropSize", 1, 0.25, 3);
    else delete o.dropSize;
    const settings = hasOwn(o, "settings") ? o.settings : {};
    if (!isDict(settings)) fail("Invalid effect settings.");
    for (const k of Object.keys(settings)) {
      if (!hasOwn(FX_SETTINGS[o.type], k) && k !== FX_BLUR) fail(`Unknown ${o.type} setting ${k}.`);
      number(settings, k, 0, 0, k === FX_BLUR ? FX_BLUR_MAX : 1);
    }
  }
  const rawRegions = hasOwn(p, "regions") ? p.regions : [];
  const regions = Array.isArray(rawRegions) ? rawRegions.map(cleanRegion) : null;
  if (regions === null || regions.length > 2000) fail("Too many or invalid traps and regions.");
  return { ...p, walls, regions };
}

// ---------------------------------------------------------------------------
// The catalogue.

// The fields of an asset the editor sees (never where it is on disk).
function publicAsset(a) {
  const out = {};
  for (const k of ["id", "name", "category", "width", "height", "gridSize", "defaultGrid", "sourcePack", "tags", "assetType"]) if (hasOwn(a, k)) out[k] = a[k];
  return out;
}

function getAsset(key) {
  return ASSETS.get(key);
}

// server.py's asset_tags: tags from the pack folders, background or tile from the folder names.
function assetTags(category, archive) {
  const parts = String(category)
    .split("/")
    .filter((p) => p && p.toLowerCase() !== "images");
  const lower = String(category).toLowerCase();
  return { sourcePack: path.parse(archive).name, tags: parts, assetType: lower.includes("background") || lower.includes("floor") ? "background" : "tile" };
}

// server.py's asset_metadata: the picture's size and the grid from its FG <gridsize> file.
// Any unreadable part gives {} (the asset is still listed), as in the Python.
async function assetMetadata(archive, imageEntry, metadataEntry) {
  let width;
  let height;
  let grid = null;
  try {
    [width, height] = await imageSize(await zipRead(archive, imageEntry));
    if (metadataEntry && zipEntries(archive).has(metadataEntry)) {
      const text = strFromU8(await zipRead(archive, metadataEntry), true);
      const doc = new DOMParser({
        errorHandler: {
          warning() {},
          error(e) {
            throw new StudioError(String(e));
          },
          fatalError(e) {
            throw new StudioError(String(e));
          },
        },
      }).parseFromString(text, "text/xml");
      const root = doc.documentElement;
      if (!root) fail("XML parse error");
      const el = Array.from(root.childNodes).find((n) => n.nodeType === 1 && n.nodeName === "gridsize");
      grid = el ? el.textContent : null;
    }
  } catch {
    return {};
  }
  let gridSize = null;
  if (grid) {
    const n = toFloat(String(grid).split(",")[0]);
    gridSize = n === undefined ? null : n;
  }
  return { width, height, defaultGrid: grid, gridSize };
}

// Every picture under images/ in a pack, with its FG <gridsize> sidecar when it has one:
// the entries Map Studio's asset catalogue lists for its packs (see build_kraken_pack.py).
function packPictures(archive) {
  const entries = zipEntries(archive);
  const pictures = [];
  for (const entry of entries.keys()) {
    if (entry.endsWith("/") || !entry.toLowerCase().startsWith("images/")) continue;
    const ext = path.posix.extname(entry).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const sidecar = entry.slice(0, entry.length - ext.length) + ".xml";
    pictures.push({ name: path.posix.parse(entry).name, category: path.posix.dirname(entry), entry, metadata_entry: entries.has(sidecar) ? sidecar : null });
  }
  return pictures;
}

// A module in the GM's FG modules folder is a map-art pack when it is a plain
// zip with no records (no db.xml or client.xml: an image pack like the Shockbolt
// kit, not an adventure) and at least one picture with FG's <gridsize> sidecar.
function isArtPack(archive) {
  const entries = zipEntries(archive);
  for (const name of entries.keys()) if (/^(db|client)\.xml$/i.test(name)) return false;
  return packPictures(archive).some((p) => p.metadata_entry);
}

// The picture list of each pack is kept in dataDir/cache so later starts do
// not decode every picture again; a pack is read again when its size or date changes.
function readPackIndex() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirs.cache, "pack-index.json"), "utf8"));
  } catch {
    return {};
  }
}

function writePackIndex(index) {
  fs.mkdirSync(dirs.cache, { recursive: true });
  fs.writeFileSync(path.join(dirs.cache, "pack-index.json"), JSON.stringify(index));
}

async function indexPack(archive, index, { mustBeArt }) {
  const stat = fs.statSync(archive);
  const known = index[archive];
  if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.pictures;
  let pictures = null;
  try {
    if (!mustBeArt || isArtPack(archive)) {
      pictures = packPictures(archive);
      await eachLimited(pictures, 6, async (p) => Object.assign(p, await assetMetadata(archive, p.entry, p.metadata_entry)));
    }
  } catch {
    pictures = null; // not a zip (an encrypted FG module) or damaged: never listed
  }
  index[archive] = { size: stat.size, mtimeMs: stat.mtimeMs, pictures };
  index.changed = true;
  return pictures;
}

function listMods(folder) {
  try {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".mod"))
      .map((e) => path.join(folder, e.name))
      .sort();
  } catch {
    return [];
  }
}

// server.py's catalog(): packs first (Kraken's own, then the GM's FG map-art
// packs), then the library's pictures, FG map art and Dungeondraft art.
async function catalog() {
  const index = readPackIndex();
  delete index.changed;
  const sources = [
    ...listMods(config.packsDir || "").map((file) => [file, false]),
    ...(config.fgDataFolder ? listMods(path.join(config.fgDataFolder, "modules")).map((file) => [file, true]) : []),
    // Folders of art packs the GM pointed Map Studio at (Kraken's Settings), read like FG's map-art packs.
    ...(Array.isArray(config.packFolders) ? config.packFolders : []).flatMap((folder) => listMods(folder).map((file) => [file, true])),
  ];
  const seen = new Set();
  for (const [archive, mustBeArt] of sources) {
    const archiveName = path.basename(archive);
    // Kraken's own packs come first; a copy of one in the FG modules folder adds nothing.
    if (seen.has(archiveName.toLowerCase())) continue;
    seen.add(archiveName.toLowerCase());
    const pictures = await indexPack(archive, index, { mustBeArt });
    for (const a of pictures || []) {
      const key = assetId(`${archiveName}|${a.entry}`);
      if (ASSETS.has(key)) continue;
      ASSETS.set(key, { ...a, archive, id: key, ...assetTags(a.category, archive) });
    }
  }
  if (index.changed) {
    delete index.changed;
    try {
      writePackIndex(index);
    } catch {
      /* a cache that cannot be written only costs the next start some time */
    }
  }
  fs.mkdirSync(dirs.library, { recursive: true });
  const files = fs
    .readdirSync(dirs.library)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort();
  const registered = new Array(files.length);
  await eachLimited(files, 6, async (f, i) => {
    try {
      registered[i] = await describeLocal(path.join(dirs.library, f));
    } catch {
      /* an unreadable picture in the library is left out */
    }
  });
  for (const a of registered) if (a) ASSETS.set(a.id, a);
  for (const a of Object.values(fgArtRegistry())) ASSETS.set(a.id, fgAsset(a));
  for (const a of Object.values(ddRegistry())) {
    try {
      if (fs.statSync(a.ddPack).isFile()) ASSETS.set(a.id, a);
    } catch {
      /* the pack has gone: its art is no longer listed */
    }
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

// FG map art opened from campaigns and modules, referenced in place (not copied).
const fgArtRegistry = () => readJson(fgArtFile());
// Dungeondraft art from packs opened in the library, read from the pack in place.
const ddRegistry = () => readJson(ddArtFile());

function fgAsset(a) {
  return { ...a, category: "FG map art", gridSize: null, sourcePack: "Fantasy Grounds", tags: ["FG map art", a.source || ""], assetType: "background" };
}

// The picture of an FG map layer as an asset, called by fgMaps.openMap (Python's
// register_fg_art). source is the FG source ({ kind, key }); size is [w, h] (or
// { width, height }). Synchronous, so it works whether or not the caller awaits it.
function registerFgArt(source, ref, name, data, size) {
  const key = "fg" + crypto.createHash("sha1").update(`${source.kind}|${source.key}|${ref}`, "utf8").digest("hex").slice(0, 22);
  if (!ASSETS.has(key)) {
    const [w, h] = Array.isArray(size) ? size : [size.width, size.height];
    const entry = { id: key, name, fgKind: source.kind, fgKey: source.key, fgRef: ref, source: source.key, width: w, height: h };
    const registry = fgArtRegistry();
    registry[key] = entry;
    fs.mkdirSync(dirs.library, { recursive: true });
    fs.writeFileSync(fgArtFile(), JSON.stringify(registry, null, 1));
    ASSETS.set(key, fgAsset(entry));
  }
  return key;
}

// What saving back to FG needs to know about one artwork asset (Python's fg_asset_info):
// [fg ref or null, [fg kind, key] or null, load() -> Promise<Buffer>, extension, [w, h]].
function fgAssetInfo(key) {
  const a = ASSETS.get(key);
  if (!a) fail("Project references missing artwork.");
  const size = [number(a, "width", 1, 1, 1000000), number(a, "height", 1, 1, 1000000)];
  const load = async () => (await assetBytes(key))[0];
  if (hasOwn(a, "fgRef")) return [a.fgRef, [a.fgKind, a.fgKey], load, pySuffix(a.fgRef.split("@")[0]), size];
  const ext = pySuffix(a.local || a.entry || a.ddEntry || "x.png").toLowerCase() || ".png";
  return [null, null, load, ext, size];
}

function ddScan() {
  if (!ddScanner) ddScanner = ddPacks.createScanner({ folders: config.ddFolders });
  return ddScanner;
}

// Lists a Dungeondraft pack's art in the library (Python's register_dd_pack).
async function registerDdPack(key) {
  const [, assets] = await ddScan().packAssets(key);
  const fresh = assets.filter((a) => !ASSETS.has(a.id));
  await eachLimited(fresh, 6, async (a) => {
    // The first 64 KB is enough for a PNG's size; a WebP is read whole when that fails.
    for (const size of [...new Set([Math.min(a.ddSize, 65536), a.ddSize])]) {
      try {
        [a.width, a.height] = await imageSize(await ddPacks.readSlice(a.ddPack, a.ddOffset, size));
        a.skip = false;
        break;
      } catch {
        a.skip = size === a.ddSize;
      }
    }
  });
  const kept = fresh.filter((a) => {
    const skip = a.skip;
    delete a.skip;
    return !skip;
  });
  if (kept.length) {
    const registry = ddRegistry();
    for (const a of kept) registry[a.id] = a;
    fs.mkdirSync(dirs.library, { recursive: true });
    fs.writeFileSync(ddArtFile(), JSON.stringify(registry));
    for (const a of kept) ASSETS.set(a.id, a);
  }
  return assets.filter((a) => ASSETS.has(a.id)).map((a) => publicAsset(ASSETS.get(a.id)));
}

// A picture in the library folder as an asset; its name is kept beside it in <id>.json.
async function describeLocal(file, name) {
  const [w, h] = await imageSize(await fs.promises.readFile(file));
  const meta = file.slice(0, file.length - path.extname(file).length) + ".json";
  if (name) fs.writeFileSync(meta, JSON.stringify({ name }));
  else if (fs.existsSync(meta)) {
    try {
      name = JSON.parse(fs.readFileSync(meta, "utf8")).name;
    } catch {
      /* a damaged name file: the picture keeps its id as its name */
    }
  }
  const id = path.parse(file).name;
  return { id, name: name || id, category: "Imported artwork", local: file, width: w, height: h, gridSize: null, sourcePack: "Imported artwork", tags: ["Imported artwork"], assetType: "tile" };
}

async function registerLocal(file, name) {
  const a = await describeLocal(file, name);
  ASSETS.set(a.id, a);
  return publicAsset(a);
}

// Fantasy Grounds' map art is read through fgMaps (another port); its Source
// is built the way the Python builds fg_maps.Source(kind, key).
function fgSource(fgMaps, kind, key) {
  const Source = fgMaps.Source;
  if (typeof Source !== "function") return { kind, key };
  return Source.prototype ? new Source(kind, key) : Source(kind, key);
}

// The bytes and extension of an asset (Python's asset_bytes): [Buffer, ".webp"].
async function assetBytes(key) {
  const a = ASSETS.get(key);
  if (!a) fail("Artwork is missing. Open the portable project or import the source artwork.");
  if (hasOwn(a, "local")) return [await fs.promises.readFile(a.local), pySuffix(a.local)];
  if (hasOwn(a, "ddPack")) return [await ddPacks.readSlice(a.ddPack, a.ddOffset, a.ddSize), pySuffix(a.ddEntry)];
  if (hasOwn(a, "fgRef")) {
    // Assumes fgMaps.bitmapBytes(ref, source) mirrors fg_maps.bitmap_bytes: bytes, or null when unreadable.
    const fgMaps = require("./fgMaps.cjs");
    const data = await fgMaps.bitmapBytes(a.fgRef, fgSource(fgMaps, a.fgKind, a.fgKey));
    if (data === null || data === undefined) fail(`FG artwork is no longer readable: ${a.fgRef}`);
    return [Buffer.from(data), pySuffix(a.fgRef.split("@")[0])];
  }
  return [await zipRead(a.archive, a.entry), pySuffix(a.entry)];
}

// A 144-pixel WebP of an asset for the library, kept for the 700 most recent.
const thumbCache = new Map();
async function thumbnail(key) {
  if (thumbCache.has(key)) {
    const hit = thumbCache.get(key);
    thumbCache.delete(key);
    thumbCache.set(key, hit);
    return hit;
  }
  const [raw] = await assetBytes(key);
  const out = await sharp(raw, { failOn: "none" }).resize(144, 144, { fit: "inside", withoutEnlargement: true }).ensureAlpha().webp({ quality: 80 }).toBuffer();
  thumbCache.set(key, out);
  if (thumbCache.size > 700) thumbCache.delete(thumbCache.keys().next().value);
  return out;
}

function mimeFor(ext) {
  return MIME[String(ext).toLowerCase()] || "application/octet-stream";
}

// Adds a picture to the library. PNG, JPEG and WebP are kept exactly as they are.
async function imageImport(data, name) {
  data = Buffer.from(data);
  if (data.length > 100 * MiB) fail("Pictures must be under 100 MB.");
  let raw;
  let ext;
  try {
    const [w, h, format] = await imageSize(data);
    if (w * h > 120000000) fail(`That picture is ${w} x ${h} pixels; the limit is 120 million pixels.`);
    if (format === "png" || format === "jpeg" || format === "webp") {
      raw = data;
      ext = { png: ".png", jpeg: ".jpg", webp: ".webp" }[format];
    } else {
      raw = await sharp(data).ensureAlpha().png().toBuffer();
      ext = ".png";
    }
  } catch (e) {
    if (e instanceof StudioError && /pixels/.test(e.message)) throw e;
    fail("That file is not a picture Map Studio can read (use PNG, JPG or WebP).");
  }
  fs.mkdirSync(dirs.library, { recursive: true });
  const file = path.join(dirs.library, sha256(raw).slice(0, 24) + ext);
  if (!fs.existsSync(file)) fs.writeFileSync(file, raw);
  return registerLocal(file, clip(pyStem(name), 120));
}

// ---------------------------------------------------------------------------
// Pictures and portable projects.

// The rendered map as WebP: only the background colour when art is kept as layers.
async function mapPicture(p, dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) fail("Missing rendered map image.");
  const raw = strictBase64(dataUrl.split(",").slice(1).join(","));
  const [w, h] = await imageSize(raw);
  if (w !== Math.trunc(number(p, "width")) || h !== Math.trunc(number(p, "height"))) fail("Rendered image dimensions do not match the project.");
  if (p.exportLayers) {
    // The rendered image includes the objects' art; with native layers only the
    // background goes below the separately placed objects, so hidden ones stay hidden.
    const background = String(p.background || "#000000");
    if (!HEX.test(background)) fail("Invalid background color.");
    return sharp({ create: { width: w, height: h, channels: 3, background } }).webp({ quality: 92, effort: 4 }).toBuffer();
  }
  return sharp(raw).removeAlpha().webp({ quality: 92, effort: 4 }).toBuffer();
}

const TOO_BIG = "Portable projects can contain at most 90 MB of uncompressed data.";

// A project and every picture it uses, as one zip that opens on any computer.
async function portableProject(p) {
  validateProject(p);
  p = JSON.parse(JSON.stringify(p));
  const manifest = {};
  const files = {};
  let total = 0;
  for (const key of new Set((p.objects || []).map((o) => o.assetId))) {
    const [data, ext] = await assetBytes(key);
    total += data.length;
    if (total > limits.MAX_PORTABLE) fail(TOO_BIG);
    const entry = `assets/${key}${ext.toLowerCase()}`;
    // Pictures are already compressed; storing them saves time and costs nothing.
    files[entry] = [new Uint8Array(data), { level: 0 }];
    manifest[key] = { entry, name: ASSETS.get(key).name };
  }
  p.portableAssets = manifest;
  const projectJson = strToU8(JSON.stringify(p, null, 2));
  if (total + projectJson.length > limits.MAX_PORTABLE) fail(TOO_BIG);
  files["project.json"] = [projectJson, { level: 6 }];
  return Buffer.from(zipSync(files));
}

// Opens a portable project: its pictures join the library, the project points at them.
async function importPortable(data) {
  const bytes = new Uint8Array(data);
  let total = 0;
  try {
    unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        return false;
      },
    });
  } catch {
    fail("File is not a zip file");
  }
  if (total > limits.MAX_PORTABLE) fail(TOO_BIG);
  const files = unzipSync(bytes);
  if (!files["project.json"]) fail("There is no item named 'project.json' in the archive");
  const p = JSON.parse(strFromU8(files["project.json"]));
  const replacements = {};
  const portable = hasOwn(p, "portableAssets") ? p.portableAssets : {};
  delete p.portableAssets;
  for (const [key, a] of Object.entries(portable || {})) {
    if (!files[a.entry]) fail(`There is no item named '${a.entry}' in the archive`);
    replacements[key] = (await imageImport(files[a.entry], a.name)).id;
  }
  for (const obj of p.objects || []) if (hasOwn(replacements, obj.assetId)) obj.assetId = replacements[obj.assetId];
  return validateProject(p);
}

// ---------------------------------------------------------------------------
// Saved projects: dataDir/projects/<id>/project.json, its thumbnail and its last ten revisions.

function projectId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : null;
}

async function decodeThumbnail(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.startsWith("data:image/") || !value.includes(",")) fail("Thumbnail must be an image data URL.");
  const raw = strictBase64(value.split(",").slice(1).join(","));
  if (raw.length > 2 * MiB) fail("Thumbnail must be under 2 MB.");
  try {
    return await sharp(raw).resize(480, 360, { fit: "inside", withoutEnlargement: true }).removeAlpha().webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    fail("cannot identify image file");
  }
}

function projectSummary(folder) {
  const file = path.join(folder, "project.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const id = path.basename(folder);
  let revision = 0;
  try {
    revision = fs.readdirSync(path.join(folder, "revisions")).filter((f) => f.endsWith(".json")).length;
  } catch {
    /* no revisions yet */
  }
  return {
    id,
    name: clip(data.name || "Untitled Map", 120),
    updated: Math.floor(fs.statSync(file).mtimeMs / 1000),
    revision,
    thumbnail: fs.existsSync(path.join(folder, "thumbnail.webp")) ? `/api/projects/${id}/thumbnail` : null,
  };
}

async function saveProject(project, thumb = null) {
  validateProject(project);
  project = JSON.parse(JSON.stringify(project));
  const requested = projectId(project.projectId);
  delete project.projectId;
  const identifier = requested || "map-" + crypto.randomBytes(8).toString("hex");
  const folder = path.join(dirs.projects, identifier);
  const revisions = path.join(folder, "revisions");
  // No await until the files are written, so two saves cannot interleave.
  fs.mkdirSync(revisions, { recursive: true });
  const current = path.join(folder, "project.json");
  if (fs.existsSync(current)) {
    const before = fs.readFileSync(current);
    const stamp = fs.statSync(current, { bigint: true }).mtimeNs;
    const revision = path.join(revisions, `${stamp}-${sha256(before).slice(0, 12)}.json`);
    if (!fs.existsSync(revision)) fs.writeFileSync(revision, before);
  }
  fs.writeFileSync(current, JSON.stringify(sortKeys(project), null, 2));
  const old = fs
    .readdirSync(revisions)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const stale of old.slice(0, Math.max(0, old.length - 10))) fs.unlinkSync(path.join(revisions, stale));
  const image = await decodeThumbnail(thumb);
  if (image) fs.writeFileSync(path.join(folder, "thumbnail.webp"), image);
  return projectSummary(folder);
}

function listProjects() {
  let folders;
  try {
    folders = fs.readdirSync(dirs.projects, { withFileTypes: true });
  } catch {
    return [];
  }
  const summaries = [];
  for (const entry of folders) {
    const folder = path.join(dirs.projects, entry.name);
    if (!entry.isDirectory() || !projectId(entry.name) || !fs.existsSync(path.join(folder, "project.json"))) continue;
    try {
      summaries.push(projectSummary(folder));
    } catch {
      /* a damaged project is left out of the list */
    }
  }
  return summaries.sort((a, b) => b.updated - a.updated);
}

function loadProject(identifier) {
  if (!projectId(identifier)) fail("Invalid project id.");
  const file = path.join(dirs.projects, identifier, "project.json");
  if (!fs.existsSync(file)) fail("Project not found.");
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  validateProject(project);
  return project;
}

function projectThumbnail(identifier) {
  if (!projectId(identifier)) fail("Invalid project id.");
  const file = path.join(dirs.projects, identifier, "thumbnail.webp");
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

// ---------------------------------------------------------------------------
// The demo map. Kraken ships Smugglers' Cove as a portable project in
// studio/examples; opening it adds its pictures to the library once (they are
// stored by content, so later demos reuse them). Without the example the demo
// is server.py's Forgotten Crossing, built from whatever pack art is present.

let demoCache = null;

function exampleFile() {
  try {
    const zips = fs
      .readdirSync(config.examplesDir)
      .filter((f) => f.toLowerCase().endsWith(".kraken.zip"))
      .sort();
    const pick = zips.find((f) => /smuggler/i.test(f)) || zips[0];
    return pick ? path.join(config.examplesDir, pick) : null;
  } catch {
    return null;
  }
}

function forgottenCrossing() {
  const find = (name) => [...ASSETS.values()].find((a) => a.name === name);
  const p = {
    version: 1,
    name: "The Forgotten Crossing",
    width: 1600,
    height: 1000,
    grid: 50,
    background: "#30372d",
    objects: [],
    walls: [],
    lights: [
      { id: "lantern-1", x: 550, y: 480, bright: 10, dim: 25, color: "#ffc477" },
      { id: "lantern-2", x: 1050, y: 480, bright: 10, dim: 25, color: "#ffc477" },
    ],
    effects: [{ id: "river", type: "water", x: 700, y: 0, width: 200, height: 1000 }],
  };
  const specs = [
    ["Grass-Floor", 0, 0, 1600, 1000],
    ["blue_water_a_02", 700, 0, 200, 1000],
    ["wooden_floor_c_01", 500, 400, 600, 200],
    ["vegetation_tree_a_01", 100, 90, 230, 230],
    ["vegetation_tree_c_01", 360, 80, 190, 190],
    ["vegetation_tree_d_01", 1100, 90, 230, 230],
    ["vegetation_tree_b_01", 1310, 250, 200, 200],
    ["vegetation_tree_c_01", 150, 690, 240, 240],
    ["vegetation_tree_a_01", 1180, 700, 240, 240],
    ["stone_grey_d_01", 590, 180, 90, 70],
    ["stone_grey_a_01", 910, 700, 100, 80],
    ["campfire_a_01", 370, 510, 90, 90],
    ["wooden_chest_a_01", 1150, 470, 90, 70],
  ];
  specs.forEach(([name, x, y, width, height], i) => {
    const a = find(name);
    if (a) p.objects.push({ id: `demo-${i}`, assetId: a.id, name, x, y, width, height, rotation: 0, visible: true });
  });
  [
    [500, 400, 1100, 400],
    [500, 600, 1100, 600],
  ].forEach(([x1, y1, x2, y2], i) => p.walls.push({ id: `railing-${i}`, kind: "wall", x1, y1, x2, y2 }));
  return p;
}

async function demoProject() {
  const file = exampleFile();
  if (!file) return forgottenCrossing();
  if (!demoCache || demoCache.file !== file) demoCache = { file, project: await importPortable(await fs.promises.readFile(file)) };
  return JSON.parse(JSON.stringify(demoCache.project));
}

// ---------------------------------------------------------------------------
// FG's subscription vault: reported, never read. Map Studio listed the vault
// from a file of its own; Kraken looks at the vault folder itself.

function subscriptionInventory() {
  if (!config.fgDataFolder) return [];
  try {
    return fs
      .readdirSync(path.join(config.fgDataFolder, "vault"))
      .filter((f) => f.toLowerCase().endsWith(".dat"))
      .sort()
      .map((Name) => ({ Name }));
  } catch {
    return [];
  }
}

function isZipFile(file) {
  try {
    const fd = fs.openSync(file, "r");
    try {
      return readAt(fd, 0, 4).readUInt32LE(0) === 0x04034b50;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function subscriptionStatus() {
  const inventory = subscriptionInventory();
  const readableMods = config.fgDataFolder
    ? listMods(path.join(config.fgDataFolder, "modules"))
        .slice(0, 100)
        .filter(isZipFile)
        .map((file) => ({ name: path.parse(file).name, path: file }))
    : [];
  return {
    detected: inventory.length > 0,
    accessible: false,
    sourceNames: inventory.map((item) => String(item.Name).replace(/\.dat$/, "")),
    sourceCount: inventory.length,
    reason: "FG subscription vault files are protected; Map Studio does not decrypt or extract them.",
    supportedImportPath: "/api/import",
    readableModPacks: readableMods,
  };
}

// GET /api/assets.
function assetListing() {
  const assets = [...ASSETS.values()].map(publicAsset);
  const packs = [...new Set([...ASSETS.values()].filter((a) => hasOwn(a, "archive")).map((a) => a.sourcePack)), "Imported artwork"];
  return {
    assets,
    packs,
    subscriptionPacks: subscriptionInventory().length,
    subscriptionStatus: "Detected in FG vault; external artwork access not implemented.",
  };
}

// ---------------------------------------------------------------------------

// Points the catalogue at Kraken's folders and starts reading it (and the
// Dungeondraft scan). Returns the promise of the catalogue being read.
// Called again when the GM changes the asset pack folders: everything is read again.
function configure({ dataDir, packsDir = null, examplesDir = null, fgDataFolder = null, ddFolders = null, packFolders = null }) {
  if (!dataDir) throw new Error("Map Studio needs a data folder.");
  Object.assign(config, { dataDir: path.resolve(dataDir), packsDir, examplesDir, fgDataFolder, ddFolders, packFolders });
  ASSETS.clear();
  thumbCache.clear();
  demoCache = null;
  ddScanner = null;
  ready = catalog();
  ddScan().start();
  return ready;
}

const whenReady = () => ready || Promise.reject(new Error("Map Studio is not configured."));

module.exports = {
  // set-up
  configure,
  whenReady,
  config,
  dirs,
  limits,
  StudioError,
  // catalogue
  ASSETS,
  getAsset,
  assetId,
  publicAsset,
  assetListing,
  assetBytes,
  thumbnail,
  mimeFor,
  imageImport,
  registerFgArt,
  fgAssetInfo,
  fgSource,
  registerDdPack,
  ddScan,
  // projects
  validateProject,
  number,
  gridOffset,
  effectPolygons,
  shownEffects,
  cleanRegion,
  regionCentre,
  FX_SETTINGS,
  FX_BLUR,
  FX_BLUR_MAX,
  REGION_KINDS,
  MAX_SIDE,
  MAX_AREA,
  normalizeWall,
  normalizeLight,
  normalizeAmbient,
  darkness,
  WALL_TYPES,
  WALL_FLAGS,
  mapPicture,
  portableProject,
  importPortable,
  projectId,
  saveProject,
  listProjects,
  loadProject,
  projectThumbnail,
  demoProject,
  subscriptionStatus,
  // zip reading, for the exporters
  zipEntries,
  zipRead,
};
