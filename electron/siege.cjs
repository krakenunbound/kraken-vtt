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

module.exports = { siege, siegeLibrary, siegeCheck, ATTRIBUTES };
