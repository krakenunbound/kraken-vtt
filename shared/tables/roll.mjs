// @ts-check
// Random tables, as FG's tables behave (CoreRPG's table record: tablerows of
// fromrange / torange and results by column, a die, a modifier, column
// labels, "hide roll results"). Kraken's own code, written from how FG's
// tables act at the table, never from its scripts (PLAN.md ground rule 3):
//   - the die is the table's own, or worked out from the rows' span (1-6 a
//     d6, 2-12 a d11+1, a span FG has no die for a dN);
//   - a total below the first row reads the lowest row, above the last the
//     highest; a row whose torange is 0 is the single number fromrange;
//   - column 0 reads every column, each with its label; a column reads one;
//   - in a result, [2d6] is rolled and its total written in; [3x] repeats the
//     tables the result links to that many times (the first [Nx] the first
//     link); [Another Table] rolls that table too;
//   - a result linking a table rolls it; a result linking anything else keeps
//     its link (the chat card carries it).
// Pure: the dice and the table lookup come from the caller (the host's
// seeded dice; the campaign's and the active books' tables).

/** @typedef {{ class?: string; recordname?: string }} TableLink */
/** @typedef {{ text: string; label: string; link: TableLink | null }} TableResult */
/** @typedef {{ name: string; total: number; formula: string; secret: boolean; results: TableResult[]; nested: TableRoll[]; rolled: { total: number } }} TableRoll */

const MAX_DEPTH = 10;
const MAX_ROLLS = 100;

/** @param {unknown} value */
const rowsOf = (value) => Object.entries(value && typeof value === "object" ? value : {}).filter(([, row]) => row && typeof row === "object").sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
/** @param {unknown} row */
function rangeOf(row) {
  const from = Number(/** @type {any} */ (row)?.fromrange) || 0;
  const to = Number(/** @type {any} */ (row)?.torange) || 0;
  return { from, to: to === 0 ? from : to };
}

/** Does this record hold a random table? @param {unknown} data */
export const isTable = (data) => Boolean(data && typeof data === "object" && /** @type {any} */ (data).tablerows && typeof (/** @type {any} */ (data).tablerows) === "object");

/**
 * The table's dice as a formula: its own die and modifier, or one worked out
 * from the span of its rows (their lowest number less one as the modifier).
 * @param {Record<string, unknown>} data
 */
export function tableFormula(data) {
  const mod = Number(data.mod) || 0;
  const own = String(data.dice ?? "")
    .replace(/\s+/g, "")
    .split(",")
    .filter(Boolean);
  if (own.length) {
    let dice = own;
    // Old modules wrote a d100 as d10 and d100: read it as one d100 when the rows run 1-100.
    if (dice.length === 2 && mod === 0 && dice.includes("d10") && dice.includes("d100")) {
      const span = spanOf(data);
      if (span && span.min <= 1 && span.max === 100) dice = ["d100"];
    }
    return withMod(dice.map((die) => (/^d/i.test(die) ? `1${die}` : die)).join("+"), mod);
  }
  const span = spanOf(data);
  if (!span) return withMod("1d20", mod);
  const low = Math.max(1, span.min);
  const sides = Math.max(1, span.max - low + 1);
  return withMod(`1d${sides}`, mod + (low - 1));
}
/** @param {string} dice @param {number} mod */
const withMod = (dice, mod) => (mod ? `${dice}${mod > 0 ? "+" : ""}${mod}` : dice);
/** @param {Record<string, unknown>} data */
function spanOf(data) {
  const ranges = rowsOf(data.tablerows).map(([, row]) => rangeOf(row));
  if (!ranges.length) return null;
  return { min: Math.min(...ranges.map((range) => range.from)), max: Math.max(...ranges.map((range) => range.to)) };
}

/** The column numbered by its label (1 up), or 0 for every column. @param {Record<string, unknown>} data @param {unknown} name */
export function columnOf(data, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return 0;
  if (/^\d+$/.test(wanted)) return Number(wanted);
  const columns = Math.max(1, Number(data.resultscols) || 1);
  for (let index = 1; index <= columns; index++) if (String(data[`labelcol${index}`] ?? "").trim().toLowerCase() === wanted) return index;
  return 0;
}

