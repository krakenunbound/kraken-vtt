// 3D dice, the parts that need no three.js: this seat's dice settings, how
// its next roll is thrown, and which chat cards are still rolling (a card
// shows its result when its dice have landed, as FG's onDiceLanded).

import type { ChatLine, RollResult } from "../session/useSession";

// The design on the dice (the Gilded Die's six, and more), what they are made
// of, the numbers' lettering, and an effect that follows them as they roll.
export type DiceTheme =
  | "classic" | "dragonhide" | "starfall" | "bone" | "magma" | "leviathan" | "marble" | "swirl" | "speckle" | "wood" | "runes" | "stripes"
  // The Gilded Die's newer themes (gilded.ts draws them).
  | "aether" | "reliquary" | "rosewindow" | "gilded" | "emerald" | "frost" | "obsidian" | "bloodstone" | "arcane" | "void" | "hero"
  | "monster" | "wizard" | "bard" | "necromancer" | "goblin" | "wyrm" | "ghost" | "undead" | "traveller" | "mythos";
// design: the theme's own finish (the Gilded Die's: its glass, metal or enamel, inner crystal, gems).
export type DiceMaterial = "plastic" | "glass" | "metal" | "pearl" | "stone" | "wood" | "design";
export type DiceEffect = "none" | "sparkles" | "fire" | "frost" | "arcane" | "shadow" | "glow" | "aura" | "wisp" | "spark" | "embers" | "holy" | "charge" | "notes" | "ion";
export type DiceFont = "classic" | "bold" | "runic" | "script" | "glow" | "metal" | "engrave";
// accent: the second colour of two-colour designs. crit: a natural 20 bursts gold, a 1 red.
// pips: a d6 shows pips, not numbers.
export type DiceLook = { theme: DiceTheme; body: string; ink: string; accent: string; material: DiceMaterial; effect: DiceEffect; font: DiceFont; crit: boolean; pips?: boolean };

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
  { id: "aether", name: "Aether" },
  { id: "emerald", name: "Emerald" },
  { id: "frost", name: "Frostcrystal" },
  { id: "obsidian", name: "Obsidian" },
  { id: "void", name: "Voidglass" },
  { id: "ghost", name: "Ghost" },
  { id: "reliquary", name: "Reliquary" },
  { id: "rosewindow", name: "Rose window" },
  { id: "gilded", name: "Gilded" },
  { id: "bloodstone", name: "Bloodstone" },
  { id: "hero", name: "Champion" },
  { id: "monster", name: "Behemoth" },
  { id: "wyrm", name: "Wyrmscale" },
  { id: "undead", name: "Gravewrought" },
  { id: "arcane", name: "Arcane seal" },
  { id: "wizard", name: "Wizard" },
  { id: "bard", name: "Bard" },
  { id: "necromancer", name: "Necromancer" },
  { id: "goblin", name: "Goblin scrap" },
  { id: "traveller", name: "Imperial" },
  { id: "mythos", name: "Mythos" },
];
export const MATERIALS: { id: DiceMaterial; name: string }[] = [
  { id: "plastic", name: "Resin" },
  { id: "glass", name: "Glass" },
  { id: "metal", name: "Metal" },
  { id: "pearl", name: "Pearl" },
  { id: "stone", name: "Stone" },
  { id: "wood", name: "Wood" },
  { id: "design", name: "Its own" },
];
export const EFFECTS: { id: DiceEffect; name: string }[] = [
  { id: "none", name: "None" },
  { id: "sparkles", name: "Sparkles" },
  { id: "fire", name: "Fire" },
  { id: "frost", name: "Frost" },
  { id: "arcane", name: "Arcane" },
  { id: "shadow", name: "Shadow" },
  { id: "glow", name: "Glow" },
  { id: "aura", name: "Soft glow" },
  { id: "spark", name: "Sparks" },
  { id: "embers", name: "Embers" },
  { id: "wisp", name: "Ectoplasm" },
  { id: "holy", name: "Holy motes" },
  { id: "charge", name: "Charged orb" },
  { id: "notes", name: "Music" },
  { id: "ion", name: "Ion streak" },
];
export const FONTS: { id: DiceFont; name: string }[] = [
  { id: "classic", name: "Classic" },
  { id: "bold", name: "Bold" },
  { id: "runic", name: "Carved" },
  { id: "script", name: "Script" },
  { id: "glow", name: "Glowing" },
  { id: "metal", name: "Gilt" },
  { id: "engrave", name: "Engraved" },
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

// Ready-made sets: the Gilded Die's, in its five groups, and Kraken's own (SET_GROUPS says which).
export const SET_GROUPS: { name: string; sets: string[] }[] = [
  { name: "Cores", sets: ["Aether Core", "Emerald Cut", "Frostcrystal", "Obsidian Glass", "Voidglass", "Ghost"] },
  { name: "Relics", sets: ["Reliquary", "Rose Window", "Classic Ruby", "Gilded", "Bloodstone", "Champion"] },
  { name: "Wilds", sets: ["Dragonhide", "Wyrmscale", "Behemoth", "Ancient Bone", "Gravewrought", "Leviathan", "Magma Vein"] },
  { name: "Classes", sets: ["Arcane Seal", "Wizard", "Bard", "Necromancer", "Goblin Scrap"] },
  { name: "Worlds", sets: ["Starfall", "Imperial", "Mythos"] },
  { name: "Kraken", sets: ["Frost Glass", "Molten Gold", "Arcane Pearl", "Obsidian", "Carrara", "Oak and Iron", "Rune Steel", "Kraken Deep"] },
];
export const PRESETS: ({ name: string } & DiceLook)[] = [
  set("Aether Core", { theme: "aether", body: "#1c6dff", ink: "#e8944a", material: "design", effect: "aura", font: "metal" }),
  set("Reliquary", { theme: "reliquary", body: "#8a1c30", ink: "#f4f7fb", material: "design", effect: "spark", font: "metal" }),
  set("Rose Window", { theme: "rosewindow", body: "#f0d48a", ink: "#fff1b0", material: "design", effect: "aura", font: "metal" }),
  set("Classic Ruby", { theme: "classic", body: "#9d2136", ink: "#f9e7c1", material: "design", effect: "spark", pips: true }),
  set("Gilded", { theme: "gilded", body: "#e2b34a", ink: "#3a2412", material: "design", effect: "spark", font: "engrave", pips: true }),
  set("Emerald Cut", { theme: "emerald", body: "#12a265", ink: "#f8efb4", material: "design", effect: "aura", font: "metal" }),
  set("Frostcrystal", { theme: "frost", body: "#c5ecff", ink: "#123044", material: "design", effect: "aura" }),
  set("Obsidian Glass", { theme: "obsidian", body: "#12141c", ink: "#dbe7ff", material: "design", effect: "aura", font: "glow" }),
  set("Dragonhide", { theme: "dragonhide", body: "#245b3b", ink: "#f5d99d", material: "design", effect: "embers" }),
  set("Bloodstone", { theme: "bloodstone", body: "#4c1224", ink: "#ffd7a1", material: "design", effect: "spark", font: "metal" }),
  set("Ancient Bone", { theme: "bone", body: "#d8c49c", ink: "#3a281d", material: "design", effect: "wisp", font: "engrave", pips: true }),
  set("Leviathan", { theme: "leviathan", body: "#126d73", ink: "#dcfff5", material: "design", effect: "aura" }),
  set("Magma Vein", { theme: "magma", body: "#541d20", ink: "#ffd26f", material: "design", effect: "embers", font: "glow" }),
  set("Starfall", { theme: "starfall", body: "#101c4c", ink: "#e8f3ff", material: "design", effect: "aura", font: "glow" }),
  set("Arcane Seal", { theme: "arcane", body: "#1a0d36", ink: "#f0d78c", material: "design", effect: "charge", font: "glow" }),
  set("Voidglass", { theme: "void", body: "#0c0714", ink: "#ead9ff", material: "design", effect: "wisp", font: "glow" }),
  set("Champion", { theme: "hero", body: "#e7edf4", ink: "#8a5a18", material: "design", effect: "holy", font: "metal" }),
  set("Behemoth", { theme: "monster", body: "#3a1428", ink: "#ffd0b0", material: "design", effect: "embers" }),
  set("Wizard", { theme: "wizard", body: "#142044", ink: "#d7ecff", material: "design", effect: "charge", font: "glow" }),
  set("Bard", { theme: "bard", body: "#6e243f", ink: "#f0d78c", material: "design", effect: "notes", font: "metal" }),
  set("Necromancer", { theme: "necromancer", body: "#121610", ink: "#b6ff8a", material: "design", effect: "wisp", font: "glow" }),
  set("Goblin Scrap", { theme: "goblin", body: "#6a7340", ink: "#f3e7a2", material: "design", effect: "spark" }),
  set("Wyrmscale", { theme: "wyrm", body: "#1a120c", ink: "#f0c56a", material: "design", effect: "embers", font: "metal" }),
  set("Ghost", { theme: "ghost", body: "#d5fff4", ink: "#f4fffc", material: "design", effect: "wisp", font: "glow" }),
  set("Gravewrought", { theme: "undead", body: "#8a9078", ink: "#2a261c", material: "design", effect: "wisp", font: "engrave" }),
  set("Imperial", { theme: "traveller", body: "#8aa0a8", ink: "#d8fbff", material: "design", effect: "ion", font: "metal" }),
  set("Mythos", { theme: "mythos", body: "#10241c", ink: "#e7ff8a", material: "design", effect: "wisp", font: "glow" }),
  set("Frost Glass", { theme: "classic", body: "#9fd8ff", ink: "#ffffff", material: "glass", effect: "frost" }),
  set("Molten Gold", { theme: "classic", body: "#d9a63a", ink: "#3b1d05", material: "metal", effect: "fire", font: "bold" }),
  set("Arcane Pearl", { theme: "swirl", body: "#4b2a7a", accent: "#4fd6d0", ink: "#f4e9ff", material: "pearl", effect: "arcane", font: "runic" }),
  set("Obsidian", { theme: "classic", body: "#17121c", ink: "#c9a2ff", material: "glass", effect: "shadow" }),
  set("Carrara", { theme: "marble", body: "#ece8e1", accent: "#6d6a73", ink: "#1f2a44", material: "stone", font: "runic" }),
  set("Oak and Iron", { theme: "wood", body: "#8a5a2f", accent: "#3c2412", ink: "#f1dfb8", material: "wood", font: "bold" }),
  set("Rune Steel", { theme: "runes", body: "#5a6470", accent: "#7fe7ff", ink: "#e9f6ff", material: "metal", effect: "glow", font: "runic" }),
  set("Kraken Deep", { theme: "speckle", body: "#0f3b44", accent: "#4fd6d0", ink: "#f2d08d", effect: "sparkles" }),
];

// tray, roll: how big the tray's dice and the dice on the table are (FG's Tray and Roll sizes), 1 = 100%.
// npc, damage: FG's other dice sets, the GM's dice for the creatures they roll
// for, and the dice for damage rolls (anyone's); null is "as my dice".
export type DiceSettings = { show: boolean; sound: boolean; volume: number; tray: number; roll: number; look: DiceLook; npc: DiceLook | null; damage: DiceLook | null };
export type DiceSet = "look" | "npc" | "damage";
type SettingsPatch = Partial<Omit<DiceSettings, "look" | "npc" | "damage">> & { look?: Partial<DiceLook>; npc?: Partial<DiceLook> | null; damage?: Partial<DiceLook> | null };
const { name: _first, ...firstLook } = PRESETS.find((preset) => preset.name === "Classic Ruby") ?? PRESETS[0];
const DEFAULTS: DiceSettings = { show: true, sound: true, volume: 0.7, tray: 1, roll: 1, look: firstLook, npc: null, damage: null };

// A look from another seat (or an older one) with whatever it leaves out filled in.
export function fullLook(look: Partial<DiceLook>): DiceLook {
  return { ...firstLook, theme: "classic", material: "plastic", effect: "none", font: "classic", crit: true, accent: "#d8b46a", pips: false, ...look } as DiceLook;
}


// The dice that can be drawn: d4 to d20, and d100 as two d10s.
export const SHAPED = new Set([4, 6, 8, 10, 12, 20, 100]);

function load(): DiceSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem("kraken-dice") ?? "null");
    if (saved && typeof saved === "object")
      return { ...DEFAULTS, ...saved, look: { ...DEFAULTS.look, ...(saved.look ?? {}) }, npc: saved.npc ? fullLook(saved.npc) : null, damage: saved.damage ? fullLook(saved.damage) : null };
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
    // A set given parts starts from what it was, or from my dice.
    const other = (key: "npc" | "damage") => (patch[key] === undefined ? settings[key] : patch[key] === null ? null : { ...(settings[key] ?? settings.look), ...patch[key] });
    settings = { ...settings, ...patch, look: { ...settings.look, ...(patch.look ?? {}) }, npc: other("npc"), damage: other("damage") };
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
export function throwIntent(): { throw?: DiceThrow; look: DiceLook; looks?: { npc?: DiceLook; damage?: DiceLook } } {
  const now = performance.now();
  const look = settings.look;
  // The other sets go along; the host picks the one the roll is (a creature's, damage).
  const looks = settings.npc || settings.damage ? { looks: { ...(settings.npc ? { npc: settings.npc } : {}), ...(settings.damage ? { damage: settings.damage } : {}) } } : {};
  if (explicitThrow && now - explicitThrow.at < 1500) {
    const value = explicitThrow.value;
    explicitThrow = null;
    return { throw: value, look, ...looks };
  }
  if (lastPress && now - lastPress.at < 2500 && typeof window !== "undefined") {
    const x = clamp(lastPress.x / window.innerWidth, 0.02, 0.98);
    const y = clamp(lastPress.y / window.innerHeight, 0.02, 0.98);
    const dx = 0.5 - x || 0.01;
    const dy = 0.45 - y || 0.01;
    const length = Math.hypot(dx, dy);
    return { throw: { x, y, vx: (dx / length) * 0.75, vy: (dy / length) * 0.75 }, look, ...looks };
  }
  return { look, ...looks };
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
