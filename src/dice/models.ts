import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DiceFont, DiceLook, DiceTheme } from "./diceStore";
import { dicePacks } from "./dicePacks";
import { applyGilded, boundaryLoop, createInlayMaterial, crystalGeometry, gemGeometry, getGemMaterial, gildedMaps, gildedNumber, inclusionMaterial, insetFaceGeometry, isGilded, jewelAnchor, KRAKEN_PAINTED, themeProfile, type GildedTheme, type NumberStyle } from "./gilded";

// The dice themselves, from The Gilded Die (F:\dice_table): rounded convex
// shells, centred numerals, procedural themes. Shapes, textures and materials
// are made once and shared by every die thrown with them.

export type DiceKind = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";
type Face = number[];
export type ShapeData = { vertices: THREE.Vector3[]; faces: Face[]; values: string[]; radius: number };
type FaceGroup = { normal: THREE.Vector3; center: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; edges: { a: THREE.Vector3; b: THREE.Vector3 }[] };

const UP = new THREE.Vector3(0, 1, 0);

function orientFaces(vertices: THREE.Vector3[], faces: Face[]) {
  faces.forEach((face) => {
    const [a, b, c] = face.map((index) => vertices[index]);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a));
    const center = face.reduce((sum, index) => sum.add(vertices[index]), new THREE.Vector3()).multiplyScalar(1 / face.length);
    if (normal.dot(center) < 0) face.reverse();
  });
}

function geometryShape(geometry: THREE.BufferGeometry, values: string[], radius: number): ShapeData {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const vertices: THREE.Vector3[] = [];
  const faces: Face[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const face: Face = [];
    for (let j = 0; j < 3; j++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, i + j);
      let index = vertices.findIndex((candidate) => candidate.distanceToSquared(vertex) < 0.000001);
      if (index < 0) {
        index = vertices.length;
        vertices.push(vertex);
      }
      face.push(index);
    }
    faces.push(face);
  }
  return { vertices, faces, values, radius };
}

function cubeShape(): ShapeData {
  const vertices = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(x, y, z).multiplyScalar(0.46))));
  const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  orientFaces(vertices, faces);
  return { vertices, faces, values: ["1", "6", "2", "5", "3", "4"], radius: 0.74 };
}

// A true pentagonal trapezohedron: two poles and an alternating, offset ten-point equator.
function d10Shape(percentile = false): ShapeData {
  const vertices = [new THREE.Vector3(0, 0.76, 0), new THREE.Vector3(0, -0.76, 0)];
  const half = Math.PI / 5;
  const equator = (0.76 * (1 - Math.cos(half))) / (1 + Math.cos(half));
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI * 2) / 10 + Math.PI / 10;
    vertices.push(new THREE.Vector3(Math.cos(angle) * 0.62, i % 2 ? -equator : equator, Math.sin(angle) * 0.62));
  }
  const faces: Face[] = [];
  for (let i = 0; i < 5; i++) {
    const a = 2 + i * 2;
    const b = 2 + ((i * 2 + 1) % 10);
    const c = 2 + ((i * 2 + 2) % 10);
    const d = 2 + ((i * 2 + 3) % 10);
    faces.push([0, a, b, c]);
    faces.push([1, b, c, d]);
  }
  orientFaces(vertices, faces);
  return { vertices, faces, values: percentile ? ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"] : ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], radius: 0.82 };
}

// The tens die of a percentile pair is its own kind here, for its labels.
export type ShapeKind = DiceKind | "d100tens";

function makeShape(kind: ShapeKind): ShapeData {
  if (kind === "d6") return cubeShape();
  if (kind === "d10" || kind === "d100") return d10Shape();
  if (kind === "d100tens") return d10Shape(true);
  const config = {
    d4: [new THREE.TetrahedronGeometry(0.7), ["1", "2", "3", "4"], 0.78],
    d8: [new THREE.OctahedronGeometry(0.74), ["1", "2", "3", "4", "5", "6", "7", "8"], 0.78],
    d12: [new THREE.DodecahedronGeometry(0.73), Array.from({ length: 12 }, (_, i) => `${i + 1}`), 0.82],
    d20: [new THREE.IcosahedronGeometry(0.76), Array.from({ length: 20 }, (_, i) => `${i + 1}`), 0.84],
  }[kind] as [THREE.BufferGeometry, string[], number];
  return geometryShape(config[0], config[1], config[2]);
}

