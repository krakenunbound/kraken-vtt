# Art Map Studio's shipped packs lack

Kraken ships ten games. The shipped map art (Kraken Map Art, Battle Map Forge)
covers fantasy dungeons, caves, wilderness, shores and taverns well. These are
the gaps, by the game that needs them, with a prompt for each so they can be
made later (not yet: the GPU is busy).

## Made (2026-11-14, MiniMax H3 Image)

54 of these are now in `studio/packs/Kraken Map Art.mod`, in its kind folders:
floors and ground (deck plating, worn deck, grating, hull plating, asteroid
rock, wet cobbles, dock planks, warehouse floor, turf and snow, dense
undergrowth, ash and soot), walls with end caps (bulkhead, damaged bulkhead,
hull wall, quay wall, soot brick, barrow stones, longhouse, root-choked), doors
(hatch, airlock, blast door, trapdoor) and props (consoles, bridge row,
captain's chair, three cryo pods, reactor core, containers, lockers, bunk, mess
table, med bed, pipes, wreckage, iron bridge, gondola, oil drum, standing
stone, stone circle, capstone, longhouse hearth, hide rug, burial urn, grave
goods, hollow tree, fairy ring, scorch mark, open pit, coffins, sarcophagus).
Painted at 2048 by H3 with "seen from straight overhead in a flat bird's-eye
plan view" in the prompt (without it H3 paints product shots from the side),
props cut out with rembg (u2net), tiles made seamless by a half-offset blend.

Still missing (tried, rejected: side views, painted lettering, or not
tileable): gas lamp, spirit lantern, sparking cable, sci-fi crate, gibbet,
canal water, clean station floor, ironwork fence.

Also missing, found building the Map Studio candidates for the shipped books'
maps (`scripts/studio-map-*.mjs`), each stood in for as noted:

- **Sci-fi:** lift shaft or ladder well (grating and pipes as rails), work
  lamp or floodlight mast (a lit console), small sealed metal case (a small
  cargo container), bare asteroid boulders (the mossy fantasy boulders).
- **Fantasy:** water wheel and millstone (a ritual platform for the
  millstone, logs for the wheel), hand cart, beacon basket (a cold campfire),
  a cold (unlit) brazier, a fresh corpse (a blood stain), an alarm bell,
  a heavy stone slab door (an iron door).
- **Stand-ins that mislead:** `Reactor core` is the only reactor or ring
  art, and it always reads as live and glowing (a crated spare in a hold, a
  dead skein ring); the open cryo pod is a different shape from the closed
  ones.
- **Art that does not read right:** `Blast door` and `Iron bridge` look
  side-on, `Trapdoor` is painted at an angle, `Puddle` reads as a gold plate,
  `Ash and soot` reads as flagstones, `Chest` and `Chest, iron` are side
  views; Texture-brush strokes of `Dry grass` show as pale pills.

## How to make them so they fit the packs

- **Look:** top-down (straight down, no perspective), hand-painted digital
  battle-map art, soft directional light from the top-left, gentle contact
  shadow under props, muted natural colours with one warm accent, crisp at
  100 px per square. Match Kraken Map Art's existing pictures side by side.
- **Scale:** 256 px per 5-ft square (a 1 by 2 square prop is 256 x 512).
- **Floors and ground:** 1024 x 1024 seamless tiles (4 by 4 squares), no
  lighting gradient, no vignette, no single feature that repeats visibly.
- **Walls:** a horizontal strip 1024 x 48 to 112, seamless left to right, the
  wall seen from above (its top), plus a square end cap named
  `<name>_end` (the height of the strip) so the Wall tool caps open ends.
- **Props:** transparent PNG (a real alpha channel), the object alone, trimmed,
  no ground under it, a soft shadow inside the alpha.
- **Doors:** 256 x 64 per square of width, closed, seen from above.
- No text, logos or signatures. Original work only.
- Pack them like `studio/packs/Kraken Map Art.mod` (an FG-style .mod: images
  in category folders, each with its grid size of 256), check them in Map
  Studio (`library`, then a test map and a full-size `render`), then they
  ship.

Negative prompt for all: `perspective, isometric, side view, 3d render, photo,
text, watermark, signature, border, frame, vignette, blurry, low detail`.

## Apeira Astra and Starforged (ships, derelicts, stations)

Nothing sci-fi exists. `games/ironsworn/maps/silent-hulk` (a derelict) was
drawn by hand for want of these.

