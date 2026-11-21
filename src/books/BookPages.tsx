import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BookBlock, BookPage, BookPageRef, BookSoundRef, QuickSlot, Session } from "../session/useSession";
import { Icon } from "../ui/icons";
import { hasLink, LINK_ICON, linkFrom, slotDrag, useOpenLink } from "../ui/QuickSlots";
import { markInlineRolls } from "../ui/InlineRolls";
import { RichText } from "../core/fields/RichText";
import { READ_FRAMES, ReadAloudButton } from "./readAloud";

// A book's pages as its reader shows them (FG's reference manual): every page of a section one after another,
// a bar between them, each with its link (dragged to a quick slot, a note, the story, a map pin) and, for the
// GM, a lock. Unlocked, a page is the GM's to change: its blocks (FG's six: text, two columns, a header, an
// image, an image with text beside it on the left or right) and links (sounds play on a click) are added,
// moved, resized and removed. The change is kept with the campaign, never in the book's own file.

const SOUND_DRAG = "text/kraken-sound";
export type PagePicture = { book: string; file: string; name: string };
type Shared = {
  session: Session;
  book: string;
  gm: boolean;
  pictures: { name: string; file: string }[];
  openPicture: (picture: PagePicture) => void;
  pictureMenu: (event: React.MouseEvent, picture: PagePicture) => void;
  shareButton: (picture: PagePicture) => ReactNode;
  inlineSounds: (page: string, block: number) => ReactNode;
};

// New blocks, as FG adds them (the six), and the GM's links.
const NEW_BLOCKS: { kind: string; icon: string; title: string; make: () => BookBlock }[] = [
  { kind: "text", icon: "block-text", title: "Text", make: () => ({ kind: "text", text: "", html: "" }) },
  { kind: "twocol", icon: "block-twocol", title: "Two columns of text", make: () => ({ kind: "twocol", text: "", text2: "", html: "", html2: "" }) },
  { kind: "header", icon: "block-header", title: "A header", make: () => ({ kind: "header", text: "New section" }) },
  { kind: "picture", icon: "block-image", title: "An image", make: () => ({ kind: "picture", file: "", caption: "", name: "", scale: 100, align: "center" }) },
  { kind: "textpic-right", icon: "block-image-right", title: "Text with an image on the right", make: () => ({ kind: "textpic", side: "right", file: "", caption: "", name: "", scale: 50, text: "", html: "" }) },
  { kind: "textpic-left", icon: "block-image-left", title: "Text with an image on the left", make: () => ({ kind: "textpic", side: "left", file: "", caption: "", name: "", scale: 50, text: "", html: "" }) },
  { kind: "links", icon: "block-links", title: "Links: anything dragged here (a sound plays on a click)", make: () => ({ kind: "links", links: [] }) },
];
// What is kept (the host makes the HTML again from the words).
const toKeep = (block: BookBlock): BookBlock => {
  const { html: _html, html2: _html2, ...rest } = block as BookBlock & { html?: string; html2?: string };
  return rest as BookBlock;
};
const newId = () => `e${Math.random().toString(36).slice(2, 10)}`;

