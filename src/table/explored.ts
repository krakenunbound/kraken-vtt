import { useSyncExternalStore } from "react";

// What this seat has explored of the scene (fog of war), as the host keeps it
// (mapState.cjs explore): a player's own, or every player's in the GM's vision
// preview. Sent apart from the map, only when it changes.
let explored: { sceneId: string | null; polygons: number[][] } = { sceneId: null, polygons: [] };
const listeners = new Set<() => void>();
export const exploredStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => explored,
  put(message: { sceneId?: unknown; polygons?: unknown }) {
    explored = { sceneId: typeof message.sceneId === "string" ? message.sceneId : null, polygons: Array.isArray(message.polygons) ? (message.polygons as unknown[]).filter((item): item is number[] => Array.isArray(item)) : [] };
    for (const listener of listeners) listener();
  },
};
const NONE: number[][] = [];
export function useExplored(sceneId: string): number[][] {
  const now = useSyncExternalStore(exploredStore.subscribe, exploredStore.get);
  return now.sceneId === sceneId ? now.polygons : NONE;
}
