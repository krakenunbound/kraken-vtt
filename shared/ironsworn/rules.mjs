// Ironsworn and Ironsworn: Starforged (Shawn Tomkin's games, CC BY 4.0), one
// engine for both: plain functions (no Node, no DOM) used by the host
// (electron/ironsworn.cjs), the sheet and the tests. Kraken's own code: the
// rules text it applies is the CC BY moves (games/ironsworn/data, from
// Datasworn), read by the books.
//
// The action roll: an action die (d6) + a stat + adds, at most 10, against
// two challenge dice (d10). Beat both: a strong hit; one: a weak hit;
// neither: a miss (a tie goes to the challenge die). Both challenge dice the
// same: a match. Negative momentum cancels an action die that shows its
// value. Momentum (-6..+10, its maximum one less for each debility or
// impact) may be burned when it beats more challenge dice than the action
// score: it becomes the score, and momentum resets (+2, +1 with one
// debility or impact, 0 with more).
//
// A progress track: ten boxes of four ticks. Marking progress adds by rank
// (troublesome 12 ticks, dangerous 8, formidable 4, extreme 2, epic 1). A
// progress roll: the filled boxes against the challenge dice, momentum
// ignored.
//
// A character's record data:
//   ruleset "ironsworn", game "classic" | "starforged", stats {edge, heart,
//   iron, shadow, wits}, meters {health, spirit, supply}, momentum,
//   debilities {key: true} (classic) / impacts (Starforged), exp (classic:
//   earned; Starforged: worked out from the legacy tracks), expspent,
//   tracks {id: {name, kind (vow, journey, fight, site, expedition, scene,
//   connection, bond), rank, ticks, done, role}}, bonds {ticks} (classic),
//   legacy {quests, bonds, discoveries: {ticks, cleared}} (Starforged),
//   failure {ticks} (Delve), assets {key: {assetid, name, category,
//   abilities [true, false, false], meter, max, label, fields {name}, marks
//   {battered}}}, control (initiative / in control), inventorylist (what
//   they carry: Ironsworn has no money), lastroll (the last move, until it
//   is resolved), hp {total 5, wounds} (the tracker's mirror of health).

