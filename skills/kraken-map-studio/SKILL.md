---
name: kraken-map-studio
description: Make a good battle map in Kraken VTT's built-in map maker, Map Studio, with its agent tool kraken_map_studio and its art packs - floors blended, wall art with line of sight, doors in the gaps, props that tell the story, lights on light sources, weather, traps, then render it full size, look at it, fix it, play-test it, and save it into the campaign or export it for a book. Use whenever a user asks an agent for a map, a dungeon, a battle map, an adventure's map, or to fix or improve one in Kraken VTT. Never hand-draw maps with scripts when Map Studio can make them.
---
<!-- kraken-vtt guide. The tool's own description is the reference for every argument. -->

# Making maps with Map Studio

Map Studio is Kraken VTT's map maker (the pen at the top of the GM's
sidebar). It paints maps from art packs, and it knows walls, doors, windows,
lights, time of day, weather and traps, so a map it makes plays: line of
sight, doors that open, lights that glow, traps that spring.

An agent drives it with one tool, **`kraken_map_studio`**, through Kraken's
MCP server (`kraken`). Every action is done by the editor's own code (its
generator, floors, Texture and Scatter brushes, Wall tool, Walls & doors,
Lights, Weather, Traps & regions, play test, Save project), in the GM's Map
Studio window, in its active tab. The GM can watch the map being made and
take over with the mouse at any point.

**Do not hand-draw maps.** No Python or canvas scripts painting rectangles:
the packs have real floors, walls, doors and props, and Map Studio puts them
together properly. If the art you need is missing, say so and list it (see
`missing-assets.md`), then build with the closest art that exists.

## Before you start

1. Kraken is running and a campaign is hosted (`kraken_status`; else
   `kraken_campaign_create`, `kraken_host`). Map Studio opens by itself.
2. Units are **squares**: x to the right, y down, (0, 0) is the map's top-left
   corner. The centre of the square in column 3, row 4 is `[3.5, 4.5]`. A
   square is 5 feet. Light radii are in **feet**.
3. Find art by name with `library`; every answer gives `squares` (the art's
   size on the grid), `kind`, `pack`, `wallArt`, `tiles` (floors and ground).
   `art` arguments take an id or a name (the shipped packs win a name tie).

```json
{"action": "library", "search": "brazier"}
{"action": "library", "kind": "Walls", "shippedOnly": true, "limit": 200}
```

## Licence rule

**Kraken Map Art** and **Battle Map Forge** are the only art for maps that
ship with Kraken (the public repository, a book in `games/`). The GM's
Dungeondraft packs and Fantasy Grounds art packs are licensed to the GM: use
them for the GM's own campaign maps only. `check` reports any art outside the
shipped packs (`art.outside`).

The GM's Dungeondraft packs come into the library one at a time, as in the
editor's "Dungeondraft packs..." list: `ddpacks` lists them (from the folders
set with `kraken_studio` `settings`), `ddpack` with a `name` or `key` opens
one, and `library` with its `pack` then finds its art.

```json
{"action": "ddpacks", "search": "FA_Assets"}
{"action": "ddpack", "name": "FA_Assets_B"}
```

## The workflow

### 1. Plan from the text

Read the adventure's description of the place. Write down, before any call:

- each area: its name, size in squares (5 ft each), what its floor is
  (worked stone, rough cave, dirt, wood, snow);
- how they connect: doors (which kind: wooden, iron, double, secret,
  portcullis), open archways, collapses;
- what is in each room that matters to play: the altar, the coffins, the
  pool, the chest. Every named thing in the text gets art;
- light sources (braziers, torches, campfires) and where it is dark;
- hazards: traps, pits, difficult ground, water, smoke.

Keep built rooms on whole squares, so walls fall on grid lines. Leave 1 to 3
squares of margin round the outside.

### 2. Lay it out

