// FG line-of-sight shapes ("occluders"): their types and flags, as fgMaps.cjs
// reads them into Kraken's map editor (the reading half of Map Studio's
// occluders.py; names and shapes match it).
//
// A Map Studio wall is one FG occluder: { id, type, points: [x, y, x, y, ...],
// flags: [...] } in map pixels (Y down). FG saves only the flags, so the type
// is a label found from them; the presets below are exactly what FG 5.1.14
// writes when you draw with each type button (checked by drawing each one in
// FG and saving).

"use strict";

// type id -> [FG label, flags FG writes for that type]
const TYPES = {
  wall: ["Wall", []],
  terrain: ["Terrain", ["toggleable", "hidden", "single_sided", "terrain", "allow_move", "closed", "counterclockwise"]],
  door: ["Door", ["toggleable"]],
  secret: ["Toggleable Wall", ["toggleable", "hidden"]],
  window: ["Window", ["toggleable", "allow_vision"]],
  invisible: ["Invisible Wall", ["allow_vision"]],
  illusion: ["Illusionary Wall", ["allow_move"]],
  pit: ["Pit", ["toggleable", "hidden", "single_sided", "pit", "closed", "counterclockwise"]],
  shadow: ["Shadow Caster", ["shadow"]],
};
// Every occluder flag FG reads (Advanced options), in FG's toolbar order.
const FLAGS = ["toggleable", "hidden", "open", "locked", "single_sided", "terrain", "pit", "allow_move", "allow_vision", "closed", "counterclockwise", "shadow"];

function typeFromFlags(flags) {
  const f = new Set(flags);
  if (f.has("pit")) return "pit";
  if (f.has("terrain")) return "terrain";
  if (f.has("shadow")) return "shadow";
  if (f.has("toggleable") && f.has("allow_vision")) return "window";
  if (f.has("toggleable") && f.has("hidden")) return "secret";
  if (f.has("toggleable")) return "door";
  if (f.has("allow_move") && !f.has("allow_vision")) return "illusion";
  if (f.has("allow_vision") && !f.has("allow_move")) return "invisible";
  return "wall";
}

module.exports = { TYPES, FLAGS, typeFromFlags };
