<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Dice towers

Pictures of dice towers for the table. The GM chooses how the tower looks,
and every seat sees that look.

To choose one, right-click the tower on the table and pick **Change its
look…**, or use **Settings > Dice Tower Look**. The tower stands apart from the
chat when **Settings > External dice tower** is ticked.

Kraken draws six towers of its own (Castle stone, Ironbound oak, Obsidian
runes, Frost spire, Clockwork brass, Bone ossuary). It also ships the Kraken
Lighthouse. Any picture you put here is added to the list.

## A tower picture

- **PNG or WebP with a transparent background.** The tower stands on the
  table, so anything around it should be see-through.
- Square or a little taller than wide, about **512 to 1024 pixels**. Stand
  the tower at the bottom middle, filling most of the height.
- Name it as you want it listed: `Kraken Lighthouse.png` shows as "Kraken
  Lighthouse". A leading number only sets the order: `01 Kraken Lighthouse.png`.

### Lit and unlit

A tower can have two pictures, as FG's dice tower has on and off:

```text
Sea Witch Tower.png       off: dark
Sea Witch Tower lit.png   on: lit windows, a glowing door
```

The `lit` picture must be the same size, with the tower in exactly the same
place; only the light changes. Kraken shows it while the tower is on, and
while dice are held over it, and fades between the two. A tower without a
`lit` twin glows instead, with dice falling in front of it.

## For an AI agent making a tower

1. Generate the unlit tower on a plain background, then remove the
   background, so the PNG has real transparency.
2. For a lit twin, change only the lighting of the same picture, for
   example with an image-to-image pass at low strength. Keep the framing
   identical.
3. Save both here: `<Name>.png` and `<Name> lit.png`.
4. Choose it with the Kraken MCP tool `kraken_tower`: `action: "list"`
   shows the looks and the folder, and `action: "style"` with the picture's
   `id` puts it up. `action: "import"` with `path` copies a picture from
   anywhere into this folder and puts it up.