export const RULESET = "ironsworn";
export const GAMES = {
  classic: { name: "Ironsworn", control: "initiative", noControl: "your foe has initiative" },
  starforged: { name: "Starforged", control: "in control", noControl: "in a bad spot" },
};
// The Kraken ruleset ("Ironsworn", "Starforged") to the game.
export const gameOf = (ruleset) => (/starforged/i.test(String(ruleset ?? "")) ? "starforged" : "classic");
export const isIronswornRuleset = (ruleset) => ["ironsworn", "starforged"].includes(String(ruleset ?? "").trim().toLowerCase());
export const STATS = ["edge", "heart", "iron", "shadow", "wits"];
export const STAT_NAMES = { edge: "Edge", heart: "Heart", iron: "Iron", shadow: "Shadow", wits: "Wits" };
// Assigned at creation, one each.
export const SPREAD = [3, 2, 2, 1, 1];
export const METERS = ["health", "spirit", "supply"];
export const METER_MAX = 5;
export const MOMENTUM_MIN = -6;
export const MOMENTUM_MAX = 10;
export const MOMENTUM_START = 2;
export const RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];
export const RANK_NAMES = { troublesome: "Troublesome", dangerous: "Dangerous", formidable: "Formidable", extreme: "Extreme", epic: "Epic" };
// Ticks a mark of progress adds, by rank (4 ticks a box).
export const TICKS = { troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1 };
export const MAX_TICKS = 40;
// Experience: a new asset 3, an asset's next ability 2.
export const ASSET_COST = 3;
export const UPGRADE_COST = 2;
// Classic: Fulfill Your Vow's experience by rank (a weak hit, one less).
export const VOW_XP = { troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5 };
// Ironsworn's debilities and Starforged's impacts: each lowers the momentum
// maximum and the reset. What each stops recovering (Wounded: health...).
export const DEBILITIES = {
  classic: [
    { key: "wounded", name: "Wounded", group: "Conditions", blocks: "health" },
    { key: "shaken", name: "Shaken", group: "Conditions", blocks: "spirit" },
    { key: "unprepared", name: "Unprepared", group: "Conditions", blocks: "supply" },
    { key: "encumbered", name: "Encumbered", group: "Conditions" },
    { key: "maimed", name: "Maimed", group: "Banes" },
    { key: "corrupted", name: "Corrupted", group: "Banes" },
    { key: "cursed", name: "Cursed", group: "Burdens" },
    { key: "tormented", name: "Tormented", group: "Burdens" },
  ],
  starforged: [
    { key: "wounded", name: "Wounded", group: "Misfortunes", blocks: "health" },
    { key: "shaken", name: "Shaken", group: "Misfortunes", blocks: "spirit" },
    { key: "unprepared", name: "Unprepared", group: "Misfortunes", blocks: "supply" },
    { key: "permanently_harmed", name: "Permanently Harmed", group: "Lasting Effects" },
    { key: "traumatized", name: "Traumatized", group: "Lasting Effects" },
    { key: "doomed", name: "Doomed", group: "Burdens" },
    { key: "tormented", name: "Tormented", group: "Burdens" },
    { key: "indebted", name: "Indebted", group: "Burdens" },
    { key: "battered", name: "Battered", group: "Vehicle Troubles" },
    { key: "cursed", name: "Cursed", group: "Vehicle Troubles" },
  ],
};
// The progress tracks a character keeps, by game.
export const TRACK_KINDS = {
  classic: [
    ["vow", "Vow"],
    ["journey", "Journey"],
    ["fight", "Fight"],
    ["site", "Delve site"],
  ],
  starforged: [
    ["vow", "Vow"],
    ["expedition", "Expedition"],
    ["fight", "Fight"],
    ["scene", "Scene challenge"],
    ["connection", "Connection"],
  ],
};
export const LEGACY = ["quests", "bonds", "discoveries"];

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const rankOf = (value) => {
  const word = String(value ?? "").toLowerCase().trim();
  if (RANKS.includes(word)) return word;
  const index = Math.round(num(value, 0));
  return RANKS[clamp(index, 1, 5) - 1] ?? "dangerous";
};
export const rankIndex = (rank) => RANKS.indexOf(rankOf(rank)) + 1;

// --- Progress --------------------------------------------------------------------
export const boxes = (ticks) => clamp(Math.floor(num(ticks, 0) / 4), 0, 10);
export function markProgress(ticks, rank, times = 1) {
  return clamp(num(ticks, 0) + TICKS[rankOf(rank)] * Math.max(0, Math.round(num(times, 1))), 0, MAX_TICKS);
}
// A recommitted vow (or a journey gone astray): the boxes cleared, its rank one higher.
export function clearBoxes(ticks, count) {
  return clamp(num(ticks, 0) - Math.max(0, Math.round(num(count, 0))) * 4, 0, MAX_TICKS);
}
export const raiseRank = (rank) => RANKS[Math.min(4, RANKS.indexOf(rankOf(rank)) + 1)];
export const lowerRank = (rank) => (RANKS.indexOf(rankOf(rank)) > 0 ? RANKS[RANKS.indexOf(rankOf(rank)) - 1] : null);

// --- Momentum ---------------------------------------------------------------------
export function marked(data) {
  const list = DEBILITIES[data?.game === "starforged" ? "starforged" : "classic"];
  const on = data?.game === "starforged" ? data?.impacts : data?.debilities;
  let count = list.filter((item) => on?.[item.key]).length;
  // An asset that counts as an impact when marked (Starforged's vehicles: battered, cursed).
  if (data?.game === "starforged") for (const asset of Object.values(data?.assets ?? {})) count += Object.values(asset?.marks ?? {}).filter(Boolean).length;
  return count;
}
export const momentumMax = (data) => Math.max(0, MOMENTUM_MAX - marked(data));
export function momentumReset(data) {
  const count = marked(data);
  return count === 0 ? 2 : count === 1 ? 1 : 0;
}
// What a debility or impact stops recovering.
export function blocked(data, meter) {
  const list = DEBILITIES[data?.game === "starforged" ? "starforged" : "classic"];
  const on = data?.game === "starforged" ? data?.impacts : data?.debilities;
  return list.find((item) => item.blocks === meter && on?.[item.key])?.name ?? "";
}

