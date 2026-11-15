// Bookkeeping, the core's part: what a character carries and spends, worked
// out from its inventory the same way for every game (FG's inventory list:
// inventorylist rows with name, count, carried 0/1/2, weight, location).
// Each game says what it uses in its declaration (shared/<id>/bookkeeping.mjs,
// attached by the registry as manifest.bookkeeping); nothing here names a game.
//
// - ammunition: a weapon's kind (arrows for a bow, bolts for a crossbow,
//   bullets for a sling, rounds for a firearm), the stack it fires from, one
//   spent a shot, the fight's tally and what can be recovered after it;
// - consumables: potions, scrolls, a wand's charges, a kit's uses;
// - rations and water: a day's food and drink, the days gone without;
// - light: the torch or the lantern's oil a lit light takes from the pack;
// - encumbrance: the load by weight, slots or the game's own derived numbers,
//   its level and penalties, and containers with their own capacity;
// - rest: the short and long rest a game declares (applied by the host).
//
// Every switch is the GM's (table option bookkeeping), on unless turned off.

export const SWITCHES = ["ammo", "consumables", "rations", "light", "encumbrance"];
// The table's switches: each on unless the GM turned it off; the 5E variant encumbrance only when turned on.
export function switchesOf(options) {
  const raw = options?.bookkeeping && typeof options.bookkeeping === "object" ? options.bookkeeping : {};
  return { ammo: raw.ammo !== false, consumables: raw.consumables !== false, rations: raw.rations !== false, light: raw.light !== false, encumbrance: raw.encumbrance !== false, variant: raw.variant === true };
}

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) && value !== "" && value !== null ? Number(value) : fallback);
const re = (pattern) => new RegExp(pattern, "i");
const test = (pattern, text) => Boolean(pattern) && re(pattern).test(String(text ?? ""));
const nameOf = (row) => String(row?.name ?? "").trim();
// A row's words: its name, type, subtype and description (FG's formatted text, tags off).
const wordsOf = (row) => `${row?.name ?? ""} ${row?.type ?? ""} ${row?.subtype ?? ""} ${String(row?.description ?? row?.notes ?? row?.text ?? "").replace(/<[^>]+>/g, " ")}`;

// --- The inventory -------------------------------------------------------------------------------
export const rowsOf = (data) => Object.entries(data?.inventorylist ?? {}).filter((entry) => entry[1] && typeof entry[1] === "object");
// Carried: 2 equipped (worn, in hand), 1 carried, 0 not carried (left at camp, on the mule).
export const carriedOf = (row) => num(row?.carried, 1);
// "Arrows (20)": a bundle of 20 in one row (the 5E SRD kit, FG's packs).
export const bundleOf = (row) => {
  const match = /\((\d+)\)\s*$/.exec(nameOf(row));
  return match && Number(match[1]) > 1 ? Number(match[1]) : 1;
};
// How many there are: count (1 when blank) times the bundle; C&C's ammunition by the unit
// (ammoperunit, ammoused: a quiver of 20 arrows as one row).
export function quantity(row) {
  // Cairn's "Torch (3 uses)": its uses.
  if (row?.uses !== undefined && row?.uses !== "") return Math.max(0, num(row.uses, 0));
  const count = Math.max(0, num(row?.count, 1));
  const per = num(row?.ammoperunit, 0);
  if (per > 1) return Math.max(0, count * per - num(row?.ammoused, 0));
  return count * bundleOf(row);
}
// A bundle opened: "Arrows (20)" x1 becomes "Arrows" x20, its weight spread over them.
export function unbundle(row) {
  const size = bundleOf(row);
  if (size <= 1 || num(row?.ammoperunit, 0) > 1) return { ...row };
  const weight = num(row.weight, NaN);
  return { ...row, name: nameOf(row).replace(/\s*\(\d+\)\s*$/, ""), count: Math.max(0, num(row.count, 1)) * size, ...(Number.isFinite(weight) ? { weight: Math.round((weight / size) * 1000) / 1000 } : {}) };
}
// One fewer: a C&C unit row counts its used ammunition, anything else its count.
function lessOne(row, by = 1) {
  if (row.uses !== undefined && row.uses !== "") return { ...row, uses: Math.max(0, num(row.uses, 0) - by) };
  const per = num(row.ammoperunit, 0);
  if (per > 1) {
    let used = num(row.ammoused, 0) + by;
    let count = num(row.count, 1);
    while (used >= per && count > 0) {
      used -= per;
      count -= 1;
    }
    return { ...row, count, ammoused: count > 0 ? used : 0 };
  }
  return { ...row, count: Math.max(0, num(row.count, 1) - by) };
}
export const nextKey = (list) => {
  let n = Object.keys(list ?? {}).reduce((top, key) => Math.max(top, Number(/^id-(\d+)$/.exec(key)?.[1] ?? 0)), 0);
  n += 1;
  return `id-${String(n).padStart(5, "0")}`;
};
// The rows a pattern names, those carried first (equipped, then carried), never what was left behind.
function stacks(data, match, { except = "", left = (row) => quantity(row) } = {}) {
  return rowsOf(data)
    .filter(([key, row]) => key !== except && carriedOf(row) > 0 && test(match, nameOf(row)) && left(row) > 0)
    .sort((a, b) => carriedOf(b[1]) - carriedOf(a[1]));
}

