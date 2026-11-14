const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Ironsworn and Ironsworn: Starforged (shared/ironsworn/rules.mjs):
// characters from the wizard, every move from the campaign's active books
// (ironmove records: the CC BY moves) rolled in front of the table on the
// host's dice, its outcome's clear effects applied (momentum, meters,
// progress, initiative or control) and its choices offered, momentum burned,
// progress tracks (vows, journeys, expeditions, fights, connections, sites),
// the legacy tracks and experience, assets (added and upgraded with
// experience), the oracles (ironoracle records, FG tables), Delve's sites
// (irondelve), and the tracker's foes as ranked progress tracks. A record's
// data.ruleset is "ironsworn" (data.game "classic" or "starforged").

let loaded = null;
const rulesIron = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "ironsworn", "rules.mjs")).href));
const RULESETS = ["Ironsworn", "Starforged"];
const isIronsworn = (thing) => thing?.data?.ruleset === "ironsworn";
const isIronswornRuleset = (name) => RULESETS.includes(String(name ?? ""));
const gameOfRuleset = (name) => (String(name ?? "") === "Starforged" ? "starforged" : "classic");
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value).filter(([, item]) => item && typeof item === "object") : []);
const newKey = (list, prefix) => {
  let n = Object.keys(list ?? {}).length + 1;
  while (list?.[`${prefix}${String(n).padStart(2, "0")}`]) n += 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
};
const mine = (record, seat) => {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only play your own character.");
};

function library(records) {
  const list = (type) => records.list({ type });
  return { moves: list("ironmove"), assets: list("ironasset"), oracles: list("ironoracle"), sites: list("irondelve") };
}
// A move by its record id, Datasworn id, key or name (this game's first).
function findMove(table, which, game) {
  const want = String(which ?? "").trim();
  const moves = table.records.list({ type: "ironmove" });
  const lower = want.toLowerCase();
  const found =
    moves.find((record) => record.id === want) ??
    moves.find((record) => record.data?.moveid === want) ??
    moves.find((record) => record.data?.game === game && (record.data?.key === lower || record.name.toLowerCase() === lower)) ??
    moves.find((record) => record.data?.key === lower || record.name.toLowerCase() === lower);
  if (!found) throw new Error(moves.length ? `No move ${want}.` : "No moves in this campaign: make the game's Reference book active (Modules).");
  return found;
}
function findOracle(table, which) {
  const want = String(which ?? "").trim();
  const oracles = table.records.list({ type: "ironoracle" });
  const lower = want.toLowerCase();
  const found = oracles.find((record) => record.id === want) ?? oracles.find((record) => record.data?.oracleid === want) ?? oracles.find((record) => `${record.data?.fgCategory ?? ""}: ${record.name}`.toLowerCase() === lower) ?? oracles.find((record) => record.name.toLowerCase() === lower);
  if (!found) throw new Error(oracles.length ? `No oracle ${want}.` : "No oracles in this campaign: make the game's Reference book active (Modules).");
  return found;
}

