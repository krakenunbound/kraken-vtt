import { useEffect, useSyncExternalStore, type RefObject } from "react";
import { Icon } from "../ui/icons";

// FG's read-aloud boxes: an adventure's boxed text (a <frame> in its story, or
// a block framed blue, green, text2 to text5), with a button for the GM to read
// it to the table: it goes to chat as read-aloud, and over the map as a speech
// bubble for everyone. The GM's screen registers how it is sent; other screens
// show no button.
type Send = (text: string, title?: string) => void;
let sender: Send | null = null;
const listeners = new Set<() => void>();
export const readAloud = {
  register(send: Send | null) {
    sender = send;
    listeners.forEach((listener) => listener());
  },
  send(text: string, title?: string) {
    const words = text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    if (words) sender?.(words, title);
  },
};
const useCanRead = () => useSyncExternalStore((listener) => (listeners.add(listener), () => listeners.delete(listener)), () => sender !== null);
// The book block frames that hold read-aloud text (FG's boxed text).
export const READ_FRAMES = new Set(["blue", "green", "text2", "text3", "text4", "text5", "brown", "grey", "gray"]);

export function ReadAloudButton({ text, title }: { text: () => string; title?: string }) {
  const can = useCanRead();
  if (!can) return null;
  return (
    <button type="button" className="read-aloud-button" data-action="read-aloud" title="Read aloud: to chat, and over the map for everyone" aria-label="Read aloud" onClick={() => readAloud.send(text(), title)}>
      <Icon name="chat" size={14} />
    </button>
  );
}

// Boxed text inside HTML drawn as it is (a book page's or a story's): each
// <blockquote> (FG's <frame>) gets the button.
export function useReadAloudFrames(ref: RefObject<HTMLElement | null>, deps: unknown[], title?: string) {
  const can = useCanRead();
  useEffect(() => {
    const root = ref.current;
    if (!root || !can) return;
    const added: HTMLElement[] = [];
    root.querySelectorAll("blockquote").forEach((frame) => {
      if (frame.querySelector(":scope > .read-aloud-button")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "read-aloud-button";
      button.dataset.action = "read-aloud";
      button.title = "Read aloud: to chat, and over the map for everyone";
      button.setAttribute("aria-label", "Read aloud");
      button.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 5h16v11H9l-5 4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
      button.addEventListener("click", () => readAloud.send(frame.innerText, title));
      frame.classList.add("read-aloud-frame");
      frame.prepend(button);
      added.push(button);
    });
    return () => added.forEach((button) => button.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can, ...deps]);
}
