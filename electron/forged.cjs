const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Forged in the Dark (shared/forged/rules.mjs; the Blades in the
// Dark SRD, CC BY 3.0): scoundrels built from the campaign's active books
// (Kraken's playbooks), their rolls made on the table's dice in front of
// everyone (action rolls with the GM's position and effect, assistance,
// pushing and the Devil's Bargain; resistance; fortune; the vice roll),
// stress and trauma, harm and healing, armor, xp and advances, load, the
// downtime activities, and the crew: kept on the party record (data.crew),
// shared by the whole table: its creation, rep, Tier and hold, heat and
// wanted level, coin and vault, upgrades, abilities, contacts, cohorts,
// claims and faction status, payoff, heat and entanglements. The Score
// panel's state and the clocks are the table's (electron/clocks.cjs).

let loaded = null;
const rulesForged = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "forged", "rules.mjs")).href));
const RULESET_NAME = "Forged in the Dark";
const isForged = (thing) => thing?.data?.ruleset === "forged";
const isForgedRuleset = (name) => String(name ?? "") === RULESET_NAME;
const PARTY_ID = "party";
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const text = (value, max = 400) => String(value ?? "").trim().slice(0, max);
const newKey = (list) => {
  let n = Object.keys(list ?? {}).length + 1;
  while (list?.[`id-${String(n).padStart(5, "0")}`]) n += 1;
  return `id-${String(n).padStart(5, "0")}`;
};

// The campaign's active books: playbooks, crew types, standard items, tables (by group).
function libraryForged(records) {
  const list = (type) => records.list({ type });
  const tables = {};
  for (const record of list("forgedtable")) {
    const group = String(record.data?.group ?? "");
    tables[group] = [...(tables[group] ?? []), ...rows(record.data?.rows).map(([, row]) => row)];
  }
  return { playbooks: list("playbook"), crewtypes: list("crewtype"), items: list("item").filter((item) => num(item.data?.standard) > 0), tables };
}

function mine(record, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
}

