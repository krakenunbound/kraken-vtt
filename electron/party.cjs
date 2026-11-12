const path = require("path");
const { pathToFileURL } = require("url");
const { siege, siegeLibrary, siegeCheck, ATTRIBUTES } = require("./siege.cjs");

// The party sheet (FG's partysheet), kept by the host as one record anyone at
// the table may read and only the GM may change:
//   data.members     character ids, in party order (the last gets XP left over)
//   data.parcel      { coins: { GP: 12, ... }, items: { id: { name, count, assign, item? } } }
//   data.quests      { id: { name, xp, awarded } }   data.encounters likewise
//   data.order       { marching: [ids], watches: { id: { name, members: [ids] } },
//                      formation: { facing, slots: [{ x, y, id }] } }
// Players cannot read each other's sheets, so they are sent partyView, a summary.

const PARTY_ID = "party";
let rules = null;
function partyRules() {
  rules = rules ?? import(pathToFileURL(path.join(__dirname, "..", "shared", "party", "party.mjs")).href);
  return rules;
}

function rows(node) {
  return Object.entries(node && typeof node === "object" ? node : {}).filter(([, value]) => value && typeof value === "object");
}

function partyRecord(table) {
  const existing = table.records.get(PARTY_ID);
  if (existing) return existing;
  return table.records.create({ id: PARTY_ID, type: "party", name: "Party", visibility: "all", data: { members: [], parcel: { coins: {}, items: {} }, quests: {}, encounters: {}, order: { marching: [], watches: {} } } }, table.seat);
}

function memberRecords(table) {
  const party = partyRecord(table);
  const ids = Array.isArray(party.data.members) ? party.data.members : [];
  return ids.map((id) => table.records.get(id)).filter((record) => record && record.type === "character");
}

function summary(record) {
  const data = record.data ?? {};
  const classes = rows(data.packages)
    .map(([, pkg]) => pkg)
    .filter((pkg) => String(pkg.packagetype).toLowerCase() === "class")
    .map((pkg) => `${pkg.name} ${Number(pkg.level) || 1}`);
  return {
    id: record.id,
    name: record.name,
    owner: record.owner,
    portrait: typeof data.portrait === "string" ? data.portrait : null,
    race: String(data.race ?? ""),
    classes: classes.join(" / "),
    level: Number(data.level) || 0,
    hp: Number(data.hp?.total) || 0,
    wounds: Number(data.hp?.wounds) || 0,
    ac: Number(data.ac?.total) || 0,
    exp: Number(data.exp) || 0,
    expnext: Number(data.expnext) || 0,
    coins: rows(data.coins)
      .map(([, coin]) => ({ name: String(coin.name ?? ""), amount: Number(coin.amount) || 0 }))
      .filter((coin) => coin.name && coin.amount > 0),
    items: rows(data.inventorylist).map(([, item]) => ({ name: String(item.name ?? ""), count: Number(item.count) || 1 })),
  };
}

// What everyone at the table is shown of the party.
async function partyView(table) {
  const { partyInventory } = await partyRules();
  const party = partyRecord(table);
  const members = memberRecords(table).map(summary);
  return {
    members: members.map(({ items, ...member }) => member),
    inventory: partyInventory(members),
    parcel: party.data.parcel ?? { coins: {}, items: {} },
    quests: party.data.quests ?? {},
    encounters: party.data.encounters ?? {},
    order: orderOf(party),
  };
}

// Awards XP split across the party (PartyXPManager.awardXP), with FG's chat lines.
async function awardXP(table, xp, from) {
  const { xpShares } = await partyRules();
  const amount = Math.round(Number(xp) || 0);
  if (amount <= 0) throw new Error("How much XP?");
  const members = memberRecords(table);
  if (members.length === 0) throw new Error("The party has no members.");
  for (const { member, amount: share } of xpShares(amount, members)) {
    if (share <= 0) continue;
    table.records.update(member.id, { data: { exp: (Number(member.data.exp) || 0) + share } }, table.seat);
    table.say(`[${share} XP] -> ${member.name}`, from);
  }
  table.say(`Awarded XP to the Party. (${amount})`, from);
  return amount;
}

