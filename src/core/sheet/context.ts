import { createContext, useContext } from "react";
import type { Session, TableRecord } from "../../session/useSession";
import type { ActionCall, Cond, Nodes, Text } from "../../../shared/rulesets/types";

// What every core part is given (FG: the window's database node; Foundry:
// the sheet's document): the record, who may type, and the two ways a part
// changes it, an edit of a path (the host's whitelist) or a ruleset action.
export type Row = Record<string, unknown>;
export interface SheetContext {
  record: TableRecord;
  session: Session;
  data: Row;
  editable: boolean;
  gm: boolean;
  change: (path: string, value: unknown) => void;
  // An action: the row's key and a field's value go in as the call's key / value arguments.
  act: (call: ActionCall, given?: { key?: string; value?: unknown }) => void;
  // Sheet-wide choices a part's buttons read (Cairn's "In danger", its attack mode): kept while the sheet is open.
  modifiers: Record<string, unknown>;
  setModifier: (key: string, value: unknown) => void;
  // The names of what this character targets on the tracker.
  targets: string[];
  // The game's (or its variant's) features, for a part's { feature } condition.
  features: string[];
  // The game's formatters (src/rulesets/parts.tsx FORMATS), for a field shown through one.
  formats: Record<string, Format>;
}
// A game's formatter: words for a row (or the record), given the row's key and the record's data.
export type Format = (row: Row, key?: string, data?: Row) => string;
// The formatters a text's { format } names: the rendered sheet's game's (SheetRenderer sets them).
let formatters: Record<string, Format> = {};
export const setFormatters = (given: Record<string, Format>) => {
  formatters = given;
};
export const SheetCtx = createContext<SheetContext | null>(null);
export function useSheet(): SheetContext {
  const context = useContext(SheetCtx);
  if (!context) throw new Error("A core part outside a sheet.");
  return context;
}

export const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
export const rows = (node: unknown): [string, Row][] => (node && typeof node === "object" ? Object.entries(node as Row).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : []);
// A path's value: "hp.total" in the record's data, "{key}" filled in first.
export const at = (node: unknown, path: string): unknown => path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Row)[key] : undefined), node);

