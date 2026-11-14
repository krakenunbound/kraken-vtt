// SRD 5.2.1 Player's Rules: every rules chapter of the System Reference
// Document 5.2.1 as the book's pages (Playing the Game, Character Creation,
// Classes with their subclasses and spell lists, Character Origins, Feats,
// Equipment, Spells, the Rules Glossary, the Gameplay Toolbox), and the
// records the 5E character wizard, sheet, level up and tracker use: classes,
// subclasses, species and lineages, backgrounds, feats, equipment and spells.
// A players' book: it starts open to the players when made active.
import { CATEGORY, PLAYERS, RULESET, data, frontMatter } from "./common.mjs";
import { ANCESTRIES, BACKGROUNDS, CLASSES, FEATS, SPECIES, SUBCLASSES } from "./classes.mjs";
import { ITEMS } from "./gear.mjs";
import { SPELLS } from "./spells.mjs";

const reference = data("reference");
const CHAPTERS = ["Playing the Game", "Character Creation", "Classes", "Character Origins", "Feats", "Equipment", "Spells", "Rules Glossary", "Gameplay Toolbox"];

export const PLAYERS_RULES = {
  name: PLAYERS,
  displayName: PLAYERS,
  category: CATEGORY,
  ruleset: RULESET,
  author: "Kraken VTT",
  playersBook: true,
  players: {
    class: CLASSES,
    class_specialization: SUBCLASSES,
    race: SPECIES,
    race_subrace: ANCESTRIES,
    background: BACKGROUNDS,
    feat: FEATS,
    item: ITEMS,
    spell: SPELLS,
  },
  reference: [
    frontMatter(`The rules of the SRD 5.2.1 for players and GMs: ${CHAPTERS.join(", ")}. Once the book is active, its ${CLASSES.length} classes, ${SPECIES.length} species, ${BACKGROUNDS.length} backgrounds, feats, equipment and ${SPELLS.length} spells are in the 5E character wizard, on the sheets and on the Combat Tracker. The creatures are in SRD 5.2.1 Creatures, the magic items in SRD 5.2.1 Magic Items.`),
    ...CHAPTERS.map((name) => {
      const chapter = reference.find((entry) => entry.name === name);
      if (!chapter) throw new Error(`No chapter ${name} in the SRD data.`);
      return chapter;
    }),
  ],
};
