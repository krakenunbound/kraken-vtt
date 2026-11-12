const { readModule } = require("./importers/fgModule.cjs");

// FG's Library for an adventure module, on the host: its NPCs (to the combat
// tracker), its encounters (FG's battles: their NPCs on the tracker, their
// tokens where FG placed them on the map that is open), its treasure parcels
// (to the party sheet's parcel), its tables (rolled by the host's dice) and
// its story entries (FG's Story list: the adventure's text, read by the GM).
// The module is read in place, its records kept in memory a few at a time.

const KINDS = { npc: "npc", battle: "battle", parcel: "treasureparcels", table: "tables", story: "encounter" };
const cache = new Map();
// The GM's shelf: a book named by its id, its name or its title is read from
// its own file (a pack, a module whose file name is not its name, a bundled book).
let resolveBook = (name) => name;
function useShelf(resolve) {
  resolveBook = (name) => resolve(name) ?? name;
}
function moduleRecords(moduleName) {
  let records = cache.get(moduleName);
  if (!records) {
    records = readModule(resolveBook(moduleName), { only: new Set(Object.values(KINDS)) }).records;
    cache.set(moduleName, records);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
  }
  return records;
}
const rows = (value) => Object.values(value && typeof value === "object" ? value : {}).filter((row) => row && typeof row === "object");
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function list(moduleName, kind, search = "") {
  const type = KINDS[kind];
  if (!type) throw new Error("Which list? npc, battle, parcel, table or story.");
  const want = String(search).toLowerCase();
  return moduleRecords(moduleName)
    .filter((record) => record.type === type && (!want || String(record.name).toLowerCase().includes(want)))
    .map((record) => {
      const out = { path: record.data.fgPath, name: record.name, category: record.data.fgCategory ?? "" };
      if (kind === "battle") out.npcs = rows(record.data.npclist).map((row) => `${row.count ?? 1} ${row.name}`).join(", ");
      if (kind === "npc") out.summary = [record.data.hdtext ? `HD ${record.data.hdtext}` : "", record.data.ac ? `AC ${record.data.ac.total}` : "", record.data.attackstext ?? ""].filter(Boolean).join(" · ");
      if (kind === "parcel") out.summary = [...rows(record.data.itemlist).map((item) => item.name), ...rows(record.data.coinlist).map((coin) => `${coin.amount} ${coin.description ?? coin.name ?? ""}`)].join(", ").slice(0, 200);
      if (kind === "table") out.summary = `${record.data.dice ?? ""}${Number(record.data.mod) ? `+${record.data.mod}` : ""}`;
      return out;
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function find(moduleName, fgPath) {
  const record = moduleRecords(moduleName).find((item) => item.data.fgPath === fgPath);
  if (!record) throw new Error(`Nothing at ${fgPath} in ${moduleName}.`);
  return record;
}
const moduleOf = (fgPath) => String(fgPath).split("@").slice(1).join("@");

// The NPC as a campaign record (made once, kept for the GM).
function ensureNpc(table, fgPath) {
  const existing = table.records.list({ type: "npc" }).find((record) => record.data?.fgPath === fgPath);
  if (existing) return existing;
  const source = find(moduleOf(fgPath), fgPath);
  return table.records.create({ id: source.id, type: "npc", name: source.name, visibility: "gm", data: source.data }, table.seat);
}

// An encounter onto the combat tracker; tokens where FG put them when that map is open.
async function addBattle(table, fgPath, { place = true } = {}) {
  const battle = find(moduleOf(fgPath), fgPath);
  const frame = table.map.frame();
  const added = [];
  for (const row of rows(battle.data.npclist)) {
    const npcPath = row.link?.recordname;
    if (!npcPath) continue;
    const record = ensureNpc(table, npcPath);
    const count = Math.max(1, Math.min(20, Number(row.count) || 1));
    const spots = rows(row.maplink).filter((spot) => frame && String(spot.imageref?.recordname ?? "").replace(/\.image@.*$|@.*$/g, "") === frame.image);
    const entries = await table.combat.add({ recordId: record.id, count, hidden: false }, table.seat);
    const list = Array.isArray(entries) ? entries : [entries];
    list.forEach((entry, index) => {
      const spot = spots[index];
      if (!place || !spot || !frame) return;
      // FG's map position: from the picture's centre, y up.
      const x = frame.width / 2 + Number(spot.imagex);
      const y = frame.height / 2 - Number(spot.imagey);
      const token = table.map.place({ recordId: record.id, name: entry.name, x, y, hidden: true, faction: row.faction === "friend" ? "friend" : row.faction === "neutral" ? "neutral" : "foe", allowSecond: true }, table.seat);
      table.combat.update(entry.id, { tokenId: token.id }, table.seat);
    });
    added.push(...list.map((entry) => entry.name));
  }
  table.say(`[ENCOUNTER] ${battle.name}: ${added.join(", ")}${frame ? "" : " (no FG map open: tokens not placed)"}.`, "Combat", true);
  return { encounter: battle.name, added };
}

// A treasure parcel into the party sheet's parcel (coins and items), for the GM to hand out.
function giveParcel(table, fgPath, party) {
  const parcel = find(moduleOf(fgPath), fgPath);
  const coins = {};
  for (const coin of rows(parcel.data.coinlist)) {
    const name = String(coin.description ?? coin.name ?? "GP").toUpperCase().slice(0, 6) || "GP";
    coins[name] = (coins[name] ?? 0) + (Number(coin.amount) || 0);
  }
  const items = rows(parcel.data.itemlist).map((item) => ({ name: String(item.name ?? "Item"), count: Number(item.count) || 1, item: item }));
  return party.addToParcel(table, { coins, items, from: parcel.name });
}

// A table rolled on the host: FG's dice and modifier, the row whose range it falls in.
function rollTable(table, fgPath, from = "GM") {
  const record = find(moduleOf(fgPath), fgPath);
  const dice = String(record.data.dice ?? "d20").replace(/^d/i, "1d");
  const mod = Number(record.data.mod) || 0;
  const roll = table.dice.roll(`${dice}${mod ? (mod > 0 ? `+${mod}` : mod) : ""}`);
  const row = rows(record.data.tablerows).find((item) => roll.total >= Number(item.fromrange) && roll.total <= Number(item.torange));
  const result = row ? rows(row.results).map((cell) => plain(cell.result)).filter(Boolean).join(" · ") : "(no row)";
  table.postRoll(roll, `[TABLE] ${record.name} = ${roll.total}: ${result}`, from, true, { result: result.slice(0, 120) });
  return { table: record.name, roll: roll.total, result };
}

// A story entry's text, as safe HTML (FG's formatted text; its links are not followed).
function storyEntry(fgPath) {
  const record = find(moduleOf(fgPath), fgPath);
  const { toHtml } = require("./books.cjs");
  const html = typeof record.data.text === "string" ? toHtml(record.data.text, () => null) : "";
  return { path: fgPath, name: record.name, category: record.data.fgCategory ?? "", html };
}

// A book's random tables, as records (the 2E krits read their book's).
function tables(moduleName) {
  return moduleRecords(moduleName).filter((record) => record.type === KINDS.table);
}

module.exports = { useShelf, resolved: (name) => resolveBook(name), tables, list, ensureNpc, addBattle, giveParcel, rollTable, storyEntry, KINDS };
