const path = require("path");
const { pathToFileURL } = require("url");
const dnd5e = require("./dnd5e.cjs");
const dnd35 = require("./dnd35.cjs");
const adnd2e = require("./adnd2e.cjs");
const astra = require("./astra.cjs");
const mgt2 = require("./mgt2.cjs");
const cairn = require("./cairn.cjs");
const bfrpg = require("./bfrpg.cjs");

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
  // A 3.5E character: its check, save (fortitude, reflex, will) or skill against a DC.
  // An AD&D 2E character: a save (d20 at or above its number), an ability check (d20 at or under the score) or a thief skill (d100).
  // A Basic Fantasy character: a save (d20 at or above), the ability roll (d20 + bonus at or above the level's target), a thief ability (d100) or loyalty (2d6).
  if (bfrpg.isBf(record)) return bfrpg.checkBf(table, record, { kind: kind ?? (/save/i.test(String(label ?? "")) ? "save" : "check"), attribute, skill, bonus, label: kind ? label : undefined }, from);
  if (adnd2e.is2e(record)) return adnd2e.check2e(table, record, { kind: kind ?? (/save/i.test(String(label ?? "")) ? "save" : "check"), attribute, skill, bonus, label: kind ? label : undefined }, from);
  if (dnd35.is35(record)) return dnd35.check35(table, record, { kind: kind ?? (/save/i.test(String(label ?? "")) ? "save" : "check"), attribute, skill, dc: dc ?? cl, bonus, label: kind ? label : undefined }, from);
  if (dnd5e.is5e(record)) return dnd5e.check5e(table, record, { kind: kind ?? (/save/i.test(String(label ?? "")) ? "save" : "check"), attribute, skill, dc: dc ?? cl, bonus, advantage, label: kind ? label : undefined }, from);
  // Cairn: a save, d20 at or under STR, DEX or WIL (a 1 succeeds, a 20 fails).
  if (cairn.isCairn(record)) return cairn.saveCairn(table, record, { attribute, label: kind ? label : undefined }, from);
  // Apeira Astra: a task (2d6 + skill + characteristic against 8); dc is the difficulty's shift, advantage boon/bane.
  if (astra.isAstra(record)) return astra.taskAstra(table, record, { skill, attribute, difficulty: Number(bonus) || 0, boon: advantage, label: kind ? label : undefined }, from);
  // Traveller: a task (2d6 + DM + skill against the difficulty's number: dc, Average 8); bonus a modifier, advantage boon/bane.
  if (mgt2.isMgt2(record)) return mgt2.taskMgt2(table, record, { skill, attribute, difficulty: Number(dc ?? cl) || 8, modifier: Number(bonus) || 0, boon: advantage, label: kind ? label : undefined }, from);
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
  if (dnd35.is35(record)) return dnd35.levelUp35(table, record, from);
  if (adnd2e.is2e(record)) return adnd2e.levelUp2e(table, record, from, packageKey);
  if (cairn.isCairn(record)) throw new Error("Cairn has no levels: a character grows from what happens to them (Scars, Growth, Downtime).");
  if (bfrpg.isBf(record)) return bfrpg.levelUpBf(table, record, from);
  if (astra.isAstra(record)) throw new Error("Apeira Astra has no levels: spend experience on a skill or a characteristic (Improve).");
  if (mgt2.isMgt2(record)) throw new Error("Traveller has no levels: change a skill or a characteristic on the sheet (training, a new term).");
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
  if (dnd35.is35(record)) return dnd35.edit35(table, record, changes, seat);
  if (adnd2e.is2e(record)) return adnd2e.edit2e(table, record, changes, seat);
  if (cairn.isCairn(record)) return cairn.editCairn(table, record, changes, seat);
  if (bfrpg.isBf(record)) return bfrpg.editBf(table, record, changes, seat);
  if (astra.isAstra(record)) return astra.editAstra(table, record, changes, seat);
  if (mgt2.isMgt2(record)) return mgt2.editMgt2(table, record, changes, seat);
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
    else if (path === "inventory.add") {
      // FG's + on the inventory list: an item by name, carried.
      const itemName = String(value ?? "").trim().slice(0, 120);
      if (!itemName) throw new Error("Which item?");
      const list = (data.inventorylist = data.inventorylist ?? {});
      list[engine.nextId(list)] = { name: itemName, count: 1, carried: 1 };
    } else throw new Error(`The sheet cannot change ${path}.`);
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

