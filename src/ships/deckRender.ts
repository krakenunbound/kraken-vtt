import { zipSync, strToU8 } from "fflate";
import { layout } from "../../shared/starships/deckplan.mjs";

// A ship's deck plans drawn as maps (shared/starships/deckplan.mjs lays them
// out): each deck a picture (100 px a square, a square of space round the
// hull) with its walls and doors, all decks in one map bundle that the GM's
// Kraken opens like any other (the same scenes every time for the same ship,
// so tokens placed on them stay). Kraken's own drawing: floors by room, the
// furniture, the room names.

type Room = { id: number; kind: string; name: string; x: number; y: number; w: number; h: number; door: { x: number; y: number; side: string } | null; outer?: { x: number; y: number; side: string }; weapon?: string; open?: boolean };
type Wall = { x1: number; y1: number; x2: number; y2: number; door: boolean };
type Deck = { name: string; index: number; cols: number; rows: number; cells: number[][]; rooms: Room[]; walls: Wall[] };
type Ship = { id: string; name: string; data: Record<string, unknown> };

const SQUARE = 100;
const MARGIN = 1;
const FLOORS: Record<string, [string, string]> = {
  bridge: ["#1d2f45", "#27415f"],
  engineering: ["#2d2a26", "#3a352e"],
  stateroom: ["#3b2f2a", "#47382f"],
  common: ["#3c3a33", "#4a473e"],
  medbay: ["#c9d2d6", "#dfe6ea"],
  armoury: ["#2a2e33", "#353a40"],
  brig: ["#2c2c2c", "#383838"],
  workshop: ["#34312a", "#403c33"],
  airlock: ["#2a2d31", "#33373c"],
  cargo: ["#3a3a35", "#44443e"],
  fuel: ["#163447", "#1d4560"],
  boat: ["#2b3036", "#343a41"],
  vehicle: ["#2b3036", "#343a41"],
  turret: ["#2e3238", "#3a3f46"],
  store: ["#33342f", "#3d3e38"],
  lift: ["#30363d", "#3a414a"],
};

// A seeded random, so a ship's plan is drawn the same every time.
function seeded(text: string) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909) >>> 0;
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}

function drawDeck(ctx: CanvasRenderingContext2D, deck: Deck, ship: Ship) {
  const random = seeded(`${ship.id}:${deck.index}`);
  const width = (deck.cols + MARGIN * 2) * SQUARE;
  const height = (deck.rows + MARGIN * 2) * SQUARE;
  const at = (col: number) => (col + MARGIN) * SQUARE;
  // Space, with stars.
  ctx.fillStyle = "#04060b";
  ctx.fillRect(0, 0, width, height);
  for (let n = 0; n < (width * height) / 9000; n++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + random() * 0.6})`;
    ctx.fillRect(random() * width, random() * height, random() < 0.9 ? 1.5 : 3, random() < 0.9 ? 1.5 : 3);
  }
  // The hull's skin under the decks: a dark plate a little wider than the rooms.
  ctx.fillStyle = "#1a1d22";
  for (let row = 0; row < deck.rows; row++)
    for (let col = 0; col < deck.cols; col++) if (deck.cells[row][col] >= 0) ctx.fillRect(at(col) - 12, at(row) - 12, SQUARE + 24, SQUARE + 24);
  // Floors: each square by its room, in plates.
  const roomOf = new Map(deck.rooms.map((item) => [item.id, item]));
  for (let row = 0; row < deck.rows; row++) {
    for (let col = 0; col < deck.cols; col++) {
      const zone = deck.cells[row][col];
      if (zone < 0) continue;
      const kind = zone === 0 ? "corridor" : roomOf.get(zone)?.kind ?? "store";
      const [base, light] = kind === "corridor" ? ["#3b4048", "#4a5059"] : FLOORS[kind] ?? FLOORS.store;
      const x = at(col);
      const y = at(row);
      ctx.fillStyle = base;
      ctx.fillRect(x, y, SQUARE, SQUARE);
      ctx.fillStyle = light;
      if (kind === "corridor") {
        // Deck grating.
        for (let line = 8; line < SQUARE; line += 12) ctx.fillRect(x + 4, y + line, SQUARE - 8, 4);
      } else {
        ctx.fillRect(x + 3, y + 3, SQUARE / 2 - 5, SQUARE / 2 - 5);
        ctx.fillRect(x + SQUARE / 2 + 2, y + SQUARE / 2 + 2, SQUARE / 2 - 5, SQUARE / 2 - 5);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, SQUARE - 2, SQUARE - 2);
    }
  }
  // Furniture.
  for (const item of deck.rooms) furnish(ctx, item, at, random);
  // Walls and doors.
  ctx.lineCap = "square";
  for (const wall of deck.walls) {
    const [x1, y1, x2, y2] = [at(wall.x1), at(wall.y1), at(wall.x2), at(wall.y2)];
    if (wall.door) {
      const horizontal = y1 === y2;
      ctx.fillStyle = "#c79a3b";
      ctx.strokeStyle = "#2a1f0a";
      ctx.lineWidth = 3;
      if (horizontal) {
        ctx.fillRect(x1 + 14, y1 - 7, x2 - x1 - 28, 14);
        ctx.strokeRect(x1 + 14, y1 - 7, x2 - x1 - 28, 14);
      } else {
        ctx.fillRect(x1 - 7, y1 + 14, 14, y2 - y1 - 28);
        ctx.strokeRect(x1 - 7, y1 + 14, 14, y2 - y1 - 28);
      }
      continue;
    }
    ctx.strokeStyle = "#0b0d10";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = "#7d8792";
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  // The rooms' names.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const item of deck.rooms) {
    if (item.kind === "lift" || item.w * item.h < 2) continue;
    const size = Math.min(26, Math.max(15, item.w * 7));
    ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
    const cx = at(item.x) + (item.w * SQUARE) / 2;
    const cy = at(item.y) + (item.h * SQUARE) / 2;
    const text = item.kind === "turret" ? "Turret" : item.name.toUpperCase();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.fillStyle = item.kind === "medbay" ? "#0f2b3a" : "#e6edf3";
    if (item.kind === "turret") {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    } else {
      if (item.kind !== "medbay") ctx.strokeText(text, cx, cy);
      ctx.fillText(text, cx, cy);
    }
  }
  // The deck's title.
  ctx.textAlign = "left";
  ctx.font = `700 34px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(230,237,243,0.85)";
  ctx.fillText(`${ship.name} · ${deck.name}`, 24, 34);
}

