import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { BookContents, BookInfo, BookPage, Session, ShownImage } from "../session/useSession";
import { Icon } from "../ui/icons";
import { useWindows } from "../ui/Windows";

// Books, as FG's Library: the Books window lists the campaign's active books
// (by category, with their covers), and Activation every module for its game;
// a book opens to its chapters and pages, with pictures and links; a picture
// or map opens in the Pictures window, a tab each. The players read only the
// books the GM opens to them (never an adventure); the GM shows them a
// picture or map with the share symbol, and it opens as a tab on their screens.

// The pictures open on this screen (tabs), besides those the GM has shown.
type Tab = { book: string; file: string; name: string };
const pictures = (() => {
  let tabs: Tab[] = [];
  let active = "";
  const listeners = new Set<() => void>();
  let snapshot = { tabs, active };
  const changed = () => {
    snapshot = { tabs, active };
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => snapshot,
    open(tab: Tab) {
      if (!tabs.some((item) => item.book === tab.book && item.file === tab.file)) tabs = [...tabs, tab];
      active = `${tab.book}|${tab.file}`;
      changed();
    },
    close(book: string, file: string) {
      tabs = tabs.filter((item) => !(item.book === book && item.file === file));
      if (active === `${book}|${file}`) active = tabs.length ? `${tabs.at(-1)!.book}|${tabs.at(-1)!.file}` : "";
      changed();
    },
    activate(key: string) {
      active = key;
      changed();
    },
  };
})();

// Which page a book opens at (a link to another book's page).
const startAt = new Map<string, string>();

function useBookWindows() {
  const windows = useWindows();
  return {
    openBook(book: string, title: string, page = "") {
      if (page) startAt.set(book, page);
      windows.open("book", title, book);
    },
    openPicture(tab: Tab) {
      pictures.open(tab);
      windows.open("images", "Pictures");
    },
  };
}

function ShareButton({ shared, onClick, what }: { shared: boolean; onClick: () => void; what: string }) {
  return (
    <button type="button" className={shared ? "share-button on" : "share-button"} aria-pressed={shared} title={shared ? `Shared with the players (click to stop sharing ${what})` : `Share ${what} with the players`} aria-label={shared ? `Stop sharing ${what}` : `Share ${what}`} data-share={what} onClick={onClick}>
      <Icon name="share" size={15} />
    </button>
  );
}

