// 3D dice, the parts that need no three.js: this seat's dice settings, how
// its next roll is thrown, and which chat cards are still rolling (a card
// shows its result when its dice have landed, as FG's onDiceLanded).

import type { ChatLine, RollResult } from "../session/useSession";

// The design on the dice (the Gilded Die's six, and more), what they are made
// of, the numbers' lettering, and an effect that follows them as they roll.
export type DiceTheme = "classic" | "dragonhide" | "starfall" | "bone" | "magma" | "leviathan" | "marble" | "swirl" | "speckle" | "wood" | "runes" | "stripes";
export type DiceMaterial = "plastic" | "glass" | "metal" | "pearl" | "stone" | "wood";
export type DiceEffect = "none" | "sparkles" | "fire" | "frost" | "arcane" | "shadow" | "glow";
export type DiceFont = "classic" | "bold" | "runic" | "script";
// accent: the second colour of two-colour designs. crit: a natural 20 bursts gold, a 1 red.
export type DiceLook = { theme: DiceTheme; body: string; ink: string; accent: string; material: DiceMaterial; effect: DiceEffect; font: DiceFont; crit: boolean };

export const DESIGNS: { id: DiceTheme; name: string }[] = [
  { id: "classic", name: "Solid" },
  { id: "marble", name: "Marble" },
  { id: "swirl", name: "Swirl" },
  { id: "speckle", name: "Speckle" },
  { id: "stripes", name: "Stripes" },
  { id: "wood", name: "Wood grain" },
  { id: "runes", name: "Runes" },
  { id: "dragonhide", name: "Dragonhide" },
  { id: "starfall", name: "Starfall" },
  { id: "bone", name: "Bone" },
  { id: "magma", name: "Magma" },
  { id: "leviathan", name: "Leviathan" },
];
export const MATERIALS: { id: DiceMaterial; name: string }[] = [
  { id: "plastic", name: "Resin" },
  { id: "glass", name: "Glass" },
  { id: "metal", name: "Metal" },
  { id: "pearl", name: "Pearl" },
  { id: "stone", name: "Stone" },
  { id: "wood", name: "Wood" },
];
export const EFFECTS: { id: DiceEffect; name: string }[] = [
  { id: "none", name: "None" },
  { id: "sparkles", name: "Sparkles" },
  { id: "fire", name: "Fire" },
  { id: "frost", name: "Frost" },
  { id: "arcane", name: "Arcane" },
  { id: "shadow", name: "Shadow" },
  { id: "glow", name: "Glow" },
];
export const FONTS: { id: DiceFont; name: string }[] = [
  { id: "classic", name: "Classic" },
  { id: "bold", name: "Bold" },
  { id: "runic", name: "Carved" },
  { id: "script", name: "Script" },
];
// Where the dice leave the hand and how fast, as fractions of the window (per second).
export type DiceThrow = { x: number; y: number; vx: number; vy: number };

const set = (name: string, look: Partial<DiceLook> & Pick<DiceLook, "theme" | "body" | "ink">): { name: string } & DiceLook => ({
  name,
  accent: "#d8b46a",
  material: "plastic",
  effect: "none",
  font: "classic",
  crit: true,
  ...look,
});

// Ready-made sets: the Gilded Die's six, and Kraken's own.
export const PRESETS: ({ name: string } & DiceLook)[] = [
  set("Classic Ruby", { theme: "classic", body: "#9d2136", ink: "#f9e7c1" }),
  set("Dragonhide", { theme: "dragonhide", body: "#245b3b", ink: "#f5d99d" }),
  set("Starfall", { theme: "starfall", body: "#101c4c", ink: "#e8f3ff", effect: "sparkles" }),
  set("Ancient Bone", { theme: "bone", body: "#d8c49c", ink: "#3a281d", material: "stone" }),
  set("Magma Vein", { theme: "magma", body: "#541d20", ink: "#ffd26f", effect: "fire" }),
  set("Leviathan", { theme: "leviathan", body: "#126d73", ink: "#dcfff5", material: "pearl" }),
  set("Frost Glass", { theme: "classic", body: "#9fd8ff", ink: "#ffffff", material: "glass", effect: "frost" }),
  set("Molten Gold", { theme: "classic", body: "#d9a63a", ink: "#3b1d05", material: "metal", effect: "fire", font: "bold" }),
  set("Arcane Pearl", { theme: "swirl", body: "#4b2a7a", accent: "#4fd6d0", ink: "#f4e9ff", material: "pearl", effect: "arcane", font: "runic" }),
  set("Obsidian", { theme: "classic", body: "#17121c", ink: "#c9a2ff", material: "glass", effect: "shadow" }),
  set("Carrara", { theme: "marble", body: "#ece8e1", accent: "#6d6a73", ink: "#1f2a44", material: "stone", font: "runic" }),
  set("Oak and Iron", { theme: "wood", body: "#8a5a2f", accent: "#3c2412", ink: "#f1dfb8", material: "wood", font: "bold" }),
  set("Rune Steel", { theme: "runes", body: "#5a6470", accent: "#7fe7ff", ink: "#e9f6ff", material: "metal", effect: "glow", font: "runic" }),
  set("Kraken Deep", { theme: "speckle", body: "#0f3b44", accent: "#4fd6d0", ink: "#f2d08d", effect: "sparkles" }),
];

export type DiceSettings = { show: boolean; sound: boolean; volume: number; look: DiceLook };
type SettingsPatch = Partial<Omit<DiceSettings, "look">> & { look?: Partial<DiceLook> };
const { name: _first, ...firstLook } = PRESETS[0];
const DEFAULTS: DiceSettings = { show: true, sound: true, volume: 0.7, look: firstLook };

// A look from another seat (or an older one) with whatever it leaves out filled in.
export function fullLook(look: Partial<DiceLook>): DiceLook {
  return { ...firstLook, theme: "classic", material: "plastic", effect: "none", font: "classic", crit: true, accent: "#d8b46a", ...look } as DiceLook;
}


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
