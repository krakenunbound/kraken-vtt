// Kraken's Ironsworn and Starforged books (rulesets "Ironsworn" and
// "Starforged"): for each game a players' reference (Kraken's own rules
// chapters, the CC BY moves, assets and oracles as records and pages), a
// GM's book (foes; Delve's themes and domains) and a short starter scenario
// (story entries, an inciting vow, a map with walls drawn by
// games/tools/mapgen.py). Ironsworn's own foes are not CC BY: the foes here
// are Kraken's; Starforged's sample foes are CC BY 4.0 (Datasworn).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids, imageRecord, link, md, slug } from "../lib/fg.mjs";
import { assetRecords, clean, datasets, moveRecords, oracleRecords, siteRecords, starforgedFoes, truthPages } from "./datasworn.mjs";
import { ATTRIBUTION, frontPage, GM_PAGES, rulesChapter, UNOFFICIAL } from "./rules-text.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const map = (name, file) => {
  const walls = JSON.parse(fs.readFileSync(path.join(here, "maps", `${file}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: walls.width, height: walls.height, grid: walls.grid, walls: walls.walls, category: "Maps" });
};
const notice = `${ATTRIBUTION}\n\n${UNOFFICIAL}`;

// The moves as pages too (a category a section, a move a page), with the records for the sheet.
function movePages(moves) {
  const sections = new Map();
  for (const move of moves) {
    if (!sections.has(move.__category)) sections.set(move.__category, []);
    sections.get(move.__category).push({ name: move.name, keywords: `move ${move.name}`, text: move.text });
  }
  return { name: "Moves", sections: [...sections].map(([name, pages]) => ({ name, pages })) };
}
function assetPages(assets) {
  const sections = new Map();
  for (const asset of assets) {
    if (!sections.has(asset.__category)) sections.set(asset.__category, []);
    sections.get(asset.__category).push({ name: asset.name, keywords: `asset ${asset.category} ${asset.name}`, text: asset.text });
  }
  return { name: "Assets", sections: [...sections].map(([name, pages]) => ({ name, pages })) };
}

function reference(game) {
  const ruleset = game === "starforged" ? "Starforged" : "Ironsworn";
  const { moves, embedded } = moveRecords(datasets[game], game);
  const oracles = [...oracleRecords(datasets[game], game), ...embedded];
  const assets = assetRecords(datasets[game], game);
  return {
    spec: {
      name: `${ruleset} Reference`,
      displayName: `${ruleset} Reference (compatible with ${game === "starforged" ? "Ironsworn: Starforged" : "Ironsworn and Delve"})`,
      category: ruleset,
      ruleset,
      author: "Shawn Tomkin (CC BY 4.0), adapted for Kraken VTT",
      playersBook: true,
      players: { ironmove: moves, ironasset: assets, ironoracle: oracles },
      reference: [
        { name: "Front Matter", sections: [{ name: "About This Book", pages: [frontPage(game)] }] },
        rulesChapter(game),
        movePages(moves),
        assetPages(assets),
        ...(game === "starforged" ? [{ name: "Setting Truths", sections: [{ name: "Truths of the Forge", pages: truthPages() }] }] : []),
      ],
    },
    counts: { moves: moves.length, assets: assets.length, oracles: oracles.length },
  };
}

// --- Ironsworn's foes: Kraken's own (the rulebook's are not CC BY). ----------------
const foe = (name, rank, nature, summary, features, drives, tactics, category = "Foes") => ({
  name,
  __category: category,
  foe: 1,
  game: "classic",
  rank,
  nature,
  summary,
  features,
  drives,
  tactics,
  text: md(`*${summary}* — ${rank[0].toUpperCase()}${rank.slice(1)} ${nature}\n\n**Features:** ${features}\n\n**Drives:** ${drives}\n\n**Tactics:** ${tactics}`),
});
export const IRON_FOES = [
  foe("Hungry Wolf", "troublesome", "Animal", "A lean grey shape at the edge of the firelight", "Ribs showing through a winter coat; yellow eyes", "Feed before the snow deepens", "Circle and wait; go for the weakest; flee from fire"),
  foe("Wolf Pack", "dangerous", "Animal", "Five or six wolves hunting as one", "Howls from every side; a scarred leader", "Bring down prey; protect the pups", "Surround; harry and fall back; drag a victim away"),
  foe("Cave Bear", "formidable", "Beast", "Shoulders like a boulder, breath like a forge", "Matted fur; a roar that shakes dust from the roof", "Guard its den; eat its fill before the long sleep", "Charge; crush and maul; stand tall to terrify"),
  foe("Raider", "troublesome", "Ironlander", "A hard-faced warrior with a notched axe", "Mismatched armour; a raid-mark painted on the shield", "Take what others have; survive the winter", "Strike from ambush; fight in pairs; run when the leader falls"),
  foe("Raider Chieftain", "dangerous", "Ironlander", "A raider who has outlived every rival", "A cloak of wolfskins; rings taken from the dead", "Be feared; hold the band together with plunder", "Lead from the front; take hostages; offer a bargain and break it"),
  foe("Marsh Lurker", "dangerous", "Beast", "Something long and pale beneath the black water", "Webbed claws; skin like wet clay; no eyes", "Drag the warm-blooded down into the mud", "Lie still; seize and pull under; vanish and strike again"),
  foe("Barrow Dead", "dangerous", "Horror", "A corpse in rotted mail, risen to guard its tomb", "Grave-dirt and rust; a cold blue light in empty sockets", "Keep the living from the barrow; take back what was stolen", "Stand at the threshold; strike without pain or fear; rise again until the barrow's power is broken"),
  foe("Cinder Hound", "dangerous", "Horror", "A hound of ash and coals that leaves burning prints", "Smoke for breath; an ember glow under cracked hide", "Hunt whatever its master names; burn what it cannot catch", "Run down the fleeing; set the ground alight; break apart into ash when slain"),
  foe("The Ash-Crowned Warden", "formidable", "Horror", "The barrow's first chieftain, bound to it by a vow he broke", "A crown of blackened iron; embers where his heart was; a voice like settling coals", "Keep his vow at last, whatever it costs the living; never be forgotten", "Command his hounds; call the fire in the braziers; bargain with an oath, then demand it be kept"),
  foe("Wild Boar", "troublesome", "Animal", "Bristled, tusked and furious", "Mud-caked hide; small red eyes", "Defend its ground", "Charge; gore; charge again"),
  foe("Hill Giant", "extreme", "Beast", "A towering hillfolk who wears a dead tree for a club", "Patchwork furs; a voice like rockfall", "Eat; gather shiny things; drive the small folk off its hills", "Hurl stones; sweep the field with its club; grab and throw"),
  foe("Frost Wyrm", "epic", "Beast", "A serpent of white scales coiled in the glacier's heart", "Breath of killing cold; eyes like old ice", "Sleep on its hoard; destroy whatever wakes it", "Burrow through ice; freeze with its breath; crush in its coils"),
  foe("Pale Flame Cultist", "troublesome", "Ironlander", "A gaunt zealot who carries a lamp that burns without heat", "Shaven head; ash smeared on the brow", "Feed the pale flame; bring others to its light", "Preach and distract; strike when backs are turned; die gladly"),
  foe("Swarm of Crows", "troublesome", "Animal", "A screaming black cloud over the battlefield", "A hundred beaks; the smell of carrion", "Feast on the dead and the dying", "Blind and confuse; scatter and return"),
];

// --- The starter scenarios -------------------------------------------------------
const story = (book, name, text) => ({ name, text: md(text), __category: book });
const battle = (book, source, name, foes) => ({ name, npclist: ids(foes.map(([creature, count]) => ({ name: creature, count, faction: "foe", isidentified: 1, link: link("npc", `npc.${slug(creature)}@${source}`) }))), __category: "Encounters" });

const BARROW = "The Cinder Barrow";
const CINDER_BARROW = {
  name: BARROW,
  displayName: "The Cinder Barrow (Ironsworn starter)",
  category: "Ironsworn Adventures",
  ruleset: "Ironsworn",
  author: "Kraken VTT",
  gm: {
    encounter: [
      story(BARROW, "00 About This Scenario", `**The Cinder Barrow** is a short starter for *Ironsworn* (with *Delve*): one to four characters, one or two sessions, with or without a GM. It is Kraken's own, an unofficial adaptation (see the Ironsworn Reference's front page).

${notice}

**The truth.** Long ago the chieftain Hallar Ash-Crown swore to guard the valley of Brannoch from a famine-winter, then fled with the clan's stores. His people buried him in a barrow with his hounds and cursed him to keep his vow in death. Now the barrow's braziers have lit themselves, smoke rolls down into the valley at night, and the cattle are found burned in their fields.`),
      story(BARROW, "01 Brannoch's Plea", `*Read or tell:* **Brannoch is a dozen longhouses on a frozen river. The elder, Wenna Tull, meets you at the gate with soot on her hands. "Three nights now the hounds have come down from the barrow," she says. "They burn what they touch. Tomorrow it will be our homes."**

**The inciting vow (dangerous):** *I will end the burning that comes from the Cinder Barrow.* Each character makes **Swear an Iron Vow** (+heart; +1 if they share a bond with Brannoch).

What the villagers know (Gather Information, +wits): the barrow is half a day north, past the split rock; its old name was the Hall of Hallar; "the chieftain broke his vow, and the dead do not forgive". Wenna offers a bond to whoever returns: **Forge a Bond** with Brannoch afterwards.`),
      story(BARROW, "02 The Way North", `A **troublesome journey** (Undertake a Journey, then Reach Your Destination). At each waypoint, ask the oracle or use these: the split rock, scorched black on one side; a burned-out shieling where a **Swarm of Crows** feeds; prints in the snow that steam.

On a miss on the journey: a **Cinder Hound** hunts the party in the dusk (a fight: Enter the Fray).`),
      story(BARROW, "03 Into the Barrow", `**Discover a Site:** *The Cinder Barrow*, a **haunted barrow** (theme Haunted, domain Barrow; use the GM's Delve Sites tool), **dangerous**.

The map shows the barrow: the **entry passage** (bones, a fallen stone), the **hall of four pillars** with two braziers that never go out, the **north and south tombs** (Hallar's oath-sworn: two **Barrow Dead** rise if their coffins are opened), the **burning hall** (the altar where the oath-stone lies, four braziers), a **collapsed tunnel** to the east with a black pool, and a **hidden vault** behind a secret door south of the altar (the clan's stores, rotted to dust, and Hallar's oath-ring).

Use **Delve the Depths** to cross each area; its features and dangers come from the theme and domain.`),
      story(BARROW, "04 The Ash-Crowned Warden", `When the party reaches the burning hall, **Hallar, the Ash-Crowned Warden** (formidable) rises from the altar's smoke with two **Cinder Hounds**.

He can be fought (End the Fight), or bargained with (Compel, +heart): he wants his vow kept at last. A character who swears to bring the clan's oath-ring back to Brannoch and lay it at the elders' hearth ends the curse when that vow is fulfilled. That is a new vow (formidable) and a story of its own.

**Fulfill Your Vow** when the burning ends. A strong hit: mark experience for a dangerous vow (2). Brannoch remembers.`),
    ],
    battle: [battle(BARROW, "Ironsworn Foes and Sites", "Hounds in the Dusk", [["Cinder Hound", 1]]), battle(BARROW, "Ironsworn Foes and Sites", "The Oath-Sworn", [["Barrow Dead", 2]]), battle(BARROW, "Ironsworn Foes and Sites", "The Ash-Crowned Warden", [["The Ash-Crowned Warden", 1], ["Cinder Hound", 2]])],
    image: [map("The Cinder Barrow", "cinder-barrow")],
  },
  pictures: { "images/cinder-barrow.webp": path.join(here, "art", "cinder-barrow.webp") },
};

const HULK = "The Silent Hulk";
const SILENT_HULK = {
  name: HULK,
  displayName: "The Silent Hulk (Starforged starter)",
  category: "Starforged Adventures",
  ruleset: "Starforged",
  author: "Kraken VTT",
  gm: {
    encounter: [
      story(HULK, "00 About This Scenario", `**The Silent Hulk** is a short starter for *Ironsworn: Starforged*: one to four characters, one or two sessions, guided or GM-less. It is Kraken's own, an unofficial adaptation (see the Starforged Reference's front page).

${notice}

**The truth.** The colony transport *Meridian Vow* went dark a generation ago on its way to a new settlement. Its crew put the colonists in cryosleep when the reactor failed. The ship drifted into a dead system, and now a salvage beacon has woken on it, broadcasting the same phrase over and over: *"We kept our promise. Come and see."*`),
      story(HULK, "01 The Signal", `*Read or tell:* **Your ship's comms crackle in the middle of the sleep-shift. A woman's voice, calm and patient: "We kept our promise. Come and see." The source is a derelict at the edge of the Thessal drift, three jumps out.**

**The inciting vow (dangerous):** *I will learn what happened aboard the Meridian Vow and bring its people home.* Each character makes **Swear an Iron Vow** (+heart).

A connection can help: **Ashe Varo**, a salvage broker at Gantry Station (dangerous, role: Broker), knows the ship's registry. Make a Connection (+heart) if the characters have none.`),
      story(HULK, "02 Into the Drift", `An **expedition** (dangerous): Undertake an Expedition, then Finish an Expedition. At each waypoint use the oracles (Space: Sighting, Peril, Opportunity), or: a field of frozen ice shards that ring against the hull; a dead beacon buoy with fresh scorch marks; another ship's wreck, picked clean.

On a miss: a **pirate cutter** has heard the signal too (a fight; use a sample foe from Starforged Foes, such as a Pirate Boarding Party).`),
      story(HULK, "03 The Meridian Vow", `The map shows the derelict's habitation ring: the **airlock** (west) with a dead console, the **ready room** (lockers, old blood), the **spine corridor**, the **cryo bay** (five pods: three dead, two still cold and working), the **crew quarters**, the **cargo hold** (sealed crates of colony seed-stock), the **reactor room** (the reactor, cold but not quite dead), and the **bridge** (east) where the beacon runs.

Use the **Derelict** oracles (Starforged Reference: Derelict: Zone, Feature, Peril, Opportunity) as the characters move from zone to zone. The ship's **guardian drone** (a Servitor or an Enforcer from Starforged Foes) still guards the bridge.`),
      story(HULK, "04 The Promise", `On the bridge sits the captain's last recording: she stayed awake to keep the ship alive for as long as she could, and recorded the beacon's words before she died. The two living colonists can be woken (Repair the cryo bay, +wits; Heal, +wits), or the whole ship towed home (a new, formidable vow).

**Fulfill Your Vow** when the characters know the truth and the survivors are safe. A strong hit: mark 2 ticks on the quests legacy track (dangerous). Discoveries legacy: a derelict explored is a discovery worth marking.`),
    ],
    battle: [battle(HULK, "Starforged Foes", "Pirate Boarding Party", [["Pirate boarding party", 1]])],
    image: [map("The Meridian Vow", "silent-hulk")],
  },
  pictures: { "images/silent-hulk.webp": path.join(here, "art", "silent-hulk.webp") },
};

