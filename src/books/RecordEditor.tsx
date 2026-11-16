import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { QuickSlot, Session, TableRecord, Visibility } from "../session/useSession";
import { Field } from "../core/fields/Field";
import { RichText } from "../core/fields/RichText";
import { Icon } from "../ui/icons";
import { hasLink, LINK_ICON, linkFrom, slotDrag, useOpenLink } from "../ui/QuickSlots";
import { useWindows } from "../ui/Windows";
import { manifestOf } from "../rulesets/index";
import { FormattedText } from "./Records";
import { useContextMenu, type MenuItem } from "./Books";

// Editing the campaign's records, as FG's record windows do once their lock
// is open: the GM's (or the owner's) pencil in the window's header, then the
// record's fields (the game's manifest names them, records.<type>.fields;
// else the fields it and its kind's other records carry), its text in the
// core's editor. The kinds the core knows have their own window: a random
// table (rolled from any window, its rows and columns edited), a story with
// its pages, an encounter, a treasure parcel, a quest. FG's right-click
// Duplicate and Delete (with Undo), Copy to campaign for a book's record,
// and the eye's menu: share with everyone, with some players, or none.

// --- Shared with whom -----------------------------------------------------------

export const isShared = (record: TableRecord) => record.visibility === "all";
export const sharedWith = (record: TableRecord): string[] => (Array.isArray(record.visibility) ? record.visibility : []);
// The players the GM can share with: those seated, those holding a character, those it is shared with now.
export function playerNames(session: Session, record?: TableRecord) {
  const names = new Map<string, string>();
  const add = (name: string) => name && !names.has(name.toLowerCase()) && names.set(name.toLowerCase(), name);
  for (const seat of session.players) if (seat.role === "player") add(seat.name);
  for (const entry of session.roster) add(entry.owner);
  if (record) for (const name of sharedWith(record)) add(name);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
export const shareWords = (record: TableRecord) =>
  isShared(record) ? "Shared with everyone" : sharedWith(record).length ? `Shared with ${sharedWith(record).join(", ")}` : record.visibility === "owner" && record.owner ? `${record.owner}'s` : "The GM's alone";
export function shareRecord(session: Session, record: TableRecord, visibility: Visibility) {
  return session.op({ op: "update", id: record.id, patch: { visibility } });
}
// One more player for a record (a row dropped on their portrait, FG's share with one).
export function shareWithPlayer(session: Session, record: TableRecord, name: string) {
  if (isShared(record) || sharedWith(record).some((item) => item.toLowerCase() === name.toLowerCase())) return Promise.resolve(record.id);
  return shareRecord(session, record, [...sharedWith(record), name]);
}

// A player's portrait as a drop place (the GM's): a record, a note or a story
// dragged onto it is shared with that player; a picture is shown to them.
export function shareDrop(session: Session, player: string) {
  return {
    onDragOver: (event: React.DragEvent) => {
      if (!hasLink(event)) return;
      event.preventDefault();
      event.currentTarget.classList.add("share-drop");
    },
    onDragLeave: (event: React.DragEvent) => event.currentTarget.classList.remove("share-drop"),
    onDrop: (event: React.DragEvent) => {
      event.currentTarget.classList.remove("share-drop");
      const link = linkFrom(event);
      if (!link) return;
      event.preventDefault();
      if (link.kind === "picture") return session.showImage(link.book, link.file, link.label, [player]);
      const record = link.kind === "record" || link.kind === "note" ? session.records[link.record] : null;
      if (record) void shareWithPlayer(session, record, player);
    },
  };
}

// The eye (FG's sharing icon) and its menu: everyone, each player, the GM alone.
export function ShareMenu({ session, record, words = false }: { session: Session; record: TableRecord; words?: boolean }) {
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const names = playerNames(session, record);
  const some = sharedWith(record);
  const on = isShared(record) || some.length > 0;
  const toggle = (name: string) => {
    const has = some.some((item) => item.toLowerCase() === name.toLowerCase());
    const next = has ? some.filter((item) => item.toLowerCase() !== name.toLowerCase()) : [...some, name];
    void shareRecord(session, record, next.length ? next : "gm");
  };
  return (
    <>
      <button
        type="button"
        className={isShared(record) ? "records-share on" : some.length ? "records-share some" : "records-share"}
        data-action="record-share"
        aria-pressed={on}
        aria-haspopup="menu"
        title={`${shareWords(record)}: click to choose who sees it (FG's Share)`}
        {...({ popovertarget: menuId } as object)}
      >
        <Icon name={on ? "eye" : "eye-off"} size={15} />
        {words ? ` ${isShared(record) ? "Shared" : some.length ? `With ${some.join(", ")}` : "Share with the players"}` : null}
      </button>
      <div
        ref={menu}
        id={menuId}
        className="context-menu share-menu"
        {...({ popover: "auto" } as object)}
        role="menu"
        aria-label={`Share ${record.name}`}
        data-share-menu={record.id}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
          const at = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }}
      >
        <button type="button" role="menuitemradio" aria-checked={isShared(record)} data-share="all" onClick={() => (void shareRecord(session, record, "all"), menu.current?.hidePopover())}>
          <Icon name="eye" size={14} /> Everyone
        </button>
        {names.length ? <hr /> : null}
        {names.map((name) => (
          <button key={name} type="button" role="menuitemcheckbox" aria-checked={some.some((item) => item.toLowerCase() === name.toLowerCase())} data-share-player={name} onClick={() => toggle(name)}>
            <Icon name="character" size={14} /> {name}
          </button>
        ))}
        <hr />
        <button type="button" role="menuitemradio" aria-checked={!on} data-share="gm" onClick={() => (void shareRecord(session, record, "gm"), menu.current?.hidePopover())}>
          <Icon name="eye-off" size={14} /> GM only
        </button>
      </div>
    </>
  );
}

