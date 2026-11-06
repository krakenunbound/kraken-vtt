# Kraken VTT

A free, open-source (MIT) virtual tabletop. The game master runs Kraken on
their Windows PC and hosts the table; players join from Chrome and install
nothing. It aims for Foundry-level presentation with Fantasy Grounds-level ease
of use, and a built-in AI agent that can do anything the GM can.

> **Alpha test.** Kraken is in alpha (see the version in the app's title bar).
> Expect rough edges, and please report what you find (see
> [Reporting problems](#reporting-problems)).

![The start screen](docs/screenshots/start-keep.jpg)

## Screenshots

| | |
|---|---|
| ![The GM's table: the crypt of The Empty Watchtower in torchlight](docs/screenshots/gm-crypt.jpg) | ![The combat tracker](docs/screenshots/combat.jpg) |
| **The GM's table.** *The Empty Watchtower*'s crypt in torchlight, with the party, the Warden and his Bone Sentinels. | **Combat.** Initiative, Defense and Health, each creature's attacks ready to roll, with the rolls in chat. |
| ![What a player sees](docs/screenshots/player-crypt.jpg) | ![A Descending Darkness character sheet](docs/screenshots/sheet-descending.jpg) |
| **A player's view, in Chrome.** Only what their character can see: walls block sight, and the dark hides what the light does not reach. | **Character sheets.** A Descending Darkness cleric, with Defense, Health and the Dread track. Every new character gets a portrait for its kin and class, or Origin and Path. |
| ![Apeira Astra: the derelict's deck and a threat's record](docs/screenshots/gm-kestrel.jpg) | ![An Apeira Astra crew sheet](docs/screenshots/sheet-astra.jpg) |
| **Apeira Astra.** *Salvage Rights*: boarding the *Kestrel's Due*, with Mags Orrin's record from the Threat Dossier. | **A crew member.** 2d6 tasks with Difficulty and Boon or Bane, Stamina and Armour. |
| ![Books](docs/screenshots/books.jpg) | ![Start screen scenes](docs/screenshots/start-station.jpg) |
| **Books.** The Player's Handbook open on Dread, beside the Warden's record and portrait from the Bestiary. | **Six start screens.** Fantasy, science fiction and horror, one at random each time. |

## What it does

- **Host from your PC, players use a browser.** Create a campaign, press Play,
  and give your players the address, port and password. They see only what you
  let them see: hidden tokens, GM notes and secret doors never reach them.
- **Games you can play today.** Two original games come with Kraken, each with
  its rules, books and a first adventure with maps, art and handouts:
  - **Descending Darkness**: dark fantasy on the d20, with fragile heroes,
    light that runs out and dread that builds. Adventure: *The Empty
    Watchtower*.
  - **Apeira Astra**: science fiction on 2d6 and skills, with crews made in
    minutes and armour that soaks. Adventure: *Salvage Rights*.

  Kraken also plays **Castles & Crusades**, **D&D 5E** (the SRD), and a
  rules-free **Worldbuilding** mode for any system.
- **Your Fantasy Grounds library.** If you own Fantasy Grounds modules, Kraken
  reads them in place: books to read, story, encounters, NPCs, items, and maps
  with their walls, doors and lights.
- **Maps.** Image maps and animated tokens, square and hex grids, walls and doors,
  line of sight and fog, lights and darkness, weather, drawing, and a full map
  editor.
- **Character sheets and wizards** for each game, a combat tracker that rolls
  attacks, damage, saves and initiative and applies the results, 3D dice,
  effects, a party sheet and treasure parcels.
- **Sound.** One-shots, sound effects triggered by the chat (a sword hit, a
  fireball), ambience and music, each with its own volume for every player.
- **A multi-monitor GM.** Every window can pop out to another monitor.
- **AI-first.** Every GM action is also a tool for an AI agent (MCP), so an
  assistant can build characters, run combat or set up a map. See
  [AGENT.md](AGENT.md).

## Getting started

1. **Install.** Run `Kraken VTT Setup.exe` (from a release), or run from the
   source with `Kraken VTT.bat` (see [Development](#development)).
2. **Make a campaign.** On the start screen choose **My Campaigns**, name it,
   and pick its game. Choose *Descending Darkness* or *Apeira Astra* to try
   Kraken with no other content.
3. **Host.** Choose LAN, Cloud or both, set a password if you like, and press
   **Play**. *Addresses to give your players* lists the addresses.
4. **Players join.** They open the address in Chrome, type their name and a
   password of their own (Chrome remembers it), plus the table's password if
   you set one, and make a character.

The full guides:

| Guide | For |
|---|---|
| [docs/gm-guide.md](docs/gm-guide.md) | Running a game: campaigns, hosting, books, maps, combat, sound |
| [docs/players.md](docs/players.md) | Joining a table, making a character, rolling |
| [docs/included-games.md](docs/included-games.md) | Descending Darkness and Apeira Astra, and running their adventures |
| [docs/development.md](docs/development.md) | Building from source, tests, how the code is laid out |
| [AGENT.md](AGENT.md) | The AI agent and its tools |
| [PLAN.md](PLAN.md) | The plan and the progress log |

## Development

You need Windows, [Node.js](https://nodejs.org) 22 or newer, and Git.

```
git clone https://github.com/krakenunbound/kraken-vtt.git
cd kraken-vtt
npm install
npm run build
npm start
```

Or double-click **`Kraken VTT.bat`**: it installs packages the first time,
rebuilds when the code has changed, and opens the app. `npm run exe` builds the
installer. More in [docs/development.md](docs/development.md).

## Reporting problems

Open an issue on GitHub with what you did, what you expected and what
happened, and a screenshot if you can. For a problem a player sees, say which
browser they used.

## Licence and credits

Kraken VTT is released under the [MIT licence](LICENSE).

The included games (Descending Darkness and Apeira Astra), their books, maps
and art are original to Kraken. Some of Descending Darkness's mechanics are
based on the System Reference Document 5.1 by Wizards of the Coast LLC,
available under the Creative Commons Attribution 4.0 International licence;
no SRD text is reproduced. Kraken's D&D 5E support uses the SRD 5.2.1 under the
same licence.

Kraken is not affiliated with SmiteWorks (Fantasy Grounds), Foundry Gaming
(Foundry VTT), Troll Lord Games (Castles & Crusades) or Wizards of the Coast.
No licensed content is included: Kraken reads the modules you own, where they
are on your computer.