// --- The rolls ---------------------------------------------------------------------
// How many challenge dice a score beats (a tie goes to the die).
export function outcomeOf(score, challenge) {
  const [a, b] = challenge;
  const beats = (score > a ? 1 : 0) + (score > b ? 1 : 0);
  return beats === 2 ? "strong" : beats === 1 ? "weak" : "miss";
}
export const OUTCOME_NAMES = { strong: "STRONG HIT", weak: "WEAK HIT", miss: "MISS" };
const better = (a, b) => ["miss", "weak", "strong"].indexOf(a) > ["miss", "weak", "strong"].indexOf(b);
// The action roll: actionDie 1-6, challenge [d10, d10], stat and adds; momentum
// now (negative momentum cancels a die of its value; positive may be burned).
export function actionRoll({ actionDie, challenge, stat = 0, adds = 0, momentum = 0 }) {
  const die = Math.round(num(actionDie, 1));
  const cancelled = num(momentum, 0) < 0 && die === -num(momentum, 0);
  const raw = (cancelled ? 0 : die) + num(stat, 0) + num(adds, 0);
  const score = Math.min(10, raw);
  const outcome = outcomeOf(score, challenge);
  const match = challenge[0] === challenge[1];
  const burnOutcome = num(momentum, 0) > 0 ? outcomeOf(num(momentum, 0), challenge) : outcome;
  return { die, cancelled, raw, score, capped: raw > 10, challenge: [...challenge], outcome, match, burnable: better(burnOutcome, outcome), burnOutcome };
}
// A progress roll: the filled boxes (or 10, a cleared legacy track) against the challenge dice.
export function progressRoll({ ticks, challenge, score = null }) {
  const value = score === null ? boxes(ticks) : clamp(Math.round(num(score, 0)), 0, 10);
  return { score: value, challenge: [...challenge], outcome: outcomeOf(value, challenge), match: challenge[0] === challenge[1] };
}
// Starforged's Take Decisive Action in a bad spot: a strong hit without a match is a weak hit, a weak hit a miss.
export function inBadSpot(result) {
  if (result.outcome === "strong" && !result.match) return { ...result, outcome: "weak", downgraded: true };
  if (result.outcome === "weak") return { ...result, outcome: "miss", downgraded: true };
  return result;
}
// The stat or meter a move's option rolls ("stat:iron", "condition_meter:health", "asset_control:health").
export function rollValue(data, option, assetKey = "") {
  const [using, name] = String(option ?? "").split(":");
  if (using === "stat") return { label: STAT_NAMES[name] ?? name, value: num(data?.stats?.[name], 0) };
  if (using === "condition_meter") return { label: name, value: num(data?.meters?.[name], 0) };
  if (using === "asset_control") {
    const asset = assetKey ? data?.assets?.[assetKey] : Object.values(data?.assets ?? {}).find((item) => Number.isFinite(Number(item?.meter)) && (!name || String(item?.label ?? "").toLowerCase() === name));
    return { label: `${asset?.name ?? "asset"} ${asset?.label ?? name ?? ""}`.trim(), value: num(asset?.meter, 0) };
  }
  return { label: name || using || "?", value: 0 };
}
// A choice of several ("highest": iron or health, whichever is higher).
export function pickOption(data, options, method = "player_choice", chosen = null, assetKey = "") {
  const values = options.map((option) => ({ option, ...rollValue(data, option, assetKey) }));
  if (values.length === 0) return { option: "", label: "", value: 0 };
  if (method === "highest") return values.reduce((top, item) => (item.value > top.value ? item : top), values[0]);
  if (method === "lowest") return values.reduce((low, item) => (item.value < low.value ? item : low), values[0]);
  return values.find((item) => item.option === chosen) ?? values[0];
}

