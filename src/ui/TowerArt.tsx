// The dice tower, drawn as a little stone tower in three-quarter view (a lit
// front, a darker side, a top with crenels, a window slit and an arched door).
// Off, it stands dark and still; on, its door glows and dice tumble down
// inside it, from the slit to the door, over and over.
export function TowerArt({ on, size = 72 }: { on: boolean; size?: number }) {
  return (
    <svg className={on ? "tower-art on" : "tower-art"} viewBox="0 0 64 80" width={size} height={size * 1.25} aria-hidden="true">
      <defs>
        <linearGradient id="tower-front" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7d828c" />
          <stop offset="1" stopColor="#4a4e57" />
        </linearGradient>
        <linearGradient id="tower-side" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#30333a" />
          <stop offset="1" stopColor="#1c1e23" />
        </linearGradient>
        <linearGradient id="tower-top" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#a3a8b2" />
          <stop offset="1" stopColor="#6c717b" />
        </linearGradient>
        <radialGradient id="tower-glow" cx="0.5" cy="0.75" r="0.75">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.55" stopColor="#e68a2e" />
          <stop offset="1" stopColor="#5a240c" />
        </radialGradient>
      </defs>
      {/* Its shadow on the table. */}
      <ellipse cx="33" cy="73" rx="24" ry="5" fill="rgba(0,0,0,0.45)" />
      {/* The side, going back to the right. */}
      <path d="M42 24 L54 17 L54 64 L42 71 Z" fill="url(#tower-side)" />
      {/* The front. */}
      <path d="M12 24 H42 V71 H12 Z" fill="url(#tower-front)" />
      {/* Courses of stone. */}
      <g stroke="rgba(0,0,0,0.28)" strokeWidth="0.8">
        <path d="M12 34 H42 M12 44 H42 M12 54 H42 M12 63 H42" />
        <path d="M42 34 L54 27 M42 44 L54 37 M42 54 L54 47 M42 63 L54 56" />
        <path d="M22 24 V34 M32 34 V44 M20 44 V54 M34 54 V63" />
      </g>
      {/* The top, and its crenels. */}
      <path d="M12 24 L24 17 H54 L42 24 Z" fill="url(#tower-top)" />
      <g fill="url(#tower-front)">
        <rect x="12" y="18" width="6" height="6" />
        <rect x="24" y="18" width="6" height="6" />
        <rect x="36" y="18" width="6" height="6" />
      </g>
      <g fill="url(#tower-side)">
        <path d="M42 18 L48 14.5 V20.5 L42 24 Z" />
      </g>
      {/* The window slit the dice go in by. */}
      <rect x="25" y="29" width="4" height="9" rx="1.5" fill={on ? "#2a160b" : "#14151a"} />
      {/* The arched door they come out of. */}
      <path className="tower-door" d="M20 71 V60 A7 7 0 0 1 34 60 V71 Z" fill={on ? "url(#tower-glow)" : "#14151a"} />
      {on ? (
        <g className="tower-dice">
          <rect className="tower-die d1" x="25.5" y="30" width="3.6" height="3.6" rx="0.6" />
          <rect className="tower-die d2" x="25.5" y="30" width="3.6" height="3.6" rx="0.6" />
          <rect className="tower-die d3" x="25.5" y="30" width="3.6" height="3.6" rx="0.6" />
        </g>
      ) : null}
    </svg>
  );
}
