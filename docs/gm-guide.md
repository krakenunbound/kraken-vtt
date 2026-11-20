# The GM's guide

Kraken runs on the GM's Windows or Linux PC. The GM's copy is the table: it keeps the
campaign, decides what each player may see, and serves the players' browsers.

## Updates

When Kraken starts, it looks once for a newer release. If there is one, the
start screen says so (only the start screen, before you open a campaign):
**Download**, then **Restart and install** (Windows asks to allow the
installer). Nothing about updates appears during a game, and Kraken never
downloads or installs while a campaign is hosted.

## Campaigns

On the start screen choose **My Campaigns**.

- **New campaign:** give it a name and choose its game (ruleset). The game
  decides the character sheets, the rules the combat tracker uses, and which
  books fit the campaign. The rulesets fill as many columns as the window
  holds; the chosen one's full description is below them.
  - **Your own ruleset pictures:** each ruleset shows Kraken's own emblem.
    To show a picture of your own instead (a logo from your books, say), put
    it in `%APPDATA%\kraken-vtt\assets\rulesets` (on Linux,
    `~/.config/kraken-vtt/assets/rulesets`), named as the ruleset:
    `D&D 3.5E.png`, `Castles & Crusades.webp`. It shows on your computer
    only; Kraken never ships a game's official logo.
  - *Descending Darkness* and *Apeira Astra* come with Kraken, with their books
    and a first adventure ([included-games.md](included-games.md)).
- **A campaign's menu:** the **⋯** on its card (or a right-click on it):
  **Rename**, **Duplicate** (a copy with its records, adventure and Map Studio
  pictures), **Export .zip** (one file of the whole campaign, to keep or move),
  **Backups and restore**, **Open folder**, and **Delete** (after you confirm,
  to the recycle bin, where you can get it back). Not the campaign you are
  playing: leave the table first.
- **Backups:** Kraken keeps a copy of a campaign each time you press Play and
  every hour while you host; the newest ten stay. **Backups and restore**
  lists them by date; **Restore** puts one back (what was there is kept as a
  backup too, so a restore can be undone). **Back up now** makes one.
