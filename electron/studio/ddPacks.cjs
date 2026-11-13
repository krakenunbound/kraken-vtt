const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Dungeondraft asset packs as Map Studio artwork (a port of Map Studio's dd_packs.py).
//
// A .dungeondraft_pack is a Godot PCK: a file table followed by the files stored
// as they are, with the art as ordinary WebP/PNG under
// res://packs/<id>/textures/<kind>/... and the pack's name in pack.json.
// Dungeondraft draws 256 pixels per 5-ft square, so that is each asset's grid
// size. Packs are indexed in the background (only their tables are read) and
// their art is listed when a pack is opened in the library.
//
// The folders searched come from the caller (Kraken's option) or from
// KRAKEN_DD_FOLDERS (";"-separated). There is no default: packs live wherever
// the GM keeps them, and Kraken never guesses a path.

const GRID = 256;
const IMAGE_EXT = [".png", ".webp", ".jpg", ".jpeg"];
// Dungeondraft texture folders that make sense as map art, and how to use them.
const KINDS = {
  objects: "tile",
  terrain: "background",
  tilesets: "background",
  paths: "tile",
  walls: "tile",
  portals: "tile",
  caves: "background",
  materials: "background",
  roofs: "tile",
  patterns: "background",
  lights: "tile",
};
const MAX_FILES = 500000;

// The folders to search: the ones given, else KRAKEN_DD_FOLDERS; only those that exist.
function folders(list) {
  const listed = Array.isArray(list) && list.length ? list : String(process.env.KRAKEN_DD_FOLDERS || "").split(";");
  return listed
    .map((folder) => String(folder || "").trim())
    .filter((folder) => {
      try {
        return folder && fs.statSync(folder).isDirectory();
      } catch {
        return false;
      }
    });
}

// Reads a file in chunks so a big pack's table is parsed without loading the pack.
class ChunkReader {
  constructor(handle) {
    this.handle = handle;
    this.buffer = Buffer.alloc(0);
    this.start = 0; // file position of buffer[0]
    this.pos = 0; // read position in the file
  }

  async need(n) {
    const have = this.start + this.buffer.length - this.pos;
    if (have >= n) return;
    const want = Math.max(n - have, 256 * 1024);
    const chunk = Buffer.alloc(want);
    const { bytesRead } = await this.handle.read(chunk, 0, want, this.start + this.buffer.length);
    this.buffer = Buffer.concat([this.buffer.subarray(this.pos - this.start), chunk.subarray(0, bytesRead)]);
    this.start = this.pos;
    if (this.start + this.buffer.length - this.pos < n) throw new Error("Damaged pack.");
  }

  async take(n) {
    await this.need(n);
    const out = this.buffer.subarray(this.pos - this.start, this.pos - this.start + n);
    this.pos += n;
    return out;
  }
}

// [res path, offset, size] for every file in a Godot PCK (format 1, or 2 when not encrypted).
async function readTable(file) {
  const handle = await fs.promises.open(file, "r");
  try {
    const r = new ChunkReader(handle);
    const head = await r.take(20);
    if (head.toString("latin1", 0, 4) !== "GDPC") throw new Error("Not a Dungeondraft pack.");
    const format = head.readUInt32LE(4);
    let base = 0;
    if (format >= 2) {
      const extra = await r.take(12);
      if (extra.readUInt32LE(0) & 1) throw new Error("Encrypted pack.");
      base = Number(extra.readBigUInt64LE(4));
    }
    await r.take(64);
    const count = (await r.take(4)).readUInt32LE(0);
    if (count > MAX_FILES) throw new Error("Damaged pack.");
    const table = [];
    for (let i = 0; i < count; i++) {
      const n = (await r.take(4)).readUInt32LE(0);
      // Godot pads names with NULs to a multiple of four.
      const name = (await r.take(n)).toString("utf8").replace(/\0+$/, "");
      const where = await r.take(16);
      const offset = Number(where.readBigUInt64LE(0));
      const size = Number(where.readBigUInt64LE(8));
      await r.take(16); // MD5
      if (format >= 2) await r.take(4); // flags
      table.push([name, base + offset, size]);
    }
    return table;
  } finally {
    await handle.close();
  }
}

async function readSlice(file, offset, size) {
  const handle = await fs.promises.open(file, "r");
  try {
    const out = Buffer.alloc(size);
    const { bytesRead } = await handle.read(out, 0, size, offset);
    return out.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const isImage = (name) => IMAGE_EXT.some((ext) => name.toLowerCase().endsWith(ext));

function sha1(text, length) {
  return crypto.createHash("sha1").update(text, "utf8").digest("hex").slice(0, length);
}

// What the library shows for a pack: its id (or a hash of where it is), name and picture count.
async function packInfo(file) {
  const table = await readTable(file);
  const meta = table.find(([name]) => name.endsWith("/pack.json"));
  let name = path.parse(file).name;
  let packId = null;
  if (meta) {
    try {
      const data = JSON.parse((await readSlice(file, meta[1], meta[2])).toString("utf8"));
      name = data.name || name;
      packId = data.id || null;
    } catch {
      /* a pack.json that does not parse keeps the file's name */
    }
  }
  const images = table.filter(([entry]) => entry.includes("/textures/") && isImage(entry)).length;
  if (!images) return null;
  return { key: packId || sha1(file, 12), name: String(name), path: file, images };
}

// One scanner per studio server: the packs found so far and the scan's progress.
function createScanner({ folders: list } = {}) {
  const state = { packs: new Map(), scanning: false, done: false, scanned: 0, folders: [] };
  let running = null;

  async function walk(dir, found) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, found);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".dungeondraft_pack")) await found(full);
    }
  }

  async function scan(roots) {
    for (const root of roots) {
      await walk(root, async (file) => {
        let info = null;
        try {
          info = await packInfo(file);
        } catch {
          info = null;
        }
        state.scanned += 1;
        // The same pack is often stored twice; keep one copy per pack id.
        if (info && !state.packs.has(info.key)) state.packs.set(info.key, info);
      });
    }
    state.scanning = false;
    state.done = true;
  }

  // Starts the background scan once; the promise is there for tests to wait on.
  function start() {
    if (running) return running;
    const roots = folders(list);
    state.scanning = true;
    state.folders = roots;
    running = scan(roots).catch(() => {
      state.scanning = false;
      state.done = true;
    });
    return running;
  }

  function listPacks() {
    start();
    const packs = [...state.packs.values()].sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
    return {
      packs: packs.map(({ key, name, images }) => ({ key, name, images })),
      scanning: state.scanning,
      scanned: state.scanned,
      folders: state.folders,
    };
  }

  // Asset records for every texture in one pack (not yet registered): [pack name, assets].
  async function packAssets(key) {
    const info = state.packs.get(key);
    if (!info) throw new Error("Dungeondraft pack not found (still scanning?).");
    const assets = [];
    for (const [name, offset, size] of await readTable(info.path)) {
      if (!name.includes("/textures/") || !isImage(name)) continue;
      const parts = name.split("/textures/").slice(1).join("/textures/").split("/");
      const kind = parts[0].toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) continue;
      const stem = path.posix.parse(parts[parts.length - 1]).name;
      assets.push({
        id: "dd" + sha1(`${info.key}|${name}`, 22),
        name: Array.from(stem).slice(0, 120).join(""),
        category: `DD: ${info.name}`,
        ddPack: info.path,
        ddOffset: offset,
        ddSize: size,
        ddEntry: name,
        gridSize: GRID,
        sourcePack: "Dungeondraft",
        tags: ["Dungeondraft", info.name, kind, ...parts.slice(1, -1)],
        assetType: KINDS[kind],
      });
    }
    return [info.name, assets];
  }

  return { start, listPacks, packAssets, state };
}

module.exports = { GRID, IMAGE_EXT, KINDS, folders, readTable, readSlice, packInfo, createScanner };
