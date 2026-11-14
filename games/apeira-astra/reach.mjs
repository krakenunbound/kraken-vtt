// People, creatures and jobs beyond the first ten threats. The dossier
// imports these. A contact can still be dropped on a map: the tracker only
// rolls an action whose text says "Attack +2 (3d6)".
import { creatureArt, ids, md } from "../lib/fg.mjs";

const STATS = ["brawn", "reflex", "grit", "intellect", "training", "presence"];
const attack = (name, bonus, dice, more = "") => ({ name, desc: `Attack ${bonus >= 0 ? "+" : ""}${bonus} (${dice})${more ? `, ${more}` : ""}.` });
const talk = (name, desc) => ({ name, desc });

const person = ({ name, kind = "Human", scores, armour = 0, stamina, skills, actions, text, traits = [], category }) => {
  const characteristics = Object.fromEntries(STATS.map((stat, index) => [stat, { score: scores[index] }]));
  return {
    name,
    type: kind,
    characteristics,
    hp: stamina ?? scores[0] + scores[1] + scores[2],
    armour,
    ac: armour,
    skills,
    actions: ids(actions),
    traits: ids(traits.map(([trait, body]) => ({ name: trait, desc: body }))),
    text: md(text),
    ...creatureArt(name, "Apeira Astra Threat Dossier"),
    __category: category,
  };
};