- **Logs:** when something goes wrong, Settings > **Open logs** opens the
  folder of Kraken's logs (the table server's and the window's), for a bug
  report.
  - *D&D 5E* comes with the SRD 5.2.1 as three books (*SRD 5.2.1 Player's
    Rules*, *Creatures*, *Magic Items*): classes and subclasses, species,
    backgrounds, feats, gear, spells, every monster and magic item, ready to
    play with nothing else installed ([included-games.md](included-games.md)).
    Your own 5E modules or packs sit beside them.
  - *Descending Darkness*, *Apeira Astra* and *Cairn* (Second Edition, CC BY-SA
    4.0) come with Kraken, with their books and a first adventure
    ([included-games.md](included-games.md)). In *Cairn* the tracker's
    **Sides (DEX saves)** starts a fight, attacks always hit, **Morale** asks
    the foes' WIL saves, and the party sheet's **Growth** tab takes the place of
    experience.
  - *Ironsworn* (with *Delve*) and *Starforged* (Shawn Tomkin's CC BY 4.0
    moves, assets and oracles; an unofficial adaptation) come with Kraken,
    each with a Reference, a book of foes and a starter scenario
    ([included-games.md](included-games.md)). Players make every move from
    the sheet's **Moves** tab; anyone opens **Oracles**; the GM's **Delve
    Sites** builds a site from a theme and a domain. On the tracker a foe is
    its rank and progress track: mark it (+), set its rank, or pick a
    character under **Harm…** to inflict its harm. The host can play a
    character too (GM-less play).
  - *Forged in the Dark* (based on Blades in the Dark, through its SRD, CC BY
    3.0) comes with Kraken: the *Scoundrel's Handbook*, the *Game Master's
    Guide* and *The Brine Street Job*. There is no initiative: the **Score**
    button opens the Score panel (phase, position and effect for every action
    roll, the plan and the engagement roll, payoff, heat, entanglements,
    downtime), the **Clocks** window puts progress clocks in the top bar for
    every seat, and the party sheet's **Crew** tab is the crew sheet
    ([included-games.md](included-games.md)).
  - *Basic Fantasy* (the Basic Fantasy RPG 4th Edition, CC BY-SA 4.0) comes
    with Kraken too: its Player's Handbook, Game Master's Guide and *The Mill
    at Hob's Ford*. Its character wizard follows the book (3d6 in order, race
    and class limits, the hit die, 3d6 x 10 gp and the shop); the tracker
    plays d6 initiative, attacks against ascending AC, the five saves, death at
    0, Turn undead for clerics and a **Morale** button for monsters.
  - *Fate Core* and *Fate Accelerated* (Evil Hat, CC BY 3.0) come with Kraken:
    each its own book, the Toolkit and Adversaries, and the starter scenario
    *The Lighthouse at Gull's End* ([included-games.md](included-games.md)).
    Rolls are four Fate dice on the ladder; the **Scene Aspects** strip over
    the table keeps the scene's aspects and free invokes and your pool of
    fate points (⚙ for your tools: add an aspect, **New scene**, **Refresh
    all**); on the tracker choose a physical or mental conflict, **Turn
    order** sets it without dice, attacks roll against defences in shifts, and
    a hit on a player's character waits for them to take it (stress,
    consequences) or **Concede**. The party sheet's **Milestones** tab takes
    the place of experience, and parcels carry things, not coin.
  - *Castles & Crusades*, *D&D 5E*, *D&D 3.5E* and *AD&D 2E* use your own
    books (Fantasy Grounds modules, or Kraken packs made from them) for their
    content: a 3.5E campaign takes your 3.5E Player's Handbook's classes,
    races, feats, spells and gear, and your Monster Manual's creatures.
  - *AD&D 2E* builds characters by its own rules (race, class or
    multi-class, THAC0, the five saves, thief skills) and takes your books'
    pregenerated characters as they are; its tracker runs initiative lowest
    first, attacks against THAC0 - AC, damage by the target's size, and
    Death's Door (dying from 0 until the wounds are bound, dead at -10). A
    cleric (or a paladin from 3rd level) has a Turn undead button on its
    turn. Make your Krits & Fumbles 2E book active and natural 20s and 1s
    roll its tables, by the attack's kind, and apply what they can.
  - *Traveller* is Mongoose Traveller 2E: its wizard is the lifepath, term
    by term with the table's dice (characteristics, background skills,
    education, careers, events, mishaps, promotions, aging, benefits);
    the sheet rolls tasks against a difficulty with Effect, Boon and Bane;
    the tracker runs 2d6 initiative, attacks against 8 with the Effect on the
    damage, armour less AP, and damage off Endurance, then Strength, then
    Dexterity. Your Traveller books add their content.
  - In *Apeira Astra*, the GM awards **Marks** from a crew member's sheet
    (Main page, **Award a Mark**, at most six); the player then learns a
    trick from their major or minor Path with it (the sheet offers the ones
    not taken, with their text). A trick shows beside the skill it names; the
    player sets its Boon on the strip when it applies. The GM can take a trick
    or an unspent Mark back (a correction). Experience still buys skills (to 4)
    and characteristics (to 15) with **Improve**.
  - In *Traveller* and *Apeira Astra*, **Starships** (sidebar) holds the
    campaign's ships: make one from a design, let the crew take stations with
    their characters, put the ships on the tracker, and the gunners fire from
    the ship's sheet (target, range, Fire). **On the map** puts a ship's
    token on the open map (the range is then read from the map), and
    **Deck plans** opens its decks as maps with walls and doors.
  - *Worldbuilding* has no rules: maps, tokens, chat and dice for any game.
    It reads the books of games Kraken has no rules for yet (Pathfinder,
    say): their pages, story and maps with walls.
- Campaigns are saved as you play, in Kraken's data folder
  (`%APPDATA%\kraken-vtt`).

## Hosting

Select a campaign, then:

- **Your name**: what players see you called.
- **Port**: 47300 unless you change it.
- **Password**: leave it blank for an open table.
- **Players connect over**: **LAN** for players on your home network,
  **Internet** for players on the internet.
- Press **Play**. *Addresses to give your players* lists the addresses to
  share, written as `http://address:port`.

**Players on the internet:** with **Internet** on, leave *Open the port on my
router by itself (UPnP)* ticked and Kraken asks your router to open the port
while you host (UPnP, or NAT-PMP), and closes it again when you stop. The
Players window says whether it worked. If your router has UPnP turned off,
forward the port (47300 by default, TCP) to this PC in its settings instead.

