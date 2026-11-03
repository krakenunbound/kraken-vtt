import * as THREE from "three";
import type { DiceEffect } from "./diceStore";

// What follows the dice as they roll: sparkles, fire, frost, arcane motes or
// shadow, given off where each die is and as fast as it moves; and the flare
// when a d20 lands on a natural 20 (gold) or a 1 (red). Soft round points,
// glowing ones added to the light, smoke laid over it.

const CAPACITY = 1400;

type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; grow: number; r: number; g: number; b: number; fade: number; twinkle: number; gravity: number };

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

function pool(blending: THREE.Blending) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("size", new THREE.BufferAttribute(new Float32Array(CAPACITY), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("tint", new THREE.BufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false, blending });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return { points, geometry, material, particles: [] as Particle[] };
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);

export function createEffects(scene: THREE.Scene) {
  const glow = pool(THREE.AdditiveBlending);
  const smoke = pool(THREE.NormalBlending);
  scene.add(glow.points, smoke.points);

  function add(into: typeof glow, particle: Particle) {
    if (into.particles.length >= CAPACITY) into.particles.shift();
    into.particles.push(particle);
  }
  const base = (x: number, y: number, z: number): Particle => ({ x, y, z, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 0.2, grow: 0, r: 1, g: 1, b: 1, fade: 1, twinkle: 0, gravity: 0 });

  return {
    // The camera's size on screen, so a point keeps its size in the world.
    setScale(pixelsHigh: number, fov: number) {
      const scale = pixelsHigh / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      glow.material.uniforms.scale.value = scale;
      smoke.material.uniforms.scale.value = scale;
    },
    // A die moving through x, y, z at speed (world units a frame) gives off its effect.
    emit(effect: DiceEffect, x: number, y: number, z: number, speed: number) {
      if (effect === "none" || effect === "glow" || speed < 0.012) return;
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
      for (const into of [glow, smoke]) {
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
          const fire = p.grow < 0 ? Math.max(0, left) : 1;
          position.setXYZ(index, p.x, p.y, p.z);
          size.setX(index, Math.max(0.01, p.size + p.grow * p.age));
          tint.setXYZW(index, p.r, p.g * (0.55 + 0.45 * fire), p.b * fire, Math.min(1, left * 1.6) * p.fade * flicker);
        });
        into.geometry.setDrawRange(0, into.particles.length);
        position.needsUpdate = size.needsUpdate = tint.needsUpdate = true;
      }
      return glow.particles.length + smoke.particles.length > 0;
    },
    dispose() {
      scene.remove(glow.points, smoke.points);
      for (const into of [glow, smoke]) {
        into.geometry.dispose();
        into.material.dispose();
      }
    },
  };
}
