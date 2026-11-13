// The map's outdoor light and its lights, read from Fantasy Grounds image
// records for Kraken's map editor (the reading half of Map Studio's
// lighting.py; names and shapes match it). Nothing here writes to FG.
//
// p.ambient (absent: not set) is { preset, color, alpha, shadows, shadowColor,
// shadowAlpha, angle, length }; see studio/web/lighting.js. FG keeps it in the
// image record as
//
//   <ambient><on /><ambientcolor>#AARRGGBB</ambientcolor><shadows /><shadowcolor>#AARRGGBB</shadowcolor>
//            <lightdir>angle / 360</lightdir><shadowlength>length / 20</shadowlength></ambient>
//
// (as FGU 4 saves it; the presets are CoreRPG's gameelements.xml).
//
// A light is FG's image light: <range>bright,falloff,dim,dimfalloff</range>
// (squares and fractions; CoreRPG's defaults are 25% and 50%), <color>#AARRGGBB</color>
// (alpha is its strength), animtype (1 flicker, 2 pulse) and animspeed (0..1),
// <inverse /> for darkness and <on /> when lit.
//
// This file also holds the two small pieces fgMaps.cjs uses through
// `lighting.xml` and `lighting.py`:
//   - xml: an element tree with Python ElementTree's model (text and tail,
//     find/findtext/iter, tostring) and expat's byte positions, so a map opens
//     into the same project the Python original made, its fgImage included.
//   - py: Python's number parsing, formatting and rounding (float() parses
//     strings its own way, round() is banker's rounding, round(x, n) and str()
//     of a float follow Python's digits), for the same reason.

"use strict";

// ---------------------------------------------------------------------------
// Python-compatible numbers

// The exact value of a finite double as mantissa * 2^exponent (BigInt mantissa).
function exactParts(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exponent;
  if (biased === 0) exponent = -1074;
  else {
    mantissa |= 1n << 52n;
    exponent = biased - 1075;
  }
  return { mantissa, exponent };
}

// Python's f"{x:.{digits}f}": the exact value rounded half to even.
function fixed(x, digits) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x < 0 ? "-inf" : "inf";
  const negative = x < 0 || Object.is(x, -0);
  const { mantissa, exponent } = exactParts(x);
  const scale = 10n ** BigInt(digits);
  let q;
  if (exponent >= 0) q = (mantissa << BigInt(exponent)) * scale;
  else {
    const num = mantissa * scale;
    const den = 1n << BigInt(-exponent);
    q = num / den;
    const twice = (num % den) * 2n;
    if (twice > den || (twice === den && q % 2n === 1n)) q += 1n;
  }
  let s = q.toString();
  if (digits > 0) {
    s = s.padStart(digits + 1, "0");
    s = `${s.slice(0, -digits)}.${s.slice(-digits)}`;
  }
  return (negative ? "-" : "") + s;
}

// Python's round(x): to the nearest integer, ties to even.
function round(x) {
  if (!Number.isFinite(x)) throw new Error("cannot convert float infinity or NaN to integer");
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor + 0; // +0 drops a negative zero, as Python's int has none
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor + 0 : floor + 1;
}

// Python's round(x, n) for floats: the correctly rounded decimal, ties to even.
function roundTo(x, digits) {
  if (!Number.isFinite(x)) return x;
  return Number(fixed(x, digits));
}

// Python's float % float: the result takes the divisor's sign.
function mod(a, b) {
  if (b === 0) throw new Error("float modulo");
  let m = a % b;
  if (m !== 0 && (b < 0) !== (m < 0)) m += b;
  else if (m === 0) m = b < 0 ? -0 : 0;
  return m;
}

