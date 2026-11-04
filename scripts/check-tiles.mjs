// Image layers (FG's image layers, Foundry's tiles) on a live table with a
// test player: pictures from the tile library placed, moved, resized, turned,
// ordered (up, down, top, bottom), locked, hidden from players, in a group
// players don't see, under the mask, undone and removed, through kraken_tile
// and the table's own messages; a player cannot add one; the picture is served
// to a seat's asset token only. Then the imports: an FG module's extra image
// layers (Hommlet's seasons), text layers (its numbers) and folders (its
// groups), when that module is on this computer; and a Foundry bundle's tiles
// (read by the bundle reader, placed once when the scene is first shown).
// Run with tsx (it reads the bundle reader's TypeScript).
import "./loopback.mjs";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { WebSocket } from "ws";
import { loadBundle } from "../src/foundry/importBundle.ts";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { createDecalLibrary } = require("../electron/decals.cjs");
const { listModules } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// A tiny PNG (1x1), different bytes for each colour.
function png(seed) {
  const bytes = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c63f8cfc0f01f0005000201" + seed.toString(16).padStart(2, "0") + "0000000049454e44ae426082", "hex");
  return bytes;
}

function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    ws.on("message", (data) => inbox.push(JSON.parse(data.toString())));
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
    const start = Date.now();
    const poll = setInterval(() => {
      const ok = inbox.find((m) => m.type === "ok");
      if (ok || Date.now() - start > 4000) {
        clearInterval(poll);
        if (ok) resolve({ ws, inbox, you: ok.you });
        else reject(new Error("join timed out"));
      }
    }, 10);
  });
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lastMap = (inbox) => [...inbox].reverse().find((m) => m.type === "maps" || m.type === "map")?.map ?? null;

