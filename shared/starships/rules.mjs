// Starships for Kraken's 2d6 games (Apeira Astra and Traveller): one model of
// a ship and its fight, Kraken's own (the designs and numbers are Kraken's;
// Traveller's MGT2 space combat the model). Plain functions (no Node, no DOM)
// used by the host, the tracker and the ship's sheet.
//
// A starship record (type "starship") holds:
//   ruleset "starship", class, tons, tl, hull {max, damage} (hull points:
//   tons / 2.5), armour, thrust, jump, power, fuel, sensors (a DM to attacks
//   and sensor tasks), computer (fire control: a DM to attacks), weapons {id:
//   {name, mount, damage, range, dm, ap, gunner (a character's record id)}},
//   crew {pilot, engineer, sensors, captain: record ids}, criticals {system:
//   severity}, cargo, crewcount, cost, notes.
//
// A fight: initiative 2d6 + the pilot's Pilot (Apeira Astra: Pilot) + Thrust.
// An attack: 2d6 + the gunner's skill (Traveller: Gunner (Turret); Apeira
// Astra: Gunnery) + its characteristic DM + the weapon's DM + the ship's
// computer and sensors + the range's DM, against 8; the Effect adds to the
// damage, the target's armour (less AP) comes off it, and what is left comes
// off the target's hull. An Effect of 6 or more that does damage is a
// critical hit: 2d6 for the system hit, its severity one more. A ship is
// destroyed at 0 hull.

export const RULESET = "starship";
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// Range bands and the DM to hit at each.
export const RANGES = [
  ["Adjacent", 0],
  ["Close", 0],
  ["Short", 1],
  ["Medium", 0],
  ["Long", -2],
  ["Very Long", -4],
  ["Distant", -6],
];
export const rangeIndex = (band) => Math.max(0, RANGES.findIndex(([name]) => name.toLowerCase() === String(band ?? "").toLowerCase()));
export const rangeDm = (band) => RANGES[rangeIndex(band)][1];
// On a space map, the squares between two ships' tokens as a band (a square
// is a thousand kilometres or so: 0 alongside, then 1, 3, 8, 20, 50, beyond).
export const RANGE_SQUARES = [0, 1, 3, 8, 20, 50];
export const bandForSquares = (squares) => RANGES[Math.min(6, RANGE_SQUARES.filter((limit) => squares > limit).length)][0];

// Ship weapons: name, damage, longest range, DM, AP, traits.
export const WEAPONS = [
  ["Pulse Laser", "2D", "Long", 2, 0, ""],
  ["Beam Laser", "1D", "Medium", 4, 0, ""],
  ["Particle Beam", "3D", "Very Long", 0, 0, "Radiation"],
  ["Missile Rack", "4D", "Distant", 0, 0, "Smart"],
  ["Railgun Barbette", "5D", "Long", 0, 2, ""],
  ["Mass Driver", "4D", "Very Long", -1, 0, ""],
];
export const weaponByName = (name) => WEAPONS.find((row) => row[0].toLowerCase() === String(name ?? "").toLowerCase()) ?? null;
export function makeWeapon(name, mount = "Turret") {
  const row = weaponByName(name);
  if (!row) return null;
  return { name: row[0], mount, damage: row[1], range: row[2], dm: row[3], ap: row[4], traits: row[5] };
}
// Traveller's dice ("2D", "4D+2") as a dice formula.
export function diceOf(text) {
  const match = /(\d*)\s*d\s*(\d+)?\s*([+-]\s*\d+)?/i.exec(String(text ?? ""));
  if (!match) return "";
  const bonus = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;
  return `${match[1] || 1}d${match[2] || 6}${bonus ? signed(bonus) : ""}`;
}

// The systems a critical hit can strike (2d6), and what each severity does.
export const CRITICALS = [
  [2, "sensors", "Sensors"],
  [3, "power", "Power Plant"],
  [4, "fuel", "Fuel"],
  [5, "weapon", "Weapon"],
  [6, "armour", "Armour"],
  [7, "hull", "Hull"],
  [8, "mdrive", "M-Drive"],
  [9, "cargo", "Cargo"],
  [10, "jdrive", "J-Drive"],
  [11, "crew", "Crew"],
  [12, "computer", "Computer"],
];
export const criticalFor = (roll) => CRITICALS.find(([value]) => value === roll) ?? CRITICALS[5];
export const CRITICAL_WORDS = {
  sensors: (n) => `${n * -1} to the ship's attacks and sensor tasks`,
  power: (n) => `power plant failing: thrust -${n}`,
  fuel: (n) => `fuel leaking (${n * 10}% lost)`,
  weapon: (n) => `a weapon ${n >= 2 ? "destroyed" : "disabled until repaired"}`,
  armour: (n) => `armour -${n}`,
  hull: (n) => `${n}D more hull damage`,
  mdrive: (n) => `thrust -${n}`,
  cargo: (n) => `${n * 10}% of the cargo lost`,
  jdrive: (n) => (n >= 2 ? "jump drive out" : "jump drive damaged (jump -1)"),
  crew: (n) => `a crew member hurt (${n}D damage)`,
  computer: (n) => `${n * -1} to the ship's attacks`,
};

