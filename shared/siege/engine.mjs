// The SIEGE engine: the generic rules SiegeCore implements for Fantasy Grounds,
// rebuilt for Kraken VTT. It knows no game: classes, races, items, spells and
// the rule switches all come from records (FG packages, items, powers and a
// Game Settings record, imported from modules the GM owns). Castles & Crusades
// is one such game.
//
// A character is plain JSON with SiegeCore's field names, so a sheet built in
// Kraken and one built in FG can be compared field by field:
//   attributes.<stat>.{score, prime, bonus}, packages.<id> (a package copy with
//   level, hproll, hplog), level, bth, hitdice, exp, expnext, hp.{total, wounds},
//   ac.{total, dex, armor, shield, ...}, inventorylist.<id>, coins, powers.<id>.

export const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
export const STAT_SHORT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };

// SiegeCore's registered defaults; a Game Settings record overrides them.
export const DEFAULT_OPTIONS = {
  SIEGE_CB_PRIME: "12",
  SIEGE_CB_SECONDARY: "18",
  SIEGE_ADD_LEVEL: "on",
  SIEGE_CL_FROM_TARGET: "on",
  SIEGE_OPPOSED_PRIME: "off",
  SIEGE_NAT20: "off",
  ATK_ADD_ATTR: "on",
  SIEGE_MELEE_STAT: "strength",
  SIEGE_RANGED_STAT: "dexterity",
  SIEGE_MELEE_DMG_STAT: "none",
  SIEGE_RANGED_DMG_STAT: "none",
  SIEGE_INIT_DIE: "10",
  SIEGE_INIT_STAT: "dexterity",
  SIEGE_HP_DYING: "-7",
  SIEGE_HP_DEAD: "-10",
  SIEGE_HP_CON: "on",
  SIEGE_HP_MIN1: "on",
  SIEGE_HP_FIRST_MAX: "off",
  SIEGE_PKG_LEVEL: "highest",
  SIEGE_PKG_BTH: "highest",
  SIEGE_AC_AUTO: "on",
  SIEGE_AUTO_EQUIP: "on",
  SIEGE_AC_BASE: "10",
  SIEGE_AC_DEX: "on",
  SIEGE_AC_HEAD: "off",
  SIEGE_PRIME_LIMIT: "on",
};

export function gameOptions(game) {
  return { ...DEFAULT_OPTIONS, ...(game?.options ?? {}) };
}

const isOn = (options, key) => String(options[key] ?? "").toLowerCase() === "on";
const numberOption = (options, key, fallback) => {
  const value = Number(options[key]);
  return Number.isFinite(value) ? value : fallback;
};

// Default modifier table (DataCommon.getAbilityBonus). A game's own table is
// game.modifiers: rows { score, bonus }, each covering scores up to its score.
export function abilityBonus(score, game) {
  const n = Number(score);
  const value = Number.isFinite(n) ? n : 0;
  const rows = game?.modifiers ? Object.values(game.modifiers).filter((row) => row && Number.isFinite(Number(row.score))) : [];
  if (rows.length > 0) {
    rows.sort((a, b) => Number(a.score) - Number(b.score));
    for (const row of rows) if (value <= Number(row.score)) return Number(row.bonus) || 0;
    return Number(rows[rows.length - 1].bonus) || 0;
  }
  if (value <= 1) return -4;
  if (value <= 3) return -3;
  if (value <= 5) return -2;
  if (value <= 8) return -1;
  if (value <= 12) return 0;
  if (value <= 15) return 1;
  if (value <= 17) return 2;
  if (value <= 19) return 3;
  if (value <= 21) return 4;
  if (value <= 23) return 5;
  return 6;
}

