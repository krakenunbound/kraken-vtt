const fs = require("fs");
const path = require("path");

// The pictures of the GM's FG character wizards (their own extensions:
// KrakenCharWizard2E, KrakenCharWizard35E, KrakenCharWizardMGT2,
// KrakenCharWizardCC): each page's art, the races' and classes'. Read from FG's
// extensions folder (a folder or a .ext zip), else from the copy Kraken keeps
// beside the packs (Packs/Wizards/<extension>/graphics), so the wizards look
// the same on a computer without FG. They are the GM's, never shipped.
const EXTENSIONS = new Set(["KrakenCharWizard2E", "KrakenCharWizard35E", "KrakenCharWizardMGT2", "KrakenCharWizardCC"]);
const PICTURE = /\.(png|webp|jpe?g)$/i;
const MIME = { png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };

const extensionsFolder = () => path.join(require("./importers/fgModule.cjs").fgDataFolder(), "extensions");
const copyFolder = (extension) => path.join(require("./packs.cjs").packFolder(), "Wizards", extension, "graphics");
const cache = new Map();

// Every picture of an extension's graphics folder: { "kit_art.png": bytes, "classes/fighter.png": bytes }.
function readAll(extension) {
  const found = {};
  const folder = path.join(extensionsFolder(), extension, "graphics");
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (PICTURE.test(entry.name)) found[`${prefix}${entry.name}`] = fs.readFileSync(path.join(dir, entry.name));
    }
  };
  try {
    if (fs.existsSync(folder)) walk(folder, "");
    else if (fs.existsSync(path.join(extensionsFolder(), `${extension}.ext`))) {
      const { unzipSync } = require("fflate");
      const files = unzipSync(new Uint8Array(fs.readFileSync(path.join(extensionsFolder(), `${extension}.ext`))), { filter: (entry) => /(^|\/)graphics\//.test(entry.name) && PICTURE.test(entry.name) });
      for (const [name, bytes] of Object.entries(files)) found[name.replace(/^.*?graphics\//, "")] = Buffer.from(bytes);
    }
  } catch {
    /* FG's folder unreadable: Kraken's copy below */
  }
  if (Object.keys(found).length) {
    // Kraken's copy, for a computer without FG.
    try {
      for (const [name, bytes] of Object.entries(found)) {
        const target = path.join(copyFolder(extension), name);
        if (fs.existsSync(target) && fs.statSync(target).size === bytes.length) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
      }
    } catch {
      /* a read-only packs folder */
    }
    return found;
  }
  const copy = copyFolder(extension);
  if (fs.existsSync(copy)) walk(copy, "");
  return found;
}

// One picture: { bytes, mime } or null. name: a path inside the extension's graphics folder.
function wizardArt(extension, name) {
  if (!EXTENSIONS.has(extension)) return null;
  const clean = String(name ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!PICTURE.test(clean) || clean.split("/").includes("..")) return null;
  if (!cache.has(extension)) cache.set(extension, readAll(extension));
  const bytes = cache.get(extension)[clean];
  return bytes ? { bytes, mime: MIME[clean.split(".").pop().toLowerCase()] } : null;
}
// What an extension has (names), for checks.
function wizardArtList(extension) {
  if (!EXTENSIONS.has(extension)) return [];
  if (!cache.has(extension)) cache.set(extension, readAll(extension));
  return Object.keys(cache.get(extension));
}

module.exports = { wizardArt, wizardArtList, EXTENSIONS };
