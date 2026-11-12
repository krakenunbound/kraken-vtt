# The GM's guide

Kraken runs on the GM's Windows or Linux PC. The GM's copy is the table: it keeps the
campaign, decides what each player may see, and serves the players' browsers.

## Campaigns

On the start screen choose **My Campaigns**.

- **New campaign:** give it a name and choose its game (ruleset). The game
  decides the character sheets, the rules the combat tracker uses, and which
  books fit the campaign.
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
  **Cloud** for players on the internet.
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
- **Library:** Modules (which books are active in this campaign), Books (read
  them), Sound Sets.
- **Player:** Characters, Party (the party sheet), Notes.
- **Campaign:** Encounters, Images (maps and handouts), Items, NPCs, Parcels,
  Tables.
- **World:** Story (each active adventure's story entries).
- **Character:** the game's own lists (classes and races, or Paths and Origins)
  to drag onto a character.

Every window can be moved, resized and **popped out** to its own window on
another monitor. Anything that looks like a link can be dragged: onto a
sheet, into chat, into a story entry, onto the hotbar.

## Books and modules

- **Kraken's own games' books** are always on the shelf for their campaigns.
- **Your Fantasy Grounds modules:** Kraken reads them in place from your
  Fantasy Grounds data folder's `modules` folder (set `KRAKEN_BOOKS` to read
  another folder). Nothing is copied. A campaign's game decides which modules
  fit it.
- **Kraken packs:** in **Books**, the **Packs** tab makes each of your
  Fantasy Grounds books into Kraken's own file (`.kpack`: its pages, records,
  maps with walls and doors, pictures), kept in `Documents/Kraken VTT/Packs`
  (set `KRAKEN_PACKS` for another folder). Copy that folder to another
  computer and the books open there with no Fantasy Grounds at all. Kraken
  reads the pack in place of the module unless the module is newer; *Make
  again* after you change a module. Packs are your own books: keep them to
  yourself.
- In **Modules**, make a book active to bring its records (NPCs, items,
  encounters, maps, story) into the campaign. A players' book can be shared
  with the players.
- **Share** a record with the players from its window (*Share with the
  players*), or a picture from its menu. Players never see what you have not
  shared.

## Maps

- Open a map from **Images**, from a story entry, or by dropping a picture on
  the table. The map opens in its own window, which can pop out.
- **Tokens:** drag a character or NPC onto the map. A token's right-click menu
  holds its options; a hidden token never reaches the players.
- **Walls, doors and lights:** maps from your modules and Kraken's own
  adventures bring their walls and doors. Players see only what their tokens
  can see, with light and darkness as the scene sets them.
- The **map editor** (the map window's tools) draws walls, doors and windows,
  sets the grid, places lights, paints, adds text and image layers, and masks
  what players see.

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
Settings (the cog) has **Dice stay on the table for**: how many seconds the
3D dice lie there after they land before they fade, for everyone at the
table. Dice from different rolls knock against each other and come to rest
side by side.

## The AI assistant

Every GM action is also a tool an AI agent can use, through MCP or the
assistant window. See [AGENT.md](../AGENT.md).
