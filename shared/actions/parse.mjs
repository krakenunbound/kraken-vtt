// @ts-check
// Reads a spell or power record into structured actions: its area, attack,
// save, damage, healing, effect and targets, the way Fantasy Grounds' 5E power
// parser reads a power's words (our own rules, not FG's code). It knows the
// shapes of D&D 5E (2014 and 2024 words, FG 5E actions), D&D 3.5E (Effect /
// Area / Save fields), AD&D 2E and OSRIC (AoE field, FG 2E actions), Basic
// Fantasy (feet written as 30') and Castles & Crusades (3.5E and 2E words).
// No imports: the host and the client both use it (docs/targeting-actions-design.md, 4.3).

/**
 * @typedef {{ shape: "circle"|"cone"|"line"|"square", size: number, width?: number, origin: "point"|"self", attach?: boolean, label: string }} Area
 * @typedef {{ dice: string, type: string, perLevel?: boolean, max?: string, bonus?: number }} Damage
 * @typedef {{ dice: string, bonus?: number, perLevel?: boolean, maxBonus?: number, addMod?: boolean }} Heal
 * @typedef {{ value: number, unit: "round"|"minute"|"hour"|"day"|"turn"|"instant"|"permanent", perLevel?: boolean }} Duration
 * @typedef {{ kind: string, effect: "half"|"negates"|"partial"|"none", text: string, harmless?: boolean }} Save
 * @typedef {{ label: string, conditions: string[], duration: Duration | null }} Effect
 * @typedef {{ count: number | null, who: "self"|"ally"|"enemy"|"any", choice: boolean, upcast: boolean, willing: boolean }} Targets
 * @typedef {{ name: string, level: number, area: Area | null, attack: { kind: "melee"|"ranged" } | null, save: Save | null, damage: Damage[], heal: Heal | null, effect: Effect | null, endsOnDamage: boolean, targets: Targets, concentration: boolean, beneficial: boolean }} ParsedSpell
 */

// --- Text helpers -------------------------------------------------------------

/** Rows of an FG list: an array, or an object of rows keyed by id. @param {any} value @returns {any[]} */
const rows = (value) => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []).filter((row) => row && typeof row === "object");

