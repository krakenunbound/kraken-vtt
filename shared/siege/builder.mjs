// Building a character from a spec, the way the SC C&C character wizard's
// CCWizard.buildFromSpec does in Fantasy Grounds: race and class by name,
// final scores, chosen primes, hit points (1st level the die's maximum, later
// levels the average rounded up, plus Constitution, at least 1 a level), coin
// and gear bought by name at book prices, spells in order of preference.
//
// The library is the campaign's imported records: { packages, items, powers,
// game }. Each record is the record's data (FG fields plus fgPath).
//
// Combined classes (multi-class, enhanced, class plus) are not built yet.

import { STATS, abilityBonus, addItem, derive, exactRow, levelGain, packageSlots, parseCounts, plainName, progressionRow, setCarried } from "./engine.mjs";

export const CORE_BOOK = "C&C Player's Handbook";

// Price in copper, or null when the price is not one plain amount.
export function parseCost(text) {
  const source = String(text ?? "")
    .toLowerCase()
    .replace(/,/g, "")
    .trim();
  const match = /^([\d.]+)\s*([a-z]{2})$/.exec(source);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const mult = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }[match[2]] ?? 100;
  return Math.floor(amount * mult + 0.5);
}

function isCore(record) {
  return String(record.fgPath ?? "").endsWith(`@${CORE_BOOK}`);
}

// Level of a power for a class, from powertype "Wizard 1, Illusionist 1".
export function powerLevelFor(power, spellClass) {
  for (const match of String(power.powertype ?? "").matchAll(/([A-Za-z ]+?)\s+(\d+)/g)) {
    if (match[1].trim().toLowerCase() === String(spellClass).toLowerCase()) return Number(match[2]);
  }
  return null;
}

