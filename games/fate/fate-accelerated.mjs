// The Fate Accelerated Edition SRD (Evil Hat Productions, CC BY 3.0) as a
// players' book: every chapter as pages, and the records Kraken's rules and
// wizard read: the six approaches, the example stunts (the book's two
// templates and its characters' stunts), and the four example characters as
// pregenerated characters (taken as they are in the character wizard).
import { ids, md } from "../lib/fg.mjs";
import { CREDIT_CORE_FAE, chapters, creditsPage, plain, read, richText, sections } from "./markdown.mjs";
import { APPROACHES, APPROACH_NAMES, ratingOf } from "../../shared/fate/rules.mjs";

export const NAME = "Fate Accelerated Edition";

// The approaches, from "Choose Your Approach".
const howTo = read("fae/05-howto-do-stuff-outcomes-actions-and-approaches.md").body;
const choose = sections(howTo, 2).find((part) => /Choose Your Approach/i.test(part.title))?.body ?? "";
export const APPROACH_RECORDS = APPROACHES.map((key) => {
  const line = new RegExp(`^- \\*\\*${APPROACH_NAMES[key]}:\\*\\*\\s*(.*)$`, "m").exec(choose)?.[1] ?? "";
  return { name: APPROACH_NAMES[key], approach: 1, overcome: 1, advantage: 1, attack: 1, defend: 1, summary: plain(line), text: md(plain(line)), __category: "Approaches" };
});

// The stunts: the templates' examples ("Because I **am a Smooth Talker**, I get a +2 when I ...").
const stuntsBody = read("fae/09-stunts.md").body;
export const STUNTS = [];
for (const line of stuntsBody.split("\n").filter((row) => /^- Because I /.test(row))) {
  const who = /^- Because I \*\*(.+?)\*\*/.exec(line)?.[1] ?? "";
  const name = plain(who).replace(/^(am|have|can)\s+(a|an|the)?\s*/i, "").replace(/^\w/, (c) => c.toUpperCase());
  const approach = APPROACHES.find((key) => new RegExp(`\\b${APPROACH_NAMES[key].replace(/y$/, "")}`, "i").test(plain(line)));
  STUNTS.push({ name, skill: approach ? APPROACH_NAMES[approach] : "", summary: plain(line.replace(/^- /, "")), text: md(plain(line.replace(/^- /, ""))), __category: "Example Stunts" });
}

// The example characters: their aspects, approaches, stunts and refresh.
const people = sections(read("fae/12-example-characters.md").body, 2).filter((part) => part.title);
export const PREGENS = [];
for (const person of people) {
  const text = person.body;
  const field = (label) => plain(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.*)`).exec(text)?.[1] ?? "");
  const others = field("Other Aspects").split(";").map((item) => item.trim()).filter(Boolean);
  const approaches = Object.fromEntries(APPROACHES.map((key) => [key, ratingOf(field(APPROACH_NAMES[key]))]));
  const stuntPart = /#### STUNTS\s*\n([\s\S]*?)\n#### /.exec(text)?.[1] ?? "";
  const stunts = [...stuntPart.matchAll(/^\*\*(.+?):\*\*\s*(.*)$/gm)].map((match) => ({ name: plain(match[1]), text: plain(match[2]).replace(/\s*\(May take .*\)$/, ""), skill: "" }));
  PREGENS.push({
    name: person.title,
    game: "fae",
    aspects: { highconcept: field("High Concept"), trouble: field("Trouble"), a1: others[0] ?? "", a2: others[1] ?? "", a3: others[2] ?? "" },
    approaches,
    stuntlist: ids(stunts),
    refreshbase: 3,
    description: plain(text.split("\n\n")[0]),
    text: richText(text.replace(/^#### [A-Z ]+$/m, "")),
    __category: "Example Characters",
  });
}
if (PREGENS.length !== 4) throw new Error(`Fate Accelerated: four example characters expected, ${PREGENS.length} read.`);
// The example characters' stunts are examples too.
for (const person of PREGENS) for (const stunt of Object.values(person.stuntlist)) STUNTS.push({ name: stunt.name, skill: APPROACHES.map((key) => APPROACH_NAMES[key]).find((word) => new RegExp(`\\b${word.replace(/y$/, "")}`, "i").test(stunt.text)) ?? "", summary: stunt.text, text: md(stunt.text), __category: `${person.name}'s Stunts` });

export const FATE_ACCELERATED = {
  name: NAME,
  displayName: "Fate Accelerated Edition (Player's Reference)",
  category: "Fate",
  ruleset: "Fate Accelerated",
  author: "Evil Hat Productions (SRD, CC BY 3.0; adapted for Kraken VTT)",
  playersBook: true,
  players: { fateskill: APPROACH_RECORDS, fatestunt: STUNTS, pregencharsheet: PREGENS },
  reference: [
    {
      name: "Fate Accelerated Edition",
      sections: [
        {
          name: "About This Book",
          pages: [
            creditsPage("Fate Accelerated Edition", [CREDIT_CORE_FAE], "Fate Accelerated Edition's System Reference Document, as a reference book for Kraken VTT. In Kraken, the Characters window's wizard follows How Do I Make the Character? (aspects, approaches, stunts, refresh 3, three stress boxes) or takes one of the example characters as they are; the sheet rolls four Fate dice with an approach and invokes aspects for fate points; the combat tracker plays conflicts (turn order by Quick, attacks against defences in shifts, stress and consequences, taken out and conceding)."),
          ],
        },
      ],
    },
    ...chapters("fae", { skip: [/^Fate Accelerated Edition$/i] }),
  ],
};
export const FAE_COUNTS = () => ({ approaches: APPROACH_RECORDS.length, stunts: STUNTS.length, pregens: PREGENS.map((item) => item.name), chapters: FATE_ACCELERATED.reference.length });
