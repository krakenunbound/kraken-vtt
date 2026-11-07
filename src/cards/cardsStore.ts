// Ability cards, this player's choice (off unless they turn it on in Settings),
// kept in this browser: whether the Cards button shows, and how the hand is laid out.
export type CardLayout = "fan" | "spread";
type CardSettings = { on: boolean; layout: CardLayout; effects: boolean };

const KEY = "kraken-cards";
const DEFAULTS: CardSettings = { on: false, layout: "spread", effects: true };
let current: CardSettings = read();
const listeners = new Set<() => void>();

function read(): CardSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object") return { ...DEFAULTS, ...saved, layout: saved.layout === "fan" ? "fan" : "spread" };
  } catch {
    /* defaults */
  }
  return { ...DEFAULTS };
}

export const cardsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  settings: () => current,
  set(patch: Partial<CardSettings>) {
    current = { ...current, ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* this time only */
    }
    listeners.forEach((listener) => listener());
  },
};
