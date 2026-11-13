// Reads maps from Fantasy Grounds campaigns and modules for Kraken's map
// editor (a port of the reading half of Map Studio's fg_maps.py; names,
// arguments and return shapes match it). Kraken opens its books' maps (FG
// modules) in the editor this way. This module writes nothing to FG: saving a
// map back into FG, and the FG and Foundry exports, belong to the stand-alone
// Map Studio, not to Kraken.
//
// A loaded map becomes an ordinary Map Studio project: image layers turn into
// artwork objects, occluders into walls (each FG occluder whole, with its
// flags), lights into lights and weather layers (water, clouds, mist, snow,
// rain, blizzard, ocean, with any mask) into effects. What Map Studio cannot
// edit (pins, text, paint, tokens, folders, other effects, art from encrypted
// vault packs) is counted in the project's fgKept and fgUnreadableArt, and the
// original <image> element stays in fgImage, as the Python original keeps it.
//
// FG facts used here (checked against FG 5.1.14 saves): image space is centred
// with Y pointing up; a layer's occluders and lights are stored in that layer's
// own space and move with its matrix; a top-level layer's parentid is its stack
// position (-1 = top).
//
// For the router (server.cjs), differences from the Python signatures:
//   - The FG data folder was a module-level lookup (KRAKEN_FG_DATA or APPDATA).
//     Every function takes a last `options` argument; options.dataFolder
//     overrides it, else KRAKEN_FG_DATA, else Kraken's fgDataFolder().
//       listSources(options)
//       listMaps(kind, key, includePictures, options)
//       mapThumbnail(kind, key, file, path, n, options)            async -> WebP Buffer
//       openMap(kind, key, file, path, n, registerAsset, fxSettings, fxBlur, options)   async -> project
//       new Source(kind, key, options), bitmapBytes(ref, source), moduleByName(name, options)
//   - registerAsset(source, ref, name, data, [w, h]) -> asset id (may return a Promise).
// Errors the Python raised as ValueError are thrown as Error with the same
// message. Image sizes come from sharp instead of Pillow (see openMap).

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const lighting = require("./lighting.cjs");
const occTypes = require("./occluders.cjs");

const { fromString, toString, parseEvents, declaredEncoding, decodeBytes } = lighting.xml;
const py = lighting.py;

const EFFECT_TYPES = ["water", "clouds", "myst", "snow", "rain", "blizzard", "ocean"];
const WALL_DATA = ["id", "points"];
// Pillow refuses pictures over twice its MAX_IMAGE_PIXELS (server.py sets 130 million).
const MAX_PIXELS = 2 * 130_000_000;

const has = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

function dataFolder(options = {}) {
  if (options.dataFolder) return options.dataFolder;
  if (process.env.KRAKEN_FG_DATA) return process.env.KRAKEN_FG_DATA;
  return require("../importers/fgModule.cjs").fgDataFolder();
}

