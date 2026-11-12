# Changelog

What changed in each release of Kraken VTT. Downloads are on the
[Releases](https://github.com/krakenunbound/kraken-vtt/releases) page. The
full log of the work is in [PLAN.md](PLAN.md).

## 0.1.0-alpha.62: Kraken packs and D&D 3.5E

**Kraken packs: your books without Fantasy Grounds**

- Books has a **Packs** tab: each of your Fantasy Grounds books becomes one
  Kraken file (`.kpack`) with its pages, records, maps (walls, doors and
  lights too) and pictures, in `Documents/Kraken VTT/Packs`. Copy that folder
  to another computer and the books open there in Kraken, with no Fantasy
  Grounds and no .mod files. Make one, or all of a game's at once; a 400 MB
  book takes about 7 seconds.
- Kraken reads a pack anywhere it reads a book: the Books window, activation,
  the Library, story, encounters and maps. If the FG module is newer than its
  pack, the module is read until you make the pack again.

**D&D 3.5E**

- A new ruleset for your 3.5E books: the 3.5E character wizard and sheet
  (abilities, Fortitude, Reflex and Will, AC with touch and flat-footed, base
  attack and grapple, skills by ranks, feats, spells per day, gear).
- The combat tracker plays 3.5E: d20 initiative, criticals by threat range and
  confirmation (damage rolled x2, x3, x4), full attacks with every iterative
  bonus, saves against a DC, and Disabled at 0, Dying at -1 to -9 (10% a turn
  to become stable), dead at -10.
- Fixed: a C&C creature's attacks written "Pole arm (1d10) or dagger (1d4)"
  were read as one attack; "or" and "and" now split them.
- A 3.5E Player's Handbook's classes, races, feats, skills, spells and gear,
  and a Monster Manual's creatures, come into the campaign when the book is
  made active.

## 0.1.0-alpha.61: the alpha.60 audit's fixes

A blind audit of the whole app (the table server, combat, maps and saving)
found these; each is fixed and checked (`scripts/check-security-fixes.mjs`,
`check-combat-fixes.mjs`, `check-map-fixes.mjs`).

**The table and your files**

- One malformed request could crash the table and drop every player. It is
  now answered with an error and the table plays on.
- A player could read pictures from anywhere on the GM's computer, or from an
  adventure not shared with them, through a note's picture. Pictures now come
  only from inside a module, and a player's own records only from modules
  shared with them.
- A damaged save (a power cut, a file held by OneDrive) opened as an empty
  campaign, and quitting wrote the empty one over the real one. Saves now keep
  the previous copy, read it when the newest is damaged, and refuse to open
  rather than lose a campaign.
- Five wrong passwords and that address waits before it may try again. New
  account passwords are at least 6 characters. Another website's page cannot
  open a seat at your table. Names starting with `@` are the table's own.
- Players can no longer choose a record's id (they could take over the party
  sheet), keep endless or huge notes, give their character another
  character's name (whispers go by name), or push out the GM's map paint with
  their drawings. A player's import tells the GM its level in chat.
- The DM assistant no longer reads or writes files by a path, nor touches
  players' accounts: it reads what players write, which could ask it to.
- A book made active after the Library had added one of its creatures loaded
  only partly; it now loads whole.

**Combat**

- Removing the creature whose turn it is no longer restarts the round.
- Dead creatures lose their turns.
- A player's End Turn on someone else's turn no longer clears that
  creature's targets.
- Damage ends "stable" (5E, Descending Darkness, Castles & Crusades).
- D&D 5E: hit points stop at 0; damage at 0 is a failed death save, and
  only damage left over of at least your maximum kills outright.
- Concentration: a new concentration spell ends the last one's effects;
  damage asks for a Constitution save (DC 10 or half the damage); falling
  ends it; ending it from the sheet or a card ends its effects too.
- D&D 5E damage follows resistance, immunity and vulnerability; paralyzed,
  stunned, petrified and unconscious creatures fail Strength and Dexterity
  saves.
- A spell with a minus bonus and no dice no longer fails after spending its
  slot; a Castles & Crusades NPC's daily use is spent only on a real action.
- Used slots and death saves can no longer be set below 0.
- Apeira Astra: an attack with no targets no longer stops the next damage.
- Bleeding starts fresh in each fight.

**Maps**

- Sight no longer slips through room corners.
- A player can no longer take their token off and put it back past walls or
  while movement is locked.
- A hidden creature's torch, lights in rooms no one has seen, and GM drawings
  under the mask are no longer sent to players.
- Undo keeps door locks and group visibility.
- A click on a large token no longer moves it; dropping damage or a card on
  overlapping tokens hits the one on top, and the right one of two alike.
- Explored areas no longer go dark again after a long crawl; editing never
  carries over from one map to the next.

**Ability cards**: a spell listed twice is one card; switching characters
plays no false long rest; a level with no slots left but a higher one free
shows an arrow; Blowguns and "Moonstone" daggers get the right picture.

## 0.1.0-alpha.60: ability cards

Some tables lay out printed spell cards and turn them over as they are used.
Kraken now has them, as an option each player turns on.

- **Ability cards.** Turn on **Ability cards** in **Settings** and a **Cards**
  button appears in the sidebar. It opens your spells and weapons as cards,
  grouped by level, with your slots as pips. The window moves and pops out like
  any other. It is off until you turn it on, and each player chooses for
  themselves.
- **Turn a card over** (click it) for its full text and **Cast**, or
  **Attack** and **Damage** for a weapon. A cast flares the card with sparks
  in the colour of its damage, and a foil shimmer follows your pointer.
- **Drag a card onto a creature's token** to make it your only target and
  cast or attack in one move.
