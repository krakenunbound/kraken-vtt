# Hands-on audit: Fantasy Grounds and Foundry, and Kraken against both

Started 2026-11-15. Last night's audit ([feature-parity.md](feature-parity.md)) was
read from FG's and Foundry's source and covered maps, records, dice/chat/combat
and the session; nearly all of its gaps are built. This one uses both programs
(Foundry v14.369 with dnd5e 6.1.0 in a scratch world "Kraken Audit 5E"; FG
CoreRPG/5E, its options, record types and slash commands read through the
Kraken Agent Bridge) and covers everything else. For each feature: who does it
better, whether Kraken has it, and what Kraken does about it.

Verdicts: **Build** (missing: build the better of the two), **Better** (Kraken
has it but one of them does it better: improve), **Same**, **Ahead** (Kraken
already beats both).

## Seen in Foundry, hands on

- **First-run setup card.** A new dnd5e world opens a Welcome card with the
  settings that shape a campaign: rules version (2014/2024), calendar, Bastions,
  Renown, metric units. FG has none (its options window is long and unsorted).
  Foundry better. Kraken: none (the "first-run GM checklist" was on the Later list).
- **Character sheet.** A Favorites panel (drag weapons and features into a
  quick-use list showing uses 1/1 and ammunition x20); passive scores beside
  every skill; inventory filter, sort and group; a death-saves tray that slides
  out; play/edit mode toggle.
- **Duplicate creatures are not numbered.** Two goblins are both "Goblin
  Warrior" on the tracker. FG and Kraken number them. Kraken ahead.
- **Turn marker.** An animated ring around the token whose turn it is (also FG's
  initiative indicator option).
- **Attack dialog.** One small window: situational bonus, attack mode
  (one-handed/two-handed for versatile weapons), roll mode, and Advantage /
  Normal / Disadvantage buttons. The usage card keeps its Attack and Damage
  buttons, so a missed damage roll can be made later; the attack card lists each
  target with the result.
- **Action links in text (dnd5e enrichers).** In any journal or item text,
  `[[/check dex 15]]`, `[[/save wis 13]]`, `[[/skill perception 12]]`,
  `[[/damage 2d6 fire]]`, `[[/heal 2d4]]`, `[[/attack +5]]`, `[[/award 50xp]]`,
  `[[/concentration]]` and `&Reference[prone]` become buttons: a player rolls
  their own character's check against the DC; the GM's **Request roll** posts a
  card asking every player to roll it; damage rolls with Apply; Award gives XP;
  a condition reference shows the rule with a button that applies the condition.
  FG: plain text. Foundry far better. Kraken: inline dice only. **Build.**
- **Compendium browser.** One window over every book: tabs for classes,
  subclasses, species, feats, backgrounds, items, spells, monsters, vehicles;
  filters (type, price range, rarity, attunement, weapon mastery, properties,
  source) and search; drag a result onto a sheet. FG merges every open book in
  its sidebar lists, with fewer filters. Foundry better.
- **Journals.** Page types text, image, PDF, video (and dnd5e map, rule, class,
  spell list); categories; a table of contents from headings; search inside an
  entry; previous/next page; Show Players; Markdown or HTML.
- **Playlists.** Channels (music, environment, interface) with separate
  volumes; modes sequential, shuffle, simultaneous; fade in/out; repeat per
  sound; a sound or playlist linked to a scene starts with it.
- **Cards.** Decks, hands and piles: shuffle, deal, draw, pass, play, reset;
  poker deck presets.
- **Ownership and roles.** Per document per user: none, limited (name and
  picture only), observer, owner. Roles player, trusted player, assistant GM,
  GM, with a permission matrix (who may create tokens, drawings, notes, open
  doors, browse or upload files, whisper, ping, show their cursor and ruler,
  write script macros).
- **Token configuration.** Tabs identity, appearance, vision, light, resources
  (two bars from any attribute); prototype tokens on the actor; linked tokens for
  characters, unlinked for monsters.

## What to build, in order

Ranked by how soon a game night trips over it. Each ships with its agent tool and a test.

