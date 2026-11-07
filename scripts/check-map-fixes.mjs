// Map and vision fixes, on the host's map state alone (no Electron):
// a closed room never leaks sight through its corners; a player cannot
// teleport by taking their token off and dropping it elsewhere, nor place or
// remove it while the GM has locked movement; a hidden token's light and an
// unseen room's light never reach a player; paint under the mask stays with
// the GM; undo keeps door states and group visibility.
import "./loopback.mjs";
import { createRequire } from "node:module";
import * as geometry from "../shared/map/geometry.mjs";

const require = createRequire(import.meta.url);
const { createMapState, geometryReady } = require("../electron/mapState.cjs");
const { createRecordStore } = require("../electron/records.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function refused(fn, pattern, message) {
  let error = "";
  try {
    fn();
  } catch (caught) {
    error = caught.message;
  }
  assert(error && (!pattern || pattern.test(error)), `${message}: ${error || "it was allowed"}`);
}
await geometryReady;

// --- a closed room never leaks ---------------------------------------------------
// Irregular rooms, corners rounded to 0.1 as walls are stored, a few sides
// and many (over 120 walls: the ray grid), viewers at random spots inside:
// every point of the view lies in the room (within the 1 px rounding).
{
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const round = (n) => Math.round(n * 10) / 10;
  let viewers = 0;
  for (let room = 0; room < 60; room += 1) {
    const sides = room % 3 === 0 ? 130 + Math.floor(rand() * 60) : 4 + Math.floor(rand() * 10);
    const corners = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * Math.PI * 2;
      const reach = 300 + rand() * 200;
      corners.push([round(1000 + Math.cos(angle) * reach), round(1000 + Math.sin(angle) * reach)]);
    }
    const walls = corners.map(([x1, y1], i) => ({ id: `w${i}`, x1, y1, x2: corners[(i + 1) % sides][0], y2: corners[(i + 1) % sides][1], sight: 20, light: 20, move: 20 }));
    const outline = corners.flat();
    for (let k = 0; k < 60; k += 1) {
      const origin = { x: round(700 + rand() * 600), y: round(700 + rand() * 600) };
      if (!geometry.pointInPolygon(origin.x, origin.y, outline)) continue;
      viewers += 1;
      for (const [radius, cone] of [[0, null], [250, null], [0, { angle: 90, from: rand() * 6 }]]) {
        const view = geometry.visibilityPolygon(origin, walls, {}, { x: 0, y: 0, width: 2000, height: 2000 }, 1, 0, "sight", radius, cone);
        for (let i = 0; i < view.length; i += 2) {
          assert(geometry.seen(view[i], view[i + 1], [outline], 1.5), `room ${room} (${sides} walls) leaks from ${origin.x},${origin.y} to ${view[i]},${view[i + 1]}${cone ? " (a cone)" : radius ? " (a light)" : ""}`);
        }
      }
    }
  }
  assert(viewers > 1500, `enough viewers tried: ${viewers}`);
  console.log(`ok a closed room never leaks (${viewers} viewers)`);
}

// --- the table ---------------------------------------------------------------
// Two rooms 300 x 300 side by side, a wall between them with a door; the
// left room has the party, the right room a light.
const wall = (id, x1, y1, x2, y2, extra = {}) => ({ id, x1, y1, x2, y2, sight: 20, light: 20, sound: 20, move: 20, dir: 0, door: 0, ds: 0, ...extra });
const scene = {
  id: "rooms",
  name: "Rooms",
  width: 600,
  height: 300,
  padding: 0,
  backgroundColor: "#000",
  grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" },
  lights: [],
  tokens: [],
  walls: [wall("mid-top", 300, 0, 300, 100), wall("door", 300, 100, 300, 150, { door: 1 }), wall("mid-bottom", 300, 150, 300, 300)],
};
const records = createRecordStore();
const gm = { role: "dm", name: "GM" };
const ann = { role: "player", name: "Ann" };
const map = createMapState({ saved: {}, records });
map.setScene(scene);
map.setSight(true);
const hero = records.create({ type: "character", name: "Hero", owner: "Ann", visibility: "owner", data: {} }, gm);

// --- placing and removing ------------------------------------------------------
{
  // The first time, a player drops their character anywhere on the map (FG).
  refused(() => map.place({ recordId: hero.id, x: 5000, y: 125 }, ann), /on the map/, "a player places on the map only");
  const first = map.place({ recordId: hero.id, x: 75, y: 125 }, ann);
  assert(first.x === 75 && first.y === 125, `placed where dropped: ${first.x},${first.y}`);
  // Locked: no taking it off, no putting it on.
  map.setLocked(true);
  refused(() => map.remove(first.id, ann), /locked/, "a player cannot remove their token while movement is locked");
  map.setLocked(false);
  // Off and back on somewhere they never went: refused (the GM puts it back).
  map.remove(first.id, ann);
  refused(() => map.place({ recordId: hero.id, x: 475, y: 125 }, ann), /GM/, "a player cannot teleport by taking their token off and dropping it in the closed room");
  refused(() => map.place({ recordId: hero.id, x: 75, y: 125 }, ann), /GM/, "not even back where it was: the GM places it again");
  map.setLocked(true);
  refused(() => map.place({ recordId: hero.id, x: 75, y: 125 }, ann), /locked/, "a player cannot place while movement is locked");
  map.setLocked(false);
  // The GM puts it back; with a party token on the map, another character joins only where the party sees.
  map.place({ recordId: hero.id, x: 75, y: 125 }, gm);
  const scout = records.create({ type: "character", name: "Scout", owner: "Ann", visibility: "owner", data: {} }, gm);
  refused(() => map.place({ recordId: scout.id, x: 475, y: 125 }, ann), /party can see/, "a new character cannot appear behind a closed door");
  const joined = map.place({ recordId: scout.id, x: 175, y: 225 }, ann);
  assert(joined.x === 175 && joined.y === 225, "a new character joins where the party sees");
  // The GM is not bound by any of it.
  const orc = map.place({ name: "Orc", x: 475, y: 225, faction: "foe" }, gm);
  assert(orc.x === 475, "the GM places anywhere");
  console.log("ok no teleporting by remove and place, nothing while locked");
}

