import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { shelfTree } from "../../shared/packs/organize.mjs";
import { createPortal } from "react-dom";
import type { BookContents, BookInfo, BookSoundRef, Session, ShownImage, SoundLibrary } from "../session/useSession";
import { Icon } from "../ui/icons";
import { useWindows } from "../ui/Windows";
import { sound } from "../sound/soundEngine";
import { slotDrag } from "../ui/QuickSlots";
import { PacksPanel } from "./Packs";
import { imageWindow } from "../table/imageWindow";
import { useReadAloudFrames } from "./readAloud";
import { BookPages } from "./BookPages";

// Books, as FG's Library: the Books window lists the campaign's active books
// (by category, with their covers), and Activation every module for its game;
// a book opens to its chapters and pages, with pictures and links; a picture
// or map opens in the Pictures window, a tab each. The players read only the
// books the GM opens to them (never an adventure); the GM shows them a
// picture or map with the share symbol, and it opens as a tab on their screens.

// The pictures open on this screen (tabs), besides those the GM has shown;
// which are out in a window of their own; and which shown ones this screen
// closed (a shown picture comes back when the GM shows it again).
type Tab = { book: string; file: string; name: string };
const keyOf = (item: { book: string; file: string }) => `${item.book}|${item.file}`;
const pictures = (() => {
  let tabs: Tab[] = [];
  let active = "";
  let out = new Set<string>();
  let hidden = new Set<string>();
  const listeners = new Set<() => void>();
  let snapshot = { tabs, active, out, hidden };
  const changed = () => {
    snapshot = { tabs, active, out, hidden };
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => snapshot,
    open(tab: Tab) {
      if (!tabs.some((item) => keyOf(item) === keyOf(tab))) tabs = [...tabs, tab];
      active = keyOf(tab);
      hidden = new Set([...hidden].filter((key) => key !== keyOf(tab)));
      changed();
    },
    close(key: string) {
      tabs = tabs.filter((item) => keyOf(item) !== key);
      out = new Set([...out].filter((item) => item !== key));
      hidden = new Set([...hidden, key]);
      if (active === key) active = tabs.length ? keyOf(tabs.at(-1)!) : "";
      changed();
    },
    setOut(key: string, on: boolean) {
      out = new Set(on ? [...out, key] : [...out].filter((item) => item !== key));
      changed();
    },
    unhide(key: string) {
      hidden = new Set([...hidden].filter((item) => item !== key));
      changed();
    },
    activate(key: string) {
      active = key;
      changed();
    },
  };
})();

// A right-click menu, in whichever window was clicked (a popped-out one too).
export type MenuItem = { label: string; run: () => void; icon?: string };
export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; doc: Document } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (event.target as HTMLElement | null)?.closest?.(".context-menu")) return;
      setMenu(null);
    };
    menu.doc.addEventListener("pointerdown", close, true);
    menu.doc.addEventListener("keydown", close, true);
    return () => {
      menu.doc.removeEventListener("pointerdown", close, true);
      menu.doc.removeEventListener("keydown", close, true);
    };
  }, [menu]);
  return {
    show(event: React.MouseEvent, items: MenuItem[]) {
      event.preventDefault();
      event.stopPropagation();
      const doc = (event.currentTarget as HTMLElement).ownerDocument;
      const view = doc.defaultView ?? window;
      setMenu({ x: Math.min(event.clientX, view.innerWidth - 220), y: Math.min(event.clientY, view.innerHeight - items.length * 34 - 12), items, doc });
    },
    element: menu
      ? createPortal(
          <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
            {menu.items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                data-menu={item.label}
                onClick={() => {
                  setMenu(null);
                  item.run();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={14} /> : <span className="context-menu-gap" />} {item.label}
              </button>
            ))}
          </div>,
          menu.doc.body,
        )
      : null,
  };
}

