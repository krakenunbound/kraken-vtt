# Targeting and effects

Attacks, spells and healing land on whoever is targeted. This page covers targeting from the map and the tracker, range lines, area templates, conditions and other effects, damage cards, and action links in text. It brings together the best of Fantasy Grounds' and Foundry's ways of doing it.

## Targeting

- **Click a creature's token** on your turn to target it (players), or use the map toolbar's **Targeting**.
- **Target mode** (map toolbar): click a creature, or drag a box around several.
- **Target all friendlies** or **all foes**, and **clear** friendly, enemy or all targets. These act for the selected creature, or for your own.
- **Ctrl+click** a token, or a tracker row, to target it.
- The GM sees everyone's aim: a ring per targeter, in that player's colour.

**Settings > Combat > Clear targets** decides when a creature's targets clear: never (as FG), after a spell or an attack's damage, or at the end of its turn.

### Range lines

A creature targeting another gets an arrow in its token's colour (a player's own) with the distance between them, by the table's measuring rule (height counts; big creatures measure from their edges). When the creature's record gives its weapons' and spells' ranges, the label also says **long range** or **out of range**.

## Area templates

Area spells place their templates: Fireball's 20-foot sphere, Burning Hands' cone, Lightning Bolt's line, Thunderwave's cube, Spirit Guardians around its caster. Each is sized for the grid from the spell and shown to everyone in the caster's colour.

- Everyone inside is targeted. Walls stop it.
- The spell lands by its words: damage on all inside, half on a save; Sleep only on foes; Bless only on allies, three at most.
- The **Area template** tool lays one out by hand: a circle, cone, line or square, dragged out.
- Right-click a template to remove it. The GM can clear them all.

## Effects and conditions

- **Conditions and buffs show on tokens:** Zzz over sleepers, flames, frost, stone, trembling fear, a blessing's glow and more.
- A **buff bar** on sheets and tracker rows lists what is on a creature.
- **The Effects window** lists conditions, buffs, lights, and your own effects. Drag an entry onto a token, a tracker row, a sheet or a party row to apply it.
- Durations count down in rounds and in game time.
- Effects can be taken off, changed, put out and relit (for lights).

**Settings > Combat > Token effects** draws them animated, as icons only, or not at all. Motion stops anyway where the computer asks for reduced motion.

### Lights as effects

A torch dropped on a token lights the map around it, moves with it, shows as glow to players, burns an hour of game time, warns, and goes out. It can be put out and lit again.

## Damage cards

Each hit posts a card in chat: each creature hit, what it took after saves and resistances, and buttons to halve, double, undo or heal it (x0, x½, x1, x2, heal).

- **Settings > Combat > Apply damage:** damage and healing land as the roll does (FG), or wait on the card's buttons (Foundry). Either way the card's buttons change what a creature took.
- **Chat rolls dragged onto a creature apply there:** damage by type, healing, an attack against its AC, or an effect line.
- Damage and healing float off the token as numbers, red down and green up.

## Action links in text

Books, story, records and notes turn rules text into chips you click:

- a check, save or skill against a DC (from Foundry's markup such as `[[/check dex 15]]`, or from a book's own words such as "DC 15 Dexterity saving throw");
- damage and healing;
- an XP award;
- a condition (`&Reference[prone]`).

A player's click rolls their own character's check. The GM's click asks every player for theirs, with a card in chat. The same rolls work from chat: `/check`, `/skill`, `/save` and `/award` (see [Dice and chat](dice-and-chat.md)).

## Spells in the older games

D&D 3.5E and AD&D 2E cast spells from their books' words: slots, saves, damage by caster level, effects.