function _safeKey(key) {
  if (typeof key !== "string" || !key || key === "." || key === ".." || /[\\/:*?"<>|]/.test(key)) throw new Error("Invalid campaign or module name.");
  return key;
}

function _safeEntry(ref) {
  ref = ref.replace(/\\/g, "/");
  if (!ref || ref.startsWith("/") || ref.split("/").includes("..")) throw new Error("Invalid artwork path.");
  return ref;
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
// Seconds, as Python's st_mtime.
const mtime = (p) => fs.statSync(p).mtimeMs / 1000;

// --- zip files (Python's zipfile, as far as the port needs it) ---------------

class BadZipFile extends Error {}

// IBM code page 437, the names of zip entries not flagged UTF-8 (as zipfile reads them).
const CP437 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";
function cp437(buf) {
  let s = "";
  for (const b of buf) s += b < 0x80 ? String.fromCharCode(b) : CP437[b - 0x80];
  return s;
}

// The end-of-central-directory record, or null when this is not a zip (is_zipfile).
function endRecord(buf) {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLength = buf.readUInt16LE(i + 20);
    if (i + 22 + commentLength > buf.length) continue;
    let count = buf.readUInt16LE(i + 10);
    let size = buf.readUInt32LE(i + 12);
    let offset = buf.readUInt32LE(i + 16);
    // ZIP64: the locator sits just before the record.
    if (i >= 20 && buf.readUInt32LE(i - 20) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(i - 12));
      if (buf.readUInt32LE(z64) === 0x06064b50) {
        count = Number(buf.readBigUInt64LE(z64 + 32));
        size = Number(buf.readBigUInt64LE(z64 + 40));
        offset = Number(buf.readBigUInt64LE(z64 + 48));
      }
    }
    return { at: i, count, size, offset };
  }
  return null;
}

// The archive's entries from its central directory (ZipFile.infolist()).
function zipInfos(buf) {
  const end = endRecord(buf);
  if (!end) throw new BadZipFile("File is not a zip file");
  // An archive with data before it (self-extractors) shifts every offset, as zipfile allows.
  const concat = end.at - end.size - end.offset;
  if (concat < 0) throw new BadZipFile("Bad offset for central directory");
  const infos = [];
  let p = end.offset + concat;
  for (let n = 0; n < end.count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new BadZipFile("Bad magic number for central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const time = buf.readUInt16LE(p + 12);
    const date = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    let compressedSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const externalAttr = buf.readUInt32LE(p + 38);
    let headerOffset = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLength);
    const name = flags & 0x800 ? rawName.toString("utf8") : cp437(rawName);
    // ZIP64 sizes and offsets live in the extra field when the plain ones are full.
    let e = p + 46 + nameLength;
    const extraEnd = e + extraLength;
    while (e + 4 <= extraEnd) {
      const id = buf.readUInt16LE(e);
      const len = buf.readUInt16LE(e + 2);
      if (id === 1) {
        let q = e + 4;
        if (size === 0xffffffff) (size = Number(buf.readBigUInt64LE(q))), (q += 8);
        if (compressedSize === 0xffffffff) (compressedSize = Number(buf.readBigUInt64LE(q))), (q += 8);
        if (headerOffset === 0xffffffff) headerOffset = Number(buf.readBigUInt64LE(q));
      }
      e += 4 + len;
    }
    infos.push({ filename: name, flags, method, time, date, crc, compressedSize, size, externalAttr, headerOffset: headerOffset + concat });
    p = extraEnd + commentLength;
  }
  return infos;
}

// One entry's bytes (ZipFile.read), checked against its CRC.
function zipRead(buf, info) {
  const at = info.headerOffset;
  if (buf.readUInt32LE(at) !== 0x04034b50) throw new BadZipFile("Bad magic number for file header");
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const raw = buf.subarray(start, start + info.compressedSize);
  if (info.flags & 1) throw new Error(`File ${info.filename} is encrypted, password required for extraction`);
  let data;
  if (info.method === 0) data = Buffer.from(raw);
  else if (info.method === 8) data = zlib.inflateRawSync(raw);
  else throw new Error("That compression method is not supported");
  if (zlib.crc32 && zlib.crc32(data) >>> 0 !== info.crc >>> 0) throw new BadZipFile(`Bad CRC-32 for file '${info.filename}'`);
  return data;
}

// The archive's directory, read once per change of the file.
const ZIP_CACHE = new Map();
function zipDirectory(file) {
  const st = fs.statSync(file);
  const cached = ZIP_CACHE.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached;
  const buf = fs.readFileSync(file);
  const infos = zipInfos(buf);
  const byName = new Map();
  for (const info of infos) byName.set(info.filename, info); // the last of a name wins, as in zipfile
  const entry = { mtimeMs: st.mtimeMs, size: st.size, buf, infos, byName };
  ZIP_CACHE.clear(); // one archive at a time: modules can be large
  ZIP_CACHE.set(file, entry);
  return entry;
}

function isZipfile(file) {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, 22 + 65535 + 20);
      const tail = Buffer.alloc(length);
      fs.readSync(fd, tail, 0, length, size - length);
      return endRecord(tail) !== null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function _encrypted(directory) {
  return directory.infos.some((info) => info.flags & 1);
}

// definition.xml's <name> and <displayname> ([null, null] when it does not parse).
function _definition(raw) {
  let root;
  try {
    root = fromString(raw);
  } catch {
    return [null, null];
  }
  return [root.findtext("name"), root.findtext("displayname")];
}

// A campaign folder, a .mod zip or a folder module.
class Source {
  constructor(kind, key, options = {}) {
    this.kind = kind;
    this.key = _safeKey(key);
    this.options = options;
    this.dataFolder = dataFolder(options);
    if (kind === "campaign") {
      this.path = path.join(this.dataFolder, "campaigns", key);
      if (!isFile(path.join(this.path, "db.xml"))) throw new Error(`Campaign not found: ${key}`);
      this.zipped = false;
    } else if (kind === "module") {
      this.path = path.join(this.dataFolder, "modules", key);
      if (isFile(this.path) && isZipfile(this.path)) {
        this.zipped = true;
        if (_encrypted(zipDirectory(this.path))) throw new Error("This module is encrypted by FG and cannot be opened.");
      } else if (isFile(path.join(this.path, "definition.xml"))) this.zipped = false;
      else throw new Error(`Module not found: ${key}`);
    } else throw new Error("Unknown source type.");
  }

  names() {
    return this.zipped ? zipDirectory(this.path).infos.map((i) => i.filename) : [];
  }

  exists(entry) {
    entry = _safeEntry(entry);
    if (this.zipped) return this.names().includes(entry);
    return isFile(path.join(this.path, entry));
  }

  read(entry) {
    entry = _safeEntry(entry);
    if (this.zipped) {
      const directory = zipDirectory(this.path);
      const info = directory.byName.get(entry);
      if (!info) {
        const error = new Error(`There is no item named '${entry}' in the archive`);
        error.pyType = "KeyError";
        throw error;
      }
      return zipRead(directory.buf, info);
    }
    return fs.readFileSync(path.join(this.path, entry));
  }

  xmlFiles() {
    if (this.kind === "campaign") return ["db.xml"];
    return ["db.xml", "client.xml"].filter((n) => this.exists(n));
  }

  stamp() {
    if (this.zipped) return mtime(this.path);
    return Math.max(...this.xmlFiles().map((n) => mtime(path.join(this.path, n))));
  }

  label() {
    if (this.kind === "campaign") return this.key;
    const [name, display] = _definition(this.read("definition.xml"));
    return display || name || this.key;
  }
}

const _MODULES = { folder: null, stamp: null, byName: new Map() };

// Finds a module by its definition <name> (what "@Module" refers to).
function moduleByName(name, options = {}) {
  const folder = path.join(dataFolder(options), "modules");
  let stamp;
  try {
    stamp = mtime(folder);
  } catch {
    return null;
  }
  if (_MODULES.folder !== folder || _MODULES.stamp !== stamp) {
    const found = new Map();
    for (const entry of fs.readdirSync(folder)) {
      try {
        const source = new Source("module", entry, options);
        const [modName] = _definition(source.read("definition.xml"));
        if (modName) found.set(modName, entry);
      } catch {
        continue;
      }
    }
    Object.assign(_MODULES, { folder, stamp, byName: found });
  }
  const key = _MODULES.byName.get(name);
  return key ? new Source("module", key, options) : null;
}

function listSources(options = {}) {
  const data = dataFolder(options);
  const campaigns = [];
  const modules = [];
  let locked = 0;
  const campaignDir = path.join(data, "campaigns");
  const found = [];
  if (isDir(campaignDir)) {
    for (const name of fs.readdirSync(campaignDir)) {
      const db = path.join(campaignDir, name, "db.xml");
      if (fs.existsSync(db)) found.push([name, mtime(db)]);
    }
  }
  found.sort((a, b) => b[1] - a[1]);
  for (const [name] of found) campaigns.push({ kind: "campaign", key: name, name });
  const moduleDir = path.join(data, "modules");
  if (isDir(moduleDir)) {
    for (const entry of fs.readdirSync(moduleDir)) {
      const full = path.join(moduleDir, entry);
      const isMod = py.pathSuffix(entry).toLowerCase() === ".mod";
      if (!(isDir(full) || isMod)) continue;
      let source;
      try {
        source = new Source("module", entry, options);
      } catch (error) {
        if (error instanceof BadZipFile || error.code) continue; // OSError, BadZipFile
        if (isMod) locked += 1;
        continue;
      }
      let name;
      try {
        name = source.label();
      } catch {
        name = py.pathStem(entry);
      }
      modules.push({ kind: "module", key: entry, name });
    }
  }
  modules.sort((a, b) => {
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const vaultDir = path.join(data, "vault");
  // pathlib's glob is case-insensitive on Windows.
  const vault = isDir(vaultDir)
    ? fs.readdirSync(vaultDir).filter((n) => (process.platform === "win32" ? n.toLowerCase() : n).endsWith(".dat")).length
    : 0;
  return { dataFolder: data, campaigns, modules, vaultPacks: vault, encryptedModules: locked };
}

// --- finding map records -----------------------------------------------------

function _encoding(raw) {
  return declaredEncoding(raw);
}

// Every <image type="image"> element with its byte span and record name.
function scanRecords(raw) {
  const stack = [];
  const found = [];
  parseEvents(raw, _encoding(raw), {
    start(tag, attrs, at) {
      stack.push({ tag, attrs, start: at, text: [], name: null });
    },
    end(tag, at) {
      const node = stack.pop();
      if (tag === "name" && stack.length && stack[stack.length - 1].name === null) stack[stack.length - 1].name = node.text.join("").trim();
      if (tag === "image" && node.attrs.type === "image" && stack.length >= 2) {
        const close = raw.indexOf(0x3e, at) + 1;
        const recordPath = stack.slice(1).map((s) => s.tag + (s.tag === "category" && has(s.attrs, "name") ? `[${s.attrs.name}]` : ""));
        found.push({ start: node.start, end: close, path: recordPath, record: stack[stack.length - 1] });
      }
    },
    text(data) {
      if (stack.length) stack[stack.length - 1].text.push(data);
    },
  });
  const counts = new Map();
  for (const item of found) {
    const key = item.path.join("/");
    item.n = counts.get(key) ?? 0;
    counts.set(key, item.n + 1);
    item.name = item.record.name || item.path[item.path.length - 1];
    delete item.record;
  }
  return found;
}

function _fragment(raw, item) {
  return fromString(decodeBytes(raw, _encoding(raw), item.start, item.end));
}

function _layers(img) {
  const holder = img.find("layers");
  return holder !== null ? [...holder.children] : [];
}

function _isMap(img) {
  if (img.find("gridsize") !== null || img.findtext("grid") === "on") return true;
  const layers = _layers(img);
  return layers.length > 1 || layers.some((l) => l.find("occluders") !== null || l.find("lights") !== null);
}

const _SCAN_CACHE = new Map();

function _records(source, name) {
  const key = JSON.stringify([source.dataFolder, source.kind, source.key, name, source.stamp()]);
  if (!_SCAN_CACHE.has(key)) {
    const raw = source.read(name);
    _SCAN_CACHE.clear();
    _SCAN_CACHE.set(key, [raw, scanRecords(raw)]);
  }
  return _SCAN_CACHE.get(key);
}

function listMaps(kind, key, includePictures = false, options = {}) {
  const source = new Source(kind, key, options);
  const maps = [];
  for (const name of source.xmlFiles()) {
    const [raw, items] = _records(source, name);
    for (const item of items) {
      const img = _fragment(raw, item);
      if (!_layers(img).length) continue;
      const isMap = _isMap(img);
      if (isMap || includePictures) maps.push({ file: name, path: item.path, n: item.n, name: item.name, map: isMap });
    }
  }
  maps.sort((a, b) => {
    if (a.map !== b.map) return a.map ? -1 : 1;
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return maps;
}

function _find(source, file, recordPath, n) {
  if (!source.xmlFiles().includes(file)) throw new Error("Map file not found.");
  const [raw, items] = _records(source, file);
  const wanted = JSON.stringify([...recordPath]);
  for (const item of items) if (JSON.stringify(item.path) === wanted && item.n === n) return [raw, item];
  throw new Error("That map is no longer in its campaign or module.");
}

// --- artwork -------------------------------------------------------------------

// Resolves an FG bitmap reference; null when it is unreadable (vault, missing).
function bitmapBytes(ref, source) {
  try {
    if (ref.includes("@")) {
      const at = ref.indexOf("@");
      const entry = ref.slice(0, at);
      const other = moduleByName(ref.slice(at + 1).replace(/^@+|@+$/g, ""), source.options);
      return other ? other.read(entry) : null;
    }
    if (ref.startsWith("campaign/")) {
      if (source.kind !== "campaign") return null;
      return fs.readFileSync(path.join(source.path, _safeEntry(ref.slice("campaign/".length))));
    }
    if (source.kind === "module") return source.read(ref);
    const file = path.join(source.dataFolder, _safeEntry(ref));
    return isFile(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

// The formats both Pillow and sharp read (sharp also reads SVG, which Pillow
// does not, so an SVG stays unreadable art as it was in Map Studio).
const PICTURE_FORMATS = new Set(["jpeg", "png", "webp", "gif", "tiff"]);

// A picture's size as Pillow's Image.open reports it, or null when it cannot be read.
async function imageSize(data) {
  if (!data || !data.length) return null;
  try {
    const meta = await require("sharp")(data).metadata();
    if (!PICTURE_FORMATS.has(meta.format) || !meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS) return null;
    return [meta.width, meta.height, meta.format];
  } catch {
    return null;
  }
}

// Pillow's thumbnail((w, h)) box: the aspect kept, each side rounded the way
// Pillow rounds it; null when the picture already fits.
function thumbnailSize(width, height, boxW, boxH) {
  if (boxW >= width && boxH >= height) return null;
  const aspect = width / height;
  const roundAspect = (value, key) => {
    const a = Math.floor(value);
    const b = Math.ceil(value);
    return Math.max(key(b) < key(a) ? b : a, 1);
  };
  let x = boxW;
  let y = boxH;
  if (x / y >= aspect) x = roundAspect(y * aspect, (n) => Math.abs(aspect - n / y));
  else y = roundAspect(x / aspect, (n) => (n === 0 ? 0 : Math.abs(aspect - x / n)));
  return [x, y];
}

async function mapThumbnail(kind, key, file, recordPath, n, options = {}) {
  const sharp = require("sharp");
  const source = new Source(kind, key, options);
  const [raw, item] = _find(source, file, recordPath, n);
  const img = _fragment(raw, item);
  for (const layer of _stack(img).reverse()) {
    if (layer.findtext("type") !== "image") continue;
    const data = bitmapBytes(layer.findtext("bitmap") || "", source);
    if (!data) continue;
    const size = await imageSize(data);
    if (!size) throw new Error("cannot identify image file");
    let [w, h] = size;
    // Pillow's draft() first decodes a JPEG at 1/2, 1/4 or 1/8 while it stays at least 480 x 480.
    if (size[2] === "jpeg") {
      const ratio = Math.min(Math.floor(w / 480), Math.floor(h / 480));
      const scale = ratio >= 8 ? 8 : ratio >= 4 ? 4 : ratio >= 2 ? 2 : 1;
      w = Math.floor((w + scale - 1) / scale);
      h = Math.floor((h + scale - 1) / scale);
    }
    const box = thumbnailSize(w, h, 240, 180);
    let pipeline = sharp(data);
    pipeline = box ? pipeline.resize(box[0], box[1], { fit: "fill" }) : w !== size[0] ? pipeline.resize(w, h, { fit: "fill" }) : pipeline;
    return pipeline.removeAlpha().toColourspace("srgb").webp({ quality: 75 }).toBuffer();
  }
  throw new Error("No readable artwork in this map.");
}

// --- geometry ------------------------------------------------------------------

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function _matrix(layer) {
  const text = layer.findtext("matrix");
  if (text) {
    try {
      const values = text.split(",").map(py.float);
      if (values.length === 16) return values;
    } catch {
      // not a matrix FG wrote: the identity
    }
  }
  return [...IDENTITY];
}

function _toWorld(m, u, v) {
  return [u * m[0] + v * m[4] + m[12], u * m[1] + v * m[5] + m[13]];
}

function _points(text) {
  let values;
  try {
    values = (text || "").split(",").filter((v) => v.trim()).map(py.float);
  } catch {
    return [];
  }
  const out = [];
  for (let i = 0; i + 1 < values.length; i += 2) out.push([values[i], values[i + 1]]);
  return out;
}

function _flags(element) {
  return element.children.map((c) => c.tag).filter((t) => !WALL_DATA.includes(t));
}

function _int(value, fallback) {
  try {
    const n = Math.trunc(py.float(value));
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

// Layers from top to bottom (top-level by parentid position, children after).
function _stack(img) {
  const layers = _layers(img);
  const top = layers.filter((l) => _int(l.findtext("parentid"), -1) < 0);
  top.sort((a, b) => -_int(a.findtext("parentid"), -1) - -_int(b.findtext("parentid"), -1));
  const byParent = new Map();
  for (const l of layers) {
    const pid = _int(l.findtext("parentid"), -1);
    if (pid >= 0) {
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(l);
    }
  }
  const ordered = [];
  const seen = new Set();
  const walk = (layer) => {
    ordered.push(layer);
    seen.add(layer);
    for (const child of byParent.get(_int(layer.findtext("id"), -999)) || []) walk(child);
  };
  for (const layer of top) walk(layer);
  return ordered.concat(layers.filter((l) => !seen.has(l)));
}

function _number(text) {
  try {
    return text !== null && text !== undefined && Number.isFinite(py.float(text));
  } catch {
    return false;
  }
}

// --- opening a map -------------------------------------------------------------

// Builds a Map Studio project from an FG map. registerAsset(source, ref, name,
// data, [w, h]) -> asset id. Picture sizes come from sharp where the Python used
// Pillow: the same for PNG, JPEG, WebP, GIF and TIFF (what FG maps use); a
// format only Pillow reads (BMP, TGA) counts as unreadable art and stays an
// FG-only layer, as unreadable art always did.
async function openMap(kind, key, file, recordPath, n, registerAsset, fxSettings, fxBlur, options = {}) {
  const source = new Source(kind, key, options);
  const [raw, item] = _find(source, file, recordPath, n);
  const img = _fragment(raw, item);
  const grid = Math.min(1000, Math.max(5, _int((img.findtext("gridsize") || "50").split(",")[0], 50)));

  const readable = [];
  const holders = [];
  let skipped = 0;
  for (const layer of _stack(img).reverse()) {
    // bottom to top = editor order
    if (layer.findtext("type") !== "image") continue;
    const ref = (layer.findtext("bitmap") || "").trim();
    if (!ref) {
      holders.push(layer); // an art-less layer that only carries walls and lights
      continue;
    }
    const data = bitmapBytes(ref, source);
    const size = await imageSize(data);
    if (!size) {
      skipped += 1; // unreadable art (vault pack, missing, odd format) stays an FG-only layer
      continue;
    }
    readable.push([layer, ref, data, [size[0], size[1]]]);
  }

  let xs = [];
  let ys = [];
  for (const [layer, , , [w, h]] of readable) {
    const m = _matrix(layer);
    for (const [u, v] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
      const [x, y] = _toWorld(m, u, v);
      xs.push(x);
      ys.push(y);
    }
  }
  if (!xs.length) {
    xs = [-800, 800];
    ys = [-500, 500];
  }
  const ox = Math.floor(Math.min(...xs));
  const oy = Math.ceil(Math.max(...ys));
  const width = Math.max(100, Math.ceil(Math.max(...xs)) - ox);
  const height = Math.max(100, oy - Math.floor(Math.min(...ys)));
  if (width > 16384 || height > 16384 || width * height > 120_000_000) {
    throw new Error(`This map is ${width} x ${height} pixels, larger than Map Studio can edit (16384 per side).`);
  }

  const projectXY = (x, y) => [x - ox, oy - y];
  const objects = [];
  const walls = [];
  const lights = [];
  const effects = [];
  const converted = [];

  const extract = (layer, lid, m) => {
    for (const occ of layer.iter("occluder")) {
      const pts = _points(occ.findtext("points")).map(([u, v]) => projectXY(..._toWorld(m, u, v)));
      if (pts.length < 2) continue;
      const flags = _flags(occ);
      const known = flags.filter((f) => occTypes.FLAGS.includes(f));
      const oid = occ.findtext("id");
      walls.push({
        id: `fg-wall-${lid}-${py.str(oid)}`,
        type: occTypes.typeFromFlags(known),
        points: pts.flat(),
        flags: known,
        extraFlags: flags.filter((f) => !occTypes.FLAGS.includes(f)),
        fgLayer: lid,
        fgOcc: oid,
      });
    }
    for (const light of layer.iter("light")) {
      const position = _points(light.findtext("position"));
      const [x, y] = projectXY(..._toWorld(m, ...(position.length ? position : [[0, 0]])[0]));
      lights.push({ id: `fg-light-${lid}-${py.str(light.findtext("id"))}`, x, y, fgLayer: lid, fgLight: light.findtext("id"), ...lighting.readFgLight(light) });
    }
  };

  for (const [layer, ref, data, [w, h]] of readable) {
    const lid = _int(layer.findtext("id"), -1);
    const m = _matrix(layer);
    const sx = Math.hypot(m[0], m[1]) || 1;
    const sy = Math.hypot(m[4], m[5]) || 1;
    const [cx, cy] = projectXY(m[12], m[13]);
    const name = py.slice(layer.findtext("name") || py.pathStem(ref.split("@")[0]), 120);
    const assetId = await registerAsset(source, ref, name, data, [w, h]);
    objects.push({
      id: `fg-layer-${lid}`,
      assetId,
      name,
      x: cx - (w * sx) / 2,
      y: cy - (h * sy) / 2,
      width: w * sx,
      height: h * sy,
      rotation: -(Math.atan2(m[1], m[0]) * py.RAD_TO_DEG),
      visible: layer.find("invisible") === null,
      fgLayer: lid,
    });
    converted.push(lid);
    extract(layer, lid, m);
  }
  const holderIds = [];
  for (const layer of holders) {
    const lid = _int(layer.findtext("id"), -1);
    holderIds.push(lid);
    extract(layer, lid, _matrix(layer));
  }

  for (const layer of _stack(img).reverse()) {
    if (layer.findtext("type") !== "fx") continue;
    const fx = layer.find("fx");
    const fxKind = fx !== null ? fx.findtext("type") : null;
    if (!EFFECT_TYPES.includes(fxKind) || layer.find("matrix") !== null) continue;
    const mask = fx.find("mask");
    const polys = mask !== null ? mask.findall("points").map((e) => _points(e.text)) : [];
    let outlines = null;
    let emask = null;
    if (mask !== null && fx.find("usemask") !== null) {
      // Any FG mask: its outlines, filled even-odd, become the effect's shown area.
      outlines = polys.filter((poly) => poly.length >= 3).map((poly) => poly.flatMap((q) => projectXY(q[0], q[1])));
      emask = outlines.length ? { base: "none", ops: [{ op: "show", shape: "paths", paths: outlines }] } : { base: "none", ops: [] };
    }
    const settings = {};
    for (const k of Object.keys(fxSettings[fxKind] || {})) if (_number(fx.findtext(k))) settings[k] = py.float(fx.findtext(k));
    if (_number(fx.findtext(fxBlur))) settings[fxBlur] = py.float(fx.findtext(fxBlur));
    const lid = _int(layer.findtext("id"), -1);
    let rect;
    if (outlines && outlines.length) {
      const exs = outlines.flatMap((q) => q.filter((_, i) => i % 2 === 0));
      const eys = outlines.flatMap((q) => q.filter((_, i) => i % 2 === 1));
      rect = [Math.min(...exs), Math.min(...eys), Math.max(...exs) - Math.min(...exs), Math.max(...eys) - Math.min(...eys)];
    } else rect = [0, 0, width, height];
    effects.push({
      id: `fg-fx-${lid}`,
      type: fxKind,
      name: layer.findtext("name") || py.title(fxKind),
      x: rect[0],
      y: rect[1],
      width: Math.max(1, rect[2]),
      height: Math.max(1, rect[3]),
      settings,
      fgLayer: lid,
      mask: emask,
      polygons: outlines,
      ...(layer.find("invisible") !== null ? { visible: false } : {}),
    });
    converted.push(lid);
  }

  const kept = {};
  for (const layer of _layers(img)) {
    const lid = _int(layer.findtext("id"), -1);
    if (!converted.includes(lid) && !holderIds.includes(lid)) {
      const t = layer.findtext("type") || "other";
      kept[t] = (kept[t] ?? 0) + 1;
    }
  }
  const recordName = item.name;
  const peek = _number(img.findtext("peekthru")) ? py.float(img.findtext("peekthru")) : 0;
  // FG's gridoffset is a point on a grid line, from the image centre with Y pointing down.
  let gx = 0;
  let gy = 0;
  try {
    const parts = (img.findtext("gridoffset") || "0,0").split(",").slice(0, 2);
    if (parts.length < 2) throw new Error("not enough values to unpack");
    [gx, gy] = parts.map(py.float);
  } catch {
    gx = 0;
    gy = 0;
  }
  const gridOff = { x: py.roundTo(py.mod(gx - ox, grid), 3), y: py.roundTo(py.mod(oy + gy, grid), 3) };
  const ambient = lighting.readFgAmbient(img);
  return {
    version: 1,
    name: py.slice(recordName, 120),
    width,
    height,
    grid,
    peek,
    gridOffset: gridOff,
    fgGrid: { grid, ...gridOff },
    background: "#000000",
    objects,
    walls,
    lights,
    effects,
    exportLayers: true,
    ...(ambient ? { ambient } : {}),
    fgSource: { kind, key, file, path: [...recordPath], n, sourceName: source.label(), recordName, grid },
    fgOrigin: [ox, oy],
    fgImage: toString(img),
    fgConverted: converted,
    fgHolders: holderIds,
    fgKept: kept,
    fgUnreadableArt: skipped,
  };
}

module.exports = {
  EFFECT_TYPES,
  WALL_DATA,
  BadZipFile,
  dataFolder,
  Source,
  moduleByName,
  listSources,
  scanRecords,
  listMaps,
  bitmapBytes,
  mapThumbnail,
  openMap,
  // Exposed for tests and the router's own use.
  _matrix,
  _toWorld,
  _stack,
  zipInfos,
  zipRead,
  thumbnailSize,
};
