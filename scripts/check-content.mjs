// The campaign's own content, on a live table with a test player connected
// over the wire (electron/content.cjs, electron/agent/contentTools.cjs):
//   - copies (FG's Duplicate): a new id, "(copy)", no book path; a player may not copy
//   - sharing with chosen players: visibility as a list of names, kept through a
//     save and reload; the named player gets the record, another does not
//   - formatted text cleaned on the host (a player's note cannot carry markup)
//   - the story: pages added and removed
//   - random tables (shared/tables/roll.mjs): the row a total falls in and the
//     clamp past either end, a die from the rows' span, columns, [2d6] rolled
//     in, [2x] repeating a linked table, a table linked by name, ten deep at
//     most, hidden rolls, FG's paste import, /rollon's message from a player
//   - identification: every frame a player receives, through the item record,
//     the party's parcel and distribution, holds no real name or notes
//   - encounters: NPCs with a count or dice, spots from the map, the tracker,
//     the XP to the party sheet; parcels to the party and to a character; quests
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import { sanitizeFormatted } from "../shared/text/formatted.mjs";
import { parseTableText, resultsAt, rollTable, tableFormula } from "../shared/tables/roll.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { createRecordStore } = require("../electron/records.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- The sanitiser, by itself.
assert(sanitizeFormatted('<p>Hi <b>there</b><script>alert(1)</script></p>') === "<p>Hi <b>there</b>&lt;script&gt;alert(1)&lt;/script&gt;</p>", `script tag kept as words: ${sanitizeFormatted('<p>Hi <b>there</b><script>alert(1)</script></p>')}`);
assert(sanitizeFormatted('<p onclick="x()">a</p><img src=x onerror=y>') === "<p>a</p>&lt;img src=x onerror=y&gt;", `attributes and img dropped: ${sanitizeFormatted('<p onclick="x()">a</p><img src=x onerror=y>')}`);
assert(sanitizeFormatted('<link class="npc" recordname="npc.goblin" style="x">Goblin</link>') === '<link class="npc" recordname="npc.goblin">Goblin</link>', "a link keeps its class and recordname only");
assert(sanitizeFormatted("<p>open <b>bold") === "<p>open <b>bold</b></p>", "unclosed tags are closed");
assert(sanitizeFormatted("plain words & more\nsecond line") === "plain words &amp; more\nsecond line", "plain text kept, & escaped");
console.log("ok formatted text");