export function BooksWindow({ session, onOpenAdventure }: { session: Session; onOpenAdventure?: () => void }) {
  const gm = session.role === "dm";
  const { openBook } = useBookWindows();
  const [list, setList] = useState<BookInfo[] | null>(null);
  const [ruleset, setRuleset] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // The GM's: the campaign's books, or Activation (every module that fits the ruleset).
  const [tab, setTab] = useState<"books" | "activation">("books");
  const shelfKey = `${session.bookShelf.active.join("|")}/${session.bookShelf.shared.join("|")}`;
  useEffect(() => {
    session
      .bookFetch<{ books: BookInfo[]; ruleset: string }>("list")
      .then((result) => {
        setList(result.books);
        setRuleset(result.ruleset);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [session.bookFetch, shelfKey]);
  const activation = gm && tab === "activation";
  const shown = useMemo(() => {
    const wanted = search.toLowerCase();
    return (list ?? []).filter((item) => (activation || (item.hasBook && (!gm || item.active))) && (!wanted || `${item.title} ${item.category} ${item.ruleset}`.toLowerCase().includes(wanted)));
  }, [list, search, activation, gm]);
  const categories = useMemo(() => [...new Set(shown.map((item) => item.category))], [shown]);
  const empty = !gm
    ? "The GM has not shared any books yet."
    : search
      ? "No book has that name."
      : activation
        ? "No Fantasy Grounds modules for this campaign's game were found on this computer."
        : "No books are active in this campaign yet. Tick the ones to use under Activation.";
  return (
    <div className="books-window">
      {gm ? (
        <div className="books-top">
          <div className="sound-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "books"} className={tab === "books" ? "dice-chip on" : "dice-chip"} data-books-tab="books" onClick={() => setTab("books")}>
              Books
            </button>
            <button type="button" role="tab" aria-selected={tab === "activation"} className={tab === "activation" ? "dice-chip on" : "dice-chip"} data-books-tab="activation" onClick={() => setTab("activation")}>
              Activation
            </button>
          </div>
          {onOpenAdventure ? (
            <button type="button" className="ghost" data-launch="adventure" title="Open a prepared map bundle (.zip, or a zip holding several) on the table. You can also drop one on the table." onClick={onOpenAdventure}>
              <Icon name="open" size={15} /> Open a map bundle…
            </button>
          ) : null}
        </div>
      ) : null}
      {activation ? (
        <p className="hint">
          The modules for {ruleset || "this campaign's game"}. <b>Active</b>: in this campaign. <b>Players</b>: the players may read the book too (a Player's Handbook starts open to them). Adventures are the GM's alone: show the players their pictures and maps from the book instead.
        </p>
      ) : null}
      <div className="books-list" role="list">
        {error ? <p className="hint">{error}</p> : null}
        {list && shown.length === 0 ? <p className="hint">{empty}</p> : null}
        {!list && !error ? <p className="hint">Gathering the books…</p> : null}
        {categories.map((category) => (
          <section key={category} className="books-category">
            <h3>{category}</h3>
            {shown
              .filter((item) => item.category === category)
              .map((item) => (
                <div key={item.id} className={activation && !item.active ? "books-row off" : "books-row"} role="listitem">
                  <button type="button" className="books-open" data-book={item.id} title={item.author || item.title} onClick={() => openBook(item.id, item.title)}>
                    {item.cover ? <img src={session.bookUrl("cover", item.id)} alt="" loading="lazy" /> : <span className="books-cover-none"><Icon name="book" size={22} /></span>}
                    <span>
                      <b>{item.title}</b>
                      <small>
                        {item.ruleset || "Any game"}
                        {item.hasBook ? "" : " · no book (pictures, tokens)"}
                      </small>
                    </span>
                  </button>
                  {activation ? (
                    <span className="books-ticks">
                      <label title="Use it in this campaign">
                        <input type="checkbox" checked={item.active} data-activate={item.id} onChange={(event) => session.activateBook(item.id, event.target.checked)} /> Active
                      </label>
                      {item.hasBook && !item.adventure ? (
                        <label title={item.forPlayers ? "A players' book" : "The GM's book (it may hold spoilers)"}>
                          <input type="checkbox" checked={item.shared} disabled={!item.active} data-players={item.id} onChange={(event) => session.shareBook(item.id, event.target.checked)} /> Players
                        </label>
                      ) : (
                        <span className="books-gm-only" title={item.adventure ? "An adventure is the GM's alone; show the players its pictures and maps" : "No book to read"}>
                          {item.adventure ? "GM only" : ""}
                        </span>
                      )}
                    </span>
                  ) : gm && item.shared ? (
                    <span className="books-players" title="The players may read it (Activation)">Players</span>
                  ) : null}
                </div>
              ))}
          </section>
        ))}
      </div>
      <input type="search" className="books-search" placeholder="Search" aria-label="Search books" value={search} onChange={(event) => setSearch(event.target.value)} />
    </div>
  );
}

export function BookWindow({ session, book }: { session: Session; book: string }) {
  const gm = session.role === "dm";
  const { openBook, openPicture } = useBookWindows();
  const [contents, setContents] = useState<BookContents | null>(null);
  const [error, setError] = useState("");
  const [pageId, setPageId] = useState(startAt.get(book) ?? "");
  const [page, setPage] = useState<BookPage | null>(null);
  const [view, setView] = useState<"book" | "pictures">("book");
  const [search, setSearch] = useState("");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    session
      .bookFetch<BookContents>("contents", { book })
      .then((found) => {
        setContents(found);
        if (!found.chapters.length) setView("pictures");
        setPageId((current) => current || found.chapters[0]?.sections[0]?.pages[0]?.id || "");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [book, session.bookFetch]);
  // A link from another book asks for a page here.
  useEffect(() => {
    const wanted = startAt.get(book);
    if (wanted) {
      startAt.delete(book);
      setPageId(wanted);
      setView("book");
    }
  });
  useEffect(() => {
    if (!pageId) return;
    session
      .bookFetch<BookPage>("page", { book, page: pageId })
      .then((found) => {
        setPage(found);
        body.current?.scrollTo({ top: 0 });
      })
      .catch((reason: Error) => setError(reason.message));
  }, [book, pageId, session.bookFetch]);
  const pages = useMemo(() => contents?.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.pages)) ?? [], [contents]);
  const at = pages.findIndex((item) => item.id === pageId);
  const wanted = search.toLowerCase();
  const fits = (item: { name: string; keywords: string }) => !wanted || `${item.name} ${item.keywords}`.toLowerCase().includes(wanted);
  const shownPicture = (file: string) => session.bookShelf.images.find((item) => item.book === book && item.file === file);
  const toggleShown = (file: string, name: string) => {
    const shown = shownPicture(file);
    if (shown) session.hideImage(shown.id);
    else session.showImage(book, file, name);
  };
  // Links in a page: another page (here or in another book), or a picture.
  const follow = (event: React.MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a.book-link") as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    const target = link.dataset;
    if (target.page && target.book === book) {
      setPageId(target.page);
      setView("book");
    } else if (target.page && target.book) openBook(target.book, target.book, target.page);
    else if (target.file && target.book) openPicture({ book: target.book, file: target.file, name: target.name || link.textContent || "Picture" });
  };
  if (error && !contents) return <p className="hint">{error}</p>;
  if (!contents) return <p className="hint">Opening the book…</p>;
  return (
    <div className="book-window">
      <aside className="book-index">
        <div className="sound-tabs" role="tablist">
          {contents.chapters.length ? (
            <button type="button" role="tab" aria-selected={view === "book"} className={view === "book" ? "dice-chip on" : "dice-chip"} data-book-view="book" onClick={() => setView("book")}>
              Book
            </button>
          ) : null}
          <button type="button" role="tab" aria-selected={view === "pictures"} className={view === "pictures" ? "dice-chip on" : "dice-chip"} data-book-view="pictures" onClick={() => setView("pictures")}>
            Images &amp; Maps <small>{contents.pictures.length}</small>
          </button>
        </div>
        <div className="book-toc">
          {view === "book"
            ? contents.chapters.map((chapter, index) => {
                const sections = chapter.sections.map((section) => ({ ...section, pages: section.pages.filter(fits) })).filter((section) => section.pages.length);
                if (!sections.length) return null;
                return (
                  <div key={`${chapter.name}-${index}`} className="book-chapter">
                    <h3>{chapter.name}</h3>
                    {sections.map((section, inner) => (
                      <div key={`${section.name}-${inner}`} className="book-section">
                        {section.name && section.name !== chapter.name ? <h4>{section.name}</h4> : null}
                        {section.pages.map((item) => (
                          <button key={item.id} type="button" className={item.id === pageId ? "book-page-link on" : "book-page-link"} data-page={item.id} onClick={() => setPageId(item.id)}>
                            {item.name}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })
            : contents.pictures
                .filter((item) => !wanted || `${item.name} ${item.category}`.toLowerCase().includes(wanted))
                .map((item) => (
                  <div key={item.file} className="book-picture-row">
                    <button type="button" className="book-page-link" data-picture={item.file} onClick={() => openPicture({ book, file: item.file, name: item.name })}>
                      {item.name}
                      {item.category ? <small>{item.category}</small> : null}
                    </button>
                    {gm ? <ShareButton shared={Boolean(shownPicture(item.file))} what={item.name} onClick={() => toggleShown(item.file, item.name)} /> : null}
                  </div>
                ))}
        </div>
        <input type="search" className="books-search" placeholder="Search" aria-label="Search this book" value={search} onChange={(event) => setSearch(event.target.value)} />
      </aside>
      <article className="book-page" ref={body} onClick={follow}>
        {view === "pictures" ? (
          <p className="hint">Open a picture or map to see it{gm ? "; the share symbol shows it to the players, as a tab on their screens" : ""}.</p>
        ) : page ? (
          <>
            <h2>{page.name}</h2>
            {page.blocks.map((block, index) =>
              block.kind === "picture" ? (
                <figure key={index} className={`book-figure ${block.align}`}>
                  <button type="button" className="book-figure-open" title="Open it in Pictures" onClick={() => openPicture({ book, file: block.file, name: block.name || block.caption || page.name })}>
                    <img src={session.bookUrl("picture", book, block.file)} alt={block.caption} loading="lazy" style={{ maxWidth: `${Math.min(100, block.scale)}%` }} />
                  </button>
                  {block.caption ? <figcaption>{block.caption}</figcaption> : null}
                  {gm ? <ShareButton shared={Boolean(shownPicture(block.file))} what={block.name || block.caption || "this picture"} onClick={() => toggleShown(block.file, block.name || block.caption || page.name)} /> : null}
                </figure>
              ) : (
                <div key={index} className={block.frame ? `book-text framed ${block.frame}` : "book-text"} dangerouslySetInnerHTML={{ __html: block.html }} />
              ),
            )}
            <nav className="book-turn">
              <button type="button" disabled={at <= 0} aria-label="Previous page" onClick={() => setPageId(pages[at - 1].id)}>
                ‹ {at > 0 ? pages[at - 1].name : ""}
              </button>
              <button type="button" disabled={at < 0 || at >= pages.length - 1} aria-label="Next page" onClick={() => setPageId(pages[at + 1].id)}>
                {at >= 0 && at < pages.length - 1 ? pages[at + 1].name : ""} ›
              </button>
            </nav>
          </>
        ) : (
          <p className="hint">Opening the page…</p>
        )}
      </article>
    </div>
  );
}

// Pictures: a tab for each picture the GM has shown, and each opened here.
export function ImagesWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const local = useSyncExternalStore(pictures.subscribe, pictures.get);
  const shown = session.bookShelf.images;
  const keyOf = (item: { book: string; file: string }) => `${item.book}|${item.file}`;
  const tabs: (Tab & { shown?: ShownImage })[] = [...shown.map((item) => ({ book: item.book, file: item.file, name: item.name, shown: item })), ...local.tabs.filter((tab) => !shown.some((item) => keyOf(item) === keyOf(tab)))];
  // A picture the GM has just shown comes to the front.
  useEffect(() => {
    const latest = shown.find((item) => item.id === session.imageShown?.id);
    if (latest) pictures.activate(keyOf(latest));
  }, [session.imageShown]);
  const active = tabs.find((tab) => keyOf(tab) === local.active) ?? tabs.at(-1);
  if (!active) return <p className="hint">{gm ? "Open a picture or map from a book." : "The GM has not shown you any pictures yet."}</p>;
  return (
    <div className="images-window">
      <div className="images-tabs" role="tablist">
        {tabs.map((tab) => (
          <div key={keyOf(tab)} className={keyOf(tab) === keyOf(active) ? "images-tab on" : "images-tab"} role="tab" aria-selected={keyOf(tab) === keyOf(active)}>
            <button type="button" data-image-tab={tab.name} onClick={() => pictures.activate(keyOf(tab))}>
              {gm && tab.shown ? <Icon name="share" size={12} /> : null} {tab.name}
            </button>
            {gm || !tab.shown ? (
              <button
                type="button"
                className="images-tab-close"
                aria-label={`Close ${tab.name}`}
                title={tab.shown ? "Stop showing it to the players" : "Close"}
                onClick={() => (tab.shown ? session.hideImage(tab.shown.id) : pictures.close(tab.book, tab.file))}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="images-view">
        {gm ? (
          <div className="images-share">
            <ShareButton shared={Boolean(active.shown)} what={active.name} onClick={() => (active.shown ? session.hideImage(active.shown.id) : session.showImage(active.book, active.file, active.name))} />
            <span>{active.shown ? "Shown to the players" : "Not shared"}</span>
          </div>
        ) : null}
        <img src={session.bookUrl("picture", active.book, active.file)} alt={active.name} data-image={active.file} />
      </div>
    </div>
  );
}
