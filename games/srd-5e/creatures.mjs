// SRD 5.2.1 Creatures: every monster and animal stat block as an FG 5E NPC
// record (size, type, alignment, AC, hit points and dice, speed, abilities
// with their saves, skills, resistances, immunities, senses, languages, CR and
// XP, traits, actions, bonus actions, reactions, legendary actions). Actions
// keep the SRD's own words ("Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 +
// 2) Slashing damage."), which shared/dnd5e/rules.mjs npcAttacks reads, so the
// tracker rolls them. Grouped by creature type; the animals on their own.
import { ids, md } from "../lib/fg.mjs";
import { CATEGORY, CREATURES_BOOK, RULESET, data, frontMatter, plain } from "./common.mjs";

const CREATURES_DATA = data("creatures");
const reference = data("reference");

const PLURAL = { Aberration: "Aberrations", Beast: "Beasts", Celestial: "Celestials", Construct: "Constructs", Dragon: "Dragons", Elemental: "Elementals", Fey: "Fey", Fiend: "Fiends", Giant: "Giants", Humanoid: "Humanoids", Monstrosity: "Monstrosities", Ooze: "Oozes", Plant: "Plants", Undead: "Undead" };
const categoryOf = (creature) => {
  if (creature.chapter === "Animals") return "Animals";
  const swarm = /^Swarm of \w+ (\w+?)s?$/.exec(creature.type);
  const base = swarm ? swarm[1] : creature.type.split(/[\s(]/)[0];
  return PLURAL[base] ?? `${base}s`;
};
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
// An entry's words as FG keeps an NPC's (plain text, a line for each spell list).
const entries = (list) => ids((list ?? []).map((entry) => ({ name: entry.name, desc: String(entry.desc).split("\n").map(plain).join("\n") })));
const SHORT = { strength: "Str", dexterity: "Dex", constitution: "Con", intelligence: "Int", wisdom: "Wis", charisma: "Cha" };

export const CREATURES = CREATURES_DATA.map((creature) => {
  const abilities = Object.fromEntries(Object.entries(creature.abilities).map(([stat, row]) => [stat, { score: row.score, bonus: row.mod, savemodifier: row.save - row.mod }]));
  const saves = Object.entries(creature.abilities).filter(([, row]) => row.save !== row.mod).map(([stat, row]) => `${SHORT[stat]} ${signed(row.save)}`).join(", ");
  const dex = creature.abilities.dexterity?.mod ?? 0;
  const sections = creature.sections ?? {};
  const legendary = sections.legendaryactions ? [...(creature.intro?.legendaryactions ? [{ name: "Legendary Action Uses", desc: creature.intro.legendaryactions }] : []), ...sections.legendaryactions] : null;
  return {
    name: creature.name,
    size: creature.size,
    type: creature.type,
    alignment: creature.alignment,
    ac: Number(/\d+/.exec(creature.ac)?.[0] ?? 10),
    ...(/\D/.test(creature.ac.replace(/^\d+\s*/, "")) ? { actext: creature.ac.replace(/^\d+\s*/, "") } : {}),
    hp: creature.hp,
    hd: creature.hd,
    speed: creature.speed,
    abilities,
    ...(saves ? { savingthrows: saves } : {}),
    ...(creature.initiative !== null ? { initiative: { misc: creature.initiative - dex } } : {}),
    skills: creature.skills,
    damageresistances: creature.resistances,
    damagevulnerabilities: creature.vulnerabilities,
    damageimmunities: creature.damageimmunities,
    conditionimmunities: creature.conditionimmunities,
    ...(creature.gear ? { gear: creature.gear } : {}),
    senses: creature.senses,
    languages: creature.languages,
    cr: creature.cr,
    xp: creature.xp,
    ...(sections.traits ? { traits: entries(sections.traits) } : {}),
    ...(sections.actions ? { actions: entries(sections.actions) } : {}),
    ...(sections.bonusactions ? { bonusactions: entries(sections.bonusactions) } : {}),
    ...(sections.reactions ? { reactions: entries(sections.reactions) } : {}),
    ...(legendary ? { legendaryactions: entries(legendary) } : {}),
    ...(sections.lairactions ? { lairactions: entries(sections.lairactions) } : {}),
    __category: categoryOf(creature),
  };
});

// The book: the Monsters chapter (stat blocks explained), then every stat block by letter.
const letters = new Map();
for (const creature of [...CREATURES_DATA].sort((a, b) => a.name.localeCompare(b.name))) {
  const letter = creature.name[0].toUpperCase();
  if (!letters.has(letter)) letters.set(letter, []);
  letters.get(letter).push(`### ${creature.name}\n\n${creature.md}`);
}
const monsters = reference.find((chapter) => chapter.name === "Monsters");

export const CREATURES_SPEC = {
  name: CREATURES_BOOK,
  displayName: CREATURES_BOOK,
  category: CATEGORY,
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: { npc: CREATURES },
  reference: [
    frontMatter(`Every monster and animal stat block of the SRD 5.2.1: ${CREATURES.length} creatures, each an NPC in this campaign once the book is active (the Combat Tracker's NPC list, the Library). Their attacks, saves and spells roll on the tracker as the stat block says.`),
    ...(monsters ? [monsters] : []),
    {
      name: "Stat Blocks A–Z",
      sections: [{ name: "Monsters and Animals", pages: [...letters.entries()].map(([letter, blocks]) => ({ name: `Creatures: ${letter}`, keywords: blocks.map((block) => /^### (.+)$/m.exec(block)?.[1] ?? "").join(" "), text: blocks.join("\n\n") })) }],
    },
  ],
};