// --- Copies, deleting, undo -----------------------------------------------------

// A record deleted a moment ago, its Undo shown at the bottom of the desktop.
const undo = (() => {
  let last: { record: TableRecord; at: number } | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => last,
    set(value: typeof last) {
      last = value;
      for (const listener of listeners) listener();
    },
  };
})();
// Records to open with their lock open (one just made with New or Duplicate).
export const openUnlocked = new Set<string>();

export function useRecordActions(session: Session) {
  const windows = useWindows();
  const open = (id: string, name: string) => {
    openUnlocked.add(id);
    windows.open("record", name, id);
  };
  const duplicate = async (record: TableRecord) => {
    const made = await session.content<TableRecord>("record-copy", { id: record.id });
    open(made.id, made.name);
    return made;
  };
  // A book's record (read from its page, or an active book's) as the campaign's own.
  const copyToCampaign = async (record: TableRecord, book?: string) => {
    const path = typeof record.data.fgPath === "string" ? record.data.fgPath : "";
    const made = await session.content<TableRecord>("record-copy", session.records[record.id] ? { id: record.id, name: record.name } : { book, path });
    open(made.id, made.name);
    return made;
  };
  const remove = async (record: TableRecord) => {
    await session.op({ op: "delete", id: record.id });
    windows.close(`record:${record.id}`);
    undo.set({ record, at: Date.now() });
  };
  const items = (record: TableRecord): MenuItem[] => [
    { label: "Open", icon: "open", run: () => windows.open("record", record.name, record.id) },
    ...(record.source ? [{ label: "Copy to campaign", icon: "import", run: () => void copyToCampaign(record) }] : [{ label: "Duplicate", icon: "plus", run: () => void duplicate(record) }]),
    ...(record.source ? [] : [{ label: "Delete", icon: "trash", run: () => void remove(record) }]),
  ];
  return { open, duplicate, copyToCampaign, remove, items };
}

// The Undo for the last delete, for a few seconds (the GM's desktop).
export function UndoToast({ session }: { session: Session }) {
  const last = useSyncExternalStore(undo.subscribe, undo.get);
  useEffect(() => {
    if (!last) return;
    const timer = setTimeout(() => undo.set(null), 8000);
    return () => clearTimeout(timer);
  }, [last]);
  if (!last) return null;
  const { record } = last;
  return (
    <div className="undo-toast" role="status" data-undo={record.id}>
      <span>{record.name} deleted.</span>
      <button
        type="button"
        data-action="record-undo"
        onClick={() => {
          undo.set(null);
          void session.op({ op: "create", input: { id: record.id, type: record.type, name: record.name, owner: record.owner, visibility: record.visibility, data: record.data, ...(record.source ? { source: record.source } : {}) } as never });
        }}
      >
        Undo
      </button>
    </div>
  );
}

// --- The fields --------------------------------------------------------------------

