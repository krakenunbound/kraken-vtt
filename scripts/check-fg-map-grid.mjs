// An FG map's grid on the table: FG's grid offset is from the picture's top left (y down) and its square measures
// FG's scale ("10ft"); and the GM's grid settings (opacity, colour, style, offset, size) stick to the map: saved with
// the campaign, and kept when the same book map is opened again.
import "./loopback.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";

const require = createRequire(import.meta.url);
const { fgModuleBundle } = require("../electron/importers/fgMaps.cjs");
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// A 2850 x 2000 picture's header is all the importer reads for its size.
const wide = Buffer.from(PNG);
wide.writeUInt32BE(2850, 16);
wide.writeUInt32BE(2000, 20);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-fg-grid-"));
const db = `<root><image><id-00001><name type="string">Village</name><scale type="string">10ft</scale><image type="image"><grid>on</grid><gridsize>25,25</gridsize><gridoffset>3,2</gridoffset><layers><layer><name>village.png</name><id>0</id><type>image</type><bitmap>village.png</bitmap><matrix>1,0,0,0,0,1,0,0,0,0,1,0,1425,-1000,0,1</matrix></layer></layers></image></id-00001></image></root>`;
fs.writeFileSync(path.join(dir, "Grid.mod"), zipSync({ "definition.xml": strToU8("<root><name>Grid</name><ruleset>2E</ruleset></root>"), "db.xml": strToU8(db), "village.png": wide }));

const open = () => {
  const bundle = fgModuleBundle(path.join(dir, "Grid.mod"), { all: true });
  const scene = JSON.parse(strFromU8(unzipSync(bundle.bytes)["bundle.json"])).adventureData.scenes[0];
  return { scene, extra: bundle.extras[scene._id] };
};
const first = open();
assert(first.extra.gridOffset.x === 3 && first.extra.gridOffset.y === 2, `FG's offset from the top left: ${JSON.stringify(first.extra.gridOffset)}`);
assert(first.scene.grid.size === 25 && first.scene.grid.distance === 10 && first.scene.grid.units === "ft", `FG's square and its scale: ${JSON.stringify(first.scene.grid)}`);

const server = createTableServer();
await server.listen({ port: 0, password: "" });
const tool = async (name, args = {}) => JSON.parse((await callTool(name, args, { table: () => server })).content[0].text);
const put = (table, { scene, extra }) => {
  // As kraken_open_fg_module: the map's extras seeded, then the scene opened.
  table.agent.map.seed(scene._id, extra);
  table.agent.map.setScene(JSON.parse(JSON.stringify({ ...scene, id: scene._id, walls: [], lights: [] })));
};
put(server, first);
const seeded = (await tool("kraken_scene_settings", {})).grid;
assert(seeded.offsetX === 3 && seeded.offsetY === 2, `the map opens with FG's offset: ${JSON.stringify(seeded)}`);
await tool("kraken_scene_settings", { grid: { alpha: 0.6, color: "#aa3311", style: "dashed", thickness: 3, offsetX: 4, size: 50 } });
const saved = server.persisted().map;
await server.stop();

// The campaign opened again, and the same map opened again from its book: the GM's settings stand.
const again = createTableServer({ saved: { map: saved } });
await again.listen({ port: 0, password: "" });
const toolAgain = async (name, args = {}) => JSON.parse((await callTool(name, args, { table: () => again })).content[0].text);
put(again, open());
const kept = (await toolAgain("kraken_scene_settings", {})).grid;
assert(kept.alpha === 0.6 && kept.color === "#aa3311" && kept.style === "dashed" && kept.thickness === 3 && kept.offsetX === 4 && kept.offsetY === 2 && kept.size === 50, `the grid settings stick to the map: ${JSON.stringify(kept)}`);
await again.stop();

// A campaign that opened the map before the fix: the offset worked out from the centre and one pin. Opened again,
// the offset is put right (the GM had not moved it) and the FG pins it lacked join it.
const old = open();
const legacy = old.extra.legacyGridOffset;
assert(legacy && (legacy.x !== 3 || legacy.y !== 2), `the old offset differs: ${JSON.stringify(legacy)}`);
const before = createTableServer();
await before.listen({ port: 0, password: "" });
before.agent.map.seed(old.scene._id, { ...old.extra, gridOffset: legacy, legacyGridOffset: null, pins: old.extra.pins.slice(0, 1) });
before.agent.map.setScene(JSON.parse(JSON.stringify({ ...old.scene, id: old.scene._id, walls: [], lights: [] })));
const oldSave = before.persisted().map;
await before.stop();
const after = createTableServer({ saved: { map: oldSave } });
await after.listen({ port: 0, password: "" });
put(after, open());
const fixed = JSON.parse((await callTool("kraken_scene_settings", {}, { table: () => after })).content[0].text).grid;
assert(fixed.offsetX === 3 && fixed.offsetY === 2, `an old campaign's offset is put right: ${JSON.stringify(fixed)}`);
await after.stop();

// Pins: a map opened when it kept one FG pin gets the others when opened again; the pins it had (the GM may have
// renamed one) stay as they are.
const pinTable = createTableServer();
await pinTable.listen({ port: 0, password: "" });
const pin = (n, text) => ({ x: n * 10, y: n * 10, text, icon: "pin", size: 0.2, group: "Map keys", link: { kind: "fg", id: `encounter.id-0000${n}@Grid` } });
pinTable.agent.map.seed("fg-pins", { pins: [pin(1, "1. Gate")] });
const labelsOf = () => pinTable.persisted().map.labels["fg-pins"];
labelsOf()[0].text = "The front gate";
pinTable.agent.map.seed("fg-pins", { pins: [pin(1, "1. Gate"), pin(2, "2. Hall"), pin(3, "3. Vault")] });
const pins = labelsOf();
assert(pins.length === 3 && pins.map((item) => item.text).join("|") === "1. Gate|2. Hall|3. Vault".replace("1. Gate", pins[0].text), `the missing pins join, none twice: ${JSON.stringify(pins.map((item) => item.text))}`);
await pinTable.stop();
fs.rmSync(dir, { recursive: true, force: true });
console.log("ok fg map grid: FG's offset from the picture's top left and its square's scale; the GM's grid settings saved with the map and kept when it is opened again");
process.exit(0);
