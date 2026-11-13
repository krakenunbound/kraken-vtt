// Each person's own settings, kept by the GM's app for every campaign it runs
// (beside accounts.json): a player's by their account name, the GM's as
// "@gm". The user tier: their colour (pings and ink), their dice (my dice,
// damage dice, the GM's NPC dice) and how dice show on their screen. A
// character's own dice are the character tier, kept on the character record.
// Both outlast a restart, a reload, another browser and signing in again.
const fs = require("fs");
const path = require("path");

const MAX_PEOPLE = 600;
const key = (name) =>
  String(name ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 24)
    .toLowerCase();
const isColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const clamp = (value, low, high, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback;
};

// lookOf: the table's dice-look cleaner (tableServer's diceLook).
function cleanPrefs(input, before, lookOf) {
  const out = { ...(before ?? {}) };
  if (!input || typeof input !== "object") return out;
  if (input.color === null) delete out.color;
  else if (isColor(input.color)) out.color = input.color.toLowerCase();
  for (const set of ["look", "npc", "damage"]) {
    if (input[set] === undefined) continue;
    if (input[set] === null) {
      if (set === "look") delete out.look;
      else out[set] = null;
      continue;
    }
    const look = lookOf(input[set]);
    if (look) out[set] = look;
  }
  if (typeof input.show === "boolean") out.show = input.show;
  if (typeof input.sound === "boolean") out.sound = input.sound;
  // When their turn comes round: a bell, and a banner across their screen.
  if (typeof input.turnSound === "boolean") out.turnSound = input.turnSound;
  if (typeof input.turnBanner === "boolean") out.turnBanner = input.turnBanner;
  if (input.volume !== undefined) out.volume = clamp(input.volume, 0, 1, 0.7);
  if (input.tray !== undefined) out.tray = clamp(input.tray, 0.6, 1.6, 1);
  if (input.roll !== undefined) out.roll = clamp(input.roll, 0.5, 2.5, 1);
  return out;
}

function createPrefsStore(file, lookOf) {
  /** @type {Map<string, object>} */
  const people = new Map();
  try {
    const parsed = file ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    for (const [name, prefs] of Object.entries(parsed?.people ?? {})) if (key(name)) people.set(key(name), cleanPrefs(prefs, {}, lookOf));
  } catch {
    /* Nothing kept yet. */
  }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ people: Object.fromEntries(people) }));
    fs.renameSync(temp, file);
  };
  return {
    get: (name) => people.get(key(name)) ?? {},
    set(name, patch) {
      const id = key(name);
      if (!id) throw new Error("Whose settings?");
      if (!people.has(id) && people.size >= MAX_PEOPLE) throw new Error("Too many people's settings are kept.");
      const next = cleanPrefs(patch, people.get(id), lookOf);
      people.set(id, next);
      save();
      return next;
    },
    remove(name) {
      if (people.delete(key(name))) save();
    },
  };
}

module.exports = { createPrefsStore, cleanPrefs };