// Kraken's ship designs (its own numbers and names), for either game.
const design = (klass, tons, tl, armour, thrust, jump, sensors, computer, weapons, crewcount, cost, notes) => ({ class: klass, tons, tl, armour, thrust, jump, sensors, computer, weapons, crewcount, cost, notes });
export const DESIGNS = [
  design("Courier", 100, 12, 2, 2, 2, 0, 1, [["Pulse Laser"]], 3, "MCr 37", "A small fast hull for messages, survey and people who would rather not be found."),
  design("Free Trader", 200, 12, 2, 1, 1, 0, 0, [["Pulse Laser"]], 5, "MCr 52", "A boxy cargo hauler with two bays and a loan. The Reach's workhorse."),
  design("Salvage Tug", 300, 11, 4, 2, 1, -1, 0, [["Beam Laser"], ["Mass Driver"]], 6, "MCr 70", "Grapples, cutting rigs and a hold big enough for a hull section."),
  design("Patrol Cutter", 400, 13, 6, 4, 2, 2, 2, [["Pulse Laser"], ["Missile Rack"], ["Beam Laser"]], 10, "MCr 160", "An armed customs and patrol ship: fast, well armed and nosy."),
  design("Fighter", 10, 13, 6, 6, 0, 1, 1, [["Pulse Laser", "Fixed"]], 1, "MCr 18", "A one-seat attack craft carried by bigger ships."),
  design("Corsair", 400, 12, 5, 3, 2, 1, 1, [["Particle Beam"], ["Pulse Laser"], ["Missile Rack"]], 12, "MCr 140", "A raider: a gutted trader with its holds full of guns."),
];
export const designByName = (name) => DESIGNS.find((item) => item.class.toLowerCase() === String(name ?? "").toLowerCase()) ?? null;
export const hullFor = (tons) => Math.max(1, Math.floor(num(tons, 100) / 2.5));

// A ship's numbers worked out from its base fields (criticals included).
export function derive(input) {
  const data = { ...input, ruleset: RULESET };
  data.tons = Math.max(1, Math.round(num(input.tons, 100)));
  const max = Math.max(1, Math.round(num(input.hull?.max, hullFor(data.tons))));
  data.hull = { max, damage: Math.min(max, Math.max(0, Math.round(num(input.hull?.damage, 0)))) };
  const crit = Object.fromEntries(rows(input.criticals).map(([key, value]) => [key, Math.max(0, Math.min(6, Math.round(num(value, 0))))]).filter(([, value]) => value > 0));
  data.criticals = crit;
  data.armourBase = Math.max(0, Math.round(num(input.armourBase ?? input.armour, 0)));
  data.armour = Math.max(0, data.armourBase - num(crit.armour, 0));
  data.thrustBase = Math.max(0, Math.round(num(input.thrustBase ?? input.thrust, 1)));
  data.thrust = Math.max(0, data.thrustBase - num(crit.mdrive, 0) - num(crit.power, 0));
  data.jump = Math.max(0, Math.round(num(input.jump, 0)));
  data.sensors = Math.round(num(input.sensors, 0));
  data.computer = Math.round(num(input.computer, 0));
  data.fireControl = data.sensors + data.computer - num(crit.sensors, 0) - num(crit.computer, 0);
  data.weapons = Object.fromEntries(
    rows(input.weapons).map(([key, weapon]) => {
      const known = weaponByName(weapon.name);
      return [key, { name: String(weapon.name ?? "Weapon"), mount: String(weapon.mount ?? "Turret"), damage: String(weapon.damage ?? known?.[1] ?? "1D"), range: String(weapon.range ?? known?.[2] ?? "Medium"), dm: Math.round(num(weapon.dm, known?.[3] ?? 0)), ap: Math.round(num(weapon.ap, known?.[4] ?? 0)), traits: String(weapon.traits ?? known?.[5] ?? ""), gunner: String(weapon.gunner ?? ""), disabled: Boolean(weapon.disabled) }];
    }),
  );
  data.crew = Object.fromEntries(["pilot", "engineer", "sensors", "captain"].map((station) => [station, String(input.crew?.[station] ?? "")]));
  data.state = data.hull.damage >= data.hull.max ? "Destroyed" : data.hull.damage > 0 ? "Damaged" : "Intact";
  return data;
}

// A ship from a design (and a name).
export function fromDesign(name, klass) {
  const plan = designByName(klass) ?? DESIGNS[0];
  const weapons = Object.fromEntries(plan.weapons.map(([weapon, mount], index) => [`w${index + 1}`, makeWeapon(weapon, mount ?? "Turret")]));
  return { name: String(name ?? "").trim() || `The ${plan.class}`, data: derive({ class: plan.class, tons: plan.tons, tl: plan.tl, armour: plan.armour, thrust: plan.thrust, jump: plan.jump, sensors: plan.sensors, computer: plan.computer, weapons, crewcount: plan.crewcount, cost: plan.cost, notes: plan.notes, hull: { max: hullFor(plan.tons), damage: 0 } }) };
}

// The skill a station rolls in each game, and its characteristic.
export const STATION_SKILLS = {
  Traveller: { gunner: ["Gunner (Turret)", "dex"], pilot: ["Pilot (Spacecraft)", "dex"], sensors: ["Electronics (Sensors)", "int"], engineer: ["Engineer (M-Drive)", "edu"] },
  "Apeira Astra": { gunner: ["Gunnery", "intellect"], pilot: ["Pilot", "reflex"], sensors: ["Electronics", "training"], engineer: ["Engineering", "training"] },
};
