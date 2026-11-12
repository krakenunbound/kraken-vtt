const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring } = require("fengari");
const interop = require("fengari-interop");

// Traveller's character wizard, as the GM's own FG extension
// KrakenCharWizardMGT2 makes characters: its two scripts (manager_tcwiz.lua,
// the term engine; data_tcwiz.lua, the careers, transcribed by the GM from
// their Core Rulebook) run here unchanged in a Lua machine (fengari), with
// small stand-ins for the parts of FG they touch: dice (the table's, in
// chat), the database (the campaign's records: species, skills, items), the
// options. The scripts are read from the GM's FG extensions folder (or the
// copy Kraken keeps beside the packs); they are the GM's, never shipped.
// Kraken's wizard shows the engine's pages and steps; its Create writes a
// Kraken Traveller (electron/mgt2.cjs).

const EXTENSION = "KrakenCharWizardMGT2";
function fgExtensions() {
  const fg = require("./importers/fgModule.cjs").fgDataFolder();
  return path.join(fg, "extensions");
}
function packCopy() {
  return path.join(require("./packs.cjs").packFolder(), "Wizards", EXTENSION);
}
// The scripts: the extension's (a folder or a .ext zip), else Kraken's copy of them.
function readScripts() {
  const fromFolder = (folder) => {
    const data = path.join(folder, "scripts", "data_tcwiz.lua");
    const manager = path.join(folder, "scripts", "manager_tcwiz.lua");
    return fs.existsSync(data) && fs.existsSync(manager) ? { data: fs.readFileSync(data, "utf8"), manager: fs.readFileSync(manager, "utf8") } : null;
  };
  const folder = path.join(fgExtensions(), EXTENSION);
  let found = fromFolder(folder);
  if (!found && fs.existsSync(`${folder}.ext`)) {
    const { unzipSync, strFromU8 } = require("fflate");
    const files = unzipSync(fs.readFileSync(`${folder}.ext`));
    const pick = (name) => Object.entries(files).find(([key]) => key.endsWith(`scripts/${name}`))?.[1];
    if (pick("data_tcwiz.lua") && pick("manager_tcwiz.lua")) found = { data: strFromU8(pick("data_tcwiz.lua")), manager: strFromU8(pick("manager_tcwiz.lua")) };
  }
  // Keep a copy beside the packs, so the wizard works on a computer without FG.
  if (found) {
    try {
      fs.mkdirSync(path.join(packCopy(), "scripts"), { recursive: true });
      fs.writeFileSync(path.join(packCopy(), "scripts", "data_tcwiz.lua"), found.data);
      fs.writeFileSync(path.join(packCopy(), "scripts", "manager_tcwiz.lua"), found.manager);
    } catch {
      /* a read-only packs folder: the extension is read each time */
    }
    return found;
  }
  return fromFolder(packCopy());
}
const available = () => Boolean(readScripts());

// Lua source for a JS value (records into the stand-in database).
function toLua(value) {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => `\\u{${hex}}`);
  if (Array.isArray(value)) return `{${value.map(toLua).join(",")}}`;
  return `{${Object.entries(value)
    .map(([key, item]) => `[${JSON.stringify(key)}]=${toLua(item)}`)
    .join(",")}}`;
}

