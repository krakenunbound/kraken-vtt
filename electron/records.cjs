const crypto = require("crypto");
const { sanitizeFormatted } = require("../shared/text/formatted.mjs");

// The campaign's records: characters, NPCs, items, notes, combat entries and so
// on. The host owns them; clients and agents send changes, the host checks
// permissions, applies them, and tells each seat only what it may see.
//
// A record is { id, type, name, owner, visibility, source, data, updatedAt }.
// - type: a short word chosen by the core or a ruleset ("character", "npc").
// - owner: a player name, or "" for the GM.
// - visibility: "gm" (GM only), "owner" (GM and the owner), "all", or a list
//   of player names (shared with those players alone, as FG's share with one).
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

// A list of player names (shared with them alone): trimmed, once each; none is the GM's alone.
function cleanVisibility(value) {
  if (Array.isArray(value)) {
    const names = [];
    for (const item of value.slice(0, 32)) {
      const name = clean(item, 24);
      if (name && !names.some((have) => have.toLowerCase() === name.toLowerCase())) names.push(name);
    }
    return names.length ? names : "gm";
  }
  return VISIBILITY.includes(value) ? value : null;
}
const sameName = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

// The formatted texts a record keeps (a story's, a note's, a quest's): only
// FG's tags, whoever writes them (shared/text/formatted.mjs).
const FORMATTED_TYPES = new Set(["note", "story", "quest"]);
function cleanFormatted(type, data) {
  if (!FORMATTED_TYPES.has(type) || !data || typeof data !== "object") return data;
  if (typeof data.text === "string") data.text = sanitizeFormatted(data.text);
  if (data.blocks && typeof data.blocks === "object")
    for (const block of Object.values(data.blocks)) if (block && typeof block === "object" && typeof block.text === "string") block.text = sanitizeFormatted(block.text);
  return data;
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
  const owns = record.owner !== "" && record.owner === seat.name;
  if (Array.isArray(record.visibility)) return owns || record.visibility.some((name) => sameName(name, seat.name));
  return record.visibility === "owner" && owns;
}

// FG's identification (CoreRPG's isidentified, nonid_name, nonid_notes; a
// missing isidentified is identified): an item the players have not yet
// identified reaches a player's screen as its unidentified name and notes
// only, wherever it is: an item record of the campaign's own, a row of a
// character's gear, the party's parcel, a treasure parcel. A book's records
// are left as the book has them (its shop and its wizard read them).
const unidentified = (value) => isPlainObject(value) && (value.isidentified === 0 || value.isidentified === "0");
const KEPT_UNIDENTIFIED = ["isidentified", "nonid_name", "nonid_notes", "count", "carried", "location", "weight", "assign", "slot", "slots", "bulky", "petty"];
function hiddenItem(value) {
  const out = { name: clean(value.nonid_name, 120) || "Unidentified item" };
  for (const key of KEPT_UNIDENTIFIED) if (value[key] !== undefined) out[key] = value[key];
  return out;
}
function stripUnidentified(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const list = value.map((item) => stripUnidentified(item, depth + 1));
    return list.some((item, index) => item !== value[index]) ? list : value;
  }
  if (unidentified(value)) return hiddenItem(value);
  let out = value;
  for (const [key, child] of Object.entries(value)) {
    if (!child || typeof child !== "object") continue;
    const next = stripUnidentified(child, depth + 1);
    if (next !== child) {
      if (out === value) out = { ...value };
      out[key] = next;
      // A parcel's row is named after the item it carries.
      if (key === "item" && unidentified(child)) out.name = next.name;
    }
  }
  return out;
}
const MAY_HOLD_ITEMS = new Set(["item", "character", "party", "treasureparcel", "npc"]);
// What one seat is shown of a record: the GM all of it; a player, an
// unidentified item as its unidentified self. Never used to act on a record.
function viewFor(record, seat) {
  if (!record || !seat || seat.role === "dm" || record.source || !MAY_HOLD_ITEMS.has(record.type)) return record;
  if (record.type === "item" && unidentified(record.data)) return { ...record, name: clean(record.data.nonid_name, 120) || "Unidentified item", data: hiddenItem(record.data) };
  const data = stripUnidentified(record.data);
  return data === record.data ? record : { ...record, data };
}
// An item's name as the players are told it (a chat line about it).
const itemName = (item) => (unidentified(item) ? clean(item.nonid_name, 120) || "Unidentified item" : clean(item?.name, 120));

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
      visibility: cleanVisibility(value.visibility) ?? "gm",
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
        visibility: cleanVisibility(input?.visibility) ?? (seat.role === "dm" ? "gm" : "owner"),
        source: seat.role === "dm" ? clean(input?.source, 120) : "",
        data: cleanFormatted(cleanType(input?.type), cleanData(input?.data)),
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
          const visibility = cleanVisibility(patch.visibility);
          if (!visibility) throw new Error("Visibility is gm, owner, all or a list of players' names.");
          next.visibility = visibility;
        }
      } else if (before.type === "note" && (patch?.visibility === "owner" || patch?.visibility === "all" || Array.isArray(patch?.visibility))) {
        // A player shares their own note with the table, or with some of it, or stops (FG's notes).
        const visibility = cleanVisibility(patch.visibility);
        next.visibility = visibility === "gm" ? "owner" : visibility;
      }
      if (patch?.data !== undefined) next.data = cleanFormatted(next.type, cleanData(replace ? patch.data : merge(before.data, patch.data)));
      next.updatedAt = Date.now();
      records.set(next.id, next);
      emit({ kind: "upsert", record: next, before });
      return next;
    },

    // A copy of a record as the campaign's own (FG's Duplicate, and Copy to
    // campaign for a book's): a new id, no book and no book path, hidden from
    // the players; name: by default the old one with " (copy)". record: a
    // book's record that is not in the campaign (read from the book).
    duplicate(id, seat, { name, record: given } = {}) {
      if (seat?.role !== "dm") throw new Error("Only the GM copies records.");
      const source = given ?? must(id);
      const data = cleanData(source.data);
      delete data.fgPath;
      return this.create({ type: source.type, name: name ?? `${source.name} (copy)`, visibility: "gm", data }, seat);
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

module.exports = { createRecordStore, canSee, canEdit, merge, viewFor, itemName, cleanVisibility, unidentified };
