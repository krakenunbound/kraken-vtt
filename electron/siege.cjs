const path = require("path");
const { pathToFileURL } = require("url");
const dnd5e = require("./dnd5e.cjs");

// Host side of the SIEGE engine (shared/siege, ES modules shared with the
// app window): the game library from the campaign's imported records, and
// checks made in front of the table.

let loaded = null;
function siege() {
  if (!loaded) {
    const base = path.join(__dirname, "..", "shared", "siege");
    loaded = Promise.all(["engine.mjs", "builder.mjs", "interchange.mjs"].map((file) => import(pathToFileURL(path.join(base, file)).href))).then(([engine, builder, interchange]) => ({ engine, builder, interchange }));
  }
  return loaded;
}

function siegeLibrary(records) {
  const data = (type) => records.list({ type }).map((record) => record.data);
  return { packages: data("siegepackage"), items: data("item"), powers: data("siegepower"), game: data("siegegame")[0] };
}

const ATTRIBUTES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

// A SIEGE check for a character record, rolled by the host's dice and posted
// as a roll card. table: the table server's agent handle.
async function siegeCheck(table, record, { attribute, cl = 0, bonus = 0, addLevel, label, kind, skill, dc, advantage } = {}, from) {
  // A 5E character: its ruleset's check, save or skill (dc, advantage).
  if (dnd5e.is5e(record)) return dnd5e.check5e(table, record, { kind: kind ?? (/save/i.test(String(label ?? "")) ? "save" : "check"), attribute, skill, dc: dc ?? cl, bonus, advantage, label: kind ? label : undefined }, from);
  if (!ATTRIBUTES.includes(attribute)) throw new Error("Pick an attribute.");
  const { engine } = await siege();
  const game = siegeLibrary(table.records).game;
  const row = record.data.attributes?.[attribute] ?? {};
  const prime = Number(row.prime) === 1;
  const options = engine.gameOptions(game);
  const level = Number(record.data.level) || 0;
  const add = addLevel ?? String(options.SIEGE_ADD_LEVEL).toLowerCase() === "on";
  const modifier = engine.abilityBonus(row.score, game) + (add ? level : 0) + (Number(bonus) || 0);
  const formula = `1d20${modifier >= 0 ? "+" : ""}${modifier}`;
  const name = label || `${attribute[0].toUpperCase()}${attribute.slice(1)} check`;
  const roll = table.roll(formula, `${record.name}: ${name}`, from || record.name);
  const d20 = roll.terms[0].rolls[0];
  const result = engine.check({ d20, score: row.score, prime, level, addLevel: add, cl: Number(cl) || 0, bonus: Number(bonus) || 0 }, game);
  table.say(`${name}: ${result.total} vs CC ${result.cc} (${prime ? "prime" : "secondary"} ${result.cb} + CL ${Number(cl) || 0}) — ${result.success ? "SUCCESS" : "FAILURE"}`, from || record.name);
  return { d20, ...result };
}

// Raises a character one level in front of the table: the host rolls the new
// level's hit points (or adds the flat gain), the sheet is rebuilt, and chat
// says so.
async function levelUp(table, record, packageKey, from) {
  if (dnd5e.is5e(record)) return dnd5e.levelUp5e(table, record, from);
  const { engine } = await siege();
  const game = siegeLibrary(table.records).game;
  const found = engine.levelUpPackage(record.data, packageKey);
  if (!found) throw new Error("That character has no class to level up.");
  const [key, pkg] = found;
  const plan = engine.levelUpRoll(record.data, pkg, game);
  if (!plan) throw new Error(`${pkg.name} has no level ${(Number(pkg.level) || 1) + 1}.`);
  let gain = plan.flat;
  if (plan.formula) {
    const roll = table.roll(plan.formula, `${record.name}: ${pkg.name} ${plan.level} hit points`, from || record.name);
    gain = Math.max(plan.minimum, roll.total);
  }
  const data = engine.applyLevelUp(record.data, key, gain, game);
  const updated = table.records.update(record.id, { data }, table.seat, { replace: true });
  const bth = data.bth >= 0 ? `+${data.bth}` : `${data.bth}`;
  table.say(`[LEVEL UP] ${record.name} is now ${pkg.name} ${plan.level}: +${gain} hit points (${data.hp.total}), BtH ${bth}.${plan.note ? ` ${plan.note}` : ""}`, from || record.name);
  return { record: updated, gain, level: plan.level, note: plan.note ?? "" };
}