// --- Suffering -------------------------------------------------------------------
// Harm, stress or a loss of supply: the meter goes down; past 0, the rest comes off momentum.
export function suffer(data, meter, amount) {
  const out = structuredClone(data);
  const loss = Math.max(0, Math.round(num(amount, 0)));
  out.meters = { ...(out.meters ?? {}) };
  const now = num(out.meters[meter], 0);
  const taken = Math.min(now, loss);
  out.meters[meter] = now - taken;
  const overflow = loss - taken;
  if (overflow > 0) out.momentum = clamp(num(out.momentum, 0) - overflow, MOMENTUM_MIN, momentumMax(out));
  return { data: out, taken, overflow };
}
// A meter up or down within 0..5; momentum within -6..its maximum.
export function adjust(data, what, delta) {
  const out = structuredClone(data);
  if (what === "momentum") out.momentum = clamp(num(out.momentum, 0) + delta, MOMENTUM_MIN, momentumMax(out));
  else if (METERS.includes(what)) {
    out.meters = { ...(out.meters ?? {}) };
    out.meters[what] = clamp(num(out.meters[what], 0) + delta, 0, METER_MAX);
  }
  return out;
}

// --- Experience ------------------------------------------------------------------
// A legacy track's experience (Starforged): 2 a box, 1 a box once it has been cleared.
export function legacyXp(track) {
  const cleared = Math.max(0, Math.round(num(track?.cleared, 0)));
  const filled = boxes(track?.ticks);
  if (cleared === 0) return filled * 2;
  return 20 + (cleared - 1) * 10 + filled;
}
// A reward on a legacy track (ticks); a full track is cleared and marking goes on.
export function markLegacy(track, ticks) {
  let next = num(track?.ticks, 0) + Math.max(0, Math.round(num(ticks, 0)));
  let cleared = Math.max(0, Math.round(num(track?.cleared, 0)));
  while (next >= MAX_TICKS) {
    // The tenth box filled: the track clears, and marking goes on.
    cleared += 1;
    next -= MAX_TICKS;
  }
  return { ticks: next, cleared };
}
export function experience(data) {
  // (expbonus: experience the GM gave a Starforged character outside the legacy tracks, the party sheet's award.)
  const earned = data?.game === "starforged" ? LEGACY.reduce((sum, key) => sum + legacyXp(data?.legacy?.[key]), 0) + Math.max(0, Math.round(num(data?.expbonus, 0))) : Math.max(0, Math.round(num(data?.exp, 0)));
  const spent = Math.max(0, Math.round(num(data?.expspent, 0)));
  return { earned, spent, available: earned - spent };
}
// Fulfill Your Vow's reward: classic experience; Starforged quests legacy ticks (one rank lower on a weak hit).
export function vowReward(game, rank, outcome) {
  if (outcome === "miss") return 0;
  const used = outcome === "weak" ? lowerRank(rank) : rankOf(rank);
  if (game === "starforged") return used ? TICKS[used] : 0;
  return used ? VOW_XP[used] : 0;
}

// --- Oracles ---------------------------------------------------------------------
// A table's row for a roll ({fromrange, torange, results}); FG's table shape.
export function oracleRow(data, value) {
  const rows = Object.values(data?.tablerows ?? {}).filter((row) => row && typeof row === "object");
  return rows.find((row) => value >= num(row.fromrange, 0) && value <= num(row.torange, row.fromrange)) ?? null;
}
export const rowText = (row) =>
  Object.keys(row?.results ?? {})
    .sort()
    .map((key) => String(row.results[key]?.result ?? "").trim())
    .filter(Boolean)
    .join(" · ");
export const oracleDice = (data) => {
  const dice = String(data?.dice ?? "d100").trim().replace(/^d/i, "1d");
  return /^\d+d\d+$/i.test(dice) ? dice : "1d100";
};