- A blank map: `new` (name, width, height in squares, grid 100 px per square
  (the art is about 256 px per square; 100 keeps it crisp), background a dark
  colour such as `#16130f`).
- Or a seeded dungeon to start from: `generate` (setting, seed, rooms...).
  Same seed, same dungeon. **Always give `roomFloor`, `corridorFloor` and
  `stairArt`** (or `stairs: false`): without them it falls back on a starter
  kit's names, which on a GM's computer may be licensed art. Then dress it as
  below.

### 3. Floors

- Fill the whole map with the ground the place is cut into (rock: `Cave
  floor`; outdoors: `Grass`, `Dirt`, `Snow`), then `update` its opacity down
  (0.2 to 0.4) so it reads as background, not as floor.
- One `floor` per room or area: `rect` for built rooms (hard edge), `polygon`
  for caves and organic shapes, with `feather` (0.3 to 1 square) for a soft
  edge that blends into what is under it. `room: true` on rooms (check then
  wants props in them).
- Floors tile from the map's corner, so two rooms of the same floor join
  without a seam.
- Pale floors (Flagstone, Stone tiles, Marble) look washed out in a dungeon:
  `update` their opacity to 0.7 to 0.8 over a dark background.
- Blend transitions with `paint` (the Texture brush): `Mud` where a cave
  passage meets paving, `Gravel` for ash and grit, `Moss` in damp corners.
  Size 0.8 to 2 squares, softness 60 to 80. Use it sparingly: two or three
  strokes a room at most; big saturated blobs look cheap.

### 4. Walls

- Walls go on the edges of the floor, along grid lines. Use **wall art**
  (`wall` with `art`): it repeats along the path, mitres the corners, caps the
  ends and makes its line-of-sight wall in one step.
- Draw each wall line as **one path** (corners included) rather than many
  short pieces. Use `closed: true` for a room's whole outline.
- **Leave a gap where every door or opening goes.** The path stops at one
  side of the door and a new one starts at the other.
- Match the art to the place: `Dungeon wall` for worked stone, `Dungeon
  wall, crumbling` for old tombs, `Cave wall` for rough rock, `Fieldstone
  wall, tumbled` for an entrance, `Wooden wall`, `Timber and plaster wall`,
  `Brick wall`, `Palisade`, `Hedge`, fences outdoors.
- A pillar or a free-standing block: `place` its art (`Stone column`) and a
  small closed `wall` with no art round it (`type: "wall"`).
- Line of sight without art: `wall` with `type` (wall, terrain, door,
  secret, window, invisible, illusion, pit, shadow).

### 5. Doors

- `door` with `from` and `to`, the two ends of the gap, on the wall line:
  `{"action": "door", "from": [9, 9], "to": [9, 11], "art": "Double door"}`.
