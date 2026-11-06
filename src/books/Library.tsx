import { useEffect, useState } from "react";
import type { BookInfo, Session } from "../session/useSession";

// FG's Library for an adventure module (the GM's): its maps onto the table,
// its NPCs, encounters (battles), treasure parcels and tables, each with
// FG's action: to the combat tracker, to the map, to the party, rolled.
export type Kind = "battle" | "npc" | "parcel" | "table";
const TABS: [Kind, string][] = [
  ["battle", "Encounters"],
  ["npc", "NPCs"],
  ["parcel", "Parcels"],
  ["table", "Tables"],
];

export function LibraryWindow({ session, openMaps }: { session: Session; openMaps: (bytes: Uint8Array, name: string) => Promise<unknown> }) {
  const [modules, setModules] = useState<BookInfo[]>([]);
  const [module, setModule] = useState("");
  const [kind, setKind] = useState<Kind>("battle");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[] }>("list")
      .then(({ books }) => {
        const adventures = books.filter((book) => book.adventure);
        setModules(adventures);
        setModule((current) => current || adventures.find((book) => book.active)?.name || adventures[0]?.name || "");
      })
      .catch(() => setModules([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (module) session.libraryAction("list", { module, kind, search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, kind, search]);
  const items = session.library[`${module}|${kind}`] ?? [];
  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.category || "", [...(groups.get(item.category || "") ?? []), item]);
  return (
    <div className="library-window">
      <div className="library-head">
        <label>
          Module{" "}
          <select value={module} onChange={(event) => setModule(event.target.value)} aria-label="Library module">
            {modules.map((book) => (
              <option key={book.id} value={book.name}>
                {book.title || book.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-action="library-maps"
          disabled={!module}
          title="Put this module's maps on the table: pictures, walls, doors, lights, FX and pins"
          onClick={async () => {
            setStatus("Opening the maps…");
            try {
              await openMaps(await session.fgMaps(module), `${module}.zip`);
              setStatus("The maps are on the table (the scene list switches between them).");
            } catch (error) {
              setStatus(error instanceof Error ? error.message : "Could not open the maps.");
            }
          }}
        >
          Maps to the table
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
      <div className="library-list">
        {[...groups].map(([category, list]) => (
          <section key={category}>
            {category ? <h4>{category}</h4> : null}
            {list.map((item) => (
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
            ))}
          </section>
        ))}
        {module && items.length === 0 ? <p className="hint">Nothing here.</p> : null}
      </div>
    </div>
  );
}

// The sidebar's Encounters, Parcels and Tables (FG's Campaign lists): every
// active adventure's, each under the adventure's name, as FG lists an active
// module's records under the module. The same actions as the Library's.
export function AdventureList({ session, kind }: { session: Session; kind: Kind }) {
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
  const label = TABS.find(([id]) => id === kind)?.[1] ?? kind;
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
                        <span className="records-name">
                          {item.name}
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
