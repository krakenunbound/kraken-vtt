import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { WeatherType } from "./weatherTypes";

export type { WeatherType };

type Camera = { x: number; y: number; scale: number };

// How each kind of weather is made: falling particles, a moving haze, or both.
const KINDS: Record<Exclude<WeatherType, "none">, { count: number; speed: number; size: number; color: string; streak: boolean; rise?: boolean; haze?: [number, number, number, number]; caustic?: boolean; flash?: boolean; spin?: boolean }> = {
  rain: { count: 900, speed: 900, size: 1.4, color: "#a9c8ff", streak: true },
  storm: { count: 1800, speed: 1300, size: 1.6, color: "#b8d0ff", streak: true, haze: [0.08, 0.09, 0.12, 0.25], flash: true },
  snow: { count: 700, speed: 60, size: 4, color: "#ffffff", streak: false },
  blizzard: { count: 1800, speed: 260, size: 3.4, color: "#f4f8ff", streak: false, haze: [0.9, 0.93, 0.97, 0.28] },
  fog: { count: 0, speed: 0, size: 0, color: "#fff", streak: false, haze: [0.82, 0.84, 0.88, 0.55] },
  clouds: { count: 0, speed: 0, size: 0, color: "#000", streak: false, haze: [0.0, 0.0, 0.02, -0.45] },
  sandstorm: { count: 1400, speed: 700, size: 2, color: "#d9b27a", streak: true, haze: [0.74, 0.56, 0.32, 0.5] },
  embers: { count: 260, speed: 70, size: 3.2, color: "#ff8a2b", streak: false, rise: true },
  ash: { count: 500, speed: 45, size: 2.6, color: "#8d8a86", streak: false },
  leaves: { count: 120, speed: 80, size: 7, color: "#b9862f", streak: false, spin: true },
  water: { count: 0, speed: 0, size: 0, color: "#fff", streak: false, caustic: true },
};

const HAZE_SHADER = `
  precision highp float;
  uniform vec2 uResolution;
  uniform vec3 uCamera;
  uniform float uTime;
  uniform vec2 uWind;
  uniform vec4 uColor;
  uniform float uIntensity;
  uniform float uCaustic;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 screen = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    vec2 world = (screen - uCamera.xy) / uCamera.z;
    if (uCaustic > 0.5) {
      vec2 p = world / 90.0;
      float t = uTime * 0.6;
      float c = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        c += abs(sin(p.x * (1.3 + fi * 0.4) + t + sin(p.y * 1.7 + t * 0.7 + fi)) * sin(p.y * (1.1 + fi * 0.3) - t * 0.8));
      }
      c = pow(c / 3.0, 3.0);
      gl_FragColor = vec4(0.65, 0.85, 1.0, c * 0.45 * uIntensity);
      return;
    }
    vec2 p = world / 520.0 - uWind * uTime * 0.03;
    float n = fbm(p + fbm(p * 0.7 + uTime * 0.01));
    float density = smoothstep(0.35, 0.85, n) * uIntensity;
    if (uColor.a < 0.0) {
      gl_FragColor = vec4(uColor.rgb, density * -uColor.a);
    } else {
      gl_FragColor = vec4(uColor.rgb, density * uColor.a);
    }
  }
`;

