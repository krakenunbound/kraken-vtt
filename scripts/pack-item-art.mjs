// Item pictures into the GM's own packs (Documents/Kraken VTT/Packs, or
// KRAKEN_PACKS): every item record without a picture whose kind has a
// painting gets one, the picture put inside that pack (images/item/<key>.webp)
// so each pack stands alone: removed or added, it never needs another's files.
// The paintings are read from the open games' folders (games/<game>/art/item)
// and from the GM's local folder of paintings for their own books
// (KRAKEN_ITEM_ART, default %APPDATA%/kraken-vtt/item-art), which never enter
// the repository. Each pack changed is backed up first (Packs/.item-art-backup).
//
//   node scripts/pack-item-art.mjs           what it would do (nothing written)
//   node scripts/pack-item-art.mjs --apply   write the packs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { itemKey } from "../games/lib/fg.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { unzipSync, zipSync, strFromU8, strToU8 } = require("fflate");
const apply = process.argv.includes("--apply");
const PACKS = process.env.KRAKEN_PACKS || path.join(os.homedir(), "Documents", "Kraken VTT", "Packs");
const LOCAL = process.env.KRAKEN_ITEM_ART || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "kraken-vtt", "item-art");

// Every painting there is, by key: the GM's own first, then each open game's.
const paintings = new Map();
const gather = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) if (file.endsWith(".webp") && !paintings.has(file.slice(0, -5))) paintings.set(file.slice(0, -5), path.join(dir, file));
};
gather(LOCAL);
for (const game of fs.readdirSync(path.join(ROOT, "games"))) gather(path.join(ROOT, "games", game, "art", "item"));

let packsChanged = 0;
let itemsDressed = 0;
let itemsLeft = 0;
for (const file of fs.readdirSync(PACKS).filter((name) => name.endsWith(".kpack"))) {
  const full = path.join(PACKS, file);
  let peek;
  try {
    peek = unzipSync(fs.readFileSync(full), { filter: (entry) => entry.name === "records.json" });
  } catch {
    continue;
  }
  const records = JSON.parse(strFromU8(peek["records.json"]));
  const wanting = records.filter((record) => record.type === "item" && !record.data?.picture);
  const dressable = wanting.filter((record) => paintings.has(itemKey(record.name)));
  itemsLeft += wanting.length - dressable.length;
  if (!dressable.length) continue;
  packsChanged += 1;
  itemsDressed += dressable.length;
  console.log(`${file}: ${dressable.length} of ${wanting.length} items without a picture get one`);
  if (!apply) continue;
  const zip = unzipSync(fs.readFileSync(full));
  const meta = JSON.parse(strFromU8(zip["kraken-pack.json"]));
  const added = new Set();
  for (const record of records) {
    if (record.type !== "item" || record.data?.picture) continue;
    const key = itemKey(record.name);
    const painting = paintings.get(key);
    if (!painting) continue;
    const inside = `images/item/${key}.webp`;
    record.data = { ...(record.data ?? {}), picture: inside };
    if (!zip[inside]) zip[inside] = new Uint8Array(fs.readFileSync(painting));
    added.add(inside);
  }
  meta.pictures = [...new Set([...(Array.isArray(meta.pictures) ? meta.pictures : []), ...added])];
  zip["records.json"] = strToU8(JSON.stringify(records));
  zip["kraken-pack.json"] = strToU8(JSON.stringify(meta, null, 1));
  // The pack as it was, kept once; the new one written beside it and moved into place.
  const backups = path.join(PACKS, ".item-art-backup");
  fs.mkdirSync(backups, { recursive: true });
  if (!fs.existsSync(path.join(backups, file))) fs.copyFileSync(full, path.join(backups, file));
  const entries = Object.fromEntries(Object.entries(zip).map(([name, data]) => [name, [data, { level: /\.(json|xml|txt)$/i.test(name) ? 6 : 0 }]]));
  fs.writeFileSync(`${full}.new`, zipSync(entries));
  fs.renameSync(`${full}.new`, full);
}
console.log(`${apply ? "" : "(nothing written: --apply to write) "}${packsChanged} packs, ${itemsDressed} items given their picture; ${itemsLeft} items still without one (no painting of their kind yet). Paintings: ${paintings.size}.`);
