const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring } = require("fengari");

// The words and pictures of the GM's FG character wizards (their own
// extensions), as the extensions give them: a script of the extension (such
// as KrakenCharWizard2E's bio_charwizard2e.lua, its race, class and alignment
// descriptions) run unchanged in a Lua machine, its functions called as the
// wizard's pages call them; and the extension's icon names (its graphics
// XML) mapped to its pictures (electron/wizardArt.cjs serves them). Read from
// FG's extensions folder (a folder or a .ext zip), else from the copy Kraken
// keeps beside the packs (Packs/Wizards/<extension>). Never shipped.

// What may be read, and called: the extension, its script, the functions.
const SCRIPTS = {
  KrakenCharWizard2E: { file: "charwizard/scripts/bio_charwizard2e.lua", calls: ["getRaceDescTop", "getRaceDescBelow", "getRaceImage", "getRaceImageSize", "getClassDescTop", "getClassDescBelow", "getClassImage", "getAlignmentDescription", "getAlignmentOverview"] },
};

const extensionsFolder = () => path.join(require("./importers/fgModule.cjs").fgDataFolder(), "extensions");
const copyFolder = (extension) => path.join(require("./packs.cjs").packFolder(), "Wizards", extension);

// A text file of an extension: FG's folder, its .ext, or Kraken's copy (kept fresh).
function extensionText(extension, file) {
  let text = null;
  try {
    const inFolder = path.join(extensionsFolder(), extension, file);
    if (fs.existsSync(inFolder)) text = fs.readFileSync(inFolder, "utf8");
    else if (fs.existsSync(path.join(extensionsFolder(), `${extension}.ext`))) {
      const { unzipSync, strFromU8 } = require("fflate");
      const files = unzipSync(new Uint8Array(fs.readFileSync(path.join(extensionsFolder(), `${extension}.ext`))), { filter: (entry) => entry.name.endsWith(file) });
      const found = Object.values(files)[0];
      if (found) text = strFromU8(found);
    }
  } catch {
    text = null;
  }
  const copy = path.join(copyFolder(extension), file);
  if (text !== null) {
    try {
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.writeFileSync(copy, text);
    } catch {
      /* a read-only packs folder */
    }
    return text;
  }
  return fs.existsSync(copy) ? fs.readFileSync(copy, "utf8") : null;
}

// Lua for a JS value (arguments).
const toLua = (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : JSON.stringify(String(value ?? "")).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => `\\u{${hex}}`));

const machines = new Map();
function machine(extension) {
  if (machines.has(extension)) return machines.get(extension);
  // Only the extensions Kraken knows, and only once found (installed later, it is read then).
  const spec = Object.hasOwn(SCRIPTS, extension) ? SCRIPTS[extension] : null;
  const source = spec ? extensionText(extension, spec.file) : null;
  if (!source) return null;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code, name) => {
    if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== 0 || lua.lua_pcall(L, 0, 1, 0) !== 0) {
      const message = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      throw new Error(message);
    }
    const value = lua.lua_isstring(L, -1) ? lua.lua_tojsstring(L, -1) : null;
    lua.lua_pop(L, 1);
    return value;
  };
  // The script's functions land in a table of their own (as FG's named script package).
  lua.lua_pushstring(L, to_luastring(source));
  lua.lua_setglobal(L, to_luastring("SOURCE"));
  run(`PKG = setmetatable({}, { __index = _G }); local chunk = assert(load(SOURCE, "=${spec.file}", "t", PKG)); chunk()`, "load");
  const made = { run, calls: new Set(spec.calls) };
  machines.set(extension, made);
  return made;
}

// Call one of the script's functions: its results (strings and numbers) as a list.
function callExtension(extension, fn, args = []) {
  const made = machine(extension);
  if (!made) return null;
  if (!made.calls.has(fn)) throw new Error(`The wizard has no ${fn}.`);
  const list = (Array.isArray(args) ? args : [args]).slice(0, 4).map(toLua).join(",");
  const text = made.run(`local out = table.pack(PKG.${fn}(${list})); local parts = {}; for i = 1, out.n do local v = out[i]; parts[i] = v == nil and "\\0" or tostring(v) end; return table.concat(parts, "\\1")`, fn);
  return String(text ?? "")
    .split("\u0001")
    .map((part) => (part === "\u0000" ? null : part));
}

// The extension's icon names -> picture files ("charwizard2e_race_dwarf" -> "race_dwarf.png").
const iconMaps = new Map();
function iconFile(extension, icon) {
  if (!Object.hasOwn(SCRIPTS, extension) && !Object.hasOwn(STRING_FILES, extension)) return null;
  if (!iconMaps.has(extension)) {
    const map = {};
    for (const file of ["graphics/graphics_charwizard2e.xml", "graphics/graphics_charwizard35e.xml", "graphics/graphics_tcwiz.xml", "graphics/graphics_ccwiz.xml"]) {
      const text = extensionText(extension, file);
      if (!text) continue;
      for (const match of text.matchAll(/<icon\s+name="([^"]+)"\s+file="graphics\/([^"]+)"/g)) map[match[1]] = match[2];
    }
    iconMaps.set(extension, map);
  }
  return iconMaps.get(extension)[icon] ?? null;
}

// The extension's strings (FG's Interface.getString): its strings XML, by name.
const STRING_FILES = { KrakenCharWizardMGT2: "strings/strings_tcwiz.xml", KrakenCharWizard2E: "strings/strings_charwizard2e.xml", KrakenCharWizard35E: "strings/strings_charwizard35e.xml", KrakenCharWizardCC: "strings/strings_ccwiz.xml" };
const stringMaps = new Map();
function extensionString(extension, key) {
  if (!Object.hasOwn(STRING_FILES, extension)) return null;
  if (!stringMaps.has(extension)) {
    const map = {};
    const text = extensionText(extension, STRING_FILES[extension]);
    if (text === null) return null;
    const unescape = (value) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
    for (const match of text.matchAll(/<string\s+name="([^"]+)"\s*>([\s\S]*?)<\/string>/g)) map[match[1]] = unescape(match[2]);
    stringMaps.set(extension, map);
  }
  return stringMaps.get(extension)[key] ?? null;
}

module.exports = { callExtension, iconFile, extensionText, extensionString, SCRIPTS };
