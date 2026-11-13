import * as THREE from "three";
import { studioScene } from "./gilded";
import type { DiceLook } from "./diceStore";
import { buildDie, model, type ShapeKind } from "./models";
import { dicePacks } from "./dicePacks";

// The dice in the chat's tray, as FG's: real dice in this seat's set (its
// design, material and lettering), lit and turned to show their highest
// number, drawn once in three.js and kept as pictures until the set changes.

const SIZE = 128;
const KINDS: Record<number, { kind: ShapeKind; face: string }> = {
  4: { kind: "d4", face: "4" },
  6: { kind: "d6", face: "6" },
  8: { kind: "d8", face: "8" },
  10: { kind: "d10", face: "0" },
  12: { kind: "d12", face: "12" },
  20: { kind: "d20", face: "20" },
  100: { kind: "d100tens", face: "00" },
};

const cache = new Map<string, string>();

// Draws each (look, sides) pair, one renderer for them all; pictures already drawn come from the cache.
function render(jobs: { look: DiceLook; sides: number }[]): string[] {
  const keyOf = (job: { look: DiceLook; sides: number }) => `${job.sides}|${JSON.stringify(job.look)}`;
  const missing = jobs.filter((job) => !cache.has(keyOf(job)));
  if (missing.length > 0) {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(SIZE, SIZE, false);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(studioScene(), 0.04).texture;
  scene.environmentIntensity = 1.2;
      scene.add(new THREE.HemisphereLight("#f7e8cf", "#1a1d22", 1.3));
      const key = new THREE.DirectionalLight("#fff1d6", 2.4);
      key.position.set(-2, 3, 4);
      scene.add(key);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
      camera.position.set(0, 0, 5);
      camera.lookAt(0, 0, 0);
      const toCamera = new THREE.Vector3(0, 0, 1);
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.38, 0.42, 0.08));
      for (const job of missing) {
        const { kind, face } = KINDS[job.sides] ?? KINDS[20];
        const { shape, faces } = model(kind);
        const die = buildDie(kind, job.look, shape.values);
        // Its highest number toward the viewer, then turned a little to show it is a solid.
        const index = Math.max(0, shape.values.indexOf(face));
        const facing = new THREE.Quaternion().setFromUnitVectors(faces[index % faces.length].normal.clone().normalize(), toCamera);
        die.quaternion.copy(tilt).multiply(facing);
        // Sized as real dice are, by how far the shell reaches from its middle.
        const shell = (die.children[0] as THREE.Mesh).geometry;
        shell.computeBoundingSphere();
        die.scale.setScalar((job.sides === 6 ? 1.12 : job.sides === 4 ? 1.08 : 1.18) / Math.max(0.2, shell.boundingSphere?.radius ?? 1));
        scene.add(die);
        renderer.render(scene, camera);
        cache.set(keyOf(job), canvas.toDataURL("image/png"));
        scene.remove(die);
      }
      pmrem.dispose();
    } finally {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
  return jobs.map((job) => cache.get(keyOf(job)) ?? "");
}

// The seven dice of the tray, in this look.
export async function renderTray(look: DiceLook): Promise<Record<number, string>> {
  await dicePacks.preload([look]);
  const sides = Object.keys(KINDS).map(Number);
  const pictures = render(sides.map((count) => ({ look, sides: count })));
  return Object.fromEntries(sides.map((count, index) => [count, pictures[index]]));
}

// A d20 of each look, for choosing a set.
export async function renderSets(looks: DiceLook[]): Promise<string[]> {
  await dicePacks.preload(looks);
  return render(looks.map((look) => ({ look, sides: 20 })));
}
