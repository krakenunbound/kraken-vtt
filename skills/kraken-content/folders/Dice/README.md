<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Dice packs

Drop a **dice pack** in this folder to add dice sets to Kraken VTT. Every
seat at your table can then choose them: you, and your players in their
browsers. They appear in the **Dice** window as a group named after the pack.

A dice pack is either:

- a **folder** holding `dice.json` and any pictures its sets use; or
- a **.zip** of that folder (handy for sharing).

Kraken reads this folder whenever a table is hosted. To see a new pack, leave
the table and host it again. A pack's problems, such as a missing picture or a
bad colour, show to the GM, and to an AI agent through `kraken_dice_packs`.

The pack named **Kraken Sea Glass** came with this folder as an example. Copy
it, rename the copy, and change it.

## dice.json

```json
{
  "kraken": "dice-pack",
  "version": 1,
  "name": "Sea Glass",
  "author": "Your name",
  "description": "Dice the colour of the sea.",
  "sets": [
    { "name": "Tidepool", "theme": "swirl", "body": "#0f5a66", "accent": "#7fe7d8", "ink": "#f4fbff", "material": "glass", "effect": "aura", "font": "glow" },
    { "name": "Barnacle", "theme": "speckle", "body": "#6b6150", "accent": "#e9e1cf", "ink": "#1d1a14", "material": "stone", "font": "engrave", "pips": true },
    { "name": "Kraken Hide", "texture": "kraken-hide.png", "glow": "kraken-hide-glow.png", "body": "#2a1a33", "ink": "#ffd77a", "material": "stone", "effect": "embers", "font": "metal" }
  ]
}
```

| Field | Needed | What it is |
|---|---|---|
| `kraken` | yes | Always `"dice-pack"`. |
| `version` | yes | Always `1`. |
| `name` | yes | The pack's name: its group in the Dice window. |
| `author`, `description` | no | Who made it, and what it is. |
| `sets` | yes | 1 to 60 sets. Each one is a whole dice look. |

### A set

| Field | Needed | Values |
|---|---|---|
| `name` | yes | Up to 60 characters, unique in the pack. |
| `theme` | yes, unless `texture` | The pattern Kraken paints: `classic` (solid), `marble`, `swirl`, `speckle`, `stripes`, `wood`, `runes`, `dragonhide`, `starfall`, `bone`, `magma`, `leviathan`; or one of the Gilded Die designs, made with their own finish (use `"material": "design"`): `aether`, `reliquary`, `rosewindow`, `gilded`, `emerald`, `frost`, `obsidian`, `bloodstone`, `arcane`, `void`, `hero`, `monster`, `wyrm`, `undead`, `ghost`, `wizard`, `bard`, `necromancer`, `goblin`, `traveller`, `mythos`. |
| `body` | yes | The dice colour, `#rrggbb`. With a texture, the colour shown while the picture loads. |
| `ink` | yes | The numbers' colour, `#rrggbb`. Pick one that stands out from the body. |
| `accent` | no | The second colour of two-colour patterns (marble veins, swirl, speckles, stripes, wood grain, runes), `#rrggbb`. |
| `material` | no | How the dice take the light: `plastic` (resin, the default), `glass`, `metal`, `pearl`, `stone`, `wood`, `design` (a Gilded Die theme's own finish). |
| `effect` | no | What follows the dice as they roll: `none`, `sparkles`, `fire`, `frost`, `arcane`, `shadow`, `glow`, `aura`, `spark`, `embers`, `wisp`, `holy`, `charge`, `notes`, `ion`. |
| `font` | no | The numbers' lettering: `classic`, `bold`, `runic`, `script`, `glow`, `metal`, `engrave`. |
| `pips` | no | `true`: a d6 shows pips instead of numbers. |
| `crit` | no | `false`: no gold burst on a natural 20, no red one on a 1 (on by default). |
| `texture` | no | A picture in the pack, wrapped on the dice faces. It replaces `theme`. |
| `glow` | no | A second picture, the same size as the texture: black where nothing glows, bright where the dice shine in the dark (veins, runes, eyes). Needs `texture`. |

Unknown values are left out, so the dice use their defaults. A set without a
valid `body` and `ink`, or without a known `theme` or `texture`, is skipped
and listed as a problem.

## Pictures on dice

- PNG, WebP or JPEG, up to 8 MB. **Square, 512 or 1024 pixels.**
- **Seamless (tileable):** each face of a die shows a part of the picture,
  and the parts meet at the edges. Patterns work better than scenes: scales,
  stone, wood, crystal, hide, metal, nebulae, runes.
- **No numbers.** Kraken writes the numbers over the picture in the set's
  `ink` colour and `font`. Keep the middle of the picture fairly even, so
  the numbers can be read.
- The picture is also used as a light relief, so dark lines look carved in.
- Put pictures beside `dice.json`, or in a subfolder (`"texture": "art/hide.png"`).

## For an AI agent making a pack

1. Make a folder named for the pack, for example `Sea Glass`, in a scratch
   place first.
2. Write `dice.json` as above. Choose `body`, `accent` and `ink` so the
   numbers stand out: a light ink on a dark body, or the reverse.
3. To make picture dice, generate square, seamless textures with no text or
   numbers. For example, with an image model: *"seamless tileable texture,
   dark purple kraken skin with glowing gold suckers, top-down, even
   lighting, no text"*. For a glow picture, keep only the parts that should
   shine, on black.
4. Check it before you drop it in: call the Kraken MCP tool
   `kraken_dice_packs` with `action: "check"` and `path` set to the folder.
   It lists every set Kraken reads and every problem.
5. Copy the folder, or a .zip of it, into this Dice folder. `kraken_dice_packs`
   `action: "folder"` gives the folder's path.
6. To try a set, call `kraken_dice_settings` with the set's look (the `sets`
   from `kraken_dice_packs list`), then `kraken_roll`.