async function buildIronsworn(table, spec, owner, seat) {
  const rules = await rulesIron();
  const game = gameOfRuleset(table.ruleset?.());
  const lib = library(table.records);
  if (lib.assets.length === 0) throw new Error(`No assets in this campaign: make the ${game === "starforged" ? "Starforged" : "Ironsworn"} Reference active (Modules).`);
  const built = rules.buildFromSpec(spec ?? {}, { assets: lib.assets.filter((record) => (record.data?.game ?? game) === game) }, game);
  const serious = built.problems.filter((problem) => /stats|assets|starship|paths/i.test(problem));
  if (serious.length) throw new Error(serious.join(" "));
  const data = require("./characterArt.cjs").withArt(built.data, { ...spec, race: "Human", class: game === "starforged" ? "Spacer" : "Fighter" }, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// Supply is shared: the party's other Ironsworn characters keep the same.
function shareSupply(table, record, supply) {
  let members = [];
  try {
    const party = table.records.get("party");
    members = Array.isArray(party?.data?.members) ? party.data.members : [];
  } catch {
    members = [];
  }
  if (!members.includes(record.id)) return;
  for (const id of members) {
    if (id === record.id) continue;
    const other = table.records.get(id);
    if (other && isIronsworn(other) && num(other.data?.meters?.supply, -1) !== supply) table.records.update(id, { data: { meters: { ...other.data.meters, supply } } }, table.seat);
  }
}
async function save(table, record, data) {
  const rules = await rulesIron();
  const before = num(record.data?.meters?.supply, -1);
  const derived = rules.derive(data);
  const updated = table.records.update(record.id, { data: derived }, table.seat, { replace: true });
  if (derived.meters.supply !== before) shareSupply(table, updated, derived.meters.supply);
  return updated;
}

// A foe on the combat tracker (its rank and progress), or a character's own track.
function foeEntry(table, id) {
  const entry = table.combat?.entries?.().find((item) => item.id === id);
  return entry ?? null;
}
async function markFoe(table, entryId, times, from) {
  const rules = await rulesIron();
  const entry = foeEntry(table, entryId);
  if (!entry) throw new Error("No such foe on the tracker.");
  const now = entry.iron ?? { rank: "dangerous", ticks: 0 };
  const ticks = rules.markProgress(now.ticks, now.rank, times);
  table.combat.ironState(entry.id, { ...now, ticks });
  table.say(`[PROGRESS] ${entry.name} (${now.rank}): ${times > 1 ? `marked ${times} times` : "marked"}, ${rules.boxes(ticks)}/10 boxes.`, from, Boolean(entry.hidden));
  return { foe: entry.name, ticks, boxes: rules.boxes(ticks) };
}

// The roll card: the action die (struck through when negative momentum cancels it), the stat and adds, the challenge dice; its total the action score.
function card(rolled, { label, score, result, mod }) {
  const die = rolled.action;
  const terms = [
    { kind: "dice", sign: 1, count: 1, sides: 6, rolls: [die.value], kept: [!die.cancelled], sum: die.cancelled ? 0 : die.value },
    ...(mod ? [{ kind: "number", sign: mod < 0 ? -1 : 1, value: Math.abs(mod) }] : []),
    { kind: "dice", sign: 1, count: 2, sides: 10, rolls: rolled.challenge, kept: [true, true], sum: 0 },
  ];
  return { formula: `1d6${mod ? (mod > 0 ? `+${mod}` : mod) : ""} vs 2d10`, terms, total: score, label, result };
}
function progressCard(challenge, { label, score, result }) {
  return { formula: `${score} progress vs 2d10`, terms: [{ kind: "number", sign: 1, value: score }, { kind: "dice", sign: 1, count: 2, sides: 10, rolls: challenge, kept: [true, true], sum: 0 }], total: score, label, result };
}
function rollDice(table, withAction = true) {
  const action = withAction ? table.dice.roll("1d6").total : 0;
  const challenge = table.dice.roll("2d10").terms[0].rolls;
  return { action: { value: action, cancelled: false }, challenge };
}

// The outcome: its text to chat, its clear effects applied, its choices kept for the sheet.
async function resolveOutcome(table, record, data, roll, from) {
  const rules = await rulesIron();
  const move = roll.moveRecord ? table.records.get(roll.moveRecord) : null;
  const outcome = roll.outcome;
  const text = move ? String(move.data?.[outcome] ?? "") : "";
  const { auto, choices } = rules.outcomeEffects(text);
  const applied = await applyEffects(table, record, data, auto, roll, from);
  roll.choices = choices.map((choice) => ({ ...choice, used: false }));
  roll.applied = applied;
  roll.pending = false;
  // Progress moves with a reward or an end.
  const key = String(move?.data?.key ?? "");
  const track = roll.track ? data.tracks?.[roll.track] : null;
  if (outcome !== "miss") {
    if (key === "fulfill_your_vow" && track) {
      const reward = rules.vowReward(data.game, track.rank, outcome);
      if (data.game === "starforged") {
        data.legacy.quests = rules.markLegacy(data.legacy.quests, reward);
        applied.push(`${reward} ticks on the quests legacy track`);
      } else {
        data.exp = num(data.exp) + reward;
        applied.push(`${reward} experience`);
      }
      track.done = "fulfilled";
    }
    if (key === "forge_a_bond" && track && data.game === "starforged") {
      const reward = rules.TICKS[rules.rankOf(track.rank)];
      data.legacy.bonds = rules.markLegacy(data.legacy.bonds, reward);
      track.bonded = true;
      applied.push(`${reward} ticks on the bonds legacy track`);
    }
    if (key === "finish_an_expedition" && track && data.game === "starforged") {
      const reward = rules.vowReward("starforged", track.rank, outcome);
      data.legacy.discoveries = rules.markLegacy(data.legacy.discoveries, reward);
      track.done = "finished";
      applied.push(`${reward} ticks on the discoveries legacy track`);
    }
    if (["reach_your_destination", "locate_your_objective", "finish_the_scene", "end_the_fight", "take_decisive_action"].includes(key) && track) track.done = "done";
    if (["end_the_fight", "take_decisive_action"].includes(key) && roll.target) {
      const entry = foeEntry(table, roll.target);
      if (entry) {
        table.combat.ironState(entry.id, { ...(entry.iron ?? {}), defeated: true });
        applied.push(`${entry.name} is out of the fight`);
      }
    }
  }
  data.lastroll = roll;
  await save(table, record, data);
  const words = [`[${rules.OUTCOME_NAMES[outcome]}${roll.match ? " · MATCH" : ""}] ${move?.name ?? roll.move}: ${text.replace(/\*\*/g, "").replace(/^On an? \w+( hit)?,\s*/i, "") || "(no outcome text)"}`];
  table.say(words[0].slice(0, 500), from);
  if (applied.length) table.say(`${record.name}: ${applied.join(", ")}.`, from);
  if (roll.match) table.say(outcome === "miss" ? "A match on a miss: a dire threat or a twist." : "A match on a hit: an unexpected advantage or opportunity.", from);
  return roll;
}

// Effects on the character (and its target): momentum, meters, progress, harm, initiative or control, a bond.
async function applyEffects(table, record, data, effects, roll, from) {
  const rules = await rulesIron();
  const done = [];
  const next = (what, delta) => {
    const changed = rules.adjust(data, what, delta);
    Object.assign(data, changed);
  };
  if (effects.momentum) {
    next("momentum", effects.momentum);
    done.push(`${rules.signed(effects.momentum)} momentum`);
  }
  for (const meter of rules.METERS) {
    if (!effects[meter]) continue;
    const blockedBy = effects[meter] > 0 ? rules.blocked(data, meter) : "";
    if (blockedBy) {
      done.push(`no ${meter} (${blockedBy})`);
      continue;
    }
    next(meter, effects[meter]);
    done.push(`${rules.signed(effects[meter])} ${meter}`);
  }
  const marks = effects.harm ?? effects.progress ?? 0;
  if (marks) {
    if (roll?.target) {
      const result = await markFoe(table, roll.target, marks, from);
      done.push(`${result.foe}: ${result.boxes}/10`);
    } else if (roll?.track && data.tracks?.[roll.track]) {
      const track = data.tracks[roll.track];
      track.ticks = rules.markProgress(track.ticks, track.rank, marks);
      done.push(`${track.name}: ${rules.boxes(track.ticks)}/10`);
    } else done.push(`${marks > 1 ? `${marks} marks` : "a mark"} of progress to make (choose the track)`);
  }
  if (effects.bond && data.game !== "starforged") {
    data.bonds = { ...(data.bonds ?? {}), ticks: Math.min(40, num(data.bonds?.ticks) + effects.bond) };
    done.push("a tick on the bonds track");
  }
  if (effects.control === true || effects.control === false) {
    data.control = effects.control;
    done.push(effects.control ? (data.game === "starforged" ? "in control" : "has the initiative") : data.game === "starforged" ? "in a bad spot" : "the foe has the initiative");
  }
  return done;
}

// A move made: its option (the stat or meter rolled), adds, a suffer move's
// amount first, a progress move's track (or a foe on the tracker).
async function makeMove(table, record, args = {}, from) {
  const rules = await rulesIron();
  const data = structuredClone(record.data);
  const game = data.game;
  const move = findMove(table, args.move, game);
  const md = move.data ?? {};
  const key = String(md.key ?? "");
  const who = from || record.name;
  const adds = Math.round(num(args.adds, 0));
  const target = args.target ? String(args.target) : "";
  let trackKey = args.track ? String(args.track) : "";
  // Swear an Iron Vow: the vow itself, when given.
  if (key === "swear_an_iron_vow" && args.vow && String(args.vow.name ?? "").trim()) {
    trackKey = newKey(data.tracks ?? {}, "t");
    data.tracks = { ...(data.tracks ?? {}), [trackKey]: { name: String(args.vow.name).slice(0, 200), kind: "vow", rank: rules.rankOf(args.vow.rank ?? "dangerous"), ticks: 0 } };
    table.say(`[VOW] ${record.name} swears upon iron: "${String(args.vow.name).slice(0, 200)}" (${rules.rankOf(args.vow.rank ?? "dangerous")}).`, who);
  }
  // A suffer move's harm, stress or loss first.
  const amount = Math.max(0, Math.round(num(args.amount, 0)));
  if (amount && md.suffer) {
    if (["health", "spirit", "supply"].includes(md.suffer)) {
      const { data: hurt, taken, overflow } = rules.suffer(data, md.suffer, amount);
      Object.assign(data, hurt);
      table.say(`${record.name} suffers -${amount} ${md.suffer}${overflow ? ` (${taken} ${md.suffer}, ${overflow} momentum)` : ""}.`, who);
    } else if (md.suffer === "momentum") {
      Object.assign(data, rules.adjust(data, "momentum", -amount));
      table.say(`${record.name} loses ${amount} momentum.`, who);
    } else if (md.suffer === "asset") {
      const asset = data.assets?.[String(args.asset ?? "")] ?? Object.values(data.assets ?? {}).find((item) => Number.isFinite(Number(item?.max)) && Number(item.max) > 0);
      if (asset) {
        asset.meter = Math.max(0, num(asset.meter) - amount);
        table.say(`${asset.name} suffers -${amount} ${asset.label ?? "health"}.`, who);
      }
    }
  }
  const base = { move: move.name, moveRecord: move.id, key, at: Date.now(), track: trackKey, target, adds };
  if (md.rolltype === "action_roll") {
    const options = rows(md.options).map(([, option]) => option);
    const chosen = options[Math.max(0, Math.min(options.length - 1, Math.round(num(args.option, 0))))] ?? { roll: `stat:${args.stat ?? "iron"}`, method: "player_choice" };
    const choices = String(chosen.roll ?? "").split("|").filter(Boolean);
    const picked = rules.pickOption(data, args.stat ? [`stat:${args.stat}`, ...choices] : choices, args.stat ? "player_choice" : chosen.method, args.stat ? `stat:${args.stat}` : null, String(args.asset ?? ""));
    const dice = rollDice(table);
    const result = rules.actionRoll({ actionDie: dice.action.value, challenge: dice.challenge, stat: picked.value, adds, momentum: data.momentum });
    dice.action.cancelled = result.cancelled;
    const roll = { ...base, kind: "action", stat: picked.option, statLabel: picked.label, statValue: picked.value, die: result.die, cancelled: result.cancelled, score: result.score, challenge: result.challenge, outcome: result.outcome, match: result.match, momentum: data.momentum, burnable: Boolean(md.burn) && result.burnable, burnOutcome: result.burnOutcome };
    const label = `[MOVE] ${record.name}: ${move.name} (+${picked.label} ${picked.value}${adds ? `, ${rules.signed(adds)}` : ""})${result.cancelled ? " [action die cancelled by momentum]" : ""}${result.capped ? " [at most 10]" : ""}`;
    table.postRoll(card(dice, { label, score: result.score, result: rules.OUTCOME_NAMES[result.outcome], mod: picked.value + adds }), label, who, false, { by: record.name, result: `${rules.OUTCOME_NAMES[result.outcome]}${result.match ? " MATCH" : ""}` });
    if (roll.burnable) {
      // The player decides first: burn momentum, or keep the roll.
      roll.pending = true;
      data.lastroll = roll;
      await save(table, record, data);
      table.say(`${record.name} could burn momentum (${data.momentum}) for a ${rules.OUTCOME_NAMES[result.burnOutcome]}: Burn or Keep on the sheet.`, who);
      return roll;
    }
    return resolveOutcome(table, record, data, roll, who);
  }
  if (md.rolltype === "progress_roll" || md.rolltype === "special_track") {
    let ticks = 0;
    let score = null;
    let name = "";
    if (target) {
      const entry = foeEntry(table, target);
      if (!entry) throw new Error("No such foe on the tracker.");
      ticks = num(entry.iron?.ticks);
      name = entry.name;
    } else if (trackKey && data.tracks?.[trackKey]) {
      ticks = data.tracks[trackKey].ticks;
      name = data.tracks[trackKey].name;
    } else if (trackKey === "bonds" || key === "write_your_epilogue") {
      ticks = num(data.bonds?.ticks);
      name = "Bonds";
    } else if (trackKey === "failure" || key === "learn_from_your_failures") {
      ticks = num(data.failure?.ticks);
      name = "Failure";
    } else if (rules.LEGACY.includes(trackKey.replace(/^legacy:/, ""))) {
      const legacy = data.legacy?.[trackKey.replace(/^legacy:/, "")];
      ticks = num(legacy?.ticks);
      if (num(legacy?.cleared) > 0) score = 10;
      name = `${trackKey.replace(/^legacy:/, "")} legacy`;
    } else throw new Error(`${move.name} rolls against a progress track: which one?`);
    const dice = rollDice(table, false);
    let result = rules.progressRoll({ ticks, challenge: dice.challenge, score });
    // Starforged: deciding a fight from a bad spot.
    if (key === "take_decisive_action" && !data.control) result = rules.inBadSpot(result);
    const roll = { ...base, kind: "progress", score: result.score, challenge: result.challenge, outcome: result.outcome, match: result.match, trackName: name, burnable: false, downgraded: Boolean(result.downgraded) };
    const label = `[PROGRESS] ${record.name}: ${move.name} (${name}: ${result.score} progress)${result.downgraded ? " [in a bad spot]" : ""}`;
    table.postRoll(progressCard(dice.challenge, { label, score: result.score, result: rules.OUTCOME_NAMES[result.outcome] }), label, who, false, { by: record.name, result: `${rules.OUTCOME_NAMES[result.outcome]}${result.match ? " MATCH" : ""}` });
    return resolveOutcome(table, record, data, roll, who);
  }
  // No roll: its text, and what it plainly does (Reach a Milestone marks progress; an oracle move rolls its table).
  table.say(`[MOVE] ${record.name}: ${move.name}. ${String(md.trigger ?? "")}`.slice(0, 500), who);
  const out = { ...base, kind: "none" };
  if (key === "reach_a_milestone") {
    const track = data.tracks?.[trackKey];
    if (!track) throw new Error("Reach a Milestone marks progress on a vow: which one?");
    track.ticks = rules.markProgress(track.ticks, track.rank, 1);
    table.say(`[PROGRESS] ${track.name} (${track.rank}): ${rules.boxes(track.ticks)}/10.`, who);
  }
  if (key === "forsake_your_vow" && data.tracks?.[trackKey]) data.tracks[trackKey].done = "forsaken";
  if (key === "mark_your_failure") data.failure = { ticks: Math.min(40, num(data.failure?.ticks) + 4) };
  const oracles = String(md.oracles ?? "").split(",").filter(Boolean);
  if (oracles.length) {
    const which = args.oracle ? oracles.find((id) => id.endsWith(`.${args.oracle}`) || id === args.oracle) ?? oracles[0] : oracles[0];
    out.oracle = await rollOracle(table, which, who);
  }
  data.lastroll = { ...out, pending: false, choices: [], applied: [] };
  await save(table, record, data);
  return out;
}

// After a roll that could burn: burn (momentum becomes the score, then resets) or keep.
async function resolveRoll(table, record, burn, from) {
  const rules = await rulesIron();
  const data = structuredClone(record.data);
  const roll = data.lastroll;
  if (!roll?.pending) throw new Error("No roll waiting.");
  if (burn) {
    roll.burned = { from: roll.outcome, momentum: data.momentum };
    roll.outcome = roll.burnOutcome;
    roll.score = data.momentum;
    data.momentum = rules.momentumReset(data);
    table.say(`[BURN] ${record.name} burns ${roll.burned.momentum} momentum: ${rules.OUTCOME_NAMES[roll.burned.from]} becomes a ${rules.OUTCOME_NAMES[roll.outcome]}; momentum resets to ${data.momentum}.`, from || record.name);
  }
  return resolveOutcome(table, record, data, roll, from || record.name);
}
// One of the outcome's choices (each once).
async function choose(table, record, index, args, from) {
  const data = structuredClone(record.data);
  const roll = data.lastroll;
  const choice = roll?.choices?.[Math.round(num(index, -1))];
  if (!choice) throw new Error("No such choice.");
  if (choice.used) throw new Error("Already chosen.");
  choice.used = true;
  const done = await applyEffects(table, record, data, choice.effects ?? {}, { ...roll, track: args.track ? String(args.track) : roll.track, target: args.target ? String(args.target) : roll.target }, from);
  table.say(`${record.name} chooses: ${choice.label}${done.length ? ` (${done.join(", ")})` : ""}.`, from || record.name);
  await save(table, record, data);
  return { choice: choice.label, applied: done };
}

// An oracle rolled (with the tables a row sends you to, three deep at most).
async function rollOracle(table, which, from = "GM", depth = 0) {
  const rules = await rulesIron();
  const oracle = findOracle(table, which);
  const rolled = table.dice.roll(rules.oracleDice(oracle.data));
  const row = rules.oracleRow(oracle.data, rolled.total);
  const result = row ? rules.rowText(row) : "(no row)";
  const where = oracle.data?.fgCategory ? `${oracle.data.fgCategory}: ` : "";
  table.postRoll(rolled, `[ORACLE] ${where}${oracle.name} = ${rolled.total}: ${result}`.slice(0, 160), from, false, { result: result.slice(0, 120) });
  if (result.length > 100) table.say(`[ORACLE] ${oracle.name}: ${result}`, from);
  const also = [];
  if (row?.rolls && depth < 3) {
    for (const part of String(row.rolls).split(",")) {
      const [id, times] = part.split("*");
      for (let n = 0; n < Math.min(3, num(times, 1)); n += 1) {
        // "Roll twice": this table again, a roll that sends you back counts for nothing.
        const next = id === "self" ? oracle.id : id;
        try {
          also.push(await rollOracle(table, next, from, depth + 1));
        } catch {
          /* a table not in this campaign */
        }
      }
    }
  }
  return { oracle: oracle.name, category: oracle.data?.fgCategory ?? "", roll: rolled.total, result, also };
}

// Delve: a site's features (theme 1-20, domain 21-100) or dangers (theme 1-30, domain 31-45, Reveal a Danger's own 46-100).
async function siteRoll(table, { theme, domain, what = "feature" }, from = "GM") {
  const rules = await rulesIron();
  const sites = table.records.list({ type: "irondelve" });
  const pick = (name, kind) => sites.find((record) => record.data?.kind === kind && (record.id === name || record.name.toLowerCase() === String(name ?? "").toLowerCase()));
  const themeRecord = pick(theme, "theme");
  const domainRecord = pick(domain, "domain");
  if (!themeRecord || !domainRecord) throw new Error(sites.length ? "Which theme and domain?" : "No Delve themes in this campaign: make Ironsworn Foes and Sites active (Modules).");
  const rolled = table.dice.roll("1d100");
  const value = rolled.total;
  const list = what === "danger" ? "dangers" : "features";
  let row = rules.oracleRow({ tablerows: themeRecord.data[list] }, value) ?? rules.oracleRow({ tablerows: domainRecord.data[list] }, value);
  let source = row ? (rules.oracleRow({ tablerows: themeRecord.data[list] }, value) ? themeRecord.name : domainRecord.name) : "";
  if (!row && what === "danger") {
    const general = table.records.list({ type: "ironoracle" }).find((record) => /reveal_a_danger\.reveal_a_danger$/.test(String(record.data?.oracleid ?? "")));
    row = general ? rules.oracleRow(general.data, value) : null;
    source = "Reveal a Danger";
  }
  const result = row ? rules.rowText(row) : "(no row)";
  table.postRoll(rolled, `[DELVE] ${themeRecord.name} ${domainRecord.name} ${what === "danger" ? "danger" : "feature"} = ${value}: ${result}`.slice(0, 160), from, false, { result: result.slice(0, 120) });
  return { what, roll: value, result, from: source };
}

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["look", "background", "notes", "pronouns", "callsign", "epilogue"]);
async function editIronsworn(table, record, changes, seat) {
  mine(record, seat);
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesIron();
  const data = structuredClone(record.data);
  let name = record.name;
  const set = (keys, value) => {
    let node = data;
    for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
    node[keys.at(-1)] = value;
  };
  const number = (key, value) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || Math.abs(n) > 1000) throw new Error(`${key} needs a number.`);
    return n;
  };
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    const parts = key.split(".");
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "bonds.list") data.bonds = { ...(data.bonds ?? {}), list: String(value ?? "").slice(0, 4000) };
    else if (/^stats\.(edge|heart|iron|shadow|wits)$/.test(key) || /^meters\.(health|spirit|supply)$/.test(key) || key === "momentum" || key === "expspent" || key === "bonds.ticks" || key === "failure.ticks" || /^legacy\.(quests|bonds|discoveries)\.(ticks|cleared)$/.test(key)) set(parts, number(key, value));
    else if (key === "exp") {
      if (seat.role !== "dm") throw new Error("Experience is earned (or the GM's to give).");
      set(parts, number(key, value));
    } else if (key === "control") data.control = Boolean(value);
    else if (/^(debilities|impacts)\.[a-z_]+$/.test(key)) set(parts, Boolean(value));
    else if (/^tracks\.t\d+$/.test(key) && value === null) delete data.tracks?.[parts[1]];
    else if (/^tracks\.t\d+\.(name|role|notes)$/.test(key)) set(parts, String(value ?? "").slice(0, 200));
    else if (/^tracks\.t\d+\.rank$/.test(key)) set(parts, rules.rankOf(value));
    else if (/^tracks\.t\d+\.ticks$/.test(key)) set(parts, number(key, value));
    else if (/^tracks\.t\d+\.done$/.test(key)) set(parts, value ? String(value).slice(0, 20) : "");
    else if (/^assets\.a\d+$/.test(key) && value === null) delete data.assets?.[parts[1]];
    else if (/^assets\.a\d+\.meter$/.test(key)) set(parts, number(key, value));
    else if (/^assets\.a\d+\.fields\.name$/.test(key)) set(parts, String(value ?? "").slice(0, 80));
    else if (/^assets\.a\d+\.marks\.[a-z_]+$/.test(key)) set(parts, Boolean(value));
    else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[parts[1]];
    else if (/^inventorylist\.id-\d+\.name$/.test(key)) set(parts, String(value ?? "").slice(0, 120));
    else if (/^inventorylist\.id-\d+\.(count|carried)$/.test(key)) set(parts, number(key, value));
    else if (key === "inventory.add") {
      const text = String(value ?? "").trim().slice(0, 120);
      if (!text) throw new Error("What do they carry?");
      const list = (data.inventorylist = data.inventorylist ?? {});
      let n = Object.keys(list).length + 1;
      while (list[`id-${String(n).padStart(5, "0")}`]) n += 1;
      list[`id-${String(n).padStart(5, "0")}`] = { name: text, count: 1, carried: 1 };
    } else throw new Error(`The sheet cannot change ${key}.`);
  }
  const updated = table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
  if (updated.data.meters.supply !== num(record.data?.meters?.supply, -1)) shareSupply(table, updated, updated.data.meters.supply);
  return updated;
}

