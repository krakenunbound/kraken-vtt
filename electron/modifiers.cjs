const { AsyncLocalStorage } = require("async_hooks");

// The modifier stack (FG's modifier box and its keys), one per seat, kept by
// the host so every roll a seat starts reads it: the tray, /roll, a sheet's
// rolls, the tracker's attacks, saves and damage, casting.
//
// A request from a seat (a table message, or an agent's tool call as the GM)
// runs inside a scope. The first roll in it that reads the stack takes a
// snapshot; every later roll of the same request reads the same snapshot (FG
// locks the stack for a full attack or a cast), and what was used is cleared
// from the seat's stack at once: the numbers if any roll took them, each key
// that a roll read. An empty stack changes nothing at all.

const MAX_SLOTS = 6;
const scope = new AsyncLocalStorage();

// The kind of roll a label says it is (the tags the rules put on a roll).
// "none": the stack is not for it (hit points, ongoing damage, a table...).
function kindOf(label) {
  const said = String(label ?? "").replace(/^\[(TOWER|BLIND)\]\s*/, "");
  if (/hit points|ongoing damage|which attribute|: where\b|\bKrit\b/i.test(said)) return "none";
  if (/^\[(STABILIZE|SCAR|TABLE|ORACLE|DELVE|TRAVELLER CREATION|SHIP DAMAGE|KRIT|DEATH SAVE)/i.test(said)) return "none";
  if (/^\[DAMAGE\]/i.test(said)) return "damage";
  if (/^\[HEAL\]/i.test(said)) return "heal";
  if (/^\[(ATTACK|SHIP ATTACK)\]/i.test(said)) return "attack";
  if (/^\[INIT\]/i.test(said)) return "init";
  if (/\[SAVE\]|saving throw|\bsave\b/i.test(said)) return "save";
  if (/^\[(CHECK|SKILL|SIEGE)\]|check\b/i.test(said)) return "check";
  return "roll";
}

const cleanSlot = (slot) => {
  const value = Math.round(Number(slot?.value));
  if (!Number.isFinite(value) || Math.abs(value) > 999) return null;
  return { label: String(slot?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 40), value };
};
// mode: who sees this seat's rolls (the chat bar's roll mode, Foundry's): public, gm (the GM and you), blind (the GM alone), self (you alone).
const MODES = ["public", "gm", "blind", "self"];
const cleanStack = (stack) => ({
  slots: (Array.isArray(stack?.slots) ? stack.slots : []).map(cleanSlot).filter(Boolean).slice(0, MAX_SLOTS),
  keys: [...new Set((Array.isArray(stack?.keys) ? stack.keys : []).map((key) => String(key).slice(0, 24)))].slice(0, 16),
  ...(MODES.includes(stack?.mode) && stack.mode !== "public" ? { mode: stack.mode } : {}),
});
const total = (stack) => stack.slots.reduce((sum, slot) => sum + slot.value, 0);

// The first die of a formula with one more of it, the highest (adv) or
// lowest (dis) kept; one already rolled so is left (or undone by the other).
function withDie(formula, die) {
  const match = /^(\s*)(\d*)d(\d+)(?:(kh|kl|k)(\d+))?(?![\d%f])/i.exec(formula);
  if (!match) return { formula, applied: null };
  const count = match[2] === "" ? 1 : Number(match[2]);
  const sides = match[3];
  const keepMode = match[4] ? (match[4].toLowerCase() === "k" ? "kh" : match[4].toLowerCase()) : null;
  const keepN = match[5] ? Number(match[5]) : null;
  const rest = formula.slice(match[0].length);
  // A modifier after the die (an explosion, a reroll) leaves it as it is.
  if (/^[!xr]|^cs|^d\d/i.test(rest)) return { formula, applied: null };
  const state = keepMode && keepN === count - 1 ? (keepMode === "kh" ? "adv" : "dis") : keepMode ? "other" : "plain";
  if (state === "other") return { formula, applied: null };
  const base = state === "plain" ? count : count - 1;
  if (state === die) return { formula, applied: die };
  // ADV on a roll with disadvantage (or DIS on advantage) cancels: the plain die.
  const next = state === "plain" ? `${base + 1}d${sides}${die === "adv" ? "kh" : "kl"}${base}` : `${base}d${sides}`;
  return { formula: `${match[1]}${next}${rest}`, applied: die };
}

function createModifiers({ saved, keysFor, kindsFor, onChange }) {
  const stacks = new Map(Object.entries(saved && typeof saved === "object" ? saved : {}).map(([key, stack]) => [key, cleanStack(stack)]));
  const view = (key) => {
    const stack = stacks.get(key) ?? { slots: [], keys: [] };
    return { slots: stack.slots.map((slot) => ({ ...slot })), keys: [...stack.keys], total: total(stack), mode: stack.mode ?? "public" };
  };
  const put = (key, stack) => {
    const clean = cleanStack(stack);
    if (!clean.slots.length && !clean.keys.length && !clean.mode) stacks.delete(key);
    else stacks.set(key, clean);
    onChange?.(key, view(key));
    return view(key);
  };
  const live = (key) => stacks.get(key) ?? { slots: [], keys: [] };

  // The stack's actions, as the box and the keys do them (and kraken_modifiers).
  function act(key, args = {}) {
    const stack = live(key);
    const action = String(args.action ?? "view");
    if (action === "view") return view(key);
    if (action === "add") {
      const slot = cleanSlot(args);
      if (!slot) throw new Error("Give a number for the modifier, like 2 or -1.");
      if (stack.slots.length >= MAX_SLOTS) throw new Error(`The modifier box holds ${MAX_SLOTS} at most: roll, or take one off (right-click it).`);
      return put(key, { ...stack, slots: [...stack.slots, slot] });
    }
    if (action === "remove") {
      const index = Number(args.index);
      if (!Number.isInteger(index) || !stack.slots[index]) throw new Error("No modifier there.");
      return put(key, { ...stack, slots: stack.slots.filter((_, at) => at !== index) });
    }
    if (action === "set") {
      // The box's own number typed in: it becomes the one unnamed slot (named ones kept).
      const value = Math.round(Number(args.value) || 0);
      const named = stack.slots.filter((slot) => slot.label);
      return put(key, { ...stack, slots: value ? [...named, { label: "", value }].slice(-MAX_SLOTS) : named });
    }
    if (action === "clear") return put(key, { slots: [], keys: args.keys === false ? stack.keys : [], mode: stack.mode });
    if (action === "mode") {
      if (!MODES.includes(args.mode)) throw new Error(`A roll mode: ${MODES.join(", ")}.`);
      return put(key, { ...stack, mode: args.mode });
    }
    if (action === "key") {
      const known = keysFor();
      const found = known.find((item) => item.id === String(args.key ?? ""));
      if (!found) throw new Error(`This game's keys: ${known.map((item) => item.id).join(", ") || "none"}.`);
      const on = typeof args.on === "boolean" ? args.on : !stack.keys.includes(found.id);
      // A key of a group turns the others of its group off (FG's exclusion sets); ADV and DIS too.
      const others = new Set(known.filter((item) => item.id !== found.id && ((found.group && item.group === found.group) || (found.die && item.die && item.die !== found.die))).map((item) => item.id));
      const keys = stack.keys.filter((id) => id !== found.id && (!on || !others.has(id)));
      return put(key, { ...stack, keys: on ? [...keys, found.id] : keys });
    }
    throw new Error("view, add, remove, set, clear, key or mode?");
  }

  // What the stack does to a roll of this kind, from the seat whose request
  // this is. formula: the roll's dice; label: its label when known.
  // under: a roll-under die (lower is better), so the numbers come off it.
  function plan(formula, kind = "roll", label = "", { under = false } = {}) {
    const here = scope.getStore();
    const none = { formula, finish: (result) => result };
    if (!here || !here.key || kind === "none") return none;
    if (!here.snapshot) {
      const stack = live(here.key);
      if (!stack.slots.length && !stack.keys.length) return none;
      here.snapshot = { slots: stack.slots.map((slot) => ({ ...slot })), keys: [...stack.keys] };
      here.used = { slots: false, keys: new Set() };
    }
    const kinds = kindsFor();
    if (kinds && !kinds.includes(kind)) return none;
    const snapshot = here.snapshot;
    const damageKind = kind === "damage" || kind === "heal";
    const mods = [];
    let next = String(formula);
    let bonus = 0;
    let damage = null;
    const keys = keysFor().filter((item) => snapshot.keys.includes(item.id));
    for (const item of keys) {
      const reads = item.on ? item.on.includes(kind) : item.die ? !damageKind : true;
      if (!reads) continue;
      if (item.die) {
        const changed = withDie(next, item.die);
        if (!changed.applied) continue;
        next = changed.formula;
      }
      if (item.damage) {
        if (item.damage === "crit" && /\[CRITICAL/i.test(label)) continue;
        damage = item.damage;
        if (item.damage === "crit") next = next.replace(/(^|[+-])(\d*)d(\d+)/gi, (_all, sign, count, sides) => `${sign}${(count === "" ? 1 : Number(count)) * 2}d${sides}`);
      }
      if (item.add) bonus += item.add;
      mods.push({ label: item.label, ...(item.add ? { value: item.add } : {}), key: item.id });
      here.used.keys.add(item.id);
    }
    for (const slot of snapshot.slots) {
      bonus += slot.value;
      mods.push({ label: slot.label, value: slot.value });
    }
    if (snapshot.slots.length) here.used.slots = true;
    if (!mods.length) return none;
    const signed = under ? -bonus : bonus;
    if (signed) next = `${next}${signed > 0 ? "+" : ""}${signed}`;
    // What was used goes from the seat's stack now (a later roll of this request keeps reading the snapshot).
    const stack = live(here.key);
    put(here.key, { ...stack, slots: here.used.slots ? [] : stack.slots, keys: stack.keys.filter((id) => !here.used.keys.has(id)) });
    return {
      formula: next,
      finish(result) {
        if (damage === "max") {
          let sum = 0;
          for (const term of result.terms) {
            if (term.kind !== "dice") {
              sum += term.sign * term.value;
              continue;
            }
            term.rolls = term.rolls.map(() => (term.fate ? 1 : term.sides));
            term.sum = term.rolls.reduce((acc, value, i) => acc + (term.kept[i] ? value : 0), 0);
            sum += term.sign * term.sum;
          }
          result.total = sum;
        }
        if (damage === "half") result.total = Math.floor(result.total / 2);
        result.mods = mods;
        return result;
      },
    };
  }

  // A roll read through the stack: the dice of `dice` (the host's), its result marked with what applied.
  function roll(dice, formula, kind = "roll", label = "", options = {}) {
    const planned = plan(formula, kind, label, options);
    return planned.finish(dice.roll(planned.formula));
  }

  // The roll mode of the seat whose request this is (a table message's seat; never the agent's).
  function modeNow() {
    const here = scope.getStore();
    if (!here?.seat) return null;
    const mode = live(here.key).mode ?? "public";
    return mode === "public" ? null : { mode, seat: here.seat };
  }

  return { act, view, plan, roll, modeNow, toJSON: () => Object.fromEntries(stacks) };
}

// Runs fn as a request from the seat `key` ("@gm" for the GM and the agent);
// seat: a table seat's { id, name, gm } (its roll mode applies), none for the agent.
const run = (key, fn, seat = null) => scope.run({ key, seat, snapshot: null, used: null }, fn);

module.exports = { createModifiers, kindOf, withDie, run, scope, MAX_SLOTS };