| Name | Kind | Prompt |
|---|---|---|
| Deck plating | Floor tile | seamless top-down sci-fi starship deck plating, brushed steel panels in a 4x4 grid, recessed bolts, faint hazard-stripe wear at seams, scuffs and grime, muted gunmetal grey, hand-painted battle map texture |
| Deck plating, worn | Floor tile | the same deck plating rusted and scorched, dents, oil stains, missing panel showing cables below, derelict |
| Grating | Floor tile | seamless top-down metal floor grating over dark machinery, diamond mesh, pipes visible beneath, hand-painted |
| Hull plating | Ground tile | seamless top-down exterior starship hull plating, large riveted plates, sensor nubs, micro-meteor pitting, cold blue-grey |
| Station floor, clean | Floor tile | seamless top-down space station corridor floor, white and pale grey composite tiles, inset light strips, clean |
| Bulkhead | Wall strip (1024 x 96) + end | top-down view of a thick starship bulkhead wall seen from above, reinforced steel with ribbing, cable trays along one side, seamless horizontal strip |
| Bulkhead, damaged | Wall strip + end | the same bulkhead torn and buckled, exposed wiring, scorch marks |
| Hull wall | Wall strip + end | thick outer hull wall from above, armoured plating, seamless strip |
| Hatch | Door (256 x 64) | top-down sliding starship hatch, closed, yellow-black hazard edges, central seam |
| Airlock door | Door (512 x 96) | heavy double airlock door from above, closed, warning stripes, status light |
| Blast door | Door (512 x 96) | thick armoured blast door from above, closed |
| Console | Prop 1 x 1 | top-down starship control console with glowing screens and buttons, cyan glow, transparent background |
| Bridge console row | Prop 3 x 1 | curved bank of bridge consoles with chairs, glowing displays, transparent background |
| Captain's chair | Prop 1 x 1 | top-down command chair, padded, armrest controls |
| Cryo pod | Prop 1 x 2 | top-down cryogenic sleep pod with frosted glass lid, blue glow, transparent background; also `Cryo pod, open` and `Cryo pod, dead` (dark, cracked glass) |
| Reactor core | Prop 3 x 3 | top-down ship reactor, circular core with glowing centre, coolant pipes radiating out |
| Cargo container | Prop 2 x 1 | top-down shipping container, ribbed metal, faded paint; also stacked (2 x 2) |
| Crate, sci-fi | Prop 1 x 1 | top-down rugged supply crate with latches and stencil marks (no legible text) |
| Locker row | Prop 2 x 0.5 | top-down row of crew lockers against a wall, one open |
| Bunk | Prop 1 x 2 | top-down crew bunk bed with thin mattress and blanket |
| Mess table | Prop 2 x 1 | top-down metal mess table with bolted stools |
| Med bay bed | Prop 1 x 2 | top-down medical bed with scanner arm |
| Pipes and conduits | Path strip | seamless top-down bundle of pipes and cables running along a floor, as a strip |
| Wreckage scatter | Prop 1 x 1 | top-down scattered metal debris, torn panels, sparks |
| Sparking cable | Prop 1 x 1 | top-down severed cable sparking, small glow |
| Asteroid rock | Ground tile | seamless top-down grey asteroid regolith with small craters |

## Forged in the Dark (an industrial canal city)

| Name | Kind | Prompt |
|---|---|---|
| Wet cobbles | Floor tile | seamless top-down dark wet cobblestones, puddles reflecting, soot, gaslight-era city street, cold blue-grey |
| Canal water | Ground tile | seamless top-down black-green canal water, oily sheen, floating refuse, still |
| Quay wall | Wall strip + end | top-down stone canal quay edge from above, large dressed blocks, iron mooring rings, slime line, seamless strip |
| Dock planks | Floor tile | seamless top-down tarred dock planking, gaps showing water below, rope and nails |
| Iron bridge | Prop 2 x 4 | top-down narrow iron footbridge over a canal, riveted rails |
| Gondola | Prop 1 x 3 | top-down narrow canal boat, dark wood, a lantern at the prow |
| Gas lamp | Light prop | top-down iron street gas lamp, glowing |
| Leviathan-oil drum | Prop 1 x 1 | top-down iron drum with dark oil stains |
| Ironwork fence | Wall strip + end | top-down tall spiked wrought-iron fence, seamless |
| Soot brick wall | Wall strip + end | top-down soot-blackened brick wall, seamless |
| Warehouse floor | Floor tile | seamless top-down warehouse boards with crate scuffs and oil |
| Spirit lantern | Light prop | top-down electroplasmic lantern, pale blue-white glow |

## Ironsworn (iron-age north)

| Name | Kind | Prompt |
|---|---|---|
| Barrow stones | Wall strip + end | top-down drystone barrow passage wall of rough unworked slabs, lichen, seamless |
| Standing stone | Prop 1 x 1 | top-down weathered standing stone, lichen and carved spiral, shadow |
| Stone circle | Prop 5 x 5 | top-down ring of standing stones on turf, transparent outside the ring |
| Capstone | Prop 2 x 2 | top-down large flat capstone slab, cracked |
| Turf and snow | Ground tile | seamless top-down frozen turf with patches of snow, northern moor |
| Longhouse wall | Wall strip + end | top-down turf-and-timber longhouse wall, seamless |
| Longhouse hearth | Light prop 1 x 3 | top-down long central hearth of stones with embers |
| Hide rug | Prop | top-down shaggy hide rug |
| Burial urn | Prop | top-down iron-age clay cinerary urn |
| Grave goods | Prop | top-down scatter of corroded bronze and iron grave goods, a torc, a broken sword |

## Cairn and Descending Darkness (dark woods, ruins)

| Name | Kind | Prompt |
|---|---|---|
| Dense undergrowth | Ground tile | seamless top-down tangled forest undergrowth, brambles and dead leaves |
| Root-choked wall | Wall strip + end | top-down ruined stone wall overgrown with roots, seamless |
| Hollow tree | Prop 2 x 2 | top-down giant hollow tree trunk, opening visible |
| Fairy ring | Prop 2 x 2 | top-down ring of pale mushrooms in moss |
| Gibbet | Prop 1 x 1 | top-down iron gibbet cage on a post |

## Everyone

| Name | Kind | Prompt |
|---|---|---|
| Ash and soot | Ground tile | seamless top-down grey ash and soot over stone, faint embers |
| Scorch mark | Prop 1 x 1 | top-down blackened scorch mark on stone, transparent background |
| Pit, open | Prop 2 x 2 | top-down square pit dug into a stone floor, dark depth, broken edge |
| Trapdoor | Door 1 x 1 | top-down wooden trapdoor in a floor, closed, iron ring |
| Coffin, wooden | Prop 1 x 2 | top-down plain wooden coffin, lid on; also `Coffin, open` (a skeleton inside) |
| Sarcophagus, carved | Prop 1 x 2 | top-down stone sarcophagus with carved warrior effigy on the lid |
