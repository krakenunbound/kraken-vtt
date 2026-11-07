const crypto = require("crypto");
const path = require("path");
const { pathToFileURL } = require("url");
const { siege, siegeLibrary } = require("./siege.cjs");

// The combat tracker, kept by the host, as CoreRPG's CombatManager runs it
// with SiegeCore's rules:
// - order: initiative high to low, then name (sortfuncStandard);
// - next turn skips those who lose their turn (SiegeCore: unconscious
//   enemies, SIEGE_SKIP_UNCONSCIOUS), and after the last comes "[ROUND n]";
// - effect durations count down once a round, when initiative passes the
//   count they were applied on (EffectManager.processEffectExpire);
// - initiative is SIEGE_INIT_DIE (d10) plus the entry's bonus;
// - an NPC gets its listed hit points, else rolls its hit dice (HRNH off);
//   a second "Orc" makes the first "Orc 1" and itself "Orc 2" (NNPC append);
// - damage adds wounds, healing takes them off; healing is capped at 0 from
//   -1..-6 (SIEGE_NEGATIVE_HEAL_CAP), cannot raise the dead, and stabilises
//   the dying; the dying bleed 1 a round at their turn (SIEGE_NEGATIVE_HP_BLEED).
// A character's entry uses its sheet's hit points and AC; an NPC's are the entry's own.

// Critical hits and fumbles (KrakenKrits, built into SiegeCore).
let krits = null;
const kritsReady = import(pathToFileURL(path.join(__dirname, "..", "shared", "siege", "krits.mjs")).href).then((module) => {
  krits = module;
});

// D&D 5E (SRD 5.2.1), when the campaign's ruleset is "D&D 5E": FG's 5E
// ruleset's way: initiative d20 + DEX; an attack is d20 + its bonus against
// AC, a natural 20 a critical hit (the damage dice twice), a natural 1 a miss;
// a save d20 + its modifier against a DC; a creature at 0 hit points dies, a
// character falls Dying (death saves: three successes stable, three failures
// dead; damage left over of at least its maximum kills outright); healing a
// Dying character starts from 0. Effects' ATK and SAVE dice (Bless: 1d4) roll with them.
let r5 = null;
const r5Ready = import(pathToFileURL(path.join(__dirname, "..", "shared", "dnd5e", "rules.mjs")).href).then((module) => {
  r5 = module;
});

// Apeira Astra (shared/astra/rules.mjs), when the campaign's ruleset is
// "Apeira Astra": initiative 2d6 + Reflex modifier + Tactics; an attack 2d6 +
// skill + characteristic against 8, its Effect added to the damage; armour
// takes its Protection off every hit. A character is Down at 0 Stamina (out,
// not bleeding) and dead at minus its Grit; a creature dies at 0.
let ra = null;
const raReady = import(pathToFileURL(path.join(__dirname, "..", "shared", "astra", "rules.mjs")).href).then((module) => {
  ra = module;
});

let geometry = null;
const geometryReady = import(pathToFileURL(path.join(__dirname, "..", "shared", "map", "geometry.mjs")).href).then((module) => {
  geometry = module;
});

const FACTIONS = ["friend", "neutral", "foe"];

function text(value, fallback) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = raw.replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
}

