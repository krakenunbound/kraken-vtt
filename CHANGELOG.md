# Changelog

What changed in each release of Kraken VTT. Downloads are on the
[Releases](https://github.com/krakenunbound/kraken-vtt/releases) page. The
full log of the work is in [PLAN.md](PLAN.md).

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
