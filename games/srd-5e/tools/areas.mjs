// The SRD 5.2.1 spells' areas, written into data/spells.json as `area`
// ({ shape: circle|cone|line|square, size, width?, origin: point|self, attach?,
// label } in feet), read from each spell's own words by Kraken's parser
// (shared/actions/parse.mjs areaOf: "20-foot-radius Sphere", "15-foot Cone",
// "100-foot-long, 5-foot-wide Line", "15-foot Cube", "15-foot Emanation").
// Run after tools/build.py: node games/srd-5e/tools/areas.mjs
// spells.mjs turns it into the cast action's FG 2024 shape (targeting sphere,
// cone, line, cube or emanation with its size), which the tracker reads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { areaOf } from "../../../shared/actions/parse.mjs";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "spells.json");
const spells = JSON.parse(fs.readFileSync(file, "utf8"));
let count = 0;
for (const spell of spells) {
  // The spell's own effect, not its higher-level notes; never a target count ("up to three creatures").
  const area = areaOf({ name: spell.name, range: spell.range, text: String(spell.text ?? "").split(/Using a Higher-Level Spell Slot/)[0] });
  if (area) {
    spell.area = area;
    count += 1;
  } else delete spell.area;
}
// The file's own layout (one space, no last newline), so only the areas change.
fs.writeFileSync(file, JSON.stringify(spells, null, 1));
console.log(`${count} of ${spells.length} spells have an area`);
