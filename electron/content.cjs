// The campaign's own content, on the host: copies of records (FG's
// Duplicate, and Copy to campaign for a book's), the campaign's story (FG's
// story records, with pages), random tables (rolled, made, imported from
// pasted text), item identification, encounters (FG's battle records),
// treasure parcels and quests. Every action is one function taking the
// table's agent handle (what the GM and the agent act through), so the
// table's message and the agent's tool go the same way.
const { rollTable, flatResults, resultWords, parseTableText, isTable } = require("../shared/tables/roll.mjs");
const { plainOf } = require("../shared/text/formatted.mjs");
const { unidentified, itemName } = require("./records.cjs");

const text = (value, max = 120) => String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
const rows = (value) => Object.entries(value && typeof value === "object" ? value : {}).filter(([, row]) => row && typeof row === "object");
const nextKey = (list) => `id-${String(Object.keys(list ?? {}).length + 1).padStart(5, "0")}`;
const must = (table, id, type) => {
  const record = table.records.get(String(id ?? ""));
  if (!record || (type && ![].concat(type).includes(record.type))) throw new Error(`No ${[].concat(type ?? "record").join(" or ")} ${id ?? ""}.`);
  return record;
};

// --- Copies -------------------------------------------------------------------

// FG's Duplicate (a campaign record, "(copy)") and Copy to campaign (a book's
// record, its own name, the book's path dropped so it is the campaign's own).
async function copyRecord(table, { id, name, book, path }, readBook = table.readBookRecord) {
  if (book && path) {
    const found = await readBook?.(book, path);
    if (!found) throw new Error(`No record ${path} in ${book}.`);
    return table.records.duplicate("", table.seat, { name: name ?? found.name, record: found });
  }
  const record = must(table, id);
  return table.records.duplicate(record.id, table.seat, { name: name ?? (record.source ? record.name : `${record.name} (copy)`) });
}

// --- Story --------------------------------------------------------------------
// A story record (FG's story, with the Story Template's pages): its chapter
// (the list's category), its order in it, and its pages in order: text (FG's
// formatted text), a picture (a link), or a book page (a link).

const BLOCK_KINDS = new Set(["text", "image", "page"]);
function cleanBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .slice(0, 200)
    .filter((block) => block && BLOCK_KINDS.has(block.kind))
    .map((block) => ({ kind: block.kind, ...(block.kind === "text" ? { text: String(block.text ?? "") } : { link: block.link && typeof block.link === "object" ? block.link : null }) }));
}
function storyAction(table, args) {
  const action = String(args.action ?? "");
  if (action === "create") {
    const blocks = cleanBlocks(args.blocks ?? (args.text ? [{ kind: "text", text: args.text }] : [{ kind: "text", text: "" }]));
    return table.records.create({ type: "story", name: text(args.name) || "New story", visibility: args.visibility ?? "gm", data: { chapter: text(args.chapter, 80), order: Number(args.order) || 0, blocks } }, table.seat);
  }
  if (action === "copy") {
    // An adventure's story entry (FG's Story list, read from the module) as the campaign's own.
    const library = require("./library.cjs");
    const entry = library.find(library.moduleOf(String(args.path ?? "")), String(args.path ?? ""));
    const words = typeof entry.data.text === "string" ? entry.data.text : "";
    return table.records.create({ type: "story", name: text(args.name) || entry.name, visibility: "gm", data: { chapter: text(entry.data.fgCategory, 80), order: 0, blocks: [{ kind: "text", text: words }] } }, table.seat);
  }
  const record = must(table, args.id, "story");
  if (action === "set") {
    const data = {};
    if (args.chapter !== undefined) data.chapter = text(args.chapter, 80);
    if (args.order !== undefined) data.order = Number(args.order) || 0;
    if (args.blocks !== undefined) data.blocks = cleanBlocks(args.blocks);
    return table.records.update(record.id, { ...(args.name !== undefined ? { name: text(args.name) } : {}), data }, table.seat);
  }
  if (action === "add-block") {
    const blocks = cleanBlocks(record.data.blocks);
    const block = cleanBlocks([{ kind: args.kind ?? "text", text: args.text, link: args.link }])[0];
    if (!block) throw new Error("A page is text, image or page.");
    const at = Number.isInteger(args.at) ? Math.max(0, Math.min(blocks.length, args.at)) : blocks.length;
    blocks.splice(at, 0, block);
    return table.records.update(record.id, { data: { blocks } }, table.seat);
  }
  if (action === "remove-block") {
    const blocks = cleanBlocks(record.data.blocks).filter((_, index) => index !== Number(args.at));
    return table.records.update(record.id, { data: { blocks } }, table.seat);
  }
  throw new Error("kraken_story does create, copy, set, add-block or remove-block.");
}