/**
 * The row a total falls in (clamped to the first or last row), and its
 * results: one column, or each column with its label.
 * @param {Record<string, unknown>} data @param {number} total @param {number} [column]
 * @returns {TableResult[] | null}
 */
export function resultsAt(data, total, column = 0) {
  const rows = rowsOf(data.tablerows).map(([, row]) => ({ row: /** @type {Record<string, any>} */ (row), ...rangeOf(row) }));
  if (!rows.length) return null;
  let found = rows.find((item) => total >= item.from && total <= item.to);
  if (!found) {
    const lowest = rows.reduce((best, item) => (item.from < best.from ? item : best));
    const highest = rows.reduce((best, item) => (item.to > best.to ? item : best));
    found = total < lowest.from ? lowest : total > highest.to ? highest : undefined;
  }
  if (!found) return null;
  const cells = rowsOf(found.row.results);
  const result = (/** @type {[string, any]} */ [, cell], /** @type {number} */ index) => ({
    text: String(cell?.result ?? "").trim(),
    label: String(data[`labelcol${index + 1}`] ?? ""),
    link: cell?.resultlink && typeof cell.resultlink === "object" && cell.resultlink.recordname ? { class: String(cell.resultlink.class ?? ""), recordname: String(cell.resultlink.recordname) } : null,
  });
  if (column > 0) return cells[column - 1] ? [result(cells[column - 1], column - 1)] : null;
  return cells.map(result);
}

/** Is a bracketed tag dice to roll ("2d6", "1d4+1", "3")? @param {string} tag */
const isDice = (tag) => /^[\s\d+\-*/()dD%]+$/.test(tag) && /\d/.test(tag) && !/[+\-*/]\s*$/.test(tag);

/**
 * Rolls a table and whatever its results lead to.
 * @param {Record<string, unknown>} data the table record's data
 * @param {{
 *   name?: string;
 *   roll: (formula: string) => { total: number };
 *   find?: (link: { name?: string; class?: string; recordname?: string }) => { name: string; data: Record<string, unknown> } | null;
 *   column?: number | string;
 *   dice?: string;
 *   secret?: boolean;
 * }} options
 * @returns {TableRoll}
 */
export function rollTable(data, options) {
  const budget = { rolls: 0 };
  return rollOne(data, options.name ?? String(data.name ?? "Table"), options, budget, 0, options.dice, columnOf(data, options.column));
}

/**
 * @param {Record<string, unknown>} data @param {string} name @param {Parameters<typeof rollTable>[1]} options
 * @param {{ rolls: number }} budget @param {number} depth @param {string | undefined} dice @param {number} column
 * @returns {TableRoll}
 */
function rollOne(data, name, options, budget, depth, dice, column) {
  budget.rolls += 1;
  const formula = String(dice ?? "").trim() || tableFormula(data);
  const rolled = options.roll(formula);
  const total = rolled.total;
  const secret = Boolean(options.secret) || Number(data.hiderollresults) === 1;
  const found = resultsAt(data, total, column) ?? [];
  /** @type {TableRoll[]} */
  const nested = [];
  const results = found.map((result) => {
    /** @type {number[]} */
    const times = [];
    /** @type {{ name?: string; class?: string; recordname?: string }[]} */
    const tables = [];
    if (result.link && /^tables?$/.test(String(result.link.class))) tables.push(result.link);
    const text = result.text.replace(/\[([^\]]+)\]/g, (whole, tag) => {
      const repeat = /x$/i.test(tag.trim());
      const formulaIn = repeat ? tag.trim().slice(0, -1) : tag;
      if (isDice(formulaIn)) {
        if (budget.rolls >= MAX_ROLLS) return whole;
        budget.rolls += 1;
        const value = options.roll(formulaIn.replace(/\s+/g, "")).total;
        if (repeat) {
          times.push(value);
          return `[${value}x]`;
        }
        return String(value);
      }
      if (options.find?.({ name: tag.trim() })) tables.push({ name: tag.trim() });
      return whole;
    });
    tables.forEach((link, index) => {
      const target = depth + 1 < MAX_DEPTH ? options.find?.(link) : null;
      if (!target) return;
      for (let n = 0; n < Math.max(1, Math.min(20, times[index] ?? 1)) && budget.rolls < MAX_ROLLS; n++) nested.push(rollOne(target.data, target.name, { ...options, secret }, budget, depth + 1, undefined, 0));
    });
    return { ...result, text, link: result.link && !/^tables?$/.test(String(result.link.class)) ? result.link : null };
  });
  return { name, total, formula, secret, results, nested, rolled };
}

