// The GM's book: the Fate System Toolkit SRD and the Fate Adversary Toolkit
// SRD (Evil Hat Productions, CC BY 3.0) as pages, and the SRDs' own example
// opposition as NPC records the combat tracker plays: the nameless,
// supporting and main NPCs of Fate Core's "Creating the Opposition", Fate
// Accelerated's mooks, and the Adversary Toolkit's enemies. Their aspects,
// skills, stress and stunts are the books'; each record says which book.
import { ids, md } from "../lib/fg.mjs";
import { CREDIT_ADVERSARIES, CREDIT_CORE_FAE, CREDIT_TOOLKIT, chapters, creditsPage } from "./markdown.mjs";

export const NAME = "Fate Toolkit and Adversaries";
export const RULESET = "Fate";

// An NPC as the books write it: kind (nameless, supporting, main), aspects,
// skills [name, rating] (a FAE mook's "Skilled (+2) at" as skills, its "Bad
// (-2) at" too), stress boxes (physical, mental), consequences, stunts.
export function npc(name, { kind = "nameless", quality = "", aspects = [], skills = [], approaches = null, physical = 0, mental = physical, consequences = "", stunts = [], mob = 1, source = "", text = "", category = "Opposition" }) {
  const words = [
    quality ? `${quality} nameless NPC.` : kind === "supporting" ? "A supporting NPC." : kind === "main" ? "A main NPC." : "A nameless NPC.",
    aspects.length ? `**Aspects:** ${aspects.map((aspect) => `_${aspect}_`).join(", ")}` : "",
    approaches ? `**Approaches:** ${Object.entries(approaches).map(([key, value]) => `${key[0].toUpperCase()}${key.slice(1)} ${value >= 0 ? "+" : ""}${value}`).join(", ")}` : "",
    skills.length ? `**Skills:** ${skills.map(([skill, rating]) => `${skill} ${rating >= 0 ? "+" : "−"}${Math.abs(rating)}`).join(", ")}` : "",
    `**Stress:** ${physical === mental ? `${physical || "no"} box${physical === 1 ? "" : "es"}` : `${physical} physical, ${mental} mental`}${consequences ? `; consequences ${consequences}` : "; no consequences"}${mob > 1 ? ` (a mob of ${mob})` : ""}`,
    ...stunts.map(([stunt, what]) => `**${stunt}.** ${what}`),
    text,
    source ? `_From ${source}._` : "",
  ].filter(Boolean);
  return {
    name,
    fatekind: kind,
    ...(quality ? { quality } : {}),
    aspectlist: ids(aspects.map((aspect) => ({ name: aspect }))),
    skilllist: ids(skills.map(([skill, rating]) => ({ name: skill, rating }))),
    ...(approaches ? { approaches } : {}),
    stuntlist: ids(stunts.map(([stunt, what]) => ({ name: stunt, text: what }))),
    stressphysical: physical,
    stressmental: mental,
    consequencelist: consequences,
    mob,
    text: md(words.join("\n\n")),
    __category: category,
  };
}

