const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

function asCampaign(value) {
  if (!value || typeof value !== "object") return null;
  const name = clean(value.name, 80);
  const id = String(value.id ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  if (!name || !id) return null;
  const port = Number(value.port);
  const played = Number(value.playedAt);
  return {
    id,
    name,
    ruleset: clean(value.ruleset, 40) || "Worldbuilding",
    createdAt: Number(value.createdAt) || Date.now(),
    playedAt: Number.isFinite(played) && played > 0 ? played : null,
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 47300,
    // The name the GM plays under in this campaign, kept from the last Play.
    gmName: clean(value.gmName, 24),
  };
}

// A saved file, read safely: missing is nothing (null); damaged (a crash or a
// power cut mid-write) falls back to the copy kept before the last save; if
// that is damaged too, it is an error, never an empty campaign that the next
// save would write over the real one.
function readJson(target) {
  const backup = `${target}.bak`;
  for (const candidate of [target, backup]) {
    let text;
    try {
      text = fs.readFileSync(candidate, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      throw new Error(`Kraken could not read ${path.basename(candidate)} (${error?.code ?? error}); close whatever has it open and try again.`);
    }
    try {
      return JSON.parse(text);
    } catch {
      /* damaged: the copy from before the last save */
    }
  }
  if (fs.existsSync(target) || fs.existsSync(backup)) throw new Error(`${target} is damaged and has no good copy; nothing was changed.`);
  return null;
}

function read(file) {
  const parsed = readJson(file);
  const rows = Array.isArray(parsed?.campaigns) ? parsed.campaigns : [];
  return rows.map(asCampaign).filter(Boolean);
}

function write(file, campaigns) {
  writeAtomic(file, JSON.stringify({ campaigns }));
}

function create(file, input) {
  const name = clean(input?.name, 80);
  if (!name) throw new Error("Name the campaign.");
  const campaign = {
    id: crypto.randomBytes(8).toString("hex"),
    name,
    ruleset: clean(input?.ruleset, 40) || "Worldbuilding",
    createdAt: Date.now(),
    playedAt: null,
    port: 47300,
    gmName: "",
  };
  const campaigns = read(file);
  campaigns.unshift(campaign);
  write(file, campaigns);
  return campaign;
}

function touch(file, input) {
  const campaigns = read(file);
  const found = campaigns.find((campaign) => campaign.id === String(input?.id ?? ""));
  if (!found) return null;
  found.playedAt = Date.now();
  const port = Number(input?.port);
  if (Number.isInteger(port) && port >= 1 && port <= 65535) found.port = port;
  const gmName = clean(input?.gmName, 24);
  if (gmName) found.gmName = gmName;
  write(file, campaigns);
  return found;
}

// A campaign's ruleset, changed (it decides the books and the sheets).
function setRuleset(file, input) {
  const campaigns = read(file);
  const found = campaigns.find((campaign) => campaign.id === String(input?.id ?? ""));
  if (!found) throw new Error("That campaign is missing.");
  const ruleset = clean(input?.ruleset, 40);
  if (!ruleset) throw new Error("Give the ruleset.");
  found.ruleset = ruleset;
  write(file, campaigns);
  return found;
}

// Each campaign keeps its table in <userData>/campaigns/<id>/:
// state.json (view, chat, tokens and doors) and bundle.zip (the opened adventure).
function folder(file, id) {
  const safe = String(id ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  if (!safe) throw new Error("Unknown campaign.");
  return path.join(path.dirname(file), "campaigns", safe);
}

function exists(file, id) {
  return read(file).some((campaign) => campaign.id === String(id ?? ""));
}

// Written whole to a temporary file and flushed to the disk, then swapped in;
// the last good file stays beside it as <name>.bak until the next save.
function writeAtomic(target, data, { backup = true } = {}) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  const handle = fs.openSync(temp, "w");
  try {
    fs.writeFileSync(handle, data);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  if (backup && fs.existsSync(target)) fs.renameSync(target, `${target}.bak`);
  fs.renameSync(temp, target);
}

// Records live in records.json, apart from state.json, so that imported books
// are only rewritten when records change, not on every chat line.
function readState(file, id) {
  const dir = folder(file, id);
  // A new campaign has no state yet; older saves kept records inside state.json.
  const parsed = readJson(path.join(dir, "state.json"));
  const state = parsed && typeof parsed === "object" ? parsed : {};
  const records = readJson(path.join(dir, "records.json"));
  if (Array.isArray(records)) state.records = records;
  return state;
}

function writeState(file, id, state, { records = true } = {}) {
  const dir = folder(file, id);
  const { records: rows, ...rest } = state;
  if (records && Array.isArray(rows)) writeAtomic(path.join(dir, "records.json"), JSON.stringify(rows));
  writeAtomic(path.join(dir, "state.json"), JSON.stringify(rest));
}

function readBundle(file, id) {
  try {
    return fs.readFileSync(path.join(folder(file, id), "bundle.zip"));
  } catch {
    return null;
  }
}

function writeBundle(file, id, bytes) {
  writeAtomic(path.join(folder(file, id), "bundle.zip"), bytes, { backup: false });
}

module.exports = { read, create, touch, setRuleset, exists, readState, writeState, readBundle, writeBundle };
