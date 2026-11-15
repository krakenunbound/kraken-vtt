// The Effects list's actions, kept by the host (FG's Effects window, Kraken's
// way): put an effect on a creature (a condition, a buff, a light, or the
// GM's own), take it off, change it, put a light out and light it again; and
// the GM's own effects kept in the campaign as records of type "effect".
//
// Where an effect goes: a creature on the combat tracker keeps it on its entry
// (durations count down by initiative, FG's way); a token not in the fight
// keeps it on the token (a torch lit while exploring) until it joins. A drop
// on a sheet (a record) finds that character's entry, else its token.
//
// Who may: the GM, anything on anyone. A player, only on their own character,
// and only what the GM's option allows (table option playerEffects: none,
// lights, conditions = lights and conditions, all).
const path = require("path");
const { pathToFileURL } = require("url");

let effectsLib = null;
let registry = null;
const ready = Promise.all([
  import(pathToFileURL(path.join(__dirname, "..", "shared", "actions", "effects.mjs")).href).then((module) => (effectsLib = module)),
  import(pathToFileURL(path.join(__dirname, "..", "shared", "rulesets", "registry.mjs")).href).then((module) => (registry = module)),
]);

const text = (value, fallback = "") => {
  const clean = String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
};

// table: the table server's agent handle (records, combat, map, say, options, ruleset).
function createEffects(table) {
  const declaration = () => registry?.rulesetFor(table.ruleset?.() ?? "").actions ?? null;
  const roundSeconds = () => declaration()?.roundSeconds ?? 6;
  // Token effects live on the table map (not the GM's private image window).
  const mapOf = () => table.tableMap ?? table.map;

  // The Effects list: the game's presets and the GM's own (records "effect").
  function list(seat) {
    const presets = effectsLib.presetsFor(declaration());
    const own = table.records
      .list({ type: "effect", seat })
      .map((record) => ({ id: `custom:${record.id}`, recordId: record.id, kind: ["condition", "buff", "debuff", "light"].includes(record.data?.kind) ? record.data.kind : "buff", label: text(record.data?.label, record.name), icon: text(record.data?.icon, ""), text: text(record.data?.text, ""), duration: Number(record.data?.duration) || 0, burn: Number(record.data?.burn) || null, gmOnly: Boolean(record.data?.gmOnly), custom: true }));
    return [...presets, ...own];
  }

  // The effect an Effects list entry puts on: its words, its time in rounds
  // (a light's burn time in this game's rounds), its picture, who put it on.
  function fromPreset(item, extra = {}) {
    const rounds = item.kind === "light" ? effectsLib.burnRounds(item.burn, roundSeconds()) : Math.max(0, Math.round(Number(extra.duration ?? item.duration) || 0));
    return { label: item.label, duration: rounds, total: rounds, icon: item.icon || undefined, gmOnly: Boolean(extra.gmOnly ?? item.gmOnly), source: extra.source };
  }

  // Where it goes: { entryId } | { tokenId } | { recordId }. Returns
  // { kind: "entry", entry } or { kind: "token", token } and the owner's name.
  function resolve(to) {
    const entries = table.combat.entries();
    const tokens = mapOf().scene() ? mapOf().tokens() : [];
    if (to?.entryId) {
      const entry = entries.find((item) => item.id === String(to.entryId));
      if (!entry) throw new Error("No one like that is on the combat tracker.");
      return { kind: "entry", entry, owner: table.combat.owner(entry), name: entry.name, hidden: entry.hidden };
    }
    if (to?.tokenId) {
      const token = tokens.find((item) => item.id === String(to.tokenId));
      if (!token) throw new Error("No such token on this map.");
      const entry = entries.find((item) => item.tokenId === token.id) ?? (token.recordId ? entries.find((item) => item.recordId === token.recordId && !item.tokenId) : null);
      if (entry) return { kind: "entry", entry, owner: table.combat.owner(entry), name: entry.name, hidden: entry.hidden };
      const owner = token.owner || (token.recordId ? table.records.get(token.recordId)?.owner ?? "" : "");
      return { kind: "token", token, owner, name: token.name, hidden: token.hidden };
    }
    if (to?.recordId) {
      const entry = entries.find((item) => item.recordId === String(to.recordId));
      if (entry) return { kind: "entry", entry, owner: table.combat.owner(entry), name: entry.name, hidden: entry.hidden };
      const token = tokens.find((item) => item.recordId === String(to.recordId));
      if (token) return resolve({ tokenId: token.id });
      throw new Error("That character is neither on the map nor on the combat tracker: put their token on the map first.");
    }
    throw new Error("Put it on whom? A token, a tracker entry or a character.");
  }

  function mayTouch(where, seat, kind) {
    if (seat.role === "dm") return;
    if (!where.owner || where.owner !== seat.name) throw new Error("You can put effects only on your own character.");
    const allowed = table.options?.().playerEffects ?? "conditions";
    const ok = allowed === "all" || (allowed === "conditions" && (kind === "light" || kind === "condition")) || (allowed === "lights" && kind === "light");
    if (!ok) throw new Error(allowed === "none" ? "The GM has not let players put on effects." : `The GM lets players put on ${allowed === "lights" ? "lights" : "lights and conditions"} only.`);
  }

  const effectsAt = (where) => (where.kind === "entry" ? where.entry.effects : mapOf().tokenEffects(where.token.id));

  function say(line, where, secret) {
    table.say(line, "Combat", Boolean(secret || where.hidden));
  }

  return {
    ready,
    list,
    // Puts an effect on: preset (an Effects list id: "torch", "prone", "custom:<record>"), or
    // effect ({ label, duration, icon, gmOnly }: a custom one typed in).
    apply({ to, preset, effect, duration, gmOnly } = {}, seat) {
      const where = resolve(to);
      let item;
      if (preset) {
        item = list(seat).find((entry) => entry.id === String(preset));
        if (!item) throw new Error(`No effect "${preset}" in this game's list.`);
      } else {
        const label = text(effect?.label);
        if (!label) throw new Error("An effect needs words: a name, then its parts (Bless; ATK: 1d4).");
        item = { id: "", kind: effectsLib.lightOf(label) ? "light" : effectsLib.conditionsOf(label).length ? "condition" : effectsLib.toneOf(label) === "bad" ? "debuff" : "buff", label, icon: text(effect?.icon), duration: Number(effect?.duration) || 0, burn: Number(effect?.burn) || null, gmOnly: Boolean(effect?.gmOnly) };
      }
      mayTouch(where, seat, item.kind);
      const made = fromPreset(item, { duration, gmOnly: seat.role === "dm" ? gmOnly : false, source: seat.role === "dm" ? "" : seat.name });
      let placed;
      if (where.kind === "entry") placed = table.combat.putOn(where.entry.id, made);
      else {
        const list = mapOf().setTokenEffects(where.token.id, [...mapOf().tokenEffects(where.token.id), made]);
        placed = list[list.length - 1];
      }
      const name = item.label.split(";")[0].trim();
      say(`Effect ['${item.label}'] -> [to ${where.name}]${placed.duration ? ` for ${placed.duration} round${placed.duration === 1 ? "" : "s"}` : ""}`, where, placed.gmOnly);
      return { effect: placed, to: where.name, name };
    },
    remove({ to, effectId } = {}, seat) {
      const where = resolve(to);
      const effect = effectsAt(where).find((item) => item.id === String(effectId));
      if (!effect) throw new Error("That effect is gone.");
      mayTouch(where, seat, effectsLib.lightOf(effect.label) ? "light" : "condition");
      if (where.kind === "entry") table.combat.takeOff(where.entry.id, effect.id);
      else mapOf().setTokenEffects(where.token.id, mapOf().tokenEffects(where.token.id).filter((item) => item.id !== effect.id));
      say(`Effect ['${effect.label}'] -> [REMOVED] from ${where.name}`, where, effect.gmOnly);
      return { removed: effect.label };
    },
    // Changes an effect (the GM: its words, time, secrecy; its owner may put a light out or relight it).
    update({ to, effectId, patch } = {}, seat) {
      const where = resolve(to);
      const effect = effectsAt(where).find((item) => item.id === String(effectId));
      if (!effect) throw new Error("That effect is gone.");
      const keys = Object.keys(patch ?? {});
      if (seat.role !== "dm" && keys.some((key) => key !== "paused")) throw new Error("Only the GM changes an effect's words or time.");
      mayTouch(where, seat, effectsLib.lightOf(effect.label) ? "light" : "condition");
      const clean = {};
      if (patch.label !== undefined) clean.label = text(patch.label, effect.label);
      if (patch.duration !== undefined) clean.duration = Math.max(0, Math.round(Number(patch.duration) || 0));
      if (patch.duration !== undefined && !(effect.total > 0)) clean.total = clean.duration;
      if (patch.gmOnly !== undefined) clean.gmOnly = Boolean(patch.gmOnly);
      if (patch.paused !== undefined) clean.paused = Boolean(patch.paused);
      let changed;
      if (where.kind === "entry") changed = table.combat.changeEffect(where.entry.id, effect.id, clean);
      else {
        const list = mapOf().tokenEffects(where.token.id).map((item) => (item.id === effect.id ? { ...item, ...clean } : item));
        changed = mapOf().setTokenEffects(where.token.id, list).find((item) => item.id === effect.id);
      }
      if (patch.paused !== undefined && effectsLib.lightOf(effect.label)) say(`${where.name} ${patch.paused ? "puts out" : "lights"} the ${effect.label.split(";")[0].trim().toLowerCase()}${!patch.paused && changed.duration ? ` (${changed.duration} rounds left)` : ""}.`, where, effect.gmOnly);
      return { effect: changed };
    },
    // Every effect on a creature (its owner and the GM see them all, a player not the GM's secret ones).
    on(to, seat) {
      const where = resolve(to);
      return effectsAt(where).filter((effect) => seat.role === "dm" || !effect.gmOnly);
    },
    // The GM's own effects, kept in the campaign: made or changed, and deleted.
    save(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM makes effects for the list.");
      const label = text(input?.label);
      if (!label) throw new Error("An effect needs words: a name, then its parts (Hex; DMG: 1d6 necrotic).");
      const data = {
        label,
        kind: ["condition", "buff", "debuff", "light"].includes(input?.kind) ? input.kind : effectsLib.lightOf(label) ? "light" : effectsLib.toneOf(label) === "bad" ? "debuff" : "buff",
        icon: text(input?.icon).slice(0, 24),
        text: text(input?.text).slice(0, 400),
        duration: Math.max(0, Math.round(Number(input?.duration) || 0)),
        burn: Number(input?.burn) > 0 ? Math.round(Number(input.burn)) : null,
        gmOnly: Boolean(input?.gmOnly),
      };
      const name = label.split(";")[0].trim().slice(0, 80);
      if (input?.id) return table.records.update(String(input.id).replace(/^custom:/, ""), { name, data }, seat);
      return table.records.create({ type: "effect", name, visibility: "all", data }, seat);
    },
    delete(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM deletes effects from the list.");
      return table.records.remove(String(id).replace(/^custom:/, ""), seat);
    },
  };
}

module.exports = { createEffects };
