// A pack's records counted by their FG section (the FG path without its record id).
// node count_pack.cjs <pack file>
const path = require("path");
const { readModule } = require(path.join(__dirname, "..", "..", "electron", "importers", "fgModule.cjs"));
const { records } = readModule(process.argv[2]);
const counts = {};
for (const record of records) {
  const fgPath = String(record.data?.fgPath ?? "").replace(/@.*$/, "");
  const section = fgPath.split(".").slice(0, -1).join(".") || fgPath;
  counts[section] = (counts[section] || 0) + 1;
}
console.log(JSON.stringify({ counts, total: records.length }));
