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
