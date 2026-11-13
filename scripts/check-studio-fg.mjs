// The reading half of Map Studio's Fantasy Grounds code, ported to Node for
// Kraken's map editor (electron/studio/fgMaps.cjs, lighting.cjs,
// occluders.cjs), proved against the Python original: the same synthetic FG
// data folder is listed (campaigns, modules, vault packs), every map and
// picture in it gets a thumbnail and is opened, and the results are compared
// value by value (projects whole, thumbnails by size, since two libwebp builds
// give different WebP bytes for the same picture). Kraken writes nothing to FG,
// so nothing here saves or exports.
//
// The Python original runs when KRAKEN_MAP_STUDIO_SRC names its folder (its
// files are copied to a temp folder first and run there, never in place; FG
// folders are synthetic, never the user's). Without it, the Python results
// recorded in scripts/fixtures/studio/fg-python-results.json are the bar;
// `--update-golden` rewrites that file from a live Python run.
//
// Then the reading assertions of Map Studio's test_fg_maps.py and
// test_lighting.py run against the Node port.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fgMaps = require("../electron/studio/fgMaps.cjs");
const lighting = require("../electron/studio/lighting.cjs");
const occluders = require("../electron/studio/occluders.cjs");
const assets = require("../electron/studio/assets.cjs");
const sharp = require("sharp");
const { zipSync } = require("fflate");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures", "studio");
const GOLDEN = path.join(FIXTURES, "fg-python-results.json");
const UPDATE = process.argv.includes("--update-golden");
const SRC = process.env.KRAKEN_MAP_STUDIO_SRC || "";
// server.py imports the rest of these, so all are copied for the Python run.
const PY_FILES = ["server.py", "fg_maps.py", "lighting.py", "occluders.py", "dd_packs.py", "foundry_export.py", "cloud_video.py", "rain_video.py"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const sha = (algo, data) => crypto.createHash(algo).update(data).digest("hex");

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-studio-fg-"));
const ART = fs.readFileSync(path.join(FIXTURES, "fg-art.png"));
const PHOTO = fs.readFileSync(path.join(FIXTURES, "fg-photo.jpg"));

// ---------------------------------------------------------------------------
// The FG records both runs read

// The map from test_fg_maps.py: art on a moved layer, an art-less layer holding
// a closed one-sided polygon wall, a door, a window, an animated light, a
// rectangular water effect, an unmasked clouds effect, and things Map Studio
// does not edit (a pin and a text label inside a folder).
const MAP = `<?xml version="1.0" encoding="utf-8"?>
<root version="5.1" dataversion="20260124">
\t<image>
\t\t<id-00001>
\t\t\t<image type="image">
\t\t\t\t<grid>on</grid>
\t\t\t\t<gridsize>50,50</gridsize>
\t\t\t\t<layers>
\t\t\t\t\t<layer><name>Art</name><id>0</id><parentid>-5</parentid><type>image</type><bitmap>campaign/images/art.png</bitmap><matrix>1,0,0,0,0,1,0,0,0,0,1,0,100,-50,0,1</matrix>
\t\t\t\t\t\t<occluders><occluder><id>0</id><points>-100,0,0,0</points><toggleable /></occluder><occluder><id>1</id><points>0,50,50,50</points><toggleable /><allow_vision /></occluder></occluders>
\t\t\t\t\t\t<lights><light><id>0</id><position>10,20</position><range>2,1,4,1</range><color>#80FFAA44</color><on /><animtype>flicker</animtype><animspeed>3</animspeed></light></lights>
\t\t\t\t\t</layer>
\t\t\t\t\t<layer><name>Walls</name><id>1</id><parentid>-4</parentid><type>image</type><bitmap></bitmap>
\t\t\t\t\t\t<occluders><occluder><id>0</id><points>-50,-50,50,-50,50,50,-50,50</points><closed /><counterclockwise /><single_sided /><locked /></occluder></occluders>
\t\t\t\t\t</layer>
\t\t\t\t\t<layer><name>Water</name><id>2</id><parentid>-3</parentid><type>fx</type><fx><type>water</type><WaterSpeed>0.6</WaterSpeed><usemask /><mask><points>-100,100,0,100,0,0,-100,0</points></mask></fx></layer>
\t\t\t\t\t<layer><name>Clouds</name><id>3</id><parentid>-2</parentid><type>fx</type><fx><type>clouds</type></fx></layer>
\t\t\t\t\t<layer><name>Labels</name><id>4</id><parentid>-1</parentid><type>folder</type></layer>
\t\t\t\t\t<layer><name>1</name><id>5</id><parentid>4</parentid><type>text</type><displayText>1</displayText><matrix>1,0,0,0,0,1,0,0,0,0,1,0,7,8,0,1</matrix></layer>
\t\t\t\t\t<layer><name>Pin</name><id>6</id><parentid>4</parentid><type>shortcut</type><shortcut><class>note</class></shortcut><matrix>1,0,0,0,0,1,0,0,0,0,1,0,-20,30,0,1</matrix></layer>
\t\t\t\t</layers>
\t\t\t</image>
\t\t\t<name type="string">Test Map</name>
\t\t</id-00001>
\t</image>
\t<notes><id-00001><name type="string">Untouched note</name></id-00001></notes>
</root>
`;

// A richer campaign, saved in Latin-1: scaled and rotated layers, every
// occluder flag (and one FG flag Map Studio does not know), lights of every
// kind, art from another module (@Module), missing art, effects Map Studio
// keeps but does not edit, outdoor light, a grid offset, a picture that is not
// a map, comments and CDATA.
const RICH = `<?xml version="1.0" encoding="iso-8859-1"?>
<root version="4.1" dataversion="20210708">
\t<!-- written by a test -->
\t<image>
\t\t<category name="Dungeons" baseicon="0" decalicon="0">
\t\t\t<id-00003>
\t\t\t\t<image type="image">
\t\t\t\t\t<grid>on</grid>
\t\t\t\t\t<gridsize>70,70</gridsize>
\t\t\t\t\t<gridoffset>12.5,-20</gridoffset>
\t\t\t\t\t<uselos>on</uselos>
\t\t\t\t\t<layers>
\t\t\t\t\t\t<layer>
\t\t\t\t\t\t\t<name>Floor</name>
\t\t\t\t\t\t\t<id>0</id>
\t\t\t\t\t\t\t<parentid>-7</parentid>
\t\t\t\t\t\t\t<type>image</type>
\t\t\t\t\t\t\t<bitmap>campaign/images/art.png</bitmap>
\t\t\t\t\t\t\t<matrix>1.5,0,0,0,0,1.5,0,0,0,0,1,0,-30,40,0,1</matrix>
\t\t\t\t\t\t\t<occluders>
\t\t\t\t\t\t\t\t<occluder><id>0</id><points>-150,-50,-50,-50,-50,50</points><toggleable /><hidden /><single_sided /><terrain /><allow_move /><closed /><counterclockwise /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>1</id><points>10,10,40,10,40,40,10,40</points><toggleable /><hidden /><single_sided /><pit /><closed /><counterclockwise /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>2</id><points>0,0,30,0</points><toggleable /><hidden /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>3</id><points>0,10,30,10</points><toggleable /><open /><locked /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>4</id><points>0,20,30,20</points><allow_move /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>5</id><points>0,30,30,30</points><allow_vision /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>6</id><points>0,40,30,40,30,60</points><shadow /><weird_flag /></occluder>
\t\t\t\t\t\t\t\t<occluder><id>7</id><points>5,5</points></occluder>
\t\t\t\t\t\t\t</occluders>
\t\t\t\t\t\t\t<lights>
\t\t\t\t\t\t\t\t<light><id>0</id><position>0,0</position><range>4,0.75,8,0.5</range><color>#80FFF3E1</color><on /><animtype>1</animtype><animspeed>0.25</animspeed></light>
\t\t\t\t\t\t\t\t<light><id>1</id><position>50,-50</position><range>3,0.25,3,0.5</range><color>#FF000000</color><on /><inverse /></light>
\t\t\t\t\t\t\t\t<light><id>2</id><position>-60,20</position><range>2</range><color>#FFAA00</color><animtype>2</animtype><animspeed>0.7</animspeed><sound>wind</sound></light>
\t\t\t\t\t\t\t</lights>
\t\t\t\t\t\t</layer>
\t\t\t\t\t\t<layer><name>Prop</name><id>1</id><parentid>-6</parentid><type>image</type><bitmap>images/photo.jpg@Test Module</bitmap><matrix>0.08660254,0.05,0,0,-0.05,0.08660254,0,0,0,0,1,0,40.5,-12.25,0,1</matrix><invisible /></layer>
\t\t\t\t\t\t<layer><name>Missing</name><id>2</id><parentid>-5</parentid><type>image</type><bitmap>campaign/images/missing.png</bitmap></layer>
\t\t\t\t\t\t<layer><name>Rain</name><id>3</id><parentid>-4</parentid><type>fx</type><fx><type>rain</type><RainFade>0.9</RainFade><RainIntensity>0.25</RainIntensity><RainSpeed>0.6</RainSpeed><RainDirection>0.5</RainDirection><maskblur>20</maskblur></fx></layer>
\t\t\t\t\t\t<layer><name>Fire</name><id>4</id><parentid>-3</parentid><type>fx</type><fx><type>fire</type></fx></layer>
\t\t\t\t\t\t<layer><name>Moved fog</name><id>5</id><parentid>-2</parentid><type>fx</type><fx><type>myst</type></fx><matrix>1,0,0,0,0,1,0,0,0,0,1,0,5,5,0,1</matrix></layer>
\t\t\t\t\t\t<layer><name>Snow</name><id>8</id><parentid>-1</parentid><type>fx</type><invisible /><fx><type>snow</type><SnowFade>0.5</SnowFade><usemask /><mask><points>-200,100,-200,-100,0,-100,0,100</points><points>-150,50,-50,50,-50,-50</points><points>1,2</points></mask></fx></layer>
\t\t\t\t\t\t<layer><name>Paint</name><id>7</id><parentid>-8</parentid><type>paint</type></layer>
\t\t\t\t\t</layers>
\t\t\t\t\t<peekthru>0.3</peekthru>
\t\t\t\t\t<ambient><on /><ambientcolor>#91C9E7FF</ambientcolor><shadows /><shadowcolor>#74195263</shadowcolor><lightdir>0.6111111</lightdir><shadowlength>0.03</shadowlength></ambient>
\t\t\t\t</image>
\t\t\t\t<name type="string">Crypt of Château</name>
\t\t\t</id-00003>
\t\t\t<id-00004>
\t\t\t\t<image type="image"><layers><layer><name>Portrait</name><id>0</id><parentid>-1</parentid><type>image</type><bitmap>campaign/images/art.png</bitmap></layer></layers></image>
\t\t\t\t<name type="string">Handout</name>
\t\t\t</id-00004>
\t\t</category>
\t</image>
\t<notes><id-00001><name type="string">Note</name><text type="formattedtext"><![CDATA[<b>raw</b> & more]]></text></id-00001></notes>
</root>
`;

// A folder module: a map in db.xml and one players may see in client.xml.
const FOLDER_DB = `<?xml version="1.0" encoding="utf-8"?>
<root version="5.1" dataversion="20260124">
\t<image>
\t\t<map-1>
\t\t\t<image type="image">
\t\t\t\t<layers>
\t\t\t\t\t<layer><name>Ground</name><id>0</id><parentid>-1</parentid><type>image</type><bitmap>images/art.png</bitmap><occluders><occluder><id>0</id><points>-200,0,200,0</points></occluder></occluders></layer>
\t\t\t\t</layers>
\t\t\t</image>
\t\t\t<name type="string">Folder Map</name>
\t\t</map-1>
\t</image>
</root>
`;
const FOLDER_CLIENT = FOLDER_DB.replace("Folder Map", "Player Map").replace("images/art.png", "images/photo.jpg@Test Module").replace("<occluders><occluder><id>0</id><points>-200,0,200,0</points></occluder></occluders>", "").replace("<layers>", "<gridsize>40</gridsize><layers>");

// A zip as FG modules are: deflated entries, with one stored one (level 0).
function moduleZip(files) {
  const mtime = new Date(2024, 0, 2, 3, 4, 6);
  return Buffer.from(zipSync(Object.fromEntries(files.map(([name, data, level = 6]) => [name, [Buffer.from(data), { level, mtime }]]))));
}

// The synthetic FG data folder (as test_fg_maps.py builds it, and more).
function buildFg(root) {
  const campaign = (name, db, files = {}) => {
    const dir = path.join(root, "campaigns", name);
    fs.mkdirSync(path.join(dir, "images"), { recursive: true });
    fs.writeFileSync(path.join(dir, "db.xml"), db);
    for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, k), v);
    return path.join(dir, "db.xml");
  };
  const stamps = [
    campaign("Test Campaign", MAP, { "images/art.png": ART }),
    campaign("Mask Campaign", MAP.replace("<mask><points>-100,100,0,100,0,0,-100,0</points></mask>", "<mask><points>-150,150,-150,-50,50,-50,50,150</points><points>-100,100,0,100,0,0,-100,0</points></mask>"), { "images/art.png": ART }),
    campaign("Grid Campaign", MAP.replace("<grid>on</grid>", "<grid>on</grid><gridoffset>12.5,-20</gridoffset>"), { "images/art.png": ART }),
    campaign("Rich Campaign", Buffer.from(RICH, "latin1"), { "images/art.png": ART }),
  ];
  // Campaigns are listed newest first: give each its own time.
  stamps.forEach((file, i) => fs.utimesSync(file, new Date(2024, 0, 1 + i), new Date(2024, 0, 1 + i)));
  const modules = path.join(root, "modules");
  fs.mkdirSync(modules, { recursive: true });
  fs.writeFileSync(
    path.join(modules, "Test Module.mod"),
    moduleZip([
      ["definition.xml", "<root><name>Test Module</name><ruleset>Any</ruleset></root>"],
      ["db.xml", MAP.replace("campaign/images/art.png", "images/art.png")],
      ["images/art.png", ART, 0],
      ["images/photo.jpg", PHOTO],
    ]),
  );
  // Encrypted the way FG's vault files are: the central directory's flag (as test_fg_maps.py marks it).
  const locked = moduleZip([["db.xml", "<root/>"]]);
  locked[6] |= 1;
  locked[locked.indexOf(Buffer.from("PK\x01\x02", "latin1")) + 8] |= 1;
  fs.writeFileSync(path.join(modules, "Locked.mod"), locked);
  fs.writeFileSync(path.join(modules, "Broken.mod"), "not a zip");
  fs.writeFileSync(path.join(modules, "readme.txt"), "not a module");
  const folder = path.join(modules, "Folder Module");
  fs.mkdirSync(path.join(folder, "images"), { recursive: true });
  fs.writeFileSync(path.join(folder, "definition.xml"), "<root><name>FolderMod</name><displayname>Folder Module Shown</displayname></root>");
  fs.writeFileSync(path.join(folder, "db.xml"), FOLDER_DB);
  fs.writeFileSync(path.join(folder, "client.xml"), FOLDER_CLIENT);
  fs.writeFileSync(path.join(folder, "images", "art.png"), ART);
  fs.mkdirSync(path.join(root, "vault"), { recursive: true });
  fs.writeFileSync(path.join(root, "vault", "pack-a.dat"), "x");
  fs.writeFileSync(path.join(root, "vault", "pack-b.dat"), "x");
}

