import type { MapScene } from "./table/MapView";

export type KrakenCampaign = {
  id: string;
  name: string;
  ruleset: string;
  createdAt: number;
  playedAt: number | null;
  port: number;
  // The GM's name in this campaign, from the last Play ("" before).
  gmName?: string;
};

export type KrakenNetwork = {
  v4: string[];
  v6: string[];
  externalV4: string;
  externalV6: string;
};

export type KrakenHostInfo = {
  port: number;
  hostToken: string;
  addresses: string[];
  v6?: string[];
  externalV4?: string;
  externalV6?: string;
};

export type KrakenAssistantApi = {
  status: () => Promise<{ busy: boolean; model: string; log: never[]; hasKey: boolean; keyFrom: string | null }>;
  ask: (text: string) => Promise<unknown>;
  stop: () => Promise<unknown>;
  reset: () => Promise<unknown>;
  setKey: (key: string) => Promise<{ busy: boolean; model: string; log: never[]; hasKey: boolean; keyFrom: string | null }>;
  onEvent: (handler: (event: never) => void) => () => void;
};
export type KrakenPackRow = {
  id: string;
  name: string;
  title: string;
  category: string;
  ruleset: string;
  fgRuleset: string;
  hasBook: boolean;
  pack: { file: string; current: boolean } | null;
  state: "" | "making" | "waiting" | "failed";
  packOnly?: boolean;
};
export type KrakenPacksView = {
  folder: string;
  books: KrakenPackRow[];
  making: { id: string; done?: number; total?: number; waiting: number } | null;
  made: { id: string; title: string; records: number; pictures: number; bytes: number; at: number }[];
  failed: { id: string; error: string; at: number }[];
};
export type KrakenPacksApi = {
  view: (input?: { ruleset?: string }) => Promise<KrakenPacksView>;
  make: (ids: string[]) => Promise<{ queued: string[]; waiting: number }>;
  openFolder: () => Promise<string>;
  onEvent: (handler: (event: { id: string; ok: boolean }) => void) => () => void;
};
export type KrakenApi = {
  assistant?: KrakenAssistantApi;
  packs?: KrakenPacksApi;
  addresses: () => Promise<string[]>;
  network: () => Promise<KrakenNetwork>;
  campaigns: () => Promise<KrakenCampaign[]>;
  saveCampaign: (input: { name: string; ruleset: string }) => Promise<KrakenCampaign>;
  touchCampaign: (input: { id: string; port: number; gmName?: string }) => Promise<KrakenCampaign | null>;
  setCampaignRuleset: (input: { id: string; ruleset: string }) => Promise<KrakenCampaign>;
  rulesetLogos?: () => Promise<{ folder: string; logos: Record<string, string> }>;
  studioUrl?: () => Promise<{ url: string }>;
  updater?: {
    state: () => Promise<UpdaterState>;
    download: () => Promise<UpdaterState>;
    install: () => Promise<UpdaterState>;
    onEvent: (handler: (state: UpdaterState) => void) => () => void;
  };
  studioSettings?: (input?: { dungeondraftFolders?: string[]; packFolders?: string[] }) => Promise<StudioSettings>;
  studioPickFolder?: (kind: "dd" | "pack") => Promise<string | null>;
  studioOpenImage?: (input: { sceneId: string; name: string; picture: Uint8Array }) => Promise<{ url: string }>;
  onStudioSaved?: (handler: (event: { sceneId: string; picture: boolean }) => void) => () => void;
  copy: (text: string) => Promise<boolean | void>;
  startHost: (options: { port: number; password: string; lan: boolean; cloud: boolean; campaignId?: string }) => Promise<KrakenHostInfo>;
  stopHost: () => Promise<void>;
  setSceneImage: (bytes: ArrayBuffer, mime: string) => Promise<void>;
  setTokenArt: (list: { id: string; bytes: ArrayBuffer; mime: string }[]) => Promise<void>;
  campaignView: (id: string) => Promise<{ view: KrakenView | null; hasBundle: boolean }>;
  campaignBundle: (id: string) => Promise<Uint8Array | null>;
  saveBundle: (id: string, bytes: Uint8Array) => Promise<void>;
  saveView: (id: string, view: KrakenView | null) => Promise<void>;
  pickDecal: (kind?: "decal" | "wallpaper" | "gmicon" | "tile" | "tower") => Promise<KrakenDecal | null>;
  addDecal: (name: string, bytes: Uint8Array, kind?: "decal" | "wallpaper" | "gmicon" | "tile" | "tower") => Promise<KrakenDecal>;
  openDecalFolder: (kind?: "decal" | "wallpaper" | "gmicon" | "tile" | "tower") => Promise<string>;
  openKrakenFolder?: (kind?: "" | "dice" | "towers" | "gmicons" | "decals" | "wallpapers" | "packs") => Promise<string>;
  pickSounds: (kind: string, group: string) => Promise<KrakenSound[]>;
  addSound: (kind: string, group: string, name: string, bytes: Uint8Array) => Promise<KrakenSound>;
  openSoundFolder: () => Promise<string>;
  onAgentCommand: (handler: (command: KrakenAgentCommand) => Promise<unknown>) => () => void;
};

