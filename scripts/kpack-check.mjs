// Checks a Maelstrom pack (.kpack) against docs/kpack-format.md, for a person or an AI agent who made one:
//   node scripts/kpack-check.mjs "path/to/Book.kpack" [more.kpack ...]
//   npm run kpack:check -- "path/to/Book.kpack"
// Prints each problem (an error stops the pack being read; a warning is something to fix) and where Maelstrom
// will file it (kind > group). Exits 1 when any pack has an error.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { KIND_IDS, organize } from "../shared/packs/organize.mjs";

// Maelstrom's games (electron/books.cjs FG_RULESETS); "Fate" is a book for Fate Core and Fate Accelerated both.
const RULESETS = ["Any", "AD&D 2E", "D&D 3.5E", "D&D 5E", "Castles & Crusades", "Traveller", "Descending Darkness", "Apeira Astra", "Cairn", "Ironsworn", "Starforged", "Basic Fantasy", "Fate Core", "Fate Accelerated", "Fate", "Forged in the Dark"];
const CALENDARS = ["gregorian", "greyhawk", "harptos", "mystara", "golarion", "imperial", "waning", "astra"];
const MEDIA = /\.(png|webp|jpe?g|gif|webm|mp4|ogg|mp3|wav|m4a)$/i;
// The record types Maelstrom reads (docs/kpack-format.md section 4), the games' own included.
const TYPES = new Set([
  "refpage", "refindex", "encounter", "story", "storytemplate", "hiddenstory", "npc", "item", "itemtemplate", "spell", "spelldesc", "spelllists",
  "class", "class_specialization", "race", "race_subrace", "background", "feat", "skill", "specialability", "pregencharsheet", "charsheet",
  "battle", "battlerandom", "treasureparcels", "tables", "table", "image", "calendar", "license", "quest", "vehicle", "location", "note", "card",
  "deck", "effect", "effects", "modifiers", "lists",
  // Castles & Crusades; Ironsworn and Starforged; Fate; Forged in the Dark; Cairn.
  "siegegame", "siegepackage", "siegepower", "ironasset", "ironmove", "ironoracle", "irondelve", "fateskill", "fatestunt", "playbook", "crewtype", "forgedtable", "cairntable",
]);