// --- Random tables ------------------------------------------------------------

const TABLE_TYPES = new Set(["table", "tables"]);
// A table by a link: a campaign record's id, a book path (FG's recordname), or a name.
// seat: a player's (only the campaign's tables shared with them); none, the GM's (the active books' too).
function findTable(table, link, seat = null) {
  const want = String(link?.recordname ?? link?.id ?? "").trim();
  const name = String(link?.name ?? "").trim().toLowerCase();
  const player = seat && seat.role !== "dm";
  const campaign = table.records.list(player ? { seat } : {}).filter((record) => isTable(record.data));
  const matchOf = (record) => (want && (record.id === want || record.data?.fgPath === want || String(record.data?.fgPath ?? "").replace(/@.*$/, "") === want.replace(/@.*$/, ""))) || (name && record.name.toLowerCase() === name);
  const found = campaign.find(matchOf) ?? (player ? null : (table.bookTables?.() ?? []).find(matchOf));
  return found ? { name: found.name, data: found.data, id: found.id } : null;
}
// The table asked for: a record (id), a book's (path), or by name; a player only one they can see.
function tableTarget(table, args, seat) {
  // A table read from a book's page (a rulebook's, which the campaign does not copy in): rolled as the reader has it.
  if (args.data && isTable(args.data)) return { name: text(args.name) || "Table", data: args.data, id: "" };
  if (args.id) {
    const record = table.records.get(String(args.id), seat);
    if (!record || !isTable(record.data)) throw new Error(`No table ${args.id}.`);
    return { name: record.name, data: record.data, id: record.id };
  }
  if (args.path) {
    // An adventure's table (the Library's) is the GM's.
    if (seat && seat.role !== "dm") throw new Error("That table is the GM's.");
    const library = require("./library.cjs");
    const record = library.find(library.moduleOf(String(args.path)), String(args.path));
    return { name: record.name, data: record.data, id: record.id };
  }
  const found = findTable(table, { name: args.name }, seat);
  if (!found) throw new Error(`No table called ${args.name ?? ""}.`);
  return found;
}
// Rolls a table on the host's dice (FG's table roll and /rollon): its card in
// chat with what it rolled, a result's link kept with it, linked tables
// rolled in turn; hide (or the table's "hide roll results"): the GM's alone.
// output "parcel" (or the table's own output): the results into a new
// treasure parcel (FG's table output to a parcel).
function rollOn(table, args, seat = table.seat, from = "GM") {
  const target = tableTarget(table, args, seat);
  const player = seat.role !== "dm";
  if (player && args.output) throw new Error("Only the GM rolls a table into a parcel.");
  const roll = rollTable(target.data, { name: target.name, roll: (formula) => table.dice.roll(formula), find: (link) => findTable(table, link, seat), column: args.column, dice: args.dice, secret: args.hide === true });
  const post = (one) => {
    const links = one.results.filter((result) => result.link).map((result) => ({ class: result.link.class, recordname: result.link.recordname, name: plainOf(result.text) }));
    const words = plainOf(resultWords(one));
    table.postRoll(one.rolled, `[TABLE] ${one.name} = ${one.total}: ${words}`, from, one.secret, { result: words.slice(0, 120), ...(links.length ? { links } : {}) });
    one.nested.forEach(post);
  };
  post(roll);
  const output = player ? "" : String(args.output ?? target.data.output ?? "");
  const parcel = output === "parcel" ? parcelFromRoll(table, roll) : null;
  return { table: target.name, roll: roll.total, result: plainOf(resultWords(roll)), results: flatResults(roll).map((result) => ({ table: result.table, label: result.label, text: plainOf(result.text), link: result.link })), secret: roll.secret, ...(parcel ? { parcel: parcel.id } : {}) };
}
function tableAction(table, args, seat = table.seat, from = "GM") {
  const action = String(args.action ?? "roll");
  if (action === "roll") return rollOn(table, args, seat, from);
  if (seat.role !== "dm") throw new Error("Only the GM makes and changes tables.");
  if (action === "create") {
    const data = { dice: text(args.dice, 40), mod: Number(args.mod) || 0, resultscols: 1, labelcol1: "Result", tablerows: {}, ...(args.data && typeof args.data === "object" ? args.data : {}) };
    return table.records.create({ type: "table", name: text(args.name) || "New table", visibility: args.visibility ?? "gm", data }, table.seat);
  }
  if (action === "import") {
    const data = parseTableText(String(args.text ?? "").slice(0, 200000), { delimiter: args.delimiter ?? "", header: args.header === true, ranges: args.ranges === true });
    if (!rows(data.tablerows).length) throw new Error("Nothing to import: paste the table's rows.");
    return table.records.create({ type: "table", name: text(args.name) || "Imported table", visibility: "gm", data: { dice: "", mod: 0, ...data } }, table.seat);
  }
  const record = must(table, args.id);
  if (!isTable(record.data) && !TABLE_TYPES.has(record.type)) throw new Error(`${record.name} is not a table.`);
  // edit: the whole table (rows, ranges, columns, die), as the table editor saves it.
  if (action === "edit") {
    const patch = {};
    for (const key of ["dice", "mod", "resultscols", "hiderollresults", "output", "description"]) if (args[key] !== undefined) patch[key] = args[key];
    if (args.labels) Object.assign(patch, ...[].concat(args.labels).slice(0, 30).map((label, index) => ({ [`labelcol${index + 1}`]: text(label, 80) })));
    if (args.rows) patch.tablerows = rowsFromList(args.rows);
    const data = { ...record.data, ...patch };
    return table.records.update(record.id, { ...(args.name !== undefined ? { name: text(args.name) } : {}), data }, table.seat, { replace: true });
  }
  throw new Error("kraken_table does roll, create, edit or import.");
}
// The editor's rows ([{ from, to, results: [text...] }]) as FG's tablerows.
function rowsFromList(list) {
  const out = {};
  [].concat(list).slice(0, 1000).forEach((row, index) => {
    const results = {};
    [].concat(row?.results ?? []).slice(0, 30).forEach((cell, at) => {
      const value = cell && typeof cell === "object" ? cell : { result: cell };
      results[`id-${String(at + 1).padStart(5, "0")}`] = { result: String(value.result ?? "").slice(0, 4000), ...(value.resultlink?.recordname ? { resultlink: { class: text(value.resultlink.class, 40), recordname: text(value.resultlink.recordname, 300) } } : {}) };
    });
    const from = Number(row?.from) || index + 1;
    out[`id-${String(index + 1).padStart(5, "0")}`] = { fromrange: from, torange: Number(row?.to) || from, results };
  });
  return out;
}

