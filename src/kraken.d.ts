import type { MapScene } from "./table/MapView";

export type KrakenCampaign = {
  id: string;
  name: string;
  ruleset: string;
  createdAt: number;
  playedAt: number | null;
  port: number;
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

export type KrakenApi = {
  addresses: () => Promise<string[]>;
  network: () => Promise<KrakenNetwork>;
  campaigns: () => Promise<KrakenCampaign[]>;
  saveCampaign: (input: { name: string; ruleset: string }) => Promise<KrakenCampaign>;
  touchCampaign: (input: { id: string; port: number }) => Promise<KrakenCampaign | null>;
  copy: (text: string) => Promise<void>;
  startHost: (options: { port: number; password: string; lan: boolean; cloud: boolean; campaignId?: string }) => Promise<KrakenHostInfo>;
  stopHost: () => Promise<void>;
  setSceneImage: (bytes: ArrayBuffer, mime: string) => Promise<void>;
  setTokenArt: (list: { id: string; bytes: ArrayBuffer; mime: string }[]) => Promise<void>;
  campaignView: (id: string) => Promise<{ view: KrakenView | null; hasBundle: boolean }>;
  campaignBundle: (id: string) => Promise<Uint8Array | null>;
  saveBundle: (id: string, bytes: Uint8Array) => Promise<void>;
  saveView: (id: string, view: KrakenView | null) => Promise<void>;
  pickDecal: (kind?: "decal" | "wallpaper") => Promise<KrakenDecal | null>;
  addDecal: (name: string, bytes: Uint8Array, kind?: "decal" | "wallpaper") => Promise<KrakenDecal>;
  openDecalFolder: (kind?: "decal" | "wallpaper") => Promise<string>;
  onAgentCommand: (handler: (command: KrakenAgentCommand) => Promise<unknown>) => () => void;
};

export type KrakenAgentCommand =
  | { kind: "host"; campaignId: string; port: number; password: string }
  | { kind: "leave" }
  | { kind: "open-adventure"; name: string; bytes: Uint8Array }
  | { kind: "scenes"; adventure?: string; scene?: string }
  | { kind: "windows"; action: "list" | "open" | "close" | "popout" | "dock"; window?: string; record?: string }
  | { kind: "dice-settings"; patch: DiceSettingsPatch };

export type DiceSettingsPatch = { show?: boolean; sound?: boolean; volume?: number; preset?: string; body?: string; accent?: string; ink?: string; design?: string; material?: string; font?: string; effect?: string; crit?: boolean };

export type KrakenDecal = { id: string; name: string; group: string; ruleset?: string };

export type KrakenView = { adventure: string; sceneId: string };

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
