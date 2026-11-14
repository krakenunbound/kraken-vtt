const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Fate Core and Fate Accelerated (shared/fate/rules.mjs):
// characters built from the wizard's spec (or a book's pregenerated one),
// rolls of four Fate dice in front of the table (a skill or an approach, the
// four actions against an opposition, shifts and outcomes), aspects invoked
// (+2 or a reroll, for a fate point or a free invoke) and compelled, fate
// points and refresh, stress and consequences, milestones; and the table's
// own Fate state, one record everyone reads and the GM changes: the scene's
// situation aspects and boosts (with their free invokes), the GM's pool of
// fate points for the scene, and whether the conflict is physical or mental.
// A character's data.ruleset is "fate" (data.game "core" or "fae").

let loaded = null;
const rulesFate = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "fate", "rules.mjs")).href));
const RULESETS = ["Fate Core", "Fate Accelerated"];
const isFateRuleset = (name) => RULESETS.includes(String(name ?? ""));
const isFate = (thing) => thing?.data?.ruleset === "fate";
const gameFor = (ruleset) => (String(ruleset ?? "") === "Fate Accelerated" ? "fae" : "core");
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const clean = (value, max = 200) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const newKey = (list) => {
  let n = Object.keys(list ?? {}).length + 1;
  while (list?.[`id-${String(n).padStart(5, "0")}`]) n += 1;
  return `id-${String(n).padStart(5, "0")}`;
};

// --- The table's Fate state ------------------------------------------------------
const TABLE_ID = "fate-table";
function fateTable(table) {
  const existing = table.records.get(TABLE_ID);
  if (existing) return existing;
  return table.records.create({ id: TABLE_ID, type: "fatetable", name: "Fate", visibility: "all", data: { gmpool: 0, conflict: "physical", aspects: {}, scene: "" } }, table.seat);
}
function saveTable(table, data) {
  return table.records.update(TABLE_ID, { data }, table.seat, { replace: true });
}
// The scene's aspects: [{ id, name, invokes, kind (situation, boost, game), by }].
function sceneAspects(table) {
  return rows(fateTable(table).data.aspects).map(([id, aspect]) => ({ id, name: String(aspect.name ?? ""), invokes: num(aspect.invokes), kind: String(aspect.kind ?? "situation"), by: String(aspect.by ?? "") }));
}
function addAspect(table, { name, invokes = 0, kind = "situation", by = "" }, from) {
  const words = clean(name, 120);
  if (!words) throw new Error("Name the aspect.");
  const data = structuredClone(fateTable(table).data);
  const id = newKey(data.aspects);
  data.aspects = { ...(data.aspects ?? {}), [id]: { name: words, invokes: Math.max(0, Math.min(5, Math.round(num(invokes)))), kind: ["situation", "boost", "game"].includes(kind) ? kind : "situation", by: clean(by, 60) } };
  saveTable(table, data);
  table.say(`[ASPECT] ${kind === "boost" ? "Boost" : "Situation aspect"}: ${words}${num(invokes) ? ` (${num(invokes)} free invoke${num(invokes) === 1 ? "" : "s"}${by ? ` for ${by}` : ""})` : ""}`, from || "Fate");
  return id;
}
function findAspect(table, idOrName) {
  const wanted = String(idOrName ?? "").trim().toLowerCase();
  return sceneAspects(table).find((aspect) => aspect.id === idOrName || aspect.name.toLowerCase() === wanted) ?? null;
}
// A free invoke used: a boost is gone once invoked.
function useFreeInvoke(table, aspect) {
  const data = structuredClone(fateTable(table).data);
  const row = data.aspects?.[aspect.id];
  if (!row || num(row.invokes) <= 0) throw new Error(`${aspect.name} has no free invoke left.`);
  row.invokes = num(row.invokes) - 1;
  if (row.kind === "boost") delete data.aspects[aspect.id];
  saveTable(table, data);
}