let combineModule = null;
const combineRules = () => (combineModule ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "siege", "combine.mjs")).href));
const capital = (stat) => `${stat[0].toUpperCase()}${stat.slice(1)}`;

// Changing classes at a level up (the Adventurer's Backpack, as FG's level-up
// wizard): mode "dual" adds a class at 1st level (the combination table, and a
// prime the character already has); "reclass" abandons the class for another.
async function changeClass(table, record, mode, className, from) {
  const { engine } = await siege();
  const combine = await combineRules();
  const library = siegeLibrary(table.records);
  const game = library.game;
  const data = record.data;
  const classes = combine.classPackages(data).map(([, pkg]) => pkg);
  if (classes.length === 0) throw new Error("The character has no class yet: use the Character Wizard.");
  if (classes.length > 1) throw new Error("The character already has two classes (dual classed or reclassed).");
  const current = classes[0];
  const raceClass = "A race class (dwarf, elf, gnome, halfling) cannot be combined with another class (Adventurer's Backpack).";
  if (combine.isRaceClass(current.name)) throw new Error(raceClass);
  const target = library.packages.find((pkg) => String(pkg.packagetype ?? "").toLowerCase() === "class" && engine.plainName(pkg.name) === engine.plainName(className));
  if (!target) throw new Error(`No class "${className}" in this campaign's books.`);
  if (combine.classKey(target.name) === combine.classKey(current.name)) throw new Error("Same class.");
  if (combine.isRaceClass(target.name)) throw new Error(raceClass);
  const exp = Number(data.exp) || 0;
  let result;
  let summary;
  if (mode === "dual") {
    const rule = combine.multiRule(current.name, target.name, data.race);
    if (!rule.allowed) throw new Error(`${target.name}: ${rule.words}`);
    const primes = engine.STATS.filter((stat) => Number(target.primes?.[stat]) === 1);
    if (primes.length && !primes.some((stat) => Number(data.attributes?.[stat]?.prime) === 1)) throw new Error(`Dual class needs a prime the character has (${capital(primes[0])} is not prime); reclass swaps primes.`);
    result = engine.addDualClass(data, target, game);
    summary = `Dual class: ${record.name} adds ${target.name} at 1st level (${current.name} keeps advancing; experience is divided equally).`;
  } else if (mode === "reclass") {
    result = engine.reclass(data, target, game);
    const deityOld = ["cleric", "druid", "paladin"].includes(combine.classKey(String(current.name).split(" ")[0]));
    summary = `Reclass: ${record.name} abandons ${current.name} for ${target.name} (1st level). ${current.name} drops from level ${result.oldLevel} to ${result.newLevel} and loses the hit points of the lost level(s) (${result.removed}).`;
    if (result.loss === 2) summary += ` Leaving a deity-serving class: two levels go and ${current.name}'s abilities can no longer be used (they stay listed on the sheet).`;
    else if (deityOld) summary += ` Deity-serving class to deity-serving class: keeping the same religion, ${current.name}'s abilities stay usable; otherwise the Castle Keeper applies the two-level loss.`;
    else summary += ` Using abilities found only in ${current.name} costs 10% of the adventure's experience (5% for preparing them).`;
    if (result.swapped) summary += ` Primes swap: ${capital(result.swapped.to)} becomes prime, ${result.swapped.from.map(capital).join(", ")} stops being prime.`;
    summary += ` Base to hit and saves use the better of the two classes. Hit points: +${result.gain}.`;
  } else throw new Error("Change class how? dual or reclass.");
  const updated = table.records.update(record.id, { data: result.character }, table.seat, { replace: true });
  table.say(`[LEVEL UP] ${summary}`, from || record.name);
  table.say(combine.trainingNote(exp, target.name), from || record.name);
  return { record: updated, summary };
}

