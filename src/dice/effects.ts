import * as THREE from "three";
import type { DiceEffect } from "./diceStore";

// What follows the dice as they roll: sparkles, fire, frost, arcane motes or
// shadow, given off where each die is and as fast as it moves; and the flare
// when a d20 lands on a natural 20 (gold) or a 1 (red). Soft round points,
// glowing ones added to the light, smoke laid over it.

const CAPACITY = 1400;

type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; grow: number; r: number; g: number; b: number; fade: number; twinkle: number; gravity: number; keep?: boolean };

// The Gilded Die's trails (its diceFx): what each leaves behind a moving die.
export const TRAILS = new Set<DiceEffect>(["aura", "wisp", "spark", "embers", "holy", "charge", "notes", "ion"]);
// Its particle sizes are in its own units; this many world units each.
const UNIT = 0.03;

const vertex = `
attribute float size;
attribute vec4 tint;
uniform float scale;
varying vec4 vTint;
void main() {
  vTint = tint;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -view.z;
  gl_Position = projectionMatrix * view;
}`;
const fragment = `
varying vec4 vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vTint.rgb, vTint.a * a);
}`;
// A music note (the Bard's trail): the sprite's own shape, tinted.
const noteFragment = `
uniform sampler2D note;
varying vec4 vTint;
void main() {
  vec4 shape = texture2D(note, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
  if (shape.a < 0.2) discard;
  gl_FragColor = vec4(vTint.rgb, vTint.a * shape.a);
}`;

