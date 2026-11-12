const path = require("path");
const { pathToFileURL } = require("url");

// Host side of starships (shared/starships/rules.mjs), for Kraken's 2d6
// games: ships made from Kraken's designs (or from nothing), their sheet's
// edits (the GM's: hull, armour, weapons, criticals; a player may take a
// station with their own character), and a station's skill for a crew
// member (Traveller's Gunner (Turret), Apeira Astra's Gunnery...).

let loaded = null;
const rulesShips = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "starships", "rules.mjs")).href));
const isShip = (record) => record?.type === "starship";
const shipsRuleset = (name) => ["Traveller", "Apeira Astra"].includes(String(name ?? ""));

async function createShip(table, { name, design = "Free Trader", visibility = "all" } = {}, seat) {
  if (!shipsRuleset(table.ruleset?.())) throw new Error("Starships are for Traveller and Apeira Astra campaigns.");
  if (seat.role !== "dm") throw new Error("The GM makes the ships.");
  const rules = await rulesShips();
  if (!rules.designByName(design)) throw new Error(`No design ${design}: ${rules.DESIGNS.map((item) => item.class).join(", ")}.`);
  const built = rules.fromDesign(name, design);
  // Its token: Kraken's picture of the design (games/tokens/Ships).
  const art = typeof table.art === "function" ? (table.art("token") ?? []).find((item) => item.name.toLowerCase() === `ships ${String(design).toLowerCase()}`) : null;
  const data = art ? { ...built.data, token: art.id } : built.data;
  return table.records.create({ type: "starship", name: built.name, visibility: ["gm", "all"].includes(visibility) ? visibility : "all", data }, table.seat);
}

// What the ship's sheet may change. The GM: everything here; a player: a
// station or a weapon's gunner, for their own character (or leaving it).
const TEXT = new Set(["class", "notes", "cargo", "cost"]);
const NUMBERS = [/^tons$/, /^tl$/, /^hull\.(max|damage)$/, /^armour$/, /^thrust$/, /^jump$/, /^sensors$/, /^computer$/, /^fuel$/, /^crewcount$/, /^criticals\.(sensors|power|fuel|weapon|armour|hull|mdrive|cargo|jdrive|crew|computer)$/, /^weapons\.[a-z0-9-]+\.(dm|ap)$/];
async function editShip(table, record, changes, seat) {
  if (!isShip(record)) throw new Error("That is not a starship.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesShips();
  const data = structuredClone(record.data);
  let name = record.name;
  const gm = seat.role === "dm";
  // A station taken by a player must be their own character (or left empty, if it was theirs).
  const mine = (id) => {
    if (!id) return true;
    const who = table.records.get(String(id));
    return who?.type === "character" && (gm || who.owner === seat.name);
  };
  for (const change of changes.slice(0, 50)) {
    const key = String(change?.path ?? "");
    const value = change?.value;
    const station = /^crew\.(pilot|engineer|sensors|captain)$/.exec(key);
    const gunner = /^weapons\.([a-z0-9-]+)\.gunner$/.exec(key);
    if (station || gunner) {
      const before = station ? data.crew?.[station[1]] : data.weapons?.[gunner[1]]?.gunner;
      if (gunner && !data.weapons?.[gunner[1]]) throw new Error("No such weapon.");
      if (!mine(value) || (!gm && before && !mine(before))) throw new Error("Take a station with your own character.");
      if (station) data.crew = { ...(data.crew ?? {}), [station[1]]: String(value ?? "") };
      else data.weapons[gunner[1]].gunner = String(value ?? "");
      continue;
    }
    if (!gm) throw new Error("Only the GM changes the ship itself.");
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "weapons.add") {
      const weapon = rules.makeWeapon(value?.name ?? value, value?.mount ?? "Turret");
      if (!weapon) throw new Error(`No ship weapon ${value?.name ?? value}: ${rules.WEAPONS.map((row) => row[0]).join(", ")}.`);
      const next = Object.keys(data.weapons ?? {}).length + 1;
      data.weapons = { ...(data.weapons ?? {}), [`w${next}-${Date.now().toString(36).slice(-3)}`]: weapon };
    } else if (/^weapons\.[a-z0-9-]+$/.test(key) && value === null) delete data.weapons?.[key.split(".")[1]];
    else if (/^weapons\.[a-z0-9-]+\.disabled$/.test(key)) {
      if (!data.weapons?.[key.split(".")[1]]) throw new Error("No such weapon.");
      data.weapons[key.split(".")[1]].disabled = Boolean(value);
    } else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw new Error(`${key} needs a number.`);
      const parts = key.split(".");
      if (parts[0] === "weapons" && !data.weapons?.[parts[1]]) throw new Error("No such weapon.");
      let node = data;
      for (const part of parts.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
      // The base numbers (criticals come off them).
      const last = parts.at(-1);
      if (parts.length === 1 && last === "armour") data.armourBase = n;
      else if (parts.length === 1 && last === "thrust") data.thrustBase = n;
      node[last] = n;
    } else throw new Error(`The ship's sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

// A crew member's DM for a station's task: their skill and characteristic,
// by the campaign's game (untrained as the game says). No one there: -3.
async function stationDm(table, station, characterId) {
  const ruleset = table.ruleset?.();
  const rules = await rulesShips();
  const plan = rules.STATION_SKILLS[ruleset]?.[station];
  const who = characterId ? table.records.get(String(characterId)) : null;
  if (!plan || !who || who.type !== "character") return { dm: -3, label: "no one there", who: null };
  if (ruleset === "Traveller") {
    const mgt = await require("./mgt2.cjs").rulesMgt2();
    const { modifier } = mgt.taskModifier(mgt.derive(who.data), plan[0], plan[1]);
    return { dm: modifier, label: `${who.name}'s ${plan[0]}`, who };
  }
  const astra = await require("./astra.cjs").rulesAstra();
  const { modifier } = astra.taskModifier(who.data, plan[0], plan[1]);
  return { dm: modifier, label: `${who.name}'s ${plan[0]}`, who };
}

// A ship's token size: a fighter or a courier 1 square, a trader 2, 300 tons and up 3.
const shipSquares = (tons) => (Number(tons) >= 300 ? 3 : Number(tons) >= 150 ? 2 : 1);

module.exports = { rulesShips, createShip, editShip, stationDm, isShip, shipsRuleset, shipSquares };
