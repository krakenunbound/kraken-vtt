// Forged in the Dark: Game Master's Guide, the GM's book of Kraken's Forged
// in the Dark ruleset: the Blades in the Dark SRD's GM-facing chapters (CC BY
// 3.0: the faction game, entanglements, NPC and faction downtime, magnitude,
// rituals, crafting, cohorts, and how to make playbooks and crews), a page on
// running a score in Kraken, and records: example cohorts (Kraken's own) and
// the entanglement tables.
import { md } from "../lib/fg.mjs";
import { between, chapterText, entries, richText } from "./markdown.mjs";
import { CITY } from "./content.mjs";
import { chapter, frontPage, noticePage, RULESET } from "./scoundrels-handbook.mjs";
import { EDGES, ENTANGLEMENT_WORDS, ENTANGLEMENTS, FLAWS, GANG_SCALE, GANG_TYPES } from "../../shared/forged/rules.mjs";

// Cohorts as NPC records: the SRD's five gang types (its words) and a few experts of Kraken's own.
const gang = (type) => ({
  name: `Gang of ${type}`,
  kind: "gang",
  cohorttype: type,
  type: "Gang",
  quality: "Crew Tier",
  scale: "Crew Tier",
  text: GANG_TYPES[type],
  description: md(`**${type}:** ${GANG_TYPES[type]}\n\nA gang has scale and quality equal to the crew's Tier (${GANG_SCALE[0]} at Tier 0). Give it one or two edges and as many flaws.\n\n**Edges:** ${Object.keys(EDGES).join(", ")}. **Flaws:** ${Object.keys(FLAWS).join(", ")}.`),
  __category: "Cohorts",
});
const expert = (name, type, text) => ({ name, kind: "expert", cohorttype: type, type: "Expert", quality: "Crew Tier +1", scale: "0 (1 person)", text, description: md(`**Expert (${type}).** ${text}\n\n*Kraken's own example.* An expert has quality equal to the crew's Tier +1; their scale is always zero.`), __category: "Cohorts" });
export const COHORTS = [
  ...Object.keys(GANG_TYPES).map(gang),
  expert("Doctor Liesl Varn", "Physicker", `A canal-quarter physicker of ${CITY} who stitches wounds by lamplight and keeps her prices low and her questions lower.`),
  expert("Ebbe Strand", "Investigator", "A former Watch inspector, dismissed for honesty, who finds anyone in the city for a fee."),
  expert("Mirelle Ashgrove", "Occultist", "A medium of the old marsh tradition who can speak to, bind, or banish the restless dead."),
  expert("Quill", "Forger", "An elderly scribe who can reproduce any seal, signature or ledger hand after an hour's study."),
  expert("Gaunt Bastien", "Assassin", "A quiet killer with a gentle voice and no known address."),
];
// The entanglements, as the SRD's table by heat, for reading at the table (the Score panel rolls them).
const COLUMNS = { low: "Heat 0-3", mid: "Heat 4-5", high: "Heat 6" };
const entanglementTable = `| Result | ${Object.values(COLUMNS).join(" | ")} |\n| --- | --- | --- | --- |\n${["bad", "partial", "success"].map((result) => `| ${{ bad: "1-3", partial: "4-5", success: "6" }[result]} | ${Object.keys(COLUMNS).map((column) => ENTANGLEMENTS[column][result].join(" or ")).join(" | ")} |`).join("\n")}`;

