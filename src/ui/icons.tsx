// Line icons for the sidebar, windows and chat (24 x 24, drawn with currentColor).
const PATHS: Record<string, string> = {
  character: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6",
  party: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 1a3 3 0 1 0 0-6M3 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5m2-5.2c2.4.4 4 2.3 4 5.2",
  combat: "M14.5 3.5 20.5 3.5 20.5 9.5 10 20 4 14ZM4 20l3-3M14 8l2 2M3.5 3.5l6 6M20.5 20.5l-3-3M6 14l4 4",
  map: "M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20ZM8.5 4v13.5M15.5 6.5V20",
  book: "M4 4.5h6a2.5 2.5 0 0 1 2.5 2.5v13A2 2 0 0 0 10.5 18H4Zm16 0h-6A2.5 2.5 0 0 0 11.5 7v13a2 2 0 0 1 2-2H20Z",
  players: "M4 18h16M6 18V8l6-4 6 4v10M10 18v-5h4v5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4L10 5.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.5 2.6h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  open: "M4 7h6l2 2h8v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 7V5.5A1.5 1.5 0 0 1 5.5 4h4",
  close: "M6 6l12 12M18 6 6 18",
  minus: "M6 12h12",
  chat: "M4 5h16v11H9l-5 4Z",
  tower: "M7 21V9l-2-2V3h3v2h2V3h4v2h2V3h3v4l-2 2v12ZM10 21v-4a2 2 0 0 1 4 0v4",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  next: "M6 5l7 7-7 7M13 5l7 7-7 7",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "eye-off": "M3 3l18 18M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.6A17 17 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4-.9",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13",
  leave: "M10 4H5v16h5M14 8l4 4-4 4M18 12H9",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6Z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  target: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M2 12h3M19 12h3",
};

export function Icon({ name, size = 18, title }: { name: keyof typeof PATHS | string; size?: number; title?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name] ?? PATHS.sparkle} />
    </svg>
  );
}

// A die's outline for the dice tray and roll cards, by its number of sides.
export function DieShape({ sides, size = 26, label }: { sides: number; size?: number; label?: string | number }) {
  const shape: Record<number, string> = {
    4: "12,2.5 22,20.5 2,20.5",
    6: "4,4 20,4 20,20 4,20",
    8: "12,2 21.5,12 12,22 2.5,12",
    10: "12,2 21,9.5 12,22 3,9.5",
    12: "12,2 21.5,8.9 17.9,20 6.1,20 2.5,8.9",
    20: "12,1.8 21,7 21,17 12,22.2 3,17 3,7",
  };
  return (
    <svg className={`die-shape d${sides}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points={shape[sides] ?? shape[20]} />
      {label !== undefined ? (
        <text x="12" y={sides === 4 ? 16.5 : 13} textAnchor="middle" dominantBaseline="middle">
          {label}
        </text>
      ) : null}
    </svg>
  );
}
