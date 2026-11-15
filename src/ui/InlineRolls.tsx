import type { ReactNode } from "react";
import { chatRunner } from "./chatRunner";
import { SLOT_DRAG } from "./QuickSlots";
import { splitInlineRolls } from "../../shared/text/inlineRolls.mjs";

// Inline rolls in text (Foundry's [[1d20+3]], and the bare dice a book's words
// name, "2d6 + 3 fire damage"): a chip that rolls with a click, as the chat
// would (who is speaking, the dice tower, the host's modifier box and keys),
// and drags onto a quick slot like any dice. Book pages, story pages, notes,
// records' text and chat lines all draw them.

// Rolled as typed in chat: /roll with its label (the host adds the speaker and the modifier box).
export function rollInline(formula: string, label = "") {
  const line = `/roll ${formula}${label ? ` #${label}` : ""}`;
  if (chatRunner.run) chatRunner.run(line);
}

const dragOf = (formula: string, label: string) => (event: React.DragEvent | DragEvent) => {
  event.stopPropagation();
  event.dataTransfer?.setData(SLOT_DRAG, JSON.stringify({ kind: "dice", formula, label: label || formula }));
  event.dataTransfer?.setData("text/plain", `[[${formula}${label ? ` #${label}` : ""}]]`);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
};

export function RollChip({ formula, label, source }: { formula: string; label: string; source: string }) {
  return (
    <button type="button" className="inline-roll" data-inline-roll={formula} title={`Roll ${formula}${label ? ` (${label})` : ""}; drag it onto a quick slot`} draggable onDragStart={dragOf(formula, label)} onClick={(event) => (event.stopPropagation(), rollInline(formula, label))}>
      {source.startsWith("[[") ? `${formula}${label ? ` ${label}` : ""}` : source}
    </button>
  );
}

// Plain words with their rolls as chips (chat lines, FormattedText's words).
export function inlineRollNodes(text: string, key = "r"): ReactNode[] {
  if (!/d/i.test(text)) return [text];
  return splitInlineRolls(text).map((piece, index) => ("formula" in piece ? <RollChip key={`${key}-${index}`} {...piece} /> : piece.text));
}
export function InlineRollText({ text }: { text: string }) {
  return <>{inlineRollNodes(text)}</>;
}

// The chip made in a page that is HTML (a book's page, an adventure's story):
// the same look and behaviour; in the editor (editable) a word that is kept
// as its typed text when saved.
export function chipElement(doc: Document, piece: { formula: string; label: string; source: string }, editable = false) {
  const chip = doc.createElement(editable ? "span" : "button");
  chip.className = "inline-roll";
  if (!editable) (chip as HTMLButtonElement).type = "button";
  else chip.contentEditable = "false";
  chip.dataset.inlineRoll = piece.formula;
  chip.dataset.label = piece.label;
  chip.dataset.source = piece.source;
  chip.title = `Roll ${piece.formula}${piece.label ? ` (${piece.label})` : ""}; drag it onto a quick slot`;
  chip.draggable = true;
  chip.textContent = piece.source.startsWith("[[") ? `${piece.formula}${piece.label ? ` ${piece.label}` : ""}` : piece.source;
  // In an editor already being typed in, a click only places the cursor: it never rolls for the whole table.
  let typing = false;
  if (editable) chip.addEventListener("pointerdown", () => {
    const editor = chip.closest<HTMLElement>("[contenteditable='true']");
    typing = Boolean(editor && editor === doc.activeElement);
  });
  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (typing) return;
    rollInline(piece.formula, piece.label);
  });
  chip.addEventListener("dragstart", (event) => dragOf(piece.formula, piece.label)(event as DragEvent));
  return chip;
}

const SKIP = new Set(["A", "BUTTON", "CODE", "INPUT", "TEXTAREA", "SELECT"]);
// Turns the rolls in an element's words into chips (once: a chip is never made twice).
export function markInlineRolls(root: Node | null, editable = false) {
  if (!root) return;
  const doc = root.ownerDocument ?? document;
  const texts: Text[] = [];
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) texts.push(child as Text);
      else if (child.nodeType === 1) {
        const element = child as HTMLElement;
        if (SKIP.has(element.tagName) || element.classList.contains("inline-roll") || element.classList.contains("rt-chip")) return;
        walk(element);
      }
    });
  };
  walk(root);
  for (const text of texts) {
    const value = text.nodeValue ?? "";
    if (!/d/i.test(value)) continue;
    const pieces = splitInlineRolls(value);
    if (!pieces.some((piece) => "formula" in piece)) continue;
    const fragment = doc.createDocumentFragment();
    for (const piece of pieces) fragment.append("formula" in piece ? chipElement(doc, piece, editable) : doc.createTextNode(piece.text));
    text.replaceWith(fragment);
  }
}
