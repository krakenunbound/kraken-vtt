import { createContext, useContext } from "react";
import type { Session, TableRecord } from "../../session/useSession";
import type { ActionCall, Cond, Text } from "../../../shared/rulesets/types";

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
}
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
const look = (scope: Scope, path: string): unknown => {
  if (scope.extra && path in scope.extra) return scope.extra[path];
  if (scope.row) {
    const found = at(scope.row, path);
    if (found !== undefined) return found;
  }
  return at(scope.data, path);
};
const present = (value: unknown) => value !== undefined && value !== null && value !== "" && value !== false && value !== 0;
// "{a.b}" filled in; "[ · coin {slots.coins}]" kept only when every value inside is there (not empty, not 0).
// A placeholder may hold another: "{attributes.{key}.score}" (the innermost first).
export function fill(template: string, scope: Scope): string {
  let text = template;
  // The row's key and the extras go in first, so a path can be built from them.
  if (scope.extra) for (let pass = 0; pass < 2 && /\{[^{}]+\}[^{}]*\}/.test(text); pass++) text = text.replace(/\{([^{}]+)\}(?=[^{}]*\})/g, (whole, path: string) => (scope.extra && path in scope.extra ? String(scope.extra[path]) : whole));
  const kept = text.replace(/\[([^\]]*)\]/g, (_, inner: string) => ([...inner.matchAll(/\{([^{}]+)\}/g)].every((match) => present(look(scope, match[1]))) ? inner : ""));
  return kept.replace(/\{([^{}]+)\}/g, (_, path: string) => String(look(scope, path) ?? ""));
}
// A text that may depend on the row or a sheet modifier: { by: "kind", map: { relic: "Use" }, else: "Cast" }.
export function textOf(text: Text | undefined, scope: Scope, modifiers: Record<string, unknown>): string {
  if (text === undefined) return "";
  if (typeof text === "string") return fill(text, scope);
  const key = text.by.startsWith("modifier:") ? String(modifiers[text.by.slice(9)] ?? "") : String(look(scope, text.by) ?? "");
  return fill(text.map[key] ?? text.else, scope);
}
// A declarative condition on the sheet (a row's values, who is looking).
export function holds(cond: Cond | undefined, scope: Scope, context: Pick<SheetContext, "gm" | "editable">): boolean {
  if (!cond) return true;
  if ("all" in cond) return cond.all.every((item) => holds(item, scope, context));
  if ("any" in cond) return cond.any.some((item) => holds(item, scope, context));
  if ("not" in cond) return !holds(cond.not, scope, context);
  if ("gm" in cond) return context.gm;
  if ("editable" in cond) return context.editable;
  if ("is" in cond) return cond.is.values.includes(String(look(scope, cond.is.path) ?? ""));
  if ("positive" in cond) return num(look(scope, cond.positive)) > 0;
  if ("has" in cond) return present(look(scope, cond.has));
  if ("defined" in cond) return look(scope, cond.defined) !== undefined;
  return false;
}
