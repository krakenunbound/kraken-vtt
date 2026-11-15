import type { ReactNode } from "react";
import { chatRunner } from "./chatRunner";
import { SLOT_DRAG } from "./QuickSlots";
import { splitInlineRolls, type InlinePiece } from "../../shared/text/inlineRolls.mjs";
import { actionLine, splitActionLinks, type GroupRoll, type LinkAction } from "../../shared/text/actionLinks.mjs";
import { CONDITIONS } from "../../shared/actions/effects.mjs";
import { EFFECT_DRAG } from "../effects/drops";

// Action links (shared/text/actionLinks.mjs): a check, save or skill against a DC, damage, healing,
// an XP award, a condition, from Foundry's markup or a book's own words. The game's group rolls say
// which words are its own; the desktop sets them when the game is known.
let gameRolls: GroupRoll[] = [];
export function setActionRolls(rolls: GroupRoll[] | undefined) {
  gameRolls = rolls ?? [];
}
const conditionOf = (word: string) => {
  const wanted = word.toLowerCase().trim();
  return CONDITIONS.find((item) => item.id === wanted || item.label.toLowerCase() === wanted || item.words?.includes(wanted));
};
const actionTitle = (action: LinkAction) =>
  action.type === "test"
    ? `${action.dc ? `DC ${action.dc} ` : ""}${action.name} ${action.kind === "save" ? "save" : "check"}: a click rolls your character's (the GM's asks the players for theirs)`
    : action.type === "damage"
      ? `Roll ${action.formula}${action.damageType ? ` ${action.damageType}` : ""}${action.heal ? " healing" : " damage"}; drag the card onto a creature`
      : action.type === "award"
        ? `Award ${action.xp} XP to the party (the GM's)`
        : `${conditionOf(action.word)?.text ?? action.word}: drag it onto a creature to apply it`;
// What a click does: the chat line it stands for (the condition's is a drag).
const runAction = (action: LinkAction) => {
  const line = actionLine(action);
  if (line && chatRunner.run) chatRunner.run(line);
};
const actionDrag = (action: LinkAction) => (event: React.DragEvent | DragEvent) => {
  event.stopPropagation();
  if (action.type === "condition") {
    const found = conditionOf(action.word);
    if (found) event.dataTransfer?.setData(EFFECT_DRAG, JSON.stringify({ preset: found.id }));
    event.dataTransfer?.setData("text/plain", found?.label ?? action.word);
  } else if (action.type === "damage") dragOf(action.formula, `${action.heal ? "[HEAL]" : "[DAMAGE]"}${action.damageType ? ` ${action.damageType}` : ""}`)(event);
  else event.dataTransfer?.setData("text/plain", actionLine(action));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
};
// A condition the game has no picture of stays words.
const drawn = (action: LinkAction) => action.type !== "condition" || Boolean(conditionOf(action.word));
const chipText = (piece: { label: string; source: string }) => (/^(\[\[|&)/.test(piece.source) ? piece.label : piece.source);

export function ActionChip({ action, label, source }: { action: LinkAction; label: string; source: string }) {
  return (
    <button type="button" className="inline-roll action-link" data-action-link={action.type} data-source={source} title={actionTitle(action)} draggable onDragStart={actionDrag(action)} onClick={(event) => (event.stopPropagation(), runAction(action))}>
      {chipText({ label, source })}
    </button>
  );
}

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
  if (!/d|&Reference/i.test(text)) return [text];
  return splitActionLinks(text, gameRolls).flatMap((part, at) =>
    "action" in part
      ? drawn(part.action)
        ? [<ActionChip key={`${key}-a${at}`} {...part} />]
        : [part.source]
      : splitInlineRolls(part.text).map((piece, index) => ("formula" in piece ? <RollChip key={`${key}-${at}-${index}`} {...piece} /> : piece.text)),
  );
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

// An action link's chip in an HTML page (and, editable, a word kept as its typed text when saved).
export function actionChipElement(doc: Document, piece: { action: LinkAction; label: string; source: string }, editable = false) {
  const chip = doc.createElement(editable ? "span" : "button");
  chip.className = "inline-roll action-link";
  if (!editable) (chip as HTMLButtonElement).type = "button";
  else chip.contentEditable = "false";
  chip.dataset.actionLink = piece.action.type;
  chip.dataset.source = piece.source;
  chip.title = actionTitle(piece.action);
  chip.draggable = true;
  chip.textContent = chipText(piece);
  let typing = false;
  if (editable) chip.addEventListener("pointerdown", () => {
    const editor = chip.closest<HTMLElement>("[contenteditable='true']");
    typing = Boolean(editor && editor === doc.activeElement);
  });
  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!typing) runAction(piece.action);
  });
  chip.addEventListener("dragstart", (event) => actionDrag(piece.action)(event as DragEvent));
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
    if (!/d|&Reference/i.test(value)) continue;
    const parts = splitActionLinks(value, gameRolls);
    const pieces = parts.flatMap((part): (InlinePiece | { action: LinkAction; label: string; source: string })[] => ("action" in part ? (drawn(part.action) ? [part] : [{ text: part.source }]) : splitInlineRolls(part.text)));
    if (!pieces.some((piece) => "formula" in piece || "action" in piece)) continue;
    const fragment = doc.createDocumentFragment();
    for (const piece of pieces) fragment.append("action" in piece ? actionChipElement(doc, piece, editable) : "formula" in piece ? chipElement(doc, piece, editable) : doc.createTextNode(piece.text));
    text.replaceWith(fragment);
  }
}
