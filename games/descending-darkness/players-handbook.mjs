// Descending Darkness Player's Handbook: the rules a player needs, and the
// records the character wizard and the sheets use (classes, kin,
// backgrounds, spells, gear).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artKey, md, pictured } from "../lib/fg.mjs";
import { BACKGROUNDS, CLASSES, KIN } from "./classes.mjs";
import { ARMOUR, GEAR, WEAPONS } from "./gear.mjs";
import { SPELL_PICTURES, SPELLS } from "./spells.mjs";

export const RULESET = "Descending Darkness";
const plain = (html) => String(html?.__rich ?? html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const GAMES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The portraits the book shows (Kraken's own, games/portraits): a kin's, and a class's (a different kin each, for variety).
const KIN_PORTRAIT = { Human: "Human Paladin", Elf: "Elf Ranger", "Half-Elf": "Half-Elf Bard", Dwarf: "Dwarf Fighter", Gnome: "Gnome Wizard" };
const CLASS_PORTRAIT = { Fighter: "Human Fighter", Cleric: "Dwarf Cleric", Wizard: "Elf Wizard", Thief: "Half-Elf Thief", Paladin: "Human Paladin", Ranger: "Human Ranger", Bard: "Human Bard" };
const portraitFile = (name) => `images/portraits/${artKey(name)}.webp`;
const PORTRAITS = Object.fromEntries([...Object.values(KIN_PORTRAIT), ...Object.values(CLASS_PORTRAIT)].map((name) => [portraitFile(name), path.join(GAMES, "portraits", name.split(" ").slice(0, -1).join(" "), `${name}.webp`)]));

const classPage = (record) => ({
  name: record.name,
  keywords: "class",
  blocks: pictured(
    [
      `*${plain(record.text)}*`,
      `| Hit Die | Saves | Armour | Weapons |\n|---|---|---|---|\n| d${/D(\d+)/.exec(record.hp.hitdice.text)[1]} | ${record.proficiencies.savingthrows.text} | ${record.proficiencies.armor.text} | ${record.proficiencies.weapons.text} |`,
      `**Skills.** ${record.proficiencies.skills.text}. **Starting gear.** ${record.startingequipment}`,
      ...Object.values(record.features).map((feature) => `**${feature.name}** (level ${feature.level}). ${plain(feature.text)}`),
    ].join("\n\n"),
    portraitFile(CLASS_PORTRAIT[record.name]),
    CLASS_PORTRAIT[record.name],
  ),
});
const kinPage = (record) => ({
  name: record.name,
  keywords: "kin",
  blocks: pictured(
    [
      `*${plain(record.text)}*`,
      `**Size** ${record.size}. **Speed** ${record.speed}. **Abilities** ${record.abilityadjust || "no adjustment"}. **Classes** ${record.classes}.`,
      ...Object.values(record.traits).map((trait) => `**${trait.name}.** ${plain(trait.text)}`),
    ].join("\n\n"),
    portraitFile(KIN_PORTRAIT[record.name]),
    KIN_PORTRAIT[record.name],
  ),
});

export const PLAYERS_HANDBOOK = {
  name: "Descending Darkness Player's Handbook",
  displayName: "Descending Darkness Player's Handbook",
  category: "Descending Darkness",
  ruleset: RULESET,
  author: "Kraken VTT",
  playersBook: true,
  thumbnail: path.join(path.dirname(fileURLToPath(import.meta.url)), "art", "cover-handbook.webp"),
  pictures: { ...SPELL_PICTURES, ...PORTRAITS, "images/cover-handbook.webp": path.join(path.dirname(fileURLToPath(import.meta.url)), "art", "cover-handbook.webp"),
    // The rules chapters' illustrations.
    ...Object.fromEntries(["rules-light","rules-dread","rules-resting","rules-fighting","rules-dying","rules-spells","rules-backgrounds"].map((name) => [`images/${name}.webp`, path.join(path.dirname(fileURLToPath(import.meta.url)), "art", `${name}.webp`)])),
  },
  players: {
    class: CLASSES,
    race: KIN,
    background: BACKGROUNDS,
    spell: SPELLS,
    item: [...WEAPONS, ...ARMOUR, ...GEAR],
  },
  reference: [
    {
      name: "Getting Started",
      sections: [
        {
          name: "The Game",
          pages: [
            {
              name: "Welcome to the Dark",
              blocks: pictured(`*Descending Darkness* is a game of fragile people going into dangerous places, and some of them coming back.

The towns hold. Past their walls the old roads run into ruins, barrows and drowned halls, where the light of a torch is the whole world and the dark beyond it is listening. Your characters go there for gold, for answers, for someone who did not come home.

One player is the **Game Master**: they describe the world, play everyone who lives in it, and decide what the dice mean. The others each play an adventurer. Together you find out what happens.

This book is for everyone. The **Game Master's Guide** and the **Bestiary** are for the Game Master.`, "images/cover-handbook.webp", "Descending Darkness"),
            },
            {
              name: "The Core Roll",
              keywords: "check difficulty dc",
              text: `When the outcome is uncertain and something is at stake, roll a **d20**, add the ability modifier that fits (and your **proficiency bonus** if you are trained in what you are doing), and compare the total to the **difficulty**:

| Difficulty | Number |
|---|---|
| Routine pressure | 10 |
| Risky | 12 |
| Hard | 15 |
| Severe | 18 |

Meet or beat it and you succeed. Before you roll, the Game Master tells you what failing would cost: time, light, position, Health, or attention from something in the dark.

**Advantage** (something helps you): roll two d20 and keep the higher. **Disadvantage**: keep the lower. They cancel each other.

In Kraken, click any number on your sheet to roll it in front of the table; set the DC on the sheet first and the result says success or failure.`,
            },
            {
              name: "Abilities and Proficiency",
              keywords: "ability score modifier proficiency",
              text: `Six abilities describe every character: **Strength**, **Dexterity**, **Constitution**, **Intelligence**, **Wisdom** and **Charisma**. The modifier is the score minus 10, halved and rounded down.

| Score | 8 | 10 | 12 | 13 | 14 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|
| Modifier | -1 | +0 | +1 | +1 | +2 | +3 | +3 | +4 |

Your **proficiency bonus** is +2 at levels 1 to 4, +3 at 5 to 8 and +4 at 9 and 10. Add it to checks with skills you are trained in, to saves your class knows, and to attacks with weapons you know.`,
            },
          ],
        },
        {
          name: "Making a Character",
          pages: [
            {
              name: "Five Steps",
              keywords: "character creation wizard",
              text: `1. **Choose a kin**: human, elf, half-elf, dwarf or gnome. Your kin limits your class.
2. **Choose a class**: fighter, cleric, wizard, thief, paladin, ranger or bard.
3. **Assign ability scores**: put **17, 14, 14, 13, 12 and 8** where you like, then apply your kin's adjustments.
4. **Choose a background** (two skills) and your class's skills.
5. **Take your class's starting gear**, name your character, and say one thing they are afraid of.

Your **Health** at 1st level is your class's hit die at its highest plus your Constitution modifier. Each level after adds the die rolled (or its average, rounded up) plus your Constitution modifier.

In Kraken, the Characters window's **Character Wizard** does all of this: it knows your kin's adjustments and which classes your kin may take.`,
            },
            {
              name: "Advancement",
              keywords: "experience level",
              text: `You gain **experience** for treasure brought back to safety, for dangers overcome, and for discoveries. The Game Master awards it at the end of a session.

| Level | Experience | Proficiency |
|---|---|---|
| 1 | 0 | +2 |
| 2 | 250 | +2 |
| 3 | 750 | +2 |
| 4 | 1,750 | +2 |
| 5 | 3,500 | +3 |
| 6 | 6,500 | +3 |
| 7 | 11,000 | +3 |
| 8 | 17,000 | +3 |
| 9 | 25,000 | +4 |
| 10 | 35,000 | +4 |

Tenth level is the height of a mortal career. Beyond it lie stories, not levels.`,
            },
          ],
        },
      ],
    },
    {
      name: "Kin and Classes",
      sections: [
        { name: "Kin", pages: KIN.map(kinPage) },
        { name: "Classes", pages: CLASSES.map(classPage) },
        {
          name: "Backgrounds",
          pages: [
            {
              name: "Backgrounds",
              keywords: "background",
              blocks: pictured(md(BACKGROUNDS.map((item) => `**${item.name}** (${item.skill}). ${plain(item.text)} *Gear:* ${item.equipment}.`).join("\n\n")), "images/rules-backgrounds.webp", "Where adventurers come from"),
            },
          ],
        },
      ],
    },
    {
      name: "Danger and Exploration",
      sections: [
        {
          name: "The Dark",
          pages: [
            {
              name: "Light and Time",
              keywords: "light torch lantern exploration turn",
              blocks: pictured(`Below ground, time is kept in **exploration turns** of ten minutes. Each turn the party moves, searches, rests a little, or works at something; the Game Master tracks the turns, and every so often rolls to see whether something finds you.

**Nobody sees in total darkness.** Elves, half-elves, dwarves and gnomes have **Dimsight**: in faint light they find their way and see shapes, but cannot read or see detail far off. In darkness they are as blind as anyone.

| Light source | Bright | Dim | Lasts |
|---|---|---|---|
| Candle | - | 5 feet | 6 turns |
| Torch | 20 feet | 20 feet more | 6 turns (an hour) |
| Hooded lantern | 30 feet | 30 feet more | 24 turns per flask |
| Kindle (cantrip) | 20 feet | 20 feet more | 1 hour |

**Light is seen.** A lit torch can be seen far further than it lights. In the dark, the creatures that live there see you coming long before you see them.

In Kraken, the map shows light as it falls: carry a torch on your token and your light moves with you. When the light runs out, it is dark.`, "images/rules-light.webp", "Light and Time"),
            },
            {
              name: "Dread",
              keywords: "dread fear horror sanity",
              blocks: pictured(`Every adventurer has a **Dread** track from 0 to 6. The dark gets into people.

**Gaining Dread.** The Game Master gives you 1 Dread when your light goes out in a dangerous place, when you see something no one should, when a companion falls, or when magic of fear touches you. Truly horrible things give 2.

**Shaken (3 or more).** You have disadvantage on Wisdom checks and saves.

**Broken (6).** Something in you gives way. You choose with the Game Master: you flee, freeze, or fight blindly for a few rounds, and you gain a lasting fear, a nightmare, or a scar. Your Dread then drops to 3.

**Losing Dread.** A safe rest by a fire lowers Dread by 1. A cleric's Steadying Word, a bard's tales, and some spells lower it more. Some things only time and home can heal.

In Kraken, Dread is the row of six marks on your sheet's main page: click to set it.`, "images/rules-dread.webp", "Dread"),
            },
            {
              name: "Resting",
              keywords: "rest recovery dice",
              blocks: pictured(`**A short rest** is one exploration turn of quiet. You may spend **Recovery Dice** (one per level; the die is your class's hit die) and regain the roll plus your Constitution modifier each.

**A safe rest** is eight hours somewhere safe, with **food, water and a bedroll**. You regain half your maximum Health (at least 1), half your Recovery Dice, your spell slots and your class's uses, and lose 1 Dread.

Without food, water or safety, a rest does not count as safe.`, "images/rules-resting.webp", "Resting"),
            },
          ],
        },
        {
          name: "Combat",
          pages: [
            {
              name: "Fighting",
              keywords: "combat initiative attack defense",
              blocks: pictured(`**Initiative.** Everyone rolls d20 + Dexterity. Highest first.

**Your turn.** Move up to your speed and take one action: attack, cast a spell, dash, dodge, help, hide, or use something. Some features give you a bonus action, and you have one reaction a round.

**Attacking.** Roll d20 + Strength (melee) or Dexterity (ranged or finesse), + your proficiency bonus if you know the weapon, against the target's **Defense**. A natural 20 is a **critical hit**: roll the damage dice twice. A natural 1 always misses.

**Defense** is 10 + Dexterity, or your armour's value (+ Dexterity, as the armour allows), + 2 with a shield.

In Kraken, target a creature (Ctrl+click its token) and use the weapon on your sheet's Combat page or the tracker: the roll, the hit and the damage are worked out for you.`, "images/rules-fighting.webp", "Fighting"),
            },
            {
              name: "Dying",
              keywords: "dying death zero health stabilize",
              blocks: pictured(`At **0 Health** a character is **dying**: they fall, and cannot act.

At each of their turns a dying character **loses 1 Health**. An ally beside them may use an action to **steady** them: a Wisdom check against 12 (a healer's satchel does it without a roll). A steadied character stops bleeding and stays unconscious until healed.

Any healing brings a dying character back from 0.

A character dies when their Health reaches **minus their maximum**. Monsters die at 0.

In Kraken, a dying character's tracker row has a **Steady** button: an ally presses it, and their Wisdom is rolled.`, "images/rules-dying.webp", "Dying"),
            },
            {
              name: "Spells",
              keywords: "spells magic slots circle",
              blocks: pictured(`Clerics, wizards and bards cast spells from 1st level; paladins and rangers from 2nd. Spells come in **circles** (1st to 3rd in this book) and **cantrips**, which cost nothing.

Casting a spell of a circle uses a **slot** of that circle or higher; slots return after a safe rest. A spell cast in a higher slot is often stronger.

Your **spell save DC** is 8 + your proficiency + your casting ability; your **spell attack** is your proficiency + your casting ability.

Magic does not light the dark unless it says so, and it is noticed: the Game Master may roll for wandering things after loud or bright magic.`, "images/rules-spells.webp", "Spells"),
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
              keywords: "license credits",
              text: `**Descending Darkness** is an original game made for Kraken VTT. Its text and setting are original, and it may be shared freely with Kraken.

Its game mechanics are in the family of the world's most played fantasy roleplaying game. Some of those mechanics are based on the **System Reference Document 5.1** by Wizards of the Coast LLC, available at dndbeyond.com/srd and licensed under the **Creative Commons Attribution 4.0 International License** (creativecommons.org/licenses/by/4.0). No text of that document is reproduced here. *Descending Darkness* is not affiliated with or endorsed by Wizards of the Coast.`,
            },
          ],
        },
      ],
    },
  ],
};