// --- lights ------------------------------------------------------------------------
{
  const lurker = map.place({ name: "Lurker", x: 225, y: 75, hidden: true }, gm);
  map.update(lurker.id, { light: { bright: 20, dim: 40 } }, gm);
  let view = map.viewFor(ann, "");
  assert(!view.lights.some((light) => light.id === `token:${lurker.id}`), "a hidden token's light is not sent to a player");
  assert(map.viewFor(gm, "").lights.some((light) => light.id === `token:${lurker.id}`), "the GM sees it");
  map.update(lurker.id, { hidden: false }, gm);
  assert(map.viewFor(ann, "").lights.some((light) => light.id === `token:${lurker.id}`), "shown, its light reaches the player");
  // A light in the closed room: its polygon (that room's outline) stays with the GM.
  const lamp = map.placeLight({ x: 450, y: 150, bright: 10, dim: 20 }, gm);
  view = map.viewFor(ann, "");
  assert(!view.lights.some((light) => light.id === lamp.id), "an unseen room's light is not sent to a player");
  assert(map.viewFor(gm, "").lights.some((light) => light.id === lamp.id), "the GM sees the lamp");
  map.setDoor("door", 1, ann);
  view = map.viewFor(ann, "");
  assert(view.lights.some((light) => light.id === lamp.id), "the door opened, the lamp's light is seen");
  map.setDoor("door", 0, ann);
  map.removeLight(lamp.id, gm);
  console.log("ok hidden and unseen lights stay with the GM");
}

// --- the mask hides paint ---------------------------------------------------------
{
  map.draw({ points: [400, 50, 500, 250], shape: "rect", color: "#ff0000" }, gm);
  map.draw({ points: [50, 50, 150, 50], color: "#00ff00" }, gm);
  assert(map.viewFor(ann, "").drawings.length === 2, "no mask: both drawings shown");
  map.setMask({ action: "on" }, gm);
  map.setMask({ action: "reveal", points: [0, 0, 300, 0, 300, 300, 0, 300] }, gm);
  const drawings = map.viewFor(ann, "").drawings;
  assert(drawings.length === 1 && drawings[0].color === "#00ff00", `paint under the mask is not sent: ${JSON.stringify(drawings.map((line) => line.color))}`);
  const own = map.draw({ points: [450, 100, 460, 110] }, ann);
  assert(map.viewFor(ann, "").drawings.some((line) => line.id === own.id), "a player's own line is theirs, mask or not");
  assert(map.viewFor(gm, "").drawings.length === 3, "the GM sees all the paint");
  map.setMask({ action: "off" }, gm);
  console.log("ok the mask hides paint");
}

// --- undo keeps door states and group visibility --------------------------------------
{
  map.setDoor("door", 2, gm);
  map.removeWalls(["door"], gm);
  map.undo(gm);
  const door = map.viewFor(gm, "").doors.find((item) => item.id === "door");
  assert(door && door.state === 2, `undoing a removed locked door brings it back locked: ${JSON.stringify(door)}`);
  map.clearWalls(gm);
  map.undo(gm);
  assert(map.viewFor(gm, "").doors.find((item) => item.id === "door")?.state === 2, "undoing a clear keeps the lock too");
  // A door opened in play after an edit keeps its state when the edit is undone.
  map.setDoor("door", 1, gm);
  map.addWalls({ points: [50, 250, 100, 250] }, gm);
  map.setDoor("door", 0, gm);
  map.undo(gm);
  assert(map.viewFor(gm, "").doors.find((item) => item.id === "door")?.state === 0, "undo does not reopen a door closed since");
  // Groups: a label, then its group hidden from players; undo takes back the group change only.
  map.addLabel({ text: "Treasure", x: 100, y: 100, group: "Notes" }, gm);
  map.updateGroup("Notes", { players: false }, gm);
  map.undo(gm);
  assert(map.groups().find((group) => group.name === "Notes")?.players === true, "undo took back the group change");
  assert(map.labels().some((label) => label.text === "Treasure"), "and left the label");
  map.updateGroup("Notes", { players: false }, gm);
  map.addLabel({ text: "Other", x: 120, y: 100 }, gm);
  map.undo(gm);
  assert(map.groups().find((group) => group.name === "Notes")?.players === false, "undoing an unrelated edit keeps the group hidden");
  map.removeGroup("Notes", gm);
  map.undo(gm);
  assert(map.groups().some((group) => group.name === "Notes") && map.labels().find((label) => label.text === "Treasure")?.group === "Notes", "undoing a removed group brings it back with its things");
  console.log("ok undo keeps door states and group visibility");
}

console.log("map fixes: all ok");
