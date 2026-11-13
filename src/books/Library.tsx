import { useEffect, useState } from "react";
import type { BookInfo, LibraryItem, Session } from "../session/useSession";
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
      {modules.length === 0 ? <p className="hint">No adventure is active: make one active in Modules.</p> : null}
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
                          <button type="button" data-action="library-battle" title="Onto the combat tracker; on the open map, tokens where FG placed them (hidden)" onClick={() => session.libraryAction("battle", { path: item.path })}>
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
              {items.length === 0 && module !== ALL ? <p className="hint">Nothing here.</p> : null}
            </section>
          );
        })}
        {module === ALL && shown.every((book) => !(session.library[`${book.name}|${kind}`] ?? []).length) ? <p className="hint">Nothing here.</p> : null}
      </div>
    </div>
  );
}

// The sidebar's Encounters, Parcels and Tables (FG's Campaign lists): every
// active adventure's, each under the adventure's name, as FG lists an active
// module's records under the module. The same actions as the Library's.
const LABELS: Record<Kind, string> = { map: "Maps", battle: "Encounters", npc: "NPCs", parcel: "Parcels", table: "Tables", story: "Story" };

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
          {modules && modules.length === 0 ? <p className="hint">No adventure is active: tick one under Modules (Activation).</p> : null}
          {(modules ?? []).map((book) => {
            const items = session.library[`${book.name}|${kind}`] ?? [];
            const groups = new Map<string, typeof items>();
            for (const item of items) groups.set(item.category || "", [...(groups.get(item.category || "") ?? []), item]);
            return (
              <section key={book.id} data-records-book={book.name}>
                <h4>{book.title || book.name}</h4>
                {items.length === 0 ? <p className="hint">No {label.toLowerCase()}{search ? " by that name" : ""}.</p> : null}
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
                          <button type="button" data-action="library-battle" title="Onto the combat tracker; on the open map, tokens where FG placed them (hidden)" onClick={() => session.libraryAction("battle", { path: item.path })}>
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
export function StoryWindow({ session, path }: { session: Session; path: string }) {
  const module = path.split("@").slice(1).join("@");
  useEffect(() => {
    session.libraryAction("story", { module, path });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const entry = session.library[`${module}|story:${path}`]?.[0];
  return (
    <div className="record-window story-window" data-story={path}>
      {entry ? (
        <>
          <h3>{entry.name}</h3>
          {entry.category ? <p className="hint">{entry.category}</p> : null}
          <div className="book-text" dangerouslySetInnerHTML={{ __html: entry.html ?? "" }} />
        </>
      ) : (
        <p className="hint">Reading…</p>
      )}
    </div>
  );
}