// The stand-ins (Lua). Host is the JS side.
const PRELUDE = String.raw`
unpack = unpack or table.unpack
local function noop() end
local function control()
  return { setVisible = noop, setFrame = noop, setText = noop, setEnabled = noop,
    findWidget = function() return { setBitmap = noop, destroy = noop } end, addBitmapWidget = noop,
    subwindow = setmetatable({ update = noop }, { __index = function() return control() end }) }
end
FAKE_WINDOW = setmetatable({ close = noop }, { __index = function(t, k) local c = control(); rawset(t, k, c); return c end })

-- JSON out, for the host.
local function esc(s) return (s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end)) end
function TOJSON(v, seen)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" or t == "number" then return tostring(v) end
  if t == "string" then return '"' .. esc(v) .. '"' end
  if t == "function" then return "null" end
  if t ~= "table" then return "null" end
  seen = seen or {}
  if seen[v] then return "null" end
  seen[v] = true
  local n = #v
  if n == 0 and next(v) == nil then seen[v] = nil return "[]" end
  local isArray = n > 0
  if isArray then for k in pairs(v) do if type(k) ~= "number" then isArray = false break end end end
  local out = {}
  if isArray then
    for i = 1, n do out[#out + 1] = TOJSON(v[i], seen) end
    seen[v] = nil
    return "[" .. table.concat(out, ",") .. "]"
  end
  for k, item in pairs(v) do
    if type(item) ~= "function" then out[#out + 1] = '"' .. esc(tostring(k)) .. '":' .. TOJSON(item, seen) end
  end
  seen[v] = nil
  return "{" .. table.concat(out, ",") .. "}"
end

DiceManager = { convertStringToDice = function(s)
  local n, sides = tostring(s):match("(%d*)d(%d+)")
  local out = {}
  for i = 1, tonumber(n ~= "" and n or 1) do out[i] = { type = "d" .. sides } end
  return out
end }
local HANDLER = nil
ActionsManager = {
  registerResultHandler = function(_, fn) HANDLER = fn end,
  performAction = function(_, _, r)
    local counts = {}
    for _, d in ipairs(r.aDice or {}) do counts[d.type] = (counts[d.type] or 0) + 1 end
    local parts = {}
    for kind, n in pairs(counts) do parts[#parts + 1] = n .. kind end
    local values = Host:roll(table.concat(parts, "+"), r.sDesc or "", r.nMod or 0)
    local i = 0
    for v in tostring(values):gmatch("%-?%d+") do i = i + 1; if r.aDice[i] then r.aDice[i].result = tonumber(v) end end
    if HANDLER then HANDLER(nil, nil, r) end
  end,
  createActionMessage = function(_, r) return { text = r.sDesc or "" } end,
}
GameManager = nil
Comm = { deliverChatMessage = noop }
ChatManager = { SystemMessage = function(s) Host:say(tostring(s or "")) end }
OptionsManager = { registerOptionData = noop, getOption = function(k) return Host:option(k) end, isOption = function(k, v) return Host:option(k) == v end }
Session = { IsHost = true }
User = { getUsername = function() return Host:user() end }
StringManager = { trim = function(s) return (tostring(s or "")):match("^%s*(.-)%s*$") end }
local function deepcopy(v) if type(v) ~= "table" then return v end local t = {} for k, item in pairs(v) do t[k] = deepcopy(item) end return t end
UtilityManager = { copyDeep = deepcopy }
Interface = { openWindow = noop, getString = function(k) return k end }
CharManager = {}
ItemManager = {}
RecordManager = { onRecordAddEvent = noop }
UserManager = {}
Module = { getModuleInfo = function(m) return { displayname = m } end }

-- The stand-in database: nodes are tables { _path, _module, fields... }.
NODES = {}
ROOTS = {}
local function attach(node, root, index)
  node._path = node._path or (root .. ".id-" .. index)
  NODES[node._path] = node
  for _, list in pairs(node) do
    if type(list) == "table" and list[1] and type(list[1]) == "table" then
      for j, child in ipairs(list) do child._path = node._path .. ".x" .. j; NODES[child._path] = child end
    end
  end
end
function LOAD_DB(db)
  NODES, ROOTS = {}, {}
  for root, list in pairs(db) do
    ROOTS[root] = list
    for i, node in ipairs(list) do attach(node, root, i) end
  end
end
DB = {
  getChildrenGlobal = function(root) return ROOTS[root] or {} end,
  findNode = function(p) return NODES[p] end,
  getPath = function(node, ...)
    if type(node) == "table" then return node._path end
    local parts = { node, ... }
    return table.concat(parts, ".")
  end,
  getValue = function(node, field, default)
    if type(node) == "string" then node = NODES[node] end
    if type(node) ~= "table" then return default end
    local v = node[field]
    if v == nil then return default end
    return v
  end,
  getModule = function(node) return type(node) == "table" and node._module or "" end,
  getChildList = function(node, sub) return (type(node) == "table" and node[sub]) or {} end,
  getParent = function() return nil end,
  setValue = noop,
  createChild = function() return {} end,
}

function LOAD_PACKAGE(src, name)
  local env = setmetatable({}, { __index = _G })
  local chunk, err = load(src, "=" .. name, "t", env)
  if not chunk then error(err) end
  chunk()
  return env
end
`;

// One wizard (one player's Traveller in the making).
function createWizard({ roll, say, user = "", options = {}, records = {} }) {
  const scripts = readScripts();
  if (!scripts) throw new Error(`Traveller's character wizard needs the GM's FG extension ${EXTENSION} (in the FG extensions folder, or its copy beside the packs).`);
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lauxlib.luaL_requiref(L, to_luastring("js"), interop.luaopen_js, 1);
  lua.lua_pop(L, 1);
  const host = {
    roll(formula, label, mod) {
      return roll(String(formula), String(label), Number(mod) || 0).join(",");
    },
    say: (text) => say(String(text)),
    option: (key) => options[String(key)] ?? (String(key) === "TCWIZ_RULES" ? "2016" : "off"),
    user: () => user,
  };
  interop.push(L, host);
  lua.lua_setglobal(L, to_luastring("Host"));
  const run = (code, name = "kraken") => {
    if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== 0 || lua.lua_pcall(L, 0, 1, 0) !== 0) {
      const message = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      throw new Error(`Traveller wizard: ${message}`);
    }
    const value = lua.lua_isstring(L, -1) ? lua.lua_tojsstring(L, -1) : null;
    lua.lua_pop(L, 1);
    return value;
  };
  run(PRELUDE, "prelude");
  run(`LOAD_DB(${toLua(records)})`, "records");
  lua.lua_pushstring(L, to_luastring(scripts.data));
  lua.lua_setglobal(L, to_luastring("DATA_SRC"));
  lua.lua_pushstring(L, to_luastring(scripts.manager));
  lua.lua_setglobal(L, to_luastring("MANAGER_SRC"));
  run(`TCData = LOAD_PACKAGE(DATA_SRC, "data_tcwiz"); TCWizard = LOAD_PACKAGE(MANAGER_SRC, "manager_tcwiz"); TCWizard.onInit(); TCWizard.registerWindow(FAKE_WINDOW)`, "load");
  // Calls a TCWizard function with JSON-able arguments; returns its result as JSON.
  const call = (fn, ...args) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fn)) throw new Error("No such wizard step.");
    const text = run(`local f = TCWizard[${JSON.stringify(fn)}]; if type(f) ~= "function" then error("no function ${fn}") end; return TOJSON(f(${args.map(toLua).join(",")}))`, fn);
    return text ? JSON.parse(text) : null;
  };
  const eval_ = (code) => {
    const text = run(`return TOJSON((function() ${code} end)())`, "view");
    return text ? JSON.parse(text) : null;
  };
  return { call, eval: eval_, close: () => lua.lua_close(L) };
}

module.exports = { createWizard, readScripts, available, toLua, EXTENSION };
