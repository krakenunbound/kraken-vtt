import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { openPopOut, PopOutWindow, screenOffset, type ScreenPlace } from "./PopOut";

// Floating windows over the desktop, as FG's: opened from the sidebar, moved
// by the title bar, resized from the corner, brought forward on a click.
// Each kind remembers where it was (in this browser). A window dragged past
// the edge of the main window, or sent out with its pop-out button, becomes a
// window of its own that can go on another monitor.

export type WindowKind = "characters" | "party" | "combat" | "players" | "sheet" | "settings" | "decals" | "wallpapers" | "gmicons" | "krits" | "dice" | "sound" | "books" | "book" | "images" | "picture" | "notes" | "note";
type Placement = { x: number; y: number; w: number; h: number; out?: ScreenPlace | null };
export type OpenWindow = { key: string; kind: WindowKind; title: string; payload?: string; z: number; popped: boolean } & Placement;

const DEFAULTS: Record<WindowKind, Placement> = {
  characters: { x: 120, y: 50, w: 940, h: 800 },
  sheet: { x: 160, y: 50, w: 660, h: 820 },
  party: { x: 180, y: 60, w: 760, h: 720 },
  combat: { x: 260, y: 70, w: 640, h: 520 },
  players: { x: 300, y: 120, w: 420, h: 360 },
  settings: { x: 340, y: 110, w: 460, h: 170 },
  decals: { x: 220, y: 70, w: 720, h: 600 },
  wallpapers: { x: 240, y: 80, w: 720, h: 600 },
  dice: { x: 220, y: 56, w: 600, h: 780 },
  gmicons: { x: 260, y: 90, w: 640, h: 520 },
  krits: { x: 300, y: 110, w: 520, h: 420 },
  sound: { x: 240, y: 70, w: 620, h: 640 },
  books: { x: 200, y: 64, w: 470, h: 640 },
  book: { x: 150, y: 44, w: 1120, h: 780 },
  images: { x: 190, y: 56, w: 960, h: 720 },
  picture: { x: 560, y: 70, w: 720, h: 600 },
  notes: { x: 260, y: 80, w: 420, h: 480 },
  note: { x: 700, y: 70, w: 420, h: 620 },
};

// The height of a window's own title bar, which a window of its own does not need.
const TITLE = 34;

function remembered(kind: WindowKind): Placement {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`kraken-window:${kind}`) ?? "null");
    if (saved && [saved.x, saved.y, saved.w, saved.h].every((value) => Number.isFinite(value))) return { x: saved.x, y: saved.y, w: saved.w, h: saved.h, out: saved.out ?? null };
  } catch {
    /* no memory: defaults */
  }
  return DEFAULTS[kind];
}

function remember(kind: WindowKind, placement: Placement) {
  try {
    window.localStorage.setItem(`kraken-window:${kind}`, JSON.stringify({ x: placement.x, y: placement.y, w: placement.w, h: placement.h, out: placement.out ?? null }));
  } catch {
    /* only the position is lost */
  }
}

type Manager = {
  windows: OpenWindow[];
  open: (kind: WindowKind, title: string, payload?: string) => void;
  toggle: (kind: WindowKind, title: string) => void;
  close: (key: string) => void;
  focus: (key: string) => void;
  move: (key: string, placement: Partial<Placement>) => void;
  isOpen: (kind: WindowKind) => boolean;
  // Out to a window of its own (at that place on the screen), and back in.
  popOut: (key: string, place?: ScreenPlace) => boolean;
  dockBack: (key: string) => void;
  popup: (key: string) => Window | undefined;
};

const WindowContext = createContext<Manager | null>(null);

export function useWindows(): Manager {
  const manager = useContext(WindowContext);
  if (!manager) throw new Error("useWindows outside WindowProvider");
  return manager;
}

