const fs = require("fs");
const path = require("path");

// The GM's portraits and tokens, where FG keeps them: the data folder's
// portraits/ and tokens/, and each campaign's own portraits/ and tokens/.
// The host serves them to the table by id (a path inside the data folder),
// so players pick from the GM's collection; nothing is copied.

const KINDS = ["portrait", "token"];
const IMAGE = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webm": "video/webm" };
const MAX_FILES = 5000;

function defaultRoots(dataFolder) {
  const roots = [
    { dir: path.join(dataFolder, "portraits"), kind: "portrait", group: "Portraits" },
    { dir: path.join(dataFolder, "tokens"), kind: "token", group: "Tokens" },
  ];
  let campaigns = [];
  try {
    campaigns = fs.readdirSync(path.join(dataFolder, "campaigns"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    /* no campaigns folder */
  }
  for (const campaign of campaigns) {
    for (const kind of KINDS) {
      roots.push({ dir: path.join(dataFolder, "campaigns", campaign.name, `${kind}s`), kind, group: campaign.name });
    }
  }
  return roots;
}

// base: the folder ids are relative to. roots: [{ dir, kind, group }].
function createArtLibrary({ base, roots }) {
  const root = path.resolve(base);
  let index = null;
  let indexedAt = 0;

  function walk(dir, depth, out) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) walk(full, depth + 1, out);
      else if (entry.isFile() && IMAGE[path.extname(entry.name).toLowerCase()]) out.push(full);
    }
  }

  function scan() {
    if (index && Date.now() - indexedAt < 30000) return index;
    const items = new Map();
    for (const { dir, kind, group } of roots) {
      const files = [];
      walk(dir, 0, files);
      for (const file of files) {
        const id = path.relative(root, file).split(path.sep).join("/");
        if (id.startsWith("..") || items.has(id)) continue;
        const ext = path.extname(file).toLowerCase();
        items.set(id, { id, kind, group, name: path.basename(file, path.extname(file)), video: ext === ".webm", file, mime: IMAGE[ext] });
      }
    }
    index = items;
    indexedAt = Date.now();
    return index;
  }

  return {
    // What the pickers show, newest scan at most 30 seconds old.
    list(kind) {
      return [...scan().values()]
        .filter((item) => !kind || item.kind === kind)
        .map(({ id, kind: itemKind, group, name, video }) => ({ id, kind: itemKind, group, name, video }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    },
    // Only files the scan found are served: an id is never a free path.
    file(id) {
      const item = scan().get(String(id));
      return item ? { path: item.file, mime: item.mime } : null;
    },
    has: (id) => scan().has(String(id)),
  };
}

module.exports = { createArtLibrary, defaultRoots };
