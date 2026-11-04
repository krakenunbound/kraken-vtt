import * as THREE from "three";

// The Gilded Die"s (I:\dice_table) themes as their maker drew them: each
// one"s own finish (glass, metal, enamel, gems), the way its numbers are
// lettered, an inner crystal for the gem dice, enamel or stained-glass face
// inlays, gems on the reliquary"s corners and edges, the trail it leaves and
// the colours of its sparks. Kraken"s dice use these when a set is "made of"
// its own design (material "design"); its textures go on any material.

export type GildedTheme =
  | "aether" | "reliquary" | "rosewindow" | "classic" | "gilded" | "emerald" | "frost" | "obsidian" | "dragonhide"
  | "bloodstone" | "bone" | "leviathan" | "magma" | "starfall" | "arcane" | "void" | "hero" | "monster" | "wizard"
  | "bard" | "necromancer" | "goblin" | "wyrm" | "ghost" | "undead" | "traveller" | "mythos";
export type NumberStyle = "ink" | "glow" | "engrave" | "metal" | "pips";
export type FaceMode = "none" | "enamel" | "glass";
export type TrailStyle = "spark" | "glow" | "wisp" | "ion" | "embers" | "notes" | "holy" | "charge";
// Themes Kraken already painted before (its own textures stay).
export const KRAKEN_PAINTED = new Set(["classic", "dragonhide", "starfall", "bone", "magma", "leviathan"]);
export const isGilded = (theme: string): theme is GildedTheme => theme in PROFILES;
// The Gilded Die's studio: a dark room with a few lit panels, so glass,
// metal and clearcoat catch bright highlights against deep shadow.
export function studioScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#12141a");
  const panel = (color: string, x: number, y: number, z: number, size: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel("#fff1d4", -5, 4.6, 2, 7);
  panel("#c5dcff", 5.2, 2.4, -3, 6);
  panel("#ffd5ea", 0.6, 5.2, 4.4, 3.5);
  panel("#8ec8ff", -3.2, 1.4, -6, 5);
  panel("#1c2028", 0, -4.2, 1, 12);
  return scene;
}

// The colours a set's trail and sparks come in: its theme's, or its accent and numbers'.
export function sparkColors(look: { theme: string; accent?: string; ink: string }) {
  return isGilded(look.theme) ? themeSparkColors(look.theme) : [look.accent ?? "#d8b46a", look.ink];
}

type ThemeProfile = {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  iridescence: number;
  envMapIntensity: number;
  bumpScale: number;
  emissive: string;
  emissiveIntensity: number;
  sheen: number;
  anisotropy: number;
  numberStyle: NumberStyle;
  pips: boolean;
  faceMode: FaceMode;
  inclusion: boolean;
  pulse: number;
  accent: string;
  spark: string;
  ambient: number;
  attenuation: string;
  attenuationDistance: number;
  trail: TrailStyle;
};