const CORE = "Fate Core System, Running the Game";
const FAE = "Fate Accelerated Edition, Being the GM";
const ADV = "the Fate Adversary Toolkit";
export const NPCS = [
  // Fate Core: nameless NPCs by quality, supporting and main NPCs.
  npc("Tavern-Keeper", { quality: "Average", aspects: ["I Don't Want No Trouble in My Place"], skills: [["Contacts", 1]], source: CORE, category: "Fate Core: Nameless" }),
  npc("Trained Thug", { quality: "Fair", aspects: ["The Ways of the Streets", "Violent Criminal"], skills: [["Fight", 2], ["Athletics", 1], ["Physique", 1]], physical: 1, source: CORE, category: "Fate Core: Nameless" }),
  npc("Collegia Arcana Court Mage", { quality: "Good", aspects: ["Haughty Demeanor", "Devoted to the Arcane Arts"], skills: [["Lore", 3], ["Deceive", 2], ["Will", 1], ["Empathy", 1]], physical: 2, source: CORE, category: "Fate Core: Nameless" }),
  npc("Street-Gang Tough", { quality: "Average", aspects: ["Ill-Informed Street-Gang Tough"], skills: [["Notice", 1], ["Fight", 1]], mob: 3, text: "From the book's example of a mob: six of them set upon Landon and Cynere, split into two mobs of three. Add them three at a time.", source: CORE, category: "Fate Core: Nameless" }),
  npc("Old Finn, Landon's Mentor", { kind: "supporting", aspects: ["Retired Vinfeld Militia Captain", "Too Old For This Shit", "Landon's Mentor"], skills: [["Shoot", 4], ["Fight", 3], ["Will", 2], ["Athletics", 1]], physical: 2, mental: 3, consequences: "mild", stunts: [["Battlefield Expert", "Can use Fight to create advantages in large-scale tactical situations."]], source: CORE, category: "Fate Core: Supporting" }),
  npc("Teran the Swift, Thief Extraordinaire", { kind: "supporting", aspects: ["Cutpurse and Scoundrel", "I Just Can't Help Myself"], skills: [["Burglary", 5], ["Stealth", 4], ["Lore", 3], ["Fight", 2], ["Physique", 1]], physical: 3, mental: 2, consequences: "mild", stunts: [["Inside Man", "+2 to Stealth in an indoor, urban environment."]], source: CORE, category: "Fate Core: Supporting" }),
  npc("Og the Strong", { kind: "supporting", aspects: ["Og Smash!", "Og Not Terribly Bright"], skills: [["Fight", 6], ["Physique", 5], ["Athletics", 4]], physical: 4, mental: 2, consequences: "mild, mild2, moderate", text: "Superb Physique: four physical stress boxes and an extra mild consequence for physical conflicts.", source: CORE, category: "Fate Core: Supporting" }),
  npc("Barathar, Smuggler Queen of the Sindral Reach", {
    kind: "main",
    aspects: ["Smuggler Queen of the Sindral Reach", "A Mostly Loyal Crew", "Remorse is For the Weak", "“Zird, Why Won't You Die?”", "My Ship, The Death Dealer", "A Harem of Thugs", "I've Got the Law in My Pocket"],
    skills: [["Deceive", 6], ["Fight", 6], ["Shoot", 5], ["Burglary", 5], ["Resources", 4], ["Will", 4], ["Contacts", 3], ["Notice", 3], ["Crafts", 2], ["Stealth", 2], ["Lore", 1], ["Physique", 1]],
    physical: 3,
    mental: 4,
    consequences: "mild, moderate, severe",
    stunts: [["Takes One to Know One", "Use Deceive instead of Empathy to create an advantage in social situations."], ["Feint Master", "+2 to use Deceive to create an advantage in a physical conflict."], ["Riposte", "If you succeed with style on a Fight defense, you can choose to inflict a 2-shift hit rather than take a boost."]],
    source: CORE,
    category: "Fate Core: Main",
  }),
  // Fate Accelerated: mooks, skilled (+2) at some things and bad (-2) at others, +0 at the rest.
  npc("Cyclops House Bully", { aspects: ["Cyclops House Bully", "Cowardly Without Backup"], skills: [["Frightening other students", 2], ["Weaseling out of trouble", 2], ["Breaking things", 2], ["Planning", -2], ["Studying", -2]], physical: 0, text: "No stress: the first hit takes them out.", source: FAE, category: "Fate Accelerated: Mooks" }),
  npc("Steel Assassin", { aspects: ["Steel Assassin", "The Night Is Ours"], skills: [["Sneaking", 2], ["Ambushing", 2], ["Standing up to determined opposition", -2]], physical: 1, source: FAE, category: "Fate Accelerated: Mooks" }),
  npc("Sky Shark", { aspects: ["I'm a Shark", "Vulnerable Belly"], skills: [["Flying", 2], ["Biting", 2]], physical: 2, text: "Bad (−2) at anything that isn't flying or biting.", source: FAE, category: "Fate Accelerated: Mooks" }),
  npc("Gang of Thugs", { aspects: ["Axe Handles & Crowbars"], skills: [["Ganging up", 2], ["Scaring innocent people", 2], ["Thinking ahead", -2], ["Fighting when outnumbered", -2]], physical: 2, mob: 4, text: "A group of four thugs played as one: a stress box for every two of them.", source: FAE, category: "Fate Accelerated: Mooks" }),
  // The Fate Adversary Toolkit's enemies.
  npc("Forward Scout", { aspects: ["Loyal Agent of the Empire", "Better Part of Valor"], skills: [["Athletics", 3], ["Shoot", 2], ["Stealth", 2]], physical: 2, mental: 2, consequences: "mild", stunts: [["Scout Armor", "The scout has Armor:1 against small-arms fire and melee weapons."]], text: "Countdown 5. Trigger (first box): the scout is attacked. Trigger (remaining boxes): one minute elapses. Outcome: reinforcements arrive. (The book's Sneak is Fate Core's Stealth here.)", source: ADV, category: "Adversary Toolkit" }),
  npc("Baron von Darkness", {
    kind: "main",
    aspects: ["Dark Lord of Crime", "“My intellect is unparalleled!”", "Fearsome Death Ray", "Wanted in Sixteen Countries", "“I'll rule this city one day.”"],
    skills: [["Contacts", 5], ["Deceive", 4], ["Will", 4], ["Provoke", 3], ["Rapport", 3], ["Shoot", 3], ["Crafts", 2], ["Fight", 2], ["Lore", 2], ["Physique", 2], ["Athletics", 1], ["Notice", 1], ["Empathy", 1], ["Stealth", 1]],
    physical: 3,
    mental: 4,
    consequences: "mild, moderate, severe",
    stunts: [["Contingency Plan", "Whenever Baron von Darkness takes a consequence, you can pay a fate point to remove him from the scene (in a puff of smoke), replacing him with two threats."]],
    text: "Average (+1) at everything else. Countdown 3: the bank robbed, the mayor assassinated, the undersea base; outcome: the city controlled from beneath the waves. (The book's Deceit is Fate Core's Deceive here.)",
    source: ADV,
    category: "Adversary Toolkit",
  }),
];

