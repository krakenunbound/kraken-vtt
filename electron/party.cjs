const path = require("path");
const { pathToFileURL } = require("url");
const { siege, siegeLibrary, siegeCheck, ATTRIBUTES } = require("./siege.cjs");

// The party sheet (FG's partysheet), kept by the host as one record anyone at
// the table may read and only the GM may change:
//   data.members     character ids, in party order (the last gets XP left over)
//   data.parcel      { coins: { GP: 12, ... }, items: { id: { name, count, assign, item? } } }
//   data.quests      { id: { name, xp, awarded } }   data.encounters likewise
//   data.order       { marching: [ids], watches: { id: { name, members: [ids] } } }
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
    order: party.data.order ?? { marching: [], watches: {} },
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
      const data = structuredClone(table.records.get(member.id).data);
      const source = item.item && typeof item.item === "object" ? { ...item.item, name: item.name } : { name: item.name };
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

module.exports = { PARTY_ID, partyRecord, partyView, awardXP, awardEntries, distribute, groupCheck };