const PROFILES: Record<GildedTheme, ThemeProfile> = {
  aether: { roughness: 0.035, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transmission: 0.97, thickness: 0.72, ior: 1.5, iridescence: 0.12, envMapIntensity: 1.45, bumpScale: 0, emissive: "#000000", emissiveIntensity: 0, sheen: 0, anisotropy: 0, numberStyle: "metal", pips: false, faceMode: "none", inclusion: true, pulse: 0.28, accent: "#4aa6ff", spark: "#9fd4ff", ambient: 0.85, attenuation: "#8ec4ff", attenuationDistance: 0.62, trail: "glow" },
  reliquary: { roughness: 0.15, metalness: 1, clearcoat: 0.4, clearcoatRoughness: 0.18, transmission: 0, thickness: 0, ior: 1.5, iridescence: 0, envMapIntensity: 1.75, bumpScale: 0.006, emissive: "#000000", emissiveIntensity: 0, sheen: 0, anisotropy: 0.35, numberStyle: "metal", pips: false, faceMode: "enamel", inclusion: false, pulse: 0, accent: "#f2f5f8", spark: "#8eb6ff", ambient: 0.45, attenuation: "#ffffff", attenuationDistance: 1, trail: "spark" },
  rosewindow: { roughness: 0.3, metalness: 0.88, clearcoat: 0.55, clearcoatRoughness: 0.22, transmission: 0, thickness: 0, ior: 1.5, iridescence: 0.15, envMapIntensity: 1.35, bumpScale: 0, emissive: "#3a2a10", emissiveIntensity: 0.04, sheen: 0, anisotropy: 0, numberStyle: "metal", pips: false, faceMode: "glass", inclusion: false, pulse: 0.08, accent: "#ffd27a", spark: "#ffe08a", ambient: 0.7, attenuation: "#ffffff", attenuationDistance: 1, trail: "glow" },
  classic: { roughness: 0.16, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.16, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0, envMapIntensity: 1.2, bumpScale: 0.012, emissive: "#3a0a14", emissiveIntensity: 0.05, sheen: 0.15, anisotropy: 0, numberStyle: "ink", pips: true, faceMode: "none", inclusion: false, pulse: 0, accent: "#e25a70", spark: "#ffb0c0", ambient: 0.2, attenuation: "#ffffff", attenuationDistance: 1, trail: "spark" },
  gilded: { roughness: 0.24, metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.3, transmission: 0, thickness: 0, ior: 1.5, iridescence: 0, envMapIntensity: 1.45, bumpScale: 0.008, emissive: "#6a4a12", emissiveIntensity: 0.12, sheen: 0, anisotropy: 0.35, numberStyle: "engrave", pips: true, faceMode: "none", inclusion: false, pulse: 0, accent: "#ffd56a", spark: "#ffe09a", ambient: 0.28, attenuation: "#ffffff", attenuationDistance: 1, trail: "spark" },
  emerald: { roughness: 0.04, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0.9, thickness: 0.7, ior: 1.57, iridescence: 0.22, envMapIntensity: 1.4, bumpScale: 0.008, emissive: "#043222", emissiveIntensity: 0.08, sheen: 0, anisotropy: 0, numberStyle: "metal", pips: false, faceMode: "none", inclusion: true, pulse: 0.18, accent: "#3dff9a", spark: "#b8ffd8", ambient: 0.55, attenuation: "#1fa36a", attenuationDistance: 0.45, trail: "glow" },
  frost: { roughness: 0.05, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.06, transmission: 0.88, thickness: 0.62, ior: 1.31, iridescence: 0.48, envMapIntensity: 1.35, bumpScale: 0.02, emissive: "#d7f4ff", emissiveIntensity: 0.08, sheen: 0.2, anisotropy: 0, numberStyle: "ink", pips: false, faceMode: "none", inclusion: true, pulse: 0.16, accent: "#d7f4ff", spark: "#f4fbff", ambient: 0.7, attenuation: "#e7f7ff", attenuationDistance: 0.7, trail: "glow" },
  obsidian: { roughness: 0.045, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0.42, thickness: 0.8, ior: 1.5, iridescence: 0.08, envMapIntensity: 1.5, bumpScale: 0.01, emissive: "#1a1030", emissiveIntensity: 0.12, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: true, pulse: 0.2, accent: "#8aa0ff", spark: "#c5d4ff", ambient: 0.35, attenuation: "#0a0612", attenuationDistance: 0.28, trail: "glow" },
  dragonhide: { roughness: 0.48, metalness: 0.06, clearcoat: 0.28, clearcoatRoughness: 0.4, transmission: 0, thickness: 0, ior: 1.4, iridescence: 0.05, envMapIntensity: 0.85, bumpScale: 0.045, emissive: "#0c2416", emissiveIntensity: 0.04, sheen: 0.55, anisotropy: 0, numberStyle: "ink", pips: false, faceMode: "none", inclusion: false, pulse: 0, accent: "#3d8f5c", spark: "#d8c07a", ambient: 0.12, attenuation: "#ffffff", attenuationDistance: 1, trail: "embers" },
  bloodstone: { roughness: 0.32, metalness: 0.18, clearcoat: 0.55, clearcoatRoughness: 0.25, transmission: 0, thickness: 0, ior: 1.5, iridescence: 0.1, envMapIntensity: 1.15, bumpScale: 0.02, emissive: "#2a0a10", emissiveIntensity: 0.08, sheen: 0, anisotropy: 0, numberStyle: "metal", pips: false, faceMode: "none", inclusion: false, pulse: 0.06, accent: "#ffb45a", spark: "#ffd27a", ambient: 0.22, attenuation: "#ffffff", attenuationDistance: 1, trail: "spark" },
  bone: { roughness: 0.62, metalness: 0.02, clearcoat: 0.08, clearcoatRoughness: 0.6, transmission: 0, thickness: 0, ior: 1.4, iridescence: 0, envMapIntensity: 0.55, bumpScale: 0.02, emissive: "#000000", emissiveIntensity: 0, sheen: 0.25, anisotropy: 0, numberStyle: "engrave", pips: true, faceMode: "none", inclusion: false, pulse: 0, accent: "#e6d3ae", spark: "#f3ead4", ambient: 0.08, attenuation: "#ffffff", attenuationDistance: 1, trail: "wisp" },
  leviathan: { roughness: 0.18, metalness: 0.22, clearcoat: 0.85, clearcoatRoughness: 0.12, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0.9, envMapIntensity: 1.3, bumpScale: 0.02, emissive: "#06343a", emissiveIntensity: 0.06, sheen: 0.35, anisotropy: 0, numberStyle: "ink", pips: false, faceMode: "none", inclusion: false, pulse: 0.1, accent: "#7dfff0", spark: "#d9fff6", ambient: 0.4, attenuation: "#ffffff", attenuationDistance: 1, trail: "glow" },
  magma: { roughness: 0.55, metalness: 0.08, clearcoat: 0.2, clearcoatRoughness: 0.4, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0, envMapIntensity: 0.8, bumpScale: 0.04, emissive: "#ff5a1a", emissiveIntensity: 0.7, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.45, accent: "#ff6a2a", spark: "#ffb15a", ambient: 0.55, attenuation: "#ffffff", attenuationDistance: 1, trail: "embers" },
  starfall: { roughness: 0.28, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.2, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0.18, envMapIntensity: 1.15, bumpScale: 0.012, emissive: "#9ec4ff", emissiveIntensity: 0.55, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.35, accent: "#8eb6ff", spark: "#e7f1ff", ambient: 0.75, attenuation: "#ffffff", attenuationDistance: 1, trail: "glow" },
  arcane: { roughness: 0.34, metalness: 0.2, clearcoat: 0.45, clearcoatRoughness: 0.25, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0.12, envMapIntensity: 1.05, bumpScale: 0.018, emissive: "#f0d78c", emissiveIntensity: 0.55, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.4, accent: "#d7b25a", spark: "#ffe7a8", ambient: 0.6, attenuation: "#ffffff", attenuationDistance: 1, trail: "charge" },
  void: { roughness: 0.08, metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.08, transmission: 0.72, thickness: 0.85, ior: 1.48, iridescence: 0.28, envMapIntensity: 1.25, bumpScale: 0.01, emissive: "#6a2ad4", emissiveIntensity: 0.35, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: true, pulse: 0.32, accent: "#b06bff", spark: "#e4c8ff", ambient: 0.8, attenuation: "#1a0a28", attenuationDistance: 0.4, trail: "wisp" },
  hero: { roughness: 0.18, metalness: 0.92, clearcoat: 0.65, clearcoatRoughness: 0.16, transmission: 0, thickness: 0, ior: 1.5, iridescence: 0.08, envMapIntensity: 1.55, bumpScale: 0.006, emissive: "#fff1c4", emissiveIntensity: 0.16, sheen: 0.15, anisotropy: 0.25, numberStyle: "metal", pips: false, faceMode: "none", inclusion: false, pulse: 0.22, accent: "#ffe7a0", spark: "#fff6d0", ambient: 0.55, attenuation: "#ffffff", attenuationDistance: 1, trail: "holy" },
  monster: { roughness: 0.62, metalness: 0.08, clearcoat: 0.18, clearcoatRoughness: 0.45, transmission: 0, thickness: 0, ior: 1.4, iridescence: 0, envMapIntensity: 0.75, bumpScale: 0.04, emissive: "#4a1020", emissiveIntensity: 0.1, sheen: 0.28, anisotropy: 0, numberStyle: "ink", pips: false, faceMode: "none", inclusion: false, pulse: 0.08, accent: "#ff6a4a", spark: "#ff8a68", ambient: 0.22, attenuation: "#ffffff", attenuationDistance: 1, trail: "embers" },
  wizard: { roughness: 0.38, metalness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.22, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0.16, envMapIntensity: 1.15, bumpScale: 0.012, emissive: "#7eb6ff", emissiveIntensity: 0.42, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.36, accent: "#9fd0ff", spark: "#c5e4ff", ambient: 0.7, attenuation: "#ffffff", attenuationDistance: 1, trail: "charge" },
  bard: { roughness: 0.48, metalness: 0.16, clearcoat: 0.28, clearcoatRoughness: 0.35, transmission: 0, thickness: 0, ior: 1.42, iridescence: 0.06, envMapIntensity: 0.95, bumpScale: 0.01, emissive: "#ffd27a", emissiveIntensity: 0.42, sheen: 0.55, anisotropy: 0, numberStyle: "metal", pips: false, faceMode: "none", inclusion: false, pulse: 0.16, accent: "#ffd27a", spark: "#ffd27a", ambient: 0.7, attenuation: "#ffffff", attenuationDistance: 1, trail: "notes" },
  necromancer: { roughness: 0.46, metalness: 0.14, clearcoat: 0.22, clearcoatRoughness: 0.4, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0, envMapIntensity: 0.85, bumpScale: 0.02, emissive: "#7dff6a", emissiveIntensity: 0.38, sheen: 0, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.3, accent: "#9dff78", spark: "#b6ff9a", ambient: 0.48, attenuation: "#ffffff", attenuationDistance: 1, trail: "wisp" },
  goblin: { roughness: 0.48, metalness: 0.74, clearcoat: 0.2, clearcoatRoughness: 0.42, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0, envMapIntensity: 1.05, bumpScale: 0.028, emissive: "#3d4320", emissiveIntensity: 0.06, sheen: 0, anisotropy: 0.22, numberStyle: "ink", pips: false, faceMode: "none", inclusion: false, pulse: 0, accent: "#d6e25a", spark: "#d6e25a", ambient: 0.16, attenuation: "#ffffff", attenuationDistance: 1, trail: "spark" },
  wyrm: { roughness: 0.36, metalness: 0.42, clearcoat: 0.48, clearcoatRoughness: 0.28, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0.12, envMapIntensity: 1.2, bumpScale: 0.038, emissive: "#ff9a3a", emissiveIntensity: 0.28, sheen: 0.2, anisotropy: 0, numberStyle: "metal", pips: false, faceMode: "none", inclusion: false, pulse: 0.22, accent: "#ffb15a", spark: "#ffc27a", ambient: 0.4, attenuation: "#ffffff", attenuationDistance: 1, trail: "embers" },
  ghost: { roughness: 0.06, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.08, transmission: 0.9, thickness: 0.55, ior: 1.2, iridescence: 0.35, envMapIntensity: 1.3, bumpScale: 0, emissive: "#e7fff8", emissiveIntensity: 0.32, sheen: 0.45, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.42, accent: "#d8fff6", spark: "#f4fffc", ambient: 0.85, attenuation: "#c8fff4", attenuationDistance: 0.8, trail: "wisp" },
  undead: { roughness: 0.72, metalness: 0.04, clearcoat: 0.06, clearcoatRoughness: 0.6, transmission: 0, thickness: 0, ior: 1.4, iridescence: 0, envMapIntensity: 0.5, bumpScale: 0.022, emissive: "#8fbf7a", emissiveIntensity: 0.14, sheen: 0.22, anisotropy: 0, numberStyle: "engrave", pips: false, faceMode: "none", inclusion: false, pulse: 0.1, accent: "#c8e6b0", spark: "#d5e8c4", ambient: 0.28, attenuation: "#ffffff", attenuationDistance: 1, trail: "wisp" },
  traveller: { roughness: 0.22, metalness: 0.94, clearcoat: 0.4, clearcoatRoughness: 0.22, transmission: 0, thickness: 0, ior: 1.5, iridescence: 0.05, envMapIntensity: 1.4, bumpScale: 0.01, emissive: "#39e7ff", emissiveIntensity: 0.34, sheen: 0, anisotropy: 0.55, numberStyle: "metal", pips: false, faceMode: "none", inclusion: false, pulse: 0.14, accent: "#7af6ff", spark: "#b8fbff", ambient: 0.45, attenuation: "#ffffff", attenuationDistance: 1, trail: "ion" },
  mythos: { roughness: 0.4, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.3, transmission: 0, thickness: 0, ior: 1.45, iridescence: 0.42, envMapIntensity: 0.9, bumpScale: 0.02, emissive: "#c6ff4a", emissiveIntensity: 0.3, sheen: 0.15, anisotropy: 0, numberStyle: "glow", pips: false, faceMode: "none", inclusion: false, pulse: 0.26, accent: "#d8ff6a", spark: "#e4ff8a", ambient: 0.55, attenuation: "#ffffff", attenuationDistance: 1, trail: "wisp" },
};

