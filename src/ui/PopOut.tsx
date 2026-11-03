import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A real window of the operating system, outside the main one, so a panel can
// sit on another monitor. Its content is rendered here (a portal), so it shares
// the session with the main window; the main window's styles are copied in.

export type ScreenPlace = { sx: number; sy: number; w: number; h: number };

let serial = 0;

function copyStyles(from: Document, to: Document) {
  const clone = (node: Node) => {
    if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === "stylesheet")) {
      to.head.appendChild(to.importNode(node, true));
    }
  };
  from.head.childNodes.forEach(clone);
  // The dev server adds and replaces styles as files change.
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      change.addedNodes.forEach(clone);
      if (change.type === "characterData" || change.type === "childList") {
        const target = change.target instanceof HTMLStyleElement ? change.target : change.target.parentNode;
        if (target instanceof HTMLStyleElement) {
          const twin = [...to.head.querySelectorAll("style")].find((style) => style.dataset.viteDevId === target.dataset.viteDevId);
          if (twin && target.dataset.viteDevId) twin.textContent = target.textContent;
        }
      }
    }
  });
  observer.observe(from.head, { childList: true, subtree: true, characterData: true });
  return observer;
}

// Opens the window at once (call it while handling a click or a drag, or a
// browser may block it). Returns null when it is blocked.
export function openPopOut(title: string, place: ScreenPlace): Window | null {
  serial += 1;
  const features = `popup=yes,width=${Math.round(place.w)},height=${Math.round(place.h)},left=${Math.round(place.sx)},top=${Math.round(place.sy)}`;
  const child = window.open("", `kraken-popout-${serial}`, features);
  if (!child) return null;
  const doc = child.document;
  doc.title = title;
  const base = doc.createElement("base");
  base.href = document.baseURI;
  doc.head.appendChild(base);
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) doc.head.appendChild(doc.importNode(icon, true));
  doc.documentElement.style.colorScheme = "dark";
  doc.body.className = "popout-body";
  return child;
}

export function PopOutWindow({
  child,
  title,
  onClosed,
  onPlaced,
  children,
}: {
  child: Window;
  title: string;
  onClosed: () => void;
  onPlaced: (place: ScreenPlace) => void;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const handlers = useRef({ onClosed, onPlaced });
  handlers.current = { onClosed, onPlaced };

  useEffect(() => {
    const doc = child.document;
    const observer = copyStyles(document, doc);
    const container = doc.createElement("div");
    container.className = "popout-root";
    doc.body.appendChild(container);
    setHost(container);

    let closing = false;
    let last = "";
    // Windows have no "moved" event: look where it is now and then.
    const watch = window.setInterval(() => {
      if (child.closed) {
        window.clearInterval(watch);
        if (!closing) handlers.current.onClosed();
        return;
      }
      const place = { sx: child.screenX, sy: child.screenY, w: child.innerWidth, h: child.innerHeight };
      const key = JSON.stringify(place);
      if (key !== last) {
        last = key;
        handlers.current.onPlaced(place);
      }
    }, 700);
    const onGone = () => {
      if (!closing) handlers.current.onClosed();
    };
    child.addEventListener("pagehide", onGone);
    // Closing the window is for whoever opened it (see closePopOuts).
    return () => {
      closing = true;
      window.clearInterval(watch);
      observer.disconnect();
      child.removeEventListener("pagehide", onGone);
      setHost(null);
      container.remove();
      doc.head.querySelectorAll("style, link[rel=stylesheet]").forEach((node) => node.remove());
    };
  }, [child]);

  useEffect(() => {
    child.document.title = title;
  }, [child, title]);

  return host ? createPortal(children, host) : null;
}

// Opening a pop-out: the main window's offset on the screen, to turn a place
// in the page into a place on the screen.
export function screenOffset() {
  return { x: window.screenX + Math.max(0, (window.outerWidth - window.innerWidth) / 2), y: window.screenY + Math.max(0, window.outerHeight - window.innerHeight) };
}
