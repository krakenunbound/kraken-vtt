import { useEffect, useRef, useState, type ReactNode } from "react";
import { decodeEntities, isFormatted, krakenRecordname, linkOfRecordname } from "../../../shared/text/formatted.mjs";
import type { QuickSlot } from "../../session/useSession";
import { Icon } from "../../ui/icons";
import { hasLink, LINK_ICON, linkFrom, SLOT_DRAG } from "../../ui/QuickSlots";

// The core's one rich text editor (FG's formattedtextfield): a story's page,
// a note, a quest's text. It edits FG's formatted text and saves FG's tags
// (p, h, b, i, u, list/li, table/tr/td, frame, link), so FormattedText, the
// FG importer and the host's cleaning (shared/text/formatted.mjs) all read
// the same thing. Headings, bold, italic, underline, lists, a table and FG's
// boxed read-aloud text from its bar; anything that is a link (a book page,
// a picture, a character, a sound, a note, a record) dropped in becomes a
// chip in the words, opened with a click and dragged on from there. Saved
// when the editor is left (and at once after a drop).

const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "BLOCKQUOTE"]);
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, "&quot;");

// FG's formatted text (or an old note's plain lines) as the editor's elements, built node by node.
function parse(text: string): Node {
  if (!isFormatted(text)) {
    const root = document.createElement("div");
    for (const line of text.split("\n")) {
      const p = document.createElement("p");
      p.textContent = decodeEntities(line);
      root.append(p);
    }
    if (!text) root.append(document.createElement("p"));
    return root;
  }
  const xml = new DOMParser().parseFromString(`<root>${text}</root>`, "application/xml");
  return xml.getElementsByTagName("parsererror").length ? new DOMParser().parseFromString(text, "text/html").body : xml.documentElement;
}
const TO_EDITOR: Record<string, string> = { p: "p", h: "h4", b: "b", strong: "b", i: "i", em: "i", u: "u", list: "ul", ul: "ul", ol: "ol", linklist: "ul", li: "li", table: "table", tr: "tr", td: "td", th: "td", frame: "blockquote", sup: "sup", sub: "sub" };
export function chipFor(link: QuickSlot | null, cls: string, recordname: string, words: string) {
  const chip = document.createElement("span");
  chip.className = "rt-chip";
  chip.contentEditable = "false";
  chip.draggable = true;
  chip.dataset.class = cls;
  chip.dataset.recordname = recordname;
  chip.dataset.chip = link?.kind ?? cls;
  chip.title = `Open ${words}`;
  chip.textContent = words || "Link";
  return chip;
}
function build(source: Node, into: Node) {
  source.childNodes.forEach((child) => {
    if (child.nodeType === 3 || child.nodeType === 4) return void into.appendChild(document.createTextNode(child.nodeValue ?? ""));
    if (child.nodeType !== 1) return;
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") return void into.appendChild(document.createElement("br"));
    if (tag === "link") {
      const recordname = element.getAttribute("recordname") ?? "";
      return void into.appendChild(chipFor(linkOfRecordname(recordname) as QuickSlot | null, element.getAttribute("class") ?? "", recordname, element.textContent?.trim() ?? ""));
    }
    const html = TO_EDITOR[tag];
    if (!html) return build(element, into);
    if (html === "table") {
      const table = document.createElement("table");
      const body = document.createElement("tbody");
      table.append(body);
      build(element, body);
      return void into.appendChild(table);
    }
    const made = document.createElement(html);
    build(element, made);
    into.appendChild(made);
  });
}

// The editor's elements back as FG's tags; words outside any block go in a paragraph.
const TO_FG: Record<string, string> = { P: "p", DIV: "p", H1: "h", H2: "h", H3: "h", H4: "h", H5: "h", H6: "h", B: "b", STRONG: "b", I: "i", EM: "i", U: "u", UL: "list", OL: "list", LI: "li", TABLE: "table", TR: "tr", TD: "td", TH: "td", BLOCKQUOTE: "frame", SUP: "sup", SUB: "sub" };
function serialize(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) return void (out += escapeText(child.nodeValue ?? ""));
    if (child.nodeType !== 1) return;
    const element = child as HTMLElement;
    if (element.classList.contains("rt-chip")) return void (out += `<link class="${escapeAttr(element.dataset.class ?? "")}" recordname="${escapeAttr(element.dataset.recordname ?? "")}">${escapeText(element.textContent ?? "")}</link>`);
    if (element.classList.contains("read-aloud-button")) return;
    if (element.tagName === "BR") return void (out += "<br />");
    if (element.tagName === "TBODY" || element.tagName === "THEAD") return void (out += serialize(element));
    // Pasted spans and fonts keep their bold, italic and underline only through their tags.
    const tag = TO_FG[element.tagName];
    const inner = serialize(element);
    out += tag ? `<${tag}>${inner}</${tag}>` : inner;
  });
  return out;
}
export function toFormatted(root: HTMLElement) {
  let out = "";
  let loose = "";
  const flush = () => {
    if (loose.replace(/<br \/>/g, "").trim()) out += `<p>${loose}</p>`;
    loose = "";
  };
  root.childNodes.forEach((child) => {
    const wrapper = document.createElement("div");
    wrapper.appendChild(child.cloneNode(true));
    const text = serialize(wrapper);
    if (child.nodeType === 1 && BLOCK.has((child as Element).tagName)) {
      flush();
      out += text;
    } else loose += text;
  });
  flush();
  // An empty paragraph left by Enter is not kept.
  return out.replace(/<p>(<br \/>)?<\/p>/g, "");
}

