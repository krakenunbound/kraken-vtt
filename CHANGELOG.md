# Changelog

What changed in each release of Kraken VTT. Downloads are on the
[Releases](https://github.com/krakenunbound/kraken-vtt/releases) page. The
full log of the work is in [PLAN.md](PLAN.md).

## Unreleased

- **Code mode for AI agents.** A new agent tool, `kraken_code`, takes one
  piece of JavaScript that calls several Kraken tools at once (in parallel,
  or one result feeding the next) and sends back only what the code returns.
  An agent can read the tracker, the party and a map in one step instead of
  three. The code runs in a sandbox of its own, with the same checks on every
  tool it calls; see AGENT.md.

## 0.1.0-alpha.88: Ten games in the box

Kraken now comes with ten games you can play with nothing else installed:
its own Descending Darkness and Apeira Astra, and eight from open licences:
D&D 5E (the SRD 5.2.1), Basic Fantasy, Cairn, Ironsworn, Starforged, Fate
Core, Fate Accelerated and Forged in the Dark. Each has its rules, its
character wizard and sheet, its books and a first adventure with maps, and
each passed the full end-to-end run (a player in Chrome makes a character,
buys gear, fights, and is given a parcel and experience). Each open game's
text keeps its own licence, in its folder under `games/`.

- **Apeira Astra: Marks and tricks.** A crew member now grows in a second way:
  the GM awards a **Mark** (at most six in a career) from the sheet, and the
  player learns a **trick** with it from their major or minor Path (three
  each). The sheet's Main page shows the Marks and the tricks with their text;
  a trick shows beside the skill it names. Improve still stops at skill 4 and
  characteristic 15. Agents: `kraken_character_mark`.
- **Apeira Astra: a new job, *A Lamp in the Rock*** (one session): a freighter
  fused with an asteroid, two stamps on one claim, a rival on the clock and a
  passenger still alive. Two maps with walls and hatches.
- **Apeira Astra's books grow.** Fifteen new pieces of gear (hull tape, patch
  foam, a line gun, a shock net, a claim beacon, a doc box...) and a "What
  Credits Buy" page listing everything with its price; the Threat Dossier adds
  twelve people, machines and creatures with portraits and tokens (contacts
  who offer something, rivals who want something), a salvage roll, how to run
  a job and six jobs ready to play.