// --- What an outcome does ----------------------------------------------------------
// Read from a move's outcome text (the CC BY moves): momentum, meters, marked
// progress, harm, initiative or control. A plain sentence's effects happen
// (auto); a choice's list (the outcome's bullets) are the player's to pick,
// as are effects hedged with "may", "if" or "up to".
function effectsIn(text) {
  const words = String(text ?? "").replace(/\*\*|__/g, "");
  const out = {};
  const momentum = /take \+(\d+) momentum/i.exec(words);
  if (momentum) out.momentum = Number(momentum[1]);
  const lose = /suffer -(\d+) momentum/i.exec(words) ?? /lose momentum \(-(\d+)\)/i.exec(words);
  if (!out.momentum && lose) out.momentum = -Number(lose[1]);
  for (const meter of METERS) {
    const gain = new RegExp(`(?:take (?:up to )?|in exchange for )\\+(\\d+) ${meter}`, "i").exec(words);
    if (gain) out[meter] = Number(gain[1]);
    const loss = new RegExp(`suffer (?:an additional )?-(\\d+) ${meter}`, "i").exec(words);
    if (loss) out[meter] = -Number(loss[1]);
  }
  if (/mark progress twice/i.test(words)) out.progress = 2;
  else if (/mark progress/i.test(words)) out.progress = 1;
  const harm = /inflict \+(\d+) harm/i.exec(words);
  if (harm) out.harm = 1 + Number(harm[1]);
  else if (/inflict (?:your )?harm/i.test(words)) out.harm = 1;
  if (/mark a tick on your bonds? (?:progress )?track/i.test(words)) out.bond = 1;
  if (/(you have (?:the )?initiative|retain initiative|take initiative|you are in control|stay in control|and are in control|you are in control)/i.test(words)) out.control = true;
  if (/(your foe has (?:the )?initiative|lose initiative|in a bad spot)/i.test(words)) out.control = false;
  return out;
}
const hasEffects = (effects) => Object.keys(effects).length > 0;
export function outcomeEffects(text) {
  const auto = {};
  const choices = [];
  const lines = String(text ?? "").split("\n");
  const prose = lines.filter((line) => !/^\s*[*-] /.test(line)).join(" ");
  for (const line of lines.filter((item) => /^\s*[*-] /.test(item))) {
    const label = line.replace(/^\s*[*-] /, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/__/g, "").trim();
    const effects = effectsIn(label);
    choices.push({ label, effects });
  }
  for (const sentence of prose.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").split(/(?<=[.!?])\s+/)) {
    const effects = effectsIn(sentence);
    if (!hasEffects(effects)) continue;
    // Hedged ("if", "may", "up to", or one effect or another): the player's choice, not the outcome's.
    if (/\b(may|if|up to|either)\b/i.test(sentence) || (/\bor\b/i.test(sentence) && Object.keys(effects).length > 1)) {
      choices.push({ label: sentence.replace(/^On an? (strong hit|weak hit|miss|hit),?\s*/i, "").replace(/__/g, "").trim(), effects });
      continue;
    }
    Object.assign(auto, effects);
  }
  return { auto, choices };
}
export function effectWords(effects, game = "classic") {
  const parts = [];
  if (effects.momentum) parts.push(`${signed(effects.momentum)} momentum`);
  for (const meter of METERS) if (effects[meter]) parts.push(`${signed(effects[meter])} ${meter}`);
  if (effects.progress) parts.push(effects.progress > 1 ? `progress marked ${effects.progress} times` : "progress marked");
  if (effects.harm) parts.push(`${effects.harm} harm inflicted`);
  if (effects.bond) parts.push("a bond marked");
  if (effects.control === true) parts.push(game === "starforged" ? "in control" : "initiative");
  if (effects.control === false) parts.push(game === "starforged" ? "in a bad spot" : "the foe has initiative");
  return parts.join(", ");
}

