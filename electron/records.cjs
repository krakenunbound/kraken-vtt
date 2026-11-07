const crypto = require("crypto");

// The campaign's records: characters, NPCs, items, notes, combat entries and so
// on. The host owns them; clients and agents send changes, the host checks
// permissions, applies them, and tells each seat only what it may see.
//
// A record is { id, type, name, owner, visibility, source, data, updatedAt }.
// - type: a short word chosen by the core or a ruleset ("character", "npc").
// - owner: a player name, or "" for the GM.
// - visibility: "gm" (GM only), "owner" (GM and the owner), or "all".
// - source: the module it was imported from, or "" for the campaign's own.
// - data: any JSON. Rulesets decide its shape.

const VISIBILITY = ["gm", "owner", "all"];
const MAX_RECORDS = 50000;
// What one player may keep: notes and characters, and the size of each.
const MAX_PLAYER_RECORDS = 300;
const MAX_PLAYER_DATA = 256 * 1024;
const MAX_DATA_BYTES = 2 * 1024 * 1024;

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

function cleanType(value) {
  const type = clean(value, 40).toLowerCase();
  if (!/^[a-z][a-z0-9_.-]*$/.test(type)) throw new Error("A record type is a short word, like character or npc.");
  return type;
}

function cleanData(value) {
  const data = value === undefined ? {} : value;
  const text = JSON.stringify(data);
  if (text === undefined) throw new Error("Record data must be JSON.");
  if (text.length > MAX_DATA_BYTES) throw new Error("That record is too large.");
  return JSON.parse(text);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Deep merge for updates: objects merge key by key, anything else replaces,
// and null deletes a key.
function merge(target, patch) {
  if (!isPlainObject(patch)) return patch;
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (isPlainObject(value)) out[key] = merge(out[key], value);
    else out[key] = value;
  }
  return out;
}

// Seat: { role: "dm" | "player", name }. The GM and agents act as "dm".
function canSee(record, seat) {
  if (!seat) return false;
  if (seat.role === "dm") return true;
  if (record.visibility === "all") return true;
  return record.visibility === "owner" && record.owner !== "" && record.owner === seat.name;
}

function canEdit(record, seat) {
  if (!seat) return false;
  if (seat.role === "dm") return true;
  return record.owner !== "" && record.owner === seat.name;
}

function asRecord(value) {
  if (!isPlainObject(value)) return null;
  try {
    const id = clean(value.id, 160);
    if (!id) return null;
    return {
      id,
      type: cleanType(value.type),
      name: clean(value.name, 120),
      owner: clean(value.owner, 24),
      visibility: VISIBILITY.includes(value.visibility) ? value.visibility : "gm",
      source: clean(value.source, 120),
      data: cleanData(value.data),
      updatedAt: Number(value.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

function createRecordStore({ saved = [], onChange = () => undefined } = {}) {
  const records = new Map();
  const listeners = new Set();
  for (const value of Array.isArray(saved) ? saved : []) {
    const record = asRecord(value);
    if (record) records.set(record.id, record);
  }

  // change: { kind: "upsert" | "delete", record, before }
  function emit(change) {
    onChange(change);
    for (const listener of listeners) listener(change);
  }

  function must(id) {
    const record = records.get(String(id ?? ""));
    if (!record) throw new Error(`No record ${id}.`);
    return record;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    list({ type, owner, name, source, seat } = {}) {
      const wantType = type ? String(type).toLowerCase() : "";
      const wantName = name ? String(name).toLowerCase() : "";
      return [...records.values()].filter(
        (record) =>
          (!seat || canSee(record, seat)) &&
          (!wantType || record.type === wantType) &&
          (owner === undefined || record.owner === owner) &&
          (source === undefined || record.source === source) &&
          (!wantName || record.name.toLowerCase().includes(wantName)),
      );
    },

    get(id, seat) {
      const record = records.get(String(id ?? ""));
      if (!record || (seat && !canSee(record, seat))) return null;
      return record;
    },

    create(input, seat) {
      if (!seat) throw new Error("Not allowed.");
      if (records.size >= MAX_RECORDS) throw new Error("This campaign has too many records.");
      const owner = seat.role === "dm" ? clean(input?.owner, 24) : seat.name;
      if (seat.role !== "dm") {
        // A player's records: a fair number each, of a fair size, and never an
        // id of their choosing (the party sheet's, a book's records' ids).
        let theirs = 0;
        for (const record of records.values()) if (record.owner === seat.name) theirs += 1;
        if (theirs >= MAX_PLAYER_RECORDS) throw new Error(`You have ${MAX_PLAYER_RECORDS} notes and characters already.`);
        if (JSON.stringify(input?.data ?? {}).length > MAX_PLAYER_DATA) throw new Error("That is too big to keep.");
      }
      const id = (seat.role === "dm" ? clean(input?.id, 160) : "") || `${cleanType(input?.type)}-${crypto.randomBytes(6).toString("hex")}`;
      if (records.has(id)) throw new Error(`Record ${id} already exists.`);
      const record = {
        id,
        type: cleanType(input?.type),
        name: clean(input?.name, 120),
        owner,
        visibility: VISIBILITY.includes(input?.visibility) ? input.visibility : seat.role === "dm" ? "gm" : "owner",
        source: seat.role === "dm" ? clean(input?.source, 120) : "",
        data: cleanData(input?.data),
        updatedAt: Date.now(),
      };
      records.set(id, record);
      emit({ kind: "upsert", record, before: null });
      return record;
    },

    // patch: { name?, owner?, visibility?, data? } — data deep-merges unless replace is true.
    update(id, patch, seat, { replace = false } = {}) {
      const before = must(id);
      if (!canEdit(before, seat)) throw new Error("You cannot change that record.");
      const next = { ...before };
      if (patch?.name !== undefined) next.name = clean(patch.name, 120);
      // Whispers go to a character by name: a player's character never takes another's.
      if (seat.role !== "dm" && before.type === "character" && next.name !== before.name) {
        const taken = next.name.toLowerCase();
        for (const record of records.values()) if (record.id !== before.id && record.type === "character" && record.name.toLowerCase() === taken) throw new Error(`${record.name} is another character's name.`);
      }
      if (seat.role !== "dm" && patch?.data !== undefined && JSON.stringify(patch.data).length > MAX_PLAYER_DATA) throw new Error("That is too big to keep.");
      if (seat.role === "dm") {
        if (patch?.owner !== undefined) next.owner = clean(patch.owner, 24);
        if (patch?.visibility !== undefined) {
          if (!VISIBILITY.includes(patch.visibility)) throw new Error("Visibility is gm, owner or all.");
          next.visibility = patch.visibility;
        }
      } else if (before.type === "note" && (patch?.visibility === "owner" || patch?.visibility === "all")) {
        // A player shares their own note with the table, or stops (FG's notes).
        next.visibility = patch.visibility;
      }
      if (patch?.data !== undefined) next.data = cleanData(replace ? patch.data : merge(before.data, patch.data));
      next.updatedAt = Date.now();
      records.set(next.id, next);
      emit({ kind: "upsert", record: next, before });
      return next;
    },

    remove(id, seat) {
      const before = must(id);
      if (!canEdit(before, seat)) throw new Error("You cannot delete that record.");
      records.delete(before.id);
      emit({ kind: "delete", record: before, before });
      return before;
    },

    toJSON() {
      return [...records.values()];
    },
  };
}

module.exports = { createRecordStore, canSee, canEdit, merge };