// Names compared in lower case, letters and digits only ("Rogue's Tools").
export function plainName(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rows(pkg) {
  return Object.values(pkg?.levels ?? {}).filter((row) => row && typeof row === "object");
}

// The package's row for a level: the highest row at or below it.
export function progressionRow(pkg, level) {
  let best = null;
  for (const row of rows(pkg)) {
    const n = Number(row.level) || 0;
    if (n <= level && (!best || n > Number(best.level))) best = row;
  }
  return best;
}

export function exactRow(pkg, level) {
  return rows(pkg).find((row) => Number(row.level) === level) ?? null;
}

// "10d10+4" -> { counts: { d10: 10 }, flat: 4 }.
export function parseHD(text) {
  const counts = {};
  let flat = 0;
  const source = String(text ?? "").replace(/\s+/g, "").toLowerCase();
  for (const match of source.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)) {
    if (match[3]) {
      const die = `d${match[3]}`;
      counts[die] = (counts[die] ?? 0) + (match[2] === "" ? 1 : Number(match[2])) * (match[1] === "-" ? -1 : 1);
    } else if (match[5]) flat += Number(match[5]) * (match[4] === "-" ? -1 : 1);
  }
  return { counts, flat };
}

// Dice and flat bonus gained going from level - 1 to level (ActionHP.getLevelGain).
export function levelGain(pkg, level) {
  const hdAt = (n) => (n <= 0 ? "" : progressionRow(pkg, n)?.hd ?? "");
  const now = parseHD(hdAt(level));
  const before = parseHD(hdAt(level - 1));
  const dice = [];
  for (const [die, count] of Object.entries(now.counts)) {
    for (let i = 0; i < count - (before.counts[die] ?? 0); i += 1) dice.push(die);
  }
  dice.sort();
  return { dice, flat: Math.max(now.flat - before.flat, 0) };
}

// "13:1:1,16:2:1" — at a score of at least 13, one more level-1 slot, when
// that level already has slots (SiegeChar.applySlotBonuses).
export function applySlotBonuses(base, score, rules) {
  const out = { ...base };
  for (const rule of String(rules ?? "").split(",")) {
    const match = /^\s*(\d+):(\d+):(\d+)\s*$/.exec(rule);
    if (!match) continue;
    const level = Number(match[2]);
    if ((Number(score) || 0) >= Number(match[1]) && (base[level] ?? 0) > 0) out[level] = out[level] + Number(match[3]);
  }
  return out;
}

export function parseCounts(text) {
  const out = {};
  String(text ?? "")
    .split(",")
    .forEach((part, index) => {
      if (part.trim() !== "") out[index] = Number(part.trim()) || 0;
    });
  return out;
}

// Slots per power level for a package at a level, with score bonuses.
export function packageSlots(pkg, level, scoreOf) {
  const base = parseCounts(progressionRow(pkg, level)?.slots);
  const stat = String(pkg?.slotbonusstat ?? "");
  if (!stat || !pkg?.slotbonuses) return base;
  return applySlotBonuses(base, scoreOf(stat), pkg.slotbonuses);
}

function combine(values, mode) {
  if (values.length === 0) return 0;
  if (String(mode).toLowerCase() === "sum") return values.reduce((a, b) => a + b, 0);
  return Math.max(...values);
}

function list(node) {
  return Object.entries(node ?? {}).filter(([, value]) => value && typeof value === "object");
}

// One effect component: "ATK: 2 melee" -> { type: "ATK", mod: 2, remainder: ["melee"] }.
// A part with no "TAG:" (the effect's label) has type "".
export function parseEffect(text) {
  return String(text ?? "")
    .split(";")
    .map((part) => {
      const match = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(part);
      if (!match) return { type: "", mod: 0, remainder: [] };
      const words = match[2].split(/[\s,]+/).filter(Boolean);
      let mod = 0;
      if (words.length > 0 && /^[+-]?\d+$/.test(words[0])) mod = Number(words.shift());
      return { type: match[1].toUpperCase(), mod, remainder: words };
    })
    .filter((comp) => comp.type !== "");
}