// --- Ammunition -----------------------------------------------------------------------------------
// The kinds a launcher fires (a game may add its own first: decl.ammo.kinds).
export const AMMO_KINDS = [
  { id: "bolt", label: "bolts", launcher: "crossbow", ammo: "\\bbolts?\\b|quarrels?" },
  { id: "arrow", label: "arrows", launcher: "\\b(?:long|short|war|great)?bows?\\b", ammo: "\\barrows?\\b" },
  { id: "needle", label: "needles", launcher: "blowgun", ammo: "\\bneedles?\\b" },
  { id: "rounds", label: "rounds", launcher: "pistol|rifle|carbine|shotgun|musket|revolver|\\bguns?\\b|blaster|\\bsmg\\b|submachine|autogun|laser|slug ?thrower|firearm", ammo: "magazine|\\brounds?\\b|\\bammo\\b|cartridges?|power ?(?:pack|cell)s?|batter(?:y|ies)|\\bclips?\\b|firearm bullets?|\\bshells?\\b" },
  { id: "bullet", label: "sling bullets", launcher: "\\bslings?\\b(?!\\s*bullet)(?!\\s*stone)", ammo: "sling ?(?:bullets?|stones?)|bullets?,? sling|^stones?\\b|^bullets?\\b" },
];
const kindsOf = (decl) => [...(decl?.ammo?.kinds ?? []), ...AMMO_KINDS];
const isWeaponRow = (row) => Boolean(String(row?.damage ?? "").trim()) || /weapon/i.test(`${row?.type ?? ""}`);
// The kind of ammunition a weapon fires, or null (a sword, a thrown dagger, a spell).
export function ammoKindOf(decl, weapon) {
  if (!weapon || decl?.ammo === false || !decl?.ammo) return null;
  const kinds = kindsOf(decl);
  const name = nameOf(weapon);
  // C&C's ammotype ("arrow", "bolt"), on a ranged weapon.
  const typed = String(weapon.ammotype ?? "").trim().toLowerCase();
  if (typed) return kinds.find((kind) => kind.id === typed || kind.id === typed.replace(/s$/, "") || test(kind.ammo, typed)) ?? { id: typed, label: typed, launcher: "", ammo: `\\b${typed.replace(/[^a-z ]/g, "").replace(/s$/, "")}s?\\b` };
  const byName = kinds.find((kind) => test(kind.launcher, name));
  // 5E: "Ammunition (Range 150/600; Arrow)".
  const property = /ammunition\s*\(([^)]*)\)/i.exec(String(weapon.properties ?? ""));
  if (property || /\bammunition\b/i.test(String(weapon.properties ?? ""))) {
    const word = (property?.[1].split(";").pop() ?? "").trim().toLowerCase().replace(/s$/, "");
    const named = kinds.find((kind) => kind.id === word) ?? (word === "bullet" ? (byName?.id === "rounds" ? byName : kinds.find((kind) => kind.id === "bullet")) : null);
    return named ?? byName ?? null;
  }
  if (byName) return byName;
  // Traveller: a ranged weapon with a magazine.
  if (num(weapon.magazine, 0) > 0 && !/melee/i.test(`${weapon.subtype ?? ""} ${weapon.range ?? ""}`)) return kinds.find((kind) => kind.id === "rounds") ?? null;
  return null;
}
// The ammunition rows a kind fires from (never the launcher itself).
export function ammoStacks(decl, data, kind, weaponKey = "") {
  return stacks(data, kind.ammo, { except: weaponKey }).filter(([, row]) => !isWeaponRow(row) || /ammunition/i.test(`${row.type ?? ""} ${row.subtype ?? ""}`));
}
// A weapon's inventory row: by its key, the derived attack's item key, or its name.
export function weaponRow(data, key, name = "") {
  const list = data?.inventorylist ?? {};
  if (key && list[key]) return [key, list[key]];
  const via = data?.attacks?.[key]?.item;
  if (via && list[via]) return [via, list[via]];
  const wanted = String(name || data?.attacks?.[key]?.name || "").trim().toLowerCase();
  return wanted ? (rowsOf(data).find(([, row]) => nameOf(row).toLowerCase() === wanted && isWeaponRow(row)) ?? null) : null;
}
// Shots fired: { ok, kind, key, name, left, low, data } with the stack spent and the fight's tally kept
// (data.bookkeeping.spent); ok false with a reason when there is nothing to fire.
export function spendAmmo(decl, data, weaponKey, weaponName = "", shots = 1) {
  const found = weaponRow(data, weaponKey, weaponName);
  if (!found) return { ok: true, tracked: false };
  const [wKey, weapon] = found;
  const kind = ammoKindOf(decl, weapon);
  if (!kind) return { ok: true, tracked: false };
  // A firearm with a magazine (Traveller): rounds come out of the loaded magazine; an empty one is
  // swapped for a full magazine from the pack (a reload), and with none left the weapon is empty.
  const magazine = Math.round(num(weapon.magazine, 0));
  if (kind.id === "rounds" && magazine > 0) {
    let loaded = Math.round(num(weapon.loaded, magazine));
    const list = { ...(data.inventorylist ?? {}) };
    let reloaded = "";
    let fired = 0;
    for (let shot = 0; shot < Math.max(1, Math.round(shots)); shot += 1) {
      if (loaded <= 0) {
        const spare = ammoStacks(decl, { ...data, inventorylist: list }, kind, wKey)[0];
        if (!spare) break;
        list[spare[0]] = lessOne(unbundle(spare[1]));
        reloaded = nameOf(spare[1]);
        loaded = magazine;
      }
      loaded -= 1;
      fired += 1;
    }
    if (!fired) return { ok: false, tracked: true, kind, weapon: nameOf(weapon), reason: `${nameOf(weapon)}: the magazine is empty and there is no spare.` };
    list[wKey] = { ...weapon, loaded };
    const spares = ammoStacks(decl, { ...data, inventorylist: list }, kind, wKey).reduce((sum, [, row]) => sum + quantity(row), 0);
    return { ok: true, tracked: true, kind, key: wKey, weapon: nameOf(weapon), name: `${nameOf(weapon)}'s magazine`, fired, left: loaded, spares, reloaded, magazine, low: loaded <= Math.min(num(decl.ammo.low, 5), Math.ceil(magazine / 4)) && spares === 0, data: { ...data, inventorylist: list } };
  }
  const choices = ammoStacks(decl, data, kind, wKey);
  if (!choices.length) return { ok: false, tracked: true, kind, weapon: nameOf(weapon), reason: `${nameOf(weapon)}: no ${kind.label} left to fire.` };
  let [key, row] = choices[0];
  row = unbundle(row);
  const have = quantity(row);
  const fired = Math.min(Math.max(1, Math.round(shots)), have);
  const next = lessOne(row, fired);
  const list = { ...(data.inventorylist ?? {}), [key]: next };
  const left = choices.slice(1).reduce((sum, [, other]) => sum + quantity(other), quantity(next));
  const spent = { ...(data.bookkeeping?.spent ?? {}) };
  spent[key] = { name: nameOf(next), n: num(spent[key]?.n, 0) + fired };
  const low = num(decl.ammo.low, 5);
  return { ok: true, tracked: true, kind, key, weapon: nameOf(weapon), name: nameOf(next), fired, left, low: left <= low, data: { ...data, inventorylist: list, bookkeeping: { ...(data.bookkeeping ?? {}), spent } } };
}
// What can be picked up after a fight: half the shots (5E), or the game's share; rounds down.
export function recoverable(decl, data) {
  const rate = num(decl?.ammo?.recover, 0);
  return Object.entries(data?.bookkeeping?.spent ?? {})
    .map(([key, item]) => ({ key, name: String(item?.name ?? ""), spent: num(item?.n, 0), back: Math.floor(num(item?.n, 0) * rate) }))
    .filter((item) => item.spent > 0);
}
// The ammunition picked up: back onto its stack (a new one if the stack is gone); the tally cleared.
export function recoverAmmo(decl, data) {
  const list = { ...(data.inventorylist ?? {}) };
  const back = recoverable(decl, data);
  for (const item of back) {
    if (!item.back) continue;
    const row = list[item.key];
    if (row) list[item.key] = num(row.ammoperunit, 0) > 1 ? { ...row, ammoused: Math.max(0, num(row.ammoused, 0) - item.back) } : { ...unbundle(row), count: quantity(unbundle(row)) + item.back };
    else list[nextKey(list)] = { name: item.name, count: item.back, carried: 1, type: "Adventuring Gear", subtype: "Ammunition" };
  }
  const { spent: _spent, ...rest } = data.bookkeeping ?? {};
  return { back, data: { ...data, inventorylist: list, bookkeeping: rest } };
}