// --- The table engine, by itself, with fixed dice.
const fixed = (values) => {
  const queue = [...values];
  return (formula) => ({ total: queue.length ? queue.shift() : 1, formula });
};
const weather = { name: "Weather", dice: "d6", tablerows: { a: { fromrange: 1, torange: 2, results: { a: { result: "Rain" } } }, b: { fromrange: 3, torange: 5, results: { a: { result: "Fog for [2d6] hours" } } }, c: { fromrange: 6, torange: 0, results: { a: { result: "Clear" } } } } };
assert(resultsAt(weather, 6)[0].text === "Clear" && resultsAt(weather, 9)[0].text === "Clear" && resultsAt(weather, -3)[0].text === "Rain", "torange 0 is fromrange; past either end clamps");
assert(tableFormula({ tablerows: { a: { fromrange: 2, torange: 6 }, b: { fromrange: 7, torange: 12 } } }) === "1d11+1", "a die from the rows' span");
assert(tableFormula({ dice: "d10,d100", tablerows: { a: { fromrange: 1, torange: 100 } } }) === "1d100", "old modules' d10,d100 is a d100");
let roll = rollTable(weather, { roll: fixed([4, 7]) });
assert(roll.results[0].text === "Fog for 7 hours", `[2d6] rolled into the result: ${roll.results[0].text}`);
const tables = {
  Treasure: { name: "Treasure", data: { dice: "d4", tablerows: { a: { fromrange: 1, torange: 4, results: { a: { result: "[2x] Gems", resultlink: { class: "table", recordname: "gems" } } } } } } },
  gems: { name: "Gems", data: { dice: "d2", tablerows: { a: { fromrange: 1, torange: 1, results: { a: { result: "Ruby" } } }, b: { fromrange: 2, torange: 2, results: { a: { result: "Jade, and [Treasure Chest]" } } } } } },
  "treasure chest": { name: "Treasure Chest", data: { dice: "d1", tablerows: { a: { fromrange: 1, torange: 1, results: { a: { result: "A chest" } } } } } },
  loop: { name: "Loop", data: { dice: "d1", tablerows: { a: { fromrange: 1, torange: 1, results: { a: { result: "again", resultlink: { class: "table", recordname: "loop" } } } } } } },
};
const find = (link) => tables[link.recordname] ?? tables[String(link.name ?? "").toLowerCase()] ?? null;
roll = rollTable(tables.Treasure.data, { name: "Treasure", roll: fixed([3, 2, 1, 2]), find });
assert(roll.results[0].text === "[2x] Gems" && roll.nested.length === 2 && roll.nested[0].results[0].text === "Ruby", `[2x] rolls the linked table twice: ${JSON.stringify(roll.nested.map((n) => n.results))}`);
assert(roll.nested[1].nested[0]?.results[0].text === "A chest", "a table named in brackets is rolled too");
roll = rollTable(tables.loop.data, { name: "Loop", roll: fixed([]), find });
let depth = 0;
for (let at = roll; at; at = at.nested[0]) depth += 1;
assert(depth === 10, `a table that links itself stops ten deep: ${depth}`);
const columns = { resultscols: 2, labelcol1: "Name", labelcol2: "Trait", dice: "d2", tablerows: { a: { fromrange: 1, torange: 2, results: { a: { result: "Bob" }, b: { result: "Grim" } } } } };
assert(rollTable(columns, { roll: fixed([1]), column: "Trait" }).results.map((r) => r.text).join() === "Grim" && rollTable(columns, { roll: fixed([1]) }).results.length === 2, "a column by its label; every column by default");
const imported = parseTableText("1-2  Goblin  Sly\n3. Orc  Brute\n4 - 6 Troll", {});
assert(Object.keys(imported.tablerows).length === 3 && imported.resultscols === 2 && imported.tablerows["id-00003"].fromrange === 4 && imported.tablerows["id-00003"].torange === 6, `simple import: ${JSON.stringify(imported)}`);
const csv = parseTableText('Roll,Name,Note\n1-3,"Smith, John",tall\n4,Ann,short', { delimiter: ",", header: true, ranges: true });
assert(csv.labelcol1 === "Name" && csv.tablerows["id-00001"].results["id-00001"].result === "Smith, John" && csv.tablerows["id-00002"].fromrange === 4, `delimited import: ${JSON.stringify(csv)}`);
console.log("ok table engine");

// --- Visibility as a list of names, through a save and reload.
const store = createRecordStore();
const gm = { role: "dm", name: "GM" };
const shared = store.create({ type: "npc", name: "Spy", visibility: ["Ann", "ann", " Bob "] }, gm);
assert(JSON.stringify(shared.visibility) === '["Ann","Bob"]', `names cleaned: ${JSON.stringify(shared.visibility)}`);
const reloaded = createRecordStore({ saved: JSON.parse(JSON.stringify(store.toJSON())) });
assert(JSON.stringify(reloaded.get(shared.id).visibility) === '["Ann","Bob"]', "kept through a save and reload");
assert(reloaded.list({ seat: { role: "player", name: "ann" } }).length === 1 && reloaded.list({ seat: { role: "player", name: "Cy" } }).length === 0, "Ann sees it; Cy does not");
console.log("ok visibility lists");

