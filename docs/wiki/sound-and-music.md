# Sound and music

The **Sound** window plays one-shots, ambience loops and music in every player's browser, and each player sets their own volumes. Chat can trigger sound effects, and sounds can be placed on a map. This page covers the Sound window, adding your own sounds, sounds on a map, and the volume commands.

## The Sound window

The GM's Sound window holds:

- **One-shots and effects** for the table.
- **Ambience** loops.
- **Music.**
- **Triggers:** chat triggers play sound effects, such as a sword's hit or a fireball.
- **A scene's own sound.**


The Library also has **Sound Sets**.

Players open the same window (`/sound`) to set their own volumes by kind.

## Adding your own sounds

Put your sounds in `%APPDATA%\kraken-vtt\assets\sounds` (on Linux, `~/.config/kraken-vtt/assets/sounds`), in these folders:

| Folder | For |
|---|---|
| `oneshots` | Single sounds you play by hand. |
| `sfx` | Sound effects. |
| `ambience` | Loops. |
| `music` | Music. |

## Playing from chat

- `/play oneshots/Doors/Wooden Door` (or `/sfx`) plays a sound for the table (GM). Alone, it opens the Sound window.
- `/volume 60` sets this screen's volume; `/volume 30 music` one kind (oneshots, sfx, ambience or music).
- `/dicevolume 60` or `/dicevolume off` sets the dice sounds.

## Sounds on a map

**Scene > Sounds on this map** places a sound from your library in the middle of the view. Each player hears it when their tokens are near, louder nearer, and muffled through walls. You hear what they hear with the eye (player vision preview).

## Turn chimes

Each person can turn the chime on their turn on or off in **Settings > You at the table**. The sci-fi games use a console tone.

## Quick slots

Drag a sound onto a quick slot to play it with a click or its number key.
