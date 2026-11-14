// The Lighthouse at Gull's End: a short starter scenario for Fate Core and
// Fate Accelerated, written for Kraken VTT (original text, names and maps;
// the rules it plays by are Fate's, CC BY 3.0, credited on its first page).
// Story entries with the scene's aspects, two conflicts (nameless and
// supporting NPCs, and a main NPC), two battle maps with their zones drawn
// in colour (games/tools/mapgen.py, then tools/zones.py), and three
// pregenerated characters in both games.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids, imageRecord, link, md, slug } from "../lib/fg.mjs";
import { CREDIT_CORE_FAE, TRADEMARK, NOT_ENDORSED, richText } from "./markdown.mjs";
import { npc } from "./toolkit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const NAME = "The Lighthouse at Gull's End";

const story = (n, name, text) => ({ name: `${String(n).padStart(2, "0")} ${name}`, text: richText(text), __category: NAME });
const STORY = [
  story(0, "About This Scenario", `**The Lighthouse at Gull's End** is a short scenario for three or four player characters, for **Fate Core** or **Fate Accelerated** (one session, two or three hours). It was written for Kraken VTT; its rules are Fate's.

> ${CREDIT_CORE_FAE}

${TRADEMARK} ${NOT_ENDORSED}

**What you need:** the Fate Core System or Fate Accelerated Edition book made active (the character wizard reads it), and this scenario. The Fate Toolkit and Adversaries book has more opposition if the table wants it.

**Pregenerated characters:** Rook Tallow, Ilsa Fenwright and Corin Gale, each made twice: for Fate Core (skills) and for Fate Accelerated (approaches). In the Characters window a player takes one as it is (*Pregenerated*), or makes their own with the wizard.

**In Kraken:** put the game aspects and each scene's situation aspects on the **Scene Aspects** strip (the GM's + on the strip, or *Start a scene*: the GM's fate points are set to one a player character). The two conflicts are encounters (drag them onto the combat tracker); the two maps have their zones outlined in colour.`),
  story(1, "The Situation", `For three nights the great lamp of **Gull's End** has stayed dark. On the third, the merchant ship *Kittiwake* broke on the rocks below it, and by morning there was nothing on the beach but planks: her cargo was gone before the tide was.

The harbour town of **Saltreach** wants to know why the light is out, and the keeper, **Isolde Varr**, has not come down the cliff in a week.

**What is really going on:** Captain **Mercy Sloane**, a smuggler, paid the keeper to let the light go dark, and holds the keeper's son aboard her ship to keep her quiet. Sloane's wreckers, led by **Tam Coller** (*the Lamp-Snuffer*), light false fires on the strand to lure ships onto the rocks, and strip what washes in.

**Game aspects** (on the strip for the whole session, kind *game*):

- _The Light Has Gone Out_
- _A Coast That Eats Ships_

**Story questions:** Will the heroes put the light back before another ship breaks? Will they free Isolde's son? Will Mercy Sloane get away with the *Kittiwake*'s cargo?`),
  story(2, "Scene One: Saltreach", `The harbour town at dusk. Fishing boats pulled high, a crowd at the harbourmaster's door, and the *Kittiwake*'s widowed owner, **Maren Hask**, shouting for someone to do something.

**Situation aspects:** _Angry Crowd on the Quay_, _Fog Rolling In_.

**What the heroes can learn** (overcome or create an advantage against Fair (+2), Contacts, Rapport, Investigate, Empathy; FAE Clever, Flashy, Careful):

- Lights were seen on the strand the night the *Kittiwake* sank: not the lighthouse's, low and moving. A success makes the aspect _False Fires on the Strand_ (one free invoke).
- Tam Coller has been spending silver in the taverns: _Tam Coller Is Flush With Silver_.
- A black-sailed ship has been anchored in the lee of the point: _The Ship Without a Flag_.

**Compel to offer:** a character with a past in Saltreach (Rook's _Saltreach Knows My Face_) is recognised and held up by old grievances: a fate point if they let it happen.`),
  story(3, "Scene Two: The Cliff Path", `The way down to the strand and up to the lighthouse is a goat-path along the cliff, at night, in a rising gale. Play it as a **challenge**: three overcome actions, each by a different hero or skill, against Fair (+2):

- **Keep your footing** on the wet stone (Athletics; FAE Careful or Quick).
- **Spot the wreckers' lookout** before he sees you (Notice; FAE Careful or Sneaky).
- **Find the way down in the dark** (Lore or Investigate; FAE Clever).

**Situation aspects:** _Slick Rocks_, _Howling Gale_.

Failures do not stop them: each costs something (a stress box, a lookout who runs to warn Tam Coller, the wreckers ready for them: one free invoke on _Ambush in the Dunes_ for the opposition in Scene Three).`),
  story(4, "Scene Three: Wreckers on the Strand", `**The Strand at Gull's End** (the map). The wreckers have built a fire on the beach to draw the next ship in. Tam Coller and three wreckers are stripping the *Kittiwake*'s last crates.

**Zones** (their outlines on the map):

- **Blue: The Surf.** Waist-deep, freezing water. _Breaking Waves_: moving into or out of it is an overcome (Athletics, Fair).
- **Orange: The Wreck.** What is left of the *Kittiwake*'s hull. _Splintered Timbers_; good cover.
- **Teal: The Tidepools.** _Slippery Rock Pools_.
- **Red: The Strand.** Open sand, the wreckers' _False Beacon Fire_ burning.
- **Purple: The Cliff Path.** Up to the lighthouse. _Narrow Ledge_.

**The conflict** (the encounter *Wreckers on the Strand*): **Tam Coller** (supporting NPC) and **Wreckers** (nameless, Fair; three, or a mob). The wreckers fight to keep their haul; Tam concedes when the fight turns ("I'll tell you who paid us!") rather than be taken out.

**If the heroes put out the false fire** (overcome against Good (+3), or as part of an attack's narration on a success with style) another ship is saved: tell the players, and remember it at the milestone.`),
  story(5, "Scene Four: The Lamp Room", `**The Lighthouse at Gull's End** (the map). Isolde Varr's cottage and the tower. Captain **Mercy Sloane** is here with two **deckhands**, collecting her last payment of silver from the keeper and making sure the lamp stays dark.

**Zones** (their outlines on the map):

- **Orange: The Keeper's Cottage.** Isolde is here, _Bound to a Chair_.
- **Teal: The Tower Floor.** The spiral stair up. _Barrels of Lamp Oil_.
- **Yellow: The Lamp Room** (upstairs, drawn beside the tower). The great lamp, cold. _The Great Lens_.
- **Green: The Yard.** The path from the cliff. _Wind-Bent Grass_.
- **Red: The Cliff's Edge.** _A Long Fall to the Rocks_.

**The conflict** (the encounter *The Lamp Room*): **Mercy Sloane** (main NPC) and two **Sloane's Deckhands** (nameless, Average). Sloane prefers talk to a fight, and a fight to losing: if the heroes threaten her, she offers a bargain (the boy for her freedom). She concedes rather than be taken out, and gets away on her ship unless the heroes have cut her off.

**Lighting the lamp** is an overcome against Great (+4) (Crafts, Lore; FAE Clever or Careful), easier with Isolde's help (+2, or a free invoke on _Isolde Knows This Lamp_ if a hero frees her).`),
  story(6, "Resolution and Milestones", `**If the light burns again** before dawn, the next ship comes safe into Saltreach, and the town owes the heroes: a new game aspect for the next session, _Heroes of Saltreach_.

**If Mercy Sloane got away**, she is a main NPC for the next scenario: give her a new aspect, _The Heroes of Gull's End Cost Me Everything_.

**Milestones:** at the end of the session, each player character reaches a **minor milestone** (switch two skills or approaches, rename an aspect, trade a stunt). If the story questions were answered (the light lit, the boy freed), it is a **significant milestone** instead: a skill point too. In Kraken: the sheet's *Milestones* tab, or the party sheet's *Milestones* tab for everyone at once.`),
  story(7, "The Pregenerated Characters", `Three heroes who know each other already (their aspects say so):

- **Rook Tallow**, _Disgraced Captain of the Harbour Watch_: a fighter, stubborn and loyal; trouble _I Owe the Wrong People_.
- **Ilsa Fenwright**, _Weather-Witch of the Western Isles_: wise in old lore and the moods of the sea; trouble _The Storm Answers Before I Ask_.
- **Corin Gale**, _Smuggler With a Conscience_: a liar and a sailor; trouble _Mercy Sloane Wants Me Back_ (the GM's best compel tonight).

Each comes in a Fate Core version (the skill pyramid, three stunts) and a Fate Accelerated version (approaches, one or two stunts), with refresh 3.`),
];