// --- A character ---------------------------------------------------------------------
export function blank(game = "classic") {
  return {
    ruleset: RULESET,
    game,
    stats: Object.fromEntries(STATS.map((stat) => [stat, 1])),
    meters: { health: 5, spirit: 5, supply: 5 },
    momentum: MOMENTUM_START,
    ...(game === "starforged" ? { impacts: {}, legacy: { quests: { ticks: 0, cleared: 0 }, bonds: { ticks: 0, cleared: 0 }, discoveries: { ticks: 0, cleared: 0 } } } : { debilities: {}, bonds: { ticks: 0 }, failure: { ticks: 0 } }),
    exp: 0,
    expspent: 0,
    tracks: {},
    assets: {},
    inventorylist: {},
    control: false,
  };
}
// Every number in its place again: the meters 0..5, momentum within its
// limits, the tracks' ticks 0..40, experience worked out, the tracker's mirror.
export function derive(input) {
  const data = structuredClone(input ?? {});
  data.ruleset = RULESET;
  data.game = data.game === "starforged" ? "starforged" : "classic";
  data.stats = Object.fromEntries(STATS.map((stat) => [stat, clamp(Math.round(num(data.stats?.[stat], 1)), 0, 5)]));
  data.meters = Object.fromEntries(METERS.map((meter) => [meter, clamp(Math.round(num(data.meters?.[meter], 5)), 0, METER_MAX)]));
  if (data.game === "starforged") {
    data.impacts = Object.fromEntries(Object.entries(data.impacts ?? {}).filter(([key, on]) => on && DEBILITIES.starforged.some((item) => item.key === key)).map(([key]) => [key, true]));
    data.legacy = Object.fromEntries(LEGACY.map((key) => [key, { ticks: clamp(Math.round(num(data.legacy?.[key]?.ticks, 0)), 0, MAX_TICKS - 1), cleared: Math.max(0, Math.round(num(data.legacy?.[key]?.cleared, 0))) }]));
    delete data.debilities;
  } else {
    data.debilities = Object.fromEntries(Object.entries(data.debilities ?? {}).filter(([key, on]) => on && DEBILITIES.classic.some((item) => item.key === key)).map(([key]) => [key, true]));
    data.bonds = { ...(data.bonds ?? {}), ticks: clamp(Math.round(num(data.bonds?.ticks, 0)), 0, MAX_TICKS) };
    data.failure = { ticks: clamp(Math.round(num(data.failure?.ticks, 0)), 0, MAX_TICKS) };
    delete data.impacts;
  }
  data.momentum = clamp(Math.round(num(data.momentum, MOMENTUM_START)), MOMENTUM_MIN, momentumMax(data));
  for (const [key, track] of Object.entries(data.tracks ?? {})) {
    if (!track || typeof track !== "object") {
      delete data.tracks[key];
      continue;
    }
    data.tracks[key] = { ...track, name: String(track.name ?? "Vow").slice(0, 200), kind: String(track.kind ?? "vow"), rank: rankOf(track.rank), ticks: clamp(Math.round(num(track.ticks, 0)), 0, MAX_TICKS), ...(track.done ? { done: String(track.done) } : {}) };
  }
  for (const asset of Object.values(data.assets ?? {})) {
    if (!asset || typeof asset !== "object") continue;
    if (Array.isArray(asset.abilities)) asset.abilities = asset.abilities.map(Boolean);
    if (asset.max !== undefined) asset.meter = clamp(Math.round(num(asset.meter, num(asset.max, 0))), 0, Math.max(0, num(asset.max, 0)));
  }
  data.exp = Math.max(0, Math.round(num(data.exp, 0)));
  data.expspent = Math.max(0, Math.round(num(data.expspent, 0)));
  data.experience = experience(data);
  if (data.game === "starforged") data.exp = data.experience.earned;
  data.control = Boolean(data.control);
  // The tracker's and the token's health: five boxes.
  data.hp = { total: METER_MAX, wounds: METER_MAX - data.meters.health };
  data.momentummax = momentumMax(data);
  data.momentumreset = momentumReset(data);
  return data;
}

// An asset record (ironasset) on a character: its first ability (or those the asset starts with) marked.
export function assetFrom(record) {
  const data = record?.data ?? {};
  const abilities = Object.keys(data.abilities ?? {})
    .sort()
    .map((key) => Boolean(Number(data.abilities[key]?.enabled ?? 0)));
  if (abilities.length && !abilities.some(Boolean)) abilities[0] = true;
  return {
    assetid: String(data.assetid ?? record?.id ?? ""),
    record: String(record?.id ?? ""),
    name: String(record?.name ?? data.name ?? "Asset"),
    category: String(data.category ?? ""),
    abilities,
    ...(Number(data.metermax) > 0 ? { label: String(data.meterlabel ?? "health"), max: Number(data.metermax), meter: Number(data.metermax) } : {}),
    ...(String(data.marks ?? "").trim() ? { marks: Object.fromEntries(String(data.marks).split(",").map((mark) => [mark.trim(), false]).filter(([mark]) => mark)) } : {}),
    fields: {},
  };
}