const GLASS_COLORS = ["#d64558", "#f0c14a", "#3eaf62", "#3d78e0", "#8a4ad4", "#e07a32", "#2aabb8", "#e25b8c"];

export function themeProfile(theme: GildedTheme) {
  return PROFILES[theme];
}

const EXTRA_SPARKS: Partial<Record<GildedTheme, string[]>> = {
  rosewindow: GLASS_COLORS,
  dragonhide: ["#d8c07a", "#ff7a32"],
  magma: ["#ffb15a", "#ff4d16", "#ffd26f"],
  arcane: ["#ffe7a8", "#7ec8ff", "#f0d78c"],
  void: ["#e4c8ff", "#6a2ad4"],
  hero: ["#fff6d0", "#ffe08a", "#ffffff"],
  monster: ["#ff6a4a", "#6a1830"],
  wizard: ["#9fd0ff", "#f0d78c"],
  bard: ["#ffd27a", "#ff8fb8", "#fff6d8"],
  necromancer: ["#b6ff9a", "#3d6b32"],
  goblin: ["#d6e25a", "#8d9348"],
  wyrm: ["#ffb15a", "#ff6a2a", "#ffd27a"],
  ghost: ["#e8fff8", "#9ad7ff"],
  undead: ["#c8e6b0", "#8a9078"],
  traveller: ["#7af6ff", "#e8fbff"],
  mythos: ["#d8ff6a", "#6ecf8a", "#143028"],
};

export function themeSparkColors(theme: GildedTheme) {
  return EXTRA_SPARKS[theme] ?? [PROFILES[theme].spark];
}

const textureCache = new Map<string, { map?: THREE.CanvasTexture; bumpMap?: THREE.CanvasTexture; emissiveMap?: THREE.CanvasTexture }>();
let scratchBump: THREE.CanvasTexture | null = null;
let gemMaterial: THREE.MeshPhysicalMaterial | null = null;
let gemGeo: THREE.SphereGeometry | null = null;
const textureAnisotropy = 4;

function makeTexture(canvas: HTMLCanvasElement, color = false) {
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = textureAnisotropy;
  texture.userData.shared = true;
  return texture;
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function scratchTexture() {
  if (scratchBump) return scratchBump;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  const random = rng(99);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = random() > 0.5 ? "#9a9a9a" : "#6a6a6a";
    ctx.lineWidth = random() > 0.8 ? 1.5 : 0.6;
    ctx.beginPath();
    const x = random() * size;
    const y = random() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 80, y + (random() - 0.5) * 12);
    ctx.stroke();
  }
  scratchBump = makeTexture(canvas);
  return scratchBump;
}

