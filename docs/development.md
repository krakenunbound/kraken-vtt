# Developing Kraken

## Setup

Windows or Linux, Node.js 22 or newer, Git.

```
npm install
npm run build      # typecheck and build the interface into dist/
npm start          # open the app on the last build
npm run dev        # the interface alone in a browser, with hot reload
npm run exe        # the Windows installer (Kraken VTT Setup.exe)
npm run linux      # the Linux AppImage and .deb (on Linux or in WSL)
```

`Kraken VTT.bat` (Windows) does install, build-when-changed and start in one.

To build the Linux packages from Windows, copy the source into a WSL
distribution's own file system (not `/mnt/c`), then `npm ci` and
`npm run linux` there; the packages land in its `release/` folder.

## Tests

- `npm run checks` runs the whole suite: each check launches the app (and, for
  the player side, headless Chrome) and plays through a feature as a GM and a
  test player would.
- `npm run coverage` fails when a table action has no agent tool (every GM
  action must also be a tool; see [AGENT.md](../AGENT.md)).
- One feature at a time: `npm run <name>`, such as `descending-ui`,
  `astra-ui`, `combat`, `map`, `records-ui`, `backdrops` (package.json lists
  them all).
- `KRAKEN_WINDOW_AT=x,y` places a test run's window (for example on another
  monitor).

Tests that need licensed content (Fantasy Grounds modules) skip themselves
when it is not on the computer.

## How it is laid out

| Where | What |
|---|---|
| `electron/` | The host: `main.cjs` (windows), `backend.cjs` (a process of its own: the table server, campaigns, books, the agent bridge), `tableServer.cjs` (HTTP and WebSocket, permissions, what each player may see), `records.cjs`, `combat.cjs`, `mapState.cjs`, `dice.cjs` |
| `electron/importers/` | Fantasy Grounds modules (`fgModule.cjs`) and other formats |
| `electron/agent/` | The MCP tools (`tools.cjs`) and server |
| `shared/` | Rules engines, used by both host and browser: `siege/` (Castles & Crusades), `dnd5e/` (the d20 family: D&D 5E and Descending Darkness), `astra/` (Apeira Astra), `map/` (grid, walls, line of sight, light) |
| `src/` | The interface (React + TypeScript), one codebase for the GM's windows and the players' browsers |
| `games/` | Kraken's own games written as data and built into module folders in `games/modules` (`npm run build-games`); see [games/README.md](../games/README.md) |
| `scripts/` | Tests (`verify-*.mjs`), builds and tools |

## Ground rules

- **No game rules in the core.** Rulesets sit on the core as Fantasy
  Grounds' sit on CoreRPG.
- **The host decides.** Every change goes through the host, which checks
  permissions and sends each player only what they may see.
- **Clean room.** Kraken reproduces how other tabletops behave, never their
  code. No licensed content in the repository.
- **Every action is a tool, with a test.**
- **Fast.** Heavy work stays off the window's process.

The plan and the progress log are in [PLAN.md](../PLAN.md).

## Screenshots

`node scripts/readme-shots.mjs` sets up both games' tables (characters, tokens, light, combat, a test player in Chrome) and takes the README's screenshots, full screen, into `docs/screenshots`. Use it after a visible change so the README shows the app as it is.

## Versions

`node scripts/bump-version.mjs` moves the version on; each pushed build is
tagged `v<version>`.
