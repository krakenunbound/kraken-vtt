import { useSyncExternalStore } from "react";

// A picture being tried in a picker (the background decal, the desktop
// wallpaper, the GM icon, the dice tower): shown at once on this screen
// alone, as the GM clicks through them; OK makes it the table's (every
// screen), Cancel or closing the picker puts back what was there.
export type PreviewKey = "decal" | "wallpaper" | "wallpaperFit" | "gmIcon" | "towerStyle";
let preview: Partial<Record<PreviewKey, string>> = {};
const listeners = new Set<() => void>();

export const pickerPreview = {
  set(key: PreviewKey, value: string) {
    preview = { ...preview, [key]: value };
    listeners.forEach((listener) => listener());
  },
  clear(key: PreviewKey) {
    if (!(key in preview)) return;
    const { [key]: _gone, ...rest } = preview;
    preview = rest;
    listeners.forEach((listener) => listener());
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// What this screen shows for a setting: the one being tried, else the table's.
export function usePreviewed<T extends string | undefined>(key: PreviewKey, tableValue: T): string | T {
  const tried = useSyncExternalStore(subscribe, () => preview[key]);
  return tried ?? tableValue;
}