// Awards the XP of quests or encounters not yet awarded (one, or all), and
// marks them awarded (awardRecordsToParty).
async function awardEntries(table, kind, entryId, from) {
  if (kind !== "quests" && kind !== "encounters") throw new Error("Quests or encounters?");
  const party = partyRecord(table);
  const list = party.data[kind] ?? {};
  let xp = 0;
  const marked = {};
  for (const [id, entry] of rows(list)) {
    if (entryId && id !== entryId) continue;
    if (Number(entry.awarded) === 1) continue;
    xp += Number(entry.xp) || 0;
    marked[id] = { awarded: 1 };
  }
  if (Object.keys(marked).length === 0) throw new Error("Nothing left to award.");
  table.records.update(PARTY_ID, { data: { [kind]: marked } }, table.seat);
  if (xp > 0) await awardXP(table, xp, from);
  return xp;
}

// Hands out the parcel (PartyLootManager.distribute): assigned items to the
// people named, then each coin split evenly with the remainder left behind.
async function distribute(table, from) {
  const { coinShares, assignedShares } = await partyRules();
  const { engine } = await siege();
  const game = siegeLibrary(table.records).game;
  const members = memberRecords(table);
  if (members.length === 0) throw new Error("The party has no members.");
  const party = partyRecord(table);
  const parcel = party.data.parcel ?? {};
  const parcelUpdate = { items: {}, coins: {} };
  const given = [];

  for (const [id, item] of rows(parcel.items)) {
    const { names, each, error } = assignedShares(item.count, item.assign);
    if (names.length === 0) continue;
    if (error) {
      table.say(`[WARNING] Too many people for ${item.name} (${item.assign}).`, from);
      continue;
    }
    const failed = [];
    for (const name of names) {
      const member = members.find((record) => record.name.toLowerCase() === name.toLowerCase());
      if (!member || each <= 0) {
        failed.push(name);
        continue;
      }
      const source = item.item && typeof item.item === "object" ? { ...item.item, name: item.name } : { name: item.name };
      // The rules load first, then the sheet is read: nothing changed meanwhile is written over.
      const current = table.records.get(member.id).data;
      const astra = current?.ruleset === "astra" ? await require("./astra.cjs").rulesAstra() : null;
      const five = !astra && require("./dnd5e.cjs").is5e({ data: current }) ? await require("./dnd5e.cjs").rules5e() : !astra && require("./dnd35.cjs").is35({ data: current }) ? await require("./dnd35.cjs").rules35() : !astra && require("./adnd2e.cjs").is2e({ data: current }) ? await require("./adnd2e.cjs").rules2e() : null;
      const data = structuredClone(table.records.get(member.id).data);
      if (astra) {
        // An Apeira Astra character: the item into the gear, the sheet worked out again.
        const list = (data.inventorylist = data.inventorylist ?? {});
        list[engine.nextId(list)] = { ...source, count: each, carried: 1 };
        table.records.update(member.id, { data: astra.derive(data) }, table.seat, { replace: true });
        given.push(`${item.name} (${each}) -> ${member.name}`);
        continue;
      }
      if (five) {
        // A 5E character: the item into the pack (carried), the sheet worked out again.
        const list = (data.inventorylist = data.inventorylist ?? {});
        list[engine.nextId(list)] = { ...source, count: each, carried: 1 };
        table.records.update(member.id, { data: five.derive(data) }, table.seat, { replace: true });
        given.push(`${item.name} (${each}) -> ${member.name}`);
        continue;
      }
      const row = engine.addItem(data, source, game);
      row.count = (Number(row.count) || 1) + (each - 1);
      table.records.update(member.id, { data: engine.derive(data, game) }, table.seat, { replace: true });
      given.push(`${item.name} (${each}) -> ${member.name}`);
    }
    parcelUpdate.items[id] = failed.length > 0 ? { assign: failed.join(", ") } : null;
    if (failed.length > 0) table.say(`[WARNING] Could not give ${item.name} to ${failed.join(", ")}.`, from);
  }
  if (given.length > 0) table.say(`Items distributed: ${given.join("; ")}.`, from);

  const coins = Object.entries(parcel.coins ?? {}).filter(([, amount]) => Number(amount) > 0);
  if (coins.length > 0) {
    const perMember = new Map(members.map((member) => [member.id, []]));
    const handed = [];
    for (const [coin, amount] of coins) {
      const { each, left } = coinShares(Number(amount), members.length);
      parcelUpdate.coins[coin] = left;
      if (each <= 0) continue;
      handed.push(`${each * members.length} ${coin}`);
      for (const member of members) {
        const current = table.records.get(member.id).data.coins ?? {};
        const found = rows(current).find(([, row]) => String(row.name).toLowerCase() === coin.toLowerCase());
        const key = found ? found[0] : engine.nextId(current);
        table.records.update(member.id, { data: { coins: { [key]: { name: found ? found[1].name : coin, amount: (Number(found?.[1].amount) || 0) + each } } } }, table.seat);
        perMember.get(member.id).push(`${each} ${coin}`);
      }
    }
    for (const member of members) {
      const list = perMember.get(member.id);
      if (list.length > 0) table.say(`[${list.join(", ")}] -> ${member.name}`, from);
    }
    if (handed.length > 0) table.say(`Distributed across the Party. [${handed.join(", ")}]`, from);
  }
  table.records.update(PARTY_ID, { data: { parcel: parcelUpdate } }, table.seat);
  return { items: given.length, coins: coins.length };
}