// --- Consumables ---------------------------------------------------------------------------------
export const CONSUMABLE_KINDS = [
  { kind: "potion", match: "potion|elixir|philt(?:er|re)|draught|tonic|antitoxin|healing herbs|\\bstim\\b|stimpak", spend: "count" },
  { kind: "scroll", match: "\\bscrolls?\\b", spend: "count" },
  { kind: "kit", match: "healer'?s kit|medi?kit|first aid|bandages?|medical kit|trauma (?:kit|patch)", spend: "uses" },
  { kind: "charges", match: "\\bwands?\\b|\\bstaff of\\b|\\brod of\\b|\\bcharges?\\b", spend: "charges" },
];
// What using a row spends: { kind, field: uses|charges|count, left, max, heal: {dice, bonus} | null }, or null.
export function consumableOf(decl, row, parseSpell = null) {
  if (!row || decl?.consumables === false) return null;
  const kinds = [...(decl?.consumables?.kinds ?? []), ...CONSUMABLE_KINDS];
  const words = wordsOf(row);
  const kind = kinds.find((item) => test(item.match, nameOf(row))) ?? (num(row.uses, 0) > 0 || num(row.charges, 0) > 0 ? { kind: "charges", spend: num(row.uses, 0) > 0 ? "uses" : "charges" } : null);
  if (!kind) return null;
  const text = words.replace(/\s+/g, " ");
  const stated = (word) => Number(new RegExp(`(\\d+)\\s+${word}`, "i").exec(text)?.[1] ?? 0);
  let field = kind.spend;
  if (field === "uses" && row.uses === undefined && !stated("uses")) field = row.charges !== undefined || stated("charges") ? "charges" : "count";
  if (field === "charges" && row.charges === undefined && !stated("charges")) field = row.uses !== undefined || stated("uses") ? "uses" : "count";
  const max = field === "count" ? 0 : num(row[`max${field}`], stated(field) || num(row[field], 0));
  const left = field === "count" ? quantity(row) : num(row[field], max);
  let heal = null;
  if (parseSpell) {
    try {
      heal = parseSpell({ name: nameOf(row), description: text })?.heal ?? null;
    } catch {
      heal = null;
    }
  } else {
    const match = /regains?\s+(\d+d\d+)\s*(?:([+-])\s*(\d+))?\s*hit points/i.exec(text);
    if (match) heal = { dice: match[1], bonus: match[3] ? Number(`${match[2]}${match[3]}`) : 0 };
  }
  return { kind: kind.kind, field, left, max, heal };
}
// One used: { ok, data, name, left, gone, info } (a potion drunk, a charge spent), or ok false.
export function useConsumable(decl, data, key, parseSpell = null) {
  const row = data?.inventorylist?.[key];
  if (!row) return { ok: false, reason: "That item is gone." };
  const info = consumableOf(decl, row, parseSpell);
  if (!info) return { ok: false, reason: `${nameOf(row)} is not something to use up.` };
  if (info.left <= 0) return { ok: false, reason: `${nameOf(row)}: none left.` };
  const list = { ...(data.inventorylist ?? {}) };
  let next;
  if (info.field === "count") next = lessOne(unbundle(row));
  else next = { ...row, [info.field]: info.left - 1, ...(info.max ? { [`max${info.field}`]: info.max } : {}) };
  const left = info.field === "count" ? quantity(next) : num(next[info.field], 0);
  // A potion or scroll used up is gone from the list; a wand at 0 charges stays (it may recharge).
  const gone = info.field === "count" && left <= 0;
  if (gone) delete list[key];
  else list[key] = next;
  return { ok: true, data: { ...data, inventorylist: list }, name: nameOf(row), left, gone, info };
}

