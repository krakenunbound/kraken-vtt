// The item pictures: one painting for each kind of item in the built books
// (games/modules), made once and copied into every game that has that item,
// each game keeping its own copy (games/<game>/art/item/<key>.webp) so no
// game's packs depend on another's. scripts/build-content.mjs puts each
// book's own pictures inside the book (fg.mjs withItemArt).
//
// Each prompt is the item's name, its kind, and the words of its own
// description that say what it looks like (rules are left out: they would be
// painted as lettering), in the look of the game that owns it.
//
//   node games/tools/item-art.mjs            the jobs, JSON (paint them with h3_image.py)
//   node games/tools/item-art.mjs --print    one line per picture, to read
//   node games/tools/item-art.mjs --missing  only those not painted yet
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gameOfBook, itemKey } from "../lib/fg.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const require = createRequire(import.meta.url);
const { readModule } = require(path.join(root, "electron", "importers", "fgModule.cjs"));

// What each item looks like, written for the painter: { key: "a small glass vial of ..." }.
const LOOKS_FILE = path.join(here, "item-looks.json");
const LOOKS_BY_KEY = fs.existsSync(LOOKS_FILE) ? JSON.parse(fs.readFileSync(LOOKS_FILE, "utf8")) : {};

// The games in the order a shared item takes its look from (all the shared ones are fantasy).
const ORDER = ["srd-5e", "basic-fantasy", "descending-darkness", "cairn", "ironsworn", "fate", "forged-dark", "apeira-astra"];
const STYLE = {
  fantasy: "one single object shown on its own, the whole object in view and centered, a medieval fantasy item illustration, realistic painterly oil painting, fine detail, soft warm light from the upper left, dark neutral background, no people, no hands, no text, no letters, no writing, no watermark, no frame, no border",
  scifi: "one single object shown on its own, the whole object in view and centered, gritty space frontier science fiction equipment, worn industrial technology, realistic painterly illustration, fine detail, cinematic light, dark neutral background, no people, no hands, no text, no letters, no writing, no watermark, no frame, no border",
  gaslight: "one single object shown on its own, the whole object in view and centered, a nineteenth-century gaslight-era object from a dark canal city, realistic painterly oil painting, fine detail, warm lamplight, dark neutral background, no people, no hands, no text, no letters, no writing, no watermark, no frame, no border",
};
const styleOf = (game) => (game === "apeira-astra" ? STYLE.scifi : game === "forged-dark" ? STYLE.gaslight : STYLE.fantasy);

const plain = (value) =>
  String(typeof value === "string" ? value : value?.__rich ?? value?.__md ?? "")
    .replace(/<\/(li|p)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// What it looks like: sentences that describe it (its stuff, colour, shape), not its rules.
const LOOKS = /\b(made|carved|wrought|forged|crafted|fashioned|bound|covered|set with|inlaid|engraved|etched|studded|decorated|shaped|looks?|appears?|resembles?|glows?|gleam|shimmer|color|colou?red|wood(en)?|iron|steel|bronze|brass|copper|silver|gold(en)?|bone|ivory|leather|cloth|silk|wool|glass|crystal|stone|gem|jewel|vial|flask|bottle|jar|pouch|sack|box|chest|tube|rod|staff|wand|ring|amulet|cloak|robe|boots|gloves|helm|belt|horn|lantern|candle|rope|chain|blade|hilt|haft|shaft|head|red|blue|green|black|white|yellow|purple|grey|gray|rusted|worn|battered|polished|ornate|plain|small|large|tiny|heavy|light(weight)?|long|short)\b/i;
const RULES = /\d|\b(you|your|creature|target|saving|save|damage|attack|bonus|spell|charges?|action|turn|round|hit points?|DC|AC|advantage|disadvantage|proficien|attune|while|when|can|must|cannot|roll|check|level|character|wielder|wearer|user|owner|effect|minute|hour|feet|ft\.?)\b/i;
function looksOf(record) {
  const text = plain(record.data?.description ?? record.data?.text ?? record.data?.notes ?? "");
  const sentences = text.replace(/\([^)]*\)/g, "").split(/(?<=[.!?])\s+/);
  let out = "";
  for (const sentence of sentences) {
    if (!LOOKS.test(sentence) || RULES.test(sentence)) continue;
    if (out.length + sentence.length > 260) break;
    out += (out ? " " : "") + sentence.replace(/[.!?]+$/, "");
  }
  return out;
}
const kindOf = (record) => {
  const words = [record.data?.subtype, record.data?.type].map((part) => String(part ?? "").trim()).filter((part) => part && !/^(item|gear|equipment|adventuring gear|treasure|wondrous items?|magic items?)$/i.test(part));
  return [...new Set(words.map((word) => word.toLowerCase().replace(/s$/, "")))].join(", ");
};

export function jobs() {
  const byKey = new Map();
  for (const name of fs.readdirSync(path.join(root, "games", "modules"))) {
    const game = gameOfBook(name);
    const dir = path.join(root, "games", "modules", name);
    if (!game || !fs.existsSync(path.join(dir, "definition.xml"))) continue;
    for (const record of readModule(dir).records ?? []) {
      if (record.type !== "item") continue;
      const key = itemKey(record.name);
      if (!key) continue;
      const entry = byKey.get(key) ?? { key, games: new Set(), records: [] };
      entry.games.add(game);
      entry.records.push({ game, record });
      byKey.set(key, entry);
    }
  }
  const out = [];
  for (const { key, games, records } of byKey.values()) {
    const owner = ORDER.find((game) => games.has(game)) ?? [...games][0];
    // The fullest description among the games that have it, from the owner's family first.
    const ranked = [...records].sort((a, b) => (a.game === owner ? -1 : 0) - (b.game === owner ? -1 : 0) || looksOf(b.record).length - looksOf(a.record).length);
    const record = ranked[0].record;
    const name = String(record.name).replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*[+-]\d+\s*$/, "");
    // The written look (item-looks.json: what the object looks like, from its text and how it is
    // usually shown) wins; else the description's own words of its look.
    const written = LOOKS_BY_KEY[key];
    const look = written ?? ranked.map((item) => looksOf(item.record)).find(Boolean) ?? "";
    const kind = kindOf(record);
    const prompt = written ? `${name}: ${written.replace(/[.\s]+$/, "")}. ${styleOf(owner)}` : `${name}${kind ? `, ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}` : ""}${look ? `: ${look}` : ""}. ${styleOf(owner)}`;
    out.push({ name: key, key, owner, games: [...games], out: `games/${owner}/art/item/${key}.webp`, copies: [...games].filter((game) => game !== owner).map((game) => `games/${game}/art/item/${key}.webp`), prompt, w: 1024, h: 1024, seed: 7 });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let list = jobs();
  if (process.argv.includes("--missing")) list = list.filter((job) => [job.out, ...job.copies].some((file) => !fs.existsSync(path.join(root, file))));
  if (process.argv.includes("--print")) for (const job of list) console.log(`${job.key} [${job.games.join(", ")}]\n    ${job.prompt}`);
  else process.stdout.write(JSON.stringify(list));
}
