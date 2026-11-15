// @ts-check
// FG's formatted text (a story's, a note's): the tags FG's text uses, and
// nothing else. The host cleans every formatted text a seat writes with this,
// so no seat can put markup of its own into another seat's window; the
// client's FormattedText draws only these tags as elements in any case.
//
// A link is FG's <link class recordname>words</link>. A Kraken link (a book
// page, a picture, a sound, a note...: anything that can be dragged) is
// <link class="kraken" recordname="kraken:{json}">, the json URI-encoded, so
// an FG reader still sees a link with its words.

/** The tags kept, and the attributes each may carry. */
export const FORMATTED_TAGS = {
  p: [], b: [], strong: [], i: [], em: [], u: [], h: [], list: [], ul: [], ol: [], li: [],
  table: [], tr: [], td: ["colspan"], th: ["colspan"], frame: [], linklist: [], link: ["class", "recordname"], sup: [], sub: [], br: [],
};
const EMPTY = new Set(["br"]);
const ENTITY = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,30});/i;

/** @param {string} value */
const escapeText = (value) => value.replace(/&/g, (amp, at, all) => (ENTITY.test(all.slice(at)) ? amp : "&amp;")).replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** @param {string} value */
const escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** @param {string} value */
const decodeAttr = (value) => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Formatted text with only FG's tags left (and their own attributes): any
 * other tag, or a stray < or >, becomes words. Plain text (an old note's) is
 * kept as it was, its newlines too.
 * @param {unknown} input
 * @param {number} [max]
 */
export function sanitizeFormatted(input, max = 200000) {
  const text = String(input ?? "").slice(0, max);
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const open = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>/g;
  let at = 0;
  for (let match = tag.exec(text); match; match = tag.exec(text)) {
    out.push(escapeText(text.slice(at, match.index)));
    at = tag.lastIndex;
    const [whole, closing, rawName, rawAttrs, selfClosing] = match;
    const name = rawName.toLowerCase();
    const allowed = /** @type {Record<string, string[]>} */ (FORMATTED_TAGS)[name];
    if (!allowed) {
      out.push(escapeText(whole));
      continue;
    }
    if (closing) {
      // Only a tag that is open is closed (anything opened inside it closes first).
      const index = open.lastIndexOf(name);
      if (index === -1) continue;
      while (open.length > index) out.push(`</${open.pop()}>`);
      continue;
    }
    const attrs = [...rawAttrs.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g)]
      .filter(([, key]) => allowed.includes(key.toLowerCase()))
      .map(([, key, double, single]) => ` ${key.toLowerCase()}="${escapeAttr(decodeAttr(double ?? single ?? "").slice(0, 2000))}"`)
      .join("");
    if (EMPTY.has(name) || selfClosing) out.push(EMPTY.has(name) ? `<${name}${attrs} />` : `<${name}${attrs}></${name}>`);
    else {
      out.push(`<${name}${attrs}>`);
      open.push(name);
    }
  }
  out.push(escapeText(text.slice(at)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

/** Does the text hold FG's tags (or is it an old note's plain words)? @param {unknown} text */
export const isFormatted = (text) => /<\/?(p|b|i|u|h|list|li|table|frame|linklist|link)\b/.test(String(text ?? ""));

/** A Kraken link as FG's link tag's recordname. @param {Record<string, unknown>} link */
export const krakenRecordname = (link) => `kraken:${encodeURIComponent(JSON.stringify(link))}`;
/** The Kraken link a link tag carries, if it is one. @param {string | null | undefined} recordname */
export function linkOfRecordname(recordname) {
  const raw = String(recordname ?? "");
  if (!raw.startsWith("kraken:")) return null;
  try {
    const link = JSON.parse(decodeURIComponent(raw.slice(7)));
    return link && typeof link === "object" && typeof link.kind === "string" ? link : null;
  } catch {
    return null;
  }
}

/** Plain words as written, from the entities the host's cleaning put in (an old note's &amp; and &lt;). @param {unknown} text */
export const decodeEntities = (text) =>
  String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d{1,7});/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/** The words of a formatted text, without its tags (a chat line, a search). @param {unknown} text */
export const plainOf = (text) =>
  String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
