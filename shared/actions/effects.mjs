// @ts-check
// Effects on creatures, the core's way (FG's CoreRPG effects, read by every
// game): an effect's label is its name and its components separated by ";"
// ("Bless; ATK: 1d4; SAVE: 1d4", "Hold Person; Paralyzed", "Torch; LIGHT:
// 20/40 #ff9e3d flicker"). This module reads labels into conditions, numbers
// and lights; names each condition's icon, token visual and words; and lists
// the presets the Effects window offers (a game picks its own list in its
// shared/<id>/actions.mjs).
//
// Parts after "FAIL:" are what happens when a repeated save fails (FG's 2024
// effects: "Sleep; Incapacitated; SAVEOE: [SDC] wisdom; FAIL: inherit;
// Unconscious"): they are not on the creature yet.

/** @typedef {{ id: string, label: string, icon: string, fx: string | null, tone: "good" | "bad" | "neutral", text: string, words?: string[] }} Condition */

/** The core's conditions: every game's list is drawn from these (and its own extras). @type {Condition[]} */
export const CONDITIONS = [
  { id: "asleep", label: "Asleep", icon: "sleep", fx: "zzz", tone: "bad", text: "Magically asleep: unconscious until woken; taking damage wakes it.", words: ["asleep", "sleep", "sleeping", "slumber"] },
  { id: "unconscious", label: "Unconscious", icon: "down", fx: "down", tone: "bad", text: "Unconscious: cannot act, drops what it holds, falls prone; attacks against it have advantage.", words: ["unconscious"] },
  { id: "dying", label: "Dying", icon: "down", fx: "down", tone: "bad", text: "Dying: at 0 hit points or below, making death saves or bleeding out.", words: ["dying"] },
  { id: "poisoned", label: "Poisoned", icon: "poison", fx: "bubbles", tone: "bad", text: "Poisoned: disadvantage on attack rolls and ability checks.", words: ["poisoned", "poison"] },
  { id: "burning", label: "Burning", icon: "fire", fx: "flames", tone: "bad", text: "On fire: takes fire damage each turn until put out.", words: ["burning", "on fire", "ignited"] },
  { id: "frozen", label: "Frozen", icon: "cold", fx: "frost", tone: "bad", text: "Frozen: encased in ice and slowed or held.", words: ["frozen", "frostbitten", "chilled"] },
  { id: "petrified", label: "Petrified", icon: "stone", fx: "stone", tone: "bad", text: "Petrified: turned to stone; incapacitated, resistant to damage, unaware.", words: ["petrified", "stone"] },
  { id: "frightened", label: "Frightened", icon: "fear", fx: "tremble", tone: "bad", text: "Frightened: disadvantage on checks and attacks while it can see the source of its fear; cannot move closer to it.", words: ["frightened", "feared", "afraid", "panicked", "shaken"] },
  { id: "stunned", label: "Stunned", icon: "stun", fx: "stars", tone: "bad", text: "Stunned: incapacitated, fails Strength and Dexterity saves; attacks against it have advantage.", words: ["stunned"] },
  { id: "dazed", label: "Dazed", icon: "stun", fx: "dazed", tone: "bad", text: "Dazed: can take no actions.", words: ["dazed"] },
  { id: "paralyzed", label: "Paralyzed", icon: "paralysis", fx: "crackle", tone: "bad", text: "Paralyzed: incapacitated and cannot move or speak; fails Strength and Dexterity saves; hits from within 5 feet are critical.", words: ["paralyzed", "paralysed", "held"] },
  { id: "charmed", label: "Charmed", icon: "charm", fx: "hearts", tone: "bad", text: "Charmed: cannot attack the charmer; the charmer has advantage on social checks against it.", words: ["charmed"] },
  { id: "blinded", label: "Blinded", icon: "blind", fx: "blind", tone: "bad", text: "Blinded: cannot see; its attacks have disadvantage, attacks against it advantage.", words: ["blinded", "blind"] },
  { id: "deafened", label: "Deafened", icon: "deaf", fx: "deaf", tone: "bad", text: "Deafened: cannot hear.", words: ["deafened", "deaf"] },
  { id: "invisible", label: "Invisible", icon: "invisible", fx: "shimmer", tone: "good", text: "Invisible: cannot be seen without magic; its attacks have advantage, attacks against it disadvantage.", words: ["invisible", "invisibility"] },
  { id: "prone", label: "Prone", icon: "prone", fx: "prone", tone: "bad", text: "Prone: crawls or stands up; melee attacks against it have advantage, ranged disadvantage.", words: ["prone"] },
  { id: "restrained", label: "Restrained", icon: "restrained", fx: "chains", tone: "bad", text: "Restrained: speed 0; disadvantage on attacks and Dexterity saves; attacks against it have advantage.", words: ["restrained", "bound"] },
  { id: "grappled", label: "Grappled", icon: "grappled", fx: "grip", tone: "bad", text: "Grappled: speed 0 while held.", words: ["grappled", "grabbed"] },
  { id: "entangled", label: "Entangled", icon: "entangled", fx: "web", tone: "bad", text: "Entangled: caught in webs or vines; hampered movement and attacks.", words: ["entangled", "webbed"] },
  { id: "incapacitated", label: "Incapacitated", icon: "incapacitated", fx: "dazed", tone: "bad", text: "Incapacitated: can take no actions or reactions.", words: ["incapacitated", "helpless"] },
  { id: "exhaustion", label: "Exhaustion", icon: "exhaustion", fx: null, tone: "bad", text: "Exhaustion: each level makes its d20 tests worse.", words: ["exhaustion", "exhausted", "fatigued", "fatigue"] },
  { id: "surprised", label: "Surprised", icon: "surprised", fx: null, tone: "bad", text: "Surprised: loses its first turn.", words: ["surprised"] },
  { id: "hasted", label: "Hasted", icon: "haste", fx: "haste", tone: "good", text: "Hasted: faster, harder to hit, an extra action.", words: ["hasted", "haste"] },
  { id: "slowed", label: "Slowed", icon: "slow", fx: "slow", tone: "bad", text: "Slowed: half speed, fewer actions, easier to hit.", words: ["slowed", "slow"] },
  { id: "bleeding", label: "Bleeding", icon: "bleed", fx: "bleed", tone: "bad", text: "Bleeding: loses hit points each turn until healed.", words: ["bleeding", "bleed"] },
  { id: "confused", label: "Confused", icon: "confused", fx: "swirl", tone: "bad", text: "Confused: acts at random.", words: ["confused", "confusion"] },
  { id: "sickened", label: "Sickened", icon: "poison", fx: "bubbles", tone: "bad", text: "Sickened or nauseated: worse at everything, or no actions but a move.", words: ["sickened", "nauseated", "diseased"] },
  { id: "turned", label: "Turned", icon: "fear", fx: "tremble", tone: "bad", text: "Turned: flees the one who turned it.", words: ["turned"] },
  { id: "cursed", label: "Cursed", icon: "debuff", fx: "glow-bad", tone: "bad", text: "Cursed.", words: ["cursed", "curse"] },
  { id: "concentrating", label: "Concentrating", icon: "concentration", fx: "ring", tone: "neutral", text: "Holding a spell: taking damage asks for a save to keep it.", words: ["concentrating", "concentration"] },
  { id: "stable", label: "Stable", icon: "down", fx: null, tone: "neutral", text: "Stable: unconscious, no longer dying.", words: ["stable"] },
];
const BY_ID = new Map(CONDITIONS.map((item) => [item.id, item]));
const BY_WORD = new Map(CONDITIONS.flatMap((item) => (item.words ?? [item.id]).map((word) => [word, item.id])));

