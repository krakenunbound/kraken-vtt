// A book's contents with their lock open (the GM's): chapters, sections and pages renamed, added, moved
// (the arrows, or a page dragged onto another page or onto a section) and taken out. Every change is
// kept with the campaign at once; the book's own file is never touched.
import { useState } from "react";
import type { BookContents } from "../session/useSession";
import { Icon } from "../ui/icons";

type Chapters = BookContents["chapters"];
type Spot = { c: number; s: number; p: number };
const PAGE_DRAG = "text/kraken-book-page";

// Chapters to change, each level copied (the ones shown stay as they were until the host answers).
const copy = (chapters: Chapters): Chapters => chapters.map((chapter) => ({ ...chapter, sections: chapter.sections.map((section) => ({ ...section, pages: section.pages.map((page) => ({ ...page })) })) }));
const newId = () => `new-${[...crypto.getRandomValues(new Uint8Array(4))].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

// A name typed in place, kept when the GM leaves the field or presses Enter.
function NameField({ value, label, onSave, data }: { value: string; label: string; onSave: (name: string) => void; data: Record<string, string> }) {
  const [draft, setDraft] = useState(value);
  const [was, setWas] = useState(value);
  if (was !== value) {
    setWas(value);
    setDraft(value);
  }
  const save = () => {
    const name = draft.trim();
    if (name && name !== value) onSave(name);
    else setDraft(value);
  };
  return (
    <input
      className="book-toc-name"
      aria-label={label}
      placeholder={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
        if (event.key === "Escape") setDraft(value);
      }}
      {...Object.fromEntries(Object.entries(data).map(([key, item]) => [`data-${key}`, item]))}
    />
  );
}

function Tools({ what, up, down, onUp, onDown, onRemove }: { what: string; up: boolean; down: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <span className="book-toc-tools">
      <button type="button" className="book-tool" data-action="toc-up" title={`Move this ${what} up`} aria-label={`Move this ${what} up`} disabled={!up} onClick={onUp}>
        <Icon name="chevron-up" size={12} />
      </button>
      <button type="button" className="book-tool" data-action="toc-down" title={`Move this ${what} down`} aria-label={`Move this ${what} down`} disabled={!down} onClick={onDown}>
        <Icon name="chevron-down" size={12} />
      </button>
      <button type="button" className="book-tool danger" data-action="toc-remove" title={`Take this ${what} out`} aria-label={`Take this ${what} out`} onClick={onRemove}>
        <Icon name="trash" size={12} />
      </button>
    </span>
  );
}

export function BookContentsEditor({ chapters, here, edited, onChange, onRevert, onOpen }: { chapters: Chapters; here: string; edited: boolean; onChange: (chapters: Chapters) => Promise<void>; onRevert: () => void; onOpen: (page: string) => void }) {
  const [dropAt, setDropAt] = useState("");
  const change = (work: (next: Chapters) => void) => {
    const next = copy(chapters);
    work(next);
    return onChange(next);
  };
  // Every page's spot, in reading order (a page moved past its section's end goes on into the next one).
  const spots: Spot[] = chapters.flatMap((chapter, c) => chapter.sections.flatMap((section, s) => section.pages.map((_, p) => ({ c, s, p }))));
  const sections = chapters.flatMap((chapter, c) => chapter.sections.map((_, s) => ({ c, s })));
  const movePage = (from: Spot, by: -1 | 1) =>
    change((next) => {
      const section = next[from.c].sections[from.s];
      const [page] = section.pages.splice(from.p, 1);
      if (from.p + by >= 0 && from.p + by <= section.pages.length && !(by === 1 && from.p === section.pages.length)) section.pages.splice(from.p + by, 0, page);
      else {
        // Into the section before (at its end) or after (at its start).
        const at = sections.findIndex((item) => item.c === from.c && item.s === from.s) + by;
        const into = next[sections[at].c].sections[sections[at].s];
        if (by < 0) into.pages.push(page);
        else into.pages.unshift(page);
      }
    });
  const moveSection = (c: number, s: number, by: -1 | 1) =>
    change((next) => {
      const [section] = next[c].sections.splice(s, 1);
      if (s + by >= 0 && s + by <= next[c].sections.length && !(by === 1 && s === next[c].sections.length)) next[c].sections.splice(s + by, 0, section);
      else if (by < 0) next[c - 1].sections.push(section);
      else next[c + 1].sections.unshift(section);
    });
  const moveChapter = (c: number, by: -1 | 1) =>
    change((next) => {
      const [chapter] = next.splice(c, 1);
      next.splice(c + by, 0, chapter);
    });
  const addPage = (c: number, s: number) => {
    const id = newId();
    void change((next) => next[c].sections[s].pages.push({ id, name: "New page", keywords: "" })).then(() => onOpen(id));
  };
  const addSection = (c: number) => void change((next) => next[c].sections.push({ name: "New section", pages: [] }));
  const addChapter = () => void change((next) => next.push({ name: "New chapter", sections: [{ name: "", pages: [] }] }));
  // A page dragged onto a page goes before it; onto a section's name, to that section's end.
  const dropPage = (event: React.DragEvent, c: number, s: number, before: number | null) => {
    const id = event.dataTransfer.getData(PAGE_DRAG);
    setDropAt("");
    if (!id) return;
    event.preventDefault();
    void change((next) => {
      let moved = null;
      for (const chapter of next) for (const section of chapter.sections) {
        const at = section.pages.findIndex((page) => page.id === id);
        if (at >= 0) [moved] = section.pages.splice(at, 1);
      }
      if (!moved) return;
      const pages = next[c].sections[s].pages;
      const at = before === null ? -1 : pages.findIndex((page) => page.id === chapters[c].sections[s].pages[before]?.id);
      if (at < 0) pages.push(moved);
      else pages.splice(at, 0, moved);
    });
  };
  const over = (key: string) => (event: React.DragEvent) => {
    if (![...event.dataTransfer.types].includes(PAGE_DRAG)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropAt(key);
  };
  return (
    <div className="book-toc-edit" data-contents-unlocked="">
      {chapters.map((chapter, c) => (
        <div key={`c${c}`} className="book-chapter" data-toc-chapter={c}>
          <h3 className="book-toc-row">
            <NameField value={chapter.name} label="Chapter name" data={{ "toc-chapter-name": String(c) }} onSave={(name) => void change((next) => void (next[c].name = name))} />
            <Tools
              what="chapter"
              up={c > 0}
              down={c < chapters.length - 1}
              onUp={() => void moveChapter(c, -1)}
              onDown={() => void moveChapter(c, 1)}
              onRemove={() => window.confirm(`Take the chapter "${chapter.name}" and all its pages out of the contents?`) && void change((next) => void next.splice(c, 1))}
            />
          </h3>
          {chapter.sections.map((section, s) => {
            const first = c === 0 && s === 0;
            const last = c === chapters.length - 1 && s === chapter.sections.length - 1;
            return (
              <div key={`s${s}`} className="book-section" data-toc-section={`${c}.${s}`}>
                <h4 className={dropAt === `s${c}.${s}` ? "book-toc-row drop" : "book-toc-row"} onDragOver={over(`s${c}.${s}`)} onDragLeave={() => setDropAt("")} onDrop={(event) => dropPage(event, c, s, null)}>
                  <NameField value={section.name} label="Section name" data={{ "toc-section-name": `${c}.${s}` }} onSave={(name) => void change((next) => void (next[c].sections[s].name = name))} />
                  <Tools
                    what="section"
                    up={!first}
                    down={!last}
                    onUp={() => void moveSection(c, s, -1)}
                    onDown={() => void moveSection(c, s, 1)}
                    onRemove={() => window.confirm(`Take the section "${section.name || chapter.name}" and its pages out of the contents?`) && void change((next) => void next[c].sections.splice(s, 1))}
                  />
                </h4>
                {section.pages.map((page, p) => {
                  const at = spots.findIndex((spot) => spot.c === c && spot.s === s && spot.p === p);
                  return (
                    <div
                      key={page.id}
                      className={["book-toc-row", "book-toc-page", page.id === here ? "on" : "", dropAt === page.id ? "drop" : ""].filter(Boolean).join(" ")}
                      data-toc-page={page.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(PAGE_DRAG, page.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={over(page.id)}
                      onDragLeave={() => setDropAt("")}
                      onDrop={(event) => dropPage(event, c, s, p)}
                    >
                      <button type="button" className="book-tool" data-action="toc-open" title="Open this page" aria-label={`Open ${page.name}`} onClick={() => onOpen(page.id)}>
                        <Icon name="open" size={12} />
                      </button>
                      <NameField value={page.name} label="Page name" data={{ "toc-page-name": page.id }} onSave={(name) => void change((next) => void (next[c].sections[s].pages[p].name = name))} />
                      <Tools
                        what="page"
                        up={at > 0}
                        down={at < spots.length - 1}
                        onUp={() => void movePage({ c, s, p }, -1)}
                        onDown={() => void movePage({ c, s, p }, 1)}
                        onRemove={() =>
                          window.confirm(page.id.startsWith("new-") ? `Delete the page "${page.name}"? What you wrote on it goes.` : `Take "${page.name}" out of the contents? (Back to the book's own contents brings it back.)`) &&
                          void change((next) => void next[c].sections[s].pages.splice(p, 1))
                        }
                      />
                    </div>
                  );
                })}
                <button type="button" className="book-toc-add" data-action="toc-add-page" onClick={() => addPage(c, s)}>
                  <Icon name="plus" size={12} /> Page
                </button>
              </div>
            );
          })}
          <button type="button" className="book-toc-add" data-action="toc-add-section" onClick={() => addSection(c)}>
            <Icon name="plus" size={12} /> Section
          </button>
        </div>
      ))}
      <button type="button" className="book-toc-add" data-action="toc-add-chapter" onClick={addChapter}>
        <Icon name="plus" size={12} /> Chapter
      </button>
      {edited ? (
        <button
          type="button"
          className="book-toc-add"
          data-action="toc-revert"
          onClick={() => window.confirm("Put the contents back as the book has them? Pages you added go, with what you wrote on them.") && onRevert()}
        >
          <Icon name="undo" size={12} /> Back to the book's own contents
        </button>
      ) : null}
    </div>
  );
}
