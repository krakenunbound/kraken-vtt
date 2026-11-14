// Forged in the Dark: Scoundrel's Handbook, the players' book of Kraken's
// Forged in the Dark ruleset: the Blades in the Dark SRD's player-facing
// chapters (CC BY 3.0) as pages, and the records the wizard, the sheet and
// the crew sheet read: Kraken's seven playbooks and six crew types (made of
// the SRD's example abilities), the standard items, and the tables of
// heritages, backgrounds, vices, traumas, upgrades, claims and abilities.
import { ids, md, rich } from "../lib/fg.mjs";
import { chapterText, between, richText, sections, plain } from "./markdown.mjs";
import { ATTRIBUTION, BACKGROUNDS, CITY, CLAIMS, CREW_ABILITIES, CREWS, HERITAGES, ITEMS, PLAYBOOKS, SPECIAL_ABILITIES, UPGRADES } from "./content.mjs";
import { ACTIONS, OVERINDULGENCE, REPUTATIONS, TRAUMAS, VICES, titled } from "../../shared/forged/rules.mjs";

export const RULESET = "Forged in the Dark";
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Every book's front page: what it is, and the SRD's attribution word for word (the same size as the other credits).
export const frontPage = (what, about) => ({
  name: what,
  keywords: "credits license attribution",
  text: rich(`<p><b>${escape(what)}</b></p><p>${escape(about)}</p><p>${escape(ATTRIBUTION)}</p><p>Forged in the Dark is the open name of the system. Kraken VTT is not affiliated with or endorsed by One Seven Design. The rules text is the System Reference Document's; Kraken's own additions (the city of ${CITY}, the playbooks, crew types, items, people and the starter score) are marked as Kraken's. Kraken VTT's code is not covered by this licence.</p>`),
});
export const noticePage = (what) => ({ name: "Credits and License", keywords: "credits license attribution", text: rich(`<p><b>${escape(what)}</b></p><p>${escape(ATTRIBUTION)}</p><p>Kraken VTT's own text in this book (the playbooks, crew types, items, people and places of ${CITY}) is shared under the same licence, CC BY 3.0. See games/forged-dark/LICENSE.md.</p>`) });

// A chapter of the SRD: a page for each ## section (what comes before them, its first page).
export function chapter(title, { name = title, body } = {}) {
  const text = body ?? chapterText(title);
  const parts = sections(text, 2).filter((part) => plain(part.body));
  return { name, sections: [{ name, pages: parts.map((part) => ({ name: part.title || name, keywords: (part.title || name).toLowerCase(), text: richText(part.body) })) }] };
}