export function WindowProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<OpenWindow[]>([]);
  const top = useRef(10);
  const popups = useRef(new Map<string, Window>());

  // Windows of their own go when the table does.
  useEffect(() => {
    const all = popups.current;
    const closeAll = () => all.forEach((child) => child.close());
    window.addEventListener("pagehide", closeAll);
    return () => {
      window.removeEventListener("pagehide", closeAll);
      closeAll();
      all.clear();
    };
  }, []);

  // A kind last left in a window of its own opens there again, if the browser lets it.
  const place = useCallback((key: string, title: string, placement: Placement): { popped: boolean } & Placement => {
    if (placement.out) {
      const existing = popups.current.get(key);
      const child = existing && !existing.closed ? existing : openPopOut(title, placement.out);
      if (child) {
        popups.current.set(key, child);
        return { ...placement, popped: true };
      }
    }
    return { ...fitToScreen(placement), out: null, popped: false };
  }, []);

  const focus = useCallback((key: string) => {
    setWindows((current) => current.map((item) => (item.key === key ? { ...item, z: ++top.current } : item)));
  }, []);

  const open = useCallback(
    (kind: WindowKind, title: string, payload?: string) => {
      const key = payload ? `${kind}:${payload}` : kind;
      const existing = windows.find((item) => item.key === key);
      if (existing?.popped) {
        popups.current.get(key)?.focus();
        return;
      }
      if (existing) {
        setWindows((current) => current.map((item) => (item.key === key ? { ...item, title, z: ++top.current } : item)));
        return;
      }
      // Opened here, not in a state update, so the browser sees the click that asked for it.
      const saved = remembered(kind);
      const offset = windows.filter((item) => item.kind === kind).length * 28;
      const out = saved.out ? { ...saved.out, sx: saved.out.sx + offset, sy: saved.out.sy + offset } : null;
      const placed = place(key, title, { ...saved, x: saved.x + offset, y: saved.y + offset, out });
      setWindows((current) => (current.some((item) => item.key === key) ? current : [...current, { key, kind, title, payload, z: ++top.current, ...placed }]));
    },
    [windows, place],
  );

  const close = useCallback((key: string) => {
    popups.current.get(key)?.close();
    popups.current.delete(key);
    setWindows((current) => current.filter((item) => item.key !== key));
  }, []);

  const toggle = useCallback(
    (kind: WindowKind, title: string) => {
      const existing = windows.find((item) => item.key === kind);
      if (existing?.popped) {
        popups.current.get(kind)?.focus();
        return;
      }
      if (existing && existing.z === top.current) {
        close(kind);
        return;
      }
      if (existing) {
        focus(kind);
        return;
      }
      const placed = place(kind, title, remembered(kind));
      setWindows((current) => (current.some((item) => item.key === kind) ? current : [...current, { key: kind, kind, title, z: ++top.current, ...placed }]));
    },
    [windows, place, close, focus],
  );

  const move = useCallback((key: string, placement: Partial<Placement>) => {
    setWindows((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...placement };
        remember(item.kind, next);
        return next;
      }),
    );
  }, []);

  const popOut = useCallback(
    (key: string, at?: ScreenPlace) => {
      const item = windows.find((entry) => entry.key === key);
      if (!item) return false;
      if (item.popped) return true;
      const offset = screenOffset();
      const out = at ?? { sx: offset.x + item.x, sy: offset.y + item.y, w: item.w, h: Math.max(200, item.h - TITLE) };
      const child = openPopOut(item.title, out);
      if (!child) return false;
      popups.current.set(key, child);
      setWindows((current) => current.map((entry) => (entry.key === key ? { ...entry, popped: true, out } : entry)));
      remember(item.kind, { ...item, out });
      return true;
    },
    [windows],
  );

  const dockBack = useCallback((key: string) => {
    const child = popups.current.get(key);
    popups.current.delete(key);
    const offset = screenOffset();
    // Back in the main window, near where it was on the screen.
    const at = child && !child.closed ? { x: child.screenX - offset.x, y: child.screenY - offset.y, w: child.innerWidth, h: child.innerHeight + TITLE } : null;
    child?.close();
    setWindows((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const from = at ?? item;
        const next = { ...item, ...fitToScreen({ x: from.x, y: from.y, w: Math.max(320, from.w), h: Math.max(220, from.h) }), popped: false, out: null, z: ++top.current };
        remember(item.kind, next);
        return next;
      }),
    );
  }, []);

  const value = useMemo<Manager>(
    () => ({
      windows,
      open,
      toggle,
      close,
      focus,
      move,
      popOut,
      dockBack,
      popup: (key) => popups.current.get(key),
      isOpen: (kind) => windows.some((item) => item.kind === kind),
    }),
    [windows, open, toggle, close, focus, move, popOut, dockBack],
  );
  return <WindowContext.Provider value={value}>{children}</WindowContext.Provider>;
}