function furnish(ctx: CanvasRenderingContext2D, item: Room, at: (n: number) => number, random: () => number) {
  const x = at(item.x);
  const y = at(item.y);
  const w = item.w * SQUARE;
  const h = item.h * SQUARE;
  const box = (bx: number, by: number, bw: number, bh: number, fill: string, stroke = "rgba(0,0,0,0.6)") => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
  };
  const circle = (cx: number, cy: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  switch (item.kind) {
    case "bridge": {
      // Consoles round the nose, seats behind them.
      const seats = Math.max(2, Math.min(5, item.h - 2));
      for (let n = 0; n < seats; n++) {
        const cy = y + ((n + 1) * h) / (seats + 1);
        box(x + 20, cy - 26, 46, 52, "#0f4f7a");
        ctx.fillStyle = "rgba(120,220,255,0.75)";
        ctx.fillRect(x + 26, cy - 18, 34, 36);
        circle(x + 95, cy, 20, "#55606b");
      }
      break;
    }
    case "engineering": {
      // The power plant's core and the drive blocks.
      const cx = x + w / 2;
      const cy = y + h / 2;
      const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(w, h) / 2.2);
      glow.addColorStop(0, "rgba(255,190,90,0.9)");
      glow.addColorStop(1, "rgba(255,120,30,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, w, h);
      circle(cx, cy, Math.min(w, h) / 5, "#6b4a2a");
      circle(cx, cy, Math.min(w, h) / 9, "#ffcf7a");
      box(x + 20, y + 20, w - 40, 50, "#4b4f55");
      box(x + 20, y + h - 70, w - 40, 50, "#4b4f55");
      break;
    }
    case "stateroom": {
      box(x + 10, y + 12, w - 20, 70, "#6d5a8a");
      box(x + 18, y + 20, 40, 26, "#e9e2f2");
      box(x + w - 40, y + h - 60, 28, 48, "#5a4a3f");
      break;
    }
    case "common": {
      box(x + w / 2 - 70, y + h / 2 - 45, 140, 90, "#7a5c3c");
      for (const [dx, dy] of [[-90, 0], [90, 0], [0, -70], [0, 70]]) circle(x + w / 2 + dx, y + h / 2 + dy, 16, "#55606b");
      box(x + 10, y + 10, w - 20, 34, "#5f6670");
      break;
    }
    case "medbay": {
      box(x + 15, y + 15, 70, 120, "#ffffff", "#7b8c96");
      box(x + w - 85, y + 15, 70, 120, "#ffffff", "#7b8c96");
      box(x + 15, y + h - 50, w - 30, 36, "#9db7c4", "#5f7d8c");
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(x + w / 2 - 6, y + h / 2 - 22, 12, 44);
      ctx.fillRect(x + w / 2 - 22, y + h / 2 - 6, 44, 12);
      break;
    }
    case "cargo": {
      // Crates, and the hazard-striped loading lane.
      for (let row = 0; row < item.h; row++)
        for (let col = 0; col < item.w; col++) {
          if (random() < 0.45) continue;
          const tint = ["#7a6b3a", "#5f6b3a", "#6b4e3a", "#55606b"][Math.floor(random() * 4)];
          box(x + col * SQUARE + 10, y + row * SQUARE + 10, SQUARE - 20, SQUARE - 20, tint);
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          ctx.moveTo(x + col * SQUARE + 10, y + row * SQUARE + 10);
          ctx.lineTo(x + col * SQUARE + SQUARE - 10, y + row * SQUARE + SQUARE - 10);
          ctx.stroke();
        }
      break;
    }
    case "fuel": {
      for (let col = 0; col < item.w; col++) box(x + col * SQUARE + 12, y + 12, SQUARE - 24, h - 24, "#2a6f96");
      break;
    }
    case "airlock": {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      for (let n = -h; n < w + h; n += 40) {
        ctx.fillStyle = "#d4a017";
        ctx.beginPath();
        ctx.moveTo(x + n, y);
        ctx.lineTo(x + n + 20, y);
        ctx.lineTo(x + n + 20 - h, y + h);
        ctx.lineTo(x + n - h, y + h);
        ctx.fill();
      }
      ctx.restore();
      box(x + 20, y + 20, w - 40, h - 40, "#2a2d31");
      break;
    }
    case "turret": {
      circle(x + w / 2, y + h / 2, 34, "#3d4550");
      circle(x + w / 2, y + h / 2, 16, "#8a96a3");
      break;
    }
    case "armoury": {
      for (let n = 0; n < item.h; n++) box(x + 10, y + n * SQUARE + 20, w - 20, 24, "#4a5058");
      break;
    }
    case "brig": {
      ctx.strokeStyle = "#9aa3ad";
      ctx.lineWidth = 4;
      for (let n = x + 20; n < x + w - 10; n += 22) {
        ctx.beginPath();
        ctx.moveTo(n, y + h / 2 - 30);
        ctx.lineTo(n, y + h - 20);
        ctx.stroke();
      }
      break;
    }
    case "workshop": {
      box(x + 15, y + 15, w - 30, 60, "#59606a");
      circle(x + w / 2, y + h - 60, 26, "#6b5a3a");
      break;
    }
    case "boat":
    case "vehicle": {
      // The craft in its bay.
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.fillStyle = "#8b97a3";
      ctx.strokeStyle = "#20262c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.38, cy);
      ctx.lineTo(cx - w * 0.1, cy - h * 0.28);
      ctx.lineTo(cx + w * 0.36, cy - h * 0.2);
      ctx.lineTo(cx + w * 0.36, cy + h * 0.2);
      ctx.lineTo(cx - w * 0.1, cy + h * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "lift": {
      circle(x + SQUARE / 2, y + SQUARE / 2, 34, "#2e3a46");
      ctx.fillStyle = "#e6edf3";
      ctx.font = `700 26px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⇅", x + SQUARE / 2, y + SQUARE / 2);
      break;
    }
    default:
      break;
  }
}

// The bundle: one scene a deck, walls (Foundry's: c, door), 1.5 m squares.
export async function makeDeckBundle(ship: Ship): Promise<{ bytes: Uint8Array; name: string }> {
  const plan = layout(ship) as { decks: Deck[] };
  const files: Record<string, Uint8Array> = {};
  const scenes = [];
  for (const deck of plan.decks) {
    const canvas = document.createElement("canvas");
    canvas.width = (deck.cols + MARGIN * 2) * SQUARE;
    canvas.height = (deck.rows + MARGIN * 2) * SQUARE;
    drawDeck(canvas.getContext("2d")!, deck, ship);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((made) => (made ? resolve(made) : reject(new Error("Could not draw the deck."))), "image/webp", 0.9));
    const file = `deck-${deck.index + 1}.webp`;
    files[file] = new Uint8Array(await blob.arrayBuffer());
    const px = (n: number) => (n + MARGIN) * SQUARE;
    scenes.push({
      _id: `deck-${ship.id}-${deck.index + 1}`,
      name: `${ship.name}: ${deck.name}`,
      width: canvas.width,
      height: canvas.height,
      padding: 0,
      backgroundColor: "#04060b",
      grid: { size: SQUARE, type: 1, distance: 1.5, units: "m", color: "#000000", alpha: 0.15 },
      background: { src: file },
      walls: deck.walls.map((wall, index) => ({ _id: `w${index}`, c: [px(wall.x1), px(wall.y1), px(wall.x2), px(wall.y2)], door: wall.door ? 1 : 0, ds: 0, move: 20, sight: 20, light: 20, sound: 20 })),
      lights: [],
      tokens: [],
      notes: [],
    });
  }
  const name = `${ship.name} (deck plans)`;
  files["bundle.json"] = strToU8(JSON.stringify({ adventureData: { name, scenes } }));
  return { bytes: zipSync(files, { level: 0 }), name: `${name}.zip` };
}