// What can be done with a picture or map, wherever it is: open it in
// Pictures, put it out on its own (a window of its own, so a map stays up
// while the book is read) or back in, share it or stop (the GM), close it.
export function usePictureActions(session: Session) {
  const windows = useWindows();
  const gm = session.role === "dm";
  const shownOf = (tab: Tab) => session.bookShelf.images.find((item) => keyOf(item) === keyOf(tab));
  const toPictures = (tab: Tab) => {
    pictures.open(tab);
    windows.open("images", "Pictures");
  };
  const outOnItsOwn = (tab: Tab) => {
    pictures.open(tab);
    pictures.setOut(keyOf(tab), true);
    windows.open("picture", tab.name, keyOf(tab));
  };
  const backIn = (tab: Tab) => {
    pictures.setOut(keyOf(tab), false);
    windows.close(`picture:${keyOf(tab)}`);
    toPictures(tab);
  };
  const close = (tab: Tab) => {
    pictures.close(keyOf(tab));
    windows.close(`picture:${keyOf(tab)}`);
  };
  const items = (tab: Tab, where: "book" | "tab" | "own"): MenuItem[] => {
    const shown = shownOf(tab);
    const list: MenuItem[] = [];
    if (where === "book") list.push({ label: "Open in Pictures", icon: "eye", run: () => toPictures(tab) });
    if (where !== "own") list.push({ label: "Out on its own", icon: "popout", run: () => outOnItsOwn(tab) });
    else list.push({ label: "Back in", icon: "dock", run: () => backIn(tab) });
    if (gm) list.push(shown ? { label: "Stop sharing", icon: "eye-off", run: () => session.hideImage(shown.id) } : { label: "Share with the players", icon: "share", run: () => session.showImage(tab.book, tab.file, tab.name) });
    // FG's share with one: shown to that player alone (more can be added; Share with the players shows everyone).
    if (gm && (!shown || shown.to))
      for (const seat of session.players.filter((item) => item.role === "player" && !shown?.to?.some((name) => name.toLowerCase() === item.name.toLowerCase())))
        list.push({ label: `Show to ${seat.name}`, icon: "character", run: () => session.showImage(tab.book, tab.file, tab.name, [seat.name]) });
    if (gm && shown?.to && shown.to.length) list.push({ label: "Share with everyone", icon: "share", run: () => session.showImage(tab.book, tab.file, tab.name) });
    if (where !== "book") list.push({ label: "Close", icon: "close", run: () => close(tab) });
    return list;
  };
  return { toPictures, outOnItsOwn, backIn, close, items, shownOf };
}

