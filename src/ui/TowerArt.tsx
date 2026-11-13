import { useId, useState } from "react";

// The dice tower, drawn as a little tower in three-quarter view (a lit front,
// a darker side, a top with crenels, a window slit and an arched door), in one
// of Kraken's looks (the GM's choice, Settings or the tower's right-click
// menu), or the GM's own picture of a tower. Off, it stands dark and still;
// on, or while dice are held over it, its door glows and dice tumble down
// inside it, from the slit to the door (quicker while dice hover over it).

export type TowerLook = { id: string; name: string; front: [string, string]; side: [string, string]; top: [string, string]; glow: [string, string, string]; die: string; pip: string; lines: string };

export const TOWER_LOOKS: TowerLook[] = [
  { id: "stone", name: "Castle stone", front: ["#7d828c", "#4a4e57"], side: ["#30333a", "#1c1e23"], top: ["#a3a8b2", "#6c717b"], glow: ["#ffd27a", "#e68a2e", "#5a240c"], die: "#f4efe4", pip: "#6a4a24", lines: "rgba(0,0,0,0.28)" },
  { id: "oak", name: "Ironbound oak", front: ["#9a6a3c", "#5e3b1e"], side: ["#3f2614", "#24150a"], top: ["#b9864f", "#7a5128"], glow: ["#ffe08a", "#f09a2a", "#6a2c08"], die: "#f6ead2", pip: "#5a3416", lines: "rgba(30,14,4,0.45)" },
  { id: "obsidian", name: "Obsidian runes", front: ["#3a3046", "#1a1522"], side: ["#120e18", "#08060b"], top: ["#5a4a6e", "#2c2236"], glow: ["#f1d2ff", "#b34ee8", "#2a0638"], die: "#e3d2ff", pip: "#4a1a6a", lines: "rgba(190,120,255,0.18)" },
  { id: "frost", name: "Frost spire", front: ["#d4ecf8", "#83b6d2"], side: ["#5b8aa6", "#2f566e"], top: ["#f4fcff", "#acd6ea"], glow: ["#f0ffff", "#62d6f2", "#0d4a66"], die: "#ffffff", pip: "#2f6f94", lines: "rgba(40,90,130,0.3)" },
  { id: "brass", name: "Clockwork brass", front: ["#dcae52", "#8a5f1c"], side: ["#5e3e10", "#33210a"], top: ["#f2d07e", "#a87a2a"], glow: ["#fff3b8", "#ffb03a", "#5a2a00"], die: "#2e2a26", pip: "#e8c06a", lines: "rgba(70,40,5,0.4)" },
  { id: "bone", name: "Bone ossuary", front: ["#e8dfc8", "#b3a585"], side: ["#857a5f", "#4e4636"], top: ["#f6efdc", "#c6b996"], glow: ["#e2ffbc", "#7ad83e", "#13380a"], die: "#2a2a22", pip: "#d9f2b0", lines: "rgba(70,60,40,0.35)" },
];
export const towerLook = (id: string | undefined) => TOWER_LOOKS.find((look) => look.id === id) ?? null;