export const REACH_THREATS = [
  person({
    name: "Sera Voss",
    scores: [7, 9, 8, 9, 8, 11],
    armour: 4,
    skills: "Firearms 2, Persuade 2, Deceive 2, Pilot 1, Trade 1, Melee 0",
    actions: [attack("Laser Pistol", 3, "3d6", "30 m"), attack("Knife", 0, "1d6", "melee")],
    text: "Captain of the cutter *Red Lease*. She buys claims out from under the crews who filed them, and she is polite until the price is refused. She wants the thread spool aboard the *Merry Dividend*, not the hull, and she will pay 8,000 credits to walk away with the case. She leaves a fight when she is Down, or when two of her boarders are.",
    category: "A Lamp in the Rock",
  }),
  person({
    name: "Red Lease Boarder",
    scores: [8, 8, 8, 6, 6, 5],
    armour: 5,
    skills: "Firearms 1, Melee 1, Zero-G 1",
    actions: [attack("Carbine", 1, "3d6", "100 m"), attack("Shock Baton", 1, "2d6", "melee; a target hit makes a Grit check or loses its next turn")],
    text: "Sera Voss's boarding party, in grey plate with the visors up unless someone starts shooting. They follow her deal. If she says walk, they walk.",
    category: "A Lamp in the Rock",
  }),
  person({
    name: "Brin Hale",
    scores: [6, 7, 6, 9, 8, 7],
    stamina: 14,
    armour: 0,
    skills: "Persuade 1, Electronics 1",
    actions: [attack("Wrench", -3, "1d6", "melee")],
    traits: [["Passenger", "If Brin reaches an Accord registry alive, every filing on this hull is a rescue, not salvage."]],
    text: "A passenger off the *Merry Dividend*, awake in a cabin the rock did not take. Brin thinks the metal case in the strong room is a brother's ashes, and will not leave it. Hungry, frightened, and telling the truth as far as it goes.",
    category: "A Lamp in the Rock",
  }),
  person({
    name: "Ivo Quill",
    scores: [5, 6, 6, 10, 9, 7],
    armour: 0,
    skills: "Electronics 2, Persuade 1, Deceive 0",
    actions: [talk("The Stamp", "Ivo can hold a rival filing for one day, or stamp a rescue the hour the crew docks, if they tell him whether anyone was alive.")],
    text: "**Wants** the registry to be true. **Offers** a delay on Sera Voss's copy of claim 441, and a clean stamp if the crew brings him the facts. He folds if he is threatened, and he will not stamp a lie he has seen through. Night clerk at Port Sable.",
    category: "Contacts",
  }),
  person({
    name: "Harun Vey",
    scores: [9, 6, 8, 7, 6, 9],
    armour: 1,
    skills: "Persuade 1, Streetwise 2, Leadership 1, Melee 0",
    actions: [attack("Pipe", 1, "1d6", "melee"), talk("A Berth", "A night's dock, a name, or a look at who fuelled this morning. He remembers favours.")],
    text: "**Wants** his docks quiet and his friends paid. **Offers** a berth, a rumour, or an introduction on any station where the longshore trust him, which is most of them. Berthmaster. If the crew starts a firefight on his deck, the offer ends.",
    category: "Contacts",
  }),
  person({
    name: "Lale Yee",
    scores: [6, 7, 7, 10, 11, 8],
    armour: 0,
    skills: "Medicine 3, Science 1, Persuade 1",
    actions: [talk("Clinic", "She treats the crew for the cost of the supplies, and one favour later. A Down character in her care wakes with 1d6 Stamina. She does not do this twice in a row for nothing.")],
    text: "**Wants** her clinic left out of Combine business. **Offers** real medicine: wounds, radiation, the crash after too many stims. She will not sign a false death, and she will not forget a crew that brought her someone still breathing.",
    category: "Contacts",
  }),
  person({
    name: "Old Cade",
    scores: [7, 7, 8, 8, 9, 8],
    armour: 2,
    skills: "Mechanics 2, Streetwise 2, Trade 1, Zero-G 1, Firearms 0",
    actions: [attack("Snub Pistol", 0, "2d6", "10 m"), talk("A Name", "For a fee or a favour he names who is buying a given kind of salvage this month, and what they will not ask.")],
    text: "**Wants** to die on a rock he chose, not in a yard he owes. **Offers** parts, a quiet buyer, and the truth about a wreck if he has been there. A belter fixer. His price is credits, or a tool he does not have.",
    category: "Contacts",
  }),
  person({
    name: "Toma Rees",
    scores: [7, 8, 8, 9, 8, 9],
    armour: 3,
    skills: "Firearms 1, Persuade 2, Leadership 1, Electronics 0",
    actions: [attack("Service Pistol", 1, "3d6", "20 m")],
    text: "**Wants** the Accord's salvage law applied in the open. **Offers** a lawful rescue reward paid in full, and her testimony if a rival tries to bury a living passenger. She is an enemy only to a crew that files a derelict with someone still breathing on it. Inspector out of Port Sable.",
    category: "Contacts",
  }),
  person({
    name: "Hess Kade",
    scores: [8, 7, 8, 8, 7, 9],
    armour: 2,
    skills: "Melee 1, Deceive 2, Persuade 1, Streetwise 1",
    actions: [attack("Shock Baton", 1, "2d6", "melee; a target hit makes a Grit check or loses its next turn")],
    text: "A Halvard Combine collector. **Wants** the debt, or an asset worth more than the debt. **Offers** nothing at first. He pays well for a thread spool and then he knows the seller's name, ship, and habits. He would rather a signature than a body: bodies do not owe interest.",
    category: "People",
  }),
  person({
    name: "Rook Tal",
    scores: [7, 9, 7, 7, 6, 8],
    armour: 3,
    skills: "Firearms 1, Stealth 1, Deceive 1, Zero-G 1, Melee 0",
    actions: [attack("Snub Pistol", 2, "2d6", "10 m"), attack("Knife", 0, "1d6", "melee")],
    text: "A claim jumper. Rook boards a dark hull, plants a claim beacon timed to look older than yours, and is gone before the argument. Rook runs when the fight turns, and sells the recording of your airlock code to the next buyer.",
    category: "People",
  }),
  person({
    name: "Thread Louse",
    kind: "Creature",
    scores: [3, 8, 4, 1, 4, 1],
    stamina: 6,
    armour: 1,
    skills: "Stealth 2, Athletics 1",
    actions: [attack("Mandibles", 1, "1d6", "melee; chews a cable, a seal, or a suit")],
    traits: [["Nest", "In a cable run, use four of them. One may be asleep in a sealed case of skein metal."], ["Skein-hungry", "They ignore people until the people touch a drive, a spool, or a live power line."]],
    text: "Pale, soft, and the size of a hand. Thread lice eat the metal of skein rings and the insulation around it. A nest is a ruined jump. A single louse in a case is a surprise.",
    category: "Creatures",
  }),
  person({
    name: "Quarantine Drone",
    kind: "Robot",
    scores: [6, 8, 10, 4, 6, 1],
    stamina: 16,
    armour: 6,
    skills: "Firearms 1, Recon 1",
    actions: [attack("Spray Gun", 1, "2d6", "15 m; a living target hit makes a Grit check (Standard) or takes a Bane on physical tasks until a Medicine task (Standard)")],
    traits: [["Machine", "Does not breathe. Immune to vacuum and fear."], ["Phrase", "It stands down if someone says the ship's quarantine phrase, clearly, before shooting."]],
    text: "A boxy medical drone with an amber ring on its face. It was told the compartment was unclean, and the order was never lifted. Electronics (Hard) at its wall panel shuts it down.",
    category: "Machines",
  }),
];