const BOOKKEEPING = new Set(["name", "fgPath", "fgCategory", "version", "picture", "token", "locked", "public", "ccgen", "token3Dflat", "isidentified", "nonid_name", "nonid_notes", "text", "tablerows", "blocks", "npclist", "itemlist", "coinlist"]);
// A short key is an abbreviation (hp, ac, str): shown in capitals.
const labelOf = (key: string) => (key.length <= 3 ? key.toUpperCase() : key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()));
type FieldDef = { path: string; label: string; kind: "text" | "number" | "textarea" | "select"; options?: { value: string; label: string }[] };
// The fields an editor shows: the game's manifest's for this kind, else the record's own and its kind's.
function fieldsOf(session: Session, record: TableRecord): FieldDef[] {
  const declared = manifestOf(session.ruleset).records?.[record.type]?.fields;
  if (declared?.length) return declared.map((field) => ({ path: field.path, label: typeof field.label === "string" ? field.label : labelOf(field.path), kind: field.kind === "number" || field.kind === "textarea" || field.kind === "select" ? field.kind : "text", options: field.options }));
  const seen = new Map<string, { count: number; number: boolean }>();
  const look = (data: Record<string, unknown>, weight: number) => {
    for (const [key, value] of Object.entries(data)) {
      if (BOOKKEEPING.has(key) || (typeof value !== "string" && typeof value !== "number")) continue;
      if (typeof value === "string" && /<\/?(p|h|list|table|frame)\b/.test(value)) continue;
      const was = seen.get(key) ?? { count: 0, number: typeof value === "number" };
      seen.set(key, { count: was.count + weight, number: was.number && typeof value === "number" });
    }
  };
  look(record.data ?? {}, 1000);
  Object.values(session.records)
    .filter((other) => other.type === record.type && other.id !== record.id)
    .slice(0, 60)
    .forEach((other) => look(other.data ?? {}, 1));
  return [...seen]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 24)
    .map(([path, info]) => ({ path, label: labelOf(path), kind: info.number ? "number" : "text" }));
}
const valueAt = (data: Record<string, unknown>, path: string) => path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), data);
const patchAt = (path: string, value: unknown) => path.split(".").reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Record<string, unknown>;

// The core's record editor: the name, the fields, a field of the GM's own, the text.
export function RecordFields({ session, record }: { session: Session; record: TableRecord }) {
  const openLink = useOpenLink(session);
  const [extra, setExtra] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const fields = fieldsOf(session, record);
  const save = (path: string, value: unknown) => void session.op({ op: "update", id: record.id, patch: { data: patchAt(path, value) } });
  const all = [...fields, ...extra.filter((path) => !fields.some((field) => field.path === path)).map((path) => ({ path, label: labelOf(path), kind: "text" as const }))];
  const text = typeof record.data.text === "string" ? record.data.text : "";
  return (
    <div className="record-editor" data-record-editor={record.id}>
      <dl className="record-fields editing">
        <dt>Name</dt>
        <dd>
          <Field value={record.name} editable label="Name" onSave={(value) => void session.op({ op: "update", id: record.id, patch: { name: value } })} />
        </dd>
        {all.map((field) => (
          <FieldRow key={field.path} field={field} value={valueAt(record.data, field.path)} onSave={(value) => save(field.path, value)} />
        ))}
      </dl>
      <form
        className="records-new cc-inline"
        onSubmit={(event) => {
          event.preventDefault();
          const key = newField.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
          if (key && !BOOKKEEPING.has(key)) setExtra([...extra, key]);
          setNewField("");
        }}
      >
        <input value={newField} onChange={(event) => setNewField(event.target.value)} placeholder="Another field (its name)" aria-label="Another field's name" />
        <button type="submit" data-action="record-add-field" disabled={!newField.trim()} title="Add a field to this record">
          <Icon name="plus" size={14} /> Field
        </button>
      </form>
      <h4>Description</h4>
      <RichText value={text} editable label="Description" onSave={(value) => save("text", value)} onOpen={openLink} read={<FormattedText text={text} onOpen={openLink} />} />
    </div>
  );
}
function FieldRow({ field, value, onSave }: { field: FieldDef; value: unknown; onSave: (value: unknown) => void }) {
  return (
    <>
      <dt>{field.label}</dt>
      <dd>
        {field.kind === "select" && field.options ? (
          <select aria-label={field.label} value={String(value ?? "")} onChange={(event) => onSave(event.target.value)}>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <Field value={value} editable label={field.label} number={field.kind === "number"} area={field.kind === "textarea"} onSave={(text) => onSave(field.kind === "number" ? Number(text) || 0 : text)} />
        )}
      </dd>
    </>
  );
}

// FG's Identified toggle on an item (the GM's), with what the players see instead.
export function IdentifyBar({ session, record }: { session: Session; record: TableRecord }) {
  const identified = !(record.data.isidentified === 0 || record.data.isidentified === "0");
  return (
    <div className="identify-bar" data-identify={identified ? "on" : "off"}>
      <label title="FG's Identified: unidentified, the players see only its unidentified name and notes">
        <input type="checkbox" data-action="record-identified" checked={identified} onChange={(event) => void session.content("identify", { id: record.id, on: event.target.checked })} /> Identified
      </label>
      {identified ? null : (
        <>
          <Field value={record.data.nonid_name ?? ""} editable label="Unidentified name" onSave={(value) => void session.content("identify", { id: record.id, on: false, name: value })} />
          <Field value={record.data.nonid_notes ?? ""} editable area label="Unidentified notes" onSave={(value) => void session.content("identify", { id: record.id, on: false, notes: value })} />
        </>
      )}
    </div>
  );
}

// --- Random tables -----------------------------------------------------------------

