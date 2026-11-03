const path = require("path");
const { pathToFileURL } = require("url");

// Host side of the SIEGE engine (shared/siege, ES modules shared with the
// app window): the game library from the campaign's imported records, and
// checks made in front of the table.

let loaded = null;
function siege() {
  if (!loaded) {
    const base = path.join(__dirname, "..", "shared", "siege");
    loaded = Promise.all([import(pathToFileURL(path.join(base, "engine.mjs")).href), import(pathToFileURL(path.join(base, "builder.mjs")).href)]).then(
      ([engine, builder]) => ({ engine, builder }),
    );
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
async function siegeCheck(table, record, { attribute, cl = 0, bonus = 0, addLevel, label } = {}, from) {
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
  table.say(`[LEVEL UP] ${record.name} is now ${pkg.name} ${plan.level}: +${gain} hit points (${data.hp.total}), BtH ${bth}.`, from || record.name);
  return { record: updated, gain, level: plan.level };
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

module.exports = { siege, siegeLibrary, siegeCheck, levelUp, editCharacter, ATTRIBUTES };