**Built 2026-11-15 (branch bugfix-rough-edges, unreleased):** action links in text (1); scrolling
combat text (3); chat bubbles over tokens (4); roll initiative every round, stop at round start (5;
the GM already sees every whisper); 5E Inspiration and NPC hit points as listed, rolled or maximum
for every game (6); the GM's Ctrl+A, Ctrl+C / Ctrl+V of tokens, keyboard pan and zoom, number-pad
diagonals (7). Not yet: manual dice entry (2: the host rolls synchronously, so it must learn to wait
for a player's typed dice), 5E attunement slots, massive damage, pan to the speaker (off by default
in Foundry too), pasting a token's size and hidden state.

**Asked by the GM (2026-11-15): range lines.** A creature targeting another gets an arrow in its
token's colour (a player's own) with the distance; long range and out of range are named when its
record gives its weapons' and spells' ranges. FG draws no range at all; Foundry shows a target pip
and leaves measuring to the ruler. Built (src/table/MapView.tsx, shared/map/ranges.mjs).

**Tier 1: felt at the table every session**
1. **Action links in text** (Foundry's enrichers): `[[/check dex 15]]`, saves, skills, damage, heal, award XP, condition references, with the GM's Request roll card. For every game, read from its manifest's checks and saves.
2. **Manual dice entry** (#89, FG and Foundry): players with real dice type what they rolled.
3. **Scrolling combat text** (#41): damage and healing float off the token.
4. **Chat bubbles over tokens and pan to the speaker** (#42, #43).
5. **Combat options** #115 roll initiative each round, #116 stop at round start; #90 show whispers and GM rolls to the GM.
6. **5E sheet**: attunement slots (#58), Inspiration (#59); NPC hit points rolled or average (#64); massive damage (#65).
7. **GM map convenience**: copy/paste tokens and objects (#20), select all and front/back keys (#21), keyboard pan and zoom (#24), diagonal key moves (#22).

**Tier 2: felt within a few sessions**
8. Playlists (#86, = S9): channels, modes, fade, synced for late joiners.
9. Limited view (#74): players see a creature's or handout's name and picture only.
10. Two token bars from any attribute (#36), prototype token settings kept on the record (#39), lock rotation and transparency (#38).
11. Card decks (#85).
12. Keybindings editor (#99, = S7).
13. Level-up choices (#49): ability score improvement, subclass, feats, per game.
14. Compendium browser filters (#62).
15. Journal pages: PDF and video (#71); first-run setup card.

**Tier 3: big systems**
16. Scene levels (#1). 17. 5E item activities, summoning, wild shape, enchantment, bastions, item templates (#50-53, #60, #68). 18. Permissions matrix and assistant GM (#96, #97). 19. Localisation (#100).

Not planned: built-in audio/video chat (#104): Discord covers it.

## Seen in Fantasy Grounds, through the bridge (5E campaign "5th Edition One-Shots")

- **The desktop.** The chat, modifier stack, dice tower and dice tray are panels on the desktop, and the
  character list runs along the top. Kraken has all of them; its portraits along the top now light up
  for whoever's turn it is and can sort into initiative order (the GM's option), which FG's don't.
- **Map panels.** An image can be sent to the desktop's back panel (behind every window), maximised, or
  shown full screen. Foundry's map is always the background. Kraken had map windows only: **built**, the
  map button puts it behind every window, filling the table area (per screen).
- **Modifiers library** (sidebar). Saved, named modifiers ("Bless +1d4") dragged onto the modifier stack.
  Kraken: each game's fixed chips and typed numbers, no saved custom ones. **Build** (tier 2).
- **Manual Dice Rolls** (sidebar). With the option on, rolls wait in this window for the player to type
  what the real dice showed. This is the model for Kraken's manual dice: a queue the roll waits in, not a
  host that stops. **Build** (tier 1, item 2).
- **Sound: Context** (sidebar). FG's sound triggers; Kraken has chat-triggered sounds and sound sets.
- **Options.** Every option was checked against Kraken (the table above, numbers 89 to 118): roll
  initiative every round, stop at round start and NPC hit points are built today; FG's whisper and GM-roll
  display options are covered by Kraken's GM seeing every whisper and its per-seat roll modes.

## Kraken against all 118 (code check, 2026-11-15)

Has 37, Partial 40, Missing 41.

| # | Feature (short) | Kraken | Evidence or what is missing |
|---|---|---|---|
| 1 | Scene levels / elevation floors | Missing | No scene levels or change-level region; only per-token elevation |
| 2 | Scene navigation strip | Partial | Scene dropdown in scene bar (src/App.tsx:563); no strip, nav name or order |
| 3 | Scene thumbnails | Missing | No scene thumbnails |
| 4 | Scene initial view | Partial | Camera remembered per scene in memory only (src/table/MapView.tsx:75); no saved initial view |
| 5 | Scene transition animation | Missing | Only a title card (src/ui/SessionTools.tsx:133) |
| 6 | Scene padding | Partial | padding used on imported Foundry scenes (shared/map/geometry.mjs:9); no GM setting |
| 7 | Scene linked sound | Has | kraken_sound scene (electron/agent/tools.cjs:1020) |
| 8 | Scene linked journal | Missing | No scene-to-journal link |
| 9 | Weather per scene / region | Has | WEATHER types per scene (electron/mapState.cjs:257,280); FX layers with painted masks (kraken_fx) |
| 10 | Environment / darkness / day-night | Partial | Scene darkness 0..1 (mapState.cjs:262); no global light or animated transition |
| 11 | Draw text, freehand, polygons | Has | Shapes free/line/arrow/rect/ellipse/circle/cone/poly (mapState.cjs:311); text labels (mapState.cjs:205) |
| 12 | Drawing snap and palette defaults | Partial | Colour and width pickers (MapView.tsx:2642); no drawing grid snap, no per-tool defaults |
| 13 | Tile library with search | Partial | Tile library (electron/backend.cjs:261, kraken_tile library); no search or browser |
| 14 | Tile occlusion | Has | Overhead tiles fade under own token (src/table/MapView.tsx:828-847) |
| 15 | Close all doors | Has | electron/mapState.cjs:1969, map editor button |
| 16 | Wall types invisible/ethereal | Has | electron/mapState.cjs:171 |
| 17 | Ambient sounds | Has | cleanMapSound radius, wall muffling (mapState.cjs:513; tools.cjs:2115; src/table/MapSounds.tsx) |
| 18 | Light animations/colour/negative | Partial | Animation none/flicker/pulse/flash/torch only (tools.cjs:1687); colour and magical darkness yes; not 23 types |
| 19 | Map notes with icons | Has | Labels with pin icons, link, hidden flag (mapState.cjs:205-232) |
| 20 | Copy/paste objects across scenes | Missing | No object clipboard |
| 21 | Select all / delete / z-order keys | Partial | Delete key for tokens/walls (MapView.tsx:662,1062); no select-all or bring-to-front keys (tile list order only) |
| 22 | Keyboard token movement | Partial | Arrow keys step (MapView.tsx:656); no numpad or diagonals |
| 23 | Elevation up/down by key | Partial | Alt+wheel only (MapView.tsx:604); no key |
| 24 | Keyboard pan and zoom | Missing | No pan/zoom keys in MapView key handler |
| 25 | Region behaviours | Partial | Region kinds trap/pit/difficult/teleport only (mapState.cjs:482); no macro, effect, darkness, scrolling text |
| 26 | Region shapes | Partial | Polygon only (cleanRegion mapState.cjs:483); no emanation, ring, cone, line, holes |
| 27 | Ping / pull / live cursors | Partial | Ping, pull view, shared ruler done (tableServer.cjs:2713); no live cursors |
| 28 | Movement actions (walk/fly/swim...) | Missing | No movement action types |
| 29 | Movement history / distance | Has | Move path this turn and total (mapState.cjs:1038; src/table/MovePlay.tsx) |
| 30 | Token drag vision | Missing | Sight updates on drop, no live preview while dragging |
| 31 | Party vision and move together | Partial | GM moves picked groups (MapView.tsx:2105); players see by their own tokens, no shared party vision |
| 32 | Per-token fog of war | Missing | Explored fog is per player and scene only |
| 33 | Token auto-scale to grid | Has | Tokens fill 80% of space (MapView.tsx:80) |
| 34 | Turn marker on token | Has | token-active class (MapView.tsx:2079, mapState.cjs:1066) |
| 35 | Dynamic token rings | Partial | Disc ring coloured by owner/faction (mapState.cjs:1061); no subject-art ring |
| 36 | Token bars | Partial | One health bar/dot/numbers (src/table/TokenBadges.tsx); no two attribute bars |
| 37 | Token disposition colour | Has | FACTION_COLOR border (mapState.cjs:29,1061); no secret disposition |
| 38 | Token lock rotation / alpha / shape | Missing | Only facing and hidden |
| 39 | Prototype token | Partial | Token art taken from record (mapState.cjs:1085); no saved token settings |
| 40 | Linked vs unlinked tokens | Has | Character tokens use sheet, NPCs get own tracker entry (MapView.tsx:2324) |
| 41 | Scrolling combat text | Missing | No floating damage numbers |
| 42 | Chat bubbles over tokens | Missing | Only read-aloud bubble (src/books/ReadAloudBubble.tsx) |
| 43 | Pan to speaking token | Missing | Tracker click pans only (src/combat/CombatTracker.tsx:23) |
| 44 | Hover highlight of objects | Missing | No Alt highlight |
| 45 | Grid alignment tool | Partial | Grid size and offset fields (MapEditor.tsx:370, mapState.cjs:266); no drag-to-fit tool |
| 46 | Template types | Partial | circle/cone/line/square plus attach emanation (mapState.cjs:89); no ring |
| 47 | Actor types | Has | Generic record types; characters, NPCs, starships (tools.cjs:835), party sheet, encounters, clock factions |
| 48 | Item types incl. container, class, feat | Has | Records.tsx:21-45 lists; containers bookkeeping.cjs:362 |
| 49 | Character advancement | Partial | kraken_level_up rolls HP/proficiency (electron/dnd5e.cjs:55); no ASI/subclass/item choice flow |
| 50 | Item activities | Missing | No multi-activity items |
| 51 | Summoning | Missing | No summon feature |
| 52 | Transformation / wild shape | Missing | No polymorph feature |
| 53 | Item enchantment | Missing | No enchant feature |
| 54 | Active effects | Has | FG-style effects with durations/components (shared/actions/effects.mjs; kraken_effects tools.cjs:2031); not arbitrary-field changes |
| 55 | Status effects list | Has | About 30 conditions (shared/actions/effects.mjs:17) |
| 56 | Concentration | Has | concentrationCheck on damage (electron/combat.cjs:1129) |
| 57 | Exhaustion | Has | kraken_bookkeeping exhaustion (tools.cjs:554) |
| 58 | Attunement | Missing | No attunement slots |
| 59 | Inspiration | Missing | No inspiration |
| 60 | Bastions | Missing | No bastions |
| 61 | Spell lists / preparation | Partial | Wizard counts prepared (shared/dnd5e/wizard.mjs:336); no prepare toggling on sheet |
| 62 | Compendium browser filters | Partial | Lists by kind and category (src/books/Records.tsx); no filter by level/school/CR/source |
| 63 | Sheet play/edit toggle | Partial | Record windows have pencil lock (RecordEditor); character sheets edit directly |
| 64 | NPC HP rolled or average | Partial | Hit dice rolled (combat.cjs:2868); no average option |
| 65 | Massive damage / system shock | Missing | No such option |
| 66 | Death saves / stabilise | Has | electron/combat.cjs:31, 2700 |
| 67 | Export/import characters | Has | kraken_character_export (tools.cjs:974), import |
| 68 | Item templates (+1 longsword) | Missing | No template-from-base item |
| 69 | Wound categories | Has | Healthy/wounded status (combat.cjs:739) |
| 70 | Vehicles | Has | Starship records, sheet, token (tools.cjs:835) |
| 71 | Journal page types | Partial | Story pages text/image/book page (contentTools.cjs:28); no PDF/video/map pages |
| 72 | Journal categories and order | Has | chapter and order (contentTools.cjs:34-35) |
| 73 | Ownership per document per user | Has | visibility gm/owner/all/list of names (electron/records.cjs:14) |
| 74 | Limited view | Missing | No limited (name/picture only) level |
| 75 | Folders, colours, sort | Partial | Category grouping (Records.tsx:143-180); no colours or user folders |
| 76 | Show image/journal to players | Has | kraken_books show with to (tools.cjs:719) |
| 77 | Adventure packaged import | Has | kraken_import_fg_module (tools.cjs:242), kraken_open_adventure |
| 78 | Compendium packs | Has | .kpack packs (kraken_packs tools.cjs:2414) |
| 79 | Story templates | Partial | Story pages like FG template (contentTools.cjs:28); templates as records are todo |
| 80 | Locations | Missing | todo.md lists it; only map pins with links |
| 81 | Sound sets | Has | Sound Sets window (src/ui/Desktop.tsx:342) |
| 82 | Effects library records | Has | Effects window (tools.cjs:2031) |
| 83 | Modifiers library records | Has | kraken_modifiers (electron/agent/diceTools.cjs:17) |
| 84 | Skills as records | Has | Skills list (Records.tsx:30) |
| 85 | Card decks | Missing | Only ability cards; no decks, shuffle, deal |
| 86 | Playlists | Partial | Music/ambience folders (kraken_sound); no playlist modes or sync (todo.md) |
| 87 | Macros and hotbar | Partial | Ten quick slots with dice/chat macros (tools.cjs:817); no 5 pages or script macros |
| 88 | Dice modifiers | Partial | kh/kl/dh/dl/rr/xo/cs/cf/ms/explode (electron/dice.cjs:53); no even/odd |
| 89 | Manual roll entry | Missing | No manual dice entry |
| 90 | Show whispers/GM rolls option | Missing | No such option |
| 91 | GM voice = active combatant | Missing | Speak-as is manual (ChatDock.tsx:536) |
| 92 | Limit rolls to chat window | Partial | Dice window 3D settings; no chat-only roll-display option found |
| 93 | Toast notifications | Partial | Turn bell and banner (Desktop.tsx:552); no combat toasts |
| 94 | Chat themes / collapsed cards | Missing | None found |
| 95 | Focus chat key | Missing | None found |
| 96 | User permissions matrix | Partial | Only playerEffects option (tools.cjs:1472); no per-action permissions |
| 97 | User roles | Partial | Player and GM only; no trusted/assistant GM (todo.md) |
| 98 | Player config: character, colour | Has | Character Selection (tools.cjs:167), colour in Settings (Settings.tsx:23) |
| 99 | Keybindings editor | Missing | todo.md: rebindable shortcuts not built |
| 100 | Localisation | Missing | No i18n |
| 101 | Performance mode / fps | Missing | Only /scaleui |
| 102 | Photosensitivity mode | Partial | prefers-reduced-motion honoured (TokenFx.tsx:7); no dedicated setting |
| 103 | Restore windows on start | Partial | Window places remembered (Windows.tsx:85); open set not restored |
| 104 | Built-in A/V chat | Missing | None found |
| 105 | Additional fonts | Missing | Fixed map font list (mapState.cjs FONTS) |
| 106 | Default sheets per type | Missing | None found |
| 107 | Module/add-on install | Partial | FG module and pack activation, app updater (tools.cjs:2251); no module/system install |
| 108 | Metric units | Has | Scene grid units editable (mapState.cjs:269) |
| 109 | Control hints / toolclips | Partial | title tooltips; no video toolclips |
| 110 | Editor autosave | Has | Save on blur (RichText.tsx:215, Notes.tsx:121) |
| 111 | Calendar | Has | kraken_calendar (tools.cjs:1611) |
| 112 | Party sheet visibility options | Missing | No PSMN/PSIN-style options |
| 113 | Tracker options for players | Partial | Health options (tools.cjs:1478-1480), skipDead; no player-order toggle or list size |
| 114 | Combatant groups | Partial | initGroup by kind shares initiative (combat.cjs:2976); no group records |
| 115 | Roll initiative each round | Missing | None found |
| 116 | Stop at round start | Missing | None found |
| 117 | Fumble/crit tables | Has | KrakenKrits (combat.cjs:21,75) |
| 118 | Remove effect on miss | Missing | No such option |