// Sounds in the story, as FG's: the book's own sound links (Syrinscape's in
// FG) play Kraken's sound of that kind and name, or the one the GM dropped on
// them; a sound dropped between paragraphs sits there, a play button.
const SOUND_DRAG = "text/kraken-sound";
const STOP_WORDS = new Set(["ambience", "music", "sound", "sounds", "sfx", "the", "and", "of", "effect", "mood", "loop", "element"]);
function matchSound(name: string, kind: string, groups: { id: string }[]) {
  const words = name.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  let best = "";
  let score = 0;
  for (const group of groups) {
    if (!group.id.startsWith(`${kind}/`)) continue;
    const theirs = group.id.toLowerCase().split(/[^a-z]+/);
    const fit = words.filter((word) => theirs.some((other) => other === word || (other.length > 3 && (other.startsWith(word) || word.startsWith(other))))).length;
    if (fit > score) {
      score = fit;
      best = group.id;
    }
  }
  return best;
}
function playForTable(session: Session, ref: BookSoundRef) {
  if (ref.kind === "ambience") session.soundCommand({ type: "ambience", action: "add", id: ref.sound });
  else if (ref.kind === "music") session.soundCommand({ type: "music", action: "play", id: ref.sound });
  else session.soundCommand({ type: "sound-play", id: ref.sound });
}
function stopForTable(session: Session, ref: BookSoundRef) {
  if (ref.kind === "ambience") {
    for (const loop of session.soundscape.ambience.filter((item) => item.id === ref.sound || item.id.startsWith(`${ref.sound}/`))) session.soundCommand({ type: "ambience", action: "remove", id: loop.id });
  } else if (ref.kind === "music") session.soundCommand({ type: "music", action: "stop" });
  else session.soundCommand({ type: "sound-stop", id: ref.sound });
  sound.stop(ref.sound);
}
function BookSound({ session, item, onRemove }: { session: Session; item: BookSoundRef & { id: string }; onRemove: () => void }) {
  useSyncExternalStore(sound.subscribe, sound.playingNow);
  const on = sound.isPlaying(item.sound);
  return (
    <span className={on ? "book-sound playing" : "book-sound"} data-book-sound={item.sound} {...slotDrag({ kind: "sound", sound: item.sound, soundKind: item.kind, label: item.label })}>
      <button type="button" className="book-sound-play" aria-label={on ? `Stop ${item.label}` : `Play ${item.label}`} aria-pressed={on} title={on ? "Stop it" : "Play it for the table"} onClick={() => (on ? stopForTable(session, item) : playForTable(session, item))}>
        {on ? "\u25a0" : "\u25b6"}
      </button>
      <Icon name={item.kind === "music" ? "music" : "sound"} size={13} />
      <span>{item.label}</span>
      <button type="button" className="book-sound-remove" aria-label={`Take ${item.label} out of the story`} title="Take it out of the story" onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

// Which page a book opens at (a link to another book's page).
const startAt = new Map<string, string>();

export function useBookWindows() {
  const windows = useWindows();
  return {
    openBook(book: string, title: string, page = "") {
      if (page) startAt.set(book, page);
      windows.open("book", title, book);
    },
    // A record a page links to (a creature, spell, item...), in a window of its own (FG's link window).
    openRecord(book: string, path: string, name: string) {
      windows.open("bookrecord", name || "Record", `${book}|${path}`);
    },
    openPicture(tab: Tab) {
      // The GM: every picture opens in the image window, its one master (to
      // share, edit and test), wherever it was clicked. A player: the viewer.
      if (imageWindow.open) {
        // Should it fail, the picture still opens (in the viewer): never a dead end.
        void imageWindow.open({ book: tab.book, file: tab.file, name: tab.name }).catch(() => {
          pictures.open(tab);
          windows.open("images", "Pictures");
        });
        return;
      }
      // Out on its own already: that window comes to the front.
      if (pictures.get().out.has(keyOf(tab))) windows.open("picture", tab.name, keyOf(tab));
      else {
        pictures.open(tab);
        windows.open("images", "Pictures");
      }
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

export function BooksWindow({ session, onOpenAdventure, start = "books" }: { session: Session; onOpenAdventure?: () => void; start?: "books" | "activation" | "packs" }) {
  const gm = session.role === "dm";
  const { openBook } = useBookWindows();
  const [list, setList] = useState<BookInfo[] | null>(null);
  const [ruleset, setRuleset] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Two windows, as FG's: Modules (the GM's: Activation, every module that
  // fits the ruleset, and Packs) and Books (only the campaign's active books;
  // a player, only those the GM opened to them).
  const modules = start !== "books";
  const [tab, setTab] = useState<"books" | "activation" | "packs">(start);
  // Packs are made by the GM's own app (the host), from the FG modules on its computer.
  const canPack = gm && typeof window !== "undefined" && Boolean(window.kraken?.packs);
  const shelfKey = `${session.bookShelf.active.join("|")}/${session.bookShelf.shared.join("|")}@${session.contentAt}`;
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
  // Filed as kind > group > book > its parts (shared/packs/organize.mjs), each kind with its icon.
  const tree = useMemo(() => shelfTree(shown) as ShelfKind[], [shown]);
  // The kind opened (its books' covers), "" the kinds' tiles; a kind that no longer has books goes back to the tiles.
  const [openKind, setOpenKind] = useState("");
  // The covers straight away, no kind tiles: in Books (the campaign's active books), or a shelf of a dozen or fewer, or of one kind.
  const direct = !activation || shown.length <= 12 || tree.length === 1;
  useEffect(() => {
    if (openKind && !tree.some((kind) => kind.id === openKind)) setOpenKind("");
  }, [tree, openKind]);
  const empty = !gm
    ? "The GM has not shared any books yet."
    : search
      ? "No book has that name."
      : activation
        ? "No books for this campaign's game yet: add packs (Folders, or Modules > Packs)."
        : "No books are active in this campaign yet. Make them active in Modules.";
  return (
    <div className="books-window">
      {gm && modules ? (
        <div className="books-top">
          <div className="sound-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "activation"} className={tab === "activation" ? "dice-chip on" : "dice-chip"} data-books-tab="activation" onClick={() => setTab("activation")}>
              Activation
            </button>
            {canPack ? (
              <button type="button" role="tab" aria-selected={tab === "packs"} className={tab === "packs" ? "dice-chip on" : "dice-chip"} data-books-tab="packs" title="Your books in Maelstrom's own files (.kpack), to use on any computer" onClick={() => setTab("packs")}>
                Packs
              </button>
            ) : null}
          </div>
          {onOpenAdventure ? (
            <button type="button" className="ghost" data-launch="adventure" title="Open a prepared map bundle (.zip, or a zip holding several) on the table. You can also drop one on the table." onClick={onOpenAdventure}>
              <Icon name="open" size={15} /> Open a map bundle…
            </button>
          ) : null}
        </div>
      ) : null}
      {gm && tab === "packs" && canPack ? <PacksPanel ruleset={ruleset} /> : null}
      {gm && tab === "packs" ? null : activation ? (
        <p className="hint books-intro" title="A Player's Handbook starts open to the players. Adventures are the GM's alone: show the players their pictures and maps from the book instead.">
          The modules for {ruleset || "this campaign's game"}. <b>Active</b> puts a book in this campaign; <b>Players</b> lets the players read it too. Adventures stay the GM's.
        </p>
      ) : null}
      <div className="books-list" role="list" hidden={gm && tab === "packs"}>
        {error ? <p className="hint">{error}</p> : null}
        {list && shown.length === 0 ? <p className="hint">{empty}</p> : null}
        {!list && !error ? <p className="hint">Gathering the books…</p> : null}
        {/* As FG's library: the kinds as tiles; a kind opened shows its books as covers, by series; a search shows
            every book that matches, whatever its kind. */}
        {list && shown.length > 0 && !search && !openKind && !direct ? (
          <div className="books-kinds" role="list">
            {tree.map((kind) => (
              <button key={kind.id} type="button" role="listitem" className="books-kind-tile" data-kind={kind.id} title={kind.hint} onClick={() => setOpenKind(kind.id)}>
                <Icon name={kind.icon} size={40} />
                <b>{kind.label}</b>
                <small>{kind.count}</small>
              </button>
            ))}
          </div>
        ) : null}
        {list && shown.length > 0 && (search || openKind || direct) ? (
          <div className="books-shelf">
            {!search && !direct ? (
              <div className="books-shelf-top">
                <button type="button" className="ghost" data-action="books-back" title="All kinds" onClick={() => setOpenKind("")}>
                  <span aria-hidden="true">&#8249;</span> Back
                </button>
                <b>{tree.find((kind) => kind.id === openKind)?.label ?? ""}</b>
              </div>
            ) : null}
            {tree
              .filter((kind) => search || direct || kind.id === openKind)
              .map((kind) => [
                // With every kind on one page (Books, a short shelf, a search): each kind under its own heading.
                search || direct ? (
                  <h3 key={`${kind.id}-head`} className="books-kind-head" data-kind={kind.id}>
                    <Icon name={kind.icon} size={18} /> {kind.label}
                  </h3>
                ) : null,
                ...kind.groups.map((group) => (
                  <section key={`${kind.id}/${group.name}`} className="books-series" data-group={group.name}>
                    {group.name ? <h4>{group.name}</h4> : null}
                    <div className="books-grid" role="list">
                      {group.books.map((book) => (
                        <Fragment key={book.item.id}>
                          {tile(book.item, false)}
                          {book.parts.map((part) => (
                            <Fragment key={part.item.id}>{tile(part.item, true)}</Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  </section>
                )),
              ])}
          </div>
        ) : null}
      </div>
      <input type="search" className="books-search" hidden={gm && tab === "packs"} placeholder="Search" aria-label="Search books" value={search} onChange={(event) => setSearch(event.target.value)} />
    </div>
  );
  // A book as FG's library shows it: its cover, its title under it, and (Activation) whether it is in use.
  function tile(item: BookInfo, part: boolean) {
    const off = activation && !item.active;
    return (
      <div key={item.id} className={`books-tile${off ? " off" : ""}${part ? " part" : ""}${item.active ? " is-active" : ""}`} role="listitem">
        <button
          type="button"
          className={off ? "books-open inactive" : "books-open"}
          data-book={item.id}
          data-pack={item.pack ? "1" : undefined}
          title={off ? `${item.title}: make it active to open it (an inactive book's pages, pictures and maps are off limits)` : `${item.title}${item.author ? ` (${item.author})` : ""}${item.pack ? " · Maelstrom pack" : ""}${item.hasBook ? "" : ": no book to read, its pictures and tokens"}`}
          onClick={() => (!activation || item.active) && openBook(item.id, item.title)}
          {...(!activation || item.active ? slotDrag({ kind: "book", book: item.id, label: item.title }) : {})}
        >
          {item.cover ? <img src={session.bookUrl("cover", item.id)} alt="" loading="lazy" /> : <span className="books-cover-none"><Icon name="book" size={32} /></span>}
          <span className="books-tile-name">{item.title}</span>
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
            ) : item.adventure ? (
              <span className="books-gm-only" title="An adventure is the GM's alone; show the players its pictures and maps">
                GM only
              </span>
            ) : null}
          </span>
        ) : gm && item.shared ? (
          <span className="books-players" title="The players may read it (Activation)">
            Players
          </span>
        ) : null}
      </div>
    );
  }
}
type ShelfKind = { id: string; label: string; icon: string; hint: string; count: number; groups: { name: string; books: { item: BookInfo; parts: { item: BookInfo }[] }[] }[] };

// A page with no sounds of its own (one object, so it never looks changed).
const NO_SOUNDS = { links: {}, blocks: [] };

export function BookWindow({ session, book }: { session: Session; book: string }) {
  const gm = session.role === "dm";
  const { openBook, openPicture, openRecord } = useBookWindows();
  const actions = usePictureActions(session);
  const menu = useContextMenu();
  const [contents, setContents] = useState<BookContents | null>(null);
  const [error, setError] = useState("");
  const [pageId, setPageId] = useState(startAt.get(book) ?? "");
  // The page being read now (the section's pages scroll as one; the contents follow it), and a jump asked for.
  const [reading, setReading] = useState("");
  const [jump, setJump] = useState(0);
  const goTo = (id: string) => {
    setPageId(id);
    setReading(id);
    setJump((n) => n + 1);
  };
  const [view, setView] = useState<"book" | "pictures">("book");
  const [search, setSearch] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const [library, setLibrary] = useState<SoundLibrary | null>(null);
  const [soundDrop, setSoundDrop] = useState(false);
  useEffect(() => {
    if (gm) session.soundList().then(setLibrary).catch(() => setLibrary(null));
  }, [gm]);
  // The page an element is in (the section's pages are on one scroll).
  const pageOfElement = (element: Element | null) => (element?.closest("[data-book-page]") as HTMLElement | null)?.dataset.bookPage ?? pageId;
  const soundsOf = (id: string) => session.bookSounds[`${book}|${id}`] ?? NO_SOUNDS;
  // A sound link's sound: the one the GM dropped on it, else Kraken's of that kind and name.
  const linkSound = (link: HTMLElement): BookSoundRef | null => {
    const key = link.dataset.soundKey ?? "";
    const bound = soundsOf(pageOfElement(link)).links[key];
    if (bound) return bound;
    const kind = link.dataset.soundKind ?? "sfx";
    const found = library ? matchSound(link.dataset.soundName ?? link.textContent ?? "", kind, library.groups) : "";
    return found ? { sound: found, kind, label: found.split("/").pop() ?? found } : null;
  };
  // Show on each sound link what it plays (or that it has no sound yet).
  useEffect(() => {
    for (const link of body.current?.querySelectorAll<HTMLElement>("a.book-link.sound") ?? []) {
      const ref = gm ? linkSound(link) : null;
      link.classList.toggle("bound", Boolean(ref));
      link.classList.toggle("none", gm && !ref);
      link.title = !gm ? "" : ref ? `Plays ${ref.sound} for the table (drop a sound here to change it)` : "No sound yet: drop one here from the Sound window";
    }
    // Only when the pages, their sounds or the library change (not on every change at the table).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, reading, library, session.bookSounds, session.bookPageStamps, gm]);
  const dropSound = (event: React.DragEvent) => {
    if (!gm || !pageId) return;
    // Dropped on a page's links block (unlocked): that block takes it.
    if ((event.target as HTMLElement).closest("[data-book-links]")) return;
    let ref: BookSoundRef;
    try {
      ref = JSON.parse(event.dataTransfer.getData(SOUND_DRAG)) as BookSoundRef;
    } catch {
      return;
    }
    event.preventDefault();
    setSoundDrop(false);
    const target = event.target as HTMLElement;
    const onPage = pageOfElement(target);
    const link = target.closest<HTMLElement>("a.book-link.sound");
    if (link?.dataset.soundKey) {
      session.setBookSound({ book, page: onPage, action: "bind", key: link.dataset.soundKey, ...ref });
      return;
    }
    const block = target.closest<HTMLElement>("[data-block]");
    session.setBookSound({ book, page: onPage, action: "add", block: block ? Number(block.dataset.block) : -1, ...ref });
  };
  const inlineSounds = (onPage: string, block: number) =>
    gm
      ? soundsOf(onPage)
          .blocks.filter((item) => item.block === block)
          .map((item) => <BookSound key={item.id} session={session} item={item} onRemove={() => session.setBookSound({ book, page: onPage, action: "remove", id: item.id })} />)
      : null;
  // A slower answer for a book or page no longer wanted is dropped (quick clicks).
  useEffect(() => {
    let wantedStill = true;
    session
      .bookFetch<BookContents>("contents", { book })
      .then((found) => {
        if (!wantedStill) return;
        setContents(found);
        if (!found.chapters.length) setView("pictures");
        setPageId((current) => current || found.chapters[0]?.sections[0]?.pages[0]?.id || "");
      })
      .catch((reason: Error) => wantedStill && setError(reason.message));
    return () => {
      wantedStill = false;
    };
  }, [book, session.bookFetch]);
  // A link from another book asks for a page here.
  useEffect(() => {
    const wanted = startAt.get(book);
    if (wanted) {
      startAt.delete(book);
      goTo(wanted);
      setView("book");
    }
  });
  const pages = useMemo(() => contents?.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.pages)) ?? [], [contents]);
  const here = reading || pageId;
  const at = pages.findIndex((item) => item.id === here);
  // The section of the page asked for: its pages are read as one scroll.
  const sectionPages = useMemo(() => {
    for (const chapter of contents?.chapters ?? []) for (const section of chapter.sections) if (section.pages.some((item) => item.id === pageId)) return section.pages;
    return [];
  }, [contents, pageId]);
  // The pages' boxed text (FG's <frame>), read aloud by the GM.
  useReadAloudFrames(body, [sectionPages, session.bookPageStamps], contents?.name);
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
    // A web link: the browser (a new tab; on the GM's app, the system's browser).
    if (link.classList.contains("url")) {
      if (/^https?:\/\//i.test(link.href)) window.open(link.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (link.classList.contains("sound")) {
      const ref = gm ? linkSound(link) : null;
      if (ref) {
        if (sound.isPlaying(ref.sound)) stopForTable(session, ref);
        else playForTable(session, ref);
      }
      return;
    }
    const target = link.dataset;
    if (target.page && target.book === book) {
      goTo(target.page);
      setView("book");
    } else if (target.page && target.book) openBook(target.book, target.book, target.page);
    else if (target.file && target.book) openPicture({ book: target.book, file: target.file, name: target.name || link.textContent || "Picture" });
    else if (target.record && target.book) openRecord(target.book, target.record, target.name || link.textContent || "Record");
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
                          <button key={item.id} type="button" className={item.id === here ? "book-page-link on" : "book-page-link"} aria-current={item.id === here ? "page" : undefined} data-page={item.id} onClick={() => goTo(item.id)} {...slotDrag({ kind: "book", book, page: item.id, label: item.name })}>
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
                    <button
                      type="button"
                      className="book-page-link"
                      data-picture={item.file}
                      {...slotDrag({ kind: "picture", book, file: item.file, label: item.name })}
                      onClick={() => openPicture({ book, file: item.file, name: item.name })}
                      onContextMenu={(event) => menu.show(event, actions.items({ book, file: item.file, name: item.name }, "book"))}
                    >
                      {item.name}
                      {item.category ? <small>{item.category}</small> : null}
                    </button>
                    {gm ? <ShareButton shared={Boolean(shownPicture(item.file))} what={item.name} onClick={() => toggleShown(item.file, item.name)} /> : null}
                  </div>
                ))}
        </div>
        <input type="search" className="books-search" placeholder="Search" aria-label="Search this book" value={search} onChange={(event) => setSearch(event.target.value)} />
      </aside>
      <article
        className={soundDrop ? "book-page sound-drop" : "book-page"}
        ref={body}
        onClick={follow}
        onDragOver={(event) => {
          if (!gm || ![...event.dataTransfer.types].includes(SOUND_DRAG)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setSoundDrop(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSoundDrop(false);
        }}
        onDrop={dropSound}
      >
        {view === "pictures" ? (
          <p className="hint">Open a picture or map to see it{gm ? "; the share symbol shows it to the players, as a tab on their screens" : ""}.</p>
        ) : sectionPages.length ? (
          <>
            <BookPages
              key={sectionPages[0]?.id}
              tick={jump}
              shared={{
                session,
                book,
                gm,
                pictures: contents.pictures,
                openPicture,
                pictureMenu: (event, picture) => menu.show(event, actions.items(picture, "book")),
                shareButton: (picture) => <ShareButton shared={Boolean(shownPicture(picture.file))} what={picture.name || "this picture"} onClick={() => toggleShown(picture.file, picture.name)} />,
                inlineSounds,
              }}
              pages={sectionPages}
              focus={pageId}
              onVisible={setReading}
            />
            <nav className="book-turn">
              <button type="button" disabled={at <= 0} aria-label="Previous page" onClick={() => goTo(pages[at - 1].id)}>
                ‹ {at > 0 ? pages[at - 1].name : ""}
              </button>
              <button type="button" disabled={at < 0 || at >= pages.length - 1} aria-label="Next page" onClick={() => goTo(pages[at + 1].id)}>
                {at >= 0 && at < pages.length - 1 ? pages[at + 1].name : ""} ›
              </button>
            </nav>
          </>
        ) : (
          <p className="hint">Opening the page…</p>
        )}
      </article>
      {menu.element}
    </div>
  );
}

// Pictures: a tab for each picture the GM has shown, and each opened here
// (not those out on their own, or closed here). Right-click for what can be done.
export function ImagesWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const local = useSyncExternalStore(pictures.subscribe, pictures.get);
  const actions = usePictureActions(session);
  const menu = useContextMenu();
  const shown = session.bookShelf.images;
  const tabs: (Tab & { shown?: ShownImage })[] = [
    ...shown.map((item) => ({ book: item.book, file: item.file, name: item.name, shown: item })),
    ...local.tabs.filter((tab) => !shown.some((item) => keyOf(item) === keyOf(tab))),
  ].filter((tab) => !local.out.has(keyOf(tab)) && !local.hidden.has(keyOf(tab)));
  // A picture the GM has just shown comes back, and to the front.
  useEffect(() => {
    const latest = shown.find((item) => item.id === session.imageShown?.id);
    if (latest) {
      pictures.unhide(keyOf(latest));
      pictures.activate(keyOf(latest));
    }
  }, [session.imageShown]);
  const active = tabs.find((tab) => keyOf(tab) === local.active) ?? tabs.at(-1);
  if (!active) return <p className="hint">{gm ? "Open a picture or map from a book." : "The GM has not shown you any pictures yet."}</p>;
  return (
    <div className="images-window">
      <div className="images-tabs" role="tablist">
        {tabs.map((tab) => (
          <div key={keyOf(tab)} className={keyOf(tab) === keyOf(active) ? "images-tab on" : "images-tab"} role="tab" aria-selected={keyOf(tab) === keyOf(active)} onContextMenu={(event) => menu.show(event, actions.items(tab, "tab"))}>
            <button type="button" data-image-tab={tab.name} onClick={() => pictures.activate(keyOf(tab))} {...slotDrag({ kind: "picture", book: tab.book, file: tab.file, label: tab.name })}>
              {gm && tab.shown ? <Icon name="share" size={12} /> : null} {tab.name}
            </button>
            <button type="button" className="images-tab-close" aria-label={`Close ${tab.name}`} title="Close" onClick={() => actions.close(tab)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <PictureView session={session} tab={active} shown={active.shown} onMenu={(event) => menu.show(event, actions.items(active, "tab"))} />
      {menu.element}
    </div>
  );
}

// One picture or map, in a window of its own (out of Pictures, so it stays
// up beside the book). Right-click to put it back in, share it, close it.
export function PictureWindow({ session, payload }: { session: Session; payload: string }) {
  const local = useSyncExternalStore(pictures.subscribe, pictures.get);
  const actions = usePictureActions(session);
  const menu = useContextMenu();
  const shown = session.bookShelf.images.find((item) => keyOf(item) === payload);
  const [book, ...rest] = payload.split("|");
  const tab = local.tabs.find((item) => keyOf(item) === payload) ?? (shown ? { book: shown.book, file: shown.file, name: shown.name } : { book, file: rest.join("|"), name: rest.join("|").split("/").pop() ?? "Picture" });
  return (
    <div className="images-window picture-window">
      <PictureView session={session} tab={tab} shown={shown} onMenu={(event) => menu.show(event, actions.items(tab, "own"))} />
      {menu.element}
    </div>
  );
}

// FG's lock on every image: unlocked, the image opens in the image window to
// edit (walls, doors, lights, paint, effects, a play test), the same master
// wherever it is opened.
function UnlockButton({ tab }: { tab: Tab }) {
  const [state, setState] = useState("");
  return (
    <button
      type="button"
      className="image-unlock"
      data-action="image-unlock"
      title={state || "Locked: unlock to edit it in the image window (walls, doors, lights, paint), the same image wherever it is opened"}
      aria-label={`Unlock ${tab.name} to edit`}
      onClick={() => {
        setState("Opening…");
        void imageWindow
          .open?.({ book: tab.book, file: tab.file, name: tab.name })
          .then(() => setState(""))
          .catch((error: Error) => setState(error.message));
      }}
    >
      <Icon name="lock" size={14} /> {state ? state : "Unlock to edit"}
    </button>
  );
}

function PictureView({ session, tab, shown, onMenu }: { session: Session; tab: Tab; shown?: ShownImage; onMenu: (event: React.MouseEvent) => void }) {
  const gm = session.role === "dm";
  return (
    <div className="images-view" onContextMenu={onMenu} title="Right-click for more">
      {gm ? (
        <div className="images-share">
          <ShareButton shared={Boolean(shown)} what={tab.name} onClick={() => (shown ? session.hideImage(shown.id) : session.showImage(tab.book, tab.file, tab.name))} />
          <span>{shown ? "Shown to the players" : "Not shared"}</span>
          <UnlockButton tab={tab} />
        </div>
      ) : null}
      <img src={session.bookUrl("picture", tab.book, tab.file)} alt={tab.name} data-image={tab.file} />
    </div>
  );
}