- **Spent cards tip over and go grey** when no slot of their level or higher
  is left. **Long rest** gives the slots back and stands them up one after
  another. The spell you are concentrating on glows; **End** stops it.
- **Pictures.** Every Descending Darkness spell has its own painted card, and
  weapon cards show their kind: blade, axe, bow, crossbow, staff, hammer,
  spear, sling, fist or firearm.
- **Fan or Spread** lays the cards out as a hand or in rows. **Card effects**
  in Settings turns the movement off (so does your system's reduced motion).
- The cards are a view of your sheet: spending a slot on the sheet tips the
  card, and the other way round. AI agents use them with `kraken_cards`.

## 0.1.0-alpha.59: bug fixes

Four findings from a review of alpha.58, each fixed and checked in
`npm run audit` (D&D 5E and Descending Darkness).

- **The fallen cannot act.** A creature that is Dying, Unconscious or Dead, or
  Paralyzed, Stunned, Petrified or Incapacitated by an effect (Slumber, Hold
  Foe), cannot attack, roll an attack's damage or cast. A dying character
  still gets their turn, for their death save.
- **Damage dice from effects count.** An effect's `DMG: 1d6` (or
  `DMG: 2d6 radiant`) adds its dice to the attacker's damage, doubled on a
  critical hit. Silver Brand and Iron Will go on the caster.
- **Hunter's Quarry works.** It goes on the ranger, aimed at the targeted
  creature (the tracker shows `Quarry; DMG: 1d6 [-> Bone Sentinel 1]`), and
  adds its 1d6 only to hits on that creature. It needs a target before a slot
  is spent.
- **A critical hit on a dying character is two failed death saves**, as in
  Fantasy Grounds, from a weapon or a spell.
- **Attacks on the helpless have advantage.** Against a creature that is
  Dying, Unconscious, Paralyzed, Stunned or Petrified, weapon and spell attacks
  roll two d20s and keep the higher, marked `[ADVANTAGE]`. A melee hit on an
  Unconscious or Paralyzed creature is a critical hit, marked
  `[CONVERTED TO CRIT]`. (Fantasy Grounds converts only within 5 feet; Kraken
  converts every melee hit.)

Not changed: damage that temporary hit points absorb completely does not
count as a failed death save, as in Fantasy Grounds.

Campaigns made before this version keep their copy of Hunter's Quarry, Silver
Brand and Iron Will. To get the new ones, make the Descending Darkness
Player's Handbook inactive and then active again in the Books window.

## 0.1.0-alpha.58: bug fixes

The eleven findings of the alpha.56 source audit ([bugslist.md](bugslist.md)),
each fixed and checked (`npm run audit`, with Kraken's own games, so it runs on
any computer).

**Combat (D&D 5E and Descending Darkness)**

- **Damage lands only where the attack hit.** Damage after an attack goes to
  the targets that attack hit; a missed target is skipped, and chat says so.
  With no attack since the last damage, the Damage button hits every target,
  as in Fantasy Grounds.
- **A critical hit belongs to its attack and its target.** A new attack
  forgets the last one's critical (Fantasy Grounds clears it the same way), and
  in an attack on several creatures only the critted target's dice double.
- **A spell's critical belongs to that cast.** It no longer carries over to
  the next spell against the same creature.
- **Temporary hit points take damage first**, and the combat tracker shows
  them beside Health (`7/7 (+5)`). Healing does not restore them.
- **Damage can be 0.** A roll that totals 0 or less (a penalty against a small
  die) deals no damage instead of 1. Castles & Crusades keeps its minimum of 1.
- **Advantage on a save in a fight keeps the tracker's effects.** A save with
  advantage or disadvantage now goes through the tracker, so Bless and other
  save effects still count.

**Descending Darkness**

- **Dread changes rolls.** At 3 Dread or more, Wisdom checks, Wisdom saves,
  Wisdom skills (Insight, Perception...) and steadying a dying ally are at
  disadvantage, marked `[DREAD]` in chat; chosen advantage cancels it.
- **No death saves.** The dying bleed until someone steadies them; a death
  save is refused, even from the agent or a crafted message.

**Apeira Astra**

- **Down means out of the fight.** At 0 Stamina a crew member loses their
  turns and cannot attack until healed.
- **Initiative without Tactics is -3**, like any skill you do not have
  (Tactics 0 adds 0). The Crew Handbook says so.

**Table**

- **Players change their characters only through the sheet.** A player's
  direct record change can set a character's portrait, token, dice, spent
  slots and words (notes, appearance), never a number the rules read, and
  cannot replace the character. A character a player makes
  starts blank, and players make only notes and characters. The GM
  and the agent are unchanged.
- **A creature with 0 maximum Health and wounds shows as Dead**, not Healthy.

## 0.1.0-alpha.57: Linux

- Linux x64 builds: an AppImage for any distribution and a `.deb` for Debian,
  Ubuntu and their family.
- Kraken finds Fantasy Grounds' data folder on Linux and macOS as well.
- The tests find Chrome or Chromium on any system.

## 0.1.0-alpha.56: the first public build

- PolyForm Shield License 1.0.0 throughout.
- Test scripts write to the temp folder.

## 0.1.0-alpha.55: Kraken's own games

- Descending Darkness (dark fantasy, d20) and Apeira Astra (science fiction,
  2d6), each with its books and a first adventure (*The Empty Watchtower*,
  *Salvage Rights*) with maps, walls, handouts, creature portraits and tokens.
- A portrait for every new hero; NPC windows show portrait and description.
- Six start-screen scenes.
- README and guides in `docs/`.

Earlier releases are described in their commits and in [PLAN.md](PLAN.md).
