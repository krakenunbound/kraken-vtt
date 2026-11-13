// Dice packs (Documents/Kraken VTT/Dice on the GM's computer): more dice
// sets for every seat, read from the host when a seat joins. A set may wear
// pictures (the "picture" design): those come from the host too, under this
// seat's own token. electron/dicePacks.cjs reads the packs.

import { fullLook, type DiceLook } from "./diceStore";

export type DicePackSet = { name: string } & DiceLook;
export type DicePack = { id: string; name: string; author: string; description: string; sets: DicePackSet[]; problems?: string[] };

let packs: DicePack[] = [];
let urlOf: (id: string) => string = () => "";
const listeners = new Set<() => void>();
const images = new Map<string, Promise<HTMLImageElement>>();

export const dicePacks = {
  list: () => packs,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  // Where this seat fetches the packs from (the host, with its token).
  connect(base: string, token: string) {
    urlOf = (id) => (token ? `${base}/dice/file?token=${token}&id=${encodeURIComponent(id)}` : "");
    images.clear();
    return fetch(`${base}/dice/packs?token=${token}`)
      .then((response) => (response.ok ? (response.json() as Promise<DicePack[]>) : []))
      .then((list) => {
        // Whole looks, as Kraken's own sets are: what a set leaves out is the default (not the last set's).
        packs = (Array.isArray(list) ? list : []).map((pack) => ({ ...pack, sets: pack.sets.map(({ name, ...look }) => ({ name, ...fullLook(look), pips: Boolean(look.pips) })) }));
        for (const listener of listeners) listener();
        return packs;
      })
      .catch(() => packs);
  },
  // A pack's picture, loaded once.
  image(id: string): Promise<HTMLImageElement> {
    let loading = images.get(id);
    if (!loading) {
      loading = new Promise<HTMLImageElement>((resolve, reject) => {
        const url = urlOf(id);
        if (!url) return reject(new Error("Not at a table."));
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`No picture ${id}.`));
        image.src = url;
      });
      images.set(id, loading);
    }
    return loading;
  },
  // Every picture these looks wear, before they are drawn (the tray's and the sets' pictures).
  async preload(looks: DiceLook[]) {
    const ids = [...new Set(looks.flatMap((look) => (look.theme === "picture" ? [look.texture, look.glowTexture].filter((id): id is string => Boolean(id)) : [])))];
    await Promise.all(ids.map((id) => dicePacks.image(id).catch(() => null)));
  },
};