// --- Rations and water ---------------------------------------------------------------------------
// Days of food in a row: its uses (Cairn's "Rations (3 uses)"), else count times the days its
// name says ("one week", "(10 days)"), else one a day.
function daysPer(row) {
  const name = nameOf(row);
  if (/\bweek\b/i.test(name)) return 7;
  const days = /\((\d+)\s*days?\)/i.exec(name);
  return days ? Number(days[1]) : bundleOf(row);
}
export function foodLeft(row) {
  if (row?.uses !== undefined) return Math.max(0, num(row.uses, 0));
  return Math.max(0, num(row?.count, 1)) * daysPer(row);
}
// Water in a row: its charges (days' drink a skin holds, filled), the skin full when never drunk from.
export const waterLeft = (decl, row) => (row?.charges !== undefined ? Math.max(0, num(row.charges, 0)) : Math.max(0, num(row?.count, 1)) * num(decl?.rations?.water?.days, 1));
export function supplies(decl, data) {
  const spec = decl?.rations;
  if (!spec) return null;
  const food = stacks(data, spec.food.match, { left: foodLeft });
  const water = spec.water ? stacks(data, spec.water.match, { left: (row) => waterLeft(decl, row) }) : [];
  const skins = spec.water ? rowsOf(data).filter(([, row]) => carriedOf(row) > 0 && test(spec.water.match, nameOf(row))) : [];
  return {
    food: food.reduce((sum, [, row]) => sum + foodLeft(row), 0),
    water: spec.water ? water.reduce((sum, [, row]) => sum + waterLeft(decl, row), 0) : null,
    skins: skins.length,
    foodRows: food.map(([key]) => key),
    waterRows: water.map(([key]) => key),
    hungry: num(data?.bookkeeping?.hungry, 0),
    thirsty: num(data?.bookkeeping?.thirsty, 0),
    fedDay: data?.bookkeeping?.fedDay ?? null,
  };
}
// A day's ration eaten (and water drunk): { data, ate, drank }. A row run out is kept at 0.
export function eatDay(decl, data, { food = true, water = true } = {}) {
  const spec = decl?.rations;
  const list = { ...(data.inventorylist ?? {}) };
  let ate = !food;
  let drank = !water || !spec?.water;
  if (food && spec) {
    const [key, row] = stacks(data, spec.food.match, { left: foodLeft })[0] ?? [];
    if (key) {
      if (row.uses !== undefined) list[key] = { ...row, uses: num(row.uses, 0) - 1 };
      else if (daysPer(row) > 1) list[key] = { ...row, uses: foodLeft(row) - 1 };
      else list[key] = { ...row, count: Math.max(0, num(row.count, 1) - 1) };
      ate = true;
    }
  }
  if (water && spec?.water) {
    const [key, row] = stacks(data, spec.water.match, { left: (item) => waterLeft(decl, item) })[0] ?? [];
    if (key) {
      list[key] = { ...row, charges: waterLeft(decl, row) - 1 };
      drank = true;
    }
  }
  return { data: { ...data, inventorylist: list }, ate, drank };
}
// Every skin filled again (a stream, a well, a town).
export function refill(decl, data) {
  const spec = decl?.rations?.water;
  if (!spec) return { data, filled: 0 };
  const list = { ...(data.inventorylist ?? {}) };
  let filled = 0;
  for (const [key, row] of rowsOf(data)) {
    if (!test(spec.match, nameOf(row))) continue;
    list[key] = { ...row, charges: Math.max(0, num(row.count, 1)) * num(spec.days, 1) };
    filled += 1;
  }
  return { data: { ...data, inventorylist: list }, filled };
}
// How long a creature goes without before the penalty starts: a number of days, or "3+con" style
// (a base and an ability's modifier, at least 1), read from the record.
export function graceDays(spec, data) {
  if (spec?.after === undefined) return 0;
  if (typeof spec.after === "number") return spec.after;
  const match = /^(\d+)\s*\+\s*(\w+)$/.exec(String(spec.after));
  if (!match) return num(spec.after, 0);
  const mod = num(data?.abilities?.[match[2]]?.bonus, num(data?.abilities?.[match[2]]?.mod, 0));
  return Math.max(1, Number(match[1]) + mod);
}

