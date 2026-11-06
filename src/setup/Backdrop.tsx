import { useEffect, useRef, useState } from "react";
import keepNight from "../assets/keep-night.webp";
import greatHall from "../assets/great-hall.webp";
import station from "../assets/backdrops/station.webp";
import outpost from "../assets/backdrops/outpost.webp";
import manor from "../assets/backdrops/manor.webp";
import graveyard from "../assets/backdrops/graveyard.webp";

// The painted scenes behind the start screens, made for Kraken: fantasy,
// science fiction and horror. One is picked at random each time Kraken opens
// (never the same twice running); the dots at the bottom show each in turn.
// Each is brought to life: the painting drifts and leans with the pointer,
// its lights flicker or pulse (at their place in the painting, percent of its
// frame), mist rolls past in its own colour, and particles rise, fall or
// drift: spray and candle dust, snow, ash, the dust of space. Now and then
// lightning, or a slow pulse of light.

type Light = { x: number; y: number; size: number; color: string; kind: "flame" | "moon" | "beacon" };
type Particles = "rise" | "fall" | "drift";
export type Theme = {
  id: string;
  name: string;
  genre: "Fantasy" | "Science fiction" | "Horror";
  image: string;
  lights: Light[];
  motes: string[];
  particles: Particles;
  count: number;
  mist: string;
  mistOpacity: number;
  flash: { kind: "lightning" | "pulse"; x: number; y: number; color: string } | null;
  shade: "left" | "centre";
};

