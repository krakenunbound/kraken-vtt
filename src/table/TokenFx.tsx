import type { CSSProperties, JSX, ReactNode } from "react";
import "./tokenFx.css";

// Condition effects drawn on a map token, MMO style. Everything is CSS: only
// transform and opacity animate (on HTML-level boxes, so the compositor runs
// them), filters are static, and motion is opt-in under
// prefers-reduced-motion: no-preference (see tokenFx.css). The mode prop is the
// table's pause control: "icons" keeps the static hints, "off" draws nothing.

export type FxKey =
  | "zzz"
  | "bubbles"
  | "flames"
  | "frost"
  | "stone"
  | "tremble"
  | "stars"
  | "crackle"
  | "hearts"
  | "blind"
  | "shimmer"
  | "prone"
  | "chains"
  | "grip"
  | "glow-good"
  | "glow-bad"
  | "ring"
  | "down"
  | "web"
  | "haste"
  | "slow"
  | "bleed"
  | "swirl"
  | "deaf"
  | "dazed"
  | "light";

export const FX_KEYS: FxKey[] = ["zzz", "bubbles", "flames", "frost", "stone", "tremble", "stars", "crackle", "hearts", "blind", "shimmer", "prone", "chains", "grip", "glow-good", "glow-bad", "ring", "down", "web", "haste", "slow", "bleed", "swirl", "deaf", "dazed", "light"];

type FxMode = "full" | "icons" | "off";

// Drawn behind the portrait (in the token's own stacking context).
const BACK = new Set<FxKey>(["glow-good", "glow-bad", "tremble", "light", "haste"]);
// The static hints that stay in "icons" mode.
const STATIC = new Set<FxKey>(["frost", "stone", "slow", "blind", "down", "glow-good", "glow-bad"]);
// Effects that change the whole token, as classes on the .token element.
const TOKEN_CLASS: Partial<Record<FxKey, string>> = { prone: "fx-prone", stone: "fx-stone", tremble: "fx-tremble", shimmer: "fx-shimmer", down: "fx-down" };