function check(file) {
  const errors = [];
  const warnings = [];
  let files;
  try {
    files = unzipSync(new Uint8Array(readFileSync(file)));
  } catch (error) {
    return { errors: [`not a zip file (${error.message})`], warnings };
  }
  const names = Object.keys(files);
  if (!files["kraken-pack.json"]) return { errors: ["no kraken-pack.json at the top of the zip"], warnings };
  let m;
  try {
    m = JSON.parse(strFromU8(files["kraken-pack.json"]));
  } catch (error) {
    return { errors: [`kraken-pack.json is not JSON (${error.message})`], warnings };
  }
  if (m.format !== "kraken-pack") errors.push('format must be "kraken-pack"');
  if (!(Number(m.version) >= 2 && Number(m.version) <= 3)) errors.push("version must be 2 or 3 (3 is current)");
  if (!String(m.name ?? "").trim()) errors.push("name is missing (other books link to it by this name)");
  if (!String(m.title ?? "").trim()) warnings.push("title is missing (the lists show name instead)");
  if (!RULESETS.includes(m.ruleset)) warnings.push(`ruleset "${m.ruleset}" is not one of Maelstrom's games (${RULESETS.join(", ")}): the pack shows in no campaign`);
  if (m.calendar !== undefined && !CALENDARS.includes(m.calendar)) errors.push(`calendar must be one of ${CALENDARS.join(", ")}`);
  if (Number(m.version) >= 3) {
    if (!KIND_IDS.includes(m.kind)) errors.push(`kind must be one of ${KIND_IDS.join(", ")}`);
    if (m.order !== undefined && typeof m.order !== "string") warnings.push("order should be a string (it sorts by number within it: B2 before B10)");
    if (m.parent !== undefined && typeof m.parent !== "string") errors.push("parent must be the name of the pack this is a part of");
    if (m.contents !== undefined && (typeof m.contents !== "object" || Array.isArray(m.contents))) errors.push("contents must be an object of counts");
  }
  for (const key of ["thumbnail", "cover"]) {
    if (m[key] && !files[m[key]]) errors.push(`${key} "${m[key]}" is not in the zip`);
  }
  if (m.thumbnail && files[m.thumbnail]?.length > 512 * 1024) warnings.push("the thumbnail is over 512 KB: a square 256 px WebP is enough");
  if (!m.thumbnail && !m.cover) warnings.push("no thumbnail or cover: the lists use its first picture");
  let records = [];
  if (!files["records.json"]) errors.push("no records.json (an empty array [] for a pack of pictures only)");
  else {
    try {
      records = JSON.parse(strFromU8(files["records.json"]));
      if (!Array.isArray(records)) throw new Error("not an array");
    } catch (error) {
      errors.push(`records.json is not an array of records (${error.message})`);
      records = [];
    }
  }
  const ids = new Set();
  const unknown = new Map();
  const media = new Set(names.filter((name) => MEDIA.test(name)));
  let missingMedia = 0;
  for (const [index, record] of records.entries()) {
    const at = `record ${index} (${record?.name ?? record?.id ?? "?"})`;
    if (!record || typeof record !== "object") {
      errors.push(`${at}: not an object`);
      continue;
    }
    if (!record.id) errors.push(`${at}: no id`);
    else if (ids.has(record.id)) errors.push(`${at}: id ${record.id} is used twice`);
    else ids.add(record.id);
    if (!record.type) errors.push(`${at}: no type`);
    else if (!TYPES.has(record.type)) unknown.set(record.type, (unknown.get(record.type) ?? 0) + 1);
    if (!["gm", "all", "owner"].includes(record.visibility ?? "gm")) warnings.push(`${at}: visibility is gm, all or owner`);
    if (record.source && record.source !== m.name) warnings.push(`${at}: source "${record.source}" differs from the pack's name`);
    if (record.data == null || typeof record.data !== "object") errors.push(`${at}: no data object`);
    // A picture a record names must be in the zip.
    for (const value of JSON.stringify(record.data ?? {}).match(/"(?:file|image|picture|token|portrait)"\s*:\s*"([^"]+\.(?:png|webp|jpe?g|gif|webm))"/gi) ?? []) {
      const name = /:\s*"([^"]+)"/.exec(value)[1];
      if (!media.has(name) && !name.includes("@")) missingMedia += 1;
    }
  }
  for (const [type, count] of unknown) warnings.push(`${count} record(s) of type "${type}", not one Maelstrom's lists know (they are kept, but shown nowhere)`);
  if (missingMedia) warnings.push(`${missingMedia} picture reference(s) in records name files not in the zip`);
  if (m.records !== undefined && Number(m.records) !== records.length) warnings.push(`manifest says ${m.records} records, records.json has ${records.length}`);
  // Pages are refpage records, or (FG's newer layout) kept inside the refindex with their blocks.
  const index = records.find((record) => record.type === "refindex");
  const inline = Object.values(index?.data?.chapters && typeof index.data.chapters === "object" ? index.data.chapters : {}).some((chapter) =>
    Object.values(chapter?.subchapters ?? {}).some((section) => Object.values(section?.refpages ?? {}).some((page) => page?.blocks || typeof page?.text === "string")),
  );
  const hasPages = records.some((record) => record.type === "refpage") || inline;
  if (records.some((record) => record.type === "refpage") && !index) warnings.push("book pages but no refindex: Books has no contents to list them by");
  if (Boolean(m.hasBook) !== hasPages) warnings.push(`hasBook is ${Boolean(m.hasBook)} but the pack ${hasPages ? "has" : "has no"} book pages${hasPages ? "" : ": Books will not list it"}`);
  const filed = organize({ ...m, hasStory: records.some((record) => record.type === "encounter") });
  return { errors, warnings, filed, records: records.length, media: media.size };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.log('Usage: node scripts/kpack-check.mjs "Book.kpack" [...]');
  process.exit(2);
}
let failed = false;
for (const file of files) {
  const { errors, warnings, filed, records = 0, media = 0 } = check(file);
  const size = (() => {
    try {
      return `${Math.round(statSync(file).size / 1024 / 1024)} MB`;
    } catch {
      return "?";
    }
  })();
  console.log(`${errors.length ? "FAIL" : "OK  "} ${path.basename(file)} (${size}, ${records} records, ${media} media)${filed ? `: filed under ${filed.kind} > ${filed.group}${filed.parent ? ` > ${filed.parent}` : ""}` : ""}`);
  for (const line of errors) console.log(`  error: ${line}`);
  for (const line of warnings) console.log(`  warning: ${line}`);
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