function drawMusicNote(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, ink: string, kind: "quarter" | "eighth") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 8, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(9, -2);
  ctx.lineTo(9, -48);
  ctx.stroke();
  if (kind === "eighth") {
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(9, -48);
    ctx.bezierCurveTo(28, -40, 30, -18, 12, -14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, ink: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(2, 34);
  ctx.bezierCurveTo(-6, 22, -4, 8, 2, 6);
  ctx.bezierCurveTo(14, 2, 16, 22, 2, 26);
  ctx.bezierCurveTo(-16, 32, -22, 4, -4, -16);
  ctx.bezierCurveTo(12, -34, 26, -22, 16, -6);
  ctx.bezierCurveTo(8, 6, -2, 8, 0, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1, 2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintBody(theme: GildedTheme, color: string) {
  const size = 512;
  const albedo = document.createElement("canvas");
  const bump = document.createElement("canvas");
  const glow = document.createElement("canvas");
  albedo.width = albedo.height = bump.width = bump.height = glow.width = glow.height = size;
  const ctx = albedo.getContext("2d")!;
  const btx = bump.getContext("2d")!;
  const gtx = glow.getContext("2d")!;
  const base = new THREE.Color(color);
  const dark = base.clone().offsetHSL(0, 0.04, -0.22);
  const light = base.clone().offsetHSL(0, -0.05, 0.22);
  const seeds: Record<GildedTheme, number> = { aether: 1, reliquary: 2, rosewindow: 3, classic: 11, gilded: 17, emerald: 19, frost: 23, obsidian: 29, dragonhide: 31, bloodstone: 37, bone: 41, leviathan: 43, magma: 47, starfall: 53, arcane: 59, void: 61, hero: 67, monster: 71, wizard: 73, bard: 79, necromancer: 83, goblin: 89, wyrm: 97, ghost: 101, undead: 103, traveller: 107, mythos: 109 };
  const random = rng(seeds[theme]);
  let paintedGlow = false;
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  btx.fillStyle = "#808080";
  btx.fillRect(0, 0, size, size);
  gtx.fillStyle = "#000";
  gtx.fillRect(0, 0, size, size);

  const speck = (count: number, alpha: number, radius: number) => {
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = alpha * (0.35 + random());
      ctx.fillStyle = random() > 0.5 ? "#ffffff" : "#000000";
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, random() * radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  if (theme === "classic" || theme === "emerald") {
    for (let i = 0; i < 28; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = 30 + random() * 90;
      const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
      wash.addColorStop(0, light.getStyle());
      wash.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.globalAlpha = 1;
    speck(50, 0.15, 2.2);
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 4 + random() * 10, random() * 3, random() * 5);
      ctx.stroke();
    }
  } else if (theme === "gilded") {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#fff6d4");
    gradient.addColorStop(0.42, "#f0c45c");
    gradient.addColorStop(0.75, "#d9a441");
    gradient.addColorStop(1, "#ffe9ad");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.18;
    for (let y = 0; y < size; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? "#fff" : "#5a3a10";
      ctx.fillRect(0, y, size, 1);
    }
    ctx.globalAlpha = 1;
    btx.strokeStyle = "#9a9a9a";
    btx.lineWidth = 1;
    for (let y = 0; y < size; y += 3) {
      btx.beginPath();
      btx.moveTo(0, y);
      btx.lineTo(size, y + Math.sin(y) * 2);
      btx.stroke();
    }
  } else if (theme === "dragonhide") {
    const scale = 54;
    for (let row = -1; row < 14; row++) {
      for (let column = -1; column < 14; column++) {
        const x = column * scale + (row % 2 ? scale / 2 : 0);
        const y = row * 40;
        ctx.beginPath();
        ctx.ellipse(x, y + 8, scale * 0.46, scale * 0.34, 0, 0, Math.PI * 2);
        ctx.fillStyle = row % 3 === 0 ? dark.getStyle() : base.getStyle();
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.45)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x - 6, y + 2, scale * 0.18, scale * 0.1, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fill();
        btx.beginPath();
        btx.ellipse(x, y + 8, scale * 0.46, scale * 0.34, 0, 0, Math.PI * 2);
        btx.strokeStyle = "#2a2a2a";
        btx.lineWidth = 6;
        btx.stroke();
      }
    }
  } else if (theme === "starfall" || theme === "void") {
    ctx.fillStyle = theme === "void" ? "#07040e" : "#070b22";
    ctx.fillRect(0, 0, size, size);
    const clouds = theme === "void"
      ? [["#6a2ad4", 80, 120], ["#d45ad4", 300, 220], ["#24104a", 180, 360]]
      : [["#3d78e0", 120, 140], ["#7a3ea8", 340, 200], ["#14205a", 200, 380]];
    clouds.forEach(([cloud, x, y]) => {
      const nebula = ctx.createRadialGradient(Number(x), Number(y), 10, Number(x), Number(y), 180);
      nebula.addColorStop(0, cloud as string);
      nebula.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, size, size);
    });
    ctx.globalAlpha = 1;
    gtx.globalAlpha = 1;
    paintedGlow = true;
    for (let i = 0; i < 260; i++) {
      const x = random() * size;
      const y = random() * size;
      const bright = random() > 0.94;
      const r = bright ? 2.4 : 0.7;
      ctx.fillStyle = random() > 0.8 ? "#fff4d2" : "#eef5ff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (bright) {
        ctx.strokeStyle = "rgba(255,255,255,.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x + 7, y);
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y + 7);
        ctx.stroke();
        gtx.fillStyle = "#fff";
        gtx.beginPath();
        gtx.arc(x, y, 3.5, 0, Math.PI * 2);
        gtx.fill();
      } else if (random() > 0.55) {
        gtx.fillStyle = "#bbb";
        gtx.fillRect(x, y, 1.4, 1.4);
      }
    }
  } else if (theme === "bone") {
    ctx.fillStyle = "#e7d7b4";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 500; i++) {
      const shade = 150 + Math.floor(random() * 80);
      ctx.fillStyle = `rgba(${shade},${Math.floor(shade * 0.9)},${Math.floor(shade * 0.7)},${0.03 + random() * 0.05})`;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 2 + random() * 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(90,62,40,.55)";
    ctx.lineWidth = 1.4;
    btx.strokeStyle = "#3a3a3a";
    btx.lineWidth = 2;
    for (let crack = 0; crack < 20; crack++) {
      let x = random() * size;
      let y = random() * size;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(x, y);
      btx.moveTo(x, y);
      for (let step = 0; step < 6; step++) {
        x += (random() - 0.5) * 36;
        y += 8 + random() * 18;
        ctx.lineTo(x, y);
        btx.lineTo(x, y);
      }
      ctx.stroke();
      btx.stroke();
    }
  } else if (theme === "magma") {
    ctx.fillStyle = "#140c10";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(${20 + random() * 30},${10 + random() * 10},${8},${0.35})`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 10 + random() * 40, 6 + random() * 18, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    for (let vein = 0; vein < 22; vein++) {
      let x = random() * size;
      let y = -10;
      ctx.beginPath();
      gtx.beginPath();
      btx.beginPath();
      ctx.moveTo(x, y);
      gtx.moveTo(x, y);
      btx.moveTo(x, y);
      while (y < size + 20) {
        x += (random() - 0.5) * 40;
        y += 16 + random() * 22;
        ctx.lineTo(x, y);
        gtx.lineTo(x, y);
        btx.lineTo(x, y);
      }
      ctx.strokeStyle = random() > 0.7 ? "#ffd35a" : "#ff4d16";
      ctx.lineWidth = 1.4 + random() * 3.2;
      ctx.shadowColor = "#ff5a1a";
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      gtx.strokeStyle = "#fff";
      gtx.lineWidth = 2 + random() * 2;
      gtx.stroke();
      btx.strokeStyle = "#1a1a1a";
      btx.lineWidth = 5;
      btx.stroke();
    }
  } else if (theme === "leviathan") {
    for (let wave = -2; wave < 18; wave++) {
      ctx.beginPath();
      btx.beginPath();
      for (let x = -10; x <= size + 10; x += 6) {
        const y = wave * 30 + Math.sin(x * 0.035 + wave * 0.7) * 12 + Math.sin(x * 0.01) * 8;
        if (x < 0) {
          ctx.moveTo(x, y);
          btx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
          btx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = wave % 2 ? dark.getStyle() : light.getStyle();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 5;
      ctx.stroke();
      btx.strokeStyle = wave % 2 ? "#555" : "#b0b0b0";
      btx.lineWidth = 6;
      btx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = random() > 0.7 ? "rgba(255,210,230,.7)" : "rgba(210,255,240,.75)";
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 0.6 + random() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === "arcane") {
    ctx.fillStyle = "#12091f";
    ctx.fillRect(0, 0, size, size);
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    const rings = [70, 130, 190, 250];
    rings.forEach((radius) => {
      ctx.beginPath();
      gtx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      gtx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = radius % 2 === 0 ? "#f0d78c" : "#7ec8ff";
      ctx.lineWidth = 3;
      ctx.stroke();
      gtx.strokeStyle = "#fff";
      gtx.lineWidth = 2;
      gtx.stroke();
    });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      gtx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(angle) * 60, size / 2 + Math.sin(angle) * 60);
      gtx.moveTo(size / 2 + Math.cos(angle) * 60, size / 2 + Math.sin(angle) * 60);
      ctx.lineTo(size / 2 + Math.cos(angle) * 250, size / 2 + Math.sin(angle) * 250);
      gtx.lineTo(size / 2 + Math.cos(angle) * 250, size / 2 + Math.sin(angle) * 250);
      ctx.strokeStyle = "rgba(240,215,140,.8)";
      ctx.stroke();
      gtx.stroke();
    }
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2;
      const x = size / 2 + Math.cos(angle) * 160;
      const y = size / 2 + Math.sin(angle) * 160;
      [ctx, gtx].forEach((pen) => {
        pen.save();
        pen.translate(x, y);
        pen.rotate(angle);
        pen.strokeStyle = pen === ctx ? "#f0d78c" : "#ffffff";
        pen.lineWidth = 4;
        pen.beginPath();
        pen.moveTo(0, -16);
        pen.lineTo(0, 16);
        pen.moveTo(-12, -4 + (index % 3) * 4);
        pen.lineTo(12, -4 + (index % 3) * 4);
        if (index % 2 === 0) { pen.moveTo(-8, 10); pen.lineTo(8, 10); }
        pen.stroke();
        pen.restore();
      });
    }
  } else if (theme === "bloodstone") {
    ctx.fillStyle = "#3a0e18";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${40 + random() * 30},8,16,0.45)`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 20 + random() * 50, 12 + random() * 24, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = random() > 0.8 ? "#fff1c2" : "#e1b45a";
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 1 + random() * 2.4, 0.6 + random(), random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === "frost" || theme === "obsidian") {
    ctx.fillStyle = theme === "frost" ? "#e7f6ff" : "#0c0e14";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 36; i++) {
      ctx.beginPath();
      const x = random() * size;
      const y = random() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 80, y + random() * 40);
      ctx.lineTo(x + random() * 40, y + random() * 90);
      ctx.closePath();
      ctx.fillStyle = theme === "frost" ? `rgba(255,255,255,${0.15 + random() * 0.35})` : `rgba(90,100,140,${0.05 + random() * 0.12})`;
      ctx.fill();
    }
    if (theme === "obsidian") {
      paintedGlow = true;
      gtx.fillStyle = "rgba(80,60,140,.9)";
      for (let i = 0; i < 8; i++) {
        gtx.beginPath();
        gtx.arc(random() * size, random() * size, 20 + random() * 40, 0, Math.PI * 2);
        gtx.fill();
      }
    }
  } else if (theme === "hero") {
    const gradient = ctx.createRadialGradient(size * 0.5, size * 0.4, 16, size * 0.5, size * 0.5, size * 0.72);
    gradient.addColorStop(0, "#fffaf0");
    gradient.addColorStop(0.4, "#eef2f6");
    gradient.addColorStop(1, "#b7c0cc");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(196,148,62,.9)";
    ctx.lineWidth = 3;
    for (let ray = 0; ray < 18; ray++) {
      const angle = (ray / 18) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(angle) * 48, size / 2 + Math.sin(angle) * 48);
      ctx.lineTo(size / 2 + Math.cos(angle) * 240, size / 2 + Math.sin(angle) * 240);
      ctx.stroke();
    }
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 86, 0, Math.PI * 2);
    ctx.stroke();
  } else if (theme === "monster") {
    ctx.fillStyle = "#2a0c18";
    ctx.fillRect(0, 0, size, size);
    for (let blot = 0; blot < 70; blot++) {
      ctx.fillStyle = random() > 0.5 ? "#4a1830" : "#14060c";
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 18 + random() * 50, 10 + random() * 24, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,120,90,.55)";
    btx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 2;
    btx.lineWidth = 4;
    for (let claw = 0; claw < 14; claw++) {
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(x, y);
      btx.moveTo(x, y);
      ctx.lineTo(x + 40 + random() * 70, y + (random() - 0.5) * 18);
      btx.lineTo(x + 40 + random() * 70, y + (random() - 0.5) * 18);
      ctx.stroke();
      btx.stroke();
    }
  } else if (theme === "wizard") {
    ctx.fillStyle = "#10182e";
    ctx.fillRect(0, 0, size, size);
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    const stars: [number, number][] = [];
    for (let i = 0; i < 48; i++) stars.push([random() * size, random() * size]);
    ctx.strokeStyle = "rgba(240,215,140,.55)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < stars.length; i += 3) {
      const [x, y] = stars[i];
      const next = stars[(i + 7) % stars.length];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(next[0], next[1]);
      ctx.stroke();
    }
    stars.forEach(([x, y], index) => {
      const bright = index % 5 === 0;
      ctx.fillStyle = bright ? "#f0d78c" : "#d7ecff";
      ctx.beginPath();
      ctx.arc(x, y, bright ? 3.2 : 1.3, 0, Math.PI * 2);
      ctx.fill();
      if (bright) {
        gtx.fillStyle = "#fff";
        gtx.beginPath();
        gtx.arc(x, y, 5, 0, Math.PI * 2);
        gtx.fill();
      }
    });
  } else if (theme === "bard") {
    ctx.fillStyle = "#5c1c34";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 280; i++) {
      const shade = random() > 0.5 ? 255 : 30;
      ctx.fillStyle = `rgba(${shade},${Math.floor(shade * 0.72)},${Math.floor(shade * 0.8)},${0.025 + random() * 0.04})`;
      ctx.fillRect(random() * size, random() * size, 2 + random() * 5, 10 + random() * 16);
    }
    paintedGlow = true;
    const ink = "#f6de9a";
    const staffs = [78, 230, 382];
    staffs.forEach((top, staffIndex) => {
      ctx.strokeStyle = "rgba(246,222,154,.9)";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "butt";
      for (let line = 0; line < 5; line++) {
        const y = top + line * 16;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      drawTrebleClef(ctx, 46, top + 32, 1.15, ink);
      drawTrebleClef(gtx, 46, top + 32, 1.15, "#ffffff");
      for (let step = 0; step < 6; step++) {
        const x = 110 + step * 64;
        const pitch = [0, 16, 8, 24, 8, 16][(step + staffIndex) % 6];
        const kind = step % 3 === 0 ? "quarter" : "eighth";
        drawMusicNote(ctx, x, top + 56 - pitch, 1.05, ink, kind);
        drawMusicNote(gtx, x, top + 56 - pitch, 0.72, "#ffffff", kind);
      }
    });
  } else if (theme === "necromancer") {
    ctx.fillStyle = "#10140e";
    ctx.fillRect(0, 0, size, size);
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    for (let vein = 0; vein < 16; vein++) {
      let x = random() * size;
      let y = random() * size;
      ctx.beginPath();
      gtx.beginPath();
      ctx.moveTo(x, y);
      gtx.moveTo(x, y);
      for (let step = 0; step < 8; step++) {
        x += (random() - 0.5) * 70;
        y += (random() - 0.5) * 70;
        ctx.lineTo(x, y);
        gtx.lineTo(x, y);
      }
      ctx.strokeStyle = "#7dff6a";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      gtx.strokeStyle = "#fff";
      gtx.lineWidth = 2;
      gtx.stroke();
    }
    ctx.fillStyle = "#d9d0b8";
    for (let chip = 0; chip < 18; chip++) {
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 4 + random() * 8, 2 + random() * 3, random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === "goblin") {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, "#8a9358");
    gradient.addColorStop(0.5, "#5c6534");
    gradient.addColorStop(1, "#a3ad68");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(30,34,16,.65)";
    btx.strokeStyle = "#3a3a3a";
    for (let seam = 40; seam < size; seam += 84) {
      ctx.lineWidth = 4;
      btx.lineWidth = 6;
      ctx.beginPath();
      btx.beginPath();
      ctx.moveTo(seam, 0);
      btx.moveTo(seam, 0);
      ctx.lineTo(seam + 12, size);
      btx.lineTo(seam + 12, size);
      ctx.stroke();
      btx.stroke();
    }
    for (let rivet = 0; rivet < 28; rivet++) {
      const x = random() * size;
      const y = random() * size;
      ctx.fillStyle = "#dfe7a4";
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c3118";
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      btx.fillStyle = "#c8c8c8";
      btx.beginPath();
      btx.arc(x, y, 7, 0, Math.PI * 2);
      btx.fill();
    }
  } else if (theme === "wyrm") {
    ctx.fillStyle = "#120e0c";
    ctx.fillRect(0, 0, size, size);
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    const scale = 46;
    for (let row = -1; row < 16; row++) {
      for (let column = -1; column < 16; column++) {
        const x = column * scale + (row % 2 ? scale / 2 : 0);
        const y = row * 34;
        ctx.beginPath();
        ctx.ellipse(x, y, scale * 0.46, scale * 0.32, 0, 0, Math.PI * 2);
        ctx.fillStyle = row % 4 === 0 ? "#3a2a16" : "#1a120e";
        ctx.fill();
        ctx.strokeStyle = "rgba(212,164,74,.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        gtx.strokeStyle = "rgba(255,255,255,.9)";
        gtx.lineWidth = 1.4;
        gtx.beginPath();
        gtx.ellipse(x, y, scale * 0.46, scale * 0.32, 0, 0, Math.PI * 2);
        gtx.stroke();
      }
    }
  } else if (theme === "undead") {
    ctx.fillStyle = "#9aa08a";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 7) {
      ctx.fillStyle = y % 14 === 0 ? "rgba(255,255,240,.18)" : "rgba(40,48,32,.12)";
      ctx.fillRect(0, y, size, 3);
    }
    for (let mold = 0; mold < 40; mold++) {
      ctx.fillStyle = `rgba(70,110,60,${0.15 + random() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 8 + random() * 24, 5 + random() * 12, random(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(40,36,28,.7)";
    ctx.lineWidth = 1.5;
    for (let crack = 0; crack < 12; crack++) {
      let x = random() * size;
      let y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 5; step++) {
        x += (random() - 0.5) * 40;
        y += 10 + random() * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (theme === "traveller") {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, "#d5dee3");
    gradient.addColorStop(0.45, "#8ea0a8");
    gradient.addColorStop(1, "#5c6c74");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    ctx.strokeStyle = "rgba(20,28,32,.55)";
    ctx.lineWidth = 3;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) {
        const x = 28 + column * 124;
        const y = 28 + row * 124;
        ctx.strokeRect(x, y, 96, 78);
        btx.strokeStyle = "#6a6a6a";
        btx.lineWidth = 4;
        btx.strokeRect(x, y, 96, 78);
        if ((row + column) % 2 === 0) {
          ctx.fillStyle = "#39e7ff";
          ctx.fillRect(x + 78, y + 12, 8, 8);
          gtx.fillStyle = "#fff";
          gtx.fillRect(x + 74, y + 8, 16, 16);
        }
      }
    }
  } else if (theme === "mythos") {
    ctx.fillStyle = "#07140f";
    ctx.fillRect(0, 0, size, size);
    gtx.fillStyle = "#000";
    gtx.fillRect(0, 0, size, size);
    paintedGlow = true;
    for (let swirl = 0; swirl < 8; swirl++) {
      ctx.beginPath();
      const cx = random() * size;
      const cy = random() * size;
      for (let step = 0; step < 40; step++) {
        const angle = step * 0.45 + swirl;
        const radius = step * 3.2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.6;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(40,90,60,${0.25 + random() * 0.35})`;
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    for (let eye = 0; eye < 7; eye++) {
      const x = 60 + random() * (size - 120);
      const y = 60 + random() * (size - 120);
      ctx.fillStyle = "#d6ff62";
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 18, random() * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#06110c";
      ctx.beginPath();
      ctx.ellipse(x, y, 2.2, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      gtx.fillStyle = "#fff";
      gtx.beginPath();
      gtx.ellipse(x, y, 5, 14, 0, 0, Math.PI * 2);
      gtx.fill();
    }
  }

  const maps: { map?: THREE.CanvasTexture; bumpMap?: THREE.CanvasTexture; emissiveMap?: THREE.CanvasTexture } = {
    map: makeTexture(albedo, true),
    bumpMap: makeTexture(bump),
  };
  if (paintedGlow) maps.emissiveMap = makeTexture(glow, true);
  return maps;
}