// --- Identification -----------------------------------------------------------
// FG's Identified toggle (the GM's): an item record, or an item in a
// character's gear or the party's parcel. Unidentified, the players see its
// unidentified name and notes only (records.cjs viewFor).
function identify(table, { id, item, on = true, name, notes }) {
  const record = must(table, id);
  const flag = on ? 1 : 0;
  const words = { ...(name !== undefined ? { nonid_name: text(name) } : {}), ...(notes !== undefined ? { nonid_notes: String(notes).slice(0, 4000) } : {}) };
  if (!item) {
    if (record.type !== "item") throw new Error(`${record.name} is not an item: name the item in it (item).`);
    return table.records.update(record.id, { data: { isidentified: flag, ...words } }, table.seat);
  }
  const key = String(item);
  const list = record.type === "party" ? "parcel" : "inventorylist";
  const holder = record.type === "party" ? record.data.parcel?.items : record.type === "treasureparcel" ? record.data.itemlist : record.data.inventorylist;
  const row = holder?.[key];
  if (!row) throw new Error(`No item ${key} in ${record.name}.`);
  const patch = row.item && typeof row.item === "object" ? { item: { isidentified: flag, ...words } } : { isidentified: flag, ...words };
  const data = record.type === "party" ? { parcel: { items: { [key]: patch } } } : record.type === "treasureparcel" ? { itemlist: { [key]: patch } } : { [list]: { [key]: patch } };
  return table.records.update(record.id, { data }, table.seat);
}