async function buildForged(table, spec, owner, seat) {
  const rules = await rulesForged();
  const lib = libraryForged(table.records);
  if (lib.playbooks.length === 0) throw new Error("No playbooks in this campaign: make the Forged in the Dark Scoundrel's Handbook active (Modules).");
  const built = rules.buildFromSpec(spec ?? {}, lib);
  built.data.crewBonus = crewBonus(crewOf(table));
  const data = require("./characterArt.cjs").withArt(rules.derive(built.data), { ...spec, race: "Human", class: built.data.playbook }, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// --- Dice ------------------------------------------------------------------------------
// A pool rolled on the host's dice and posted to chat: the highest die read (zero dice: two, the lowest).
async function rollPool(table, dice, label, from, extra = {}) {
  const rules = await rulesForged();
  const rolled = table.dice.roll(rules.poolFormula(dice));
  const rolls = (rolled.terms?.[0]?.rolls ?? []).map(Number);
  const read = rules.outcome(rolls, dice);
  table.postRoll(rolled, `${label} [${rules.RESULT_WORDS[read.result]} ${read.highest}]${read.zero ? " (zero dice: the lowest of two)" : ""}`, from, Boolean(extra.secret), { result: rules.RESULT_WORDS[read.result], ...(extra.by ? { by: extra.by } : {}) });
  return { ...read, rolls, dice };
}

// --- The crew (the party record's data.crew) ------------------------------------------------
function crewOf(table) {
  const party = table.records.get(PARTY_ID);
  return party?.data?.crew && typeof party.data.crew === "object" ? party.data.crew : null;
}
function partyMembers(table) {
  const party = table.records.get(PARTY_ID);
  return (Array.isArray(party?.data?.members) ? party.data.members : []).map((id) => table.records.get(id)).filter((record) => record && isForged(record));
}
// What the crew's upgrades give each character: Composed +1 stress box, Hardened +1 trauma box, Mastery actions to 4.
function crewBonus(crew) {
  const has = (name, boxes) => num(crew?.upgrades?.[name]) >= boxes;
  return { stress: has("Composed", 3) ? 1 : 0, trauma: has("Hardened", 3) ? 1 : 0, mastery: has("Mastery", 4) ? 1 : 0 };
}
async function saveCrew(table, crew) {
  const rules = await rulesForged();
  const party = table.records.get(PARTY_ID) ?? require("./party.cjs").partyRecord(table);
  crew.turf = Math.min(6, (crew.claims ?? []).filter((claim) => /^turf/i.test(String(claim))).length + (rules.crewHas(crew, "Fiends") ? num(crew.wanted) : 0) + (rules.crewHas(crew, "Accord") ? Math.min(3, Object.values(crew.factions ?? {}).filter((faction) => num(faction.status) >= 3).length) : 0));
  crew.vault = rules.vaultOf(crew);
  crew.coin = Math.max(0, num(crew.coin));
  crew.rep = Math.max(0, Math.min(rules.repToFill(crew), num(crew.rep)));
  table.records.update(party.id, { data: { crew } }, table.seat);
  // The crew's upgrades on every member's sheet (stress and trauma boxes).
  const bonus = crewBonus(crew);
  for (const member of table.records.list({ type: "character" }).filter(isForged)) {
    if (JSON.stringify(member.data.crewBonus ?? {}) !== JSON.stringify(bonus)) table.records.update(member.id, { data: rules.derive({ ...structuredClone(member.data), crewBonus: bonus }) }, table.seat, { replace: true });
  }
  return crew;
}
function needCrew(table) {
  const crew = crewOf(table);
  if (!crew) throw new Error("There is no crew yet: make one on the party sheet's Crew tab (or kraken_forged crew-build).");
  return structuredClone(crew);
}

// The crew's creation (the book's steps): a crew type (Tier 0, strong hold, 0
// rep, 2 coin), a reputation and lair, hunting grounds (and the deal with the
// faction there: pay 1 coin, pay 2 for +1 status, or keep it for -1), a
// special ability, the two starting upgrades and two more (a faction helped:
// +1, or +2 for 1 coin; a faction harmed: -2, or -1 for 1 coin), a favorite
// contact (+1 and -1 with two factions, or +2 and -2).
async function buildCrew(table, spec = {}, seat, from) {
  const rules = await rulesForged();
  const lib = libraryForged(table.records);
  const type = lib.crewtypes.find((record) => record.name.toLowerCase() === String(spec.type ?? "").toLowerCase());
  if (!type) throw new Error(`Which crew type: ${lib.crewtypes.map((record) => record.name).join(", ") || "(make the Scoundrel's Handbook active)"}?`);
  if (crewOf(table) && !spec.replace) throw new Error("The table has a crew already (replace: true to start a new one).");
  const crew = rules.newCrew({ ...spec, type: type.name });
  crew.xptrigger = String(type.data.xptrigger ?? "");
  crew.operations = String(type.data.operations ?? "");
  const problems = [];
  const status = (faction, change) => {
    if (!faction) return;
    const name = text(faction, 80);
    const known = (lib.tables.factions ?? []).find((row) => String(row.name).toLowerCase() === name.toLowerCase());
    const entry = crew.factions[known?.name ?? name] ?? { tier: num(known?.tier), hold: String(known?.hold ?? "strong"), status: 0 };
    entry.status = Math.max(-3, Math.min(3, num(entry.status) + change));
    crew.factions[known?.name ?? name] = entry;
  };
  // Hunting grounds: the faction that claims them.
  const deal = String(spec.huntingDeal ?? "pay1");
  if (deal === "pay1") crew.coin -= 1;
  else if (deal === "pay2") {
    crew.coin -= 2;
    status(spec.huntingFaction, +1);
  } else status(spec.huntingFaction, -1);
  if (spec.huntingOp && !String(type.data.operations ?? "").toLowerCase().includes(String(spec.huntingOp).toLowerCase())) problems.push(`${spec.huntingOp} is not one of the ${type.name}' operations.`);
  // A special ability.
  const abilities = rows(type.data.abilities).map(([, row]) => row);
  const ability = abilities.find((row) => String(row.name).toLowerCase() === String(spec.ability ?? abilities[0]?.name ?? "").toLowerCase());
  if (!ability) throw new Error(`The ${type.name} have no special ability ${spec.ability}: ${abilities.map((row) => row.name).join(", ")}.`);
  crew.abilities = [{ name: String(ability.name), text: String(ability.text ?? "") }];
  // Upgrades: the type's two, then two more (each a box; a cohort two).
  const own = rows(type.data.upgrades).map(([, row]) => row);
  const general = lib.tables.upgrades ?? [];
  const known = (name) => [...own, ...general].find((row) => String(row.name).toLowerCase() === String(name).toLowerCase()) || /^cohort/i.test(name);
  for (const name of String(type.data.startingupgrades ?? "").split(",").map((item) => item.trim()).filter(Boolean)) crew.upgrades[name] = num(crew.upgrades[name]) + (/^cohort/i.test(name) ? 2 : 1);
  const extra = Array.isArray(spec.upgrades) ? spec.upgrades.map(String) : [];
  let boxes = 0;
  for (const name of extra) {
    if (!known(name)) throw new Error(`No crew upgrade ${name}.`);
    const cost = rules.upgradeCost(name);
    boxes += cost;
    crew.upgrades[name] = num(crew.upgrades[name]) + cost;
  }
  if (boxes > 2) throw new Error(`Two more upgrade boxes at creation: ${extra.join(", ")} take ${boxes}.`);
  crew.boxes = Math.max(0, 2 - boxes);
  // A gang that came with the type (the Bravos' Thugs), and one bought now.
  const cohorts = [...(type.data.startingcohort ? [type.data.startingcohort] : []), ...(Array.isArray(spec.cohorts) ? spec.cohorts : [])];
  crew.cohorts = cohorts.map((cohort, index) => cleanCohort(cohort, index));
  if (spec.upgradeHelped) {
    if (spec.repayHelped) crew.coin -= 1;
    status(spec.upgradeHelped, spec.repayHelped ? 2 : 1);
  }
  if (spec.upgradeHarmed) {
    if (spec.mollifyHarmed) crew.coin -= 1;
    status(spec.upgradeHarmed, spec.mollifyHarmed ? -1 : -2);
  }
  // The favorite contact.
  const contacts = rows(type.data.contacts).map(([, row]) => ({ name: String(row.name), text: String(row.text ?? ""), favorite: 0 }));
  const favorite = contacts.find((row) => row.name.toLowerCase() === String(spec.contact ?? "").toLowerCase());
  if (spec.contact && !favorite) problems.push(`${spec.contact} is not one of the ${type.name}' contacts.`);
  if (favorite) favorite.favorite = 1;
  crew.contacts = contacts;
  const strong = spec.contactIntense ? 2 : 1;
  status(spec.contactFriendly, strong);
  status(spec.contactUnfriendly, -strong);
  if (crew.coin < 0) throw new Error(`The crew starts with 2 coin: these choices cost ${2 - crew.coin}.`);
  for (const row of lib.tables.factions ?? []) if (!crew.factions[row.name]) crew.factions[row.name] = { tier: num(row.tier), hold: String(row.hold ?? "strong"), status: 0 };
  await saveCrew(table, crew);
  table.say(`[CREW] ${crew.name}: ${type.name}, ${crew.reputation || "no reputation yet"}, Tier 0 with strong hold, ${crew.coin} coin. ${ability.name}; upgrades ${Object.keys(crew.upgrades).join(", ")}.`, from || "Crew");
  return { crew, problems };
}
function cleanCohort(raw, index = 0) {
  const kind = raw?.kind === "expert" ? "expert" : "gang";
  return {
    id: String(raw?.id ?? `c${Date.now().toString(36)}${index}`),
    kind,
    type: text(raw?.type, 40) || (kind === "gang" ? "Thugs" : "Expert"),
    name: text(raw?.name, 80) || (kind === "gang" ? `Gang of ${text(raw?.type, 40) || "Thugs"}` : text(raw?.type, 40) || "Expert"),
    edges: (Array.isArray(raw?.edges) ? raw.edges : []).map((edge) => text(edge, 40)).slice(0, 2),
    flaws: (Array.isArray(raw?.flaws) ? raw.flaws : []).map((flaw) => text(flaw, 40)).slice(0, 2),
    elite: raw?.elite ? 1 : 0,
    harm: Math.max(0, Math.min(4, num(raw?.harm))),
  };
}
// A cohort's quality and scale: a gang's are the crew's Tier; an expert's quality Tier +1, scale 0.
const cohortQuality = (crew, cohort) => num(crew?.tier) + (cohort.kind === "expert" ? 1 : 0);

// --- A character's actions -------------------------------------------------------------------
// What the sheet may change by hand, then every number worked out again.
const TEXT = new Set(["alias", "look", "heritage", "heritagedetail", "background", "backgrounddetail", "vice", "vicedetail", "purveyor", "notes", "playername"]);
const NUMBERS = [/^actions\.(hunt|study|survey|tinker|finesse|prowl|skirmish|wreck|attune|command|consort|sway)$/, /^stress$/, /^healing$/, /^stash$/, /^xp\.(playbook|insight|prowess|resolve)$/, /^armor\.(armor|heavy|special)$/, /^coins\.id-\d+\.amount$/, /^inventorylist\.id-\d+\.(carried|load)$/, /^projects\.id-\d+\.(filled|segments)$/];
const STRINGS = [/^harm\.[123]\.[01]$/, /^inventorylist\.id-\d+\.(name|text)$/, /^projects\.id-\d+\.name$/, /^friends\.\d+\.bond$/];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
async function editForged(table, record, changes, seat) {
  mine(record, seat);
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesForged();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = text(value, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (STRINGS.some((pattern) => pattern.test(key))) setPath(data, key, String(value ?? "").slice(0, 400));
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw new Error(`${key} needs a number.`);
      if (/^actions\./.test(key) && (n < 0 || n > rules.actionCap(Boolean(data.crewBonus?.mastery)))) throw new Error(`An action rating is 0 to ${rules.actionCap(Boolean(data.crewBonus?.mastery))}.`);
      setPath(data, key, n);
    } else if (/^(inventorylist|projects)\.id-\d+$/.test(key) && value === null) delete data[key.split(".")[0]]?.[key.split(".")[1]];
    else if (key === "fatal" && !value) delete data.fatal;
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

// The downtime activities a character has used; past the free ones, each costs 1 coin (theirs) or 1 rep (the crew's).
async function spendActivity(table, record, data, args, rules) {
  const crew = crewOf(table);
  const atWar = Object.values(crew?.factions ?? {}).some((faction) => num(faction.status) <= -3) && !rules.crewHas(crew, "War dogs");
  const downtime = { used: 0, trained: {}, indulged: 0, ...(data.downtime ?? {}) };
  const free = rules.freeActivities(atWar) + num(downtime.extra);
  if (downtime.used >= free) {
    if (args.pay === "rep") {
      if (!crew || num(crew.rep) < 1) throw new Error("The crew has no rep to spend on another activity.");
      const next = structuredClone(crew);
      next.rep = num(next.rep) - 1;
      await saveCrew(table, next);
    } else if (args.pay === "coin") {
      if (rules.coinOf(data) < 1) throw new Error(`${record.name} has no coin for another activity.`);
      rules.setCoin(data, rules.coinOf(data) - 1);
    } else throw new Error(`${record.name} has used ${downtime.used} of ${free} downtime activities: another costs 1 coin (pay: coin) or 1 rep (pay: rep).`);
  }
  downtime.used += 1;
  data.downtime = downtime;
  return downtime.used;
}

// What a scoundrel does (the sheet's buttons), as its owner or the GM.
async function actionForged(table, record, action, args = {}, seat, from) {
  mine(record, seat);
  const rules = await rulesForged();
  const data = structuredClone(record.data);
  const who = from || record.name;
  const say = (line) => table.say(line, who);
  const save = (changed = data) => table.records.update(record.id, { data: rules.derive(changed) }, table.seat, { replace: true });
  const score = table.clocks?.().score() ?? {};
  const stressed = (target, amount, why) => {
    const result = rules.addStress(target, amount);
    if (result.trauma) say(`[TRAUMA] ${target === data ? record.name : why.name}: the last stress box. Taken out of action; back later with zero stress. Choose a trauma condition (${Object.keys(rules.TRAUMAS).join(", ")}).`);
    return result;
  };
  switch (action) {
    case "action-roll": {
      const key = String(args.action ?? "").toLowerCase();
      if (!rules.ACTIONS.includes(key)) throw new Error(`Which action: ${rules.ACTIONS.join(", ")}?`);
      const position = rules.POSITIONS.includes(args.position) ? args.position : score.position || "risky";
      let effect = rules.EFFECTS.includes(args.effect) ? args.effect : score.effect || "standard";
      const penalties = args.harm === false ? { lessEffect: false, minusDice: 0, needHelp: false } : rules.harmPenalties(data);
      const helper = args.assist ? table.records.get(String(args.assist)) : null;
      if (args.assist && (!helper || !isForged(helper) || helper.id === record.id)) throw new Error("Who assists? Another scoundrel.");
      if (penalties.needHelp && !helper && !args.pushIncapacitated) throw new Error(`${record.name} has severe harm: they need help (assistance) or to push themselves to act.`);
      const dice = rules.actionPool({ rating: data.actions?.[key], assist: Boolean(helper), pushDice: Boolean(args.pushDice), bargain: Boolean(args.bargain), bonus: num(args.bonus), penalty: penalties.minusDice });
      if (args.pushEffect) effect = rules.shiftEffect(effect, 1);
      if (penalties.lessEffect) effect = rules.shiftEffect(effect, -1);
      const cost = rules.pushStress({ pushDice: Boolean(args.pushDice), pushEffect: Boolean(args.pushEffect), pushIncapacitated: Boolean(args.pushIncapacitated) });
      const notes = [helper ? `assisted by ${helper.name}` : "", args.pushDice ? "pushed +1d" : "", args.pushEffect ? "pushed +1 effect" : "", args.pushIncapacitated ? "pushed through severe harm" : "", args.bargain ? `Devil's Bargain: ${text(args.bargain, 160)}` : "", num(args.bonus) ? `${num(args.bonus) > 0 ? "+" : ""}${num(args.bonus)}d` : "", penalties.minusDice ? "-1d harm" : "", penalties.lessEffect ? "less effect (harm)" : ""].filter(Boolean);
      const label = `[ACTION] ${rules.titled(key)} ${dice > 0 ? `${dice}d` : "0d"} · ${rules.titled(position)} / ${rules.titled(effect)}${notes.length ? ` · ${notes.join(", ")}` : ""}`;
      // Pay first: pushing and assisting cost stress whatever the result.
      if (cost) stressed(data, cost, record);
      if (helper) {
        const helped = structuredClone(helper.data);
        const result = rules.addStress(helped, rules.ASSIST_STRESS);
        if (result.trauma) say(`[TRAUMA] ${helper.name}: the last stress box from assisting. Taken out of action; choose a trauma condition.`);
        table.records.update(helper.id, { data: rules.derive(helped) }, table.seat, { replace: true });
      }
      const read = await rollPool(table, dice, label, who, { by: record.name });
      say(`${record.name}: ${rules.OUTCOMES[position][read.result]}`);
      // A desperate roll marks xp in the action's attribute.
      let xp = null;
      if (position === "desperate") {
        xp = rules.markXp(data, rules.ATTRIBUTE_OF[key], 1);
        say(`[XP] ${record.name}: a desperate roll, +1 ${rules.titled(rules.ATTRIBUTE_OF[key])} xp${xp.advanced ? ` (the track fills: an advance, a new ${rules.titled(rules.ATTRIBUTE_OF[key])} action dot)` : ""}.`);
      }
      let clock = null;
      if (args.clock && table.clocks) {
        const ticks = rules.ticksFor(read.result, effect);
        if (ticks > 0) clock = table.clocks().tick(String(args.clock), ticks, seat, { why: `${record.name}'s ${rules.titled(key)}`, by: who });
      }
      save();
      return { result: read.result, highest: read.highest, rolls: read.rolls, dice, position, effect, stress: cost, assist: helper?.id ?? null, xp, clock, outcome: rules.OUTCOMES[position][read.result] };
    }
    case "resist": {
      const attribute = String(args.attribute ?? "").toLowerCase();
      if (!rules.ATTRIBUTES.includes(attribute)) throw new Error(`Resist with which attribute: ${rules.ATTRIBUTES.join(", ")}?`);
      let dice = num(data.attributes?.[attribute]) + num(args.bonus);
      if (attribute === "resolve" && rules.hasAbility(data, "Iron will")) dice += 1;
      const crew = crewOf(table);
      if (crew && rules.crewHas(crew, "Forged in the fire")) dice += 1;
      const read = await rollPool(table, dice, `[RESIST] ${rules.titled(attribute)} ${dice}d${args.consequence ? `: ${text(args.consequence, 120)}` : ""}`, who, { by: record.name });
      const stress = read.result === "critical" ? -1 : 6 - read.highest;
      const result = stressed(data, stress, record);
      say(`${record.name} resists${args.consequence ? ` ${text(args.consequence, 120)}` : ""}: ${stress < 0 ? "a critical, 1 stress cleared" : `${stress} stress`} (now ${data.stress}/${rules.stressMax(data)}).`);
      save();
      return { result: read.result, highest: read.highest, rolls: read.rolls, dice, stress, trauma: result.trauma, now: data.stress };
    }
    case "armor": {
      const kind = ["armor", "heavy", "special"].includes(args.kind) ? args.kind : "armor";
      const carried = Object.values(data.inventorylist ?? {}).filter((item) => num(item.carried) > 0);
      if (kind === "armor" && !carried.some((item) => item.armor === "armor" || /^armor$/i.test(item.name))) throw new Error(`${record.name} is not carrying Armor.`);
      if (kind === "heavy" && !carried.some((item) => item.armor === "heavy" || /heavy armor/i.test(item.name))) throw new Error(`${record.name} is not carrying Heavy armor.`);
      if (kind === "special" && !(data.abilities ?? []).some(rules.usesSpecialArmor)) throw new Error(`${record.name} has no ability that uses special armor.`);
      if (num(data.armor?.[kind])) throw new Error(`${record.name}'s ${kind === "armor" ? "armor" : `${kind} armor`} box is used: it comes back with the next load.`);
      data.armor = { ...(data.armor ?? {}), [kind]: 1 };
      say(`[ARMOR] ${record.name} marks ${kind === "armor" ? "armor" : `${kind} armor`}${args.consequence ? ` against ${text(args.consequence, 120)}` : ""}: the consequence is reduced or avoided.`);
      return { record: save() };
    }
    case "stress": {
      const result = stressed(data, Math.round(num(args.amount, 1)), record);
      say(`[STRESS] ${record.name}: ${num(args.amount, 1) > 0 ? "+" : ""}${num(args.amount, 1)} (now ${data.stress}/${rules.stressMax(data)})${args.why ? `: ${text(args.why, 120)}` : ""}.`);
      save();
      return { stress: data.stress, trauma: result.trauma };
    }
    case "flashback": {
      // The GM sets the cost: 0, 1, 2 or more stress (a downtime action in the past: 1 coin or 1 rep instead).
      const cost = Math.max(0, Math.round(num(args.stress, 1)));
      const result = stressed(data, cost, record);
      say(`[FLASHBACK] ${record.name}${args.what ? `: ${text(args.what, 200)}` : ""} (${cost} stress).`);
      save();
      return { stress: data.stress, trauma: result.trauma };
    }
    case "trauma": {
      const marked = rules.markTrauma(data, args.condition);
      say(`[TRAUMA] ${record.name} is ${marked.traumas.at(-1)}: ${rules.TRAUMAS[marked.traumas.at(-1)] ?? ""}${marked.retired ? ` That is the ${rules.traumaMax(data) === 4 ? "fourth" : "last"} trauma: ${record.name} retires (or takes the fall for the crew's wanted level).` : ""}`);
      save();
      return { traumas: marked.traumas, retired: marked.retired };
    }
    case "harm": {
      const placed = rules.addHarm(data, args.level, args.text);
      say(`[HARM] ${record.name}: level ${placed.level} ${placed.fatal ? "FATAL" : rules.HARM_WORDS[placed.level]}, "${placed.text}"${placed.level > num(args.level, 1) ? " (the row was full: it moves up)" : ""}${placed.fatal ? ". A catastrophic, permanent consequence." : ` (${rules.HARM_PENALTY[placed.level]}).`}`);
      save();
      return { level: placed.level, fatal: placed.fatal, harm: data.harm };
    }
    case "harm-clear": {
      const level = Math.round(num(args.level, 1));
      const index = Math.round(num(args.index, 0));
      const harm = rules.cleanHarm(data.harm);
      if (level === 4) delete data.fatal;
      else if (harm[level]?.[index] !== undefined) harm[level][index] = "";
      data.harm = harm;
      return { record: save() };
    }
    case "recover": {
      // A healer's roll (their quality, or a scoundrel's Tinker with the right ability), or tough it out (1 stress, 0d).
      await spendActivity(table, record, data, args, rules);
      let dice;
      let label;
      if (args.healer) {
        const healer = table.records.get(String(args.healer));
        if (!healer || !isForged(healer)) throw new Error("Which scoundrel treats them?");
        dice = num(healer.data.actions?.tinker);
        if (healer.id === record.id) stressed(data, 2, record);
        label = `[RECOVER] ${record.name}, treated by ${healer.name} (Tinker ${dice}d)`;
      } else if (args.tough) {
        stressed(data, 1, record);
        dice = 0;
        label = `[RECOVER] ${record.name} toughs it out (0d, 1 stress)`;
      } else {
        dice = Math.max(0, Math.round(num(args.quality, 2)));
        label = `[RECOVER] ${record.name}, treated by a healer of quality ${dice}`;
      }
      if (rules.hasAbility(data, "Vigorous")) dice += 1;
      const crew = crewOf(table);
      if (crew?.claims?.some((claim) => /infirmary/i.test(claim))) dice += 1;
      if (args.friend) dice += 1;
      const read = await rollPool(table, dice, label, who, { by: record.name });
      const result = rules.shiftResult(read.result, Math.max(0, Math.round(num(args.coin))));
      if (num(args.coin) > 0) rules.setCoin(data, Math.max(0, rules.coinOf(data) - Math.round(num(args.coin))));
      const healed = rules.tickHealing(data, rules.DOWNTIME_TICKS[result]);
      say(`[RECOVER] ${record.name}: ${rules.DOWNTIME_TICKS[result]} segments on the healing clock${healed.healed ? `; it fills: every harm is one level less` : ""} (${healed.healing}/${healed.size}).`);
      save();
      return { result, healed: healed.healed, healing: healed.healing, harm: data.harm };
    }
    case "xp": {
      const track = String(args.track ?? "playbook").toLowerCase();
      const marked = rules.markXp(data, track, Math.round(num(args.amount, 1)));
      say(`[XP] ${record.name}: ${num(args.amount, 1) > 0 ? "+" : ""}${num(args.amount, 1)} ${rules.titled(track)} xp${args.why ? ` (${text(args.why, 120)})` : ""}${marked.advanced ? `. The track fills: an advance (${track === "playbook" ? "a new special ability" : `a new ${rules.titled(track)} action dot`}).` : ` (${marked.xp}/${rules.XP_TRACKS[track]}).`}`);
      save();
      return marked;
    }
    case "advance": {
      // Spend an advance: a special ability (the playbook's) or an action dot (its attribute's).
      const advances = { ...(data.advances ?? {}) };
      if (args.ability) {
        if (num(advances.playbook) < 1 && seat.role !== "dm") throw new Error(`${record.name} has no playbook advance to spend.`);
        const lib = libraryForged(table.records);
        const all = [...lib.playbooks.flatMap((playbook) => rows(playbook.data.abilities).map(([, row]) => row)), ...(lib.tables.abilities ?? [])];
        const found = all.find((row) => String(row.name).toLowerCase() === String(args.ability).toLowerCase());
        if (!found) throw new Error(`No special ability ${args.ability}.`);
        if (rules.hasAbility(data, found.name)) throw new Error(`${record.name} has ${found.name} already.`);
        data.abilities = [...(data.abilities ?? []), { name: String(found.name), text: String(found.text ?? "") }];
        if (num(advances.playbook) > 0) advances.playbook -= 1;
        say(`[ADVANCE] ${record.name} takes ${found.name}.`);
      } else if (args.action) {
        const key = String(args.action).toLowerCase();
        const attribute = rules.ATTRIBUTE_OF[key];
        if (!attribute) throw new Error(`Which action: ${rules.ACTIONS.join(", ")}?`);
        if (num(advances[attribute]) < 1 && seat.role !== "dm") throw new Error(`${record.name} has no ${rules.titled(attribute)} advance to spend.`);
        const cap = rules.actionCap(Boolean(data.crewBonus?.mastery));
        if (num(data.actions?.[key]) >= cap) throw new Error(`${rules.titled(key)} is at ${cap}${cap < 4 ? " (4 needs the crew's Mastery)" : ""}.`);
        data.actions = { ...data.actions, [key]: num(data.actions?.[key]) + 1 };
        if (num(advances[attribute]) > 0) advances[attribute] -= 1;
        say(`[ADVANCE] ${record.name}: ${rules.titled(key)} ${data.actions[key]}.`);
      } else throw new Error("Advance with a special ability (ability) or an action dot (action).");
      data.advances = advances;
      return { record: save() };
    }
    case "load": {
      // A new load for the operation: the items unchecked, every armor box back.
      const load = ["light", "normal", "heavy"].includes(args.load) ? args.load : "normal";
      data.load = load;
      for (const item of Object.values(data.inventorylist ?? {})) item.carried = 0;
      data.armor = { armor: 0, heavy: 0, special: 0 };
      say(`[LOAD] ${record.name} goes in with a ${load} load (${rules.loadLimits(data)[load]}).`);
      return { record: save() };
    }
    case "item": {
      const item = data.inventorylist?.[String(args.key ?? "")];
      if (!item) throw new Error("No such item.");
      const on = args.carried === undefined ? !num(item.carried) : Boolean(args.carried);
      if (on && data.load) {
        const limit = rules.loadLimits(data)[data.load];
        if (rules.loadUsed(data) + rules.itemLoad(item) > limit) throw new Error(`${item.name} would take ${record.name} past a ${data.load} load (${limit}).`);
      }
      item.carried = on ? 1 : 0;
      if (on) say(`${record.name} has ${item.name} on hand.`);
      return { record: save() };
    }
    case "item-add": {
      const name = text(args.name ?? args.text, 120);
      if (!name) throw new Error("Which item?");
      data.inventorylist = data.inventorylist ?? {};
      data.inventorylist[newKey(data.inventorylist)] = { name, load: Math.max(0, Math.min(3, Math.round(num(args.load, 1)))), text: text(args.note, 400), source: "Added", carried: 0 };
      return { record: save() };
    }
    case "project": {
      // A long-term project: a clock on the sheet (name + segments to start one), worked on with an action roll.
      data.projects = data.projects ?? {};
      let key = String(args.project ?? "");
      if (!data.projects[key]) {
        const name = text(args.name, 80);
        if (!name) throw new Error("Which project (its key, or a name to start one)?");
        key = newKey(data.projects);
        data.projects[key] = { name, segments: Math.max(2, Math.min(12, Math.round(num(args.segments, 8)))), filled: 0 };
        if (!args.action) {
          say(`[PROJECT] ${record.name} starts "${name}" (${data.projects[key].segments} segments).`);
          return { record: save(), project: key };
        }
      }
      const action = String(args.action ?? "").toLowerCase();
      if (!rules.ACTIONS.includes(action)) throw new Error(`Work on it with which action: ${rules.ACTIONS.join(", ")}?`);
      await spendActivity(table, record, data, args, rules);
      const project = data.projects[key];
      const dice = num(data.actions?.[action]) + (args.friend ? 1 : 0) + num(args.bonus);
      const read = await rollPool(table, dice, `[PROJECT] ${record.name}: ${project.name} (${rules.titled(action)} ${dice}d)`, who, { by: record.name });
      const result = rules.shiftResult(read.result, Math.max(0, Math.round(num(args.coin))));
      if (num(args.coin) > 0) rules.setCoin(data, Math.max(0, rules.coinOf(data) - Math.round(num(args.coin))));
      project.filled = Math.min(project.segments, num(project.filled) + rules.DOWNTIME_TICKS[result]);
      say(`[PROJECT] ${project.name}: ${project.filled}/${project.segments}${project.filled >= project.segments ? ". Done!" : ""}`);
      save();
      return { result, project: key, filled: project.filled, segments: project.segments };
    }
    case "train": {
      const track = String(args.track ?? "playbook").toLowerCase();
      if (!(track in rules.XP_TRACKS)) throw new Error(`Train which track: ${Object.keys(rules.XP_TRACKS).join(", ")}?`);
      if (data.downtime?.trained?.[track]) throw new Error(`${record.name} has trained ${rules.titled(track)} this downtime already.`);
      await spendActivity(table, record, data, args, rules);
      const crew = crewOf(table);
      const amount = num(crew?.upgrades?.[`${rules.titled(track)} Training`]) > 0 ? 2 : 1;
      data.downtime.trained = { ...(data.downtime.trained ?? {}), [track]: 1 };
      const marked = rules.markXp(data, track, amount);
      say(`[TRAIN] ${record.name}: +${amount} ${rules.titled(track)} xp${marked.advanced ? " (an advance!)" : ""}.`);
      save();
      return { amount, ...marked };
    }
    case "vice": {
      // Indulge: the lowest attribute's dice; clear stress equal to the highest; more than marked is overindulging.
      if (data.downtime?.indulged) throw new Error(`${record.name} has indulged this downtime already.`);
      await spendActivity(table, record, data, args, rules);
      const dice = rules.lowestAttribute(data) + (args.friend ? 1 : 0);
      const read = await rollPool(table, dice, `[VICE] ${record.name}: ${data.vice || "vice"}${data.purveyor ? ` at ${data.purveyor}` : ""} (${dice}d)`, who, { by: record.name });
      const had = num(data.stress);
      const over = read.highest > had;
      data.stress = Math.max(0, had - read.highest);
      data.downtime.indulged = 1;
      let choice = null;
      if (over) {
        choice = Object.keys(rules.OVERINDULGENCE).find((name) => name.toLowerCase() === String(args.overindulge ?? "").toLowerCase()) ?? null;
        data.overindulged = choice ? 0 : 1;
        if (choice === "Brag") {
          const crew = crewOf(table);
          if (crew) {
            const next = structuredClone(crew);
            rules.addHeat(next, 2);
            await saveCrew(table, next);
          }
        }
      }
      say(`[VICE] ${record.name} clears ${Math.min(had, read.highest)} stress (now ${data.stress}).${over ? ` OVERINDULGES (cleared ${read.highest}, had ${had})${choice ? `: ${choice}. ${rules.OVERINDULGENCE[choice]}` : `: choose ${Object.keys(rules.OVERINDULGENCE).join(", ")}.`}` : ""}`);
      save();
      return { result: read.result, highest: read.highest, cleared: Math.min(had, read.highest), stress: data.stress, overindulged: over, choice };
    }
    case "overindulge": {
      const choice = Object.keys(rules.OVERINDULGENCE).find((name) => name.toLowerCase() === String(args.choice ?? "").toLowerCase());
      if (!choice) throw new Error(`Which: ${Object.keys(rules.OVERINDULGENCE).join(", ")}?`);
      data.overindulged = 0;
      if (choice === "Brag") {
        const crew = needCrew(table);
        rules.addHeat(crew, 2);
        await saveCrew(table, crew);
      }
      say(`[VICE] ${record.name} overindulges: ${choice}. ${rules.OVERINDULGENCE[choice]}`);
      return { record: save(), choice };
    }
    case "acquire": {
      // Acquire an asset: the crew's Tier rolled; quality Tier -1 / Tier / +1 / +2; coin raises the result (2 a level past critical).
      const crew = crewOf(table);
      const tier = num(crew?.tier);
      await spendActivity(table, record, data, args, rules);
      let dice = tier + (args.friend ? 1 : 0) + (args.again ? 1 : 0) + num(args.bonus);
      if (crew && rules.crewHas(crew, "Pack rats")) dice += 1;
      if (crew?.claims?.some((claim) => /warehouses/i.test(claim))) dice += 1;
      const read = await rollPool(table, dice, `[ACQUIRE] ${record.name}: ${text(args.asset, 120) || "an asset"} (Tier ${tier}, ${dice}d)`, who, { by: record.name });
      // Coin raises the result a level each (past a critical, 2 coin a Tier); Connected +1 result level.
      const result = rules.shiftResult(read.result, (rules.hasAbility(data, "Connected") ? 1 : 0) + Math.max(0, Math.round(num(args.coin))));
      if (num(args.coin) > 0) rules.setCoin(data, Math.max(0, rules.coinOf(data) - Math.round(num(args.coin))));
      const quality = rules.assetQuality(tier, result) + Math.floor(Math.max(0, num(args.extraCoin)) / 2);
      say(`[ACQUIRE] ${record.name} gets ${text(args.asset, 120) || "the asset"} at quality ${Math.max(0, quality)}.${args.restricted ? " A restricted item: +2 heat." : ""}`);
      if (args.restricted && crew) {
        const next = structuredClone(crew);
        rules.addHeat(next, 2);
        await saveCrew(table, next);
      }
      save();
      return { result, quality: Math.max(0, quality) };
    }
    case "reduce-heat": {
      const key = String(args.action ?? "").toLowerCase();
      if (!rules.ACTIONS.includes(key)) throw new Error(`Reduce heat with which action: ${rules.ACTIONS.join(", ")}?`);
      const crew = needCrew(table);
      await spendActivity(table, record, data, args, rules);
      const dice = num(data.actions?.[key]) + (args.friend ? 1 : 0) + num(args.bonus);
      const read = await rollPool(table, dice, `[REDUCE HEAT] ${record.name} (${rules.titled(key)} ${dice}d)`, who, { by: record.name });
      let result = rules.shiftResult(read.result, Math.max(0, Math.round(num(args.coin))));
      if (num(args.coin) > 0) rules.setCoin(data, Math.max(0, rules.coinOf(data) - Math.round(num(args.coin))));
      if (rules.hasAbility(data, "Connected")) result = rules.shiftResult(result, 1);
      const cleared = Math.min(num(crew.heat), rules.HEAT_CLEARED[result]);
      crew.heat = num(crew.heat) - cleared;
      await saveCrew(table, crew);
      say(`[REDUCE HEAT] ${record.name}: -${cleared} heat (now ${crew.heat}).`);
      save();
      return { result, cleared, heat: crew.heat };
    }
    case "coin": {
      const amount = Math.round(num(args.amount));
      const now = rules.coinOf(data) + amount;
      if (now < 0) throw new Error(`${record.name} has ${rules.coinOf(data)} coin.`);
      rules.setCoin(data, now);
      if (args.why) say(`[COIN] ${record.name}: ${amount > 0 ? "+" : ""}${amount} (${text(args.why, 120)}).`);
      return { record: save(), coin: now };
    }
    case "stash": {
      // Coin into the stash (amount > 0), or out of it (amount < 0): 2 stash out for each coin.
      const amount = Math.round(num(args.amount));
      if (amount > 0) {
        if (rules.coinOf(data) < amount) throw new Error(`${record.name} has ${rules.coinOf(data)} coin.`);
        rules.setCoin(data, rules.coinOf(data) - amount);
        data.stash = Math.min(40, num(data.stash) + amount);
        say(`[STASH] ${record.name} stashes ${amount} coin (stash ${data.stash}).`);
      } else if (amount < 0) {
        const coin = -amount;
        if (num(data.stash) < coin * 2) throw new Error(`${coin} coin out of the stash costs ${coin * 2} stash; ${record.name} has ${num(data.stash)}.`);
        data.stash = num(data.stash) - coin * 2;
        rules.setCoin(data, rules.coinOf(data) + coin);
        say(`[STASH] ${record.name} sells off ${coin * 2} stash for ${coin} coin.`);
      }
      return { record: save(), stash: data.stash, coin: rules.coinOf(data) };
    }
    case "friend": {
      const friends = (data.friends ?? []).map((friend) => ({ ...friend }));
      const found = friends.find((friend) => friend.name.toLowerCase() === String(args.name ?? "").toLowerCase());
      if (!found) friends.push({ name: text(args.name, 80), text: text(args.text, 200), bond: ["friend", "rival"].includes(args.bond) ? args.bond : "" });
      else found.bond = ["friend", "rival"].includes(args.bond) ? args.bond : "";
      data.friends = friends;
      return { record: save() };
    }
    default:
      throw new Error(`No Forged in the Dark action ${action}.`);
  }
}

// --- The crew and the table: crew sheet, Score panel, downtime ---------------------------------
async function crewAction(table, action, args = {}, seat, from) {
  const rules = await rulesForged();
  const who = from || (seat.role === "dm" ? "GM" : seat.name);
  const say = (line) => table.say(line, who);
  const gmOnly = () => {
    if (seat.role !== "dm") throw new Error("That is the GM's to do.");
  };
  const clocks = table.clocks?.();
  switch (action) {
    case "crew-build":
      return buildCrew(table, args, seat, who);
    case "crew-edit": {
      const crew = needCrew(table);
      for (const key of ["name", "lair", "huntingGrounds", "huntingOp", "reputation", "notes"]) if (args[key] !== undefined) crew[key] = String(args[key] ?? "").slice(0, key === "notes" ? 8000 : 400);
      // The GM keeps the ledger: Tier, hold, rep, heat, wanted, coin, crew xp.
      for (const key of ["tier", "rep", "heat", "wanted", "coin", "xp", "boxes"]) {
        if (args[key] === undefined) continue;
        gmOnly();
        crew[key] = Math.max(0, Math.round(num(args[key])));
      }
      if (args.hold !== undefined) {
        gmOnly();
        crew.hold = args.hold === "weak" ? "weak" : "strong";
      }
      crew.wanted = Math.min(4, num(crew.wanted));
      crew.tier = Math.min(6, num(crew.tier));
      return { crew: await saveCrew(table, crew) };
    }
    case "crew-coin": {
      const crew = needCrew(table);
      const amount = Math.round(num(args.amount));
      if (num(crew.coin) + amount < 0) throw new Error(`The crew has ${crew.coin} coin.`);
      // Coin to or from a member's purse.
      if (args.member) {
        const member = table.records.get(String(args.member));
        if (!member || !isForged(member)) throw new Error("Which scoundrel?");
        if (seat.role !== "dm" && member.owner !== seat.name) throw new Error("Only your own purse.");
        const data = structuredClone(member.data);
        if (rules.coinOf(data) - amount < 0) throw new Error(`${member.name} has ${rules.coinOf(data)} coin.`);
        rules.setCoin(data, rules.coinOf(data) - amount);
        table.records.update(member.id, { data: rules.derive(data) }, table.seat, { replace: true });
      } else gmOnly();
      crew.coin = num(crew.coin) + amount;
      const over = Math.max(0, crew.coin - rules.vaultOf(crew));
      say(`[COIN] ${crew.name}: ${amount > 0 ? "+" : ""}${amount} coin (now ${crew.coin}${over ? `; ${over} past the vault's ${rules.vaultOf(crew)}: spend it or share it out` : ""}).`);
      return { crew: await saveCrew(table, crew) };
    }
    case "payoff": {
      // The score's payoff: rep (2, +/-1 a Tier above or below; none if quiet) and coin; a tithe of Tier +1 to a boss.
      gmOnly();
      const crew = needCrew(table);
      const rep = rules.scoreRep(crew.tier, args.targetTier ?? clocks?.score().targetTier ?? crew.tier, Boolean(args.quiet));
      const repBefore = num(crew.rep);
      crew.rep = Math.min(rules.repToFill(crew), repBefore + rep);
      const coin = Math.max(0, Math.round(num(args.coin)));
      const tithe = args.tithe ? num(crew.tier) + 1 : 0;
      crew.coin = num(crew.coin) + coin - tithe;
      if (crew.coin < 0) crew.coin = 0;
      if (!args.quiet && rules.crewHas(crew, "No traces") && args.lowProfile) crew.rep = Math.min(rules.repToFill(crew), crew.rep + 1);
      say(`[PAYOFF] ${crew.name}: +${crew.rep - repBefore} rep (${crew.rep}/${rules.repToFill(crew)}), +${coin} coin${tithe ? `, -${tithe} tithe` : ""} (crew ${crew.coin}${crew.coin > rules.vaultOf(crew) ? `, past the vault's ${rules.vaultOf(crew)}` : ""}).`);
      return { crew: await saveCrew(table, crew), rep: crew.rep - repBefore, coin };
    }
    case "heat": {
      // The score's heat: exposure 0/2/4/6, +1 high-profile, +1 hostile turf, +1 at war, +2 killing. Or amount for a plain change.
      gmOnly();
      const crew = needCrew(table);
      const war = Object.values(crew.factions ?? {}).some((faction) => num(faction.status) <= -3);
      let amount = args.amount !== undefined ? Math.round(num(args.amount)) : rules.scoreHeat({ ...args, war: args.war ?? war, killing: args.killing && !rules.crewHas(crew, "Death veil") });
      if (args.amount === undefined && crew.claims?.some((claim) => /cover operation/i.test(claim))) amount -= 2;
      amount = Math.max(args.amount !== undefined ? -99 : 0, amount);
      const before = { heat: num(crew.heat), wanted: num(crew.wanted) };
      const result = amount >= 0 ? rules.addHeat(crew, amount) : ((crew.heat = Math.max(0, num(crew.heat) + amount)), { heat: crew.heat, wanted: crew.wanted, raised: 0 });
      say(`[HEAT] ${crew.name}: ${amount >= 0 ? "+" : ""}${amount} heat (now ${result.heat}/9${result.raised ? `; WANTED LEVEL ${result.wanted}` : ""}).`);
      return { crew: await saveCrew(table, crew), amount, before, ...result };
    }
    case "entanglement": {
      // The heat column, and dice equal to the wanted level (zero: two dice, the lowest).
      gmOnly();
      const crew = needCrew(table);
      const read = await rollPool(table, num(crew.wanted), `[ENTANGLEMENT] ${crew.name}: heat ${crew.heat}, wanted ${crew.wanted}`, who);
      const options = rules.entanglement(crew.heat, read.result);
      say(`[ENTANGLEMENT] ${options.join(" or ")}: ${options.map((name) => `${name}: ${rules.ENTANGLEMENT_WORDS[name]}`).join(" / ")}`);
      return { result: read.result, highest: read.highest, entanglements: options };
    }
    case "develop": {
      gmOnly();
      const crew = needCrew(table);
      const done = rules.develop(crew);
      say(`[CREW] ${crew.name}: ${done.cost ? `Tier ${rules.ROMAN[done.tier]} for ${done.cost} coin, hold weak` : "hold strong"}; rep back to 0.`);
      return { crew: await saveCrew(table, crew), ...done };
    }
    case "crew-xp": {
      const crew = needCrew(table);
      crew.xp = num(crew.xp) + Math.round(num(args.amount, 1));
      let advanced = 0;
      if (crew.xp >= rules.CREW_XP) {
        crew.xp = 0;
        advanced = 1;
        crew.advances = num(crew.advances) + 1;
        // Profits: each PC gets stash equal to Tier +2.
        for (const member of partyMembers(table)) {
          const data = structuredClone(member.data);
          data.stash = Math.min(40, num(data.stash) + num(crew.tier) + 2);
          table.records.update(member.id, { data: rules.derive(data) }, table.seat, { replace: true });
        }
      }
      say(`[CREW XP] ${crew.name}: +${Math.round(num(args.amount, 1))}${args.why ? ` (${text(args.why, 120)})` : ""}${advanced ? `. A crew advance: a new special ability or two upgrade boxes; each member's stash +${num(crew.tier) + 2}.` : ` (${crew.xp}/${rules.CREW_XP}).`}`);
      return { crew: await saveCrew(table, crew), advanced };
    }
    case "crew-advance": {
      // Spend a crew advance: a special ability, or two upgrade boxes.
      const crew = needCrew(table);
      if (num(crew.advances) < 1 && seat.role !== "dm") throw new Error("The crew has no advance to spend.");
      if (args.ability) {
        const lib = libraryForged(table.records);
        const all = [...lib.crewtypes.flatMap((type) => rows(type.data.abilities).map(([, row]) => row)), ...(lib.tables.crewabilities ?? [])];
        const found = all.find((row) => String(row.name).toLowerCase() === String(args.ability).toLowerCase());
        if (!found) throw new Error(`No crew special ability ${args.ability}.`);
        if (rules.crewHas(crew, found.name)) throw new Error(`The crew has ${found.name} already.`);
        crew.abilities = [...(crew.abilities ?? []), { name: String(found.name), text: String(found.text ?? "") }];
        say(`[CREW] ${crew.name} gains ${found.name}.`);
      } else {
        crew.boxes = num(crew.boxes) + 2;
        say(`[CREW] ${crew.name}: two upgrade boxes to mark.`);
      }
      crew.advances = Math.max(0, num(crew.advances) - 1);
      return { crew: await saveCrew(table, crew) };
    }
    case "upgrade": {
      // Mark an upgrade (its cost in boxes from the crew's free boxes; the GM may grant one outright).
      const crew = needCrew(table);
      const name = text(args.name, 80);
      if (!name) throw new Error("Which upgrade?");
      const lib = libraryForged(table.records);
      const known = [...lib.crewtypes.flatMap((type) => rows(type.data.upgrades).map(([, row]) => row)), ...(lib.tables.upgrades ?? [])].find((row) => String(row.name).toLowerCase() === name.toLowerCase());
      const cost = rules.upgradeCost(known?.name ?? name);
      // An upgrade holds its boxes (a boat house two, Composed three, Mastery four); a cohort may be bought again.
      const cap = Math.max(num(known?.boxes, cost), cost);
      const level = num(crew.upgrades?.[known?.name ?? name]);
      if (!/^cohort/i.test(name) && level + cost > cap) throw new Error(`${known?.name ?? name} is marked fully.`);
      if (num(crew.boxes) < cost && seat.role !== "dm") throw new Error(`${known?.name ?? name} takes ${cost} upgrade box${cost > 1 ? "es" : ""}; the crew has ${num(crew.boxes)} to mark.`);
      crew.boxes = Math.max(0, num(crew.boxes) - cost);
      crew.upgrades = { ...(crew.upgrades ?? {}), [known?.name ?? name]: level + cost };
      if (/^cohort/i.test(name)) crew.cohorts = [...(crew.cohorts ?? []), cleanCohort(args.cohort ?? { kind: "gang", type: "Thugs" }, (crew.cohorts ?? []).length)];
      say(`[CREW] ${crew.name} marks ${known?.name ?? name}.`);
      return { crew: await saveCrew(table, crew) };
    }
    case "claim": {
      gmOnly();
      const crew = needCrew(table);
      const name = text(args.name, 80);
      if (!name) throw new Error("Which claim?");
      const claims = [...(crew.claims ?? [])];
      if (args.on === false) {
        const at = claims.findIndex((claim) => claim.toLowerCase() === name.toLowerCase());
        if (at < 0) throw new Error(`The crew holds no ${name}.`);
        claims.splice(at, 1);
      } else claims.push(name);
      crew.claims = claims;
      say(`[CLAIM] ${crew.name} ${args.on === false ? "loses" : "seizes"} ${name}.`);
      return { crew: await saveCrew(table, crew) };
    }
    case "status": {
      const crew = needCrew(table);
      gmOnly();
      const name = text(args.faction, 80);
      if (!name) throw new Error("Which faction?");
      const entry = { tier: 0, hold: "strong", status: 0, ...(crew.factions?.[name] ?? {}) };
      if (args.status !== undefined) entry.status = Math.max(-3, Math.min(3, Math.round(num(args.status))));
      if (args.change !== undefined) entry.status = Math.max(-3, Math.min(3, num(entry.status) + Math.round(num(args.change))));
      if (args.tier !== undefined) entry.tier = Math.max(0, Math.min(6, Math.round(num(args.tier))));
      if (args.hold !== undefined) entry.hold = args.hold === "weak" ? "weak" : "strong";
      crew.factions = { ...(crew.factions ?? {}), [name]: entry };
      say(`[STATUS] ${crew.name} and ${name}: ${entry.status > 0 ? "+" : ""}${entry.status} (${rules.STATUS_WORDS[entry.status]}).`);
      return { crew: await saveCrew(table, crew) };
    }
    case "cohort": {
      const crew = needCrew(table);
      const cohorts = [...(crew.cohorts ?? [])];
      const at = cohorts.findIndex((cohort) => cohort.id === String(args.id ?? ""));
      if (args.remove) {
        gmOnly();
        if (at < 0) throw new Error("No such cohort.");
        cohorts.splice(at, 1);
      } else if (at >= 0) {
        if (args.harm !== undefined) cohorts[at] = { ...cohorts[at], harm: Math.max(0, Math.min(4, Math.round(num(args.harm)))) };
        for (const key of ["name", "type"]) if (args[key] !== undefined) cohorts[at][key] = text(args[key], 80);
        if (Array.isArray(args.edges)) cohorts[at].edges = args.edges.map((edge) => text(edge, 40)).slice(0, 2);
        if (Array.isArray(args.flaws)) cohorts[at].flaws = args.flaws.map((flaw) => text(flaw, 40)).slice(0, 2);
        if (args.harm !== undefined) say(`[COHORT] ${cohorts[at].name}: ${rules.COHORT_HARM[cohorts[at].harm] || "unharmed"}.`);
      } else {
        gmOnly();
        cohorts.push(cleanCohort(args, cohorts.length));
      }
      crew.cohorts = cohorts;
      return { crew: await saveCrew(table, crew) };
    }
    case "cohort-roll": {
      // A cohort sent to achieve a goal: its quality rolled (+1d elite; harm: impaired -1d, broken cannot).
      const crew = needCrew(table);
      const cohort = (crew.cohorts ?? []).find((item) => item.id === String(args.id ?? ""));
      if (!cohort) throw new Error("No such cohort.");
      if (num(cohort.harm) >= 3) throw new Error(`${cohort.name} is ${rules.COHORT_HARM[cohort.harm]}: they can't do anything until they recover.`);
      const dice = cohortQuality(crew, cohort) + (cohort.elite ? 1 : 0) - (num(cohort.harm) === 2 ? 1 : 0);
      const read = await rollPool(table, dice, `[COHORT] ${cohort.name}${args.goal ? `: ${text(args.goal, 120)}` : ""} (quality ${cohortQuality(crew, cohort)})`, who);
      say(`${cohort.name}: ${rules.FORTUNE_WORDS[read.result]}`);
      return { result: read.result, highest: read.highest, dice };
    }
    case "contact": {
      const crew = needCrew(table);
      crew.contacts = (crew.contacts ?? []).map((contact) => ({ ...contact, favorite: contact.name.toLowerCase() === String(args.name ?? "").toLowerCase() ? 1 : args.only ? 0 : contact.favorite }));
      return { crew: await saveCrew(table, crew) };
    }
    case "downtime-start": {
      // Downtime begins: two free activities each (one at war), special armor back, training reset; heal the cohorts.
      gmOnly();
      for (const member of partyMembers(table)) {
        const data = structuredClone(member.data);
        data.downtime = { used: 0, trained: {}, indulged: 0 };
        data.armor = { ...(data.armor ?? {}), special: 0 };
        table.records.update(member.id, { data: rules.derive(data) }, table.seat, { replace: true });
      }
      const crew = crewOf(table);
      if (crew) {
        const next = structuredClone(crew);
        next.cohorts = (next.cohorts ?? []).map((cohort) => ({ ...cohort, harm: num(cohort.harm) >= 4 ? 4 : Math.max(0, num(cohort.harm) - 1) }));
        // Claims that pay in downtime: dice equal to Tier, coin equal to the highest minus heat.
        const earners = (next.claims ?? []).filter((claim) => /protection racket|vice den|fighting pits|side business/i.test(claim));
        for (const claim of earners) {
          const read = await rollPool(table, num(next.tier), `[CLAIM] ${claim}: Tier ${next.tier}`, who);
          const earned = Math.max(0, read.highest - num(next.heat));
          next.coin = num(next.coin) + earned;
          say(`[CLAIM] ${claim}: +${earned} coin.`);
        }
        await saveCrew(table, next);
      }
      clocks?.setScore({ phase: "downtime" }, seat);
      say("[DOWNTIME] Payoff, heat and entanglements, then two activities each: acquire an asset, a long-term project, recover, reduce heat, train, or indulge a vice.");
      return { phase: "downtime" };
    }
    case "downtime-end": {
      // Downtime ends: a scoundrel who did not indulge their vice takes stress equal to their trauma; A little something on the side: +2 stash.
      gmOnly();
      const ignored = [];
      for (const member of partyMembers(table)) {
        const data = structuredClone(member.data);
        if (!num(data.downtime?.indulged) && (data.traumas ?? []).length > 0) {
          const result = rules.addStress(data, data.traumas.length);
          ignored.push(`${member.name} +${data.traumas.length} stress${result.trauma ? " (TRAUMA)" : ""}`);
        }
        if (rules.hasAbility(data, "A little something on the side")) data.stash = Math.min(40, num(data.stash) + 2);
        table.records.update(member.id, { data: rules.derive(data) }, table.seat, { replace: true });
      }
      clocks?.setScore({ phase: "free", engagement: null, plan: "", detail: "" }, seat);
      say(`[DOWNTIME] Over: back to free play.${ignored.length ? ` Vices ignored: ${ignored.join(", ")}.` : ""}`);
      return { phase: "free", ignored };
    }
    case "engagement": {
      // The engagement roll: 1d for sheer luck +/- a die for each major advantage and disadvantage. Its result sets the position.
      const dice = rules.engagementPool(num(args.advantages), num(args.disadvantages));
      const crew = crewOf(table);
      let bonus = 0;
      const plan = String(args.plan ?? clocks?.score().plan ?? "");
      if (crew) {
        if (/stealth/.test(plan) && (rules.crewHas(crew, "Second story") || crew.claims?.some((claim) => /secret pathways|city records/i.test(claim)))) bonus += 1;
        if (/deception|social/.test(plan) && crew.claims?.some((claim) => /cover identities/i.test(claim))) bonus += 1;
        if (/occult/.test(plan) && crew.claims?.some((claim) => /ancient altar/i.test(claim))) bonus += 1;
      }
      const read = await rollPool(table, dice + bonus, `[ENGAGEMENT] ${plan ? `${rules.PLANS[plan]?.name ?? plan} plan` : "The plan"}${args.detail ? ` (${text(args.detail, 120)})` : ""}: ${dice + bonus}d`, who);
      const engaged = rules.ENGAGEMENT[read.result];
      clocks?.setScore({ phase: "score", position: engaged.position, ...(plan ? { plan } : {}), ...(args.detail ? { detail: text(args.detail, 200) } : {}), ...(args.target ? { target: text(args.target, 120) } : {}), ...(args.targetTier !== undefined ? { targetTier: num(args.targetTier) } : {}), engagement: { result: read.result, highest: read.highest, dice: dice + bonus, position: engaged.position } }, { role: "dm" });
      say(`[ENGAGEMENT] ${engaged.words}`);
      return { result: read.result, highest: read.highest, dice: dice + bonus, position: engaged.position };
    }
    case "fortune": {
      // A fortune roll: any trait's dice, +/- major advantages (or gathering information).
      const dice = Math.max(-1, Math.round(num(args.dice, 1)));
      const read = await rollPool(table, dice, `[FORTUNE] ${text(args.label, 120) || "Fortune"} (${dice}d)`, who, { secret: Boolean(args.secret) && seat.role === "dm" });
      return { result: read.result, highest: read.highest, words: rules.FORTUNE_WORDS[read.result] };
    }
    case "group": {
      // A group action: each member rolls the same action; the best result counts for all; the leader takes 1 stress for each who rolled 1-3.
      const key = String(args.action ?? "").toLowerCase();
      if (!rules.ACTIONS.includes(key)) throw new Error(`Which action: ${rules.ACTIONS.join(", ")}?`);
      const leader = table.records.get(String(args.leader ?? ""));
      if (!leader || !isForged(leader)) throw new Error("Who leads the group action?");
      mine(leader, seat);
      const members = (Array.isArray(args.members) ? args.members : []).map((id) => table.records.get(String(id))).filter((record) => record && isForged(record));
      if (!members.some((member) => member.id === leader.id)) members.unshift(leader);
      const position = rules.POSITIONS.includes(args.position) ? args.position : clocks?.score().position || "risky";
      const effect = rules.EFFECTS.includes(args.effect) ? args.effect : clocks?.score().effect || "standard";
      const results = [];
      for (const member of members) {
        const read = await rollPool(table, num(member.data.actions?.[key]), `[GROUP] ${member.name}: ${rules.titled(key)} (led by ${leader.name})`, who, { by: member.name });
        results.push({ id: member.id, name: member.name, result: read.result, highest: read.highest });
        if (position === "desperate") {
          const data = structuredClone(table.records.get(member.id).data);
          rules.markXp(data, rules.ATTRIBUTE_OF[key], 1);
          table.records.update(member.id, { data: rules.derive(data) }, table.seat, { replace: true });
        }
      }
      const order = ["bad", "partial", "success", "critical"];
      const sixes = results.filter((item) => item.highest === 6).length;
      let best = results.reduce((top, item) => (order.indexOf(item.result) > order.indexOf(top) ? item.result : top), "bad");
      const crew = crewOf(table);
      if (best === "success" && sixes >= 2 && crew && rules.crewHas(crew, "Synchronized")) best = "critical";
      const failed = results.filter((item) => item.result === "bad").length;
      const stress = rules.hasAbility(leader.data, "Expertise") ? Math.min(1, failed) : failed;
      const leaderData = structuredClone(table.records.get(leader.id).data);
      const result = rules.addStress(leaderData, stress);
      table.records.update(leader.id, { data: rules.derive(leaderData) }, table.seat, { replace: true });
      say(`[GROUP] ${rules.titled(key)} led by ${leader.name}: ${rules.RESULT_WORDS[best]} for everyone (${rules.titled(position)} / ${rules.titled(effect)}). ${rules.OUTCOMES[position][best]} ${leader.name} takes ${stress} stress${result.trauma ? " (TRAUMA)" : ""}.`);
      let clock = null;
      if (args.clock && clocks) {
        const ticks = rules.ticksFor(best, effect);
        if (ticks > 0) clock = clocks.tick(String(args.clock), ticks, seat, { why: `group ${rules.titled(key)}`, by: who });
      }
      return { result: best, results, stress, clock };
    }
    default:
      throw new Error(`No Forged in the Dark crew action ${action}.`);
  }
}

// Every scoundrel's "award XP" from the party sheet: playbook xp marked on each (not split: each earns their own).
async function awardForged(table, amount, from) {
  const rules = await rulesForged();
  const marks = Math.max(1, Math.min(8, Math.round(num(amount, 1))));
  const members = partyMembers(table);
  if (members.length === 0) throw new Error("The party has no scoundrels.");
  for (const member of members) {
    const data = structuredClone(member.data);
    const marked = rules.markXp(data, "playbook", marks);
    table.records.update(member.id, { data: rules.derive(data) }, table.seat, { replace: true });
    table.say(`[XP] ${member.name}: +${marks} playbook xp${marked.advanced ? " (an advance: a new special ability)" : ` (${marked.xp}/${rules.XP_TRACKS.playbook})`}.`, from);
  }
  return marks;
}

async function dropOnForged(table, record, source, from) {
  const rules = await rulesForged();
  const data = structuredClone(record.data);
  if (source.type === "item") {
    data.inventorylist = data.inventorylist ?? {};
    data.inventorylist[newKey(data.inventorylist)] = { name: source.name, load: rules.itemLoad(source.data ?? {}), text: String(source.data?.text ?? ""), ...(source.data?.armor ? { armor: source.data.armor } : {}), source: "Dropped", carried: 0 };
  } else throw new Error("A Forged in the Dark sheet takes items; playbooks and abilities come with the wizard and advances.");
  const updated = table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
  const summary = `${record.name} gets ${source.name}.`;
  table.say(summary, from || record.name, record.visibility === "gm");
  return { record: updated, added: "item", summary };
}

module.exports = { rulesForged, libraryForged, buildForged, buildCrew, editForged, actionForged, crewAction, awardForged, dropOnForged, crewOf, isForged, isForgedRuleset, RULESET_NAME };