// SiegeCore's group check or save: every member rolls the same attribute
// against one CL; chat sums it up (SiegeGroupCheck.record).
async function groupCheck(table, kind, attribute, cl, from) {
  if (!ATTRIBUTES.includes(attribute)) throw new Error("Pick an attribute.");
  const members = memberRecords(table);
  if (members.length === 0) throw new Error("The party has no members.");
  const label = kind === "save" ? "Group save" : "Group check";
  const stat = `${attribute[0].toUpperCase()}${attribute.slice(1)}`;
  const failed = [];
  let passed = 0;
  for (const member of members) {
    const result = await siegeCheck(table, member, { attribute, cl, label: `[${label.toUpperCase()}] ${stat} ${kind === "save" ? "save" : "check"}` }, member.name);
    if (result.success) passed += 1;
    else failed.push(member.name);
  }
  const line = `${label} (${stat}, CL ${Number(cl) || 0}): ${passed} of ${members.length} succeed.${failed.length > 0 ? ` Failed: ${failed.join(", ")}.` : ""}`;
  table.say(line, from);
  return { passed, of: members.length, failed, line };
}

// FG's party formation (PartyFormationManager, CombatFormationManager): a 7 by
// 7 grid of slots, x and y from -3 to 3 (y up is the front when the party
// faces up), and a facing (0 up, 1 right, 2 down, 3 left). The watches are
// FG's watch order: who stands which watch.
const RANGE = 3;
const WATCHES = 3;
const key = (slot) => `${slot.x},${slot.y}`;

function orderOf(record) {
  const order = record.data.order ?? {};
  const slots = Array.isArray(order.formation?.slots) ? order.formation.slots.filter((slot) => slot && typeof slot.id === "string" && Number.isInteger(slot.x) && Number.isInteger(slot.y)) : [];
  return { marching: Array.isArray(order.marching) ? order.marching : [], watches: order.watches && typeof order.watches === "object" ? order.watches : {}, formation: { facing: ((Number(order.formation?.facing) % 4) + 4) % 4 || 0, slots } };
}

