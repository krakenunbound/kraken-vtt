import logo from "../assets/kraken-logo-512.webp";
import mark from "../assets/kraken-mark.webp";

// The Kraken logo: on an empty desktop (FG's desktop decal) and the join screen.
export function Emblem({ className = "emblem" }: { className?: string }) {
  return <img className={className} src={logo} alt="" draggable={false} />;
}

// The small mark beside the name in the menu bar.
export function Mark({ className = "brand-mark" }: { className?: string }) {
  return <img className={className} src={mark} alt="" draggable={false} />;
}

// Runes for the ring: the Elder Futhark, read as KRAKEN VIRTUAL TABLETOP.
const RUNES = "ᚲᚱᚨᚲᛖᚾ · ᚹᛁᚱᛏᚢᚨᛚ · ᛏᚨᛒᛚᛖᛏᛟᛈ · ";

// The logo come to life, for the front screens: it floats on the swell, its
// light breathes, its eyes glow, and two rings of runes turn around it.
export function LivingEmblem({ size = 260 }: { size?: number }) {
  return (
    <div className="living-emblem" style={{ width: size, height: size }} aria-hidden="true">
      <svg className="emblem-rings" viewBox="0 0 200 200">
        <defs>
          <path id="emblem-rune-path" d="M100,100 m-86,0 a86,86 0 1,1 172,0 a86,86 0 1,1 -172,0" />
          <linearGradient id="emblem-ring-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3d08d" />
            <stop offset="0.5" stopColor="#a8783a" />
            <stop offset="1" stopColor="#f3d08d" />
          </linearGradient>
        </defs>
        <g className="ring-outer">
          <circle cx="100" cy="100" r="95" fill="none" stroke="url(#emblem-ring-gold)" strokeWidth="0.8" strokeDasharray="1 3.2" />
          <text className="ring-runes">
            <textPath href="#emblem-rune-path" textLength="536" lengthAdjust="spacing">{RUNES.repeat(2)}</textPath>
          </text>
        </g>
        <g className="ring-inner">
          <circle cx="100" cy="100" r="78" fill="none" stroke="url(#emblem-ring-gold)" strokeWidth="0.6" opacity="0.7" />
          {Array.from({ length: 12 }, (_, index) => (
            <path key={index} d="M100,18 l2.2,4 l-2.2,4 l-2.2,-4 z" fill="#e9c27e" opacity="0.8" transform={`rotate(${index * 30} 100 100)`} />
          ))}
        </g>
      </svg>
      <div className="emblem-aura" />
      <img className="emblem-art" src={logo} alt="" draggable={false} />
      <span className="emblem-eye left" />
      <span className="emblem-eye right" />
    </div>
  );
}