**Inviting players:** the Players window's **Invite** is a link with the
table password already in it (after the `#`, the part of a link a browser
never sends to a server). Press **Copy** and paste it in your group's chat,
or let a player at the table scan the QR code with a phone. They open it,
type their name and their own password, and sit down. Choose the internet
link or your network's when you have both.

**The firewall:** the Windows installer adds the firewall rule for
you; running from source, Windows asks once, the first time you host. On
Linux, if a firewall is on (such as `ufw`), allow the port yourself:
`sudo ufw allow 47300/tcp`.

## The table

The **sidebar** on the right holds everything, as Fantasy Grounds' does:

- **Tools along the top:** the combat tracker, Effects, the assistant (the AI
  agent), Map Studio, the players, the Session Log, MotD (the Message of the
  Day), Folders (add books, sounds and art while the table runs), settings.
- **Library:** Modules (every module and pack for the campaign's game, filed
  by kind and series: make them active, make packs), Books (only the active
  books, to read; a player sees only the ones you open to them), Assets (what
  each active book supplies, by kind), Sound Sets.
- **Player:** Characters, Party (the party sheet), Notes.
- **Campaign:** Encounters, Images (maps and handouts), Items, NPCs, Parcels,
  Tables.
- **World:** Story (each active adventure's story entries).
- **Character:** the game's own lists (classes and races, or Paths and Origins)
  to drag onto a character.

Every window can be moved, resized and **popped out** to its own window on
another monitor. Its sidebar button closes it wherever it is, and a window
of its own always opens on a screen you can see. Anything that looks like a
link can be dragged: onto a sheet, into chat, into a story entry, onto the
quick slots.

The **quick slots** along the bottom keep ten things at hand: a book or a
page, a map, a character, a sound, a note, dice, or a chat line. Click a slot,
or press its number key (1 to 9, then 0), to use it. Right-click a slot for
its menu: use it, rename it, or **Clear this slot** (a slot is never emptied
any other way).

## Books and modules

- **Kraken's own games' books** are always on the shelf for their campaigns,
  and the SRD 5.2.1 books for a D&D 5E campaign.
- **Your Fantasy Grounds modules:** Kraken reads them in place from your
  Fantasy Grounds data folder's `modules` folder (set `KRAKEN_BOOKS` to read
  another folder). Nothing is copied. A campaign's game decides which modules
  fit it.
- **Kraken packs:** in **Modules**, the **Packs** tab makes each of your
  Fantasy Grounds books into Kraken's own file (`.kpack`: its pages, records,
  maps with walls and doors, pictures), kept in `Documents/Kraken VTT/Packs`
  (set `KRAKEN_PACKS` for another folder). Copy that folder to another
  computer and the books open there with no Fantasy Grounds at all. Kraken
  reads the pack in place of the module unless the module is newer; *Make
  again* after you change a module. Packs are your own books: keep them to
  yourself. On a new computer, install Kraken, create that folder, and copy
  the `.kpack` files into it (on Linux, `~/Documents/Kraken VTT/Packs`).
  Kraken's own games' books are packs too. They come with Kraken. The format
  is in [kpack-format.md](kpack-format.md).
- In **Modules**, make a book active to bring its records (NPCs, items,
  encounters, maps, story) into the campaign. A book that is not active is
  off limits: its pages, pictures, maps and records open only once it is. A players' book can be shared
  with the players.
- **Share** a record with the players from its window or its list row: the
  eye opens a menu of *Everyone*, each player, and *GM only*. Drag a record,
  note, story or picture onto a player's portrait along the top to share it
  with that player alone; a picture's right-click menu has *Show to* each
  player. Players never see what you have not shared.