// Front to back, as the party faces (for the marching order): the slots
// nearest the front first, then left to right across it.
function frontToBack(formation) {
  const ahead = [(slot) => slot.y, (slot) => slot.x, (slot) => -slot.y, (slot) => -slot.x][formation.facing];
  const across = [(slot) => slot.x, (slot) => -slot.y, (slot) => -slot.x, (slot) => slot.y][formation.facing];
  return [...formation.slots].sort((a, b) => ahead(b) - ahead(a) || across(a) - across(b)).map((slot) => slot.id);
}

// FG's column fills (1, 2 or 3 abreast, from the front back), then a spiral
// from the middle for whoever is left.
function startColumn(columns, count, facing) {
  let rows = Math.floor(count / columns);
  if (count % columns > 0) rows += 1;
  const lead = Math.max(0, Math.min(RANGE, rows - RANGE - 1));
  return [{ x: 0, y: lead }, { x: lead, y: 0 }, { x: 0, y: -lead }, { x: -lead, y: 0 }][facing];
}
// FG's order across a row, and the way back, for each facing (as its
// getNextOpenColumnx1/2/3FillSlot): facing up, a row of three is middle, left,
// right, and the next row is one back.
const ACROSS = {
  1: [[0], [0], [0], [0]],
  2: [[0, 1], [0, -1], [0, -1], [0, 1]],
  3: [[0, -1, 1], [0, -1, 1], [0, 1, -1], [0, 1, -1]],
};
const BACK = [{ along: "y", step: -1 }, { along: "x", step: -1 }, { along: "y", step: 1 }, { along: "x", step: 1 }];
function nextColumn(at, used, facing, columns) {
  const slot = { ...at };
  const { along, step } = BACK[facing];
  const side = along === "y" ? "x" : "y";
  const sides = ACROSS[columns][facing];
  while (used.has(key(slot))) {
    const index = sides.indexOf(slot[side]);
    if (index >= 0 && index < sides.length - 1) slot[side] = sides[index + 1];
    else {
      slot[side] = 0;
      slot[along] += step;
      if (Math.abs(slot[along]) > RANGE) return null;
    }
  }
  return slot;
}
function nextSpiral(used) {
  for (let ring = 0; ring <= RANGE; ring++) {
    for (let y = ring; y >= -ring; y--) {
      for (let x = -ring; x <= ring; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
        if (!used.has(`${x},${y}`)) return { x, y };
      }
    }
  }
  return null;
}
function fillFormation(formation, members, columns) {
  const slots = [...formation.slots];
  const used = new Set(slots.map(key));
  const placed = new Set(slots.map((slot) => slot.id));
  const waiting = members.filter((id) => !placed.has(id));
  let at = startColumn(columns, members.length, formation.facing);
  for (const id of waiting) {
    const slot = (at && nextColumn(at, used, formation.facing, columns)) || nextSpiral(used);
    if (!slot) break;
    if (at) at = slot;
    slots.push({ ...slot, id });
    used.add(key(slot));
  }
  return { ...formation, slots };
}
function rotate(formation, direction) {
  const left = direction === "left";
  return {
    facing: (formation.facing + (left ? 3 : 1)) % 4,
    slots: formation.slots.map((slot) => (left ? { x: -slot.y, y: slot.x, id: slot.id } : { x: slot.y, y: -slot.x, id: slot.id })),
  };
}