// A result's link (FG's resultlink: a record, or another table) is kept with its words through every edit.
type ResultLink = { class: string; recordname: string };
type Row = { from: number; to: number; results: string[]; links: (ResultLink | null)[] };
function rowsOf(data: Record<string, unknown>): Row[] {
  const columns = Math.max(1, Number(data.resultscols) || 1);
  return Object.entries((data.tablerows ?? {}) as Record<string, { fromrange?: number; torange?: number; results?: Record<string, { result?: string; resultlink?: ResultLink }> }>)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, row]) => {
      const keys = Object.keys(row.results ?? {}).sort();
      const at = (index: number) => row.results?.[keys[index]];
      return {
        from: Number(row.fromrange) || 0,
        to: Number(row.torange) || Number(row.fromrange) || 0,
        results: Array.from({ length: columns }, (_, index) => String(at(index)?.result ?? "")),
        links: Array.from({ length: columns }, (_, index) => (at(index)?.resultlink?.recordname ? at(index)!.resultlink! : null)),
      };
    });
}
const labelsOf = (data: Record<string, unknown>) => Array.from({ length: Math.max(1, Number(data.resultscols) || 1) }, (_, index) => String(data[`labelcol${index + 1}`] ?? (index === 0 ? "Result" : "")));

// FG's table roll from its window, on the host's dice: a column, the GM's eyes only.
export function TableRollBar({ session, record, book }: { session: Session; record: TableRecord; book?: string }) {
  const gm = session.role === "dm";
  const labels = labelsOf(record.data);
  const [column, setColumn] = useState("");
  const [hide, setHide] = useState(Number(record.data.hiderollresults) === 1);
  const [last, setLast] = useState("");
  const inCampaign = Boolean(session.records[record.id]);
  const roll = () =>
    session
      .content<{ result: string; roll: number }>("table-roll", { action: "roll", ...(inCampaign ? { id: record.id } : { data: record.data, name: record.name, book }), column, hide })
      .then((result) => setLast(`${result.roll}: ${result.result}`))
      .catch((error) => setLast(error instanceof Error ? error.message : "Could not roll that."));
  return (
    <div className="table-roll-bar" data-table-roll={record.id}>
      <button type="button" className="primary" data-action="table-roll" title="Roll on this table (the result goes to chat)" onClick={() => void roll()}>
        <Icon name="tower" size={15} /> Roll
      </button>
      {labels.length > 1 ? (
        <select aria-label="Column" value={column} onChange={(event) => setColumn(event.target.value)}>
          <option value="">Every column</option>
          {labels.map((label, index) => (
            <option key={index} value={String(index + 1)}>
              {label || `Column ${index + 1}`}
            </option>
          ))}
        </select>
      ) : null}
      {gm ? (
        <label title="The roll and its result for the GM alone (FG's /rollon -hide)">
          <input type="checkbox" data-action="table-hide" checked={hide} onChange={(event) => setHide(event.target.checked)} /> GM only
        </label>
      ) : null}
      {last ? <small className="hint" role="status">{last}</small> : null}
    </div>
  );
}

