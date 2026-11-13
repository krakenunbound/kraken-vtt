const path = require("path");
const { pathToFileURL } = require("url");

// Host side of the AD&D 2E ruleset (shared/adnd2e/rules.mjs): characters
// built by the wizard (or taken from a book's pregens), checks, saves and
// thief skills rolled in front of the table, level ups, and the sheet's
// edits. A 2E character's record data has ruleset "adnd2e"; the SIEGE paths
// hand those here.

let loaded = null;
const rules2e = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "adnd2e", "rules.mjs")).href));
const RULESET_NAME = "AD&D 2E";
const is2eRuleset = (name) => String(name ?? "") === RULESET_NAME;
const is2e = (thing) => thing?.data?.ruleset === "adnd2e";

// The wizard's spec, or a pregen: spec.pregen is a book's FG 2E character
// sheet record (type pregencharsheet) in the campaign.
async function build2e(table, spec, owner, seat) {
  const rules = await rules2e();
  let built;
  if (spec?.pregen) {
    const sheet = table.records.get(String(spec.pregen));
    if (!sheet || sheet.type !== "pregencharsheet") throw new Error("No such pregenerated character: make its book active (Modules).");
    built = { name: String(spec.name ?? "").trim() || sheet.name, data: rules.fromFG(sheet.data), problems: [] };
    // (Its FG portrait path is the book's, not Kraken's art: the GM's art by race and class instead.)
  } else built = rules.buildFromSpec(spec ?? {}, { items: table.records.list({ type: "item" }) });
  const data = require("./characterArt.cjs").withArt(built.data, spec, table.art);
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A test: kind save (its name: paralyzation, rod, petrification, breath,
// spell), check (an ability: d20 at or under the score) or skill (a thief
// skill: d100 at or under). bonus: a modifier (a save's +2 from magic adds to
// the roll; a check's or skill's comes off it).
async function check2e(table, record, { kind = "check", attribute, skill, bonus = 0, label } = {}, from) {
  const rules = await rules2e();
  const data = rules.derive(record.data);
  const test = rules.testOf(data, kind, kind === "skill" ? skill : kind === "save" ? attribute : String(attribute ?? "").toLowerCase());
  const mod = Math.round(Number(bonus) || 0);
  // A save adds its modifier; a roll-under check takes a bonus off the die.
  const formula = `${test.die}${mod ? `${test.high ? (mod > 0 ? "+" : "") + mod : (mod > 0 ? "-" : "+") + Math.abs(mod)}` : ""}`;
  const rolled = table.dice.roll(formula);
  const success = test.high ? rolled.total >= test.target : rolled.total <= test.target;
  const words = `${label ? `${label} ` : ""}${test.label} [${test.high ? "NEEDS" : "UNDER"} ${test.target}] [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} ${test.high ? "vs" : "under"} ${test.target}]`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, result: success ? "SUCCESS" : "FAILURE", against: test.target });
  return { total: rolled.total, target: test.target, success };
}

async function levelUp2e(table, record, from, className) {
  const rules = await rules2e();
  const data = rules.derive(record.data);
  const cls = data.classes.find((item) => item.name.toLowerCase() === String(className ?? "").toLowerCase()) ?? data.classes[0];
  if (!cls) throw new Error("This character has no class.");
  const die = rules.GROUPS[cls.group].die;
  const past = cls.level + 1 > rules.GROUPS[cls.group].top;
  const roll = past ? null : table.roll(`1d${die}`, `${record.name}: ${cls.name} ${cls.level + 1} hit points`, from || record.name);
  const { data: next, gain } = rules.levelUp(data, roll?.total, cls.name);
  const updated = table.records.update(record.id, { data: next }, table.seat, { replace: true });
  const now = next.classes.find((item) => item.name === cls.name);
  table.say(`[LEVEL UP] ${record.name} is now a level ${now.level} ${cls.name}: +${gain} hit points (${next.hp.total}), THAC0 ${next.thaco}.${next.thiefskills ? " Spend the new thief skill points on the sheet." : ""}`, from || record.name);
  return { record: updated, gain, level: now.level };
}

// What the 2E sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "alignment", "deity", "appearance", "notes", "background", "race", "gender", "age", "height", "weight", "languages"]);
const NUMBERS = [
  /^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.score$/,
  /^abilities\.strength\.percent$/,
  /^saves\.(paralyzation|rod|petrification|breath|spell)\.misc$/,
  /^thiefskills\.[a-z]+\.(points|misc)$/,
  /^hp\.(total|wounds|temp)$/,
  /^exp$/,
  /^ac\.misc$/,
  /^initiative\.misc$/,
  /^movement$/,
  /^stable$/,
  /^spellcasting\.\d\.used\.\d$/,
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
const listOf = (value) => (Array.isArray(value) ? value : String(value ?? "").split(/\n|,(?![^(]*\))/)).map((item) => String(item).trim()).filter(Boolean).slice(0, 200);
async function edit2e(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rules2e();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "spells") data.spells = listOf(value);
    else if (key === "profs.weapon" || key === "profs.nonweapon") data.profs = { ...(data.profs ?? {}), [key.split(".")[1]]: listOf(value) };
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      setPath(data, key, /(^spellcasting|\.points$|^hp\.(wounds|temp))/.test(key) ? Math.max(0, Math.round(n)) : Math.round(n));
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

module.exports = { rules2e, build2e, check2e, levelUp2e, edit2e, is2e, is2eRuleset, RULESET_NAME };
