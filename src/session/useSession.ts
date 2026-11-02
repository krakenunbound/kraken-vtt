import { useCallback, useEffect, useRef, useState } from "react";
import type { MapScene } from "../table/MapView";

export type Seat = { id: string; name: string; role: "dm" | "player" };
export type Pawn = { id: string; name: string; color: string; x: number; y: number };
export type RollTerm =
  | { kind: "number"; sign: number; value: number }
  | { kind: "dice"; sign: number; count: number; sides: number; rolls: number[]; kept: boolean[]; sum: number };
export type RollResult = { formula: string; label: string; total: number; terms: RollTerm[]; tag?: string };
export type ChatLine = { id: string; from: string; text: string; at: number; roll?: RollResult };
export type TableRecord = {
  id: string;
  type: string;
  name: string;
  owner: string;
  visibility: "gm" | "owner" | "all";
  data: Record<string, unknown>;
  updatedAt: number;
};
export type RecordInput = { type: string; name?: string; owner?: string; visibility?: TableRecord["visibility"]; data?: unknown; id?: string };
export type RecordPatch = { name?: string; owner?: string; visibility?: TableRecord["visibility"]; data?: unknown };
export type HostInfo = {
  port: number;
  addresses: string[];
  v6: string[];
  externalV4: string;
  externalV6: string;
  password: string;
  publicGame: boolean;
  lan: boolean;
  cloud: boolean;
  campaignId: string;
};

type NetScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  padding: number;
  backgroundColor: string;
  grid: MapScene["grid"];
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  anchorX?: number;
  anchorY?: number;
  fit?: MapScene["fit"];
  lights: MapScene["lights"];
  tokens: {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    disposition: number;
    hidden: boolean;
  }[];
  image: string | null;
};

type JoinMessage = { name: string; password: string; hostToken?: string };

function endpoint(address: string, port: number, scheme: "ws" | "http"): string {
  const host = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
  return `${scheme}://${host}:${port}`;
}

export function cleanAddress(value: string): string {
  return value
    .trim()
    .replace(/^wss?:\/\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function toPlayerScene(payload: NetScene, origin: string): MapScene {
  return {
    id: payload.id,
    name: payload.name,
    width: payload.width,
    height: payload.height,
    padding: payload.padding,
    backgroundColor: payload.backgroundColor,
    grid: payload.grid,
    imageUrl: payload.image ? `${origin}${payload.image}` : null,
    offsetX: payload.offsetX,
    offsetY: payload.offsetY,
    scaleX: payload.scaleX,
    scaleY: payload.scaleY,
    anchorX: payload.anchorX ?? 0,
    anchorY: payload.anchorY ?? 0,
    fit: payload.fit ?? "fill",
    walls: [],
    lights: payload.lights ?? [],
    markers: [],
    regions: [],
    tokens: (payload.tokens ?? []).map((token) => ({ ...token, image: null, imageName: null, imageUrl: null })),
  };
}

function checkPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be from 1 to 65535.");
}

function plainError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : fallback;
  const cut = message.split(": Error: ").pop()?.trim();
  return cut || fallback;
}

