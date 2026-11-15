// Bookkeeping at the table (the GM's ask: "an automatic tracker for potions and
// arrows and bullets ... rations consumed during rests ... bag space and
// encumbrance ... with a DM option to disable"): the host side of
// shared/bookkeeping/bookkeeping.mjs, each part behind its own switch (table
// option bookkeeping: ammo, consumables, rations, light, encumbrance, variant).
//
//   fire        an attack with a launcher spends its ammunition (combat.cjs
//               attack): one a shot, refused with none left, a warning when low;
//               the fight's tally kept, recover after it (half in 5E);
//   use         a potion drunk, a scroll read, a charge or a kit's use spent
//               (the sheet's Use, or the item dragged onto a creature: healing
//               lands on it);
//   day ends    each party member eats a ration and drinks (the calendar
//               passing midnight), the game's penalty for going without; a long
//               rest eats for its day (never twice for one day);
//   light       a torch lit from the Effects window or the sheet takes a torch
//               from the pack, a lantern a flask of oil (effects.cjs apply);
//   load        the encumbrance level's penalty kept as an effect on the
//               creature (its token or tracker entry), exhaustion too; a game
//               whose rules work the load out themselves reads the GM's switch
//               (data.encumbranceoff);
//   rest        the game's short and long rest for a character, the party
//               ("Rest the party"), and the tracker's end of the fight; the
//               calendar moves on for the party's.
//
// Who may: the GM anything; a player their own character (their own rests,
// potions, ammunition). Messages "bookkeeping" and "rest", tools
// kraken_bookkeeping and kraken_rest.
const path = require("path");
const { pathToFileURL } = require("url");

