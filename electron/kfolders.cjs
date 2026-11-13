const fs = require("fs");
const os = require("os");
const path = require("path");

// Kraken's folders, where the GM can see them: Documents/Kraken VTT, one
// folder for each kind of thing a GM (or an AI agent working for them) adds
// to Kraken: books (Packs), dice packs, dice towers, GM icons, background
// decals and desktop wallpapers. Each has a README.md saying what goes in it
// and how to make one, for a person and for an AI agent alike (from
// skills/kraken-content/folders, copied in, and brought up to date when
// Kraken is). The root README and AGENTS.md describe them all.
//
// KRAKEN_HOME moves the whole tree (a test's own); without it, a test's
// KRAKEN_PACKS (…/packs) puts the tree beside its packs, so no test ever
// writes into the GM's Documents.

const GUIDES = path.join(__dirname, "..", "skills", "kraken-content", "folders");
const MARK = "<!-- kraken-vtt guide";

// The folders, by what Kraken calls each kind.
const FOLDERS = {
  packs: "Packs",
  dice: "Dice",
  towers: "Dice Towers",
  gmicons: "GM Icons",
  decals: "Background Decals",
  wallpapers: "Wallpapers",
};

function root() {
  if (process.env.KRAKEN_HOME) return process.env.KRAKEN_HOME;
  if (process.env.KRAKEN_PACKS) return path.dirname(process.env.KRAKEN_PACKS);
  return path.join(os.homedir(), "Documents", "Kraken VTT");
}

function folderOf(kind) {
  if (kind === "packs" && process.env.KRAKEN_PACKS) return process.env.KRAKEN_PACKS;
  return path.join(root(), FOLDERS[kind] ?? kind);
}

// A guide is Kraken's when it carries the mark; one the GM wrote over is left alone.
function placeGuide(from, to) {
  try {
    const text = fs.readFileSync(from, "utf8");
    let old = null;
    try {
      old = fs.readFileSync(to, "utf8");
    } catch {
      /* not there yet */
    }
    if (old === text || (old !== null && !old.includes(MARK))) return;
    fs.writeFileSync(to, text);
  } catch {
    /* the folder still works without its guide */
  }
}

// Things that come with a folder the first time it is made (the example dice pack).
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  }
}

let readied = false;
// Makes the tree and its guides; old assets (the app's data folder, before
// these folders) are copied in once, so nothing the GM added is lost.
function ready({ legacy = {} } = {}) {
  if (readied) return root();
  readied = true;
  try {
    const top = root();
    fs.mkdirSync(top, { recursive: true });
    placeGuide(path.join(GUIDES, "README.md"), path.join(top, "README.md"));
    placeGuide(path.join(GUIDES, "..", "SKILL.md"), path.join(top, "AGENTS.md"));
    for (const [kind, name] of Object.entries(FOLDERS)) {
      const folder = folderOf(kind);
      const fresh = !fs.existsSync(folder);
      fs.mkdirSync(folder, { recursive: true });
      placeGuide(path.join(GUIDES, name, "README.md"), path.join(folder, "README.md"));
      const examples = path.join(GUIDES, name, "examples");
      if (fresh && fs.existsSync(examples)) copyTree(examples, folder);
      const old = legacy[kind];
      const moved = path.join(folder, ".kraken-moved");
      if (old && fs.existsSync(old) && !fs.existsSync(moved)) {
        for (const entry of fs.readdirSync(old, { withFileTypes: true })) {
          const target = path.join(folder, entry.name);
          if (entry.isFile() && !fs.existsSync(target)) fs.copyFileSync(path.join(old, entry.name), target);
        }
        fs.writeFileSync(moved, `Kraken copied what was in ${old} here on ${new Date().toISOString()}.\n`);
      }
    }
    return top;
  } catch (error) {
    console.error("could not make Kraken's folders", error);
    return root();
  }
}

module.exports = { root, folderOf, ready, FOLDERS };
