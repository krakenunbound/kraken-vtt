// Campaign files (electron/campaigns.cjs) and logs (electron/logFile.cjs) on
// their own: rolling backups keep the newest ten, link the adventure instead
// of copying it, and a restore puts the files back (and backs up first);
// duplicate copies the Map Studio pictures too; delete hands back the folders
// for the recycle bin; a log rotates at 1 MB keeping three files.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const campaigns = require("../electron/campaigns.cjs");
const { createLog, MAX_BYTES } = require("../electron/logFile.cjs");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const dir = mkdtempSync(path.join(tmpdir(), "kraken-campaign-files-"));
const file = path.join(dir, "campaigns.json");
const made = campaigns.create(file, { name: "Hommlet", ruleset: "Worldbuilding" });
campaigns.writeState(file, made.id, { chat: [], records: [{ id: "a", name: "Elmo" }] });
campaigns.writeBundle(file, made.id, Buffer.from("adventure one"));
const pictures = path.join(dir, "studio", "pictures", made.id);
mkdirSync(pictures, { recursive: true });
writeFileSync(path.join(pictures, "map.webp"), "picture");

for (let i = 0; i < 12; i++) campaigns.backup(file, { id: made.id, reason: i ? "hourly" : "play" });
const list = campaigns.backups(file, { id: made.id });
assert(list.length === 10 && list.every((item) => item.reason === "hourly"), `the newest ten kept: ${list.map((item) => item.reason)}`);
const kept = path.join(campaigns.folder(file, made.id), "backups", list[0].id, "bundle.zip");
assert(readFileSync(kept, "utf8") === "adventure one", "the adventure is in the backup");
// The adventure written anew: the backup keeps the old bytes (a link to the old file, or a copy).
campaigns.writeBundle(file, made.id, Buffer.from("adventure two"));
assert(readFileSync(kept, "utf8") === "adventure one", "a new adventure leaves the backup's alone");
campaigns.writeState(file, made.id, { chat: [], records: [] });
const restored = campaigns.restore(file, { id: made.id, backup: list[0].id });
assert(restored.campaign === "Hommlet", "restored");
assert(campaigns.readState(file, made.id).records.some((record) => record.name === "Elmo"), "the records came back");
assert(readFileSync(path.join(campaigns.folder(file, made.id), "bundle.zip"), "utf8") === "adventure one", "and the adventure");
assert(campaigns.backups(file, { id: made.id })[0].reason === "before-restore", "what was there is backed up first");

// Audit 2026-11-19 001: the oldest of ten restored (the before-restore backup must not prune it).
{
  const many = campaigns.create(file, { name: "Oldest", ruleset: "Worldbuilding" });
  const pics = path.join(dir, "studio", "pictures", many.id);
  mkdirSync(pics, { recursive: true });
  for (let i = 0; i < 10; i++) {
    campaigns.writeState(file, many.id, { revision: i, records: [{ id: "r", name: `rev ${i}` }] });
    campaigns.writeBundle(file, many.id, Buffer.from(`bundle ${i}`));
    // Map Studio swaps a new picture file in (backend.cjs studioSave).
    writeFileSync(path.join(pics, "own-map.webp.tmp"), `paint ${i}`);
    renameSync(path.join(pics, "own-map.webp.tmp"), path.join(pics, "own-map.webp"));
    campaigns.backup(file, { id: many.id, reason: "hourly" });
  }
  const all = campaigns.backups(file, { id: many.id });
  const oldest = all[all.length - 1];
  campaigns.restore(file, { id: many.id, backup: oldest.id });
  const state = campaigns.readState(file, many.id);
  assert(state.revision === 0 && state.records[0].name === "rev 0", `the oldest backup restored: ${state.revision}`);
  assert(readFileSync(path.join(campaigns.folder(file, many.id), "bundle.zip"), "utf8") === "bundle 0", "with its adventure");
  // 003: the painted picture as it was then.
  assert(readFileSync(path.join(pics, "own-map.webp"), "utf8") === "paint 0", "and its painted picture");
  // The undo is there: the before-restore backup has revision 9.
  const undo = campaigns.backups(file, { id: many.id }).find((item) => item.reason === "before-restore");
  campaigns.restore(file, { id: many.id, backup: undo.id });
  assert(campaigns.readState(file, many.id).revision === 9 && readFileSync(path.join(pics, "own-map.webp"), "utf8") === "paint 9", "and undone");
}
// 002: an old backup with records inside state.json is not mixed with a newer records.json (or its .bak).
{
  const legacy = campaigns.create(file, { name: "Legacy", ruleset: "Worldbuilding" });
  const dirL = campaigns.folder(file, legacy.id);
  mkdirSync(dirL, { recursive: true });
  writeFileSync(path.join(dirL, "state.json"), JSON.stringify({ table: "old", records: [{ id: "c", name: "old" }] }));
  const old = campaigns.backup(file, { id: legacy.id, reason: "manual" });
  campaigns.writeState(file, legacy.id, { table: "new", records: [{ id: "c", name: "new" }] });
  campaigns.writeState(file, legacy.id, { table: "new", records: [{ id: "c", name: "newer" }] });
  campaigns.restore(file, { id: legacy.id, backup: old.id });
  const back = campaigns.readState(file, legacy.id);
  assert(back.table === "old" && back.records[0].name === "old", `old table, old sheets: ${back.table} ${back.records[0].name}`);
}

