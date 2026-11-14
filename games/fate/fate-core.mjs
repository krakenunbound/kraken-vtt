// The Fate Core System SRD (Evil Hat Productions, CC BY 3.0) as a players'
// book: every chapter as pages, and the records Kraken's rules and wizard
// read: the 18 skills of the default skill list (what each does: overcome,
// create an advantage, attack, defend) and their example stunts.
import { ids, md } from "../lib/fg.mjs";
import { CREDIT_CORE_FAE, chapters, creditsPage, plain, read, richText, sections } from "./markdown.mjs";

export const NAME = "Fate Core System";
const { body } = read("core/06-skills-and-stunts.md");
const list = sections(body, 2).find((part) => /DEFAULT SKILL LIST/i.test(part.title))?.body ?? "";
// The skill list's table: which actions each skill does.
const ACTIONS = {};
for (const line of list.split("\n").filter((row) => /^\|/.test(row) && !/---/.test(row))) {
  const cells = line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  if (cells[0] && cells[0] !== "Skill") ACTIONS[cells[0]] = { overcome: cells[1] ? 1 : 0, advantage: cells[2] ? 1 : 0, attack: cells[3] ? 1 : 0, defend: cells[4] ? 1 : 0 };
}
// The text of an action ("**Attack:** Fight lets you...").
const actionText = (text, word) => plain(new RegExp(`\\*\\*${word}:\\*\\*\\s*([^\\n]*)`).exec(text)?.[1] ?? "");
export const SKILLS = [];
export const STUNTS = [];
for (const part of sections(list, 3).filter((item) => ACTIONS[item.title])) {
  const [about, stuntsPart = ""] = part.body.split(/^#### .*Stunts\s*$/m);
  SKILLS.push({
    name: part.title,
    ...ACTIONS[part.title],
    summary: plain(about.split("\n\n")[0]),
    overcometext: actionText(about, "Overcome"),
    advantagetext: actionText(about, "Create an Advantage"),
    attacktext: actionText(about, "Attack"),
    defendtext: actionText(about, "Defend"),
    text: richText(about),
    __category: "Skills",
  });
  for (const line of stuntsPart.split("\n").filter((row) => /^- \*\*/.test(row))) {
    const match = /^- \*\*(.+?)\.?\*\*\.?\s*(.*)$/.exec(line);
    if (!match) continue;
    STUNTS.push({ name: plain(match[1]).replace(/\.$/, ""), skill: part.title, summary: plain(match[2]), text: md(plain(match[2])), __category: `${part.title} Stunts` });
  }
}
if (SKILLS.length !== 18) throw new Error(`Fate Core: 18 skills expected, ${SKILLS.length} read.`);

export const FATE_CORE = {
  name: NAME,
  displayName: "Fate Core System (Player's Reference)",
  category: "Fate",
  ruleset: "Fate Core",
  author: "Evil Hat Productions (SRD, CC BY 3.0; adapted for Kraken VTT)",
  playersBook: true,
  players: { fateskill: SKILLS, fatestunt: STUNTS },
  reference: [
    {
      name: "Fate Core System",
      sections: [
        {
          name: "About This Book",
          pages: [
            creditsPage("Fate Core System", [CREDIT_CORE_FAE], "The Fate Core System's System Reference Document, as a reference book for Kraken VTT. In Kraken, the Characters window's wizard follows Character Creation (the phase trio, the skill pyramid, stunts and refresh); the sheet rolls four Fate dice with a skill, invokes aspects for fate points, keeps stress and consequences; the combat tracker plays conflicts (turn order by Notice, attacks against defences in shifts, stress, consequences, taken out and conceding); the Scene Aspects strip keeps the scene's situation aspects, boosts and free invokes, and the GM's fate points."),
            { name: "The Ladder", keywords: "ladder adjectives", text: richText("| Rating | Adjective |\n| --- | --- |\n| +8 | Legendary |\n| +7 | Epic |\n| +6 | Fantastic |\n| +5 | Superb |\n| +4 | Great |\n| +3 | Good |\n| +2 | Fair |\n| +1 | Average |\n| +0 | Mediocre |\n| −1 | Poor |\n| −2 | Terrible |") },
          ],
        },
      ],
    },
    ...chapters("core", { skip: [/^Fate Core System$/i, /^FEEDBACK HEROES$/i] }),
  ],
};
export const CORE_COUNTS = () => ({ skills: SKILLS.length, stunts: STUNTS.length, chapters: FATE_CORE.reference.length });
