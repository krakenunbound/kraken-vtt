const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Cairn (shared/cairn/rules.mjs): characters built from the
// campaign's active books (the Player's Guide's backgrounds, tables and
// Marketplace), saves rolled in front of the table (a d20 at or under the
// attribute), the sheet's edits, and what a Cairn character does between
// fights: rest, Fatigue, deprivation, spellbooks, scrolls and relics, the
// Scars and Growth. A record's data.ruleset is "cairn".

let loaded = null;
const rulesCairn = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "cairn", "rules.mjs")).href));
const RULESET_NAME = "Cairn";
const isCairn = (thing) => thing?.data?.ruleset === "cairn";
const isCairnRuleset = (name) => String(name ?? "") === RULESET_NAME;
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const newKey = (list) => {
  let n = Object.keys(list ?? {}).length + 1;
  while (list?.[`id-${String(n).padStart(5, "0")}`]) n += 1;
  return `id-${String(n).padStart(5, "0")}`;
};

function libraryCairn(records) {
  const list = (type) => records.list({ type });
  return { backgrounds: list("background"), items: list("item"), tables: list("cairntable") };
}
// A rules table (traits, bonds, omens, scars) by its group, and its row for a roll.
function tableRow(records, group, roll) {
  const table = records.list({ type: "cairntable" }).find((record) => String(record.data?.group ?? "").toLowerCase() === group);
  if (!table) return null;
  return rows(table.data.rows).map(([, row]) => row).find((row) => roll >= num(row.from) && roll <= num(row.to)) ?? null;
}

async function buildCairn(table, spec, owner, seat) {
  const rules = await rulesCairn();
  const lib = libraryCairn(table.records);
  if (lib.backgrounds.length === 0) throw new Error("No backgrounds in this campaign: make the Cairn Player's Guide active (Modules).");
  const built = rules.buildFromSpec(spec ?? {}, lib);
  const data = require("./characterArt.cjs").withArt(built.data, { ...spec, race: "Human", class: built.data.background }, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A save: d20 at or under the attribute (a 1 always succeeds, a 20 always fails).
async function saveCairn(table, record, { attribute = "", label } = {}, from) {
  const rules = await rulesCairn();
  const stat = statKey(attribute);
  if (!rules.STATS.includes(stat)) throw new Error("Save which: STR, DEX or WIL?");
  const score = num(record.data?.attributes?.[stat]?.score, 0);
  const rolled = table.dice.roll("1d20");
  const die = rolled.terms?.[0]?.rolls?.[0] ?? rolled.total;
  const success = rules.saveResult(die, score);
  table.postRoll(rolled, `${label ? `${label} ` : ""}[SAVE] ${rules.SHORT[stat]} ${score} [${success ? "SUCCESS" : "FAILURE"} ${die} vs ${score}]`, from || record.name, false, { by: record.name, result: success ? "SUCCESS" : "FAILURE", against: score });
  return { total: die, score, success };
}
// "strength", "STR", "str" -> "str".
const statKey = (word) => ({ strength: "str", dexterity: "dex", willpower: "wil", wisdom: "wil" })[String(word ?? "").toLowerCase()] ?? String(word ?? "").toLowerCase().slice(0, 3);

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "notes", "appearance", "background", "bond", "omen", "history", "contacts"]);
const NUMBERS = [/^attributes\.(str|dex|wil)\.(score|max)$/, /^hp\.(wounds|max)$/, /^age$/, /^fatigue$/, /^deprived$/, /^ac\.misc$/, /^coins\.id-\d+\.amount$/, /^inventorylist\.id-\d+\.(count|carried|uses|charges|slots)$/, /^milestones\.id-\d+\.done$/];
const STRINGS = [/^traits\.(physique|skin|hair|face|speech|clothing|virtue|vice)$/, /^inventorylist\.id-\d+\.(name|note|text)$/, /^growth\.id-\d+\.text$/, /^milestones\.id-\d+\.name$/, /^scars\.id-\d+\.text$/];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
function mine(record, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
}
async function editCairn(table, record, changes, seat) {
  mine(record, seat);
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesCairn();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "critical") data.critical = ["dying", "stable"].includes(value) ? value : "";
    else if (STRINGS.some((pattern) => pattern.test(key))) setPath(data, key, String(value ?? "").slice(0, 2000));
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      setPath(data, key, n);
    } else if (/^(inventorylist|growth|milestones|scars)\.id-\d+$/.test(key) && value === null) delete data[key.split(".")[0]]?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