// --- Treasure parcels ---------------------------------------------------------
// A parcel (FG's treasure parcel): items (each the item's whole record, its
// identification kept) and coins in the game's money.
function newParcel(table, name) {
  return table.records.create({ type: "treasureparcel", name: text(name) || "Treasure", visibility: "gm", data: { itemlist: {}, coinlist: {} } }, table.seat);
}
function parcelFromRoll(table, roll) {
  const parcel = newParcel(table, `[ROLL] ${roll.name}`);
  for (const result of flatResults(roll)) {
    const record = result.link ? table.records.get(result.link.recordname) : null;
    if (record?.type === "item") addToParcel(table, parcel.id, { item: record.id });
    else {
      const coin = /^\s*(\d+)\s*([a-z]{1,6})\s*$/i.exec(plainOf(result.text));
      if (coin) addToParcel(table, parcel.id, { coin: coin[2].toUpperCase(), amount: Number(coin[1]) });
      else if (plainOf(result.text) && plainOf(result.text) !== "-") addToParcel(table, parcel.id, { name: plainOf(result.text) });
    }
  }
  return table.records.get(parcel.id);
}
function addToParcel(table, id, { item, name, count = 1, coin, amount }) {
  const parcel = must(table, id, "treasureparcel");
  if (coin) {
    const list = parcel.data.coinlist ?? {};
    const found = rows(list).find(([, row]) => String(row.description ?? "").toUpperCase() === String(coin).toUpperCase());
    const key = found?.[0] ?? nextKey(list);
    return table.records.update(parcel.id, { data: { coinlist: { [key]: { description: text(coin, 12).toUpperCase(), amount: (Number(found?.[1].amount) || 0) + (Number(amount) || 0) } } } }, table.seat);
  }
  const source = item ? must(table, item) : null;
  const data = source ? { ...structuredClone(source.data), name: source.name } : { name: text(name) || "Item" };
  delete data.fgPath;
  const list = parcel.data.itemlist ?? {};
  return table.records.update(parcel.id, { data: { itemlist: { [nextKey(list)]: { ...data, count: Math.max(1, Number(count) || 1) } } } }, table.seat);
}
// The parcel as the party sheet's parcel takes it (library.giveParcel's shape).
function parcelContents(parcel) {
  const coins = {};
  for (const [, coin] of rows(parcel.data.coinlist)) {
    const name = String(coin.description ?? coin.name ?? "GP").toUpperCase().slice(0, 6) || "GP";
    coins[name] = (coins[name] ?? 0) + (Number(coin.amount) || 0);
  }
  const items = rows(parcel.data.itemlist).map(([, item]) => ({ name: String(item.name ?? "Item"), count: Number(item.count) || 1, item }));
  return { coins, items, from: parcel.name };
}
async function parcelAction(table, args, from = "GM") {
  const action = String(args.action ?? "");
  const party = require("./party.cjs");
  if (action === "create") return newParcel(table, args.name);
  const parcel = must(table, args.id, "treasureparcel");
  if (action === "add") return addToParcel(table, parcel.id, args);
  if (action === "remove") return table.records.update(parcel.id, { data: { [args.coin ? "coinlist" : "itemlist"]: { [String(args.key)]: null } } }, table.seat);
  // To the party sheet's parcel (FG: a parcel dropped on the party sheet), to hand out from there.
  if (action === "party") return party.addToParcel(table, parcelContents(parcel));
  // To one character (FG: a parcel dropped on a sheet): its items into the gear, its coins added.
  if (action === "character") return party.giveTo(table, must(table, args.character, "character"), parcelContents(parcel), from);
  throw new Error("kraken_parcel does create, add, remove, party or character.");
}

