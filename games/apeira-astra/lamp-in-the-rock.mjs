// A Lamp in the Rock: a one-session job for a new Apeira Astra crew.
// A double-stamped claim, a living passenger, and a case that should not be spun.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handout, ids, imageRecord, link, md, slug } from "../lib/fg.mjs";
import { RULESET } from "./crew-handbook.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = "Apeira Astra Threat Dossier";
const battle = (name, foes) => ({ name, npclist: ids(foes.map(([creature, count, faction = "foe"]) => ({ name: creature, count, faction, isidentified: 1, link: link("npc", `npc.${slug(creature)}@${DOSSIER}`) }))), __category: "Encounters" });
const story = (name, text) => ({ name, text: md(text), __category: "A Lamp in the Rock" });
const map = (name, file) => {
  const walls = JSON.parse(fs.readFileSync(path.join(here, "maps", `${file}.walls.json`), "utf8"));
  return imageRecord({ name, file: `images/${file}.webp`, width: walls.width, height: walls.height, grid: walls.grid, walls: walls.walls, category: "Maps" });
};

const STORY = [
  story("00 About This Adventure", `**A Lamp in the Rock** is one session of *Apeira Astra* for three to five new crew. It is a job with a clock, a rival, and a find that changes what the job is.

**What has happened.** The freighter **Merry Dividend** missed a skein exit and fused with the asteroid **Harrow-4**. Her beacon was dark for 112 days, long enough for a salvage filing. Yesterday the beacon lit again. The crew's filing is **claim 441**, stamped at Port Sable. **Sera Voss** of the cutter *Red Lease* stamped a second filing an hour later. If anyone aboard is alive, both filings are a rescue and the hull is not theirs to sell.

Someone is alive: **Brin Hale**, a passenger, awake in a cabin the rock missed. In the strong room is a metal case Brin calls a brother's ashes. It is a **thread spool**. Voss wants the case. She does not much care about the hull.

**The quarantine phrase**, if anyone finds the plate by the drone, is: *Dividend, berth clear.*

**Experience:** 2 each for the job. +1 if Brin reaches a registry alive. +1 if the quarantine drone is shut down without anyone dying to it. Award a **Mark** to a crew member whose choice Port Sable will still be telling next month (the GM's **Award a Mark** on that crew member's sheet; they choose the trick).

**Handouts.** One picture (*The Cut*, for when the crew first sees the rock's bite). The papers in this job are words, not pictures: read them out, or paste them in chat. Each is in the entry where it turns up.`),
  story("01 Port Sable, Night Desk", `*Paper: Claim 441, slid under the glass.* **Accord Registry, Port Sable night desk. Claim 441. Hull: Merry Dividend. Rock: Harrow-4. Beacon dark 112 days, then lit. First stamp: this desk, this hour. Second stamp: Red Lease, one hour later. Status: contested. A living person aboard makes this a rescue. Night clerk: I. Quill.**

*Read or tell:* **Port Sable never quite sleeps. The night desk is a cage of laminate and bad tea, and the clerk on the other side of the glass has ink on his fingers and two stamps for the same rock.**

**Ivo Quill** (*Threat Dossier*) pushed the crew's filing through an hour ago, then found Voss's copy under it. He will hold her registry copy until they dock again, if they come back with the truth about whether anyone is alive. He will not hold it against a cutter captain who is standing in his office.

The crew can learn, each a task at Standard:

- **Electronics** on the desk: the *Merry Dividend* was a small freighter, four crew and one passenger, last clearance "personal effects and yard samples." The beacon's new signal is the ship's own, not a claim beacon.
- **Streetwise**: the *Red Lease* fuelled and left an hour ago. Voss pays her boarders well and her lawyers better.
- **Persuade** with Ivo: he admits he is afraid of her, and he gives them the rock's plot for nothing.

They need a ship of their own, or Port Sable's launch *Moth* at 400 credits (Persuade, Hard, talks the dockmaster down to fuel only).`),
  story("02 The Clock", `Harrow-4 is a short burn from Port Sable, not a week's jump. Run the approach as three tasks. Start the clock at **70 minutes** before the *Red Lease*'s lamps fill the cut. Each failure costs **15 minutes**. Each Effect of 4 or more gives **15 minutes** back. The clock does not drop below 25 unless the crew turn around and let her arrive first.

1. **Astrogation** (Standard): the rock is where Ivo said.
2. **Pilot** (Hard): into the cut without scraping the gantry. A failure is a scrape and a loud arrival. Effect 4 or more is a quiet dock.
3. **Electronics** (Standard): sort the beacons. Success: the ship's beacon is real, and a second, smaller claim beacon is shouting from the gantry. That one is Voss's, planted by someone who came and left. Failure: the crew is not sure which voice is older, and the argument later is harder.

Write the minutes remaining where the table can see them. Work aboard spends them: a fight spends ten, a careful search of a compartment spends ten, an argument with Brin spends as long as it is interesting.`),
  story("03 The Cut", `*Map: Harrow-4, the Cut. Handout: The Cut.*

**The asteroid is a black lump with a bite taken out of it. In the bite, a lamp. Under the lamp, a gantry, and the bow of a freighter grown into the stone like a splinter.**

The cut has air if the crew come in suited and cycle the gantry lock (Mechanics, Standard; a Toolkit is a Boon). Gravity is a weak pull toward the rock. Mag boots are a comfort, not a requirement. There is no nest in the open. A cable run under the gantry holds **four Thread Lice** if anyone cuts power, salvages the cable, or fails a Recon task (Standard) and then puts a hand in.

**Voss's claim beacon** is clamped to the gantry rail, newer than the frost. Her card is stuck under it: **"The case. Eight thousand. The passenger is yours. Leave the hull to the lawyers. I am already in the cut. Sera Voss."** Silencing the beacon is Electronics (Hard). Leaving it running means her filing looks busy and official when Ivo compares the logs.

The east hatch is the *Dividend*'s own airlock, forced half open by the rock and then pulled shut again from inside. Mechanics (Standard) opens it. A boarding charge opens it louder and spends no roll, and everyone on the ship hears.`),
  story("04 Midships", `*Map: Merry Dividend, Midships.*

**The corridor is a ship for ten metres and a cave after that. Stone has come through the deck. A drone the size of a crate hangs in the middle of the hall, amber ring lit, and says, in a flat voice, that this compartment is unclean.**

The **Quarantine Drone** fires on anything that keeps coming after the warning. It does not get a surprise turn if the crew stop and answer. The phrase is on a plate beside the wall panel, under the frost, the words still cut clean: **"Dividend, berth clear. Say it to the drone. Then it docks. Do not spin the ring. Capt. D. Moss."** Said clearly, the drone docks itself and powers down. Electronics (Hard) at the panel does the same. Shooting works, and the noise carries.

The panel also has the last captain's line, if anyone looks after the drone is quiet: *"Passenger Hale awake. Case stays sealed. Do not spin the ring. — Capt. D. Moss."*

**North cabin:** Brin. **South strong room:** the case, locked. **East:** the drive compartment, crushed. The skein ring is dead and half buried. Powering it is a bad idea and a Desperate Engineering task that fails into a radiation flush (a Grit check each turn for anyone who stays, 1d6 on a failure) until the compartment is left alone.`),
  story("05 Brin Hale", `**A young passenger in a silver blanket is sitting on the bunk with a wrench across their knees. "If you are here to take the case," Brin says, "it is not cargo. It is my brother."**

**Brin Hale** is not the Hollow-Eyed kind of survivor. Brin has been awake two days, still has water, and is scared in an ordinary way. Persuade (Standard; Hard if a weapon is out) gets the story:

- The *Dividend* came out of the jump inside the rock. The crew sealed the drive and died in the crush, or Brin thinks they did. Brin has not opened that compartment.
- Brin's passenger chit says it plainly: **"Passenger chit, Merry Dividend. Hale, Brin. Berth 2. Personal effects: one sealed case. Do not open the case. The yard samples are not yours. Clearance copy. Not a claim."**
- The case was listed as personal effects. Brin's brother, a yard tech, said it must not be opened and must not be left behind.
- Brin will leave with the crew if the case comes too. Brin will not sign a paper that says the ship was empty.

A Deceive task (Hard) can talk Brin into leaving the case for "ten minutes." Brin comes back for it. If the crew knocks Brin out, they have a rescue they are about to throw away, and Ivo will see a bruise.`),
  story("06 The Case", `The strong-room latch is Mechanics or Electronics (Standard). Inside is one brushed-metal case, warm, with a violet seam and no ashes.

An Engineering or Science task (Standard) knows it for a **thread spool**: a skein part the yards stamp and the Combine overpays for. The rules for using it or selling it are in the Threat Dossier, under Salvage. Say them when the crew understands what they are holding. Do not make them roll to be allowed to know their own options.

If the case is opened here, **one Thread Louse** is asleep in the packing. It wakes if the spool is powered or if the drive compartment is live. Shutting the case again is an action.

Brin, told the truth (or shown the louse), believes the crew about the case and still wants it off the rock. Brin will accept "we carry it, we do not open it" from someone who has not lied yet.`),
  story("07 The Red Lease", `When the clock ends, or when the crew undocks, the *Red Lease* is in the mouth of the cut. **Sera Voss** comes across with **three Red Lease Boarders** (two, if the crew is three). She does not vent the rock. A ruined spool is worth nothing.

She opens with the offer on the card, and she will go to **8,000 credits** for the case, Brin left to the crew, the hull left to whoever can be bothered to argue about a fused freighter. Persuade or Trade (Hard) moves her to 10,000. Leadership (Hard) with Brin standing there, alive and named, makes her step back from any plan that involves the passenger: she will not shoot a rescue in front of a witness she cannot buy. Easy, if the crew has already called Port Sable and Ivo is on the channel.

If it becomes a fight, she fights in the cut, behind the crates, and she orders a retreat when she is Down or two boarders are. She remembers the crew either way.

A crew that undocks before she arrives can still be caught at the mouth: Pilot (Hard) to slip out dark. Failure means she is alongside, and the offer happens in the launch instead of the cave.`),
  story("08 Port Sable Again", `**If Brin reaches the registry:** Ivo stamps a rescue. The Accord pays **3,000 credits**. The fused hull is not worth a tow. Brin owes the crew a brother's gratitude and a true story, and will tell it. Toma Rees, if she hears, is a friend of the filing.

**If the crew sells the spool to Voss:** 8,000 credits, or whatever was agreed. She pays. She also knows what they look like.

**If they sell it to the Combine:** about **30,000 credits** at the yard. Hess Kade learns the name of the ship that brought it. He is polite. He is not finished.

**If they keep it:** the next jump can be three days, once, if an engineer mounts it and the task succeeds. Voss and the Combine both keep looking. A yard stamp later makes the fine go away.

**If they file the hull empty, and Brin is not there to say otherwise:** Ivo will not stamp it if he has been given a reason to doubt. A clean lie, with no witness, pays whatever a buyer will give for a claim on a wreck that cannot be moved. It is a small amount, and it is the sort of story that finds Toma Rees.

**Threads:** Moss's last line named yard samples. The coolant in the crushed drive is the cheap sort. And Voss already knew the word "spool" before anyone told her.`),
];

const PICTURES = ["harrow-cut", "harrow-midships", "handout-cut", "cover-lamp"];

export const LAMP_IN_THE_ROCK = {
  name: "A Lamp in the Rock",
  displayName: "A Lamp in the Rock (Apeira Astra)",
  category: "Apeira Astra Adventures",
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: {
    encounter: STORY,
    battle: [
      battle("Lice under the Gantry", [["Thread Louse", 4]]),
      battle("The Quarantine Drone", [["Quarantine Drone", 1]]),
      battle("One in the Case", [["Thread Louse", 1]]),
      battle("Brin Hale", [["Brin Hale", 1, "neutral"]]),
      battle("Voss in the Cut", [["Sera Voss", 1], ["Red Lease Boarder", 3]]),
    ],
    image: [
      map("Harrow-4, the Cut", "harrow-cut"),
      map("Merry Dividend, Midships", "harrow-midships"),
      handout("The Cut", "handout-cut"),
    ],
  },
  thumbnail: path.join(here, "art", "cover-lamp.webp"),
  pictures: Object.fromEntries(PICTURES.map((file) => [`images/${file}.webp`, path.join(here, "art", `${file}.webp`)])),
};
