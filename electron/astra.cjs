const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Apeira Astra (shared/astra/rules.mjs): characters built from
// the campaign's active books (Origins and Paths), tasks rolled in front of
// the table (2d6 + skill + characteristic against 8, its Effect), the sheet's
// edits, experience spent on skills. A record's data.ruleset is "astra".

let loaded = null;
const rulesAstra = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "astra", "rules.mjs")).href));
const RULESET_NAME = "Apeira Astra";
const isAstra = (thing) => thing?.data?.ruleset === "astra";

function libraryAstra(records) {
  const list = (type) => records.list({ type });
  return { origins: list("race"), paths: list("class"), items: list("item") };
}

async function buildAstra(table, spec, owner, seat) {
  const rules = await rulesAstra();
  const lib = libraryAstra(table.records);
  if (lib.paths.length === 0) throw new Error("No Paths in this campaign: make the Apeira Astra Crew Handbook active (Books).");
  const built = rules.buildFromSpec(spec ?? {}, lib);
  // No automatic portrait: Kraken's own art is fantasy; the player picks one (spec.portrait / spec.token).
  const data = { ...built.data, ...(typeof spec?.portrait === "string" ? { portrait: spec.portrait } : {}), ...(typeof spec?.token === "string" ? { token: spec.token } : {}) };
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A task: 2d6 + the skill's level (untrained -3) + the characteristic's
// modifier + a difficulty; a Boon keeps the best two of 3d6, a Bane the worst.
// Against 8: the Effect is the margin.
async function taskAstra(table, record, { skill = "", attribute = "", difficulty = 0, boon = "", label } = {}, from) {
  const rules = await rulesAstra();
  const { modifier, label: tag } = rules.taskModifier(record.data, skill, String(attribute ?? "").toLowerCase() || "");
  const total = modifier + (Number(difficulty) || 0);
  const dice = boon === "boon" ? "3d6kh2" : boon === "bane" ? "3d6kl2" : "2d6";
  const rolled = table.dice.roll(`${dice}${total ? rules.signed(total) : ""}`);
  const effect = rolled.total - rules.TARGET;
  const success = effect >= 0;
  const words = `${label ? `${label} ` : ""}${tag}${Number(difficulty) ? ` [${rules.signed(Number(difficulty))}]` : ""}${boon ? ` [${boon.toUpperCase()}]` : ""} [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs 8, Effect ${rules.signed(effect)}]`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, result: success ? "SUCCESS" : "FAILURE", against: rules.TARGET });
  return { total: rolled.total, modifier: total, effect, success };
}

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "notes", "appearance", "origin", "homeworld", "contacts", "ship"]);
const NUMBERS = [/^characteristics\.(brawn|reflex|grit|intellect|training|presence)\.score$/, /^skills\.[a-z]+\.level$/, /^hp\.wounds$/, /^exp$/, /^ac\.misc$/, /^initiative\.misc$/, /^coins\.id-\d+\.amount$/, /^inventorylist\.id-\d+\.(count|carried)$/];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
async function editAstra(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesAstra();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (/^skills\.[a-z]+$/.test(key) && value === null) delete data.skills?.[key.split(".")[1]];
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      setPath(data, key, n);
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

// Experience spent: a skill's next level (its cost: that level x 2, level 1
// costs 1... a new skill at 0 costs 1), or a characteristic +1 (6).
async function improveAstra(table, record, { skill = "", attribute = "" } = {}, seat, from) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only improve your own character.");
  const rules = await rulesAstra();
  const data = structuredClone(record.data);
  let cost;
  let words;
  if (skill) {
    const key = rules.skillKey(skill);
    if (!rules.SKILLS[key]) throw new Error(`No skill ${skill}.`);
    const now = data.skills?.[key]?.level;
    const next = now === undefined ? 0 : now + 1;
    if (next > 4) throw new Error(`${rules.skillName(key)} is at its height.`);
    cost = rules.skillCost(next);
    data.skills = { ...(data.skills ?? {}), [key]: { level: next } };
    words = `${rules.skillName(key)} ${next}`;
  } else {
    const stat = String(attribute).toLowerCase();
    if (!rules.STATS.includes(stat)) throw new Error("Which skill or characteristic?");
    if (data.characteristics[stat].score >= 15) throw new Error(`${rules.STAT_NAMES[stat]} is at its height.`);
    cost = 6;
    data.characteristics[stat].score += 1;
    words = `${rules.STAT_NAMES[stat]} ${data.characteristics[stat].score}`;
  }
  if (Number(data.exp ?? 0) < cost) throw new Error(`That costs ${cost} experience; ${record.name} has ${Number(data.exp ?? 0)}.`);
  data.exp = Number(data.exp ?? 0) - cost;
  const updated = table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
  table.say(`[IMPROVE] ${record.name}: ${words} (${cost} experience spent).`, from || record.name);
  return { record: updated, cost, now: words };
}

module.exports = { rulesAstra, libraryAstra, buildAstra, taskAstra, editAstra, improveAstra, isAstra, RULESET_NAME };
