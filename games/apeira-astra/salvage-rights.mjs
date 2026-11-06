// Salvage Rights: Apeira Astra's first adventure, for a crew of three to five
// new characters. Story entries, encounters linked to the Threat Dossier,
// and the derelict's two decks with their walls and hatches.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handout, ids, imageRecord, link, md, slug } from "../lib/fg.mjs";
import { RULESET } from "./crew-handbook.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = "Apeira Astra Threat Dossier";
const battle = (name, foes) => ({ name, npclist: ids(foes.map(([creature, count]) => ({ name: creature, count, faction: "foe", isidentified: 1, link: link("npc", `npc.${slug(creature)}@${DOSSIER}`) }))), __category: "Encounters" });
const story = (name, text) => ({ name, text: md(text), __category: "Salvage Rights" });
const map = (name, file) => {
  const walls = JSON.parse(fs.readFileSync(path.join(here, "maps", `${file}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: walls.width, height: walls.height, grid: walls.grid, walls: walls.walls, category: "Maps" });
};

const STORY = [
  story("00 About This Adventure", `**Salvage Rights** is a first adventure for *Apeira Astra*: a crew of three to five new characters, two sessions. It shows the game's heart: tasks with Effect, armour that soaks, dark ships, and choices that are worth more than a fight.

**What has happened.** The freighter **Kestrel's Due** vanished 140 days ago on the run to Tessaly Station, with a cargo of reactor parts and a crew of six. A reactor fault flooded its engine room with radiation; the crew sealed it, sent the ship drifting into the Heron belt to wait for a tow, and climbed into the cryopods to wait. Their distress beacon failed with the power. Since then **Rust Crawlers** from the belt have got into the hull, and the ship's **salvage drone**, its control core damaged, treats everything moving as scrap.

One of the crew, the engineer **Pell Okafor**, woke when her pod failed two weeks ago. She has been alive alone aboard since, scared and nearly starved.

**The problem.** By Accord law (*Crew Handbook: Salvage Law*), the *Kestrel* is a derelict: it belongs to whoever docks first and files. But if anyone aboard is alive, it is a **rescue**: no salvage, just a reward. And **Mags Orrin** of the *Pale Gull* is racing the crew for it.`),
  story("01 Tessaly Station", `*Handout: The Lamp, Tessaly Station.*

*Read or tell:* **Tessaly Station is ice, scrap and bad coffee, a ring of hab modules around an ice-mining dock at the edge of the Heron belt. In the bar called the Lamp, a tug pilot with a burned hand is telling anyone who will listen about the ship he saw: a freighter adrift in the belt, dark, its name still on the hull. *Kestrel's Due*.**

The crew can learn (each a task, Standard, with the skill named):
- **Streetwise**: the *Kestrel* went missing 140 days ago. 40 days past derelict. Its cargo was reactor parts: worth **40,000 credits** to the Combine yard here.
- **Electronics** (the station's records): the *Kestrel* last reported a "minor reactor fault". Its crew of six included an engineer, Pell Okafor, whose brother runs the station's water plant.
- **Persuade** (the tug pilot, Dovan): the exact position, for a drink and a share. He has also told **Mags Orrin**, whose tug *Pale Gull* is fuelling at berth 9.

The crew needs a ship: their own, or the station's launch *Gnat* rented for 500 credits (or a Persuade task, Hard, against the dockmaster).`),
  story("02 The Race", `The *Kestrel* is six hours out into the belt. The *Pale Gull* leaves berth 9 an hour after the crew hears about the derelict — or right behind them, if they made a noise about it in the Lamp.

Run the race as three tasks, each by whoever is best at it:
1. **Astrogation** (Standard): plot the run through the belt. Effect 2 or more: an hour ahead.
2. **Pilot** (Hard): thread the rock field at speed. Failure: a scrape (the ship takes damage, and an hour is lost); Effect 4 or more: an hour gained.
3. **Electronics** (Standard): find the *Kestrel* among the rocks by its cold hull. Failure: an hour lost searching.

Count the hours ahead: that is how long the crew has aboard before the *Pale Gull* docks (entry 06). At least one; at most four.`),
  story("03 Docking and the Airlock", `*Map: Kestrel's Due, Deck 1. Handout: Kestrel's Due, Adrift.*

**The Kestrel hangs dark against the stars, tumbling slowly, frost on her hull. No lights, no beacon. Her port airlock answers your docking clamp with a dull clang.**

The airlock is on manual: a Mechanics task (Standard) cycles it; a Toolkit gives a Boon. Inside, the air is thin and cold (breather masks advised) and there is **no gravity**: Zero-G tasks (*Crew Handbook: Vacuum and Hazards*) unless the crew wears mag boots.

The airlock's panel still works on battery. An Electronics task (Standard) reads the ship's last log: *"Reactor fault, engine room sealed. Crew to cryo. Waiting for a tow. — Capt. Ines Vale."* The crew was alive when the log was written.`),
  story("04 The Cargo Hold", `**A long hold full of strapped crates, drifting dust, and a dark stain on the deck where something was dragged. Something skitters in the cable ducts.**

The cargo is real: reactor housings and coolant cores, worth 40,000 credits to the Combine.

**Rust Crawlers** (2d6 of them; use 4 for a small crew, 6 for a large one) have nested in the ducts behind the crates and swarm out when the crew starts moving cargo, or when anyone shines a light into the ducts. A Hand Scanner's Recon (Standard) spots the nest first.

The dark stain is Pell's: she was bitten here a week ago, and dragged herself back to engineering.`),
  story("05 The Crew Deck", `**Bunks with the blankets thrown back, a galley with half a meal frozen to the table, a medbay with its drug locker forced open.**

Whoever forced the locker took painkillers and stims, and left blood on the latch. A Medicine or Recon task (Standard) says: recent, days not months.

The **salvage drone** has wedged itself in the corridor by the lift. It turns its cutting arm on anything that moves. An Electronics task (Hard) at its access panel (which means getting close) shuts it down; so does enough damage.

**The lift** to Deck 2 is dead. Its shaft can be climbed in zero-g (Athletics or Zero-G, Standard).`),
  story("06 Deck 2: The Bridge and the Pods", `*Map: Kestrel's Due, Deck 2. Handout: The Cryo Bay.*

**The bridge: frost on the consoles, the captain's chair turned to face the door. Through a hatch, the cryo bay: four pods in a row, their lids frosted. Three are still humming faintly. One is open and empty.**

Three of the crew are alive in their pods (the captain and two others). A Medicine task (Standard) says the pods will last another two weeks on battery; an Engineering task (Standard) at the bridge restores power to them for good.

The open pod is **Pell Okafor's**. She is hiding in **engineering**, past the radiation hatch.

**If the crew wants to claim salvage**, they will have to leave three living people to die, or wake them and lie. (They can do that. It is that kind of universe. Ask the players what their characters do, and let the consequences come.)`),
  story("07 Engineering and Pell", `*Handout: The Reactor.*

**Behind the sealed hatch, the reactor glows a sick blue. Radiation warnings strobe silently. Curled behind the coolant pumps, a thin woman in a stained vac suit is pointing a wrench at you. "Don't," she says. "Don't touch the reactor. It's going to go."**

**Pell Okafor** (*Threat Dossier: Hollow-Eyed Survivor*) has not eaten in four days and has been dosing herself with stims. Persuade (Standard; Hard if anyone draws a weapon) talks her down. She knows: the reactor's coolant is failing, and in **about six hours** it will breach.

**The reactor:** standing beside it costs a Grit check each turn (1d6 damage on a failure). Fixing it is an extended job: three Engineering tasks (Hard), each taking ten minutes; a Toolkit gives a Boon, and Pell helping gives another. Three successes and it is safe. Three failures and it breaches: everyone aboard has ten minutes to get off.`),
  story("08 The Pale Gull", `When the crew's lead in hours runs out, the *Pale Gull* docks at the starboard lock. **Mags Orrin** comes aboard with **three Gull Crewmen** (two for a small crew).

Mags wants the cargo, not a fight. She opens with an offer: half the cargo each, and the *Pale Gull* tows the *Kestrel* in. If the crew tells her there are survivors, she does the sums out loud: "Rescue reward's a tenth of the cargo. Salvage is all of it." She will push to "forget" the pods — and back off if the crew stands firm (Persuade or Leadership, Hard; Easy if they point out that Pell's brother runs Tessaly's water).

If it comes to shooting, the Gull crew fights from the cargo hold's crates, and Mags runs when two of her people are Down.`),
  story("09 Aftermath", `**If the crew rescues the Kestrel's people:** the Accord pays a rescue reward of **4,000 credits**, the captain adds 2,000 of her own, and Pell's brother owes them for the rest of their lives. Tessaly Station never charges them a docking fee again.

**If the crew claims salvage** (with the survivors dead, or lied to): 40,000 credits for the cargo, and a hull worth more. And somewhere in the Reach, someone will find out.

**Experience:** 2 each for the job, +1 for saving Pell, +1 for fixing the reactor.

**Threads:** the reactor fault was no accident — someone swapped the coolant cores for cheap ones at the Combine yard. And the *Kestrel* was carrying a sealed crate not on its manifest.`),
];

export const SALVAGE_RIGHTS = {
  name: "Salvage Rights",
  displayName: "Salvage Rights (Apeira Astra)",
  category: "Apeira Astra Adventures",
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: {
    encounter: STORY,
    battle: [battle("Rust Crawlers in the Hold", [["Rust Crawler", 4]]), battle("The Salvage Drone", [["Salvage Drone", 1]]), battle("Pell Okafor", [["Hollow-Eyed Survivor", 1]]), battle("The Pale Gull Boards", [["Mags Orrin", 1], ["Gull Crewman", 3]])],
    image: [map("Kestrel's Due, Deck 1", "kestrel-deck1"), map("Kestrel's Due, Deck 2", "kestrel-deck2"), handout("The Lamp, Tessaly Station", "handout-lamp"), handout("Kestrel's Due, Adrift", "handout-kestrel"), handout("The Cryo Bay", "handout-cryo"), handout("The Reactor", "handout-reactor")],
  },
  thumbnail: path.join(here, "art", "cover-salvage.webp"),
  pictures: Object.fromEntries(["kestrel-deck1", "kestrel-deck2", "handout-lamp", "handout-kestrel", "handout-cryo", "handout-reactor"].map((file) => [`images/${file}.webp`, path.join(here, "art", `${file}.webp`)])),
};