function plainText(html) {
  return String(html ?? "")
    .replace(/<\/p>\s*/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<li>/g, "  - ")
    .replace(/<\/li>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

// Languages the race's description names ("Languages: Common, Dwarven, ...").
export function raceLanguages(race) {
  const line = /[Ll]anguages?:\s*([^\n]+)/.exec(plainText(race?.text))?.[1];
  if (!line) return [];
  return line
    .replace(/[.;]\s*$/, "")
    .replace(/,?\s*and\s+[A-Za-z]+\s+of\s+the\s+following.*$/, "")
    .replace(/\s+and\s+/g, ", ")
    .split(",")
    .map((part) => part.replace(/^\s*and\s+/, "").trim())
    .filter((part) => part !== "" && part.length < 30);
}

function id(n) {
  return `id-${String(n).padStart(5, "0")}`;
}

// Spells per day at a level (bonus slots from the final casting score), or
// a "known" caster's known counts.
export function spellPicksAllowed(cls, level, finalScore) {
  if (String(cls.spellmode ?? "").toLowerCase() === "known") {
    const known = progressionRow(cls, level)?.known;
    if (known) return parseCounts(known);
  }
  return packageSlots(cls, level, finalScore);
}

export function spellChoices(powers, cls, allowed) {
  const spellClass = String(cls.spellclass ?? "");
  let max = -1;
  for (const [n, count] of Object.entries(allowed)) if (count > 0 && Number(n) > max) max = Number(n);
  if (!spellClass || max < 0) return [];
  const seen = new Set();
  const out = [];
  for (const power of powers) {
    const level = powerLevelFor(power, spellClass);
    if (level === null || level > max || seen.has(power.name)) continue;
    seen.add(power.name);
    out.push({ power, level });
  }
  out.sort((a, b) => a.level - b.level || String(a.power.name).localeCompare(String(b.power.name)));
  return out;
}

export function buildFromSpec(spec, library) {
  const report = { problems: [], auto: [], skipped: [] };
  const problem = (text) => report.problems.push(text);
  const findPackage = (type, name) =>
    library.packages.find((pkg) => String(pkg.packagetype ?? "").toLowerCase() === type && plainName(pkg.name) === plainName(name)) ?? null;
  const race = findPackage("race", spec.race);
  const cls = findPackage("class", spec.class);
  if (!race) problem(`race not found: ${spec.race}`);
  if (!cls) {
    problem(`class not found: ${spec.class}`);
    return { character: null, report };
  }
  const level = Number(spec.level) || 1;
  const finalScore = (stat) => Number(spec.scores?.[stat] ?? 10);

  // Primes: the class's are fixed; the spec names the chosen ones.
  const forced = STATS.filter((stat) => Number(cls.primes?.[stat]) === 1);
  const primes = new Set(forced);
  for (const stat of spec.primes ?? []) primes.add(stat);
  const allowed = forced.length + (Number(cls.primechoice) || 0) + (Number(race?.primechoice) || 0);
  if (primes.size !== allowed) problem(`primes: ${primes.size} chosen, ${allowed} allowed`);

  // Hit points, one level at a time.
  const con = abilityBonus(finalScore("constitution"), library.game);
  const hplog = {};
  let hpTotal = 0;
  for (let n = 1; n <= level; n += 1) {
    const { dice, flat } = levelGain(cls, n);
    let gain = flat;
    if (dice.length > 0) {
      for (const die of dice) {
        const sides = Number(die.slice(1)) || 0;
        gain += n === 1 ? sides : Math.floor(sides / 2) + 1;
      }
      gain = Math.max(1, gain + con);
    }
    // Hit points the wizard rolled for this level replace the pregen rule.
    if (Array.isArray(spec.hp) && Number.isFinite(Number(spec.hp[n - 1]))) gain = Number(spec.hp[n - 1]);
    hplog[`l${n}`] = gain;
    hpTotal += gain;
  }

  // Coin and gear, in copper.
  const purse = (Number(spec.gold) || 0) * 100;
  let spent = 0;
  const cart = [];
  const priced = (item) => parseCost(item.cost) !== null;
  for (const [name, count = 1] of spec.gear ?? []) {
    const want = plainName(name);
    const item =
      library.items.find((it) => plainName(it.name) === want && priced(it) && isCore(it)) ??
      library.items.find((it) => plainName(it.name) === want && priced(it));
    if (!item) {
      problem(`item not found: ${name}`);
      continue;
    }
    for (let i = 0; i < (Number(count) || 1); i += 1) {
      const cost = parseCost(item.cost);
      if (cost > purse - spent) {
        problem(`cannot buy: ${name}`);
        break;
      }
      spent += cost;
      const existing = cart.find((entry) => entry.item === item);
      if (existing) existing.count += 1;
      else cart.push({ item, count: 1 });
    }
  }

  // Spells: the spec's in order, then the class list for slots left.
  const castingScore = (stat) => finalScore(stat);
  const day = spellPicksAllowed(cls, level, castingScore);
  const picks = [];
  if (Object.keys(day).length > 0) {
    const choices = spellChoices(library.powers, cls, day);
    const byName = new Map(choices.map((choice) => [plainName(choice.power.name), choice]));
    const countAt = (n) => picks.filter((pick) => pick.level === n).length;
    for (const name of spec.spells ?? []) {
      const choice = byName.get(plainName(name));
      if (!choice || countAt(choice.level) >= (day[choice.level] ?? 0)) report.skipped.push(name);
      else picks.push(choice);
    }
    for (const choice of choices) {
      if (!picks.includes(choice) && countAt(choice.level) < (day[choice.level] ?? 0)) {
        picks.push(choice);
        report.auto.push(choice.power.name);
      }
    }
  }

  // The character, field for field as FG's buildCharacter writes it.
  const character = { name: String(spec.name ?? "").trim(), attributes: {}, packages: {}, inventorylist: {}, powers: {}, languagelist: {} };
  for (const stat of STATS) character.attributes[stat] = { score: finalScore(stat), prime: primes.has(stat) ? 1 : 0 };
  let next = 1;
  if (race) {
    character.packages[id(next++)] = { ...structuredClone(race), level: 1 };
    character.race = race.name;
    if (race.size) character.size = race.size;
    if (race.speed) character.speed = race.speed;
  }
  character.packages[id(next++)] = { ...structuredClone(cls), level, hproll: level, hplog };
  character.exp = Number(exactRow(cls, level)?.xp) || 0;
  character.hp = { total: hpTotal, wounds: 0 };

  // Gear goes in one copy at a time, as the wizard's shop hands it over.
  // Then the first armor, shield and helm with an AC bonus are worn and
  // weapons are ready; then the spec's worn and packed items.
  for (const { item, count } of cart) for (let i = 0; i < count; i += 1) addItem(character, item, library.game);
  const worn = new Set();
  for (const entry of Object.values(character.inventorylist)) {
    let slot = String(entry.subtype ?? "").toLowerCase();
    if (entry.type === "Armor" && slot !== "shield" && slot !== "helm") slot = "armor";
    if ((Number(entry.acbonus) || 0) > 0 && ["armor", "shield", "helm"].includes(slot) && !worn.has(slot)) {
      worn.add(slot);
      setCarried(character, entry, 2);
    } else if (entry.damage && entry.type === "Weapon") setCarried(character, entry, 2);
  }
  const wornNames = new Set((spec.worn ?? []).map(plainName));
  const packedNames = new Set((spec.packed ?? []).map(plainName));
  const container = Object.values(character.inventorylist).find((item) => plainName(item.name) === plainName(spec.container))?.name;
  for (const item of Object.values(character.inventorylist)) {
    if (wornNames.has(plainName(item.name))) setCarried(character, item, 2);
    else if (container && packedNames.has(plainName(item.name))) item.location = container;
  }

  // Coin left over, as CoreRPG's currency rows (gp, sp, cp; none when 0).
  const left = purse - spent;
  character.coins = {};
  let coin = 1;
  for (const [name, amount] of [
    ["gp", Math.floor(left / 100)],
    ["sp", Math.floor((left % 100) / 10)],
    ["cp", left % 10],
  ]) {
    if (amount > 0) character.coins[id(coin++)] = { name, amount };
  }

  let power = 1;
  for (const pick of picks) character.powers[id(power++)] = { ...structuredClone(pick.power), level: pick.level };
  // Spells the class lists do not give (a divine knight's mana spells, an
  // arcane thief's grimoire copies), by FG path, as the pregen runner adds them.
  for (const extra of spec.extraspells ?? []) {
    const found = library.powers.find((item) => item.fgPath === extra.path) ?? library.powers.find((item) => plainName(item.name) === plainName(extra.name));
    if (!found) {
      problem(`spell not found: ${extra.name}`);
      continue;
    }
    const row = { ...structuredClone(found), level: Number(extra.level) || 0, spelllevel: Number(extra.level) || 0 };
    for (const field of ["uses", "oneshot", "noslot"]) if (extra[field]) row[field] = Number(extra[field]);
    character.powers[id(power++)] = row;
  }
  let language = 1;
  for (const name of raceLanguages(race)) character.languagelist[id(language++)] = { name };
  for (const field of ["alignment", "deity", "gender", "age", "height", "weight", "appearance", "notes"]) {
    if (spec[field]) character[field] = spec[field];
  }

  const built = derive(character, library.game);
  report.hp = hpTotal;
  report.coinleft = left;
  return { character: built, report };
}