// The theme"s own body: its albedo, bump and glow, made once per colour.
export function gildedMaps(theme: GildedTheme, color: string) {
  const key = `${theme}|${color}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const maps = paintBody(theme, color);
  textureCache.set(key, maps);
  return maps;
}

// The theme"s finish on a shell. maps: Kraken"s own textures for the themes it painted first.
export function applyGilded(material: THREE.MeshPhysicalMaterial, theme: GildedTheme, color: string, kraken?: { map?: THREE.Texture; bumpMap?: THREE.Texture }) {
  const profile = PROFILES[theme];
  material.color.set(profile.transmission > 0 || theme === "gilded" || theme === "reliquary" || theme === "rosewindow" ? color : "#ffffff");
  material.roughness = profile.roughness;
  material.metalness = profile.metalness;
  material.clearcoat = profile.clearcoat;
  material.clearcoatRoughness = profile.clearcoatRoughness;
  material.transmission = profile.transmission;
  material.thickness = profile.thickness;
  material.ior = profile.ior;
  material.iridescence = profile.iridescence;
  material.iridescenceIOR = 1.3;
  material.iridescenceThicknessRange = [120, 420];
  material.envMapIntensity = profile.envMapIntensity;
  material.emissive.set(profile.emissive);
  material.emissiveIntensity = profile.emissiveIntensity;
  material.sheen = profile.sheen;
  material.sheenColor.set(color);
  material.sheenRoughness = 0.45;
  material.anisotropy = profile.anisotropy;
  material.specularIntensity = profile.metalness > 0.5 ? 1 : 0.7;
  material.attenuationColor.set(profile.attenuation);
  material.attenuationDistance = profile.attenuationDistance;
  material.transparent = profile.transmission > 0;
  material.opacity = 1;
  if (theme === "reliquary") {
    material.color.set("#f4f7fb");
    material.bumpMap = scratchTexture();
    material.bumpScale = profile.bumpScale;
  } else if (theme === "rosewindow") {
    material.color.set("#f3e2b0");
  } else if (theme === "gilded") {
    const maps = kraken ?? gildedMaps(theme, color);
    material.map = maps.map ?? null;
    material.bumpMap = maps.bumpMap ?? null;
    material.bumpScale = profile.bumpScale;
    material.color.set("#ffffff");
  } else if (profile.transmission > 0 && theme !== "void") {
    // Kraken's table shows through a transparent layer, not the Gilded Die's dark
    // room: the glass takes more of its own colour so it is not lost.
    const clear = new THREE.Color(theme === "frost" ? "#f5fbff" : theme === "obsidian" ? "#10131c" : theme === "emerald" ? "#d9ffe8" : theme === "ghost" ? "#e7fff8" : "#f7fbff");
    material.color.copy(theme === "frost" || theme === "ghost" || theme === "obsidian" ? clear : new THREE.Color(color).lerp(clear, 0.35));
  } else if (theme !== "aether") {
    const maps = kraken ?? gildedMaps(theme, color);
    material.map = maps.map ?? null;
    material.bumpMap = maps.bumpMap ?? null;
    material.bumpScale = profile.bumpScale;
    material.emissiveMap = (maps as { emissiveMap?: THREE.Texture }).emissiveMap ?? null;
    if (!maps.map) material.color.set(color);
    else
    material.color.set("#ffffff");
  }
  return material;
}

const GLASS_PALETTE = GLASS_COLORS;

export function createInlayMaterial(theme: GildedTheme, color: string, faceIndex: number, economy = false) {
  const profile = PROFILES[theme];
  if (profile.faceMode === "none") return null;
  if (profile.faceMode === "enamel") {
    const primary = new THREE.Color(color);
    const palette = [primary.clone(), new THREE.Color("#141218"), primary.clone().offsetHSL(-0.02, 0.06, -0.12)];
    const material = new THREE.MeshPhysicalMaterial({
      color: palette[faceIndex % palette.length],
      roughness: 0.34,
      metalness: 0.08,
      clearcoat: economy ? 0.28 : 0.72,
      clearcoatRoughness: 0.22,
      envMapIntensity: economy ? 0.85 : 1.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    return material;
  }
  const glass = new THREE.Color(GLASS_PALETTE[faceIndex % GLASS_PALETTE.length]);
  return new THREE.MeshPhysicalMaterial({
    color: glass,
    roughness: 0.08,
    metalness: 0.04,
    clearcoat: economy ? 0.3 : 1,
    clearcoatRoughness: 0.08,
    iridescence: economy ? 0 : 0.65,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [180, 520],
    emissive: glass.clone().multiplyScalar(0.35),
    emissiveIntensity: economy ? 0.12 : 0.28,
    envMapIntensity: economy ? 0.9 : 1.45,
    sheen: economy ? 0 : 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

export function inclusionMaterial(emissive: string, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.06,
    emissive,
    emissiveIntensity: intensity,
    flatShading: true,
    envMapIntensity: 1.15,
  });
}

export function gemGeometry() {
  gemGeo ??= new THREE.SphereGeometry(0.034, 14, 10);
  gemGeo.userData.shared = true;
  return gemGeo;
}

export function getGemMaterial() {
  if (!gemMaterial) {
    gemMaterial = new THREE.MeshPhysicalMaterial({
      color: "#3d6dff",
      emissive: "#1d4bff",
      emissiveIntensity: 0.35,
      roughness: 0.06,
      metalness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.8,
      iridescence: 0.35,
      ior: 1.7,
    });
    gemMaterial.userData.shared = true;
  }
  return gemMaterial;
}

function drawPips(ctx: CanvasRenderingContext2D, value: string, ink: string, large = false) {
  const layouts: Record<string, [number, number][]> = {
    "1": [[0, 0]],
    "2": [[-1, -1], [1, 1]],
    "3": [[-1, -1], [0, 0], [1, 1]],
    "4": [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    "5": [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    "6": [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  const spacing = large ? 68 : 48;
  const radius = large ? 30 : 15;
  const spots = layouts[value] ?? layouts["1"];
  spots.forEach(([x, y]) => {
    const px = 128 + x * spacing;
    const py = 128 + y * spacing;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.beginPath();
    ctx.arc(px + 3, py + 4, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    const dot = ctx.createRadialGradient(px - radius * 0.28, py - radius * 0.32, radius * 0.15, px, py, radius);
    dot.addColorStop(0, "#ffffff");
    dot.addColorStop(0.45, ink);
    dot.addColorStop(1, "#1a100c");
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawNumeral(ctx: CanvasRenderingContext2D, value: string, ink: string, style: NumberStyle) {
  const size = value.length > 2 ? 92 : value.length > 1 ? 118 : 148;
  ctx.font = `700 ${size}px Cinzel, Georgia`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (style === "glow") {
    ctx.shadowColor = ink;
    ctx.shadowBlur = 28;
    ctx.fillStyle = ink;
    ctx.fillText(value, 128, 132);
    ctx.shadowBlur = 12;
    ctx.fillText(value, 128, 132);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fffaf0";
    ctx.fillText(value, 128, 132);
  } else if (style === "engrave") {
    ctx.fillStyle = "rgba(255,244,220,.55)";
    ctx.fillText(value, 126, 129);
    ctx.fillStyle = "#24160f";
    ctx.fillText(value, 129, 134);
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 4;
    ctx.strokeText(value, 129, 134);
  } else if (style === "metal") {
    ctx.lineWidth = value.length > 1 ? 14 : 16;
    ctx.strokeStyle = "rgba(40,18,8,.8)";
    ctx.strokeText(value, 128, 134);
    const gradient = ctx.createLinearGradient(70, 70, 190, 200);
    gradient.addColorStop(0, "#fff8e8");
    gradient.addColorStop(0.45, ink);
    gradient.addColorStop(1, "#7a4a22");
    ctx.fillStyle = gradient;
    ctx.fillText(value, 128, 132);
  } else {
    ctx.lineWidth = value.length > 1 ? 12 : 14;
    ctx.strokeStyle = "rgba(0,0,0,.55)";
    ctx.strokeText(value, 128, 134);
    ctx.fillStyle = ink;
    ctx.fillText(value, 128, 130);
  }
  if ((value === "6" || value === "9") && style !== "glow") {
    ctx.fillStyle = style === "engrave" ? "#24160f" : ink;
    ctx.fillRect(86, 196, 84, 8);
  }
}

// A face"s number in the theme"s lettering (or a d6"s pips).
export function gildedNumber(value: string, ink: string, style: NumberStyle, largePips = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  if (style === "pips" && value.length === 1 && value >= "1" && value <= "6") drawPips(ctx, value, ink, largePips);
  else drawNumeral(ctx, value, ink, style === "pips" ? "ink" : style);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = textureAnisotropy;
  return texture;
}

export function insetFaceGeometry(loop: THREE.Vector3[], normal: THREE.Vector3, center: THREE.Vector3, inset: number, lift: number) {
  const points = loop.map((vertex) => {
    const offset = vertex.clone().sub(center);
    offset.addScaledVector(normal, -offset.dot(normal));
    const length = offset.length();
    if (length < 1e-5) return center.clone().addScaledVector(normal, lift);
    offset.multiplyScalar(Math.max(length * 0.28, length - inset) / length);
    return center.clone().add(offset).addScaledVector(normal, lift);
  });
  const positions: number[] = [];
  for (let i = 1; i < points.length - 1; i++) positions.push(...points[0].toArray(), ...points[i].toArray(), ...points[i + 1].toArray());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function jewelAnchor(kind: string, vertex: THREE.Vector3) {
  if (kind === "d6" || kind === "d100") {
    const box = vertex.clone();
    box.x = Math.sign(box.x) * Math.min(Math.abs(box.x), 0.4);
    box.y = Math.sign(box.y) * Math.min(Math.abs(box.y), 0.4);
    box.z = Math.sign(box.z) * Math.min(Math.abs(box.z), 0.4);
    return box;
  }
  return vertex.clone().multiplyScalar(0.98);
}
export function boundaryLoop(edges: { a: THREE.Vector3; b: THREE.Vector3 }[]) {
  if (!edges.length) return [];
  const neighbors = new Map<THREE.Vector3, THREE.Vector3[]>();
  const link = (a: THREE.Vector3, b: THREE.Vector3) => {
    const list = neighbors.get(a);
    if (list) list.push(b);
    else neighbors.set(a, [b]);
  };
  edges.forEach((edge) => { link(edge.a, edge.b); link(edge.b, edge.a); });
  const start = edges[0].a;
  const loop: THREE.Vector3[] = [start];
  let previous: THREE.Vector3 = start;
  let cursor: THREE.Vector3 | undefined = neighbors.get(start)?.[0];
  for (let guard = 0; guard < edges.length + 2; guard++) {
    if (!cursor || cursor === start) break;
    const point: THREE.Vector3 = cursor;
    loop.push(point);
    const next: THREE.Vector3 | undefined = neighbors.get(point)?.find((vertex) => vertex !== previous);
    previous = point;
    cursor = next;
  }
  return loop;
}

export function crystalGeometry(shape: { vertices: THREE.Vector3[]; faces: number[][] }, color: string) {
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color(color);
  shape.faces.forEach((face, faceIndex) => {
    const verts = face.map((index) => shape.vertices[index]);
    const shade = base.clone().offsetHSL(((faceIndex % 7) - 3) * 0.015, 0.06, ((faceIndex * 13) % 10) / 26 - 0.2);
    const push = (vertex: THREE.Vector3) => {
      positions.push(vertex.x, vertex.y, vertex.z);
      colors.push(shade.r, shade.g, shade.b);
    };
    for (let i = 1; i < verts.length - 1; i++) {
      push(verts[0]);
      push(verts[i]);
      push(verts[i + 1]);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
