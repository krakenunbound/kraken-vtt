// Builds Kraken's own books (games/<game>/*.mjs) into Fantasy Grounds
// module folders in games/modules, which Kraken ships and reads as it reads
// any FG module. Run: node scripts/build-content.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeModule } from "../games/lib/fg.mjs";
import { PLAYERS_HANDBOOK } from "../games/descending-darkness/players-handbook.mjs";
import { BESTIARY } from "../games/descending-darkness/bestiary.mjs";
import { EMPTY_WATCHTOWER } from "../games/descending-darkness/empty-watchtower.mjs";
import { CREW_HANDBOOK } from "../games/apeira-astra/crew-handbook.mjs";
import { DOSSIER } from "../games/apeira-astra/dossier.mjs";
import { SALVAGE_RIGHTS } from "../games/apeira-astra/salvage-rights.mjs";
// The SRD 5.2.1 (CC BY 4.0) as D&D 5E's own books.
import { PLAYERS_RULES } from "../games/srd-5e/players-rules.mjs";
import { CREATURES_SPEC } from "../games/srd-5e/creatures.mjs";
import { MAGIC_ITEMS_SPEC } from "../games/srd-5e/magic-items.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "games", "modules");
const modules = [PLAYERS_HANDBOOK, BESTIARY, EMPTY_WATCHTOWER, CREW_HANDBOOK, DOSSIER, SALVAGE_RIGHTS, PLAYERS_RULES, CREATURES_SPEC, MAGIC_ITEMS_SPEC];
for (const spec of modules) {
  const folder = writeModule(out, spec);
  console.log(`built ${path.relative(root, folder)}`);
}
