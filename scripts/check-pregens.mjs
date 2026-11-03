// Step 2 parity: build all 132 SC C&C Common Room pregens from their specs
// with Kraken's SIEGE builder and compare with what FG's CCWizard.buildFromSpec
// produced: the summary numbers in cc-conversion/pregens/built/report.json,
// and the whole sheet FG exported (built/<key>.xml): scores, primes,
// modifiers, armor class parts, attack totals, inventory (count, worn,
// packed), coin, spells and their levels, languages, race, size, speed.
// node scripts/check-pregens.mjs [key-level ...]
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { buildFromSpec } from "../shared/siege/builder.mjs";
import { STATS } from "../shared/siege/engine.mjs";

const require = createRequire(import.meta.url);
const { readModule, fgDataFolder, convertXml } = require("../electron/importers/fgModule.cjs");

const BOOKS = ["C&C Player's Handbook", "C&C Adventurer's Backpack", "C&C Castle Keeper's Guide", "C&C Monsters & Treasure"];
const folder = path.join(fgDataFolder(), "cc-conversion", "pregens");
const report = JSON.parse(readFileSync(path.join(folder, "built", "report.json"), "utf8"));

const records = BOOKS.flatMap((book) => readModule(book).records);
const library = {
  packages: records.filter((r) => r.type === "siegepackage").map((r) => r.data),
  items: records.filter((r) => r.type === "item").map((r) => r.data),
  powers: records.filter((r) => r.type === "siegepower").map((r) => r.data),
  game: records.find((r) => r.type === "siegegame")?.data,
};

const rows = (node) => Object.values(node ?? {}).filter((value) => value && typeof value === "object");
const num = (value) => (value === undefined || value === true ? 0 : Number(value));

// The parts of a sheet compared, as flat "field = value" lines.
function facts(sheet) {
  const out = {};
  for (const field of ["level", "bth", "exp", "expnext"]) out[field] = num(sheet[field]);
  for (const field of ["hitdice", "race", "size", "speed", "senses", "alignment", "deity"]) out[field] = String(sheet[field] ?? "");
  out["hp.total"] = num(sheet.hp?.total);
  for (const stat of STATS) {
    const row = sheet.attributes?.[stat] ?? {};
    out[`${stat}.score`] = num(row.score);
    out[`${stat}.prime`] = num(row.prime);
    out[`${stat}.bonus`] = num(row.bonus);
  }
  for (const field of ["total", "dex", "armor", "shield", "equipmentarmor", "flatfooted", "touch", "head", "abilities"]) out[`ac.${field}`] = num(sheet.ac?.[field]);
  for (const [kind, row] of Object.entries(sheet.attack ?? {})) {
    out[`attack.${kind}.attr`] = num(row.attr);
    out[`attack.${kind}.total`] = num(row.total);
  }
  out.inventory = rows(sheet.inventorylist)
    .map((item) => `${item.name} x${num(item.count) || 1} c${num(item.carried)}${item.location ? ` in ${item.location}` : ""}`)
    .sort()
    .join(" | ");
  out.coins = rows(sheet.coins)
    .filter((coin) => num(coin.amount) > 0)
    .map((coin) => `${num(coin.amount)} ${String(coin.name).toLowerCase()}`)
    .sort()
    .join(", ");
  out.powers = rows(sheet.powers)
    .map((power) => `${power.name} ${num(power.level)}`)
    .sort()
    .join(", ");
  out.languages = rows(sheet.languagelist)
    .map((language) => language.name)
    .sort()
    .join(", ");
  // The load (SiegeLoad): encumbrance value, rating and band.
  if (sheet.load && sheet.load.er !== undefined && sheet.load.er !== true) out.load = `EV ${num(sheet.load.ev)} ER ${num(sheet.load.er)} ${sheet.load.category || "none"}`;
  return out;
}

// Sheets exported before the wizard learned "known" casters (Elf, Magi picks
// its spells from its known counts now): these are compared with a live
// build in Fantasy Grounds through the agent bridge instead, when FG is up.
const STALE = new Set(["aerendil-1", "aerendil-3", "lirael-1", "lirael-3"]);

async function fg(cmd, args) {
  const response = await fetch("http://127.0.0.1:47111/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd, args, timeout: 600 }),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(`FG ${cmd}: ${body.error}`);
  return body.data;
}

// FG builds the spec live (a scratch character, deleted again); its sheet.
async function liveSheet(spec) {
  const built = (await fg("call", { package: "CCWizard", fn: "buildFromSpec", args: [spec] })).result[0];
  try {
    return (await fg("db_get", { path: built.path, depth: 4, max: 5000 })).value;
  } finally {
    await fg("call", { package: "DB", fn: "deleteNode", args: [built.path] });
  }
}

const only = new Set(process.argv.slice(2));
const keys = readdirSync(path.join(folder, "specs"))
  .map((name) => name.replace(/\.json$/, ""))
  .filter((key) => only.size === 0 || only.has(key))
  .sort();
let failed = 0;
const byField = {};
for (const key of keys) {
  const spec = JSON.parse(readFileSync(path.join(folder, "specs", `${key}.json`), "utf8"));
  const { character, report: built } = buildFromSpec(spec, library);
  const wrong = [];
  if (!character) wrong.push(`not built: ${built.problems.join("; ")}`);
  else {
    const want = report[key];
    if (built.coinleft !== want.coinleft) wrong.push(`coinleft ${built.coinleft} want ${want.coinleft}`);
    const xml = path.join(folder, "built", `${key}.xml`);
    let fgSheet = null;
    let live = false;
    if (STALE.has(key)) {
      try {
        fgSheet = await liveSheet(spec);
        live = true;
      } catch (error) {
        wrong.push(`stale FG sheet, and live FG not reachable (${error.message})`);
      }
    } else if (existsSync(xml)) fgSheet = convertXml(readFileSync(xml, "utf8")).character;
    if (fgSheet) {
      if (live) console.log(`  ${key}: compared with a live FG build`);
      const ours = facts(character);
      const theirs = facts(fgSheet);
      for (const field of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
        // Older exports have no load: compared where FG's sheet has one.
        if (field === "load" && theirs.load === undefined) continue;
        if (ours[field] !== theirs[field]) {
          wrong.push(`${field}: ${JSON.stringify(ours[field])} want ${JSON.stringify(theirs[field])}`);
          byField[field] = (byField[field] ?? 0) + 1;
        }
      }
    } else if (!STALE.has(key)) wrong.push("no FG sheet to compare");
  }
  if (built.problems.length > 0) wrong.push(`problems: ${built.problems.join("; ")}`);
  if (wrong.length > 0) {
    failed += 1;
    console.log(`FAIL ${key} (${spec.race} ${spec.class} ${spec.level}):\n  ${wrong.join("\n  ")}`);
  }
}
console.log(`${keys.length - failed}/${keys.length} pregens match FG's exported sheets${failed ? `; differing fields ${JSON.stringify(byField)}` : ""}`);
process.exit(failed ? 1 : 0);
