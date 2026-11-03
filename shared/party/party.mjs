// Party sheet rules, as CoreRPG's PartyXPManager and PartyLootManager do them.

// awardXP: every member but the last gets the rounded average; the last gets
// what is left (never below 0). Fewer XP than members: the last gets it all.
export function xpShares(xp, members) {
  const count = members.length;
  if (count === 0) return [];
  const average = xp >= count ? Math.floor(xp / count + 0.5) : 0;
  const last = Math.max(xp - (count - 1) * average, 0);
  return members.map((member, index) => ({ member, amount: index === count - 1 ? last : average }));
}

// distributeParcelCoins: each member gets the floor of an even share of each
// coin; the remainder stays in the parcel.
export function coinShares(amount, count) {
  if (count <= 0) return { each: 0, left: amount };
  const each = amount >= count ? Math.floor(amount / count) : 0;
  return { each, left: amount - each * count };
}

// An item's assignment ("Halvar, Malachi"): the names, each getting the floor
// of count / names; FG refuses more names than items.
export function assignedShares(count, assign) {
  const names = String(assign ?? "")
    .split(/[,;\r\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  const total = Math.max(Number(count) || 0, 1);
  if (names.length === 0) return { names, each: 0, error: null };
  if (names.length > total) return { names, each: 0, error: "More people than items." };
  return { names, each: Math.floor(total / names.length), error: null };
}

// buildPartyInventory: every member's items by name, with the total count and
// who carries how many.
export function partyInventory(members) {
  const byName = new Map();
  for (const member of members) {
    for (const item of member.items ?? []) {
      const name = String(item.name ?? "").trim();
      if (!name) continue;
      const count = Math.max(Number(item.count) || 0, 1);
      const row = byName.get(name) ?? { name, count: 0, carriedBy: {} };
      row.count += count;
      row.carriedBy[member.name] = (row.carriedBy[member.name] ?? 0) + count;
      byName.set(name, row);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
