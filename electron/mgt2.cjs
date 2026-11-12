const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Traveller (shared/mgt2/rules.mjs): Travellers built by the
// wizard, tasks rolled in front of the table (2d6 + DM + skill against a
// difficulty, with the Effect), and the sheet's edits. A record's
// data.ruleset is "mgt2".

let loaded = null;
const rulesMgt2 = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "mgt2", "rules.mjs")).href));
const RULESET_NAME = "Traveller";
const isMgt2 = (thing) => thing?.data?.ruleset === "mgt2";
const isMgt2Ruleset = (name) => String(name ?? "") === RULESET_NAME;

// Kraken's science fiction portraits (Apeira Astra's: an origin and a path)
// for a human Traveller: the path by the first career, the origin by where
// they come from (high Social Standing Coreborn, a rogue the Undercity, a
// scout the Frontier, a spacer's career Spacer, else a Belter). Other species
// keep their own name, for the GM's art.
const ART_PATH = { agent: "Drifter", army: "Marine", citizen: "Merchant", drifter: "Drifter", entertainer: "Merchant", marine: "Marine", merchant: "Merchant", navy: "Fleet", noble: "Merchant", prisoner: "Drifter", rogue: "Drifter", scholar: "Medic", scout: "Scout" };
function artFor(data) {
  const career = String(data.careers?.[0]?.name ?? "").toLowerCase();
  if (!/^human$/i.test(String(data.species ?? "Human"))) return { race: data.species, class: career };
  const origin = Number(data.characteristics?.soc?.score) >= 10 ? "Coreborn" : ["rogue", "prisoner"].includes(career) ? "Undercity" : ["scout", "drifter"].includes(career) ? "Frontier" : ["navy", "merchant"].includes(career) ? "Spacer" : "Belter";
  return { race: origin, class: ART_PATH[career] ?? "Engineer" };
}

async function buildMgt2(table, spec, owner, seat) {
  const rules = await rulesMgt2();
  const built = rules.buildFromSpec(spec ?? {}, { items: table.records.list({ type: "item" }) });
  // The art is picked by the portraits' origin; the record keeps its species.
  const art = artFor(built.data);
  const data = { ...require("./characterArt.cjs").withArt({ ...built.data, race: art.race }, { ...spec, class: art.class }, table.art), race: built.data.race };
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A task: 2d6 + the characteristic's DM + the skill's level (untrained -3,
// less Jack-of-all-Trades) + a modifier, against the difficulty's number
// (Average 8); a Boon keeps the best two of 3d6, a Bane the worst. The margin
// is the Effect.
async function taskMgt2(table, record, { skill = "", attribute = "", difficulty = 8, modifier = 0, boon = "", label } = {}, from) {
  const rules = await rulesMgt2();
  const data = rules.derive(record.data);
  const { modifier: dm, label: tag } = rules.taskModifier(data, skill, String(attribute ?? "").toLowerCase().slice(0, 3));
  const target = Math.min(20, Math.max(2, Math.round(Number(difficulty) || 8)));
  const total = dm + (Math.round(Number(modifier)) || 0);
  const dice = boon === "boon" ? "3d6kh2" : boon === "bane" ? "3d6kl2" : "2d6";
  const rolled = table.dice.roll(`${dice}${total ? rules.signed(total) : ""}`);
  const effect = rolled.total - target;
  const success = effect >= 0;
  const name = rules.DIFFICULTIES.find(([, value]) => value === target)?.[0] ?? `${target}+`;
  const words = `${label ? `${label} ` : ""}${tag} [${name.toUpperCase()} ${target}+]${Number(modifier) ? ` [${rules.signed(Math.round(Number(modifier)))}]` : ""}${boon ? ` [${boon.toUpperCase()}]` : ""} [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs ${target}, Effect ${rules.signed(effect)}]`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, result: success ? "SUCCESS" : "FAILURE", against: target });
  return { total: rolled.total, modifier: total, target, effect, success };
}

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "notes", "appearance", "species", "homeworld", "contacts", "allies", "enemies", "ship", "background"]);
const NUMBERS = [/^characteristics\.(str|dex|end|int|edu|soc)\.score$/, /^skills\.[a-z0-9-]+\.level$/, /^hp\.wounds$/, /^age$/, /^ac\.misc$/, /^initiative\.misc$/, /^careers\.\d+\.(terms|rank)$/, /^coins\.id-\d+\.amount$/, /^inventorylist\.id-\d+\.(count|carried)$/];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
async function editMgt2(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesMgt2();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    let key = String(change?.path ?? "");
    const value = change?.value;
    // A skill by its name ("skills.Gun Combat (Slug).level") as well as its key.
    const named = /^skills\.(.+)\.level$/.exec(key);
    if (named && !/^[a-z0-9-]+$/.test(named[1])) key = `skills.${rules.skillKey(named[1]).key}.level`;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "careers") data.careers = (Array.isArray(value) ? value : []).slice(0, 12).map((item) => ({ name: String(item?.name ?? "").slice(0, 60), terms: Math.max(0, Math.round(Number(item?.terms) || 0)), rank: Math.max(0, Math.round(Number(item?.rank) || 0)) }));
    else if (/^skills\.[a-z0-9-]+$/.test(key) && value === null) delete data.skills?.[key.split(".")[1]];
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      if (key.startsWith("skills.") && !rules.SKILLS[key.split(".")[1].split("-")[0]]) throw new Error(`No skill ${key.split(".")[1]}.`);
      setPath(data, key, key === "hp.wounds" ? Math.max(0, n) : n);
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

module.exports = { rulesMgt2, buildMgt2, taskMgt2, editMgt2, isMgt2, isMgt2Ruleset, RULESET_NAME };
