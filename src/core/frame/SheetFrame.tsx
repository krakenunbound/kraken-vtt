import { useState, type ReactNode } from "react";
import type { Session, TableRecord } from "../../session/useSession";
import { Icon } from "../../ui/icons";
import { hasLink, linkFrom, slotDrag } from "../../ui/QuickSlots";
import { ArtPicker, Picture } from "../../characters/ArtPicker";
import { Field } from "../fields/Field";
import { BuffBar } from "../../effects/BuffBar";
import { creatureDrop } from "../../effects/drops";

// The core's character sheet frame (FG CoreRPG's charsheet_base and its
// overview header): the article with data-character / data-ruleset, the
// portrait and its token badge (ArtPicker; the portrait drags the sheet as a
// link), the name and the identity boxes under it, the pages, and the tab
// rail down the right (data-sheet-tab). Every ruleset's sheet sits in it and
// gives only its boxes and its pages (docs/core-ui-design.md, 4.2).

export type Tab = string | { id: string; label: string };
const tabId = (tab: Tab) => (typeof tab === "string" ? tab : tab.id);
const tabLabel = (tab: Tab) => (typeof tab === "string" ? tab[0].toUpperCase() + tab.slice(1) : tab.label);

// Who may type on a sheet: the GM, or the player who owns it.
export function canEdit(record: TableRecord, session: Session) {
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  return session.role === "dm" || (record.owner !== "" && record.owner === me);
}

// The name, the sheet's first field (note: what is written under it).
export function NameField({ record, session, editable, note = "Name" }: { record: TableRecord; session: Session; editable: boolean; note?: ReactNode }) {
  return (
    <label className="cc-labelled grow">
      <Field value={record.name} editable={editable} label="Name" className="cc-name" onSave={(value) => session.editCharacter(record.id, [{ path: "name", value }])} />
      <small>{note}</small>
    </label>
  );
}

// One labelled box under the name (Race, Class, Background...).
export function IdentityBox({ label, title, className = "", children }: { label: ReactNode; title?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`cc-labelled cc-box${className ? ` ${className}` : ""}`} title={title}>
      {children}
      <small>{label}</small>
    </label>
  );
}

export function SheetFrame({
  record,
  session,
  editable,
  className = "cc-sheet",
  attrs = {},
  tabs,
  tab,
  onTab,
  name,
  boxes,
  tokenTitle = "Token",
  artRace = "",
  onDropRecord,
  children,
}: {
  record: TableRecord;
  session: Session;
  editable: boolean;
  className?: string;
  attrs?: Record<string, string>;
  tabs: readonly Tab[];
  tab: string;
  onTab: (id: string) => void;
  name?: ReactNode;
  boxes?: ReactNode;
  tokenTitle?: string;
  artRace?: string;
  // A record from a list dropped anywhere on the sheet (FG's sheet drop): only sheets that take one.
  onDropRecord?: (id: string) => void;
  children: ReactNode;
}) {
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [dropping, setDropping] = useState(false);
  const data = record.data as Record<string, unknown>;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const drop = onDropRecord
    ? {
        onDragOver: (event: React.DragEvent) => {
          if (!editable || !hasLink(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDropping(true);
        },
        onDragLeave: (event: React.DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
        },
        onDrop: (event: React.DragEvent) => {
          setDropping(false);
          const link = linkFrom(event);
          if (!editable || !link || link.kind !== "record" || link.record === record.id) return;
          event.preventDefault();
          onDropRecord(link.record);
        },
      }
    : {};
  return (
    <article className={dropping ? `${className} dropping` : className} data-character={record.id} {...attrs} {...drop}>
      <div className="cc-body">
        <header className="cc-head">
          {/* The token as a small round badge on the portrait's corner. */}
          <div className="cc-portrait-frame">
            <button type="button" className="cc-portrait" data-action="pick-portrait" disabled={!editable} title={editable ? "Click to choose a portrait" : record.name} onClick={() => setPicking("portrait")} {...slotDrag({ kind: "sheet", record: record.id, label: record.name })} {...creatureDrop(session, { recordId: record.id })}>
              {portrait ? <Picture session={session} id={portrait} alt={record.name} /> : <span>{record.name.slice(0, 1)}</span>}
            </button>
            <button type="button" className="cc-token" data-action="pick-token" disabled={!editable} title={tokenTitle} onClick={() => setPicking("token")}>
              {typeof data.token === "string" && data.token ? <Picture session={session} id={data.token} alt="Token" /> : portrait ? <Picture session={session} id={portrait} alt="Token" /> : <Icon name="character" size={18} />}
            </button>
          </div>
          <div className="cc-identity">
            {name ?? <NameField record={record} session={session} editable={editable} />}
            <div className="cc-boxes">{boxes}</div>
            <BuffBar session={session} at={{ recordId: record.id }} />
          </div>
          {picking ? (
            <ArtPicker
              session={session}
              kind={picking}
              current={typeof data[picking] === "string" ? String(data[picking]) : undefined}
              race={artRace}
              onClose={() => setPicking(null)}
              onPick={(id) => {
                void session.op({ op: "update", id: record.id, patch: { data: { [picking]: id } } });
                setPicking(null);
              }}
            />
          ) : null}
        </header>
        {children}
      </div>
      <nav className="cc-tabs" role="tablist" aria-label="Sheet">
        {tabs.map((item) => (
          <button key={tabId(item)} type="button" role="tab" aria-selected={tab === tabId(item)} data-sheet-tab={tabId(item)} onClick={() => onTab(tabId(item))}>
            {tabLabel(item)}
          </button>
        ))}
      </nav>
    </article>
  );
}