// Python's float() on what JSON or XML hands it. Throws like Python would
// (TypeError for None/objects, ValueError for bad strings).
const FLOAT_TEXT = /^[+-]?(?:(?:\d(?:_?\d)*)?\.?\d(?:_?\d)*|\d(?:_?\d)*\.)(?:[eE][+-]?\d(?:_?\d)*)?$/;
function float(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const s = value.trim();
    const lower = s.toLowerCase();
    if (/^[+-]?(inf|infinity)$/.test(lower)) return lower.startsWith("-") ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(lower)) return NaN;
    if (!FLOAT_TEXT.test(s)) {
      const error = new Error(`could not convert string to float: '${value}'`);
      error.pyType = "ValueError";
      throw error;
    }
    return Number(s.replace(/_/g, ""));
  }
  const error = new Error(`float() argument must be a string or a real number, not '${value === null || value === undefined ? "NoneType" : typeof value}'`);
  error.pyType = "TypeError";
  throw error;
}

// Python's str() for the values the port writes as XML text.
function str(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toFixed(0) === "-0" ? "0" : String(value);
    return repr(value);
  }
  return String(value);
}

// Python's repr() of a float (what json.dumps writes for one): the shortest
// digits that read back, with ".0" on whole numbers and Python's own switch to
// exponent form (below 1e-4 and from 1e16).
function repr(x) {
  if (Number.isNaN(x)) return "NaN";
  if (!Number.isFinite(x)) return x < 0 ? "-Infinity" : "Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const [mant, expText] = x.toExponential().split("e");
  const exp = Number(expText);
  const negative = mant.startsWith("-");
  const digits = mant.replace("-", "").replace(".", "");
  let out;
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    out = `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  } else if (exp < 0) {
    out = `0.${"0".repeat(-exp - 1)}${digits}`;
  } else if (digits.length <= exp + 1) {
    out = `${digits}${"0".repeat(exp + 1 - digits.length)}.0`;
  } else {
    out = `${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
  }
  return (negative ? "-" : "") + out;
}

// Python's s[:n] counts code points, not UTF-16 units.
function slice(s, n) {
  const chars = Array.from(s);
  return chars.length <= n ? s : chars.slice(0, n).join("");
}

// Python's str.title() for the effect names it is used on.
function title(s) {
  return s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// Python's PurePath(...).stem and .suffix (either slash separates, as on Windows).
function pathStem(p) {
  const name = p.split(/[\\/]/).pop();
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(0, i) : name;
}
function pathSuffix(p) {
  const name = p.split(/[\\/]/).pop();
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i) : "";
}

// math.degrees as CPython computes it.
const RAD_TO_DEG = 180 / Math.PI;

const py = { fixed, round, roundTo, mod, float, str, repr, slice, title, pathStem, pathSuffix, RAD_TO_DEG };

// ---------------------------------------------------------------------------
// XML: Python ElementTree's model

class Element {
  constructor(tag, attrib) {
    this.tag = tag;
    this.attrib = { ...(attrib || {}) };
    this.text = null;
    this.tail = null;
    this.children = [];
  }
  get length() {
    return this.children.length;
  }
  get(key, fallback = null) {
    return Object.prototype.hasOwnProperty.call(this.attrib, key) ? this.attrib[key] : fallback;
  }
  set(key, value) {
    this.attrib[key] = value;
  }
  append(e) {
    this.children.push(e);
  }
  extend(list) {
    for (const e of list) this.children.push(e);
  }
  insert(index, e) {
    // list.insert clamps the index, negative counting from the end.
    let i = index < 0 ? Math.max(0, this.children.length + index) : Math.min(index, this.children.length);
    this.children.splice(i, 0, e);
  }
  remove(e) {
    const i = this.children.indexOf(e);
    if (i < 0) throw new Error("list.remove(x): x not in list");
    this.children.splice(i, 1);
  }
  // ElementPath's subset the port uses: "tag", "a/b", "./tag", ".//tag", "*".
  findall(pathText) {
    let current = [this];
    const steps = pathText.split("/");
    let descend = false;
    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      if (step === "." ) continue;
      if (step === "") {
        descend = true;
        continue;
      }
      const next = [];
      for (const node of current) {
        if (descend) {
          for (const d of node.iter()) if (d !== node && (step === "*" || d.tag === step)) next.push(d);
        } else {
          for (const c of node.children) if (step === "*" || c.tag === step) next.push(c);
        }
      }
      descend = false;
      current = next;
    }
    return current;
  }
  find(pathText) {
    if (!pathText.includes("/")) return this.children.find((c) => c.tag === pathText) ?? null;
    return this.findall(pathText)[0] ?? null;
  }
  findtext(pathText, fallback = null) {
    const e = this.find(pathText);
    if (!e) return fallback;
    return e.text ?? "";
  }
  *iter(tag) {
    if (tag === undefined || tag === "*" || this.tag === tag) yield this;
    for (const c of this.children) yield* c.iter(tag);
  }
}

