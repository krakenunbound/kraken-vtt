// Kraken's own short rules chapters for Ironsworn and Starforged: original
// text (the rulebooks' explanations are CC BY-NC-SA and are not used),
// written around the CC BY 4.0 moves, assets and oracles the books carry.

export const ATTRIBUTION = "This work is based on Ironsworn, Ironsworn: Delve and Ironsworn: Starforged, created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4.0 International license (https://creativecommons.org/licenses/by/4.0/).";
export const DATASWORN = "The moves, assets, oracles and Delve's themes and domains come from Datasworn (https://github.com/rsek/datasworn and its community continuation, datasworn-community/official-content), whose schema and code are MIT-licensed; only the parts of its data licensed CC BY 4.0 are included.";
export const UNOFFICIAL = "This is an unofficial adaptation made for Kraken VTT, compatible with Ironsworn and Ironsworn: Starforged. It is not an official Tomkin Press product, and is not affiliated with or endorsed by Shawn Tomkin or Tomkin Press. It uses no Tomkin Press art, icons or trade dress. The full rulebooks (free to download from the publisher) explain the games in far more depth.";

export const frontPage = (game) => ({
  name: "About This Book",
  keywords: "license attribution credits",
  text: `${ATTRIBUTION}

${DATASWORN}

${UNOFFICIAL}

The rules chapters in this book are Kraken VTT's own short explanation of how to play, written for this adaptation. The moves, assets and oracle tables are Shawn Tomkin's text (CC BY 4.0), lightly reformatted; changes made: links between moves shown as plain names, embedded tables kept as separate oracle tables.

${game === "starforged" ? "Starforged's sample foes and setting truths are included as Datasworn gives them, CC BY 4.0." : "Ironsworn's foes, setting truths and the Ironlands atlas are not licensed for this use: the foes and starter scenario in Kraken's books are Kraken's own."}`,
});