// A record dropped on a character sheet goes where it belongs, as FG's
// SiegeChar.handleSheetDrop: a package (race or class) into the packages at
// 1st level, its primes set; a power (a spell) into the powers, bound to the
// one class that casts it; an item into the gear. The sheet is worked out
// again and chat says what was added. A 5E sheet takes items.
async function dropOnCharacter(table, record, source, from) {
  if (!source) throw new Error("Nothing to drop.");
  const who = from || record.name;
  if (cairn.isCairn(record)) {
    if (source.type !== "item") throw new Error("A Cairn sheet takes items; a background comes with the character wizard.");
    const data = structuredClone(record.data);
    const list = (data.inventorylist = data.inventorylist ?? {});
    const { fgPath: _path, cost: _cost, ...copy } = source.data ?? {};
    const rules = await cairn.rulesCairn();
    let n = Object.keys(list).length + 1;
    while (list[`id-${String(n).padStart(5, "0")}`]) n += 1;
    list[`id-${String(n).padStart(5, "0")}`] = { ...copy, name: source.name, count: 1, carried: rules.isArmor(copy) ? 2 : 1 };
    const updated = table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
    const summary = `${record.name} gets ${source.name}.`;
    table.say(summary, who, record.visibility === "gm");
    return { record: updated, added: "item", summary };
  }
  if (astra.isAstra(record) || mgt2.isMgt2(record)) {
    if (source.type !== "item") throw new Error(astra.isAstra(record) ? "An Apeira Astra sheet takes gear; Origins and Paths come with the character wizard." : "A Traveller sheet takes gear.");
    const data = structuredClone(record.data);
    const list = (data.inventorylist = data.inventorylist ?? {});
    const { fgPath: _path, ...copy } = source.data ?? {};
    const rules = astra.isAstra(record) ? await astra.rulesAstra() : await mgt2.rulesMgt2();
    const key = `id-${String(Object.keys(list).length + 1).padStart(5, "0")}`;
    list[key] = { ...copy, name: source.name, count: 1, carried: rules.isArmour(copy) || rules.isWeapon(copy) ? 2 : 1 };
    const updated = table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
    const summary = `${record.name} gets ${source.name}.`;
    table.say(summary, who, record.visibility === "gm");
    return { record: updated, added: "item", summary };
  }
  if (bfrpg.isBf(record)) {
    // A Basic Fantasy sheet takes items (a weapon, armor or shield ready) and spells (a Magic-User's into the spellbook, a Cleric's prepared).
    const data = structuredClone(record.data);
    const rules = await bfrpg.rulesBf();
    let added;
    if (source.type === "item") {
      const list = (data.inventorylist = data.inventorylist ?? {});
      const { engine } = await siege();
      const { fgPath: _path, ...copy } = structuredClone(source.data ?? {});
      list[engine.nextId(list)] = { ...copy, name: source.name, count: 1, carried: rules.isWeapon(copy) || rules.isArmor(copy) || rules.isShield(copy) ? 2 : 1 };
      added = "item";
    } else if (source.type === "spell") {
      const key = rules.casterOf(data.class)?.kind === "arcane" ? "spellbook" : "prepared";
      data[key] = [...new Set([...(Array.isArray(data[key]) ? data[key] : []), source.name])];
      added = "spell";
    } else throw new Error("A Basic Fantasy sheet takes items and spells; race and class come with the character wizard.");
    const updated = table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
    table.say(`${record.name} gets ${source.name}.`, who, record.visibility === "gm");
    return { record: updated, added };
  }
  if (adnd2e.is2e(record)) {
    // A 2E sheet takes items (into the gear: a weapon, armor or shield worn) and spells (by name).
    const data = structuredClone(record.data);
    const rules = await adnd2e.rules2e();
    let added;
    if (source.type === "item") {
      const list = (data.inventorylist = data.inventorylist ?? {});
      const { engine } = await siege();
      const { fgPath: _path, ...copy } = structuredClone(source.data ?? {});
      list[engine.nextId(list)] = { ...copy, name: source.name, count: 1, carried: rules.isWeapon(copy) || rules.isArmor(copy) || rules.isShield(copy) ? 2 : 1 };
      added = "item";
    } else if (source.type === "spell") {
      data.spells = [...new Set([...(Array.isArray(data.spells) ? data.spells : []), source.name])];
      added = "spell";
    } else throw new Error("A 2E sheet takes items and spells; race and class come with the Character Wizard and level up.");
    const updated = table.records.update(record.id, { data: rules.derive(data) }, table.seat, { replace: true });
    table.say(`${record.name} gets ${source.name}.`, who, record.visibility === "gm");
    return { record: updated, added };
  }
  if (dnd35.is35(record)) {
    // A 3.5E sheet takes items (into the gear, a weapon or armor worn), feats and spells (by name).
    const data = structuredClone(record.data);
    let added;
    if (source.type === "item") {
      const list = (data.inventorylist = data.inventorylist ?? {});
      const { engine } = await siege();
      const rules = await dnd35.rules35();
      list[engine.nextId(list)] = { ...structuredClone(source.data), name: source.name, count: 1, carried: rules.isWeapon(source.data) || rules.isArmor(source.data) || rules.isShield(source.data) ? 2 : 1 };
      added = "item";
    } else if (source.type === "feat" || source.type === "spell") {
      const key = source.type === "feat" ? "feats" : "spells";
      data[key] = [...new Set([...(Array.isArray(data[key]) ? data[key] : []), source.name])];
      added = source.type;
    } else throw new Error("A 3.5E sheet takes items, feats and spells; race and class come with the Character Wizard and level up.");
    const updated = table.records.update(record.id, { data: (await dnd35.rules35()).derive(data) }, table.seat, { replace: true });
    table.say(`${record.name} gets ${source.name}.`, who, record.visibility === "gm");
    return { record: updated, added };
  }
  if (dnd5e.is5e(record)) {
    if (source.type !== "item") throw new Error("A 5E sheet takes items; classes, species and spells come with the Character Wizard and level up.");
    const data = structuredClone(record.data);
    const list = (data.inventorylist = data.inventorylist ?? {});
    const { engine } = await siege();
    list[engine.nextId(list)] = { ...structuredClone(source.data), name: source.name, count: 1, carried: 1 };
    const updated = table.records.update(record.id, { data: (await dnd5e.rules5e()).derive(data) }, table.seat, { replace: true });
    table.say(`${record.name} gets ${source.name}.`, who, record.visibility === "gm");
    return { record: updated, added: "item" };
  }
  const { engine, builder } = await siege();
  const game = siegeLibrary(table.records).game;
  const data = structuredClone(record.data);
  const copy = { ...structuredClone(source.data), name: source.data?.name ?? source.name };
  delete copy.public;
  let summary;
  let added;
  if (source.type === "siegepackage") {
    const kind = String(copy.packagetype ?? "").toLowerCase();
    const packages = (data.packages = data.packages ?? {});
    const same = Object.values(packages).find((pkg) => engine.plainName(pkg?.name) === engine.plainName(copy.name));
    if (same) throw new Error(`${record.name} already has ${copy.name}.`);
    if (kind === "race") {
      for (const [key, pkg] of Object.entries(packages)) if (String(pkg?.packagetype ?? "").toLowerCase() === "race") delete packages[key];
      data.race = copy.name;
      for (const field of ["size", "speed", "senses"]) if (copy[field]) data[field] = copy[field];
    }
    const classLike = Object.keys(copy.levels ?? {}).length > 0;
    if (classLike && Object.values(packages).some((pkg) => Object.keys(pkg?.levels ?? {}).length > 0)) {
      throw new Error(`${record.name} already has a class. A second class comes at a level up (dual class or reclass), as the Player's Handbook says.`);
    }
    const pkg = { ...copy, level: 1 };
    if (classLike) {
      // 1st level's hit points: the die's highest, plus the Constitution bonus (at least 1), as the wizard does.
      const { dice, flat } = engine.levelGain(copy, 1);
      const con = engine.abilityBonus(Number(data.attributes?.constitution?.score ?? 10), game);
      let gain = flat;
      if (dice.length > 0) gain = Math.max(1, dice.reduce((sum, die) => sum + (Number(String(die).slice(1)) || 0), flat) + con);
      pkg.hproll = 1;
      pkg.hplog = { l1: gain };
      data.hp = { ...(data.hp ?? {}), total: (Number(data.hp?.total) || 0) + gain };
    }
    packages[engine.nextId(packages)] = pkg;
    data.attributes = data.attributes ?? {};
    const primes = [];
    for (const stat of engine.STATS) {
      if (Number(copy.primes?.[stat]) === 1) {
        data.attributes[stat] = { ...(data.attributes[stat] ?? {}), prime: 1 };
        primes.push(stat);
      }
    }
    added = kind || "package";
    summary = `${record.name}: ${kind ? kind[0].toUpperCase() + kind.slice(1) : "Package"}: ${copy.name}${classLike ? ` (level 1, ${pkg.hplog.l1} hit points)` : ""}${primes.length ? `; prime ${primes.map((stat) => stat[0].toUpperCase() + stat.slice(1)).join(", ")}` : ""}.`;
    if (Number(copy.primechoice) > 0) summary += ` ${copy.name} lets ${record.name} choose ${copy.primechoice} more prime${Number(copy.primechoice) > 1 ? "s" : ""} (tick them on the sheet).`;
  } else if (source.type === "siegepower") {
    const powers = (data.powers = data.powers ?? {});
    if (Object.values(powers).some((power) => engine.plainName(power?.name) === engine.plainName(copy.name))) throw new Error(`${record.name} already has ${copy.name}.`);
    const row = { ...copy, used: 0 };
    // Bound only when exactly one of the character's classes casts it (FG's getPowerPoolChoices).
    const pools = Object.values(data.packages ?? {})
      .map((pkg) => ({ pool: String(pkg?.spellclass ?? "").replace(/[^A-Za-z0-9_]/g, "").toLowerCase(), level: pkg?.spellclass ? builder.powerLevelFor(copy, pkg.spellclass) : null }))
      .filter((item) => item.pool && item.level !== null);
    if (pools.length === 1) {
      row.spellpool = pools[0].pool;
      row.spelllevel = pools[0].level;
      row.level = pools[0].level;
    }
    powers[engine.nextId(powers)] = row;
    added = "power";
    summary = `${record.name} adds ${copy.name}${pools.length === 1 ? ` (level ${pools[0].level})` : ""}.`;
  } else if (source.type === "item") {
    const row = engine.addItem(data, copy, game);
    added = "item";
    summary = `${record.name} gets ${copy.name}${Number(row.carried) === 2 ? " (equipped)" : ""}.`;
  } else throw new Error(`A ${source.type} does not go on a character sheet.`);
  // A character made by hand gets its race and class's portrait and token, as the wizard gives them (none of its own chosen yet).
  if (added === "package" && typeof table.art === "function" && (!data.portrait || !data.token)) {
    const cls = Object.values(data.packages ?? {}).find((pkg) => pkg && pkg.levels)?.name ?? "";
    Object.assign(data, require("./characterArt.cjs").withArt(data, { race: data.race, class: cls }, table.art));
  }
  const updated = table.records.update(record.id, { data: engine.derive(data, game) }, table.seat, { replace: true });
  // A character the players do not see: only the GM hears what it got.
  table.say(summary, who, record.visibility === "gm");
  return { record: updated, added, summary };
}

module.exports = { siege, siegeLibrary, siegeCheck, levelUp, changeClass, dropOnCharacter, editCharacter, importCharacter, exportCharacter, ATTRIBUTES };