export const REACH_SECTION = {
  name: "Work",
  pages: [
    {
      name: "Running a Job",
      keywords: "job patron rival find payoff",
      text: `A job the crew can finish in a session has five parts. Write them down before you play. The players do not need to see the page.

1. **The patron.** Someone with a name, a want, and a reason to hire this crew. A contact in this book will do.
2. **The rival.** Someone who wants the same thing, already moving. They arrive when the clock says, not when the fight would be fair.
3. **The clock.** Three tasks to get there (Astrogation, Pilot, and one more). Each failure costs time. Say the time out loud.
4. **The find.** What is actually there. It should change the job: a living person turns salvage into a rescue; a thread spool turns a tow into a decision.
5. **The payoff.** Credits, a favour, a Mark, and a thread for next time. Experience is 2 each for the job, plus 1 for a hard thing done right.

Offer the deal before the shooting. Most rivals in the Reach would rather be paid.`,
    },
    {
      name: "Salvage",
      keywords: "salvage treasure find spool wreck table",
      text: `When the crew cracks a hold and you have not already decided what is in it, roll **2d6** once for the hold, then invent the crate that matches.

| 2d6 | In the hold |
|---|---|
| 2 | Thread-eaten scrap. 200 credits if anyone will buy it. A nest of thread lice if anyone powers the ring. |
| 3 | Personal effects. A story, a name, and maybe 100 credits. |
| 4 | A ship's locker: tape, foam, a breather, a lamp. Useful, not rich. |
| 5 | Rations and a medkit. Someone meant to come back. |
| 6 | Ordinary trade goods, 1d6 x 1,000 credits at a fair port. |
| 7 | Yard parts, 2d6 x 1,000 credits to a yard, half that to anyone else. |
| 8 | A data slate with a route. Sell it for 3,000, or keep a Boon on one Astrogation in that sector. |
| 9 | A locked strongbox. Electronics or Mechanics (Hard). Then roll again, and use the higher idea. |
| 10 | Someone alive. The job is a rescue. The Accord pays about a tenth of what the cargo would have. |
| 11 | A sealed case the Combine will bid on: 2d6 x 5,000 credits. Someone follows the seller. |
| 12 | A beacon that should be dark. Another crew is already counting the days. |

**A thread spool** is the expensive case. It is a black-market skein part, legal to own, not legal to spin without a yard stamp (a fine, not a hanging). Mounted by an Engineering task (Hard, one hour), the ship's next jump takes three days instead of seven. On a failure the drive is ruined until a yard rebuilds it. The Combine pays about 30,000 credits and remembers the name. A bare spool carried next to a powered skein ring makes every task in that compartment Desperate until one of them is moved or powered down.

**A claim beacon** left on a hull shouts a filing. If it was planted earlier than the crew's stamp, the argument at the registry gets worse. Electronics (Hard) silences one.

Prices are a guide. A hungry port pays less. A yard that needs the part pays more.`,
    },
    {
      name: "Six Jobs",
      keywords: "job seed scenario patron",
      text: `Each of these is a session if you play the clock and the choice. Use the salvage roll if a hold is still a mystery.

**The ice run.** Lale Yee pays 1,500 credits to get a cold-crate of blood and antibiotics to a belt clinic before a fever does. A pirate skiff wants the crate because the clinic's buyer is late on protection. The find: the patient is a Combine clerk's child, and Hess Kade is already on the way to collect the family, not the medicine.

**The buoy.** The Accord pays 2,000 to restart a navigation buoy that has gone quiet. Rook Tal is stripping it. The find: a vac-suit clipped to the buoy's far side, still broadcasting a claim chip. The person inside has been dead nine days. The chip is a filing on a hull nobody has found.

**Yard night.** Harun Vey wants photographs of a coolant swap at the Combine yard, not a theft. The yard boss is the rival, and the watch is awake. The find: the cheap cores are real, and the *Kestrel's Due* was not the only ship sold them.

**Two stamps.** Ivo Quill shows the crew two filings on one hull, an hour apart. He will delay the second if they go and see whether anyone is alive. This is *A Lamp in the Rock*, if you want it played out.

**Missed the boat.** A passenger pays 1,000 to be put aboard a liner that has already spun up its ring. The rival is the liner's purser, who was paid to leave them. The find: the passenger's papers are good, and the purser's second payment came from Hess Kade.

**The marker.** Old Cade asks the crew to carry a debt marker to a rock and pay it off with parts he has boxed. Hess Kade meets them there and says the marker is forged, which is half true. The find: the box is real yard parts, and the forgery is Cade's only lie. Paying the true debt costs the parts. Keeping them makes an enemy of both.`,
    },
  ],
};
