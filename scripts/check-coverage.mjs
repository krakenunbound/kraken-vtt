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
  accounts: "kraken_accounts",
  "sign-out": "kraken_accounts",
  "level-up": "kraken_level_up",
  "character-improve": "kraken_character_improve",
  "character-mark": "kraken_character_mark",
  cairn: "kraken_cairn",
  fate: "kraken_fate",
  ironsworn: "kraken_ironsworn",
  forged: "kraken_forged",
  clocks: "kraken_clocks",
  "siege-check": "kraken_siege_check",
  ct: "kraken_combat",
  "party-award-xp": "kraken_party_award",
  "party-award": "kraken_party_award",
  "party-distribute": "kraken_party_distribute",
  "party-group": "kraken_party_group_check",
  "party-order": "kraken_party_order",
  "character-edit": "kraken_character_edit",
  starship: "kraken_starship",
  "mgt2-life": "kraken_traveller_lifepath",
  "character-import": "kraken_character_import",
  "class-change": "kraken_class_change",
  "character-drop": "kraken_character_drop",
  prefs: "kraken_dice_settings",
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
  ruler: "kraken_ruler",
  "explored-reset": "kraken_line_of_sight",
  "token-undo": "kraken_token_move",
  "move-approve": "kraken_token_move",
  "map-sound": "kraken_map_sound",
  "map-share": "kraken_map",
  "scene-share": "kraken_map",
  "prep-close": "kraken_image",
  "playtest": "kraken_image",
  draw: "kraken_draw",
  "draw-erase": "kraken_draw",
  "draw-update": "kraken_draw",
  "death-marker": "kraken_death_markers",
  calendar: "kraken_calendar",
  "read-aloud": "kraken_read_aloud",
  "draw-clear": "kraken_draw",
  scene: "kraken_scenes",
  "table-options": "kraken_table_options",
  kick: "kraken_kick",
  bans: "kraken_players",
  presence: "kraken_players",
  ring: "kraken_players",
  "view-pull": "kraken_ping",
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

// Map Studio (studio/web): every button, rail mode, start card and paint tool of
// the editor is one of kraken_map_studio's actions, or is only about the view
// (VIEW_ONLY). A new control needs its action (studio/web/agent.js,
// electron/studio/agentTools.cjs) in the same change.
const STUDIO = {
  // buttons by id
  newBtn: "new", layoutBtn: "generate", demoBtn: "open", projectsBtn: "projects", openBtn: "open", saveProjectBtn: "save",
  saveBtn: "export", portableBtn: "export", closeMapBtn: "tabs", viewCloseBtn: "tabs", undoBtn: "undo", redoBtn: "redo",
  refreshAssets: "library", allAssets: "library", favoriteAssets: "library", recentAssets: "library", subscriptionBtn: "library",
  addAsset: "place", railDelete: "remove", eraseTool: "remove", drawTool: "wall", layoutDice: "generate", layoutGo: "generate",
  closeSave: "save", closeDiscard: "tabs", saveKrakenBtn: "kraken",
  // rail modes
  "mode:view": "map", "mode:layers": "layer", "mode:paint": "place", "mode:fx": "weather", "mode:los": "wall", "mode:regions": "region",
  "mode:lighting": "light", "mode:play": "render", "mode:grid": "grid",
  // start cards
  "start:generate": "generate", "start:blank": "new", "start:project": "projects", "start:file": "open",
  // paint tools
  "paint:stamp": "place", "paint:texture": "paint", "paint:scatter": "scatter", "paint:wall": "wall",
};
// Controls that only change what the GM sees (zoom, panels, dialogs closing), never the map.
const VIEW_ONLY = new Set(["libraryBtn", "railFit", "panTool", "closeProjects", "closeSubscription", "closeLayout", "pictureCancel", "closeCancel", "mode:vision", "favoriteCurrent"]);
// Editor controls kraken_map_studio does not do yet (printed on every run, so they are not forgotten).
const NOT_YET = new Map([
  ["artBtn", "add your own art to the library"], ["pictureCreate", "a new map from a picture on this computer"], ["start:picture", "a new map from a picture"],
  ["duplicateBtn", "duplicate the selection"], ["groupBtn", "group"], ["ungroupBtn", "ungroup"], ["lockBtn", "lock art"], ["alignBtn", "align tops"],
  ["prefabSaveBtn", "save an assembly"], ["prefabPlaceBtn", "place an assembly"],
]);
const studioHtml = readFileSync(new URL("../studio/web/index.html", import.meta.url), "utf8");
const studioControls = new Set([
  ...[...studioHtml.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((match) => match[1]),
  ...[...studioHtml.matchAll(/data-mode="([^"]+)"/g)].map((match) => `mode:${match[1]}`),
  ...[...studioHtml.matchAll(/data-start="([^"]+)"/g)].map((match) => `start:${match[1]}`),
  ...[...(studioHtml.match(/<select id="paintTool">([\s\S]*?)<\/select>/)?.[1] ?? "").matchAll(/value="([^"]+)"/g)].map((match) => `paint:${match[1]}`),
  "saveKrakenBtn",
]);
const studioActions = new Set(listTools().find((tool) => tool.name === "kraken_map_studio")?.inputSchema.properties.action.enum ?? []);
for (const control of studioControls) {
  if (VIEW_ONLY.has(control) || NOT_YET.has(control)) continue;
  if (!STUDIO[control]) problems.push(`Map Studio's "${control}" has no kraken_map_studio action`);
  else if (!studioActions.has(STUDIO[control])) problems.push(`Map Studio's "${control}" maps to action ${STUDIO[control]}, which kraken_map_studio does not have`);
}

console.log(`Map Studio controls with no kraken_map_studio action yet: ${[...NOT_YET].filter(([control]) => studioControls.has(control)).map(([, what]) => what).join("; ")}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`COVERAGE_OK ${handled.size} table messages, ${tracker.size} tracker actions and ${studioControls.size} Map Studio controls, ${tools.size} tools`);
