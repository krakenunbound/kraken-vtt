<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# GM icons

The GM's picture beside everything the GM says in chat, for the whole
table, as FG's GM icon. The GM's choice follows them into every new
campaign.

To choose one, use **Settings > GM Icon**, or type `/gmicon` in chat. Kraken
ships the Kraken GM Icon set. Any picture you put here is added to it.

## An icon

- **Square, PNG or WebP, 256 to 512 pixels, transparent background.** It is
  shown small (about 36 pixels), so use a bold shape with strong edges and
  little fine detail.
- It sits on a dark chat panel: make sure it reads on dark.
- Name it as you want it listed: `Hooded Storyteller.png`. A leading number
  only sets the order.

## For an AI agent making icons

1. Generate a square emblem with no text, on a plain background, then remove
   the background.
2. Shrink a copy to 40 pixels and look at it: if you cannot tell what it is,
   simplify it.
3. Save it here. Choose it with the Kraken MCP tool `kraken_decal`, with
   `kind: "gmicon"`: `action: "list"` and `action: "set"` with its `id`. Or use
   `action: "import"` with `path` to copy it in from anywhere.