// 004: an export carries the campaign's own maps folder.
{
  const own = path.join(dir, "Campaigns", "Hommlet");
  mkdirSync(path.join(own, "Maps"), { recursive: true });
  writeFileSync(path.join(own, "Maps", "Keep.png"), "original");
  const zipFile = path.join(dir, "out.zip");
  campaigns.exportZip(file, { id: made.id, path: zipFile, maps: own });
  const { unzipSync } = require("fflate");
  const entries = unzipSync(readFileSync(zipFile));
  assert(Buffer.from(entries["maps/Maps/Keep.png"] ?? []).toString() === "original", `the export has the map's original: ${Object.keys(entries)}`);
}
// 007: a damaged account roster is never written over by the next account.
{
  const { createAccountStore } = require("../electron/accounts.cjs");
  const roster = path.join(dir, "accounts.json");
  const first = createAccountStore(roster);
  first.create("Alda", "longpassword", { signIn: false });
  first.create("Bram", "longpassword", { signIn: false });
  const whole = readFileSync(roster, "utf8");
  writeFileSync(roster, whole.slice(0, -1));
  const broken = createAccountStore(roster);
  let refused = false;
  try {
    broken.create("Cid", "longpassword", { signIn: false });
  } catch {
    refused = true;
  }
  assert(refused && readFileSync(roster, "utf8") === whole.slice(0, -1), "the damaged roster is left as it was");
  writeFileSync(roster, whole);
  assert(createAccountStore(roster).list().length === 2, "and reads again once repaired");
  const fresh = createAccountStore(path.join(dir, "none", "accounts.json"));
  fresh.create("Dov", "longpassword", { signIn: false });
  assert(fresh.list().length === 1, "a missing roster is a first start");
}

const copy = campaigns.duplicate(file, { id: made.id });
assert(copy.name === "Hommlet (copy)" && existsSync(path.join(dir, "studio", "pictures", copy.id, "map.webp")), "the copy has the Map Studio pictures");
assert(!existsSync(path.join(campaigns.folder(file, copy.id), "backups")), "the copy starts with no backups");
const gone = campaigns.remove(file, { id: copy.id });
assert(gone.folders.length === 2 && !campaigns.read(file).some((item) => item.id === copy.id), "delete hands back both folders");
const renamed = campaigns.rename(file, { id: made.id, name: "The Village of Hommlet" });
assert(renamed.name === "The Village of Hommlet", "renamed");

const log = createLog(path.join(dir, "logs"), "backend");
const line = "x".repeat(1000);
for (let i = 0; i < 2600; i++) log.write("error", line);
const files = readdirSync(path.join(dir, "logs")).sort();
assert(files.join(",") === "backend.1.log,backend.2.log,backend.log", `three log files: ${files}`);
assert(statSync(path.join(dir, "logs", "backend.log")).size < MAX_BYTES + 60 * 1100, "each about a megabyte at most");
assert(log.tail(5).length === 5 && log.tail(5)[0].includes(" ERROR "), "the last lines read back");
console.log("CAMPAIGN_FILES_OK backups keep ten, link the adventure, restore; duplicate with pictures; delete; rename; log rotation");