export const TOOLKIT = {
  name: NAME,
  displayName: "Fate Toolkit and Adversaries (GM)",
  category: "Fate GM",
  ruleset: RULESET,
  author: "Evil Hat Productions (SRDs, CC BY 3.0; adapted for Kraken VTT)",
  gm: { npc: NPCS },
  reference: [
    {
      name: NAME,
      sections: [
        {
          name: "About This Book",
          pages: [creditsPage("Fate Toolkit and Adversaries", [CREDIT_TOOLKIT, CREDIT_ADVERSARIES, CREDIT_CORE_FAE], "The Fate System Toolkit and the Fate Adversary Toolkit, Evil Hat's System Reference Documents, as the GM's book for Kraken VTT, with the opposition Fate Core and Fate Accelerated give as examples, ready for the combat tracker (NPCs: nameless, supporting and main).")],
        },
      ],
    },
    ...chapters("toolkit").map((chapter) => ({ ...chapter, name: `Toolkit: ${chapter.name.replace(/^\d+:\s*/, "")}` })),
    ...chapters("adversaries", { skip: [/^Fate Adversary Toolkit SRD$/i] }).map((chapter) => ({ ...chapter, name: `Adversaries: ${chapter.name}` })),
  ],
};
export const TOOLKIT_COUNTS = () => ({ npcs: NPCS.length, chapters: TOOLKIT.reference.length });
