import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { DiceLook } from "./diceStore";
import { createEffects } from "./effects";
import { buildDie, model } from "./models";

// The dice settings' preview: a d20 in the chosen look, tumbling on a small
// loop so its effect trails behind it; now and then it lands on a 20 and
// flares, as a natural 20 does on the table.
export default function DicePreview({ look }: { look: DiceLook }) {
  const host = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  const rebuild = useRef<() => void>(() => undefined);
  lookRef.current = look;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight("#f7e8cf", "#20232a", 1.4));
    const key = new THREE.DirectionalLight("#ffe6bd", 2.2);
    key.position.set(2, 5, 3);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 2.2, 4.4);
    camera.lookAt(0, 0.1, 0);
    const effects = createEffects(scene);

    let die: THREE.Group | null = null;
    rebuild.current = () => {
      if (die) scene.remove(die);
      die = buildDie("d20", lookRef.current, model("d20").shape.values);
      die.scale.setScalar(1.25);
      scene.add(die);
    };
    rebuild.current();

    const resize = () => {
      const size = Math.max(80, element.clientWidth);
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      effects.setScale(size * renderer.getPixelRatio(), camera.fov);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    const last = new THREE.Vector3();
    let frame = 0;
    let previous = performance.now();
    let flaredAt = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const t = now / 1000;
      if (die) {
        die.position.set(Math.cos(t * 1.4) * 0.75, 0.15 + Math.abs(Math.sin(t * 2.8)) * 0.25, Math.sin(t * 1.4) * 0.45);
        die.rotation.set(t * 1.9, t * 1.3, t * 0.7);
        effects.emit(lookRef.current.effect, die.position.x, die.position.y, die.position.z, die.position.distanceTo(last) * 1.6);
        last.copy(die.position);
        if (lookRef.current.crit !== false && now - flaredAt > 6000) {
          flaredAt = now;
          effects.flare("high", die.position.x, die.position.y - 0.2, die.position.z);
        }
      }
      effects.update(dt);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      effects.dispose();
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    rebuild.current();
  }, [look.theme, look.body, look.ink, look.accent, look.material, look.effect, look.font]);

  return <div className="dice-preview" ref={host} aria-hidden="true" />;
}
