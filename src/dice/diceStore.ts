// 3D dice, the parts that need no three.js: this seat's dice settings, how
// its next roll is thrown, and which chat cards are still rolling (a card
// shows its result when its dice have landed, as FG's onDiceLanded).

import type { ChatLine, RollResult } from "../session/useSession";

export type DiceTheme = "classic" | "dragonhide" | "starfall" | "bone" | "magma" | "leviathan";
export type DiceLook = { theme: DiceTheme; body: string; ink: string };
// Where the dice leave the hand and how fast, as fractions of the window (per second).
export type DiceThrow = { x: number; y: number; vx: number; vy: number };

export const PRESETS: ({ name: string } & DiceLook)[] = [
  { name: "Classic Ruby", theme: "classic", body: "#9d2136", ink: "#f9e7c1" },
  { name: "Dragonhide", theme: "dragonhide", body: "#245b3b", ink: "#f5d99d" },
  { name: "Starfall", theme: "starfall", body: "#101c4c", ink: "#e8f3ff" },
  { name: "Ancient Bone", theme: "bone", body: "#d8c49c", ink: "#3a281d" },
  { name: "Magma Vein", theme: "magma", body: "#541d20", ink: "#ffd26f" },
  { name: "Leviathan", theme: "leviathan", body: "#126d73", ink: "#dcfff5" },
];

export type DiceSettings = { show: boolean; sound: boolean; volume: number; look: DiceLook };
type SettingsPatch = Partial<Omit<DiceSettings, "look">> & { look?: Partial<DiceLook> };
const DEFAULTS: DiceSettings = { show: true, sound: true, volume: 0.7, look: { theme: PRESETS[0].theme, body: PRESETS[0].body, ink: PRESETS[0].ink } };

// The dice that can be drawn: d4 to d20, and d100 as two d10s.
export const SHAPED = new Set([4, 6, 8, 10, 12, 20, 100]);

function load(): DiceSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem("kraken-dice") ?? "null");
    if (saved && typeof saved === "object") return { ...DEFAULTS, ...saved, look: { ...DEFAULTS.look, ...(saved.look ?? {}) } };
  } catch {
    /* defaults */
  }
  return DEFAULTS;
}

let settings: DiceSettings = typeof window === "undefined" ? DEFAULTS : load();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

export const diceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  settings: () => settings,
  update(patch: SettingsPatch) {
    settings = { ...settings, ...patch, look: { ...settings.look, ...(patch.look ?? {}) } };
    try {
      window.localStorage.setItem("kraken-dice", JSON.stringify(settings));
    } catch {
      /* only this browser forgets */
    }
    changed();
  },
};

// --- How this seat's next roll is thrown ------------------------------------

let explicitThrow: { value: DiceThrow; at: number } | null = null;
let lastPress: { x: number; y: number; at: number } | null = null;

if (typeof window !== "undefined") {
  // A roll asked for by a click is thrown from where the click was, toward the middle.
  window.addEventListener("pointerdown", (event) => (lastPress = { x: event.clientX, y: event.clientY, at: performance.now() }), true);
}

// A die dragged from the tray and let go: thrown the way the hand moved.
export function setThrow(value: DiceThrow) {
  explicitThrow = { value, at: performance.now() };
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

// What goes with a roll request: the throw and how this seat's dice look.
export function throwIntent(): { throw?: DiceThrow; look: DiceLook } {
  const now = performance.now();
  const look = settings.look;
  if (explicitThrow && now - explicitThrow.at < 1500) {
    const value = explicitThrow.value;
    explicitThrow = null;
    return { throw: value, look };
  }
  if (lastPress && now - lastPress.at < 2500 && typeof window !== "undefined") {
    const x = clamp(lastPress.x / window.innerWidth, 0.02, 0.98);
    const y = clamp(lastPress.y / window.innerHeight, 0.02, 0.98);
    const dx = 0.5 - x || 0.01;
    const dy = 0.45 - y || 0.01;
    const length = Math.hypot(dx, dy);
    return { throw: { x, y, vx: (dx / length) * 0.75, vy: (dy / length) * 0.75 }, look };
  }
  return { look };
}

// --- Cards still rolling ----------------------------------------------------

export function lineKey(line: ChatLine) {
  return `${line.at}|${line.id}|${line.roll?.formula ?? ""}|${line.roll?.total ?? ""}`;
}

export function hasShapedDice(roll: RollResult) {
  return roll.terms.some((term) => term.kind === "dice" && SHAPED.has(term.sides) && term.rolls.length > 0);
}

const pending = new Set<string>();
const queue: ChatLine[] = [];
const pendingListeners = new Set<() => void>();
let layers = 0;
let version = 0;
const pendingChanged = () => {
  version += 1;
  pendingListeners.forEach((listener) => listener());
};

export const rolling = {
  subscribe(listener: () => void) {
    pendingListeners.add(listener);
    return () => pendingListeners.delete(listener);
  },
  version: () => version,
  has: (line: ChatLine) => pending.has(lineKey(line)),
  // A roll arrived live: its dice are thrown, and its card waits for them.
  arrived(line: ChatLine) {
    if (!line.roll || !settings.show || layers === 0 || !hasShapedDice(line.roll)) return;
    const key = lineKey(line);
    pending.add(key);
    queue.push(line);
    // Whatever happens to the dice, the result is not held back for long.
    window.setTimeout(() => rolling.landed(line), 12000);
    pendingChanged();
  },
  landed(line: ChatLine) {
    if (pending.delete(lineKey(line))) pendingChanged();
  },
  take(): ChatLine[] {
    return queue.splice(0, queue.length);
  },
  // The dice layer is there to throw them (it may fail: no WebGL).
  attach() {
    layers += 1;
    return () => {
      layers -= 1;
      if (layers === 0) {
        pending.clear();
        queue.length = 0;
        pendingChanged();
      }
    };
  },
};

// A roll into the dice tower whose result this seat does not see: the dice
// still drop into the tower.
export type TowerDrop = { sides: number[]; from: DiceThrow; to: { x: number; y: number } };
const towerListeners = new Set<(drop: TowerDrop) => void>();
export const tower = {
  subscribe(listener: (drop: TowerDrop) => void) {
    towerListeners.add(listener);
    return () => towerListeners.delete(listener);
  },
  drop(drop: TowerDrop) {
    towerListeners.forEach((listener) => listener(drop));
  },
};
