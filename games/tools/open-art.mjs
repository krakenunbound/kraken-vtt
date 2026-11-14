// The open games' pictures for make_art.py: a cover for each book and a
// portrait (with its map token) for each creature, NPC and pregenerated
// character, as JSON on stdout. Each prompt is made from the record (its name,
// size, type and the first plain words of its description) unless
// art-list.json's open.<game>.looks gives the creature's look by its art key,
// then the game's own style is added.
//
//   node games/tools/open-art.mjs            the jobs (make_art.py reads them)
//   node games/tools/open-art.mjs --print    one line per picture, to read
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artKeyOf } from "../lib/fg.mjs";
import { CREATURES_SPEC } from "../srd-5e/creatures.mjs";
import { GM_GUIDE as BF_GM } from "../basic-fantasy/gm-guide.mjs";
import { WARDENS_GUIDE } from "../cairn/wardens-guide.mjs";
import { TROUBLE_IN_TWIN_LAKES } from "../cairn/trouble-in-twin-lakes.mjs";
import { IRONSWORN_BOOKS, STARFORGED_BOOKS } from "../ironsworn/books.mjs";
import { TOOLKIT } from "../fate/toolkit.mjs";
import { GULLS_END } from "../fate/gulls-end.mjs";
import { FATE_ACCELERATED } from "../fate/fate-accelerated.mjs";
import { GM_GUIDE as FORGED_GM } from "../forged-dark/gm-guide.mjs";
import { BRINE_STREET } from "../forged-dark/brine-street.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, "art-list.json"), "utf8")).open;

// Which books' records each game's art folder holds, and which style each
// record takes (Ironsworn's folder holds both games).
const BOOKS = {
  "srd-5e": [[CREATURES_SPEC, "srd-5e"]],
  "basic-fantasy": [[BF_GM, "basic-fantasy"]],
  cairn: [[WARDENS_GUIDE, "cairn"], [TROUBLE_IN_TWIN_LAKES, "cairn"]],
  ironsworn: [[IRONSWORN_BOOKS[1], "ironsworn"], [STARFORGED_BOOKS[1], "starforged"]],
  fate: [[TOOLKIT, "fate"], [GULLS_END, "fate-coast"], [FATE_ACCELERATED, "fate"]],
  "forged-dark": [[FORGED_GM, "forged-dark"], [BRINE_STREET, "forged-dark"]],
};
export const PORTRAIT_TYPES = ["npc", "pregencharsheet"];

const plainText = (value) => {
  const raw = typeof value === "string" ? value : value?.__rich ?? value?.__md ?? "";
  return String(raw).replace(/<\/(li|p)>/gi, ". ").replace(/<[^>]+>/g, " ").replace(/\*+|_+|#+/g, " ").replace(/\s+/g, " ").trim();
};
// The first descriptive words: sentences with no numbers in them (stat lines,
// dice, rules), at most about 240 characters.
const describe = (text) => {
  const sentences = plainText(text).replace(/\([^)]*\)/g, "").split(/(?<=[.!?])\s+/);
  let out = "";
  for (const sentence of sentences) {
    // Rules, not looks (a rule's words would be painted as lettering).
    if (/[:;"“”]|\d|\bHP\b|\bSTR\b|\bDEX\b|\bWIL\b|damage|sav(e|ing)|hit dice|hit points|armor|\bAC\b|statistics|attack|check|spell|round|poison|death ray|petrif|character|victim|weapon|level|treasure|morale|NPC|fate point|consequence|stunt|aspect|skill|table|target|cannot|immune|resistant|enhanced|impaired|critical|detachment|at will|surprise|travel|groups? of/i.test(sentence)) continue;
    if (out.length + sentence.length > 240) break;
    out += (out ? " " : "") + sentence;
  }
  return out.replace(/\s+/g, " ").replace(/\s*\.(\s*\.)+/g, ".").trim();
};
// Basic Fantasy's "Ant, Giant" reads "Giant Ant"; "Bear, Grizzly (or Brown)"
// reads "Grizzly Bear". Other games' commas are titles ("Old Finn, Landon's Mentor").
const plainName = (name, game) => {
  const bare = String(name).replace(/\s*\([^)]*\)\s*$/, "");
  const parts = bare.split(/,\s*/);
  return game === "basic-fantasy" && parts.length === 2 ? `${parts[1]} ${parts[0]}` : bare;
};

function lookOf(record, game, book) {
  const name = plainName(record.name, game);
  const bits = [];
  if (record.summary) bits.push(record.summary);
  if (record.features) bits.push(String(record.features).replace(/;\s*/g, ", "));
  if (record.aspects?.highconcept) bits.push(record.aspects.highconcept);
  const aspects = Object.values(record.aspectlist ?? {}).map((item) => item.name).filter(Boolean);
  if (aspects.length) bits.push(aspects[0]);
  if (record.cohorttype) bits.push(record.cohorttype);
  const about = describe(record.text) || describe(record.description) || describe(record.notes);
  if (about && !record.features) bits.push(about);
  const kind = [record.size, record.type].filter((part) => typeof part === "string" && part && part !== book && !/^(expert|gang|supporting|nameless|main|npc|creatures)$/i.test(part)).join(" ").toLowerCase();
  return `${name}${kind ? `, ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}` : ""}${bits.length ? `: ${bits.join(". ")}` : ""}`;
}

export function jobs() {
  const out = [];
  for (const [game, books] of Object.entries(BOOKS)) {
    const settings = spec[game];
    const seen = new Set();
    for (const [book, style] of books) {
      for (const side of ["gm", "players"]) for (const type of PORTRAIT_TYPES) for (const record of book[side]?.[type] ?? []) {
        const key = artKeyOf(record, type);
        if (seen.has(key)) continue;
        seen.add(key);
        const look = settings.looks?.[key] ?? lookOf(record, game, book.name);
        const frame = type === "pregencharsheet" || settings.people?.includes(key) || /humanoid/i.test(record.type ?? "") ? spec.styles[style].person : spec.styles[style].creature;
        out.push({ out: `games/${game}/art/npc/${key}.webp`, w: 768, h: 768, size: [768, 768], quality: 82, token: true, model: settings.models?.[key] ?? "zimage", seed: settings.seeds?.[key], prompt: `${look}, ${frame}` });
      }
    }
    for (const cover of settings.covers ?? []) {
      out.push({ out: `games/${game}/art/${cover.file}`, w: 896, h: 1200, size: [768, 1024], quality: 85, token: false, model: "qwen", seed: cover.seed, prompt: `${cover.prompt}, ${spec.styles[cover.style ?? game].cover}` });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const list = jobs();
  if (process.argv.includes("--print")) for (const job of list) console.log(`${job.out}\n    ${job.prompt}`);
  else process.stdout.write(JSON.stringify(list));
}
