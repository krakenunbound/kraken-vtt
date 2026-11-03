import { useId } from "react";
// Line icons for the sidebar, windows and chat (24 x 24, drawn with currentColor).
const PATHS: Record<string, string> = {
  // Chat: what a line is.
  damage: "M12 2.5 13.8 8.6 19.8 6.2 16.2 11.3 21.5 13.8 15.4 14.9 16.8 21 12 17 7.2 21 8.6 14.9 2.5 13.8 7.8 11.3 4.2 6.2 10.2 8.6Z",
  check: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.3 15.3 21 21",
  hourglass: "M6.5 3h11M6.5 21h11M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9",
  flask: "M9.5 3h5M10.5 3v6L5 18.5A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.5L13.5 9V3M7.5 14.5h9",
  resist: "M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6ZM7 17 17 7",
  levelup: "M12 20V5M6 11l6-6 6 6M5 21h14",
  d20: "M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9ZM12 2.5 7 13h10ZM3.5 7.5 7 13l-3.5 3.5M20.5 7.5 17 13l3.5 3.5M7 13l5 8.5 5-8.5",
  whisper: "M7.5 11V8a4.5 4.5 0 0 1 9 0v3M6 11h12v9.5H6ZM12 14.5v2.5",
  emote: "M5 4.5h14v6.5a7 7 0 0 1-14 0ZM9 9h.01M15 9h.01M9 13.5c1.5 1.3 4.5 1.3 6 0",
  mood: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 10h.01M15 10h.01M8.5 14.5c2 2 5 2 7 0",
  vote: "M4 4h16v16H4ZM8 12.5l3 3 5.5-6.5",
  music: "M9 18V5.5l11-2.5v12.5M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  sound: "M4 9.5h4l5-4.5v14l-5-4.5H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  warning: "M12 3.5 21.5 20h-19ZM12 9.5v5M12 17.5h.01",
  // Into and out of a tray: a file brought in, a file taken away.
  import: "M12 3v12M7 10l5 5 5-5M4 15v5h16v-5",
  export: "M12 15V3M7 8l5-5 5 5M4 15v5h16v-5",
  // A person and a plus: a new character.
  "add-character": "M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M19 7v6M16 10h6",
  character: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6",
  party: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 1a3 3 0 1 0 0-6M3 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5m2-5.2c2.4.4 4 2.3 4 5.2",
  combat: "M14.5 3.5 20.5 3.5 20.5 9.5 10 20 4 14ZM4 20l3-3M14 8l2 2M3.5 3.5l6 6M20.5 20.5l-3-3M6 14l4 4",
  map: "M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20ZM8.5 4v13.5M15.5 6.5V20",
  book: "M4 4.5h6a2.5 2.5 0 0 1 2.5 2.5v13A2 2 0 0 0 10.5 18H4Zm16 0h-6A2.5 2.5 0 0 0 11.5 7v13a2 2 0 0 1 2-2H20Z",
  players: "M4 18h16M6 18V8l6-4 6 4v10M10 18v-5h4v5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4L10 5.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.5 2.6h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  open: "M4 7h6l2 2h8v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 7V5.5A1.5 1.5 0 0 1 5.5 4h4",
  close: "M6 6l12 12M18 6 6 18",
  // The map toolbar.
  "zoom-in": "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.8-4.8M10.5 7.5v6M7.5 10.5h6",
  "zoom-out": "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.8-4.8M7.5 10.5h6",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  locate: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M2 12h3M19 12h3",
  hand: "M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.9-2.5L3.8 13.6a1.5 1.5 0 0 1 2.4-1.8L8 14",
  ping: "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14",
  pen: "M4 20l1.2-4.4L15.8 5a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.4 18.8ZM13.5 7.3l3.2 3.2",
  eraser: "M8.5 19.5h11M4.6 14.6l9.2-9.2a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8L11.8 19.8H8.4l-3.8-3.8a1 1 0 0 1 0-1.4ZM9 10.2l5.2 5.2",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13Z",
  unlock: "M7 11V8a5 5 0 0 1 9.6-2M5.5 11h13v9h-13Z",
  // The share arrow social media uses.
  share: "M14 5l7 6.5-7 6.5v-4C8.5 14 5.5 15.8 3 19.5c.6-6.2 4.4-10.3 11-11.2Z",
  popout: "M14 4h6v6M20 4l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  dock: "M10 14H4V8M4 14l8-8M6 4h12.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V18",
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
// A set's colours for a die icon: its body shading into its accent, numbers in its ink.
export type DieColors = { body: string; ink: string; accent?: string; material?: string };

export function DieShape({ sides, size = 26, label, look }: { sides: number; size?: number; label?: string | number; look?: DieColors }) {
  const id = `die${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shape: Record<number, string> = {
    4: "12,2.5 22,20.5 2,20.5",
    6: "4,4 20,4 20,20 4,20",
    8: "12,2 21.5,12 12,22 2.5,12",
    10: "12,2 21,9.5 12,22 3,9.5",
    12: "12,2 21.5,8.9 17.9,20 6.1,20 2.5,8.9",
    20: "12,1.8 21,7 21,17 12,22.2 3,17 3,7",
  };
  return (
    <svg className={look ? `die-shape d${sides} set` : `die-shape d${sides}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {look ? (
        <defs>
          <linearGradient id={`${id}-body`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={look.material === "metal" || look.material === "glass" ? "#ffffff" : look.body} stopOpacity={look.material === "metal" || look.material === "glass" ? 0.55 : 1} />
            <stop offset="0.18" stopColor={look.body} />
            <stop offset="1" stopColor={look.accent && look.accent !== look.body ? look.accent : look.body} stopOpacity={look.material === "glass" ? 0.75 : 1} />
          </linearGradient>
        </defs>
      ) : null}
      <polygon points={shape[sides] ?? shape[20]} style={look ? { fill: `url(#${id}-body)` } : undefined} />
      {label !== undefined ? (
        <text x="12" y={sides === 4 ? 16.5 : 13} textAnchor="middle" dominantBaseline="middle" style={look ? { fill: look.ink } : undefined}>
          {label}
        </text>
      ) : null}
    </svg>
  );
}