// The package names an effect is limited to ("packages": a race's bonus for
// rogues). A name matches a package's name or its name before " (".
function hasPackage(effect, character) {
  const wanted = String(effect.packages ?? "").trim();
  if (wanted === "") return true;
  const have = new Set();
  for (const [, pkg] of list(character.packages)) {
    const name = String(pkg.name ?? "").toLowerCase();
    have.add(name);
    have.add(name.replace(/\s*\(.*$/, "").trim());
  }
  return wanted.split(",").some((name) => have.has(name.trim().toLowerCase()));
}

// The effects of the character's package abilities that are active now
// (SiegeAbilityEffects.copyEffects): the ability's level reached, the
// effect's level band, and its package limit. A class counts its own level,
// a package without a progression table (a race) the character's level.
export function activeAbilityEffects(character) {
  const out = [];
  const charLevel = Number(character.level) || 1;
  for (const [, pkg] of list(character.packages)) {
    const level = rows(pkg).length > 0 ? Number(pkg.level) || 1 : charLevel;
    for (const [, ability] of list(pkg.abilities)) {
      if ((Number(ability.level) || 1) > level) continue;
      for (const [, effect] of list(ability.effects)) {
        const from = Number(effect.fromlevel) || 0;
        const to = Number(effect.tolevel) || 0;
        if ((from > 0 && level < from) || (to > 0 && level > to)) continue;
        if (!String(effect.effect ?? "").trim() || !hasPackage(effect, character)) continue;
        out.push({ ...effect, ability: ability.name, package: pkg.name });
      }
    }
  }
  return out;
}

// "AC: 2" with nothing else named: an always-on bonus to armor class
// (SiegeAbilityEffects.getFlatPassive). Button effects and conditional ones
// (IF / IFT: "against giants") are not part of the printed number.
export function flatPassive(character, tag) {
  let total = 0;
  const want = tag.toUpperCase();
  for (const effect of activeAbilityEffects(character)) {
    if (String(effect.mode ?? "") === "button") continue;
    const comps = parseEffect(effect.effect);
    if (comps.some((comp) => comp.type === "IF" || comp.type === "IFT")) continue;
    for (const comp of comps) if (comp.type === want && comp.remainder.length === 0) total += comp.mod;
  }
  return total;
}

// The worn slot an item fills: armor, shield or helm, or null
// (SiegeChar.getWornSlot). A ring or robe with an AC bonus is not body armor.
export function wornSlot(item) {
  if ((Number(item.acbonus) || 0) <= 0 && (Number(item.acbonushead) || 0) <= 0) return null;
  const subtype = String(item.subtype ?? "").toLowerCase();
  if (subtype === "shield" || subtype === "helm") return subtype;
  const type = String(item.type ?? "").toLowerCase();
  return type === "" || type === "armor" ? "armor" : null;
}

// Adds one copy of an item to a character's inventory, as a drop does:
// "Arrows (20)" becomes 20 Arrows on a row of their own; another copy of an
// item already carried adds to its count; anything else is a new row. With
// SIEGE_AUTO_EQUIP a new row is equipped when it fills an empty worn slot, is
// a weapon, or has a worn effect or AC bonus (SiegeChar.autoEquip).
// Returns the row.
export function addItem(character, source, game) {
  const options = gameOptions(game);
  const inventory = (character.inventorylist = character.inventorylist ?? {});
  const bundle = /^(.*?)\s*\((\d+)\)\s*$/.exec(String(source.name ?? ""));
  if (!bundle) {
    const same = Object.values(inventory).find((row) => row && row.name === source.name && row.fgPath === source.fgPath);
    if (same) {
      same.count = (Number(same.count) || 1) + 1;
      return same;
    }
  }
  const row = { ...structuredClone(source), count: bundle ? Number(bundle[2]) : 1, carried: 1 };
  delete row.public;
  if (bundle) row.name = bundle[1];
  const key = nextId(inventory);
  inventory[key] = row;
  if (isOn(options, "SIEGE_AUTO_EQUIP")) {
    const slot = wornSlot(row);
    if (slot) {
      const taken = Object.values(inventory).some((other) => other !== row && Number(other?.carried) === 2 && wornSlot(other) === slot);
      if (!taken) row.carried = 2;
    } else if (String(row.damage ?? "") !== "") row.carried = 2;
    else if (String(row.equippedeffect ?? "").trim() !== "" || (Number(row.acbonus) || 0) > 0) row.carried = 2;
  }
  return row;
}

// Sets an item's carried state (0 not carried, 1 carried, 2 equipped). A
// container passes the new state on to what is packed in it.
export function setCarried(character, row, carried) {
  if (Number(row.carried) === carried) return;
  row.carried = carried;
  for (const other of Object.values(character.inventorylist ?? {})) {
    if (other && other !== row && other.location && other.location === row.name) other.carried = carried;
  }
}

export function nextId(node) {
  let n = 1;
  for (const key of Object.keys(node ?? {})) {
    const match = /^id-(\d+)$/.exec(key);
    if (match) n = Math.max(n, Number(match[1]) + 1);
  }
  return `id-${String(n).padStart(5, "0")}`;
}

// Powers a package grants at its level (SiegeChar.rebuildPackagePowers):
// copied onto the character with packagesource naming the package, and taken
// off again when the package no longer grants them.
function refreshPackagePowers(character) {
  const powers = (character.powers = character.powers ?? {});
  const existing = new Map();
  for (const [key, power] of Object.entries(powers)) {
    if (power?.packagesource) existing.set(`${power.packagesource}|${power.name}`, key);
  }
  const charLevel = Number(character.level) || 1;
  for (const [packageKey, pkg] of list(character.packages)) {
    const level = rows(pkg).length > 0 ? Number(pkg.level) || 1 : charLevel;
    const source = `packages.${packageKey}`;
    for (const [, power] of list(pkg.powers)) {
      if ((Number(power.grantlevel ?? 1) || 1) > level) continue;
      const key = `${source}|${power.name}`;
      if (existing.has(key)) existing.delete(key);
      else powers[nextId(powers)] = { ...structuredClone(power), packagesource: source };
    }
  }
  for (const key of existing.values()) delete powers[key];
}

// Everything the sheet works out from scores, packages and gear
// (SiegeChar.refreshPackages, refreshActor, refreshAC, refreshCombat).
// Returns a new character; the input is not changed.
export function derive(input, game) {
  const options = gameOptions(game);
  const character = structuredClone(input);
  character.attributes = character.attributes ?? {};
  for (const stat of STATS) {
    const row = (character.attributes[stat] = character.attributes[stat] ?? {});
    row.score = Number(row.score ?? 10);
    row.prime = Number(row.prime ?? 0) ? 1 : 0;
    row.bonus = abilityBonus(row.score, game);
  }
  const scoreOf = (stat) => Number(character.attributes[stat]?.score ?? 10);

  const levels = [];
  const bths = [];
  const hds = [];
  let next = 0;
  let nextSource = "";
  const slots = {};
  for (const [, pkg] of list(character.packages)) {
    if (rows(pkg).length === 0) continue;
    const level = Number(pkg.level) || 1;
    const row = progressionRow(pkg, level);
    levels.push(level);
    bths.push(pkg.manualprogression && level >= Number(pkg.manualfromlevel || 0) && Number(pkg.manualfromlevel) > 0 ? Number(pkg.manualbth) || 0 : Number(row?.bth) || 0);
    if (row?.hd) hds.push(row.hd);
    const xp = Number(exactRow(pkg, level + 1)?.xp) || 0;
    if (xp > 0 && (next === 0 || xp < next)) {
      next = xp;
      nextSource = `${pkg.name ?? ""} ${level + 1}`;
    }
    const own = packageSlots(pkg, level, scoreOf);
    for (const [n, count] of Object.entries(own)) slots[n] = (slots[n] ?? 0) + count;
  }
  if (levels.length > 0) {
    character.level = combine(levels, options.SIEGE_PKG_LEVEL);
    character.bth = combine(bths, options.SIEGE_PKG_BTH);
    character.hitdice = hds.join(", ");
  }
  character.expnext = next;
  character.expnextsource = nextSource;
  character.slots = Object.fromEntries(Object.entries(slots).map(([n, max]) => [`l${n}`, { max, used: Number(input.slots?.[`l${n}`]?.used) || 0 }]));

  refreshPackagePowers(character);

  let chosen = 0;
  for (const stat of STATS) if (character.attributes[stat].prime) chosen += 1;
  character.primes = { chosen };

  if (isOn(options, "SIEGE_AC_AUTO")) {
    const ac = (character.ac = { ...(character.ac ?? {}) });
    let dex = isOn(options, "SIEGE_AC_DEX") ? abilityBonus(scoreOf("dexterity"), game) : 0;
    if (Number(character.load?.positivedexacdrop) === 1 && dex > 0) dex = 0;
    let armor = 0;
    let shield = 0;
    let head = 0;
    for (const [, item] of list(character.inventorylist)) {
      if (Number(item.carried) !== 2) continue;
      const bonus = Number(item.acbonus) || 0;
      armor += bonus;
      if (String(item.subtype ?? "").toLowerCase() === "shield") shield += bonus;
      head += Number(item.acbonushead) || 0;
    }
    const abilities = flatPassive(character, "AC");
    const natural = Number(ac.natural) || 0;
    const other = (Number(ac.misc) || 0) + (Number(ac.size) || 0) + (Number(ac.deflection) || 0) + abilities;
    const total = numberOption(options, "SIEGE_AC_BASE", 10) + dex + armor + other + natural;
    Object.assign(ac, {
      dex,
      abilities,
      armor,
      shield,
      equipmentarmor: armor - shield,
      flatfooted: total - Math.max(dex, 0),
      touch: total - armor - natural,
      total,
    });
    if (isOn(options, "SIEGE_AC_HEAD")) ac.head = numberOption(options, "SIEGE_AC_BASE", 10) + dex + (Number(ac.headmisc) || 0) + head;
  }

  const statBonus = (stat) => (stat && stat !== "none" ? abilityBonus(scoreOf(stat), game) : 0);
  character.initiative = { ...(character.initiative ?? {}) };
  character.initiative.bonus = statBonus(options.SIEGE_INIT_STAT) + (Number(character.initiative.misc) || 0);
  character.attack = { ...(character.attack ?? {}) };
  for (const type of ["melee", "ranged"]) {
    const row = (character.attack[type] = { ...(character.attack[type] ?? {}) });
    row.attr = isOn(options, "ATK_ADD_ATTR") ? statBonus(options[type === "melee" ? "SIEGE_MELEE_STAT" : "SIEGE_RANGED_STAT"]) : 0;
    row.total = (Number(character.bth) || 0) + row.attr + (Number(row.misc) || 0);
  }
  // The game's own attack kinds (grapple, touch...): attack.<key>.attr / .total.
  for (const kind of Object.values(game?.attackkinds ?? {})) {
    if (!kind || typeof kind !== "object" || !kind.name) continue;
    const key = String(kind.name).toLowerCase().replace(/\s+/g, "");
    const row = (character.attack[key] = { ...(character.attack[key] ?? {}) });
    row.attr = isOn(options, "ATK_ADD_ATTR") ? statBonus(kind.stat) : 0;
    const bth = String(kind.bth ?? "yes").toLowerCase() === "no" ? 0 : Number(character.bth) || 0;
    row.total = bth + row.attr + (Number(row.misc) || 0);
  }
  return character;
}

// SIEGE check or save (section 4.3 of the SiegeCore reference):
// total = d20 + modifier + level (if added) + bonus; CC = CB + CL.
export function check({ d20, score, prime, level = 0, addLevel, cl = 0, bonus = 0 }, game) {
  const options = gameOptions(game);
  const modifier = abilityBonus(score, game);
  const add = addLevel ?? isOn(options, "SIEGE_ADD_LEVEL");
  const total = d20 + modifier + (add ? level : 0) + bonus;
  const cb = numberOption(options, prime ? "SIEGE_CB_PRIME" : "SIEGE_CB_SECONDARY", prime ? 12 : 18);
  const cc = cb + cl;
  let success = total >= cc;
  if (isOn(options, "SIEGE_NAT20")) {
    if (d20 === 20) success = true;
    if (d20 === 1) success = false;
  }
  return { total, modifier, cb, cc, success };
}