// A change to the order, from the GM or a player. A player moves only their
// own characters (and swaps only with their own); the fills, turning and
// clearing are the GM's.
function changeOrder(table, seat, change) {
  const record = partyRecord(table);
  const members = Array.isArray(record.data.members) ? record.data.members : [];
  const order = orderOf(record);
  const gm = seat.role === "dm";
  const mine = (id) => gm || table.records.get(id)?.owner === seat.name;
  const member = (id) => {
    if (!members.includes(id)) throw new Error("That character is not in the party.");
    if (!mine(id)) throw new Error("You can only place your own characters.");
    return id;
  };
  const action = String(change?.action ?? "");
  let { formation, watches } = order;
  if (action === "place") {
    const id = member(String(change.id ?? ""));
    const x = Number(change.x);
    const y = Number(change.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > RANGE || Math.abs(y) > RANGE) throw new Error("That is not a slot in the formation.");
    const from = formation.slots.find((slot) => slot.id === id);
    const there = formation.slots.find((slot) => slot.x === x && slot.y === y);
    if (there && there.id !== id && !mine(there.id)) throw new Error("That slot is another player's.");
    let slots = formation.slots.filter((slot) => slot.id !== id && slot !== there);
    if (there && there.id !== id && from) slots.push({ x: from.x, y: from.y, id: there.id });
    slots.push({ x, y, id });
    formation = { ...formation, slots };
  } else if (action === "remove") {
    const id = member(String(change.id ?? ""));
    formation = { ...formation, slots: formation.slots.filter((slot) => slot.id !== id) };
  } else if (action === "watch") {
    const id = member(String(change.id ?? ""));
    const number = Number(change.watch);
    if (!Number.isInteger(number) || number < 0 || number > WATCHES) throw new Error(`A watch is 1 to ${WATCHES}, or 0 for none.`);
    watches = Object.fromEntries(
      Array.from({ length: WATCHES }, (_, index) => {
        const name = `watch-${index + 1}`;
        const watch = watches[name] ?? { name: `Watch ${index + 1}`, members: [] };
        const without = (watch.members ?? []).filter((other) => other !== id);
        return [name, { name: watch.name ?? `Watch ${index + 1}`, members: number === index + 1 ? [...without, id] : without }];
      }),
    );
  } else if (["fill", "rotate", "clear"].includes(action)) {
    if (!gm) throw new Error("Only the GM can do that.");
    if (action === "fill") {
      const columns = Number(change.columns);
      if (![1, 2, 3].includes(columns)) throw new Error("Fill 1, 2 or 3 abreast.");
      formation = fillFormation(formation, members, columns);
    } else if (action === "rotate") formation = rotate(formation, change.direction === "left" ? "left" : "right");
    else formation = { facing: formation.facing, slots: [] };
  } else throw new Error("Place, remove, watch, fill, rotate or clear.");
  // Only the party's members stay in it.
  formation = { ...formation, slots: formation.slots.filter((slot) => members.includes(slot.id)) };
  const next = { marching: frontToBack(formation), watches, formation };
  table.records.update(PARTY_ID, { data: { order: next } }, table.seat);
  return next;
}

// A treasure parcel into the party's parcel (FG's drag of a parcel onto the
// party sheet): its coins added up, its items listed to hand out.
function addToParcel(table, { coins = {}, items = [], from = "" } = {}) {
  const party = partyRecord(table);
  const parcel = party.data.parcel ?? { coins: {}, items: {} };
  const nextCoins = { ...(parcel.coins ?? {}) };
  for (const [name, amount] of Object.entries(coins)) nextCoins[name] = (Number(nextCoins[name]) || 0) + (Number(amount) || 0);
  const nextItems = {};
  let n = Object.keys(parcel.items ?? {}).length;
  for (const item of items.slice(0, 100)) {
    n += 1;
    nextItems[`p-${Date.now().toString(36)}-${n}`] = { name: String(item.name).slice(0, 120), count: Math.max(1, Number(item.count) || 1), assign: "", item: item.item ?? null };
  }
  table.records.update(PARTY_ID, { data: { parcel: { coins: nextCoins, items: nextItems } } }, table.seat);
  table.say(`[PARCEL] ${from || "Treasure"} added to the party's parcel: ${[...Object.entries(coins).filter(([, a]) => Number(a) > 0).map(([c, a]) => `${a} ${c}`), ...items.map((item) => `${item.count > 1 ? `${item.count} ` : ""}${item.name}`)].join(", ") || "nothing"}.`, "Party", true);
  return { coins: nextCoins, items: items.length };
}

module.exports = { addToParcel, PARTY_ID, partyRecord, partyView, awardXP, awardEntries, distribute, groupCheck, changeOrder, fillFormation, rotate, RANGE };