// --- Light ---------------------------------------------------------------------------------------
// What a light preset takes from the pack: the item itself (a torch, a candle, a flare) or, for a
// lantern or lamp, the item held and a flask of oil burnt in it.
export const LIGHT_ITEMS = {
  torch: { item: "\\btorch(?:es)?\\b(?!.*electric)" },
  candle: { item: "\\bcandles?\\b" },
  flare: { item: "\\bflares?\\b" },
  glowstick: { item: "glow ?sticks?|chem ?lights?|light ?sticks?" },
  lantern: { item: "\\blanterns?\\b", fuel: "^(?:flasks? of )?(?:lamp )?oil\\b(?!\\s+of\\b)|^flasks? of oil" },
  lamp: { item: "\\blamps?\\b(?!\\s*oil)", fuel: "^(?:flasks? of )?(?:lamp )?oil\\b(?!\\s+of\\b)|^flasks? of oil" },
  flashlight: { item: "flashlight|hand ?torch|electric torch", keep: true },
  headlamp: { item: "head ?lamp", keep: true },
};
// { item: [key, row], fuel: [key, row] | null, spec } for a preset, { missing } when the pack lacks it,
// or null when the preset takes nothing (a Light spell, a glowing weapon).
export function lightFrom(decl, data, preset) {
  if (!decl?.light) return null;
  const spec = { ...(LIGHT_ITEMS[preset] ?? {}), ...(decl.light[preset] ?? {}) };
  if (!spec.item || decl.light[preset] === false) return null;
  const held = stacks(data, spec.item);
  if (!held.length) return { missing: preset, spec };
  if (spec.fuel) {
    const fuel = stacks(data, spec.fuel);
    if (!fuel.length) return { missing: "oil", spec, item: held[0] };
    return { item: held[0], fuel: fuel[0], spec };
  }
  return { item: held[0], fuel: null, spec, keep: Boolean(spec.keep) };
}
// The light lit: one torch (or one flask of oil) out of the pack.
export function spendLight(data, found) {
  if (found.keep) return { data, name: nameOf(found.item[1]), left: quantity(found.item[1]), kept: true };
  const [key, row] = found.fuel ?? found.item;
  const list = { ...(data.inventorylist ?? {}) };
  const next = lessOne(unbundle(row));
  list[key] = next;
  return { data: { ...data, inventorylist: list }, name: nameOf(row).replace(/\s*\(\d+\)\s*$/, ""), left: quantity(next) };
}