// FG's table window, unlocked: the die, the modifier, the columns and their labels, every row's range and results.
export function TableEditor({ session, record }: { session: Session; record: TableRecord }) {
  const rows = rowsOf(record.data);
  const labels = labelsOf(record.data);
  const edit = (change: Record<string, unknown>) => void session.content("table-roll", { action: "edit", id: record.id, ...change });
  const wire = (next: Row[]) => next.map((row) => ({ from: row.from, to: row.to, results: row.results.map((result, column) => ({ result, ...(row.links[column] ? { resultlink: row.links[column] } : {}) })) }));
  const setRows = (next: Row[]) => edit({ rows: wire(next) });
  const resize = (count: number) => rows.map((row) => ({ ...row, results: Array.from({ length: count }, (_, index) => row.results[index] ?? ""), links: Array.from({ length: count }, (_, index) => row.links[index] ?? null) }));
  // A record or a table dropped on a result: its link (FG's resultlink), rolled or carried by the chat card.
  const linkCell = (index: number, column: number, link: QuickSlot) => {
    const target = link.kind === "record" ? session.records[link.record] : null;
    if (!target) return;
    setRows(rows.map((item, at) => (at === index ? { ...item, links: item.links.map((cell, c) => (c === column ? { class: target.type, recordname: target.id } : cell)), results: item.results.map((cell, c) => (c === column && !cell ? target.name : cell)) } : item)));
  };
  return (
    <div className="table-editor" data-table-editor={record.id}>
      <div className="cc-inline">
        <label>
          Die <Field value={record.data.dice ?? ""} editable label="Die" onSave={(value) => edit({ dice: value })} />
        </label>
        <label>
          Modifier <Field value={record.data.mod ?? 0} editable number label="Modifier" onSave={(value) => edit({ mod: Number(value) || 0 })} />
        </label>
        <label>
          Columns <Field value={labels.length} editable number label="Columns" onSave={(value) => edit({ resultscols: Math.max(1, Math.min(30, Number(value) || 1)), rows: wire(resize(Math.max(1, Math.min(30, Number(value) || 1)))) })} />
        </label>
        <label title="Its rolls for the GM alone (FG's Hide roll results)">
          <input type="checkbox" checked={Number(record.data.hiderollresults) === 1} onChange={(event) => edit({ hiderollresults: event.target.checked ? 1 : 0 })} /> Hide rolls
        </label>
      </div>
      <table className="record-table editing">
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            {labels.map((label, index) => (
              <th key={index}>
                <Field value={label} editable label={`Column ${index + 1} label`} onSave={(value) => edit({ labels: labels.map((item, at) => (at === index ? value : item)) })} />
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} data-table-row={index}>
              <td>
                <Field value={row.from} editable number label={`Row ${index + 1} from`} onSave={(value) => setRows(rows.map((item, at) => (at === index ? { ...item, from: Number(value) || 0 } : item)))} />
              </td>
              <td>
                <Field value={row.to} editable number label={`Row ${index + 1} to`} onSave={(value) => setRows(rows.map((item, at) => (at === index ? { ...item, to: Number(value) || 0 } : item)))} />
              </td>
              {row.results.map((result, column) => (
                <td
                  key={column}
                  data-table-cell={`${index}-${column}`}
                  title="Drop a record or a table here to link it"
                  onDragOver={(event) => {
                    if (hasLink(event)) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const link = linkFrom(event);
                    if (!link) return;
                    event.preventDefault();
                    linkCell(index, column, link);
                  }}
                >
                  <Field value={result} editable label={`Row ${index + 1} result ${column + 1}`} onSave={(value) => setRows(rows.map((item, at) => (at === index ? { ...item, results: item.results.map((cell, c) => (c === column ? value : cell)) } : item)))} />
                  {row.links[column] ? (
                    <span className="table-cell-link" data-result-link={row.links[column]!.recordname}>
                      <Icon name="shield" size={12} /> {session.records[row.links[column]!.recordname]?.name ?? row.links[column]!.class}
                      <button type="button" className="ghost" aria-label={`Unlink row ${index + 1} result ${column + 1}`} title="Unlink" onClick={() => setRows(rows.map((item, at) => (at === index ? { ...item, links: item.links.map((cell, c) => (c === column ? null : cell)) } : item)))}>
                        ×
                      </button>
                    </span>
                  ) : null}
                </td>
              ))}
              <td>
                <button type="button" className="ghost" aria-label={`Remove row ${index + 1}`} title="Remove this row" onClick={() => setRows(rows.filter((_, at) => at !== index))}>
                  <Icon name="trash" size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        data-action="table-add-row"
        onClick={() => {
          const next = (rows.at(-1)?.to ?? 0) + 1;
          setRows([...rows, { from: next, to: next, results: labels.map(() => ""), links: labels.map(() => null) }]);
        }}
      >
        <Icon name="plus" size={14} /> Row
      </button>
    </div>
  );
}

// FG's Import Table: pasted rows into a new table.
export function TableImport({ session, onMade }: { session: Session; onMade: (record: TableRecord) => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState("");
  const [header, setHeader] = useState(false);
  const [ranges, setRanges] = useState(true);
  const [status, setStatus] = useState("");
  return (
    <details className="table-import">
      <summary>Import a table (paste it)</summary>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="The table's name" aria-label="Imported table's name" />
      <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={"1-2  Goblins\n3  An ogre\n4-6  Nothing"} aria-label="The table, pasted" rows={6} />
      <div className="cc-inline">
        <select aria-label="Data type" value={delimiter} onChange={(event) => setDelimiter(event.target.value)}>
          <option value="">Simple (two spaces between columns)</option>
          <option value=",">Delimited: comma</option>
          <option value="|">Delimited: pipe</option>
          <option value=":">Delimited: colon</option>
          <option value=";">Delimited: semicolon</option>
        </select>
        {delimiter ? (
          <>
            <label>
              <input type="checkbox" checked={header} onChange={(event) => setHeader(event.target.checked)} /> Column headers in the first row
            </label>
            <label>
              <input type="checkbox" checked={ranges} onChange={(event) => setRanges(event.target.checked)} /> Ranges in the first column
            </label>
          </>
        ) : null}
        <button
          type="button"
          data-action="table-import"
          disabled={!text.trim()}
          onClick={() =>
            void session
              .content<TableRecord>("table-roll", { action: "import", name, text, delimiter, header, ranges })
              .then((made) => {
                setText("");
                setName("");
                setStatus("");
                onMade(made);
              })
              .catch((error) => setStatus(error instanceof Error ? error.message : "Could not import that."))
          }
        >
          Import
        </button>
      </div>
      {status ? <p className="hint" role="status">{status}</p> : null}
    </details>
  );
}

// --- Drop places -----------------------------------------------------------------

function DropZone({ accepts, onLink, children, label }: { accepts: (link: QuickSlot) => boolean; onLink: (link: QuickSlot) => void; children: ReactNode; label: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={over ? "record-drop dropping" : "record-drop"}
      data-record-drop={label}
      onDragOver={(event) => {
        if (!hasLink(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const link = linkFrom(event);
        if (!link || !accepts(link)) return;
        event.preventDefault();
        onLink(link);
      }}
    >
      {children}
    </div>
  );
}
const linkRecord = (link: QuickSlot) => (link.kind === "record" || link.kind === "sheet" || link.kind === "note" ? link.record : "");

// --- The story -----------------------------------------------------------------------

type Block = { kind: "text" | "image" | "page"; text?: string; link?: QuickSlot | null };
const blocksOf = (record: TableRecord): Block[] => (Array.isArray(record.data.blocks) ? (record.data.blocks as Block[]) : typeof record.data.text === "string" ? [{ kind: "text", text: record.data.text }] : []);

// A story record (FG's story, with the Story Template's pages): text pages in
// the editor, pictures, book pages; its chapter and its place in it.
export function StoryView({ session, record, editable }: { session: Session; record: TableRecord; editable: boolean }) {
  const openLink = useOpenLink(session);
  const blocks = blocksOf(record);
  const setBlocks = (next: Block[]) => void session.content("story", { action: "set", id: record.id, blocks: next });
  const move = (index: number, by: number) => {
    const next = [...blocks];
    const [block] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, block);
    setBlocks(next);
  };
  return (
    <div className="story-view" data-story-view={record.id}>
      {editable ? (
        <div className="cc-inline">
          <label>
            Chapter <Field value={record.data.chapter ?? ""} editable label="Chapter" onSave={(value) => void session.content("story", { action: "set", id: record.id, chapter: value })} />
          </label>
          <label>
            Order <Field value={record.data.order ?? 0} editable number label="Order" onSave={(value) => void session.content("story", { action: "set", id: record.id, order: Number(value) || 0 })} />
          </label>
        </div>
      ) : record.data.chapter ? (
        <p className="hint">{String(record.data.chapter)}</p>
      ) : null}
      {blocks.map((block, index) => (
        <section key={index} className={`story-block ${block.kind}`} data-story-block={index}>
          {block.kind === "text" ? (
            <RichText value={block.text ?? ""} editable={editable} label={`Page ${index + 1} text`} onSave={(text) => setBlocks(blocks.map((item, at) => (at === index ? { ...item, text } : item)))} onOpen={openLink} read={<FormattedText text={block.text ?? ""} onOpen={openLink} />} />
          ) : block.link ? (
            <figure {...slotDrag(block.link)}>
              {block.link.kind === "picture" ? <img src={session.bookUrl("picture", block.link.book, block.link.file)} alt={block.link.label} loading="lazy" onClick={() => openLink(block.link!)} /> : null}
              <figcaption>
                <button type="button" className="note-chip-open" onClick={() => openLink(block.link!)} title={`Open ${block.link.label}`}>
                  <Icon name={LINK_ICON[block.link.kind] ?? "book"} size={13} /> {block.link.label}
                </button>
              </figcaption>
            </figure>
          ) : null}
          {editable ? (
            <div className="story-block-tools">
              <button type="button" className="ghost" aria-label={`Move page ${index + 1} up`} title="Up" disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" className="ghost" aria-label={`Move page ${index + 1} down`} title="Down" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                ↓
              </button>
              <button type="button" className="ghost" aria-label={`Remove page ${index + 1}`} title="Remove this page" onClick={() => setBlocks(blocks.filter((_, at) => at !== index))}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ) : null}
        </section>
      ))}
      {editable ? (
        <DropZone label="story" accepts={() => true} onLink={(link) => setBlocks([...blocks, link.kind === "picture" ? { kind: "image", link } : link.kind === "book" ? { kind: "page", link } : { kind: "text", text: `<p><link class="kraken" recordname="kraken:${encodeURIComponent(JSON.stringify(link))}">${link.label.replace(/[<>&]/g, "")}</link></p>` }])}>
          <button type="button" data-action="story-add-text" onClick={() => setBlocks([...blocks, { kind: "text", text: "" }])}>
            <Icon name="plus" size={14} /> Text
          </button>
          <span className="hint">or drop a picture, a book page or any link here for a page of its own</span>
        </DropZone>
      ) : null}
    </div>
  );
}

// --- Encounters -----------------------------------------------------------------------

type NpcRow = { name?: string; count?: string | number; faction?: string; unidentified?: string; link?: { recordname?: string } };
export function EncounterView({ session, record, editable }: { session: Session; record: TableRecord; editable: boolean }) {
  const [status, setStatus] = useState("");
  const [xp, setXp] = useState<number | null>(null);
  const rows = Object.entries((record.data.npclist ?? {}) as Record<string, NpcRow>).sort(([a], [b]) => a.localeCompare(b));
  const act = (action: string, more: Record<string, unknown> = {}) =>
    session
      .content<Record<string, unknown>>("encounter", { action, id: record.id, ...more })
      .then((result) => {
        if (action === "xp") setXp(Number(result.xp) || 0);
        if (action === "run") setStatus(`On the tracker: ${(result.added as string[]).join(", ")}.`);
        if (action === "place") setStatus(`${result.placed} spots kept for ${result.scene}.`);
        if (action === "end") setStatus(`${result.xp} XP to award on the party sheet.`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not do that."));
  const npcs = rows.map(([, row]) => String(row.link?.recordname ?? "")).join("|");
  useEffect(() => void act("xp"), [npcs, rows.map(([, row]) => row.count).join("|")]);
  return (
    <div className="encounter-view" data-encounter={record.id}>
      <table className="record-table">
        <thead>
          <tr>
            <th>Count</th>
            <th>Creature</th>
            <th>Faction</th>
            <th title="FG's identified magnifier: blank, the players know what it is; else what they call it until they find out">Players see</th>
            {editable ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, row]) => (
            <tr key={key} data-encounter-row={key}>
              <td>{editable ? <Field value={row.count ?? 1} editable label={`${row.name} count`} onSave={(value) => void act("set-npc", { row: key, count: value })} /> : String(row.count ?? 1)}</td>
              <td>
                <span {...slotDrag({ kind: "record", record: String(row.link?.recordname ?? ""), label: String(row.name ?? "") })}>{row.name}</span>
              </td>
              <td>
                {editable ? (
                  <select aria-label={`${row.name} faction`} value={row.faction ?? "foe"} onChange={(event) => void act("set-npc", { row: key, faction: event.target.value })}>
                    <option value="foe">Foe</option>
                    <option value="neutral">Neutral</option>
                    <option value="friend">Friend</option>
                  </select>
                ) : (
                  row.faction ?? "foe"
                )}
              </td>
              <td className="encounter-identity">
                <Icon name={row.unidentified ? "eye" : "accept"} size={13} title={row.unidentified ? "Unidentified" : "Identified"} />
                {editable ? <Field value={row.unidentified ?? ""} editable label={`${row.name} players see`} onSave={(value) => void act("set-npc", { row: key, unidentified: value })} /> : row.unidentified || "Its name"}
              </td>
              {editable ? (
                <td>
                  <button type="button" className="ghost" aria-label={`Remove ${row.name}`} title="Remove" onClick={() => void act("remove-npc", { row: key })}>
                    <Icon name="trash" size={13} />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <DropZone label="encounter" accepts={(link) => link.kind === "record" && session.records[link.record]?.type === "npc"} onLink={(link) => void act("add-npc", { npc: linkRecord(link) })}>
          <span className="hint">Drop NPCs here (from the NPCs list). A count may be dice (1d4+1), rolled when they go on the tracker.</span>
        </DropZone>
      ) : null}
      <p className="hint">XP {xp ?? "…"}</p>
      <div className="cc-inline">
        <button type="button" data-action="encounter-run" title="Its creatures onto the combat tracker (counts rolled), hidden at their spots on this map" onClick={() => void act("run")}>
          <Icon name="combat" size={14} /> Add to tracker
        </button>
        <button type="button" data-action="encounter-place" title="Keep where its creatures' tokens stand on this map now: the next Add to tracker puts them there" onClick={() => void act("place")}>
          <Icon name="map" size={14} /> Place on this map
        </button>
        <button type="button" data-action="encounter-end" title="Its XP onto the party sheet, to award there" onClick={() => void act("end")}>
          <Icon name="flag" size={14} /> End encounter
        </button>
      </div>
      {status ? <p className="hint" role="status">{status}</p> : null}
    </div>
  );
}

// --- Treasure parcels ------------------------------------------------------------------

export function ParcelView({ session, record, editable }: { session: Session; record: TableRecord; editable: boolean }) {
  const [status, setStatus] = useState("");
  const currency = manifestOf(session.ruleset).party?.currency ?? ["GP"];
  const [coin, setCoin] = useState(currency[0] ?? "GP");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const items = Object.entries((record.data.itemlist ?? {}) as Record<string, { name?: string; count?: number; isidentified?: number; nonid_name?: string }>).sort(([a], [b]) => a.localeCompare(b));
  const coins = Object.entries((record.data.coinlist ?? {}) as Record<string, { description?: string; amount?: number }>);
  const characters = useMemo(() => Object.values(session.records).filter((item) => item.type === "character"), [session.records]);
  const act = (action: string, more: Record<string, unknown> = {}, done = "") =>
    session
      .content("parcel", { action, id: record.id, ...more })
      .then(() => setStatus(done))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not do that."));
  return (
    <div className="parcel-view" data-parcel={record.id}>
      <h4>Items</h4>
      <ul className="parcel-items">
        {items.length === 0 ? <li className="hint">No items.</li> : null}
        {items.map(([key, item]) => (
          <li key={key} data-parcel-item={key}>
            {item.count && item.count > 1 ? `${item.count} × ` : ""}
            {item.name}
            {item.isidentified === 0 ? <small className="hint"> (unidentified: {item.nonid_name || "Unidentified item"})</small> : null}
            {editable ? (
              <>
                <label className="hint" title="FG's Identified">
                  <input type="checkbox" checked={item.isidentified !== 0} onChange={(event) => void session.content("identify", { id: record.id, item: key, on: event.target.checked })} /> Identified
                </label>
                <button type="button" className="ghost" aria-label={`Remove ${item.name}`} onClick={() => void act("remove", { key })}>
                  <Icon name="trash" size={13} />
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <h4>Coins</h4>
      <ul className="parcel-coins">
        {coins.length === 0 ? <li className="hint">No coins.</li> : null}
        {coins.map(([key, row]) => (
          <li key={key}>
            {row.amount} {row.description}
            {editable ? (
              <button type="button" className="ghost" aria-label={`Remove ${row.description}`} onClick={() => void act("remove", { key, coin: true })}>
                <Icon name="trash" size={13} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <>
          <DropZone label="parcel" accepts={(link) => link.kind === "record" && session.records[link.record]?.type === "item"} onLink={(link) => void act("add", { item: linkRecord(link) })}>
            <span className="hint">Drop items here (from the Items list)</span>
          </DropZone>
          <form
            className="cc-inline"
            onSubmit={(event) => {
              event.preventDefault();
              if (Number(amount) > 0) void act("add", { coin, amount: Number(amount) }).then(() => setAmount(""));
            }}
          >
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" placeholder="Amount" aria-label="Coin amount" />
            <select aria-label="Coin" value={coin} onChange={(event) => setCoin(event.target.value)}>
              {currency.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <button type="submit" data-action="parcel-add-coin" disabled={!(Number(amount) > 0)}>
              <Icon name="coins" size={14} /> Add
            </button>
          </form>
        </>
      ) : null}
      <div className="cc-inline">
        <button type="button" data-action="parcel-party" title="Into the party sheet's parcel, to hand out (as FG's drop on the party sheet)" onClick={() => void act("party", {}, "On the party sheet's parcel.")}>
          <Icon name="party" size={14} /> To the party sheet
        </button>
        <select aria-label="Give to" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Give to a character…</option>
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
        <button type="button" data-action="parcel-character" disabled={!to} title="Its items into that character's gear, its coins into the purse" onClick={() => void act("character", { character: to }, "Given.")}>
          Give
        </button>
      </div>
      {status ? <p className="hint" role="status">{status}</p> : null}
    </div>
  );
}

// --- Quests -----------------------------------------------------------------------------

export function QuestView({ session, record, editable }: { session: Session; record: TableRecord; editable: boolean }) {
  const openLink = useOpenLink(session);
  const [status, setStatus] = useState("");
  const text = typeof record.data.text === "string" ? record.data.text : "";
  const set = (change: Record<string, unknown>) => void session.content("quest", { action: "set", id: record.id, ...change });
  return (
    <div className="quest-view" data-quest={record.id}>
      <div className="cc-inline">
        <label>
          XP {editable ? <Field value={record.data.xp ?? 0} editable number label="Quest XP" onSave={(value) => set({ xp: Number(value) || 0 })} /> : String(record.data.xp ?? 0)}
        </label>
        <label>
          Status{" "}
          {editable ? (
            <select aria-label="Quest status" value={String(record.data.status ?? "open")} onChange={(event) => set({ status: event.target.value })}>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          ) : (
            String(record.data.status ?? "open")
          )}
        </label>
      </div>
      <RichText value={text} editable={editable} label="Quest text" onSave={(value) => set({ text: value })} onOpen={openLink} read={<FormattedText text={text} onOpen={openLink} />} />
      {session.role === "dm" ? (
        <button type="button" data-action="quest-party" title="Onto the party sheet's XP tab, to award there" onClick={() => void session.content("quest", { action: "party", id: record.id }).then(() => setStatus("On the party sheet."))}>
          <Icon name="party" size={14} /> To the party sheet
        </button>
      ) : null}
      {status ? <p className="hint" role="status">{status}</p> : null}
    </div>
  );
}

// The core's kinds, each its own window.
export const CORE_VIEWS: Record<string, (props: { session: Session; record: TableRecord; editable: boolean }) => ReactNode> = { story: StoryView, battle: EncounterView, treasureparcel: ParcelView, quest: QuestView };

// A row's right-click menu (FG's: Duplicate, Delete; a book's record, Copy to campaign).
export function useRecordMenu(session: Session) {
  const actions = useRecordActions(session);
  const menu = useContextMenu();
  return { element: menu.element, show: (event: React.MouseEvent, record: TableRecord) => menu.show(event, actions.items(record)), actions };
}