- **Edit a record** with the pencil in its window (Fantasy Grounds' lock):
  its fields (the game's own list, else the fields that kind of record
  carries; *+ Field* adds one of your own) and its description in the text
  editor. Click the lock to read it again. Right-click a row for
  *Duplicate* (a copy named "(copy)") and *Delete* (*Undo* shows for a few
  seconds). A book's record has *Copy to campaign*, to change it without
  touching the book.
- **The text editor** (notes, story pages, quests, descriptions): the bar
  gives bold, italic, underline, a heading, a list, boxed read-aloud text,
  a table and plain text. Drag anything into it (a page, a picture, a
  character, a sound, a note, a record) and it becomes a chip in the words.
- **Story** (World > Story): *New* makes one of the campaign's own, above the
  adventures' entries; it has a chapter, an order, and pages: text, a picture
  or a book page (drag one onto it). An adventure's entry has *Copy to
  campaign*. Share it and the players find it under Story.
- **Tables** (Campaign > Tables): *New*, or *Import a table* (paste the rows,
  "1-3  words", or comma/pipe/colon/semicolon separated). Every table's window
  has *Roll* (a column, *GM only*); unlocked, it edits the die, the columns
  and every row. In a result, `[2d6]` is rolled, `[3x]` rolls the tables it
  links three times and `[Other Table]` rolls that table. In chat:
  `/rollon Rumours -c Column -d 2d6 -hide`.
- **Identify items:** an item's window has *Identified* and the name and notes
  the players see until it is ticked again. The real item never reaches them,
  on a sheet, the party sheet or in chat.
- **Encounters** (Campaign > Encounters): *New*, drop NPCs in (a count can be
  dice, rolled when they go on), *Add to tracker*, *Place on this map* (put
  the tokens where they go first; it keeps where they stand), *End encounter*
  (its XP to the party sheet). **Parcels**: drop items in, add coins, then *To
  the party sheet* or *Give* to a character. **Quests** (Campaign > Quests):
  XP, text and status; drop one on the party sheet's XP tab.
- **Links in a book** work as in Fantasy Grounds: a page, a picture, or a
  record the book holds (a creature, spell, item, class, race, feat, table,
  encounter) opens in its own window. A table shows as a table, an
  equipment list as its sections, and a web link opens in your browser.
- Your own background decals go in `Documents/Kraken VTT/Background Decals`;
  in a folder named for a game (`D&D 3.5e`), they show under its filter.
- **New** (on the NPCs, Items and other lists, as Fantasy Grounds' +) makes
  a record and opens it. A Traveller NPC opens on its own sheet: its six
  characteristics, skills, armour and weapons, which the tracker fights with.

## Maps

**Images, as in Fantasy Grounds.** Every picture you see opens in the image
window when you click it: on a book's page, in its Images & Maps tab, in
Campaign > **Images** (every picture of every active book), the Library, a
quick slot. Nothing shown is a dead end. Each picture has one master: its walls, doors,
lights, paint, effects and tokens are kept in the campaign, and every place
that opens it (Images, the book's pictures, the Library, the table) opens the
same one.

- An image you open is **yours alone** (**Not shared**) until you choose
  **Share**: then it is the players' map. The table's map has **Shared** too:
  click it to stop sharing (the players see no map) and again to share.
- **The image window's corner:** **Locked / Unlocked** (unlocked: the editor
  at the side), the **eye** (player vision preview: what your players see,
  their tokens' sight, the light and the dark) and the **tools** button,
  which shows or hides the tool strip. Locked with the tools hidden, the
  picture alone.
- **The tool strip:** zoom, fit, the **navigation pad** (buttons to pan and
  zoom), find a token, pan, ping, draw, erase, area target, and for you
  share, pins (the map's shortcuts shown or hidden), scene settings, a light,
  line of sight and token movement lock.
- **Assets** (Library > Assets): every picture of your active books and art
  packs, by folder. A picture's preview: **Make it a map** (it joins
  Campaign > Images under *This campaign* and opens to edit), **Share** (the
  players see the picture) or **Set as background**.
- **Play test:** puts a test token on the image and shows it as a player
  sees it (walls, doors, light, darkness). Drag the token to look for gaps,
  then **End play test** (the token goes). The table's map has Play test too.
- **Close** goes back to the table's map.

**Map Studio** (the pen along the top of the sidebar) is Kraken's map maker:
paint art from your packs (Kraken's own, Battle Map Forge's, and your Fantasy
Grounds art packs and Dungeondraft packs, read where they are), draw walls,
doors and windows with art along them, place lights and time of day, paint
weather with masks, mark traps and regions, generate a dungeon, and play test.

- On an image, **Open in Map Studio** (its image window's bar) opens that
  image with its walls, doors, lights and weather. **Save to Kraken** writes
  them back into the image, and what you painted becomes the image's picture,
  wherever it is opened. The next time, Map Studio opens it as you left it.
- **Settings > Map Studio art** (the GM's): add the folders that hold your
  Dungeondraft packs and your art packs (`.mod`). Nothing is assumed; your
  Fantasy Grounds modules folder is read anyway. Kraken's own art and Battle
  Map Forge's come with it.
- Map Studio inside Kraken makes maps for Kraken; exporting to Fantasy
  Grounds or Foundry is the stand-alone Map Studio's job.
- An AI agent (Claude Code, or any agent on Kraken's MCP server) can make maps
  in Map Studio for you with its `kraken_map_studio` tool: ask it for a map of
  a place, and it opens Map Studio and builds it in a tab of its own while you
  watch, from the same art and tools, then saves it into your campaign. Its
  guide is `skills/kraken-map-studio`. You can take over with the mouse at any
  point.

- Open a map from the **Library** (the sidebar's Adventures: its Maps tab
  shows each map, and a click lets you see it before it goes to the table or
  the players), from a story entry, or by dropping a picture on the table. The map opens in its own window, which can pop out.
- **Tokens:** drag a character or NPC onto the map. A token's right-click menu
  holds its options; a hidden token never reaches the players.
- **Walls, doors and lights:** maps from your modules and Kraken's own
  adventures bring their walls and doors. Players see only what their tokens
  can see, with light and darkness as the scene sets them.
- The **map editor** (the map window's tools) draws walls, doors and windows,
  sets the grid, places lights, paints, adds text and image layers, and masks
  what players see.
- **Share with players** (the map window's share button, as Fantasy Grounds'
  Share) opens the map on every player's screen, even where a player closed
  it.

**At play on the map.**

- **Measuring:** right-drag. While it is held, a left click (or Space) drops a
  waypoint and Backspace takes the last one back; each leg's length shows at
  its end and the whole by the pointer. Everyone on the map sees your ruler as
  you draw it, in your colour. How a diagonal counts is **Settings > Tokens and
  measuring > Diagonals** (every square one, 5-10-5, or a straight line); a
  scene may set its own in its **Scene** settings (Grid). From one token to
  another the ruler counts their difference in height too.
- **What players see on tokens** (Settings > Tokens and measuring, as FG's
  options): the health of your creatures and of the characters as a bar, a
  bar on hover, a dot, a dot on hover, or off; names on hover, always, or off.
  What is off is never sent to a player's browser. A token's right-click menu
  has **Players call it**: the name players see until they know better ("a
  hooded figure").
- **Fog of war:** what each player has seen of a map stays dimly shown after
  their tokens move on. Kraken keeps it, per player and map, saved with the
  campaign, on any browser they join from. **Scene > Reset explored** forgets
  it for one player or everyone; the eye (player vision preview) shows it.
- **Senses:** a token's menu shows its senses (from its character's senses
  line, or its own **Senses** line you type: "Darkvision 60 ft, Blindsight 10
  ft"). Blindsight perceives what is near even in the dark; tremorsense feels
  creatures on the ground, through walls; truesight and Devil's Sight see in
  magical darkness. A light's right-click menu (map editor, Lights) turns it
  into **magical darkness**: black for players, whatever else lights it.
- **Undo a move:** Ctrl+Z (or the token menu's Undo move) takes a token's last
  move back: a player their own, you any. On the combat tracker a token's moves
  this turn are drawn faintly with how far that was; the path starts again
  when its turn begins.
- **Locked movement:** with movement locked, a player can still drag their
  token: the move waits on your screen (a dashed line to where they want to
  go) and in the **Moves waiting** strip, with Accept and Cancel for each and
  for all.
- **Dragging a token** shows how far, green within its speed (the sheet's Speed), amber within a dash, red past both. It warns; it never stops the move.
- **Size:** Ctrl+wheel over a token makes it bigger or smaller, about a tenth
  a notch, from a quarter square up to 50 (the party token on a city map, a
  dragon, a pixie).
- **Elevation:** Alt+wheel over a token raises or lowers it a square's
  distance (or the token menu's Elevation); a badge shows its height to everyone.
- **Traps and regions** from Map Studio (and a Foundry bundle's regions) play
  at the table. A trap or pit stops a player's token on its first square and
  holds that token alone (everyone else moves on), and tells you its name and
  note in a line only you see. Its row in **Traps sprung** (along the bottom of
  the map) rolls its save and its damage and **Apply** puts them on (half or
  none on a save, the effect on a failed one, through the tracker, so the game's
  own rules run) and lets the token go; the cross lets it go as it is. A trap
  can roll by itself, or roll and apply by itself: Map Studio's Traps & regions,
  "When it springs". Difficult terrain costs more on the ruler. A teleport sends
  whoever steps in to the region it names. You see them as faint outlines;
  players never get them, until you click a trap's eye: then they see where it
  is (never its note or what it does).
- **Secret doors:** players do not see a secret door. Right-click it when they
  find it: it is a door to them, to open like any other. Right-click again to
  hide it.
- **Animated maps:** a map whose picture is a video (.webm, .mp4, as Foundry's
  animated scenes) plays as the map for everyone.
- **Sounds on a map:** **Scene > Sounds on this map** places a sound from your
  library in the middle of the view. Each player hears it when their tokens are
  near, louder nearer, muffled through walls. You hear what they hear with the
  eye (player vision preview).

## Combat

- Add creatures and characters to the **combat tracker** by dragging them in,
  from an encounter, or from its search box.
- **Roll initiative**, then step through turns with **Next round** and the
  turn controls. Effects tick at each turn. Settings > Combat: initiative by
  kind (one roll for all the goblins), whose turns are skipped, NPC numbering.
- **Delay** on the active row lets a creature wait; **Act now** brings it in
  at once, after the one acting.
- What players see of your creatures' health (Settings > Tokens) counts for
  the tracker too: nothing, the status, a bar, or the numbers.
- **The party sheet's group roll:** pick a check, save or skill and Roll for
  them, or Ask the players: each rolls from a card in chat; you can roll for
  anyone who is away.
- **Attacks and damage** roll from the sheet or the tracker against the
  targeted token and apply to it. Saves, healing and conditions work the same
  way, by each game's rules.
- **After the fight**, the tracker shows **Short rest** and **Long rest** for
  the whole party (the clock moves on), and anyone who shot arrows is offered
  **Recover** on their sheet for what can be picked up (half, in 5E).

## Bookkeeping: arrows, potions, rations, torches, the load

Kraken counts what the characters carry and spend, by each game's rules. Every
part has its own switch in **Settings > Bookkeeping**, so a relaxed table can
hand-wave any of it:

- **Ammunition.** An attack with a bow, crossbow, sling or firearm spends an
  arrow, bolt, bullet or round from the character's stack (a full attack one a
  swing). With none left the attack is refused and chat says why; chat warns
  when a stack runs low. Traveller's guns count their magazine and load a
  spare when it runs dry. NPCs are never counted.
- **Consumables.** Potions, scrolls, a wand's charges and a kit's uses are
  used from the sheet's **Supplies** (on the Inventory tab), or by dragging the
  item onto a creature (a token, a tracker row, a party row): a healing
  potion heals whoever it lands on.
- **Rations and water.** Each day that ends on the calendar, and each long
  rest, every party member eats a ration and drinks a day's water (never twice
  for one day). Going without brings the game's penalty: 5E Exhaustion (from
  the fifth day without food, the first without water), 3.5E a Constitution
  check or nonlethal damage, Basic Fantasy hit points, Cairn Deprived and then
  Fatigue; 2E and C&C leave it to you, and chat says so. **Refill** fills the
  waterskins at a stream.
- **Light.** Lighting a torch (from the Effects window, or **Light a torch** in
  Supplies) takes a torch from the pack; a lantern burns a flask of oil. A
  player with none cannot light it; your own drop lights it anyway, said so in
  chat.
- **Encumbrance and bag space.** Supplies shows the load as a meter (5E
  Strength x 15, the variant encumbrance as a separate switch; 3.5E's light,
  medium and heavy loads; 2E by Strength's weight allowance; Basic Fantasy's
  and C&C's own numbers; Cairn's slots) and each
  container's capacity (a backpack, a bag of holding whose contents weigh
  nothing). Put an item away with **Put away…**. The level's penalty goes on
  the creature as an effect: to-hit and save penalties (2E's -1 to hit, 5E
  Exhaustion) count on the tracker's rolls; speed and check penalties are shown
  on the sheet and the effect for you to apply. Switched off, nothing is
  penalised (C&C keeps SiegeCore's own encumbrance setting).
- **Packs.** An Explorer's Pack (or any pack whose text lists its contents)
  is **Unpacked** into its torches, rations, oil and the rest.
- **Rest.** **Short rest** and **Long rest** on the sheet (5E: choose how many
  Hit Point Dice to spend), the party sheet's **Rest the party** and the
  tracker's rest buttons, by each game's rules: 5E's Hit Point Dice, hit
  points, spell slots, death saves and Exhaustion; natural healing in 3.5E,
  2E, Basic Fantasy and C&C; Cairn's own rest and sleep.

## Characters

- Players make their own in the character **wizard** (or you make one for
  them). Each game has its own sheet.
- The wizards are your own Fantasy Grounds ones, page for page: Traveller's is
  your KrakenCharWizardMGT2 extension itself, run inside Kraken (it needs the
  extension in Fantasy Grounds' extensions folder once; Kraken keeps a copy
  beside the packs), and 2E's, 3.5E's, 5E's and C&C's follow your extensions
  and FG's 5E wizard, art and words included. Only you may re-roll a
  Traveller's characteristics.
- A character's wizard rolls are the host's, in chat for the table. Starting
  gear is bought with the starting money in each wizard's shop (5E takes its
  class and background kits, as Fantasy Grounds does).
- Give items and treasure through the **party sheet** and **parcels**. The
  party sheet also names the party and holds its token (drag it onto a big
  map to mark where the party is) and its stash, which players trade through.
- **Who holds a character:** right-click a character's portrait (or its card)
  to **Give** it to a player at the table (its tokens follow), **Release** it
  (players look it over, then Take it) or **Keep** it as yours. Players take
  only released characters. A character, and a player's settings and layout,
  stay with the player's account.
- Experience and levelling follow the game's rules.

## Sound

The **Sound** window plays one-shots, ambience loops and music in every
player's browser, each player with their own volumes. Chat triggers play sound
effects (a sword's hit, a fireball). Add your own sounds in
`%APPDATA%\kraken-vtt\assets\sounds`, in folders `oneshots`, `sfx`, `ambience`
and `music`.

## Chat and dice

Type in chat to talk; `/` lists the commands (Fantasy Grounds' and Foundry's),
and `/help` shows all of them. `/r 1d20+2` rolls (`/r 1d20 + 2 #Climb` with a
label; Foundry's rr, xo, min, max, cf and ms work too). Click the dice to roll
them; the 3D dice tower is the GM's by default.
**The modifier box** beside the dice holds up to six numbers for your next
roll, each with a label (FG's modifier stack): `/mod 2 Flanking`, or drop a
number, a chat roll or an effect on it; right-click one to take it off. The
chips under the tray are the game's keys: ADV, DIS, +2, -2, and in D&D 5E
cover, superior cover, opportunity, Crit, Max and Half for damage. Whatever you
roll next, from the tray, a sheet or the combat tracker, reads them and lists
them on its card; then they clear. Every player has their own.
**Roll mode** (the list under the chat): public, GM and me, blind or self, for
every roll until you change it.
**Links:** drop a record, a book page or a picture into the chat's entry. The
line carries it; each player opens it only if they may see it. The share
button beside it posts the record's text, as the players know it.
**Inline rolls:** `[[1d20+5 #Attack]]` in chat, and the dice a book, story or
note names, are chips you click to roll.
**Session Log** (sidebar): each sitting's chat, kept with the campaign, with
Export to Markdown or a web page. The chat's corner exports the chat you saw.
**External dice tower** (Settings, the GM's): the tower stands on the table
apart from the chat, for everyone, each placing it where they like (drag it).
It is dark when off; on, or while you hold dice over it, its door glows and
dice tumble inside. Click it to turn it on or off, or drop dice on it.
Right-click it for its menu, beside it: **Lock it where it stands**,
**Fix it at** x,y, turn it on or off, **Change its look…** (for everyone: six
drawn towers, the Kraken Lighthouse, painted towers, or your own picture in
Documents/Kraken VTT/Dice Towers) and **Dock it in the chat**. Unticked, it is
docked in the chat.
**Dice packs:** drop a pack (a folder or .zip with `dice.json`) in
Documents/Kraken VTT/Dice and its sets appear in everyone's Dice window, as a
group of their own. The README in that folder gives the format, with an
example pack to copy.
**Dice in your hand**, as in Fantasy Grounds: right-click a die and pick how
many (3× picks up three). They follow the pointer: click the table to throw
them, the tower to roll them there, or a **quick slot** to keep them there
(that slot then rolls 3d6 with a click or its number key). A right-click or
Escape puts them back. You can also drag a single die straight onto a slot.
**Macros:** type a line in chat, such as `/roll 4d6k3`, and drag the hand
beside the entry onto a quick slot. The slot runs that line again.
Settings (the cog) has **Dice stay on the table for**: how many seconds the
3D dice lie there after they land before they fade, for everyone at the
table. Dice from different rolls knock against each other and come to rest
side by side.
A natural 20 on a d20 flares gold to a bugle's fanfare, a natural 1 red to a
sad trombone, on every screen that sees the dice (with dice sound on; the
flare's switch in **Dice** turns both off).

## The AI assistant

Every GM action is also a tool an AI agent can use, through MCP or the
assistant window. The assistant works with a cloud provider's key, or with a
local model (Ollama, LM Studio) at an address on your computer or network,
with no key. See [AGENT.md](../AGENT.md).

## Your Kraken VTT folder

Everything you add to Kraken lives in `Documents/Kraken VTT` (Settings >
Kraken VTT Folder opens it), one folder for each kind of thing:

| Folder | What goes in it |
|---|---|
| Packs | Your books (`.kpack`) |
| Dice | Dice packs: more dice sets for everyone |
| Dice Towers | Tower pictures (with a `lit` twin if you like) |
| GM Icons | Your picture beside what you say in chat |
| Background Decals | The emblem in the middle of the table |
| Wallpapers | Seamless tiles behind the desktop |

Each folder's README says what goes in it and how to make one. `AGENTS.md`
says the same for an AI agent, so you can ask one to make dice, towers or
wallpapers for you. Pictures you add with Browse… are copied into the right
folder. Back up the whole folder to keep what you made.

## At the table

- **Pause:** the pause button beside *Hosting* (or `/pause`) puts a veil over
  the players' screens: their tokens stay put and their rolls wait until you
  press **Go on**. Chat goes on, and you can do everything as usual.
- **The players:** in the Players window each player's row has a bell (**Ring
  bell**: a chime and a flash on their screen alone) and **⋯**; right-click a
  row, or a character's portrait at the top, for the same menu: **Ring bell**,
  **View as** (your map through that player's eyes), **Mark away**, **Kick**,
  **Ban** (they cannot sit at this table again, by name and from the address
  they came from, until you press **Unban** in the Players window's *Banned*
  list).
- **Away and hands:** a player who types `/afk`, or does nothing for five
  minutes, has their portrait dimmed. A player's hand button (top right)
  raises a hand: you hear a chime and see the hand on their portrait and row.
- **A dropped connection:** a player whose Wi-Fi drops sees *Reconnecting…*
  over the table and sits back down in the same seat by themselves; you see
  them as *reconnecting* meanwhile, and their portrait stays. Your own window
  does the same if its connection drops.
- **Pull players to my view:** the players button in the map's tools glides
  every player's map to what you see now; with the ping tool, Shift+click
  pulls them to that spot as it pings. A player in the middle of a drag is
  asked instead. Sharing a map also shows its name across the players'
  screens for a moment.
- **You at the table** (Settings, every seat): your colour (your tokens' ring,
  your pings and drawings) and, when your turn comes round in combat, a soft chime
  (a console tone in the sci-fi games) and a banner across your screen (each can be turned off).
- **Shapes:** with the pen, choose a free line, a straight line, an arrow, a
  square, a circle (drag from its centre) or a cone (drag from its point). Each
  is measured in feet as you draw it. With the pen out, drag a shape's handles
  to resize it.
- **The tracker's corrections:** **Back** returns to the turn before, **‹ ›**
  beside the round moves it back or on, and clicking a row's arrow space (or
  dragging the arrow there) makes it that creature's turn. **Next turn** and
  **Next round** run the rules (durations, ongoing damage). **Back** and
  **Round back** undo those turn changes: effects that ran out come back and
  ongoing damage is healed, while what happened during the turn stays.
- **Death markers** (Settings > Death Markers): the set each creature type
  leaves where it dies. Right-click a marker to remove it; the map's skull
  button clears them all.
- **The Calendar** (sidebar): your game's calendar. Move the day on, add 8
  hours for a rest, set the time, say the date in chat. Click a day for its
  page: write a note there (players see it, or tick GM only). Players write
  their own, signed in their colour.
- **Message of the Day** (sidebar): what players see as they join. Drag a map,
  an NPC or a page into it to link it.
- **Read aloud:** boxed text in an adventure (FG's frames) has a speech button
  for you. Its words go to chat and appear over everyone's map.
- **Notes from chat:** drag any chat line into a note, or onto Player Notes to
  start one.
