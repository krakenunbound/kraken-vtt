// Apeira Astra Crew Handbook: the rules a player needs and the records the
// crew wizard uses (Origins, Paths, gear).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { md } from "../lib/fg.mjs";
import { ARMOUR, GEAR, ORIGINS, PATHS, WEAPONS } from "./crew.mjs";

export const RULESET = "Apeira Astra";
const plain = (html) => String(html?.__rich ?? html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const CREW_HANDBOOK = {
  name: "Apeira Astra Crew Handbook",
  displayName: "Apeira Astra Crew Handbook",
  category: "Apeira Astra",
  ruleset: RULESET,
  author: "Kraken VTT",
  playersBook: true,
  thumbnail: path.join(path.dirname(fileURLToPath(import.meta.url)), "art", "cover-handbook.webp"),
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
              text: `*Apeira Astra* — "the boundless stars" — is a game of small crews in a big, cold Reach: freighters running cargo between frontier stations, salvagers picking over dead ships, scouts mapping the places the charts leave blank.

**The Reach** is a sprawl of a few hundred inhabited systems at the edge of settled space. The old Core worlds are far away and do not much care. Out here, the **Accord** keeps a few patrol cutters and a lot of paperwork; the **Halvard Combine** and its rivals own the shipyards, the mines and most of the debt; and everyone else gets by.

Ships cross between stars on **skein drives**, slipping along threads of folded space: a jump takes about a week, whatever the distance, and nobody can call for help in the middle of one.

One player is the **Game Master**; the rest play a **crew**: people with a ship (or the loan on one), a job, and not quite enough money.`,
            },
            {
              name: "Salvage Law",
              keywords: "salvage law claim derelict",
              text: `By Accord law, a ship that has broadcast no signal for **100 days** is a **derelict**. The first crew to **dock with it and file a claim** at an Accord registry owns its hull and cargo — unless anyone aboard is still alive, in which case it is a rescue, and the rescuers are owed a reward instead.

This one law keeps half the Reach's crews in business, and is behind most of its knife fights.`,
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
              text: `1. **Characteristics**: place **10, 9, 8, 7, 6 and 5** as you like, or roll 2d6 for each.
2. **Origin**: where you grew up. It gives a few skills and a trait.
3. **Major Path**: what you did for most of your life. Its **signature skill** at 1, and **four picks** from its list (each +1).
4. **Minor Path**: what you did before or after. **Two picks** from its list.
5. **Kit and credits**: your major Path's kit and credits, half your minor Path's credits.

No skill starts above 3. **Stamina** is Brawn + Reflex + Grit.

In Kraken, the Characters window's **Character Wizard** does all of this.`,
            },
            {
              name: "Origins",
              keywords: "origin",
              text: md(ORIGINS.map((entry) => `**${entry.name}** (${entry.skills}). ${plain(entry.text)} *${Object.values(entry.traits)[0].name}:* ${plain(Object.values(entry.traits)[0].text)}`).join("\n\n")),
            },
            ...PATHS.map((entry) => ({ name: entry.name, keywords: "path", text: entry.text })),
            {
              name: "Improving",
              keywords: "experience improve advance",
              text: `Apeira Astra has no levels. The Game Master awards **experience** at the end of a session (1 to 3 each, more for a big job), and you spend it:

| Purchase | Cost |
|---|---|
| A new skill at 0 | 1 |
| A skill's next level | that level x 2 (level 1: 2, level 2: 4, level 3: 6, level 4: 8) |
| A characteristic +1 | 6 |

In Kraken, the Skills page's **Improve** spends it.`,
            },
          ],
        },
        {
          name: "Danger",
          pages: [
            {
              name: "Combat",
              keywords: "combat initiative attack damage armour",
              text: `**Initiative:** 2d6 + Reflex modifier + Tactics. Highest first.

**On your turn:** move (about 6 m) and take one action: attack, a task, reload, aid someone.

**Attacking:** 2d6 + the weapon's skill (Firearms, Melee, Heavy Weapons) + Reflex (ranged) or Brawn (melee) against **8**.

**Damage:** the weapon's dice **+ the attack's Effect**, minus the target's **Armour**. A hit that does not beat the armour is stopped.

**Stamina:** at 0 you are **Down**: out of the fight, unconscious or close to it. At **minus your Grit** you are dead. A Medicine task brings you back from Down.

In Kraken, target a creature (Ctrl+click its token) and use the weapon's attack and damage on your sheet's Combat page.`,
            },
            {
              name: "Vacuum and Hazards",
              keywords: "vacuum radiation zero-g hazard",
              text: `**Vacuum:** without a sealed suit, 1d6 damage each turn (armour does not help), and you are Down within a minute.

**Zero-G:** without mag boots, every physical task takes a Bane unless you make a Zero-G task (Standard) at the start of the scene.

**Radiation:** a hot reactor or a flare: a Grit check each hour (or each turn, close in), 1d6 damage on a failure.

**Fire in a hull** eats the air: put it out in three turns or vent the compartment.`,
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
