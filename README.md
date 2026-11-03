# Kraken VTT

A free, MIT-licensed virtual tabletop. The GM hosts from this app; players join from a web browser and install nothing. Castles & Crusades first (SiegeCore rules), with Fantasy Grounds' behaviour and a built-in AI agent that can do everything the GM can ([AGENT.md](AGENT.md)).

## Running it

- **Double-click `Kraken VTT.bat`** in this folder. It installs packages the first time, rebuilds the interface when the code has changed, and opens the app. `Kraken VTT.bat --build` always rebuilds.
- **`Kraken VTT.exe`** in this folder is a packaged copy (`npm run exe` builds it and puts it here). It doesn't need Node.js, but it is a snapshot: rebuild it to get newer changes. It isn't in git.

Players open the address shown in the app's Players window in Chrome.

## Development

- `npm run dev` runs the interface in a browser, `npm start` opens the app on the last build.
- Tests: `npm run coverage`, `agent`, `agent-ui`, `dice`, `spells`, `attack`, `combat`, `map`, `party`, `session`, `character`, `wizard`, `pregens`, `popout`.
- [PLAN.md](PLAN.md) holds the plan and the progress log.