// --- The GM's books ----------------------------------------------------------------
const IRON_GM = {
  name: "Ironsworn Foes and Sites",
  displayName: "Ironsworn Foes and Sites",
  category: "Ironsworn",
  ruleset: "Ironsworn",
  author: "Kraken VTT; Delve's themes and domains by Shawn Tomkin (CC BY 4.0)",
  gm: { npc: IRON_FOES, irondelve: siteRecords() },
  reference: [
    { name: "Front Matter", sections: [{ name: "About This Book", pages: [{ name: "About This Book", text: `${notice}\n\nThe foes in this book are Kraken VTT's own. Delve's site themes and domains are Shawn Tomkin's (CC BY 4.0, from Datasworn).` }] }] },
    { name: "For the Guide", sections: [{ name: "Running the Game", pages: GM_PAGES("classic") }, { name: "Foes", pages: IRON_FOES.map((item) => ({ name: item.name, keywords: `foe ${item.nature}`, text: item.text })) }] },
    {
      name: "Delve Sites",
      sections: ["theme", "domain"].map((kind) => ({ name: kind === "theme" ? "Themes" : "Domains", pages: siteRecords().filter((item) => item.kind === kind).map((item) => ({ name: item.name, keywords: `delve ${kind} ${item.name}`, text: item.text })) })),
    },
  ],
};
const SF_FOES = starforgedFoes();
const SF_GM = {
  name: "Starforged Foes",
  displayName: "Starforged Foes",
  category: "Starforged",
  ruleset: "Starforged",
  author: "Shawn Tomkin (CC BY 4.0), adapted for Kraken VTT",
  gm: { npc: SF_FOES },
  reference: [
    { name: "Front Matter", sections: [{ name: "About This Book", pages: [{ name: "About This Book", text: `${notice}\n\nThe sample foes are Shawn Tomkin's (CC BY 4.0, from Datasworn).` }] }] },
    { name: "For the Guide", sections: [{ name: "Running the Game", pages: GM_PAGES("starforged") }, { name: "Foes", pages: SF_FOES.map((item) => ({ name: item.name, keywords: `foe ${item.nature}`, text: item.text })) }] },
  ],
};

const IRON_REF = reference("classic");
const SF_REF = reference("starforged");
export const IRONSWORN_BOOKS = [IRON_REF.spec, IRON_GM, CINDER_BARROW];
export const STARFORGED_BOOKS = [SF_REF.spec, SF_GM, SILENT_HULK];
export const COUNTS = { classic: IRON_REF.counts, starforged: SF_REF.counts, ironFoes: IRON_FOES.length, sfFoes: SF_FOES.length, sites: siteRecords().length };
export { clean };
