---
name: kraken-content
description: Make things for Kraken VTT and put them where it reads them - dice packs (dice.json sets, picture dice), dice tower pictures (with a lit twin), GM icons, background decals, seamless desktop wallpapers, and book packs. Use when a user asks an agent to create dice, a dice tower, a GM icon, a decal, a wallpaper or other art or content for Kraken VTT, or asks where such things go.
---
<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->

# Making things for Kraken VTT

Kraken VTT is a virtual tabletop. The GM runs it on their computer, and
players join in a browser. Everything a GM adds lives in one folder, with a
subfolder for each kind of thing:

- Windows: `C:\Users\<you>\Documents\Kraken VTT`
- Linux: `~/Documents/Kraken VTT`

Each subfolder has a `README.md` with the exact format and an agent's
checklist. **Read that README before making something for it.**

| Folder | Kind | In short |
|---|---|---|
| `Dice` | Dice packs | A folder or .zip with `dice.json` (`"kraken": "dice-pack"`, `"version": 1`, `name`, `sets`) and any face pictures. Each set is a dice look: `theme` or `texture`, `body`, `ink`, `accent`, `material`, `effect`, `font`, `pips`. |
| `Dice Towers` | Tower pictures | A transparent PNG of a tower standing at the bottom middle, about 512 to 1024 pixels; optionally `<Name> lit.png`, the same picture lit. |
| `GM Icons` | Chat pictures | A square transparent PNG, 256 to 512 pixels, bold enough to read at 36 pixels. |
| `Background Decals` | Table emblems | A transparent PNG or WebP, about 1024 pixels, one centred emblem; a subfolder named for a game groups it with that game. |
| `Wallpapers` | Desktop tiles | Game-table art (a hex grid, a battle mat, a map, a star chart): seamless, dark and quiet, about 2048 pixels across (shown at its own size). |
| `Packs` | Books (.kpack) | Made by Kraken from FG modules; not by hand. |

## Rules for every picture

- No text in pictures, unless the user asks for it.
- Use real transparency (an alpha channel) where a README asks for a
  transparent background. A painted checkerboard is not transparency.
- Name files as they should be listed. A leading number only sets the order
  (`01 Kraken Lighthouse.png` is listed as "Kraken Lighthouse").
- Make things in a scratch folder first; copy them into Kraken's folder when
  they are done.

## Checking your work with Kraken's MCP tools

When Kraken is running, its MCP server (`kraken`) has the tools for this:

- `kraken_dice_packs`:
  - `action: "check"` with `path` reads a pack anywhere and lists its sets and problems;
  - `action: "list"` shows the installed packs;
  - `action: "folder"` gives the Dice folder's path.
- `kraken_dice_settings` sets the GM's dice to a look, and `kraken_roll`
  throws them.
- `kraken_tower`:
  - `action: "list"` shows the drawn looks and the tower pictures;
  - `action: "style"` with an `id` puts one up;
  - `action: "import"` with `path` copies a picture in and puts it up.
- `kraken_decal`, with `kind` set to `decal`, `wallpaper` or `gmicon`:
  - `action: "list"` and `action: "set"` choose one;
  - `action: "import"` with `path` copies a picture in.
- `kraken_ui_screenshot` shows what the GM sees, so you can judge the result
  on the table.

A table must be hosted for these tools to act on it (`kraken_status` says).
Picture libraries are read again every few seconds. Dice packs are read when
a table is hosted, and again whenever `kraken_dice_packs` is called.
