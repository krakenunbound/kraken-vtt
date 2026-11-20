const { readModule } = require("./importers/fgModule.cjs");

// FG's Library for an adventure module, on the host: its NPCs (to the combat
// tracker), its encounters (FG's battles: their NPCs on the tracker, their
// tokens where FG placed them on the map that is open), its treasure parcels
// (to the party sheet's parcel), its tables (rolled by the host's dice) and
// its story entries (FG's Story list: the adventure's text, read by the GM).
// The module is read in place, its records kept in memory a few at a time.

// image: every picture (FG's Images & Maps: maps, handouts, portraits); map: only the maps.
const KINDS = { image: "image", map: "image", npc: "npc", battle: "battle", parcel: "treasureparcels", table: "tables", story: "encounter" };
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

function list(moduleName, kind, search = "") {
  const type = KINDS[kind];
  if (!type) throw new Error("Which list? image, map, npc, battle, parcel, table or story.");
  const want = String(search).toLowerCase();
  const maps = kind === "map" || kind === "image" ? require("./importers/fgMaps.cjs") : null;
  return moduleRecords(moduleName)
    .filter((record) => record.type === type && (!want || String(record.name).toLowerCase().includes(want)))
    // A module's maps (not its handouts and portraits), each with its picture.
    .filter((record) => !maps || ((kind === "image" || maps.isMap(record)) && maps.mapPicture(record)))
    .map((record) => {
      const out = { path: record.data.fgPath, name: record.name, category: record.data.fgCategory ?? "" };
      if (kind === "battle") out.npcs = rows(record.data.npclist).map((row) => `${row.count ?? 1} ${row.name}`).join(", ");
      if (kind === "npc") out.summary = [record.data.hdtext ? `HD ${record.data.hdtext}` : "", record.data.ac != null && record.data.ac !== "" ? `AC ${record.data.ac.total ?? record.data.ac}` : "", record.data.attackstext ?? ""].filter(Boolean).join(" · ");
      if (kind === "parcel") out.summary = [...rows(record.data.itemlist).map((item) => item.name), ...rows(record.data.coinlist).map((coin) => `${coin.amount} ${coin.description ?? coin.name ?? ""}`)].join(", ").slice(0, 200);
      if (kind === "image") {
        out.file = maps.mapPicture(record);
        out.map = maps.isMap(record);
      }
      if (kind === "map") {
        out.file = maps.mapPicture(record);
        const grid = Number(String(record.data.image?.gridsize ?? "").split(",")[0]) || 0;
        out.summary = grid ? `grid ${grid}px` : "";
      }
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
// battle: a module's encounter by its FG path, or a campaign encounter record
// (kraken_encounter: its NPCs the campaign's own, a count that may be dice,
// rolled now, and spots kept per scene).
async function addBattle(table, fgPath, { place = true } = {}) {
  const battle = typeof fgPath === "object" && fgPath ? fgPath : find(moduleOf(fgPath), fgPath);
  const frame = table.map.frame();
  const sceneId = (table.map.scene?.() ?? table.scene?.())?.id ?? null;
  const added = [];
  for (const row of rows(battle.data.npclist)) {
    const npcPath = row.link?.recordname;
    if (!npcPath) continue;
    const record = table.records.get(npcPath)?.type === "npc" ? table.records.get(npcPath) : ensureNpc(table, npcPath);
    const counted = /d/i.test(String(row.count ?? "")) ? table.dice.roll(String(row.count).replace(/\s+/g, "")).total : Number(row.count);
    const count = Math.max(1, Math.min(20, counted || 1));
    // Kraken's own spots (a campaign encounter's, by scene), or FG's (by its image).
    const own = rows(row.maplink).filter((spot) => spot.scene && spot.scene === sceneId);
    const spots = own.length ? own : rows(row.maplink).filter((spot) => frame && String(spot.imageref?.recordname ?? "").replace(/\.image@.*$|@.*$/g, "") === frame.image);
    const entries = await table.combat.add({ recordId: record.id, count, hidden: false, ...(row.faction ? { faction: row.faction } : {}) }, table.seat);
    const list = Array.isArray(entries) ? entries : [entries];
    list.forEach((entry, index) => {
      const spot = spots[index];
      if (!place || !spot || (!frame && !own.length)) return;
      // FG's map position: from the picture's centre, y up; Kraken's: the map's own.
      const x = own.length ? Number(spot.x) : frame.width / 2 + Number(spot.imagex);
      const y = own.length ? Number(spot.y) : frame.height / 2 - Number(spot.imagey);
      const unknown = String(row.unidentified ?? "").trim() || (Number(record.data?.isidentified) === 0 && record.data?.nonid_name ? String(record.data.nonid_name) : "");
      const token = table.map.place({ recordId: record.id, name: entry.name, x, y, hidden: true, ...(unknown ? { unidentified: unknown } : {}), faction: row.faction === "friend" ? "friend" : row.faction === "neutral" ? "neutral" : "foe", allowSecond: true }, table.seat);
      // Hidden on the map is hidden in the tracker too (and from the turn card): the eye reveals both together.
      table.combat.update(entry.id, { tokenId: token.id, hidden: true }, table.seat);
    });
    added.push(...list.map((entry) => entry.name));
  }
  table.say(`[ENCOUNTER] ${battle.name}: ${added.join(", ")}${frame || !battle.source ? "" :" (no map open: tokens not placed)"}.`, "Combat", true);
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

// A table rolled on the host (the table engine, shared/tables/roll.mjs: FG's
// dice and modifier, the row its total falls in, linked tables rolled too),
// for the GM's eyes, as the Library is the GM's.
function rollTable(table, fgPath, from = "GM") {
  return require("./content.cjs").rollOn(table, { path: fgPath, hide: true }, table.seat, from);
}

// A story entry's text, as safe HTML (FG's formatted text; its links are not followed).
function storyEntry(fgPath) {
  const record = find(moduleOf(fgPath), fgPath);
  const { toHtml } = require("./books.cjs");
  const html = typeof record.data.text === "string" ? toHtml(record.data.text, () => null) : "";
  // The entries before and after it, in the Story list's order (its arrows step through them).
  const order = list(moduleOf(fgPath), "story");
  const at = order.findIndex((item) => item.path === fgPath);
  const near = (item) => (item ? { path: item.path, name: item.name } : null);
  return { path: fgPath, name: record.name, category: record.data.fgCategory ?? "", html, prev: at > 0 ? near(order[at - 1]) : null, next: at >= 0 ? near(order[at + 1]) : null };
}

// A book's random tables, as records (the 2E krits read their book's).
function tables(moduleName) {
  return moduleRecords(moduleName).filter((record) => record.type === KINDS.table);
}

module.exports = { useShelf, resolved: (name) => resolveBook(name), tables, list, find, moduleOf, ensureNpc, addBattle, giveParcel, rollTable, storyEntry, KINDS };