- **A gentler "your turn".** The turn alert was a church bell, loud enough to
  hear from the next room. It is now a soft two-note chime (a starship
  console's tone in Apeira Astra, Traveller and Starforged), much quieter.
  Turn it off in **Settings > You at the table**.
- **Forged in the Dark's playbooks have portraits:** the Enforcer, Tracker,
  Tinker, Burglar, Grifter, Schemer and Occultist, painted for Brackwater,
  each with its map token. A new scoundrel starts with their playbook's.
- **Typing in Chinese, Japanese or Korean:** pressing Enter to confirm a
  word in an input method no longer sends a half-typed line from the
  assistant, sheets, the Calendar or Ironsworn's lists.
- **Fate Core and Fate Accelerated come with Kraken.** Make a campaign with
  the *Fate Core* or *Fate Accelerated* ruleset and play with nothing else
  installed: Evil Hat's System Reference Documents (CC BY 3.0) as *Fate Core
  System* and *Fate Accelerated Edition*, the GM's *Fate Toolkit and
  Adversaries*, and a starter scenario of Kraken's own, *The Lighthouse at
  Gull's End* (two zoned battle maps, two conflicts, pregenerated characters
  for both games).
  - **Fate dice:** the dice tray has a Fate die (four make a roll); 4dF lands
    plus, minus and blank on the 3D dice and in the tower, and chat shows the
    dice and the total on the ladder (Great +4).
  - **The character wizard** follows each book: high concept and trouble, the
    phase trio, the skill pyramid (Fate Core) or the six approaches (Fate
    Accelerated), stunts from the books or your own, refresh, stress and
    consequences worked out; or a pregenerated character taken as it is.
  - **The sheet** rolls 4dF with a skill or approach for any of the four
    actions against an opposition (fail, tie, succeed, with style, and the
    shifts); invokes an aspect on the last roll for +2 or a reroll (a fate
    point, or a scene aspect's free invoke); accepts or refuses compels; keeps
    fate points and refresh, stress boxes and consequences (with recovery),
    stunts, extras and milestones instead of experience.
  - **The Scene Aspects strip** shows everyone the scene's aspects and free
    invokes and the GM's fate points; the GM adds aspects, starts a new scene
    and refreshes everyone for a new session.
  - **Fate's conflicts on the combat tracker:** turn order without dice
    (Notice, or Quick), attacks against defences in shifts, boosts on ties,
    stress boxes and consequences, NPCs (nameless, supporting, main) taken
    out, a player's hit taken the way they choose, conceding for fate points.
  - **The party sheet's** Milestones tab gives the party a minor, significant
    or major milestone; parcels hand out things (no coin), written into each
    character's extras.
- **Ironsworn and Ironsworn: Starforged come with Kraken.** Two new rulesets,
  *Ironsworn* (with *Delve*) and *Starforged*, on one engine, played from
  Shawn Tomkin's CC BY 4.0 moves, assets and oracles (an unofficial
  adaptation; the CC BY-NC-SA rulebook text is not included). Each comes
  with a Reference (Kraken's own short rules chapters, every move, asset and
  oracle), a GM's book of foes (Ironsworn's are Kraken's own; Starforged's
  sample foes; Delve's site themes and domains) and a starter scenario with a
  map (*The Cinder Barrow*, *The Silent Hulk*).
  - **The wizard follows each game's steps:** stats 3, 2, 2, 1, 1; three
    assets (Starforged: two paths, the Starship and one more); a background
    vow; bonds, or a first connection; an inciting vow; what you carry.
  - **The sheet:** stats, health, spirit and supply (shared by the party),
    momentum with its maximum and reset, debilities or impacts, the
    initiative (in control); every move on the Moves tab, rolled in front of
    the table (d6 + stat + adds, at most 10, against two d10: strong hit, weak
    hit, miss, matches; a die cancelled by negative momentum). What the
    outcome plainly does happens by itself, its choices become buttons, and
    **Burn momentum** is offered when it would do better. Vows, journeys,
    expeditions, fights, connections and sites as ten-box progress tracks
    (marked by rank, rolled against, fulfilled for experience); bonds
    (Ironsworn) or the legacy tracks (Starforged: experience from them);
    assets bought and upgraded with experience.
  - **The Oracles window** (everyone's: these games are often played without
    a GM) rolls any table, and Ask the Oracle; **Delve Sites** (the GM's)
    rolls a site's features and dangers from its theme and domain.
  - **The combat tracker** shows a foe as its rank and progress track (no hit
    points): Strike and Clash mark it from the sheet, the GM marks it or
    inflicts its harm from the tracker, End the Fight (Take Decisive Action)
    rolls against it.
  - No money: a parcel's **Supply** fills the shared supply meter.
- **Forged in the Dark comes with Kraken.** Make a campaign with the *Forged
  in the Dark* ruleset and play a crew of scoundrels with nothing else
  installed. It is based on Blades in the Dark (John Harper, One Seven Design)
  through its System Reference Document (CC BY 3.0), with three books:
  *Forged in the Dark: Scoundrel's Handbook* (every player chapter, seven
  playbooks, six crew types, the items), *Forged in the Dark: Game Master's
  Guide* (the faction game, entanglements, magnitude, rituals, crafting,
  cohorts) and a starter score, *The Brine Street Job*, with a map of its
  counting-house (walls and doors), its factions, people and clocks.
  - **Rolls as the game has them:** a pool of d6s on the table's dice, the
    highest die read (two 6s a critical; with no dice, two dice and the
    lowest). Action rolls show the GM's **position** and **effect**; a
    teammate can **assist** (+1d, 1 stress), you can **push** yourself
    (+1d or +1 effect, 2 stress) or take a **Devil's Bargain**. Resistance
    rolls cost 6 stress less the highest die. Stress past the last box is
    trauma; the fourth trauma retires the scoundrel.
  - **The sheet** has every field: actions and attributes with their xp
    tracks, stress and trauma, harm and its penalties, the healing clock,
    armor, load and items, coin and stash, special abilities and advances,
    friends and rivals, long-term projects, and the downtime activities.
  - **The character wizard** follows the book: playbook, heritage,
    background, four action dots, a special ability, a friend and a rival,
    a vice and its purveyor, a name, an alias and a look.
  - **The crew** is the party sheet's new **Crew** tab: made with its own
    wizard (type, reputation, lair, hunting grounds, ability, upgrades,
    contact), then Tier, hold, rep and turf, heat and wanted level, coin and
    vault, crew xp, upgrades, cohorts, the claim map and faction status.
    Parcels pay out in coin; the party's XP award marks each scoundrel's
    playbook xp.
  - **The Score panel** takes the Combat button's place (the game has no
    initiative): the phase, position and effect, the plan and its detail, the
    engagement roll, fortune rolls, group actions, payoff, heat,
    entanglements, and the start and end of downtime.
- **Progress clocks for every table.** A **Clocks** window (and a strip in
  the top bar that every seat sees): 4, 6 or 8 segments (2 to 12), danger,
  racing, linked, tug-of-war, mission, project and faction clocks, kept for
  the GM until shown. An action roll can tick one by its effect.
- **D&D 5E plays with nothing else installed.** Kraken now ships the System
  Reference Document 5.2.1 as three books for a D&D 5E campaign, made from
  the SRD's own PDF:
  - *SRD 5.2.1 Player's Rules*: every rules chapter to read, and the 12
    classes (each with its subclass and its features to level 20), 9 species
    with their lineages, 4 backgrounds, the feats, all the equipment and 339
    spells for the character wizard and the sheet. Spells that roll play on
    the Combat Tracker: Fire Bolt's attack, Fireball's save for half, Cure
    Wounds, Magic Missile's darts, Bless's d4 and 189 more.
  - *SRD 5.2.1 Creatures*: all 330 monsters and animals, their attacks rolling
    on the tracker.
  - *SRD 5.2.1 Magic Items*: the 258 magic items and their rules.

  Make a D&D 5E campaign and the three are on its shelf; your own 5E books
  sit beside them. Each book carries the SRD's licence notice (CC BY 4.0).
- **5E sheets:** a Barbarian or Monk without armor gets Unarmored Defense
  (10 + DEX + CON, or + WIS for a Monk without a shield). A Monk is proficient
  only with martial weapons that are Light, a Rogue with those that are Finesse
  or Light, as the SRD 5.2.1 says.