// --- Opposition and allies --------------------------------------------------------
const NPCS = [
  npc("Wrecker", { quality: "Fair", aspects: ["Lanterns on the Rocks", "Paid by the Wreck"], skills: [["Fight", 2], ["Athletics", 1], ["Stealth", 1]], physical: 1, text: "Three of them on the strand, or a mob of three.", category: "Gull's End" }),
  npc("Tam Coller, the Lamp-Snuffer", { kind: "supporting", aspects: ["Wrecker Chief of Gull's End", "Afraid of the Captain More Than of You", "The Tide Is My Friend"], skills: [["Fight", 3], ["Physique", 2], ["Athletics", 1], ["Deceive", 1]], physical: 3, mental: 2, consequences: "mild", stunts: [["Hook and Line", "+2 to Fight to create an advantage by dragging someone into the surf with his boat-hook."]], text: "He concedes when the fight turns against him, and gives up who paid him.", category: "Gull's End" }),
  npc("Captain Mercy Sloane", { kind: "main", aspects: ["Smuggler Captain Who Bought the Light", "Every Wreck Is My Cargo", "Corin Gale Owes Me", "Charming Until She Isn't", "The Sea Took My First Ship"], skills: [["Shoot", 4], ["Deceive", 3], ["Fight", 3], ["Rapport", 2], ["Will", 2], ["Notice", 2], ["Athletics", 1], ["Physique", 1], ["Contacts", 1], ["Resources", 1]], physical: 3, mental: 3, consequences: "mild, moderate, severe", stunts: [["Brace of Pistols", "+2 to Shoot when she attacks first in a conflict."], ["Silver Tongue", "She can use Deceive instead of Rapport to create advantages when she bargains."]], text: "She concedes rather than be taken out, and gets away on her ship unless the heroes have cut her off.", category: "Gull's End" }),
  npc("Sloane's Deckhand", { quality: "Average", aspects: ["Better Paid Than Brave"], skills: [["Fight", 1], ["Shoot", 1]], physical: 0, category: "Gull's End" }),
  npc("Isolde Varr, the Keeper", { kind: "supporting", aspects: ["Keeper of the Gull's End Light", "I Sold the Light to Save My Son", "Isolde Knows This Lamp"], skills: [["Lore", 3], ["Crafts", 2], ["Will", 1], ["Notice", 1]], physical: 2, mental: 3, consequences: "mild", text: "An ally, once freed: her help lighting the lamp is +2.", category: "Gull's End" }),
  npc("Maren Hask", { quality: "Average", aspects: ["The Kittiwake Was All I Had"], skills: [["Contacts", 1], ["Provoke", 1]], text: "The Kittiwake's owner, on the quay in Saltreach.", category: "Gull's End" }),
];

