import { useEffect, useMemo, useState } from "react";
import type { BookContents, BookInfo, Session } from "../session/useSession";
import { imageWindow } from "../table/imageWindow";
import { Icon } from "../ui/icons";

// The GM's Assets: everything an active book, ruleset or art pack supplies, record or not, by kind (Maps,
// Images, Handouts, Portraits, Tokens, Music, Sounds, Video: how the book uses each file, else its folder) or by
// folder. A picture's preview: share it with the players, make it the table's background decal, or make it a
// map (it joins Campaign > Images and opens in the image window to edit, the same master wherever it is opened).
// Sounds and video play here, for the GM.
type Media = { file: string; kind: string };
type Picked = { book: BookInfo; file: string; kind: string };
const nameOf = (file: string) => file.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ") ?? file;
const KINDS: { id: string; icon: string; hint: string }[] = [
  { id: "Maps", icon: "map", hint: "Maps: battle maps, area and dungeon maps" },
  { id: "Images", icon: "eye", hint: "Pictures and illustrations" },
  { id: "Handouts", icon: "flag", hint: "Handouts to show the players" },
  { id: "Portraits", icon: "character", hint: "Portraits of creatures and characters" },
  { id: "Tokens", icon: "target", hint: "Tokens for the table" },
  { id: "Covers", icon: "book", hint: "The book's cover" },
  { id: "Music", icon: "music", hint: "Music" },
  { id: "Sounds", icon: "sound", hint: "Sounds and ambience" },
  { id: "Video", icon: "play", hint: "Video" },
];
const order = (kind: string) => (KINDS.findIndex((item) => item.id === kind) + 1 || 99);
const isAudio = (kind: string) => kind === "Music" || kind === "Sounds";
const isVideo = (file: string) => /\.(webm|mp4)$/i.test(file);