function fitToScreen(place: Placement): Placement {
  const width = typeof window === "undefined" ? 1400 : window.innerWidth;
  const height = typeof window === "undefined" ? 900 : window.innerHeight;
  const w = Math.min(place.w, Math.max(320, width - 40));
  const h = Math.min(place.h, Math.max(240, height - 80));
  return { w, h, x: Math.min(Math.max(0, place.x), Math.max(0, width - w - 10)), y: Math.min(Math.max(48, place.y), Math.max(48, height - h - 10)) };
}

// One window's frame: a title bar to drag, pop-out and close buttons, a resize
// corner. Dragged past the edge of the main window it pops out, and keeps
// following the pointer until it is let go.
export function FloatingWindow({ item, children }: { item: OpenWindow; children: ReactNode }) {
  const { focus, move, close, popOut, dockBack, popup } = useWindows();
  const drag = useRef<{ mode: "move" | "size"; startX: number; startY: number; grabX: number; grabY: number; place: Placement } | null>(null);
  const live = useRef({ item, move, popOut, popup });
  live.current = { item, move, popOut, popup };

  useEffect(() => {
    if (item.popped) return;
    const onResize = () => move(item.key, fitToScreen(item));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [item, move]);

  // The drag is followed on the whole main window, so it carries on after the
  // frame has left the page for a window of its own.
  const begin = (mode: "move" | "size") => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (mode === "move" && (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    focus(item.key);
    drag.current = { mode, startX: event.clientX, startY: event.clientY, grabX: event.clientX - item.x, grabY: event.clientY - item.y, place: { x: item.x, y: item.y, w: item.w, h: item.h } };
    const during = (moveEvent: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const { item: now, move: moveTo, popOut: out, popup: child } = live.current;
      if (current.mode === "size") {
        moveTo(now.key, { w: Math.max(320, current.place.w + moveEvent.clientX - current.startX), h: Math.max(220, current.place.h + moveEvent.clientY - current.startY) });
        return;
      }
      if (now.popped) {
        child(now.key)?.moveTo(moveEvent.screenX - current.grabX, moveEvent.screenY - current.grabY);
        return;
      }
      const outside = moveEvent.clientX <= 0 || moveEvent.clientY <= 0 || moveEvent.clientX >= window.innerWidth - 1 || moveEvent.clientY >= window.innerHeight - 1;
      if (outside && out(now.key, { sx: moveEvent.screenX - current.grabX, sy: moveEvent.screenY - current.grabY, w: now.w, h: Math.max(200, now.h - TITLE) })) return;
      // Not held inside the main window: only the title bar has to stay in reach.
      moveTo(now.key, {
        x: Math.min(Math.max(80 - now.w, current.place.x + moveEvent.clientX - current.startX), window.innerWidth - 80),
        y: Math.min(Math.max(0, current.place.y + moveEvent.clientY - current.startY), window.innerHeight - 40),
      });
    };
    const finish = () => {
      drag.current = null;
      window.removeEventListener("pointermove", during);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", during);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const child = item.popped ? popup(item.key) : undefined;
  if (item.popped && child) {
    return (
      <PopOutWindow child={child} title={`${item.title} · Kraken`} onClosed={() => close(item.key)} onPlaced={(out) => move(item.key, { out })}>
        <section className="window popped" data-window={item.kind} aria-label={item.title}>
          <header className="popout-bar">
            <span>{item.title}</span>
            <button type="button" className="window-close" title="Back into the main window" aria-label={`Put ${item.title} back in the main window`} onClick={() => dockBack(item.key)}>
              <Icon name="dock" size={16} />
            </button>
          </header>
          <div className="window-body">{children}</div>
        </section>
      </PopOutWindow>
    );
  }

  return (
    <section
      className="window"
      data-window={item.kind}
      role="dialog"
      aria-label={item.title}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: 100 + item.z }}
      onPointerDown={() => focus(item.key)}
    >
      <header className="window-title" onPointerDown={begin("move")} onDoubleClick={() => move(item.key, fitToScreen(DEFAULTS[item.kind]))}>
        <span>{item.title}</span>
        <button type="button" className="window-close" title="Out to a window of its own (for another monitor)" aria-label={`Pop out ${item.title}`} onClick={() => popOut(item.key)}>
          <Icon name="popout" size={16} />
        </button>
        <button type="button" className="window-close" aria-label={`Close ${item.title}`} onClick={() => close(item.key)}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="window-body">{children}</div>
      <div className="window-resize" onPointerDown={begin("size")} aria-hidden="true" />
    </section>
  );
}