- Kinds: `door` (default art `Door, wooden`), `window` (`Window`), `secret`
  (no art: draw the wall art straight across a secret door's gap, then add the
  door; it cuts the line of sight but keeps the wall's look). `locked`,
  `open`.
- Door art: `Door, wooden`, `Door, old`, `Door, iron`, `Door, wooden broken`,
  `Double door`, `Double door, iron`, `Portcullis`, `Window`, `Window, wide`,
  `Arrow slit`.

### 6. Props that tell the story

- `place` with `items` puts many at once. Each: `art`, `at` (its centre),
  `rotation`, `width` in squares (or `scale`), `layer`.
- Every room gets props. Put the thing the text names first (the altar, the
  coffins), then two to five details that say what happened here (bones, a
  blood stain, a toppled chair, rubble, webs in the corners, a burnt-out
  torch).
- Keep scale honest: a chair is about 0.5 squares, a table 1 to 2, a bed 1 by
  2, a brazier 1, a coffin or slab 1 by 2. Do not blow props up to fill space.
- Turn things to fit: chairs face their table, slabs lie along the room, webs
  sit in corners (rotation 0, 90, 180, 270), scatter gets odd angles.
- Layers: floors on `map`, props on `objects`, wall art on `walls`, door art
  on `doors` (the tool does these by default). Things hung on walls
  (tapestries, reliefs) go on `walls`.
- Clutter (rocks, bones, mushrooms) can be strewn with `scatter` along a path
  (seeded).

### 7. Lights and time of day

- Every light sits **on** light-source art. `place` takes `light` to do both
  at once: `{"art": "Brazier", "at": [12.5, 9.5], "light": {"preset":
  "campfire", "color": "#ff8a3d", "bright": 15, "dim": 30, "animation":
  "flicker", "speed": 40, "strength": 75}}`.
- Presets (bright/dim ft): candle 5/10, lamp 15/45, torch 20/40, lantern
  30/60, campfire 20/40, glow 10/20 (magic), darkness (takes light away).
- Light sets mood: a few warm pools in the dark beat even light everywhere.
  Leave places the players should fear unlit.
- `ambient`: night for anything underground; dawn, sunlight, dusk, moonlight
  outdoors.

### 8. Weather, smoke and traps

- `weather` with `areas` keeps it where it belongs: smoke (`myst`, MystFade
  0.3 to 0.5) in a fire hall, `rain` outdoors, `water` on a pool.
- `region`: `trap` (a token that steps in is held there and the GM sees its
  name and note), `pit`, `difficult` (cost 2). Put the adventure's triggers
  here with a note saying what happens, and give a trap what it does: `trap`
  {damage "2d6", damageType, save {attribute, dc}, half, effect {label,
  duration}, auto roll|apply}, so the table can roll it (or apply it) itself.

### 9. Look at it (every time)

- `check` first: doors off wall lines, lights with no light-source art,
  rooms with nothing in them, art off the map, art outside the shipped packs.
- `render` the picture **at full size** (`view: "picture"`, the default; a
  `.png` path in `file`) and **look at it**. Then look closer:
  `region` (a box in squares) shows one room at full resolution.
- Look for, and fix: floors too bright or too uniform; blobs of paint; props
  floating over walls or sticking through them; doors that do not fill their
  gap; rooms that read as empty; obvious texture repeats; anything the text
  names that you cannot find on the map.
- `render` `view: "editor"` shows the walls, doors and lighting preview over
  the art: every wall line must sit on the wall art, every door in its gap.
- Fix with `update` (move, turn, size, opacity, layer), `remove`, `undo`,
  and render again. Iterate until it is a map a GM would be proud to show.

### 10. Play-test

- `render` with `view: "play"`, `token` where a character stands, `light`
  (torch, none...), `vision` (normal, dark60...), `darkness`: what that
  character sees. Check that walls block sight, closed doors hide the next
  room, secret doors hide their room, and lights glow where the braziers are.

### 11. Save it

- Into the campaign: `kraken` (Save to Kraken): `into: "open"` writes into the
  image open in Kraken's image window (or the table's map); `into: "new"`
  makes it a new scene on the table. Picture, walls, doors, windows, lights
  and weather all go in.
- For a book (`games/<game>/maps`): `export` with `folder` and `name` writes
  `name.webp` and `name.walls.json` (`{width, height, grid, walls: [{points,
  door, secret, window, closed, type}], lights}`, the shape
  `games/lib/fg.mjs` `imageRecord()` reads) and, unless `portable: false`,
  `name.kraken.zip` (the project with its art, to edit again later: `open`
  with `file`).
- `save` keeps it in Map Studio's own project list (`projects`, then `open`
  with `saved`).

A whole map is usually 40 to 80 calls. Script the calls (or use `kraken_code`
to batch them) when building a big map, so you can rebuild it after a fix.
`scripts/studio-map-cinder-barrow.mjs` in the Kraken repository is a worked
example: an adventure's barrow built end to end from its text.

## The shipped art (309 pictures)

What exists, by theme (names as `library` gives them; `_end` pictures are wall
end caps the Wall tool uses by itself).

