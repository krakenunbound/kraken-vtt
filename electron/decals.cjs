const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { inflateSync } = require("fflate");

// The decals a GM can put on the table's background, as FG's Background Decal:
//   kraken/<file>  Kraken's own, made for it (public/decals, built into dist);
//   lib/<file>     Kraken's own assets folder (assets/decals in the app's
//                  data), where an image the GM picks is copied, so every
//                  campaign can use it from then on;
//   fg/<file>      the FG data folder's decals/;
//   pack/<n>/<entry> decals in FG's vault packs (zips), read in place. Most
//                  vault packs are encrypted by SmiteWorks; those entries are
//                  left alone, never decrypted.
// "kraken" (the Kraken emblem) and "" (no decal) are the table's own and need
// no file. Ids are only ever looked up in the index, never used as paths.

const IMAGE = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };
const MAX_BYTES = 30 * 1024 * 1024;

const rank = (group) => (group === "Kraken assets" ? 0 : group === "Kraken" ? 1 : 2);

function mimeOf(name) {
  return IMAGE[path.extname(name).toLowerCase()] ?? null;
}

function prettyName(file) {
  return path.basename(file, path.extname(file)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

// A zip's table of contents (the central directory), so one entry can be
// read without unpacking the rest.
function zipEntries(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailSize = Math.min(size, 65557);
    const tail = Buffer.alloc(tailSize);
    fs.readSync(fd, tail, 0, tailSize, size - tailSize);
    let end = -1;
    for (let at = tailSize - 22; at >= 0; at--) {
      if (tail.readUInt32LE(at) === 0x06054b50) {
        end = at;
        break;
      }
    }
    if (end < 0) return [];
    const count = tail.readUInt16LE(end + 10);
    const dirSize = tail.readUInt32LE(end + 12);
    const dirAt = tail.readUInt32LE(end + 16);
    const dir = Buffer.alloc(dirSize);
    fs.readSync(fd, dir, 0, dirSize, dirAt);
    const entries = [];
    let at = 0;
    for (let index = 0; index < count && at + 46 <= dir.length; index++) {
      if (dir.readUInt32LE(at) !== 0x02014b50) break;
      const flags = dir.readUInt16LE(at + 8);
      const method = dir.readUInt16LE(at + 10);
      const packed = dir.readUInt32LE(at + 20);
      const unpacked = dir.readUInt32LE(at + 24);
      const nameLength = dir.readUInt16LE(at + 28);
      const extraLength = dir.readUInt16LE(at + 30);
      const commentLength = dir.readUInt16LE(at + 32);
      const offset = dir.readUInt32LE(at + 42);
      const name = dir.toString("utf8", at + 46, at + 46 + nameLength);
      entries.push({ name, method, packed, unpacked, offset, encrypted: (flags & 1) === 1 });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

function zipRead(file, entry) {
  if (entry.encrypted || entry.unpacked > MAX_BYTES) return null;
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(30);
    fs.readSync(fd, head, 0, 30, entry.offset);
    if (head.readUInt32LE(0) !== 0x04034b50) return null;
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const data = Buffer.alloc(entry.packed);
    fs.readSync(fd, data, 0, entry.packed, start);
    if (entry.method === 0) return data;
    if (entry.method === 8) return Buffer.from(inflateSync(data));
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

// folder: Kraken's assets folder for decals. builtin: Kraken's own decals.
// fgData: FG's data folder (or "").
function createDecalLibrary({ folder, builtin = "", fgData = "" }) {
  let index = null;
  let indexedAt = 0;

  function filesIn(dir) {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && mimeOf(entry.name))
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  function scan() {
    if (index && Date.now() - indexedAt < 15000) return index;
    const items = new Map();
    if (builtin) for (const name of filesIn(builtin)) items.set(`kraken/${name}`, { id: `kraken/${name}`, name: prettyName(name), group: "Kraken", file: path.join(builtin, name), mime: mimeOf(name) });
    for (const name of filesIn(folder)) items.set(`lib/${name}`, { id: `lib/${name}`, name: prettyName(name), group: "Kraken assets", file: path.join(folder, name), mime: mimeOf(name) });
    if (fgData) {
      const fgDecals = path.join(fgData, "decals");
      for (const name of filesIn(fgDecals)) items.set(`fg/${name}`, { id: `fg/${name}`, name: prettyName(name), group: "Fantasy Grounds", file: path.join(fgDecals, name), mime: mimeOf(name) });
      const vault = path.join(fgData, "vault");
      let packs = [];
      try {
        packs = fs.readdirSync(vault).filter((name) => /\.(dat|zip|mod)$/i.test(name));
      } catch {
        /* no vault */
      }
      for (const pack of packs) {
        const file = path.join(vault, pack);
        let entries;
        try {
          entries = zipEntries(file);
        } catch {
          continue;
        }
        for (const entry of entries) {
          const match = /^modules\/([^/]+)\/images\/decals\/(.+)$/i.exec(entry.name);
          if (!match || entry.encrypted || !mimeOf(entry.name) || entry.name.endsWith("/")) continue;
          const id = `pack/${pack}/${entry.name}`;
          items.set(id, { id, name: prettyName(match[2]), group: match[1], pack: file, entry, mime: mimeOf(entry.name) });
        }
      }
    }
    index = items;
    indexedAt = Date.now();
    return index;
  }

  return {
    folder,
    list() {
      return [...scan().values()]
        .map(({ id, name, group }) => ({ id, name, group }))
        .sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    },
    has: (id) => id === "" || id === "kraken" || scan().has(String(id)),
    // The image's bytes and type, or null.
    file(id) {
      const item = scan().get(String(id));
      if (!item) return null;
      try {
        if (item.pack) {
          const bytes = zipRead(item.pack, item.entry);
          return bytes ? { bytes, mime: item.mime } : null;
        }
        const stat = fs.statSync(item.file);
        if (stat.size > MAX_BYTES) return null;
        return { bytes: fs.readFileSync(item.file), mime: item.mime };
      } catch {
        return null;
      }
    },
    // A picture from anywhere on this computer, copied into Kraken's assets
    // (the same picture twice is kept once). Returns its entry.
    add(name, bytes) {
      const mime = mimeOf(String(name));
      if (!mime) throw new Error("A decal is a .png, .webp, .jpg or .gif picture.");
      const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      if (data.length === 0 || data.length > MAX_BYTES) throw new Error("That picture is empty or larger than 30 MB.");
      fs.mkdirSync(folder, { recursive: true });
      const hash = crypto.createHash("sha1").update(data).digest("hex");
      const existing = filesIn(folder).find((file) => {
        try {
          return crypto.createHash("sha1").update(fs.readFileSync(path.join(folder, file))).digest("hex") === hash;
        } catch {
          return false;
        }
      });
      const base = path.basename(String(name)).replace(/[^\w .()&'-]+/g, "_").slice(-120) || `decal${path.extname(String(name))}`;
      let target = existing ?? base;
      for (let n = 2; !existing && fs.existsSync(path.join(folder, target)); n++) target = `${path.basename(base, path.extname(base))} (${n})${path.extname(base)}`;
      if (!existing) fs.writeFileSync(path.join(folder, target), data);
      index = null;
      return { id: `lib/${target}`, name: prettyName(target), group: "Kraken assets" };
    },
    addFile(file) {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("That is not a picture under 30 MB.");
      return this.add(path.basename(file), fs.readFileSync(file));
    },
  };
}

module.exports = { createDecalLibrary, zipEntries };
