// The Mill at Hob's Ford: a first adventure for Basic Fantasy, written for
// Kraken VTT (an original adventure; as an adaptation of the Basic Fantasy
// Role-Playing Game it is CC BY-SA 4.0 too: see LICENSE.md). Three to six
// characters of 1st level. Story entries, encounters linked to the Game
// Master's Guide's monsters, two maps with walls and doors, treasure parcels
// and a handout.
import fs from "node:fs";
import path from "node:path";
import { ids, imageRecord, link, md, slug } from "../lib/fg.mjs";
import { here, NOTICE, RULESET } from "./common.mjs";
import { MODULE as GM_GUIDE } from "./gm-guide.mjs";

export const MODULE = "The Mill at Hob's Ford";
const battle = (name, foes) => ({ name, npclist: ids(foes.map(([creature, count]) => ({ name: creature, count, faction: "foe", isidentified: 1, link: link("npc", `npc.${slug(creature)}@${GM_GUIDE}`) }))), __category: "Encounters" });
const story = (name, text) => ({ name, text: md(text), __category: MODULE });
const map = (name, file) => {
  const walls = JSON.parse(fs.readFileSync(path.join(here, "maps", `${file}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: walls.width, height: walls.height, grid: walls.grid, walls: walls.walls, category: "Maps" });
};
const parcel = (name, coins, items) => ({ name, coinlist: ids(Object.entries(coins).map(([coin, amount]) => ({ description: coin, amount }))), itemlist: ids(items.map(([item, count]) => ({ name: item, count }))), __category: "Treasure" });

const STORY = [
  story("00 About This Adventure", `**The Mill at Hob's Ford** is a first adventure for the *Basic Fantasy Role-Playing Game*: three to six characters of 1st level, one or two sessions. It was written for Kraken VTT.

**What has happened.** The village of **Hob's Ford** grinds its grain at an old stone mill on the river bank, a mile upstream. Under the mill are cellars older than the mill itself: a forgotten shrine where three soldiers of a long-gone lord were laid to rest. A week ago a band of **goblins**, led by a **hobgoblin** called **Grisk**, came down the river, found the cellars and moved in. They drove off the miller, **Old Hennet**, and have been stealing flour, chickens and a cow from the village by night.

What the goblins do not know: when they broke into the shrine looking for treasure, they woke its dead. The goblins have walled the shrine door shut with crates and are frightened to go near it.

**The job.** The village reeve offers **50 gp** to clear the mill, and Old Hennet promises the party what is in his strongbox, if they can find it: he hid it in the cellars' hidden room when the goblins came.

**Using Kraken.** Make the *Basic Fantasy Player's Handbook* and *Game Master's Guide* active with this adventure. Share the mill map first; the cellars when the party goes down. The encounters put their monsters on the combat tracker; the treasure parcels go to the party sheet.`),
  story("01 Hob's Ford", `*Read or tell:* **Hob's Ford is twenty cottages, a tavern called the Wet Boot, and a shallow crossing where the river runs wide over stones. The reeve, a stout woman named Marla Tull, meets you outside the tavern. "Goblins," she says, "in Hennet's mill. They come down at night and take what they like. Clear them out, and the village will pay you fifty gold."**

What the villagers know (one fact each, for asking around or buying a round):
- The goblins come by night, five or six of them; a bigger one with them "wears a red cloak and shouts".
- Old Hennet fled to his daughter's house in the village. He is frightened and angry, and wants his strongbox back (see the handout).
- The mill has cellars, "older than the mill"; the old folk say a lord's men were buried down there long ago.
- Hennet's dog went missing the night the goblins came.

Old Hennet gives the party **the handout** (*The Miller's Note*) if they promise to bring back his strongbox.`),
  story("02 The Mill", `*Map: The Mill at Hob's Ford.*

**The mill stands on the river bank, its wheel still and dripping. The door hangs open. Flour is trodden into the mud of the path, and something has been dragged inside.**

**The millroom** (the large room): the millstone, a table, and blood on the floor (the miller's dog: its bones are by the inner door). **Three goblins** are here, eating stolen bread; one watches the path. Roll surprise as the book says (1d6 for each side; surprised on 1-2). If two goblins fall, the third tries to flee down the stairs to warn Grisk (check its morale when the first falls: 2d6 against 7).

**The storeroom** (behind the inner door): sacks of flour, two barrels of beer, crates of the village's stolen goods (pots, a ham, a bolt of cloth). Nothing of great value.

**The stairs** in the millroom's corner go down to the cellars (entry 03).`),
  story("03 The Cellars", `*Map: The Cellars under the Mill.*

**The stair ends in a low room cut from the rock, smelling of damp and smoke. Cobwebs fill one corner. A passage runs east toward a flicker of firelight; another, narrower, runs south into darkness.**

The south passage ends after twenty feet at a blank wall: it is the **secret door** to the hidden room (entry 06). Searching finds it on 1 on 1d6 (1-2 for a Dwarf or an Elf; an Elf passing by notices it on 1). Old Hennet's note tells where it is.

The east passage leads to a door (unlocked) and the goblins' den (entry 04). The goblins can be heard from the passage, arguing.`),
  story("04 The Goblin Den", `**A long cave lit by a fire in an iron brazier. Straw bedding, gnawed bones, stolen crates. A big goblin in a red cloak sits on a crate, shouting at the others.**

**Grisk the hobgoblin** and **three goblins** (four if the one from the mill got away). Grisk fights while he is winning; check his morale (8) when he is reduced to half his hit points. The goblins check theirs (7) when Grisk falls, and those that fail try to surrender: they offer to show the party "the dead men's door" in return for their lives.

The crates against the south wall block a passage going south; moving them takes a turn. The goblins have scratched marks on them: a crude skull.

**Treasure:** in a sack under Grisk's bedding (the parcel *Goblin Den Loot*): 140 sp, 300 cp, 12 gp and a dagger.`),
  story("05 The Old Shrine", `**Behind the crates a short passage leads down into a hall of dressed stone. Four pillars hold up the roof. Two stone coffins lie open on either side of a black pool, and before the altar three figures stand up from the floor in rusted mail, their eyes empty.**

**Three skeletons**, the dead lord's soldiers. They attack anyone who enters, and pursue no further than the passage. A Cleric may try to Turn them (1st level: 13 or more on 1d20 against skeletons; 2d6 hit dice are affected). Turned skeletons stand back in the corners while the party is in the hall.

The altar bears an old inscription: *"They kept faith. Let them keep it still."* Under the altar's loose top lie a silver holy symbol (25 gp) and a vial of holy water.

If the party lays the skeletons' bones back in their coffins and closes them, they do not rise again; a Cleric who does so earns the party an extra **100 XP**.`),
  story("06 The Hidden Room", `**A small rough room behind the secret door. A wooden chest sits against the wall; beside it, the bones of some long-dead thief who found this room before the miller did.**

The chest is **Old Hennet's strongbox**. It is locked (a Thief may Open Locks; the key is in Hennet's pocket, if the party asks him). Inside (the parcel *The Miller's Strongbox*): 60 gp, 20 ep, 2 pp, a **potion of healing** and a vial of holy water.

The dead thief's bones hold a rotted bag with a rusty dagger and three iron spikes. Nothing else.`),
  story("07 Aftermath", `**Rewards.** Defeated monsters are worth their XP as the book gives them: goblins 10 each, Grisk 25, skeletons 25 each. The Game Master may add XP for treasure brought back (the book's optional rule: 1 XP for each gold piece). Old Hennet's strongbox, returned to him, earns his thanks and a free sack of flour a month for life.

The reeve pays the **50 gp** when the mill is clear. If the party kept the goblins alive and brought them to the village, the reeve asks what is to be done with them: that is the party's choice.

**Threads to follow.** The goblins came down the river from somewhere: Grisk's cloak is the red of a bigger tribe in the hills. And the inscription in the shrine names the lord the soldiers served, whose tower stands in ruins three days north.`),
];

const HANDOUT = {
  name: "08 Handout: The Miller's Note",
  text: md(`*A scrap of flour sack, written on in charcoal in a shaky hand.*

To whoever goes into my mill:

The goblins came in the night. I ran. I am not ashamed of it.

My strongbox is in the cellar, in the little room behind the wall. Go down the stair, take the narrow passage south, and at the end of it push the stone with the chalk mark at knee height. It swings.

Do NOT go into the old shrine past the goblins' cave. My father said never. I never did.

Bring the box back and what is in it is yours, all but the silver ring. That was my wife's.

— Hennet`),
  __category: MODULE,
};

export const MILL_AT_HOBS_FORD = {
  name: MODULE,
  displayName: "The Mill at Hob's Ford (Basic Fantasy)",
  category: "Basic Fantasy Adventures",
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: {
    encounter: [story("99 Credits and Licence", `**The Mill at Hob's Ford** is an original adventure written for Kraken VTT, for the *Basic Fantasy Role-Playing Game*.\n\n${NOTICE}`), ...STORY, HANDOUT],
    battle: [battle("Goblins in the Mill", [["Goblin", 3]]), battle("The Goblin Den", [["Hobgoblin", 1], ["Goblin", 3]]), battle("The Old Shrine", [["Skeleton", 3]])],
    treasureparcels: [parcel("Goblin Den Loot", { SP: 140, CP: 300, GP: 12 }, [["Dagger", 1]]), parcel("The Miller's Strongbox", { GP: 60, EP: 20, PP: 2 }, [["Potion of Healing", 1], ["Holy Water, per vial", 1]]), parcel("The Shrine's Altar", {},[["Holy Symbol", 1], ["Holy Water, per vial", 1]])],
    image: [map("The Mill at Hob's Ford", "hobs-ford-mill"), map("The Cellars under the Mill", "hobs-ford-cellars")],
  },
  pictures: Object.fromEntries(["hobs-ford-mill", "hobs-ford-cellars"].map((file) => [`images/${file}.webp`, path.join(here, "art", `${file}.webp`)])),
};
