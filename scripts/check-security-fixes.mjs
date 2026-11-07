// The alpha.61 audit's table and file fixes, checked without the app:
//  1 a malformed address (GET /%) is answered, and the table plays on
//  2 a picture named by a record stays inside a module: no "..", no folder of
//    the GM's disk ("<file>@C:\..."); a player's note cannot show another module's
//  3 a damaged save falls back to the copy before it, or refuses: never an empty campaign
//  4 a player cannot choose a record's id (the party sheet's), nor keep endless notes
//  5 a player's character cannot take another character's name (whispers go by name)
//  6 five wrong table passwords, and the address waits
//  7 "@..." names are the table's own
//  8 the DM assistant never touches the GM's files by a path, nor accounts
//  9 a book's import takes the place of a creature already added from it
import "./loopback.mjs";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { modulePicture, importModule } = require("../electron/importers/fgModule.cjs");
const campaigns = require("../electron/campaigns.cjs");
const { createRecordStore } = require("../electron/records.cjs");
const { touchesDisk, WITHHELD } = require("../electron/assistant.cjs");
const { createMapState } = require("../electron/mapState.cjs");
const { cardsFor } = await import("../shared/cards/cards.mjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HANDBOOK = "Descending Darkness Player's Handbook";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const ok = (message) => console.log(`ok ${message}`);

function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => reject(new Error("join timed out")), 4000);
    ws.on("error", reject);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "ok" && msg.type !== "no") return;
      clearTimeout(timer);
      resolve({ ws, msg });
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
function op(ws, body) {
  return new Promise((resolve, reject) => {
    const req = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => reject(new Error("op timed out")), 3000);
    const onMessage = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "op-result" || msg.req !== req) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(msg);
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ type: "op", req, ...body }));
  });
}
function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-security-"));
const server = createTableServer({ ruleset: "Descending Darkness" });
const sockets = [];
try {
  const { port } = await server.listen({ port: 0, password: "" });

  // 1. A malformed address.
  const bad = await get(port, "/%");
  assert(bad.status === 400 || bad.status === 404, `GET /% answered: ${bad.status}`);
  const still = await connect(port, { name: "Ann", password: "" });
  sockets.push(still.ws);
  assert(still.msg.type === "ok", "the table still seats a player after GET /%");
  ok("GET /% is answered and the table plays on");

  // 2. Pictures stay inside modules.
  const secret = path.join(scratch, "secret.png");
  fs.writeFileSync(secret, Buffer.from("not really a png"));
  const fakeModule = path.join(scratch, "module");
  fs.mkdirSync(path.join(fakeModule, "images"), { recursive: true });
  fs.writeFileSync(path.join(fakeModule, "images", "own.png"), Buffer.from("own"));
  assert(modulePicture("images/own.png", fakeModule)?.bytes.toString() === "own", "a module's own picture");
  assert(modulePicture("../secret.png", fakeModule) === null, '"../" out of a module');
  assert(modulePicture(`secret.png@${scratch}`, "") === null, "a folder of the disk named after @");
  assert(modulePicture(`secret.png@${scratch}`, fakeModule) === null, "a folder of the disk, from a module record");
  assert(modulePicture("images/../../secret.png", fakeModule) === null, "a .. inside the path");
  assert(modulePicture(`${secret.replaceAll("\\", "/")}`, fakeModule) === null, "an absolute path");
  assert(modulePicture(`images/spells/arcane-darts.webp@${HANDBOOK}`, "")?.mime === "image/webp", "a picture from a named module still works");
  const note = await op(still.ws, { op: "create", input: { type: "note", name: "Sneaky", data: { token: `secret.png@${scratch}` } } });
  assert(note.ok, `a player's note: ${note.error}`);
  const asset = still.msg.you.assetToken;
  assert((await get(port, `/table/record-art?token=${asset}&record=${encodeURIComponent(note.id)}`)).status === 404, "a note naming a disk folder shows nothing");
  const other = await op(still.ws, { op: "create", input: { type: "note", name: "Peek", data: { token: `images/spells/arcane-darts.webp@${HANDBOOK}` } } });
  assert((await get(port, `/table/record-art?token=${asset}&record=${encodeURIComponent(other.id)}`)).status === 404, "a player's note cannot show a module not shared with them");
  ok("pictures stay inside their module; a player's note shows nothing from the disk or an unshared module");

  // 4. Record ids and limits.
  const squat = await op(still.ws, { op: "create", input: { id: "party", type: "note", name: "Mine now" } });
  assert(squat.ok && squat.id !== "party", `a player's note gets its own id: ${squat.id}`);
  const huge = await op(still.ws, { op: "create", input: { type: "note", name: "Big", data: { text: "x".repeat(300 * 1024) } } });
  assert(!huge.ok, "a 300 KB note is refused");
  ok("a player cannot choose a record id, nor keep a huge note");

  // 5. Character names.
  const mine = await op(still.ws, { op: "create", input: { type: "character", name: "Brenna" } });
  assert(mine.ok, `Ann's character: ${mine.error}`);
  server.agent.records.create({ type: "character", name: "Aria", owner: "Cara", visibility: "owner", data: {} }, server.agent.seat);
  const rename = await op(still.ws, { op: "update", id: mine.id, patch: { name: "aria" } });
  assert(!rename.ok && /another character/.test(rename.error), `renaming to another character's name is refused: ${rename.error}`);
  assert((await op(still.ws, { op: "update", id: mine.id, patch: { name: "Brenna Stoneward" } })).ok, "a new name of one's own is fine");
  ok("a player's character cannot take another character's name");

  // 7. "@" names.
  const at = await connect(port, { name: "@gm", password: "" });
  assert(at.msg.type === "no" && /@/.test(at.msg.reason), "@gm is refused");
  ok('"@..." names are refused');
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}