/** @param {string} id */
export const conditionOf = (id) => BY_ID.get(String(id).toLowerCase()) ?? null;

// Words that are bookkeeping, not conditions ("(C)" concentration, notes, repeated saves).
const META = /^\s*(\(c\)|note\s*:|saveoe\s*:|saves\s*:|savee\s*:|saveat\s*:|saveadd\s*:|savedmg\s*:|fail\s*:|inherit\b)/i;

// The parts of a label that are on the creature now (not the FAIL: ones).
/** @param {string} label */
export function activeParts(label) {
  const parts = String(label ?? "").split(";").map((part) => part.trim()).filter(Boolean);
  const stop = parts.findIndex((part) => /^fail\s*:/i.test(part));
  return stop < 0 ? parts : parts.slice(0, stop);
}

// The conditions a label puts on a creature: whole parts naming one ("Prone",
// "Asleep"), and the label's name when it is one ("Sleep" is asleep).
/** @param {string} label @returns {string[]} */
export function conditionsOf(label) {
  const out = new Set();
  for (const part of activeParts(label)) {
    if (META.test(part) || /^[A-Z]+\s*:/.test(part)) continue;
    const word = part.toLowerCase().replace(/[.!]+$/, "");
    const id = BY_WORD.get(word);
    if (id) out.add(id);
  }
  return [...out];
}