export const THEMES: Theme[] = [
  {
    id: "keep",
    name: "The Keep by the Sea",
    genre: "Fantasy",
    image: keepNight,
    lights: [
      { x: 69.3, y: 16.4, size: 9, color: "255, 178, 84", kind: "flame" },
      { x: 75.2, y: 36.8, size: 6, color: "255, 160, 70", kind: "flame" },
      { x: 43.3, y: 18.1, size: 22, color: "200, 230, 235", kind: "moon" },
    ],
    motes: ["150, 225, 230", "120, 200, 215", "255, 196, 120"],
    particles: "rise",
    count: 70,
    mist: "170, 210, 220",
    mistOpacity: 1,
    flash: { kind: "lightning", x: 24, y: 18, color: "190, 225, 255" },
    shade: "left",
  },
  {
    id: "hall",
    name: "The Great Hall",
    genre: "Fantasy",
    image: greatHall,
    lights: [
      { x: 63.1, y: 27.6, size: 13, color: "255, 176, 80", kind: "flame" },
      { x: 59.6, y: 33.2, size: 7, color: "255, 170, 76", kind: "flame" },
      { x: 66.8, y: 33.6, size: 7, color: "255, 170, 76", kind: "flame" },
      { x: 31.8, y: 18, size: 16, color: "150, 220, 225", kind: "moon" },
    ],
    motes: ["255, 200, 130", "255, 170, 90", "255, 225, 170"],
    particles: "rise",
    count: 70,
    mist: "170, 210, 220",
    mistOpacity: 0.35,
    flash: null,
    shade: "centre",
  },
  {
    id: "station",
    name: "Ring Station",
    genre: "Science fiction",
    image: station,
    lights: [
      { x: 51, y: 57, size: 7, color: "90, 140, 255", kind: "beacon" },
      { x: 55.5, y: 57.5, size: 7, color: "90, 140, 255", kind: "beacon" },
      { x: 87, y: 26, size: 6, color: "255, 190, 110", kind: "flame" },
      { x: 89, y: 52, size: 6, color: "255, 190, 110", kind: "flame" },
      { x: 18, y: 75, size: 30, color: "120, 220, 210", kind: "moon" },
    ],
    motes: ["200, 220, 255", "150, 190, 255", "255, 255, 255"],
    particles: "drift",
    count: 90,
    mist: "120, 90, 200",
    mistOpacity: 0.25,
    flash: { kind: "pulse", x: 40, y: 22, color: "160, 120, 255" },
    shade: "left",
  },
  {
    id: "outpost",
    name: "Ice Moon Outpost",
    genre: "Science fiction",
    image: outpost,
    lights: [
      { x: 78, y: 72, size: 9, color: "255, 190, 100", kind: "flame" },
      { x: 76.5, y: 52, size: 5, color: "255, 170, 80", kind: "beacon" },
      { x: 36, y: 73, size: 8, color: "110, 160, 255", kind: "beacon" },
      { x: 48.5, y: 77, size: 3, color: "255, 60, 50", kind: "beacon" },
      { x: 59.5, y: 72, size: 3, color: "255, 60, 50", kind: "beacon" },
      { x: 22, y: 29, size: 34, color: "140, 200, 255", kind: "moon" },
    ],
    motes: ["235, 245, 255", "210, 230, 255", "255, 255, 255"],
    particles: "fall",
    count: 120,
    mist: "200, 225, 255",
    mistOpacity: 0.55,
    flash: { kind: "pulse", x: 52, y: 15, color: "80, 255, 190" },
    shade: "left",
  },
  {
    id: "manor",
    name: "Hollow Manor",
    genre: "Horror",
    image: manor,
    lights: [
      { x: 20.8, y: 18, size: 18, color: "255, 60, 50", kind: "moon" },
      { x: 59.5, y: 35, size: 4, color: "255, 220, 90", kind: "flame" },
      { x: 59, y: 50, size: 5, color: "255, 220, 90", kind: "flame" },
    ],
    motes: ["150, 140, 140", "120, 110, 110", "180, 60, 50"],
    particles: "fall",
    count: 50,
    mist: "190, 190, 200",
    mistOpacity: 1.4,
    flash: { kind: "lightning", x: 70, y: 12, color: "220, 220, 255" },
    shade: "left",
  },
  {
    id: "graveyard",
    name: "The Drowned Graveyard",
    genre: "Horror",
    image: graveyard,
    lights: [
      { x: 22, y: 48, size: 9, color: "80, 255, 120", kind: "flame" },
      { x: 76, y: 48, size: 7, color: "255, 220, 140", kind: "flame" },
      { x: 38.5, y: 19, size: 16, color: "220, 230, 230", kind: "moon" },
    ],
    motes: ["150, 255, 170", "200, 230, 210", "120, 200, 140"],
    particles: "rise",
    count: 40,
    mist: "200, 215, 210",
    mistOpacity: 1.8,
    flash: { kind: "lightning", x: 60, y: 14, color: "200, 255, 220" },
    shade: "centre",
  },
];

const still = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// A theme picked at random when Kraken opens, never the last one shown.
export function randomTheme(): number {
  let last = -1;
  try {
    last = Number(window.localStorage.getItem("kraken-backdrop") ?? -1);
  } catch {
    /* no memory */
  }
  const choices = THEMES.map((_, index) => index).filter((index) => index !== last);
  const pick = choices[Math.floor(Math.random() * choices.length)] ?? 0;
  try {
    window.localStorage.setItem("kraken-backdrop", String(pick));
  } catch {
    /* no memory */
  }
  return pick;
}