// A scope a template reads from: the row first (in a list), then the extras ({key}, {label}), then the record's data.
export type Scope = { row?: Row; extra?: Record<string, unknown>; data: Row };
const look = (scope: Scope, given: string): unknown => {
  // A path built from the row's key or the extras ("characteristics.{key}.now").
  const path = scope.extra && given.includes("{") ? given.replace(/\{([^{}]+)\}/g, (whole, name: string) => (scope.extra && name in scope.extra ? String(scope.extra[name]) : whole)) : given;
  if (scope.extra && path in scope.extra) return scope.extra[path];
  if (scope.row) {
    const found = at(scope.row, path);
    if (found !== undefined) return found;
  }
  return at(scope.data, path);
};
const present = (value: unknown) => value !== undefined && value !== null && value !== "" && value !== false && value !== 0;
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const titledWord = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
// A placeholder's text: "{path}", "{path|signed}" (+2, -1), "{path|0}" (the value, or 0 when it has none).
// Filters run in order: signed (a list: each), titled, lower, upper, cut:N (the first N letters), join:SEP (a list), sum:FIELD (a list's rows' FIELD
// added up), nz:X (X for 0 or none), anything else the value's default ("{size|medium|titled}").
function valueText(scope: Scope, expression: string): string {
  const [path, ...filters] = expression.split("|");
  if (path.startsWith("?")) return "";
  let value: unknown = look(scope, path);
  for (const filter of filters) {
    if (filter === "signed") value = Array.isArray(value) ? value.map((item) => signed(num(item))) : signed(num(value));
    else if (filter === "titled") value = titledWord(String(value ?? ""));
    else if (filter === "lower") value = String(value ?? "").toLowerCase();
    else if (filter === "upper") value = String(value ?? "").toUpperCase();
    else if (filter.startsWith("cut:")) value = String(value ?? "").slice(0, Number(filter.slice(4)));
    else if (filter.startsWith("join:")) value = Array.isArray(value) ? value.map(String).join(filter.slice(5)) : value;
    else if (filter.startsWith("sum:")) value = rows(value).reduce((sum, [, row]) => sum + num(row[filter.slice(4)]), 0);
    else if (filter.startsWith("nz:")) value = num(value) ? num(value) : filter.slice(3);
    else if (value === undefined || value === null || value === "") value = filter;
  }
  return String(value ?? "");
}
// "{a.b}" filled in; "[ · coin {slots.coins}]" kept only when every value inside is there (not empty, not 0);
// "{?path}" inside one is only that test ("[ Sneak attack...{?sneakattack}]").
// A placeholder may hold another: "{attributes.{key}.score}" (the innermost first).
export function fill(template: string, scope: Scope): string {
  let text = template;
  // The row's key and the extras go in first, so a path can be built from them.
  if (scope.extra) for (let pass = 0; pass < 2 && /\{[^{}]+\}[^{}]*\}/.test(text); pass++) text = text.replace(/\{([^{}]+)\}(?=[^{}]*\})/g, (whole, path: string) => (scope.extra && path in scope.extra ? String(scope.extra[path]) : whole));
  const kept = text.replace(/\[([^\]]*)\]/g, (_, inner: string) => ([...inner.matchAll(/\{\??([^{}|]+)(?:\|[^{}]*)?\}/g)].every((match) => present(look(scope, match[1]))) ? inner : ""));
  return kept.replace(/\{([^{}]+)\}/g, (_, expression: string) => valueText(scope, expression));
}
// A text that may depend on the row or a sheet modifier: { by: "kind", map: { relic: "Use" }, else: "Cast" }.
export function textOf(text: Text | undefined, scope: Scope, modifiers: Record<string, unknown>): string {
  if (text === undefined) return "";
  if (typeof text === "string") return fill(text, scope);
  if ("if" in text) return fill(holds(text.if, scope, { gm: false, editable: false }) ? text.then : text.else, scope);
  if ("format" in text) return formatters[text.format]?.(scope.row ?? scope.data, scope.extra?.key === undefined ? undefined : String(scope.extra.key), scope.data) ?? "";
  const key = text.by.startsWith("modifier:") ? String(modifiers[text.by.slice(9)] ?? "") : String(look(scope, text.by) ?? "");
  return fill(text.map[key] ?? text.else, scope);
}
// A declarative condition on the sheet (a row's values, who is looking).
// Texts as text nodes: a list is one node each (as JSX writes "THAC0 {thaco}: ..."), one text is one node.
export function nodesOf(text: Nodes | undefined, scope: Scope, modifiers: Record<string, unknown>): string | string[] {
  return Array.isArray(text) ? text.map((item) => textOf(item, scope, modifiers)) : textOf(text, scope, modifiers);
}
export function holds(cond: Cond | undefined, scope: Scope, context: Pick<SheetContext, "gm" | "editable"> & { features?: string[] }): boolean {
  if (!cond) return true;
  if ("feature" in cond) return Boolean(context.features?.includes(cond.feature));
  if ("length" in cond) {
    const list = look(scope, cond.length.path);
    return Array.isArray(list) && list.length >= cond.length.min;
  }
  if ("some" in cond) return rows(look(scope, cond.some.path)).some(([, row]) => holds(cond.some.cond, { row, data: {} }, context));
  if ("isNull" in cond) {
    const value = look(scope, cond.isNull);
    return value === null || value === undefined;
  }
  if ("below" in cond) return num(look(scope, cond.below.path)) < cond.below.value;
  if ("less" in cond) return num(look(scope, cond.less.path)) < num(look(scope, cond.less.than));
  if ("zero" in cond) return num(look(scope, cond.zero.path)) + (cond.zero.plus ? num(look(scope, cond.zero.plus)) : 0) - num(look(scope, cond.zero.minus)) <= 0;
  if ("all" in cond) return cond.all.every((item) => holds(item, scope, context));
  if ("any" in cond) return cond.any.some((item) => holds(item, scope, context));
  if ("not" in cond) return !holds(cond.not, scope, context);
  if ("gm" in cond) return context.gm;
  if ("editable" in cond) return context.editable;
  if ("is" in cond) return cond.is.values.includes(String(look(scope, cond.is.path) ?? ""));
  if ("positive" in cond) return num(look(scope, cond.positive)) > 0;
  if ("has" in cond) return present(look(scope, cond.has));
  if ("defined" in cond) return look(scope, cond.defined) !== undefined;
  if ("rows" in cond) return rows(look(scope, cond.rows)).length > 0;
  return false;
}
