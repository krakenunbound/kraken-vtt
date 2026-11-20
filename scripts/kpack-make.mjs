// Makes a Maelstrom pack (.kpack) from a folder, for a person or an AI agent converting a book (docs/kpack-format.md):
//
//   <folder>/kraken-pack.json   what the book is (name, title, ruleset, kind, group... at least name and ruleset)
//   <folder>/records.json       its records ([] for a pack of pictures)
//   <folder>/images/...         its pictures, tokens, maps, sounds (any paths; the records name them by these paths)
//
//   node scripts/kpack-make.mjs <folder> [--out <packs folder>]
//   npm run kpack:make -- <folder>
//
// Fills in what can be counted (records, pictures, contents, hasBook, hasStory, made), works out kind, group and
// order when they are not given (shared/packs/organize.mjs), makes a 256 px thumbnail from the cover (or the first
// picture) when there is none, then writes <packs folder>/<ruleset>/<name>.kpack (Documents/Kraken VTT/Packs by
// default) and checks it with kpack-check. Maelstrom's Folders > Refresh then shows it, with the table still up.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { organize } from "../shared/packs/organize.mjs";

const args = process.argv.slice(2);
const folder = args.find((arg) => !arg.startsWith("--"));
const outAt = args.indexOf("--out");
const packs = outAt >= 0 ? args[outAt + 1] : process.env.KRAKEN_PACKS || path.join(homedir(), "Documents", "Kraken VTT", "Packs");
if (!folder || !existsSync(path.join(folder, "kraken-pack.json"))) {
  console.log("Usage: node scripts/kpack-make.mjs <folder with kraken-pack.json, records.json and its pictures> [--out <packs folder>]");
  process.exit(2);
}
const MEDIA = /\.(png|webp|jpe?g|gif|webm|mp4|ogg|mp3|wav|m4a)$/i;
const COMPRESSED = /\.(png|webp|jpe?g|gif|webm|mp4|ogg|mp3|m4a)$/i;
const LIST_OF = { refpage: "pages", npc: "npcs", item: "items", spell: "spells", spelldesc: "spells", encounter: "story", story: "story", storytemplate: "story", battle: "encounters", battlerandom: "encounters", treasureparcels: "parcels", tables: "tables", image: "images", quest: "quests", vehicle: "vehicles", location: "locations", class: "classes", race: "races", feat: "feats", skill: "skills", pregencharsheet: "characters", card: "cards", deck: "cards", note: "notes", effect: "effects" };

const manifest = JSON.parse(readFileSync(path.join(folder, "kraken-pack.json"), "utf8"));
const records = existsSync(path.join(folder, "records.json")) ? JSON.parse(readFileSync(path.join(folder, "records.json"), "utf8")) : [];
if (!manifest.name) throw new Error("kraken-pack.json needs a name.");
const media = readdirSync(folder, { recursive: true })
  .map((name) => String(name).replaceAll("\\", "/"))
  .filter((name) => MEDIA.test(name) && statSync(path.join(folder, name)).isFile());

const files = {};
for (const name of media) files[name] = [new Uint8Array(readFileSync(path.join(folder, name))), { level: COMPRESSED.test(name) ? 0 : 6 }];
// The thumbnail: the one given, else made from the cover or the first picture.
let thumbnail = manifest.thumbnail && files[manifest.thumbnail] ? manifest.thumbnail : "";
const source = manifest.cover && files[manifest.cover] ? manifest.cover : media.find((name) => /\.(png|webp|jpe?g)$/i.test(name));
if (!thumbnail && source) {
  thumbnail = "thumbnail.webp";
  files[thumbnail] = [new Uint8Array(await sharp(Buffer.from(files[source][0]), { limitInputPixels: 200_000_000 }).resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer()), { level: 0 }];
}
const contents = {};
for (const record of records) contents[LIST_OF[record.type] ?? "other"] = (contents[LIST_OF[record.type] ?? "other"] ?? 0) + 1;
const hasStory = records.some((record) => record.type === "encounter" || record.type === "story");
const filed = organize({ ...manifest, title: manifest.title || manifest.name, hasStory, hasBook: records.some((record) => record.type === "refpage") });
const full = {
  format: "kraken-pack",
  version: 3,
  ...manifest,
  title: manifest.title || manifest.name,
  ruleset: manifest.ruleset || "Any",
  kind: manifest.kind || filed.kind,
  group: manifest.group || filed.group,
  ...(manifest.order !== undefined ? { order: String(manifest.order) } : {}),
  ...(thumbnail ? { thumbnail } : {}),
  hasBook: records.some((record) => record.type === "refpage"),
  hasStory,
  records: records.length,
  contents,
  pictures: Object.keys(files).filter((name) => MEDIA.test(name)),
  made: new Date().toISOString(),
  from: manifest.from ?? { kind: "kpack-make" },
};
files["kraken-pack.json"] = strToU8(JSON.stringify(full, null, 1));
files["records.json"] = strToU8(JSON.stringify(records));

const home = path.join(packs, String(full.ruleset).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_"));
mkdirSync(home, { recursive: true });
const target = path.join(home, `${String(full.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}.kpack`);
writeFileSync(`${target}.part`, zipSync(files));
renameSync(`${target}.part`, target);
console.log(`made ${target}: ${records.length} records, ${full.pictures.length} pictures, filed under ${full.kind} > ${full.group}`);
execFileSync(process.execPath, [path.join(import.meta.dirname, "kpack-check.mjs"), target], { stdio: "inherit" });
