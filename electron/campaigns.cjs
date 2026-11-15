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

// --- Managing campaigns: rename, duplicate, export, delete, backups ---------------
// Map Studio's pictures for a campaign's images live beside the campaigns, by id (backend.cjs studioPictureFile).
function picturesFolder(file, id) {
  return path.join(path.dirname(file), "studio", "pictures", String(id).replace(/[^\w.-]/g, "_"));
}
function find(campaigns, id) {
  const found = campaigns.find((campaign) => campaign.id === String(id ?? ""));
  if (!found) throw new Error("That campaign is missing.");
  return found;
}

function rename(file, input) {
  const campaigns = read(file);
  const found = find(campaigns, input?.id);
  const name = clean(input?.name, 80);
  if (!name) throw new Error("Name the campaign.");
  found.name = name;
  write(file, campaigns);
  return found;
}

// A folder copied, file by file (leaving out backups and half-written files).
function copyFolder(from, to, skip = () => false) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyFolder(source, target, skip);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}
const scratch = (name) => name === "backups" || /\.(tmp|bak)$/.test(name);

// A copy under a new name: its table, records, adventure and Map Studio pictures.
function duplicate(file, input) {
  const campaigns = read(file);
  const found = find(campaigns, input?.id);
  const copy = { ...found, id: crypto.randomBytes(8).toString("hex"), name: clean(input?.name, 80) || `${found.name} (copy)`.slice(0, 80), createdAt: Date.now(), playedAt: null };
  copyFolder(folder(file, found.id), folder(file, copy.id), scratch);
  copyFolder(picturesFolder(file, found.id), picturesFolder(file, copy.id));
  campaigns.unshift(copy);
  write(file, campaigns);
  return copy;
}

// Out of the list; its folders are handed back for the recycle bin (the window's process puts them there).
function remove(file, input) {
  const campaigns = read(file);
  const found = find(campaigns, input?.id);
  write(file, campaigns.filter((campaign) => campaign.id !== found.id));
  return { removed: found, folders: [folder(file, found.id), picturesFolder(file, found.id)].filter((dir) => fs.existsSync(dir)) };
}

// One .zip of the campaign: campaign.json (its card), its table, records, adventure and Map Studio pictures.
function exportZip(file, input) {
  const { zipSync } = require("fflate");
  const found = find(read(file), input?.id);
  const entries = { "campaign.json": Buffer.from(JSON.stringify({ kraken: "campaign", version: 1, ...found }, null, 1)) };
  const add = (from, prefix) => {
    if (!fs.existsSync(from)) return;
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (scratch(entry.name)) continue;
      const source = path.join(from, entry.name);
      if (entry.isDirectory()) add(source, `${prefix}${entry.name}/`);
      else if (entry.isFile()) entries[`${prefix}${entry.name}`] = fs.readFileSync(source);
    }
  };
  add(folder(file, found.id), "campaign/");
  add(picturesFolder(file, found.id), "studio/");
  const bytes = Buffer.from(zipSync(entries, { level: 6 }));
  const target = String(input?.path ?? "");
  if (!target) throw new Error("Where should the .zip go?");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { campaign: found.name, path: target, bytes: bytes.length };
}

// Rolling backups: a copy of the campaign's files (its adventure linked, not copied, while it is the same file),
// in <campaign>/backups/<time>-<why>/; the newest ten are kept.
const KEEP_BACKUPS = 10;
const BACKUP_FILES = ["state.json", "records.json", "bundle.zip"];
function backupsFolder(file, id) {
  return path.join(folder(file, id), "backups");
}
function backups(file, input) {
  const found = find(read(file), input?.id);
  const dir = backupsFolder(file, found.id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{13}-[a-z-]+$/.test(entry.name))
    .map((entry) => {
      const [at, ...why] = entry.name.split("-");
      const files = BACKUP_FILES.filter((name) => fs.existsSync(path.join(dir, entry.name, name)));
      const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(dir, entry.name, name)).size, 0);
      return { id: entry.name, at: Number(at), reason: why.join("-"), files, bytes };
    })
    .sort((a, b) => b.at - a.at);
}
function backup(file, input) {
  const found = find(read(file), input?.id);
  const source = folder(file, found.id);
  const present = BACKUP_FILES.filter((name) => fs.existsSync(path.join(source, name)));
  if (!present.length) return null;
  const reason = String(input?.reason ?? "manual").toLowerCase().replace(/[^a-z-]/g, "").slice(0, 20) || "manual";
  let at = Date.now();
  while (fs.existsSync(path.join(backupsFolder(file, found.id), `${at}-${reason}`))) at += 1;
  const dir = path.join(backupsFolder(file, found.id), `${at}-${reason}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of present) {
    const from = path.join(source, name);
    const to = path.join(dir, name);
    // The adventure is written whole each time (a new file), so a hard link keeps this one's bytes for free.
    if (name === "bundle.zip") {
      try {
        fs.linkSync(from, to);
        continue;
      } catch {
        /* another disk, or no links: copied */
      }
    }
    fs.copyFileSync(from, to);
  }
  // The newest ten are kept; older ones are this feature's own folders, removed.
  for (const old of backups(file, { id: found.id }).slice(KEEP_BACKUPS)) fs.rmSync(path.join(backupsFolder(file, found.id), old.id), { recursive: true, force: true });
  return backups(file, { id: found.id }).find((item) => item.id === `${at}-${reason}`) ?? null;
}
// A backup put back: what is there now is backed up first ("before-restore"), so a restore can be undone.
function restore(file, input) {
  const found = find(read(file), input?.id);
  const chosen = backups(file, { id: found.id }).find((item) => item.id === String(input?.backup ?? ""));
  if (!chosen) throw new Error("No such backup.");
  backup(file, { id: found.id, reason: "before-restore" });
  const dir = path.join(backupsFolder(file, found.id), chosen.id);
  const target = folder(file, found.id);
  for (const name of BACKUP_FILES) {
    const from = path.join(dir, name);
    const to = path.join(target, name);
    if (fs.existsSync(from)) {
      const temp = `${to}.tmp`;
      fs.copyFileSync(from, temp);
      fs.renameSync(temp, to);
    } else if (name === "bundle.zip") fs.rmSync(to, { force: true });
  }
  return { restored: chosen, campaign: found.name };
}

module.exports = { read, create, touch, setRuleset, exists, readState, writeState, readBundle, writeBundle, folder, rename, duplicate, remove, exportZip, backups, backup, restore };