// --- Characters --------------------------------------------------------------------
async function buildFate(table, spec, owner, seat) {
  const rules = await rulesFate();
  const game = gameFor(table.ruleset?.());
  let source = spec ?? {};
  if (spec?.pregen) {
    // A book's pregenerated character (type pregencharsheet), as it is.
    const sheet = table.records.get(String(spec.pregen));
    if (!sheet || sheet.type !== "pregencharsheet") throw new Error("No such pregenerated character: make its book active (Modules).");
    if (sheet.data?.game && sheet.data.game !== game) throw new Error(`${sheet.name} is a ${rules.RULESETS[sheet.data.game]} character; this campaign plays ${table.ruleset?.()}.`);
    source = { ...spec, name: spec.name || sheet.name, pregen: unpack(sheet.data) };
  }
  const built = rules.buildFromSpec(source, { game });
  const data = require("./characterArt.cjs").withArt(built.data, { ...spec, race: "Human", class: built.data.aspects.highconcept }, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}
// A pregen's record as the books write it (lists as id rows) to a character's data.
function unpack(data) {
  const out = { ...data };
  if (data?.skilllist) out.skills = Object.fromEntries(rows(data.skilllist).map(([, skill]) => [String(skill.name), num(skill.rating)]));
  if (data?.stuntlist) out.stunts = Object.fromEntries(rows(data.stuntlist).map(([key, stunt]) => [key, { name: String(stunt.name ?? ""), text: String(stunt.text ?? ""), skill: String(stunt.skill ?? "") }]));
  delete out.skilllist;
  delete out.stuntlist;
  return out;
}

function mine(record, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
}

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["description", "notes", "playername", "extras"]);
const NUMBERS = [/^skills\.[A-Za-z][\w' -]{0,39}$/, /^approaches\.(careful|clever|flashy|forceful|quick|sneaky)$/, /^fatepoints$/, /^refreshbase$/, /^skillpoints$/, /^stress\.(physical|mental|stress)\.\d$/, /^consequences\.(mild|moderate|severe|extreme|mild2|mild3)\.recovering$/];
const STRINGS = [/^aspects\.(highconcept|trouble|a1|a2|a3)$/, /^phases\.p[123]\.(title|story|aspect|guest)$/, /^stunts\.id-\d+\.(name|text|skill)$/, /^consequences\.(mild|moderate|severe|extreme|mild2|mild3)\.text$/, /^milestones\.id-\d+\.text$/];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
async function editFate(table, record, changes, seat) {
  mine(record, seat);
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesFate();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = clean(value, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "out") data.out = ["taken out", "conceded"].includes(value) ? value : "";
    else if (STRINGS.some((pattern) => pattern.test(key))) setPath(data, key, String(value ?? "").slice(0, 2000));
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 100) throw new Error(`${key} needs a number.`);
      setPath(data, key, n);
    } else if (/^(stunts|milestones)\.id-\d+$/.test(key) && value === null) delete data[key.split(".")[0]]?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

// --- Rolls ---------------------------------------------------------------------------
// Four Fate dice and a modifier, rolled on the host's dice: { rolled, dice, total }.
function fourDF(table, modifier) {
  const rolled = table.dice.roll(`4dF${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`);
  const dice = rolled.terms.find((term) => term.kind === "dice")?.rolls ?? [];
  return { rolled, dice, total: rolled.total };
}
const RESULT = { fail: "FAIL", tie: "TIE", succeed: "SUCCEED", style: "STYLE" };
// Invokes paid before a roll (a fate point each, or a scene aspect's free
// invoke): [{ aspect, free }] -> the count, and the words for chat.
async function payInvokes(table, payer, invokes = [], { gm = false } = {}) {
  const list = (Array.isArray(invokes) ? invokes : []).slice(0, 6).filter((item) => clean(item?.aspect ?? item));
  const words = [];
  let fatePoints = 0;
  const free = [];
  for (const item of list) {
    const name = clean(item?.aspect ?? item, 120);
    const scene = findAspect(table, item?.id ?? name);
    if (item?.free && scene && scene.invokes > 0) free.push(scene);
    else fatePoints += 1;
    words.push(name);
  }
  if (fatePoints > 0) await spendPoints(table, payer, fatePoints, { gm });
  for (const scene of free) useFreeInvoke(table, scene);
  return { count: list.length, words, fatePoints, free: free.length };
}
// Fate points spent: a character's own, or (gm) the GM's pool for the scene.
async function spendPoints(table, record, count, { gm = false } = {}) {
  if (gm || !record) {
    const data = structuredClone(fateTable(table).data);
    if (num(data.gmpool) < count) throw new Error(`The GM's pool has ${num(data.gmpool)} fate point${num(data.gmpool) === 1 ? "" : "s"}.`);
    data.gmpool = num(data.gmpool) - count;
    saveTable(table, data);
    return;
  }
  const rules = await rulesFate();
  const data = structuredClone(table.records.get(record.id).data);
  if (num(data.fatepoints) < count) throw new Error(`${record.name} has ${num(data.fatepoints)} fate point${num(data.fatepoints) === 1 ? "" : "s"}.`);
  data.fatepoints = num(data.fatepoints) - count;
  table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
}

// A roll from the sheet (or the agent): skill (Core) or approach (FAE),
// action (overcome, advantage, attack, defend), opposition (a number on the
// ladder: passive opposition, default Fair +2 for overcome and advantage,
// none for attack and defend), invokes [{aspect, free}] paid first (+2
// each), bonus, aspect (create an advantage: the aspect made on a success,
// a boost on a tie), on (the aspect's target, for its words).
async function rollFate(table, record, args = {}, from) {
  const rules = await rulesFate();
  const data = record.data ?? {};
  const action = rules.ACTIONS[args.action] ? args.action : "overcome";
  const skill = clean(args.skill, 40) || rules.ratingsOf(data)[0]?.name || "Mediocre";
  const rating = rules.ratingIn(data, skill);
  const shown = data.game === "fae" ? rules.APPROACH_NAMES[String(skill).toLowerCase()] ?? skill : skill;
  const oppositionGiven = args.opposition !== undefined && args.opposition !== null && args.opposition !== "";
  const opposition = oppositionGiven ? rules.ratingOf(args.opposition) : null;
  const paid = await payInvokes(table, record, args.invokes);
  const bonus = Math.round(num(args.bonus));
  const modifier = rating + 2 * paid.count + bonus;
  const { rolled, dice, total } = fourDF(table, modifier);
  const result = opposition === null ? null : rules.outcome(total, opposition);
  const label = `[FATE] ${shown} ${rules.signed(rating)}${paid.count ? ` +${paid.count * 2} invoked` : ""}${bonus ? ` ${rules.signed(bonus)}` : ""} · ${rules.ACTIONS[action]}${opposition !== null ? ` vs ${rules.ladder(opposition)}` : ""}${result ? ` [${RESULT[result.outcome]} ${rules.signed(result.shifts)}]` : ""}`;
  table.postRoll(rolled, label, from || record.name, Boolean(args.secret), { by: record.name, ...(result ? { result: RESULT[result.outcome], against: opposition } : {}), ladder: rules.ladder(total) });
  if (paid.words.length) table.say(`[INVOKE] ${record.name} invokes ${paid.words.map((word) => `"${word}"`).join(", ")} (+2 each: ${paid.fatePoints ? `${paid.fatePoints} fate point${paid.fatePoints === 1 ? "" : "s"}` : ""}${paid.fatePoints && paid.free ? ", " : ""}${paid.free ? `${paid.free} free` : ""}).`, from || record.name);
  // What it gives: an advantage's aspect (or a boost), an overcome's boost on style.
  let created = null;
  if (result && action === "advantage") created = await advantageResult(table, record.name, args.aspect, result, from);
  else if (result && action === "overcome" && result.outcome === "style") created = addAspect(table, { name: clean(args.aspect, 120) || `${record.name}'s momentum`, invokes: 1, kind: "boost", by: record.name }, from);
  if (result) table.say(`${record.name}: ${rules.ladder(total)} — ${rules.resultWords(action, result)}.`, "Fate");
  const lastroll = { label: shown, skill, rating, action, dice, invokes: paid.count, bonus, total, opposition, outcome: result?.outcome ?? "", shifts: result?.shifts ?? 0, aspect: clean(args.aspect, 120), created: created ?? "", at: Date.now() };
  const now = structuredClone(table.records.get(record.id).data);
  now.lastroll = lastroll;
  table.records.update(record.id, { data: rules.derive(now) }, table.seat, { replace: true });
  return { total, dice, rating, ladder: rules.ladder(total), ...(result ? { outcome: result.outcome, shifts: result.shifts } : {}), invokes: paid.count, created };
}
// Create an advantage's result: the aspect with a free invoke (two with
// style), a boost on a tie, nothing on a failure. Returns the aspect's id.
async function advantageResult(table, who, aspect, result, from) {
  const rules = await rulesFate();
  const name = clean(aspect, 120);
  if (result.outcome === "tie") return addAspect(table, { name: name ? `${name} (boost)` : `${who}'s opening`, invokes: 1, kind: "boost", by: who }, from);
  if (rules.freeInvokes(result) > 0) return addAspect(table, { name: name || `${who}'s advantage`, invokes: rules.freeInvokes(result), kind: "situation", by: who }, from);
  return null;
}

// An aspect invoked on the last roll: +2 (bonus) or the dice rolled again
// (reroll), for a fate point (the character's; the GM's pool for an NPC) or
// a scene aspect's free invoke. The new total and outcome go to chat.
async function invokeFate(table, record, args = {}, from) {
  const rules = await rulesFate();
  const data = structuredClone(record.data ?? {});
  const last = data.lastroll;
  if (!last || !last.at) throw new Error(`${record.name} has no roll to invoke on: roll first.`);
  const name = clean(args.aspect, 120);
  if (!name) throw new Error("Invoke which aspect?");
  const mode = args.mode === "reroll" ? "reroll" : "bonus";
  const scene = findAspect(table, args.id ?? name);
  if (args.free) {
    if (!scene || scene.invokes <= 0) throw new Error(`${name} has no free invoke.`);
    useFreeInvoke(table, scene);
  } else await spendPoints(table, record, 1);
  let dice = last.dice ?? [];
  let rolled = null;
  if (mode === "reroll") {
    const again = fourDF(table, 0);
    dice = again.dice;
    rolled = again.rolled;
  }
  const invokes = num(last.invokes) + (mode === "bonus" ? 1 : 0);
  const total = rules.rollTotal({ dice, rating: last.rating, invokes, bonus: last.bonus });
  const result = last.opposition === null || last.opposition === undefined ? null : rules.outcome(total, last.opposition);
  const how = args.free ? "a free invoke" : "a fate point";
  if (rolled) table.postRoll(rolled, `[INVOKE] ${record.name}: "${name}" to reroll (${how}) · ${last.label} ${rules.signed(last.rating)} = ${rules.ladder(total)}${result ? ` [${RESULT[result.outcome]} ${rules.signed(result.shifts)}]` : ""}`, from || record.name, false, { by: record.name, ...(result ? { result: RESULT[result.outcome] } : {}), ladder: rules.ladder(total) });
  else table.say(`[INVOKE] ${record.name} invokes "${name}" for +2 (${how}): ${rules.ladder(last.total)} -> ${rules.ladder(total)}${result ? ` — ${rules.OUTCOMES[result.outcome]}${result.shifts ? ` (${rules.signed(result.shifts)})` : ""}` : ""}.`, from || record.name);
  // An advantage's aspect follows the better outcome.
  let created = last.created || "";
  if (result && last.action === "advantage" && result.outcome !== last.outcome) {
    const tableData = structuredClone(fateTable(table).data);
    if (created && tableData.aspects?.[created]) {
      if (rules.freeInvokes(result) > 0) tableData.aspects[created] = { ...tableData.aspects[created], kind: "situation", name: String(tableData.aspects[created].name).replace(/ \(boost\)$/, ""), invokes: rules.freeInvokes(result) };
      saveTable(table, tableData);
    } else created = (await advantageResult(table, record.name, last.aspect, result, from)) ?? "";
  }
  const now = structuredClone(table.records.get(record.id).data);
  now.lastroll = { ...last, dice, invokes, total, outcome: result?.outcome ?? "", shifts: result?.shifts ?? 0, created };
  table.records.update(record.id, { data: rules.derive(now) }, table.seat, { replace: true });
  return { total, ladder: rules.ladder(total), ...(result ? { outcome: result.outcome, shifts: result.shifts } : {}), mode };
}

// What a Fate character does (the sheet's buttons), for the owner or the GM:
//   roll (skill, action, opposition, invokes, bonus, aspect), invoke (aspect,
//   mode bonus|reroll, free, id), compel (aspect, accept: true gains a fate
//   point, false pays one to refuse; the GM offers it), fatepoints (amount:
//   the GM gives or takes), refresh (fate points back up to the refresh),
//   stress (track, box, on), clear-stress (the scene is over: every box
//   clear), consequence (key, text: a consequence written in), recover
//   (key: recovering, or done: cleared), milestone (kind minor|significant|
//   major, text), skill-up (skill: a skill point spent), stunt-add (name,
//   text, skill), stunt-remove (key).
async function actionFate(table, record, action, args = {}, seat, from) {
  if (!["compel", "fatepoints"].includes(action) || seat.role !== "dm") mine(record, seat);
  const rules = await rulesFate();
  const data = structuredClone(record.data);
  const who = from || record.name;
  const say = (text) => table.say(text, who);
  const save = (changed = data) => table.records.update(record.id, { data: rules.derive(changed) }, table.seat, { replace: true });
  switch (action) {
    case "roll":
      return rollFate(table, record, args, who);
    case "invoke":
      return invokeFate(table, record, args, who);
    case "compel": {
      const aspect = clean(args.aspect, 120) || "an aspect";
      if (args.accept === false) {
        if (num(data.fatepoints) < 1) throw new Error(`${record.name} has no fate point to refuse the compel.`);
        data.fatepoints = num(data.fatepoints) - 1;
        say(`[COMPEL] ${record.name} refuses the compel on "${aspect}" and pays a fate point (${data.fatepoints} left).`);
      } else {
        data.fatepoints = num(data.fatepoints) + 1;
        say(`[COMPEL] ${record.name} accepts the compel on "${aspect}"${args.text ? `: ${clean(args.text, 300)}` : ""} and gains a fate point (now ${data.fatepoints}).`);
      }
      return { record: save(), fatepoints: data.fatepoints };
    }
    case "fatepoints": {
      if (seat.role !== "dm") throw new Error("Only the GM gives fate points.");
      const amount = Math.round(num(args.amount, 1));
      data.fatepoints = Math.max(0, num(data.fatepoints) + amount);
      say(`[FATE POINT] ${record.name} ${amount >= 0 ? "gets" : "spends"} ${Math.abs(amount)} fate point${Math.abs(amount) === 1 ? "" : "s"} (now ${data.fatepoints}).`);
      return { record: save(), fatepoints: data.fatepoints };
    }
    case "refresh": {
      const refresh = rules.refreshOf(data);
      const before = num(data.fatepoints);
      data.fatepoints = Math.max(before, refresh);
      say(`[REFRESH] ${record.name}: fate points ${before} -> ${data.fatepoints} (refresh ${refresh}).`);
      return { record: save(), fatepoints: data.fatepoints };
    }
    case "stress": {
      const track = String(args.track ?? "");
      const box = String(Math.round(num(args.box, 0)));
      if (!data.stress?.[track] || data.stress[track][box] === undefined) throw new Error(`No ${track} stress box ${box}.`);
      data.stress[track][box] = args.on === false ? 0 : 1;
      return { record: save() };
    }
    case "clear-stress": {
      for (const track of Object.keys(data.stress ?? {})) for (const box of Object.keys(data.stress[track])) data.stress[track][box] = 0;
      data.out = "";
      say(`${record.name}'s stress clears.`);
      return { record: save() };
    }
    case "consequence": {
      const key = String(args.key ?? "");
      if (!data.consequences?.[key]) throw new Error(`No ${key} consequence slot.`);
      data.consequences[key] = { text: clean(args.text, 200), recovering: 0 };
      if (key === "extreme" && data.consequences[key].text) data.extremeused = 1;
      return { record: save() };
    }
    case "recover": {
      const key = String(args.key ?? "");
      const row = data.consequences?.[key];
      if (!row?.text) throw new Error(`No ${key} consequence to recover from.`);
      if (args.done || num(row.recovering)) {
        say(`[RECOVER] ${record.name} is over "${row.text}" (${rules.CONSEQUENCE_NAMES[key]}).`);
        data.consequences[key] = { text: key === "extreme" ? "" : "", recovering: 0 };
      } else {
        row.recovering = 1;
        say(`[RECOVER] ${record.name} starts recovering from "${row.text}" (${rules.CONSEQUENCE_NAMES[key]}).`);
      }
      return { record: save() };
    }
    case "milestone": {
      const kind = ["minor", "significant", "major"].includes(args.kind) ? args.kind : "minor";
      data.milestones = { ...(data.milestones ?? {}), [newKey(data.milestones)]: { kind, text: clean(args.text, 500) } };
      rules.applyMilestone(data, kind);
      say(`[MILESTONE] ${record.name}: a ${kind} milestone${args.text ? ` (${clean(args.text, 200)})` : ""}. ${rules.MILESTONES[kind]}`);
      return { record: save(), skillpoints: data.skillpoints, refresh: rules.refreshOf(data) };
    }
    case "skill-up": {
      if (num(data.skillpoints) < 1) throw new Error(`${record.name} has no skill point to spend: a significant or major milestone gives one.`);
      const name = clean(args.skill, 40);
      if (!name) throw new Error("Raise which skill?");
      if (data.game === "fae") {
        const key = name.toLowerCase();
        if (!rules.APPROACHES.includes(key)) throw new Error(`No approach ${name}.`);
        if (num(data.approaches?.[key]) >= 5) throw new Error("Approaches go no higher than Superb (+5).");
        data.approaches[key] = num(data.approaches[key]) + 1;
        say(`[MILESTONE] ${record.name}: ${rules.APPROACH_NAMES[key]} rises to ${rules.ladder(data.approaches[key])}.`);
      } else {
        const known = Object.keys(data.skills ?? {}).find((skill) => skill.toLowerCase() === name.toLowerCase()) ?? name;
        const next = num(data.skills?.[known]) + 1;
        if (next > 5) throw new Error("Skills go no higher than Superb (+5) here: the skill cap.");
        data.skills = { ...(data.skills ?? {}), [known]: next };
        say(`[MILESTONE] ${record.name}: ${known} rises to ${rules.ladder(next)}.`);
      }
      data.skillpoints = num(data.skillpoints) - 1;
      return { record: save() };
    }
    case "stunt-add": {
      const name = clean(args.name, 120);
      if (!name) throw new Error("Name the stunt.");
      // A stunt past the free three costs a refresh, and refresh is never below 1.
      if (rows(data.stunts).length >= rules.FREE_STUNTS && rules.refreshOf(data) <= 1) throw new Error("No refresh left to pay for another stunt (refresh is never below 1).");
      data.stunts = { ...(data.stunts ?? {}), [newKey(data.stunts)]: { name, text: clean(args.text, 2000), skill: clean(args.skill, 40) } };
      const derived = rules.derive(data);
      say(`[STUNT] ${record.name} learns ${name}${rows(data.stunts).length > rules.FREE_STUNTS ? ` (refresh now ${derived.refresh})` : ""}.`);
      return { record: save() };
    }
    case "stunt-remove": {
      delete data.stunts?.[String(args.key ?? "")];
      return { record: save() };
    }
    default:
      throw new Error(`No Fate action ${action}.`);
  }
}

// The table's actions (the Scene Aspects strip and the GM's pool):
//   aspect-add (name, invokes, kind situation|boost|game, by), aspect-remove
//   (id), aspect-invokes (id, invokes: set), gm-pool (amount: + or -, or
//   set), scene-start (the GM's pool set to one fate point a player
//   character in the scene: count, or the party), conflict (kind physical|
//   mental), refresh-all (every character's fate points back up to refresh),
//   compel-offer (id: a character, aspect: the GM offers a compel; the
//   player answers with the character's compel action).
async function tableFate(table, action, args = {}, seat, from) {
  const gm = seat.role === "dm";
  const needGM = () => {
    if (!gm) throw new Error("Only the GM changes that.");
  };
  const data = structuredClone(fateTable(table).data);
  switch (action) {
    case "aspect-add":
      // A player may write a situation aspect only as the result of a roll (create an advantage); the GM any time.
      needGM();
      return { id: addAspect(table, args, from), aspects: sceneAspects(table) };
    case "aspect-remove": {
      needGM();
      const gone = data.aspects?.[String(args.id ?? "")];
      if (!gone) throw new Error("No such aspect.");
      delete data.aspects[String(args.id)];
      saveTable(table, data);
      table.say(`[ASPECT] "${gone.name}" is gone from the scene.`, from || "Fate");
      return { aspects: sceneAspects(table) };
    }
    case "aspect-invokes": {
      needGM();
      const row = data.aspects?.[String(args.id ?? "")];
      if (!row) throw new Error("No such aspect.");
      row.invokes = Math.max(0, Math.min(5, Math.round(num(args.invokes))));
      saveTable(table, data);
      return { aspects: sceneAspects(table) };
    }
    case "gm-pool": {
      needGM();
      const before = num(data.gmpool);
      data.gmpool = Math.max(0, args.set !== undefined ? Math.round(num(args.set)) : before + Math.round(num(args.amount, 1)));
      saveTable(table, data);
      if (data.gmpool !== before) table.say(`[FATE POINT] The GM's pool: ${before} -> ${data.gmpool}.`, "Fate", true);
      return { gmpool: data.gmpool };
    }
    case "scene-start": {
      needGM();
      const party = table.records.get("party")?.data?.members;
      const count = args.count !== undefined ? Math.max(0, Math.round(num(args.count))) : Array.isArray(party) && party.length ? party.length : table.records.list({ type: "character" }).filter((record) => isFate(record) && record.owner).length;
      data.gmpool = count;
      data.scene = clean(args.name, 120);
      if (args.clear !== false) for (const [id, row] of rows(data.aspects)) if (row.kind !== "game") delete data.aspects[id];
      saveTable(table, data);
      table.say(`[SCENE] ${data.scene || "A new scene"}: the GM has ${count} fate point${count === 1 ? "" : "s"}${args.clear !== false ? "; the last scene's aspects are gone" : ""}.`, "Fate");
      return { gmpool: data.gmpool, aspects: sceneAspects(table) };
    }
    case "conflict": {
      needGM();
      data.conflict = args.kind === "mental" ? "mental" : "physical";
      saveTable(table, data);
      return { conflict: data.conflict };
    }
    case "refresh-all": {
      needGM();
      const rules = await rulesFate();
      const out = [];
      for (const record of table.records.list({ type: "character" }).filter(isFate)) {
        const now = structuredClone(record.data);
        const refresh = rules.refreshOf(now);
        if (num(now.fatepoints) < refresh) now.fatepoints = refresh;
        table.records.update(record.id, { data: rules.derive(now) }, table.seat, { replace: true });
        out.push(`${record.name} ${now.fatepoints}`);
      }
      table.say(`[REFRESH] A new session: fate points back up to each refresh (${out.join(", ") || "no characters"}).`, "Fate");
      return { refreshed: out };
    }
    case "compel-offer": {
      needGM();
      const record = table.records.get(String(args.id ?? ""));
      if (!isFate(record)) throw new Error("Offer a compel to a Fate character.");
      table.say(`[COMPEL] The GM compels ${record.name}'s "${clean(args.aspect, 120)}"${args.text ? `: ${clean(args.text, 300)}` : ""}. Accept for a fate point, or pay one to refuse.`, "Fate");
      return { offered: true };
    }
    default:
      throw new Error(`No Fate table action ${action}.`);
  }
}

module.exports = { rulesFate, fateTable, sceneAspects, addAspect, findAspect, useFreeInvoke, buildFate, editFate, rollFate, invokeFate, actionFate, tableFate, fourDF, spendPoints, payInvokes, isFate, isFateRuleset, gameFor, RULESETS, TABLE_ID, RESULT };