// What the character sheet may change, as typed on FG's sheet: who they are,
// scores and primes, wounds, the misc modifiers, gear (count, where it is,
// carried or worn, dropped), coin and languages. Every number is then worked
// out again by the rules (derive), as FG's sheet does on each change.
const TEXT_FIELDS = new Set(["playername", "gender", "age", "height", "weight", "size", "alignment", "deity", "origin", "appearance", "notes", "specialdefenses", "specialmovement", "senses", "speed"]);
const NUMBER_FIELDS = [
  /^attributes\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.score$/,
  /^attributes\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.prime$/,
  /^hp\.(wounds|temp|nonlethal)$/,
  /^exp$/,
  /^initiative\.misc$/,
  /^attack\.[a-z]+\.misc$/,
  /^ac\.(misc|natural|deflection|size)$/,
  /^sr\.(item|misc)$/,
  /^coins\.id-\d+\.amount$/,
  /^inventorylist\.id-\d+\.count$/,
];
function setPath(data, path, value) {
  const keys = path.split(".");
  let node = data;
  for (const key of keys.slice(0, -1)) node = node[key] = node[key] && typeof node[key] === "object" ? node[key] : {};
  node[keys.at(-1)] = value;
}
async function editCharacter(table, record, changes, seat) {
  if (dnd5e.is5e(record)) return dnd5e.edit5e(table, record, changes, seat);
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const { engine } = await siege();
  const game = siegeLibrary(table.records).game;
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    const path = String(change?.path ?? "");
    const value = change?.value;
    if (path === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT_FIELDS.has(path)) data[path] = String(value ?? "").slice(0, 8000);
    else if (NUMBER_FIELDS.some((pattern) => pattern.test(path))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${path} needs a number.`);
      setPath(data, path, path.endsWith(".prime") ? (n ? 1 : 0) : path.endsWith(".score") ? Math.max(1, Math.min(30, n)) : n);
    } else if (/^inventorylist\.id-\d+\.location$/.test(path)) setPath(data, path, String(value ?? "").slice(0, 80));
    else if (/^inventorylist\.id-\d+\.carried$/.test(path)) {
      const row = data.inventorylist?.[path.split(".")[1]];
      if (!row) throw new Error("That item is gone.");
      engine.setCarried(data, row, [0, 1, 2].includes(Number(value)) ? Number(value) : 1);
    } else if (/^inventorylist\.id-\d+$/.test(path) && value === null) delete data.inventorylist?.[path.split(".")[1]];
    else if (path === "languages.add") {
      const list = (data.languagelist = data.languagelist ?? {});
      const text = String(value ?? "").trim().slice(0, 60);
      if (text && !Object.values(list).some((row) => String(row?.name).toLowerCase() === text.toLowerCase())) list[engine.nextId(list)] = { name: text };
    } else if (/^languagelist\.id-\d+$/.test(path) && value === null) delete data.languagelist?.[path.split(".")[1]];
    else throw new Error(`The sheet cannot change ${path}.`);
  }
  data.name = name;
  const derived = engine.derive(data, game);
  return table.records.update(record.id, { name, data: derived }, table.seat, { replace: true });
}

// A character file from another table (Kraken, Fantasy Grounds, Foundry,
// Roll20) made into a character of this campaign. owner: the player it is
// for ("" for the GM's own); seat: who asks (a player imports their own).
const MAX_IMPORT = 8 * 1024 * 1024;
async function importCharacter(table, fileText, { owner = "", seat } = {}) {
  const body = String(fileText ?? "");
  if (!body.trim()) throw new Error("That file is empty.");
  if (body.length > MAX_IMPORT) throw new Error("That file is too big for a character (8 MB at most).");
  const { interchange } = await siege();
  const { convertXml } = require("./importers/fgModule.cjs");
  const library = siegeLibrary(table.records);
  const { format, character, report } = interchange.readCharacterFile(body, library, { fgXml: convertXml });
  // A portrait or token from another collection may not be in this GM's.
  for (const field of ["portrait", "token"]) if (typeof character[field] === "string" && /^data:|^https?:/.test(character[field])) delete character[field];
  const name = String(character.name || "Imported character").slice(0, 80);
  const record = table.records.create({ type: "character", name, owner, visibility: owner ? "owner" : "gm", data: { ...character, name } }, seat ?? table.seat);
  return { record, format, report };
}

// A character as a file: "kraken" (JSON, the whole sheet) or "fg" (FG's character XML).
async function exportCharacter(record, format = "kraken") {
  const { interchange } = await siege();
  if (format === "fg") return { text: interchange.toFgXml(record), file: `${record.name}.xml`, type: "application/xml" };
  return { text: interchange.toKrakenFile(record), file: `${record.name}.kraken.json`, type: "application/json" };
}

module.exports = { siege, siegeLibrary, siegeCheck, levelUp, changeClass, editCharacter, importCharacter, exportCharacter, ATTRIBUTES };