const fight = (name, foes) => ({ name, npclist: ids(foes.map(([who, count]) => ({ name: who, count, faction: "foe", isidentified: 1, link: link("npc", `npc.${slug(who)}@${NAME}`) }))), __category: "Conflicts" });
const BATTLES = [fight("Wreckers on the Strand", [["Tam Coller, the Lamp-Snuffer", 1], ["Wrecker", 3]]), fight("The Lamp Room", [["Captain Mercy Sloane", 1], ["Sloane's Deckhand", 2]])];
for (const item of BATTLES) for (const foe of Object.values(item.npclist)) if (!NPCS.some((record) => record.name === foe.name)) throw new Error(`${item.name}: no NPC ${foe.name}.`);

// --- Pregenerated characters, in both games -------------------------------------------
const pregen = (name, game, { aspects, skills, approaches, stunts, description }) => ({
  name: `${name} (${game === "fae" ? "Fate Accelerated" : "Fate Core"})`,
  game,
  aspects,
  ...(game === "core" ? { skilllist: ids(skills.map(([skill, rating]) => ({ name: skill, rating }))) } : { approaches }),
  stuntlist: ids(stunts.map(([stunt, text, skill = ""]) => ({ name: stunt, text, skill }))),
  refreshbase: 3,
  description,
  text: md(`${description}\n\n**High Concept:** _${aspects.highconcept}_\n\n**Trouble:** _${aspects.trouble}_\n\n**Aspects:** _${aspects.a1}_, _${aspects.a2}_, _${aspects.a3}_\n\n${game === "core" ? `**Skills:** ${skills.map(([skill, rating]) => `${skill} +${rating}`).join(", ")}` : `**Approaches:** ${Object.entries(approaches).map(([key, value]) => `${key[0].toUpperCase()}${key.slice(1)} +${value}`).join(", ")}`}\n\n**Stunts:** ${stunts.map(([stunt, text]) => `**${stunt}.** ${text}`).join(" ")}\n\n**Refresh:** 3`),
  __category: game === "fae" ? "Pregenerated (Fate Accelerated)" : "Pregenerated (Fate Core)",
});
const ROOK = { highconcept: "Disgraced Captain of the Harbour Watch", trouble: "I Owe the Wrong People", a1: "Saltreach Knows My Face", a2: "Corin Saved My Life Once", a3: "Never Leave Anyone in the Water" };
const ILSA = { highconcept: "Weather-Witch of the Western Isles", trouble: "The Storm Answers Before I Ask", a1: "My Grandmother's Sea-Glass Charm", a2: "Rook Is Too Stubborn to Die", a3: "Curious About Everything Drowned" };
const CORIN = { highconcept: "Smuggler With a Conscience", trouble: "Mercy Sloane Wants Me Back", a1: "Every Cove on This Coast", a2: "Ilsa Still Owes Me a Fair Wind", a3: "Quick Hands, Quicker Excuses" };
const PREGENS = [
  pregen("Rook Tallow", "core", { aspects: ROOK, description: "Broad, scarred and stubborn, Rook ran the Saltreach watch until a smuggler's bribe he never took got him thrown out.", skills: [["Fight", 4], ["Physique", 3], ["Notice", 3], ["Athletics", 2], ["Provoke", 2], ["Will", 2], ["Contacts", 1], ["Investigate", 1], ["Rapport", 1], ["Shoot", 1]], stunts: [["Watch Captain's Bark", "+2 to Provoke to create an advantage when he gives orders in a fight.", "Provoke"], ["Shield the Weak", "When someone in his zone is attacked, he can defend for them with Fight.", "Fight"], ["Harbour Brawler", "+2 to Fight attacks on a deck, a quay or anywhere wet and slippery.", "Fight"]] }),
  pregen("Ilsa Fenwright", "core", { aspects: ILSA, description: "A young witch from the islands, salt in her hair and questions on her lips, who hears the weather talk.", skills: [["Lore", 4], ["Will", 3], ["Empathy", 3], ["Notice", 2], ["Rapport", 2], ["Provoke", 2], ["Athletics", 1], ["Crafts", 1], ["Investigate", 1], ["Stealth", 1]], stunts: [["Call the Wind", "Once per scene she can use Lore to attack with a blast of storm wind, against anyone in her zone or the next.", "Lore"], ["Read the Sky", "+2 to Lore to create an advantage about the weather or the sea.", "Lore"], ["Calm Water", "+2 to Empathy to overcome someone's fear or anger.", "Empathy"]] }),
  pregen("Corin Gale", "core", { aspects: CORIN, description: "A smiling sailor with a hidden pocket for everything, who sailed for Mercy Sloane until he could not stomach it.", skills: [["Deceive", 4], ["Stealth", 3], ["Drive", 3], ["Burglary", 2], ["Shoot", 2], ["Athletics", 2], ["Contacts", 1], ["Notice", 1], ["Fight", 1], ["Resources", 1]], stunts: [["Old Friends in Every Port", "He can use Deceive instead of Contacts among sailors, smugglers and dockhands.", "Deceive"], ["Into the Dark", "+2 to Stealth to overcome when he moves between zones in darkness or fog.", "Stealth"], ["Born on a Deck", "+2 to Drive with any boat, in any weather.", "Drive"]] }),
  pregen("Rook Tallow", "fae", { aspects: ROOK, description: "Broad, scarred and stubborn, Rook ran the Saltreach watch until a smuggler's bribe he never took got him thrown out.", approaches: { careful: 2, clever: 1, flashy: 1, forceful: 3, quick: 2, sneaky: 0 }, stunts: [["Harbour Brawler", "Because I am a Harbour Brawler, I get a +2 when I Forcefully attack on a deck, a quay or anywhere wet and slippery."], ["Shield the Weak", "Because I Never Leave Anyone Behind, I get a +2 when I Carefully defend someone in my zone."]] }),
  pregen("Ilsa Fenwright", "fae", { aspects: ILSA, description: "A young witch from the islands, salt in her hair and questions on her lips, who hears the weather talk.", approaches: { careful: 2, clever: 3, flashy: 2, forceful: 1, quick: 1, sneaky: 0 }, stunts: [["Read the Sky", "Because I can Read the Sky, I get a +2 when I Cleverly create advantages about the weather or the sea."], ["Call the Wind", "Because the Storm Answers Me, once per game session I can call a gale that puts out every fire in a zone, or fills a ship's sails."]] }),
  pregen("Corin Gale", "fae", { aspects: CORIN, description: "A smiling sailor with a hidden pocket for everything, who sailed for Mercy Sloane until he could not stomach it.", approaches: { careful: 1, clever: 2, flashy: 1, forceful: 0, quick: 2, sneaky: 3 }, stunts: [["Into the Dark", "Because I Know Every Cove, I get a +2 when I Sneakily overcome obstacles in darkness or fog."], ["Old Friends in Every Port", "Because I have Old Friends in Every Port, once per game session I can find a sailor who owes me a favour."]] }),
];

const map = (name, file) => {
  const data = JSON.parse(fs.readFileSync(path.join(here, "maps", `${file}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: data.width, height: data.height, grid: data.grid, walls: data.walls, category: "Maps" });
};

export const GULLS_END = {
  name: NAME,
  displayName: "The Lighthouse at Gull's End (Fate scenario)",
  category: "Fate Adventures",
  ruleset: "Fate",
  author: "Kraken VTT (for Fate Core and Fate Accelerated)",
  gm: {
    encounter: STORY,
    npc: NPCS,
    battle: BATTLES,
    image: [map("The Strand at Gull's End", "strand"), map("The Lighthouse at Gull's End", "lighthouse")],
  },
  // The pregenerated characters are the players' (client.xml): the wizard shows them.
  players: { pregencharsheet: PREGENS },
  pictures: Object.fromEntries(["strand", "lighthouse"].map((file) => [`images/${file}.webp`, path.join(here, "art", `${file}.webp`)])),
};
export const GULLS_COUNTS = () => ({ story: STORY.length, npcs: NPCS.length, battles: BATTLES.length, pregens: PREGENS.length });
