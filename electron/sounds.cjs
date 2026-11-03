const fs = require("fs");
const path = require("path");

// The GM's sounds, in Kraken's assets folder (assets/sounds in the app's
// data), by kind and then by folder, as Syrinscape's sets are:
//   oneshots/   short sounds the GM plays by hand (a door, a chest, a scream)
//   sfx/        sound effects the chat sets off (sfx/Weapons/Sword/Hit/...)
//   ambience/   loops that play under the game (ambience/Forest at Night/...)
//   music/      music
// A folder is a group: playing it picks one of its sounds at random, so a
// sword hit is not the same every time. Ids are paths inside the folder,
// only ever looked up in the index.
// builtin: Kraken's own sounds (made with ElevenLabs, shipped with the app),
// in the same layout; a sound of the GM's with the same path wins.

const KINDS = ["oneshots", "sfx", "ambience", "music"];
const AUDIO = { ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".webm": "audio/webm", ".flac": "audio/flac", ".opus": "audio/ogg" };
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 20000;

const mimeOf = (name) => AUDIO[path.extname(name).toLowerCase()] ?? null;
const prettyName = (file) => path.basename(file, path.extname(file)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

function createSoundLibrary({ folder, builtin = "" }) {
  let index = null;
  let indexedAt = 0;

  function scan() {
    if (index && Date.now() - indexedAt < 10000) return index;
    const items = new Map();
    const walk = (root, dir, depth) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (items.size >= MAX_FILES) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && depth < 6) walk(root, full, depth + 1);
        else if (entry.isFile() && mimeOf(entry.name)) {
          const id = path.relative(root, full).split(path.sep).join("/");
          const [kind, ...rest] = id.split("/");
          if (!KINDS.includes(kind) || rest.length === 0) continue;
          items.set(id, { id, kind, group: rest.slice(0, -1).join("/"), name: prettyName(entry.name), file: full, mime: mimeOf(entry.name) });
        }
      }
    };
    if (builtin) walk(builtin, builtin, 0);
    walk(folder, folder, 0);
    index = items;
    indexedAt = Date.now();
    return index;
  }

  return {
    folder,
    kinds: KINDS,
    list(kind) {
      return [...scan().values()]
        .filter((item) => !kind || item.kind === kind)
        .map(({ id, kind: itemKind, group, name }) => ({ id, kind: itemKind, group, name }))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    },
    // The groups (folders) of a kind, with how many sounds each has.
    groups(kind) {
      const counts = new Map();
      for (const item of scan().values()) if (!kind || item.kind === kind) counts.set(`${item.kind}/${item.group}`, (counts.get(`${item.kind}/${item.group}`) ?? 0) + 1);
      return [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id));
    },
    has: (id) => scan().has(String(id)),
    // A sound by id, or one at random from a group ("sfx/Weapons/Sword/Hit"),
    // or from anything under it ("sfx/Weapons/Sword").
    pick(idOrGroup) {
      const wanted = String(idOrGroup ?? "").replace(/\/+$/, "");
      const all = scan();
      if (all.has(wanted)) return all.get(wanted);
      const inside = [...all.values()].filter((item) => `${item.kind}/${item.group}` === wanted || `${item.kind}/${item.group}`.startsWith(`${wanted}/`));
      return inside.length ? inside[Math.floor(Math.random() * inside.length)] : null;
    },
    file(id) {
      const item = scan().get(String(id));
      return item ? { path: item.file, mime: item.mime } : null;
    },
    // A sound file from anywhere, copied into a kind and group.
    add(kind, group, name, bytes) {
      if (!KINDS.includes(kind)) throw new Error(`A sound is one of: ${KINDS.join(", ")}.`);
      if (!mimeOf(String(name))) throw new Error("A sound is an .mp3, .ogg, .wav, .m4a, .webm or .flac file.");
      const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      if (data.length === 0 || data.length > MAX_BYTES) throw new Error("That sound is empty or larger than 200 MB.");
      const parts = String(group ?? "").split(/[\\/]+/).map((part) => part.replace(/[^\w .()&'-]+/g, "_").trim()).filter((part) => part && part !== "." && part !== "..");
      const dir = path.join(folder, kind, ...parts);
      fs.mkdirSync(dir, { recursive: true });
      let target = path.basename(String(name)).replace(/[^\w .()&'-]+/g, "_");
      for (let n = 2; fs.existsSync(path.join(dir, target)); n++) target = `${path.basename(name, path.extname(name))} (${n})${path.extname(name)}`;
      fs.writeFileSync(path.join(dir, target), data);
      index = null;
      const id = [kind, ...parts, target].join("/");
      return { id, kind, group: parts.join("/"), name: prettyName(target) };
    },
    addFile(kind, group, file) {
      return this.add(kind, group, path.basename(file), fs.readFileSync(file));
    },
  };
}

module.exports = { createSoundLibrary, SOUND_KINDS: KINDS };