const server = createTableServer();
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const agent = server.agent;
  const join = (name) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
      const inbox = [];
      const raw = [];
      ws.on("message", (data) => {
        raw.push(data.toString());
        inbox.push(JSON.parse(data.toString()));
      });
      ws.on("error", reject);
      ws.on("open", () => ws.send(JSON.stringify({ type: "join", name, password: "" })));
      const poll = setInterval(() => {
        if (inbox.some((m) => m.type === "ok")) {
          clearInterval(poll);
          resolve({ ws, inbox, raw });
        }
      }, 10);
    });
  const latest = async (seat, test, label) => {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const found = [...seat.inbox].reverse().find(test);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`waiting for ${label}`);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 120));
  const ann = await join("a test player");
  const cy = await join("Cy");
  sockets.push(ann.ws, cy.ws);
  let req = 100;
  const ask = async (seat, body) => {
    req += 1;
    seat.ws.send(JSON.stringify({ ...body, req }));
    return latest(seat, (m) => m.type === "op-result" && m.req === req, body.type);
  };

  // --- Copies.
  const goblin = await tool("kraken_record_create", { type: "npc", name: "Goblin", data: { hp: 7, xp: 50, fgPath: "npc.goblin@Some Book" } });
  const copy = await tool("kraken_record_duplicate", { id: goblin.id });
  assert(copy.id !== goblin.id && copy.name === "Goblin (copy)" && copy.data.hp === 7 && !copy.data.fgPath && copy.source === "" && copy.visibility === "gm", `duplicate: ${JSON.stringify(copy)}`);
  assert((await ask(ann, { type: "record-copy", id: goblin.id })).ok === false, "a player cannot copy records");

  // --- Shared with one player: the named one gets it, the other does not.
  await tool("kraken_record_update", { id: copy.id, visibility: ["a test player"] });
  await latest(ann, (m) => m.type === "record" && m.record.id === copy.id, "the record reaches the named player");
  await settle();
  assert(!cy.inbox.some((m) => m.type === "record" && m.record.id === copy.id), "the other player never gets it");

  // --- Formatted text cleaned on the host: a player's own note.
  const note = await ask(ann, { type: "op", op: "create", input: { type: "note", name: "Mine", data: { text: '<p>Hello</p><script>steal()</script><b onmouseover="x">bold</b>' } } });
  assert(note.ok, `a player's note: ${note.error}`);
  const kept = agent.records.get(note.id).data.text;
  assert(kept === "<p>Hello</p>&lt;script&gt;steal()&lt;/script&gt;<b>bold</b>", `the note's text is cleaned: ${kept}`);

  // --- The story.
  const story = await tool("kraken_story", { action: "create", name: "Chapter one", chapter: "Act I", text: "<p>It begins.</p><frame>Read this aloud.</frame>" });
  await tool("kraken_story", { action: "add-block", id: story.id, kind: "image", link: { kind: "picture", book: "b", file: "f.png", label: "Map" } });
  await tool("kraken_story", { action: "add-block", id: story.id, kind: "text", text: "<p>Then <i>more</i>.</p>", at: 1 });
  let blocks = agent.records.get(story.id).data.blocks;
  assert(blocks.length === 3 && blocks[1].text === "<p>Then <i>more</i>.</p>" && blocks[2].kind === "image", `pages in order: ${JSON.stringify(blocks)}`);
  await tool("kraken_story", { action: "remove-block", id: story.id, at: 1 });
  blocks = agent.records.get(story.id).data.blocks;
  assert(blocks.length === 2 && blocks[0].text.includes("<frame>"), "a page removed, the boxed text kept");

  // --- Tables on the host's dice: a campaign table made, imported, rolled; a player's /rollon.
  const made = await tool("kraken_table", { action: "import", name: "Rumours", text: "1  The well is cursed\n2  The miller lies\n3  [1d4+10] goblins in the hills" });
  agent.dice.clearForced(); agent.dice.force([3, 2]);
  const rolled = await tool("kraken_table", { action: "roll", id: made.id });
  assert(rolled.roll === 3 && rolled.result === "12 goblins in the hills", `rolled: ${JSON.stringify(rolled)}`);
  const card = agent.chatLog(5).reverse().find((line) => line.roll?.label?.startsWith("[TABLE] Rumours"));
  assert(card && !card.secret && card.roll.label === "[TABLE] Rumours = 3: 12 goblins in the hills", `the chat card: ${JSON.stringify(card?.roll?.label)}`);
  await tool("kraken_table", { action: "edit", id: made.id, hiderollresults: 1 });
  agent.dice.clearForced(); agent.dice.force([1]);
  assert((await tool("kraken_table", { action: "roll", id: made.id })).secret === true, "hide roll results keeps it the GM's");
  await tool("kraken_table", { action: "edit", id: made.id, hiderollresults: 0, rows: [{ from: 1, to: 3, results: ["Anything"] }], labels: ["Rumour"] });
  assert(Object.keys(agent.records.get(made.id).data.tablerows).length === 1 && agent.records.get(made.id).data.labelcol1 === "Rumour", "the editor's rows saved");
  // A player rolls a table shared with them by name (/rollon Rumours), and not a hidden one.
  await tool("kraken_record_update", { id: made.id, visibility: "all" });
  agent.dice.clearForced(); agent.dice.force([2]);
  const theirs = await ask(ann, { type: "table-roll", action: "roll", name: "Rumours" });
  assert(theirs.ok && theirs.result.result === "Anything", `a player's /rollon: ${JSON.stringify(theirs)}`);
  await tool("kraken_record_update", { id: made.id, visibility: "gm" });
  assert((await ask(ann, { type: "table-roll", action: "roll", name: "Rumours" })).ok === false, "a hidden table is not the player's to roll");
  assert((await ask(ann, { type: "table-roll", action: "import", name: "X", text: "1 a" })).ok === false, "a player cannot make tables");
  // A player's roll reaches only what is theirs: no adventure table by path, no parcel, no GM table named inside one.
  await tool("kraken_table", { action: "import", name: "Secret Lair", text: "1  The vault under the chapel" });
  await tool("kraken_record_update", { id: made.id, visibility: "all" });
  assert((await ask(ann, { type: "table-roll", action: "roll", path: "tables.id-00001@Some Adventure" })).ok === false, "a player cannot roll an adventure's table by its path");
  assert((await ask(ann, { type: "table-roll", action: "roll", id: made.id, output: "parcel" })).ok === false, "a player cannot roll into a parcel");
  agent.dice.clearForced();
  const sneaky = await ask(ann, { type: "table-roll", action: "roll", name: "Mine", data: { dice: "d1", tablerows: { a: { fromrange: 1, torange: 1, results: { a: { result: "Look: [Secret Lair]" } } } } } });
  assert(sneaky.ok && !JSON.stringify(sneaky).includes("vault") && !agent.chatLog(5).some((line) => /vault/.test(line.roll?.label ?? "")), `a GM table named in a player's roll is not rolled: ${JSON.stringify(sneaky)}`);
  agent.dice.clearForced(); agent.dice.force([3, 2]);
  const real = await tool("kraken_table", { action: "roll", name: "Rumours" });
  assert(real.result === "Anything", "the GM's roll by name");
  // [2x] and [3] on the host's own dice.
  const twice = await tool("kraken_table", { action: "import", name: "Twice", text: "1  [2x] Rumours and [3] more" });
  agent.dice.clearForced(); agent.dice.force([1]);
  const rolledTwice = await tool("kraken_table", { action: "roll", id: twice.id });
  assert(rolledTwice.result === "[2x] Rumours and 3 more" && rolledTwice.results.filter((row) => row.table === "Rumours").length === 0, `[3] is a number, [2x] repeats links (none here): ${JSON.stringify(rolledTwice)}`);
  await tool("kraken_record_update", { id: made.id, visibility: "gm" });

  // --- Identification: nothing of the real item reaches a player's screen.
  const ring = await tool("kraken_record_create", { type: "item", name: "Ring of Sunfire", visibility: "all", data: { isidentified: 1, nonid_name: "Plain gold ring", nonid_notes: "Warm to the touch.", description: "Sunfire burns for 3d6.", cost: "5000 gp" } });
  await latest(ann, (m) => m.type === "record" && m.record.id === ring.id, "the identified ring");
  ann.raw.length = 0;
  await tool("kraken_item_identify", { id: ring.id, on: false });
  const seenRing = await latest(ann, (m) => m.type === "record" && m.record.id === ring.id && m.record.name === "Plain gold ring", "the ring unidentified");
  assert(seenRing.record.data.nonid_notes === "Warm to the touch." && !seenRing.record.data.description, `the player's ring: ${JSON.stringify(seenRing.record)}`);
  // Into the party's parcel, handed out to the player's character, the chat line about it.
  const hero = agent.records.create({ type: "character", name: "Aldric", owner: "a test player", visibility: "owner", data: { level: 1, exp: 0, hp: { total: 10, wounds: 0 }, attributes: {}, coins: {} } }, agent.seat);
  await tool("kraken_party_edit", { allPlayers: true });
  const parcel = await tool("kraken_parcel", { action: "create", name: "Dragon hoard" });
  await tool("kraken_parcel", { action: "add", id: parcel.id, item: ring.id });
  await tool("kraken_parcel", { action: "add", id: parcel.id, coin: "GP", amount: 30 });
  await tool("kraken_parcel", { action: "party", id: parcel.id });
  const partyNow = agent.records.get("party").data.parcel;
  const rowKey = Object.keys(partyNow.items).find((key) => partyNow.items[key].name === "Ring of Sunfire");
  assert(rowKey && partyNow.coins.GP === 30, `the parcel on the party sheet: ${JSON.stringify(partyNow)}`);
  agent.records.update("party", { data: { parcel: { items: { [rowKey]: { assign: "Aldric" } } } } }, agent.seat);
  await tool("kraken_party_distribute");
  await settle();
  const gear = Object.values(agent.records.get(hero.id).data.inventorylist ?? {});
  assert(gear.some((item) => item.name === "Ring of Sunfire" && item.isidentified === 0), `the GM's sheet keeps the real ring, unidentified: ${JSON.stringify(gear.map((item) => [item.name, item.isidentified]))}`);
  const sheet = await latest(ann, (m) => m.type === "record" && m.record.id === hero.id && Object.keys(m.record.data.inventorylist ?? {}).length > 0, "the character with the ring");
  assert(Object.values(sheet.record.data.inventorylist).some((item) => item.name === "Plain gold ring"), "the player's sheet shows the plain gold ring");
  const everything = ann.raw.join("\n");
  assert(!/Sunfire|5000 gp|3d6/.test(everything), `no frame to the player names the real ring: ${everything.match(/.{80}Sunfire.{80}/)?.[0]}`);
  assert(agent.chatLog(10).some((line) => /Plain gold ring \(1\) -> Aldric/.test(line.text)), "the distribution's chat line names the plain ring");
  // Identified, the player learns its name.
  const heroRow = Object.keys(agent.records.get(hero.id).data.inventorylist).find((key) => agent.records.get(hero.id).data.inventorylist[key].name === "Ring of Sunfire");
  await tool("kraken_item_identify", { id: hero.id, item: heroRow, on: true });
  await latest(ann, (m) => m.type === "record" && m.record.id === hero.id && Object.values(m.record.data.inventorylist ?? {}).some((item) => item.name === "Ring of Sunfire"), "the ring identified on the sheet");
  // A player may not identify it themselves.
  assert((await ask(ann, { type: "op", op: "update", id: hero.id, patch: { data: { inventorylist: { [heroRow]: { isidentified: 0 } } } } })).ok === false, "a player cannot change an item's identification");
  // The ring record is still unidentified, but the copy on Aldric's sheet is known now: a line naming
  // the real ring reaches the player as written (the same name, one known and one not).
  assert(agent.records.get(ring.id).data.isidentified === 0, "the ring record itself is still unidentified");
  ann.raw.length = 0;
  await tool("kraken_chat_send", { text: "Aldric raises the Ring of Sunfire." });
  await latest(ann, (m) => m.type === "chat" && /raises the/.test(JSON.stringify(m)), "the line about the known ring");
  assert(ann.raw.some((frame) => frame.includes("raises the Ring of Sunfire")), `a known item's name is not swapped for its unidentified twin's: ${ann.raw.join("\n").match(/.{40}raises the.{40}/)?.[0]}`);
  // What a sheet works out from an unidentified weapon and armour (5E's attacks, the armour worn), the
  // tracker's view of the character and a chat line about it: none names the real items to the player.
  ann.raw.length = 0;
  const fighter = agent.records.create(
    {
      type: "character",
      name: "Brenna",
      owner: "a test player",
      visibility: "owner",
      data: {
        ruleset: "dnd5e",
        level: 3,
        hp: { total: 20, wounds: 0 },
        inventorylist: { "id-00001": { name: "Flame Tongue Longsword", nonid_name: "Ornate longsword", isidentified: 0, type: "Weapon", damage: "1d8 slashing", carried: 2 }, "id-00002": { name: "Mithral Breastplate", nonid_name: "Silvery breastplate", isidentified: 0, type: "Armor", subtype: "Medium Armor", ac: 14, carried: 2 } },
        attacks: { "id-00001": { name: "Flame Tongue Longsword", bonus: 5, damage: "1d8+3" } },
        ac: { total: 16, wearing: "Mithral Breastplate" },
      },
    },
    agent.seat,
  );
  await tool("kraken_combat", { action: "add", recordId: fighter.id }).catch(() => undefined);
  agent.say("Brenna draws the Flame Tongue Longsword.", "GM");
  await latest(ann, (m) => m.type === "chat" && /draws the/.test(m.text ?? ""), "the chat line");
  await settle();
  const seen = ann.raw.join("\n");
  assert(!/Flame Tongue|Mithral/.test(seen) && /Ornate longsword/.test(seen) && /Silvery breastplate/.test(seen), `the player's frames name only the unidentified weapon and armour: ${seen.match(/.{60}(Flame Tongue|Mithral).{60}/)?.[0]}`);
  assert(agent.chatLog(3).some((line) => /Flame Tongue/.test(line.text ?? "")), "the GM's log keeps the real name");
  console.log("ok identification");

  // --- A parcel onto one character.
  const purse = await tool("kraken_parcel", { action: "create", name: "Purse" });
  await tool("kraken_parcel", { action: "add", id: purse.id, name: "Silver locket" });
  await tool("kraken_parcel", { action: "add", id: purse.id, coin: "SP", amount: 12 });
  const given = await tool("kraken_parcel", { action: "character", id: purse.id, character: hero.id });
  const heroNow = agent.records.get(hero.id).data;
  assert(given.given.length === 2 && Object.values(heroNow.inventorylist).some((item) => item.name === "Silver locket") && Object.values(heroNow.coins).some((coin) => coin.name === "SP" && coin.amount === 12), `a parcel dropped on a sheet: ${JSON.stringify(given)}`);
  // A table's results into a parcel.
  const loot = await tool("kraken_table", { action: "import", name: "Loot", text: "1  25 GP\n2  A silver comb" });
  agent.dice.clearForced(); agent.dice.force([1]);
  const filled = await tool("kraken_table", { action: "roll", id: loot.id, output: "parcel" });
  assert(filled.parcel && Object.values(agent.records.get(filled.parcel).data.coinlist).some((coin) => coin.description === "GP" && coin.amount === 25), `a table output to a parcel: ${JSON.stringify(agent.records.get(filled.parcel)?.data)}`);

  // --- An encounter: NPCs with a count or dice, onto the tracker, its XP to the party sheet.
  const battle = await tool("kraken_encounter", { action: "create", name: "Ambush" });
  await tool("kraken_encounter", { action: "add-npc", id: battle.id, npc: goblin.id, count: "2" });
  await tool("kraken_encounter", { action: "add-npc", id: battle.id, npc: copy.id, count: "1d4+1", faction: "neutral" });
  assert((await tool("kraken_encounter", { action: "xp", id: battle.id })).xp === 150, "XP: two goblins at 50 and one copy (dice count as one)");
  agent.dice.clearForced();
  agent.dice.clearForced(); agent.dice.force([2]);
  const run = await tool("kraken_encounter", { action: "run", id: battle.id, place: false });
  assert(run.added.length === 5, `2 goblins and 1d4+1 = 3 copies on the tracker: ${run.added.join(", ")}`);
  // Place on this map: where the tokens stand is kept; the next Add to tracker puts hidden tokens there.
  const scene = { id: "scene-test", name: "Bridge", width: 1000, height: 800, padding: 0, backgroundColor: "#000", grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, walls: [], lights: [], tokens: [] };
  agent.map.setScene(scene);
  const solo = await tool("kraken_encounter", { action: "create", name: "Bridge troll" });
  await tool("kraken_encounter", { action: "add-npc", id: solo.id, npc: goblin.id, count: "1" });
  await tool("kraken_token_place", { recordId: goblin.id, x: 425, y: 275 });
  const placed = await tool("kraken_encounter", { action: "place", id: solo.id });
  assert(placed.placed >= 1, `spots kept: ${JSON.stringify(placed)}`);
  for (const token of agent.map.tokens()) agent.map.remove?.(token.id, agent.seat);
  for (const token of agent.map.tokens()) await tool("kraken_token_remove", { id: token.id }).catch(() => undefined);
  await tool("kraken_encounter", { action: "run", id: solo.id });
  const put = agent.map.tokens().filter((token) => token.recordId === goblin.id);
  assert(put.length >= 1 && put.every((token) => token.hidden) && put.some((token) => Math.abs(token.x - 425) < 30 && Math.abs(token.y - 275) < 30), `a hidden token at the kept spot: ${JSON.stringify(put.map((token) => [token.x, token.y, token.hidden]))}`);
  const ended = await tool("kraken_encounter", { action: "end", id: battle.id });
  assert(ended.xp === 150 && agent.records.get("party").data.encounters[battle.id].xp === 150, "the encounter's XP on the party sheet");
  // --- A quest onto the party sheet's XP tab.
  const quest = await tool("kraken_quest", { action: "create", name: "Find the miller", xp: 90, text: "<p>He went north.</p>" });
  await tool("kraken_quest", { action: "party", id: quest.id });
  assert(agent.records.get("party").data.quests[quest.id].xp === 90, "the quest on the party sheet");
  console.log("CONTENT_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