function makeFaces(shape: ShapeData): FaceGroup[] {
  type Edge = { a: THREE.Vector3; b: THREE.Vector3; count: number };
  const groups: { normal: THREE.Vector3; center: THREE.Vector3; triangles: number; edges: Map<string, Edge> }[] = [];
  shape.faces.forEach((face) => {
    const [a, b, c] = face.map((index) => shape.vertices[index]);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();
    const center = face.reduce((sum, index) => sum.add(shape.vertices[index]), new THREE.Vector3()).multiplyScalar(1 / face.length);
    const group = groups.find((candidate) => candidate.normal.dot(normal) > 0.995);
    const target = group ?? { normal, center: new THREE.Vector3(), triangles: 0, edges: new Map<string, Edge>() };
    target.center.add(center);
    target.triangles++;
    face.forEach((start, index) => {
      const end = face[(index + 1) % face.length];
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      const edge = target.edges.get(key);
      if (edge) edge.count++;
      else target.edges.set(key, { a: shape.vertices[start], b: shape.vertices[end], count: 1 });
    });
    if (!group) groups.push(target);
  });
  return groups.map((group) => {
    group.center.multiplyScalar(1 / group.triangles);
    const preferred = [UP, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)]
      .map((axis) => axis.clone().addScaledVector(group.normal, -axis.dot(group.normal)))
      .find((axis) => axis.lengthSq() > 0.08)!
      .normalize();
    const boundary = [...group.edges.values()].filter((edge) => edge.count === 1);
    const height = (edge: Edge) => edge.a.clone().add(edge.b).multiplyScalar(0.5).sub(group.center).dot(preferred);
    const baseline = boundary.reduce((lowest, edge) => (height(edge) < height(lowest) ? edge : lowest));
    const right = new THREE.Vector3().subVectors(baseline.b, baseline.a).normalize();
    const up = new THREE.Vector3().crossVectors(group.normal, right).normalize();
    if (up.dot(preferred) < 0) {
      right.negate();
      up.negate();
    }
    return { normal: group.normal, center: group.center, right, up, edges: [...group.edges.values()] };
  });
}

// The numbers' lettering: the Gilded Die's Georgia, a heavy sans, carved
// capitals (Cinzel, bundled with Kraken) and an italic script.
const FONT_FACES: Record<DiceFont, (px: number) => string> = {
  classic: (px) => `700 ${px}px Georgia`,
  bold: (px) => `900 ${px}px "Arial Black", "Segoe UI Black", Impact, sans-serif`,
  runic: (px) => `700 ${px}px Cinzel, "Trajan Pro", Georgia, serif`,
  script: (px) => `italic 700 ${px}px "Palatino Linotype", Palatino, "Book Antiqua", serif`,
  glow: (px) => `700 ${px}px Cinzel, Georgia, serif`,
  metal: (px) => `700 ${px}px Cinzel, Georgia, serif`,
  engrave: (px) => `700 ${px}px Cinzel, Georgia, serif`,
};

