import { createContext, useContext } from "react";
import type { Session, TableRecord } from "../../session/useSession";
import { at, num, rows, type Row } from "../sheet/context";

// What every wizard part is given: the spec the wizard builds (one object,
// sent to build-character at the end), the host's dice, and the campaign's
// records (the choices and the roll tables).
export interface WizardContext {
  session: Session;
  spec: Row;
  get: (path: string) => unknown;
  // Several top-level paths at once (a choice and what it clears), or values worked out from the spec as it is then.
  set: (values: Record<string, unknown> | ((now: Row) => Record<string, unknown>)) => void;
  busy: boolean;
  // One host roll: its total, or null (the problem is shown).
  roll: (formula: string, label: string) => Promise<number | null>;
  // Several host rolls in one go (STR, DEX, WIL), busy throughout.
  many: (work: (roll: (formula: string, label: string) => Promise<number>) => Promise<void>) => Promise<void>;
  // A roll table's row for a result ("" when there is none).
  lookup: (table: string, roll: number) => string;
  // The records of a type, by name.
  recordsOf: (type: string) => TableRecord[];
  // The record a choose-record part chose (its `into`).
  chosen: (into: string) => TableRecord | undefined;
  // What each shop sells (by its `into`), worked out once per change of the records.
  wares: Record<string, { name: string; price: number; kind: string }[]>;
}
export const WizardCtx = createContext<WizardContext | null>(null);
export function useWizard(): WizardContext {
  const context = useContext(WizardCtx);
  if (!context) throw new Error("A wizard part outside a wizard.");
  return context;
}

// A record's list: a comma-separated text ("names"), or rows with a text each ("gear").
export const listOf = (value: unknown): string[] =>
  typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : rows(value).map(([, line]) => String(line.text ?? ""));
// A record's roll tables: each a name and its rows (from-to: text).
export type RollTable = { name: string; rows: { from: number; to: number; text: string }[] };
export const tableRows = (node: unknown) => rows(node).map(([, row]) => ({ from: num(row.from), to: num(row.to), text: String(row.text ?? "") }));
export const tablesOf = (record: TableRecord | undefined, path: string): RollTable[] =>
  record ? rows(at(record.data, path)).map(([, table]) => ({ name: String(table.name ?? ""), rows: tableRows(table.rows) })) : [];
export const rowFor = (table: RollTable, roll: unknown) => table.rows.find((item) => num(roll) >= item.from && num(roll) <= item.to);