// A stat rolled on its own (the sheet's stat, a check): an action roll with no move.
async function statRoll(table, record, { attribute = "", bonus = 0, label } = {}, from) {
  const rules = await rulesIron();
  const stat = String(attribute ?? "").toLowerCase();
  const value = rules.STATS.includes(stat) ? num(record.data?.stats?.[stat]) : rules.METERS.includes(stat) ? num(record.data?.meters?.[stat]) : null;
  if (value === null) throw new Error("Roll which stat: edge, heart, iron, shadow or wits?");
  const dice = rollDice(table);
  const result = rules.actionRoll({ actionDie: dice.action.value, challenge: dice.challenge, stat: value, adds: num(bonus), momentum: record.data?.momentum });
  dice.action.cancelled = result.cancelled;
  const words = `${label ? `${label} ` : ""}[ROLL] +${stat} ${value}${num(bonus) ? ` ${rules.signed(num(bonus))}` : ""}`;
  table.postRoll(card(dice, { label: words, score: result.score, result: rules.OUTCOME_NAMES[result.outcome], mod: value + num(bonus) }), words, from || record.name, false, { by: record.name, result: `${rules.OUTCOME_NAMES[result.outcome]}${result.match ? " MATCH" : ""}` });
  return { ...result, success: result.outcome !== "miss" };
}