const lib = {};
const ready = Promise.all([
  import(pathToFileURL(path.join(__dirname, "..", "shared", "bookkeeping", "bookkeeping.mjs")).href).then((module) => (lib.bk = module)),
  import(pathToFileURL(path.join(__dirname, "..", "shared", "rulesets", "registry.mjs")).href).then((module) => (lib.registry = module)),
  import(pathToFileURL(path.join(__dirname, "..", "shared", "actions", "parse.mjs")).href).then((module) => (lib.parse = module)),
]);
const engines = new Map();
async function engineFor(manifest) {
  if (!manifest?.engine || /siege/.test(manifest.engine)) return null;
  if (!engines.has(manifest.engine)) engines.set(manifest.engine, import(pathToFileURL(path.join(__dirname, "..", manifest.engine)).href).catch(() => null));
  return engines.get(manifest.engine);
}
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) && value !== "" && value !== null ? Number(value) : fallback);
const at = (node, key) => String(key).split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), node);
function setAt(node, key, value) {
  const parts = String(key).split(".");
  let here = node;
  for (const part of parts.slice(0, -1)) here = here[part] = here[part] && typeof here[part] === "object" ? here[part] : {};
  here[parts.at(-1)] = value;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// table: the table server's agent handle (records, combat, map, say, roll, options, calendar, effects).
function createBookkeeping(table) {
  const switches = () => lib.bk.switchesOf(table.options?.() ?? {});
  const manifestOf = (record) => lib.registry.rulesetOfRecord(record?.data?.ruleset);
  const declOf = (record) => manifestOf(record)?.bookkeeping ?? null;
  const mapOf = () => table.tableMap ?? table.map;
  const character = (id) => {
    const record = table.records.get(String(id ?? ""));
    if (!record || record.type !== "character") throw new Error("No such character.");
    return record;
  };
  const mine = (record, seat) => {
    if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("That is not your character.");
  };
  // The record's numbers worked out again by its game's rules (attacks, load, slots), then kept.
  async function save(record, data) {
    const engine = await engineFor(manifestOf(record));
    const derived = engine?.derive ? engine.derive(data) : data;
    return table.records.update(record.id, { data: derived }, table.seat, { replace: true });
  }
  const say = (line, from = "Bookkeeping", secret = false) => table.say(line, from, secret);
  // The party's characters (the party sheet's members), else every character a player holds.
  function party() {
    const ids = table.records.get("party")?.data?.members;
    const members = Array.isArray(ids) ? ids.map((id) => table.records.get(id)).filter((record) => record?.type === "character") : [];
    return members.length ? members : table.records.list({ type: "character" }).filter((record) => record.owner);
  }
  // Today, as one number that grows a day at a time (the calendar's year and day of the year).
  const today = () => {
    const now = table.calendar?.()?.view?.({ role: "dm", name: "GM" });
    return now ? num(now.year, 0) * 1000 + num(now.day, 0) : 0;
  };
  let lastDay = null;

  // --- Ammunition ---------------------------------------------------------------------------------
  // An attack's shots (combat.cjs attack, before the game's own roll): { ok, ...what was fired } or
  // { ok: false, reason } with nothing to fire. NPCs and untracked weapons always fire.
  async function fire(plan, weaponKey, { full = false } = {}) {
    await ready;
    const record = plan?.record;
    if (!record || record.type !== "character" || !switches().ammo) return { ok: true };
    const decl = declOf(record);
    if (!decl?.ammo || decl.ammo.engine === "siege") return { ok: true };
    const shots = full ? Math.max(1, plan.bonuses?.length || plan.swings?.length || 1) : 1;
    const now = table.records.get(record.id) ?? record;
    const spent = lib.bk.spendAmmo(decl, now.data, weaponKey, plan.name, shots);
    if (!spent.tracked) return { ok: true };
    if (!spent.ok) {
      say(`[AMMUNITION] ${spent.reason}`, "Combat");
      return { ok: false, reason: spent.reason };
    }
    await save(now, spent.data);
    if (spent.reloaded) say(`[AMMUNITION] ${now.name} reloads the ${spent.weapon}: ${spent.left} rounds in it, ${plural(spent.spares, "spare magazine")} left.`, "Combat");
    else if (spent.low) say(`[AMMUNITION] ${now.name} is low on ${spent.kind.label}: ${spent.left} left.`, "Combat");
    return { ok: true, ammo: spent.name, fired: spent.fired, left: spent.left, ...(spent.spares !== undefined ? { spares: spent.spares } : {}) };
  }
  // SiegeCore fired one itself (C&C's fireAmmunition): the fight's tally, for picking up after.
  function tally(recordId, key, name, n = 1) {
    const record = table.records.get(recordId);
    if (!record) return;
    const spent = { ...(record.data.bookkeeping?.spent ?? {}) };
    spent[key] = { name, n: num(spent[key]?.n, 0) + n };
    table.records.update(record.id, { data: { bookkeeping: { ...(record.data.bookkeeping ?? {}), spent } } }, table.seat);
  }
  // The fight is over (the tracker's End): each character who shot is told what can be picked up.
  function fightOver() {
    if (!lib.bk || !switches().ammo) return [];
    const told = [];
    for (const record of table.records.list({ type: "character" })) {
      const decl = declOf(record);
      if (!decl?.ammo) continue;
      const back = lib.bk.recoverable(decl, record.data).filter((item) => item.back > 0);
      if (!back.length) continue;
      say(`[AMMUNITION] ${record.name} can pick up ${back.map((item) => `${item.back} ${item.name}`).join(", ")} after the fight: Recover on the sheet's Inventory.`);
      told.push({ name: record.name, back });
    }
    return told;
  }
  async function recover(record, seat) {
    mine(record, seat);
    const decl = declOf(record);
    const done = lib.bk.recoverAmmo(decl, record.data);
    if (!done.back.length) throw new Error(`${record.name} has nothing to pick up.`);
    await save(record, done.data);
    const got = done.back.filter((item) => item.back > 0);
    say(`[AMMUNITION] ${record.name} picks up ${got.length ? got.map((item) => `${item.back} ${item.name}`).join(", ") : "nothing worth keeping"}${done.back.some((item) => item.spent > item.back) ? "; the rest is lost" : ""}.`, record.name);
    return { recovered: done.back };
  }

  // --- Consumables --------------------------------------------------------------------------------
  // An item used: a potion's healing lands on `to` (an entry, token or record; the user by default).
  async function use(record, key, seat, { to = null } = {}) {
    mine(record, seat);
    if (!switches().consumables) throw new Error("The GM is not counting consumables: use it from the sheet by hand.");
    const decl = declOf(record);
    const used = lib.bk.useConsumable(decl, record.data, String(key ?? ""), lib.parse.parseSpell);
    if (!used.ok) throw new Error(used.reason);
    await save(record, used.data);
    let healed = null;
    let onto = record.name;
    if (used.info.heal?.dice) {
      const formula = `${used.info.heal.dice}${used.info.heal.bonus ? (used.info.heal.bonus > 0 ? `+${used.info.heal.bonus}` : used.info.heal.bonus) : ""}`;
      const target = whoIs(to ?? { recordId: record.id });
      onto = target.name;
      const roll = table.roll(formula, `[HEAL] ${used.name} -> [to ${target.name}]`, seat.role === "dm" ? record.name : seat.name);
      healed = roll.total;
      await heal(target, healed);
    } else say(`${record.name} uses ${used.name}${used.gone ? "" : ` (${used.left} ${used.info.field === "count" ? "left" : `${used.info.field} left`})`}.`, seat.role === "dm" ? record.name : seat.name);
    return { used: used.name, left: used.left, gone: used.gone, kind: used.info.kind, ...(healed !== null ? { healed, to: onto } : {}) };
  }
  // Who an item lands on: a tracker entry, a token, or a character.
  function whoIs(to) {
    const entries = table.combat.entries();
    if (to?.entryId) {
      const entry = entries.find((item) => item.id === String(to.entryId));
      if (!entry) throw new Error("No one like that is on the combat tracker.");
      return { entry, name: entry.name, recordId: entry.recordId };
    }
    if (to?.tokenId) {
      const token = mapOf().tokens().find((item) => item.id === String(to.tokenId));
      if (!token) throw new Error("No such token.");
      const entry = entries.find((item) => item.tokenId === token.id) ?? (token.recordId ? entries.find((item) => item.recordId === token.recordId) : null);
      return { entry, name: token.name, recordId: token.recordId };
    }
    const record = table.records.get(String(to?.recordId ?? ""));
    if (!record) throw new Error("Use it on whom?");
    return { entry: entries.find((item) => item.recordId === record.id) ?? null, name: record.name, recordId: record.id };
  }
  async function heal(target, amount) {
    if (target.entry) return table.combat.heal(target.entry.id, amount, table.seat);
    const record = target.recordId ? table.records.get(target.recordId) : null;
    if (!record || record.type !== "character") return null;
    const data = structuredClone(record.data);
    setAt(data, "hp.wounds", Math.max(0, num(at(data, "hp.wounds"), 0) - amount));
    return save(record, data);
  }

  // --- Rations and water -------------------------------------------------------------------------
  // One character's day: eaten and drunk for `day` (unless already), or its penalty. Returns the lines.
  async function feed(record, day, { quiet = false } = {}) {
    const decl = declOf(record);
    const spec = decl?.rations;
    if (!spec) return [];
    let data = structuredClone(record.data);
    const books = (data.bookkeeping = { ...(data.bookkeeping ?? {}) });
    const lines = [];
    const needFood = num(books.fedDay, day - 1) < day;
    const needWater = Boolean(spec.water) && num(books.wateredDay, day - 1) < day;
    if (!needFood && !needWater) return [];
    const ate = lib.bk.eatDay(decl, data, { food: needFood, water: needWater });
    data = { ...ate.data, bookkeeping: books };
    const penalties = [];
    if (needFood) {
      if (ate.ate) {
        books.fedDay = day;
        books.hungry = 0;
      } else {
        books.hungry = num(books.hungry, 0) + 1;
        books.fedDay = day;
        if (books.hungry > lib.bk.graceDays(spec.penalty?.food, data)) penalties.push(["food", spec.penalty?.food, books.hungry - lib.bk.graceDays(spec.penalty?.food, data)]);
        else lines.push(`${record.name} has no food left (day ${books.hungry} without).`);
      }
    }
    if (needWater) {
      if (ate.drank) {
        books.wateredDay = day;
        books.thirsty = 0;
      } else {
        books.thirsty = num(books.thirsty, 0) + 1;
        books.wateredDay = day;
        if (books.thirsty > lib.bk.graceDays(spec.penalty?.water, data)) penalties.push(["water", spec.penalty?.water, books.thirsty - lib.bk.graceDays(spec.penalty?.water, data)]);
        else lines.push(`${record.name} has no water left (day ${books.thirsty} without).`);
      }
    }
    for (const [, penalty, count] of penalties) if (penalty) lines.push(applyPenalty(record, data, penalty, count));
    await save(record, data);
    if (!quiet) for (const line of lines) say(`[RATIONS] ${line}`);
    return lines;
  }
  // The game's penalty for a day gone without: exhaustion, damage, a check against damage, Deprived.
  function applyPenalty(record, data, penalty, count) {
    const who = record.name;
    switch (penalty.kind) {
      case "exhaustion": {
        const spec = declOf(record)?.exhaustion;
        const key = spec?.path ?? "exhaustion";
        const level = Math.min(num(spec?.max, 6), num(at(data, key), 0) + 1);
        setAt(data, key, level);
        return `${who} ${penalty.text}: now Exhaustion ${level}.`;
      }
      case "damage": {
        const rolled = table.dice.roll(String(penalty.damage ?? "1"));
        setAt(data, penalty.path ?? "hp.wounds", num(at(data, penalty.path ?? "hp.wounds"), 0) + rolled.total);
        return `${who} ${penalty.text}: ${rolled.total} lost.`;
      }
      case "check-damage": {
        const dc = num(penalty.check?.dc, 10) + num(penalty.check?.step, 0) * Math.max(0, count - 1);
        const mod = num(at(data, penalty.check?.mod ?? ""), 0);
        const check = table.dice.roll(`1d20${mod >= 0 ? "+" : ""}${mod}`);
        if (check.total >= dc) return `${who} goes without (a Constitution check ${check.total} against DC ${dc}: holds out).`;
        const rolled = table.dice.roll(String(penalty.damage ?? "1d6"));
        setAt(data, penalty.path ?? "hp.wounds", num(at(data, penalty.path ?? "hp.wounds"), 0) + rolled.total);
        return `${who} ${penalty.text}: the check ${check.total} against DC ${dc} fails, ${rolled.total} damage.`;
      }
      case "deprived": {
        if (num(data.deprived, 0)) {
          data.fatigue = num(data.fatigue, 0) + 1;
          return `${who} is still Deprived: a Fatigue (now ${data.fatigue}).`;
        }
        data.deprived = 1;
        return `${who} ${penalty.text}.`;
      }
      default:
        return `${who} ${penalty.text}.`;
    }
  }
  // Game time passed (the calendar's Advance): each day that ended is eaten and drunk for.
  async function timePassed() {
    await ready;
    const now = today();
    if (lastDay === null || !switches().rations) {
      lastDay = now;
      return [];
    }
    const lines = [];
    for (let day = lastDay; day < now && day < lastDay + 60; day += 1) for (const record of party()) lines.push(...(await feed(table.records.get(record.id) ?? record, day)));
    lastDay = now;
    return lines;
  }
  async function eatNow(record, seat) {
    mine(record, seat);
    if (!switches().rations) throw new Error("The GM is not counting rations.");
    const lines = await feed(record, today());
    return { lines: lines.length ? lines : [`${record.name} has eaten today already.`] };
  }
  async function refillWater(record, seat) {
    mine(record, seat);
    const done = lib.bk.refill(declOf(record), record.data);
    if (!done.filled) throw new Error(`${record.name} carries nothing to fill.`);
    await save(record, done.data);
    say(`${record.name} fills ${plural(done.filled, "waterskin")}.`, seat.role === "dm" ? record.name : seat.name);
    return { filled: done.filled };
  }

  // --- Light --------------------------------------------------------------------------------------
  // A light put on a creature (effects.cjs apply): its torch or a flask of oil out of the pack.
  // A player with none is refused; the GM's light goes on anyway, said so in chat.
  function light(where, preset, seat) {
    if (!lib.bk || !switches().light) return { ok: true };
    const recordId = where.kind === "entry" ? where.entry.recordId : where.token?.recordId;
    const record = recordId ? table.records.get(recordId) : null;
    if (!record || record.type !== "character" || !record.data?.inventorylist) return { ok: true };
    const found = lib.bk.lightFrom(declOf(record), record.data, preset);
    if (!found) return { ok: true };
    if (found.missing) {
      const what = found.missing === "oil" ? "oil for the lantern" : found.missing;
      if (seat.role !== "dm") throw new Error(`${record.name} has no ${what} to light.`);
      return { ok: true, note: `${record.name} carries no ${what}: lit by the GM anyway.` };
    }
    const spent = lib.bk.spendLight(record.data, found);
    // Kept at once (the effect goes on in the same breath), its numbers worked out again after.
    if (!spent.kept) {
      table.records.update(record.id, { data: spent.data }, table.seat, { replace: true });
      void save(table.records.get(record.id), spent.data).catch(() => undefined);
    }
    return { ok: true, spent: spent.kept ? null : spent.name, left: spent.left };
  }

  // --- Packs and containers -----------------------------------------------------------------------
  async function unpack(record, key, seat) {
    mine(record, seat);
    const row = record.data.inventorylist?.[key];
    if (!row) throw new Error("That item is gone.");
    const contents = lib.bk.packContents(row);
    if (!contents.length) throw new Error(`${row.name} lists nothing inside it.`);
    const data = structuredClone(record.data);
    const list = (data.inventorylist ??= {});
    delete list[key];
    const books = table.records.list({ type: "item" });
    for (const item of contents) {
      const known = books.find((other) => other.name.toLowerCase() === item.name.toLowerCase() || other.name.toLowerCase() === `${item.name.toLowerCase()}s`);
      const same = Object.entries(list).find(([, other]) => String(other?.name ?? "").toLowerCase() === item.name.toLowerCase());
      if (same) {
        same[1].count = num(same[1].count, 1) + item.count;
        continue;
      }
      const base = known ? { ...known.data, name: known.name } : { name: item.name, ...(lib.bk.commonWeight(item.name) !== undefined ? { weight: lib.bk.commonWeight(item.name) } : {}) };
      list[lib.bk.nextKey(list)] = { ...base, count: item.count, carried: 1 };
    }
    await save(record, data);
    say(`${record.name} unpacks the ${row.name}: ${contents.map((item) => (item.count > 1 ? `${item.count} ${item.name}` : item.name)).join(", ")}.`, seat.role === "dm" ? record.name : seat.name);
    return { unpacked: row.name, contents };
  }
  // An item put into a container (FG's location: the container's name), or taken out ("").
  async function pack(record, key, into, seat) {
    mine(record, seat);
    const row = record.data.inventorylist?.[key];
    if (!row) throw new Error("That item is gone.");
    const box = into ? record.data.inventorylist?.[into] : null;
    if (into && !box) throw new Error("No such container.");
    if (into === key) throw new Error("A bag does not go inside itself.");
    const data = structuredClone(record.data);
    data.inventorylist[key].location = box ? String(box.name) : "";
    await save(record, data);
    const after = lib.bk.containersOf(declOf(record), data).find((item) => item.key === into);
    return { item: row.name, in: box ? box.name : "", ...(after ? { used: after.used, capacity: after.capacity, over: after.over } : {}) };
  }
  async function exhaustion(record, amount, seat) {
    if (seat.role !== "dm") throw new Error("The GM changes exhaustion.");
    const spec = declOf(record)?.exhaustion;
    if (!spec) throw new Error("This game has no exhaustion.");
    const data = structuredClone(record.data);
    const level = Math.max(0, Math.min(num(spec.max, 6), num(at(data, spec.path), 0) + Math.round(num(amount, 1))));
    setAt(data, spec.path, level);
    await save(record, data);
    say(`${record.name}: Exhaustion ${level}${level >= num(spec.max, 6) ? " (dead)" : ""}.`);
    return { exhaustion: level };
  }

  // --- The load and exhaustion as effects ---------------------------------------------------------
  // Each character's bookkeeping effects (source "Bookkeeping": the load's level, exhaustion) kept
  // on its tracker entry or its token, replaced when they change, taken off when they end.
  const SOURCE = "Bookkeeping";
  function syncOne(record) {
    if (!lib.bk || record?.type !== "character") return;
    const decl = declOf(record);
    if (!decl) return;
    const wanted = lib.bk.autoEffects(decl, record.data, switches());
    const entry = table.combat.entries().find((item) => item.recordId === record.id);
    let token = null;
    if (!entry) {
      try {
        token = mapOf().scene() ? mapOf().tokens().find((item) => item.recordId === record.id) : null;
      } catch {
        token = null;
      }
    }
    if (!entry && !token) return;
    const have = entry ? entry.effects : mapOf().tokenEffects(token.id);
    const ours = have.filter((effect) => effect.source === SOURCE);
    const same = ours.length === wanted.length && wanted.every((want) => ours.some((effect) => effect.label === want.label));
    if (same) return;
    if (entry) {
      for (const effect of ours) table.combat.takeOff(entry.id, effect.id);
      for (const want of wanted) table.combat.putOn(entry.id, { label: want.label, duration: 0, source: SOURCE, icon: want.tag === "exhaustion" ? "exhaustion" : "slow" });
    } else {
      const kept = have.filter((effect) => effect.source !== SOURCE);
      mapOf().setTokenEffects(token.id, [...kept, ...wanted.map((want) => ({ label: want.label, duration: 0, source: SOURCE, icon: want.tag === "exhaustion" ? "exhaustion" : "slow" }))]);
    }
  }
  let pending = new Set();
  let queued = false;
  function sync(recordId) {
    pending.add(recordId);
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const ids = pending;
      pending = new Set();
      for (const id of ids) {
        try {
          syncOne(table.records.get(id));
        } catch {
          /* no map, or the creature is gone */
        }
      }
    });
  }
  const syncAll = () => {
    for (const record of table.records.list({ type: "character" })) sync(record.id);
  };
  // The GM switched the load off or on: games whose rules work it out read data.encumbranceoff.
  async function switched(before, after) {
    await ready;
    if (before.encumbrance !== after.encumbrance) {
      for (const record of table.records.list({ type: "character" })) {
        const decl = declOf(record);
        if (!decl?.encumbrance?.offFlag) continue;
        const data = { ...record.data, encumbranceoff: after.encumbrance ? 0 : 1 };
        await save(record, data);
      }
    }
    syncAll();
  }

  // --- Rest ---------------------------------------------------------------------------------------
  // One character's rest (kind short or long) by its game's declaration. hitDice: how many to spend
  // on a short rest (5E; none given: as many as it takes to heal, of those left).
  async function restOne(record, kind, seat, { hitDice } = {}) {
    await ready;
    mine(record, seat);
    const decl = declOf(record);
    const spec = decl?.rest?.[kind];
    if (!spec) throw new Error(`${manifestOf(record).names?.[0] ?? "This game"} has no ${kind} rest${decl?.rest?.long && kind === "short" ? ": take a long rest" : ""}.`);
    const from = seat.role === "dm" ? record.name : seat.name;
    const lines = [];
    if (spec.via) {
      const module = require(`./${spec.via.module}.cjs`);
      await module[`action${spec.via.module[0].toUpperCase()}${spec.via.module.slice(1)}`](table, record, spec.via.action, {}, seat, from);
      if (spec.rations && switches().rations) lines.push(...(await feed(table.records.get(record.id), today(), { quiet: true })));
      for (const line of lines) say(`[RATIONS] ${line}`);
      endEffects(record, kind);
      return { rested: record.name, kind, lines };
    }
    if (num(at(record.data, "hp.total"), 1) - num(at(record.data, "hp.wounds"), 0) <= 0 && decl.rest.short?.hitDice) throw new Error(`${record.name} needs at least 1 hit point to rest.`);
    let data = structuredClone(record.data);
    const words = [];
    const healBy = (amount) => {
      const before = num(at(data, "hp.wounds"), 0);
      setAt(data, "hp.wounds", Math.max(0, before - amount));
      return before - num(at(data, "hp.wounds"), 0);
    };
    // Hit Point Dice spent (a 5E short rest).
    if (spec.hitDice && kind === "short") {
      const die = num(at(data, spec.hitDice.die), 8);
      const left = Math.max(0, num(at(data, spec.hitDice.total), num(data.level, 1)) - num(at(data, spec.hitDice.used), 0));
      const mod = num(at(data, spec.hitDice.mod ?? ""), 0);
      const wounds = num(at(data, "hp.wounds"), 0);
      const want = hitDice === undefined ? Math.min(left, Math.ceil(wounds / Math.max(1, die / 2 + 0.5 + mod))) : Math.min(left, Math.max(0, Math.round(num(hitDice, 0))));
      if (hitDice !== undefined && num(hitDice, 0) > left) throw new Error(`${record.name} has ${plural(left, "Hit Point Die")} left.`);
      if (want > 0) {
        const rolled = table.roll(`${want}d${die}${mod ? (mod > 0 ? `+${want * mod}` : `${want * mod}`) : ""}`, `[SHORT REST] ${record.name} spends ${plural(want, "Hit Point Die")}`, from);
        const healed = healBy(Math.max(want, rolled.total));
        setAt(data, spec.hitDice.used, num(at(data, spec.hitDice.used), 0) + want);
        words.push(`${plural(want, "Hit Point Die")} spent, ${healed} HP back`);
      } else words.push(left ? "no Hit Point Dice needed" : "no Hit Point Dice left");
    }
    // Hit points back on a long rest: all, a number, a number a level, or dice.
    if (spec.hp !== undefined) {
      let amount = 0;
      if (spec.hp === "full") amount = num(at(data, "hp.wounds"), 0);
      else if (typeof spec.hp === "number") amount = spec.hp;
      else if (spec.hp.perLevel) amount = spec.hp.perLevel * Math.max(1, num(at(data, spec.hp.level ?? "level"), 1));
      else if (spec.hp.dice) {
        const mod = num(at(data, spec.hp.mod ?? ""), 0);
        amount = Math.max(1, table.roll(`${spec.hp.dice}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ""}`, `[REST] ${record.name} heals`, from).total);
      }
      const healed = healBy(amount);
      words.push(!healed ? "no wounds to heal" : spec.hp === "full" ? "every hit point back" : `${healed} HP back`);
    }
    if (spec.temp && at(data, "hp.temp") !== undefined) setAt(data, "hp.temp", 0);
    if (spec.hitDice && kind === "long") {
      const total = Math.max(1, num(at(data, spec.hitDice.total), num(data.level, 1)));
      const used = num(at(data, spec.hitDice.used), 0);
      const back = spec.hitDice.back === "all" ? used : Math.min(used, Math.max(1, Math.floor(total / 2)));
      setAt(data, spec.hitDice.used, used - back);
      if (back) words.push(`${plural(back, "Hit Point Die")} back`);
    }
    if (spec.reset?.length) {
      data = lib.bk.zeroPaths(data, spec.reset);
      if (spec.reset.some((glob) => /slots|spellcasting/.test(glob))) words.push("spells back");
    }
    if (spec.exhaustion && decl.exhaustion) {
      const books = data.bookkeeping ?? {};
      const level = num(at(data, decl.exhaustion.path), 0);
      // Exhaustion from hunger or thirst stays until the creature has eaten and drunk its fill.
      if (level > 0 && !(num(books.hungry, 0) > 0 || num(books.thirsty, 0) > 0)) {
        setAt(data, decl.exhaustion.path, Math.max(0, level + spec.exhaustion));
        words.push(`Exhaustion ${level} to ${Math.max(0, level + spec.exhaustion)}`);
      }
    }
    if (spec.concentration && data.concentration) data.concentration = "";
    await save(record, data);
    if (spec.rations && switches().rations) lines.push(...(await feed(table.records.get(record.id), today(), { quiet: true })));
    endEffects(record, kind);
    say(`[${kind === "long" ? "LONG" : "SHORT"} REST] ${record.name}: ${words.join(", ") || "rested"}.`, from);
    for (const line of lines) say(`[RATIONS] ${line}`);
    return { rested: record.name, kind, words, lines };
  }
  // Effects that end with the rest come off the character (its entry and its token).
  function endEffects(record, kind) {
    const entry = table.combat.entries().find((item) => item.recordId === record.id);
    if (entry) for (const effect of [...entry.effects]) if (effect.source !== SOURCE && lib.bk.endsOnRest(effect.label, kind)) table.combat.takeOff(entry.id, effect.id);
    try {
      const token = mapOf().scene() ? mapOf().tokens().find((item) => item.recordId === record.id) : null;
      if (token) mapOf().setTokenEffects(token.id, mapOf().tokenEffects(token.id).filter((effect) => effect.source === SOURCE || !lib.bk.endsOnRest(effect.label, kind)));
    } catch {
      /* no map */
    }
  }
  // A rest for a character (id) or the whole party (the GM's: the calendar moves on by the rest).
  async function rest({ id, party: all = false, kind = "long", hitDice } = {}, seat) {
    await ready;
    if (!["short", "long"].includes(kind)) throw new Error("A short or a long rest?");
    if (!all) return restOne(character(id), kind, seat, { hitDice });
    if (seat.role !== "dm") throw new Error("The GM rests the party.");
    if (num(table.combat.round?.(), 0) > 0) throw new Error("Not while the fight goes on: end combat first.");
    const members = party();
    if (!members.length) throw new Error("The party has no members.");
    const results = [];
    for (const record of members) {
      try {
        results.push(await restOne(record, kind, seat, {}));
      } catch (error) {
        results.push({ rested: record.name, kind, skipped: error instanceof Error ? error.message : String(error) });
      }
    }
    // The clock moves on by the game's rest (the longest a member's game declares).
    const hours = Math.max(0, ...members.map((record) => num(declOf(record)?.rest?.[kind]?.hours, 0)));
    if (hours > 0 && table.calendar?.()) table.calendar().advance({ hours }, seat);
    return { kind, hours, results };
  }

  // What the tool and the sheet read: every part for one character.
  function view(record) {
    const decl = declOf(record);
    const sw = switches();
    const data = record.data;
    const ammo = decl?.ammo
      ? lib.bk.rowsOf(data).flatMap(([key, row]) => {
          const kind = lib.bk.ammoKindOf(decl, row);
          if (!kind || !(String(row.damage ?? "").trim() || /weapon/i.test(String(row.type ?? "")))) return [];
          const stacks = lib.bk.ammoStacks(decl, data, kind, key);
          return [{ weapon: row.name, key, kind: kind.id, left: stacks.reduce((sum, [, item]) => sum + lib.bk.quantity(item), 0), stacks: stacks.map(([stack, item]) => ({ key: stack, name: item.name, count: lib.bk.quantity(item) })), ...(num(row.magazine, 0) > 0 ? { loaded: num(row.loaded, row.magazine), magazine: num(row.magazine) } : {}) }];
        })
      : [];
    const consumables = decl?.consumables
      ? lib.bk.rowsOf(data).flatMap(([key, row]) => {
          const info = lib.bk.consumableOf(decl, row, lib.parse.parseSpell);
          return info ? [{ key, name: row.name, kind: info.kind, left: info.left, field: info.field, ...(info.heal ? { heal: info.heal } : {}) }] : [];
        })
      : [];
    return {
      id: record.id,
      name: record.name,
      switches: sw,
      ammo,
      recoverable: decl?.ammo ? lib.bk.recoverable(decl, data) : [],
      consumables,
      rations: decl?.rations ? lib.bk.supplies(decl, data) : null,
      load: decl?.encumbrance ? lib.bk.encumbranceOf(decl, data, sw) : null,
      exhaustion: decl?.exhaustion ? num(at(data, decl.exhaustion.path), 0) : null,
      effects: lib.bk.autoEffects(decl, data, sw),
      rests: Object.keys(decl?.rest || {}),
      packs: lib.bk.rowsOf(data).filter(([, row]) => lib.bk.packContents(row).length).map(([key, row]) => ({ key, name: row.name })),
    };
  }

  // Records changed: the load's effect follows the inventory.
  table.records.subscribe?.(({ kind, record }) => {
    if (kind === "upsert" && record?.type === "character") sync(record.id);
  });

  // One character's bookkeeping action (the sheet's buttons, the message, the tool).
  async function act(record, action, args = {}, seat) {
    await ready;
    switch (action) {
      case "view":
        mine(record, seat);
        return view(record);
      case "recover":
        return recover(record, seat);
      case "use":
        return use(record, args.item, seat, { to: args.to ?? null });
      case "eat":
        return eatNow(record, seat);
      case "refill":
        return refillWater(record, seat);
      case "unpack":
        return unpack(record, String(args.item ?? ""), seat);
      case "pack":
        return pack(record, String(args.item ?? ""), String(args.into ?? ""), seat);
      case "exhaustion":
        return exhaustion(record, args.amount ?? 1, seat);
      case "light": {
        mine(record, seat);
        const preset = String(args.preset ?? "torch");
        const token = (() => {
          try {
            return mapOf().scene() ? mapOf().tokens().find((item) => item.recordId === record.id) : null;
          } catch {
            return null;
          }
        })();
        const entry = table.combat.entries().find((item) => item.recordId === record.id);
        if (!entry && !token) throw new Error(`${record.name} is neither on the map nor on the combat tracker: put their token on the map first.`);
        await table.effects.ready;
        return table.effects.apply({ to: entry ? { entryId: entry.id } : { tokenId: token.id }, preset }, seat);
      }
      default:
        throw new Error("What should bookkeeping do? view, recover, use, eat, refill, unpack, pack, exhaustion or light.");
    }
  }

  return {
    ready,
    act,
    fire,
    tally,
    fightOver,
    recover,
    use,
    eat: eatNow,
    refill: refillWater,
    light,
    unpack,
    pack,
    exhaustion,
    timePassed,
    switched,
    sync,
    syncAll,
    rest,
    view,
    party,
    declOf,
    // The table opens: today is where the day counting starts.
    start: () => ready.then(() => (lastDay = today())),
  };
}

module.exports = { createBookkeeping };
