// Keeps only the CC BY 4.0 parts of Datasworn's Ironsworn, Delve and
// Starforged data (github.com/datasworn-community/official-content,
// generated-datasworn/): every content object carries its own
// _source.license, and the Ironsworn and Delve packages mix CC BY 4.0 text
// (moves, assets, oracles, Delve's themes and domains) with CC BY-NC-SA text
// (the rulebooks' foes, truths, the Ironlands atlas, Delve's sites and
// rarities). An object without its own _source takes its parent's; the
// package's own top level takes the licence manifest.json gives the package
// (the stricter one: Ironsworn's and Delve's rules summaries are NC there).
// Everything NC is dropped; the counts kept and dropped are printed and
// written to games/ironsworn/data/filter-report.json.
//
//   node games/ironsworn/tools/filter-datasworn.mjs <generated-datasworn folder>
//
// The Datasworn schema and code are MIT; the content is Shawn Tomkin's,
// credited in games/ironsworn/LICENSE.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BY = "https://creativecommons.org/licenses/by/4.0";
const PACKAGES = ["classic", "delve", "starforged"];
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "data");

const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, "manifest.json"))) {
  console.error("Give the generated-datasworn folder (it has manifest.json).");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8"));
const isBy = (license) => /creativecommons\.org\/licenses\/by\/4\.0|^CC-BY-4\.0$/i.test(String(license ?? "").trim());

const report = { source: "Datasworn (datasworn-community/official-content), generated-datasworn", datasworn: manifest.datasworn_version, packages: {} };
fs.mkdirSync(out, { recursive: true });

for (const name of PACKAGES) {
  const entry = manifest.packages?.[name];
  if (!entry) throw new Error(`manifest.json has no ${name}`);
  const whole = JSON.parse(fs.readFileSync(path.join(source, entry.path), "utf8"));
  const kept = {};
  const dropped = {};
  const count = (into, node) => {
    const type = String(node.type ?? "object");
    into[type] = (into[type] ?? 0) + 1;
  };
  // A node is an object of Datasworn's when it has an _id and a type.
  const isObject = (node) => node && typeof node === "object" && !Array.isArray(node) && typeof node._id === "string" && typeof node.type === "string";
  // Everything inside a dropped object, counted too.
  const nested = (node) => (Array.isArray(node) ? node.reduce((sum, item) => sum + nested(item), 0) : node && typeof node === "object" ? Object.values(node).reduce((sum, value) => sum + nested(value), isObject(node) ? 1 : 0) : 0);
  let droppedInside = 0;
  let droppedText = 0;
  function walk(node, inherited) {
    if (Array.isArray(node)) return node.map((item) => walk(item, inherited)).filter((item) => item !== DROP);
    // Text outside any CC BY object, where the package is NC (Ironsworn's and Delve's rules summaries): dropped.
    if (typeof node === "string" && !isBy(inherited)) {
      droppedText += 1;
      return DROP;
    }
    if (!node || typeof node !== "object") return node;
    const license = node._source?.license ?? inherited;
    if (isObject(node)) {
      if (!isBy(license)) {
        count(dropped, node);
        droppedInside += nested(node) - 1;
        return DROP;
      }
      count(kept, node);
    }
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "_i18n") continue;
      if (key === "_source") {
        result._source = { title: value.title, page: value.page, license: value.license, ...(value.authors ? { authors: value.authors.map((author) => author.name) } : {}) };
        continue;
      }
      const next = walk(value, license);
      if (next !== DROP) result[key] = next;
    }
    // A container left with nothing (all of it NC) goes too.
    if (!isObject(node) && Object.keys(result).length === 0 && Object.keys(node).length > 0) return DROP;
    return result;
  }
  const DROP = Symbol("dropped");
  // The package's own top level: the manifest's licence for the package.
  const top = isBy(entry.license) ? BY : String(entry.license);
  const filtered = {};
  for (const [key, value] of Object.entries(whole)) {
    if (key === "license") continue;
    if (value && typeof value === "object") {
      const next = walk(value, top);
      if (next !== DROP) filtered[key] = next;
    } else filtered[key] = value;
  }
  // A top-level group with nothing CC BY left in it is removed (Ironsworn's rules, atlas, truths, foes).
  for (const [key, value] of Object.entries(filtered)) if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) delete filtered[key];
  filtered._kraken = { kept: "CC BY 4.0 objects only", license: BY, filteredBy: "games/ironsworn/tools/filter-datasworn.mjs" };
  fs.writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(filtered)}\n`);
  const sum = (counts) => Object.values(counts).reduce((total, value) => total + value, 0);
  report.packages[name] = { manifestLicense: entry.license, kept: sum(kept), dropped: sum(dropped), droppedNested: droppedInside, droppedTextOutsideObjects: droppedText, keptByType: kept, droppedByType: dropped };
  console.log(`${name}: kept ${sum(kept)} CC BY 4.0 objects, dropped ${sum(dropped)} NC (${Object.entries(dropped).map(([type, n]) => `${n} ${type}`).join(", ") || "none"}; ${droppedInside} objects inside them; ${droppedText} NC text fields outside any object)`);
}
fs.writeFileSync(path.join(out, "filter-report.json"), `${JSON.stringify(report, null, 1)}\n`);
console.log(`written to ${path.relative(process.cwd(), out)}`);
