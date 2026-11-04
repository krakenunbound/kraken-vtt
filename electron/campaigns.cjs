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

function read(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed?.campaigns) ? parsed.campaigns : [];
    return rows.map(asCampaign).filter(Boolean);
  } catch {
    return [];
  }
}

function write(file, campaigns) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ campaigns }));
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

function writeAtomic(target, data) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, target);
}

// Records live in records.json, apart from state.json, so that imported books
// are only rewritten when records change, not on every chat line.
function readState(file, id) {
  const dir = folder(file, id);
  let state = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    if (parsed && typeof parsed === "object") state = parsed;
  } catch {
    /* A new campaign has no state yet. */
  }
  try {
    const records = JSON.parse(fs.readFileSync(path.join(dir, "records.json"), "utf8"));
    if (Array.isArray(records)) state.records = records;
  } catch {
    /* Older saves kept records inside state.json. */
  }
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
  writeAtomic(path.join(folder(file, id), "bundle.zip"), bytes);
}

module.exports = { read, create, touch, setRuleset, exists, readState, writeState, readBundle, writeBundle };
