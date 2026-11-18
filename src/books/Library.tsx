import { useEffect, useRef, useState } from "react";
import { markInlineRolls } from "../ui/InlineRolls";
import { useReadAloudFrames } from "./readAloud";
import type { BookInfo, LibraryItem, Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { useWindows } from "../ui/Windows";
import { ShareMenu, TableImport, useRecordMenu } from "./RecordEditor";
import { imageWindow } from "../table/imageWindow";

// FG's Library for the GM's adventures: each kind in its own tab (Maps,
// Encounters, NPCs, Parcels, Tables), for one adventure or all the active
// ones. A map is seen first (its picture, here, for the GM's eyes only), then
// put on the table or shown to the players as a picture; encounters to the
// combat tracker and the map, NPCs to the tracker, parcels to the party,
// tables rolled.
export type Kind = "map" | "battle" | "npc" | "parcel" | "table" | "story";
const TABS: [Kind, string][] = [
  ["map", "Maps"],
  ["battle", "Encounters"],
  ["npc", "NPCs"],
  ["parcel", "Parcels"],
  ["table", "Tables"],
];
const ALL = "*";

export function LibraryWindow({ session, openMaps }: { session: Session; openMaps: (bytes: Uint8Array, name: string) => Promise<unknown> }) {
  const [modules, setModules] = useState<BookInfo[]>([]);
  const [module, setModule] = useState("");
  const [kind, setKind] = useState<Kind>("map");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<{ book: BookInfo; item: LibraryItem } | null>(null);
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[] }>("list")
      .then(({ books }) => {
        // Only the campaign's active adventures (an inactive book's content is off limits).
        const adventures = books.filter((book) => book.adventure && book.active);
        setModules(adventures);
        setModule((current) => current || adventures.find((book) => book.active)?.name || adventures[0]?.name || "");
      })
      .catch(() => setModules([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // All: every active adventure.
  const active = modules;
  const shown = module === ALL ? modules : modules.filter((book) => book.name === module);
  useEffect(() => {
    for (const book of shown) session.libraryAction("list", { module: book.name, kind, search });
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, kind, search, modules.length]);
  const toTable = async (book: BookInfo, only = "") => {
    setStatus(only ? `Putting ${only} on the table…` : "Opening the maps…");
    try {
      await openMaps(await session.fgMaps(book.name, only), `${book.name}.zip`);
      setStatus(only ? `${only} is on the table (the players see it).` : "The maps are on the table (the scene list switches between them).");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the maps.");
    }
  };
  const single = module !== ALL ? shown[0] : null;
  return (
    <div className="library-window">
      <div className="library-head">
        <label>
          Module{" "}
          <select value={module} onChange={(event) => setModule(event.target.value)} aria-label="Library module">
            {modules.length > 1 ? <option value={ALL}>All{active.length ? " active adventures" : " adventures"}</option> : null}
            {modules.map((book) => (
              <option key={book.id} value={book.name}>
                {book.title || book.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-action="library-maps" disabled={!single} title={single ? "Put every map of this adventure on the table: pictures, walls, doors, lights, FX and pins" : "Choose one adventure"} onClick={() => single && void toTable(single)}>
          All maps to the table
        </button>
      </div>
      <nav className="library-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={kind === id} data-library-tab={id} onClick={() => setKind(id)}>
            {label}
          </button>
        ))}
        <input value={search} placeholder="Search" onChange={(event) => setSearch(event.target.value)} aria-label="Library search" />
      </nav>
      {status ? <p className="hint">{status}</p> : null}
      {modules.length === 0 ? <p className="hint empty-state"><b>No adventure is active</b>Make one active in Modules.</p> : null}
      {preview ? (
        <figure className="library-preview" data-library-preview={preview.item.name}>
          <img src={session.bookUrl("picture", preview.book.id, preview.item.file ?? "")} alt={preview.item.name} />
          <figcaption>
            <b>{preview.item.name}</b> <small className="hint">{preview.book.title || preview.book.name} · only you see this</small>
            <span className="library-preview-actions">
              <button type="button" data-action="library-map-open" title="Open it on the table, with its walls, doors, lights and pins (the players see it)" onClick={() => void toTable(preview.book, preview.item.name)}>
                Put on the table
              </button>
              <button type="button" data-action="library-map-show" title="Show the players this picture alone (a tab on their screens)" onClick={() => (session.showImage(preview.book.id, preview.item.file ?? "", preview.item.name), setStatus(`The players see ${preview.item.name} as a picture.`))}>
                Show the players the picture
              </button>
              <button type="button" data-action="library-map-edit" title="Unlock: open it in the image window to edit (only you see it), the same image wherever it is opened" onClick={() => void imageWindow.open?.({ book: preview.book.name, name: preview.item.name }).catch((error: Error) => setStatus(error.message))}>
                Unlock to edit
              </button>
              <button type="button" className="ghost" onClick={() => setPreview(null)}>
                Close
              </button>
            </span>
          </figcaption>
        </figure>
      ) : null}
      <div className="library-list">
        {shown.map((book) => {
          const items = session.library[`${book.name}|${kind}`] ?? [];
          const groups = new Map<string, typeof items>();
          for (const item of items) groups.set(item.category || "", [...(groups.get(item.category || "") ?? []), item]);
          return (
            <section key={book.id} data-library-module={book.name}>
              {module === ALL ? <h4 className="library-module">{book.title || book.name}</h4> : null}
              {[...groups].map(([category, list]) => (
                <div key={category}>
                  {category ? <h5>{category}</h5> : null}
                  {kind === "map" ? (
                    <div className="library-maps">
                      {list.map((item) => (
                        <button key={item.path} type="button" className={preview?.item.path === item.path ? "library-map on" : "library-map"} data-library-item={item.name} data-action="library-map" title={`See ${item.name}`} onClick={() => setPreview({ book, item })}>
                          <img src={session.bookUrl("picture", book.id, item.file ?? "")} alt="" loading="lazy" />
                          <span>
                            {item.name}
                            {item.summary ? <small className="hint"> {item.summary}</small> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    list.map((item) => (
                      <div key={item.path} className="library-row" data-library-item={item.name}>
                        <span>
                          <b>{item.name}</b>
                          <small className="hint"> {item.npcs ?? item.summary ?? ""}</small>
                        </span>
                        {kind === "battle" ? (
                          <button type="button" data-action="library-battle" title="Onto the combat tracker; on the open map, tokens where the book placed them (hidden)" onClick={() => session.libraryAction("battle", { path: item.path })}>
                            ⚔ Add
                          </button>
                        ) : kind === "npc" ? (
                          <button type="button" data-action="library-npc" title="Onto the combat tracker" onClick={() => session.libraryAction("npc", { path: item.path })}>
                            ⚔ Add
                          </button>
                        ) : kind === "parcel" ? (
                          <button type="button" data-action="library-parcel" title="Into the party sheet's parcel, to hand out" onClick={() => session.libraryAction("parcel", { path: item.path })}>
                            → Party
                          </button>
                        ) : (
                          <button type="button" data-action="library-table" title="Roll it (the result goes to chat)" onClick={() => session.libraryAction("table", { path: item.path })}>
                            🎲 Roll
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ))}
              {items.length === 0 && module !== ALL ? <p className="hint empty-state">Nothing of this kind in this adventure.</p> : null}
            </section>
          );
        })}
        {module === ALL && shown.every((book) => !(session.library[`${book.name}|${kind}`] ?? []).length) ? <p className="hint empty-state">Nothing of this kind in the active adventures.</p> : null}
      </div>
    </div>
  );
}

// The sidebar's Encounters, Parcels and Tables (FG's Campaign lists): every
// active adventure's, each under the adventure's name, as FG lists an active
// module's records under the module. The same actions as the Library's.
const LABELS: Record<Kind, string> = { map: "Maps", battle: "Encounters", npc: "NPCs", parcel: "Parcels", table: "Tables", story: "Story" };

// The campaign's own records of the kind, above the adventures' (FG lists the
// campaign's first): New makes one (opened to fill in), a row opens it, is
// dragged as a link, and has FG's right-click Duplicate and Delete.
const CAMPAIGN_TYPES: Partial<Record<Kind, string>> = { battle: "battle", parcel: "treasureparcel", table: "table", story: "story" };
const NEW_INPUT: Record<string, (session: Session, name: string) => Promise<TableRecord>> = {
  battle: (session, name) => session.content<TableRecord>("encounter", { action: "create", name }),
  treasureparcel: (session, name) => session.content<TableRecord>("parcel", { action: "create", name }),
  table: (session, name) => session.content<TableRecord>("table-roll", { action: "create", name, dice: "d6", data: { tablerows: { "id-00001": { fromrange: 1, torange: 6, results: { "id-00001": { result: "" } } } } } }),
  story: (session, name) => session.content<TableRecord>("story", { action: "create", name }),
};
function CampaignRecords({ session, type, label, search }: { session: Session; type: string; label: string; search: string }) {
  const windows = useWindows();
  const menu = useRecordMenu(session);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const wanted = search.trim().toLowerCase();
  const rows = Object.values(session.records)
    .filter((record) => record.type === type && !record.source && (!wanted || record.name.toLowerCase().includes(wanted)))
    .sort((a, b) => String(a.data.chapter ?? "").localeCompare(String(b.data.chapter ?? "")) || (Number(a.data.order) || 0) - (Number(b.data.order) || 0) || a.name.localeCompare(b.name));
  const chapters = new Map<string, TableRecord[]>();
  for (const record of rows) chapters.set(String(record.data.chapter ?? ""), [...(chapters.get(String(record.data.chapter ?? "")) ?? []), record]);
  const made = (record: TableRecord) => menu.actions.open(record.id, record.name);
  return (
    <section data-records-book="Campaign" data-campaign-list={type}>
      <h4>Campaign</h4>
      <form
        className="records-new cc-inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void NEW_INPUT[type](session, name.trim())
            .then((record) => {
              setName("");
              made(record);
            })
            .catch((error) => setStatus(error instanceof Error ? error.message : "Could not make that."));
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`New ${label.replace(/s$/, "").toLowerCase()}`} aria-label={`New ${label.replace(/s$/, "").toLowerCase()} name`} />
        <button type="submit" data-action="campaign-new" disabled={!name.trim()} title={`Make a new ${label.replace(/s$/, "").toLowerCase()} of the campaign's own`}>
          <Icon name="plus" size={15} /> New
        </button>
      </form>
      {type === "table" ? <TableImport session={session} onMade={made} /> : null}
      {status ? <p className="hint" role="status">{status}</p> : null}
      {rows.length === 0 ? <p className="hint">None of the campaign's own yet.</p> : null}
      {[...chapters].map(([chapter, list]) => (
        <div key={chapter}>
          {chapter ? <h5 className="records-category">{chapter}</h5> : null}
          {list.map((record) => (
            <div key={record.id} className="records-row" data-record-row={record.id} onContextMenu={(event) => menu.show(event, record)}>
              <ShareMenu session={session} record={record} />
              <button type="button" className="records-name" title={`Open ${record.name} (right-click: Duplicate, Delete)`} onClick={() => windows.open("record", record.name, record.id)} {...slotDrag({ kind: "record", record: record.id, label: record.name })}>
                {record.name}
              </button>
              {type === "table" ? (
                <button type="button" data-action="campaign-table-roll" title="Roll it (the result goes to chat)" onClick={() => void session.content("table-roll", { action: "roll", id: record.id })}>
                  🎲 Roll
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
      {menu.element}
    </section>
  );
}

export function AdventureList({ session, kind, onStory }: { session: Session; kind: Kind; onStory?: (path: string, name: string) => void }) {
  const [modules, setModules] = useState<BookInfo[] | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[] }>("list")
      .then(({ books }) => setModules(books.filter((book) => book.adventure && book.active)))
      .catch(() => setModules([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    for (const book of modules ?? []) session.libraryAction("list", { module: book.name, kind, search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, kind, search]);
  const label = LABELS[kind];
  return (
    <div className="records-window single adventure-list" data-adventure-list={kind}>
      <section className="records-main">
        <div className="records-head">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label={`Search ${label}`} />
        </div>
        <div className="records-list">
          {CAMPAIGN_TYPES[kind] ? <CampaignRecords session={session} type={CAMPAIGN_TYPES[kind]!} label={label} search={search} /> : null}
          {modules && modules.length === 0 ? <p className="hint empty-state"><b>No adventure is active</b>Tick one under Modules.</p> : null}
          {(modules ?? []).map((book) => {
            const items = session.library[`${book.name}|${kind}`] ?? [];
            const groups = new Map<string, typeof items>();
            for (const item of items) groups.set(item.category || "", [...(groups.get(item.category || "") ?? []), item]);
            return (
              <section key={book.id} data-records-book={book.name}>
                <h4>{book.title || book.name}</h4>
                {items.length === 0 ? <p className="hint empty-state">No {label.toLowerCase()}{search ? " by that name" : " in this adventure"}.</p> : null}
                {[...groups].map(([category, list]) => (
                  <div key={category}>
                    {category ? <h5 className="records-category">{category}</h5> : null}
                    {list.map((item) => (
                      <div key={item.path} className="records-row library-row" data-library-item={item.name}>
                        {kind === "story" ? (
                          <button type="button" className="records-name" data-action="library-story" title={`Read ${item.name}`} onClick={() => onStory?.(item.path, item.name)}>
                            {item.name}
                          </button>
                        ) : (
                          <span className="records-name">
                            {item.name}
                            <small className="hint"> {item.npcs ?? item.summary ?? ""}</small>
                          </span>
                        )}
                        {kind === "story" ? null : kind === "battle" ? (
                          <button type="button" data-action="library-battle" title="Onto the combat tracker; on the open map, tokens where the book placed them (hidden)" onClick={() => session.libraryAction("battle", { path: item.path })}>
                            ⚔ Add
                          </button>
                        ) : kind === "npc" ? (
                          <button type="button" data-action="library-npc" title="Onto the combat tracker" onClick={() => session.libraryAction("npc", { path: item.path })}>
                            ⚔ Add
                          </button>
                        ) : kind === "parcel" ? (
                          <button type="button" data-action="library-parcel" title="Into the party sheet's parcel, to hand out" onClick={() => session.libraryAction("parcel", { path: item.path })}>
                            → Party
                          </button>
                        ) : (
                          <button type="button" data-action="library-table" title="Roll it (the result goes to chat)" onClick={() => session.libraryAction("table", { path: item.path })}>
                            🎲 Roll
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// One story entry (FG's story record), read by the GM: its text from the module.
export function StoryWindow({ session, path: opened }: { session: Session; path: string }) {
  // The entry shown: the one it opened with, then wherever its arrows step to.
  const [path, setPath] = useState(opened);
  const module = path.split("@").slice(1).join("@");
  useEffect(() => {
    session.libraryAction("story", { module, path });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const entry = session.library[`${module}|story:${path}`]?.[0];
  // Its boxed text, read aloud by the GM.
  const storyText = useRef<HTMLDivElement>(null);
  useReadAloudFrames(storyText, [entry?.html], entry?.name);
  // Its dice as roll chips.
  useEffect(() => markInlineRolls(storyText.current), [entry?.html]);
  const windows = useWindows();
  const [status, setStatus] = useState("");
  // The window's title follows the entry it shows.
  useEffect(() => {
    if (entry?.name && path !== opened) windows.open("story", entry.name, opened);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.name]);
  const step = (to: { path: string } | null | undefined) => {
    if (!to) return;
    setStatus("");
    setPath(to.path);
  };
  // The entry as the campaign's own story record, to change and share (the adventure's stays as it is).
  const copy = () =>
    session
      .content<TableRecord>("story", { action: "copy", path })
      .then((record) => windows.open("record", record.name, record.id))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not copy that."));
  return (
    <div className="record-window story-window" data-story={path}>
      {entry ? (
        <>
          <button type="button" className="story-copy" data-action="story-copy" title="Copy it into the campaign's story, to change it and share it with the players" onClick={() => void copy()}>
            <Icon name="import" size={15} /> Copy to campaign
          </button>
          {status ? <p className="hint" role="status">{status}</p> : null}
          <h3>{entry.name}</h3>
          {entry.category ? <p className="hint">{entry.category}</p> : null}
          <div className="book-text" ref={storyText} dangerouslySetInnerHTML={{ __html: entry.html ?? "" }} />
          <nav className="book-turn story-turn">
            <button type="button" data-action="story-prev" disabled={!entry.prev} aria-label="Previous entry" onClick={() => step(entry.prev)}>
              ‹ {entry.prev?.name ?? ""}
            </button>
            <button type="button" data-action="story-next" disabled={!entry.next} aria-label="Next entry" onClick={() => step(entry.next)}>
              {entry.next?.name ?? ""} ›
            </button>
          </nav>
        </>
      ) : (
        <p className="hint">Reading…</p>
      )}
    </div>
  );
}