/** Every roll's results, nested ones too, in order. @param {TableRoll} roll @returns {(TableResult & { table: string })[]} */
export function flatResults(roll) {
  return [...roll.results.map((result) => ({ ...result, table: roll.name })), ...roll.nested.flatMap(flatResults)];
}

/** One line of a roll's results, for chat. @param {TableRoll} roll */
export function resultWords(roll) {
  const words = roll.results.map((result) => (result.label && roll.results.length > 1 ? `${result.label} = ${result.text}` : result.text)).filter(Boolean);
  return words.join(" · ") || "(no row)";
}

/**
 * FG's Import Table: pasted text as a table's rows. simple: one row a line,
 * "1-3 words" or "4 words" or just words (numbered by line), columns apart by
 * two spaces or more; delimited: comma, pipe, colon or semicolon, quotes
 * keep a delimiter in, the first row the headers, the first column the
 * ranges, as asked.
 * @param {string} text
 * @param {{ delimiter?: "," | "|" | ":" | ";" | ""; header?: boolean; ranges?: boolean }} [how]
 */
export function parseTableText(text, how = {}) {
  const lines = String(text ?? "")
    .replace(/[–—]/g, "-")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  /** @type {Record<string, unknown>} */
  const data = { tablerows: {} };
  /** @type {string[]} */
  let headers = [];
  /** @type {{ from: number; to: number; cells: string[] }[]} */
  const rows = [];
  const delimiter = how.delimiter ?? "";
  lines.forEach((line, index) => {
    if (delimiter) {
      const cells = splitDelimited(line, delimiter);
      if (how.header && index === 0) {
        headers = how.ranges ? cells.slice(1) : cells;
        return;
      }
      let range = null;
      if (how.ranges && cells.length) range = /^(\d+)\.?\s*(?:-\s*(\d+)\.?)?$/.exec(cells.shift() ?? "");
      const from = range ? Number(range[1]) : rows.length + 1;
      rows.push({ from, to: range?.[2] ? Number(range[2]) : from, cells });
      return;
    }
    const match = /^\s*(\d+)\.?\s*-\s*(\d+)\.?\s+(.*)$/.exec(line) ?? /^\s*(\d+)\.?\s+(.*)$/.exec(line);
    const from = match ? Number(match[1]) : index + 1;
    const to = match && match.length === 4 ? Number(match[2]) : from;
    const rest = match ? match[match.length - 1] : line;
    rows.push({ from, to, cells: rest.split(/\s{2,}|\t/).map((cell) => cell.trim()).filter(Boolean) });
  });
  const columns = Math.max(1, headers.length, ...rows.map((row) => row.cells.length));
  headers.forEach((label, index) => (data[`labelcol${index + 1}`] = label));
  data.resultscols = columns;
  const tablerows = /** @type {Record<string, unknown>} */ (data.tablerows);
  rows.forEach((row, index) => {
    /** @type {Record<string, { result: string }>} */
    const results = {};
    row.cells.forEach((cell, at) => (results[`id-${String(at + 1).padStart(5, "0")}`] = { result: cell }));
    tablerows[`id-${String(index + 1).padStart(5, "0")}`] = { fromrange: row.from, torange: row.to, results };
  });
  return data;
}
/** @param {string} line @param {string} delimiter */
function splitDelimited(line, delimiter) {
  /** @type {string[]} */
  const out = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      out.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  out.push(cell.trim());
  return out;
}
