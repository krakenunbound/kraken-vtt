import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ChatLine } from "../session/useSession";
import { diceStore, rolling, SHAPED, tower, type DiceLook, type DiceThrow, type TowerDrop } from "./diceStore";
import { bottomFace, buildDie, model, tensLook, topFace, type ShapeKind } from "./models";
import { playHit } from "./sound";
import { defaultThrow, diceOf, labelsFor, MAX_DICE, simulate, type Die, type Hit } from "./throw";

// 3D dice thrown across the whole table, as FG's. The host has already
// decided each number: every screen simulates its own throw first, then puts
// that number on the face the die comes to rest on, and plays the throw back.
// The chat card shows its result when the dice have landed.

type Throwing = {
  line: ChatLine | null;
  dice: Die[];
  labels: string[][];
  groups: THREE.Group[];
  frames: Float32Array;
  count: number;
  hits: Hit[];
  played: number;
  start: number;
  landed: number;
};
type Flight = { groups: THREE.Group[]; from: THREE.Vector3[]; to: THREE.Vector3; spin: THREE.Vector3[]; start: number };

const FRAME_MS = 1000 / 60;
const HOLD_MS = 2600;
const SHRINK_MS = 380;

function lookOf(line: ChatLine): DiceLook {
  const look = (line.roll as { look?: DiceLook } | undefined)?.look;
  return look && typeof look.body === "string" ? look : diceStore.settings().look;
}