// --- Records ---------------------------------------------------------------------------
const abilityText = (ability) => md(`${ability.text}${ability.note ? `\n\n*${ability.note}*` : ""}`);
export const PLAYBOOK_RECORDS = PLAYBOOKS.map((playbook) => ({
  name: playbook.name,
  short: playbook.short,
  xptrigger: playbook.xptrigger,
  actions: Object.fromEntries(ACTIONS.map((action) => [action, playbook.actions[action] ?? 0])),
  abilities: ids(playbook.abilities.map((ability) => ({ name: ability.name, text: ability.text, ...(ability.note ? { note: ability.note } : {}) }))),
  friends: ids(playbook.friends),
  items: ids(playbook.items),
  description: md(`*${playbook.short}.* ${playbook.description}\n\n**Starting actions:** ${Object.entries(playbook.actions).map(([action, dots]) => `${titled(action)} ${dots}`).join(", ")}.\n\n**XP trigger:** ${playbook.xptrigger}\n\n**Special abilities:** ${playbook.abilities.map((ability) => ability.name).join(", ")}.\n\n**Friends and rivals:** ${playbook.friends.map((friend) => `${friend.name}, ${friend.text}`).join("; ")}.\n\n**Items:** ${playbook.items.map((item) => `${item.name} (${item.load})`).join(", ")}.\n\n*A playbook of Kraken's own, made of the SRD's example special abilities.*`),
  __category: "Playbooks",
}));
export const CREW_RECORDS = CREWS.map((crew) => ({
  name: crew.name,
  xptrigger: crew.xptrigger,
  startingupgrades: crew.startingUpgrades.join(", "),
  ...(crew.startingCohort ? { startingcohort: crew.startingCohort } : {}),
  operations: crew.operations.join(", "),
  contacts: ids(crew.contacts),
  abilities: ids(crew.abilities),
  upgrades: ids(crew.upgrades),
  claims: ids(crew.claims),
  description: md(`${crew.description}\n\n**XP trigger:** ${crew.xptrigger}\n\n**Starting upgrades:** ${crew.startingUpgrades.join(", ")}${crew.startingCohort ? ` (a gang of ${crew.startingCohort.type})` : ""}.\n\n**Favored operations:** ${crew.operations.join(", ")}.\n\n**Special abilities:** ${crew.abilities.map((ability) => ability.name).join(", ")}.\n\n**Crew upgrades:** ${crew.upgrades.map((upgrade) => upgrade.name).join(", ")}.\n\n**Contacts:** ${crew.contacts.map((contact) => `${contact.name}, ${contact.text}`).join("; ")}.\n\n**Claims:** ${crew.claims.map((claim) => claim.name).join(", ")}.\n\n*A crew type of Kraken's own, made of the SRD's example abilities, upgrades and claims.*`),
  __category: "Crew Types",
}));
export const ITEM_RECORDS = ITEMS.map((item) => ({ name: item.name, type: "Standard item", standard: 1, load: item.load, ...(item.armor ? { armor: item.armor } : {}), text: item.text, description: md(`${item.text}\n\n*Load ${item.load}.*`), __category: "Standard Items" }));
const table = (name, group, list) => ({ name, group, rows: ids(list.map((row) => ({ name: row.name, text: row.text ?? "", ...(row.note ? { note: row.note } : {}), ...(row.boxes ? { boxes: row.boxes } : {}), ...(row.turf ? { turf: 1 } : {}) }))), __category: "Tables" });
export const TABLES = [
  table("Heritages", "heritages", HERITAGES),
  table("Backgrounds", "backgrounds", BACKGROUNDS),
  table("Vices", "vices", Object.entries(VICES).map(([name, text]) => ({ name, text }))),
  table("Trauma Conditions", "traumas", Object.entries(TRAUMAS).map(([name, text]) => ({ name, text }))),
  table("Overindulgence", "overindulgence", Object.entries(OVERINDULGENCE).map(([name, text]) => ({ name, text }))),
  table("Crew Reputations", "reputations", REPUTATIONS.map((name) => ({ name }))),
  table("Crew Upgrades", "upgrades", UPGRADES),
  table("Claims", "claims", CLAIMS.map((entry) => ({ ...entry, ...(entry.name === "Turf" ? { turf: 1 } : {}) }))),
  table("Special Abilities", "abilities", SPECIAL_ABILITIES),
  table("Crew Special Abilities", "crewabilities", CREW_ABILITIES),
];

// --- Pages --------------------------------------------------------------------------------
const listPage = (name, intro, list) => ({ name, keywords: name.toLowerCase(), text: md(`${intro}\n\n${list.map((row) => `**${row.name}.** ${row.text}`).join("\n\n")}`) });
const playbookPages = PLAYBOOK_RECORDS.map((record, index) => ({ name: record.name, keywords: "playbook", text: rich(`${record.description.__rich}${PLAYBOOKS[index].abilities.map((ability) => `<h>${escape(ability.name)}</h>${abilityText(ability).__rich}`).join("")}`) }));
const crewPages = CREW_RECORDS.map((record) => ({ name: record.name, keywords: "crew type", text: record.description }));
const crewPlaybook = chapterText("Crew playbook");

