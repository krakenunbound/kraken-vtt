const path = require("path");
const { pathToFileURL } = require("url");

// Host side of the D&D 3.5E ruleset (shared/dnd35/rules.mjs, the SRD 3.5):
// characters built from the campaign's active books (the 3.5E Player's
// Handbook's classes, races and gear), checks, saves and skills rolled in
// front of the table, level ups, and the sheet's edits. A 3.5E character's
// record data has ruleset "dnd35"; the SIEGE paths hand those here.

let loaded = null;
const rules35 = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "dnd35", "rules.mjs")).href));
const RULESET_NAME = "D&D 3.5E";
const is35Ruleset = (name) => String(name ?? "") === RULESET_NAME;
const is35 = (thing) => thing?.data?.ruleset === "dnd35";

let wizardLoaded = null;
const wizard35 = () => (wizardLoaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "dnd35", "wizard.mjs")).href));

// The books a 3.5E character is built from: classes, races, gear, feats, the
// spells (a book's "spell" or the 3.5E Spells book's "spelldesc" records) and
// the cleric domains (its "spelllists").
async function library35(records) {
  const list = (type) => records.list({ type });
  const spells = [...list("spell"), ...list("spelldesc")];
  const { makeLib } = await wizard35();
  const { domains } = makeLib([...spells, ...list("spelllists")]);
  return { classes: list("class"), races: list("race"), items: list("item"), feats: list("feat"), spells, domains };
}

async function build35(table, spec, owner, seat) {
  const rules = await rules35();
  const lib = await library35(table.records);
  if (lib.classes.length === 0) throw new Error("No 3.5E classes in this campaign: make the 3.5E Player's Handbook active (Books).");
  const built = rules.buildFromSpec(spec ?? {}, lib);
  const data = require("./characterArt.cjs").withArt(built.data, spec, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A d20 test: kind check (an ability), save (fortitude, reflex, will, or the
// ability it uses), or skill (its name); dc to say success or failure. Take 10
// or 20: take = 10 or 20 instead of the roll (outside combat, as the GM allows).
async function check35(table, record, { kind = "check", attribute, skill, dc, bonus = 0, take = 0, label } = {}, from) {
  const rules = await rules35();
  const key = kind === "skill" ? rules.skillKey(skill) : String(attribute ?? "").toLowerCase();
  if (kind === "check" && !rules.STATS.includes(key)) throw new Error("Pick an ability.");
  const { modifier, label: tag } = rules.testModifier(rules.derive(record.data), kind, key);
  const total = modifier + (Number(bonus) || 0);
  const against = Number(dc) > 0 ? Math.round(Number(dc)) : null;
  const fixed = [10, 20].includes(Number(take)) ? Number(take) : 0;
  const rolled = table.dice.roll(fixed ? `${fixed}${total ? rules.signed(total) : ""}` : `1d20${total ? rules.signed(total) : ""}`);
  const success = against === null ? null : rolled.total >= against;
  const words = `${label ? `${label} ` : ""}${tag}${fixed ? ` [TAKE ${fixed}]` : ""}${against !== null ? ` [DC ${against}] [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs ${against}]` : ""}`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, ...(against !== null ? { result: success ? "SUCCESS" : "FAILURE", against } : {}) });
  return { total: rolled.total, d20: fixed ? [fixed] : rolled.terms[0].rolls, modifier: total, dc: against, success };
}

async function levelUp35(table, record, from) {
  const rules = await rules35();
  const data = rules.derive(record.data);
  const first = data.classes[0];
  if (!first) throw new Error("This character has no class.");
  const roll = table.roll(`1d${Number(first.hitdie) || 8}`, `${record.name}: ${first.name} ${data.level + 1} hit points`, from || record.name);
  const { data: next, gain } = rules.levelUp(data, roll.total);
  const updated = table.records.update(record.id, { data: next }, table.seat, { replace: true });
  const notes = [];
  if ((next.level % 3 === 0)) notes.push("a feat");
  if (next.level % 4 === 0) notes.push("+1 to an ability score");
  table.say(`[LEVEL UP] ${record.name} is now ${first.name} ${next.level}: +${gain} hit points (${next.hp.total}), base attack ${rules.signed(next.bab)}${notes.length ? `; choose ${notes.join(" and ")}` : ""}; spend the new skill points on the sheet.`, from || record.name);
  return { record: updated, gain, level: next.level, note: notes.join(", ") };
}

// What the 3.5E sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "alignment", "deity", "appearance", "notes", "senses", "background", "race", "gender", "age", "height", "weight", "languages"]);
const NUMBERS = [
  /^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.score$/,
  /^skills\.[a-z]+\.(ranks|misc)$/,
  /^saves\.(fortitude|reflex|will)\.misc$/,
  /^hp\.(total|wounds|nonlethal|temp)$/,
  /^exp$/,
  /^ac\.(natural|deflection|dodge|misc)$/,
  /^initiative\.misc$/,
  /^speed$/,
  /^stable$/,
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
async function edit35(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rules35();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "feats" || key === "spells") data[key] = (Array.isArray(value) ? value : String(value ?? "").split(/\n|,(?![^(]*\))/)).map((item) => String(item).trim()).filter(Boolean).slice(0, 200);
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      // Ranks may be halves (a cross-class skill); everything else whole, and counts never below 0.
      const whole = /\.ranks$/.test(key) ? Math.round(n * 2) / 2 : Math.round(n);
      setPath(data, key, /(^spellcasting\.used|\.ranks$|^hp\.(wounds|nonlethal|temp))/.test(key) ? Math.max(0, whole) : whole);
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

module.exports = { rules35, library35, build35, check35, levelUp35, edit35, is35, is35Ruleset, RULESET_NAME };
