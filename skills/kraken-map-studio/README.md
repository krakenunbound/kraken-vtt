# kraken-map-studio

A skill for AI agents: make battle maps in Kraken VTT's own map maker, Map
Studio, with its `kraken_map_studio` tool and its art packs, instead of
drawing maps by hand.

- `SKILL.md`: the skill (when to use it, the workflow from plan to save, the
  art by theme, style recipes, quality rules).
- `missing-assets.md`: art the shipped packs lack for the games Kraken ships,
  with a prompt for each in the packs' style, to make later.

The tool is in `electron/studio/agentTools.cjs` (the app side) and
`studio/web/agent.js` (the editor side); `npm run studio-tools` checks every
action in the real app, and `scripts/studio-map-cinder-barrow.mjs` is a whole
map built with it.

To use it with Claude Code, copy this folder to `~/.claude/skills/` (or a
project's `.claude/skills/`).
