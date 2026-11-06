// Builds Kraken's own books (games/<game>/*.mjs) into Fantasy Grounds
// module folders in games/modules, which Kraken ships and reads as it reads
// any FG module. Run: node scripts/build-content.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeModule } from "../games/lib/fg.mjs";
import { PLAYERS_HANDBOOK } from "../games/descending-darkness/players-handbook.mjs";
import { BESTIARY } from "../games/descending-darkness/bestiary.mjs";
import { EMPTY_WATCHTOWER } from "../games/descending-darkness/empty-watchtower.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "games", "modules");
const modules = [PLAYERS_HANDBOOK, BESTIARY, EMPTY_WATCHTOWER];
for (const spec of modules) {
  const folder = writeModule(out, spec);
  console.log(`built ${path.relative(root, folder)}`);
}
