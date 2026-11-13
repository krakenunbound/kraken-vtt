<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Background decals

The emblem in the middle of the table, behind everything when no map is up,
as FG's Background Decal. The GM chooses it, and every seat sees it.

To choose one, use **Settings > Background Decal**. Kraken ships a set, with
one for each game it plays, and a **Sci-Fi** set (a ringed world, a star navy
crest, a circuit d20, a void kraken, an explorer's helmet). Any picture you put
here is added to it.

## A decal

- **PNG or WebP with a transparent background, about 1024 pixels**, square or
  a little wider than tall.
- One centred emblem or logo: a crest, a seal, a game's mark. It is shown
  large and faint over the desktop wallpaper, so a strong silhouette reads
  best. Avoid small text.
- Name it as you want it listed. To group it with a game, make a folder named
  for that game here, for example `Castles & Crusades/`, and put the picture
  in it.

## For an AI agent making decals

1. Generate a centred emblem on a plain background, then remove the
   background.
2. Save it here, or in a folder named for its game.
3. Choose it with the Kraken MCP tool `kraken_decal`: `action: "list"`, then
   `action: "set"` with its `id`. Or use `action: "import"` with `path`.