// --- Encumbrance ---------------------------------------------------------------------------------
// Containers: a backpack's capacity, a bag of holding whose contents weigh nothing (FG's location:
// an item is in the container whose name its location holds). A game may add or change them.
export const CONTAINERS = [
  { match: "bag of holding|handy haversack|portable hole|bag of devouring", capacity: 500, weightless: true },
  { match: "\\bbackpack\\b|\\brucksack\\b|\\bknapsack\\b", capacity: 30 },
  { match: "\\bsack\\b", capacity: 30 },
  { match: "saddlebags?", capacity: 30 },
  { match: "\\bpouch\\b|belt pouch", capacity: 6 },
  { match: "\\bchest\\b", capacity: 300 },
  { match: "\\bbarrel\\b", capacity: 320 },
  { match: "\\bbasket\\b", capacity: 40 },
  { match: "\\bquiver\\b|bolt case", capacity: 2 },
];
const weightOf = (row) => {
  const text = String(row?.weight ?? "").trim();
  if (!text) return 0;
  const frac = /^(\d+)\/(\d+)/.exec(text);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return num(/[\d.]+/.exec(text.replace("½", ".5"))?.[0], 0);
};
// A row's weight: per piece times how many (a bundle's weight is the bundle's).
export const rowWeight = (row) => weightOf(row) * Math.max(0, num(row?.count, 1));
export function containersOf(decl, data) {
  const kinds = [...(decl?.encumbrance?.containers ?? []), ...CONTAINERS];
  const out = [];
  for (const [key, row] of rowsOf(data)) {
    const capacity = num(row.capacity, num(row.encumbrancecapacity, 0));
    const kind = kinds.find((item) => test(item.match, nameOf(row)));
    if (!capacity && !kind) continue;
    if (!capacity && isWeaponRow(row)) continue;
    out.push({ key, name: nameOf(row), capacity: capacity || num(kind?.capacity, 0), weightless: Boolean(row.weightless ?? kind?.weightless), carried: carriedOf(row) > 0 });
  }
  return out.map((box) => {
    const inside = rowsOf(data).filter(([key, row]) => key !== box.key && String(row.location ?? "").trim().toLowerCase() === box.name.toLowerCase());
    const used = inside.reduce((sum, [, row]) => sum + rowWeight(row), 0);
    return { ...box, used: Math.round(used * 100) / 100, items: inside.map(([key]) => key), over: box.capacity > 0 && used > box.capacity };
  });
}
// What the character carries, in the game's unit: carried rows, less what sits in a weightless
// container, plus coin (decl coins: so many to the unit; 0 or absent: coins weigh nothing).
export function carriedWeight(decl, data) {
  const spec = decl?.encumbrance ?? {};
  const boxes = containersOf(decl, data);
  const weightless = new Set(boxes.filter((box) => box.weightless).flatMap((box) => box.items));
  const notCarried = new Set(boxes.filter((box) => !box.carried).flatMap((box) => box.items));
  let total = 0;
  for (const [key, row] of rowsOf(data)) {
    if (carriedOf(row) === 0 || weightless.has(key) || notCarried.has(key)) continue;
    // 3.5E and 5E: worn armour counts in full; a game may halve it (decl.wornArmor: 0.5).
    const worn = carriedOf(row) === 2 && /armou?r/i.test(`${row.type ?? ""} ${row.subtype ?? ""}`) ? num(spec.wornArmor, 1) : 1;
    total += rowWeight(row) * worn;
  }
  const coinsPer = num(spec.coins, 0);
  const coins = coinsPer > 0 ? Object.values(data?.coins ?? {}).reduce((sum, coin) => sum + Math.max(0, num(coin?.amount, 0)), 0) / coinsPer : 0;
  return { items: Math.round(total * 100) / 100, coins: Math.round(coins * 100) / 100, total: Math.round((total + coins) * 100) / 100 };
}
// A path's value: "abilities.strength.score".
const at = (node, path) => String(path).split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), node);
// A limit: a number, a path in the record, or {stat, times} (5E: Strength x 15), or
// {table, stat, column} (3.5E's carrying capacity by Strength), or a sum of paths.
function limitOf(limit, data, size = 1) {
  if (typeof limit === "number") return limit;
  if (typeof limit === "string") return num(at(data, limit), 0);
  if (!limit || typeof limit !== "object") return 0;
  if (limit.sum) return limit.sum.reduce((total, part) => total + limitOf(part, data, size), 0) * num(limit.times, 1);
  if (limit.table) {
    const score = Math.max(1, Math.round(num(at(data, limit.stat), 10)));
    const top = limit.table.length;
    let heavy;
    if (score <= top) heavy = limit.table[score - 1];
    else {
      const tens = Math.ceil((score - top) / 10);
      heavy = limit.table[score - 10 * tens - 1] * 4 ** tens;
    }
    return Math.floor(heavy * (limit.part ?? 1)) * size;
  }
  const value = num(at(data, limit.stat ?? limit.path), 0);
  return value * num(limit.times, 1) * size + num(limit.plus, 0);
}
// The creature's size factor (5E and 3.5E: Tiny half, Large double...).
function sizeFactor(spec, data) {
  if (!spec.sizes) return 1;
  const size = String(at(data, spec.sizePath ?? "size") ?? "medium").toLowerCase();
  const found = Object.entries(spec.sizes).find(([name]) => size.startsWith(name));
  return found ? found[1] : 1;
}
// The load: { mode, unit, used, max, level {id, label, tone, ...penalty}, levels, coins, containers, off }.
// mode weight (worked out here), slots or derived (the game's own numbers in the record, read
// through paths). The level's penalty: speed (minus feet, or set to), its effect words (the tracker's
// components: "ATK: -1; SKILL: -3") and its words for the sheet.
export function encumbranceOf(decl, data, switches = { encumbrance: true, variant: false }) {
  const spec = decl?.encumbrance;
  if (!spec) return null;
  const off = switches.encumbrance === false;
  const containers = spec.mode === "weight" ? containersOf(decl, data) : [];
  let used = 0;
  let coins = 0;
  if (spec.mode === "weight") {
    const weight = carriedWeight(decl, data);
    used = weight.total;
    coins = weight.coins;
  } else used = num(at(data, spec.used), 0);
  const size = sizeFactor(spec, data);
  const levels = (switches.variant && spec.variant ? spec.variant : spec.levels ?? []).map((level) => ({ ...level, at: level.upTo === undefined ? Infinity : limitOf(level.upTo, data, size) }));
  const max = spec.max !== undefined ? limitOf(spec.max, data, size) : (levels.filter((level) => Number.isFinite(level.at)).at(-1)?.at ?? 0);
  let level = levels.find((item) => used <= item.at) ?? levels.at(-1) ?? null;
  if (spec.mode === "derived" && spec.levelPath) {
    const word = String(at(data, spec.levelPath) ?? "");
    level = levels.find((item) => item.label === word || item.id === word) ?? level;
  }
  const speed = spec.speed ? String(at(data, spec.speed) ?? "") : "";
  const base = num(/\d+/.exec(speed)?.[0], 0);
  let speedNow = null;
  if (!off && level && base && level.speed !== undefined) {
    if (typeof level.speed === "number") speedNow = level.speed < 0 ? Math.max(0, base + level.speed) : level.speed;
    else if (typeof level.speed === "object" && level.speed.table) {
      const row = level.speed.table.find(([from]) => base >= from);
      speedNow = row ? row[1] : base;
    } else if (typeof level.speed === "object" && level.speed.times !== undefined) speedNow = Math.max(1, Math.round(base * num(level.speed.times, 1)));
  }
  const heavier = Boolean(level) && levels.indexOf(levels.find((item) => item.id === level?.id) ?? levels[0]) > 0;
  return {
    mode: spec.mode,
    unit: spec.unit ?? "",
    label: spec.label ?? "Load",
    used: Math.round(used * 100) / 100,
    max: Math.round(max * 100) / 100,
    coins,
    levels: levels.map((item) => ({ id: item.id, label: item.label, at: item.at, tone: item.tone ?? "" })),
    level: level ? { id: level.id, label: level.label, tone: level.tone ?? "", effect: off ? "" : (level.effect ?? ""), text: level.text ?? "", speed: speedNow, base, heavier: heavier && !off } : null,
    containers,
    off,
    note: spec.note ?? "",
  };
}