function createEngine(host: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight("#f7e8cf", "#20232a", 1.5));
  const key = new THREE.DirectionalLight("#ffe6bd", 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  // The dice cast their shadows on the map below.
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.38 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  camera.up.set(0, 0, -1);

  let width = 1;
  let depth = 1;
  let unit = 64;
  const resize = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    unit = Math.min(66, Math.max(38, Math.min(w, h) / 17));
    width = w / unit;
    depth = h / unit;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(width / 2, depth / 2 / Math.tan(THREE.MathUtils.degToRad(15)), depth / 2);
    camera.lookAt(width / 2, 0, depth / 2);
    camera.updateProjectionMatrix();
    catcher.scale.set(width, depth, 1);
    catcher.position.set(width / 2, 0, depth / 2);
    key.position.set(width * 0.32, 40, depth * 0.1);
    key.target.position.set(width / 2, 0, depth / 2);
    const reach = Math.max(width, depth) / 2 + 6;
    Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 });
    key.shadow.camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const throws: Throwing[] = [];
  const flights: Flight[] = [];
  let frame = 0;
  const quaternion = new THREE.Quaternion();

  // The dice roll on the desktop: below the menu bar, beside the sidebar.
  const table = () => {
    const rect = document.querySelector(".desktop")?.getBoundingClientRect();
    if (!rect || rect.width < 200 || rect.height < 200) return { left: 0, top: 0, right: width, bottom: depth };
    return { left: rect.left / unit, top: rect.top / unit, right: rect.right / unit, bottom: rect.bottom / unit };
  };

  const removeGroups = (groups: THREE.Group[]) => groups.forEach((group) => scene.remove(group));

  const tick = () => {
    const now = performance.now();
    const volume = diceStore.settings().sound ? diceStore.settings().volume : 0;
    for (let index = throws.length - 1; index >= 0; index--) {
      const item = throws[index];
      const at = Math.min(item.count - 1, Math.floor((now - item.start) / FRAME_MS));
      item.groups.forEach((group, die) => {
        const offset = (at * item.groups.length + die) * 7;
        group.position.set(item.frames[offset], item.frames[offset + 1], item.frames[offset + 2]);
        group.quaternion.copy(quaternion.set(item.frames[offset + 3], item.frames[offset + 4], item.frames[offset + 5], item.frames[offset + 6]));
      });
      while (item.played < item.hits.length && item.hits[item.played].frame <= at) {
        const hit = item.hits[item.played++];
        playHit(hit.strength, hit.onDie, volume);
      }
      if (at >= item.count - 1 && !item.landed) {
        item.landed = now;
        if (item.line) rolling.landed(item.line);
        // What the dice on the table show, read off them as they lie (checks read it).
        host.dataset.landed = item.groups
          .map((group, die) => {
            const kind = item.dice[die].kind;
            const labels = item.labels[die];
            return kind === "d4" ? labels.find((_, face) => face !== bottomFace(kind, group.quaternion)) : labels[topFace(kind, group.quaternion)];
          })
          .join(" ");
      }
      if (item.landed && now - item.landed > HOLD_MS) {
        const left = 1 - (now - item.landed - HOLD_MS) / SHRINK_MS;
        if (left <= 0) {
          removeGroups(item.groups);
          throws.splice(index, 1);
        } else item.groups.forEach((group) => group.scale.setScalar(left));
      }
    }
    for (let index = flights.length - 1; index >= 0; index--) {
      const flight = flights[index];
      const t = Math.min(1, (now - flight.start) / 900);
      flight.groups.forEach((group, die) => {
        group.position.lerpVectors(flight.from[die], flight.to, t * t * (3 - 2 * t));
        group.position.y += Math.sin(Math.PI * t) * 2.5;
        group.rotation.set(flight.spin[die].x * t, flight.spin[die].y * t, flight.spin[die].z * t);
        group.scale.setScalar(t < 0.7 ? 1 : Math.max(0.01, (1 - t) / 0.3));
      });
      if (t >= 1) {
        removeGroups(flight.groups);
        flights.splice(index, 1);
      }
    }
    renderer.render(scene, camera);
    frame = throws.length || flights.length ? requestAnimationFrame(tick) : 0;
    if (!frame) renderer.clear();
  };
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  return {
    throwLine(line: ChatLine) {
      const dice = diceOf(line);
      if (dice.length === 0) {
        rolling.landed(line);
        return;
      }
      const thrown = (line.roll as { throw?: DiceThrow } | undefined)?.throw ?? defaultThrow();
      const result = simulate(dice, thrown, width, depth, table());
      const look = lookOf(line);
      const labels = dice.map((die, index) => labelsFor(die, result.rest[index]));
      const groups = dice.map((die, index) => {
        const group = buildDie(die.kind, die.kind === "d100tens" ? tensLook(look) : look, labels[index]);
        scene.add(group);
        return group;
      });
      throws.push({ line, dice, labels, groups, frames: result.frames, count: result.count, hits: result.hits, played: 0, start: performance.now(), landed: 0 });
      wake();
    },
    // Dice into the tower: they tumble over and drop in; nobody sees them land.
    towerDrop(drop: TowerDrop) {
      const look = diceStore.settings().look;
      const to = new THREE.Vector3(drop.to.x / unit, 0.4, drop.to.y / unit);
      const kinds = drop.sides.flatMap((sides): ShapeKind[] => (sides === 100 ? ["d100tens", "d100"] : SHAPED.has(sides) ? [`d${sides}` as ShapeKind] : [])).slice(0, MAX_DICE);
      if (kinds.length === 0) return;
      const groups = kinds.map((kind) => {
        const group = buildDie(kind, kind === "d100tens" ? tensLook(look) : look, model(kind).shape.values);
        scene.add(group);
        return group;
      });
      const from = groups.map((_, index) => new THREE.Vector3(drop.from.x * width + (index % 3) * 0.9, 1.2, drop.from.y * depth + Math.floor(index / 3) * 0.9));
      const spin = groups.map(() => new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14));
      flights.push({ groups, from, to, spin, start: performance.now() });
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      throws.forEach((item) => {
        removeGroups(item.groups);
        if (item.line) rolling.landed(item.line);
      });
      flights.forEach((flight) => removeGroups(flight.groups));
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}

// The layer over the whole window that the dice roll on. Clicks go through it.
export default function DiceLayer() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let engine: ReturnType<typeof createEngine>;
    try {
      engine = createEngine(element);
    } catch {
      return; // No WebGL: results show at once, as without 3D dice.
    }
    const detach = rolling.attach();
    const drain = () => rolling.take().forEach((line) => engine.throwLine(line));
    drain();
    const stopRolling = rolling.subscribe(drain);
    const stopTower = tower.subscribe((drop) => engine.towerDrop(drop));
    return () => {
      stopRolling();
      stopTower();
      detach();
      engine.dispose();
    };
  }, []);
  return <div className="dice-layer" ref={host} aria-hidden="true" />;
}
