<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Wallpapers

The pattern that tiles across the desktop behind everything, as FG's desktop
theme. The GM chooses it, and every seat sees it.

To choose one, use **Settings > Desktop Wallpaper**. Kraken ships:
- one for each game;
- a **Tabletop** set: hex grids on black, a battle mat, a dungeon map and an old world map;
- a **Sci-Fi** set: an amber hex grid, a star chart and starship deck plating.

Any picture you put here is added to them.

## A wallpaper

- **Seamless (tileable):** its left edge meets its right edge, and its top
  meets its bottom, so the repeats don't show seams.
- **Big: about 2048 pixels across**, WebP, PNG or JPEG. No transparency is
  needed.
  - A picture 1500 pixels wide or more is shown at its own size, as FG's
    desktop is, so the repeat hardly shows and a grid keeps its scale. A hex
    about 50 pixels across reads like FG's.
  - A smaller picture is repeated as a 384-pixel tile.
- **Game-table art, not stock textures:** a hex grid or a battle mat, a
  dungeon or world map, a star chart, a ship's deck. It should feel like a
  tabletop role-playing game.
- **Dark and quiet.** Windows, maps and the chat sit on top of it, so keep it
  low in contrast, without bright spots or a single eye-catching object that
  repeats like a stamp. Leather, stone, wood, parchment, waves, star fields,
  fabric and engraved metal all work well.
- Name it as you want it listed: `Deep Sea Stone.webp`.

## For an AI agent making wallpapers

1. Generate a seamless, tileable texture with no text, for example *"seamless
   tileable texture, flat top-down, very dark charcoal slate with faint teal
   grunge streaks"*. Use a model's tiling option if it has one. Ask for clear
   detail, not faint: it is darkened afterwards.

   Kraken's own scripts can do the rest (in the Kraken VTT repository):
   - `scripts/make-tileable.mjs` makes a picture seamless and darkens it;
   - `scripts/make-grid-wallpaper.mjs` draws an exactly repeating hex or square grid over one.
2. Check the seams: put four copies side by side in a 2x2 grid and look
   where they meet. Fix any seam, for example by offsetting the picture by
   half its size and painting the middle over.
3. Make it dark enough for text and windows over it: an average brightness
   below about 30%.
4. Save it here. Choose it with the Kraken MCP tool `kraken_decal`, with
   `kind: "wallpaper"`: `action: "list"`, then `action: "set"` with its `id`.