// --- parsing (expat's view of the document, with its byte positions) ---

class ParseError extends Error {}

const LATIN1 = new Set(["iso-8859-1", "iso8859-1", "latin-1", "latin1", "l1", "us-ascii", "ascii"]);

function normEncoding(name) {
  const n = String(name || "utf-8").toLowerCase();
  if (n === "utf-8" || n === "utf8") return "utf-8";
  if (LATIN1.has(n)) return "latin1";
  return n;
}

// Decodes bytes of a document in its declared encoding.
function decodeBytes(buf, encoding, start = 0, end = buf.length) {
  const enc = normEncoding(encoding);
  if (enc === "utf-8") return buf.toString("utf8", start, end);
  if (enc === "latin1") return buf.toString("latin1", start, end);
  return new TextDecoder(enc).decode(buf.subarray(start, end));
}

// The encoding named in an XML declaration (default UTF-8), as fg_maps reads it.
function declaredEncoding(buf) {
  const head = buf.subarray(0, 200).toString("latin1");
  const m = /^\s*<\?xml[^>]*encoding=["']([A-Za-z0-9_-]+)/.exec(head);
  return m ? m[1] : "utf-8";
}

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(s, at) {
  if (!s.includes("&")) return s;
  return s.replace(/&([^;\s&<]*);?/g, (whole, name) => {
    if (!whole.endsWith(";")) throw new ParseError(`not well-formed (invalid token) near byte ${at}`);
    if (name[0] === "#") {
      const cp = name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff || (name[1] === "x" ? !/^[0-9a-fA-F]+$/.test(name.slice(2)) : !/^\d+$/.test(name.slice(1)))) {
        throw new ParseError(`reference to invalid character number near byte ${at}`);
      }
      return String.fromCodePoint(cp);
    }
    if (!(name in ENTITIES)) throw new ParseError(`undefined entity &${name}; near byte ${at}`);
    return ENTITIES[name];
  });
}

const NAME_END = new Set([0x20, 0x09, 0x0a, 0x0d, 0x2f, 0x3e, 0x3d]);

function indexOfBytes(buf, text, from) {
  return buf.indexOf(text, from, "latin1");
}

