// @ts-check
// Inline rolls in words (Foundry's [[1d20+3]] and [[/r 1d20+3 #Attack]], and
// the bare dice a book's text names, "2d6 + 3 fire damage", the usual dice
// only): where they are, as plain text and rolls. Read by every text the
// interface draws (src/ui/InlineRolls.tsx) and by the checks.

const PATTERN = /\[\[\s*(?:\/r(?:oll)?\s+)?([^\]#]+?)\s*(?:#\s*([^\]]*?))?\s*\]\]|(?<![\w/])(\d*d(?:100|20|12|10|8|6|4|%)(?:\s*[+\-−]\s*\d+(?![\w]))?)(?![\w])/gi;
const FORMULA = /^[\d\s+\-dkhlx!rocsfmina%<>=]+$/i;

/** @typedef {{ text: string } | { formula: string; label: string; source: string }} InlinePiece */

/**
 * The words split into plain text and rolls.
 * @param {string} text
 * @returns {InlinePiece[]}
 */
export function splitInlineRolls(text) {
  /** @type {InlinePiece[]} */
  const out = [];
  let at = 0;
  for (const match of String(text).matchAll(PATTERN)) {
    const formula = (match[1] ?? match[3] ?? "").replace(/−/g, "-").replace(/\s+/g, "");
    if (!formula || !FORMULA.test(formula) || !/d/i.test(formula)) continue;
    const index = match.index ?? 0;
    if (index > at) out.push({ text: text.slice(at, index) });
    out.push({ formula, label: (match[2] ?? "").trim(), source: match[0] });
    at = index + match[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
