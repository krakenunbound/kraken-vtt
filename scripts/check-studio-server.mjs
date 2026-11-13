// Map Studio's server, ported to Node (electron/studio/server.cjs, assets.cjs,
// ddPacks.cjs): started on a temporary data folder, with a stand-in FG data
// folder (an art pack, an adventure that must not be listed, a locked module
// and a vault file) and a stand-in Dungeondraft folder (a synthetic Godot PCK,
// stored twice). Every endpoint it owns is exercised over HTTP: the editor's
// files, the asset list with stable ids, asset bytes and thumbnails, uploads,
// projects (save, list, load, ten revisions, thumbnail), the portable zip both
// ways, the demo, Dungeondraft packs and the cross-origin refusal; plus the
// project checks of Map Studio's test_export.py.
//
// With KRAKEN_MAP_STUDIO_SRC set to a Map Studio (Python) folder and
// `py -3.11` available, the Python server is run on copies of its files in a
// temporary folder and must agree: the same asset ids and metadata for the
// same packs, the same checked project, the same upload id.
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { zipSync, unzipSync, strToU8, strFromU8 } = require("fflate");
const { createStudioServer } = require("../electron/studio/server.cjs");
const assets = require("../electron/studio/assets.cjs");

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studio = path.join(repo, "studio");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}
const assetId = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);

// ---------------------------------------------------------------------------
// Fixtures, made here (nothing licensed).

const png = (w, h, color = "#808080", alpha = 1) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { ...hex(color), alpha } } }).png().toBuffer();
const webp = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).webp().toBuffer();
const noisyWebp = (w, h) => sharp(crypto.randomBytes(w * h * 4), { raw: { width: w, height: h, channels: 4 } }).webp({ lossless: true }).toBuffer();
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
}
const gridsize = (n) => strToU8(`<root>\n<gridsize>${n},${n}</gridsize>\n</root>\n`);
const zip = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : new Uint8Array(v)]))));

// A version-1 Godot PCK holding files (path -> bytes), as Dungeondraft writes (test_dd_packs.py's pck()).
function pck(files) {
  const header = Buffer.alloc(20 + 64 + 4);
  header.write("GDPC", 0, "latin1");
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(3, 8);
  header.writeUInt32LE(2, 12);
  header.writeUInt32LE(1, 16);
  header.writeUInt32LE(Object.keys(files).length, 84);
  const tableSize = Object.keys(files).reduce((n, p) => n + 4 + Buffer.byteLength(p) + 32, 0);
  let offset = header.length + tableSize;
  const table = [];
  const body = [];
  for (const [p, data] of Object.entries(files)) {
    const name = Buffer.from(p);
    const row = Buffer.alloc(4 + name.length + 32);
    row.writeUInt32LE(name.length, 0);
    name.copy(row, 4);
    row.writeBigUInt64LE(BigInt(offset), 4 + name.length);
    row.writeBigUInt64LE(BigInt(data.length), 12 + name.length);
    table.push(row);
    body.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...table, ...body]);
}

function sample() {
  return {
    version: 1,
    name: "Kraken Compatibility Test",
    width: 800,
    height: 600,
    grid: 50,
    background: "#252b27",
    objects: [],
    walls: [
      { kind: "wall", x1: 100, y1: 100, x2: 700, y2: 100 },
      { kind: "door", x1: 350, y1: 500, x2: 450, y2: 500 },
      { kind: "window", x1: 100, y1: 200, x2: 100, y2: 300 },
    ],
    lights: [{ x: 250, y: 250, bright: 10, dim: 20, color: "#ffbb66" }],
    effects: [{ type: "water", x: 500, y: 300, width: 200, height: 150 }],
  };
}

// ---------------------------------------------------------------------------
// HTTP, by hand so the Origin header and odd paths go out exactly as written.

