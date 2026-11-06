// The Empty Watchtower: Descending Darkness's first adventure, for three to
// five characters of 1st level (they should reach 2nd). Story entries (FG's
// encounter records), battles linked to the Bestiary, and the tower's maps
// with their walls and doors.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids, imageRecord, link, md, slug } from "../lib/fg.mjs";
import { RULESET } from "./players-handbook.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BESTIARY = "Descending Darkness Bestiary";
const MODULE = "The Empty Watchtower";

const battle = (name, foes, category = "Encounters") => ({
  name,
  npclist: ids(foes.map(([creature, count]) => ({ name: creature, count, faction: "foe", isidentified: 1, link: link("npc", `npc.${slug(creature)}@${BESTIARY}`) }))),
  __category: category,
});
const story = (name, text) => ({ name, text: md(text), __category: "The Empty Watchtower" });
const map = (name, file) => {
  const walls = JSON.parse(fs.readFileSync(path.join(here, "maps", `${file}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: walls.width, height: walls.height, grid: walls.grid, walls: walls.walls, category: "Maps" });
};

const STORY = [
  story("00 About This Adventure", `**The Empty Watchtower** is a first adventure for *Descending Darkness*: three to five characters of 1st level, two or three sessions. It teaches the game's heart: light runs out, the dark is listening, and not every fight has to be fought.

**What has happened.** On the ridge above the village of **Hollowmere** stands an old watchtower. Its beacon once warned the valley of raiders; for thirty years only **Brother Aldous**, a hermit-priest, has kept it, lighting it every dusk out of habit. Three nights ago the beacon stayed dark. Since then the village has heard howling from the ridge.

Aldous had been reading the tower's old records, and found that its last commander, **Warden Saranth**, was buried in the crypt below with his oath-ring: he had sworn to hold the tower *until relieved*. No relief ever came; the realm that built the tower forgot it. Aldous went down to pray for the Warden's rest and opened the tomb. Saranth woke, still holding his post, and everything buried with him woke too. Aldous fled upstairs and died there, of his wounds and his fear; the Warden's hound now guards the beacon.

**What the characters can do.** Fight their way down and destroy Saranth (hard: he rises again at dusk unless his ring is taken or his bones burned), or **relieve him**: relight the beacon, and tell the Warden, with his ring placed in his hand, that his watch is over. Aldous's journal says how.`),
  story("01 Hollowmere", `*Read or tell:* **Hollowmere is a village of thirty roofs around a muddy green, with the ridge and its dark tower above it. The reeve, a tired woman called Mother Hesk, meets you at the well. "Aldous lit that fire every night for thirty years," she says. "Three nights now, nothing. And the dogs won't stop howling."**

Mother Hesk offers **40 gc** and the village's thanks for relighting the beacon and finding out what became of Aldous. A Persuasion check (DC 12) gets 20 more, or a mule for the road.

What the villagers know (one each, for asking around):
- Aldous kept to himself and read a lot of "old soldier's letters".
- A shepherd saw grey wolves on the ridge road two nights ago, thin and bold.
- The tower is older than the village; "soldiers built it for a king nobody remembers".
- Old Tam, the drunk, says his grandmother told him a knight is buried under the tower, "waiting for somebody".

Before they go, ask each player what their character carries for light, and how many torches. Write it down.`),
  story("02 The Ridge Road", `The ridge road climbs for an hour through burned forest. **Three Ash Wolves** have followed the smell of Aldous's death up the ridge and now hunt the road; they shadow the party and attack where the road narrows, near the tower's ruined outer wall.

Wolves that lose two of their pack flee. A character who throws them food (a day's rations) with an Animal Handling check (DC 12) sends them off without a fight.

When the party first sees the tower, read: **The tower stands black against the sky, square and heavy, its curtain wall fallen in places. At its top, where the beacon basket should be burning, there is nothing. No smoke. No light. A dog is barking somewhere inside — a deep, hoarse sound, and it does not stop.**

Hearing the hound gives each character 1 Dread unless they succeed on a Wisdom save (DC 10).`),
  story("03 The Yard and the Stone Door", `*Map: The Watchtower Yard.*

The tower's only door is a slab of stone on iron pins, and it is **jammed**: a Strength check (DC 12) heaves it open, with a grind of stone that everything in the tower hears. A crowbar gives advantage. Two characters working together give advantage too.

The **well** in the yard is deep and dry; at its bottom is a dead mule and Aldous's lost bucket. The **cart** by the west wall holds a week of rotting supplies sent up from the village.

Behind the tower, by the east wall, lies a human skeleton in a soldier's rotten coat: one of Saranth's watch, long dead. In its fist is a tin badge of a tower with a flame above it — the **badge of the watch**. Saranth will listen to whoever carries it (see entry 08).`),
  story("04 The Hall", `**A long hall with a table and benches, a cold brazier in the corner. Blood has dried in a long smear across the floor toward the stairs.**

The blood is Aldous's, three days old. A Medicine or Investigation check (DC 12) reads it: someone wounded walked from the north side of the hall toward the stair room, fell once, got up.

The brazier still has wood in it; lighting it gives bright light 20 feet for the rest of the day, and the hall is a safe place to rest **once the hound above is dealt with**.

On the table: a cracked lamp, a bowl of mouldy porridge, and a scrap of paper under the bowl: *"Fed the hound. It is not a hound. God forgive me. — A."*`),
  story("05 The Storeroom", `**Barrels, crates, a floor of fallen plaster. In the far corner, stone steps lead down into a darkness that breathes out cold air.**

**Barrow Rats** have come up from the crypt and swarm the stores; they boil out of a broken crate when anyone comes near (one swarm; two if the party is five).

The barrels hold lamp oil (**6 flasks**, worth having), salt pork and flour. A crate holds a soldier's kit: a mail shirt, a shield and a spear, old but sound.

The steps down lead to the **crypt** (entry 08). The cold from below is wrong — colder than any cellar — and a character who stands at the top of the stair and listens hears, very faintly, a slow footstep, pacing.`),
  story("06 The Stair Room", `**A spiral stair of worn stone climbs into the dark. Rubble has fallen from above, and something has spun webs in the corner.**

The stair is **unsafe**: three steps near the top have cracked. A Wisdom (Perception) check (DC 12) notices them; crossing them needs a Dexterity check (DC 12) for each character — or none at all if they rope themselves together or test each step. A failure means a fall of 15 feet back to the stair room (2d6 bludgeoning damage) and a lot of noise.

A **Gloomcrawler** lives in the webs on the ceiling and drops on the last climber.`),
  story("07 The Upper Floor and the Beacon", `*Map: The Watchtower Upper Floor.*

**Aldous's room: a narrow bed, a table piled with old letters, a chest. And Aldous himself, on the floor beside the bed, eyes open.** Aldous is dead; he is not risen (he died praying, and the Warden spared him that). Seeing him: 1 Dread each, Wisdom save (DC 10) to resist.

On the table: **Aldous's journal** (give the players the handout) and the tower's old muster roll with Saranth's name.

Through the door, the **beacon platform**: the great iron basket, full of wood and old pitch, cold. And the **Grave Hound**, which has made its den among the barrels. It is Saranth's hound, buried with him; it attacks anyone who comes near the beacon. If the party lit the hall's brazier, the hound's Hunting Howl brings Saranth's attention: he will be waiting, sword drawn, when they go below.

**Relighting the beacon** takes an action with a torch or flame. When it catches, the whole valley sees it, and so does the crypt: read entry 08's *"when the beacon burns"*.`),
  story("08 The Crypt of the Watch", `*Map: The Crypt of the Watch.*

**The stairs come down into a long hall of tombs: six soldiers of the watch in their stone beds, the lids pushed aside. At the end of the hall a door stands open, and beyond it, by the light of two braziers burning blue, an armoured figure walks slowly up and down before an empty coffin.**

**Four Bone Sentinels** — Saranth's watch — have climbed from their tombs and stand in the hall; they attack anyone who enters without the **badge of the watch**. With the badge shown, they stand aside.

**Warden Saranth** walks his post before his coffin. He speaks, in an old form of the common tongue: *"Who comes? Give the word, or give your name to the dark."*

**Ways it can go:**
- **Fight.** Saranth and any sentinels left fight to the end; he is too strong for most 1st-level parties. If destroyed, he rises at the next dusk unless his oath-ring is taken from the tower or his bones burned with oil.
- **Talk.** He is not evil; he is faithful. He asks who relieves him. Showing the badge, telling him truthfully that the realm is gone (Persuasion or Religion DC 15; with Aldous's journal, DC 12), and placing the oath-ring from the altar in his hand convinces him. If the beacon is burning when they do it, they need no roll.
- ***When the beacon burns:*** *Saranth stops pacing. He turns his face up toward the ceiling, and for a long moment says nothing. "The fire," he says. "They have come at last." He lays his sword on the coffin, lies down, and is still. His sentinels fall with him.*

**The treasure niche.** Behind the tomb, a secret door (Investigation DC 15, or the tomb's inscription: *"The watch keeps what the watch is given"*) hides the tower's last pay-chest: **210 gc**, a silver flask of **healing water** (heals 2d4+2), and Saranth's sword, **Watchkeeper** (a longsword +1; once per day its wielder ignores a point of Dread).`),
  story("09 Aftermath", `**Rewards.** Each character gains **150 experience** for relieving or destroying Saranth, **50** for relighting the beacon, and **1 per gold crown** brought back to Hollowmere. Most parties reach 2nd level.

If the beacon is lit, Hollowmere sees it from below and rings its bell; Mother Hesk pays, and the village asks whether the party will keep the tower. Someone has to light it now.

**Threads to follow:** Aldous's letters mention the tower's sister towers along the ridge, all forgotten, all with their own wardens. One of them is still burning a beacon — and nobody has kept it in eighty years.`),
];

const HANDOUTS = [
  { name: "Aldous's Journal", text: md(`*The last pages of a cracked leather journal, in an old man's careful hand.*

**Day 3.** The muster roll names him: Saranth, Warden of the Watch, buried below with his ring, "until relieved". Relieved by whom? The kingdom that built this tower fell before my grandfather's grandfather was born. He is still waiting.

**Day 5.** I have found the stair to the crypt. The cold is terrible. I will go down tomorrow and pray for him. Perhaps that is relief enough.

**Day 6.** God forgive me. He asked me for the word, and I had no word. He asked who relieves him, and I had no answer. His dog — it is not a dog — followed me up the stairs.

**Day 7.** I cannot light the beacon. My hands will not stop shaking. If anyone reads this: he is a soldier. He wants to be told his watch is over. Light the fire. Show him the badge of the watch. Give him his ring. Tell him the truth.`) },
];

export const EMPTY_WATCHTOWER = {
  name: MODULE,
  displayName: "The Empty Watchtower (Descending Darkness)",
  category: "Descending Darkness Adventures",
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: {
    encounter: [...STORY, ...HANDOUTS.map((item) => ({ ...item, name: `10 Handout: ${item.name}`, __category: "The Empty Watchtower" }))],
    battle: [battle("Ash Wolves on the Ridge Road", [["Ash Wolf", 3]]), battle("Barrow Rats in the Storeroom", [["Barrow Rats", 1]]), battle("Gloomcrawler on the Stair", [["Gloomcrawler", 1]]), battle("The Grave Hound", [["Grave Hound", 1]]), battle("The Watch in the Crypt", [["Bone Sentinel", 4]]), battle("Warden Saranth", [["Warden Saranth", 1]])],
    image: [map("The Watchtower Yard", "watchtower-yard"), map("The Watchtower Upper Floor", "watchtower-upper"), map("The Crypt of the Watch", "watchtower-crypt")],
  },
  pictures: Object.fromEntries(["watchtower-yard", "watchtower-upper", "watchtower-crypt"].map((file) => [`images/${file}.webp`, path.join(here, "art", `${file}.webp`)])),
};