// Sources that cannot be listed: each run records the error it gives.
const BAD = [["campaign", "Nope"], ["campaign", "../x"], ["module", "Locked.mod"], ["module", "Broken.mod"], ["other", "x"]];

// ---------------------------------------------------------------------------
// The Python run (on copies, in the temp folder)

const DRIVER = String.raw`
import io, json, os, sys
from pathlib import Path
src, work = sys.argv[1], Path(sys.argv[2])
sys.path.insert(0, src)
os.environ['KRAKEN_FG_DATA'] = str(work / 'py-fg')
import server, fg_maps
from PIL import Image
lib = work / 'py-library'; lib.mkdir(exist_ok=True)
server.LIBRARY = lib; server.FG_ART = lib / 'fg-art.json'; server.BACKUPS = work / 'py-backups'; server.ASSETS.clear()
bad = json.loads((work / 'bad.json').read_text(encoding='utf-8'))

def run(f):
    try: return {'ok': f()}
    except Exception as e: return {'error': str(e)}
def size(data):
    with Image.open(io.BytesIO(data)) as im: return list(im.size)

fg = {}
srcs = fg_maps.list_sources(); srcs.pop('dataFolder')
fg['sources'] = srcs
fg['maps'] = {}
for s in srcs['campaigns'] + srcs['modules']:
    k = s['kind'] + '|' + s['key']
    entry = fg['maps'][k] = {'maps': fg_maps.list_maps(s['kind'], s['key']), 'all': fg_maps.list_maps(s['kind'], s['key'], True), 'open': [], 'thumbs': []}
    for m in entry['all']:
        entry['thumbs'].append(run(lambda: size(fg_maps.map_thumbnail(s['kind'], s['key'], m['file'], m['path'], m['n']))))
        entry['open'].append(run(lambda: fg_maps.open_map(s['kind'], s['key'], m['file'], m['path'], m['n'], server.register_fg_art, server.FX_SETTINGS, server.FX_BLUR)))
for b in bad:
    fg['maps']['bad|' + '|'.join(b)] = run(lambda: fg_maps.list_maps(*b))
json.dump({'fg': fg}, sys.stdout)
`;