- **Cairn, Second Edition comes with Kraken.** Make a campaign with the
  *Cairn* ruleset and play it with nothing else installed: Yochai Gal's game
  (CC BY-SA 4.0) with its *Player's Guide*, *Warden's Guide* and the adventure
  *Trouble in Twin Lakes*, made from the official text.
  - **The character wizard follows the book:** a background rolled on the d20
    (or chosen), a name from its list, its starting gear and a roll on each of
    its two tables; STR, DEX and WIL on 3d6 with one swap; Hit Protection 1d6;
    the traits, a Bond, the age and (for the youngest) an Omen; 3d6 gold
    pieces to spend at the Marketplace. Every die is rolled in front of the
    table.
  - **The sheet:** saves (a d20 at or under; a 1 always succeeds, a 20 always
    fails), HP and Armor, the ten inventory slots (bulky two, petty none, four
    on the body and six in the backpack; a full inventory takes HP to 0),
    Fatigue, rest (a short rest, a night's rest, a week with a healer),
    deprivation, spellbooks (a Fatigue each cast), scrolls and relics, the
    traits, Bond and Omen, and a **Growth** tab instead of experience: Scars,
    what has changed, Downtime milestones.
  - **Cairn's combat on the tracker:** the PCs act first, each saving DEX to
    act in the first round; attacks always hit (impaired d4, enhanced d12, two
    weapons keep the best, blast, detachments); damage past Armor comes off HP
    and then STR, with a STR save against Critical Damage; HP taken to exactly
    0 rolls on the Scars table; morale (WIL) at the first casualty and at
    half; several attackers on one foe keep the highest die.
  - **The party sheet** hands out gold pieces, and its XP tab is the party's
    Growth: Cairn has no experience points.
- **Basic Fantasy comes with Kraken.** The free *Basic Fantasy Role-Playing
  Game, 4th Edition* (Chris Gonnerman, CC BY-SA 4.0) is a new ruleset on the
  campaign screen, with its books and a first adventure, so a table can play it
  with nothing else installed:
  - **The character wizard follows the book:** 3d6 in order on the host's
    dice, a race whose limits the scores meet, a class it may take (the Elf's
    Fighter/Magic-User and Magic-User/Thief too), the hit die, 3d6 x 10 gp and
    a shop that greys out what the class may not use, a Magic-User's first
    spell, name and alignment.
  - **The sheet** works out Armor Class, the attack bonus, the five saving
    throws, movement, thief abilities and spells a day; saves, ability rolls,
    thief abilities and loyalty roll from it; level up rolls the hit die to
    9th level and adds the fixed hit points after. Humans get +10% experience.
  - **The combat tracker** plays its rules: d6 initiative, highest first; d20
    + attack bonus against ascending AC; monsters attack by hit dice; dead at
    0; **Turn undead** for clerics (2d6 hit dice) and a **Morale** button for
    monsters.
  - **Books:** the *Basic Fantasy Player's Handbook* (rules chapters, 4 races,
    6 classes, 105 spells, 85 items), the *Basic Fantasy Game Master's Guide*
    (245 monsters, 135 magic items, treasure and the GM's chapters) and *The
    Mill at Hob's Ford*, a first adventure written for Kraken (goblins under a
    village mill, and what they woke; two maps with walls and doors, three
    treasure parcels). The books stay under CC BY-SA 4.0, with the notice on
    each one's first page; no art from the book is included.

## 0.1.0-alpha.87: Two fixes from the screenshot shoot

- **A read-aloud bubble leaves on time.** It could stay over the map for
  minutes, because its timer started again whenever a map window opened or
  closed. It now counts from when the words came, and leaves after the time it
  takes to read them. Joining a table clears any old bubble.
- **The Message of the Day opens only as a player joins.** It used to pop up on
  every player's screen whenever the GM changed it during the game.
- **The README** now has 24 full-screen screenshots, each explained.

## 0.1.0-alpha.86: Back really goes back

- **Back and Round back now undo the turn change** on the combat tracker,
  rather than only moving the arrow and the round number:
  - effects that ran out come back, with their rounds;
  - durations that counted down go back up;
  - ongoing damage, and the hit points the dying lost, are healed;
  - death saves and cleared targets go back as they were.

  Whatever happened during the turn stays: an attack, damage you put on by
  hand, a new effect. Press Next again and it runs normally, so nothing
  counts twice. The chat says what came back. Kraken keeps the last 40 turn
  changes of the sitting, so you can step back several times. FG can't do
  this: its tracker keeps no history.

## 0.1.0-alpha.85: At the table

- **Your turn, unmissable.** When a player's turn comes round in combat, a
  banner sweeps across their screen and a bell rings. Each player chooses which
  in **Settings > You at the table**.
- **Your colour, everywhere.** In **Settings > You at the table**, each person
  picks a colour. It rings their tokens, and colours their pings and their
  drawings, so everyone knows who is who.
- **Shapes on the map, for everyone.** The pen draws free lines, straight
  lines, **arrows** (direction and aim), **squares**, **circles** (from their
  centre) and **cones** (from their point). Each shape is measured in feet as
  you draw it, drawn in your colour, and resized by dragging its two handles.
- **The combat tracker's corrections:**
  - **Back** returns to the previous turn;
  - **‹ Round ›** moves the round back or on;
  - click a row's arrow space, or drag the turn arrow onto a creature, to make it their turn.

  **Next turn** and **Next round** still run the rules (durations count down
  and expire, ongoing damage, start-of-turn effects). The corrections only move
  the counter and the arrow, so fixing a mistake never applies anything twice.
