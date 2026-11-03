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

function savedCombat(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
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
      const atk = plan.bonus + effectBonus(source, "ATK");
      const formula = `1d20${atk >= 0 ? "+" : ""}${atk}`;
      const kind = SHORT_TYPE[plan.type] ? ` (${SHORT_TYPE[plan.type]})` : "";
      const targets = (source?.targets ?? []).map((id) => state.entries.find((entry) => entry.id === id)).filter(Boolean);
      const results = [];
      if (targets.length === 0) {
        const roll = table().roll(formula, `[ATTACK]${kind} ${plan.name}`, from, false, { result: "NO TARGET", by: plan.actor });
        results.push({ total: roll.total, hit: null });
      }
      for (const target of targets) {
        const ac = vitals(target).ac + effectBonus(target, "AC");
        const rolled = table().dice.roll(formula);
        const hit = rolled.total >= ac;
        const label = `[ATTACK]${kind} ${plan.name} [AC ${ac}] [${hit ? "HIT" : "MISS"} ${rolled.total} vs ${ac}] -> [at ${target.name}]`;
        table().postRoll(rolled, label, from, Boolean(target.hidden), { result: hit ? "HIT" : "MISS", by: plan.actor, against: ac, target: target.name });
        results.push({ target: target.name, total: rolled.total, ac, hit });
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
      const formula = `${plan.damage.replace(/\s+/g, "")}${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""}`;
      const kind = SHORT_TYPE[plan.type] ? ` (${SHORT_TYPE[plan.type]})` : "";
      const targets = (plan.entry?.targets ?? []).map((id) => state.entries.find((entry) => entry.id === id)).filter(Boolean);
      const roll = table().roll(formula, `[DAMAGE]${kind} ${plan.name}${plan.dmgtype ? ` [TYPE: ${plan.dmgtype}]` : ""}`, from, false, { by: plan.actor });
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
    round: () => state.round,
    active: () => state.active,
    persisted: () => JSON.parse(JSON.stringify(state)),
  };
}

module.exports = { createCombat };