function pythonCommand() {
  if (process.env.KRAKEN_PYTHON) return [process.env.KRAKEN_PYTHON];
  return process.platform === "win32" ? ["py", "-3.11"] : ["python3"];
}

function runPython() {
  const pySrc = path.join(WORK, "py-src");
  fs.mkdirSync(pySrc);
  for (const f of PY_FILES) fs.copyFileSync(path.join(SRC, f), path.join(pySrc, f));
  fs.writeFileSync(path.join(WORK, "bad.json"), JSON.stringify(BAD));
  fs.writeFileSync(path.join(WORK, "driver.py"), DRIVER);
  const [cmd, ...args] = pythonCommand();
  const result = spawnSync(cmd, [...args, "-B", path.join(WORK, "driver.py"), pySrc, WORK], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(`The Python original failed:\n${result.stderr || result.error}`);
  return JSON.parse(result.stdout);
}

// ---------------------------------------------------------------------------
// The Node run (the same steps)

// server.py's register_fg_art: an FG picture's asset id, from where it lives.
function registerFgArt(source, ref) {
  return `fg${sha("sha1", `${source.kind}|${source.key}|${ref}`).slice(0, 22)}`;
}

async function run(f) {
  try {
    return { ok: await f() };
  } catch (error) {
    return { error: error.message };
  }
}

async function runNode(fgRoot) {
  const opts = { dataFolder: fgRoot };
  const fg = {};
  const srcs = fgMaps.listSources(opts);
  assert(srcs.dataFolder === fgRoot, "listSources reports the data folder it read");
  delete srcs.dataFolder;
  fg.sources = srcs;
  fg.maps = {};
  for (const s of [...srcs.campaigns, ...srcs.modules]) {
    const entry = (fg.maps[`${s.kind}|${s.key}`] = { maps: fgMaps.listMaps(s.kind, s.key, false, opts), all: fgMaps.listMaps(s.kind, s.key, true, opts), open: [], thumbs: [] });
    for (const m of entry.all) {
      entry.thumbs.push(await run(async () => {
        const meta = await sharp(await fgMaps.mapThumbnail(s.kind, s.key, m.file, m.path, m.n, opts)).metadata();
        return [meta.width, meta.height];
      }));
      entry.open.push(await run(() => fgMaps.openMap(s.kind, s.key, m.file, m.path, m.n, registerFgArt, assets.FX_SETTINGS, assets.FX_BLUR, opts)));
    }
  }
  for (const bad of BAD) fg.maps[`bad|${bad.join("|")}`] = await run(() => fgMaps.listMaps(...bad, false, opts));
  return { fg };
}

// ---------------------------------------------------------------------------
// Comparing

// Values equal, numbers to within float noise (Python and V8 can differ in the
// last bit of cos, sin, hypot and atan2).
function compare(a, b, where, diffs) {
  if (diffs.length > 20) return;
  if (typeof a === "number" && typeof b === "number") {
    if (!(a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)))) diffs.push(`${where}: python ${a} node ${b}`);
    return;
  }
  if (typeof a === "string" && typeof b === "string") {
    if (a !== b) {
      const la = a.split("\n");
      const lb = b.split("\n");
      const i = la.findIndex((line, k) => line !== lb[k]);
      diffs.push(`${where}: first difference at line ${i + 1}:\n  python: ${JSON.stringify(la[i])}\n  node:   ${JSON.stringify(lb[i])}`);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) diffs.push(`${where}: python has ${a.length} items, node ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) compare(a[i], b[i], `${where}[${i}]`, diffs);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) diffs.push(`${where}.${k}: only in node (${JSON.stringify(b[k]).slice(0, 120)})`);
      else if (!(k in b)) diffs.push(`${where}.${k}: only in python (${JSON.stringify(a[k]).slice(0, 120)})`);
      else compare(a[k], b[k], `${where}.${k}`, diffs);
    }
    return;
  }
  if (a !== b) diffs.push(`${where}: python ${JSON.stringify(a)?.slice(0, 200)} node ${JSON.stringify(b)?.slice(0, 200)}`);
}

// The dataFolder-free, path-free view of the results that both runs share.
function comparable(results) {
  return JSON.parse(JSON.stringify(results));
}

// ---------------------------------------------------------------------------
// The reading assertions of Map Studio's own tests, against the Node port

// FG's <ambient> for a preset, written here the way FG saves it (FG's own
// colours, angle / 360 and length / 20), to read back.
function ambientXml(preset, shadows = true) {
  const a = lighting.AMBIENT[preset];
  const argb = (color, alpha) => `#${lighting.py.round(alpha * 255).toString(16).toUpperCase().padStart(2, "0")}${color.slice(1).toUpperCase()}`;
  return `<image><ambient><on /><ambientcolor>${argb(a.color, a.alpha)}</ambientcolor>${shadows ? "<shadows />" : ""}<shadowcolor>${argb(a.shadowColor, a.shadowAlpha)}</shadowcolor><lightdir>${a.angle / 360}</lightdir><shadowlength>${a.length / 20}</shadowlength></ambient></image>`;
}

async function portedTests(nodeResults) {
  const { xml } = lighting;

  // test_lighting.py (reading FG)
  {
    for (const preset of ["dawn", "sunlight", "dusk", "moonlight"]) {
      assert(JSON.stringify(lighting.readFgAmbient(xml.fromString(ambientXml(preset)))) === JSON.stringify(lighting.normalizeAmbient({ preset })), `${preset} reads in as its preset`);
    }
    assert(lighting.readFgAmbient(xml.fromString(ambientXml("moonlight", false))).shadows === false, "an ambient without shadows reads in without them");
    const a = lighting.readFgAmbient(xml.fromString("<image><ambient><on /><ambientcolor>#FF000BA1</ambientcolor><shadowcolor>#313052BB</shadowcolor><lightdir>0.8777778</lightdir><shadowlength>0.1</shadowlength></ambient></image>"));
    assert(a.preset === "custom" && a.color === "#000ba1" && a.angle === 316 && a.length === 2 && a.shadows === false, "custom ambient reads in");
    assert(JSON.stringify(lighting.readFgAmbient(xml.fromString("<image><uselighting>on</uselighting></image>"))) === '{"preset":"night"}', "lighting with no ambient is night");
    assert(lighting.readFgAmbient(xml.fromString("<image />")) === null, "neither is not set");
    const torch = lighting.readFgLight(xml.fromString("<light><id>0</id><position>0,0</position><range>4,0.75,8,0.5</range><color>#80FFF3E1</color><on /><animtype>1</animtype><animspeed>0.25</animspeed></light>"));
    assert(
      JSON.stringify([torch.bright, torch.dim, torch.falloff, torch.dimFalloff, torch.strength, torch.animation, torch.speed, torch.color]) === JSON.stringify([20, 40, 75, 50, 50, "flicker", 25, "#fff3e1"]),
      "an FG torch reads in",
    );
    const dark = lighting.readFgLight(xml.fromString("<light><range>3,0.25,3,0.5</range><color>#FF000000</color><on /><inverse /></light>"));
    assert(dark.inverse === true, "darkness lights read in");
    const plain = lighting.readFgLight(xml.fromString("<light><range>2</range></light>"));
    assert(plain.dim === 20 && plain.falloff === 25 && plain.dimFalloff === 50 && plain.on === false && plain.color === "#ffbb66", "FG's defaults fill what a light does not say");
  }

  // occluders.py: each FG type's flags read back as that type.
  for (const [type, [, flags]] of Object.entries(occluders.TYPES)) assert(occluders.typeFromFlags(flags) === type, `${type}'s flags read in as ${type}`);

  // test_fg_maps.py (reading)
  const fg = nodeResults.fg;
  assert(JSON.stringify(fg.sources.campaigns.map((s) => s.key)) === JSON.stringify(["Rich Campaign", "Grid Campaign", "Mask Campaign", "Test Campaign"]), "campaigns newest first");
  assert(JSON.stringify(fg.sources.modules.map((s) => s.name)) === JSON.stringify(["Folder Module Shown", "Test Module"]), "modules by their shown name");
  assert(fg.sources.encryptedModules === 2 && fg.sources.vaultPacks === 2, "encrypted (and unreadable) modules and vault packs are counted");
  assert(/encrypted/.test(fg.maps["bad|module|Locked.mod"].error), "an encrypted vault-style module is not opened");
  assert(fg.maps["bad|campaign|../x"].error && fg.maps["bad|other|x"].error, "bad names and kinds are refused");
  assert(fg.maps["campaign|Test Campaign"].maps[0].name === "Test Map", "the map is listed by its record name");
  {
    const rich = fg.maps["campaign|Rich Campaign"];
    assert(JSON.stringify(rich.maps.map((m) => m.name)) === JSON.stringify(["Crypt of Château"]), "a picture that is not a map is left out of the maps");
    assert(JSON.stringify(rich.all.map((m) => [m.name, m.map])) === JSON.stringify([["Crypt of Château", true], ["Handout", false]]), "and listed with the pictures");
    assert(JSON.stringify(fg.maps["module|Folder Module"].maps.map((m) => m.file).sort()) === JSON.stringify(["client.xml", "db.xml"]), "a folder module's maps come from db.xml and client.xml");
  }
  {
    const p = fg.maps["campaign|Test Campaign"].open[0].ok;
    assert(p.width === 400 && p.height === 200, "the map is the art's size");
    const art = p.objects[0];
    assert(art.x === 0 && art.y === 0 && art.width === 400 && art.height === 200, "the art fills the map");
    assert(JSON.stringify(p.walls.map((w) => w.type).sort()) === JSON.stringify(["door", "wall", "window"]), "each FG occluder stays one shape");
    const poly = p.walls.find((w) => w.type === "wall");
    assert(poly.points.length === 8 && JSON.stringify([...poly.flags].sort()) === JSON.stringify(["closed", "counterclockwise", "locked", "single_sided"]), "the closed polygon keeps its flags");
    assert(JSON.stringify(p.walls.find((w) => w.type === "door").points.slice(0, 2)) === "[100,100]", "a moved layer's occluder lands in place");
    assert(p.lights[0].color === "#ffaa44" && p.lights[0].dim === 20, "light colour and radius");
    const water = p.effects.find((e) => e.type === "water");
    assert(water.x === 0 && water.y === -50 && water.width === 100 && water.height === 100 && water.settings.WaterSpeed === 0.6, "the water mask");
    assert(JSON.stringify(p.fgKept) === JSON.stringify({ folder: 1, text: 1, shortcut: 1 }), "what Map Studio does not edit is counted");
    assert(JSON.stringify(p.gridOffset) === JSON.stringify({ x: 0, y: 0 }), "no offset opens as 0, 0");
  }
  {
    const opened = fg.maps["campaign|Mask Campaign"].open[0].ok;
    const water = opened.effects.find((e) => e.type === "water");
    assert(water.polygons.length === 2 && water.mask.ops[0].shape === "paths", "any FG mask opens as outlines");
    assert(opened.effects.find((e) => e.type === "clouds").polygons === null, "no FG mask: the whole map");
  }
  assert(JSON.stringify(fg.maps["campaign|Grid Campaign"].open[0].ok.gridOffset) === JSON.stringify({ x: 12.5, y: 30 }), "an FG grid offset opens on the map's grid");
  {
    const p = fg.maps["campaign|Rich Campaign"].open[0].ok;
    assert(p.fgUnreadableArt === 1 && p.objects.length === 2, "missing art stays an FG-only layer");
    assert(p.objects.find((o) => o.name === "Prop").visible === false, "art from another module (@Module) opens, hidden as in FG");
    assert(p.walls.length === 7 && p.walls.find((w) => w.extraFlags.includes("weird_flag")).type === "shadow", "every occluder flag reads in (and one Map Studio does not know is kept)");
    assert(p.ambient.preset === "moonlight" && p.peek === 0.3, "outdoor light and peek-through read in");
  }

  // The zip reader: a stored entry reads back unchanged.
  {
    const zipped = fs.readFileSync(path.join(WORK, "node-fg", "modules", "Test Module.mod"));
    const infos = fgMaps.zipInfos(zipped);
    const art = infos.find((i) => i.filename === "images/art.png");
    assert(art.method === 0 && fgMaps.zipRead(zipped, art).equals(ART), "stored zip entries read back");
    const photo = infos.find((i) => i.filename === "images/photo.jpg");
    assert(photo.method === 8 && fgMaps.zipRead(zipped, photo).equals(PHOTO), "deflated zip entries read back");
  }
}

// ---------------------------------------------------------------------------

try {
  fs.mkdirSync(path.join(WORK, "py-fg"));
  fs.mkdirSync(path.join(WORK, "node-fg"));
  buildFg(path.join(WORK, "py-fg"));
  buildFg(path.join(WORK, "node-fg"));

  const nodeResults = comparable(await runNode(path.join(WORK, "node-fg")));
  let pythonResults;
  let against;
  if (SRC && fs.existsSync(path.join(SRC, "fg_maps.py"))) {
    pythonResults = runPython();
    against = "the Python original";
    if (UPDATE) fs.writeFileSync(GOLDEN, `${JSON.stringify(pythonResults, null, 1)}\n`);
  } else {
    if (UPDATE) throw new Error("--update-golden needs KRAKEN_MAP_STUDIO_SRC (the Python original's folder).");
    pythonResults = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    against = "the recorded Python results";
  }
  const diffs = [];
  compare(pythonResults, nodeResults, "results", diffs);
  if (diffs.length) throw new Error(`The Node port differs from ${against}:\n${diffs.join("\n")}`);

  await portedTests(nodeResults);

  const maps = Object.values(nodeResults.fg.maps);
  const opened = maps.reduce((n, m) => n + (m.open ? m.open.length : 0), 0);
  const sources = nodeResults.fg.sources.campaigns.length + nodeResults.fg.sources.modules.length;
  console.log(`ok studio fg: ${sources} FG sources listed, ${opened} FG maps and pictures opened and thumbnailed match ${against}; Map Studio's FG reading tests pass`);
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
}
