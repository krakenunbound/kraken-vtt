const path = require("path");
const { pathToFileURL } = require("url");

// Host side of the D&D 5E ruleset (shared/dnd5e/rules.mjs, SRD 5.2.1):
// characters built from the campaign's active books, checks, saves and skills
// rolled in front of the table, level ups, and the sheet's edits. A 5E
// character's record data has ruleset "dnd5e"; the SIEGE paths hand those here.

let loaded = null;
const rules5e = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "dnd5e", "rules.mjs")).href));
const RULESET_NAME = "D&D 5E";
// The d20 family's games (shared/dnd5e/rules.mjs PROFILES): their campaign names and record ids.
const D20 = { "D&D 5E": "dnd5e", "Descending Darkness": "descending" };
const isD20Ruleset = (name) => Object.prototype.hasOwnProperty.call(D20, String(name ?? ""));
const is5e = (thing) => Object.values(D20).includes(thing?.data?.ruleset);
// The record types a 5E book's activation copies in (beside items, NPCs and spells).
const TYPES_5E = ["class", "race", "race_subrace", "background", "feat", "skill", "class_specialization"];

function library5e(records) {
  const list = (type) => records.list({ type });
  return { classes: list("class"), species: list("race"), backgrounds: list("background"), items: list("item"), spells: list("spell") };
}

async function build5e(table, spec, owner, seat) {
  const rules = await rules5e();
  const lib = library5e(table.records);
  if (lib.classes.length === 0) throw new Error(table.ruleset?.() === "Descending Darkness" ? "No classes in this campaign: make the Descending Darkness Player's Handbook active (Books)." : "No 5E classes in this campaign: make the SRD player book active (Books).");
  const built = rules.buildFromSpec(spec ?? {}, lib, D20[table.ruleset?.()] ?? "dnd5e");
  const data = require("./characterArt.cjs").withArt(built.data, spec, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A d20 test: kind check (an ability), save, or skill; advantage or
// disadvantage (2d20, the higher or lower kept); dc to say success or failure.
async function check5e(table, record, { kind = "check", attribute, skill, dc, bonus = 0, advantage = "", label } = {}, from) {
  const rules = await rules5e();
  const key = kind === "skill" ? rules.skillKey(skill) : String(attribute ?? "").toLowerCase();
  if (kind !== "skill" && !rules.STATS.includes(key)) throw new Error("Pick an ability.");
  const { modifier, label: tag } = rules.testModifier(record.data, kind, key);
  const total = modifier + (Number(bonus) || 0);
  const shaken = rules.dreadAdvantage(record.data, kind, key, advantage);
  advantage = shaken.advantage;
  const dice = advantage === "advantage" ? "2d20kh1" : advantage === "disadvantage" ? "2d20kl1" : "1d20";
  const formula = `${dice}${total ? rules.signed(total) : ""}`;
  const against = Number(dc) > 0 ? Math.round(Number(dc)) : null;
  // The result goes with the roll card (FG's [SUCCESS] / [FAILURE] after the roll).
  const rolled = table.dice.roll(formula);
  const success = against === null ? null : rolled.total >= against;
  const words = `${label ? `${label} ` : ""}${tag}${shaken.dread ? " [DREAD]" : ""}${advantage ? ` [${advantage.toUpperCase()}]` : ""}${against !== null ? ` [DC ${against}] [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs ${against}]` : ""}`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, ...(against !== null ? { result: success ? "SUCCESS" : "FAILURE", against } : {}) });
  return { total: rolled.total, d20: rolled.terms[0].rolls, modifier: total, dc: against, success };
}

async function levelUp5e(table, record, from) {
  const rules = await rules5e();
  const pkg = Object.values(record.data.packages ?? {}).find((item) => String(item.packagetype).toLowerCase() === "class");
  const die = Number(pkg?.hitdie) || Number(record.data.hitdice?.die) || 8;
  const roll = table.roll(`1d${die}`, `${record.name}: ${pkg?.name ?? "Class"} ${(Number(record.data.level) || 1) + 1} hit points`, from || record.name);
  const { data, gain } = rules.levelUp(record.data, roll.total);
  const updated = table.records.update(record.id, { data }, table.seat, { replace: true });
  table.say(`[LEVEL UP] ${record.name} is now ${pkg?.name ?? ""} ${data.level}: +${gain} hit points (${data.hp.total}), proficiency ${rules.signed(data.prof)}.`, from || record.name);
  return { record: updated, gain, level: data.level, note: "" };
}

// What the 5E sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "alignment", "appearance", "notes", "senses", "speed", "background", "species", "gender", "age", "height", "weight", "concentration"]);
const NUMBERS = [
  /^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.(score|saveprof)$/,
  /^skills\.[a-z]+\.prof$/,
  /^hp\.(wounds|temp)$/,
  /^exp$/,
  /^ac\.misc$/,
  /^initiative\.misc$/,
  /^slots\.l\d\.used$/,
  /^deathsaves\.(success|failure)$/,
  /^hitdice\.used$/,
  /^dread$/,
  /^coins\.id-\d+\.amount$/,
  /^inventorylist\.id-\d+\.(count|carried)$/,
];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
async function edit5e(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rules5e();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      setPath(data, key, n);
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

module.exports = { rules5e, library5e, build5e, check5e, levelUp5e, edit5e, is5e, isD20Ruleset, D20, RULESET_NAME, TYPES_5E };