// Weather over the map (three.js). Particles fall in screen space with the
// wind; haze, cloud shadows and water are anchored to the map, so they move
// when the view is panned or zoomed.
export function Weather({ type, intensity, direction, camera, amount = 1, speed = 0.5, clip }: { type: WeatherType; intensity: number; direction: number; camera: Camera; amount?: number; speed?: number; clip?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    const element = host.current;
    if (!element || type === "none") return;
    const kind = KINDS[type];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false });
    } catch {
      return; // No WebGL: the map works without weather.
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const view = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    let width = 1;
    let height = 1;
    const resize = () => {
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      view.right = width;
      view.bottom = height;
      view.updateProjectionMatrix();
      hazeUniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
    };

    const angle = (direction * Math.PI) / 180;
    const wind = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const hazeUniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCamera: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uWind: { value: wind.clone() },
      uColor: { value: new THREE.Vector4(...(kind.haze ?? [0, 0, 0, 0])) },
      uIntensity: { value: 0.35 + intensity * 0.65 },
      uCaustic: { value: kind.caustic ? 1 : 0 },
    };
    const disposables: { dispose: () => void }[] = [];
    if (kind.haze || kind.caustic) {
      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        uniforms: hazeUniforms,
        vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: HAZE_SHADER,
        transparent: true,
        depthTest: false,
        blending: kind.caustic ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const quad = new THREE.Mesh(geometry, material);
      quad.frustumCulled = false;
      quad.renderOrder = 0;
      scene.add(quad);
      disposables.push(geometry, material);
    }
    resize();

    // Particles: positions in screen pixels, each with its own speed and sway.
    // FG's Amount scales how many; Speed from a quarter to twice as fast.
    const count = Math.round(kind.count * (0.25 + intensity * 0.75) * Math.max(0.05, amount));
    const pace = 0.25 + speed * 1.75 * (0.5 / 0.5875);
    const positions = new Float32Array(count * (kind.streak ? 6 : 3));
    const seeds = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      seeds[index * 3] = Math.random() * width;
      seeds[index * 3 + 1] = Math.random() * height;
      seeds[index * 3 + 2] = 0.6 + Math.random() * 0.8;
    }
    let particles: THREE.Object3D | null = null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    disposables.push(geometry);
    if (count > 0) {
      const color = new THREE.Color(kind.color);
      if (kind.streak) {
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 + intensity * 0.3 });
        particles = new THREE.LineSegments(geometry, material);
        disposables.push(material);
      } else {
        const material = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: color }, uSize: { value: kind.size * renderer.getPixelRatio() }, uLeaf: { value: kind.spin ? 1 : 0 } },
          vertexShader: "uniform float uSize; void main() { gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: `uniform vec3 uColor; uniform float uLeaf; void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = uLeaf > 0.5 ? length(c * vec2(1.0, 2.2)) : length(c);
            float a = smoothstep(0.5, 0.15, d);
            gl_FragColor = vec4(uColor, a * 0.85);
          }`,
          transparent: true,
          depthTest: false,
          blending: type === "embers" ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        particles = new THREE.Points(geometry, material);
        disposables.push(material);
      }
      particles.frustumCulled = false;
      particles.renderOrder = 1;
      scene.add(particles);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    let frame = 0;
    let last = performance.now();
    let flash = 0;
    const start = last;
    const fall = type === "embers" ? -1 : 1;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      const cam = cameraRef.current;
      hazeUniforms.uTime.value = t;
      hazeUniforms.uCamera.value.set(cam.x * renderer.getPixelRatio(), cam.y * renderer.getPixelRatio(), cam.scale * renderer.getPixelRatio());
      // Falling things drift with the wind; rain and sand are driven hard by it.
      const drift = kind.streak ? 0.45 : 0.25;
      for (let index = 0; index < count; index += 1) {
        const s = seeds[index * 3 + 2];
        const sway = kind.streak ? 0 : Math.sin(t * 1.3 + index) * 12 * dt;
        let x = seeds[index * 3] + (wind.x * kind.speed * pace * drift * s + sway * 40) * dt;
        let y = seeds[index * 3 + 1] + (fall * kind.speed * pace * s + wind.y * kind.speed * pace * drift * s) * dt;
        if (y > height + 20) y -= height + 40;
        if (y < -20) y += height + 40;
        if (x > width + 20) x -= width + 40;
        if (x < -20) x += width + 40;
        seeds[index * 3] = x;
        seeds[index * 3 + 1] = y;
        if (kind.streak) {
          const length = 0.018 * kind.speed * s;
          positions.set([x, y, 0, x - wind.x * length * drift, y - length, 0], index * 6);
        } else {
          positions.set([x, y, 0], index * 3);
        }
      }
      geometry.attributes.position.needsUpdate = true;
      if (kind.flash) {
        if (flash <= 0 && Math.random() < dt * 0.08 * (0.5 + intensity)) flash = 0.35;
        flash = Math.max(0, flash - dt);
        element.style.backgroundColor = flash > 0 ? `rgba(220, 230, 255, ${Math.min(0.45, flash * 1.4)})` : "transparent";
      }
      renderer.render(scene, view);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.style.backgroundColor = "transparent";
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [type, intensity, direction, amount, speed]);

  if (type === "none") return null;
  return <div className="weather" ref={host} data-weather={type} aria-hidden="true" style={clip ? { clipPath: clip } : undefined} />;
}