// The wizard's spec to a character: stats (3, 2, 2, 1, 1), assets (three in
// Ironsworn; two paths, the starship and one more in Starforged), the
// background vow, bonds or a first connection, name and look, what they carry.
export function buildFromSpec(spec, library, game = "classic") {
  const problems = [];
  const data = blank(game);
  const stats = spec?.stats ?? {};
  const given = STATS.map((stat) => Math.round(num(stats[stat], 0)));
  const sorted = [...given].sort((a, b) => b - a);
  if (sorted.join(",") !== SPREAD.join(",")) problems.push(`The stats are 3, 2, 2, 1 and 1, one each (given ${given.join(", ")}).`);
  data.stats = Object.fromEntries(STATS.map((stat, index) => [stat, clamp(given[index] || 1, 0, 5)]));
  const byName = (name) => library.assets.find((record) => record.name.toLowerCase() === String(name ?? "").toLowerCase() || record.id === name || String(record.data?.assetid ?? "") === name);
  const wanted = (Array.isArray(spec?.assets) ? spec.assets : []).map((item) => (typeof item === "string" ? { name: item } : item)).filter(Boolean);
  const need = game === "starforged" ? 4 : 3;
  let index = 0;
  for (const item of wanted.slice(0, 6)) {
    const record = byName(item.name);
    if (!record) {
      problems.push(`No asset ${item.name}.`);
      continue;
    }
    const asset = assetFrom(record);
    if (item.field) asset.fields.name = String(item.field).slice(0, 80);
    data.assets[`a${String(++index).padStart(2, "0")}`] = asset;
  }
  if (index !== need) problems.push(game === "starforged" ? `A Starforged character starts with four assets: two paths, the starship and one more (given ${index}).` : `An Ironsworn character starts with three assets (given ${index}).`);
  if (game === "starforged") {
    const paths = Object.values(data.assets).filter((asset) => /path/i.test(asset.category)).length;
    if (paths < 2) problems.push("Two of a Starforged character's assets are paths.");
    if (!Object.values(data.assets).some((asset) => /command vehicle/i.test(asset.category))) problems.push("A Starforged character has a starship (the Starship asset).");
  }
  const vow = spec?.backgroundVow ?? spec?.vow;
  let track = 0;
  if (vow && String(vow.name ?? vow).trim()) {
    const rank = rankOf(vow.rank ?? (game === "starforged" ? "epic" : "extreme"));
    if (game === "starforged" && rank !== "epic") problems.push("Starforged's background vow is epic.");
    if (game === "classic" && !["extreme", "epic"].includes(rank)) problems.push("Ironsworn's background vow is extreme or epic.");
    data.tracks[`t${String(++track).padStart(2, "0")}`] = { name: String(vow.name ?? vow).slice(0, 200), kind: "vow", rank, ticks: 0, background: true };
  } else problems.push("A background vow.");
  const inciting = spec?.incitingVow;
  if (inciting && String(inciting.name ?? "").trim()) data.tracks[`t${String(++track).padStart(2, "0")}`] = { name: String(inciting.name).slice(0, 200), kind: "vow", rank: rankOf(inciting.rank ?? "dangerous"), ticks: 0 };
  if (game === "classic") {
    const bonds = (Array.isArray(spec?.bonds) ? spec.bonds : []).map((bond) => String(bond ?? "").trim()).filter(Boolean).slice(0, 3);
    data.bonds = { ticks: bonds.length, list: bonds.join("\n") };
  } else {
    const connection = spec?.connection;
    if (connection && String(connection.name ?? "").trim()) data.tracks[`t${String(++track).padStart(2, "0")}`] = { name: String(connection.name).slice(0, 200), kind: "connection", rank: rankOf(connection.rank ?? "dangerous"), role: String(connection.role ?? "").slice(0, 80), ticks: 0 };
  }
  for (const [key, value] of Object.entries({ look: spec?.look, background: spec?.background, pronouns: spec?.pronouns, callsign: spec?.callsign, notes: spec?.notes })) if (value) data[key] = String(value).slice(0, 4000);
  const gear = (Array.isArray(spec?.gear) ? spec.gear : String(spec?.gear ?? "").split(/\n|,/)).map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 30);
  gear.forEach((name, at) => {
    data.inventorylist[`id-${String(at + 1).padStart(5, "0")}`] = { name: name.slice(0, 120), count: 1, carried: 1 };
  });
  const name = String(spec?.name ?? "").trim().slice(0, 120) || (game === "starforged" ? "Spacer" : "Ironsworn");
  return { name, data: derive(data), problems };
}