// Map Studio's asset pack folders, and whether each is there.
export type StudioSettings = { dungeondraftFolders: string[]; packFolders: string[]; found: Record<string, boolean> };

// Kraken's updater: looked for once at launch; off from the source; what it found.
export type UpdaterState = { status: "idle" | "off" | "checking" | "current" | "available" | "downloading" | "ready" | "installing" | "error"; current: string; version?: string; notes?: string; percent?: number; error?: string | null; reason?: string };

export type KrakenAgentCommand =
  | { kind: "host"; campaignId: string; port: number; password: string }
  | { kind: "leave" }
  | { kind: "open-adventure"; name: string; bytes: Uint8Array }
  | { kind: "scenes"; adventure?: string; scene?: string }
  | { kind: "deck-plan"; ship: { id: string; name: string; data: Record<string, unknown> } }
  | { kind: "windows"; action: "list" | "open" | "close" | "popout" | "dock"; window?: string; record?: string }
  | { kind: "sidebar"; action: "list" | "state" | "fold" | "press"; state?: number; group?: string; folded?: boolean; entry?: string }
  | { kind: "dice-settings"; patch: DiceSettingsPatch }
  | { kind: "quickslots"; action: "press"; index: number }
  | { kind: "tower"; action: "view" | "lock" | "unlock" | "place" | "on" | "off"; x?: number; y?: number }
  | { kind: "image"; action: "open" | "make" | "play" | "test" | "preview" | "close" | "studio"; book?: string; name?: string; file?: string; on?: boolean };

export type DiceSettingsPatch = { show?: boolean; sound?: boolean; volume?: number; preset?: string; body?: string; accent?: string; ink?: string; design?: string; material?: string; font?: string; effect?: string; crit?: boolean; pips?: boolean; set?: "mine" | "npc" | "damage"; same?: boolean; color?: string; turnSound?: boolean; turnBanner?: boolean; character?: string; resolve?: boolean; base?: Partial<import("./dice/diceStore").DiceLook> | null };

export type KrakenSound = { id: string; kind: string; group: string; name: string };

export type KrakenDecal = { id: string; name: string; group: string; ruleset?: string };

// The campaign's table map (its adventure and scene), and whether the GM closed its window.
export type KrakenView = { adventure: string; sceneId: string; closed?: boolean };

export type KrakenHandle = {
  publish: (scene: MapScene) => Promise<void>;
  sendChat: (text: string) => void;
  moveToken: (id: string, x: number, y: number, snap?: boolean) => void;
  placeToken: (recordId: string | null, x?: number, y?: number, name?: string) => void;
  setDoor: (id: string, state?: number) => void;
  roll: (formula: string, label?: string) => void;
  op: (message: never) => Promise<string>;
  snapshot: () => {
    role: "dm" | "player" | null;
    selfId: string | null;
    players: { id: string; name: string; role: "dm" | "player" }[];
    map: import("./session/useSession").TableMap;
    chat: { id: string; from: string; text: string; at: number }[];
    sceneName: string | null;
    records: { id: string; type: string; name: string; owner: string; visibility: string; data: unknown }[];
  };
};

declare global {
  interface Window {
    kraken?: KrakenApi;
    __kraken?: KrakenHandle;
  }
}

export {};