// The text position under a point, where a drop lands.
function caretAt(doc: Document, x: number, y: number): Range | null {
  const withPosition = doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (withPosition.caretPositionFromPoint) {
    const position = withPosition.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = doc.createRange();
    range.setStart(position.offsetNode, position.offset);
    return range;
  }
  return doc.caretRangeFromPoint?.(x, y) ?? null;
}

type Tool = { id: string; label: string; title: string; run: (doc: Document) => void };
const TOOLS: Tool[] = [
  { id: "bold", label: "B", title: "Bold", run: (doc) => doc.execCommand("bold") },
  { id: "italic", label: "I", title: "Italic", run: (doc) => doc.execCommand("italic") },
  { id: "underline", label: "U", title: "Underline", run: (doc) => doc.execCommand("underline") },
  { id: "heading", label: "H", title: "Heading", run: (doc) => doc.execCommand("formatBlock", false, doc.queryCommandValue("formatBlock").toLowerCase() === "h4" ? "p" : "h4") },
  { id: "list", label: "•", title: "Bulleted list", run: (doc) => doc.execCommand("insertUnorderedList") },
  { id: "frame", label: "❝", title: "Boxed text, read aloud (FG's frame)", run: (doc) => doc.execCommand("formatBlock", false, doc.queryCommandValue("formatBlock").toLowerCase() === "blockquote" ? "p" : "blockquote") },
  { id: "table", label: "▦", title: "A table (two columns, two rows)", run: (doc) => doc.execCommand("insertHTML", false, "<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>") },
  { id: "plain", label: "¶", title: "Plain paragraph", run: (doc) => (doc.execCommand("removeFormat"), doc.execCommand("formatBlock", false, "p")) },
];

export function RichText({
  value,
  onSave,
  editable,
  label,
  className = "",
  read,
  onOpen,
  placeholder,
}: {
  value: string;
  onSave: (text: string) => void;
  editable: boolean;
  label: string;
  className?: string;
  // What it shows when it is not being edited: FG's formatted text drawn (FormattedText).
  read: ReactNode;
  onOpen: (link: QuickSlot) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [dropping, setDropping] = useState(false);
  // Someone else's change shows, unless this screen is typing.
  useEffect(() => {
    const root = ref.current;
    if (!root || focused || (shown.current === value && root.childNodes.length)) return;
    root.replaceChildren();
    build(parse(value), root);
    shown.current = value;
  }, [value, focused, editable]);
  const save = () => {
    const root = ref.current;
    if (!root) return;
    const next = toFormatted(root);
    shown.current = next;
    if (next !== value) onSave(next);
  };
  const insertAt = (event: React.DragEvent, node: Node) => {
    const root = ref.current;
    if (!root) return;
    const range = caretAt(root.ownerDocument, event.clientX, event.clientY);
    if (range && root.contains(range.startContainer)) range.insertNode(node);
    else (root.lastElementChild ?? root).appendChild(node);
    save();
  };
  if (!editable) return <div className={`rich-text read ${className}`} aria-label={label}>{read}</div>;
  return (
    <div className={`rich-text ${className}${dropping ? " dropping" : ""}`}>
      <div className="rt-tools" role="toolbar" aria-label={`${label}: formatting`}>
        {TOOLS.map((tool) => (
          <button key={tool.id} type="button" data-rt={tool.id} title={tool.title} aria-label={tool.title} onMouseDown={(event) => event.preventDefault()} onClick={() => (tool.run(ref.current?.ownerDocument ?? document), save())}>
            {tool.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="rt-body formatted-text"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        onFocus={(event) => {
          event.currentTarget.ownerDocument.execCommand("defaultParagraphSeparator", false, "p");
          setFocused(true);
        }}
        onBlur={() => {
          save();
          setFocused(false);
        }}
        // Pasted text comes in as words (another page's markup, and its pictures from elsewhere, never do).
        onPaste={(event) => {
          event.preventDefault();
          const words = event.clipboardData.getData("text/plain");
          if (words) event.currentTarget.ownerDocument.execCommand("insertText", false, words);
        }}
        onClick={(event) => {
          const chip = (event.target as HTMLElement).closest?.(".rt-chip") as HTMLElement | null;
          const link = chip ? linkOfRecordname(chip.dataset.recordname) : null;
          if (link) onOpen(link as QuickSlot);
        }}
        onDragStart={(event) => {
          const chip = (event.target as HTMLElement).closest?.(".rt-chip") as HTMLElement | null;
          const link = chip ? linkOfRecordname(chip.dataset.recordname) : null;
          if (link) event.dataTransfer.setData(SLOT_DRAG, JSON.stringify(link));
        }}
        onDragOver={(event) => {
          if (!hasLink(event) && ![...event.dataTransfer.types].includes("text/plain")) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false);
          const link = linkFrom(event);
          if (link) {
            event.preventDefault();
            const chip = document.createDocumentFragment();
            chip.append(chipFor(link, "kraken", krakenRecordname(link), link.label), document.createTextNode(" "));
            insertAt(event, chip);
            return;
          }
          // Words dragged in (a chat line, text from a book) go where they fall, and are kept at once.
          const words = event.dataTransfer.getData("text/plain");
          if (!words) return;
          event.preventDefault();
          insertAt(event, document.createTextNode(words));
        }}
      />
    </div>
  );
}

// A chip as FormattedText draws it when the text is read: the link's icon and words, opened with a click.
export function LinkChip({ link, words, onOpen }: { link: QuickSlot; words: ReactNode; onOpen: (link: QuickSlot) => void }) {
  return (
    <span
      className="rt-chip"
      data-chip={link.kind}
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData(SLOT_DRAG, JSON.stringify(link));
      }}
    >
      <button type="button" title={`Open ${link.label}`} onClick={() => onOpen(link)}>
        <Icon name={LINK_ICON[link.kind] ?? "book"} size={13} /> {words}
      </button>
    </span>
  );
}
