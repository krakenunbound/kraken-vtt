import { useEffect, useMemo, useState } from "react";
import type { BookContents, BookInfo, Session } from "../session/useSession";
import { imageWindow } from "../table/imageWindow";
import { Icon } from "../ui/icons";

// The GM's Assets (FG's): every picture of every active book and art pack, by
// book and folder, record or not (Blender Props Test's props, a book's
// art). A picture's preview: share it with the players, make it the table's
// background decal, or make it a map: it joins Campaign > Images and opens in
// the image window, unlocked, to edit (the same master wherever it is opened).
type Picked = { book: BookInfo; file: string };
const nameOf = (file: string) => file.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ") ?? file;

export function AssetsWindow({ session }: { session: Session }) {
  const [books, setBooks] = useState<BookInfo[] | null>(null);
  const [bookId, setBookId] = useState("");
  const [contents, setContents] = useState<Record<string, string[]>>({});
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [status, setStatus] = useState("");
  const shelfKey = session.bookShelf.active.join("|");
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[] }>("list")
      .then((result) => {
        const active = result.books.filter((book) => book.active);
        setBooks(active);
        setBookId((current) => (active.some((book) => book.id === current) ? current : active[0]?.id ?? ""));
      })
      .catch(() => setBooks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfKey]);
  useEffect(() => {
    if (!bookId || contents[bookId]) return;
    session
      .bookFetch<BookContents>("contents", { book: bookId })
      .then((result) => setContents((current) => ({ ...current, [bookId]: result.assets ?? result.pictures.map((item) => item.file) })))
      .catch(() => setContents((current) => ({ ...current, [bookId]: [] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);
  const book = books?.find((item) => item.id === bookId) ?? null;
  const files = contents[bookId] ?? [];
  // The folder's own folders and pictures (a search looks through them all).
  const view = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    if (wanted) return { folders: [], pictures: files.filter((file) => file.toLowerCase().includes(wanted)) };
    const prefix = folder ? `${folder}/` : "";
    const folders = new Set<string>();
    const pictures: string[] = [];
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) folders.add(rest.slice(0, slash));
      else pictures.push(file);
    }
    return { folders: [...folders].sort(), pictures: pictures.sort() };
  }, [files, folder, search]);
  const crumbs = folder ? folder.split("/") : [];
  const act = async (what: string, run: () => Promise<unknown>) => {
    setStatus(`${what}…`);
    try {
      await run();
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not ${what.toLowerCase()}.`);
    }
  };
  const makeMap = (item: Picked) =>
    act("Making it a map", async () => {
      const name = nameOf(item.file);
      // A map record of the campaign's own (Campaign > Images), the picture its master.
      const mine = Object.values(session.records).find((record) => record.type === "image" && (record.data as { book?: string; file?: string })?.file === item.file && (record.data as { book?: string })?.book === item.book.id);
      if (!mine) await session.op({ op: "create", input: { type: "image", name, visibility: "gm", data: { book: item.book.id, file: item.file } } });
      await imageWindow.open?.({ book: item.book.id, file: item.file, name });
    });
  const asDecal = (item: Picked) =>
    act("Setting the background", async () => {
      const kraken = window.kraken;
      if (!kraken?.addDecal) throw new Error("Backgrounds are set in the Kraken VTT app.");
      const response = await fetch(session.bookUrl("picture", item.book.id, item.file));
      if (!response.ok) throw new Error("That picture could not be read.");
      const made = await kraken.addDecal(item.file.split("/").pop() || "decal.webp", new Uint8Array(await response.arrayBuffer()), "decal");
      session.setTableOptions({ decal: made.id });
    });
  return (
    <div className="assets-window" data-assets>
      <div className="assets-head">
        <select aria-label="Book" value={bookId} onChange={(event) => (setBookId(event.target.value), setFolder(""), setPicked(null))}>
          {(books ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.title || item.name}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Search" aria-label="Search assets" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {books && books.length === 0 ? <p className="hint">No book is active: make your books and art packs active in Modules.</p> : null}
      <nav className="assets-crumbs" aria-label="Folder">
        <button type="button" data-folder="" onClick={() => setFolder("")}>
          {book?.title || book?.name || "Book"}
        </button>
        {crumbs.map((name, index) => (
          <button key={index} type="button" data-folder={crumbs.slice(0, index + 1).join("/")} onClick={() => setFolder(crumbs.slice(0, index + 1).join("/"))}>
            {name}
          </button>
        ))}
      </nav>
      {status ? <p className="hint">{status}</p> : null}
      <div className="assets-body">
        <div className="assets-grid">
          {view.folders.map((name) => (
            <button key={name} type="button" className="asset-folder" data-asset-folder={name} onClick={() => setFolder(folder ? `${folder}/${name}` : name)}>
              <Icon name="open" size={22} />
              <span>{name}</span>
            </button>
          ))}
          {view.pictures.map((file) => (
            <button key={file} type="button" className={picked?.file === file ? "asset on" : "asset"} data-asset={file} title={file} onClick={() => book && setPicked({ book, file })}>
              <img src={session.bookUrl("picture", bookId, file)} alt="" loading="lazy" />
              <span>{nameOf(file)}</span>
            </button>
          ))}
          {books?.length && !view.folders.length && !view.pictures.length ? <p className="hint">No pictures here.</p> : null}
        </div>
        {picked ? (
          <aside className="asset-preview" data-asset-preview={picked.file}>
            <dl>
              <dt>Book</dt>
              <dd>{picked.book.title || picked.book.name}</dd>
              <dt>Path</dt>
              <dd>{picked.file.replace(/\/[^/]+$/, "")}</dd>
            </dl>
            <img src={session.bookUrl("picture", picked.book.id, picked.file)} alt={nameOf(picked.file)} />
            <div className="asset-actions">
              <button type="button" data-action="asset-map" title="Make it a map: it joins Campaign > Images and opens to edit (walls, doors, lights, paint), the same image wherever it is opened" onClick={() => void makeMap(picked)}>
                Make it a map
              </button>
              <button type="button" data-action="asset-share" title="Show the players this picture (a tab on their screens)" onClick={() => void act("Sharing", async () => session.showImage(picked.book.id, picked.file, nameOf(picked.file)))}>
                Share
              </button>
              <button type="button" data-action="asset-decal" title="The table's background decal (behind everything when no map is up)" onClick={() => void asDecal(picked)}>
                Set as background
              </button>
              <button type="button" className="ghost" onClick={() => setPicked(null)}>
                Close
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
