// FG's doors are one shape: a door occluder in an FG module is a closed path
// whose sides arrive as wall lines (fg-<door>-<n>). Opening one side opens
// them all (one door, one state); a player who sees any side of a door is
// sent the whole door. Read from an FG module's map when one is here (B1 In
// Search of the Unknown), else from a made door.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createMapState, geometryReady } = require("../electron/mapState.cjs");
const { createRecordStore } = require("../electron/records.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
await geometryReady;

// A room 600 x 300 with a rectangular door (4 sides, FG's closed door shape) in its middle wall.
const door = [
  [290, 120, 310, 120],
  [310, 120, 310, 180],
  [310, 180, 290, 180],
  [290, 180, 290, 120],
].map(([x1, y1, x2, y2], n) => ({ id: `fg-7-${n}`, x1, y1, x2, y2, sight: 20, light: 20, sound: 20, move: 20, dir: 0, door: 1, ds: 0 }));
const walls = [
  { id: "w-top", x1: 300, y1: 0, x2: 300, y2: 120, sight: 20, light: 20, sound: 20, move: 20, dir: 0, door: 0, ds: 0 },
  { id: "w-bottom", x1: 300, y1: 180, x2: 300, y2: 300, sight: 20, light: 20, sound: 20, move: 20, dir: 0, door: 0, ds: 0 },
  ...door,
];
const scene = { id: "doors", name: "Doors", width: 600, height: 300, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, lights: [], tokens: [], walls };
const records = createRecordStore();
const gm = { role: "dm", name: "GM" };
const player = { role: "player", name: "Ann" };
const map = createMapState({ saved: {}, records });
map.setScene(scene);
map.setSight(true);
const hero = records.create({ type: "character", name: "Hero", owner: "Ann", visibility: "owner", data: {} }, gm);
map.place({ recordId: hero.id, x: 125, y: 150 }, gm);

let view = map.viewFor(player, "");
const sent = view.doors.filter((item) => item.group === "fg-7");
assert(sent.length === 4, `the player is sent the whole door (4 sides): ${JSON.stringify(view.doors.map((item) => item.id))}`);
assert(sent.every((item) => item.state === 0), "closed");
// The player opens it by one side: every side opens.
map.setDoor("fg-7-2", undefined, player);
view = map.viewFor(player, "");
assert(view.doors.filter((item) => item.group === "fg-7").every((item) => item.state === 1), `one click opened all four sides: ${JSON.stringify(view.doors.map((item) => [item.id, item.state]))}`);
// Through the open door the player sees the far side.
const sees = (x, y) => view.vision.some((polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [polygon[i], polygon[i + 1], polygon[j], polygon[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
});
assert(sees(450, 150), "through the open door the far room is seen");
// The GM closes and locks it as one.
map.setDoor("fg-7-0", 2, gm);
assert(map.viewFor(gm, "").doors.filter((item) => item.group === "fg-7").every((item) => item.state === 2), "the GM locked all of it");
let refused = "";
try {
  map.setDoor("fg-7-1", 1, player);
} catch (error) {
  refused = error.message;
}
assert(/locked/.test(refused), `a player cannot open it locked: ${refused}`);
// A lone door line is a door of its own.
assert(map.viewFor(gm, "").doors.every((item) => item.group), "every door has its group");

// An FG module's doors, when one is here.
let fromModule = "";
try {
  const { fgModuleBundle } = require("../electron/importers/fgMaps.cjs");
  const bundle = fgModuleBundle("B1 In Search of the Unknown (C&C)");
  const { unzipSync, strFromU8 } = require("fflate");
  const files = unzipSync(new Uint8Array(bundle.bytes));
  const first = JSON.parse(strFromU8(files["bundle.json"])).adventureData.scenes[0];
  const groups = new Map();
  for (const wall of first.walls.filter((item) => item.door > 0)) {
    const key = /^(fg-.+)-\d+$/.exec(wall._id)?.[1] ?? wall._id;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const shapes = [...groups.values()];
  assert(shapes.length > 0 && shapes.some((sides) => sides >= 3), `B1's doors are shapes of several sides: ${shapes.slice(0, 10)}`);
  fromModule = `; B1's ${first.name}: ${first.walls.filter((item) => item.door > 0).length} door lines are ${shapes.length} doors`;
} catch (error) {
  if (/No module|not found|ENOENT/i.test(error.message)) fromModule = "; (B1 not here)";
  else throw error;
}
console.log(`ok doors: an FG door shape (4 sides) is one door: sent whole to a player who sees it, opened by one click on any side, seen through when open, locked by the GM as one${fromModule}`);