// The Scars table, by the HP lost (1 to 12): the book's words from the
// campaign's Scars table, and its dice rolled now (or kept for when the
// character recovers: the scar's Recover).
async function scarCairn(table, record, lost, from) {
  const rules = await rulesCairn();
  const index = Math.max(1, Math.min(12, Math.round(num(lost, 1))));
  const steps = rules.SCAR_STEPS[index];
  const row = tableRow(table.records, "scars", index);
  const words = String(row?.text ?? `Scar ${index}`);
  const name = words.split(":")[0].trim();
  const data = structuredClone(table.records.get(record.id).data);
  const notes = [];
  if (steps.where) {
    const where = table.roll("1d6", `[SCAR] ${name}: where`, from || record.name);
    notes.push(steps.where[where.total - 1]);
  }
  if (steps.deprived) data.deprived = 1;
  if (steps.doomed) data.doomed = 1;
  for (const step of steps.now ?? []) notes.push(await growthStep(table, record, data, step, `[SCAR] ${name}`, from));
  const key = newKey(data.scars);
  data.scars = { ...(data.scars ?? {}), [key]: { roll: index, name, text: `${words}${notes.length ? ` (${notes.filter(Boolean).join("; ")})` : ""}`, pending: steps.later ? 1 : 0 } };
  table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
  table.say(`[SCAR] ${record.name}: ${index} ${words}${notes.length ? ` — ${notes.filter(Boolean).join("; ")}` : ""}`, from || "Combat");
  return { scar: index, name, notes };
}
// One step of a Scar or a growth: a WIL save first (if it asks), then its dice onto the sheet.
async function growthStep(table, record, data, step, label, from) {
  const rules = await rulesCairn();
  if (step.save) {
    const score = num(data.attributes?.[step.save]?.score, 0);
    const rolled = table.dice.roll("1d20");
    const die = rolled.terms?.[0]?.rolls?.[0] ?? rolled.total;
    const passed = rules.saveResult(die, score);
    table.postRoll(rolled, `${label} [SAVE] ${rules.SHORT[step.save]} ${score} [${passed ? "SUCCESS" : "FAILURE"} ${die} vs ${score}]`, from || record.name, false, { by: record.name, result: passed ? "SUCCESS" : "FAILURE", against: score });
    if (!passed) return `${rules.SHORT[step.save]} save failed`;
  }
  let to = step.to;
  if (to === "attr") {
    const which = table.roll("1d6", `${label}: which attribute`, from || record.name);
    to = rules.attributeOf(which.total);
  }
  const rolled = table.roll(step.roll, `${label}: ${to.toUpperCase()}`, from || record.name);
  return rules.applyGrowth(data, { to, how: step.how, value: rolled.total });
}