const CORE = (game) => {
  const sf = game === "starforged";
  const control = sf ? "in control" : "initiative";
  return [
    {
      name: sf ? "Playing Starforged" : "Playing Ironsworn",
      keywords: "overview introduction",
      text: `${sf ? "You play a spacefarer in the Forge, a vast and lawless galaxy settled by people who fled a dying home." : "You play one of the Ironsworn: a hero who swears vows upon iron in a harsh and perilous land."} The game is about promises: you swear to do something hard, and the story is how you keep (or break) that promise.

You can play alone, with one friend as a pair, or as a group, with or without a game master. Whenever you do something risky the rules give it a **move**: a trigger ("when you...") and what happens on each result. Whenever you wonder what the world holds, you ask an **oracle**: a table that gives you an answer to interpret.

In Kraken, the GM's seat can play a character too: open **Characters** and make one like any player.`,
    },
    {
      name: "The Action Roll",
      keywords: "action roll action die challenge dice strong hit weak hit miss match",
      text: `When a move asks you to roll **+a stat**, roll an **action die** (a d6) and add the stat and any **adds** the move or an asset gives. Your total is the **action score**; it can never be more than **10**.

At the same time roll two **challenge dice** (d10s). Compare your score with each of them:

- Beat **both**: a **strong hit**. You do what you set out to do.
- Beat **one**: a **weak hit**. You do it, at a cost or with a complication.
- Beat **neither**: a **miss**. Things go wrong; often you must **Pay the Price**.

A tie is not a beat: the challenge die wins. If the two challenge dice show the **same number**, it is a **match**: something surprising happens, good on a hit, worse on a miss.

The five stats are **Edge** (speed and precision), **Heart** (courage and charm), **Iron** (strength and endurance), **Shadow** (stealth and deceit) and **Wits** (insight and knowledge). Some moves roll a meter (health, spirit, supply) instead of a stat.`,
    },
    {
      name: "Momentum",
      keywords: "momentum burn reset maximum",
      text: `**Momentum** runs from -6 to +10 and starts at **+2**. Good results give you momentum; setbacks take it away.

**Burning momentum.** After a roll, if your momentum is higher than one or both challenge dice, you may burn it: your momentum becomes your action score (so a 7 beats a 6 and a 3), then it **resets**. You cannot burn momentum on a progress roll.

**The reset** is +2, but only +1 if you have one ${sf ? "impact" : "debility"} marked and 0 with more. Each ${sf ? "impact" : "debility"} also lowers your **maximum** momentum by one.

**Negative momentum** works against you: if your action die shows the same number as your negative momentum (a 3 at -3), the die counts as zero.

When you must lose momentum and it is already at -6, you ${sf ? "make the Lose Momentum move's other choices" : "face a setback: you lose something else instead"}.`,
    },
    {
      name: "Vows and Progress",
      keywords: "vow progress track rank ticks boxes milestone fulfill",
      text: `A **progress track** has ten boxes, each filled by four **ticks**. Vows, journeys${sf ? ", expeditions, scene challenges, connections" : ", delve sites"} and fights are all progress tracks.

Each track has a **rank**, and the rank says how much one **mark of progress** fills:

| Rank | One mark |
|---|---|
| Troublesome | 3 boxes (12 ticks) |
| Dangerous | 2 boxes (8 ticks) |
| Formidable | 1 box (4 ticks) |
| Extreme | 2 ticks |
| Epic | 1 tick |

To **swear a vow**, write what you swear to do and its rank, then make the Swear an Iron Vow move. As you overcome obstacles, **Reach a Milestone** and mark progress. When you believe the vow is done, **Fulfill Your Vow**: a **progress roll**. A progress roll uses no action die: your **progress score** (the number of filled boxes) is compared with the challenge dice, and momentum does not count.

You start with a **background vow** (${sf ? "epic" : "extreme or epic"}): the long purpose behind everything you do.`,
    },
    {
      name: sf ? "Legacies and Experience" : "Bonds and Experience",
      keywords: "experience advance asset upgrade bonds legacy",
      text: sf
        ? `Starforged has three **legacy tracks**: **Quests** (vows fulfilled), **Bonds** (connections become bonds) and **Discoveries** (expeditions finished and wonders found). Rewards are marked on them by rank: troublesome 1 tick, dangerous 2 ticks, formidable 1 box, extreme 2 boxes, epic 3 boxes.

Every **box** filled on a legacy track earns **2 experience**. When a track's tenth box fills, it is cleared and starts again, and from then on each box earns 1 experience.

**Connections** are the people you know: each has a role and a rank, and its own progress track. When the relationship is ready, **Forge a Bond**.

**Advance:** spend **3 experience** for a new asset or **2** to mark an asset's next ability. Kraken works out your experience from the legacy tracks and shows it on the sheet.`
        : `**Bonds** are the people and places that matter to you. You start with up to three; each new bond marks a tick on your **bonds** progress track. When you retire, **Write Your Epilogue** rolls against it.

**Experience** comes from fulfilled vows: troublesome 1, dangerous 2, formidable 3, extreme 4, epic 5 (one less on a weak hit). **Advance:** spend **3 experience** for a new asset or **2** to mark an asset's next ability. Kraken keeps experience earned and spent on the sheet.`,
    },
    {
      name: "Health, Spirit and Supply",
      keywords: "health spirit supply harm stress endure",
      text: `**Health** (your body), **spirit** (your morale) and **supply** (food, gear${sf ? ", fuel, money" : ", ammunition"}) each run from 0 to 5 and start at 5. Supply is **shared**: you and your allies keep one supply between you (Kraken keeps every party member's the same).

When you are hurt, **Endure Harm**: lose 1 health for minor harm, 2 for serious, 3 for major (a foe inflicts harm by its rank). When you are frightened or disheartened, **Endure Stress** and lose spirit. If a meter is already 0, what is left comes off momentum.

${sf ? "Ironsworn has no money, and neither does Starforged's sheet: what you can buy or barter is part of supply." : "Ironsworn has no money: wealth, food and gear are all part of supply, and anything special you own is an asset."}`,
    },
    {
      name: sf ? "Impacts" : "Debilities",
      keywords: sf ? "impacts wounded shaken unprepared permanently harmed traumatized doomed tormented indebted battered cursed" : "debilities wounded shaken unprepared encumbered maimed corrupted cursed tormented",
      text: sf
        ? `**Impacts** are lasting troubles: **misfortunes** (wounded, shaken, unprepared), **lasting effects** (permanently harmed, traumatized), **burdens** (doomed, tormented, indebted) and **vehicle troubles** (battered, cursed: on your starship). Each one marked lowers your maximum momentum by one and your reset (to +1 with one, 0 with more). Wounded stops health recovering, shaken spirit, unprepared supply, until they are cleared.`
        : `**Debilities** are lasting troubles: **conditions** (wounded, shaken, unprepared, encumbered), **banes** (maimed, corrupted: permanent) and **burdens** (cursed, tormented: bound to a quest). Each one marked lowers your maximum momentum by one and your reset (to +1 with one, 0 with more). Wounded stops health recovering, shaken spirit, unprepared supply, until they are cleared.`,
    },
    {
      name: "Combat",
      keywords: "combat fight foe rank initiative control strike clash enter the fray",
      text: `A fight starts with **Enter the Fray**: give each foe${sf ? " (or each objective)" : ""} a rank and roll to see who has the upper hand. You either have **${control}** or ${sf ? "are **in a bad spot**" : "**your foe has initiative**"}.

${sf ? "In control, you **Strike** or **Gain Ground**; in a bad spot, you **Clash** or **React Under Fire**." : "With initiative you **Strike**; without it you **Clash** (or make another move to change the situation)."} ${sf ? "Hits **mark progress** on the fight's track (Strike marks it twice)." : "Each **harm** you inflict marks progress on the foe's track by its rank (a strong hit Strike inflicts +1 harm)."} Foes hurt you by their rank: a troublesome foe 1 harm, up to 5 for an epic one.

When the track has enough progress, **${sf ? "Take Decisive Action" : "End the Fight"}**: a progress roll against the foe's track${sf ? " (in a bad spot, a strong hit without a match counts as a weak hit, and a weak hit as a miss)" : ""}.

In Kraken the GM puts foes on the **combat tracker**: each shows its rank and its ten-box track; your sheet's combat moves mark progress on the foe you target, and the tracker shows who is ${control === "initiative" ? "holding the initiative" : "in control"}.`,
    },
    {
      name: "The Oracles",
      keywords: "oracle ask the oracle yes no odds tables solo guide",
      text: `The oracles answer questions. **Ask the Oracle** for a yes or no: pick the odds (almost certain, likely, 50/50, unlikely, small chance) and roll a d100; under the number is yes. Or roll on a table${sf ? " (action and theme, descriptor and focus, a planet, a settlement, a derelict...)" : " (action and theme, a name, a place, a settlement...)"} and interpret the result in the moment.

Trust your first instinct, and let the answer surprise you. When no one plays a game master, the oracles and the moves together run the world: the players ask, roll, and agree what it means.

In Kraken, open **Oracles** in the sidebar: every table of the book is there, rolled on the host's dice for the whole table to see; ask the oracle with one click.`,
    },
    ...(sf
      ? []
      : [
          {
            name: "Delving",
            keywords: "delve site theme domain depths danger opportunity",
            text: `*Ironsworn: Delve* adds perilous places. **Discover a Site**: give it a name, a **theme** (what it is now: haunted, infested, ancient...) and a **domain** (what it is: a barrow, a cavern, a stronghold...), and a rank. Its progress track is marked as you **Delve the Depths**.

The theme and domain give the site's **features** (what you find as you go deeper) and **dangers** (what goes wrong). When you are close, **Locate Your Objective** with a progress roll. **Escape the Depths** when you must get out.

In Kraken, the GM's **Delve Sites** tool combines a theme and a domain into the site's feature and danger tables, rolls them, and gives a character the site's progress track.`,
          },
        ]),
    {
      name: "Making a Character",
      keywords: "character creation wizard stats assets background vow bonds connections",
      text: sf
        ? `Kraken's wizard follows these steps:

1. **Stats:** 3, 2, 2, 1 and 1, one to each.
2. **Paths:** two path assets: who you are and what you can do.
3. **Backstory and background vow** (epic): what drives you.
4. **Your starship:** everyone has the Starship asset (a command vehicle); name it.
5. **A final asset** of any kind (not a deed: those are earned).
6. **Your first connection:** a name, a role and a rank.
7. **The inciting incident:** a vow that starts the story, of any rank.
8. **Name, pronouns, callsign and look.**

You start with health, spirit and supply at 5 and momentum at +2.`
        : `Kraken's wizard follows these steps:

1. **Stats:** 3, 2, 2, 1 and 1, one to each.
2. **Assets:** three, any mix of paths, companions, combat talents and rituals.
3. **Background vow** (extreme or epic): the long purpose behind your character.
4. **Bonds:** up to three people or places you are bound to; each marks a tick.
5. **What you carry:** a few things in words (Ironsworn has no money).
6. **The inciting incident:** an optional first vow, to start the story.
7. **Name and look.**

You start with health, spirit and supply at 5 and momentum at +2.`,
    },
    {
      name: "Playing in Kraken",
      keywords: "kraken sheet moves window burn momentum tracker",
      text: `**The sheet.** Click a stat to see the moves it is used for; open **Moves** to make any move: choose its option (the stat it rolls), add any adds, and Roll. The host rolls the action die and the challenge dice for everyone to see, and posts the outcome with the move's text.

**After the roll.** What the outcome clearly does happens by itself (momentum taken, ${control === "initiative" ? "initiative" : "control"} won or lost, progress marked on the target). Choices ("choose one") become buttons. When you could burn momentum to do better, the sheet offers **Burn momentum** before anything is resolved.

**Progress.** The Vows tab keeps every progress track: mark progress by rank, roll against it, and fulfil it (the reward is marked for you).

**Oracles** roll in the Oracles window; the GM's **foes** go on the combat tracker${sf ? "" : ", and **Delve Sites** builds a site from its theme and domain"}.`,
    },
  ];
};
export const rulesChapter = (game) => ({ name: "How to Play", sections: [{ name: "The Rules in Short", pages: CORE(game) }] });