// Points on a circle in the fx frame (viewBox -10 -10 120 120, so 1 unit is 1%
// of the token's square and the portrait's rim is r = 45). deg: clockwise from the top.
const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(50 + r * Math.sin(a)).toFixed(2)} ${(50 - r * Math.cos(a)).toFixed(2)}`;
};

// A stroke width in frame units that is never thinner than minPx on screen.
const stroke = (span: number, units: number, minPx: number) => Math.max(units, (minPx * 100) / Math.max(span, 1));

// Jagged arcs of lightning along the rim, made once.
const bolt = (from: number, to: number, seed: number) => {
  let d = "";
  for (let deg = from, i = 0; deg <= to; deg += 7, i += 1) d += `${i ? "L" : "M"}${pt(i % 2 ? 49 + ((seed * i) % 3) : 43 - ((seed + i) % 2), deg)} `;
  return d;
};
const BOLTS = [bolt(15, 95, 2), bolt(150, 220, 1), bolt(255, 330, 3)];

// A spiderweb over the portrait: spokes and sagging rings.
const WEB = (() => {
  let d = "";
  for (let k = 0; k < 8; k += 1) d += `M50 50L${pt(46, k * 45 + 10)} `;
  for (const r of [13, 25, 37]) {
    d += `M${pt(r, 10)} `;
    for (let k = 1; k <= 8; k += 1) d += `Q${pt(r * 0.86, k * 45 - 12.5)} ${pt(r, k * 45 + 10)} `;
  }
  return d;
})();

const CHAIN_LINKS = Array.from({ length: 18 }, (_, i) => {
  const deg = i * 20;
  const [cx, cy] = pt(46, deg).split(" ");
  return { cx, cy, deg, flat: i % 2 === 1 };
});

const FRAME = "-10 -10 120 120";

// Small filled glyphs for the particles (24x24). The dark stroke is painted under the fill.
const STAR = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17.1l-6.2 3.6 1.6-6.9L2.1 9.1l7-.7z" fill="#ffe14d" stroke="#3a2a00" strokeWidth="2.4" paintOrder="stroke" strokeLinejoin="round" /></svg>;
const HEART = <svg viewBox="0 0 24 24"><path d="M12 21s-8.5-5.2-8.5-11.4A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.5 2.8C20.5 15.8 12 21 12 21z" fill="#ff5fa8" stroke="#4a0626" strokeWidth="2.4" paintOrder="stroke" strokeLinejoin="round" /></svg>;
const DROP = <svg viewBox="0 0 24 24"><path d="M12 2S4.5 10.8 4.5 15a7.5 7.5 0 0 0 15 0C19.5 10.8 12 2 12 2z" fill="#d8142e" stroke="#360008" strokeWidth="2.4" paintOrder="stroke" strokeLinejoin="round" /></svg>;
// Line glyphs drawn twice: a wide dark under-stroke, then the light line.
const lined = (paths: ReactNode, color: string, width = 2.2) => (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <g stroke="#0c0d12" strokeWidth={width * 2.1} strokeOpacity="0.85">{paths}</g>
    <g stroke={color} strokeWidth={width}>{paths}</g>
  </svg>
);
const FLAKE = lined(<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5" />, "#f4fbff");
const HOURGLASS = lined(<path d="M7 3h10M7 21h10M8 3v2.5a4 4 0 0 0 1.8 3.3L12 12l2.2-3.2A4 4 0 0 0 16 5.5V3M8 21v-2.5a4 4 0 0 1 1.8-3.3L12 12l2.2 3.2a4 4 0 0 1 1.8 3.3V21M10 19h4M10.5 5.5h3" />, "#9cc4ff");
const SPIRAL = lined(<path d="M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0" />, "#e59cff", 1.9);
const EAR_MUTED = lined(<path d="M7.5 9.5a4.5 4.5 0 1 1 9 0c0 2.8-2.4 3.3-2.8 5.5-.4 2-1.6 3.5-3.7 3.5M10 10a2 2 0 0 1 4 0M4 4l16 16" />, "#ffffff");

function layer(key: FxKey, span: number, full: boolean): ReactNode {
  const cls = `fx-layer fx-${key}`;
  switch (key) {
    case "zzz":
      return <div key={key} className={cls}><i>Z</i><i>Z</i><i>Z</i></div>;
    case "bubbles":
      return <div key={key} className={cls}><i /><i /><i /><i /></div>;
    case "flames":
      // Tongues along the lower rim, tilted a little outwards; the middle one tallest.
      return (
        <div key={key} className={cls}>
          {[-72, -38, 0, 38, 72].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const tall = deg === 0 ? 0.22 : Math.abs(deg) < 50 ? 0.18 : 0.14;
            return <i key={deg} style={{ left: `${50 + 42 * Math.sin(a)}%`, top: `${50 + 40 * Math.cos(a)}%`, width: `${tall}em`, height: `${tall * 1.35}em`, rotate: `${deg * 0.45}deg` }} />;
          })}
        </div>
      );
    case "frost":
      return <div key={key} className={cls}><b className="fx-disc" />{full ? <><i>{FLAKE}</i><i>{FLAKE}</i><i>{FLAKE}</i><i>{FLAKE}</i></> : null}</div>;
    case "stone":
    case "slow":
      return <div key={key} className={cls}><b className="fx-disc" />{key === "slow" && full ? <i>{HOURGLASS}</i> : null}</div>;
    case "blind":
      return <div key={key} className={cls}><b className="fx-disc"><i /></b></div>;
    case "shimmer":
      return <div key={key} className={cls}><b className="fx-disc"><i /></b></div>;
    case "tremble":
    case "glow-good":
    case "glow-bad":
    case "light":
    case "down":
      return <div key={key} className={cls}><b /></div>;
    case "stars":
      return <div key={key} className={cls}><i>{STAR}</i><i>{STAR}</i><i>{STAR}</i></div>;
    case "hearts":
      return <div key={key} className={cls}><i>{HEART}</i><i>{HEART}</i><i>{HEART}</i></div>;
    case "bleed":
      return <div key={key} className={cls}><i>{DROP}</i><i>{DROP}</i><i>{DROP}</i></div>;
    case "swirl":
      return <div key={key} className={cls}><i>{SPIRAL}</i></div>;
    case "deaf":
      return <div key={key} className={cls}><i>{EAR_MUTED}</i></div>;
    case "dazed":
      return <div key={key} className={cls}><i /><i /><i /></div>;
    case "haste":
      return <div key={key} className={cls}><i /><i /><i /></div>;
    case "crackle": {
      const w = stroke(span, 1.4, 1.2);
      return (
        <div key={key} className={cls}>
          {BOLTS.map((d) => (
            <svg key={d} className="fx-frame" viewBox={FRAME} fill="none" strokeLinejoin="round" strokeLinecap="round">
              <path d={d} stroke="#241a00" strokeOpacity="0.75" strokeWidth={w * 2.4} />
              <path d={d} stroke="#ffe646" strokeWidth={w} />
              <path d={d} stroke="#fffbe0" strokeWidth={w * 0.4} />
            </svg>
          ))}
        </div>
      );
    }
    case "ring": {
      const w = stroke(span, 1.6, 1.5);
      return (
        <div key={key} className={cls}>
          <svg className="fx-frame" viewBox={FRAME} fill="none">
            <circle cx="50" cy="50" r="48" stroke="#000" strokeOpacity="0.6" strokeWidth={w * 2.2} strokeDasharray="7 4.6" />
            <circle cx="50" cy="50" r="48" stroke="var(--fx-accent, #8fe3ff)" strokeWidth={w} strokeDasharray="7 4.6" />
          </svg>
        </div>
      );
    }
    case "chains": {
      const w = stroke(span, 1.5, 1.2);
      const links = (color: string, width: number) =>
        CHAIN_LINKS.map((link) => <ellipse key={link.deg} cx={link.cx} cy={link.cy} rx="4.6" ry={link.flat ? 1 : 2.5} transform={`rotate(${link.deg} ${link.cx} ${link.cy})`} stroke={color} strokeWidth={width} />);
      return (
        <div key={key} className={cls}>
          <svg className="fx-frame" viewBox={FRAME} fill="none">
            <g strokeOpacity="0.9">{links("#121318", w * 2.4)}</g>
            {links("#cfd3da", w)}
          </svg>
        </div>
      );
    }
    case "web": {
      const w = stroke(span, 0.7, 1);
      return (
        <div key={key} className={cls}>
          <svg className="fx-frame" viewBox={FRAME} fill="none" strokeLinecap="round">
            <path d={WEB} stroke="#000" strokeOpacity="0.5" strokeWidth={w * 2.6} />
            <path d={WEB} stroke="#f2f2ee" strokeOpacity="0.9" strokeWidth={w} />
          </svg>
        </div>
      );
    }
    case "grip": {
      // A hand from the right: the palm's band outside the rim, fingers curling over it.
      const fingers = [42, 66, 90, 114].map((deg) => `M${pt(57, deg)}L${pt(37, deg + 4)}`).join(" ") + ` M${pt(56, 150)}L${pt(43, 140)}`;
      const palm = `M${pt(58, 36)}A58 58 0 0 1 ${pt(58, 148)}`;
      return (
        <div key={key} className={cls}>
          <svg className="fx-frame" viewBox={FRAME} fill="none" strokeLinecap="round">
            <path d={palm} stroke="#1a120c" strokeWidth="14" />
            <path d={fingers} stroke="#1a120c" strokeWidth="10" />
            <path d={palm} stroke="#b88763" strokeWidth="10.5" />
            <path d={fingers} stroke="#c99a74" strokeWidth="7" />
          </svg>
        </div>
      );
    }
    default:
      return null;
  }
}

/** The overlay drawn inside a .token (after its disc). span: the token's size in px. */
export function TokenFx(props: { fx: FxKey[]; span: number; mode?: FxMode; color?: string }): JSX.Element | null {
  const { span, mode = "full", color } = props;
  if (mode === "off") return null;
  const full = mode === "full";
  const keys = [...new Set(props.fx)].filter((key) => key !== "prone" && (full || STATIC.has(key)));
  if (!keys.length) return null;
  const back = keys.filter((key) => BACK.has(key));
  const front = keys.filter((key) => !BACK.has(key));
  const style = { "--span": span, ...(color ? { "--fx-accent": color } : {}) } as CSSProperties;
  const cls = full ? "token-fx token-fx-anim" : "token-fx";
  return (
    <>
      {back.length ? <div className={`${cls} token-fx-back`} style={style} aria-hidden>{back.map((key) => layer(key, span, full))}</div> : null}
      {front.length ? <div className={cls} style={style} aria-hidden>{front.map((key) => layer(key, span, full))}</div> : null}
    </>
  );
}

/** Classes for the .token element itself (prone tilt, stone/down filters, tremble, invisible shimmer). */
export function tokenFxClasses(fx: FxKey[], mode: FxMode = "full"): string[] {
  if (mode === "off") return [];
  const out: string[] = [];
  for (const key of new Set(fx)) {
    const cls = TOKEN_CLASS[key];
    if (cls && (mode === "full" || key !== "tremble")) out.push(cls);
  }
  return out;
}

// Badge glyphs, 24x24, drawn with currentColor strokes.
const BADGE: Record<string, ReactNode> = {
  sleep: <path d="M4 9h6l-6 7h6M13 4h6l-6 7h6" />,
  poison: <path d="M9 3h6M10 3v6l-5.2 9.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9V3M7.5 15h9" />,
  fire: <path d="M12 3c1 3.2 5.5 5.2 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.8 2.2-4.8 0 2 1 3.3 2.3 3.3 0-3-1.2-5.5 1-9z" />,
  cold: <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.4 4.3 12 6l2.6-1.7M9.4 19.7 12 18l2.6 1.7" />,
  stone: <path d="M3.5 17 6.8 8l5.2-3.3 6 3 2.5 8.3-4 3.5H7.8zM12 4.7l-1.2 5.2 3.4 3" />,
  fear: <><path d="M6 20.5V10a6 6 0 0 1 12 0v10.5l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6z" /><path d="M10 10v.6M14 10v.6" /><circle cx="12" cy="14.5" r="1.3" /></>,
  stun: <path d="M12 2.5 14.2 9.8 21.5 12l-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2z" />,
  paralysis: <path d="M13.5 2 5 14h6.2L10 22l8.8-12.2h-6.3z" />,
  charm: <path d="M12 20.5s-7.5-4.6-7.5-10.5A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.9-7.5 10.5-7.5 10.5z" />,
  blind: <><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /><path d="M4 4l16 16" /></>,
  deaf: <path d="M7.5 9.5a4.5 4.5 0 1 1 9 0c0 2.8-2.4 3.3-2.8 5.5-.4 2-1.6 3.5-3.7 3.5M10 10a2 2 0 0 1 4 0M4 4l16 16" />,
  invisible: <g strokeDasharray="2.2 2.2"><circle cx="12" cy="7" r="3.5" /><path d="M5 21c0-4.4 3.1-7.5 7-7.5s7 3.1 7 7.5" /></g>,
  prone: <><circle cx="5.5" cy="12.5" r="2.3" /><path d="M9 13.5h9.5l2.5-2.5M13 13.5l-1.5 3.5M2.5 18h19" /></>,
  restrained: <path d="M9.5 14.5 7.2 16.8a3.2 3.2 0 0 1-4.5-4.5l3-3a3.2 3.2 0 0 1 4.5 0M14.5 9.5l2.3-2.3a3.2 3.2 0 0 1 4.5 4.5l-3 3a3.2 3.2 0 0 1-4.5 0M9 15l6-6" />,
  grappled: <path d="M8 13V6.2a1.5 1.5 0 0 1 3 0V11V4.8a1.5 1.5 0 0 1 3 0V11V6.2a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5h-.7a6 6 0 0 1-5.1-2.9L3 14a1.5 1.5 0 0 1 2.6-1.5L8 15" />,
  buff: <path d="M6 13.5l6-6 6 6M6 19l6-6 6 6M6 5h12" />,
  debuff: <path d="M6 10.5l6 6 6-6M6 5l6 6 6-6M6 19h12" />,
  concentration: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1" /></>,
  down: <><path d="M5 11a7 7 0 0 1 14 0v3.3l-2 1.2V19H7v-3.5l-2-1.2z" /><circle cx="9.3" cy="11.5" r="1.4" /><circle cx="14.7" cy="11.5" r="1.4" /><path d="M10.5 19v2M13.5 19v2" /></>,
  entangled: <><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="8" /></>,
  haste: <path d="M3.5 6l6 6-6 6M11.5 6l6 6-6 6M20.5 6v12" />,
  slow: <path d="M7 3h10M7 21h10M8 3v2.5a4 4 0 0 0 1.8 3.3L12 12l2.2-3.2A4 4 0 0 0 16 5.5V3M8 21v-2.5a4 4 0 0 1 1.8-3.3L12 12l2.2 3.2a4 4 0 0 1 1.8 3.3V21" />,
  bleed: <path d="M12 2.5S5.5 10.2 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.2 12 2.5 12 2.5zM9.5 15a2.5 2.5 0 0 0 2.5 2.5" />,
  confused: <path d="M8.8 8.8a3.3 3.3 0 1 1 4.9 2.9c-1.1.6-1.7 1.4-1.7 2.6M12 18.6v.4" />,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>,
  exhaustion: <path d="M3 7.5h15v9H3zM21 10.5v3M6 10.5v3" />,
  incapacitated: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  surprised: <path d="M12 3.5v11M12 19.5v.5" />,
  generic: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.3" /></>,
};

type Badge = { icon: string; title: string; tone?: "good" | "bad" | "neutral"; rounds?: number };

/** One effect's glyph (the badges' own), for the buff bar and the Effects list. */
export function EffectGlyph({ icon, size = 18 }: { icon: string; size?: number }): JSX.Element {
  return (
    <svg className="effect-glyph" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {BADGE[icon] ?? BADGE.generic}
    </svg>
  );
}

/** Small condition chips around the lower rim: up to max icons, then "+n". */
export function TokenBadges(props: { badges: Badge[]; span: number; max?: number }): JSX.Element | null {
  const { badges, span, max = 5 } = props;
  if (!badges.length) return null;
  const shown = badges.length > max ? badges.slice(0, max) : badges;
  const rest = badges.slice(shown.length);
  const count = shown.length + (rest.length ? 1 : 0);
  // At least 12 px, about a fifth of the token, never huge.
  const size = Math.round(Math.min(32, Math.max(12, span * 0.2)));
  // Centres on a circle just outside the portrait's rim, packed edge to edge
  // around the bottom, a little to the left so the health dot (lower right) stays clear.
  const radius = span * 0.47;
  const step = count > 1 ? Math.min((size * 1.14) / radius, (220 * Math.PI) / 180 / (count - 1)) : 0;
  const start = -0.2 - (step * (count - 1)) / 2;
  const place = (i: number): CSSProperties => {
    const a = start + i * step; // radians from straight down, positive to the right
    return { left: `${50 + 47 * Math.sin(a)}%`, top: `${50 + 47 * Math.cos(a)}%`, width: size, height: size, fontSize: size };
  };
  return (
    <div className="token-badges">
      {shown.map((badge, i) => (
        <span key={`${badge.icon}-${i}`} className="token-badge" data-tone={badge.tone ?? "neutral"} title={badge.rounds != null ? `${badge.title} (${badge.rounds} ${badge.rounds === 1 ? "round" : "rounds"} left)` : badge.title} style={place(i)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {BADGE[badge.icon] ?? BADGE.generic}
          </svg>
          {badge.rounds != null ? <b>{badge.rounds}</b> : null}
        </span>
      ))}
      {rest.length ? (
        <span className="token-badge token-badge-more" title={rest.map((badge) => badge.title).join("\n")} style={place(shown.length)}>
          <i>+{rest.length}</i>
        </span>
      ) : null}
    </div>
  );
}