**Kraken Map Art**

- Floors (tile): Flagstone, Flagstone cracked / mossy, Cobblestone, Stone tiles,
  Stone tiles ruined, Marble checker, Marble cracked, Sandstone tiles, Dungeon
  stone, Brick floor, Mosaic, Wood planks, Wood planks broken, Old planks,
  Parquet, Cave floor.
- Ground and water (tile): Grass, Dry grass, Dirt, Mud, Gravel, Clay, Sand,
  Beach sand, Snow, Forest floor, Moss, Swamp, Shallow water, Deep water,
  Ocean, Murky water, Ice, Lava.
- Walls (wall art): Stone wall (plain, mossy, ruined), Dungeon wall (plain,
  crumbling), Sandstone, Marble (plain, cracked), Brick (plain, damaged),
  Fieldstone (plain, tumbled), Cave wall (plain, narrow), Ice wall, Wooden wall
  (plain, rotten), Palisade (plain, broken), Timber and plaster, Hedge (plain,
  overgrown, dead), Iron fence and Wooden fence (each also broken).
- Paths (wall art, no line of sight): Dirt road, Muddy track, Gravel path,
  Cobblestone road, Sand path, Stream, River, River rocky, Swamp channel, Lava
  flow, Shoreline, Boardwalk (plain, broken).
- Doors and windows: Door wooden / wooden open / wooden broken / old / iron,
  Double door, Double door iron, Portcullis, Secret door, Window, Window wide,
  Window broken, Arrow slit.
- Lights: Torch, Brazier, Lantern, Candle, Candles, Candelabra, Campfire, and
  spent ones (Torch burnt out, Lantern broken, Candles melted, Brazier tipped
  over, Campfire cold).
- Furniture (67): tables (tavern, round, banquet, laid, dark wood, broken,
  tipped over), chairs, armchair, stools, benches, beds (single, double,
  rotten, blue), chests (plain, open with gold, iron, red, broken open),
  barrels, crates, sacks, bookshelf (and toppled), books scattered, desk (and
  wrecked), wardrobe, throne (and broken), altar (and desecrated), cauldron,
  anvil, weapon rack, well (and ruined), rugs, carpet runners, tapestries,
  fireplace.
- Plants and trees: oak, small oak, pine, dead, palm, autumn, willow, fallen
  tree; bushes (flowering, berry, dead, trampled), fern, flowers, mushrooms,
  reeds, lily pads, grass tuft.
- Shore and sea: crabs, shells, starfish, seaweed, driftwood, anchor, fishing
  net, rowboats (and wrecks), sailboat, ship wrecks, washed-up barrels.
- Terrain and scatter: boulders, rocks, log, stump, bones, skeleton, rubble,
  puddle, broken pottery, blood stain, spider webs.

**Battle Map Forge** (dungeon dressing, larger set pieces)

- Floors: Cavern floor, Stone floor, Cavern limestone, Stronghold ashlar,
  Temple limestone, Worn oak.
- Architecture: stairs (narrow, semicircle, wide), Portcullis, Stone column,
  Broken column, Drain channel, Masonry hearth, Open threshold, Raised dais,
  Ritual platform, Statue pedestal, Wall shrine, Wall tapestry, Wooden bridge,
  Wooden stage.
- Cavern: bone alcove, fungal shelf, mineral seep, root cache, Fungal caps,
  Root bone nest, Stalagmite rings, Web cocoons.
- Temple and tomb: Temple funerary slab, urn ledge, votive plinth, weathered
  relief; Funerary lid, Funerary reliquary, Stone altar top.
- Room sets: Alchemy tabletop, Scholar tabletop, Ritual laboratory apparatus,
  Scriptorium study, Armory floor display, Storage cache, Vestry offering store.
- Furniture and clutter: urn cluster, cupboard, travel chest, chair, armory
  display, hearth, supply and weapon racks; flagstone scatter, iron chain,
  ceramic vessel, rune fragment; mine cart, ore pile, rails, timber brace.