export const GM_PAGES = (game) => [
  {
    name: "Running Foes",
    keywords: "foes rank harm tracker",
    text: `A foe is a rank and a story. Its **rank** says how hard it is to beat (how much each hit marks on its track) and how badly it hurts: troublesome 1 harm, dangerous 2, formidable 3, extreme 4, epic 5.

Put foes on the **combat tracker** from the NPC list. In ${game === "starforged" ? "Starforged" : "Ironsworn"} the tracker shows each foe's rank and its ten-box progress track instead of hit points, and each character's ${game === "starforged" ? "position (in control or in a bad spot)" : "initiative"}. Use **Inflict harm** on a character (it makes their Endure Harm with the foe's harm), or let the players make their suffer moves themselves.

A group of weak foes can be one foe of a higher rank. A big fight can be several objectives, each with its own rank.`,
  },
  {
    name: "Without a Game Master",
    keywords: "solo co-op guided gm-less",
    text: `Ironsworn games play well with no game master. The players make the moves, ask the oracles, and decide together what the answers mean. In Kraken the host can still be a player: whoever hosts makes a character too, rolls oracles in the Oracles window and puts foes on the tracker when a fight starts.

When you are the GM, you are a guide more than an opponent: ask the players what they fear and hope, and use the oracles when you want to be surprised as well.`,
  },
];