// --- Encounters ---------------------------------------------------------------
// A campaign encounter (FG's battle record): NPCs, each a link with a count
// (a number, or dice rolled when it is added: a random encounter), a faction
// and where its tokens go on a map. Its experience is its creatures' (the
// game's manifest names the field: encounter.xp).
function encounterXp(table, battle) {
  const { rulesetFor } = require("../shared/rulesets/registry.mjs");
  const field = rulesetFor(table.ruleset?.() ?? "").encounter?.xp ?? "xp";
  let xp = 0;
  for (const [, row] of rows(battle.data.npclist)) {
    const npc = npcOf(table, row);
    const count = /d/i.test(String(row.count ?? "")) ? 1 : Math.max(1, Number(row.count) || 1);
    xp += (Number(String(field.split(".").reduce((value, key) => value?.[key], npc?.data ?? {}) ?? "").replace(/,/g, "")) || 0) * count;
  }
  return xp;
}
function npcOf(table, row) {
  const recordname = String(row.link?.recordname ?? "");
  return table.records.get(recordname) ?? table.records.list({ type: "npc" }).find((record) => record.data?.fgPath === recordname) ?? null;
}
async function encounterAction(table, args, from = "GM") {
  const action = String(args.action ?? "");
  if (action === "create") return table.records.create({ type: "battle", name: text(args.name) || "New encounter", visibility: "gm", data: { npclist: {} } }, table.seat);
  const battle = must(table, args.id, "battle");
  if (action === "add-npc") {
    const npc = must(table, args.npc, "npc");
    const list = battle.data.npclist ?? {};
    const count = String(args.count ?? 1).trim().slice(0, 20) || "1";
    if (!/^\d+$/.test(count) && !/^[\d\s+\-dD]+$/.test(count)) throw new Error("A count is a number or dice (1d4+1).");
    return table.records.update(battle.id, { data: { npclist: { [nextKey(list)]: { name: npc.name, count, faction: ["friend", "neutral", "foe"].includes(args.faction) ? args.faction : "foe", link: { class: "npc", recordname: npc.id }, ...(args.token ? { token: text(args.token, 300) } : {}) } } } }, table.seat);
  }
  if (action === "remove-npc") return table.records.update(battle.id, { data: { npclist: { [String(args.row)]: null } } }, table.seat);
  if (action === "set-npc") {
    const row = battle.data.npclist?.[String(args.row)];
    if (!row) throw new Error(`No row ${args.row}.`);
    const patch = {};
    if (args.count !== undefined) patch.count = String(args.count).slice(0, 20);
    if (args.faction !== undefined) patch.faction = ["friend", "neutral", "foe"].includes(args.faction) ? args.faction : "foe";
    // FG's identified magnifier: "" identified, else what the players call it until they know.
    if (args.unidentified !== undefined) patch.unidentified = text(args.unidentified, 48);
    return table.records.update(battle.id, { data: { npclist: { [String(args.row)]: patch } } }, table.seat);
  }
  // Place: where the encounter's creatures stand on the map that is open now, read from their tokens
  // there (put them on with Add to tracker or from the list, move them, then Place), kept with the
  // encounter for that map: the next Add to tracker puts them there.
  if (action === "place") {
    // The map the GM works on (the image window's while one is open): its scene and its tokens together.
    const scene = table.map.scene?.() ?? table.scene?.();
    if (!scene) throw new Error("No map is open.");
    const tokens = table.map.tokens();
    const npclist = {};
    let placed = 0;
    for (const [key, row] of rows(battle.data.npclist)) {
      const npc = npcOf(table, row);
      const mine = npc ? tokens.filter((token) => token.recordId === npc.id) : [];
      const spots = Array.isArray(args.spots?.[key]) ? args.spots[key] : mine.map((token) => ({ x: token.x, y: token.y }));
      const kept = rows(row.maplink).map(([, spot]) => spot).filter((spot) => spot.scene !== scene.id);
      npclist[key] = { maplink: [...kept, ...spots.slice(0, 20).map((spot) => ({ scene: scene.id, x: Math.round(Number(spot.x) || 0), y: Math.round(Number(spot.y) || 0) }))] };
      placed += Math.min(20, spots.length);
    }
    table.records.update(battle.id, { data: { npclist } }, table.seat);
    return { encounter: battle.name, scene: scene.name, placed };
  }
  if (action === "run") return require("./library.cjs").addBattle(table, battle, { place: args.place !== false });
  // End encounter: its experience onto the party sheet's Encounters, to award there (FG's XP tab).
  if (action === "end") {
    const party = require("./party.cjs");
    const xp = Number.isFinite(Number(args.xp)) && args.xp !== undefined ? Math.max(0, Math.round(Number(args.xp))) : encounterXp(table, battle);
    party.partyRecord(table);
    table.records.update(party.PARTY_ID, { data: { encounters: { [battle.id]: { name: battle.name, xp, awarded: 0, record: battle.id } } } }, table.seat);
    table.say(`[ENCOUNTER] ${battle.name} is over: ${xp} XP to award on the party sheet.`, "Combat", true);
    return { encounter: battle.name, xp };
  }
  if (action === "xp") return { encounter: battle.name, xp: encounterXp(table, battle) };
  throw new Error("kraken_encounter does create, add-npc, set-npc, remove-npc, place, run, end or xp.");
}