function noteTexture(eighth: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(46, 104);
  ctx.scale(1.7, 1.7);
  ctx.fillStyle = ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 8, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(9, -2);
  ctx.lineTo(9, -46);
  ctx.stroke();
  if (eighth) {
    ctx.beginPath();
    ctx.moveTo(9, -46);
    ctx.bezierCurveTo(26, -38, 28, -16, 11, -12);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  return texture;
}

function pool(blending: THREE.Blending, note?: THREE.Texture) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("size", new THREE.BufferAttribute(new Float32Array(CAPACITY), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("tint", new THREE.BufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: note ? noteFragment : fragment, uniforms: { scale: { value: 600 }, ...(note ? { note: { value: note } } : {}) }, transparent: true, depthWrite: false, blending });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return { points, geometry, material, particles: [] as Particle[] };
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);

export function createEffects(scene: THREE.Scene) {
  const glow = pool(THREE.AdditiveBlending);
  const smoke = pool(THREE.NormalBlending);
  const quarter = pool(THREE.AdditiveBlending, noteTexture(false));
  const eighth = pool(THREE.AdditiveBlending, noteTexture(true));
  const pools = [glow, smoke, quarter, eighth];
  scene.add(...pools.map((item) => item.points));
  const tint = new THREE.Color();

  function add(into: typeof glow, particle: Particle) {
    if (into.particles.length >= CAPACITY) into.particles.shift();
    into.particles.push(particle);
  }
  const base = (x: number, y: number, z: number): Particle => ({ x, y, z, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 0.2, grow: 0, r: 1, g: 1, b: 1, fade: 1, twinkle: 0, gravity: 0 });
  const rand2 = (spread: number) => (Math.random() - 0.5) * spread;
  // One of the Gilded Die's trail particles (its sizes in its units, its gravity pulling down).
  const spawn = (into: typeof glow, x: number, y: number, z: number, vx: number, vy: number, vz: number, hex: string, life: number, size: number, gravity: number) => {
    tint.set(hex);
    add(into, { ...base(x, y, z), vx, vy, vz, life, size: size * UNIT, r: tint.r, g: tint.g, b: tint.b, gravity: -gravity, keep: true });
  };
  const trail = (style: DiceEffect, x: number, y: number, z: number, back: { x: number; y: number; z: number }, colors: string[]) => {
    const hex = colors[Math.floor(Math.random() * colors.length)] ?? "#ffffff";
    if (style === "ion") {
      for (let step = 0; step < 3; step++) {
        const along = step * 0.16;
        spawn(glow, x + back.x * along, y + back.y * along, z + back.z * along, back.x * 0.25 + rand2(0.06), back.y * 0.08, back.z * 0.25 + rand2(0.06), hex, 0.38 + step * 0.03, 4.2, 0);
      }
    } else if (style === "embers") {
      spawn(glow, x, y, z, rand2(0.4), 0.08 + Math.random() * 0.28, rand2(0.4), hex, 0.62, 5.5, 2.1);
      spawn(glow, x, y + 0.04, z, rand2(0.16), 0.45, rand2(0.16), colors[1] ?? hex, 0.4, 8, 0.15);
    } else if (style === "wisp") {
      spawn(glow, x, y, z, rand2(0.2), 0.18 + Math.random() * 0.28, rand2(0.2), hex, 1.25, 11, -0.18);
    } else if (style === "aura") {
      spawn(glow, x + back.x * 0.05, y + 0.02, z + back.z * 0.05, back.x * 0.1, 0.06, back.z * 0.1, hex, 0.9, 16, 0.02);
    } else if (style === "notes") {
      spawn(Math.random() > 0.45 ? eighth : quarter, x, y, z, rand2(0.22), 0.42 + Math.random() * 0.35, rand2(0.22), hex, 1.35, 9.5 * 1.6, -0.04);
    } else if (style === "holy") {
      spawn(glow, x, y, z, rand2(0.1), 0.42 + Math.random() * 0.2, rand2(0.1), hex, 0.95, 12, -0.1);
      if (colors[1]) spawn(glow, x, y + 0.06, z, 0, 0.72, 0, colors[1], 0.7, 6.5, 0);
    } else if (style === "charge") {
      spawn(glow, x, y, z, rand2(0.7), rand2(0.7), rand2(0.7), hex, 0.28, 7, 0.35);
      spawn(glow, x + back.x * 0.07, y, z + back.z * 0.07, back.x * 0.04, 0.04, back.z * 0.04, hex, 0.72, 18, 0);
    } else {
      spawn(glow, x, y, z, rand2(0.25), 0.15 + Math.random() * 0.35, rand2(0.25), hex, 0.7 + Math.random() * 0.45, 5 + Math.random() * 6, 0.15);
    }
  };

  return {
    // The camera's size on screen, so a point keeps its size in the world.
    setScale(pixelsHigh: number, fov: number) {
      const scale = pixelsHigh / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      for (const item of pools) item.material.uniforms.scale.value = scale;
    },
    // A die moving through x, y, z at speed (world units a frame) gives off its effect.
    // colors: the set's spark colours; v: the die's motion this frame (world units).
    emit(effect: DiceEffect, x: number, y: number, z: number, speed: number, colors: string[] = ["#ffffff"], v = { x: 0, y: 0, z: 0 }) {
      if (effect === "none" || effect === "glow" || speed < 0.012) return;
      if (TRAILS.has(effect)) {
        // One every 0.06 units travelled, as the Gilded Die leaves them.
        // Kraken's dice are small on the screen: big sprites (notes, motes, wisps) further apart.
        const spacing = effect === "notes" ? 0.6 : effect === "holy" || effect === "wisp" || effect === "aura" ? 0.4 : 0.25;
        const count = Math.random() < Math.min(1, speed / spacing) ? 1 : 0;
        const length = Math.hypot(v.x, v.y, v.z) || 1;
        const back = { x: -v.x / length, y: -v.y / length, z: -v.z / length };
        for (let n = 0; n < count; n++) trail(effect, x, y, z, back, colors);
        return;
      }
      const count = Math.min(4, Math.ceil(speed * 18));
      for (let n = 0; n < count; n++) {
        const p = base(x + rand(-0.25, 0.25), y + rand(-0.2, 0.25), z + rand(-0.25, 0.25));
        if (effect === "sparkles") {
          Object.assign(p, { vx: rand(-0.6, 0.6), vy: rand(0, 0.9), vz: rand(-0.6, 0.6), life: rand(0.5, 0.95), size: rand(0.08, 0.2), twinkle: 1, gravity: -0.9 });
          [p.r, p.g, p.b] = Math.random() > 0.35 ? [1, 0.86, 0.48] : [1, 1, 1];
          add(glow, p);
        } else if (effect === "fire") {
          Object.assign(p, { vx: rand(-0.3, 0.3), vy: rand(1.2, 2.4), vz: rand(-0.3, 0.3), life: rand(0.35, 0.7), size: rand(0.28, 0.5), grow: -0.35, r: 1, g: rand(0.55, 0.8), b: 0.18 });
          add(glow, p);
        } else if (effect === "frost") {
          Object.assign(p, { vx: rand(-0.25, 0.25), vy: rand(-0.1, 0.35), vz: rand(-0.25, 0.25), life: rand(0.8, 1.3), size: rand(0.16, 0.34), grow: 0.1, r: 0.72, g: 0.9, b: 1, twinkle: 0.4, gravity: -0.15 });
          add(glow, p);
        } else if (effect === "arcane") {
          const angle = Math.random() * Math.PI * 2;
          Object.assign(p, { vx: Math.cos(angle) * 0.8, vy: rand(0.3, 1), vz: Math.sin(angle) * 0.8, life: rand(0.6, 1), size: rand(0.12, 0.28), twinkle: 0.6 });
          [p.r, p.g, p.b] = Math.random() > 0.5 ? [0.72, 0.42, 1] : [0.32, 0.92, 0.95];
          add(glow, p);
        } else if (effect === "shadow") {
          Object.assign(p, { vx: rand(-0.2, 0.2), vy: rand(0.3, 0.8), vz: rand(-0.2, 0.2), life: rand(0.9, 1.5), size: rand(0.4, 0.7), grow: 0.6, r: 0.1, g: 0.04, b: 0.16, fade: 0.55 });
          add(smoke, p);
        }
      }
    },
    // A die at rest: a ring of its sparks on the table round it (the Gilded Die's settle).
    ring(effect: DiceEffect, x: number, y: number, z: number, colors: string[]) {
      const radius = effect === "ion" ? 0.55 : effect === "holy" || effect === "charge" ? 1.15 : 0.9;
      const rings: [string, number, number][] = [[colors[0], radius, 16]];
      if (effect === "holy" || effect === "charge" || effect === "aura") rings.push([colors[colors.length - 1] ?? colors[0], 0.5, 10]);
      for (const [hex, reach, count] of rings) {
        tint.set(hex);
        for (let n = 0; n < count; n++) {
          const angle = (n / count) * Math.PI * 2;
          add(glow, { ...base(x, y + 0.04, z), vx: Math.cos(angle) * reach, vy: 0.22, vz: Math.sin(angle) * reach, life: 0.55, size: 6.5 * UNIT, r: tint.r, g: tint.g, b: tint.b, gravity: -0.4, keep: true });
        }
      }
    },
    // The highest face up: a burst of the set's sparks.
    burst(x: number, y: number, z: number, colors: string[], count = 26, speed = 2.1) {
      for (let n = 0; n < count; n++) {
        tint.set(colors[n % colors.length]);
        const angle = Math.random() * Math.PI * 2;
        const lift = 0.4 + Math.random() * 1.6;
        add(glow, { ...base(x, y, z), vx: Math.cos(angle) * speed * Math.random(), vy: lift * speed, vz: Math.sin(angle) * speed * Math.random(), life: 0.35 + Math.random() * 0.4, size: (6 + Math.random() * 8) * UNIT, r: tint.r, g: tint.g, b: tint.b, gravity: -3.2, keep: true });
      }
    },
    // A natural 20 (gold) or a 1 (red): a burst where the die lies.
    flare(kind: "high" | "low", x: number, y: number, z: number) {
      const [r, g, b] = kind === "high" ? [1, 0.82, 0.35] : [1, 0.22, 0.16];
      for (let n = 0; n < 140; n++) {
        const angle = Math.random() * Math.PI * 2;
        const lift = Math.random();
        const speed = rand(1.6, 4.2);
        add(glow, { ...base(x, y + 0.3, z), vx: Math.cos(angle) * speed * (1 - lift * 0.5), vy: lift * speed * 0.9, vz: Math.sin(angle) * speed * (1 - lift * 0.5), life: rand(0.6, 1.3), size: rand(0.12, 0.32), r, g, b, twinkle: 0.5, gravity: -2.2 });
      }
      for (let n = 0; n < 3; n++) add(glow, { ...base(x, y + 0.4, z), life: 0.55 + n * 0.12, size: 2.4 + n * 1.2, grow: 3, r, g, b, fade: 0.55 });
    },
    // Moves everything on by dt seconds; says whether anything is still alive.
    update(dt: number) {
      for (const into of pools) {
        const position = into.geometry.getAttribute("position") as THREE.BufferAttribute;
        const size = into.geometry.getAttribute("size") as THREE.BufferAttribute;
        const tint = into.geometry.getAttribute("tint") as THREE.BufferAttribute;
        into.particles = into.particles.filter((p) => (p.age += dt) < p.life);
        into.particles.forEach((p, index) => {
          p.vy += p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.vx *= 0.96;
          p.vz *= 0.96;
          const left = 1 - p.age / p.life;
          const flicker = p.twinkle ? 1 - p.twinkle * 0.5 + p.twinkle * 0.5 * Math.sin(p.age * 40 + index) : 1;
          const fire = p.grow < 0 && !p.keep ? Math.max(0, left) : 1;
          position.setXYZ(index, p.x, p.y, p.z);
          size.setX(index, Math.max(0.01, p.size + p.grow * p.age));
          tint.setXYZW(index, p.r, p.g * (0.55 + 0.45 * fire), p.b * fire, Math.min(1, left * 1.6) * p.fade * flicker);
        });
        into.geometry.setDrawRange(0, into.particles.length);
        position.needsUpdate = size.needsUpdate = tint.needsUpdate = true;
      }
      return pools.some((item) => item.particles.length > 0);
    },
    dispose() {
      scene.remove(...pools.map((item) => item.points));
      for (const into of pools) {
        into.geometry.dispose();
        into.material.uniforms.note?.value?.dispose();
        into.material.dispose();
      }
    },
  };
}
