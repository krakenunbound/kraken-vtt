import type { MapSeeing } from "../session/useSession";

function points(polygon: number[] | null | undefined): string {
  if (!polygon) return "";
  const pairs: string[] = [];
  for (let index = 0; index + 1 < polygon.length; index += 2) pairs.push(`${polygon[index]},${polygon[index + 1]}`);
  return pairs.join(" ");
}

// Magical darkness (a Darkness spell, a light marked darkness): black inside
// its reach and its own outline, whatever light falls there. A player's
// truesight, Devil's Sight or blindsight sees through it where it reaches;
// the GM sees it as a dark veil.
export function DarknessAreas({ areas, through, gm, width, height }: { areas: MapSeeing[] | undefined; through: MapSeeing[] | undefined; gm: boolean; width: number; height: number }) {
  if (!areas?.length) return null;
  const holes = gm ? [] : (through ?? []);
  return (
    <svg className="overlay darkness-areas" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-darkness={areas.length}>
      <defs>
        {/* Its edge fades over a few feet, as a light's does, never a hard line. */}
        <filter id="darkness-soft" filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <feGaussianBlur stdDeviation={Math.max(6, (areas[0]?.radiusPx ?? 100) * 0.06)} />
        </filter>
        {areas.map((area, index) => (
          <clipPath key={`c${index}`} id={`darkness-reach-${index}`}>
            {area.polygon ? <polygon points={points(area.polygon)} /> : <rect width={width} height={height} />}
          </clipPath>
        ))}
        {holes.map((item, index) => (
          <clipPath key={`h${index}`} id={`truesight-reach-${index}`}>
            {item.polygon ? <polygon points={points(item.polygon)} /> : <rect width={width} height={height} />}
          </clipPath>
        ))}
        <mask id="darkness-seen-through" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="#fff" />
          {holes.map((item, index) => (
            <circle key={index} cx={item.x} cy={item.y} r={item.radiusPx} fill="#000" clipPath={`url(#truesight-reach-${index})`} />
          ))}
        </mask>
      </defs>
      <g mask={holes.length ? "url(#darkness-seen-through)" : undefined} filter="url(#darkness-soft)">
        {areas.map((area, index) => (
          <circle key={index} cx={area.x} cy={area.y} r={area.radiusPx} fill={gm ? "#1a0826" : "#000"} fillOpacity={gm ? 0.55 : 1} clipPath={`url(#darkness-reach-${index})`} />
        ))}
      </g>
    </svg>
  );
}
