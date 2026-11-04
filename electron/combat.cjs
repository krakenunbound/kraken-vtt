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
  };
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
  };
}

// The number an effect's components add for a tag: "Bless; ATK: 1; AC: -2"
// gives ATK 1, AC -2 (CoreRPG effect components, numeric ones only).
function effectBonus(entry, tag) {
  let total = 0;
  for (const effect of entry?.effects ?? []) {
    for (const part of effect.label.split(";")) {
      const match = /^\s*([A-Z]+)\s*:\s*([+-]?\d+)\s*$/i.exec(part);
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
  function putEffect(entry, label, duration = 0, gmOnly = false) {
    const active = state.entries.find((item) => item.id === state.active);
    const effect = cleanEffect({ label, duration, gmOnly, init: active ? active.initresult : entry.initresult });
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
          await applyWounds(who, 999, "[DAMAGE] Kraken Krit: instant death", opts);
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
      return { hp: Number(data.hp?.total) || 0, wounds: Number(data.hp?.wounds) || 0, ac: Number(data.ac?.total) || entry.ac };
    }
    return { hp: entry.hp, wounds: entry.wounds, ac: entry.ac };
  }

  function thresholds(opts) {
    return { dead: num(opts?.SIEGE_HP_DEAD, -10), dying: num(opts?.SIEGE_HP_DYING, -7) };
  }

  let cachedThresholds = { dead: -10, dying: -7 };
  function health(entry) {
    const { hp, wounds } = vitals(entry);
    return geometry ? geometry.healthStatus(hp, wounds, cachedThresholds) : { status: "Healthy", percent: 0, color: "#00C000" };
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
        await applyWounds(entry, Math.max(1, rolled.total), "[DAMAGE] Ongoing damage", opts);
      }
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
    const before = vitals(entry);
    const wounds = before.wounds + delta;
    if (linked && linked.type === "character") table().records.update(linked.id, { data: { hp: { wounds } } }, table().seat);
    else entry.wounds = wounds;
    cachedThresholds = thresholds(opts);
    const status = health(entry).status;
    const current = before.hp - wounds;
    table().say(`${why} -> ${entry.name}: ${delta >= 0 ? delta : -delta} (${status}${entry.faction === "friend" ? `, HP ${current}/${before.hp}` : ""})`, "Combat", entry.hidden);
    changed();
  }

  return {
    ready: geometryReady,
    sorted,
    // What a seat sees of the tracker. The GM sees everything; players do not
    // see hidden entries or GM-only effects, and see foes' health as a status.
    viewFor(seat) {
      const shown = sorted().filter((entry) => seat.role === "dm" || !entry.hidden);
      return {
        round: state.round,
        active: shown.some((entry) => entry.id === state.active) ? state.active : null,
        entries: shown.map((entry) => {
          const { hp, wounds, ac } = vitals(entry);
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
            ...(numbers ? { hp, wounds, ac } : {}),
            effects: entry.effects.filter((effect) => seat.role === "dm" || !effect.gmOnly).map(({ id, label, duration }) => ({ id, label, duration })),
            targets: seat.role === "dm" || owner(entry) === seat.name ? entry.targets.filter((id) => shown.some((item) => item.id === id)) : [],
            attacks:
              seat.role === "dm" && record(entry)?.type === "npc"
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
          init: num(input.init, num(source?.data?.initiative?.misc, 0)),
          hp,
          ac: num(input.ac, num(source?.data?.ac?.total, 10)),
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
      const { dead, dying } = thresholds(opts);
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
      return { total: amount, targets: targets.map((target) => target.name) };
    },
    // What a creature attacks with, and its numbers.
    weapon(who, weaponKey, engine, game, opts, seat) {
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
    async save(entryId, stat, cl, from, castName) {
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
