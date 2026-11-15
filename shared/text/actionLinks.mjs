// @ts-check
// Action links in words (Foundry dnd5e's enrichers, and what a book already
// says): a check, a save or a skill against a DC, damage, healing, an XP award
// and a condition, as buttons. Foundry's markup ([[/check dex 15]],
// [[/save wis 13]], [[/skill perception 12]], [[/damage 2d6 fire]],
// [[/heal 2d4]], [[/award 50xp]], &Reference[prone]) and a book's own words
// ("DC 15 Dexterity saving throw", "a DC 13 Wisdom (Perception) check",
// "Reflex save (DC 15)", "Fortitude DC 14"), so every book an FG module
// brought in gets them without markup. A word becomes a link only when the
// game knows it (its manifest's party.groupCheck.rolls); src/ui/InlineRolls.tsx
// draws them, src/ui/chatCommands.ts runs them (/check, /save, /skill).

/** @typedef {{ kind: "check" | "save" | "skill"; options: { value: string; label: string }[] }} GroupRoll */
/** @typedef {{ type: "test"; kind: "check" | "save" | "skill"; value: string; name: string; dc: number }
 *  | { type: "damage"; formula: string; damageType: string; heal: boolean }
 *  | { type: "award"; xp: number }
 *  | { type: "condition"; word: string }} LinkAction */
/** @typedef {{ text: string } | { action: LinkAction; label: string; source: string }} LinkPiece */

