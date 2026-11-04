// Kraken is built for an agent from the ground up: everything a GM or player
// can do at the table is also an agent tool. This check reads every message
// the table server answers (and every combat tracker action) and fails if one
// has no tool here, or names a tool that does not exist. A new action needs
// its tool in the same change. AGENT.md has the full map, interface included.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listTools } = require("../electron/agent/tools.cjs");

// Table message -> the tool that does the same.
const MESSAGES = {
  chat: "kraken_chat_send",
  "chat-clear": "kraken_chat_log",
  quickslots: "kraken_quickslots",
  "book-activate": "kraken_books",
  "book-sound": "kraken_books",
  "book-share": "kraken_books",
  "image-share": "kraken_books",
  "image-unshare": "kraken_books",
  roll: "kraken_roll",
  op: "kraken_record_update",
  "build-character": "kraken_build_character",
  "take-character": "kraken_characters",
  "level-up": "kraken_level_up",
  "siege-check": "kraken_siege_check",
  ct: "kraken_combat",
  "party-award-xp": "kraken_party_award",
  "party-award": "kraken_party_award",
  "party-distribute": "kraken_party_distribute",
  "party-group": "kraken_party_group_check",
  "party-order": "kraken_party_order",
  "character-edit": "kraken_character_edit",
  "character-import": "kraken_character_import",
  "class-change": "kraken_class_change",
  library: "kraken_library",
  "token-place": "kraken_token_place",
  "token-move": "kraken_token_move",
  "token-update": "kraken_token_update",
  "token-remove": "kraken_token_remove",
  door: "kraken_door",
  sight: "kraken_line_of_sight",
  lock: "kraken_line_of_sight",
  "scene-settings": "kraken_scene_settings",
  "light-place": "kraken_light",
  "light-update": "kraken_light",
  "light-remove": "kraken_light",
  wall: "kraken_wall",
  "map-undo": "kraken_map_undo",
  mask: "kraken_mask",
  label: "kraken_label",
  "map-group": "kraken_map_group",
  fx: "kraken_fx",
  tile: "kraken_tile",
  ping: "kraken_ping",
  draw: "kraken_draw",
  "draw-erase": "kraken_draw",
  "draw-clear": "kraken_draw",
  scene: "kraken_scenes",
  "table-options": "kraken_table_options",
  kick: "kraken_kick",
  vote: "kraken_vote",
  "vote-cast": "kraken_vote",
  save: "kraken_save",
  "sound-play": "kraken_sound",
  "sound-stop": "kraken_sound",
  ambience: "kraken_sound",
  music: "kraken_sound",
  "sound-triggers": "kraken_sound",
  "scene-sound": "kraken_sound",
};
// Messages that are the connection itself, not something a person does.
const PLUMBING = new Set(["join"]);

const source = readFileSync(new URL("../electron/tableServer.cjs", import.meta.url), "utf8");
const handled = new Set([...source.matchAll(/msg\.type === "([a-z-]+)"/g)].map((match) => match[1]));
for (const list of source.matchAll(/\[((?:"[a-z-]+",?\s*)+)\]\.includes\(msg\.type\)/g)) {
  for (const name of list[1].matchAll(/"([a-z-]+)"/g)) handled.add(name[1]);
}
const tools = new Set(listTools().map((tool) => tool.name));
const problems = [];
for (const type of handled) {
  if (PLUMBING.has(type)) continue;
  if (!MESSAGES[type]) problems.push(`table message "${type}" has no agent tool`);
}
for (const [type, tool] of Object.entries(MESSAGES)) if (!tools.has(tool)) problems.push(`"${type}" maps to ${tool}, which does not exist`);

// Every combat tracker action the table answers is one of kraken_combat's.
const tracker = new Set([...source.matchAll(/case "([a-z-]+)":/g)].map((match) => match[1]));
const combatActions = new Set(listTools().find((tool) => tool.name === "kraken_combat").inputSchema.properties.action.enum);
for (const action of tracker) if (!combatActions.has(action)) problems.push(`tracker action "${action}" is missing from kraken_combat`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`COVERAGE_OK ${handled.size} table messages and ${tracker.size} tracker actions, ${tools.size} tools`);
