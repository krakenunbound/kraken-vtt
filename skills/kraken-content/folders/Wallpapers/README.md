<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Wallpapers

The pattern that tiles across the desktop behind everything, as FG's desktop
theme. The GM chooses it, and every seat sees it.

To choose one, use **Settings > Desktop Wallpaper**. Kraken ships one for each
game, plus a set of patterns. Any picture you put here is added to them.

## A wallpaper

- **Seamless (tileable):** its left edge meets its right edge, and its top
  meets its bottom, so the repeats don't show seams.
- **Square, 512 to 1024 pixels**, WebP, PNG or JPEG. No transparency is
  needed.
- **Dark and quiet.** Windows, maps and the chat sit on top of it, so keep it
  low in contrast, without bright spots or a single eye-catching object that
  repeats like a stamp. Leather, stone, wood, parchment, waves, star fields,
  fabric and engraved metal all work well.
- Name it as you want it listed: `Deep Sea Stone.webp`.

## For an AI agent making wallpapers

1. Generate a seamless, tileable texture with no text, for example *"seamless
   tileable texture, dark weathered blue slate tiles, subtle, even lighting,
   top-down"*. Use a model's tiling option if it has one.
2. Check the seams: put four copies side by side in a 2x2 grid and look
   where they meet. Fix any seam, for example by offsetting the picture by
   half its size and painting the middle over.
3. Make it dark enough for text and windows over it: an average brightness
   below about 30%.
4. Save it here. Choose it with the Kraken MCP tool `kraken_decal`, with
   `kind: "wallpaper"`: `action: "list"`, then `action: "set"` with its `id`.