// The courses of each look: stone blocks, planks and iron bands, runes, ice
// cracks and icicles, gears and rivets, bones and a skull.
function Detail({ look, lit }: { look: TowerLook; lit: boolean }) {
  const stroke = look.lines;
  if (look.id === "oak")
    return (
      <g>
        <g stroke={stroke} strokeWidth="0.8">
          <path d="M18 24 V71 M24 24 V71 M30 24 V71 M36 24 V71 M45 22 V69 M49 20 V67" />
        </g>
        <g fill="#2b2b30">
          <path d="M12 32 H42 V35 H12 Z M42 32 L54 25 V28 L42 35 Z" />
          <path d="M12 52 H42 V55 H12 Z M42 52 L54 45 V48 L42 55 Z" />
        </g>
        <g fill="#9aa0aa">
          {[15, 21, 27, 33, 39].map((x) => (
            <circle key={x} cx={x} cy={33.5} r="0.7" />
          ))}
          {[15, 21, 27, 33, 39].map((x) => (
            <circle key={`b${x}`} cx={x} cy={53.5} r="0.7" />
          ))}
        </g>
      </g>
    );
  if (look.id === "obsidian")
    return (
      <g>
        <g stroke={stroke} strokeWidth="0.6">
          <path d="M12 40 L20 36 L30 42 L42 37 M12 58 L22 55 L34 60 L42 56 M42 41 L54 33 M42 59 L54 51" />
        </g>
        <g className="tower-runes" fill="none" stroke={lit ? "#d58bff" : "#5b3a78"} strokeWidth="0.9" strokeLinecap="round">
          <path d="M16 44 V50 M16 47 L19 44 M16 47 L19 50" />
          <path d="M37 44 L37 50 M34 44 L40 50 M40 44 L34 50" />
          <path d="M47 38 L47 44 L50 41" />
        </g>
      </g>
    );
  if (look.id === "frost")
    return (
      <g>
        <g stroke={stroke} strokeWidth="0.6" fill="none">
          <path d="M14 30 L19 38 L16 45 M38 28 L34 37 L39 46 L35 52 M44 40 L50 46 L47 54" />
        </g>
        <g fill="#f4fcff" opacity="0.9">
          <path d="M13 24 L14.5 29 L16 24 Z M25 24 L26 28 L27.5 24 Z M37 24 L38.5 30 L40 24 Z M44 22.8 L45 27 L46.5 21.9 Z" />
        </g>
      </g>
    );
  if (look.id === "brass")
    return (
      <g>
        <g stroke={stroke} strokeWidth="0.8">
          <path d="M12 34 H42 M12 63 H42 M42 34 L54 27 M42 63 L54 56" />
        </g>
        <g className="tower-gear" transform="translate(27 49)">
          <circle r="6" fill="none" stroke="#6a4510" strokeWidth="2.4" strokeDasharray="2 1.6" />
          <circle r="3.4" fill="#b8862e" stroke="#6a4510" strokeWidth="0.8" />
          <circle r="1" fill="#3a2506" />
        </g>
        <g fill="#f6dc94">
          {[14, 40].map((x) => [37, 45, 53, 61].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.7" />))}
        </g>
      </g>
    );
  if (look.id === "bone")
    return (
      <g>
        <g stroke={stroke} strokeWidth="0.8" fill="none">
          <path d="M12 34 H42 M12 63 H42 M42 34 L54 27 M42 63 L54 56" />
          <path d="M14 40 L22 48 M22 40 L14 48 M34 40 L40 48 M40 40 L34 48" />
        </g>
        <g transform="translate(27 46)">
          <path d="M-4 0 A4 4 0 0 1 4 0 V2.5 H2 V4 H-2 V2.5 H-4 Z" fill="#f6efdc" stroke={stroke} strokeWidth="0.5" />
          <circle cx="-1.6" cy="0.4" r="1" fill={lit ? "#7ad83e" : "#3a3426"} />
          <circle cx="1.6" cy="0.4" r="1" fill={lit ? "#7ad83e" : "#3a3426"} />
        </g>
      </g>
    );
  return (
    <g stroke={stroke} strokeWidth="0.8">
      <path d="M12 34 H42 M12 44 H42 M12 54 H42 M12 63 H42" />
      <path d="M42 34 L54 27 M42 44 L54 37 M42 54 L54 47 M42 63 L54 56" />
      <path d="M22 24 V34 M32 34 V44 M20 44 V54 M34 54 V63" />
    </g>
  );
}

// The tower: a drawn look (style an id of TOWER_LOOKS), or picture, the URL of
// the GM's own tower picture. busy: dice are held over it right now.
// litPicture: the same picture lit (a picture named "<name> lit" beside it):
// shown when the tower is on, as FG's dice tower on and off; without one the
// picture glows and dice fall in front of it.
export function TowerArt({ on, busy = false, style = "stone", picture = "", litPicture = "", size = 72 }: { on: boolean; busy?: boolean; style?: string; picture?: string; litPicture?: string; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const [noLit, setNoLit] = useState("");
  const hasLit = Boolean(litPicture) && noLit !== litPicture;
  const lit = on || busy;
  const className = ["tower-art", lit ? "on" : "", busy ? "busy" : "", picture ? "picture" : ""].filter(Boolean).join(" ");
  const dice = (die: string, pip: string) =>
    lit ? (
      <g className="tower-dice">
        {["d1", "d2", "d3"].map((key) => (
          <rect key={key} className={`tower-die ${key}`} x="25.5" y="30" width="3.6" height="3.6" rx="0.6" fill={die} stroke={pip} />
        ))}
      </g>
    ) : null;
  if (picture) {
    // The GM's own picture: it stands as drawn; lit, it glows and dice fall in front of it.
    return (
      <span className={hasLit ? `${className} paired` : className} style={{ width: size, height: size * 1.25 }} aria-hidden="true" data-tower-style="picture" data-lit={hasLit && lit ? "true" : "false"}>
        <img className="tower-unlit" src={picture} alt="" draggable={false} />
        {litPicture ? <img className="tower-lit" src={litPicture} alt="" draggable={false} onError={() => setNoLit(litPicture)} /> : null}
        {hasLit ? null : (
          <svg viewBox="0 0 64 80" width={size} height={size * 1.25}>
            {dice("#f4efe4", "#6a4a24")}
          </svg>
        )}
      </span>
    );
  }
  const look = towerLook(style) ?? TOWER_LOOKS[0];
  const id = (name: string) => `${name}-${uid}`;
  return (
    <svg className={className} viewBox="0 0 64 80" width={size} height={size * 1.25} aria-hidden="true" data-tower-style={look.id}>
      <defs>
        <linearGradient id={id("front")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={look.front[0]} />
          <stop offset="1" stopColor={look.front[1]} />
        </linearGradient>
        <linearGradient id={id("side")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={look.side[0]} />
          <stop offset="1" stopColor={look.side[1]} />
        </linearGradient>
        <linearGradient id={id("top")} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={look.top[0]} />
          <stop offset="1" stopColor={look.top[1]} />
        </linearGradient>
        <radialGradient id={id("glow")} cx="0.5" cy="0.75" r="0.75">
          <stop offset="0" stopColor={look.glow[0]} />
          <stop offset="0.55" stopColor={look.glow[1]} />
          <stop offset="1" stopColor={look.glow[2]} />
        </radialGradient>
      </defs>
      {/* Its shadow on the table, and the light from its door when lit. */}
      <ellipse cx="33" cy="73" rx="24" ry="5" fill="rgba(0,0,0,0.45)" />
      {lit ? <ellipse className="tower-spill" cx="27" cy="73" rx="13" ry="3.4" fill={look.glow[1]} opacity="0.45" /> : null}
      {/* The side, going back to the right. */}
      <path d="M42 24 L54 17 L54 64 L42 71 Z" fill={`url(#${id("side")})`} />
      {/* The front. */}
      <path d="M12 24 H42 V71 H12 Z" fill={`url(#${id("front")})`} />
      <Detail look={look} lit={lit} />
      {/* The top, and its crenels. */}
      <path d="M12 24 L24 17 H54 L42 24 Z" fill={`url(#${id("top")})`} />
      <g fill={`url(#${id("front")})`}>
        <rect x="12" y="18" width="6" height="6" />
        <rect x="24" y="18" width="6" height="6" />
        <rect x="36" y="18" width="6" height="6" />
      </g>
      <path d="M42 18 L48 14.5 V20.5 L42 24 Z" fill={`url(#${id("side")})`} />
      {/* The window slit the dice go in by. */}
      <rect x="25" y="29" width="4" height="9" rx="1.5" fill={lit ? look.glow[2] : "#14151a"} />
      {/* The arched door they come out of. */}
      <path className="tower-door" d="M20 71 V60 A7 7 0 0 1 34 60 V71 Z" fill={lit ? `url(#${id("glow")})` : "#14151a"} />
      {dice(look.die, look.pip)}
    </svg>
  );
}