// The numeric and dice components: "ATK: 1d4" {tag: "ATK", value: "1d4"}.
/** @param {string} label @returns {{ tag: string, value: string, rest: string }[]} */
export function componentsOf(label) {
  const out = [];
  for (const part of activeParts(label)) {
    const match = /^([A-Z]+)\s*:\s*(.*)$/.exec(part);
    if (!match) continue;
    const [value, ...rest] = match[2].trim().split(/\s+/);
    out.push({ tag: match[1], value: value ?? "", rest: rest.join(" ") });
  }
  return out;
}

// Tags that help when positive (FG 5E's bonus components) and the harmful ones.
const BONUS_TAGS = new Set(["ATK", "AC", "SAVE", "DMG", "HEAL", "INIT", "CHECK", "SKILL", "STR", "DEX", "CON", "INT", "WIS", "CHA", "ABIL", "TEMP", "REGEN", "RESIST", "IMMUNE", "ADVATK", "ADVSAV", "ADVCHK", "ADVSKILL", "ADVINIT", "GRANTDISATK", "SPEED"]);
const HARM_TAGS = new Set(["VULN", "DMGO", "DISATK", "DISSAV", "DISCHK", "DISSKILL", "DISINIT", "GRANTADVATK"]);

// good: helps its bearer (Bless, Shield of Faith, a torch); bad: harms
// (a condition, a penalty); neutral otherwise.
/** @param {string} label @returns {"good" | "bad" | "neutral"} */
export function toneOf(label) {
  const conditions = conditionsOf(label);
  if (conditions.some((id) => BY_ID.get(id)?.tone === "bad")) return "bad";
  let good = conditions.some((id) => BY_ID.get(id)?.tone === "good");
  for (const { tag, value } of componentsOf(label)) {
    if (HARM_TAGS.has(tag)) return "bad";
    if (!BONUS_TAGS.has(tag) && tag !== "LIGHT") continue;
    if (/^-/.test(value)) return "bad";
    good = true;
  }
  return good ? "good" : "neutral";
}