// Every other thing the sheet does.
async function actionIronsworn(table, record, action, args = {}, seat, from) {
  mine(record, seat);
  const rules = await rulesIron();
  const who = from || record.name;
  const data = structuredClone(record.data);
  const track = () => {
    const found = data.tracks?.[String(args.track ?? "")];
    if (!found) throw new Error("No such progress track.");
    return found;
  };
  switch (action) {
    case "move":
      return makeMove(table, record, args, who);
    case "resolve":
      return resolveRoll(table, record, Boolean(args.burn), who);
    case "choose":
      return choose(table, record, args.index, args, who);
    case "adjust": {
      const what = String(args.what ?? "");
      if (what !== "momentum" && !rules.METERS.includes(what)) throw new Error("Adjust momentum, health, spirit or supply.");
      const delta = Math.round(num(args.delta, 0));
      Object.assign(data, rules.adjust(data, what, delta));
      table.say(`${record.name}: ${rules.signed(delta)} ${what} (now ${what === "momentum" ? data.momentum : data.meters[what]}).`, who);
      return { record: await save(table, record, data) };
    }
    case "burn-reset": {
      // Momentum burned outside a move (the sheet): back to the reset.
      data.momentum = rules.momentumReset(data);
      return { record: await save(table, record, data) };
    }
    case "control":
      data.control = Boolean(args.on);
      return { record: await save(table, record, data) };
    case "debility": {
      const field = data.game === "starforged" ? "impacts" : "debilities";
      const keyName = String(args.key ?? "");
      if (!rules.DEBILITIES[data.game].some((item) => item.key === keyName)) throw new Error(`No ${field.replace(/s$/, "")} ${keyName}.`);
      data[field] = { ...(data[field] ?? {}), [keyName]: Boolean(args.on) };
      table.say(`${record.name}: ${keyName.replace(/_/g, " ")} ${args.on ? "marked" : "cleared"}.`, who);
      return { record: await save(table, record, data) };
    }
    case "track-add": {
      const key = newKey(data.tracks ?? {}, "t");
      const kind = String(args.kind ?? "vow");
      data.tracks = { ...(data.tracks ?? {}), [key]: { name: String(args.name ?? "").trim().slice(0, 200) || "A vow", kind, rank: rules.rankOf(args.rank ?? "dangerous"), ticks: 0, ...(args.role ? { role: String(args.role).slice(0, 80) } : {}), ...(args.theme ? { theme: String(args.theme), domain: String(args.domain ?? "") } : {}) } };
      table.say(`[${kind.toUpperCase()}] ${record.name}: ${data.tracks[key].name} (${data.tracks[key].rank}).`, who);
      return { record: await save(table, record, data), track: key };
    }
    case "track-mark": {
      const found = track();
      const times = Math.round(num(args.times, 1));
      found.ticks = times < 0 ? Math.max(0, found.ticks + times * rules.TICKS[found.rank]) : rules.markProgress(found.ticks, found.rank, times);
      if (args.ticks) found.ticks = Math.min(40, Math.max(0, found.ticks + Math.round(num(args.ticks))));
      table.say(`[PROGRESS] ${found.name} (${found.rank}): ${rules.boxes(found.ticks)}/10 boxes (${found.ticks} ticks).`, who);
      return { record: await save(table, record, data), ticks: found.ticks };
    }
    case "track-remove":
      track();
      delete data.tracks[String(args.track)];
      return { record: await save(table, record, data) };
    case "legacy-mark": {
      const which = String(args.track ?? "").replace(/^legacy:/, "");
      if (data.game !== "starforged" || !rules.LEGACY.includes(which)) throw new Error("Mark which legacy track: quests, bonds or discoveries?");
      data.legacy[which] = rules.markLegacy(data.legacy[which], Math.round(num(args.ticks, 4)));
      return { record: await save(table, record, data), legacy: data.legacy[which] };
    }
    case "bond": {
      // Classic: a new bond, a tick on the bonds track.
      if (data.game === "starforged") throw new Error("Starforged's bonds are connections: add a connection track.");
      const text = String(args.name ?? "").trim().slice(0, 120);
      data.bonds = { ...(data.bonds ?? {}), ticks: Math.min(40, num(data.bonds?.ticks) + 1), list: [String(data.bonds?.list ?? "").trim(), text].filter(Boolean).join("\n") };
      table.say(`[BOND] ${record.name}${text ? ` and ${text}` : ""}: a tick on the bonds track (${num(data.bonds.ticks)}).`, who);
      return { record: await save(table, record, data) };
    }
    case "failure": {
      data.failure = { ticks: Math.min(40, Math.max(0, num(data.failure?.ticks) + Math.round(num(args.ticks, 1)))) };
      return { record: await save(table, record, data) };
    }
    case "asset-add":
    case "advance": {
      // A new asset (3 experience; free when the GM gives it), or an asset's next ability (2).
      const free = Boolean(args.free) && seat.role === "dm";
      if (args.upgrade) {
        const asset = data.assets?.[String(args.upgrade)];
        if (!asset) throw new Error("No such asset.");
        const index = args.ability !== undefined ? Math.round(num(args.ability)) : asset.abilities.findIndex((on) => !on);
        if (index < 0 || index >= asset.abilities.length || asset.abilities[index]) throw new Error("That ability is already marked.");
        const xp = rules.experience(data);
        if (!free && xp.available < rules.UPGRADE_COST) throw new Error(`An upgrade costs ${rules.UPGRADE_COST} experience; ${record.name} has ${xp.available}.`);
        asset.abilities[index] = true;
        if (!free) data.expspent = num(data.expspent) + rules.UPGRADE_COST;
        table.say(`[ADVANCE] ${record.name}: ${asset.name}, ability ${index + 1}${free ? "" : ` (${rules.UPGRADE_COST} experience)`}.`, who);
        return { record: await save(table, record, data) };
      }
      const source = table.records.list({ type: "ironasset" }).find((item) => item.id === args.asset || item.name.toLowerCase() === String(args.asset ?? "").toLowerCase() || item.data?.assetid === args.asset);
      if (!source) throw new Error("Which asset?");
      const xp = rules.experience(data);
      const cost = action === "advance" && !free ? rules.ASSET_COST : 0;
      if (cost && xp.available < cost) throw new Error(`A new asset costs ${cost} experience; ${record.name} has ${xp.available}.`);
      if (action === "asset-add" && seat.role !== "dm" && !args.free) throw new Error("A new asset is bought with experience (Advance).");
      const key = newKey(data.assets ?? {}, "a");
      data.assets = { ...(data.assets ?? {}), [key]: rules.assetFrom(source) };
      if (cost) data.expspent = num(data.expspent) + cost;
      table.say(`[ADVANCE] ${record.name} gains ${source.name}${cost ? ` (${cost} experience)` : ""}.`, who);
      return { record: await save(table, record, data), asset: key };
    }
    case "asset-meter": {
      const asset = data.assets?.[String(args.asset ?? "")];
      if (!asset || !asset.max) throw new Error("That asset has no meter.");
      asset.meter = Math.max(0, Math.min(asset.max, num(asset.meter) + Math.round(num(args.delta, 0))));
      return { record: await save(table, record, data) };
    }
    case "site-add": {
      const key = newKey(data.tracks ?? {}, "t");
      data.tracks = { ...(data.tracks ?? {}), [key]: { name: String(args.name ?? "").trim().slice(0, 200) || `The ${args.theme ?? ""} ${args.domain ?? ""}`.trim(), kind: "site", rank: rules.rankOf(args.rank ?? "dangerous"), ticks: 0, theme: String(args.theme ?? ""), domain: String(args.domain ?? "") } };
      table.say(`[DELVE] ${record.name} discovers a site: ${data.tracks[key].name} (${data.tracks[key].rank}, ${args.theme} ${args.domain}).`, who);
      return { record: await save(table, record, data), track: key };
    }
    default:
      throw new Error(`What should ${record.name} do? (${action})`);
  }
}