export function AssetsWindow({ session }: { session: Session }) {
  const [books, setBooks] = useState<BookInfo[] | null>(null);
  const [bookId, setBookId] = useState("");
  const [contents, setContents] = useState<Record<string, Media[]>>({});
  const [byFolder, setByFolder] = useState(false);
  const [kind, setKind] = useState("");
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [status, setStatus] = useState("");
  const shelfKey = `${session.bookShelf.active.join("|")}@${session.contentAt}`;
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[] }>("list")
      .then((result) => {
        const active = result.books.filter((book) => book.active);
        setBooks(active);
        setBookId((current) => (active.some((book) => book.id === current) ? current : active[0]?.id ?? ""));
      })
      .catch(() => setBooks([]));
    setContents({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfKey]);
  useEffect(() => {
    if (!bookId || contents[bookId]) return;
    session
      .bookFetch<BookContents>("contents", { book: bookId })
      .then((result) => setContents((current) => ({ ...current, [bookId]: result.media ?? (result.assets ?? result.pictures.map((item) => item.file)).map((file) => ({ file, kind: "Images" })) })))
      .catch(() => setContents((current) => ({ ...current, [bookId]: [] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, contents]);
  const book = books?.find((item) => item.id === bookId) ?? null;
  const media = useMemo(() => contents[bookId] ?? [], [contents, bookId]);
  // The kinds this book has, in order, with their counts (only those present).
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of media) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    return [...counts].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
  }, [media]);
  // One kind and a single-kind book open straight on their files.
  const shownKind = kind || (kinds.length === 1 ? kinds[0][0] : "");
  const view = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    const byName = (a: Media, b: Media) => a.file.localeCompare(b.file, undefined, { numeric: true });
    // A search: every file in the book that matches, whatever its kind or folder.
    if (wanted) return { folders: [], items: media.filter((item) => item.file.toLowerCase().includes(wanted)).sort(byName) };
    if (!byFolder) return { folders: [], items: shownKind ? media.filter((item) => item.kind === shownKind).sort(byName) : [] };
    const prefix = folder ? `${folder}/` : "";
    const folders = new Set<string>();
    const items: Media[] = [];
    for (const item of media) {
      if (!item.file.startsWith(prefix)) continue;
      const rest = item.file.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) folders.add(rest.slice(0, slash));
      else items.push(item);
    }
    return { folders: [...folders].sort(), items: items.sort(byName) };
  }, [media, byFolder, folder, search, shownKind]);
  const crumbs = byFolder ? (folder ? folder.split("/") : []) : shownKind && kinds.length > 1 ? [shownKind] : [];
  const goTo = (index: number) => (byFolder ? setFolder(crumbs.slice(0, index + 1).join("/")) : undefined);
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
      if (!kraken?.addDecal) throw new Error("Backgrounds are set in the Maelstrom VTT app.");
      const response = await fetch(session.bookUrl("picture", item.book.id, item.file));
      if (!response.ok) throw new Error("That picture could not be read.");
      const made = await kraken.addDecal(item.file.split("/").pop() || "decal.webp", new Uint8Array(await response.arrayBuffer()), "decal");
      session.setTableOptions({ decal: made.id });
    });
  const pick = (next: Partial<{ book: string; byFolder: boolean; kind: string; folder: string }>) => {
    if (next.book !== undefined) setBookId(next.book);
    if (next.byFolder !== undefined) setByFolder(next.byFolder);
    setKind(next.kind ?? "");
    setFolder(next.folder ?? "");
    setPicked(null);
  };
  const tile = (item: Media) => {
    const audio = isAudio(item.kind);
    return (
      <button key={item.file} type="button" className={picked?.file === item.file ? "asset on" : "asset"} data-asset={item.file} data-asset-kind={item.kind} title={item.file} onClick={() => book && setPicked({ book, file: item.file, kind: item.kind })}>
        {audio ? (
          <span className="asset-icon">
            <Icon name={item.kind === "Music" ? "music" : "sound"} size={36} />
          </span>
        ) : isVideo(item.file) ? (
          <video src={session.bookUrl("media", bookId, item.file)} muted preload="metadata" />
        ) : (
          <img src={session.bookUrl("picture", bookId, item.file)} alt="" loading="lazy" />
        )}
        <span>{nameOf(item.file)}</span>
      </button>
    );
  };
  const pictureOf = picked && !isAudio(picked.kind) && !isVideo(picked.file);
  return (
    <div className="assets-window" data-assets>
      <div className="assets-head">
        <select aria-label="Book" value={bookId} onChange={(event) => pick({ book: event.target.value })}>
          {(books ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.title || item.name}
            </option>
          ))}
        </select>
        <button type="button" className="ghost" data-action="assets-view" title={byFolder ? "By folder, as the book keeps them: click to show by kind" : "By kind (maps, images, tokens, sounds...): click to show by folder"} onClick={() => pick({ byFolder: !byFolder })}>
          {byFolder ? "By folder" : "By kind"}
        </button>
        <input type="search" placeholder="Search" aria-label="Search assets" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {books && books.length === 0 ? <p className="hint">No book is active: make your books and art packs active in Modules.</p> : null}
      {!search ? (
        <nav className="assets-crumbs" aria-label={byFolder ? "Folder" : "Kind"}>
          <button type="button" data-folder="" onClick={() => pick({})}>
            {book?.title || book?.name || "Book"}
          </button>
          {crumbs.map((name, index) => (
            <button key={index} type="button" data-folder={crumbs.slice(0, index + 1).join("/")} onClick={() => goTo(index)}>
              {name}
            </button>
          ))}
        </nav>
      ) : null}
      {status ? <p className="hint">{status}</p> : null}
      <div className="assets-body">
        {!byFolder && !search && !shownKind && kinds.length > 1 ? (
          <div className="books-kinds assets-kinds" role="list">
            {kinds.map(([name, count]) => {
              const known = KINDS.find((item) => item.id === name);
              return (
                <button key={name} type="button" role="listitem" className="books-kind-tile" data-asset-kind={name} title={known?.hint ?? name} onClick={() => pick({ kind: name })}>
                  <Icon name={known?.icon ?? "folder"} size={40} />
                  <b>{name}</b>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="assets-grid">
            {view.folders.map((name) => (
              <button key={name} type="button" className="asset-folder" data-asset-folder={name} onClick={() => setFolder(folder ? `${folder}/${name}` : name)}>
                <Icon name="open" size={22} />
                <span>{name}</span>
              </button>
            ))}
            {view.items.map(tile)}
            {books?.length && contents[bookId] && !view.folders.length && !view.items.length ? <p className="hint">Nothing here.</p> : null}
          </div>
        )}
        {picked ? (
          <aside className="asset-preview" data-asset-preview={picked.file}>
            <dl>
              <dt>Book</dt>
              <dd>{picked.book.title || picked.book.name}</dd>
              <dt>Kind</dt>
              <dd>{picked.kind}</dd>
              <dt>Path</dt>
              <dd>{picked.file.replace(/\/[^/]+$/, "")}</dd>
            </dl>
            {isAudio(picked.kind) ? (
              <audio key={picked.file} src={session.bookUrl("media", picked.book.id, picked.file)} controls autoPlay data-asset-audio />
            ) : isVideo(picked.file) ? (
              <video key={picked.file} src={session.bookUrl("media", picked.book.id, picked.file)} controls loop muted autoPlay />
            ) : (
              <img src={session.bookUrl("picture", picked.book.id, picked.file)} alt={nameOf(picked.file)} />
            )}
            <div className="asset-actions">
              {pictureOf && picked.kind !== "Tokens" && picked.kind !== "Portraits" ? (
                <button type="button" data-action="asset-map" title="Make it a map: it joins Campaign > Images and opens to edit (walls, doors, lights, paint), the same image wherever it is opened" onClick={() => void makeMap(picked)}>
                  Make it a map
                </button>
              ) : null}
              {pictureOf ? (
                <button type="button" data-action="asset-share" title="Show the players this picture (a tab on their screens)" onClick={() => void act("Sharing", async () => session.showImage(picked.book.id, picked.file, nameOf(picked.file)))}>
                  Share
                </button>
              ) : null}
              {pictureOf && picked.kind !== "Tokens" ? (
                <button type="button" data-action="asset-decal" title="The table's background decal (behind everything when no map is up)" onClick={() => void asDecal(picked)}>
                  Set as background
                </button>
              ) : null}
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