function request(base, method, target, { body = null, headers = {} } = {}) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, method, path: target, headers: { ...(body ? { "Content-Length": body.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const data = Buffer.concat(chunks);
        let parsed = null;
        if (String(res.headers["content-type"]).startsWith("application/json")) parsed = JSON.parse(data.toString("utf8"));
        resolve({ status: res.statusCode, headers: res.headers, body: data, json: parsed });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function client(server) {
  const get = (target) => request(server.url, "GET", target);
  const post = (target, data, headers = {}) => request(server.url, "POST", target, { body: Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)), headers });
  const ok = async (promise, what) => {
    const r = await promise;
    if (r.status !== 200) throw new Error(`${what}: ${r.status} ${r.body.toString("utf8").slice(0, 300)}`);
    return r;
  };
  return { get, post, ok };
}

// ---------------------------------------------------------------------------

const temp = mkdtempSync(path.join(tmpdir(), "kraken-studio-"));
const dataDir = path.join(temp, "data");
const fgData = path.join(temp, "fg");
const ddFolder = path.join(temp, "dd");
mkdirSync(path.join(fgData, "modules"), { recursive: true });
mkdirSync(path.join(fgData, "vault"), { recursive: true });
mkdirSync(ddFolder, { recursive: true });

// The GM's FG folder: one map-art pack (read in place), one adventure (not art), one locked module.
const artPack = {
  "definition.xml": '<?xml version="1.0"?><root><name>Test Art Kit</name><ruleset>Any</ruleset></root>',
  "images/Floors/": "",
  "images/Floors/Stone Floor.png": await png(64, 32),
  "images/Floors/Stone Floor.xml": gridsize(100),
  "images/Items/Barrel.png": await png(20, 20, "#804020"),
  "images/Items/Barrel.xml": gridsize(50),
  "images/Items/Crate.webp": await webp(30, 30),
  "readme.txt": "not art",
};
writeFileSync(path.join(fgData, "modules", "Test Art Kit.mod"), zip(artPack));
writeFileSync(path.join(fgData, "modules", "Some Adventure.mod"), zip({ "definition.xml": "<root/>", "db.xml": "<root/>", "images/map.png": await png(10, 10), "images/map.xml": gridsize(50) }));
writeFileSync(path.join(fgData, "modules", "Locked.mod"), crypto.randomBytes(256));
writeFileSync(path.join(fgData, "vault", "SomePack.dat"), crypto.randomBytes(16));

// Dungeondraft: the same pack twice (test_dd_packs.py's setUp).
const ddFiles = {
  "res://packs/abc123/pack.json": Buffer.from('{"name": "Test Pack", "id": "abc123"}'),
  "res://packs/abc123/textures/objects/barrel (1x1).webp": await webp(256, 256),
  "res://packs/abc123/textures/terrain/grass.webp": await webp(512, 512),
  // a WebP bigger than the 64 KB first read (2MT's wall strips are)
  "res://packs/abc123/textures/walls/stone_wall.webp": await noisyWebp(600, 200),
  "res://packs/abc123/data/default.dungeondraft_tags": Buffer.from("{}"),
};
assert(ddFiles["res://packs/abc123/textures/walls/stone_wall.webp"].length > 65536, "the noisy wall is over 64 KB");
writeFileSync(path.join(ddFolder, "Test.dungeondraft_pack"), pck(ddFiles));
writeFileSync(path.join(ddFolder, "Copy of Test.dungeondraft_pack"), pck(ddFiles));

const options = {
  webRoot: path.join(studio, "web"),
  dataDir,
  packsDir: path.join(studio, "packs"),
  examplesDir: path.join(studio, "examples"),
  fgDataFolder: fgData,
  ddFolders: [ddFolder],
};

let server = await createStudioServer(options);
const notes = [];
try {
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(server.url), `listens on 127.0.0.1 (${server.url})`);
  let { get, post, ok } = client(server);

  // --- the editor's files, and nothing outside them
  const index = await ok(get("/"), "GET /");
  assert(String(index.headers["content-type"]).startsWith("text/html") && index.body.includes("<"), "index.html is served at /");
  assert((await get("/app.js")).status === 200, "app.js is served");
  for (const escape of ["/%2e%2e/package.json", "/..%2f..%2fpackage.json", "/nope.js"]) assert((await get(escape)).status === 404, `${escape} is not served`);

  // --- the catalogue: Kraken's packs and the GM's art pack, with ids as server.py's asset_id gives them
  const listing = (await ok(get("/api/assets"), "GET /api/assets")).json;
  const byId = new Map(listing.assets.map((a) => [a.id, a]));
  for (const pack of ["Kraken Map Art.mod", "Battle Map Forge.mod"]) {
    const names = [];
    unzipSync(new Uint8Array(readFileSync(path.join(studio, "packs", pack))), {
      filter: (f) => {
        if (/^images\/.*\.(png|webp|jpe?g)$/i.test(f.name)) names.push(f.name);
        return false;
      },
    });
    assert(names.length > 50, `${pack} has pictures`);
    for (const entry of names) {
      const a = byId.get(assetId(`${pack}|${entry}`));
      assert(a, `${pack}|${entry} is listed under its stable id`);
      assert(a.sourcePack === pack.replace(/\.mod$/, "") && a.width > 0 && a.height > 0 && a.gridSize > 0, `${entry} has its size and grid: ${JSON.stringify(a)}`);
      assert(a.category === path.posix.dirname(entry) && a.name === path.posix.parse(entry).name, `${entry}'s category and name`);
    }
  }
  const stone = byId.get(assetId("Test Art Kit.mod|images/Floors/Stone Floor.png"));
  equal(stone, { id: stone.id, name: "Stone Floor", category: "images/Floors", width: 64, height: 32, gridSize: 100, defaultGrid: "100,100", sourcePack: "Test Art Kit", tags: ["Floors"], assetType: "background" }, "the GM's art pack is read in place");
  const crate = byId.get(assetId("Test Art Kit.mod|images/Items/Crate.webp"));
  equal([crate.width, crate.gridSize, crate.defaultGrid, crate.assetType], [30, null, null, "tile"], "a picture without a grid file");
  assert(!listing.assets.some((a) => a.sourcePack === "Some Adventure" || a.sourcePack === "Locked"), "adventures and locked modules are not art packs");
  assert(listing.packs.includes("Kraken Map Art") && listing.packs.includes("Test Art Kit") && listing.packs.at(-1) === "Imported artwork", `packs: ${listing.packs}`);
  equal(listing.subscriptionPacks, 1, "the vault's packs are counted");
  assert(existsSync(path.join(dataDir, "cache", "pack-index.json")), "the pack index is cached in the data folder");

  // --- asset bytes and thumbnails
  const krakenEntry = Object.keys(unzipSync(new Uint8Array(readFileSync(path.join(studio, "packs", "Kraken Map Art.mod"))), { filter: (f) => /^images\/Furniture\/.*\.webp$/.test(f.name) }))[0];
  const krakenBytes = unzipSync(new Uint8Array(readFileSync(path.join(studio, "packs", "Kraken Map Art.mod"))), { filter: (f) => f.name === krakenEntry })[krakenEntry];
  const krakenId = assetId(`Kraken Map Art.mod|${krakenEntry}`);
  const bytes = await ok(get(`/api/asset/${krakenId}`), "asset bytes");
  assert(bytes.headers["content-type"] === "image/webp" && Buffer.compare(bytes.body, Buffer.from(krakenBytes)) === 0, "asset bytes are the pack's own");
  const thumb = await ok(get(`/api/asset/${encodeURIComponent(krakenId)}?thumb=1`), "thumbnail");
  const tm = await sharp(thumb.body).metadata();
  assert(thumb.headers["content-type"] === "image/webp" && tm.format === "webp" && Math.max(tm.width, tm.height) <= 144 && tm.hasAlpha, `thumbnail is a WebP within 144 px (${tm.width}x${tm.height})`);
  const missing = await get("/api/asset/nothing-here");
  assert(missing.status === 400 && /Artwork is missing/.test(missing.json.error), "a missing asset is a 400 with a message");

  // --- uploads
  const red = await png(32, 48, "#ff0000", 180 / 255);
  const up = (await ok(post("/api/upload?name=Red%20vase.png", red, { "Content-Type": "image/png" }), "upload")).json.asset;
  equal(up, { id: crypto.createHash("sha256").update(red).digest("hex").slice(0, 24), name: "Red vase", category: "Imported artwork", width: 32, height: 48, gridSize: null, sourcePack: "Imported artwork", tags: ["Imported artwork"], assetType: "tile" }, "an upload is kept as it is, named after its file");
  assert(existsSync(path.join(dataDir, "library", `${up.id}.png`)) && JSON.parse(readFileSync(path.join(dataDir, "library", `${up.id}.json`), "utf8")).name === "Red vase", "the upload and its name are in the library");
  const gif = await sharp({ create: { width: 12, height: 8, channels: 4, background: "#00ff00" } }).gif().toBuffer();
  const fromGif = (await ok(post("/api/upload?name=dir%2Fanim.gif", gif), "gif upload")).json.asset;
  assert(fromGif.name === "anim" && existsSync(path.join(dataDir, "library", `${fromGif.id}.png`)), "other formats become PNG");
  const junk = await post("/api/upload?name=x.png", Buffer.from("not a picture"));
  equal([junk.status, junk.json.error], [400, "That file is not a picture Map Studio can read (use PNG, JPG or WebP)."], "a non-picture upload");
  const empty = await request(server.url, "POST", "/api/upload?name=x.png", { headers: { "Content-Length": 0 } });
  equal([empty.status, empty.json.error], [400, "Request is empty or too large (100 MB maximum)."], "an empty upload");

  // --- the cross-origin refusal
  const other = await png(4, 4, "#0000ff");
  const foreign = await post("/api/upload?name=x.png", other, { Origin: "http://evil.example" });
  equal([foreign.status, foreign.json], [403, { error: "Cross-origin writes are disabled." }], "a write from another origin");
  await ok(post("/api/upload?name=x.png", other, { Origin: server.url }), "a write from the editor's own origin");

  // --- the body limit boundary (test_http_upload_body_limit_boundary)
  {
    const saved = assets.limits.MAX_BODY;
    assets.limits.MAX_BODY = 1024;
    try {
      const small = await png(8, 8, "#008000");
      const body = Buffer.concat([small, Buffer.alloc(1024 - small.length, 0x20)]);
      await ok(post("/api/upload?name=test.png", body), "a body at the limit");
      assert((await post("/api/upload?name=test.png", Buffer.concat([body, Buffer.from(" ")]))).status === 400, "a body over the limit is refused");
    } finally {
      assets.limits.MAX_BODY = saved;
    }
  }

  // --- projects: save, revisions (ten kept), list, load, thumbnail (test_project_recovery_keeps_bounded_immutable_revisions)
  const thumbUrl = "data:image/png;base64," + (await png(960, 540, "#336699")).toString("base64");
  const first = (await ok(post("/api/projects", { project: { ...sample(), projectId: "my-test-map" }, thumbnail: thumbUrl }), "save")).json;
  equal([first.id, first.name, first.revision, first.thumbnail], ["my-test-map", "Kraken Compatibility Test", 0, "/api/projects/my-test-map/thumbnail"], "the first save");
  for (let i = 0; i < 12; i++) {
    await ok(post("/api/projects", { project: { ...sample(), projectId: "my-test-map", name: `Revision ${i}` } }), `save ${i}`);
    await new Promise((r) => setTimeout(r, 5)); // distinct file times, as a person saving would make
  }
  const revisions = readdirSync(path.join(dataDir, "projects", "my-test-map", "revisions"));
  equal(revisions.length, 10, "ten revisions are kept");
  assert(revisions.every((f) => /^\d+-[0-9a-f]{12}\.json$/.test(f)), `revision names: ${revisions[0]}`);
  const loaded = (await ok(get("/api/projects/my-test-map"), "load")).json.project;
  equal(loaded.name, "Revision 11", "the latest save loads");
  assert(!("projectId" in loaded), "the id is the folder, not a field");
  const saved = readFileSync(path.join(dataDir, "projects", "my-test-map", "project.json"), "utf8");
  assert(saved.indexOf('"background"') < saved.indexOf('"effects"') && saved.indexOf('"effects"') < saved.indexOf('"walls"'), "project.json is written with sorted keys");
  equal(loaded.lights[0], { bright: 10, color: "#ffbb66", dim: 20, dimFalloff: 50, falloff: 25, strength: 100, x: 250, y: 250 }, "lights are saved normalised, as validate_project leaves them");
  const fresh = (await ok(post("/api/projects", { project: { ...sample(), name: "Second map" } }), "save without id")).json;
  assert(/^map-[0-9a-f]{16}$/.test(fresh.id), `a new project gets an id (${fresh.id})`);
  const list = (await ok(get("/api/projects"), "list")).json.projects;
  equal(list.map((p) => p.id).sort(), [fresh.id, "my-test-map"].sort(), "both projects are listed");
  assert(list.find((p) => p.id === "my-test-map").revision === 10 && Number.isInteger(list[0].updated), "the list has revisions and times");
  const pthumb = await ok(get("/api/projects/my-test-map/thumbnail"), "project thumbnail");
  const pm = await sharp(pthumb.body).metadata();
  assert(pthumb.headers["content-type"] === "image/webp" && pm.width === 480 && pm.height === 270 && !pm.hasAlpha, `project thumbnail fits 480x360 (${pm.width}x${pm.height})`);
  equal((await get(`/api/projects/${fresh.id}/thumbnail`)).status, 404, "a project without a thumbnail");
  const bad = await get("/api/projects/Bad_Id");
  equal([bad.status, bad.json.error], [400, "Invalid project id."], "an invalid project id");
  assert(/Invalid project id/.test(await (async () => {
    try {
      assets.loadProject("../outside");
    } catch (e) {
      return e.message;
    }
    return "";
  })()), "../outside is not a project id");
  equal((await get("/api/projects/nothing-here")).json.error, "Project not found.", "a missing project");
  const badThumb = await post("/api/projects", { project: sample(), thumbnail: "data:image/png;base64,@@@" });
  equal(badThumb.status, 400, "a thumbnail that is not base64");
  const notProject = await post("/api/projects", { nope: 1 });
  equal([notProject.status, notProject.json.error], [400, "'project'"], "a save without a project");

  // --- portable zips both ways (test_portable_roundtrip_without_original)
  const withArt = { ...sample(), objects: [{ id: "a", assetId: up.id, x: 40, y: 60, width: 32, height: 48 }, { id: "b", assetId: krakenId, x: 0, y: 0, width: 50, height: 50 }] };
  const portable = await ok(post("/api/portable", { project: withArt }), "portable export");
  equal([portable.headers["content-type"], portable.headers["content-disposition"]], ["application/zip", 'attachment; filename="KrakenMap.kraken.zip"'], "portable headers");
  const inside = unzipSync(new Uint8Array(portable.body));
  const manifest = JSON.parse(strFromU8(inside["project.json"])).portableAssets;
  equal(manifest[up.id], { entry: `assets/${up.id}.png`, name: "Red vase" }, "the manifest names each picture");
  assert(inside[`assets/${krakenId}.webp`], "pack art travels in the zip too");
  // Without the original: the library copy and its catalogue entry are gone.
  rmSync(path.join(dataDir, "library", `${up.id}.png`));
  assets.ASSETS.delete(up.id);
  const imported = (await ok(post("/api/import", portable.body), "portable import")).json.project;
  const back = await ok(get(`/api/asset/${imported.objects[0].assetId}`), "imported art");
  const bm = await sharp(back.body).metadata();
  equal([bm.width, bm.height], [32, 48], "the imported picture is the original");
  equal(imported.walls, sample().walls.map(assets.normalizeWall), "walls come back normalised");
  equal(imported.effects, [{ type: "water", x: 500, y: 300, width: 200, height: 150, polygons: [[500, 300, 500, 450, 700, 450, 700, 300]] }], "effects come back with their mask");
  equal(imported.regions, [], "regions come back");
  {
    // test_portable_export_and_import_share_uncompressed_limit
    const saved = assets.limits.MAX_PORTABLE;
    assets.limits.MAX_PORTABLE = 100;
    try {
      const out = await post("/api/portable", { project: sample() });
      assert(out.status === 400 && /90 MB/.test(out.json.error), "portable export keeps to the limit");
      const inn = await post("/api/import", portable.body);
      assert(inn.status === 400 && /90 MB/.test(inn.json.error), "portable import keeps to the limit");
    } finally {
      assets.limits.MAX_PORTABLE = saved;
    }
  }
  equal((await post("/api/import", Buffer.from("not a zip"))).status, 400, "a non-zip import");

  // --- the demo: Kraken's Smugglers' Cove example, its art in the library
  const demo = (await ok(get("/api/demo"), "demo")).json.project;
  assert(demo.name === "Smugglers' Cove" && demo.objects.length > 40, `the demo is Smugglers' Cove (${demo.name}, ${demo.objects.length} objects)`);
  const afterDemo = new Set((await ok(get("/api/assets"), "assets after demo")).json.assets.map((a) => a.id));
  assert(demo.objects.every((o) => afterDemo.has(o.assetId)), "every demo object's art is in the library");
  equal((await ok(get("/api/demo"), "demo again")).json.project.objects.length, demo.objects.length, "the demo opens again");

  // --- /api/subscription
  const sub = (await ok(get("/api/subscription"), "subscription")).json;
  equal([sub.detected, sub.accessible, sub.sourceNames, sub.sourceCount, sub.supportedImportPath], [true, false, ["SomePack"], 1, "/api/import"], "the vault is reported, not read");
  equal(sub.readableModPacks.map((m) => m.name), ["Some Adventure", "Test Art Kit"], "readable modules (the locked one is not)");

  // --- Dungeondraft (test_dd_packs.py)
  let packs;
  for (let i = 0; i < 100; i++) {
    packs = (await ok(get("/api/dd/packs"), "dd packs")).json;
    if (!packs.scanning) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  equal(packs.packs.map((p) => [p.name, p.images, p.key]), [["Test Pack", 3, "abc123"]], "each pack is found once");
  equal([packs.scanned, packs.folders], [2, [ddFolder]], "both copies were scanned");
  const dd = Object.fromEntries((await ok(get("/api/dd/pack?key=abc123"), "dd pack")).json.assets.map((a) => [a.name, a]));
  equal(Object.keys(dd).sort(), ["barrel (1x1)", "grass", "stone_wall"], "the pack's art");
  equal([dd.stone_wall.width, dd.stone_wall.height], [600, 200], "a WebP over 64 KB is read whole");
  equal([dd["barrel (1x1)"].width, dd["barrel (1x1)"].gridSize, dd.grass.assetType], [256, 256, "background"], "256 pixels per square; terrain is background");
  equal(dd.grass.id, "dd" + crypto.createHash("sha1").update("abc123|res://packs/abc123/textures/terrain/grass.webp").digest("hex").slice(0, 22), "Dungeondraft ids as dd_packs.py makes them");
  const barrel = await ok(get(`/api/asset/${dd["barrel (1x1)"].id}`), "dd bytes");
  equal(barrel.headers["content-type"], "image/webp", "Dungeondraft art is served as WebP");
  equal((await sharp(barrel.body).metadata()).width, 256, "Dungeondraft art is read from the pack");
  const unknown = await get("/api/dd/pack?key=nope");
  equal([unknown.status, unknown.json.error], [400, "Dungeondraft pack not found (still scanning?)."], "an unknown pack");

  // --- a restart: uploads, Dungeondraft art and projects are remembered (and packs come from the cache)
  await server.close();
  server = await createStudioServer(options);
  ({ get, post, ok } = client(server));
  const again = new Set((await ok(get("/api/assets"), "assets after restart")).json.assets.map((a) => a.id));
  assert(again.has(dd.grass.id) && again.has(fromGif.id) && again.has(krakenId) && again.has(stone.id), "the catalogue survives a restart");
  equal((await ok(get("/api/projects/my-test-map"), "load after restart")).json.project.name, "Revision 11", "projects survive a restart");

  // --- validate_project, as test_export.py checks it
  const check = (p) => assets.validateProject(p);
  const throwsLike = (fn, pattern, message) => {
    try {
      fn();
    } catch (e) {
      assert(pattern.test(e.message), `${message}: ${e.message}`);
      return;
    }
    throw new Error(`${message}: no error`);
  };
  for (const badSettings of [{ SnowSize: 0.5 }, { WaterIntensity: 1.5 }, { maskblur: 101 }, { WaterSpeed: "fast" }, [0.5]]) {
    const p = sample();
    p.effects[0].settings = badSettings;
    throwsLike(() => check(p), /./, `bad effect settings ${JSON.stringify(badSettings)}`);
  }
  {
    const p = sample();
    p.lights[0].x = NaN;
    throwsLike(() => check(p), /x must be between/, "a non-finite light");
    const q = sample();
    q.objects = [{ assetId: "missing" }];
    throwsLike(() => check(q), /missing artwork/, "missing art");
    const r = sample();
    r.lights[0].bright = 100;
    throwsLike(() => check(r), /Dim light/, "bright over dim");
  }
  {
    // test_every_fg_type_exports_with_fgs_own_flags / test_legacy_two_point_walls_still_export, at the project level
    const p = sample();
    p.walls = Object.entries(assets.WALL_TYPES).map(([k, [, flags]]) => ({ id: k, type: k, points: [100, 100, 200, 100, 200, 200, 100, 200], flags: [...flags] }));
    const walls = check(p).walls;
    for (const w of walls) equal(w.flags, assets.WALL_FLAGS.filter((f) => assets.WALL_TYPES[w.id][1].includes(f)), `${w.id}'s flags`);
    const legacy = sample();
    legacy.walls[1].open = true;
    equal(check(legacy).walls.map((w) => [w.type, w.flags]), [["wall", []], ["door", ["toggleable", "open"]], ["window", ["toggleable", "allow_vision"]]], "legacy two-point walls");
  }
  {
    const p = sample();
    p.ambient = { preset: "custom", color: "#FFFFFF", alpha: 0.5, angle: 22.5, length: 1.13 };
    p.regions = [{ kind: "difficult", points: [0, 0, 10, 0, 10, 10], cost: 9 }];
    p.lights[0].animation = "pulse";
    p.lights[0].speed = 42.5;
    const v = check(p);
    equal(v.ambient, { preset: "custom", color: "#ffffff", alpha: 0.5, shadows: true, shadowColor: "#202838", shadowAlpha: 0.5, angle: 22, length: 1.2 }, "a custom ambient light");
    equal(v.darkness, 0.5, "its darkness");
    equal([v.regions[0].cost, v.regions[0].name], [5, "Difficult terrain"], "a difficult region");
    equal(v.lights[0].speed, 42, "Python rounds halves to even");
  }

  // --- Map Studio itself, when its source is at hand: the same ids, metadata, checks and upload ids.
  const src = process.env.KRAKEN_MAP_STUDIO_SRC;
  const py = src ? spawnSync("py", ["-3.11", "-c", "import PIL"], { encoding: "utf8" }) : null;
  if (!src || !existsSync(path.join(src, "server.py"))) notes.push("python parity skipped (set KRAKEN_MAP_STUDIO_SRC)");
  else if (!py || py.status !== 0) notes.push("python parity skipped (no py -3.11 with Pillow)");
  else {
    const pyRoot = path.join(temp, "python");
    mkdirSync(path.join(pyRoot, "research"), { recursive: true });
    for (const f of ["server.py", "dd_packs.py", "fg_maps.py", "foundry_export.py", "lighting.py", "occluders.py", "cloud_video.py", "rain_video.py"]) copyFileSync(path.join(src, f), path.join(pyRoot, f));
    // A catalogue of the packs here, written the way build_kraken_pack.py writes one.
    const starter = [];
    for (const archive of [path.join(studio, "packs", "Kraken Map Art.mod"), path.join(studio, "packs", "Battle Map Forge.mod"), path.join(fgData, "modules", "Test Art Kit.mod")]) {
      const names = new Set();
      unzipSync(new Uint8Array(readFileSync(archive)), { filter: (f) => (names.add(f.name), false) });
      for (const entry of names) {
        if (!/^images\/.*\.(png|webp|jpe?g)$/i.test(entry)) continue;
        const sidecar = entry.replace(/\.[^.]+$/, ".xml");
        starter.push({ name: path.posix.parse(entry).name, category: path.posix.dirname(entry), archive, entry, ...(names.has(sidecar) ? { metadata_entry: sidecar } : {}) });
      }
    }
    writeFileSync(path.join(pyRoot, "research", "asset-catalog.json"), JSON.stringify({ starter_pack: starter }));
    const legacy = sample();
    legacy.walls[1].open = true;
    legacy.ambient = { preset: "custom", color: "#FFFFFF", alpha: 0.5, angle: 22.5, length: 1.13 };
    legacy.regions = [{ id: "r1", kind: "difficult", points: [0, 0, 10, 0, 10, 10], cost: 9 }];
    legacy.lights.push({ x: 1, y: 2, bright: 0, dim: 5, color: "#123456", animation: "flicker", speed: 2.5, animationSpeed: 3, inverse: true, on: false, strength: 0.5 });
    legacy.effects.push({ type: "snow", x: 0, y: 0, width: 100, height: 100, settings: { SnowFade: 0.5, maskblur: 35 }, mask: null, polygons: null });
    legacy.effects.push({ type: "rain", x: 0, y: 0, width: 10, height: 10, dropSize: 2, polygons: [[0, 0, 0, 10, 10, 10]] });
    legacy.gridOffset = { x: 30, y: 20 };
    writeFileSync(path.join(pyRoot, "project.json"), JSON.stringify(legacy));
    writeFileSync(path.join(pyRoot, "red.png"), red);
    const script = `
import json, sys
sys.path.insert(0, r'${pyRoot}')
import server
server.catalog()
out = {'assets': {k: server.public_asset(a) for k, a in server.ASSETS.items()}}
p = json.load(open(r'${path.join(pyRoot, "project.json")}'))
out['project'] = server.validate_project(p)
out['upload'] = server.image_import(open(r'${path.join(pyRoot, "red.png")}', 'rb').read(), 'Red vase.png')
print(json.dumps(out))
`;
    const run = spawnSync("py", ["-3.11", "-P", "-c", script], { cwd: pyRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error(`python: ${run.stderr}`);
    const pyOut = JSON.parse(run.stdout);
    const ours = new Map((await ok(get("/api/assets"), "assets")).json.assets.map((a) => [a.id, a]));
    const pyIds = Object.keys(pyOut.assets);
    assert(pyIds.length === starter.length, "python listed every picture");
    for (const id of pyIds) equal(ours.get(id), pyOut.assets[id], `asset ${id} matches the Python`);
    // Python leaves points as floats and ids as it read them; JSON numbers compare the same.
    const mine = check(JSON.parse(JSON.stringify(legacy)));
    equal(JSON.parse(JSON.stringify(mine, Object.keys(mine).sort())), JSON.parse(JSON.stringify(pyOut.project, Object.keys(pyOut.project).sort())), "validate_project matches the Python (keys)");
    for (const key of Object.keys(pyOut.project)) equal(mine[key], pyOut.project[key], `validate_project's ${key} matches the Python`);
    equal(pyOut.upload.id, up.id, "an upload gets the same id as in the Python");
    notes.push(`python parity: ${pyIds.length} assets, project checks and upload id agree`);
  }

  console.log(`ok studio server: ${listing.assets.length} assets (stable ids), bytes + 144px WebP thumbs, uploads, projects with 10 revisions + thumbnail, portable round trip, demo (${demo.objects.length} objects), Dungeondraft PCK, cross-origin 403${notes.length ? "; " + notes.join("; ") : ""}`);
} finally {
  await server.close();
  rmSync(temp, { recursive: true, force: true });
}