// --- Quests -------------------------------------------------------------------
// A quest record (FG's quest: name, XP, its text, a status); dropped on the
// party sheet's XP tab it is listed there to award.
function questAction(table, args) {
  const action = String(args.action ?? "");
  if (action === "create") return table.records.create({ type: "quest", name: text(args.name) || "New quest", visibility: args.visibility ?? "gm", data: { xp: Math.max(0, Number(args.xp) || 0), status: args.status === "done" ? "done" : "open", text: String(args.text ?? "") } }, table.seat);
  const quest = must(table, args.id, "quest");
  if (action === "set") {
    const data = {};
    if (args.xp !== undefined) data.xp = Math.max(0, Number(args.xp) || 0);
    if (args.status !== undefined) data.status = args.status === "done" ? "done" : "open";
    if (args.text !== undefined) data.text = String(args.text);
    return table.records.update(quest.id, { ...(args.name !== undefined ? { name: text(args.name) } : {}), data }, table.seat);
  }
  if (action === "party") {
    const party = require("./party.cjs");
    party.partyRecord(table);
    table.records.update(party.PARTY_ID, { data: { quests: { [quest.id]: { name: quest.name, xp: Number(quest.data.xp) || 0, awarded: 0, record: quest.id } } } }, table.seat);
    return { quest: quest.name, xp: Number(quest.data.xp) || 0 };
  }
  throw new Error("kraken_quest does create, set or party.");
}

// The table's messages (one per tool), the GM's except a table roll.
const MESSAGES = {
  "record-copy": (table, msg, ctx) => copyRecord(table, msg, ctx.readBook),
  story: (table, msg) => storyAction(table, msg),
  "table-roll": (table, msg, ctx) => tableAction(table, msg, ctx.seat, ctx.from),
  identify: (table, msg) => identify(table, msg),
  encounter: (table, msg, ctx) => encounterAction(table, msg, ctx.from),
  parcel: (table, msg, ctx) => parcelAction(table, msg, ctx.from),
  quest: (table, msg) => questAction(table, msg),
};
async function message(table, msg, ctx) {
  const handler = MESSAGES[msg.type];
  if (!handler) throw new Error("Unknown request.");
  if (ctx.seat?.role !== "dm" && msg.type !== "table-roll") throw new Error("That is the GM's.");
  const { type: _type, req: _req, ...args } = msg;
  return handler(table, args, ctx);
}

module.exports = { message, copyRecord, storyAction, tableAction, rollOn, findTable, identify, parcelAction, parcelContents, encounterAction, encounterXp, questAction, unidentified, itemName };