// 6. Wrong table passwords.
const locked = createTableServer();
try {
  const { port } = await locked.listen({ port: 0, password: "right-one" });
  for (let i = 0; i < 5; i++) {
    const tried = await connect(port, { name: "Eve", password: "nope" });
    assert(tried.msg.type === "no" && /Wrong/.test(tried.msg.reason), "a wrong password is refused");
  }
  const sixth = await connect(port, { name: "Eve", password: "right-one" });
  assert(sixth.msg.type === "no" && /Too many/.test(sixth.msg.reason), `after five wrong, even the right one waits: ${sixth.msg.reason}`);
  sixth.ws.close();
  ok("five wrong table passwords, and the address waits");
} finally {
  await locked.stop();
}

// 3. Saves.
const file = path.join(scratch, "campaigns.json");
const made = campaigns.create(file, { name: "Keep" });
campaigns.writeState(file, made.id, { view: { x: 1 }, records: [{ id: "a" }] });
campaigns.writeState(file, made.id, { view: { x: 2 }, records: [{ id: "a" }, { id: "b" }] });
const dir = path.join(scratch, "campaigns", made.id);
fs.writeFileSync(path.join(dir, "records.json"), "");
assert(campaigns.readState(file, made.id).records.length === 1, "a damaged records.json reads the copy from before the last save");
fs.writeFileSync(path.join(dir, "records.json.bak"), "{");
let refused = "";
try {
  campaigns.readState(file, made.id);
} catch (error) {
  refused = error.message;
}
assert(/damaged/.test(refused), `damaged with no good copy is an error, not an empty campaign: ${refused}`);
campaigns.create(file, { name: "Second" });
fs.writeFileSync(file, "{\"campaigns\": [");
assert(campaigns.read(file).length === 1, "a damaged campaign list reads the copy from before the last save");
ok("a damaged save falls back to its copy, or refuses; never an empty campaign");

// 8. The assistant.
assert(WITHHELD.has("kraken_accounts"), "no accounts for the assistant");
assert(touchesDisk("kraken_character_export", { id: "x", path: "C:/Users/x/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/a.hta" }), "no export to a path");
assert(touchesDisk("kraken_import_fg_module", { module: "..\\..\\x.mod" }) && !touchesDisk("kraken_import_fg_module", { module: "Salvage Rights" }), "a module by name only");
assert(!touchesDisk("kraken_character_export", { id: "x" }), "an export without a path is fine");
ok("the DM assistant never touches files by a path, nor accounts");

// 9. A book's import over a creature the Library added.
const store = createRecordStore();
const seat = { role: "dm", name: "GM" };
const bestiary = path.join(ROOT, "games", "modules", "Descending Darkness Bestiary");
const first = importModule(store, seat, bestiary);
const one = store.list({ type: "npc" })[0];
store.remove(one.id, seat);
store.create({ id: one.id, type: "npc", name: one.name, visibility: "gm", data: one.data }, seat);
const second = importModule(store, seat, bestiary);
assert(second.records === first.records && store.get(one.id)?.source === one.source, "the whole book imports, its copy in place of the Library's");
ok("a book's import takes the place of a creature already added from it");

// 10. A player's drawings never push out the GM's.
{
  const map = createMapState({ saved: {}, records: createRecordStore() });
  map.setScene({ id: "s", name: "S", width: 500, height: 500, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, lights: [], tokens: [], walls: [] });
  const gmSeat = { role: "dm", name: "GM" };
  const ann = { role: "player", name: "Ann" };
  for (let i = 0; i < 300; i++) map.draw({ points: [i, 0, i, 10], color: "#ff0000" }, gmSeat);
  for (let i = 0; i < 400; i++) map.draw({ points: [i, 20, i, 30] }, ann);
  const lines = map.drawings();
  assert(lines.filter((line) => line.by === "").length === 300, "all the GM's paint is still there");
  assert(lines.filter((line) => line.by === "Ann").length <= 60, "a player keeps their own share of lines");
  ok("a player's drawings never push out the GM's");
}

// 11. A spell listed twice is one card.
{
  const cards = cardsFor({ spells: ["Light", "light", "Kindle"], slots: {} }, []);
  assert(new Set(cards.map((card) => card.id)).size === cards.length && cards.length === 2, `one card per spell: ${cards.map((card) => card.id)}`);
  ok("a spell listed twice is one card");
}

fs.rmSync(scratch, { recursive: true, force: true });
process.exit(0);
