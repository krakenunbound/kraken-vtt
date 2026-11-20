// An FG map's repeated parts all come through: an older module's pins (image > shortcuts > shortcut, at picture
// pixels from the top left), each named by the entry it opens; and a weather layer's every mask shape (one <points>
// a shape). Before, the importer kept only the last of each.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { zipSync, strToU8 } from "fflate";

const require = createRequire(import.meta.url);
const { fgModuleBundle } = require("../electron/importers/fgMaps.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-classic-maps-"));
const shortcut = (x, y, kind, record) => `<shortcut><x>${x}</x><y>${y}</y><class>${kind}</class><recordname>${record}</recordname></shortcut>`;
const db = `<root>
  <encounter><id-00001><name type="string">000.001.01 1. Gate</name></id-00001><id-00002><name type="string">2. Hall</name></id-00002></encounter>
  <battle><id-00001><name type="string">Goblin ambush</name></id-00001></battle>
  <image>
    <id-00001><name type="string">Keep (DM)</name><image type="image"><bitmap>keep.png</bitmap><gridsize>50,50</gridsize><shortcuts>${shortcut(10, 20, "encounter", "encounter.id-00001")}${shortcut(30, 40, "encounter", "encounter.id-00002")}${shortcut(50, 60, "battle", "battle.id-00001")}</shortcuts></image></id-00001>
    <id-00002><name type="string">Moor</name><image type="image"><grid>on</grid><layers><layer><name>moor.png</name><id>0</id><type>image</type><bitmap>moor.png</bitmap></layer><layer><name>Rain</name><id>1</id><type>fx</type><fx><type>rain</type><usemask>true</usemask><mask><points>0,0,10,0,10,10</points><points>20,20,30,20,30,30</points></mask></fx></layer></layers></image></id-00002>
  </image>
</root>`;
fs.writeFileSync(path.join(dir, "Classic.mod"), zipSync({ "definition.xml": strToU8("<root><name>Classic</name><ruleset>2E</ruleset></root>"), "db.xml": strToU8(db), "keep.png": PNG, "moor.png": PNG }));
const bundle = fgModuleBundle(path.join(dir, "Classic.mod"), { all: true });
const extras = Object.values(bundle.extras);
const pins = extras.flatMap((extra) => extra.pins.filter((pin) => pin.link));
assert(pins.length === 3, `every pin of an older module's map: ${pins.length}`);
assert(pins.map((pin) => `${pin.x},${pin.y}`).join(" ") === "10,20 30,40 50,60", `at picture pixels from the top left: ${pins.map((pin) => `${pin.x},${pin.y}`)}`);
assert(pins.map((pin) => pin.text).join("|") === "1. Gate|2. Hall|Goblin ambush" && pins.every((pin) => pin.size >= 0.08 && pin.size <= 0.4), `named by the entry each opens: ${pins.map((pin) => pin.text)}`);
assert(pins[2].group === "Encounters" && pins[0].group === "Map keys" && pins[0].link.id === "encounter.id-00001@Classic", `a battle is an encounter, a story entry a map key, each linked: ${JSON.stringify(pins)}`);
const rain = extras.flatMap((extra) => extra.fx).find((fx) => fx.name === "Rain");
assert(rain?.mask.polygons.length === 2, `every shape of a weather mask: ${JSON.stringify(rain?.mask)}`);
fs.rmSync(dir, { recursive: true, force: true });
console.log("ok fg classic maps: an older module's pins all come through, placed and named, and a weather layer keeps every mask shape");
