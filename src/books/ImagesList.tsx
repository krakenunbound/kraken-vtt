import { useEffect, useState } from "react";
import type { BookInfo, Session } from "../session/useSession";
import { imageWindow } from "../table/imageWindow";

// FG's Images & Maps (the sidebar's Campaign > Images): every picture of
// every active book, maps and handouts, each under its book. A click opens it
// in the image window: the same master wherever it is opened (its walls,
// doors, lights, paint and effects), the GM's alone until put in play.
export function ImagesList({ session }: { session: Session }) {
  const [books, setBooks] = useState<BookInfo[] | null>(null);
  const [search, setSearch] = useState("");
  const [mapsOnly, setMapsOnly] = useState(false);
  const [status, setStatus] = useState("");
  const shelfKey = session.bookShelf.active.join("|");
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[] }>("list")
      .then((result) => setBooks(result.books.filter((book) => book.active)))
      .catch(() => setBooks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfKey]);
  useEffect(() => {
    for (const book of books ?? []) session.libraryAction("list", { module: book.name, kind: "image", search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, search]);
  // The campaign's own images (Assets' Make it a map): a picture of an active book.
  const campaignImages = Object.values(session.records)
    .filter((record) => record.type === "image" && typeof (record.data as { file?: unknown })?.file === "string")
    .map((record) => record as typeof record & { data: { book: string; file: string } })
    .filter((record) => (!search || record.name.toLowerCase().includes(search.toLowerCase())) && (books ?? []).some((book) => book.id === record.data.book))
    .sort((a, b) => a.name.localeCompare(b.name));
  const openRecord = async (record: { name: string; data: { book: string; file: string } }) => {
    setStatus(`Opening ${record.name}…`);
    try {
      await imageWindow.open?.({ book: record.data.book, file: record.data.file, name: record.name });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open it.");
    }
  };
  const open = async (book: BookInfo, name: string) => {
    setStatus(`Opening ${name}…`);
    try {
      const opened = await imageWindow.open?.({ book: book.name, name });
      setStatus(opened?.onTable ? `${name} is the table's map now: it is open there.` : "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open it.");
    }
  };
  return (
    <div className="records-window single images-list" data-images-list>
      <section className="records-main">
        <div className="records-head">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search images" />
          <label className="images-maps-only" title="Only the maps (with a grid, walls or FG's map category)">
            <input type="checkbox" checked={mapsOnly} onChange={(event) => setMapsOnly(event.target.checked)} /> Maps only
          </label>
        </div>
        {status ? <p className="hint">{status}</p> : null}
        <div className="records-list">
          {campaignImages.length ? (
            <section data-images-book="campaign">
              <h4>This campaign</h4>
              <div className="library-maps">
                {campaignImages.map((record) => (
                  <button key={record.id} type="button" className="library-map" data-image={record.name} data-image-record={record.id} title={`Open ${record.name}`} onClick={() => void openRecord(record)}>
                    <img src={session.bookUrl("picture", record.data.book, record.data.file)} alt="" loading="lazy" />
                    <span>{record.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {books && books.length === 0 ? <p className="hint">No book is active: make one active in Modules.</p> : null}
          {(books ?? []).map((book) => {
            const items = (session.library[`${book.name}|image`] ?? []).filter((item) => !mapsOnly || item.map);
            if (items.length === 0) return null;
            const groups = new Map<string, typeof items>();
            for (const item of items) groups.set(item.category || "", [...(groups.get(item.category || "") ?? []), item]);
            return (
              <section key={book.id} data-images-book={book.name}>
                <h4>{book.title || book.name}</h4>
                {[...groups].map(([category, list]) => (
                  <div key={category}>
                    {category ? <h5>{category}</h5> : null}
                    <div className="library-maps">
                      {list.map((item) => (
                        <button key={item.path} type="button" className="library-map" data-image={item.name} title={`Open ${item.name} (only you see it until you put it in play)`} onClick={() => void open(book, item.name)}>
                          <img src={session.bookUrl("picture", book.id, item.file ?? "")} alt="" loading="lazy" />
                          <span>
                            {item.name}
                            {item.map ? <small className="hint"> map</small> : null}
                          </span>
                        </button>
                      ))}
                    </div>
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