**Added since (Kraken Map Art):** a sci-fi set, a canal city's wet cobbles,
dock planks, quay and soot-brick walls, iron bridge and gondola, barrow
stones, standing stones and a longhouse, coffins, a sarcophagus, an open pit.
**Still missing:** see `missing-assets.md`.

## Style recipes

**Fantasy dungeon or barrow.** Rock fill (`Cave floor`, opacity 0.2) on a
dark background; `Dungeon stone` halls, `Flagstone, cracked` passages and
tombs (dimmed), `Dungeon wall` / `Dungeon wall, crumbling`; `Stone column`,
`Temple funerary slab`, `Altar, desecrated` on a `Raised dais`, `Brazier`
with flickering ember light, `Bones, scattered`, `Spider web, corner`,
`Blood stain`, `Rubble`; night ambient; `myst` smoke where fires burn.

**Natural cave.** Polygons with feather 0.4 to 1 in `Cave floor`, `Gravel`,
`Mud`; `Cave wall` or `Cave wall, narrow` along irregular paths (off-grid is
fine for caves); `Stalagmite rings`, `Fungal caps`, `Cavern mineral seep`,
`Boulder`, `Rocks`; `Deep water` or `Murky water` pools (feathered, opacity
0.7); `glow` lights on fungus.

**Wilderness.** `Grass` or `Forest floor` fill at full opacity; `Dirt road` or
`Stream` as wall art with `los: false` (paths: `library` marks them `path`);
trees (`Tree, oak`, `Tree, pine`) as props on a `trees` layer made last (on
top); `Bush`, `Fern`, `Flowers`, `Log`, `Boulder`; `Campfire` with light;
`sunlight`, `dusk` or `moonlight` ambient; rain in an area.

**Town, tavern, canal city.** `Cobblestone` streets, `Wood planks` and
`Parquet` interiors, `Timber and plaster wall` and `Brick wall`, furniture
(`Table, tavern`, `Table, round`, `Chair`, `Bench`, `Stool`), `Fireplace`, `Barrels`,
`Crates`, `Sacks`. Water: `Deep water` channels, `Boardwalk` as a path. A
canal city: `Wet cobbles`, `Soot brick wall`, `Quay wall` along the water
(update its line-of-sight wall to `type: "invisible"`, so it stops feet but
not eyes), `Dock planks` jetties, `Gondola`, `Iron bridge`
(`scripts/studio-map-counting-house.mjs`).

**Starship, derelict, space station.** Kraken Map Art has a sci-fi set (see
`missing-assets.md`, "Made"): `Hull plating` round the rooms on a near-black
background, `Deck plating` (dimmed to about 0.7), `Deck plating, worn` and
`Grating` floors, `Bulkhead` / `Bulkhead, damaged` / `Hull wall` walls,
`Hatch` and `Airlock door` doors, `Console` (a light source: screens glow),
`Bridge console row`, `Captain's chair`, cryo pods, `Reactor core`, cargo
containers, lockers, bunks, med beds, `Pipes, straight` along walls,
`Wreckage scatter`, `Scorch mark`. `scripts/studio-map-silent-hulk.mjs` is a
worked example. Do not paint a ship from dungeon flagstones.

## Quality rules

- No flat empty floors: every room has props, and floors have some variation
  (a second floor, a feathered patch, a worn path).
- Consistent scale: props at their own size on the grid unless there is a
  reason (`width` 0.5 to 2 squares for furniture).
- Walls exactly on the art: wall art and its line of sight come together
  from `wall`; plain line-of-sight walls only where art already shows a wall
  (columns, rubble, the edge of a pit).
- Doors on wall lines, in gaps, the width of the gap.
- Lights on light-source art, and only there.
- Look at the full-size render before you call it done, and say what you
  checked. Report the files (`render`, `export`) so the user can look too.
