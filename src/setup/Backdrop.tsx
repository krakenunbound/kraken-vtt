import { useEffect, useRef } from "react";
import keepNight from "../assets/keep-night.webp";
import greatHall from "../assets/great-hall.webp";

// The painted scenes behind the campaign and join screens, made for Kraken
// in Kraken Art. Each is brought to life: the painting drifts and leans with
// the pointer, its lanterns and candles flicker, mist rolls past and motes
// rise. Lights sit at their place in the painting (percent of its frame).

type Light = { x: number; y: number; size: number; color: string; kind: "flame" | "moon" };
type Scene = { image: string; lights: Light[]; motes: string[]; flashes: boolean };

const SCENES: Record<"keep" | "hall", Scene> = {
  keep: {
    image: keepNight,
    lights: [
      { x: 69.3, y: 16.4, size: 9, color: "255, 178, 84", kind: "flame" },
      { x: 75.2, y: 36.8, size: 6, color: "255, 160, 70", kind: "flame" },
      { x: 43.3, y: 18.1, size: 22, color: "200, 230, 235", kind: "moon" },
    ],
    motes: ["150, 225, 230", "120, 200, 215", "255, 196, 120"],
    flashes: true,
  },
  hall: {
    image: greatHall,
    lights: [
      { x: 63.1, y: 27.6, size: 13, color: "255, 176, 80", kind: "flame" },
      { x: 59.6, y: 33.2, size: 7, color: "255, 170, 76", kind: "flame" },
      { x: 66.8, y: 33.6, size: 7, color: "255, 170, 76", kind: "flame" },
      { x: 31.8, y: 18, size: 16, color: "150, 220, 225", kind: "moon" },
    ],
    motes: ["255, 200, 130", "255, 170, 90", "255, 225, 170"],
    flashes: false,
  },
};

const still = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Motes of spray or candle dust, drifting up and swaying.
function useMotes(canvas: React.RefObject<HTMLCanvasElement | null>, colors: string[]) {
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || still()) return;
    let width = 0;
    let height = 0;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      width = element.clientWidth;
      height = element.clientHeight;
      element.width = width * ratio;
      element.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const spawn = (anywhere: boolean) => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      r: 0.6 + Math.random() * 1.8,
      speed: 6 + Math.random() * 16,
      sway: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.35 + Math.random() * 0.65,
    });
    const motes = Array.from({ length: 70 }, () => spawn(true));
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      context.clearRect(0, 0, width, height);
      for (let index = 0; index < motes.length; index++) {
        const mote = motes[index];
        mote.y -= mote.speed * dt;
        mote.sway += dt * 0.8;
        const x = mote.x + Math.sin(mote.sway) * 14;
        if (mote.y < -10) motes[index] = spawn(false);
        const fade = Math.min(1, mote.y / (height * 0.35)) * mote.life;
        const glow = context.createRadialGradient(x, mote.y, 0, x, mote.y, mote.r * 4);
        glow.addColorStop(0, `rgba(${mote.color}, ${0.85 * fade})`);
        glow.addColorStop(1, `rgba(${mote.color}, 0)`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, mote.y, mote.r * 4, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [canvas, colors]);
}

export function Backdrop({ scene }: { scene: "keep" | "hall" }) {
  const { image, lights, motes, flashes } = SCENES[scene];
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useMotes(canvas, motes);

  // The painting leans a little toward the pointer.
  useEffect(() => {
    const element = root.current;
    if (!element || still()) return;
    const lean = (event: PointerEvent) => {
      element.style.setProperty("--lean-x", String(event.clientX / window.innerWidth - 0.5));
      element.style.setProperty("--lean-y", String(event.clientY / window.innerHeight - 0.5));
    };
    window.addEventListener("pointermove", lean);
    return () => window.removeEventListener("pointermove", lean);
  }, []);

  // Now and then, lightning far out in the storm.
  useEffect(() => {
    const element = root.current;
    if (!element || !flashes || still()) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        element.classList.remove("flash");
        void element.offsetWidth;
        element.classList.add("flash");
        next();
      }, 9000 + Math.random() * 16000);
    };
    next();
    return () => window.clearTimeout(timer);
  }, [flashes]);

  return (
    <div className={`backdrop backdrop-${scene}`} ref={root} aria-hidden="true">
      <div className="backdrop-frame">
        <img className="backdrop-art" src={image} alt="" draggable={false} />
        {lights.map((light, index) => (
          <span
            key={index}
            className={`backdrop-light ${light.kind}`}
            style={{ left: `${light.x}%`, top: `${light.y}%`, width: `${light.size}%`, ["--glow" as string]: light.color, animationDelay: `${-index * 0.7}s` }}
          />
        ))}
        <span className="backdrop-lightning" />
      </div>
      <div className="backdrop-mist one" />
      <div className="backdrop-mist two" />
      <canvas className="backdrop-motes" ref={canvas} />
      <div className="backdrop-shade" />
    </div>
  );
}