export const SCOUNDRELS_HANDBOOK = {
  name: "Forged in the Dark Scoundrel's Handbook",
  displayName: "Forged in the Dark: Scoundrel's Handbook",
  category: "Forged in the Dark",
  ruleset: RULESET,
  author: "Based on Blades in the Dark by John Harper (adapted for Kraken VTT)",
  playersBook: true,
  players: { playbook: PLAYBOOK_RECORDS, crewtype: CREW_RECORDS, item: ITEM_RECORDS, forgedtable: TABLES },
  reference: [
    {
      name: "About This Book",
      sections: [
        {
          name: "About This Book",
          pages: [
            frontPage("Forged in the Dark: Scoundrel's Handbook", `The players' rules of Kraken's Forged in the Dark ruleset: a game about a crew of daring scoundrels building a criminal enterprise in the haunted city of ${CITY}. In Kraken, the Characters window's wizard follows the book's character creation; the sheet rolls action rolls (a d6 pool read by its highest die, with the GM's position and effect), resistance rolls and vice rolls on the table's dice; the party sheet is the crew sheet; the Combat window is the Score panel (no initiative: position, effect, the engagement roll and the clocks); and the Clocks window shows every progress clock to the whole table.`),
            { name: `${CITY}, in Brief`, keywords: "setting city brackwater", text: md(`*Kraken's own setting, not the SRD's.*\n\n${CITY} is an old port city of canals, salt fog and gaslight, at the mouth of a grey river where it meets a colder sea. Its nobles live high on the Upper Ward; its guilds run the docks, the lamps and the locks; the Harbor Watch keeps an order that can be bought. Below the bridges, in the tanneries, the night markets and the drowned old quarter, a hundred crews fight over what is left. You are one of them.\n\nThe city's dead do not always rest, and there are older things in the marshes than the city. Use as much or as little of the strange as your table likes.`) },
          ],
        },
      ],
    },
    chapter("The Basics"),
    chapter("The Core System"),
    chapter("Actions & Attributes"),
    chapter("Stress & Trauma"),
    chapter("Progress clocks", { name: "Progress Clocks" }),
    chapter("Action Roll"),
    chapter("Effect"),
    chapter("Setting Position & Effect"),
    chapter("Consequences and Harm"),
    chapter("Resistance and Armor"),
    chapter("Fortune Roll"),
    chapter("Gathering Information"),
    chapter("Coin and Stash"),
    chapter("Advancement"),
    chapter("Character creation", { name: "Character Creation", body: `${chapterText("Characters")}\n\n${chapterText("Character creation")}` }),
    {
      name: "Playbooks",
      sections: [
        { name: "Heritage and Background", pages: [listPage("Heritages", `*Kraken's own: the lands of ${CITY}'s people.* Choose one and write a detail about your family life.`, HERITAGES), listPage("Backgrounds", "*Kraken's own.* What you did before you joined the crew. Choose one and write a detail specific to your character.", BACKGROUNDS), listPage("Vices", "Every character is in thrall to some vice. Choose one, describe it, and name your vice purveyor and where to find them.", Object.entries(VICES).map(([name, text]) => ({ name, text }))), listPage("Standard Items", "*Kraken's own list.* Every scoundrel has access to these; choose your load on the job and check items as you need them. The number is the item's load.", ITEMS.map((item) => ({ name: `${item.name} (${item.load})`, text: item.text })))] },
        { name: "The Playbooks", pages: playbookPages },
      ],
    },
    { name: "Special Abilities", sections: [{ name: "Special Abilities", pages: [{ name: "Special Abilities", keywords: "special abilities", text: richText(between(chapterText("Character creation"), "Choose a special ability", "Choose one close friend and one rival")) }, ...SPECIAL_ABILITIES.map((ability) => ({ name: ability.name, keywords: "special ability", text: abilityText(ability) }))] }] },
    chapter("Crew creation", { name: "Crew Creation" }),
    {
      name: "Crews",
      sections: [
        { name: "Crew Types", pages: crewPages },
        { name: "Upgrades and Claims", pages: [{ name: "Crew Upgrades", keywords: "crew upgrades", text: richText(between(crewPlaybook, "Crew upgrades", "Make a Claim Map for the Crew")) }, { name: "Claims", keywords: "claims claim map", text: richText(between(crewPlaybook, "Make a Claim Map for the Crew", "Crew special abilities")) }] },
        { name: "Crew Special Abilities", pages: CREW_ABILITIES.map((ability) => ({ name: ability.name, keywords: "crew special ability", text: abilityText(ability) })) },
      ],
    },
    chapter("The Score"),
    chapter("Planning & engagement", { name: "Planning & Engagement" }),
    chapter("Teamwork"),
    chapter("Downtime"),
    chapter("Payoff"),
    chapter("Heat"),
    chapter("Downtime activities", { name: "Downtime Activities" }),
    { name: "Credits", sections: [{ name: "Credits", pages: [noticePage("Forged in the Dark: Scoundrel's Handbook")] }] },
  ],
};