// --- Conditions the books bring on: exhaustion and the load ----------------------------------------
// The effects bookkeeping keeps on a creature (its token or tracker entry), each by its tag:
// the load's penalty and, where the game has it, exhaustion by level.
export function autoEffects(decl, data, switches) {
  const out = [];
  const load = switches.encumbrance ? encumbranceOf(decl, data, switches) : null;
  // Past the first level (and for a game whose load the core works out or reads): the level, its components.
  if (load?.level?.heavier) out.push({ tag: "encumbrance", label: load.level.effect ? `${load.level.label}; ${load.level.effect}` : load.level.label, text: load.level.text });
  const exhaustion = decl?.exhaustion;
  const level = exhaustion ? Math.max(0, Math.round(num(at(data, exhaustion.path), 0))) : 0;
  if (exhaustion && level > 0) out.push({ tag: "exhaustion", label: exhaustion.effect.replace(/\{n\}/g, String(level)).replace(/\{(\d+)n\}/g, (whole, by) => String(Number(by) * level)) });
  return out;
}

// --- Packs ---------------------------------------------------------------------------------------
// An equipment pack's contents, read from its words ("Includes a Backpack, a Bedroll, 2 Flasks of
// Oil, 10 days of Rations, ..."): [{ name, count }].
const SMALL = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
export function packContents(row) {
  const text = String(row?.description ?? row?.notes ?? row?.text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const list = /(?:includes|contains|consists of)\s*:?\s*(.+?)(?:\.\s|\.$|$)/i.exec(text)?.[1];
  if (!list) return [];
  return list
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((part) => part.trim().replace(/^and\s+/i, ""))
    .filter(Boolean)
    .map((part) => {
      const days = /^(\d+|\w+)\s+days?\s+(?:of\s+)?rations?/i.exec(part);
      if (days) return { name: "Rations", count: num(days[1], SMALL[days[1].toLowerCase()] ?? 1) };
      const lead = /^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(.+)$/i.exec(part);
      let count = 1;
      let name = part;
      if (lead) {
        count = num(lead[1], SMALL[lead[1].toLowerCase()] ?? 1);
        name = lead[2];
      }
      name = name.replace(/^(?:flasks?|pieces?|sets?|bags?|pints?) of /i, (whole) => (/flask/i.test(whole) ? "Flask of " : "")).replace(/\s*\(.*?\)\s*$/, "");
      if (/^flask of oil$/i.test(name)) name = "Oil";
      if (count > 1) name = name.replace(/ies$/, "y").replace(/(ch|sh|x)es$/, "$1").replace(/([^s])s$/, "$1");
      return { name: name[0].toUpperCase() + name.slice(1), count };
    })
    .filter((item) => item.name.length > 1 && item.name.length < 60);
}
// A few common items' weights (pounds), for a pack's contents with no record of their own.
export const COMMON_WEIGHTS = { backpack: 5, bedroll: 7, "mess kit": 1, tinderbox: 1, torch: 1, ration: 2, waterskin: 5, rope: 5, "hempen rope": 10, crowbar: 5, hammer: 3, piton: 0.25, oil: 1, "flask of oil": 1, lamp: 1, lantern: 2, candle: 0, blanket: 3, "bag of sand": 1, "ball bearing": 2, bell: 0, chalk: 0, "book": 5, "ink": 0, "parchment": 0, "sealing wax": 0, "soap": 0, "string": 0, "vestments": 4, "alms box": 1, "censer": 1, "block of incense": 0, "bag of caltrops": 2, "tent": 20, "shovel": 5, "pot": 10, "costume": 4, "perfume": 0, "case": 1, "little bag of sand": 1, "small knife": 0.5, "disguise kit": 3, "lamp oil": 1 };
export const commonWeight = (name) => {
  const key = String(name).toLowerCase().replace(/^hempen /, "");
  return COMMON_WEIGHTS[key] ?? COMMON_WEIGHTS[key.replace(/s$/, "")] ?? undefined;
};

// --- Rest -----------------------------------------------------------------------------------------
// Zeroes every path a glob names ("slots.*.used", "spellcasting.used.*", "deathsaves.success").
export function zeroPaths(data, globs = []) {
  const out = structuredClone(data);
  const walk = (node, parts) => {
    if (!node || typeof node !== "object") return;
    const [head, ...rest] = parts;
    const keys = head === "*" ? Object.keys(node) : [head];
    for (const key of keys) {
      if (!(key in node)) continue;
      if (rest.length === 0) {
        if (typeof node[key] === "number" || node[key] === undefined || node[key] === "") node[key] = 0;
      } else walk(node[key], rest);
    }
  };
  for (const glob of globs) walk(out, String(glob).split("."));
  return out;
}
// The words of a rest's effects that end with it ("until a long rest", a spell's day gone).
export const endsOnRest = (label, kind = "long") => (kind === "long" ? /\b(?:until|ends? (?:on|with|after)|till)\s+(?:a\s+|the next\s+)?(?:long\s+|short or long\s+)?rest\b|\bper day\b|\b(?:24|8) hours\b/i : /\b(?:until|ends? (?:on|with|after)|till)\s+(?:a\s+|the next\s+)?(?:short\s+|short or long\s+)?rest\b/i).test(String(label ?? ""));