function engravedTexture(value: string, color: string, font: DiceFont = "classic") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = (FONT_FACES[font] ?? FONT_FACES.classic)(value.length > 1 ? (font === "bold" ? 116 : 132) : font === "bold" ? 148 : 162);
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillText(value, 132, 136);
  ctx.fillStyle = color;
  ctx.fillText(value, 128, 128);
  if (value === "6" || value === "9") ctx.fillRect(91, 204, 74, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A dice pack's picture as a texture: drawn once loaded (the body colour until then).
const pictures = new Map<string, THREE.Texture>();
function pictureTexture(id: string, until: string) {
  let texture = pictures.get(id);
  if (!texture) {
    const blank = document.createElement("canvas");
    blank.width = blank.height = 4;
    const ctx = blank.getContext("2d")!;
    ctx.fillStyle = until;
    ctx.fillRect(0, 0, 4, 4);
    const made = new THREE.Texture(blank);
    made.colorSpace = THREE.SRGBColorSpace;
    made.wrapS = made.wrapT = THREE.RepeatWrapping;
    made.anisotropy = 4;
    made.needsUpdate = true;
    void dicePacks
      .image(id)
      .then((image) => {
        made.image = image;
        made.needsUpdate = true;
      })
      .catch(() => undefined);
    pictures.set(id, made);
    texture = made;
  }
  return texture;
}
function pictureMaps(look: DiceLook): { map?: THREE.Texture; bumpMap?: THREE.Texture; emissiveMap?: THREE.Texture } {
  if (!look.texture) return {};
  const map = pictureTexture(look.texture, look.body);
  const emissiveMap = look.glowTexture ? pictureTexture(look.glowTexture, "#000000") : undefined;
  return { map, bumpMap: map, emissiveMap };
}

function themeMaps(theme: DiceTheme, color: string, accentColor = "#d8b46a"): { map?: THREE.Texture; bumpMap?: THREE.Texture; emissiveMap?: THREE.Texture } {
  if (theme === "classic") return {};
  // The Gilded Die's newer themes, as it paints them.
  if (isGilded(theme) && !KRAKEN_PAINTED.has(theme)) return gildedMaps(theme, color);
  const size = 384;
  const albedo = document.createElement("canvas");
  const bump = document.createElement("canvas");
  albedo.width = albedo.height = bump.width = bump.height = size;
  const ctx = albedo.getContext("2d")!;
  const btx = bump.getContext("2d")!;
  const base = new THREE.Color(color);
  const dark = base.clone().offsetHSL(0, 0.03, -0.2);
  const light = base.clone().offsetHSL(0, -0.03, 0.2);
  const accent = new THREE.Color(accentColor);
  let seed = ({ dragonhide: 9217, starfall: 4109, bone: 7741, magma: 6389, leviathan: 2851, marble: 3307, swirl: 5519, speckle: 8093, wood: 1201, runes: 6661, stripes: 4421 } as Record<string, number>)[theme] ?? 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = base.getStyle();
  ctx.fillRect(0, 0, size, size);
  btx.fillStyle = "#777";
  btx.fillRect(0, 0, size, size);

  if (theme === "dragonhide") {
    const scale = 42;
    for (let row = -1; row < 11; row++)
      for (let column = -1; column < 11; column++) {
        const x = column * scale + (row % 2 ? scale / 2 : 0);
        const y = row * 34;
        ctx.beginPath();
        ctx.arc(x, y, scale * 0.58, 0.08 * Math.PI, 0.92 * Math.PI);
        ctx.strokeStyle = dark.getStyle();
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y - 2, scale * 0.47, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.strokeStyle = light.getStyle();
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
        btx.beginPath();
        btx.arc(x, y, scale * 0.56, 0.08 * Math.PI, 0.92 * Math.PI);
        btx.strokeStyle = "#292929";
        btx.lineWidth = 8;
        btx.stroke();
      }
  } else if (theme === "starfall") {
    const nebula = ctx.createRadialGradient(110, 130, 8, 150, 150, 180);
    nebula.addColorStop(0, "rgba(64,150,205,.78)");
    nebula.addColorStop(0.42, "rgba(126,64,155,.48)");
    nebula.addColorStop(1, "rgba(4,9,31,0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 230; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = random() > 0.95 ? 1.8 : 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = random() > 0.86 ? "#ffe6a8" : "#eaf4ff";
      ctx.globalAlpha = 0.45 + random() * 0.55;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
      const x = random() * size;
      const y = random() * size;
      btx.fillStyle = random() > 0.75 ? "#999" : "#6c6c6c";
      btx.fillRect(x, y, 1.5, 1.5);
    }
  } else if (theme === "bone") {
    for (let i = 0; i < 420; i++) {
      const shade = 120 + Math.floor(random() * 90);
      ctx.fillStyle = `rgba(${shade},${Math.floor(shade * 0.87)},${Math.floor(shade * 0.63)},${0.015 + random() * 0.045})`;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 2 + random() * 15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(60,42,28,.48)";
    ctx.lineWidth = 1.5;
    btx.strokeStyle = "#3b3b3b";
    btx.lineWidth = 2;
    for (let crack = 0; crack < 18; crack++) {
      let x = random() * size;
      let y = random() * size;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(x, y);
      btx.moveTo(x, y);
      for (let step = 0; step < 5; step++) {
        x += (random() - 0.5) * 28;
        y += 9 + random() * 19;
        ctx.lineTo(x, y);
        btx.lineTo(x, y);
      }
      ctx.stroke();
      btx.stroke();
    }
  } else if (theme === "magma") {
    ctx.fillStyle = "#140e12";
    ctx.fillRect(0, 0, size, size);
    btx.fillStyle = "#8a8a8a";
    btx.fillRect(0, 0, size, size);
    for (let vein = 0; vein < 18; vein++) {
      let x = random() * size;
      let y = -20;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(x, y);
      btx.moveTo(x, y);
      while (y < size + 20) {
        x += (random() - 0.5) * 34;
        y += 18 + random() * 25;
        ctx.lineTo(x, y);
        btx.lineTo(x, y);
      }
      ctx.shadowColor = "#ff4d0a";
      ctx.shadowBlur = 13;
      ctx.strokeStyle = random() > 0.65 ? "#ffd35a" : "#f04a16";
      ctx.lineWidth = 1.5 + random() * 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
      btx.strokeStyle = "#202020";
      btx.lineWidth = 4;
      btx.stroke();
    }
  } else if (theme === "marble") {
    // Veins of the accent colour wandering through the stone, soft and sharp.
    for (let vein = 0; vein < 22; vein++) {
      let x = random() * size;
      let y = random() * size;
      let angle = random() * Math.PI * 2;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(x, y);
      btx.moveTo(x, y);
      for (let step = 0; step < 40; step++) {
        angle += (random() - 0.5) * 0.7;
        x += Math.cos(angle) * 9;
        y += Math.sin(angle) * 9;
        ctx.lineTo(x, y);
        btx.lineTo(x, y);
      }
      ctx.strokeStyle = accent.getStyle();
      ctx.globalAlpha = vein % 4 === 0 ? 0.85 : 0.34;
      ctx.lineWidth = vein % 4 === 0 ? 2.2 : 5 + random() * 7;
      ctx.filter = vein % 4 === 0 ? "none" : "blur(3px)";
      ctx.stroke();
      ctx.filter = "none";
      btx.strokeStyle = "#6a6a6a";
      btx.lineWidth = 1.5;
      btx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (theme === "swirl") {
    // Two colours stirred together, like swirled resin.
    for (let band = 0; band < 26; band++) {
      ctx.beginPath();
      const offset = band * 0.42;
      for (let t = 0; t <= 1; t += 0.01) {
        const r = t * size * 0.75;
        const a = offset + t * 9;
        const x = size / 2 + Math.cos(a) * r;
        const y = size / 2 + Math.sin(a) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = (band % 2 ? accent : light).getStyle();
      ctx.globalAlpha = band % 2 ? 0.5 : 0.18;
      ctx.lineWidth = 9 + random() * 10;
      ctx.filter = "blur(4px)";
      ctx.stroke();
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  } else if (theme === "speckle") {
    // Flecks of the accent colour and a little gold, as glitter in resin.
    for (let i = 0; i < 900; i++) {
      const x = random() * size;
      const y = random() * size;
      const big = random() > 0.93;
      ctx.fillStyle = random() > 0.82 ? "#f6dc9a" : accent.getStyle();
      ctx.globalAlpha = 0.35 + random() * 0.65;
      ctx.beginPath();
      ctx.arc(x, y, big ? 2.2 : 0.5 + random() * 1.1, 0, Math.PI * 2);
      ctx.fill();
      if (big) {
        btx.fillStyle = "#a0a0a0";
        btx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  } else if (theme === "wood") {
    // Growth rings and grain, darker in the accent colour.
    for (let ring = 0; ring < 46; ring++) {
      ctx.beginPath();
      btx.beginPath();
      const y0 = ring * (size / 40) - 20;
      for (let x = -10; x <= size + 10; x += 6) {
        const y = y0 + Math.sin(x * 0.018 + ring * 0.31) * 10 + Math.sin(x * 0.07 + ring) * 2.5;
        if (x < 0) {
          ctx.moveTo(x, y);
          btx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          btx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = accent.getStyle();
      ctx.globalAlpha = 0.18 + random() * 0.32;
      ctx.lineWidth = 1 + random() * 3.5;
      ctx.stroke();
      btx.strokeStyle = "#5c5c5c";
      btx.lineWidth = 1.5;
      btx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (theme === "runes") {
    // Runes carved all over, filled with the accent colour.
    const glyphs = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
    ctx.textAlign = btx.textAlign = "center";
    ctx.textBaseline = btx.textBaseline = "middle";
    for (let row = 0; row < 7; row++)
      for (let column = 0; column < 7; column++) {
        const glyph = glyphs[Math.floor(random() * glyphs.length)];
        const x = column * (size / 6.5) + (row % 2) * 18 + 10;
        const y = row * (size / 6.5) + 14;
        ctx.font = btx.font = `700 ${26 + Math.floor(random() * 10)}px "Segoe UI Historic", "Noto Sans Runic", serif`;
        ctx.fillStyle = accent.getStyle();
        ctx.globalAlpha = 0.5;
        ctx.shadowColor = accent.getStyle();
        ctx.shadowBlur = 8;
        ctx.fillText(glyph, x, y);
        ctx.shadowBlur = 0;
        btx.fillStyle = "#3a3a3a";
        btx.fillText(glyph, x, y);
      }
    ctx.globalAlpha = 1;
  } else if (theme === "stripes") {
    // Bold diagonal bands in the accent colour.
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 4);
    for (let band = -10; band < 10; band++) {
      if (band % 2) continue;
      ctx.fillStyle = accent.getStyle();
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-size, band * 30, size * 2, 30);
      btx.save();
      btx.translate(size / 2, size / 2);
      btx.rotate(-Math.PI / 4);
      btx.fillStyle = "#8a8a8a";
      btx.fillRect(-size, band * 30, size * 2, 2);
      btx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  } else {
    for (let wave = -2; wave < 14; wave++) {
      ctx.beginPath();
      btx.beginPath();
      for (let x = -10; x <= size + 10; x += 8) {
        const y = wave * 32 + Math.sin(x * 0.045 + wave * 0.8) * 11;
        if (x < 0) {
          ctx.moveTo(x, y);
          btx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          btx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = wave % 2 ? dark.getStyle() : light.getStyle();
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 4;
      ctx.stroke();
      btx.strokeStyle = wave % 2 ? "#555" : "#9a9a9a";
      btx.lineWidth = 5;
      btx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 75; i++) {
      ctx.fillStyle = "rgba(205,255,235,.55)";
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.5 + random() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

function visualGeometry(kind: ShapeKind, shape: ShapeData) {
  if (kind === "d6") return new RoundedBoxGeometry(0.92, 0.92, 0.92, 6, 0.11);
  const radius = kind === "d4" ? 0.055 : kind === "d10" || kind === "d100" || kind === "d100tens" ? 0.042 : kind === "d20" ? 0.044 : 0.05;
  const planes = shape.faces.map((face) => {
    const [a, b, c] = face.map((index) => shape.vertices[index]);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();
    const center = face.reduce((sum, index) => sum.add(shape.vertices[index]), new THREE.Vector3()).multiplyScalar(1 / face.length);
    return { normal, distance: normal.dot(center) };
  });
  const inradius = Math.min(...planes.map((plane) => plane.distance));
  const innerScale = Math.max(0.72, 1 - radius / inradius);
  const inner = shape.vertices.map((vertex) => vertex.clone().multiplyScalar(innerScale));
  const positions: number[] = [];
  shape.faces.forEach((face, faceIndex) => {
    const outer = face.map((index) => inner[index].clone().addScaledVector(planes[faceIndex].normal, radius));
    for (let i = 1; i < outer.length - 1; i++) positions.push(...outer[0].toArray(), ...outer[i].toArray(), ...outer[i + 1].toArray());
  });
  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  faceGeometry.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [faceGeometry];
  const edges = new Set<string>();
  shape.faces.forEach((face) =>
    face.forEach((start, index) => {
      const end = face[(index + 1) % face.length];
      edges.add(start < end ? `${start}:${end}` : `${end}:${start}`);
    }),
  );
  edges.forEach((key) => {
    const [aIndex, bIndex] = key.split(":").map(Number);
    const start = inner[aIndex];
    const end = inner[bIndex];
    const direction = new THREE.Vector3().subVectors(end, start);
    const edge = new THREE.CylinderGeometry(radius, radius, direction.length(), 12, 1, false).toNonIndexed();
    edge.deleteAttribute("uv");
    edge.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
    edge.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    parts.push(edge);
  });
  inner.forEach((vertex) => {
    const cap = new THREE.SphereGeometry(radius, 12, 8).toNonIndexed();
    cap.deleteAttribute("uv");
    cap.translate(vertex.x, vertex.y, vertex.z);
    parts.push(cap);
  });
  const geometry = mergeGeometries(parts, false)!;
  const position = geometry.getAttribute("position");
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i).normalize();
    uv.push(0.5 + Math.atan2(vertex.z, vertex.x) / (Math.PI * 2), 0.5 - Math.asin(THREE.MathUtils.clamp(vertex.y, -1, 1)) / Math.PI);
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

// --- Shared, made once ------------------------------------------------------

type Model = { shape: ShapeData; faces: FaceGroup[]; geometry: THREE.BufferGeometry };
const models = new Map<ShapeKind, Model>();
const shells = new Map<string, THREE.Material>();
const labels = new Map<string, THREE.Material>();
const planes = new Map<number, THREE.PlaneGeometry>();

export function model(kind: ShapeKind): Model {
  let found = models.get(kind);
  if (!found) {
    const shape = makeShape(kind);
    found = { shape, faces: makeFaces(shape), geometry: visualGeometry(kind, shape) };
    models.set(kind, found);
  }
  return found;
}

// Each body gets its own collider (cannon keeps per-shape world vertices).
export function collider(kind: ShapeKind) {
  const { shape, geometry } = model(kind);
  // The size the die is drawn (its bevelled shell), so it touches what it is seen to touch.
  geometry.computeBoundingBox();
  const drawn = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
  const xs = shape.vertices.map((v) => v.x);
  const fit = Math.min(1, drawn / (Math.max(...xs) - Math.min(...xs)));
  return new CANNON.ConvexPolyhedron({ vertices: shape.vertices.map((v) => new CANNON.Vec3(v.x * fit, v.y * fit, v.z * fit)), faces: shape.faces.map((face) => [...face]) });
}

// What the dice are made of: how they take the light. Resin is the Gilded
// Die's; glass lets the light through, tinted by the body; metal mirrors the
// room; pearl shimmers; stone and wood are matte. A glowing set shines on its own.
function shellMaterial(look: DiceLook) {
  const material_ = look.material ?? "plastic";
  const key = `${look.theme}|${look.body}|${look.accent}|${material_}|${look.effect === "glow" ? "glow" : ""}|${look.texture ?? ""}|${look.glowTexture ?? ""}`;
  let material = shells.get(key);
  if (!material && material_ === "design" && isGilded(look.theme)) {
    // Made as its design is: the Gilded Die's own finish for it.
    const physical = new THREE.MeshPhysicalMaterial();
    applyGilded(physical, look.theme, look.body, KRAKEN_PAINTED.has(look.theme) ? themeMaps(look.theme, look.body, look.accent) : undefined);
    if (physical.emissiveIntensity > 0) physical.userData.pulse = { base: physical.emissiveIntensity, amount: themeProfile(look.theme).pulse };
    material = physical;
    shells.set(key, material);
  }
  if (!material) {
    const maps = look.theme === "picture" ? pictureMaps(look) : themeMaps(look.theme, look.body, look.accent);
    const solid = look.theme === "classic";
    const base = {
      color: solid ? look.body : "#ffffff",
      map: maps.map,
      bumpMap: maps.bumpMap,
      bumpScale: look.theme === "bone" ? 0.018 : 0.028,
      roughness: look.theme === "bone" ? 0.62 : look.theme === "magma" ? 0.5 : 0.4,
      metalness: 0.015,
      clearcoat: look.theme === "starfall" || look.theme === "leviathan" ? 0.38 : 0.2,
      clearcoatRoughness: 0.4,
    };
    const physical = new THREE.MeshPhysicalMaterial(base);
    if (material_ === "glass") {
      // Dark glass stays dark (obsidian, smoke); light glass lets the light through.
      const tint = new THREE.Color(look.body);
      const dark = tint.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
      Object.assign(physical, { transmission: dark ? 0 : 0.94, thickness: 0.7, ior: 1.48, roughness: dark ? 0.06 : 0.05, metalness: dark ? 0.2 : 0.015, clearcoat: 1, clearcoatRoughness: 0.05 });
      physical.attenuationColor = tint;
      physical.attenuationDistance = dark ? 0.35 : 0.9;
      physical.color = dark ? tint.clone() : tint.clone().lerp(new THREE.Color("#ffffff"), 0.45);
      physical.specularIntensity = 1;
    } else if (material_ === "metal") {
      Object.assign(physical, { metalness: 1, roughness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.2 });
      if (solid) physical.color = new THREE.Color(look.body);
    } else if (material_ === "pearl") {
      // A shimmer over the dice's own colour, not over it.
      Object.assign(physical, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, iridescence: 0.45, iridescenceIOR: 1.4, sheen: 0.25 });
      physical.iridescenceThicknessRange = [220, 480];
      physical.sheenColor = new THREE.Color(look.accent ?? "#ffffff").lerp(new THREE.Color(look.body), 0.5);
      if (solid) physical.color = new THREE.Color(look.body);
    } else if (material_ === "stone") {
      Object.assign(physical, { roughness: 0.88, clearcoat: 0, bumpScale: base.bumpScale * 2.2 });
    } else if (material_ === "wood") {
      Object.assign(physical, { roughness: 0.68, clearcoat: 0.35, clearcoatRoughness: 0.5, bumpScale: base.bumpScale * 1.4 });
    }
    if (maps.emissiveMap) {
      // A theme's own glow (stars, veins, runes) shines through any material.
      physical.emissive = new THREE.Color("#ffffff");
      physical.emissiveMap = maps.emissiveMap;
      physical.emissiveIntensity = look.theme === "picture" ? 0.9 : 0.45;
    }
    if (look.effect === "glow") {
      physical.emissive = new THREE.Color(look.body).lerp(new THREE.Color(look.accent ?? "#ffffff"), 0.35);
      physical.emissiveIntensity = 0.55;
      if (maps.map) physical.emissiveMap = maps.map;
    }
    material = physical;
    shells.set(key, material);
  }
  return material;
}

const STYLED = new Set(["glow", "metal", "engrave"]);
function labelMaterial(value: string, ink: string, font: DiceFont = "classic", pips = false, largePips = false) {
  const style: NumberStyle | null = pips ? "pips" : STYLED.has(font) ? (font as NumberStyle) : null;
  const key = `${value}|${ink}|${font}|${style ?? ""}|${largePips ? "lg" : ""}`;
  let material = labels.get(key);
  if (!material) {
    // Glowing, gilt and engraved numbers, and pips, as the Gilded Die letters them.
    const map = style ? gildedNumber(value, ink, style, largePips) : engravedTexture(value, ink, font);
    material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide, toneMapped: !style });
    labels.set(key, material);
  }
  return material;
}

function plane(size: number) {
  let geometry = planes.get(size);
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(size, size);
    planes.set(size, geometry);
  }
  return geometry;
}

// A die, with these labels on its faces (in the order of model(kind).faces).
export function buildDie(kind: ShapeKind, look: DiceLook, values: string[]) {
  const { faces, geometry } = model(kind);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(geometry, shellMaterial(look));
  shell.castShadow = shell.receiveShadow = true;
  group.add(shell);
  // Its own design: the Gilded Die's inner crystal, face inlays and gems.
  const profile = look.material === "design" && isGilded(look.theme) ? themeProfile(look.theme) : null;
  const theme = look.theme as GildedTheme;
  if (profile) {
    shell.renderOrder = profile.transmission > 0 ? 2 : 0;
    if (profile.inclusion) group.add(...crystal(kind, theme, look.body));
  }
  const pips = Boolean(look.pips) && kind === "d6";
  const largePips = pips && look.theme === "gilded";
  const size = largePips ? 0.82 : kind === "d20" ? 0.39 : kind === "d12" ? 0.43 : kind === "d4" ? 0.43 : 0.5;
  const visual = kind === "d100" || kind === "d100tens" ? "d10" : kind;
  const inlaid = Boolean(profile && profile.faceMode !== "none");
  const inset = profile ? (visual === "d6" ? 0.15 : visual === "d20" ? 0.04 : visual === "d4" ? 0.09 : 0.06) * (profile.faceMode === "glass" ? 0.62 : 1) : 0;
  faces.forEach((face, index) => {
    if (inlaid) {
      const inlay = inlayMaterial(theme, look.body, index);
      const loop = boundaryLoop(face.edges.filter((edge) => (edge as { count?: number }).count === 1));
      if (inlay && loop.length >= 3) {
        const mesh = new THREE.Mesh(insetFaceGeometry(loop, face.normal, face.center, inset, 0.01), inlay);
        mesh.renderOrder = 3;
        group.add(mesh);
      }
    }
    const label = new THREE.Mesh(plane(size), labelMaterial(values[index % values.length], look.ink, look.font, pips, largePips));
    label.position.copy(face.center).addScaledVector(face.normal, inlaid ? 0.02 : 0.004);
    label.renderOrder = 4;
    let right = face.right;
    let up = face.up;
    if (kind === "d10" || kind === "d100" || kind === "d100tens") {
      const vertices = face.edges.flatMap((edge) => [edge.a, edge.b]);
      const tip = vertices.reduce((sharpest, vertex) => (Math.abs(vertex.y) > Math.abs(sharpest.y) ? vertex : sharpest));
      up = tip.clone().sub(face.center).addScaledVector(face.normal, -tip.clone().sub(face.center).dot(face.normal)).normalize();
      right = new THREE.Vector3().crossVectors(up, face.normal).normalize();
    }
    label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, face.normal));
    group.add(label);
  });
  if (profile && look.theme === "reliquary") group.add(gems(kind));
  return group;
}

// The gem dice's inner crystal: a faceted core in the theme's accent and a bright heart.
const crystals = new Map<string, THREE.Mesh[]>();
function crystal(kind: ShapeKind, theme: GildedTheme, body: string) {
  const key = `${kind}|${theme}|${body}`;
  let found = crystals.get(key);
  if (!found) {
    const profile = themeProfile(theme);
    const geometry = crystalGeometry(model(kind).shape, body);
    const coreMaterial = inclusionMaterial(profile.accent, theme === "aether" ? 0.85 : 0.55);
    const heartMaterial = inclusionMaterial("#f7fbff", theme === "aether" ? 1.35 : 0.95);
    heartMaterial.vertexColors = false;
    heartMaterial.color.set(theme === "emerald" ? "#eafff4" : theme === "void" ? "#f3e6ff" : theme === "obsidian" ? "#c9d4ff" : "#f4fbff");
    coreMaterial.userData.pulse = { base: coreMaterial.emissiveIntensity, amount: profile.pulse };
    heartMaterial.userData.pulse = { base: heartMaterial.emissiveIntensity, amount: profile.pulse };
    const core = new THREE.Mesh(geometry, coreMaterial);
    core.scale.setScalar(theme === "obsidian" ? 0.5 : 0.6);
    const heart = new THREE.Mesh(geometry, heartMaterial);
    heart.scale.setScalar(0.34);
    found = [core, heart];
    crystals.set(key, found);
  }
  // Each die its own meshes, sharing the geometry and materials.
  return found.map((mesh) => {
    const copy = new THREE.Mesh(mesh.geometry, mesh.material);
    copy.scale.copy(mesh.scale);
    return copy;
  });
}

const inlays = new Map<string, THREE.Material | null>();
function inlayMaterial(theme: GildedTheme, body: string, index: number) {
  const key = `${theme}|${body}|${index % 8}`;
  if (!inlays.has(key)) inlays.set(key, createInlayMaterial(theme, body, index));
  return inlays.get(key) ?? null;
}

// The reliquary's gems: one on every corner and every edge.
const jewelDummy = new THREE.Object3D();
function gems(kind: ShapeKind) {
  const { shape } = model(kind);
  const visual = kind === "d100" || kind === "d100tens" ? "d10" : kind;
  const anchors = shape.vertices.map((vertex) => ({ point: jewelAnchor(visual, vertex), scale: visual === "d20" || visual === "d12" ? 0.72 : 1 }));
  const seen = new Set<string>();
  shape.faces.forEach((face) =>
    face.forEach((start, index) => {
      const end = face[(index + 1) % face.length];
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      if (seen.has(key)) return;
      seen.add(key);
      anchors.push({ point: jewelAnchor(visual, shape.vertices[start].clone().add(shape.vertices[end]).multiplyScalar(0.5)), scale: visual === "d20" ? 0.42 : 0.55 });
    }),
  );
  const jewels = new THREE.InstancedMesh(gemGeometry(), getGemMaterial(), anchors.length);
  anchors.forEach((anchor, index) => {
    jewelDummy.position.copy(anchor.point);
    jewelDummy.scale.setScalar(anchor.scale);
    jewelDummy.updateMatrix();
    jewels.setMatrixAt(index, jewelDummy.matrix);
  });
  jewels.instanceMatrix.needsUpdate = true;
  return jewels;
}

// Glowing designs breathe: every pulsing material's glow, at this time (seconds).
export function pulseDice(group: THREE.Object3D, time: number) {
  const phase = (group.userData.phase ??= Math.random() * Math.PI * 2) as number;
  group.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    const pulse = material?.userData?.pulse as { base: number; amount: number } | undefined;
    if (pulse && pulse.amount > 0) material!.emissiveIntensity = pulse.base * (1 + Math.sin(time * 2.4 + phase) * pulse.amount);
  });
}

// The face that points up when the die rests with this rotation.
export function topFace(kind: ShapeKind, quaternion: THREE.Quaternion) {
  const { faces } = model(kind);
  let best = 0;
  let bestDot = -Infinity;
  faces.forEach((face, index) => {
    const y = face.normal.clone().applyQuaternion(quaternion).y;
    if (y > bestDot) {
      bestDot = y;
      best = index;
    }
  });
  return best;
}

// The face it rests on (the one pointing down).
export function bottomFace(kind: ShapeKind, quaternion: THREE.Quaternion) {
  const { faces } = model(kind);
  let best = 0;
  let lowest = Infinity;
  faces.forEach((face, index) => {
    const y = face.normal.clone().applyQuaternion(quaternion).y;
    if (y < lowest) {
      lowest = y;
      best = index;
    }
  });
  return best;
}

// A tens die for percentile rolls: a lighter shade of the set.
export function tensLook(look: DiceLook): DiceLook {
  return { ...look, body: new THREE.Color(look.body).offsetHSL(0.04, -0.08, 0.16).getStyle() };
}