- **Death markers** (FG's). A creature that dies leaves a marker where it
  stood: blood in its colour, a skull, a tombstone, bones or a scorch mark.
  **Settings > Death Markers** picks a set for each creature type of your game
  (undead start violet, constructs black). Right-click a marker to remove it.
- **The Calendar** (FG's, with your Kraken Calendar Notes):
  - each game has its own calendar: Greyhawk for AD&D, 3.5E and C&C, Harptos
    for 5E, Golarion, Traveller's Imperial date, and Kraken's own for
    Descending Darkness and Apeira Astra;
  - the GM sets the date and time, moves the day on, adds 8 hours for a rest,
    and says the date in chat;
  - anyone writes notes on a day. A player's note is signed in their colour; a
    GM's note is shown to the players or kept private.
- **The Message of the Day** (FG's): the GM's words and links (a map, an NPC,
  a page). It opens on each player's screen as they join.
- **Read aloud** (FG's boxed text). An adventure's boxed text has a button for
  the GM: the words go to chat and appear over everyone's map as a speech
  bubble.
- **Chat into notes:** drag any chat line into a note, or onto Player Notes to
  start a new one.
- **Hex grid on black, and more game-table wallpapers.** The **Tabletop** set
  has hex grids (slate, black), a battle mat, a dungeon map and an old world
  map. The **Sci-Fi** set has an amber hex grid, a star chart and starship deck
  plating. Big pictures now show at their own size, as FG's desktop does. Five
  sci-fi **background decals** too. The plain Patterns set from alpha.84 is gone.
- The map's Lock button is an icon only; its tooltip says whether it's locked.

## 0.1.0-alpha.84: Dice towers, dice packs, and your Kraken VTT folder

- **The dice tower has a menu.** Right-click the tower on the table: **Lock
  it where it stands** (a padlock; dragging no longer moves it, a click still
  turns it on and off), **Fix it at** an exact x,y (put there and locked), turn
  it on or off, and, for the GM, **Change its look…** or **Dock it in the
  chat**. Each screen keeps its own place and lock.
- **The tower comes alive when you hold dice over it,** on or off: the dice
  tumble twice as fast and the door blazes. Before, only a click lit it.
- **Tower looks, chosen by the GM for everyone:** six drawn towers (Castle
  stone, Ironbound oak, Obsidian runes, Frost spire, Clockwork brass, Bone
  ossuary), the **Kraken Lighthouse** from your Fantasy Grounds Kraken Ocean
  Theme (dark when off, lit when on, as in FG), and five painted towers (Wizard
  Spire, Dwarven Forge, Haunted Belfry, Elven Birch, Dragon Skull). Add your
  own picture, with a `lit` twin if you like.
- **Dice packs.** A folder (or .zip) with `dice.json` and its pictures, dropped
  in the Dice folder, adds dice sets for everyone at the table. Sets can wear
  pictures on their faces, with a glowing part. The **Kraken Sea Glass**
  example comes with the folder.
- **A Kraken VTT folder you can find:** `DocumentsKraken VTT` holds a folder
  for each kind of thing you add: Packs, Dice, Dice Towers, GM Icons, Background
  Decals and Wallpapers. Each has a README saying what goes in it and how to make
  one. `AGENTS.md` explains the same for an AI agent. What you added before is
  copied in. **Settings > Kraken VTT Folder** opens it.
- **Eight new desktop wallpapers** (Patterns): deep sea slate, tooled leather,
  Kraken damask, star field, ship deck, dragon scales, old parchment and
  engraved waves, all seamless.
- **Checked: the map editor is the GM's alone.** A test player has no Lock,
  preview, editor or pins on a shared map, and the host refuses a player's
  walls and lights even when they are sent behind the interface's back.

## 0.1.0-alpha.83: Updates

- **Kraken updates itself.** When it starts, it looks once for a newer
  release on GitHub. If there is one, the start screen (and only the start
  screen, before a campaign is opened) says so, with what's new: **Download**,
  then **Restart and install**. Nothing about updates ever appears during a
  game, Kraken never looks again while it runs, and it never downloads or
  installs while a campaign is hosted. The download is checked against its
  SHA-512 before it can be installed.
- The Linux AppImage updates the same way; the .deb is installed by hand.

## 0.1.0-alpha.82: A stray table map no longer comes back

- **Fixed: a table map from a book that is not active kept coming back**
  when a campaign was hosted (a map saved by its book file's Windows path was
  taken for the GM's own picture). A book's map now comes back only while its
  book is active, however it was saved; otherwise it is forgotten. Checked on
  a copy of the campaign it happened in, in the built app.

## 0.1.0-alpha.81: The image window, and Assets

- **The image window works as Fantasy Grounds' does, in Kraken's own way:**
  its corner holds **Locked / Unlocked** (unlocked: the editor at the side),
  the **player vision preview** (what the players see: their tokens' sight,
  the light and the dark) and **Tools**, which shows or hides the tool strip.
  Locked with the tools hidden, the picture alone.
- The tool strip adds the **navigation pad** (pan and zoom by buttons) and
  **pins** shown or hidden, beside zoom, fit, ping, draw and erase.
- **Share, or not:** an image you open says *Not shared · Share*; the table's
  map says *Shared*, and a click stops sharing it (the players see no map)
  until you share it again.
- **Assets** (Library > Assets): every picture of your active books and art
  packs by folder, records or not (an art pack's props too). Preview one to
  **Make it a map** (it joins Images under *This campaign* and opens to edit),
  **Share** it, or **Set it as the background**.

## 0.1.0-alpha.80: Only active books; a closed map stays closed

- **Only the books active in the campaign give their maps, pictures and
  records** (as Fantasy Grounds loads a module): opening a map, the Library,
  reading a book and the agent's tools all refuse a book that is not active.
  In Modules, an inactive book's title says to make it active first.
- **A table map from a book no longer active is not brought back** when you
  host the campaign again.
- **A table map whose window you closed stays closed** when you host again
  (it is still the table's: open it from where you see it).
- The image window's bar names the book, never a file's path.

## 0.1.0-alpha.79: Every picture opens its image; an external dice tower; Internet hosting

- **Every picture opens its image, wherever you click it** (the GM): a
  picture on a book's page, in its Images & Maps tab, in Images, the Library
  or a quick slot opens the image window, its one master, to share, edit and
  play test. A book's map opens as the map with its walls (The Caves of Chaos
  with its 4,916), even where the page also shows a handout of it; any other
  picture opens as an image of its own. Players still see only what is shared.
- The GM's **Map** button along the top of the sidebar is gone (maps open from
  where you see them, and the map window comes to the front); players keep it.
- **External dice tower** (the GM's Settings): the dice tower stands on the
  table apart from the chat, for every seat (drag it anywhere; each screen
  keeps its place). A little stone tower: dark when off, its door glowing and
  dice tumbling inside when on. Click to turn it on or off; drop dice on it.
  Unticked, it is docked in the chat as before.
- Hosting's **Cloud** choice is now called **Internet** (players anywhere,
  once the port is open on your router): there is no rented cloud server.

## 0.1.0-alpha.78: Map Studio, Kraken's map maker

- **Map Studio is part of Kraken** (the pen along the top of the sidebar):
  paint art from Kraken's art pack, Battle Map Forge's, and your own Fantasy
  Grounds art packs and Dungeondraft packs; walls, doors and windows with art
  along them; lights and time of day; weather with masks; traps and regions;
  a dungeon generator; play testing.
- **Open in Map Studio** on any image (its image window's bar) opens it with
  its walls, doors, lights and weather. **Save to Kraken** writes them back
  into the image, and what you painted becomes its picture, wherever the
  image is opened. Opened again, it is as you left it.
- **Settings > Map Studio art** (the GM's): point Map Studio at your own
  Dungeondraft pack folders and art pack folders; nothing is assumed.
- It makes maps for Kraken only: exporting to Fantasy Grounds or Foundry
  stays with the stand-alone Map Studio.
- **The map window comes to the front when it opens** (a map put on the
  table, an image opened from Images, a book or the Library), as Fantasy
  Grounds' image windows do; clicking another window brings that one forward.

## 0.1.0-alpha.77: Images, as in Fantasy Grounds

- **Campaign > Images** lists every picture of every active book, maps and
  handouts. A click opens it in the image window.
- **One master per picture:** its walls, doors, lights, paint, effects and
  tokens are kept in the campaign, and Images, the book's pictures, the
  Library and the table all open that same image.
- **An image you open is yours alone** until you choose **Put in play**; the
  players keep their map meanwhile.
- **Lock / unlock:** every picture has **Unlock to edit**, and the map
  window's **Locked / Unlocked** button switches between editing and play.
- **Play test:** a test token on the image, seen as a player sees it (walls,
  doors, light). Drag it to find problems; End play test removes it.

## 0.1.0-alpha.76: The ruleset picker

- **The ruleset picker uses the whole screen:** it fills as many columns as
  the window holds (six at 1920 wide), each ruleset's blurb in three lines,
  the chosen one's full description below. A search box appears once there
  are many rulesets.
- **An emblem for each ruleset**, Kraken's own, on the tiles and in the
  campaign list. Put a picture of your own (a logo from your books) in
  `assets/rulesets` in your Kraken data folder, named as the ruleset, and it
  shows instead, on your computer only.
- D&D 3.5E and 5E are described as played from your own rulebooks, not "the
  SRD" (an SRD is just one of the books you may make active).

## 0.1.0-alpha.75: Dice and macros on the quick slots; Modules and Books apart

- **Dice in your hand, as in Fantasy Grounds:** right-click a die and pick how
  many. The dice follow the pointer. Click the table to throw them, the tower
  to roll there, or a quick slot to keep them there. Right-click or Escape
  puts them back. A die dragged from the tray onto a slot works too.
- **Macros:** type `/roll 4d6k3` (or any chat line) and drag the hand beside
  the chat's entry onto a quick slot; the slot runs it again.
- **Number keys** use the quick slots: 1 to 9, then 0 (not while typing).
- **A right-click on a quick slot opens its menu** (use, rename, clear). It
  no longer empties the slot by itself.
- **Modules and Books are two windows, as in Fantasy Grounds:** Modules has
  every module for the game (Activation, Packs); Books has only the active
  books.
- **Fixed:** a window popped out of the main window could end up out of
  sight, leaving its sidebar button lit and doing nothing (Modules after a
  drag to a quick slot). The button now closes it, a window of its own always
  opens on a screen, and Modules and Books remember their places apart.

## 0.1.0-alpha.74: Every book a Kraken pack

- **Kraken's own books ship as Kraken packs** (`.kpack`), the same files as
  your own: the app holds no book in any other form. Descending Darkness's
  and Apeira Astra's six books load from them like any pack you copy in.
- **A clean computer needs only the packs.** Install Kraken, copy `.kpack`
  files into `Documents\Kraken VTT\Packs` (on Linux,
  `~/Documents/Kraken VTT/Packs`), and the books are there: no Fantasy
  Grounds, nothing else. Packs copied in while Kraken is open show up without
  a restart.
- The format is written up in [docs/kraken-pack-format.md](docs/kraken-pack-format.md).

## 0.1.0-alpha.73: Kraken's own games illustrated

- **Descending Darkness and Apeira Astra's books have pictures throughout:**
  every creature and threat in the Bestiary and the Dossier has its picture on
  its page; every kin, class, origin and path has its portrait; each Player's
  and Crew Handbook opens on its cover; and thirteen new paintings illustrate
  the rules chapters (light and dread, resting, fighting, dying, spells and
  backgrounds; salvage, vacuum, the ship, ship combat, the crew and combat).
- Books' pages can carry a picture above their text (a game's book source
  says `blocks: pictured(text, picture, caption)`).

## 0.1.0-alpha.72: The Library, homebrew adventures, your decals

- **The Library** (the sidebar's Adventures) has each kind in its own tab:
  **Maps**, Encounters, NPCs, Parcels, Tables. The Maps tab shows each map as
  a picture; click one to see it large (for your eyes only), then **Put on the
  table** (that map alone, with its walls, doors, lights and pins) or **Show
  the players the picture**. **All maps to the table** is still there.
- **All** in the Library's module list: every active adventure's maps,
  encounters, NPCs, parcels and tables together, under each adventure's name.
- **Homebrew adventures:** a module with story entries is an adventure,
  whatever it is called, so its story shows in Story (a GM's own module, named
  without "adventure" or "module", showed its pictures but not its story).
- **Your decals:** your own Fantasy Grounds background decals (the Kraken
  emblems for AD&D 2E, D&D 3.5e, D&D and Castles & Crusades) copied into
  Kraken's assets, and a game's own decals kept in a folder named for it
  (assets/decals/D&D 3.5e/) show under that game's filter.
- Fixed: a map put on the table from a book read from a pack or a renamed
  module was named by its file on disk (shown in the map's window, and a map
  pin then opened an empty book).

## 0.1.0-alpha.71: Your FG character wizards, every ruleset played end to end

Every ruleset's character wizard is now the one built and tested in Fantasy
Grounds, page for page, art and words included; and every one of Kraken's
eight rulesets passes an end-to-end run of a whole game, from the GM's app and
a player in Chrome to experience and treasure after a fight.

### Character wizards

- **Traveller:** the GM's KrakenCharWizardMGT2 itself (its term engine and
  career tables) runs inside Kraken: characteristics rolled and swapped,
  species, background skills, careers a term at a time (qualification,
  survival, events, mishaps, commissions, promotions, ageing), mustering out
  with cash and benefit rolls, benefit items chosen, medical bills,
  Connections and skill packages, then a shop with the cash left. Every roll is
  the table's, in chat. Kraken reads the extension from FG's extensions folder
  and keeps a copy beside the packs, so it works on a computer without FG; the
  extension is never shipped with Kraken. Only the GM may re-roll the
  characteristics, as in FG. The invented career tables of alpha.69 are gone.
- **D&D 5E and Descending Darkness:** FG 5E's wizard, tab by tab (Species,
  Class, Abilities, Background, Equipment, Commit), each tab marked until its
  choices are made. Abilities by standard array, point buy or 4d6 drop the
  lowest (the host's dice); background +2/+1 or three +1s; Ability Score
  Improvements or feats; class and background kits A/B/C with their coin, or a
  Legacy class's rolled wealth. Descending Darkness's classes and backgrounds
  have kits in gold crowns; a kin limits the classes.
- **D&D 3.5E:** the GM's KrakenCharWizard35E, eleven pages (Abilities, Race,
  Class, Languages, Alignment, Skills, Feats, Gear, Spells, Details, Commit):
  the GM's ability methods and roll lock, the low-score reroll house rule,
  multiclass plans, skill points and rank caps, feats with their
  prerequisites and targets, starting gold spent in the class's storefront,
  spells known, a cleric's deity and domains, a wizard's school and familiar.
- **AD&D 2E:** the GM's KrakenCharWizard2E: Abilities by the PHB's Methods I to
  VI with 18/xx Strength, Race, Class (level limits, multi- and dual-class,
  specialist wizards), Kit, Alignment, Equipment (starting wealth by class
  group, a shop of what the class may use), weapon and nonweapon
  proficiencies, Spells, Commit. The GM's options are in Settings.
- **Their art and words:** each page shows its picture faint behind it, as
  in FG. The 2E wizard's Race and Class pages show the chosen race's and
  class's portrait and the extension's own narration, and Alignment its
  descriptions, read from the extension at run time. Traveller's pages have
  their art and an Instructions panel from the extension's own text.
- **Apeira Astra:** a shop in the crew wizard (the Crew Handbook's gear at its
  price in credits, paid from the Path's credits), and "Roll 2d6 each" on the
  host's dice in chat.

### At the table

- **Share with players** on the map window (FG's Share): the map opens on
  every player's screen, even where a player closed it.
- **New** on the GM's NPCs, Items and other lists (FG's +): a new record,
  opened to fill in. A Traveller NPC opens on its own sheet: the six
  characteristics, skills, armour, weapons from Kraken's list and notes; its
  hits and attacks are worked out as the tracker uses them.
- A parcel's coins are the ruleset's money: MCr and Cr for Traveller (a
  megacredit lands as a million credits), Cr for Apeira Astra, gold crowns for
  Descending Darkness.
- **Add an item** on the sheet's Inventory tab (FG's +), for games with no
  wizard of their own.
- **A natural 20** on the 3D dice plays a bugle's "Charge!" as it flares gold,
  and **a natural 1** a sad trombone (wah wah wah-waaah) as it flares red, for
  everyone who sees the dice land. Made on the spot, no sound files; they
  follow your dice sound and volume, and the flare's switch in Dice.

### Books, as Fantasy Grounds reads them

- A page's link to a record the book holds opens it in a window: creatures,
  spells, items, classes, races, feats, skills, tables, encounters (the
  campaign's own copy when the book is active). Links inside a record's text
  work too.
- FG's tables show as tables (their roll and columns), and equipment lists
  (a 5E Armor Table, Weapons Table) as their sections.
- Records kept inside a book's lists are found (a 5E book's races, classes,
  backgrounds, monsters): the legacy SRD books' dead links all work now.
- The 3.5E Monster Manual's creature pages (645 of them, kept in a category)
  open; a 3.5E rulebook's tables are read.
- Web links open in your browser; superscripts and line breaks typed into a
  book's text read as such.
- Older maps (FG modules that mark a map by its grid size alone) open on the
  table: The Secrets of Skyhorn Lighthouse's four maps.
- Kraken packs are made in a new format; an older pack gives way to its FG
  module until it is made again (Books, Packs).

### Fixed

- The Traveller wizard's Careers page crashed in current Chrome.
- From a review of the new code: a player could send the Traveller wizard
  steps its pages never offer (free items, extra Connections, skipping
  medical bills); benefit items could change if a book was activated
  mid-wizard; a wizard could wait forever for a roll the host never answered;
  New on C&C's Classes and Races made a broken record; a malformed price let a
  purchase through; 2E prices of more than one coin ("2 gp 5 sp") read wrong;
  Library maps of a book named by its title failed; the Apeira Astra wizard's
  skills were squeezed out of sight by a long shop, and its Finish button out
  of reach.
- The installer now carries the Lua engine the Traveller wizard and the
  extensions' words need.

## 0.1.0-alpha.70: Ships on the map, and their deck plans

- Ship tokens: each of Kraken's six designs has its own top-down picture, and
  a new ship takes its design's. **On the map** (the ship's sheet) puts its
  token on the open map, 1 to 3 squares by its tonnage.
- Range from the map: with both ships' tokens on the map, a shot's range band
  is read from the squares between them (alongside, then 1, 3, 8, 20, 50,
  beyond); the GM can still pick a band.
- Deck plans: **Deck plans** (the ship's sheet) draws the ship's decks as maps
  and opens them: the bridge forward, staterooms for the crew (and a trader's
  passengers), the galley, a medbay, turrets for its guns, armoury and cells
  on warships, an airlock with an outer door, holds, small craft and vehicle
  bays, sealed fuel tanks, engineering aft, and a lift on the same square of
  every deck; with their walls and doors, 1.5 m squares. The same ship gets
  the same plans every time, so tokens placed on them stay.

## 0.1.0-alpha.69: Traveller's lifepath

- The Traveller wizard is now the game's own character creation, term by
  term, every roll the table's dice: six characteristics rolled on 2D and
  arranged; background skills (3 + EDU DM); a university or a military academy
  (or neither); then careers: qualification (or the draft, or the Drifters),
  basic training, a skill roll each term on the table you choose (Personal
  Development, Service Skills, your assignment's Specialist table, Advanced
  Education, Officer), survival or a mishap, an event, a commission or
  advancement (with the rank's skill and another roll), aging from the fourth
  term, prison when a roll says so; and when a career ends, its benefit rolls
  (cash or benefits). The log keeps the whole life; the Traveller is built
  from it, with the weapons and armour its benefits gave.
- Thirteen careers with three assignments each: Agent, Army, Citizen, Drifter,
  Entertainer, Marine, Merchant, Navy, Noble, Rogue, Scholar, Scout, and
  Prisoner. Their tables (skills, ranks, events, mishaps, benefits) are
  Kraken's own, in the game's shape; your Traveller books are the game's.

## 0.1.0-alpha.68: Starships

- Starships for Traveller and Apeira Astra: **Starships** in the sidebar. The
  GM makes a ship from one of Kraken's six designs (Courier, Free Trader,
  Salvage Tug, Patrol Cutter, Fighter, Corsair) and can change anything: hull,
  armour, Thrust, Jump, sensors, computer, weapons (pulse and beam lasers,
  particle beams, missile racks, railguns, mass drivers), critical hits.
- The crew take stations with their own characters: the helm, each gun,
  sensors, engineering, the captain's chair.
- Ship combat on the tracker: a ship's initiative is 2d6 + its pilot's Pilot +
  Thrust; a gunner fires at a ship at a range band (2d6 + Gunner (Turret) and
  DEX in Traveller, Gunnery and Intellect in Apeira Astra, + the weapon's DM +
  fire control + the range, against 8); the damage + the Effect, less armour
  and AP, comes off the hull; an Effect of 6 or more that does damage is a
  critical hit on a system (sensors, power, a weapon, armour, the hull, the
  drives, the crew, the computer), each one worse; a ship is destroyed at 0.
- The Apeira Astra Crew Handbook has a Ships chapter: your ship and ship
  combat.

## 0.1.0-alpha.67: Traveller

- A new ruleset: **Traveller** (Mongoose Traveller 2nd Edition, as FG's MGT2
  ruleset plays it). Kraken's own code for its mechanics; your Traveller books
  (FG MGT2 modules or packs) add their content.
- The Traveller wizard: name, species, homeworld, the six characteristics (2d6
  each, rolled or typed), a career and its terms (age 18 + 4 a term) and rank,
  skills and specialities with their levels, a kit from Kraken's weapon and
  armour list, credits. A human Traveller gets one of Kraken's science fiction
  portraits by career.
- The Traveller sheet: the UPP, characteristics and DMs (a wounded one's
  current value), skills and specialities, tasks from any number (2d6 + DM +
  skill against Simple 2 ... Formidable 14, a DM, a Boon or a Bane; the
  Effect said), untrained -3 less Jack-of-all-Trades, weapons with their
  traits and AP, armour.
- The tracker plays Traveller: initiative 2d6 + the better of DEX and INT DM;
  attacks 2d6 + skill + DM against 8, the Effect added to the damage, armour
  taken off less the weapon's AP; damage off Endurance, then Strength, then
  Dexterity (Endurance and one more at 0 unconscious, all three dead); an
  animal's Hits; characteristic checks by a creature's current values.
- Apeira Astra: a sheet's Boon or Bane now reaches the dice (it was dropped on
  the way to the host), and the tracker's checks offer its own six
  characteristics.

## 0.1.0-alpha.66: dice that stay as long as you say, and knock each other

- Settings (the GM's): **Dice stay on the table for** a number of seconds
  before they fade, from half a second to a minute (a slider up to 15, or type
  it). Every seat's dice follow it. It was fixed at 2.6 seconds.
- Dice from different rolls no longer pass through each other or settle
  inside or on top of each other: a new throw knocks against the dice already
  on the table, rolling or at rest, and comes to rest beside them.

## 0.1.0-alpha.65: 2E turning undead and Krits & Fumbles

- Turning undead in AD&D 2E: a cleric (or a paladin from 3rd level, as a
  cleric two levels lower) has a **Turn undead** button on its turn. One d20
  against the turning table for each undead's type (by its name, else its hit
  dice), 2d6 undead affected, the weakest first; turned undead flee for 3d4
  rounds, destroyed ones die.
- Your Krits & Fumbles 2E book in the tracker: make it active and a natural
  20 that hits rolls its Critical Hit table, a natural 1 its Fumble table; a
  complication rolls the table for the attack's kind (slashing, piercing,
  bludgeoning, missile, natural). What the row says is put on the tracker:
  extra damage, maximum damage or an extra die on the next damage roll, AC and
  to-hit penalties, an opening that gives the next attacker +2, prone, a save
  or fall prone, a lost attack. The rest is left to you, with the row's text
  in chat. The Krits & Fumbles settings (how often, apply or chat only, PCs
  and NPCs, who sees) work for 2E too.

## 0.1.0-alpha.64: AD&D 2E

- A new ruleset for your AD&D 2E books. Pick **AD&D 2E** for a campaign and
  its shelf holds your 2E adventures and references (B1, B2, B6, Greyhawk,
  the pregens...), from Fantasy Grounds modules or Kraken packs.
- The 2E character wizard: race (human, dwarf, elf, gnome, half-elf,
  halfling), class (fighter, paladin, ranger, cleric, druid, thief, bard,
  mage) or a multi-class (fighter/thief, fighter/mage/thief...), level and
  scores, a warrior's exceptional Strength (18/76). Or take one of your
  books' pregenerated characters as it is.
- The 2E sheet: each ability's table (hit and damage, reaction and defense,
  system shock, bonus spells...), THAC0, descending Armor Class (rear, no
  shield), the five saving throws, weapons' damage against Small/Medium and
  Large with speed factors, weapon and nonweapon proficiencies, thief and bard
  skills by points, priest and wizard spells a day. Click to roll a save, an
  ability check (d20 under the score) or a thief skill (d100).
- The combat tracker plays 2E: d10 initiative, the lowest first; attacks
  against THAC0 - AC (a natural 20 hits, a 1 misses); damage by the
  target's size; a creature's whole round (claw, claw, bite) in one click; a
  warrior's 3/2 and 2/1 attacks; saves against the five numbers; a creature
  dies at 0, a character is dying from 0 (a hit point a round) until someone
  binds the wounds, and dead at -10.

## 0.1.0-alpha.63: every book as a pack

- The rest of the GM's own conversions and the free SRD rules can be packs
  too: the SRD 5.2.1 and the 2024 free rules, the AD&D 2E B-series and
  Greyhawk, Mystara, Kraken's own 5E books.
- A Worldbuilding campaign reads the books of games Kraken has no rules for
  yet (Pathfinder, Savage Worlds...): their pages, story and maps with walls.

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