const scene = { id: "yard", name: "Yard", width: 1000, height: 600, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, lights: [], tokens: [], walls: [] };
const folder = mkdtempSync(path.join(tmpdir(), "kraken-tiles-"));
const tiles = createDecalLibrary({ folder, own: [], hashNames: true });
const server = createTableServer({ tiles });
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const refused = async (name, args) => {
    try {
      return (await callTool(name, args, ctx)).isError === true;
    } catch {
      return true;
    }
  };
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  const player = await connect(info.port, { name: "Tester", password: "" });
  sockets.push(dm.ws, player.ws);
  dm.ws.send(JSON.stringify({ type: "scene", scene }));
  await wait(300);
  const map = server.agent.map;
  const playerSeat = { role: "player", name: "Tester" };
  const playerTiles = () => map.viewFor(playerSeat, "p").tiles;

  // The library: the same picture twice is kept once (named by its content).
  const cart = tiles.add("cart.png", png(1));
  assert(tiles.add("cart again.png", png(1)).id === cart.id, "the same picture is kept once");
  const roof = tiles.add("roof.png", png(2));
  const rug = tiles.add("rug.png", png(3));
  assert((await tool("kraken_tile", { action: "library" })).length === 3, "the library lists three pictures");
  assert(await refused("kraken_tile", { action: "add", src: "lib/nothing.png", x: 0, y: 0, width: 50, height: 50 }), "a picture not in the library is refused");

  const a = await tool("kraken_tile", { action: "add", src: cart.id, name: "Cart", x: 100, y: 100, width: 100, height: 50 });
  const b = await tool("kraken_tile", { action: "add", src: roof.id, name: "Roof", x: 400, y: 100, width: 200, height: 200, level: "above" });
  const c = await tool("kraken_tile", { action: "add", src: rug.id, name: "Rug", x: 120, y: 300, width: 100, height: 100, rotation: 45, alpha: 0.8, flipX: true });
  assert(map.tiles().map((tile) => tile.id).join() === [a.id, b.id, c.id].join(), "drawn in the order added");
  assert(c.rotation === 45 && c.alpha === 0.8 && c.flipX && b.level === "above", "turn, opacity, flip and level kept");

  // Order: FG's up, down, top, bottom.
  await tool("kraken_tile", { action: "order", id: c.id, where: "bottom" });
  assert(map.tiles()[0].id === c.id, "to the bottom");
  await tool("kraken_tile", { action: "order", id: c.id, where: "up" });
  assert(map.tiles()[1].id === c.id, "up one");
  await tool("kraken_tile", { action: "order", id: a.id, where: "top" });
  assert(map.tiles().at(-1).id === a.id, "to the top");
  await tool("kraken_tile", { action: "order", id: a.id, where: "down" });
  assert(map.tiles().at(-2).id === a.id, "down one");

  // Moved and resized; locked keeps it in place until unlocked.
  await tool("kraken_tile", { action: "update", id: a.id, x: 150, width: 120 });
  assert(map.tiles().find((tile) => tile.id === a.id).x === 150, "moved");
  await tool("kraken_tile", { action: "update", id: a.id, locked: true });
  assert(await refused("kraken_tile", { action: "update", id: a.id, x: 0 }), "a locked layer stays put");
  assert(await refused("kraken_tile", { action: "remove", id: a.id }), "a locked layer is not removed");
  await tool("kraken_tile", { action: "update", id: a.id, locked: false, alpha: 0.5 });

  // What a player is sent: the url under their own token; never hidden layers, GM-only groups or what the mask covers.
  assert(playerTiles().length === 3 && playerTiles().every((tile) => tile.url.includes("token=p") && tile.locked === undefined), "the player gets all three, with their own address");
  await tool("kraken_tile", { action: "update", id: c.id, hidden: true });
  assert(!playerTiles().some((tile) => tile.id === c.id) && map.viewFor(server.agent.seat, "g").tiles.some((tile) => tile.id === c.id), "a hidden layer is the GM's alone");
  await tool("kraken_tile", { action: "update", id: b.id, group: "Roofs" });
  await tool("kraken_map_group", { action: "update", name: "Roofs", players: false });
  assert(!playerTiles().some((tile) => tile.id === b.id), "a layer in a group players don't see stays with the GM");
  await tool("kraken_map_group", { action: "update", name: "Roofs", players: true });
  await tool("kraken_mask", { action: "on" });
  assert(playerTiles().length === 0, "under the mask, nothing");
  await tool("kraken_mask", { action: "reveal", rect: { x: 100, y: 50, width: 300, height: 150 } });
  assert(playerTiles().map((tile) => tile.id).join() === a.id, `revealed, the cart shows: ${playerTiles().map((tile) => tile.name)}`);
  await tool("kraken_mask", { action: "off" });

  // The picture is served to a seat's token, not to anyone.
  const url = `http://127.0.0.1:${info.port}/tile/file?token=${player.you.assetToken}&id=${encodeURIComponent(cart.id)}`;
  const got = await fetch(url);
  assert(got.ok && Buffer.from(await got.arrayBuffer()).equals(png(1)), "the player's seat loads the picture");
  assert((await fetch(url.replace(player.you.assetToken, "nope"))).status === 404, "no token, no picture");
  assert((await fetch(`http://127.0.0.1:${info.port}/tile/list?token=${player.you.assetToken}`)).status === 404, "players don't list the library");

  // A player cannot add or change one; the GM's own message can.
  player.ws.send(JSON.stringify({ type: "tile", action: "add", tile: { src: cart.id, x: 0, y: 0, width: 10, height: 10 } }));
  dm.ws.send(JSON.stringify({ type: "tile", action: "update", id: a.id, patch: { y: 222 } }));
  await wait(200);
  assert(player.inbox.some((m) => m.type === "error" && /Only the GM/.test(m.reason)) && map.tiles().length === 3, "a player's tile is refused");
  assert(map.tiles().find((tile) => tile.id === a.id).y === 222, "the GM's message moves it");

  // Undo, remove, saved.
  await tool("kraken_tile", { action: "remove", id: b.id });
  assert(map.tiles().length === 2, "removed");
  await tool("kraken_map_undo", {});
  assert(map.tiles().some((tile) => tile.id === b.id), "undo brings it back");
  assert(server.agent.map.persisted().tiles.yard.length === 3, "saved with the campaign");

  // A Foundry bundle's tiles: read from the bundle with their pictures; placed by the host the first time the scene opens.
  const bundle = zipSync({
    "bundle.json": strToU8(JSON.stringify({ adventureData: { name: "Test", scenes: [{ _id: "s1", name: "Camp", width: 500, height: 500, grid: { size: 50 }, tiles: [
      { texture: { src: "tiles/tent.png", scaleX: -1 }, x: 50, y: 60, width: 100, height: 80, rotation: 90, alpha: 0.9 },
      { img: "tiles/canopy.png", x: 200, y: 200, width: 150, height: 150, overhead: true, hidden: true },
    ] }] } })),
    "tiles/tent.png": new Uint8Array(png(4)),
    "tiles/canopy.png": new Uint8Array(png(5)),
  });
  const loaded = loadBundle(bundle).scenes[0];
  const [tent, canopy] = loaded.tiles;
  assert(tent.flipX && tent.rotation === 90 && tent.alpha === 0.9 && tent.level === "below" && tent.image?.length === png(4).length, `Foundry's tile read: ${JSON.stringify({ ...tent, image: tent.image?.length })}`);
  assert(canopy.level === "above" && canopy.hidden && canopy.image, "an overhead tile is above the tokens");
  const placed = loaded.tiles.map(({ image, src, ...rest }) => ({ ...rest, src: tiles.add(src.split("/").pop(), Buffer.from(image)).id }));
  const camp = { ...scene, id: "s1", name: "Camp", width: 500, height: 500 };
  dm.ws.send(JSON.stringify({ type: "scene", scene: { ...camp, tiles: placed } }));
  await wait(300);
  assert(map.tiles().length === 2 && map.tiles()[1].level === "above", `the bundle's tiles are on the scene: ${map.tiles().length}`);
  dm.ws.send(JSON.stringify({ type: "scene", scene: { ...camp, tiles: placed } }));
  await wait(300);
  assert(map.tiles().length === 2, "shown again, they are not doubled");

  // An FG module's layers (when the GM has The Village of Hommlet): its seasons as hidden image layers, its numbers as labels in its folder's group.
  const hommlet = listModules().find((item) => (item.name ?? item) === "D&D 3.5e The Village of Hommlet");
  let fgNote = "the FG module was not on this computer";
  if (hommlet) {
    const response = await fetch(`http://127.0.0.1:${info.port}/table/fg-maps?token=${dm.you.assetToken}&module=${encodeURIComponent("D&D 3.5e The Village of Hommlet")}`);
    assert(response.ok, "the module's maps load");
    const id = "fg-d-d-3-5e-the-vil-village-of-hommlet";
    dm.ws.send(JSON.stringify({ type: "scene", scene: { ...scene, id, name: "Village of Hommlet", width: 5040, height: 3920 } }));
    await wait(400);
    const seasons = map.tiles();
    assert(seasons.length === 2 && seasons.every((tile) => tile.hidden && tile.width === 5040 && tile.height === 3920 && tile.x === 0 && tile.y === 0), `Hommlet's fall and winter layers: ${JSON.stringify(seasons.map((tile) => [tile.name, tile.width, tile.hidden]))}`);
    assert(/Fall/.test(seasons[0].name) && /Winter/.test(seasons[1].name), "in FG's order");
    const numbers = map.labels().filter((label) => label.group === "Location numbers");
    assert(numbers.length === 33 && numbers.find((label) => label.text === "1").x === 1109 && numbers.find((label) => label.text === "1").y === 3284, `33 numbers where FG had them: ${numbers.length}`);
    const group = map.groups().find((item) => item.name === "Location numbers");
    assert(group && group.players && group.nextNumber === 34, `the folder is a group players see, numbering on from 34: ${JSON.stringify(group)}`);
    assert(map.viewFor(playerSeat, "p").labels.filter((label) => label.group === "Location numbers").length === 33, "players see the numbers");
    assert(!map.viewFor(playerSeat, "p").tiles.length, "the hidden seasons are the GM's until shown");
    await tool("kraken_tile", { action: "update", id: seasons[1].id, hidden: false });
    assert(map.viewFor(playerSeat, "p").tiles.length === 1, "winter shown to the table");
    // The agent's way in (kraken_open_fg_module) stores the layers' pictures too.
    const other = createTableServer({ tiles });
    try {
      await callTool("kraken_open_fg_module", { module: "D&D 3.5e The Village of Hommlet", maps: ["Village of Hommlet"] }, { table: () => other, ui: async () => ({ opened: true }) });
      const seeded = other.persisted().map.tiles[id] ?? [];
      assert(seeded.length === 2 && seeded.every((tile) => tiles.has(tile.src)), `kraken_open_fg_module keeps the seasons: ${seeded.length}`);
    } finally {
      await other.stop();
    }
    fgNote = "Hommlet's seasons (hidden image layers) and 33 numbers in its Location numbers group";
  }
  console.log(`ok tiles: image layers from the tile library placed, moved, ordered, locked, hidden, grouped, masked, undone, saved; a player refused; pictures only to seats; a Foundry bundle's tiles (flipped, turned, overhead) placed once; ${fgNote}`);
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
  rmSync(folder, { recursive: true, force: true });
}