// What needs no character: the oracles, Delve's sites, and the GM's foes on the tracker.
async function tableIronsworn(table, action, args = {}, seat, from) {
  const rules = await rulesIron();
  switch (action) {
    case "oracle":
      return rollOracle(table, args.oracle, from);
    case "site":
      return siteRoll(table, args, from);
    case "foe-mark": {
      if (seat.role !== "dm") throw new Error("The GM marks progress on a foe (or make a move against it).");
      return markFoe(table, String(args.target ?? ""), Math.round(num(args.times, 1)), from);
    }
    case "foe-rank": {
      if (seat.role !== "dm") throw new Error("The GM sets a foe's rank.");
      const entry = foeEntry(table, String(args.target ?? ""));
      if (!entry) throw new Error("No such foe on the tracker.");
      table.combat.ironState(entry.id, { ...(entry.iron ?? { ticks: 0 }), rank: rules.rankOf(args.rank) });
      return { foe: entry.name, rank: rules.rankOf(args.rank) };
    }
    case "foe-clear": {
      if (seat.role !== "dm") throw new Error("The GM clears a foe's track.");
      const entry = foeEntry(table, String(args.target ?? ""));
      if (!entry) throw new Error("No such foe on the tracker.");
      table.combat.ironState(entry.id, { ...(entry.iron ?? {}), ticks: 0, defeated: false });
      return { foe: entry.name };
    }
    case "inflict": {
      // A foe's harm on a character (its rank: troublesome 1 ... epic 5): health down, the rest off momentum.
      if (seat.role !== "dm") throw new Error("The GM inflicts a foe's harm.");
      const entry = foeEntry(table, String(args.target ?? ""));
      const record = table.records.get(String(args.id ?? ""));
      if (!entry || !record || !isIronsworn(record)) throw new Error("Which foe, at which character?");
      const harm = Math.max(1, Math.round(num(args.amount, rules.rankIndex(entry.iron?.rank ?? "dangerous"))));
      const { data, taken, overflow } = rules.suffer(record.data, "health", harm);
      await save(table, record, data);
      table.say(`[HARM] ${entry.name} inflicts ${harm} harm on ${record.name} (${taken} health${overflow ? `, ${overflow} momentum` : ""}): ${record.name} makes Endure Harm.`, from, Boolean(entry.hidden));
      return { harm, taken, overflow, health: data.meters.health };
    }
    default:
      throw new Error(`Unknown action ${action}.`);
  }
}
const TABLE_ACTIONS = new Set(["oracle", "site", "foe-mark", "foe-rank", "foe-clear", "inflict"]);

module.exports = { rulesIron, isIronsworn, isIronswornRuleset, gameOfRuleset, buildIronsworn, editIronsworn, statRoll, actionIronsworn, tableIronsworn, TABLE_ACTIONS, rollOracle, siteRoll, RULESETS };
