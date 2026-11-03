// The emblem on an empty desktop (FG's desktop decal).
export function Emblem({ className = "emblem" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="emblem-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#d2a15a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#d2a15a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#emblem-glow)" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#d2a15a" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="#d2a15a" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 5" />
      <g fill="none" stroke="#d2a15a" strokeOpacity="0.75" strokeWidth="3.2" strokeLinecap="round">
        <path d="M100 58c-17 0-28 12-28 28 0 10 4 17 11 22" />
        <path d="M100 58c17 0 28 12 28 28 0 10-4 17-11 22" />
        <path d="M83 108c-6 10-16 16-26 14M117 108c6 10 16 16 26 14" />
        <path d="M90 112c-2 14-10 24-20 30M110 112c2 14 10 24 20 30" />
        <path d="M100 114v34c0 6 4 10 9 10" />
      </g>
      <circle cx="90" cy="86" r="3.5" fill="#d2a15a" fillOpacity="0.8" />
      <circle cx="110" cy="86" r="3.5" fill="#d2a15a" fillOpacity="0.8" />
    </svg>
  );
}

