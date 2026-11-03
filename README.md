# Kraken VTT

A free, MIT-licensed virtual tabletop. The GM hosts from this app; players join from a web browser and install nothing. Castles & Crusades first (SiegeCore rules), with Fantasy Grounds' behaviour and a built-in AI agent that can do everything the GM can ([AGENT.md](AGENT.md)).

## Running it

- **Double-click `Kraken VTT.bat`** in this folder. It installs packages the first time, rebuilds the interface when the code has changed, and opens the app. `Kraken VTT.bat --build` always rebuilds.
- **`Kraken VTT Setup.exe`** in this folder installs the packaged app (`npm run exe` builds it and puts it here). It installs to `C:\Program Files\Kraken VTT` with desktop and Start menu shortcuts, and needs no Node.js. Windows asks for administrator approval once, because the installer also adds the Windows Firewall rule that lets players reach your table, so the firewall never asks when you host. Running a newer Setup updates the app in place; uninstalling removes the rule. It is a snapshot: rebuild it to get newer changes. It isn't in git.
- `Kraken VTT.bat` runs the development copy of Electron. Windows asks about the firewall once for it, the first time you host; tests and demos only listen on this computer, so they never ask.

Players open the address shown in the app's Players window in Chrome. In chat, type `/` for the commands (Fantasy Grounds' and Foundry's), or `/help` for all of them.

## Development

- `npm run dev` runs the interface in a browser, `npm start` opens the app on the last build.
- Tests: `npm run coverage`, `agent`, `agent-ui`, `dice`, `spells`, `attack`, `combat`, `map`, `party`, `session`, `character`, `wizard`, `pregens`, `popout`, `setup`, `decal`.
- [PLAN.md](PLAN.md) holds the plan and the progress log.