// A label's light: "LIGHT: 20/40 #ff9e3d flicker" (feet bright/dim, colour,
// animation). FG's own form "LIGHT: 20/40 orange" reads too.
const COLOR_NAMES = { white: "#f2f5ff", orange: "#ff9e3d", yellow: "#ffd36b", red: "#ff5a3d", green: "#7dff8a", blue: "#7db8ff", violet: "#c38cff", purple: "#c38cff", warm: "#ffb45c" };
const ANIMATIONS = ["flicker", "torch", "pulse", "steady", "glow"];
/** @param {string} label @returns {{ bright: number, dim: number, color: string, animation: string } | null} */
export function lightOf(label) {
  for (const { tag, value, rest } of componentsOf(label)) {
    if (tag !== "LIGHT") continue;
    const [bright, dim] = value.split("/").map(Number);
    if (!(dim > 0 || bright > 0)) return null;
    const words = rest.toLowerCase().split(/\s+/).filter(Boolean);
    const color = words.find((word) => /^#[0-9a-f]{6}$/.test(word)) ?? COLOR_NAMES[/** @type {keyof typeof COLOR_NAMES} */ (words.find((word) => word in COLOR_NAMES) ?? "")] ?? "#fff3e1";
    const animation = words.find((word) => ANIMATIONS.includes(word)) ?? "steady";
    return { bright: Math.max(0, bright || 0), dim: Math.max(bright || 0, dim || (bright || 0) * 2), color, animation: animation === "torch" ? "flicker" : animation };
  }
  return null;
}

// Ends when its creature takes damage (Sleep): the effect's own mark, or the
// words FG's 2024 data writes ("NOTE: Ends on damage").
/** @param {{ label: string, ends?: string }} effect */
export const endsOnDamage = (effect) => effect.ends === "damage" || /note\s*:\s*ends on damage/i.test(effect.label);

// The effect's name: its first part.
/** @param {string} label */
export const nameOf = (label) => String(label ?? "").split(";")[0].trim();

// What a set of effects shows on a token: its visuals (TokenFx keys) and its
// badges (icon, tooltip, tone, rounds left). concentrating: the creature holds
// a spell. Effects are those the viewer may see (the host filters).
/** @param {{ label: string, duration?: number, icon?: string, source?: string, paused?: boolean }[]} effects @param {{ concentrating?: string }} [extra] */
export function visualOf(effects, extra = {}) {
  const fx = new Set();
  /** @type {{ icon: string, title: string, tone: string, rounds?: number }[]} */
  const badges = [];
  for (const effect of effects) {
    const conditions = conditionsOf(effect.label);
    const tone = toneOf(effect.label);
    const light = lightOf(effect.label);
    for (const id of conditions) {
      const condition = BY_ID.get(id);
      if (condition?.fx) fx.add(condition.fx);
    }
    if (light && !effect.paused) fx.add("light");
    if (!conditions.length && !light && tone === "good") fx.add("glow-good");
    if (!conditions.length && !light && tone === "bad") fx.add("glow-bad");
    const first = conditions.length ? BY_ID.get(conditions[0]) : null;
    const icon = effect.icon || (light ? "light" : first?.icon ?? (tone === "good" ? "buff" : tone === "bad" ? "debuff" : "generic"));
    const time = effect.duration && effect.duration > 0 ? ` (${effect.duration} round${effect.duration === 1 ? "" : "s"} left)` : "";
    const what = first?.text ?? componentsOf(effect.label).filter((part) => part.tag !== "LIGHT").map((part) => `${part.tag} ${part.value}${part.rest ? ` ${part.rest}` : ""}`).join(", ");
    badges.push({ icon, tone, title: `${nameOf(effect.label)}${effect.paused ? " (put out)" : ""}${time}${what ? `: ${what}` : ""}${effect.source ? ` · from ${effect.source}` : ""}`, ...(effect.duration && effect.duration > 0 && effect.duration < 100 ? { rounds: effect.duration } : {}) });
  }
  if (extra.concentrating) {
    fx.add("ring");
    badges.push({ icon: "concentration", tone: "neutral", title: `Concentrating on ${extra.concentrating}` });
  }
  return { fx: [...fx], badges };
}

// --- Presets: the Effects window's lists --------------------------------------
// kind: condition, buff, debuff, light. burn: minutes of game time a light
// lasts (null: until put out). A game lists the ids it offers
// (shared/<id>/actions.mjs `conditions`, `presets`, `lights`) and may change burn times.

/** @typedef {{ id: string, kind: "condition" | "buff" | "debuff" | "light", label: string, icon: string, text: string, burn?: number | null, duration?: number }} Preset */

/** @type {Preset[]} */
export const LIGHTS = [
  { id: "torch", kind: "light", label: "Torch; LIGHT: 20/40 #ff9e3d flicker", icon: "light", text: "A torch: bright light 20 feet, dim 20 more; burns an hour.", burn: 60 },
  { id: "lantern", kind: "light", label: "Lantern; LIGHT: 30/60 #ffd08a flicker", icon: "light", text: "A hooded lantern: bright light 30 feet, dim 30 more; a pint of oil lasts 6 hours.", burn: 360 },
  { id: "candle", kind: "light", label: "Candle; LIGHT: 5/10 #ffc46b flicker", icon: "light", text: "A candle: bright light 5 feet, dim 5 more; burns an hour.", burn: 60 },
  { id: "lamp", kind: "light", label: "Lamp; LIGHT: 15/45 #ffb45c flicker", icon: "light", text: "An oil lamp: bright light 15 feet, dim 30 more; a pint of oil lasts 6 hours.", burn: 360 },
  { id: "light-spell", kind: "light", label: "Light; LIGHT: 20/40 #f2f5ff steady", icon: "light", text: "The Light spell: bright light 20 feet, dim 20 more, for an hour.", burn: 60 },
  { id: "daylight", kind: "light", label: "Daylight; LIGHT: 60/120 #fff8e0 steady", icon: "light", text: "Daylight: bright light 60 feet, dim 60 more, for an hour.", burn: 60 },
  { id: "faerie-fire", kind: "light", label: "Faerie Fire; LIGHT: 0/10 #c38cff pulse; GRANTADVATK", icon: "light", text: "Faerie Fire: outlined in light (dim 10 feet); attacks against it have advantage; it cannot be invisible.", burn: 1 },
  { id: "glowing-weapon", kind: "light", label: "Glowing weapon; LIGHT: 5/10 #9fd0ff pulse", icon: "light", text: "A weapon that sheds light: bright 5 feet, dim 5 more.", burn: null },
  { id: "flashlight", kind: "light", label: "Flashlight; LIGHT: 30/60 #f6f8ff steady", icon: "light", text: "A hand torch: bright 30 metres-ish beam, read as 30/60 feet around the carrier.", burn: 600 },
  { id: "headlamp", kind: "light", label: "Headlamp; LIGHT: 20/40 #f6f8ff steady", icon: "light", text: "A headlamp: bright 20 feet, dim 20 more, hands free.", burn: 600 },
  { id: "glowstick", kind: "light", label: "Glowstick; LIGHT: 5/15 #7dff8a pulse", icon: "light", text: "A chemical glowstick: dim green light; lasts 12 hours.", burn: 720 },
  { id: "flare", kind: "light", label: "Flare; LIGHT: 40/80 #ff5a3d flicker", icon: "light", text: "A flare: bright red light for 10 minutes.", burn: 10 },
];

/** @type {Preset[]} */
export const BUFFS = [
  { id: "bless", kind: "buff", label: "Bless; ATK: 1d4; SAVE: 1d4", icon: "buff", text: "Adds 1d4 to attack rolls and saving throws.", duration: 10 },
  { id: "bane", kind: "debuff", label: "Bane; ATK: -1d4; SAVE: -1d4", icon: "debuff", text: "Subtracts 1d4 from attack rolls and saving throws.", duration: 10 },
  { id: "shield-of-faith", kind: "buff", label: "Shield of Faith; AC: 2", icon: "buff", text: "+2 to AC.", duration: 100 },
  { id: "haste", kind: "buff", label: "Haste; Hasted; AC: 2", icon: "haste", text: "Speed doubled, +2 AC, an extra action.", duration: 10 },
  { id: "slow", kind: "debuff", label: "Slow; Slowed; AC: -2", icon: "slow", text: "Half speed, -2 AC, fewer actions.", duration: 10 },
  { id: "cover-half", kind: "buff", label: "Half cover; AC: 2", icon: "buff", text: "Half cover: +2 AC.", duration: 0 },
  { id: "cover-three", kind: "buff", label: "Three-quarters cover; AC: 5", icon: "buff", text: "Three-quarters cover: +5 AC.", duration: 0 },
  { id: "resist-fire", kind: "buff", label: "Fire resistance; RESIST: fire", icon: "buff", text: "Half damage from fire.", duration: 0 },
  { id: "morale-bonus", kind: "buff", label: "Morale; ATK: 1", icon: "buff", text: "+1 to attack rolls (a morale bonus).", duration: 0 },
];

// Every condition as a preset (its label is its name).
/** @type {Preset[]} */
export const CONDITION_PRESETS = CONDITIONS.filter((item) => !["dying", "stable", "concentrating"].includes(item.id)).map((item) => ({ id: item.id, kind: "condition", label: item.label, icon: item.icon, text: item.text }));

// A game's Effects list from its declaration (shared/<id>/actions.mjs):
// conditions (ids; absent: all), buffs (ids; absent: none), lights (ids;
// absent: the fantasy ones), burn (id -> minutes), extra (its own presets).
/** @param {{ conditions?: string[], buffs?: string[], lights?: string[], burn?: Record<string, number | null>, extra?: Preset[] } | null | undefined} decl @returns {Preset[]} */
export function presetsFor(decl) {
  /** @param {Preset[]} list @param {string[] | undefined} ids @param {Preset[]} fallback @returns {Preset[]} */
  const pick = (list, ids, fallback) => (ids ? /** @type {Preset[]} */ (ids.map((id) => list.find((item) => item.id === id)).filter(Boolean)) : fallback);
  const lights = pick(LIGHTS, decl?.lights, LIGHTS.filter((item) => ["torch", "lantern", "candle", "lamp", "light-spell", "daylight", "faerie-fire", "glowing-weapon"].includes(item.id))).map((item) => (decl?.burn && item.id in decl.burn ? { ...item, burn: decl.burn[item.id] } : item));
  return [...pick(CONDITION_PRESETS, decl?.conditions, CONDITION_PRESETS), ...pick(BUFFS, decl?.buffs, []), ...lights, ...(decl?.extra ?? [])];
}

// Rounds a light's burn lasts, for a game whose rounds are `roundSeconds` long.
/** @param {number | null | undefined} minutes @param {number} roundSeconds */
export const burnRounds = (minutes, roundSeconds) => (minutes && minutes > 0 ? Math.max(1, Math.round((minutes * 60) / (roundSeconds > 0 ? roundSeconds : 6))) : 0);

// When a burning light warns that it is nearly out: a tenth of its time,
// at most 10 minutes, at least a round.
/** @param {number} total rounds @param {number} roundSeconds */
export const warnAt = (total, roundSeconds) => Math.max(1, Math.min(Math.round(total / 10), Math.round(600 / (roundSeconds > 0 ? roundSeconds : 6))));
