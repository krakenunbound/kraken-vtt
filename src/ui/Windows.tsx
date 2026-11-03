import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

// Floating windows over the desktop, as FG's: opened from the sidebar, moved
// by the title bar, resized from the corner, brought forward on a click.
// Each kind remembers where it was (in this browser).

export type WindowKind = "characters" | "party" | "combat" | "players" | "sheet";
type Placement = { x: number; y: number; w: number; h: number };
export type OpenWindow = { key: string; kind: WindowKind; title: string; payload?: string; z: number } & Placement;

const DEFAULTS: Record<WindowKind, Placement> = {
  characters: { x: 120, y: 70, w: 760, h: 620 },
  sheet: { x: 160, y: 90, w: 640, h: 620 },
  party: { x: 180, y: 80, w: 720, h: 560 },
  combat: { x: 260, y: 70, w: 640, h: 520 },
  players: { x: 300, y: 120, w: 420, h: 360 },
};

function remembered(kind: WindowKind): Placement {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`kraken-window:${kind}`) ?? "null");
    if (saved && [saved.x, saved.y, saved.w, saved.h].every((value) => Number.isFinite(value))) return saved;
  } catch {
    /* no memory: defaults */
  }
  return DEFAULTS[kind];
}

function remember(kind: WindowKind, placement: Placement) {
  try {
    window.localStorage.setItem(`kraken-window:${kind}`, JSON.stringify(placement));
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

  const focus = useCallback((key: string) => {
    setWindows((current) => current.map((item) => (item.key === key ? { ...item, z: ++top.current } : item)));
  }, []);

  const open = useCallback((kind: WindowKind, title: string, payload?: string) => {
    const key = payload ? `${kind}:${payload}` : kind;
    setWindows((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) return current.map((item) => (item.key === key ? { ...item, title, z: ++top.current } : item));
      const place = remembered(kind);
      const offset = current.filter((item) => item.kind === kind).length * 28;
      const fit = fitToScreen({ ...place, x: place.x + offset, y: place.y + offset });
      return [...current, { key, kind, title, payload, z: ++top.current, ...fit }];
    });
  }, []);

  const close = useCallback((key: string) => setWindows((current) => current.filter((item) => item.key !== key)), []);

  const toggle = useCallback(
    (kind: WindowKind, title: string) => {
      setWindows((current) => {
        const existing = current.find((item) => item.key === kind);
        if (existing && existing.z === top.current) return current.filter((item) => item.key !== kind);
        if (existing) return current.map((item) => (item.key === kind ? { ...item, z: ++top.current } : item));
        const fit = fitToScreen(remembered(kind));
        return [...current, { key: kind, kind, title, z: ++top.current, ...fit }];
      });
    },
    [],
  );

  const move = useCallback((key: string, placement: Partial<Placement>) => {
    setWindows((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...placement };
        remember(item.kind, { x: next.x, y: next.y, w: next.w, h: next.h });
        return next;
      }),
    );
  }, []);

  const value = useMemo<Manager>(
    () => ({ windows, open, toggle, close, focus, move, isOpen: (kind) => windows.some((item) => item.kind === kind) }),
    [windows, open, toggle, close, focus, move],
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

// One window's frame: a title bar to drag, a close button, a resize corner.
export function FloatingWindow({ item, children }: { item: OpenWindow; children: ReactNode }) {
  const { focus, move, close } = useWindows();
  const drag = useRef<{ pointerId: number; mode: "move" | "size"; startX: number; startY: number; place: Placement } | null>(null);

  useEffect(() => {
    const onResize = () => move(item.key, fitToScreen(item));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [item, move]);

  const begin = (mode: "move" | "size") => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (mode === "move" && (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    focus(item.key);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, place: { x: item.x, y: item.y, w: item.w, h: item.h } };
  };
  const during = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (current.mode === "move") move(item.key, fitToScreen({ ...current.place, x: current.place.x + dx, y: current.place.y + dy }));
    else move(item.key, { w: Math.max(320, current.place.w + dx), h: Math.max(220, current.place.h + dy) });
  };
  const end = (event: React.PointerEvent) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return (
    <section
      className="window"
      data-window={item.kind}
      role="dialog"
      aria-label={item.title}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h, zIndex: 100 + item.z }}
      onPointerDown={() => focus(item.key)}
    >
      <header className="window-title" onPointerDown={begin("move")} onPointerMove={during} onPointerUp={end} onDoubleClick={() => move(item.key, fitToScreen(DEFAULTS[item.kind]))}>
        <span>{item.title}</span>
        <button type="button" className="window-close" aria-label={`Close ${item.title}`} onClick={() => close(item.key)}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="window-body">{children}</div>
      <div className="window-resize" onPointerDown={begin("size")} onPointerMove={during} onPointerUp={end} aria-hidden="true" />
    </section>
  );
}