export function useSession() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [role, setRole] = useState<"dm" | "player" | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [remoteLabel, setRemoteLabel] = useState("");
  const [players, setPlayers] = useState<Seat[]>([]);
  const [pawns, setPawns] = useState<Pawn[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playerScene, setPlayerScene] = useState<MapScene | null>(null);
  const [records, setRecords] = useState<Record<string, TableRecord>>({});
  const opWaits = useRef(new Map<number, { resolve: (id: string) => void; reject: (error: Error) => void }>());
  const opCounter = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const generation = useRef(0);
  const roleRef = useRef(role);
  const playersRef = useRef(players);
  const dragRef = useRef<string | null>(null);
  const seqs = useRef<Record<string, number>>({});
  const originRef = useRef("");
  const intentional = useRef(false);
  const stateRef = useRef({ role, selfId, players, pawns, chat, playerScene, records });
  roleRef.current = role;
  playersRef.current = players;
  stateRef.current = { role, selfId, players, pawns, chat, playerScene, records };

  const applyPawns = useCallback((list: Pawn[]) => {
    setPawns((current) =>
      list.map((pawn) => {
        if (pawn.id !== dragRef.current) return pawn;
        const local = current.find((item) => item.id === pawn.id);
        return local ? { ...pawn, x: local.x, y: local.y } : pawn;
      }),
    );
  }, []);

  const reset = useCallback(() => {
    setConnected(false);
    setConnecting(false);
    setRole(null);
    setSelfId(null);
    setPlayers([]);
    setPawns([]);
    setChat([]);
    setPlayerScene(null);
    setRecords({});
    for (const wait of opWaits.current.values()) wait.reject(new Error("The table closed."));
    opWaits.current.clear();
    setHostInfo(null);
    setRemoteLabel("");
    roleRef.current = null;
    dragRef.current = null;
  }, []);

  const connect = useCallback(
    (url: string, join: JoinMessage, label: string, origin: string) => {
      intentional.current = false;
      const gen = ++generation.current;
      originRef.current = origin;
      return new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        socketRef.current = socket;
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.close();
          reject(new Error("Could not reach that table."));
        }, 8000);

        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          intentional.current = true;
          window.clearTimeout(timer);
          socket.close();
          reject(new Error(message));
        };

        socket.onmessage = (event) => {
          if (generation.current !== gen) return;
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (msg.type === "no") {
            fail(typeof msg.reason === "string" ? msg.reason : "Wrong password.");
            return;
          }
          if (msg.type === "ok" && !settled) {
            settled = true;
            window.clearTimeout(timer);
            const you = msg.you as Seat;
            roleRef.current = you.role;
            setRole(you.role);
            setSelfId(you.id);
            setPlayers((msg.players as Seat[]) ?? []);
            applyPawns((msg.pawns as Pawn[]) ?? []);
            setChat((msg.chat as ChatLine[]) ?? []);
            setRecords(Object.fromEntries(((msg.records as TableRecord[]) ?? []).map((record) => [record.id, record])));
            setRemoteLabel(label);
            setPlayerScene(you.role === "player" && msg.scene ? toPlayerScene(msg.scene as NetScene, origin) : null);
            setConnected(true);
            setError(null);
            resolve();
            return;
          }
          if (msg.type === "players") setPlayers((msg.players as Seat[]) ?? []);
          if (msg.type === "pawns") applyPawns((msg.pawns as Pawn[]) ?? []);
          if (msg.type === "chat") {
            const line = msg as unknown as ChatLine;
            setChat((current) => [...current, line].slice(-100));
          }
          if (msg.type === "record" && msg.record) {
            const record = msg.record as TableRecord;
            setRecords((current) => ({ ...current, [record.id]: record }));
          }
          if (msg.type === "record-gone" && typeof msg.id === "string") {
            const gone = msg.id;
            setRecords((current) => {
              const next = { ...current };
              delete next[gone];
              return next;
            });
          }
          if (msg.type === "op-result" && typeof msg.req === "number") {
            const wait = opWaits.current.get(msg.req);
            opWaits.current.delete(msg.req);
            if (wait && msg.ok) wait.resolve(String(msg.id ?? ""));
            else if (wait) wait.reject(new Error(typeof msg.error === "string" ? msg.error : "Not allowed."));
          }
          if (msg.type === "error" && typeof msg.reason === "string") setError(msg.reason);
          if (msg.type === "scene" && roleRef.current === "player" && msg.scene) {
            setPlayerScene(toPlayerScene(msg.scene as NetScene, originRef.current));
          }
        };

        socket.onclose = () => {
          if (!settled) {
            fail("Could not join. Check the address, port, and password.");
            return;
          }
          if (generation.current !== gen || intentional.current) return;
          setError("The table closed.");
          reset();
        };

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: "join", name: join.name, password: join.password, hostToken: join.hostToken }));
        };
      });
    },
    [applyPawns, reset],
  );

  const leave = useCallback((force = false) => {
    if (!force && roleRef.current === "dm" && playersRef.current.some((seat) => seat.role === "player")) {
      const confirmed = window.confirm("Close the table? Players will be disconnected.");
      if (!confirmed) return;
    }
    intentional.current = true;
    generation.current += 1;
    const wasDm = roleRef.current === "dm";
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    setError(null);
    reset();
    if (wasDm) void window.kraken?.stopHost();
  }, [reset]);

  const host = useCallback(
    async (input: { name: string; port: number; password: string; lan: boolean; cloud: boolean; campaignId: string }) => {
      setConnecting(true);
      setError(null);
      let started = false;
      try {
        if (!window.kraken) throw new Error("Hosting runs in the Kraken VTT app.");
        checkPort(input.port);
        if (!input.lan && !input.cloud) throw new Error("Turn on LAN or Cloud.");
        const password = input.password.trim();
        const info = await window.kraken.startHost({
          port: input.port,
          password,
          lan: input.lan,
          cloud: input.cloud,
          campaignId: input.campaignId,
        });
        started = true;
        setHostInfo({
          port: info.port,
          addresses: info.addresses,
          v6: info.v6 ?? [],
          externalV4: info.externalV4 ?? "",
          externalV6: info.externalV6 ?? "",
          password,
          publicGame: password.length === 0,
          lan: input.lan,
          cloud: input.cloud,
          campaignId: input.campaignId,
        });
        await connect(
          endpoint("127.0.0.1", info.port, "ws"),
          { name: input.name, password, hostToken: info.hostToken },
          `127.0.0.1:${info.port}`,
          endpoint("127.0.0.1", info.port, "http"),
        );
        return null;
      } catch (caught) {
        if (started) await window.kraken?.stopHost().catch(() => undefined);
        setHostInfo(null);
        const message = plainError(caught, "Could not host.");
        setError(message);
        return message;
      } finally {
        setConnecting(false);
      }
    },
    [connect],
  );

  const join = useCallback(
    async (input: { name: string; address: string; port: number; password: string }) => {
      setConnecting(true);
      setError(null);
      try {
        const address = cleanAddress(input.address);
        checkPort(input.port);
        if (!address) throw new Error("Enter the DM's address.");
        await connect(
          endpoint(address, input.port, "ws"),
          { name: input.name, password: input.password },
          `${address}:${input.port}`,
          endpoint(address, input.port, "http"),
        );
      } catch (caught) {
        setError(plainError(caught, "Could not join."));
      } finally {
        setConnecting(false);
      }
    },
    [connect],
  );

  const publish = useCallback(async (scene: MapScene) => {
    const socket = socketRef.current;
    if (!window.kraken || roleRef.current !== "dm" || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("The table is not hosting.");
    }
    try {
      if (scene.imageUrl) {
        const response = await fetch(scene.imageUrl);
        if (!response.ok) throw new Error("Could not read the map image.");
        const bytes = await response.arrayBuffer();
        const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        await window.kraken.setSceneImage(bytes, mime);
      } else {
        await window.kraken.setSceneImage(new ArrayBuffer(0), "");
      }
    } catch (caught) {
      throw new Error(plainError(caught, "Could not share the map image."));
    }
    const tokens = scene.tokens
      .filter((token) => !token.hidden && token.disposition !== -2)
      .map((token) => ({
        id: token.id,
        name: token.name,
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        disposition: token.disposition,
        hidden: false,
      }));
    socket.send(
      JSON.stringify({
        type: "scene",
        scene: {
          id: scene.id,
          name: scene.name,
          width: scene.width,
          height: scene.height,
          padding: scene.padding,
          backgroundColor: scene.backgroundColor,
          grid: scene.grid,
          offsetX: scene.offsetX,
          offsetY: scene.offsetY,
          scaleX: scene.scaleX,
          scaleY: scene.scaleY,
          anchorX: scene.anchorX,
          anchorY: scene.anchorY,
          fit: scene.fit,
          lights: scene.lights,
          tokens,
        },
      }),
    );
  }, []);

  // tag comes back on the roll in chat, so a caller can wait for its own roll.
  const roll = useCallback((formula: string, label = "", tag = "") => {
    const socket = socketRef.current;
    if (!formula.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "roll", formula: formula.trim().slice(0, 200), label: label.slice(0, 120), ...(tag ? { tag } : {}) }));
  }, []);

  // The creation wizard's character: the host builds it and answers with its id.
  const buildCharacter = useCallback((spec: unknown, owner = "") => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    const req = ++opCounter.current;
    return new Promise<string>((resolve, reject) => {
      opWaits.current.set(req, { resolve, reject });
      socket.send(JSON.stringify({ type: "build-character", req, spec, owner }));
    });
  }, []);

  // Record changes go to the host, which answers with the record's id or why not.
  const op = useCallback(
    (message: { op: "create"; input: RecordInput } | { op: "update"; id: string; patch: RecordPatch; replace?: boolean } | { op: "delete"; id: string }) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
      const req = ++opCounter.current;
      return new Promise<string>((resolve, reject) => {
        opWaits.current.set(req, { resolve, reject });
        socket.send(JSON.stringify({ type: "op", req, ...message }));
      });
    },
    [],
  );

  // A SIEGE check for a character; the host rolls it and posts the result.
  const siegeCheck = useCallback((id: string, attribute: string, cl = 0) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "siege-check", id, attribute, cl }));
  }, []);

  const sendChat = useCallback((text: string) => {
    const socket = socketRef.current;
    const line = text.trim();
    if (!line || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "chat", text: line.slice(0, 500) }));
  }, []);

  const movePawn = useCallback((id: string, x: number, y: number, done: boolean) => {
    if (roleRef.current !== "dm" && id !== stateRef.current.selfId) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    dragRef.current = done ? null : id;
    setPawns((current) => current.map((pawn) => (pawn.id === id ? { ...pawn, x, y } : pawn)));
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const seq = (seqs.current[id] ?? 0) + 1;
    seqs.current[id] = seq;
    const now = Date.now();
    const last = seqs.current[`${id}:t`] ?? 0;
    if (!done && now - last < 70) return;
    seqs.current[`${id}:t`] = now;
    socket.send(JSON.stringify({ type: "pawn", id, x, y, seq, done }));
  }, []);

  useEffect(() => {
    window.__kraken = {
      publish,
      sendChat,
      movePawn,
      roll,
      op,
      snapshot: () => ({
        role: stateRef.current.role,
        selfId: stateRef.current.selfId,
        players: stateRef.current.players,
        pawns: stateRef.current.pawns,
        chat: stateRef.current.chat,
        sceneName: stateRef.current.playerScene?.name ?? null,
        records: Object.values(stateRef.current.records),
      }),
    };
    return () => {
      delete window.__kraken;
    };
  }, [publish, sendChat, movePawn, roll, op]);

  return {
    connected,
    connecting,
    canHost: typeof window !== "undefined" && Boolean(window.kraken),
    role,
    selfId,
    hostInfo,
    remoteLabel,
    players,
    pawns,
    chat,
    records,
    error,
    playerScene,
    host,
    join,
    leave,
    publish,
    sendChat,
    movePawn,
    roll,
    op,
    siegeCheck,
    buildCharacter,
  };
}

export type Session = ReturnType<typeof useSession>;
