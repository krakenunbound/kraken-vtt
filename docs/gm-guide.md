# The GM's guide

Kraken runs on the GM's Windows or Linux PC. The GM's copy is the table: it keeps the
campaign, decides what each player may see, and serves the players' browsers.

## Campaigns

On the start screen choose **My Campaigns**.

- **New campaign:** give it a name and choose its game (ruleset). The game
  decides the character sheets, the rules the combat tracker uses, and which
  books fit the campaign. The rulesets fill as many columns as the window
  holds; the chosen one's full description is below them.
  - **Your own ruleset pictures:** each ruleset shows Kraken's own emblem.
    To show a picture of your own instead (a logo from your books, say), put
    it in `%APPDATA%\kraken-vttssets
ulesets` (on Linux,
    `~/.config/kraken-vtt/assets/rulesets`), named as the ruleset:
    `D&D 3.5E.png`, `Castles & Crusades.webp`. It shows on your computer
    only; Kraken never ships a game's official logo.
  - *Descending Darkness* and *Apeira Astra* come with Kraken, with their books
    and a first adventure ([included-games.md](included-games.md)).
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

**Players on the internet** need your router to forward the port (47300 by
default, TCP) to this PC. The Windows installer adds the firewall rule for
you; running from source, Windows asks once, the first time you host. On
Linux, if a firewall is on (such as `ufw`), allow the port yourself:
`sudo ufw allow 47300/tcp`.

## The table

The **sidebar** on the right holds everything, as Fantasy Grounds' does:

- **Tools along the top:** the combat tracker, the assistant (the AI agent),
  the players, settings.
- **Library:** Modules (every module and pack for the campaign's game: make
  them active, make packs), Books (only the active books, to read; a player
  sees only the ones you open to them), Sound Sets.
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

- **Kraken's own games' books** are always on the shelf for their campaigns.
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
  is in [kraken-pack-format.md](kraken-pack-format.md).
- In **Modules**, make a book active to bring its records (NPCs, items,
  encounters, maps, story) into the campaign. A book that is not active is
  off limits: its pages, pictures, maps and records open only once it is. A players' book can be shared
  with the players.
- **Share** a record with the players from its window (*Share with the
  players*), or a picture from its menu. Players never see what you have not
  shared.
- **Links in a book** work as in Fantasy Grounds: a page, a picture, or a
  record the book holds (a creature, spell, item, class, race, feat, table,
  encounter) opens in its own window. A table shows as a table, an
  equipment list as its sections, and a web link opens in your browser.
- Your own background decals go in `%APPDATA%kraken-vttassetsdecals`;
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

## Combat

- Add creatures and characters to the **combat tracker** by dragging them in,
  from an encounter, or from its search box.
- **Roll initiative**, then step through turns with **Next round** and the
  turn controls. Effects tick at each turn.
- **Attacks and damage** roll from the sheet or the tracker against the
  targeted token and apply to it. Saves, healing and conditions work the same
  way, by each game's rules.

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
- Give items and treasure through the **party sheet** and **parcels**.
- Experience and levelling follow the game's rules.

## Sound

The **Sound** window plays one-shots, ambience loops and music in every
player's browser, each player with their own volumes. Chat triggers play sound
effects (a sword's hit, a fireball). Add your own sounds in
`%APPDATA%\kraken-vtt\assets\sounds`, in folders `oneshots`, `sfx`, `ambience`
and `music`.

## Chat and dice

Type in chat to talk; `/` lists the commands (Fantasy Grounds' and Foundry's),
and `/help` shows all of them. `/r 1d20+2` rolls. The modifier box below the
chat adds to the next roll. Click the dice to roll them; the 3D dice tower is
the GM's by default.
**External dice tower** (Settings, the GM's): the tower stands on the table
apart from the chat, for everyone, each placing it where they like (drag it).
It is dark when off; on, its door glows and dice tumble inside. Click it to
turn it on or off, or drop dice on it. Unticked, it is docked in the chat.
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
assistant window. See [AGENT.md](../AGENT.md).
