import { categoryOf, categoryOrder } from "../../shared/records/categorize.mjs";
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
  const shelfKey = `${session.bookShelf.active.join("|")}@${session.contentAt}`;
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
  // The campaign's images: a picture of an active book made a map (Assets' Make it a map),
  // and the campaign's own maps (a picture of the GM's, made a map in Map Studio).
  const campaignImages = Object.values(session.records)
    .filter((record) => record.type === "image" && typeof (record.data as { file?: unknown })?.file === "string")
    .map((record) => record as typeof record & { data: { book: string; file: string; own?: boolean } })
    .filter((record) => (!search || record.name.toLowerCase().includes(search.toLowerCase())) && (record.data.own || (books ?? []).some((book) => book.id === record.data.book)))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Every picture of the active books, each with its kind (Maps, Portraits, Handouts, Illustrations, Tokens,
  // Pictures: shared/records/categorize.mjs) and its book's own category; filtered, then grouped by kind or by book.
  const [typeWanted, setTypeWanted] = useState("");
  const [bookWanted, setBookWanted] = useState("");
  const [groupBy, setGroupBy] = useState<"type" | "book">("type");
  type Item = NonNullable<(typeof session.library)[string]>[number];
  const everything = (books ?? []).flatMap((book) =>
    (session.library[`${book.name}|image`] ?? []).map((item: Item) => ({ item, book, ...categoryOf({ type: "image", name: item.name, data: { fgCategory: item.category ?? "", image: item.map ? { grid: "on" } : {} } } as never) })),
  );
  const shownItems = everything.filter((row) => (!mapsOnly || row.item.map) && (!bookWanted || row.book.id === bookWanted));
  const typeCounts = [...shownItems.reduce((counts, row) => counts.set(row.category, (counts.get(row.category) ?? 0) + 1), new Map<string, number>())].sort((a, b) => categoryOrder(a[0], b[0]));
  const picked = shownItems.filter((row) => !typeWanted || row.category === typeWanted);
  type Row = (typeof picked)[number];
  const sections: { key: string; title: string; book?: string; type?: string; groups: [string, Row[]][] }[] = [];
  const grouped = new Map<string, Map<string, Row[]>>();
  for (const row of picked) {
    const head = groupBy === "type" ? row.category : row.book.id;
    const sub = groupBy === "type" ? (row.sub && row.sub !== row.category ? row.sub : "") : row.category;
    const inHead = grouped.get(head) ?? new Map<string, Row[]>();
    inHead.set(sub, [...(inHead.get(sub) ?? []), row]);
    grouped.set(head, inHead);
  }
  for (const [head, subs] of [...grouped].sort((a, b) => (groupBy === "type" ? categoryOrder(a[0], b[0]) : 0))) {
    const book = groupBy === "book" ? (books ?? []).find((item) => item.id === head) : undefined;
    sections.push({ key: head, title: book ? book.title || book.name : head, book: book?.name, type: groupBy === "type" ? head : undefined, groups: [...subs].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : groupBy === "book" ? categoryOrder(a[0], b[0]) : a[0].localeCompare(b[0]))) });
  }
  const openRecord = async (record: { name: string; data: { book: string; file: string; own?: boolean } }) => {
    setStatus(`Opening ${record.name}…`);
    try {
      await imageWindow.open?.({ book: record.data.book ?? "", file: record.data.file, name: record.name, own: record.data.own });
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
          <label className="images-maps-only" title="Only the maps (with a grid, walls or a map category)">
            <input type="checkbox" checked={mapsOnly} onChange={(event) => setMapsOnly(event.target.checked)} /> Maps only
          </label>
          {typeCounts.length > 1 ? (
            <select aria-label="Type" data-filter="type" value={typeWanted} onChange={(event) => setTypeWanted(event.target.value)} title="Show one kind of picture">
              <option value="">All kinds</option>
              {typeCounts.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          ) : null}
          {(books ?? []).length > 1 ? (
            <select aria-label="Book" data-filter="book" value={bookWanted} onChange={(event) => setBookWanted(event.target.value)} title="Show one book's">
              <option value="">All books</option>
              {(books ?? []).map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title || book.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="ghost" data-action="images-group" title={groupBy === "type" ? "Grouped by kind: click to group by book" : "Grouped by book: click to group by kind"} onClick={() => setGroupBy(groupBy === "type" ? "book" : "type")}>
            {groupBy === "type" ? "By kind" : "By book"}
          </button>
        </div>
        {status ? <p className="hint">{status}</p> : null}
        <div className="records-list">
          {campaignImages.length ? (
            <section data-images-book="campaign">
              <h4>This campaign</h4>
              <div className="library-maps">
                {campaignImages.map((record) => (
                  <button key={record.id} type="button" className="library-map" data-image={record.name} data-image-record={record.id} title={`Open ${record.name}`} onClick={() => void openRecord(record)}>
                    <img src={record.data.own ? session.ownPictureUrl(record.data.file) : session.bookUrl("picture", record.data.book, record.data.file)} alt="" loading="lazy" />
                    <span>{record.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {books && books.length === 0 ? <p className="hint empty-state"><b>No book is active</b>Make one active in Modules.</p> : null}
          {sections.map((section) => (
            <section key={section.key} data-images-book={section.book ?? section.key} data-images-type={section.type ?? undefined}>
              <h4>{section.title}</h4>
              {section.groups.map(([group, list]) => (
                <div key={group}>
                  {group ? <h5>{group}</h5> : null}
                  <div className="library-maps">
                    {list.map(({ item, book }) => (
                      <button key={`${book.id}|${item.path}`} type="button" className="library-map" data-image={item.name} title={`Open ${item.name} (only you see it until you put it in play)`} onClick={() => void open(book, item.name)}>
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
          ))}
        </div>
      </section>
    </div>
  );
}