const MARKUP = /\[\[\/(check|save|skill|damage|heal|healing|award)\b\s*([^\]]*?)\s*\]\](?:\{([^}]*)\})?|&Reference\[([^\]]+)\](?:\{([^}]*)\})?/gi;
// "DC 15 Dexterity saving throw", "DC 13 Wisdom (Perception) check", "DC 15 Reflex save".
const DC_FIRST = /\bDC\s*(\d{1,2})\s+([A-Z][a-z]+)(?:\s*\(([A-Z][A-Za-z ]+?)\))?\s+(saving throws?|saves?|checks?)\b/g;
// "Dexterity saving throw (DC 15)", "Wisdom (Insight) check (DC 12)".
const DC_AFTER = /\b([A-Z][a-z]+)(?:\s*\(([A-Z][A-Za-z ]+?)\))?\s+(saving throws?|saves?|checks?)\s*\(DC\s*(\d{1,2})\)/g;
// The 2024 books' "*Constitution Saving Throw:* DC 14".
const DC_COLON = /\b([A-Z][a-z]+)(?:\s*\(([A-Z][A-Za-z ]+?)\))?\s+(Saving Throw|Check)\b[:*_\s]*DC\s*(\d{1,2})\b/g;
// 3.5E's "Reflex DC 15", "Fortitude DC 14 negates".
const SAVE_DC = /\b(Fortitude|Reflex|Will)\s+DC\s*(\d{1,2})\b/g;
const DICE = /^\d*d\d+(?:\s*[+-]\s*\d+)?$/i;
const SHORT = /** @type {Record<string, string>} */ ({ str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma", fort: "fortitude", ref: "reflex" });

const squash = (/** @type {string} */ word) => word.toLowerCase().replace(/[^a-z]/g, "");

/**
 * The game's own name for a word, of a kind (check, save, skill); a check whose
 * word is a skill becomes the skill. null when the game has no such roll.
 * @param {GroupRoll[]} rolls the game's group rolls (manifest party.groupCheck.rolls)
 * @param {"check" | "save" | "skill"} kind
 * @param {string} word
 * @returns {{ kind: "check" | "save" | "skill"; value: string; name: string } | null}
 */
export function resolveTest(rolls, kind, word) {
  // As written ("dex", Cairn's own name) and spelt out ("dexterity", 5E's).
  const words = [...new Set([squash(word), squash(SHORT[squash(word)] ?? word)])].filter((item) => item.length >= 3);
  if (!words.length) return null;
  const find = (/** @type {"check" | "save" | "skill"} */ which) => {
    const options = rolls.find((roll) => roll.kind === which)?.options ?? [];
    for (const wanted of words) {
      const exact = options.find((option) => squash(option.value) === wanted || squash(option.label) === wanted);
      if (exact) return exact;
    }
    for (const wanted of words) {
      const start = options.find((option) => squash(option.value).startsWith(wanted) || squash(option.label).startsWith(wanted));
      if (start) return start;
    }
    return null;
  };
  const order = /** @type {("check" | "save" | "skill")[]} */ (kind === "check" ? ["check", "skill"] : kind === "skill" ? ["skill", "check"] : ["save"]);
  for (const which of order) {
    const option = find(which);
    if (option) return { kind: which, value: option.value, name: option.label };
  }
  return null;
}

/**
 * The words split into plain text and action links the game knows.
 * @param {string} text
 * @param {GroupRoll[]} rolls
 * @returns {LinkPiece[]}
 */
export function splitActionLinks(text, rolls) {
  /** @type {{ index: number; length: number; action: LinkAction; label: string; source: string }[]} */
  const found = [];
  const test = (/** @type {number} */ index, /** @type {string} */ source, /** @type {string} */ kindWord, /** @type {string} */ word, /** @type {string | undefined} */ skill, /** @type {string} */ dc, /** @type {string} */ label = "") => {
    const kind = /save|saving/i.test(kindWord) ? "save" : skill ? "skill" : /skill/i.test(kindWord) ? "skill" : "check";
    const resolved = resolveTest(rolls, kind, skill || word);
    if (!resolved) return;
    const number = Number(dc) || 0;
    found.push({ index, length: source.length, source, action: { type: "test", ...resolved, dc: number }, label: label || `${number ? `DC ${number} ` : ""}${resolved.name} ${resolved.kind === "save" ? "save" : "check"}` });
  };
  for (const match of String(text).matchAll(MARKUP)) {
    const index = match.index ?? 0;
    if (match[4]) {
      found.push({ index, length: match[0].length, source: match[0], action: { type: "condition", word: match[4].trim() }, label: (match[5] || match[4]).trim() });
      continue;
    }
    const type = match[1].toLowerCase();
    const words = match[2].trim().split(/\s+/).filter(Boolean);
    if (type === "award") {
      const xp = Number(/^(\d+)\s*xp$/i.exec(match[2].trim())?.[1] ?? NaN);
      if (Number.isFinite(xp) && xp > 0) found.push({ index, length: match[0].length, source: match[0], action: { type: "award", xp }, label: match[3] || `${xp} XP` });
      continue;
    }
    if (type === "damage" || type === "heal" || type === "healing") {
      const formula = words.filter((word) => /^[\dd+\-]+$/i.test(word)).join("");
      if (!DICE.test(formula)) continue;
      const damageType = words.filter((word) => !/^[\dd+\-]+$/i.test(word) && !/^average$/i.test(word)).join(" ");
      const heal = type !== "damage";
      found.push({ index, length: match[0].length, source: match[0], action: { type: "damage", formula, damageType, heal }, label: match[3] || `${formula}${damageType ? ` ${damageType}` : heal ? " healing" : ""}` });
      continue;
    }
    const dc = words.find((word) => /^(dc=?)?\d+$/i.test(word))?.replace(/\D/g, "") ?? "0";
    const word = words.filter((word) => !/^(dc=?)?\d+$/i.test(word)).join(" ");
    test(index, match[0], type, word, type === "skill" ? word : undefined, dc, match[3]);
  }
  for (const match of String(text).matchAll(DC_FIRST)) test(match.index ?? 0, match[0], match[4], match[2], match[3], match[1]);
  for (const match of String(text).matchAll(DC_AFTER)) test(match.index ?? 0, match[0], match[3], match[1], match[2], match[4]);
  for (const match of String(text).matchAll(DC_COLON)) test(match.index ?? 0, match[0], match[3], match[1], match[2], match[4]);
  for (const match of String(text).matchAll(SAVE_DC)) test(match.index ?? 0, match[0], "save", match[1], undefined, match[2]);
  // In order, the first of any overlap kept.
  found.sort((a, b) => a.index - b.index);
  /** @type {LinkPiece[]} */
  const out = [];
  let at = 0;
  for (const item of found) {
    if (item.index < at) continue;
    if (item.index > at) out.push({ text: text.slice(at, item.index) });
    out.push({ action: item.action, label: item.label, source: item.source });
    at = item.index + item.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/**
 * The chat line a link runs (as typed): /check dexterity 15, /damage 2d6 fire.
 * @param {LinkAction} action
 */
export function actionLine(action) {
  if (action.type === "test") return `/${action.kind} ${action.value}${action.dc ? ` ${action.dc}` : ""}`;
  if (action.type === "damage") return `/roll ${action.formula} #${action.heal ? "[HEAL]" : "[DAMAGE]"}${action.damageType ? ` ${action.damageType}` : ""}`;
  if (action.type === "award") return `/award ${action.xp}`;
  return "";
}