// Walks a document's markup, calling start(tag, attrs, byteIndex), end(tag,
// byteIndex) and text(string) as expat does (byteIndex is where the tag's "<"
// is, expat's CurrentByteIndex). Throws ParseError when it is not well formed.
function parseEvents(buf, encoding, handlers) {
  const enc = normEncoding(encoding);
  const n = buf.length;
  let i = 0;
  if (enc === "utf-8" && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) i = 3;
  const stack = [];
  let rootDone = false;
  let rootSeen = false;
  const text = (s) => {
    if (s && handlers.text) handlers.text(s);
  };
  const newlines = (s) => s.replace(/\r\n?/g, "\n");
  while (i < n) {
    if (buf[i] !== 0x3c) {
      let j = buf.indexOf(0x3c, i);
      if (j < 0) j = n;
      const raw = decodeBytes(buf, enc, i, j);
      if (stack.length) text(decodeEntities(newlines(raw), i));
      else if (raw.trim()) throw new ParseError(rootDone ? `junk after document element: line near byte ${i}` : `syntax error near byte ${i}`);
      i = j;
      continue;
    }
    if (buf[i + 1] === 0x3f) {
      const j = indexOfBytes(buf, "?>", i + 2);
      if (j < 0) throw new ParseError(`unclosed token near byte ${i}`);
      i = j + 2;
      continue;
    }
    if (buf[i + 1] === 0x21) {
      if (buf.toString("latin1", i, i + 4) === "<!--") {
        const j = indexOfBytes(buf, "-->", i + 4);
        if (j < 0) throw new ParseError(`unclosed token near byte ${i}`);
        i = j + 3;
        continue;
      }
      if (buf.toString("latin1", i, i + 9) === "<![CDATA[") {
        const j = indexOfBytes(buf, "]]>", i + 9);
        if (j < 0 || !stack.length) throw new ParseError(`unclosed CDATA section near byte ${i}`);
        text(newlines(decodeBytes(buf, enc, i + 9, j)));
        i = j + 3;
        continue;
      }
      // A DOCTYPE, with any internal subset in brackets.
      let j = i + 2;
      let depth = 0;
      while (j < n && !(buf[j] === 0x3e && depth === 0)) {
        if (buf[j] === 0x5b) depth++;
        else if (buf[j] === 0x5d) depth--;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (buf[i + 1] === 0x2f) {
      const j = buf.indexOf(0x3e, i);
      if (j < 0) throw new ParseError(`unclosed token near byte ${i}`);
      const tag = decodeBytes(buf, enc, i + 2, j).trim();
      if (!stack.length || stack[stack.length - 1] !== tag) throw new ParseError(`mismatched tag near byte ${i}`);
      stack.pop();
      if (handlers.end) handlers.end(tag, i);
      if (!stack.length) rootDone = true;
      i = j + 1;
      continue;
    }
    // A start tag.
    if (rootDone) throw new ParseError(`junk after document element near byte ${i}`);
    const at = i;
    let j = i + 1;
    while (j < n && !NAME_END.has(buf[j])) j++;
    const tag = decodeBytes(buf, enc, i + 1, j);
    if (!tag) throw new ParseError(`not well-formed (invalid token) near byte ${i}`);
    const attrs = {};
    let selfClosing = false;
    for (;;) {
      while (j < n && (buf[j] === 0x20 || buf[j] === 0x09 || buf[j] === 0x0a || buf[j] === 0x0d)) j++;
      if (j >= n) throw new ParseError(`unclosed token near byte ${at}`);
      if (buf[j] === 0x3e) {
        j++;
        break;
      }
      if (buf[j] === 0x2f && buf[j + 1] === 0x3e) {
        selfClosing = true;
        j += 2;
        break;
      }
      let k = j;
      while (k < n && !NAME_END.has(buf[k])) k++;
      const name = decodeBytes(buf, enc, j, k);
      while (k < n && (buf[k] === 0x20 || buf[k] === 0x09 || buf[k] === 0x0a || buf[k] === 0x0d)) k++;
      if (buf[k] !== 0x3d || !name) throw new ParseError(`not well-formed (invalid token) near byte ${k}`);
      k++;
      while (k < n && (buf[k] === 0x20 || buf[k] === 0x09 || buf[k] === 0x0a || buf[k] === 0x0d)) k++;
      const quote = buf[k];
      if (quote !== 0x22 && quote !== 0x27) throw new ParseError(`not well-formed (invalid token) near byte ${k}`);
      const close = buf.indexOf(quote, k + 1);
      if (close < 0) throw new ParseError(`unclosed token near byte ${at}`);
      const raw = decodeBytes(buf, enc, k + 1, close);
      if (raw.includes("<")) throw new ParseError(`not well-formed (invalid token) near byte ${k}`);
      if (Object.prototype.hasOwnProperty.call(attrs, name)) throw new ParseError(`duplicate attribute near byte ${j}`);
      // XML's attribute-value normalisation: literal white space becomes spaces
      // (character references keep what they say).
      attrs[name] = decodeEntities(newlines(raw).replace(/[\t\n]/g, " "), k);
      j = close + 1;
    }
    if (!stack.length) {
      if (rootSeen) throw new ParseError(`junk after document element near byte ${at}`);
      rootSeen = true;
    }
    stack.push(tag);
    if (handlers.start) handlers.start(tag, attrs, at);
    if (selfClosing) {
      stack.pop();
      if (handlers.end) handlers.end(tag, at);
      if (!stack.length) rootDone = true;
    }
    i = j;
  }
  if (stack.length || !rootSeen) throw new ParseError(rootSeen ? "unclosed token" : "no element found");
}

// ET.fromstring on bytes (the declaration's encoding) or on a string.
function fromString(source, encoding) {
  const buf = typeof source === "string" ? Buffer.from(source, "utf8") : Buffer.isBuffer(source) ? source : Buffer.from(source);
  const enc = typeof source === "string" ? "utf-8" : encoding || declaredEncoding(buf);
  let root = null;
  const stack = [];
  let last = null; // the element whose text or tail the next data belongs to
  let tailMode = false;
  let data = [];
  const flush = () => {
    if (!data.length) return;
    const s = data.join("");
    data = [];
    if (!last) return;
    if (tailMode) last.tail = (last.tail ?? "") + s;
    else last.text = (last.text ?? "") + s;
  };
  parseEvents(buf, enc, {
    start(tag, attrs) {
      flush();
      const e = new Element(tag, attrs);
      if (stack.length) stack[stack.length - 1].append(e);
      else root = e;
      stack.push(e);
      last = e;
      tailMode = false;
    },
    end() {
      flush();
      last = stack.pop();
      tailMode = true;
    },
    text(s) {
      data.push(s);
    },
  });
  flush();
  if (root) root.tail = null; // nothing after the document element is kept
  return root;
}

// --- writing ---

function escapeCdata(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttrib(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#09;");
}

function serialize(e, out) {
  let open = `<${e.tag}`;
  for (const [k, v] of Object.entries(e.attrib)) open += ` ${k}="${escapeAttrib(String(v))}"`;
  out.push(open);
  if (e.text || e.children.length) {
    out.push(">");
    if (e.text) out.push(escapeCdata(e.text));
    for (const c of e.children) serialize(c, out);
    out.push(`</${e.tag}>`);
  } else out.push(" />");
  if (e.tail) out.push(escapeCdata(e.tail));
}

// ET.tostring(e, encoding="unicode").
function toString(e) {
  const out = [];
  serialize(e, out);
  return out.join("");
}

const xml = { Element, fromString, toString, parseEvents, declaredEncoding, decodeBytes, ParseError };

// ---------------------------------------------------------------------------
// Lighting

const AMBIENT = {
  night: {},
  dawn: { color: "#ffdfbd", alpha: 1, shadowColor: "#0057bd", shadowAlpha: 0x65 / 255, angle: 144, length: 2 },
  sunlight: { color: "#fff7e6", alpha: 1, shadowColor: "#30525d", shadowAlpha: 0x91 / 255, angle: 280, length: 0.2 },
  dusk: { color: "#ffc3a0", alpha: 1, shadowColor: "#3052bb", shadowAlpha: 0x31 / 255, angle: 316, length: 2 },
  moonlight: { color: "#c9e7ff", alpha: 0x91 / 255, shadowColor: "#195263", shadowAlpha: 0x74 / 255, angle: 220, length: 0.6 },
  custom: { color: "#8ea0c8", alpha: 0.8, shadowColor: "#202838", shadowAlpha: 0.5, angle: 225, length: 1 },
};
const FG_ANIM = { flicker: 1, pulse: 2 };
const FALLOFF = 25; // CoreRPG's DEFAULT_LIGHT_FALLOFF_BRIGHT, in %
const DIM_FALLOFF = 50; // CoreRPG's DEFAULT_LIGHT_FALLOFF_DIM, in %
const HEX = /^#[0-9a-fA-F]{6}$/;

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isDict = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const animKnown = (v) => typeof v === "string" && has(FG_ANIM, v);

// A number clamped to lo..hi, or the default when it is not one.
function _num(v, lo, hi, fallback) {
  let n;
  try {
    n = float(v);
  } catch {
    return fallback;
  }
  return Number.isNaN(n) ? fallback : Math.min(hi, Math.max(lo, n));
}

function normalizeAmbient(a) {
  if (!isDict(a) || typeof a.preset !== "string" || !has(AMBIENT, a.preset)) return null;
  if (a.preset === "night") return { preset: "night" };
  const d = AMBIENT[a.preset];
  const color = (k) => (typeof a[k] === "string" && HEX.test(a[k]) ? a[k].toLowerCase() : d[k]);
  return {
    preset: a.preset,
    color: color("color"),
    alpha: _num(a.alpha, 0.05, 1, d.alpha),
    shadows: a.shadows !== false,
    shadowColor: color("shadowColor"),
    shadowAlpha: _num(a.shadowAlpha, 0, 1, d.shadowAlpha),
    angle: round(_num(a.angle, 0, 359, d.angle)),
    length: round(_num(a.length, 0, 20, d.length) * 5) / 5,
  };
}

// Everything Map Studio keeps of an FG image light except where it is.
function readFgLight(light) {
  let r;
  try {
    r = (light.findtext("range") || "").split(",").slice(0, 4).filter((v) => v.trim()).map(float);
  } catch {
    r = [];
  }
  r = r.concat([2, FALLOFF / 100, 4, DIM_FALLOFF / 100].slice(r.length));
  const [color, alpha] = _split(light.findtext("color"), "#ffbb66");
  const bright = Math.max(0.0, r[0] * 5);
  const out = {
    bright,
    dim: Math.max(bright, r[2] * 5, 0.01),
    color,
    strength: Math.max(1, round(alpha * 100)),
    falloff: round(_num(r[1], 0, 1, FALLOFF / 100) * 100),
    dimFalloff: round(_num(r[3], 0, 1, DIM_FALLOFF / 100) * 100),
    ...readFgLightAnimation(light),
  };
  if (light.find("inverse") !== null) out.inverse = true;
  if (light.find("on") === null) out.on = false;
  return out;
}

function _split(argb, fallback) {
  const v = (argb || "").trim().replace(/^#+/, "");
  if (/^[0-9a-fA-F]{8}$/.test(v)) return [`#${v.slice(2).toLowerCase()}`, parseInt(v.slice(0, 2), 16) / 255];
  if (/^[0-9a-fA-F]{6}$/.test(v)) return [`#${v.toLowerCase()}`, 1.0];
  return [fallback, 1.0];
}

// The outdoor light from an FG image record: a preset when the colours match,
// else Custom. Lighting on with no ambient is Night; neither is not set.
function readFgAmbient(img) {
  const e = img.find("ambient");
  if (e === null || e.find("on") === null) return (img.findtext("uselighting") || "").trim() === "on" ? { preset: "night" } : null;
  const [color, alpha] = _split(e.findtext("ambientcolor"), "#ffffff");
  const [shadow, shadowAlpha] = _split(e.findtext("shadowcolor"), "#000000");
  const a = {
    color,
    alpha,
    shadows: e.find("shadows") !== null,
    shadowColor: shadow,
    shadowAlpha,
    angle: mod(round(_num(e.findtext("lightdir"), 0, 1, 0) * 360), 360),
    length: _num(e.findtext("shadowlength"), 0, 1, 0) * 20,
  };
  const preset = Object.keys(AMBIENT).find((k) => AMBIENT[k].color === color && Math.abs((AMBIENT[k].alpha ?? 0) - alpha) < 0.01) ?? "custom";
  return normalizeAmbient({ ...a, preset });
}

function readFgLightAnimation(light) {
  const raw = (light.findtext("animtype") || "").trim();
  const kind = Object.keys(FG_ANIM).find((k) => String(FG_ANIM[k]) === raw);
  if (!kind) return {};
  return { animation: kind, speed: Math.max(1, round(_num(light.findtext("animspeed"), 0, 1, 1) * 100)) };
}

module.exports = {
  AMBIENT,
  FG_ANIM,
  FALLOFF,
  DIM_FALLOFF,
  normalizeAmbient,
  readFgLight,
  readFgAmbient,
  readFgLightAnimation,
  _num,
  _split,
  xml,
  py,
};