// What a Cairn character does outside the fight (the sheet's buttons), for
// the owner or the GM:
//   rest (a few moments and a drink: HP back, not while deprived), sleep (a
//   night's rest in safety: HP back and every Fatigue gone), recover (a
//   week's rest with a healer: attributes back to their maximum, Critical
//   Damage healed), fatigue (amount +1/-1: a Fatigue takes a free slot),
//   deprived (on true/false), stabilize (aid for Critical Damage: bandages),
//   use (item: a use or charge spent), cast (item: a spellbook (both hands,
//   read aloud, a Fatigue; danger true or deprived: a WIL save first), a
//   scroll (gone once used), a relic (a charge)), recharge (item: its charges
//   back, its Recharge done), scar (lost: the Scars table by the HP lost),
//   scar-recover (scar: its "later" roll, once recovered), growth (text: a
//   change written in), growth-roll (to hp|str|dex|wil, roll "3d6", how
//   higher|add|set, reason), milestone (name: added; key + done: ticked;
//   key + remove), item-add (text: "Rope (25ft)").
async function actionCairn(table, record, action, args = {}, seat, from) {
  mine(record, seat);
  const rules = await rulesCairn();
  const data = structuredClone(record.data);
  const who = from || record.name;
  const say = (text) => table.say(text, who);
  const save = (changed = data) => table.records.update(record.id, { data: rules.derive(changed) }, table.seat, { replace: true });
  const item = () => {
    const found = data.inventorylist?.[String(args.item ?? "")];
    if (!found) throw new Error("No such item.");
    return found;
  };
  switch (action) {
    case "rest": {
      if (num(data.deprived)) throw new Error(`${record.name} is deprived and cannot recover HP.`);
      data.hp = { ...(data.hp ?? {}), wounds: 0 };
      say(`[REST] ${record.name} rests a few moments and drinks: HP back to ${num(rules.derive(data).hp.total)}.`);
      return { record: save() };
    }
    case "sleep": {
      if (num(data.deprived)) throw new Error(`${record.name} is deprived: no recovery until the need is met.`);
      const gone = num(data.fatigue);
      data.fatigue = 0;
      data.hp = { ...(data.hp ?? {}), wounds: 0 };
      say(`[REST] ${record.name} sleeps safely through the night: HP back, ${gone} Fatigue gone.`);
      return { record: save() };
    }
    case "recover": {
      if (num(data.deprived)) throw new Error(`${record.name} is deprived: no recovery until the need is met.`);
      for (const stat of rules.STATS) data.attributes[stat] = { ...data.attributes[stat], score: num(data.attributes[stat]?.max, data.attributes[stat]?.score) };
      data.critical = "";
      data.hp = { ...(data.hp ?? {}), wounds: 0 };
      say(`[REST] ${record.name} rests a week with a healer: STR, DEX and WIL restored.`);
      return { record: save() };
    }
    case "fatigue": {
      const amount = Math.round(num(args.amount, 1));
      const derived = rules.derive(data);
      if (amount > 0 && derived.slots.free < amount) throw new Error(`No free slot for Fatigue: ${record.name} must drop an item first.`);
      data.fatigue = Math.max(0, num(data.fatigue) + amount);
      say(`[FATIGUE] ${record.name}: ${amount > 0 ? "+" : ""}${amount} (now ${data.fatigue}).`);
      return { record: save() };
    }
    case "deprived": {
      data.deprived = args.on === false || args.on === 0 ? 0 : 1;
      say(`${record.name} is ${data.deprived ? "deprived" : "no longer deprived"}.`);
      return { record: save() };
    }
    case "stabilize": {
      if (data.critical !== "dying") throw new Error(`${record.name} is not dying.`);
      data.critical = "stable";
      const bandage = rows(data.inventorylist).find(([, entry]) => /bandage/i.test(String(entry.name)) && num(entry.uses, 1) > 0);
      if (bandage) bandage[1].uses = Math.max(0, num(bandage[1].uses, 1) - 1);
      say(`${record.name} is stabilized${bandage ? " with bandages" : ""}: out of danger, but out of action until healed.`);
      return { record: save() };
    }
    case "use": {
      const entry = item();
      const field = num(entry.uses) > 0 ? "uses" : num(entry.charges) > 0 ? "charges" : null;
      if (!field) throw new Error(`${entry.name} has no uses left.`);
      entry[field] = num(entry[field]) - 1;
      say(`${record.name} uses ${entry.name} (${entry[field]} ${field} left).`);
      if (field === "uses" && entry[field] <= 0) delete data.inventorylist[String(args.item)];
      return { record: save() };
    }
    case "recharge": {
      const entry = item();
      entry.charges = Math.max(num(entry.charges), num(args.charges, num(entry.maxcharges, 1)));
      say(`${entry.name} is recharged${entry.recharge ? ` (${entry.recharge})` : ""}.`);
      return { record: save() };
    }
    case "cast": {
      const entry = item();
      const kind = String(entry.kind ?? "").toLowerCase();
      if (kind === "scroll") {
        delete data.inventorylist[String(args.item)];
        say(`[CAST] ${record.name} reads ${entry.name}${entry.note ? `: ${entry.note}` : ""}. The scroll crumbles away (no Fatigue).`);
        return { record: save() };
      }
      if (kind === "relic") {
        if (entry.charges !== undefined && num(entry.charges) <= 0) throw new Error(`${entry.name} has no charge left: it needs its Recharge${entry.recharge ? ` (${entry.recharge})` : ""}.`);
        if (entry.charges !== undefined) entry.charges = num(entry.charges) - 1;
        else if (entry.uses !== undefined) entry.uses = num(entry.uses) - 1;
        say(`[RELIC] ${record.name} uses ${entry.name}${entry.charges !== undefined ? ` (${entry.charges} charge${entry.charges === 1 ? "" : "s"} left)` : ""}. No Fatigue.`);
        return { record: save() };
      }
      if (kind !== "spellbook") throw new Error(`${entry.name} is not a spellbook, scroll or relic.`);
      // Both hands, read aloud, then a Fatigue (it needs a free slot: else an item is dropped first).
      const derived = rules.derive(data);
      if (derived.slots.free < 1) throw new Error(`No free slot for the Fatigue: ${record.name} must drop an item first.`);
      let result = null;
      if (args.danger || num(data.deprived)) {
        const score = num(data.attributes?.wil?.score);
        const rolled = table.dice.roll("1d20");
        const die = rolled.terms?.[0]?.rolls?.[0] ?? rolled.total;
        result = rules.saveResult(die, score);
        table.postRoll(rolled, `[CAST] ${entry.name} [SAVE] WIL ${score} [${result ? "SUCCESS" : "FAILURE"} ${die} vs ${score}]`, who, false, { by: record.name, result: result ? "SUCCESS" : "FAILURE", against: score });
      }
      data.fatigue = num(data.fatigue) + 1;
      say(`[CAST] ${record.name} reads ${entry.name} aloud${entry.text ? `: ${entry.text}` : ""} (+1 Fatigue).${result === false ? " The WIL save failed: the Warden decides the cost, on par with the spell (more Fatigue, the book destroyed, an injury, or worse)." : ""}`);
      return { record: save(), saved: result };
    }
    case "scar":
      return scarCairn(table, record, args.lost, who);
    case "scar-recover": {
      const scar = data.scars?.[String(args.scar ?? "")];
      if (!scar || !num(scar.pending)) throw new Error("That scar has nothing left to roll.");
      const steps = rules.SCAR_STEPS[num(scar.roll, 1)];
      const notes = [];
      for (const step of steps.later ?? []) notes.push(await growthStep(table, record, data, step, `[SCAR] ${scar.name}`, who));
      scar.pending = 0;
      scar.text = `${scar.text} Recovered: ${notes.join("; ")}.`;
      if (steps.deprived) data.deprived = 0;
      say(`[SCAR] ${record.name} recovers from ${scar.name}: ${notes.join("; ")}.`);
      return { record: save() };
    }
    case "growth": {
      const text = String(args.text ?? "").trim().slice(0, 2000);
      if (!text) throw new Error("What changed?");
      data.growth = { ...(data.growth ?? {}), [newKey(data.growth)]: { text } };
      say(`[GROWTH] ${record.name}: ${text}`);
      return { record: save() };
    }
    case "growth-roll": {
      const to = statKey(args.to) === "hp" || args.to === "hp" ? "hp" : statKey(args.to);
      if (to !== "hp" && !rules.STATS.includes(to)) throw new Error("Grow what: hp, str, dex or wil?");
      const how = ["higher", "add", "set", "current"].includes(args.how) ? args.how : "higher";
      const words = await growthStep(table, record, data, { roll: /^\d*d\d+$/.test(String(args.roll ?? "")) ? String(args.roll) : to === "hp" ? "1d6" : "3d6", to, how }, `[GROWTH] ${String(args.reason ?? "").slice(0, 80) || record.name}`, who);
      data.growth = { ...(data.growth ?? {}), [newKey(data.growth)]: { text: `${String(args.reason ?? "Growth").slice(0, 200)}: ${words}` } };
      say(`[GROWTH] ${record.name}: ${words}.`);
      return { record: save(), now: words };
    }
    case "milestone": {
      data.milestones = data.milestones ?? {};
      if (args.key && args.remove) delete data.milestones[String(args.key)];
      else if (args.key) data.milestones[String(args.key)] = { ...(data.milestones[String(args.key)] ?? {}), done: args.done ? 1 : 0 };
      else {
        const name = String(args.name ?? "").trim().slice(0, 300);
        if (!name) throw new Error("Which milestone?");
        data.milestones[newKey(data.milestones)] = { name, done: 0 };
      }
      return { record: save() };
    }
    case "item-add": {
      const text = String(args.text ?? "").trim();
      if (!text) throw new Error("Which item?");
      const parsed = rules.parseItem(text);
      data.inventorylist = data.inventorylist ?? {};
      data.inventorylist[newKey(data.inventorylist)] = { ...parsed, text, count: 1, carried: rules.isArmor(parsed) ? 2 : 1 };
      say(`${record.name} gets ${parsed.name}.`);
      return { record: save() };
    }
    default:
      throw new Error(`No Cairn action ${action}.`);
  }
}

module.exports = { rulesCairn, libraryCairn, buildCairn, saveCairn, editCairn, actionCairn, scarCairn, isCairn, isCairnRuleset, statKey, tableRow, RULESET_NAME };