export const GM_GUIDE = {
  name: "Forged in the Dark Game Master's Guide",
  displayName: "Forged in the Dark: Game Master's Guide",
  category: "Forged in the Dark",
  ruleset: RULESET,
  author: "Based on Blades in the Dark by John Harper (adapted for Kraken VTT)",
  gm: { npc: COHORTS },
  reference: [
    {
      name: "About This Book",
      sections: [
        {
          name: "About This Book",
          pages: [
            frontPage("Forged in the Dark: Game Master's Guide", "The Game Master's rules of Kraken's Forged in the Dark ruleset: the faction game, heat and entanglements, the downtime of NPCs and factions, magnitude, rituals and crafting, cohorts, and how to make your own playbooks and crews."),
            {
              name: "Running a Score in Kraken",
              keywords: "kraken score panel clocks",
              text: md(`*Kraken's own page.*\n\n**The Score panel** (the Combat button) replaces the initiative tracker: there is no initiative in this game. Set the **phase** (free play, the score, downtime), the **position** and the **effect** every player's next action roll uses (risky / standard by default), the target and its Tier, the **plan** and its **detail**, and make the **engagement roll** (1d for sheer luck, +1d for each major advantage, -1d for each disadvantage): its result sets the starting position.\n\n**The Clocks window** (and the strip at the top of the table) shows the progress clocks to everyone: 4, 6 or 8 segments (any number from 2 to 12), danger clocks, racing clocks (two that race each other), linked clocks (one that opens when another fills), tug-of-war clocks (ticked up and down) and long-term projects. A clock can be kept for the GM until it is shown. An action roll can tick a clock by its effect: limited 1, standard 2, great 3 (a critical one level more).\n\n**Players** roll from their sheets: an action rating and its dice on the table's 3D dice, the highest die read (two 6s are a critical; zero dice rolls two and keeps the lowest), with assistance (+1d, the helper takes 1 stress), pushing (+1d or +1 effect for 2 stress each) or a Devil's Bargain; resistance rolls (6 stress less the highest die); armor boxes; the vice roll in downtime.\n\n**Downtime** is on the Score panel too: payoff (rep and coin), heat (and the wanted level at 9), the entanglement roll (the heat column, wanted-level dice), and each PC's two activities (more for 1 coin or 1 rep each).\n\n**The crew sheet** is the party sheet's Crew tab: its type, Tier, hold, rep and turf, heat and wanted level, coin and vault, crew xp, special abilities, upgrades, contacts, cohorts, claims and faction status.`),
            },
          ],
        },
      ],
    },
    chapter("The Faction Game"),
    {
      name: "Entanglements",
      sections: [
        {
          name: "Entanglements",
          pages: [
            { name: "Entanglements", keywords: "entanglements", text: richText(chapterText("Entanglements").split("\n### Arrest")[0]) },
            { name: "The Entanglements Table", keywords: "entanglements table", text: md(`Find the column for the crew's heat; roll dice equal to its wanted level (zero: two dice, keep the lowest).\n\n${entanglementTable}`) },
            ...entries(chapterText("Entanglements").slice(chapterText("Entanglements").indexOf("\n### Arrest"))).map((entry) => ({ name: entry.name, keywords: "entanglement", text: richText(entry.markdown) })),
          ],
        },
      ],
    },
    { name: "NPC & Faction Downtime", sections: [{ name: "NPC & Faction Downtime", pages: [{ name: "NPC & Faction Downtime", keywords: "faction downtime clocks", text: richText(between(chapterText("Downtime activities"), "NPC & faction downtime", "DOWNTIME ACTIVITIES SUMMARY")) }] }] },
    { name: "Cohorts", sections: [{ name: "Cohorts", pages: [{ name: "Cohorts", keywords: "cohorts gangs experts", text: richText(between(chapterText("Crew creation"), "Cohorts", "Crew creation summary")) }] }] },
    chapter("Magnitude"),
    chapter("Rituals"),
    chapter("Crafting"),
    { name: "Making Playbooks and Crews", sections: [{ name: "Making Playbooks and Crews", pages: [{ name: "Making a Character Playbook", keywords: "playbook design", text: richText(chapterText("Character playbook").split("\n## Special abilities")[0]) }, { name: "Making a Crew Playbook", keywords: "crew design", text: richText(chapterText("Crew playbook").split("\n## Crew upgrades")[0]) }] }] },
    { name: "Credits", sections: [{ name: "Credits", pages: [noticePage("Forged in the Dark: Game Master's Guide")] }] },
  ],
};
export const GM_COUNTS = () => ({ cohorts: COHORTS.length, entanglements: Object.keys(ENTANGLEMENT_WORDS).length });