function num(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString("hex")}`;
}

function cleanEffect(raw) {
  if (!raw || typeof raw !== "object") return null;
  const label = text(raw.label, "");
  if (!label) return null;
  return {
    id: text(raw.id, "") || newId("e"),
    label: label.slice(0, 200),
    duration: Math.max(0, Math.round(num(raw.duration, 0))),
    init: num(raw.init, 0),
    gmOnly: Boolean(raw.gmOnly),
    // FG's effect targets: an effect aimed at creatures counts only on rolls
    // against them (Hunter's Quarry on the ranger, aimed at the quarry).
    ...(Array.isArray(raw.targets) && raw.targets.length ? { targets: raw.targets.map((id) => text(id, "")).filter(Boolean).slice(0, 20) } : {}),
  };
}

// Whether an effect counts on a roll against `against` (an entry, or none).
function effectAppliesTo(effect, against) {
  return !effect.targets?.length || Boolean(against && effect.targets.includes(against.id));
}

// A creature's conditions from its effects' parts: "Asleep; Unconscious" has Unconscious.
function hasCondition(entry, name) {
  const want = name.toLowerCase();
  return (entry?.effects ?? []).some((effect) => effect.label.split(";").some((part) => part.trim().toLowerCase() === want));
}

function cleanEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: text(raw.id, "") || newId("ct"),
    recordId: raw.recordId ? text(raw.recordId, "").slice(0, 160) : null,
    tokenId: raw.tokenId ? text(raw.tokenId, "").slice(0, 40) : null,
    name: text(raw.name, "Creature").slice(0, 60),
    faction: FACTIONS.includes(raw.faction) ? raw.faction : "foe",
    init: Math.round(num(raw.init, 0)),
    initresult: Math.round(num(raw.initresult, 0)),
    hp: Math.max(0, Math.round(num(raw.hp, 0))),
    wounds: Math.round(num(raw.wounds, 0)),
    ac: Math.round(num(raw.ac, 10)),
    hidden: Boolean(raw.hidden),
    stabilized: Boolean(raw.stabilized),
    bleedRound: Math.round(num(raw.bleedRound, -1)),
    effects: (Array.isArray(raw.effects) ? raw.effects : []).map(cleanEffect).filter(Boolean).slice(0, 50),
    // An NPC's powers used today (FG's per-day uses on the tracker's copy).
    used: raw.used && typeof raw.used === "object" ? Object.fromEntries(Object.entries(raw.used).slice(0, 60).map(([key, value]) => [String(key).slice(0, 60), Math.max(0, Math.round(num(value, 0)))])) : {},
    // Who this creature has targeted (FG's targets on the tracker).
    targets: (Array.isArray(raw.targets) ? raw.targets : []).map((id) => text(id, "")).filter(Boolean).slice(0, 20),
    // 5E: how its last attack went against each target ("hit", "crit" or "miss"),
    // until damage is rolled (FG's crit state per target, cleared at each attack); death saves for an NPC entry.
    hitOn: raw.hitOn && typeof raw.hitOn === "object" ? Object.fromEntries(Object.entries(raw.hitOn).slice(0, 20).filter(([, value]) => ["hit", "crit", "miss"].includes(value)).map(([key, value]) => [String(key).slice(0, 40), value])) : null,
    deathsaves: raw.deathsaves && typeof raw.deathsaves === "object" ? { success: Math.min(3, Math.max(0, Math.round(num(raw.deathsaves.success, 0)))), failure: Math.min(3, Math.max(0, Math.round(num(raw.deathsaves.failure, 0)))) } : { success: 0, failure: 0 },
  };
}

// 5E: the dice an effect adds to a tag ("Bless; ATK: 1d4; SAVE: 1d4" gives "+1d4").
// A damage effect may name its type after the dice ("DMG: 2d6 radiant").
function effectDice(entry, tag, against) {
  const out = [];
  for (const effect of entry?.effects ?? []) {
    if (!effectAppliesTo(effect, against)) continue;
    for (const part of effect.label.split(";")) {
      const match = /^\s*([A-Z]+)\s*:\s*([+-]?\d*d\d+)(?:\s+[a-z][a-z ,]*)?\s*$/i.exec(part);
      if (match && match[1].toUpperCase() === tag) out.push(match[2].startsWith("-") ? match[2] : `+${match[2].replace(/^\+/, "")}`);
    }
  }
  return out.join("");
}

// The number an effect's components add for a tag: "Bless; ATK: 1; AC: -2"
// gives ATK 1, AC -2 (CoreRPG effect components, numeric ones only).
function effectBonus(entry, tag, against) {
  let total = 0;
  for (const effect of entry?.effects ?? []) {
    if (!effectAppliesTo(effect, against)) continue;
    for (const part of effect.label.split(";")) {
      const match = /^\s*([A-Z]+)\s*:\s*([+-]?\d+)(?:\s+[a-z][a-z ,]*)?\s*$/i.exec(part);
      if (match && match[1].toUpperCase() === tag) total += Number(match[2]);
    }
  }
  return total;
}

const SHORT_TYPE = { melee: "M", ranged: "R" };
const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const SHORT_STAT = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const PHYSICAL = new Set(["strength", "dexterity", "constitution"]);

// SiegeCore getSiegeEffect: a save counts SAVE components (a plain one, or one
// naming this attribute) and the attribute's own tag (WIS: 1); a check counts
// ABIL and the attribute's tag.
function siegeEffect(entry, stat, save) {
  let total = 0;
  for (const effect of entry?.effects ?? []) {
    for (const part of effect.label.split(";")) {
      const match = /^\s*([A-Z]+)\s*:\s*([+-]?\d+)\s*(.*)$/i.exec(part);
      if (!match) continue;
      const tag = match[1].toUpperCase();
      const rest = match[3].trim().toLowerCase();
      const names = rest === "" || rest === stat || rest === SHORT_STAT[stat].toLowerCase();
      if (tag === (save ? "SAVE" : "ABIL") && names) total += Number(match[2]);
      if (tag === SHORT_STAT[stat] && rest === "") total += Number(match[2]);
    }
  }
  return total;
}

// A power's caster level: the character's level (SiegePower.getCasterLevel).
// How many times an action repeats at that level (Magic Missile's missiles):
// repeatbase, then repeatincrement more every repeatevery levels after repeatstart.
function repeats(action, casterLevel) {
  const base = Math.max(1, num(action.repeatbase, 1));
  const every = num(action.repeatevery, 0);
  if (every <= 0) return base;
  const extra = Math.floor(Math.max(0, casterLevel - num(action.repeatstart, 1)) / every) * Math.max(0, num(action.repeatincrement, 0));
  return base + extra;
}

// SiegePower.resolveLevelDice: CL is the caster level (capped by scalecap),
// (CL/2) a level every two; "CLd6", "CLd2+CL", "2d4+(CL/2)".
function levelDice(dice, casterLevel, cap = 0) {
  const text = String(dice ?? "").replace(/\s+/g, "");
  if (!text.includes("CL")) return text;
  const level = cap > 0 ? Math.min(casterLevel, cap) : casterLevel;
  return text.replace(/\(CL\/(\d+)\)/g, (_, every) => String(Math.floor(level / Math.max(1, Number(every))))).replace(/CL/g, String(level));
}

// SiegePowerResolution.rollDuration for a failed effect: "3", "1d4+1",
// "1d4+1 min", "2 turns" (a C&C turn counts as a minute), "1 day". With the
// game's round length set, longer units become rounds; unset (0, SiegeCore's
// default), CoreRPG counts a minute as 10 rounds, an hour 600, a day 14400.
function failedRounds(text, roundSeconds, roll = (formula) => require("./dice.cjs").createDice().roll(formula).total) {
  const value = String(text ?? "").trim().toLowerCase();
  if (!value) return 0;
  const units = { rd: "", rnd: "", round: "", min: "minute", minute: "minute", turn: "minute", hr: "hour", hour: "hour", day: "day" };
  const unitWord = (/([a-z]{2,})\s*$/.exec(value)?.[1] ?? "").replace(/s$/, "");
  const dice = value.replace(/[a-z]*\s*$/, "").replace(/\s+/g, "");
  let total = 0;
  for (const [, sign, term] of dice.matchAll(/([+-]?)([^+-]+)/g)) {
    const amount = /^\d*d\d+$/.test(term) ? roll(term) : Number(term) || 0;
    total += sign === "-" ? -amount : amount;
  }
  total = Math.max(0, total);
  const unit = units[unitWord] ?? "";
  const seconds = { minute: 60, hour: 3600, day: 86400 }[unit];
  if (roundSeconds > 0 && seconds) return Math.ceil((total * seconds) / roundSeconds);
  return total * ({ minute: 10, hour: 600, day: 14400 }[unit] ?? 1);
}

// A spell's duration in rounds: "1 round per level", "1 minute per caster
// level", "3 rounds"; minutes are SIEGE_ROUND_SECONDS (10) long rounds apart.
function durationRounds(text, casterLevel, roundSeconds = 10) {
  const value = String(text ?? "").toLowerCase();
  const match = /(\d+)?\s*(round|minute|turn|hour)s?(\s*(?:\/|per)\s*(?:caster\s*)?level)?/.exec(value);
  if (!match) return 0;
  const count = Number(match[1] ?? 1) * (match[3] ? Math.max(1, casterLevel) : 1);
  const seconds = { round: roundSeconds, minute: 60, turn: 60, hour: 3600 }[match[2]];
  return Math.max(1, Math.round((count * seconds) / roundSeconds));
}

function savedCombat(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    // The CK's critical and fumble choices (null: FG's defaults).
    krits: raw.krits && typeof raw.krits === "object" ? raw.krits : null,
    round: Math.max(0, Math.round(num(raw.round, 0))),
    active: raw.active ? text(raw.active, "") : null,
    entries: (Array.isArray(raw.entries) ? raw.entries : []).map(cleanEntry).filter(Boolean).slice(0, 200),
  };
}

// table: the table server's agent handle (records, roll, say, map).
function createCombat({ saved, table, onChange = () => undefined }) {
  const state = savedCombat(saved);
  // The d20 family (D&D 5E, Descending Darkness) plays FG 5E's way.
  const five = () => require("./dnd5e.cjs").isD20Ruleset(table().ruleset?.());
  // Descending Darkness: no death saves; the dying bleed a Health each turn
  // until an ally steadies them (Wisdom 12) or they reach minus their maximum.
  const bleeds = () => table().ruleset?.() === "Descending Darkness";
  const astraOn = () => table().ruleset?.() === "Apeira Astra";

  function changed() {
    onChange();
  }

  async function options() {
    const { engine } = await siege();
    const game = siegeLibrary(table().records).game;
    return { engine, game, options: engine.gameOptions(game) };
  }

  function record(entry) {
    return entry.recordId ? table().records.get(entry.recordId) : null;
  }

  // An effect the tracker puts on by itself (no GM seat needed).
  function putEffect(entry, label, duration = 0, gmOnly = false, targets = []) {
    const active = state.entries.find((item) => item.id === state.active);
    const effect = cleanEffect({ label, duration, gmOnly, init: active ? active.initresult : entry.initresult, targets });
    if (effect) entry.effects.push(effect);
    return effect;
  }

  // KrakenKrits.onAttackResult / resolve: on a natural 20 or 1, roll the CK's
  // table and apply its result (effects on the tracker, real damage rolls,
  // a mark on the attacker's next damage roll); what cannot be kept is told
  // to the GM. forced: { table, roll } for tests.
  async function resolveKrit(kind, source, target, ranged, opts, forced) {
    await kritsReady;
    const settings = krits.cleanSettings(state.krits);
    const isPC = source && record(source)?.type === "character";
    if (!forced) {
      if (source && !isPC && settings.npc === "no") return null;
      const chance = settings[kind === "crit" ? "crit" : "fumble"];
      if (chance === "off" || (chance === "half" && table().dice.roll("1d2").total !== 1) || (chance === "third" && table().dice.roll("1d3").total !== 1)) return null;
    }
    const key = forced?.table ?? krits.pickTable(kind, settings.mode, ranged);
    const chart = krits.TABLES[key];
    if (!chart) return null;
    const roll = Number(forced?.roll) || (chart.die > 1 ? table().dice.roll(`1d${chart.die}`).total : 1);
    const row = krits.findRow(chart, roll);
    if (!row) return null;
    const auto = settings.auto !== "no";
    const out = [];
    const nameOf = (entry) => entry?.name ?? "?";
    for (const fx of row[4]) {
      const who = fx.who === "a" ? source : kind === "fumble" ? source : target;
      if (fx.effect) {
        if (auto && who) {
          putEffect(who, fx.effect, fx.dur ?? 0);
          out.push(`${fx.effect} -> ${nameOf(who)}`);
        } else out.push(`(${nameOf(who)}: ${fx.effect})`);
      }
      if (fx.dmg) {
        if (auto && who) {
          const rolled = table().roll(String(fx.dmg), `[DAMAGE] Kraken Krit: ${fx.title ?? "extra damage"}`, source?.name ?? "Combat", Boolean(who.hidden));
          await applyWounds(who, Math.max(1, rolled.total), `[DAMAGE] Kraken Krit: ${fx.title ?? "extra damage"}`, opts);
        } else out.push(`(${nameOf(who)} takes ${fx.dmg} damage)`);
      }
      if (fx.mark !== undefined && source) {
        const label = krits.markLabel(fx.mark);
        if (auto) {
          putEffect(source, label, 1);
          out.push(`${label} (next damage roll)`);
        } else out.push(`(${label})`);
      }
      if (fx.death) {
        if (settings.death === "apply" && auto && who) {
          // Down to the dead threshold (C&C: -10 hit points), not a heap of wounds.
          const now = vitals(who);
          await applyWounds(who, Math.max(1, now.hp - thresholds(opts).dead - now.wounds), "[DAMAGE] Kraken Krit: instant death", opts);
          out.push(`INSTANT DEATH -> ${nameOf(who)}`);
        } else out.push(`GM: INSTANT DEATH for ${nameOf(who)} if you allow it (Settings: instant death results)`);
      }
      if (fx.note) out.push(`GM: ${fx.note}`);
    }
    const tag = kind === "fumble" ? "[KRAKEN FUMBLE]" : "[KRAKEN CRITICAL]";
    const extra = row[3] && row[3] !== row[2] ? ` ${row[3]}` : "";
    table().say(`${tag} ${nameOf(source)}: ${chart.name} d${chart.die} = ${roll}: ${row[2]}.${extra}${out.length ? `\n[APPLIED] ${out.join("; ")}` : ""}`, "Combat", settings.show === "gm");
    changed();
    return { kind, table: key, roll, title: row[2], applied: out };
  }

  // SiegeChar.fireAmmunition: a ranged weapon with an ammunition type fires
  // one of the readied (else carried) ammunition of that type. false: none left.
  function fireAmmunition(recordRow, item, opts) {
    const type = String(item.ammotype ?? "").trim().toLowerCase();
    if (!type || String(item.attacktype ?? "").toLowerCase() !== "ranged") return { ok: true };
    const inventory = recordRow.data.inventorylist ?? {};
    const left = (row) => Math.max(0, num(row.count, 1)) * Math.max(1, num(row.ammoperunit, 1)) - num(row.ammoused, 0);
    const choices = Object.entries(inventory).filter(([, row]) => String(row?.subtype ?? "").toLowerCase() === "ammunition" && String(row.ammotype ?? "").trim().toLowerCase() === type && left(row) > 0);
    const pick = choices.find(([, row]) => num(row.carried, 1) === 2) ?? choices.find(([, row]) => num(row.carried, 1) === 1);
    if (String(opts.SIEGE_AMMO_TRACK ?? "on").toLowerCase() === "off") return { ok: true, ammo: pick?.[1]?.name };
    if (!pick) {
      table().say(`${item.name}: no ${type} left to fire.`, "Combat");
      return { ok: false };
    }
    const [key, row] = pick;
    const per = Math.max(1, num(row.ammoperunit, 1));
    let used = num(row.ammoused, 0) + 1;
    let count = num(row.count, 1);
    if (used >= per) {
      count = Math.max(0, count - 1);
      used = 0;
    }
    table().records.update(recordRow.id, { data: { inventorylist: { [key]: { count, ammoused: used } } } }, table().seat);
    const remaining = count * per - used;
    table().say(`${item.name}: fired ${row.name}, ${remaining} left.`, "Combat");
    return { ok: true, ammo: row.name, left: remaining };
  }

  // ActionSpellResistance.getResistance: the creature's spell resistance (a
  // qualified entry, with notes, counts only once the referee enables it); a
  // character's worn items can give it, the highest counting.
  function spellResistance(entry) {
    const data = record(entry)?.data ?? {};
    let sr = Math.max(num(data.spellresistance, 0), num(entry.sr, 0));
    if (String(data.srnotes ?? "").trim() && num(data.srenabled, 0) !== 1) return 0;
    if (record(entry)?.type === "character") for (const item of Object.values(data.inventorylist ?? {})) if (num(item?.carried, 0) === 2) sr = Math.max(sr, num(item.spellresistance, 0));
    return Math.max(0, sr);
  }

  // A character's entry reads its sheet; an NPC's keeps its own numbers.
  function vitals(entry) {
    const linked = record(entry);
    if (linked && linked.type === "character") {
      const data = linked.data ?? {};
      return { hp: Number(data.hp?.total) || 0, wounds: Number(data.hp?.wounds) || 0, temp: Math.max(0, Number(data.hp?.temp) || 0), ac: Number(data.ac?.total) || entry.ac };
    }
    return { hp: entry.hp, wounds: entry.wounds, temp: 0, ac: entry.ac };
  }

  function thresholds(opts) {
    return { dead: num(opts?.SIEGE_HP_DEAD, -10), dying: num(opts?.SIEGE_HP_DYING, -7) };
  }

  let cachedThresholds = { dead: -10, dying: -7 };
  // 5E: a creature dies at 0; a character is Dying at 0, dead three failed death saves on or when the damage past 0 reaches its maximum.
  function thresholdsFor(entry) {
    if (astraOn()) {
      const linked = record(entry);
      if (linked?.type !== "character") return { dead: 0, dying: 0 };
      return { dead: -Math.max(1, num(linked.data?.characteristics?.grit?.score, 7)), dying: 0 };
    }
    if (!five()) return cachedThresholds;
    if (record(entry)?.type !== "character") return { dead: 0, dying: 0 };
    const { hp } = vitals(entry);
    return { dead: -hp, dying: 0 };
  }
  function health(entry) {
    const { hp, wounds } = vitals(entry);
    if (!geometry) return { status: "Healthy", percent: 0, color: "#00C000" };
    const status = geometry.healthStatus(hp, wounds, thresholdsFor(entry));
    // 5E: three failed death saves kill; three successes leave the character stable (Unconscious).
    if (astraOn() && status.status === "Dying") return { ...status, status: "Down", color: "#6C2DC7" };
    if (bleeds() && status.status === "Dying") return entry.stabilized ? { ...status, status: "Unconscious", color: "#6C2DC7" } : status;
    if (five() && status.status === "Dying") {
      const saves = deathSaves(entry);
      if (saves.failure >= 3) return { ...status, status: "Dead" };
      if (saves.success >= 3 || entry.stabilized) return { ...status, status: "Unconscious", color: "#6C2DC7" };
    }
    return status;
  }
  function deathSaves(entry) {
    const linked = record(entry);
    return linked?.type === "character" ? { success: num(linked.data?.deathsaves?.success, 0), failure: num(linked.data?.deathsaves?.failure, 0) } : entry.deathsaves;
  }
  function setDeathSaves(entry, saves) {
    const linked = record(entry);
    if (linked?.type === "character") table().records.update(linked.id, { data: { deathsaves: saves } }, table().seat);
    else entry.deathsaves = saves;
  }

  function sorted() {
    return [...state.entries].sort((a, b) => b.initresult - a.initresult || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function find(id) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) throw new Error(`No one on the tracker is ${id}.`);
    return entry;
  }

  function owner(entry) {
    return record(entry)?.owner ?? "";
  }

  function mustGM(seat) {
    if (seat.role !== "dm") throw new Error("Only the GM can run the combat tracker.");
  }

  // SiegeCore turn skipping: unconscious enemies (or everyone, by option).
  function skips(entry, opts) {
    const mode = String(opts?.SIEGE_SKIP_UNCONSCIOUS ?? "enemies").toLowerCase();
    // Apeira Astra: Down is out of the fight, whoever they are.
    if (astraOn() && health(entry).status === "Down") return true;
    if (mode !== "enemies" && mode !== "all") return false;
    if (health(entry).status !== "Unconscious") return false;
    return mode === "all" || entry.faction !== "friend";
  }

  // Effect durations: an effect counts down when initiative passes its count
  // going from `from` to `to` (descending): from > effect.init >= to.
  function passInitiative(from, to) {
    for (const entry of state.entries) {
      entry.effects = entry.effects.filter((effect) => {
        if (effect.duration <= 0) return true;
        if (!(effect.init < from && effect.init >= to)) return true;
        effect.duration -= 1;
        if (effect.duration <= 0) {
          table().say(`Effect ['${effect.label}'] -> [EXPIRED] on ${entry.name}`, "Combat", effect.gmOnly || entry.hidden);
          return false;
        }
        return true;
      });
    }
  }

  async function startTurn(entry, opts) {
    const secret = entry.hidden;
    table().say(`[TURN] ${entry.name}`, "Combat", secret);
    // Ongoing damage (CoreRPG's DMGO: "Severed artery; DMGO: 1d12") at the start of the turn.
    for (const effect of entry.effects) {
      for (const part of effect.label.split(";")) {
        const match = /^\s*DMGO\s*:\s*([0-9d+\- ]+)\s*$/i.exec(part);
        if (!match) continue;
        const rolled = table().roll(match[1].replace(/\s+/g, ""), `[DAMAGE] Ongoing damage (${effect.label.split(";")[0].trim()})`, "Combat", secret);
        // C&C: at least 1 (CoreRPG's minimum damage); 5E: at least 0.
        const ongoing = five() ? Math.max(0, rolled.total) : Math.max(1, rolled.total);
        if (ongoing > 0) await applyWounds(entry, ongoing, "[DAMAGE] Ongoing damage", opts);
      }
    }
    // Descending Darkness: a dying character loses a Health at its turn, once a round.
    if (bleeds() && health(entry).status === "Dying" && !entry.stabilized && state.round > 0 && entry.bleedRound < state.round) {
      entry.bleedRound = state.round;
      await applyWounds(entry, 1, "[DAMAGE] Bleeding out", opts);
    }
    // The dying bleed at the start of their turn, once a round.
    if (String(opts?.SIEGE_NEGATIVE_HP_BLEED ?? "off").toLowerCase() === "on" && !entry.stabilized && state.round > 0 && entry.bleedRound < state.round) {
      const { hp, wounds } = vitals(entry);
      const current = hp - wounds;
      const { dead, dying } = thresholds(opts);
      if (current <= dying && current > dead) {
        entry.bleedRound = state.round;
        await applyWounds(entry, 1, "[DAMAGE] Negative HP bleeding", opts);
      }
    }
  }

  async function applyWounds(entry, delta, why, opts) {
    const linked = record(entry);
    let before = vitals(entry);
    // 5E: temporary hit points take damage first (FG's d20 health); healing does not restore them.
    if (five() && delta > 0 && before.temp > 0 && linked?.type === "character") {
      const soaked = Math.min(before.temp, delta);
      table().records.update(linked.id, { data: { hp: { temp: before.temp - soaked } } }, table().seat);
      delta -= soaked;
      if (delta <= 0) {
        table().say(`${why} -> ${entry.name}: ${soaked} (temporary hit points, ${before.temp - soaked} left)`, "Combat", entry.hidden);
        changed();
        return;
      }
      before = vitals(entry);
    }
    let wounds = before.wounds + delta;
    if (astraOn()) {
      const character = linked?.type === "character";
      const grit = character ? Math.max(1, num(linked.data?.characteristics?.grit?.score, 7)) : 0;
      if (delta < 0 && before.wounds > before.hp) wounds = before.hp + delta;
      wounds = Math.max(0, Math.min(before.hp + grit, wounds));
    } else if (five()) {
      const character = linked?.type === "character";
      // Healing a Dying character starts from 0 hit points; their death saves are cleared.
      if (delta < 0 && before.wounds > before.hp) wounds = before.hp + delta;
      wounds = Math.max(0, Math.min(character ? before.hp * 2 : before.hp, wounds));
      if (delta < 0 && wounds < before.hp) {
        setDeathSaves(entry, { success: 0, failure: 0 });
        entry.stabilized = false;
      }
      // Damage to a Dying character is a failed death save, a critical hit two (FG 5E).
      if (!bleeds() && delta > 0 && character && before.wounds >= before.hp && wounds < before.hp * 2) {
        const saves = deathSaves(entry);
        setDeathSaves(entry, { ...saves, failure: Math.min(3, saves.failure + (opts?.critical ? 2 : 1)) });
      }
    }
    if (linked && linked.type === "character") table().records.update(linked.id, { data: { hp: { wounds } } }, table().seat);
    else entry.wounds = wounds;
    cachedThresholds = thresholds(opts);
    const status = health(entry).status;
    const current = before.hp - wounds;
    table().say(`${why} -> ${entry.name}: ${delta >= 0 ? delta : -delta} (${status}${entry.faction === "friend" ? `, HP ${current}/${before.hp}` : ""})`, "Combat", entry.hidden);
    changed();
  }

  // --- Apeira Astra -------------------------------------------------------------
  function weaponAstra(who, key, seat) {
    if (who.recordId) {
      const linked = table().records.get(who.recordId);
      if (!linked || linked.type !== "character") throw new Error("No such character.");
      if (seat.role !== "dm" && linked.owner !== seat.name) throw new Error("That is not your character.");
      const attack = linked.data.attacks?.[key] ?? (linked.data.inventorylist?.[key] && ra ? ra.weaponAttack(linked.data, linked.data.inventorylist[key]) : null);
      if (!attack) throw new Error("No such weapon.");
      return { actor: linked.name, name: attack.name, type: attack.type, bonus: attack.bonus, damage: attack.damage, damageBonus: 0, entry: state.entries.find((entry) => entry.recordId === linked.id) ?? null, record: linked };
    }
    mustGM(seat);
    const entry = find(who.entryId);
    const attack = ra.npcAttacks(record(entry)?.data)[key];
    if (!attack) throw new Error("No such attack.");
    return { actor: entry.name, name: attack.name, type: attack.type, bonus: attack.bonus, damage: attack.damage, damageBonus: 0, entry };
  }
  async function attackAstra(plan, from) {
    await raReady;
    const source = plan.entry;
    // Down (0 Stamina) is out of the fight; the dead do not act.
    const state0 = source ? health(source).status : "";
    if (state0 === "Down" || state0 === "Dead") throw new Error(`${source.name} is ${state0.toLowerCase()} and cannot attack.`);
    const atk = plan.bonus + effectBonus(source, "ATK");
    const formula = `2d6${atk ? `${atk > 0 ? "+" : ""}${atk}` : ""}${effectDice(source, "ATK")}`;
    const results = [];
    const targets = targetsOf(source);
    if (source) source.effectOn = {};
    if (targets.length === 0) {
      const roll = table().roll(formula, `[ATTACK] ${plan.name}`, from, false, { result: "NO TARGET", by: plan.actor });
      results.push({ total: roll.total, hit: null, effect: roll.total - 8 });
    }
    for (const target of targets) {
      const rolled = table().dice.roll(formula);
      const effect = rolled.total - 8;
      const hit = effect >= 0;
      const armour = vitals(target).ac;
      table().postRoll(rolled, `[ATTACK] ${plan.name} [${hit ? "HIT" : "MISS"} ${rolled.total} vs 8, Effect ${effect >= 0 ? "+" : ""}${effect}]${hit && armour ? ` [ARMOUR ${armour}]` : ""} -> [at ${target.name}]`, from, Boolean(target.hidden), { result: hit ? "HIT" : "MISS", by: plan.actor, against: 8, target: target.name });
      if (source && hit) source.effectOn[target.id] = effect;
      results.push({ target: target.name, total: rolled.total, hit, effect });
    }
    changed();
    return results;
  }
  // The damage: the weapon's dice once, then each target hit takes it plus the
  // attack's Effect, less its armour.
  async function damageAstra(plan, from, opts) {
    const bonus = plan.damageBonus + effectBonus(plan.entry, "DMG");
    const formula = `${plan.damage.replace(/\s+/g, "")}${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}`;
    const hitOn = plan.entry?.effectOn ?? null;
    const targets = targetsOf(plan.entry).filter((target) => !hitOn || target.id in hitOn);
    const roll = table().roll(formula, `[DAMAGE] ${plan.name}`, from, false, { by: plan.actor });
    const out = [];
    for (const target of targets) {
      const effect = Math.max(0, num(hitOn?.[target.id], 0));
      const armour = vitals(target).ac;
      const amount = Math.max(0, roll.total + effect - armour);
      if (amount > 0) await applyWounds(target, amount, `[DAMAGE] ${plan.name}${effect ? ` (+${effect} Effect)` : ""}${armour ? ` (-${armour} armour)` : ""}`, opts);
      else table().say(`[DAMAGE] ${plan.name} -> ${target.name}: stopped by armour`, "Combat", Boolean(target.hidden));
      out.push({ target: target.name, damage: amount });
    }
    if (plan.entry) plan.entry.effectOn = {};
    if (plan.entry && table().options?.().clearTargets === "action") plan.entry.targets = [];
    changed();
    return { total: roll.total, targets: out };
  }
  // A characteristic check in a fight (2d6 + its modifier + cl's shift, against 8).
  async function saveAstra(entry, stat, shift, from) {
    await raReady;
    const linked = record(entry);
    const key = String(stat ?? "").toLowerCase();
    const modifier = linked?.type === "character" ? num(linked.data?.characteristics?.[key]?.dm, 0) : num(ra.dm(linked?.data?.characteristics?.[key]?.score ?? 7), 0);
    const total = modifier + num(shift, 0) + effectBonus(entry, "SAVE");
    const rolled = table().dice.roll(`2d6${total ? `${total > 0 ? "+" : ""}${total}` : ""}`);
    const success = rolled.total >= 8;
    table().postRoll(rolled, `[CHECK] ${ra.STAT_NAMES[key] ?? key} [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs 8]`, from || entry.name, Boolean(entry.hidden), { result: success ? "SUCCESS" : "FAILURE", by: entry.name, against: 8 });
    return { total: rolled.total, success };
  }

  // --- D&D 5E -----------------------------------------------------------------
  // A creature's attack: a character's weapon (its sheet's attacks) or an NPC's action.
  function weapon5e(who, key, seat) {
    if (who.recordId) {
      const linked = table().records.get(who.recordId);
      if (!linked || linked.type !== "character") throw new Error("No such character.");
      if (seat.role !== "dm" && linked.owner !== seat.name) throw new Error("That is not your character.");
      const attack = linked.data.attacks?.[key] ?? (linked.data.inventorylist?.[key] ? r5.weaponAttack(linked.data, linked.data.inventorylist[key]) : null);
      if (!attack) throw new Error("No such weapon.");
      return { actor: linked.name, name: attack.name, type: attack.type, bonus: attack.bonus, damage: attack.dice ?? attack.damage, damageBonus: num(attack.damageBonus, 0), dmgtype: attack.dmgtype, entry: state.entries.find((entry) => entry.recordId === linked.id) ?? null, record: linked };
    }
    mustGM(seat);
    const entry = find(who.entryId);
    const attack = r5.npcAttacks(record(entry)?.data)[key];
    if (!attack) throw new Error("No such attack.");
    const dice = /^(\d*d\d+)([+-]\d+)?$/.exec(attack.damage);
    return { actor: entry.name, name: attack.name, type: attack.type, bonus: attack.bonus, damage: dice ? dice[1] : attack.damage, damageBonus: dice?.[2] ? Number(dice[2]) : 0, dmgtype: attack.dmgtype, entry };
  }
  function targetsOf(entry) {
    return (entry?.targets ?? []).map((id) => state.entries.find((item) => item.id === id)).filter(Boolean);
  }
  // 5E conditions (FG's 5E): a creature that drops to 0 gets Unconscious, so the
  // Dying, the stable and the dead count as unconscious; these cannot act, and
  // attacks against them (and the Paralyzed, Petrified, Stunned) have advantage.
  const FROZEN = ["paralyzed", "petrified", "stunned", "unconscious"];
  function downStatus(entry) {
    return entry ? ["Dying", "Unconscious", "Dead"].includes(health(entry).status) : false;
  }
  function frozen(entry) {
    return downStatus(entry) || FROZEN.some((name) => hasCondition(entry, name));
  }
  function mustAct(entry) {
    if (!entry || !five()) return;
    const status = health(entry).status;
    const why = ["Dying", "Unconscious", "Dead"].includes(status) ? status : [...FROZEN, "incapacitated"].find((name) => hasCondition(entry, name));
    if (why) throw new Error(`${entry.name} is ${why.toLowerCase()} and cannot act.`);
  }
  // The d20 a roll kept (with advantage, the higher of two).
  const natural = (rolled) => {
    const term = rolled.terms[0];
    return term.kept ? term.rolls.find((_, i) => term.kept[i]) : term.rolls[0];
  };
  async function attack5e(plan, from) {
    await r5Ready;
    const source = plan.entry;
    mustAct(source);
    const formulaFor = (target, advantage) => {
      const atk = plan.bonus + effectBonus(source, "ATK", target);
      return `${advantage ? "2d20kh1" : "1d20"}${atk ? `${atk > 0 ? "+" : ""}${atk}` : ""}${effectDice(source, "ATK", target)}`;
    };
    const kind = SHORT_TYPE[plan.type] ? ` (${SHORT_TYPE[plan.type]})` : "";
    const results = [];
    const targets = targetsOf(source);
    // A new attack forgets the last one's hits and criticals (FG clears its crit state here).
    if (source) source.hitOn = targets.length ? {} : null;
    if (targets.length === 0) {
      const roll = table().roll(formulaFor(null, false), `[ATTACK]${kind} ${plan.name}`, from, false, { result: "NO TARGET", by: plan.actor });
      results.push({ total: roll.total, hit: null, natural: natural(roll) });
    }
    for (const target of targets) {
      const ac = vitals(target).ac + effectBonus(target, "AC");
      // FG's getDefenseAdvantage: attacks on a frozen creature have advantage.
      const advantage = frozen(target);
      const rolled = table().dice.roll(formulaFor(target, advantage));
      const die = natural(rolled);
      let crit = die === 20;
      const hit = crit || (die !== 1 && rolled.total >= ac);
      // FG: a hit on a Paralyzed or Unconscious creature within 5 feet is a critical
      // (Kraken takes a melee attack as within 5 feet).
      const converted = hit && !crit && plan.type === "melee" && (downStatus(target) || hasCondition(target, "unconscious") || hasCondition(target, "paralyzed"));
      if (converted) crit = true;
      const verdict = crit ? "CRITICAL HIT" : die === 1 ? "AUTOMATIC MISS" : hit ? "HIT" : "MISS";
      const label = `[ATTACK]${kind} ${plan.name}${advantage ? " [ADVANTAGE]" : ""} [AC ${ac}] [${verdict} ${rolled.total} vs ${ac}]${converted ? " [CONVERTED TO CRIT]" : ""} -> [at ${target.name}]`;
      table().postRoll(rolled, label, from, Boolean(target.hidden), { result: crit ? "CRITICAL" : hit ? "HIT" : "MISS", by: plan.actor, against: ac, target: target.name });
      if (source) source.hitOn[target.id] = crit ? "crit" : hit ? "hit" : "miss";
      results.push({ target: target.name, total: rolled.total, ac, hit, crit, natural: die, advantage });
    }
    changed();
    return results;
  }
  // Doubles every die in a formula (a critical hit): 1d8+3 -> 2d8+3.
  const doubled = (formula) => formula.replace(/(\d*)d(\d+)/g, (_, count, sides) => `${(Number(count) || 1) * 2}d${sides}`);
  // Damage after an attack lands only on the targets it hit (FG's attack-then-damage
  // action); a critical doubles the dice for the targets it critted. With no attack
  // since the last damage, it lands on every target. 5E's damage is at least 0.
  // The attacker's DMG effects add to it (Silver Brand: 2d6), those aimed at a
  // creature only against it (Hunter's Quarry); a critical doubles their dice too.
  async function damage5e(plan, from, opts) {
    mustAct(plan.entry);
    const baseFor = (target) => {
      const bonus = plan.damageBonus + effectBonus(plan.entry, "DMG", target);
      return `${plan.damage.replace(/\s+/g, "")}${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}${effectDice(plan.entry, "DMG", target)}`;
    };
    const kind = SHORT_TYPE[plan.type] ? ` (${SHORT_TYPE[plan.type]})` : "";
    const hitOn = plan.entry?.hitOn ?? null;
    const all = targetsOf(plan.entry);
    const missed = hitOn ? all.filter((target) => !(target.id in hitOn) || hitOn[target.id] === "miss") : [];
    const landed = all.filter((target) => !missed.includes(target));
    if (plan.entry) plan.entry.hitOn = null;
    for (const target of missed) table().say(`[DAMAGE]${kind} ${plan.name} -> ${target.name}: the attack missed`, "Combat", Boolean(target.hidden));
    // One roll for each different damage: critted or not, and each target's own effects.
    const groups = [];
    for (const target of landed) {
      const crit = hitOn?.[target.id] === "crit";
      const formula = crit ? doubled(baseFor(target)) : baseFor(target);
      const group = groups.find((item) => item.crit === crit && item.formula === formula);
      if (group) group.targets.push(target);
      else groups.push({ crit, formula, targets: [target] });
    }
    groups.sort((a, b) => a.crit - b.crit);
    // No targets at all: the roll alone, for the table to apply.
    if (all.length === 0) groups.push({ crit: false, formula: baseFor(null), targets: [] });
    let total = 0;
    let anyCrit = false;
    for (const group of groups) {
      const formula = group.formula;
      const roll = table().roll(formula, `[DAMAGE]${kind} ${plan.name}${group.crit ? " [CRITICAL]" : ""}${plan.dmgtype ? ` [TYPE: ${plan.dmgtype}]` : ""}`, from, false, { by: plan.actor });
      const amount = Math.max(0, roll.total);
      total = Math.max(total, amount);
      anyCrit ||= group.crit;
      for (const target of group.targets) {
        if (amount > 0) await applyWounds(target, amount, `[DAMAGE] ${plan.name}`, { ...opts, critical: group.crit });
        else table().say(`[DAMAGE] ${plan.name} -> ${target.name}: no damage`, "Combat", Boolean(target.hidden));
      }
    }
    if (plan.entry && table().options?.().clearTargets === "action") plan.entry.targets = [];
    changed();
    return { total, crit: anyCrit, targets: landed.map((target) => target.name), missed: missed.map((target) => target.name) };
  }
  function saveBonus5e(entry, stat) {
    const linked = record(entry);
    if (linked?.type === "character") return num(linked.data?.abilities?.[stat]?.save, 0);
    return linked ? r5.npcSave(linked.data, stat) : 0;
  }
  // A saving throw against a DC (cl is the DC for 5E); effects' SAVE bonuses and dice count.
  async function save5e(entry, stat, dcIn, from, castName, { silent = false, advantage: chosen = "" } = {}) {
    await r5Ready;
    if (!STATS.includes(stat)) throw new Error("Pick an ability.");
    const dc = Math.max(0, Math.round(num(dcIn, 0)));
    const modifier = saveBonus5e(entry, stat) + effectBonus(entry, "SAVE");
    const linked = record(entry);
    const shaken = linked?.type === "character" ? r5.dreadAdvantage(linked.data, "save", stat, chosen) : { advantage: chosen, dread: false };
    const advantage = shaken.advantage;
    const d20 = advantage === "advantage" ? "2d20kh1" : advantage === "disadvantage" ? "2d20kl1" : "1d20";
    const rolled = table().dice.roll(`${d20}${modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : ""}${effectDice(entry, "SAVE")}`);
    const success = dc > 0 ? rolled.total >= dc : null;
    const name = `${stat[0].toUpperCase()}${stat.slice(1)}`;
    const label = `[SAVE] ${castName ? `${castName} (${name})` : name}${shaken.dread ? " [DREAD]" : ""}${advantage ? ` [${advantage.toUpperCase()}]` : ""}${dc ? ` [DC ${dc}] [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs ${dc}]` : ""}`;
    if (!silent) table().postRoll(rolled, label, from ?? entry.name, Boolean(entry.hidden), { ...(dc ? { result: success ? "SAVED" : "FAILED" } : {}), by: entry.name });
    return { name: entry.name, success, total: rolled.total, dc };
  }
  // A 5E spell (the SRD's actions as FG keeps them): a slot of its level spent
  // (a cantrip none), then for each target its attack roll or save, damage
  // (cantrips scale at 5th, 11th and 17th; half on a save where the spell says
  // so), healing (+ the casting modifier where FG's heal says base) and its effect.
  async function cast5e(who, spellName, seat, from) {
    await r5Ready;
    const npcEntry = typeof who === "object" && who?.entryId ? find(who.entryId) : null;
    if (npcEntry) mustGM(seat);
    const caster = npcEntry ? record(npcEntry) : table().records.get(typeof who === "object" ? who.recordId : who);
    if (!caster) throw new Error("No such caster.");
    if (!npcEntry && seat.role !== "dm" && caster.owner !== seat.name) throw new Error("That is not your character.");
    const spell = table().records.list({ type: "spell" }).find((item) => String(item.name).toLowerCase() === String(spellName ?? "").toLowerCase());
    if (!spell) throw new Error(`No spell ${spellName} in this campaign's books.`);
    const data = caster.data ?? {};
    const level = Math.max(0, Math.round(num(spell.data?.level, 0)));
    const casterEntry = npcEntry ?? state.entries.find((entry) => entry.recordId === caster.id) ?? null;
    mustAct(casterEntry);
    // An effect aimed at a creature (Hunter's Quarry) needs one targeted, before a slot is spent.
    if (casterEntry && !targetsOf(casterEntry).length && Object.values(spell.data?.actions ?? {}).some((row) => row?.type === "effect" && row.targeting === "self" && row.targeted)) throw new Error(`Target the creature for ${spell.name} first.`);
    const isCharacter = caster.type === "character";
    if (isCharacter && Array.isArray(data.spells) && data.spells.length && !data.spells.some((name) => String(name).toLowerCase() === spell.name.toLowerCase())) throw new Error(`${caster.name} does not have ${spell.name}.`);
    // A slot: the spell's level, else the lowest free one above it.
    let slotLevel = level;
    if (isCharacter && level > 0) {
      const slots = data.slots ?? {};
      const free = Object.entries(slots).map(([key, slot]) => [Number(key.slice(1)), slot]).filter(([at, slot]) => at >= level && num(slot.used, 0) < num(slot.max, 0)).sort((a, b) => a[0] - b[0])[0];
      if (!free) throw new Error(`${caster.name} has no spell slot of level ${level} or higher left.`);
      slotLevel = free[0];
      table().records.update(caster.id, { data: { slots: { [`l${slotLevel}`]: { used: num(free[1].used, 0) + 1 } } } }, table().seat);
    }
    // A concentration spell: the caster holds it (one at a time; the new one ends the last).
    if (isCharacter && /concentration/i.test(String(spell.data?.duration ?? ""))) table().records.update(caster.id, { data: { concentration: spell.name } }, table().seat);
    const castStat = isCharacter ? data.spellcasting?.stat : null;
    const castMod = isCharacter ? num(data.abilities?.[castStat]?.bonus, 0) : 0;
    const dc = isCharacter ? num(data.spellcasting?.dc, 10) : Number(/spell save DC (\d+)/i.exec(JSON.stringify(data))?.[1] ?? 12);
    const attackBonus = isCharacter ? num(data.spellcasting?.attack, 0) : Number(/([+-]\d+) to hit with spell attacks/i.exec(JSON.stringify(data))?.[1] ?? 4);
    const charLevel = isCharacter ? num(data.level, 1) : Math.max(1, Number(/^(\d+)/.exec(String(data.hd ?? "").replace(/[()]/g, ""))?.[1] ?? 1));
    const tiers = 1 + (charLevel >= 5) + (charLevel >= 11) + (charLevel >= 17);
    const actions = Object.values(spell.data?.actions ?? {}).filter((item) => item && typeof item === "object");
    const castRow = actions.find((item) => item.type === "cast") ?? {};
    const saveRow = actions.find((item) => item.type === "powersave");
    const attackRow = actions.find((item) => item.type === "attack");
    const damageRow = actions.find((item) => item.type === "damage");
    const healRow = actions.find((item) => item.type === "heal");
    const effectRow = actions.find((item) => item.type === "effect");
    const say = from ?? caster.name;
    table().say(`[CAST] ${spell.name}${level > 0 ? ` (level ${slotLevel} slot)` : " (cantrip)"}${saveRow ? ` [${String(saveRow.savetype).toUpperCase()} DC ${dc}]` : ""}`, say, Boolean(casterEntry?.hidden));
    // Damage or healing dice, scaled: a cantrip by the caster's level, an upcast by its extra slot levels.
    const diceOf = (list, stat) =>
      Object.values(list ?? {})
        .map((part) => {
          let count = Number(/^(\d*)d/.exec(String(part.dice))?.[1] || 1);
          const sides = Number(/d(\d+)/.exec(String(part.dice))?.[1] ?? 0);
          if (part.scalestat === "cantrip") count *= tiers;
          if (part.scalestat === "upcast" && slotLevel > level) count += (slotLevel - level) * Number(/^(\d*)d/.exec(String(part.scaledice ?? ""))?.[1] || 1);
          const bonus = num(part.bonus, 0) + (stat && part.stat === "base" ? castMod : 0);
          return sides ? `${count}d${sides}${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}` : `${bonus}`;
        })
        .join("+");
    const targets = targetsOf(casterEntry);
    const out = [];
    const minutes = (row) => Math.round(num(row?.durmod, 0) * (row?.durunit === "hour" ? 600 : row?.durunit === "minute" ? 10 : 1));
    if (healRow) {
      const formula = diceOf(healRow.heallist, true);
      const roll = table().roll(formula, `[HEAL] ${spell.name}`, say, false, { by: caster.name });
      for (const target of targets.length ? targets : casterEntry ? [casterEntry] : []) {
        await this_heal(target, roll.total);
        out.push({ target: target.name, heal: roll.total });
      }
    }
    // Magic Missile: darts that always hit, one roll each, shared across the targets.
    if (castRow.targeting === "multihit" && damageRow) {
      const darts = num(castRow.targetingval, 3) + (castRow.targetscalestat === "upcast" || castRow.allowupcast ? Math.max(0, slotLevel - level) : 0);
      for (let dart = 0; dart < darts && targets.length; dart++) {
        const target = targets[dart % targets.length];
        const roll = table().roll(diceOf(damageRow.damagelist), `[DAMAGE] ${spell.name} (dart ${dart + 1})`, say, Boolean(target.hidden), { by: caster.name });
        if (roll.total > 0) await applyWounds(target, roll.total, `[DAMAGE] ${spell.name}`, {});
        out.push({ target: target.name, damage: roll.total });
      }
    } else {
      let shared = null;
      for (const target of targets) {
        let landed = true;
        let half = false;
        let crit = false;
        if (attackRow) {
          // Attacks on a frozen creature have advantage; a melee hit on one Paralyzed or Unconscious is a critical (FG).
          const advantage = frozen(target);
          const rolled = table().dice.roll(`${advantage ? "2d20kh1" : "1d20"}${attackBonus >= 0 ? "+" : ""}${attackBonus}`);
          const die = natural(rolled);
          const ac = vitals(target).ac + effectBonus(target, "AC");
          landed = die === 20 || (die !== 1 && rolled.total >= ac);
          crit = die === 20;
          const converted = landed && !crit && attackRow.atktype === "melee" && (downStatus(target) || hasCondition(target, "unconscious") || hasCondition(target, "paralyzed"));
          if (converted) crit = true;
          table().postRoll(rolled, `[ATTACK] (${String(attackRow.atktype ?? "ranged")[0].toUpperCase()}) ${spell.name}${advantage ? " [ADVANTAGE]" : ""} [AC ${ac}] [${crit ? "CRITICAL HIT" : landed ? "HIT" : "MISS"} ${rolled.total} vs ${ac}]${converted ? " [CONVERTED TO CRIT]" : ""} -> [at ${target.name}]`, say, Boolean(target.hidden), { result: crit ? "CRITICAL" : landed ? "HIT" : "MISS", by: caster.name, against: ac, target: target.name });
        }
        if (saveRow) {
          const saved = await save5e(target, String(saveRow.savetype ?? "dexterity").toLowerCase(), dc, null, spell.name);
          if (saved.success) {
            half = saveRow.onmissdamage === "half";
            landed = half;
          }
        }
        if (damageRow && landed) {
          // One damage roll for an area (as FG), each target its own when it was an attack.
          let formula = diceOf(damageRow.damagelist);
          if (crit) formula = doubled(formula);
          const roll = attackRow || !shared ? table().roll(formula, `[DAMAGE] ${spell.name}${crit ? " [CRITICAL]" : ""} [TYPE: ${Object.values(damageRow.damagelist ?? {})[0]?.type ?? ""}]`, say, false, { by: caster.name }) : shared;
          if (!attackRow) shared = roll;
          const amount = half ? Math.floor(roll.total / 2) : roll.total;
          if (amount > 0) await applyWounds(target, amount, `[DAMAGE] ${spell.name}${half ? " (half)" : ""}`, { critical: crit });
          out.push({ target: target.name, damage: amount, half });
        }
        if (effectRow && effectRow.targeting !== "self" && (saveRow ? !landed || half ? false : true : landed)) {
          const label = String(effectRow.label ?? spell.name).replace(/\[SDC\]/g, `DC ${dc}`);
          putEffect(target, label, minutes(effectRow));
          out.push({ target: target.name, effect: label, rounds: minutes(effectRow) });
        }
      }
      // An effect on the caster's allies with no save and no targets (Bless with none picked): the caster.
      // An effect on the caster (FG's self targeting: Silver Brand), aimed at the
      // caster's targets where the row says so (Hunter's Quarry on its quarry).
      if (effectRow && effectRow.targeting === "self" && casterEntry) {
        const aimed = effectRow.targeted ? targets.map((target) => target.id) : [];
        putEffect(casterEntry, String(effectRow.label ?? spell.name), minutes(effectRow), false, aimed);
        out.push({ target: casterEntry.name, effect: effectRow.label, ...(aimed.length ? { against: targets.map((target) => target.name) } : {}) });
      } else if (effectRow && !saveRow && targets.length === 0 && casterEntry) {
        putEffect(casterEntry, String(effectRow.label ?? spell.name), minutes(effectRow));
        out.push({ target: casterEntry.name, effect: effectRow.label });
      }
    }
    if (casterEntry && table().options?.().clearTargets === "action") casterEntry.targets = [];
    changed();
    return out;
  }
  // Healing from a spell: the tracker's own heal (a Dying character starts from 0).
  async function this_heal(entry, amount) {
    if (health(entry).status === "Dead") return;
    const { wounds } = vitals(entry);
    await applyWounds(entry, -Math.min(Math.max(0, Math.round(amount)), wounds), "[HEAL]", {});
  }
  // A death saving throw (5E): d20, 10 or more a success; a 20 regains 1 hit
  // point; a 1 is two failures. Three successes: stable; three failures: dead.
  async function deathSave(entryId, seat) {
    const entry = find(entryId);
    if (bleeds()) throw new Error("Descending Darkness does not use death saves: the dying bleed until someone steadies them.");
    if (seat.role !== "dm" && owner(entry) !== seat.name) throw new Error("You roll your own death saves.");
    if (health(entry).status !== "Dying") throw new Error(`${entry.name} is not dying.`);
    const roll = table().roll("1d20", `[DEATH SAVE] ${entry.name}`, seat.role === "dm" ? "Combat" : seat.name, entry.hidden, { by: entry.name });
    const die = roll.total;
    const saves = deathSaves(entry);
    if (die === 20) {
      const { hp } = vitals(entry);
      setDeathSaves(entry, { success: 0, failure: 0 });
      const linked = record(entry);
      if (linked?.type === "character") table().records.update(linked.id, { data: { hp: { wounds: hp - 1 } } }, table().seat);
      else entry.wounds = entry.hp - 1;
      table().say(`${entry.name} rolls a natural 20 and regains 1 hit point.`, "Combat", entry.hidden);
    } else {
      const next = die >= 10 ? { ...saves, success: saves.success + 1 } : { ...saves, failure: Math.min(3, saves.failure + (die === 1 ? 2 : 1)) };
      setDeathSaves(entry, next);
      if (next.failure >= 3) table().say(`${entry.name} has died.`, "Combat", entry.hidden);
      else if (next.success >= 3) {
        entry.stabilized = true;
        table().say(`${entry.name} is stable.`, "Combat", entry.hidden);
      }
    }
    changed();
    return { die, deathsaves: deathSaves(entry), status: health(entry).status };
  }

  // Descending Darkness: steadying the dying. An ally (a character's record,
  // else the GM's call) rolls Wisdom against 12; a success and they are
  // stable (unconscious until healed).
  async function stabilize(entryId, helperRecordId, seat) {
    const entry = find(entryId);
    if (health(entry).status !== "Dying") throw new Error(`${entry.name} is not dying.`);
    const helper = helperRecordId ? table().records.get(String(helperRecordId)) : null;
    if (helper && seat.role !== "dm" && helper.owner !== seat.name) throw new Error("Steady them with your own character.");
    if (!helper && seat.role !== "dm") throw new Error("Which of your characters steadies them?");
    const wis = helper ? num(helper.data?.abilities?.wisdom?.bonus, 0) : 0;
    const shaken = helper && r5 ? r5.dreadAdvantage(helper.data, "check", "wisdom", "") : { advantage: "", dread: false };
    const rolled = table().dice.roll(`${shaken.dread ? "2d20kl1" : "1d20"}${wis ? (wis > 0 ? `+${wis}` : wis) : ""}`);
    const ok = rolled.total >= 12;
    table().postRoll(rolled, `[CHECK] Wisdom: steadying ${entry.name}${shaken.dread ? " [DREAD] [DISADVANTAGE]" : ""} [DC 12] [${ok ? "SUCCESS" : "FAILURE"} ${rolled.total} vs 12]`, helper?.name ?? "Combat", entry.hidden, { by: helper?.name ?? "Combat", result: ok ? "SUCCESS" : "FAILURE", against: 12 });
    if (ok) {
      entry.stabilized = true;
      table().say(`${entry.name} is steadied: unconscious, no longer bleeding.`, "Combat", entry.hidden);
    }
    changed();
    return { total: rolled.total, success: ok, status: health(entry).status };
  }

  return {
    ready: geometryReady,
    sorted,
    deathSave,
    stabilize,
    ruleset5e: five,
    // What a seat sees of the tracker. The GM sees everything; players do not
    // see hidden entries or GM-only effects, and see foes' health as a status.
    viewFor(seat) {
      const shown = sorted().filter((entry) => seat.role === "dm" || !entry.hidden);
      return {
        round: state.round,
        active: shown.some((entry) => entry.id === state.active) ? state.active : null,
        entries: shown.map((entry) => {
          const { hp, wounds, temp, ac } = vitals(entry);
          const status = health(entry);
          const numbers = seat.role === "dm" || entry.faction === "friend";
          return {
            id: entry.id,
            recordId: entry.recordId,
            tokenId: entry.tokenId,
            name: entry.name,
            faction: entry.faction,
            initresult: entry.initresult,
            init: seat.role === "dm" ? entry.init : undefined,
            hidden: entry.hidden,
            owner: owner(entry),
            mine: seat.role === "player" && owner(entry) === seat.name,
            health: status,
            ...(numbers ? { hp, wounds, ac, ...(temp ? { temp } : {}) } : {}),
            effects: entry.effects.filter((effect) => seat.role === "dm" || !effect.gmOnly).map(({ id, label, duration, targets }) => ({ id, label: targets?.length ? `${label} [-> ${targets.map((tid) => state.entries.find((item) => item.id === tid)?.name ?? "?").join(", ")}]` : label, duration })),
            targets: seat.role === "dm" || owner(entry) === seat.name ? entry.targets.filter((id) => shown.some((item) => item.id === id)) : [],
            ...(five() ? { deathsaves: record(entry)?.type === "character" || numbers ? deathSaves(entry) : undefined } : {}),
            attacks:
              five() && seat.role === "dm" && record(entry)?.type === "npc" && r5
                ? Object.entries(r5.npcAttacks(record(entry).data)).map(([key, attack]) => ({ key, name: attack.name, bonus: attack.bonus, damage: `${attack.damage} ${attack.dmgtype}`.trim() }))
                : seat.role === "dm" && record(entry)?.type === "npc"
                ? Object.entries(record(entry).data?.attacks ?? {}).map(([key, attack]) => ({ key, name: String(attack.name ?? "Attack"), bonus: num(record(entry).data?.bth, 0) + num(attack.bth, 0), damage: String(attack.damage ?? "") }))
                : undefined,
            powers:
              seat.role === "dm" && record(entry)?.type === "npc"
                ? Object.entries(record(entry).data?.powers ?? {})
                    .filter(([, power]) => power && typeof power === "object" && (power.damage || power.heal || power.save || power.failedeffect || power.effect || power.actions))
                    .map(([key, power]) => ({ key, name: String(power.name ?? "Power"), uses: num(power.uses, 0), used: num(entry.used?.[key], 0), damage: String(power.damage ?? ""), save: String(power.save ?? "") }))
                : undefined,
          };
        }),
      };
    },
    entries: () => state.entries,
    health,
    vitals,
    // Adds a character, an NPC record, or a plain creature.
    async add(input, seat) {
      mustGM(seat);
      const { engine, options: opts } = await options();
      cachedThresholds = thresholds(opts);
      const source = input.recordId ? table().records.get(input.recordId) : null;
      if (input.recordId && !source) throw new Error(`No record ${input.recordId}.`);
      if (source?.type === "character" && state.entries.some((entry) => entry.recordId === source.id)) {
        return state.entries.find((entry) => entry.recordId === source.id);
      }
      const added = [];
      const count = Math.min(20, Math.max(1, Math.round(num(input.count, 1))));
      for (let index = 0; index < count; index += 1) {
        let hp = Math.max(0, Math.round(num(input.hp, 0)));
        const npc5 = astraOn() && source && source.type !== "character" ? (await raReady, ra.npcStats(source.data)) : five() && source && source.type !== "character" ? (await r5Ready, r5.npcStats(source.data)) : null;
        if (npc5 && !hp) hp = npc5.hp;
        if (source && source.type !== "character" && !hp) {
          // SiegeCore getNPCHitPoints: the listed total, else the hit dice rolled (at least 1).
          hp = Math.round(num(source.data?.hptotal, 0));
          const dice = String(source.data?.hd ?? "").trim();
          if (hp <= 0 && /\d*d\d+/i.test(dice)) {
            try {
              hp = Math.max(1, table().dice.roll(dice.replace(/\s+/g, "")).total);
            } catch {
              hp = 1;
            }
          }
        }
        const base = text(input.name, source?.name ?? "Creature").slice(0, 50);
        const entry = cleanEntry({
          recordId: source?.id ?? null,
          tokenId: input.tokenId ?? null,
          name: base,
          faction: input.faction ?? (source?.type === "character" ? "friend" : "foe"),
          init: num(input.init, npc5 ? npc5.init : five() || astraOn() ? 0 : num(source?.data?.initiative?.misc, 0)),
          hp,
          ac: num(input.ac, npc5 ? npc5.ac : num(source?.data?.ac?.total, astraOn() ? 0 : 10)),
          hidden: Boolean(input.hidden),
        });
        // NNPC "append": the same name twice numbers them all.
        if (source?.type !== "character") {
          const same = state.entries.filter((item) => item.name === base || item.name.replace(/ \d+$/, "") === base);
          if (same.length > 0) {
            let high = Math.max(0, ...same.map((item) => Number(/ (\d+)$/.exec(item.name)?.[1] ?? 0)));
            for (const item of same) if (!/ \d+$/.test(item.name)) item.name = `${base} ${++high}`;
            entry.name = `${base} ${++high}`;
          }
        }
        state.entries.push(entry);
        added.push(entry);
      }
      void engine;
      changed();
      return added.length === 1 ? added[0] : added;
    },
    update(id, patch, seat) {
      mustGM(seat);
      const entry = find(id);
      for (const key of ["name", "faction", "init", "initresult", "hp", "wounds", "ac", "hidden", "tokenId"]) {
        if (patch[key] === undefined) continue;
        const next = cleanEntry({ ...entry, [key]: patch[key] });
        entry[key] = next[key];
      }
      changed();
      return entry;
    },
    remove(id, seat) {
      mustGM(seat);
      const index = state.entries.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error(`No one on the tracker is ${id}.`);
      const [gone] = state.entries.splice(index, 1);
      if (state.active === gone.id) state.active = null;
      for (const entry of state.entries) entry.targets = entry.targets.filter((id) => id !== gone.id);
      changed();
    },
    // Rolls initiative: one entry ("a player may roll their own"), every NPC, or everyone.
    async rollInit(which, seat) {
      const { engine, game, options: opts } = await options();
      const die = Math.max(2, Math.round(num(opts?.SIEGE_INIT_DIE, 10)));
      const pick =
        which === "npcs" ? state.entries.filter((entry) => record(entry)?.type !== "character") : which === "all" ? state.entries : [find(which)];
      if (seat.role !== "dm" && (pick.length !== 1 || owner(pick[0]) !== seat.name)) throw new Error("You can roll initiative for your own character.");
      // SiegeCore rollTrackerInit: the die, the initiative attribute's bonus
      // (SIEGE_INIT_STAT; none adds nothing) and the entry's own bonus.
      if (astraOn()) {
        // Apeira Astra: 2d6 + Reflex modifier + Tactics (a creature's from its record).
        for (const entry of pick) {
          const linked = record(entry);
          const bonus = linked?.type === "character" ? num(linked.data?.initiative?.total, 0) : entry.init;
          const roll = table().roll(`2d6${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}`, `[INIT] ${entry.name}`, seat.role === "dm" ? "Combat" : seat.name, entry.hidden);
          entry.initresult = roll.total;
        }
        changed();
        return;
      }
      if (five()) {
        // FG 5E: d20 + the initiative bonus (a character's DEX and its misc; a creature's from its block).
        for (const entry of pick) {
          const linked = record(entry);
          const bonus = linked?.type === "character" ? num(linked.data?.initiative?.total, 0) : entry.init;
          const roll = table().roll(`1d20${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}`, `[INIT] ${entry.name}`, seat.role === "dm" ? "Combat" : seat.name, entry.hidden);
          entry.initresult = roll.total;
        }
        changed();
        return;
      }
      const stat = String(opts?.SIEGE_INIT_STAT ?? "").toLowerCase();
      for (const entry of pick) {
        const score = record(entry)?.data?.attributes?.[stat]?.score;
        const bonus = entry.init + (score != null ? engine.abilityBonus(score, game) : 0);
        const formula = bonus === 0 ? `1d${die}` : `1d${die}${bonus > 0 ? "+" : ""}${bonus}`;
        const roll = table().roll(formula, `[INIT] ${entry.name}`, seat.role === "dm" ? "Combat" : seat.name, entry.hidden);
        entry.initresult = roll.total;
      }
      changed();
    },
    // Next turn (CombatManager.nextActor). A player may end their own turn.
    async next(seat) {
      const { options: opts } = await options();
      cachedThresholds = thresholds(opts);
      const list = sorted();
      if (list.length === 0) throw new Error("No one is on the tracker.");
      const active = list.find((entry) => entry.id === state.active) ?? null;
      // The table's option: a creature's targets clear when its turn ends.
      if (active && table().options?.().clearTargets === "turn") active.targets = [];
      if (seat.role !== "dm" && (!active || owner(active) !== seat.name)) throw new Error("It is not your turn.");
      const index = active ? list.indexOf(active) : -1;
      let nextIndex = -1;
      for (let i = index + 1; i < list.length; i += 1) {
        if (!skips(list[i], opts)) {
          nextIndex = i;
          break;
        }
        table().say(`[TURN] ${list[i].name}`, "Combat", true);
      }
      if (nextIndex >= 0) {
        const upcoming = list[nextIndex];
        passInitiative(active ? active.initresult : Infinity, upcoming.initresult);
        state.active = upcoming.id;
        if (state.round === 0) {
          state.round = 1;
          table().say(`[ROUND ${state.round}]`, "Combat");
        }
        await startTurn(upcoming, opts);
      } else {
        await this.nextRound({ role: "dm", name: "Combat" }, opts);
      }
      changed();
    },
    // A new round (CombatManager.nextRound): the rest of the round passes,
    // "[ROUND n]", and the first actor starts.
    async nextRound(seat, known) {
      mustGM(seat);
      const opts = known ?? (await options()).options;
      const list = sorted();
      const active = list.find((entry) => entry.id === state.active) ?? null;
      passInitiative(active ? active.initresult : Infinity, -Infinity);
      state.active = null;
      state.round += 1;
      table().say(`[ROUND ${state.round}]`, "Combat");
      const first = list.find((entry) => !skips(entry, opts));
      if (first) {
        passInitiative(Infinity, first.initresult);
        state.active = first.id;
        await startTurn(first, opts);
      }
      changed();
    },
    // Ends the fight: the round goes to 0; optionally the NPCs leave.
    end(seat, { removeNpcs = false } = {}) {
      mustGM(seat);
      state.round = 0;
      state.active = null;
      if (removeNpcs) state.entries = state.entries.filter((entry) => record(entry)?.type === "character");
      for (const entry of state.entries) entry.initresult = 0;
      changed();
    },
    addEffect(id, input, seat) {
      mustGM(seat);
      const entry = find(id);
      const active = state.entries.find((item) => item.id === state.active);
      const effect = cleanEffect({ ...input, init: active ? active.initresult : entry.initresult });
      if (!effect) throw new Error("What effect?");
      entry.effects.push(effect);
      table().say(`Effect ['${effect.label}'] -> [to ${entry.name}]`, "Combat", effect.gmOnly || entry.hidden);
      changed();
      return effect;
    },
    removeEffect(id, effectId, seat) {
      mustGM(seat);
      const entry = find(id);
      entry.effects = entry.effects.filter((effect) => effect.id !== effectId);
      changed();
    },
    async damage(id, amount, seat) {
      mustGM(seat);
      const { options: opts } = await options();
      const value = Math.round(num(amount, 0));
      if (value <= 0) throw new Error("How much damage?");
      await applyWounds(find(id), value, "[DAMAGE]", opts);
    },
    async heal(id, amount, seat) {
      mustGM(seat);
      const { options: opts } = await options();
      const entry = find(id);
      let value = Math.round(num(amount, 0));
      if (value <= 0) throw new Error("How much healing?");
      const { hp, wounds } = vitals(entry);
      const current = hp - wounds;
      const { dead, dying } = five() ? thresholdsFor(entry) : thresholds(opts);
      if (astraOn()) {
        if (health(entry).status === "Dead") {
          table().say("Healing cannot restore the dead.", "Combat", true);
          return;
        }
        await applyWounds(entry, -Math.min(value, wounds), "[HEAL]", opts);
        return;
      }
      if (five() && health(entry).status === "Dead") {
        table().say("Healing cannot restore a dead creature. Explicit revival is required.", "Combat", true);
        return;
      }
      if (five()) {
        await applyWounds(entry, -Math.min(value, wounds), "[HEAL]", opts);
        return;
      }
      if (current <= dead) {
        table().say("Healing cannot restore a dead creature. Explicit revival is required.", "Combat", true);
        return;
      }
      if (String(opts?.SIEGE_NEGATIVE_HEAL_CAP ?? "off").toLowerCase() === "on" && current < 0 && current >= -6) value = Math.min(value, Math.max(wounds - hp, 0));
      if (current <= dying && current > dead) entry.stabilized = true;
      value = Math.min(value, wounds);
      if (value <= 0) {
        changed();
        return;
      }
      await applyWounds(entry, -value, "[HEAL]", opts);
      if (vitals(entry).wounds <= 0) entry.stabilized = false;
    },
    // Targets: the GM sets any entry's; a player sets their own character's.
    target(sourceId, targetId, on, seat) {
      const source = find(sourceId);
      if (seat.role !== "dm" && owner(source) !== seat.name) throw new Error("You can target only with your own character.");
      find(targetId);
      source.targets = source.targets.filter((id) => id !== targetId);
      if (on) source.targets.push(targetId);
      changed();
      return source.targets;
    },
    // Everyone on the tracker whose token lies within radius feet of a point (a
    // Sleep or a fireball's area): the source's targets become them. faction
    // "foe", "friend" or "neutral" narrows it; the source is never its own target.
    targetArea(sourceId, { x, y, radius, faction = null }, seat, tokenAt) {
      const source = find(sourceId);
      if (seat.role !== "dm" && owner(source) !== seat.name) throw new Error("You can target only with your own character.");
      const reach = Math.max(0, num(radius, 0));
      const inside = state.entries.filter((entry) => {
        if (entry.id === source.id || (faction && entry.faction !== faction)) return false;
        // The dead are no one's target.
        if (health(entry).status === "Dead") return false;
        const token = tokenAt(entry);
        return token && Math.hypot(token.x - x, token.y - y) <= reach + 1e-6;
      });
      source.targets = inside.map((entry) => entry.id);
      changed();
      return inside.map((entry) => entry.name);
    },
    clearTargets(sourceId, seat) {
      const source = find(sourceId);
      if (seat.role !== "dm" && owner(source) !== seat.name) throw new Error("You can clear only your own targets.");
      source.targets = [];
      changed();
    },
    // An attack (SiegeCore ActionAttack): d20 + the attack's bonus + ATK effects,
    // one roll per target against its AC + AC effects; equal hits.
    // who: { recordId } for a character (weapon: inventory key), or { entryId }
    // for an NPC (weapon: its attacks key).
    async attack(who, weaponKey, seat, from) {
      const { engine, game, options: opts } = await options();
      const plan = this.weapon(who, weaponKey, engine, game, opts, seat);
      const source = plan.entry;
      if (astraOn()) return attackAstra(plan, from);
      if (five()) return attack5e(plan, from);
      if (plan.item && plan.record) {
        const fired = fireAmmunition(plan.record, plan.item, opts);
        if (!fired.ok) return [{ refused: `no ${plan.item.ammotype} left` }];
      }
      const atk = plan.bonus + effectBonus(source, "ATK");
      const formula = `1d20${atk >= 0 ? "+" : ""}${atk}`;
      const kind = SHORT_TYPE[plan.type] ? ` (${SHORT_TYPE[plan.type]})` : "";
      const targets = (source?.targets ?? []).map((id) => state.entries.find((entry) => entry.id === id)).filter(Boolean);
      const results = [];
      const natural = (roll) => roll?.terms?.[0]?.rolls?.[0];
      // CKG Chapter 17: a natural 20 is a critical hit, a natural 1 a fumble.
      const krit = async (roll, target) => {
        const die = natural(roll);
        if (die === 20 && target) return resolveKrit("crit", source, target, plan.type === "ranged", opts);
        if (die === 1) return resolveKrit("fumble", source, target, plan.type === "ranged", opts);
        return null;
      };
      if (targets.length === 0) {
        const roll = table().roll(formula, `[ATTACK]${kind} ${plan.name}`, from, false, { result: "NO TARGET", by: plan.actor });
        const result = await krit(roll, null);
        results.push({ total: roll.total, hit: null, natural: natural(roll), ...(result ? { krit: result } : {}) });
      }
      for (const target of targets) {
        const ac = vitals(target).ac + effectBonus(target, "AC");
        const rolled = table().dice.roll(formula);
        const hit = rolled.total >= ac;
        const label = `[ATTACK]${kind} ${plan.name} [AC ${ac}] [${hit ? "HIT" : "MISS"} ${rolled.total} vs ${ac}] -> [at ${target.name}]`;
        table().postRoll(rolled, label, from, Boolean(target.hidden), { result: hit ? "HIT" : "MISS", by: plan.actor, against: ac, target: target.name });
        const result = await krit(rolled, target);
        results.push({ target: target.name, total: rolled.total, ac, hit, natural: natural(rolled), ...(result ? { krit: result } : {}) });
      }
      return results;
    },
    // Damage (CoreRPG ActionDamage): the weapon's dice + its damage bonus + the
    // damage attribute (SIEGE_MELEE_DMG_STAT / SIEGE_RANGED_DMG_STAT) + DMG
    // effects, rolled once and applied to every target.
    async damageRoll(who, weaponKey, seat, from) {
      const { engine, game, options: opts } = await options();
      cachedThresholds = thresholds(opts);
      const plan = this.weapon(who, weaponKey, engine, game, opts, seat);
      if (!plan.damage) throw new Error(`${plan.name} has no damage.`);
      if (astraOn()) return damageAstra(plan, from, opts);
      if (five()) return damage5e(plan, from, opts);
      const bonus = plan.damageBonus + effectBonus(plan.entry, "DMG");
      let formula = `${plan.damage.replace(/\s+/g, "")}${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}`;
      const kind = SHORT_TYPE[plan.type] ? ` (${SHORT_TYPE[plan.type]})` : "";
      const targets = (plan.entry?.targets ?? []).map((id) => state.entries.find((entry) => entry.id === id)).filter(Boolean);
      // A critical's mark (maximum, an extra die, doubled...) changes this roll and is used up.
      await kritsReady;
      let tag = "";
      const mark = plan.entry?.effects.find((effect) => krits.isMark(effect.label));
      if (mark) {
        const marked = krits.markedFormula(plan.damage, bonus, mark.label);
        if (marked) {
          formula = marked.formula;
          tag = ` ${marked.tag}`;
        }
        plan.entry.effects = plan.entry.effects.filter((effect) => effect !== mark);
        changed();
      }
      const roll = table().roll(formula, `[DAMAGE]${kind} ${plan.name}${plan.dmgtype ? ` [TYPE: ${plan.dmgtype}]` : ""}${tag}`, from, false, { by: plan.actor });
      // CoreRPG: damage is at least 1 when dice were rolled.
      const amount = Math.max(1, roll.total);
      for (const target of targets) await applyWounds(target, amount, `[DAMAGE] ${plan.name}`, opts);
      // The table's option: targets clear once the attack's damage is rolled.
      if (plan.entry && table().options?.().clearTargets === "action") {
        plan.entry.targets = [];
        changed();
      }
      return { total: amount, targets: targets.map((target) => target.name) };
    },
    // What a creature attacks with, and its numbers.
    weapon(who, weaponKey, engine, game, opts, seat) {
      if (astraOn()) return weaponAstra(who, weaponKey, seat);
      if (five()) return weapon5e(who, weaponKey, seat);
      if (who.recordId) {
        const record = table().records.get(who.recordId);
        if (!record || record.type !== "character") throw new Error("No such character.");
        if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("That is not your character.");
        const item = record.data.inventorylist?.[weaponKey];
        if (!item || !String(item.damage ?? "").trim()) throw new Error("No such weapon.");
        const type = String(item.attacktype ?? "melee").toLowerCase() === "ranged" ? "ranged" : "melee";
        const stat = String(opts[type === "ranged" ? "SIEGE_RANGED_DMG_STAT" : "SIEGE_MELEE_DMG_STAT"] ?? "none").toLowerCase();
        const score = record.data.attributes?.[stat]?.score;
        return {
          actor: record.name,
          name: String(item.name),
          type,
          bonus: num(record.data.attack?.[type]?.total, num(record.data.bth, 0)) + num(item.bthbonus, 0),
          damage: String(item.damage),
          damageBonus: num(item.dmgbonus, 0) + (score != null ? engine.abilityBonus(score, game) : 0),
          dmgtype: String(item.dmgtype ?? ""),
          entry: state.entries.find((entry) => entry.recordId === record.id) ?? null,
          item,
          record,
        };
      }
      mustGM(seat);
      const entry = find(who.entryId);
      const record = entry.recordId ? table().records.get(entry.recordId) : null;
      const attack = record?.data?.attacks?.[weaponKey];
      if (!attack) throw new Error("No such attack.");
      return {
        actor: entry.name,
        name: String(attack.name ?? "Attack"),
        type: String(attack.attacktype ?? "melee").toLowerCase() === "ranged" ? "ranged" : "melee",
        bonus: num(record.data.bth, 0) + num(attack.bth, 0),
        damage: String(attack.damage ?? ""),
        damageBonus: num(attack.dmgbonus, 0),
        dmgtype: String(attack.dmgtype ?? ""),
        entry,
      };
    },
    // A save (SiegeCore ActionSiege, type save): d20 + the attribute bonus +
    // level + SAVE effects against CB (12 prime, 18 not) + CL. An NPC's level
    // is its hit dice and its primes its primeset (physical, mental, both).
    async save(entryId, stat, cl, from, castName, advantage = "") {
      if (astraOn()) return saveAstra(find(entryId), stat, cl, from);
      if (five()) return save5e(find(entryId), stat, cl, from, castName, { advantage: ["advantage", "disadvantage"].includes(advantage) ? advantage : "" });
      const { engine, game, options: opts } = await options();
      if (!STATS.includes(stat)) throw new Error("Pick an attribute.");
      const entry = find(entryId);
      const linked = record(entry);
      const data = linked?.data ?? {};
      let score = 10;
      let prime = false;
      let level = 0;
      if (linked?.type === "character") {
        score = num(data.attributes?.[stat]?.score, 10);
        prime = num(data.attributes?.[stat]?.prime, 0) === 1;
        level = num(data.level, 0);
      } else {
        const set = String(data.primeset ?? "").toLowerCase();
        prime = set === "both" || (set === "physical" && PHYSICAL.has(stat)) || (set === "mental" && !PHYSICAL.has(stat));
        level = Number(/^(\d+)/.exec(String(data.hd ?? ""))?.[1] ?? 0);
      }
      const bonus = siegeEffect(entry, stat, true);
      const addLevel = String(opts.SIEGE_ADD_LEVEL ?? "on").toLowerCase() === "on";
      const modifier = engine.abilityBonus(score, game) + (addLevel ? level : 0) + bonus;
      const rolled = table().dice.roll(`1d20${modifier >= 0 ? "+" : ""}${modifier}`);
      const result = engine.check({ d20: rolled.terms[0].rolls[0], score, prime, level, addLevel, cl: Math.round(num(cl, 0)), bonus }, game);
      const label = `[SAVE] ${castName ? `${castName} (${stat[0].toUpperCase()}${stat.slice(1)})` : `${stat[0].toUpperCase()}${stat.slice(1)}`} (${prime ? "Prime" : "Secondary"}) [CB ${result.cb} CL ${Math.round(num(cl, 0))} CC ${result.cc}]${bonus ? ` [EFFECT ${bonus > 0 ? "+" : ""}${bonus}]` : ""} [${result.success ? "SUCCESS" : "FAILURE"} ${result.total} vs ${result.cc}]`;
      table().postRoll(rolled, label, from ?? entry.name, Boolean(entry.hidden), { result: result.success ? "SAVED" : "FAILED", by: entry.name });
      return { name: entry.name, success: result.success, total: result.total, cc: result.cc };
    },
    // Casts one action of a character's power (SiegePowerActions with
    // SiegePowerResolution): a slot of the power's level is spent
    // (SIEGE_SLOTS_SPEND); targets roll their save against the caster level;
    // damage is one roll for everyone (each missile its own), halved or
    // cancelled for those who saved; an effect lands on those who failed;
    // healing goes to the targets, or the caster with none.
    async cast(who, powerKey, actionKey, seat, from) {
      if (five()) return cast5e(who, powerKey, seat, from);
      const { engine, game, options: opts } = await options();
      cachedThresholds = thresholds(opts);
      // An NPC casts from its tracker entry: its caster level is its hit dice,
      // and a power with uses per day counts them on the entry.
      const npcEntry = typeof who === "object" && who?.entryId ? find(who.entryId) : null;
      if (npcEntry) mustGM(seat);
      const caster = npcEntry ? record(npcEntry) : table().records.get(typeof who === "object" ? who.recordId : who);
      if (!caster || (!npcEntry && caster.type !== "character")) throw new Error(npcEntry ? "That creature has no record to cast from." : "No such character.");
      if (!npcEntry && seat.role !== "dm" && caster.owner !== seat.name) throw new Error("That is not your character.");
      const power = caster.data.powers?.[powerKey];
      if (!power) throw new Error("No such power.");
      if (npcEntry && num(power.uses, 0) > 0) {
        const used = num(npcEntry.used?.[powerKey], 0);
        if (used >= num(power.uses, 0)) throw new Error(`${npcEntry.name} has used ${power.name} ${used === 1 ? "once" : `${used} times`} today.`);
        npcEntry.used = { ...(npcEntry.used ?? {}), [powerKey]: used + 1 };
      }
      if (actionKey && !power.actions?.[actionKey]) throw new Error("No such action.");
      // A power with actions casts its first action unless one is named, as FG's
      // first cast button (Cure Light Wounds: Cure (living), not all three at once).
      let fromPower = null;
      if (!actionKey) {
        const first = Object.entries(power.actions ?? {}).find(([, item]) => item && typeof item === "object" && (item.effect || item.damage || item.heal || item.failedeffect));
        if (first) {
          actionKey = first[0];
          // The power's own scaling (missiles a level, caps) under the action's.
          fromPower = Object.fromEntries(["repeatbase", "repeatevery", "repeatstart", "repeatincrement", "scalecap", "dmgtype", "save", "saveeffect", "effectduration"].filter((key) => power[key] !== undefined && power[key] !== "").map((key) => [key, power[key]]));
        }
      }
      // A power with no actions casts from its own fields (SiegePower's power-level damage, heal, save).
      const action = actionKey
        ? { ...(fromPower ?? {}), ...power.actions[actionKey] }
        : { name: power.name, damage: power.damage, heal: power.heal, dmgtype: power.dmgtype, save: power.save, saveeffect: power.saveeffect, effect: power.effect, failedeffect: power.failedeffect, failedduration: power.failedduration };
      const casterLevel = npcEntry ? Math.max(1, num(caster.data.level, 0) || Number(/^(\d+)/.exec(String(caster.data.hd ?? ""))?.[1] ?? 1)) : Math.max(1, num(caster.data.level, 1));
      const cap = num(action.scalecap ?? power.scalecap, 0);
      if (action.damage) action.damage = levelDice(action.damage, casterLevel, cap);
      if (action.heal) action.heal = levelDice(action.heal, casterLevel, cap);
      const level = Math.round(num(power.level, 0));
      // Spend the slot.
      if (!npcEntry && String(opts.SIEGE_SLOTS_SPEND ?? "on").toLowerCase() !== "off" && !power.packagesource && !num(power.noslot, 0)) {
        const slot = caster.data.slots?.[`l${level}`];
        if (slot) {
          if (num(slot.used, 0) >= num(slot.max, 0)) throw new Error(`No level ${level} spells left today.`);
          table().records.update(caster.id, { data: { slots: { [`l${level}`]: { used: num(slot.used, 0) + 1 } } } }, table().seat);
        }
      }
      const entry = npcEntry ?? state.entries.find((item) => item.recordId === caster.id) ?? null;
      const self = action.effecttarget === "self";
      let targets = self || !entry ? [] : entry.targets.map((id) => state.entries.find((item) => item.id === id)).filter(Boolean);
      if ((action.heal && targets.length === 0) || self) targets = entry ? [entry] : [];
      const actionName = action.name && action.name !== power.name ? `${power.name}: ${action.name}` : power.name;
      table().say(`[CAST] ${actionName}${power.powertype ? ` (${power.powertype})` : ""} at caster level ${casterLevel}${targets.length ? ` -> [at ${targets.map((t) => t.name).join(", ")}]` : ""}`, from);
      // Spell resistance (SiegePowerResolution, srmode on): a target with
      // spell resistance rolls a plain d20; under it, the spell does nothing to it.
      const srMode = String(action.srmode || power.srmode || "").toLowerCase();
      if (srMode === "on") {
        const kept = [];
        for (const target of targets) {
          const sr = target === entry ? 0 : spellResistance(target);
          if (sr <= 0) {
            kept.push(target);
            continue;
          }
          const rolled = table().dice.roll("1d20");
          const die = rolled.terms[0].rolls[0];
          const affects = die >= sr;
          table().postRoll(rolled, `[SPELL RESISTANCE] vs SR ${sr} [${affects ? "Spell affects target" : "Spell resisted"} ${die} vs SR ${sr}] -> [${target.name}]`, target.name, Boolean(target.hidden), { result: affects ? "AFFECTED" : "RESISTED", by: target.name });
          if (affects) kept.push(target);
        }
        targets = kept;
      }
      // Saves.
      const saveStat = String(action.save || power.save || "").toLowerCase();
      const saveEffect = String(action.saveeffect || power.saveeffect || "").toLowerCase();
      const saved = new Map();
      if (STATS.includes(saveStat) && saveEffect !== "none") {
        for (const target of targets) {
          if (target === entry) continue;
          saved.set(target.id, (await this.save(target.id, saveStat, casterLevel, target.name, power.name)).success);
        }
      }
      // Damage: one roll per missile (or once for an area), shared out.
      const results = [];
      if (String(action.damage ?? "").trim()) {
        const count = repeats(action, casterLevel);
        const rolls = [];
        for (let i = 0; i < count; i += 1) {
          const rolled = table().roll(String(action.damage).replace(/\s+/g, ""), `[DAMAGE] ${actionName}${count > 1 ? ` (${i + 1} of ${count})` : ""}${action.dmgtype ? ` [TYPE: ${action.dmgtype}]` : ""}`, from);
          rolls.push(Math.max(1, rolled.total));
        }
        // An area spell (no repeats) hits every target with the one roll; missiles go round the targets.
        const hits = new Map();
        if (count === 1) for (const target of targets) hits.set(target.id, rolls[0]);
        else rolls.forEach((value, index) => targets.length && hits.set(targets[index % targets.length].id, (hits.get(targets[index % targets.length].id) ?? 0) + value));
        for (const target of targets) {
          let amount = hits.get(target.id) ?? 0;
          if (!amount) continue;
          if (saved.get(target.id)) amount = saveEffect === "half" ? Math.floor(amount / 2) : saveEffect === "negates" ? 0 : amount;
          if (amount > 0) await applyWounds(target, amount, `[DAMAGE] ${power.name}${saved.get(target.id) && saveEffect === "half" ? " [HALF]" : ""}`, opts);
          else table().say(`${target.name} saves: no damage from ${power.name}.`, "Combat", Boolean(target.hidden));
          results.push({ target: target.name, damage: amount });
        }
      }
      // Healing.
      if (String(action.heal ?? "").trim()) {
        const rolled = table().roll(String(action.heal).replace(/\s+/g, ""), `[HEAL] ${actionName}`, from);
        for (const target of targets) {
          await this.heal(target.id, Math.max(1, rolled.total), { role: "dm", name: "Combat" });
          results.push({ target: target.name, heal: rolled.total });
        }
      }
      // The failed effect (Paralyzed, Petrified): on each target that failed its
      // save, for its failed duration, unless "IMMUNE: <word>" matches.
      if (String(action.failedeffect ?? "").trim() && saved.size > 0) {
        const label = String(action.failedeffect).trim();
        const rounds = failedRounds(String(action.failedduration ?? ""), num(opts.SIEGE_ROUND_SECONDS, 0));
        for (const target of targets) {
          if (saved.get(target.id) !== false) continue;
          const names = `${label} ${power.name}`.toLowerCase();
          const immune = target.effects.some((effect) => effect.label.split(";").some((part) => {
            const match = /^\s*IMMUNE\s*:\s*(.*)$/i.exec(part);
            return match ? match[1].split(",").some((word) => word.trim().length > 2 && names.includes(word.trim().toLowerCase())) : false;
          }));
          if (immune) {
            table().say(`${target.name} is immune to ${label}.`, "Combat");
            continue;
          }
          putEffect(target, label, rounds);
          table().say(`Effect ['${label}'] -> [to ${target.name}]${rounds ? ` for ${rounds} round${rounds === 1 ? "" : "s"}` : ""}`, "Combat", Boolean(target.hidden));
          results.push({ target: target.name, effect: label, rounds });
        }
        changed();
      }
      // The effect, on those who did not save.
      if (String(action.effect ?? "").trim()) {
        const label = String(action.effect).replace(/\{CL:(\d+)\}/g, (_, cap) => String(Math.min(casterLevel, Number(cap)))).replace(/\{CL\}/g, String(casterLevel));
        const rounds = num(action.effectduration, 0) || durationRounds(power.duration, casterLevel, num(opts.SIEGE_ROUND_SECONDS, 10));
        const active = state.entries.find((item) => item.id === state.active);
        const landed = [];
        const resisted = [];
        for (const target of targets) {
          if (saved.get(target.id)) {
            resisted.push(target.name);
            continue;
          }
          target.effects.push(cleanEffect({ label, duration: rounds, init: active ? active.initresult : entry?.initresult ?? 0 }));
          landed.push(target.name);
        }
        if (landed.length) table().say(`Effect ['${label}'] -> [to ${landed.join(", ")}]${rounds ? ` for ${rounds} round${rounds === 1 ? "" : "s"}` : ""}`, "Combat");
        if (resisted.length) table().say(`${power.name}: no effect on ${resisted.join(", ")} (saved).`, "Combat");
        results.push(...landed.map((name) => ({ target: name, effect: label, rounds })));
        changed();
      }
      if (entry && table().options?.().clearTargets === "action") entry.targets = [];
      changed();
      return { power: power.name, action: action.name ?? "", casterLevel, saves: [...saved].map(([id, success]) => ({ target: find(id).name, success })), results };
    },
    // The CK's critical and fumble choices.
    async krits(changes, seat) {
      await kritsReady;
      if (changes && Object.keys(changes).length) {
        mustGM(seat);
        state.krits = krits.cleanSettings({ ...krits.cleanSettings(state.krits), ...changes });
        changed();
      }
      return { settings: krits.cleanSettings(state.krits), options: krits.OPTIONS, tables: Object.fromEntries(Object.entries(krits.TABLES).map(([key, chart]) => [key, chart.name])) };
    },
    // /krakenkrits crit|fumble: a result for one tracker entry against another.
    async kritTest(kind, sourceId, targetId, seat, forced) {
      mustGM(seat);
      const { options: opts } = await options();
      cachedThresholds = thresholds(opts);
      return resolveKrit(kind === "fumble" ? "fumble" : "crit", find(sourceId), targetId ? find(targetId) : null, false, opts, forced);
    },
    round: () => state.round,
    active: () => state.active,
    persisted: () => JSON.parse(JSON.stringify(state)),
  };
}

module.exports = { createCombat };
