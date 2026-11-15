// Campaign files (electron/campaigns.cjs) and logs (electron/logFile.cjs) on
// their own: rolling backups keep the newest ten, link the adventure instead
// of copying it, and a restore puts the files back (and backs up first);
// duplicate copies the Map Studio pictures too; delete hands back the folders
// for the recycle bin; a log rotates at 1 MB keeping three files.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
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