export function BookPages({ shared, pages, focus, tick, onVisible }: { shared: Shared; pages: BookPageRef[]; focus: string; tick: number; onVisible: (page: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // The page asked for comes into view (from the contents, a link, the page turners), and stays there while the
  // pages above it come in (for a few seconds after the jump).
  const jumped = useRef(0);
  const bringIn = () => {
    if (!focus) return;
    const element = box.current?.querySelector<HTMLElement>(`[data-book-page="${CSS.escape(focus)}"]`);
    element?.scrollIntoView({ block: "start" });
  };
  const loadedCount = useRef(0);
  useEffect(() => {
    jumped.current = Date.now();
    loadedCount.current = 0;
    bringIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, tick, pages]);
  // The reader's own scroll (wheel, keys, a press) ends the hold.
  useEffect(() => {
    const root = box.current?.closest(".book-page");
    if (!root) return;
    const release = () => {
      jumped.current = 0;
    };
    for (const type of ["wheel", "keydown", "pointerdown", "touchmove"]) root.addEventListener(type, release, { passive: true });
    return () => {
      for (const type of ["wheel", "keydown", "pointerdown", "touchmove"]) root.removeEventListener(type, release);
    };
  }, []);
  const loaded = () => {
    loadedCount.current += 1;
    if (Date.now() - jumped.current < 3000) bringIn();
    if (loadedCount.current >= pages.length) jumped.current = 0;
  };
  // The contents follow the page being read.
  useEffect(() => {
    const root = box.current?.closest(".book-page") ?? null;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = (top?.target as HTMLElement | undefined)?.dataset.bookPage;
        if (id) onVisible(id);
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    for (const element of box.current?.querySelectorAll("[data-book-page]") ?? []) observer.observe(element);
    return () => observer.disconnect();
  }, [pages, onVisible]);
  return (
    <div className="book-pages" ref={box}>
      {pages.map((item, index) => (
        <div key={item.id}>
          {index > 0 ? <BookDivider /> : null}
          <BookPageView shared={shared} pageRef={item} onLoaded={loaded} />
        </div>
      ))}
    </div>
  );
}

// The bar between pages.
function BookDivider() {
  return (
    <div className="book-divider" aria-hidden>
      <i />
      <b />
      <i />
    </div>
  );
}

function BookPageView({ shared, pageRef, onLoaded }: { shared: Shared; pageRef: BookPageRef; onLoaded: () => void }) {
  const { session, book, gm } = shared;
  const [page, setPage] = useState<BookPage | null>(null);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const stamp = session.bookPageStamps[`${book}|${pageRef.id}`] ?? 0;
  useEffect(() => {
    let wanted = true;
    session
      .bookFetch<BookPage>("page", { book, page: pageRef.id })
      .then((found) => {
        if (!wanted) return;
        setPage(found);
        requestAnimationFrame(onLoaded);
      })
      .catch((reason: Error) => wanted && setError(reason.message));
    return () => {
      wanted = false;
    };
  }, [book, pageRef.id, stamp, session.bookFetch]);
  if (error && !page) return <section className="book-page-sheet" data-book-page={pageRef.id}><p className="hint">{error}</p></section>;
  if (!page) return <section className="book-page-sheet loading" data-book-page={pageRef.id}><h2>{pageRef.name}</h2></section>;
  const editing = gm && unlocked;
  // Keep the page as it is now (the first change copies the book's page; its sounds come along as links).
  const keep = async (blocks: BookBlock[], name = page.name) => {
    let next = blocks;
    const sounds = session.bookSounds[`${book}|${page.id}`];
    if (!page.edited && sounds?.blocks.length) {
      next = [...blocks];
      const around = [...sounds.blocks].sort((a, b) => b.block - a.block);
      for (const item of around) next.splice(item.block + 1, 0, { id: newId(), kind: "links", links: [{ kind: "sound", sound: item.sound, soundKind: item.kind, label: item.label }] });
      for (const item of sounds.blocks) session.setBookSound({ book, page: page.id, action: "remove", id: item.id });
    }
    setPage({ ...page, name, blocks: next, edited: true });
    await session.editBookPage({ book, page: page.id, action: "set", name, blocks: next.map(toKeep) }).catch((reason: Error) => setError(reason.message));
  };
  const change = (index: number, patch: Partial<BookBlock>) => void keep(page.blocks.map((block, at) => (at === index ? ({ ...block, ...patch } as BookBlock) : block)));
  const insert = (at: number, block: BookBlock) => {
    const next = [...page.blocks];
    next.splice(at, 0, { ...block, id: newId() });
    void keep(next);
  };
  const remove = (index: number) => void keep(page.blocks.filter((_, at) => at !== index));
  const move = (index: number, by: number) => {
    const to = Math.max(0, Math.min(page.blocks.length - 1, index + by));
    if (to === index) return;
    const next = [...page.blocks];
    const [block] = next.splice(index, 1);
    next.splice(to, 0, block);
    void keep(next);
  };
  return (
    <section className={editing ? "book-page-sheet unlocked" : "book-page-sheet"} data-book-page={page.id} data-edited={page.edited ? "true" : undefined}>
      <header className="book-page-head">
        <span className="book-page-anchor" title={`${page.name}: drag this page anywhere (a quick slot, a note, the story, a map)`} {...slotDrag({ kind: "book", book, page: page.id, label: page.name })}>
          <Icon name="bookmark" size={16} />
        </span>
        {editing ? (
          <input className="book-page-title" aria-label="The page's title" defaultValue={page.name} onBlur={(event) => event.target.value.trim() && event.target.value !== page.name && void keep(page.blocks, event.target.value.trim())} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLInputElement).blur()} />
        ) : (
          <h2>{page.name}</h2>
        )}
        {gm ? (
          <span className="book-page-tools">
            {page.edited ? (
              <button
                type="button"
                className="book-tool"
                data-action="page-revert"
                title="Back to the book's own page (your changes to it go)"
                aria-label="Back to the book's own page"
                onClick={() => window.confirm(`Put "${page.name}" back as the book has it? Your changes to this page go.`) && void session.editBookPage({ book, page: page.id, action: "revert" })}
              >
                <Icon name="undo" size={14} />
              </button>
            ) : null}
            <button type="button" className={editing ? "book-tool on" : "book-tool"} data-action="page-lock" aria-pressed={editing} title={editing ? "Unlocked: change this page. Click to lock it." : "Locked. Click to unlock this page and change it."} aria-label={editing ? "Lock this page" : "Unlock this page"} onClick={() => setUnlocked(!unlocked)}>
              <Icon name={editing ? "unlock" : "lock"} size={14} />
            </button>
          </span>
        ) : null}
      </header>
      {page.edited ? null : shared.inlineSounds(page.id, -1)}
      {editing ? <Inserter onPick={(block) => insert(0, block)} first /> : null}
      {page.blocks.map((block, index) => (
        <div key={block.id ?? index} className={`book-block kind-${block.kind}`} data-block={index}>
          {editing ? (
            <div className="book-block-tools" role="toolbar" aria-label="This block">
              <button type="button" className="book-tool danger" data-action="block-delete" title="Delete this block" aria-label="Delete this block" onClick={() => window.confirm("Delete this block?") && remove(index)}>
                <Icon name="trash" size={13} />
              </button>
              <button type="button" className="book-tool" data-action="block-up" title="Move it up" aria-label="Move it up" disabled={index === 0} onClick={() => move(index, -1)}>
                <Icon name="chevron-up" size={13} />
              </button>
              <button type="button" className="book-tool" data-action="block-down" title="Move it down" aria-label="Move it down" disabled={index === page.blocks.length - 1} onClick={() => move(index, 1)}>
                <Icon name="chevron-down" size={13} />
              </button>
              {block.kind === "picture" || block.kind === "textpic" ? (
                <>
                  <button type="button" className="book-tool" data-action="image-bigger" title={`Bigger (${block.scale}%)`} aria-label="Make the image bigger" disabled={block.scale >= 100} onClick={() => change(index, { scale: Math.min(100, block.scale + 10) })}>
                    <Icon name="zoom-in" size={13} />
                  </button>
                  <button type="button" className="book-tool" data-action="image-smaller" title={`Smaller (${block.scale}%)`} aria-label="Make the image smaller" disabled={block.scale <= 10} onClick={() => change(index, { scale: Math.max(10, block.scale - 10) })}>
                    <Icon name="zoom-out" size={13} />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          <BlockView shared={shared} page={page} block={block} editing={editing} onChange={(patch) => change(index, patch)} />
          {page.edited ? null : shared.inlineSounds(page.id, index)}
          {editing ? <Inserter onPick={(made) => insert(index + 1, made)} /> : null}
        </div>
      ))}
      {page.blocks.length === 0 && !editing ? <p className="hint">{gm ? "An empty page: unlock it to add to it." : "An empty page."}</p> : null}
    </section>
  );
}

// The bar under a block when the page is unlocked: a new block of each kind goes here.
function Inserter({ onPick, first = false }: { onPick: (block: BookBlock) => void; first?: boolean }) {
  return (
    <div className={first ? "book-inserter first" : "book-inserter"} role="toolbar" aria-label="Add a block here">
      {NEW_BLOCKS.map((item) => (
        <button key={item.kind} type="button" className="book-insert" data-insert={item.kind} title={`Add here: ${item.title}`} aria-label={`Add here: ${item.title}`} onClick={() => onPick(item.make())}>
          <Icon name={item.icon} size={18} />
        </button>
      ))}
    </div>
  );
}

function BlockView({ shared, page, block, editing, onChange }: { shared: Shared; page: BookPage; block: BookBlock; editing: boolean; onChange: (patch: Partial<BookBlock>) => void }) {
  const openLink = useOpenLink(shared.session);
  const words = (formatted: string | undefined, html: string, save: (text: string) => void, label: string) =>
    editing ? (
      <RichText className="book-edit-text" value={formatted ?? ""} editable label={label} placeholder="Click to write" onSave={save} onOpen={openLink} read={<div dangerouslySetInnerHTML={{ __html: html }} />} />
    ) : (
      <div ref={(element) => markInlineRolls(element)} dangerouslySetInnerHTML={{ __html: html }} />
    );
  if (block.kind === "header") {
    return editing ? <input className="book-header-edit" aria-label="The header" defaultValue={block.text} onBlur={(event) => event.target.value !== block.text && onChange({ text: event.target.value })} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLInputElement).blur()} /> : <h3 className="book-header">{block.text}</h3>;
  }
  if (block.kind === "twocol") {
    return (
      <div className="book-twocol">
        <div className="book-text">{words(block.text, block.html, (text) => onChange({ text }), "The left column")}</div>
        <div className="book-text">{words(block.text2, block.html2, (text2) => onChange({ text2 }), "The right column")}</div>
      </div>
    );
  }
  if (block.kind === "picture") {
    return (
      <div className={`book-figure-row ${block.align}`}>
        <Picture shared={shared} page={page} block={block} editing={editing} onChange={onChange} />
      </div>
    );
  }
  if (block.kind === "textpic") {
    return (
      <div className={`book-textpic ${block.side}`}>
        <Picture shared={shared} page={page} block={block} editing={editing} onChange={onChange} />
        <div className="book-text">{words(block.text, block.html, (text) => onChange({ text }), "The text beside the image")}</div>
      </div>
    );
  }
  if (block.kind === "links") return <LinksBlock shared={shared} block={block} editing={editing} onChange={onChange} />;
  // Text, boxed or not.
  const frame = block.frame ?? "";
  return (
    <div className={frame ? `book-text framed ${frame}${READ_FRAMES.has(frame) ? " read-aloud-frame" : ""}` : "book-text"}>
      {frame && READ_FRAMES.has(frame) && !editing ? <ReadAloudButton text={() => new DOMParser().parseFromString(block.html, "text/html").body.textContent ?? ""} title={page.name} /> : null}
      {words(block.text, block.html, (text) => onChange({ text }), "The page's text")}
    </div>
  );
}

// An image in a page: a click opens it (to share it, edit it, play test it), a right-click its menu. Unlocked,
// a picture of the book dropped on it (or picked from the book's pictures) is its picture.
function Picture({ shared, page, block, editing, onChange }: { shared: Shared; page: BookPage; block: Extract<BookBlock, { kind: "picture" | "textpic" }>; editing: boolean; onChange: (patch: Partial<BookBlock>) => void }) {
  const { session, book } = shared;
  const [over, setOver] = useState(false);
  const picture = { book, file: block.file, name: block.name || block.caption || page.name };
  const drop = editing
    ? {
        onDragOver: (event: React.DragEvent) => {
          if (!hasLink(event)) return;
          event.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (event: React.DragEvent) => {
          setOver(false);
          const link = linkFrom(event);
          if (!link) return;
          event.preventDefault();
          event.stopPropagation();
          if (link.kind !== "picture" || link.book !== book) {
            window.alert("Drop a picture of this book (its Images & Maps).");
            return;
          }
          onChange({ file: link.file, name: link.label, caption: block.caption || link.label });
        },
      }
    : {};
  return (
    <figure className={over ? "book-figure dropping" : "book-figure"} style={{ width: `${block.scale}%` }} {...drop} onContextMenu={block.file ? (event) => shared.pictureMenu(event, picture) : undefined}>
      {block.file ? (
        <button type="button" className="book-figure-open" data-figure={block.file} title="Open this image: share it, edit it (walls, doors, lights), play test it" onClick={() => shared.openPicture(picture)} {...slotDrag({ kind: "picture", book, file: block.file, label: picture.name })}>
          <img src={session.bookUrl("picture", book, block.file)} alt={block.caption} loading="lazy" />
        </button>
      ) : editing ? (
        <div className="book-figure-empty">
          <Icon name="image" size={28} />
          <span>Drop a picture of this book here, or pick one:</span>
          <select aria-label="Pick a picture of this book" value="" onChange={(event) => {
            const found = shared.pictures.find((item) => item.file === event.target.value);
            if (found) onChange({ file: found.file, name: found.name, caption: block.caption || found.name });
          }}>
            <option value="">A picture of this book…</option>
            {shared.pictures.map((item) => (
              <option key={item.file} value={item.file}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {editing ? (
        <input className="book-caption-edit" aria-label="The caption" placeholder="Caption" defaultValue={block.caption} onBlur={(event) => event.target.value !== block.caption && onChange({ caption: event.target.value })} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLInputElement).blur()} />
      ) : block.caption ? (
        <figcaption>{block.caption}</figcaption>
      ) : null}
      {shared.gm && block.file && !editing ? shared.shareButton(picture) : null}
    </figure>
  );
}

// Links kept in a page: anything dragged here (a handout, a creature, an encounter, another page, a sound...),
// opened with a click; a sound plays (for the table, from the GM).
function LinksBlock({ shared, block, editing, onChange }: { shared: Shared; block: Extract<BookBlock, { kind: "links" }>; editing: boolean; onChange: (patch: Partial<BookBlock>) => void }) {
  const openLink = useOpenLink(shared.session);
  const [over, setOver] = useState(false);
  const label = useMemo(() => ({ book: "Page", picture: "Picture", sheet: "Character", note: "Note", record: "Record", sound: "Sound", dice: "Dice", macro: "Chat", window: "Window" }) as Record<QuickSlot["kind"], string>, []);
  const accept = (event: React.DragEvent) => editing && (hasLink(event) || [...event.dataTransfer.types].includes(SOUND_DRAG));
  return (
    <div
      className={over ? "book-links dropping" : "book-links"}
      data-book-links
      onDragOver={(event) => {
        if (!accept(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (!accept(event)) return;
        event.preventDefault();
        event.stopPropagation();
        let link = linkFrom(event);
        if (!link) {
          try {
            const ref = JSON.parse(event.dataTransfer.getData(SOUND_DRAG)) as BookSoundRef;
            link = { kind: "sound", sound: ref.sound, soundKind: ref.kind, label: ref.label };
          } catch {
            link = null;
          }
        }
        if (link) onChange({ links: [...block.links, link].slice(0, 60) });
      }}
    >
      {block.links.length === 0 ? <span className="hint">{editing ? "Drag links here: a handout, a creature, an encounter, a page, a sound (from the Sound window)." : ""}</span> : null}
      {block.links.map((link, index) => (
        <span key={`${link.kind}-${index}`} className={`book-link-row kind-${link.kind}`} data-book-link={link.kind} {...slotDrag(link)}>
          <button type="button" onClick={() => openLink(link)} title={link.kind === "sound" ? `Play ${link.label}` : `Open ${link.label}`}>
            <i className="book-link-icon">
              <Icon name={LINK_ICON[link.kind] ?? "book"} size={13} />
            </i>
            <b>{label[link.kind] ?? "Link"}:</b> {link.label}
          </button>
          {editing ? (
            <button type="button" className="book-tool danger" aria-label={`Take ${link.label} out`} title="Take it out" onClick={() => onChange({ links: block.links.filter((_, at) => at !== index) })}>
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}
