const path = require("path");
const { pathToFileURL } = require("url");

// Host side of the Basic Fantasy ruleset (shared/bfrpg/rules.mjs): characters
// built by the wizard (the book's procedure: 3d6 in order, race and class,
// the hit die, 3d6 x 10 gp and the shop, a Magic-User's first spell),
// saving throws, ability rolls, thief abilities and loyalty rolled in front
// of the table, level ups (the hit die to 9th, fixed hit points after), and
// the sheet's edits. A Basic Fantasy character's record data has ruleset
// "bfrpg"; the SIEGE paths (siege.cjs) hand those here.

let loaded = null;
const rulesBf = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "bfrpg", "rules.mjs")).href));
let shop = null;
const shopRules = () => (shop ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "shop.mjs")).href));
const RULESET_NAME = "Basic Fantasy";
const isBfRuleset = (name) => String(name ?? "") === RULESET_NAME;
const isBf = (thing) => thing?.data?.ruleset === "bfrpg";

async function buildBf(table, spec, owner, seat) {
  const rules = await rulesBf();
  const { priceOf } = await shopRules();
  const items = table.records.list({ type: "item" });
  if (items.length === 0 && Array.isArray(spec?.buy) && spec.buy.length) throw new Error("No equipment in this campaign: make the Basic Fantasy Player's Handbook active (Modules).");
  // The book's money: a platinum piece is 5 gold (the shop's own table says 10).
  const price = (text) => {
    const value = priceOf(text);
    return value !== null && /pp/i.test(String(text)) ? Math.round(value / 2) : value;
  };
  const built = rules.buildFromSpec(spec ?? {}, { items }, price);
  // The book's rules hold (a race's limits, a class's Prime Requisite, what it may wear and wield, the money): the GM may force it.
  if (built.problems.length && !spec?.force) throw new Error(built.problems.join(" "));
  const data = require("./characterArt.cjs").withArt(built.data, { ...spec, race: built.data.race, class: built.data.className.split("/")[0] }, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A test: kind save (death, wands, paralysis, breath, spells: d20 at or above
// the number, a natural 1 fails and a 20 succeeds), check (the optional
// ability roll: d20 + the ability's bonus at or above the level's target),
// skill (a thief ability: d100 at or under) or morale (a retainer's loyalty:
// 2d6 at or under). bonus: a modifier added to a d20, taken off a d100 or 2d6.
async function checkBf(table, record, { kind = "check", attribute, skill, bonus = 0, label } = {}, from) {
  const rules = await rulesBf();
  const data = rules.derive(record.data);
  const which = kind === "skill" ? skill : kind === "save" ? attribute : String(attribute ?? "").toLowerCase();
  const test = rules.testOf(data, kind, which);
  const mod = Math.round(Number(bonus) || 0);
  const formula = `${test.die}${mod ? (test.high ? rules.signed(mod) : mod > 0 ? `-${mod}` : `+${-mod}`) : ""}`;
  const rolled = table.dice.roll(formula);
  const die = rolled.terms?.[0]?.rolls?.[0];
  let success = test.high ? rolled.total >= test.target : rolled.total <= test.target;
  if (kind === "save" && die === 1) success = false;
  if (kind === "save" && die === 20) success = true;
  const words = `${label ? `${label} ` : ""}${test.label} [${test.high ? "NEEDS" : "UNDER"} ${test.target}] [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} ${test.high ? "vs" : "under"} ${test.target}]${kind === "save" && (die === 1 || die === 20) ? ` [NATURAL ${die}]` : ""}`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, result: success ? "SUCCESS" : "FAILURE", against: test.target });
  return { total: rolled.total, target: test.target, success };
}

async function levelUpBf(table, record, from) {
  const rules = await rulesBf();
  const data = rules.derive(record.data);
  const die = rules.levelUpDie(data);
  const roll = die ? table.roll(`1d${die}`, `${record.name}: ${data.className} ${data.level + 1} hit points`, from || record.name) : null;
  const { data: next, gain } = rules.levelUp(data, roll?.total);
  const updated = table.records.update(record.id, { data: next }, table.seat, { replace: true });
  table.say(`[LEVEL UP] ${record.name} is now a level ${next.level} ${next.className}: +${gain} hit points (${next.hp.total}), attack bonus ${rules.signed(next.ab)}.${next.spellcasting ? ` Spells a day: ${next.spellcasting.perday.filter(Boolean).join("/")}.` : ""}`, from || record.name);
  return { record: updated, gain, level: next.level };
}

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "alignment", "deity", "appearance", "notes", "background", "gender", "age", "height", "weight", "languages", "retainers", "specialabilities"]);
const NUMBERS = [
  /^abilities\.(strength|intelligence|wisdom|dexterity|constitution|charisma)\.score$/,
  /^saves\.(death|wands|paralysis|breath|spells)\.misc$/,
  /^thiefskills\.[a-z]+\.misc$/,
  /^hp\.(wounds|misc)$/,
  /^exp$/,
  /^ac\.misc$/,
  /^initiative\.misc$/,
  /^movemisc$/,
  /^loyalty$/,
  /^spellcasting\.used\.\d$/,
  /^coins\.id-\d+\.amount$/,
  /^inventorylist\.id-\d+\.(count|carried)$/,
];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) {
    if (Array.isArray(node[part])) node = node[part];
    else node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  }
  node[keys.at(-1)] = value;
}
const listOf = (value) => (Array.isArray(value) ? value : String(value ?? "").split(/\n|,/)).map((item) => String(item).trim()).filter(Boolean).slice(0, 200);
async function editBf(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesBf();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "spellbook" || key === "prepared") data[key] = listOf(value);
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      setPath(data, key, /(^spellcasting|^hp\.wounds|amount$|count$)/.test(key) ? Math.max(0, Math.round(n)) : Math.round(n));
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

module.exports = { rulesBf, buildBf, checkBf, levelUpBf, editBf, isBf, isBfRuleset, RULESET_NAME };