// Particles: spray and candle dust rising, snow and ash falling, space dust drifting.
function useMotes(canvas: React.RefObject<HTMLCanvasElement | null>, theme: Theme) {
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || still()) return;
    const { motes: colors, particles, count } = theme;
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
      x: particles === "drift" && !anywhere ? -10 : Math.random() * width,
      y: anywhere || particles === "drift" ? Math.random() * height : particles === "fall" ? -10 : height + 10,
      r: particles === "drift" ? 0.4 + Math.random() * 1.2 : 0.6 + Math.random() * 1.8,
      speed: particles === "fall" ? 14 + Math.random() * 30 : particles === "drift" ? 4 + Math.random() * 10 : 6 + Math.random() * 16,
      sway: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.35 + Math.random() * 0.65,
    });
    const motes = Array.from({ length: count }, () => spawn(true));
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      context.clearRect(0, 0, width, height);
      for (let index = 0; index < motes.length; index++) {
        const mote = motes[index];
        mote.sway += dt * 0.8;
        if (particles === "rise") mote.y -= mote.speed * dt;
        else if (particles === "fall") mote.y += mote.speed * dt;
        else mote.x += mote.speed * dt;
        const x = mote.x + (particles === "drift" ? 0 : Math.sin(mote.sway) * 14);
        const y = particles === "drift" ? mote.y + Math.sin(mote.sway) * 4 : mote.y;
        if (mote.y < -10 || mote.y > height + 12 || mote.x > width + 12) motes[index] = spawn(false);
        const fade = (particles === "rise" ? Math.min(1, mote.y / (height * 0.35)) : particles === "fall" ? Math.min(1, (height - mote.y) / (height * 0.3)) : 0.5 + 0.5 * Math.sin(mote.sway * 2)) * mote.life;
        const glow = context.createRadialGradient(x, y, 0, x, y, mote.r * 4);
        glow.addColorStop(0, `rgba(${mote.color}, ${0.85 * Math.max(0, fade)})`);
        glow.addColorStop(1, `rgba(${mote.color}, 0)`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, mote.r * 4, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [canvas, theme]);
}

export function Backdrop({ theme: index }: { theme: number }) {
  const theme = THEMES[index] ?? THEMES[0];
  const { image, lights, flash } = theme;
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useMotes(canvas, theme);

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

  // Now and then, lightning far off (or a slow pulse of light, out in space).
  useEffect(() => {
    const element = root.current;
    if (!element || !flash || still()) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        element.classList.remove("flash");
        void element.offsetWidth;
        element.classList.add("flash");
        next();
      }, (flash.kind === "pulse" ? 7000 : 9000) + Math.random() * 16000);
    };
    next();
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <div
      className={`backdrop backdrop-${theme.id} shade-${theme.shade}`}
      ref={root}
      aria-hidden="true"
      data-backdrop={theme.id}
      style={{ ["--mist" as string]: theme.mist, ["--mist-opacity" as string]: theme.mistOpacity, ...(flash ? { ["--flash" as string]: flash.color, ["--flash-x" as string]: `${flash.x}%`, ["--flash-y" as string]: `${flash.y}%` } : {}) }}
    >
      <div className="backdrop-frame" key={theme.id}>
        <img className="backdrop-art" src={image} alt="" draggable={false} />
        {lights.map((light, index) => (
          <span
            key={index}
            className={`backdrop-light ${light.kind}`}
            style={{ left: `${light.x}%`, top: `${light.y}%`, width: `${light.size}%`, ["--glow" as string]: light.color, animationDelay: `${-index * 0.7}s` }}
          />
        ))}
        <span className={`backdrop-lightning ${flash?.kind ?? ""}`} />
      </div>
      <div className="backdrop-mist one" />
      <div className="backdrop-mist two" />
      <canvas className="backdrop-motes" ref={canvas} />
      <div className="backdrop-shade" />
    </div>
  );
}

// The dots at the bottom: one for each scene; the current one lit.
export function BackdropDots({ theme, onPick }: { theme: number; onPick: (index: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <nav className="backdrop-dots" aria-label="Backgrounds">
      {THEMES.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={index === theme ? "backdrop-dot on" : "backdrop-dot"}
          aria-label={`${item.name} (${item.genre})`}
          aria-current={index === theme}
          data-backdrop-dot={item.id}
          onClick={() => onPick(index)}
          onMouseEnter={() => setHover(index)}
          onMouseLeave={() => setHover(null)}
        />
      ))}
      <span className="backdrop-dot-name">{THEMES[hover ?? theme].name} · {THEMES[hover ?? theme].genre}</span>
    </nav>
  );
}