/** A field as plain text: HTML tags and markdown stars dropped, curly quotes straightened. @param {any} value @returns {string} */
export function plain(value) {
  if (value == null) return "";
  if (typeof value === "object") value = value.__rich ?? value.text ?? "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
    .replace(/\*+/g, "")
    .replace(/[‘’]/g, "'").replace(/[−–—]/g, "-").replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

// FG writes a die alone as "d6": that is one die.
const dice = (/** @type {any} */ text) => String(text).trim().replace(/^d/i, "1d").toLowerCase();
const title = (/** @type {string} */ word) => word.charAt(0).toUpperCase() + word.slice(1);
/** @type {Record<string, number>} */
const WORD_NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const countOf = (/** @type {string} */ word) => (/^\d+$/.test(word) ? Number(word) : WORD_NUMBERS[word.toLowerCase()] ?? null);

// The words after which a spell's upcast or cantrip scaling is told.
const TAIL = /\b(?:Using a Higher-Level Spell Slot|At Higher Levels|Cantrip Upgrade)\b\.?/i;

/** The record's rules text split into the body and its higher-level tail. @param {any} data */
function textOf(data) {
  const all = plain(data.description ?? data.text ?? "");
  const cut = all.search(TAIL);
  const body = cut >= 0 ? all.slice(0, cut) : all;
  const tail = [cut >= 0 ? all.slice(cut) : "", plain(data.higher), plain(data.upgrade)].join(" ").trim();
  return { body, tail };
}

/** A level from a number or words like "Sor/Wiz 3". @param {any} value */
function levelOf(value) {
  if (typeof value === "number") return value;
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

// --- Range ----------------------------------------------------------------------

// "Self", "Personal", "Caster" and "0" ranges start at the caster.
const rangeSelf = (/** @type {any} */ data) => /^\s*(?:self|personal|caster|you|0\b)/i.test(plain(data.range));

/** The first distance in feet of the range line ("Close (25 ft. + 5 ft./2 levels)" is 25). @param {any} data */
function rangeFeet(data) {
  const match = plain(data.range).match(/(\d+)\s*(?:-|\s)?(?:feet|foot|ft\.?|')/i);
  return match ? Number(match[1]) : 0;
}

// --- Areas ------------------------------------------------------------------------

const UNIT = String.raw`(?:feet|foot|ft\.?|')`;
const DIM = String.raw`\d+\s*(?:-|\s)?${UNIT}(?:(?:-|\s)(?:radius|long|wide|high|tall|deep|diameter))?`;
const SHAPE_WORDS = "hemisphere|sphere|cylinder|cone|cube|line|emanation|spread|burst|square|circle";
// "20-foot-radius Sphere", "10-foot-radius, 40-foot-high Cylinder", "20-ft.-radius spread", "40-ft. cube", "15 ft radius".
const DIMS_SHAPE = new RegExp(String.raw`((?:${DIM})(?:(?:,\s*|\s+and\s+|\s+by\s+)(?:${DIM}))*)(?:-|\s)*(${SHAPE_WORDS})?\b`, "gi");
// "Cylinder (20-ft. radius, 40 ft. high)".
const SHAPE_PAREN = new RegExp(String.raw`\b(${SHAPE_WORDS})\s*\(([^)]*\d[^)]*)\)`, "gi");
// "a cone 60' long", "A Line of strong wind 60 feet long and 10 feet wide", "Fan of flame 3 ft long".
const SHAPE_LONG = new RegExp(String.raw`\b(cone|line|fan|wedge)\b[^.]{0,40}?(\d+)\s*(?:-|\s)?${UNIT}\s*(?:-|\s)?long(?:[^.]{0,20}?(\d+)\s*(?:-|\s)?${UNIT}\s*(?:-|\s)?wide)?`, "gi");
// "50 ft x 50 ft": a square.
const SQUARE_X = new RegExp(String.raw`(\d+)\s*(?:-|\s)?${UNIT}?\s*x\s*(\d+)\s*(?:-|\s)?${UNIT}`, "gi");
// Creatures within N of a point or the caster are an area (Basic Fantasy's Sleep);
// a lone "within 30 feet of you" is range, not area.
const WITHIN = new RegExp(String.raw`\b(?:each|all|every|those|any)\s+(?:[\w-]+\s+){0,3}?creatures?\b[^.]{0,30}?\bwithin\s+(?:a\s+)?(\d+)\s*(?:-|\s)?${UNIT}\s+(?:radius\s+)?of\s+(?:the\s+|a\s+|that\s+|this\s+)?(?:chosen\s+|target(?:ed)?\s+)?(point|spot|location|you|yourself|the caster|caster|it)\b`, "gi");
// A short field naming a shape with no size ("Cone", "Cone-shaped burst", "Line from you to ..."): the range line is its size.
const BARE_SHAPE = /^\s*(?:an?\s+)?(cone|line|cylinder)(?:-shaped\s+(?:burst|spread|emanation))?\b/i;
// Sizes that are not an area: illusions "no larger than a 20-foot Cube", light "in a 20-foot radius".
const NOT_AREA_BEFORE = /(?:no larger than|fits? (?:in|within)|contained within|light (?:in|for|out to)|lights? in|up to)\s+(?:an?\s+)?$/i;

/** @type {Record<string, Area["shape"]>} */
const SHAPE_OF = { hemisphere: "circle", sphere: "circle", cylinder: "circle", emanation: "circle", spread: "circle", burst: "circle", circle: "circle", radius: "circle", cone: "cone", fan: "cone", wedge: "cone", line: "line", cube: "square", square: "square" };

/** @typedef {{ n: number, label: string }} Dim */

/** Each "<n> feet <label>" inside a run of dimensions. @param {string} text */
function dimsOf(text) {
  /** @type {Dim[]} */
  const found = [];
  const re = new RegExp(String.raw`(\d+)\s*(?:-|\s)?${UNIT}(?:(?:-|\s)(radius|long|wide|high|tall|deep|diameter))?`, "gi");
  for (const match of text.matchAll(re)) found.push({ n: Number(match[1]), label: (match[2] || "").toLowerCase() });
  return found;
}

/**
 * The area's label in 5E words: "20-foot-radius Sphere", "15-foot Cone".
 * @param {string} shape @param {number} size @param {number} width @param {string} kind @param {boolean} attach
 */
function labelOf(shape, size, width, kind, attach) {
  if (shape === "circle") return attach ? `${size}-foot Emanation` : `${size}-foot-radius ${title(["radius", "circle", "emanation"].includes(kind) ? "sphere" : kind)}`;
  if (shape === "line") return `${size}-foot-long, ${width}-foot-wide Line`;
  if (shape === "cone") return `${size}-foot Cone`;
  return `${size}-foot ${kind === "square" ? "Square" : "Cube"}`;
}

/**
 * An area from a shape word and its dimensions; where it starts follows the
 * games: cones and lines start at the caster, emanations move with the caster,
 * cubes and circles are on a point unless the range or words put them on the caster.
 * @param {string} kind @param {Dim[]} dims @param {any} data @param {string} [after] the words after the shape
 * @returns {Area | null}
 */
function makeArea(kind, dims, data, after = "") {
  kind = kind.toLowerCase();
  const shape = SHAPE_OF[kind];
  if (!shape) return null;
  const pick = (/** @type {string[]} */ ...labels) => dims.find((dim) => labels.includes(dim.label))?.n;
  const plainDim = dims.find((dim) => !["high", "tall", "deep", "wide"].includes(dim.label))?.n;
  let size = 0;
  let width;
  if (shape === "circle") size = pick("radius") ?? ((pick("diameter") ?? 0) / 2 || plainDim || 0);
  else if (shape === "line") { size = pick("long") ?? plainDim ?? 0; width = pick("wide") ?? 5; }
  else size = pick("long") ?? plainDim ?? 0;
  if (!(size > 0)) return null;
  const attach = kind === "emanation";
  const self = attach || shape === "cone" || shape === "line"
    || (shape === "square" && (rangeSelf(data) || /^[^.]{0,30}\b(?:originating from|next to|from) you\b/i.test(after)))
    || (shape === "circle" && (/^[^.]{0,30}\bcentered on (?:you|yourself|the caster)\b/i.test(after) || (rangeSelf(data) && !/\bpoint\b/i.test(after.slice(0, 60)))));
  /** @type {Area} */
  const area = { shape, size, origin: self ? "self" : "point", label: labelOf(shape, size, width ?? 5, kind, attach) };
  if (shape === "line") area.width = width;
  if (attach) area.attach = true;
  return area;
}

/** The first area named in one field's words, or null. @param {string} text @param {any} data @param {boolean} shortField */
function areaFromWords(text, data, shortField) {
  if (!text) return null;
  /** @type {{ index: number, area: Area }[]} */
  const found = [];
  const add = (/** @type {number} */ index, /** @type {Area | null} */ area) => {
    if (area && !NOT_AREA_BEFORE.test(text.slice(Math.max(0, index - 25), index))) found.push({ index, area });
  };
  for (const match of text.matchAll(DIMS_SHAPE)) {
    const kind = match[2] || (/radius/i.test(match[1]) ? "radius" : "");
    if (!kind) continue;
    add(match.index ?? 0, makeArea(kind, dimsOf(match[1]), data, text.slice((match.index ?? 0) + match[0].length)));
  }
  for (const match of text.matchAll(SHAPE_PAREN)) add(match.index ?? 0, makeArea(match[1], dimsOf(match[2]), data, text.slice((match.index ?? 0) + match[0].length)));
  for (const match of text.matchAll(SHAPE_LONG)) {
    const dims = [{ n: Number(match[2]), label: "long" }, ...(match[3] ? [{ n: Number(match[3]), label: "wide" }] : [])];
    add(match.index ?? 0, makeArea(match[1], dims, data));
  }
  for (const match of text.matchAll(SQUARE_X)) add(match.index ?? 0, makeArea("square", [{ n: Number(match[1]), label: "" }], data));
  for (const match of text.matchAll(WITHIN)) {
    const area = makeArea("radius", [{ n: Number(match[1]), label: "radius" }], data);
    if (area) area.origin = /you|caster/i.test(match[2]) ? "self" : "point";
    add(match.index ?? 0, area);
  }
  if (shortField && !found.length) {
    const match = text.match(BARE_SHAPE);
    const feet = rangeFeet(data);
    if (match && feet) add(0, makeArea(match[1], [{ n: feet, label: "" }], data));
  }
  found.sort((a, b) => a.index - b.index);
  return found[0]?.area ?? null;
}

// FG 2024 5E cast rows name their shape: sphere, cone, cube, line, cylinder, emanation.
/** @type {Record<string, string>} */
const CAST_SHAPES = { sphere: "sphere", cylinder: "cylinder", radius: "radius", emanation: "emanation", cone: "cone", line: "line", cube: "cube", square: "square" };

/**
 * The spell's area of effect, or null when it has none.
 * @param {any} data
 * @returns {Area | null}
 */
export function areaOf(data) {
  if (!data) return null;
  for (const row of rows(data.actions)) {
    const kind = CAST_SHAPES[String(row.targeting || "").toLowerCase()];
    if (row.type !== "cast" || !kind) continue;
    const size = Number(row.targetingval);
    if (!(size > 0)) continue;
    const dims = [{ n: size, label: kind === "line" ? "long" : "" }, ...(row.targetingval2 ? [{ n: Number(row.targetingval2), label: "wide" }] : [])];
    const area = makeArea(kind, dims, data);
    if (area) return area;
  }
  const given = data.area;
  if (given && typeof given === "object" && SHAPE_OF[given.shape] === given.shape && Number(given.size) > 0) {
    const size = Number(given.size);
    /** @type {Area} */
    const area = { shape: given.shape, size, origin: given.origin === "self" ? "self" : "point", label: String(given.label || labelOf(given.shape, size, Number(given.width) || 5, given.shape === "square" ? "cube" : "sphere", !!given.attach)) };
    if (given.shape === "line") area.width = Number(given.width) || 5;
    if (given.attach) area.attach = true;
    return area;
  }
  for (const field of ["aoe", "area", "effect", "target", "targets", "shortdescription"]) {
    if (typeof data[field] !== "string" && !data[field]?.__rich) continue;
    const area = areaFromWords(plain(data[field]), data, true);
    if (area) return area;
  }
  return areaFromWords(textOf(data).body, data, false);
}

// --- Saves --------------------------------------------------------------------------

const ABILITIES = "strength|dexterity|constitution|intelligence|wisdom|charisma";
// Basic Fantasy's five saves.
/** @type {[RegExp, string][]} */
const BF_SAVES = [[/death|poison/i, "death"], [/wand/i, "wands"], [/paraly|petrif/i, "paralysis"], [/breath/i, "breath"], [/spell|rod|staff/i, "spells"]];
const HALF = /\bhalf (?:as much |the |that |of the )?damage\b|\bhalf damage\b|\btakes? half\b|\bfor half\b|\bsave halves\b/i;

/** @param {any} data @param {string} body @param {any[]} actionRows @returns {Save | null} */
function saveOf(data, body, actionRows) {
  const field = plain(data.save);
  const harmless = /\(harmless\)/i.test(field);
  /** @type {Save["effect"]} */
  const words = HALF.test(body) ? "half" : /\bpartial\b/i.test(body) ? "partial" : "negates";
  /** @param {string} kind @param {Save["effect"]} effect @param {string} text @returns {Save} */
  const make = (kind, effect, text) => ({ kind, effect, text, ...(harmless ? { harmless: true } : {}) });
  // FG 5E powersave rows, FG 2E cast rows with a save type (2E saves vs spell).
  const saveRow = actionRows.find((row) => row.type === "powersave" && row.savetype) || actionRows.find((row) => row.type === "cast" && row.savetype);
  if (saveRow) return make(String(saveRow.savetype).toLowerCase(), saveRow.onmissdamage === "half" ? "half" : words, field || String(saveRow.savetype));
  // 3.5E: "Reflex half", "Will negates (harmless)", "Fortitude partial".
  const d20 = field.match(/\b(fortitude|reflex|will)\b(?:\s+(half|negates|partial|none))?/i);
  if (d20) return make(d20[1].toLowerCase(), /** @type {any} */ ((d20[2] || words).toLowerCase()), field);
  // 2E and OSRIC: "Half", "Neg.", "None" in the save field.
  if (field && !/^none\b/i.test(field)) {
    if (/^half\b/i.test(field)) return make("spell", "half", field);
    if (/^neg/i.test(field)) return make("spell", "negates", field);
    if (/^partial|^special/i.test(field)) return make("spell", "partial", field);
  }
  // 5E and C&C: "a Dexterity saving throw", "a dexterity save".
  const ability = body.match(new RegExp(String.raw`\b(${ABILITIES})\s+(?:saving throw|save)\b`, "i"));
  if (ability) return make(ability[1].toLowerCase(), words, ability[0]);
  // Basic Fantasy: "save vs. Spells", "save vs. Death Ray".
  const bf = body.match(/\bsav(?:e|ing throw)\s+vs\.?\s+([a-z]+(?:\s+(?:ray|weapon|wand|breath))?)/i);
  if (bf) return make(BF_SAVES.find(([re]) => re.test(bf[1]))?.[1] ?? bf[1].toLowerCase(), words, bf[0]);
  return null;
}

// --- Damage and healing ----------------------------------------------------------------

const TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder|sonic|electricity|holy|unholy";
// "taking 8d6 Fire damage", "1d4 + 1 Force damage", "1d6 points of fire damage per caster level (maximum 10d6)",
// "1d6 damage per level", "1 hp of damage per level".
const DAMAGE = new RegExp(String.raw`\b(\d*d\d+|\d+)(?:\s*\+\s*(\d+))?\s+((?:hp|hit points?|points?)\s+of\s+)?(?:(${TYPES})\s+)?damage\b(\s+per\s+(?:caster\s+)?level(?:\s+of\s+the\s+caster)?)?(?:[^.]{0,12}?\(?(?:to\s+a\s+)?max(?:imum)?(?:\s+of)?\s+(\d+d\d+)\)?)?`, "gi");
// 5E: "regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier".
const HEAL_EQUAL = /\bregains?\s+(?:a\s+number\s+of\s+)?hit\s+points\s+equal\s+to\s+(\d*d\d+|\d+)(?:\s*\+\s*(\d+))?(\s+plus\s+your\s+spellcasting\s+ability\s+modifier)?/i;
// 3.5E "cures 1d8 points of damage +1 point per caster level (maximum +5)", 2E "restoring 1d8 hit points".
const HEAL_PLAIN = /\b(?:regains?|restor(?:es|ing|e)|heals?|cures?|recovers?)\s+(\d*d\d+|\d+)(?:\s*\+\s*(\d+))?\s+(?:hit\s+points|hp|points?\s+of\s+damage)(?:\s*\+\s*(\d+)\s+points?\s+per\s+(?:caster\s+)?level(?:\s*\(max(?:imum)?\s+\+?(\d+)\))?)?(\s+plus\s+your\s+spellcasting\s+ability\s+modifier)?/i;

/** @param {string} body @param {any[]} actionRows @returns {{ heal: Heal | null, span: [number, number] | null }} */
function healOf(body, actionRows) {
  const row = actionRows.find((item) => item.type === "heal");
  const first = row && rows(row.heallist)[0];
  if (first?.dice) {
    /** @type {Heal} */
    const heal = { dice: dice(first.dice) };
    if (Number(first.bonus)) heal.bonus = Number(first.bonus);
    if (first.stat === "base") heal.addMod = true;
    return { heal, span: null };
  }
  const equal = body.match(HEAL_EQUAL);
  const other = body.match(HEAL_PLAIN);
  const match = equal && (!other || (equal.index ?? 0) <= (other.index ?? 0)) ? equal : other;
  if (!match) return { heal: null, span: null };
  /** @type {Heal} */
  const heal = { dice: dice(match[1]) };
  if (match === equal) {
    if (match[2]) heal.bonus = Number(match[2]);
    if (match[3]) heal.addMod = true;
  } else {
    if (match[2]) heal.bonus = Number(match[2]);
    if (match[3]) { heal.bonus = Number(match[3]); heal.perLevel = true; }
    if (match[4]) heal.maxBonus = Number(match[4]);
    if (match[5]) heal.addMod = true;
  }
  const start = match.index ?? 0;
  return { heal, span: [start, start + match[0].length] };
}

/** @param {string} body @param {any[]} actionRows @param {[number, number] | null} healSpan @returns {Damage[]} */
function damageOf(body, actionRows, healSpan) {
  /** @type {Damage[]} */
  const out = [];
  for (const row of actionRows.filter((item) => item.type === "damage")) {
    for (const entry of rows(row.damagelist)) {
      if (!entry.dice) continue;
      /** @type {Damage} */
      const damage = { dice: dice(entry.dice), type: String(entry.type || "").toLowerCase() };
      if (Number(entry.bonus)) damage.bonus = Number(entry.bonus);
      // FG 2E: castertype "casterlevel" rolls the dice once per caster level, castermax dice at most (0: no cap).
      if (entry.castertype === "casterlevel") {
        damage.perLevel = true;
        if (Number(entry.castermax) > 0) damage.max = `${Number(entry.castermax)}${damage.dice.replace(/^\d+/, "")}`;
      }
      out.push(damage);
    }
  }
  if (out.length) return out;
  let lastEnd = -1;
  for (const match of body.matchAll(DAMAGE)) {
    const start = match.index ?? 0;
    if (healSpan && start >= healSpan[0] && start < healSpan[1]) continue;
    // A plain number is damage only with a type or "points of" ("takes 10 feet" is not).
    if (!/d/i.test(match[1]) && !match[3] && !match[4]) continue;
    // "3d8 Radiant damage (if you are good) or 3d8 Necrotic damage": one roll, the first type.
    if (lastEnd >= 0 && /^\W*(?:\([^)]*\)\s*)?or\s*$/i.test(body.slice(lastEnd, start)) && out.length) { lastEnd = start + match[0].length; continue; }
    /** @type {Damage} */
    const damage = { dice: dice(match[1]), type: (match[4] || "").toLowerCase() };
    if (match[2]) damage.bonus = Number(match[2]);
    if (match[5]) damage.perLevel = true;
    if (match[6]) damage.max = match[6].toLowerCase();
    out.push(damage);
    lastEnd = start + match[0].length;
  }
  return out;
}

// --- Effects ---------------------------------------------------------------------------

export const CONDITIONS = ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious", "asleep", "exhaustion", "slowed", "hasted", "confused", "dazed", "entangled", "held", "sickened", "nauseated", "shaken", "fatigued", "turned", "burning"];
// Conditions a caster puts on a friend.
const GOOD_CONDITIONS = new Set(["invisible", "hasted"]);
// Older games' words for a condition (5E says "has the X condition").
/** @type {[string, RegExp][]} */
const CONDITION_WORDS = [
  ["asleep", /\bslumber|\bfalls? asleep\b|\bmagical sleep\b|\bfall into (?:a )?(?:deep |magical )?sleep\b/i],
  ["blinded", /\bblinded\b|\bstruck blind\b/i], ["charmed", /\bcharmed\b/i], ["deafened", /\bdeafened\b/i],
  ["frightened", /\bfrightened\b|\bpanicked\b|\bflees? in terror\b/i], ["paralyzed", /\bparaly[sz]ed\b/i],
  ["held", /\bheld (?:rigid|immobile|motionless|in place)|\bto be held\b/i], ["petrified", /\bpetrified\b|\bturned to stone\b/i],
  ["stunned", /\bstunned\b/i], ["dazed", /\bdazed\b/i], ["confused", /\bconfused\b/i], ["entangled", /\bentangled\b/i],
  ["nauseated", /\bnauseated\b/i], ["sickened", /\bsickened\b/i], ["shaken", /\bshaken\b/i], ["fatigued", /\bfatigued\b/i],
  ["slowed", /\bslowed\b/i], ["hasted", /\bhasted\b/i], ["invisible", /\b(?:becomes?|turns?|is|are) invisible\b/i],
  ["prone", /\b(?:knocked|falls?|fall) prone\b/i], ["restrained", /\brestrained\b/i], ["poisoned", /\bpoisoned\b/i],
  ["unconscious", /\bunconscious\b/i], ["burning", /\bcatch(?:es)? (?:on )?fire\b|\bon fire\b/i],
];

/** The conditions the spell's words put on its targets. @param {string} body @param {string} game @returns {string[]} */
function conditionsOf(body, game) {
  if (game === "5e") {
    // The first sentence with "has/have the X condition"; later ones are what happens next.
    for (const sentence of body.split(/(?<=[.!?])\s+/)) {
      // A sentence that ends or wards off a condition puts none on ("the condition ends", "Immunity to").
      // "If the creature has the Prone condition" and "unless it has the Blinded condition" are tests, not conditions put on.
      if (/\bconditions? ends?\b|\bends? the\b|\bremoves?\b/i.test(sentence) || /^if\b[^,]*\bhas the\b|\bunless\b[^.]*\bhas the\b/i.test(sentence)) continue;
      /** @type {string[]} */
      const found = [];
      for (const match of sentence.matchAll(/\b(?:has|have|gains?|is|are|be|becomes?)\s+the\s+([A-Z][\w, ]*?)\s+conditions?\b/g)) {
        for (const word of match[1].split(/\s*(?:,|\band\b|\bor\b)\s*/)) {
          const id = word.trim().toLowerCase();
          if (CONDITIONS.includes(id) && !found.includes(id)) found.push(id);
        }
      }
      if (found.length) return found;
    }
    return [];
  }
  const found = CONDITION_WORDS.filter(([, re]) => re.test(body)).map(([id]) => id);
  // A magical slumber is sleep and unconsciousness both.
  if (found.includes("asleep") && !found.includes("unconscious")) found.splice(found.indexOf("asleep") + 1, 0, "unconscious");
  return found;
}

/** Which rolls a bonus reaches: "the attack roll or save" is ATK and SAVE. @param {string} rest */
function componentKeys(rest) {
  /** @type {string[]} */
  const keys = [];
  for (const part of rest.split(/\s*(?:,|\band\b|\bor\b)\s*/)) {
    if (!part) continue;
    // "to AC, has Advantage on ..." is a new clause, not another roll.
    if (/\bagainst\b|\bvs\.?/i.test(part) || (keys.length && part.split(/\s+/).length > 4)) break;
    const key = /\battack|\bto[- ]hit\b|^\s*(?:on\s+)?hit\b/i.test(part) ? "ATK" : /\bsav/i.test(part) ? "SAVE" : /\bAC\b|\barmou?r class\b/i.test(part) ? "AC" : /\bdamage\b/i.test(part) ? "DMG" : /\bcheck/i.test(part) ? "CHECK" : "";
    if (!key) break;
    keys.push(key);
  }
  return keys;
}

/** Numeric effect components from the words: "adds 1d4 to the attack roll or save", "+2 bonus to AC". @param {string} body */
function componentsOf(body) {
  /** @type {{ key: string, value: string, index: number }[]} */
  const out = [];
  /** @param {number} index @param {string} value @param {string} rest */
  const add = (index, value, rest) => {
    for (const key of componentKeys(rest)) if (!out.some((item) => item.key === key)) out.push({ key, value, index });
  };
  for (const match of body.matchAll(/\b(adds?|subtracts?)\s+(\d*d\d+|\d+)\s+(?:to|from)\s+([^.;]*)/gi)) add(match.index ?? 0, `${/^sub/i.test(match[1]) ? "-" : ""}${dice(match[2])}`, match[3]);
  for (const match of body.matchAll(/([+-]\s?\d+)\s+(?:[a-z]+\s+){0,2}?(bonus|penalty)\s+(?:to|on)\s+([^.;]*)/gi)) {
    const n = Math.abs(Number(match[1].replace(/\s/g, ""))) * (match[1].trim().startsWith("-") || /penalty/i.test(match[2]) ? -1 : 1);
    add(match.index ?? 0, String(n), match[3]);
  }
  for (const match of body.matchAll(/([+-]\d+)\s+(?:to|on)\s+((?:attack rolls?|to-hit rolls?|hit|saving throws?|AC|armou?r class|damage)[^.;]*)/gi)) add(match.index ?? 0, String(Number(match[1])), match[2]);
  return out.sort((a, b) => a.index - b.index);
}

/** @type {[RegExp, string][]} */
const UNITS = [[/^r/, "round"], [/^mi/, "minute"], [/^h/, "hour"], [/^d/, "day"], [/^t/, "turn"], [/^w/, "week"]];

/** A duration line: "1 minute", "Concentration, up to 1 minute", "1 round/level", "1 min./level", "Instantaneous". @param {any} text @returns {Duration | null} */
export function durationOf(text) {
  const line = plain(text).toLowerCase();
  if (!line) return null;
  if (/\binstant/.test(line)) return { value: 0, unit: "instant" };
  if (/\bpermanent|\buntil dispelled/.test(line)) return { value: 0, unit: "permanent" };
  const match = line.match(/(\d+)\s*(rounds?|rds?\.?|minutes?|mins?\.?|hours?|hrs?\.?|days?|turns?|weeks?)(\s*(?:\/|per)\s*(?:caster\s+)?(?:level|lvl))?/);
  if (!match) return null;
  let unit = UNITS.find(([re]) => re.test(match[2]))?.[1] ?? "round";
  let value = Number(match[1]);
  if (unit === "week") { unit = "day"; value *= 7; }
  /** @type {Duration} */
  const duration = { value, unit: /** @type {any} */ (unit) };
  if (match[3]) duration.perLevel = true;
  return duration;
}

/** An FG effect row's duration (durmod in 5E, durvalue in 2E). @param {any} row @returns {Duration | null} */
function rowDuration(row) {
  const value = Number(row.durmod ?? row.durvalue ?? 0);
  if (!value) return null;
  return durationOf(`${value} ${row.durunit || "round"}`);
}

// "The spell ends on a target if it takes damage", "Injuring such a creature will cause it to awaken", "Slapping or wounding awakens".
const ENDS_ON_DAMAGE = [
  /\bends?\b[^.]{0,40}?\b(?:if|when)\s+(?:it|the target|the creature|that creature|an affected creature|a target)\s+takes\s+(?:any\s+)?damage/i,
  /\b(?:slapp|wound|injur|damag|harm|hurt)\w*[^.]{0,60}?\b(?:awaken|awakens|awake|wakes?)\b/i,
  /\b(?:awakens?|wakes?)\s+(?:up\s+)?(?:if|when)\b[^.]{0,40}?\b(?:damage|wound|slap|injur|harm|hurt)/i,
];

// --- The parse -------------------------------------------------------------------------

/** Which game's words a record is in, when opts.game does not say. @param {any} data @param {string} body */
function guessGame(data, body) {
  const actionRows = rows(data.actions);
  if (actionRows.some((row) => row.type === "powersave")) return "5e";
  if (actionRows.some((row) => row.type === "cast" && row.savetype)) return "2e";
  if (/\b(?:fortitude|reflex|will)\b/i.test(plain(data.save)) || /\b(?:sor\/wiz|clr|drd|brd|pal|rgr)\b/i.test(String(data.level ?? ""))) return "35e";
  if (data.aoe != null) return "2e";
  if (/\d'/.test(body) || /\bsave vs\.?\s/i.test(body)) return "bf";
  return "5e";
}

/**
 * A spell or power record's data read into structured actions.
 * @param {any} data
 * @param {{ game?: "5e"|"35e"|"2e"|"bf"|"cnc" }} [opts]
 * @returns {ParsedSpell}
 */
export function parseSpell(data, opts = {}) {
  data = data || {};
  const { body, tail } = textOf(data);
  const game = opts.game || guessGame(data, body);
  const actionRows = rows(data.actions);
  const name = String(data.name || "").trim();
  const area = areaOf(data);

  // Attack: "ranged spell attack", 3.5E "melee touch attack"; an FG attack row first.
  const attackRow = actionRows.find((row) => row.type === "attack");
  const attackWords = body.match(/\b(ranged|melee)\s+(?:spell|touch)\s+attack/i);
  const attack = attackRow ? { kind: /** @type {"melee"|"ranged"} */ (String(attackRow.atktype || "").toLowerCase() === "melee" ? "melee" : "ranged") }
    : attackWords ? { kind: /** @type {"melee"|"ranged"} */ (attackWords[1].toLowerCase()) } : null;

  const save = saveOf(data, body, actionRows);
  const { heal, span } = healOf(body, actionRows);
  const damage = damageOf(body, actionRows, span);

  // Effect: an FG effect row's label and duration, else the name, conditions and numeric components.
  const effectRow = actionRows.find((row) => row.type === "effect" && row.label);
  const labelParts = effectRow ? String(effectRow.label).split(";").map((part) => part.trim()) : [];
  const conditions = [...new Set([...labelParts.map((part) => part.toLowerCase()).filter((part) => CONDITIONS.includes(part)), ...conditionsOf(body, game)])];
  const components = componentsOf(body);
  let duration = effectRow ? rowDuration(effectRow) : null;
  if (!duration) duration = durationOf(data.duration);
  // An instant spell whose condition lasts "until the end of its next turn" lasts a round.
  if ((!duration || duration.unit === "instant") && conditions.length) {
    const lasting = body.match(/\bfor (\d+) (rounds?|minutes?|hours?)\b/i);
    if (lasting) duration = durationOf(lasting[0]);
    else if (/\buntil the (?:end|start) of (?:its|your|the target's) next turn\b/i.test(body)) duration = { value: 1, unit: "round" };
  }
  /** @type {Effect | null} */
  let effect = null;
  if (effectRow) effect = { label: String(effectRow.label), conditions, duration };
  else if (conditions.length || components.length) {
    const label = [name, ...conditions.map(title), ...components.map((item) => `${item.key}: ${item.value}`)].filter(Boolean).join("; ");
    effect = { label, conditions, duration };
  }

  const endsOnDamage = ENDS_ON_DAMAGE.some((re) => re.test(body));
  const concentration = /\bconcentration\b/i.test(plain(data.duration));

  // Targets.
  const choice = /\bof your choice\b|\bdesignate creatures to be unaffected\b/i.test(body);
  const upcast = /\b(?:one|an|1)\s+additional\s+(?:[\w-]+\s+){0,2}?(?:creatures?|targets?|humanoids?|beasts?|undead|allies|ally|willing creatures?)\b/i.test(tail);
  const willing = /\bwilling\b/i.test(body) || !!save?.harmless;
  const countRe = /\b(up to\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|twelve|\d+|a|an)\s+(?:(?:willing|other|living|hostile|dead|large|small|medium|tiny|huge|corporeal)\s+)*(creatures?|targets?|humanoids?|beasts?|allies|ally|undead|persons?|subjects?|monsters?|celestials?|fiends?|corpses?)\b/i;
  const targetField = plain(data.target ?? data.targets);
  let count = null;
  if (/\bcreature touched\b/i.test(targetField || body) && !area) count = 1;
  else {
    const match = (targetField && targetField.match(countRe)) || body.match(countRe);
    // With an area only an explicit cap counts ("up to six creatures in a 30-foot-radius Sphere").
    if (match && (!area || match[1])) count = countOf(match[2]);
  }
  // Who it lands on: friends for help, foes for harm; area harm without a choice hits everyone.
  const harmfulCondition = conditions.some((id) => !GOOD_CONDITIONS.has(id));
  const negative = components.some((item) => item.value.startsWith("-"));
  const hostileSave = !!save && !save.harmless;
  // A Self spell is on the caster unless it attacks or forces a save (damage alone is a rider: Divine Favor).
  const self = rangeSelf(data) && !area && !attack && !hostileSave && !harmfulCondition;
  if (self) count = 1;
  if (count == null && !area) {
    const castRow = actionRows.find((row) => row.type === "cast" && Number(row.targetingval) > 0 && !CAST_SHAPES[String(row.targeting || "").toLowerCase()]);
    if (castRow) count = Number(castRow.targetingval);
  }

  const beneficial = !damage.length && !attack && (!!heal || (!!effect && !harmfulCondition && !negative && !hostileSave && conditions.length + components.length > 0));
  const friendly = /\ballies\b|\bwilling\b/i.test(body + " " + plain(data.effect) + " " + plain(data.area) + " " + targetField) || !!save?.harmless;
  /** @type {Targets["who"]} */
  let who = "any";
  if (self) who = "self";
  else if (beneficial || (friendly && !damage.length && !hostileSave && !harmfulCondition && !negative)) who = "ally";
  else if (damage.length || attack || hostileSave || harmfulCondition || negative) who = area && !choice ? "any" : "enemy";

  return {
    name,
    level: levelOf(data.level),
    area,
    attack,
    save,
    damage,
    heal,
    effect,
    endsOnDamage,
    targets: { count, who, choice, upcast, willing },
    concentration,
    beneficial,
  };
}

// --- FG 5E action rows -------------------------------------------------------------------

/** @type {Record<string, string>} */
const FG_UNIT = { round: "round", minute: "minute", hour: "hour", day: "day" };

/**
 * A parse written back as FG 5E action rows, the shape of Kraken's SRD data.
 * @param {ParsedSpell} parsed
 * @returns {any[]}
 */
export function toFg5eActions(parsed) {
  const out = [];
  const area = parsed.area;
  if (area) {
    const targeting = area.shape === "circle" ? (area.attach ? "emanation" : "sphere") : area.shape === "square" ? "cube" : area.shape;
    out.push({ type: "cast", targeting, targetingval: area.size, ...(area.shape === "line" && area.width && area.width !== 5 ? { targetingval2: area.width } : {}), ...(parsed.targets.upcast ? { allowupcast: 1 } : {}) });
  } else if (parsed.targets.who === "self") out.push({ type: "cast", targeting: "self", targetingval: 1 });
  else out.push({ type: "cast", targeting: "targets", targetingval: parsed.targets.count ?? 1, ...(parsed.targets.upcast ? { allowupcast: 1 } : {}) });
  if (parsed.attack) out.push({ type: "attack", atktype: parsed.attack.kind });
  if (parsed.save) out.push({ type: "powersave", savetype: parsed.save.kind, ...(parsed.save.effect === "half" ? { onmissdamage: "half" } : {}) });
  if (parsed.damage.length) out.push({ type: "damage", damagelist: parsed.damage.map((item) => ({ dice: item.dice, type: item.type, ...(item.bonus ? { bonus: item.bonus } : {}) })) });
  if (parsed.heal) out.push({ type: "heal", heallist: [{ dice: parsed.heal.dice, ...(parsed.heal.bonus ? { bonus: parsed.heal.bonus } : {}), ...(parsed.heal.addMod ? { stat: "base" } : {}) }] });
  if (parsed.effect) {
    const duration = parsed.effect.duration;
    // A 2E turn is ten minutes.
    const unit = duration?.unit === "turn" ? "minute" : FG_UNIT[duration?.unit ?? ""] ?? "";
    const durmod = unit ? (duration?.unit === "turn" ? duration.value * 10 : duration?.value ?? 0) : 0;
    out.push({ type: "effect", label: parsed.effect.label, durmod, durunit: unit, ...(parsed.targets.who === "self" ? { targeting: "self" } : {}) });
  }
  return out;
}
