// Apeira Astra Crew Handbook: the rules a player needs and the records the
// crew wizard uses (Origins, Paths, gear).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artKey, md, pictured } from "../lib/fg.mjs";
import { ARMOUR, GEAR, ORIGINS, PATHS, WEAPONS } from "./crew.mjs";

export const RULESET = "Apeira Astra";
const plain = (html) => String(html?.__rich ?? html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const GAMES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The portraits the book shows (Kraken's own, games/portraits): an origin's, and a path's (a different origin each, for variety).
const ORIGIN_PORTRAIT = { Coreborn: "Coreborn Merchant", Spacer: "Spacer Fleet", Frontier: "Frontier Scout", Undercity: "Undercity Drifter", Belter: "Belter Engineer" };
const PATH_PORTRAIT = { Fleet: "Spacer Fleet", Marine: "Coreborn Marine", Scout: "Frontier Scout", Merchant: "Undercity Merchant", Engineer: "Belter Engineer", Medic: "Frontier Medic", Drifter: "Undercity Drifter" };
const portraitFile = (name) => `images/portraits/${artKey(name)}.webp`;
const PORTRAITS = Object.fromEntries([...Object.values(ORIGIN_PORTRAIT), ...Object.values(PATH_PORTRAIT)].map((name) => [portraitFile(name), path.join(GAMES, "portraits", name.split(" ")[0], `${name}.webp`)]));

export const CREW_HANDBOOK = {
  name: "Apeira Astra Crew Handbook",
  displayName: "Apeira Astra Crew Handbook",
  category: "Apeira Astra",
  ruleset: RULESET,
  author: "Kraken VTT",
  playersBook: true,
  thumbnail: path.join(path.dirname(fileURLToPath(import.meta.url)), "art", "cover-handbook.webp"),
  pictures: { ...PORTRAITS, "images/cover-handbook.webp": path.join(path.dirname(fileURLToPath(import.meta.url)), "art", "cover-handbook.webp"),
    // The rules chapters' illustrations.
    ...Object.fromEntries(["rules-salvage","rules-vacuum","rules-ship","rules-ship-combat","rules-crew","rules-combat"].map((name) => [`images/${name}.webp`, path.join(path.dirname(fileURLToPath(import.meta.url)), "art", `${name}.webp`)])),
  },
  players: { race: ORIGINS, class: PATHS, item: [...WEAPONS, ...ARMOUR, ...GEAR] },
  reference: [
    {
      name: "The Reach",
      sections: [
        {
          name: "Welcome Aboard",
          pages: [
            {
              name: "The Boundless Stars",
              blocks: pictured(`*Apeira Astra* — "the boundless stars" — is a game of small crews in a big, cold Reach: freighters running cargo between frontier stations, salvagers picking over dead ships, scouts mapping the places the charts leave blank.

**The Reach** is a sprawl of a few hundred inhabited systems at the edge of settled space. The old Core worlds are far away and do not much care. Out here, the **Accord** keeps a few patrol cutters and a lot of paperwork; the **Halvard Combine** and its rivals own the shipyards, the mines and most of the debt; and everyone else gets by.

Ships cross between stars on **skein drives**, slipping along threads of folded space: a jump takes about a week, whatever the distance, and nobody can call for help in the middle of one.

One player is the **Game Master**; the rest play a **crew**: people with a ship (or the loan on one), a job, and not quite enough money.`, "images/cover-handbook.webp", "Apeira Astra"),
            },
            {
              name: "Salvage Law",
              keywords: "salvage law claim derelict",
              blocks: pictured(`By Accord law, a ship that has broadcast no signal for **100 days** is a **derelict**. The first crew to **dock with it and file a claim** at an Accord registry owns its hull and cargo — unless anyone aboard is still alive, in which case it is a rescue, and the rescuers are owed a reward instead.

This one law keeps half the Reach's crews in business, and is behind most of its knife fights.`, "images/rules-salvage.webp", "Salvage Law"),
            },
          ],
        },
      ],
    },
    {
      name: "Playing",
      sections: [
        {
          name: "Tasks",
          pages: [
            {
              name: "The Roll",
              keywords: "task roll 2d6 effect difficulty",
              text: `When the outcome is uncertain, roll **2d6**, add your **skill level** and your **characteristic modifier**, and aim for **8 or more**.

The amount you beat (or miss) 8 by is the **Effect**. An Effect of 0 is just enough; 2 or more is clean; 6 or more is remarkable. In a fight, the Effect adds to your damage.

**Untrained:** a skill you do not have: -3.

**Difficulty** shifts the roll:

| Trivial | Easy | Standard | Hard | Daunting | Desperate |
|---|---|---|---|---|---|
| +4 | +2 | 0 | -2 | -4 | -6 |

**Boon and Bane.** When something helps you (good tools, time, an ally), roll **3d6 and keep the best two**. When something hinders you, keep the worst two.

In Kraken, set the difficulty and any Boon on your sheet's strip, then click a skill or characteristic. The roll card says success or failure and the Effect.`,
            },
            {
              name: "Characteristics",
              keywords: "characteristic modifier brawn reflex grit intellect training presence",
              text: `Six characteristics, from 2 to 12 (15 at most):

- **Brawn**: strength and size.
- **Reflex**: speed, coordination, aim.
- **Grit**: endurance, nerve, how much you can take.
- **Intellect**: wits and reasoning.
- **Training**: schooling and technical learning.
- **Presence**: bearing, charm, social weight.

| Score | 2 | 3-5 | 6-8 | 9-11 | 12-14 | 15 |
|---|---|---|---|---|---|---|
| Modifier | -2 | -1 | 0 | +1 | +2 | +3 |`,
            },
          ],
        },
        {
          name: "A Crew Member",
          pages: [
            {
              name: "Making a Crew Member",
              keywords: "character creation path origin wizard",
              blocks: pictured(`1. **Characteristics**: place **10, 9, 8, 7, 6 and 5** as you like, or roll 2d6 for each.
2. **Origin**: where you grew up. It gives a few skills and a trait.
3. **Major Path**: what you did for most of your life. Its **signature skill** at 1, and **four picks** from its list (each +1).
4. **Minor Path**: what you did before or after. **Two picks** from its list.
5. **Kit and credits**: your major Path's kit and credits, half your minor Path's credits.

No skill starts above 3. **Stamina** is Brawn + Reflex + Grit. You start with no Marks and no tricks: they come from play (see Marks).

In Kraken, the Characters window's **Character Wizard** does all of this.`, "images/rules-crew.webp", "A crew"),
            },
            {
              name: "Origins",
              keywords: "origin",
              // A crew member of each origin, then the origins.
              blocks: pictured(
                md(ORIGINS.map((entry) => `**${entry.name}** (${entry.skills}). ${plain(entry.text)} *${Object.values(entry.traits)[0].name}:* ${plain(Object.values(entry.traits)[0].text)}`).join("\n\n")),
                ORIGINS.map((entry) => portraitFile(ORIGIN_PORTRAIT[entry.name])),
                ORIGINS.map((entry) => entry.name),
              ),
            },
            ...PATHS.map((entry) => ({ name: entry.name, keywords: "path", blocks: pictured(entry.text, portraitFile(PATH_PORTRAIT[entry.name]), PATH_PORTRAIT[entry.name]) })),
            {
              name: "Improving",
              keywords: "experience improve advance",
              text: `Apeira Astra has no levels. A crew member gets better in two ways: **experience**, which buys skills and characteristics, and **Marks**, which teach tricks.

The Game Master awards experience at the end of a session (1 to 3 each, more for a big job). You spend it:

| Purchase | Cost |
|---|---|
| A new skill at 0 | 1 |
| A skill's next level | that level x 2 (level 1: 2, level 2: 4, level 3: 6, level 4: 8) |
| A characteristic +1 | 6 |

No skill goes above 4. No characteristic goes above 15.

In Kraken, the Skills page's **Improve** spends experience, and it will not take a skill past 4 or a characteristic past 15. The sheet keeps your Marks and tricks too (see Marks).`,
            },
            {
              name: "Marks",
              keywords: "mark trick rank path",
              text: `A **Mark** is a story the Reach tells about you. The Game Master awards one when a job is finished and you did something the port will repeat. At most one Mark a session. Six Marks is a long career. After the sixth, only experience remains.

When you gain a Mark, choose one **trick** from your major Path or your minor Path that you do not already have. A new crew member has none. A trick is not a skill level. It does what it says, and only then.

A trick's Boon does not stack with another Boon. You still roll three dice and keep two.

Each Path lists three tricks on its page. Across a major and a minor, that is six: a full career of Marks, if you live that long. (A crew member whose major and minor are the same Path has only its three to learn; the Marks after the third still count, but teach nothing new.)

**In Kraken,** the sheet tracks it all. The Main page's **Marks** shows how many you have (of six) and the tricks you have learned, each with its text. The Game Master's **Award a Mark** gives one; with a Mark unspent, the sheet offers your major and minor Paths' tricks you do not have yet, and **Learn** takes one. A skill that one of your tricks names shows the trick beside it on the Skills page, as a reminder: you still set the Boon on the strip yourself when the trick applies.`,
            },
          ],
        },
        {
          name: "Kit",
          pages: [
            {
              name: "What Credits Buy",
              keywords: "gear weapon armour price credits shop",
              text: `Credits buy what a port will sell. A yard, a clinic, or a lockup may refuse the expensive pieces. In Kraken, the crew wizard's shop sells all of this at the price below.

${[...WEAPONS, ...ARMOUR, ...GEAR].map((entry) => {
  const extra = [entry.damage && `damage ${entry.damage}`, entry.range, entry.protection !== undefined && `armour ${entry.protection}`, entry.skill && entry.damage && entry.skill].filter(Boolean).join(", ");
  return `**${entry.name}** (${entry.cost}${extra ? `; ${extra}` : ""}). ${plain(entry.description)}`;
}).join("\n\n")}`,
            },
          ],
        },
        {
          name: "Danger",
          pages: [
            {
              name: "Combat",
              keywords: "combat initiative attack damage armour",
              blocks: pictured(`**Initiative:** 2d6 + Reflex modifier + Tactics (-3 without Tactics, as any skill you do not have; Tactics 0 adds 0). Highest first.

**On your turn:** move (about 6 m) and take one action: attack, a task, reload, aid someone.

**Attacking:** 2d6 + the weapon's skill (Firearms, Melee, Heavy Weapons) + Reflex (ranged) or Brawn (melee) against **8**.

**Damage:** the weapon's dice **+ the attack's Effect**, minus the target's **Armour**. A hit that does not beat the armour is stopped.

**Stamina:** at 0 you are **Down**: out of the fight, unconscious or close to it. At **minus your Grit** you are dead. A Medicine task brings you back from Down.

In Kraken, target a creature (Ctrl+click its token) and use the weapon's attack and damage on your sheet's Combat page.`, "images/rules-combat.webp", "Combat"),
            },
            {
              name: "Vacuum and Hazards",
              keywords: "vacuum radiation zero-g hazard",
              blocks: pictured(`**Vacuum:** without a sealed suit, 1d6 damage each turn (armour does not help), and you are Down within a minute.

**Zero-G:** without mag boots, every physical task takes a Bane unless you make a Zero-G task (Standard) at the start of the scene.

**Radiation:** a hot reactor or a flare: a Grit check each hour (or each turn, close in), 1d6 damage on a failure.

**Fire in a hull** eats the air: put it out in three turns or vent the compartment.`, "images/rules-vacuum.webp", "Vacuum and Hazards"),
            },
          ],
        },
        {
          name: "Ships",
          pages: [
            {
              name: "Your Ship",
              keywords: "ship starship hull armour thrust jump crew station",
              blocks: pictured(`A ship is a **hull** (its tonnage), **hull points** (tons / 2.5: a ship is destroyed at 0), **armour** (it comes off every hit), **Thrust** (how hard it can push), **Jump** (how many threads of the skein it can cross at once), **sensors** and a **computer** (together its **fire control**, added to every shot).

Its crew take **stations**: the **pilot** at the helm, a **gunner** at each weapon, someone on **sensors**, an **engineer**, the **captain**. In Kraken, open **Starships** in the sidebar and take a station with your character.

The GM has six ready designs: the **Courier**, the **Free Trader**, the **Salvage Tug**, the **Patrol Cutter**, the **Fighter** and the **Corsair**.

On the map, a ship has its own token, and its **deck plans** open as maps: bridge, staterooms, galley, turrets, airlock, holds and engineering, with their walls and doors.`, "images/rules-ship.webp", "Your Ship"),
            },
            {
              name: "Ship Combat",
              keywords: "ship combat gunnery range critical",
              blocks: pictured(`**Initiative:** 2d6 + the pilot's Pilot task modifier (Pilot + Reflex) + the ship's Thrust.

**Range:** Adjacent, Close, Short (+1), Medium, Long (-2), Very Long (-4), Distant (-6). A weapon reaches only so far (a pulse laser to Long, a missile rack to Distant).

**Firing:** 2d6 + the gunner's Gunnery + Intellect (-3 with no one at the gun) + the weapon's modifier + fire control + the range, against **8**.

**Damage:** the weapon's dice + the Effect, minus the target's armour, off its hull.

**Critical hits:** a shot with an Effect of 6 or more that does damage strikes a system (2d6): 2 sensors, 3 power plant, 4 fuel, 5 a weapon, 6 armour, 7 the hull itself, 8 the drive, 9 cargo, 10 the skein drive, 11 the crew, 12 the computer. Each hit on a system makes it worse.

In Kraken, the GM puts the ships on the combat tracker; a gunner picks the target and the range on the ship's sheet and presses **Fire**.`, "images/rules-ship-combat.webp", "Ship Combat"),
            },
          ],
        },
      ],
    },
    {
      name: "Credits",
      sections: [
        {
          name: "About This Book",
          pages: [
            {
              name: "Credits and License",
              text: `**Apeira Astra** is an original game made for Kraken VTT: its rules text, setting, names and art are original, and it may be shared freely with Kraken.

It belongs to the family of "2d6 and skills" science fiction roleplaying games, whose shared idea — two dice, a skill, a target of 8 — is a game mechanic common to many games and owned by none. Apeira Astra is not affiliated with or endorsed by any other game's publisher.`,
            },
          ],
        },
      ],
    },
  ],
};
