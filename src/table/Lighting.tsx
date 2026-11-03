import type { MapLight, MapSeeing } from "../session/useSession";

function points(polygon: number[] | null | undefined): string {
  if (!polygon) return "";
  const pairs: string[] = [];
  for (let index = 0; index + 1 < polygon.length; index += 2) pairs.push(`${polygon[index]},${polygon[index + 1]}`);
  return pairs.join(" ");
}

// Darkness and light on the map. Lights are a glow on the map, never an
// outline: darkness is cut away where light reaches (bright fully, fading to
// the dim edge, only inside the light's own line of sight), and the light's
// colour is added softly on top. The GM sees the same, with the darkness thinned.
// Night vision follows the C&C Player's Handbook: deepvision and darkvision
// see in complete darkness "in shades of gray" (the map shows grey there,
// colour only where real light falls); twilight vision sees colour under
// starlight and torchlight, so night is like dusk and dim light is enough.
export function Lighting({
  width,
  height,
  darkness,
  lights,
  seeing,
  gm,
  twilight = false,
  image,
}: {
  width: number;
  height: number;
  darkness: number;
  lights: MapLight[];
  seeing: MapSeeing[];
  gm: boolean;
  twilight?: boolean;
  image?: { url: string; left: number; top: number; width: number; height: number } | null;
}) {
  if (darkness <= 0.01 && lights.length === 0) return null;
  const felt = twilight && darkness < 1 ? Math.min(darkness, 0.3) : darkness;
  const shade = Math.min(0.96, felt * (gm ? 0.5 : 0.96));
  // Warm the lit area without washing it out: stronger the darker the night.
  const glow = 0.05 + 0.22 * darkness;
  return (
    <svg className="overlay lighting" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        {lights.map((light, index) => {
          const brightStop = twilight ? 0.9 : light.dimPx > 0 ? Math.min(1, light.brightPx / light.dimPx) : 1;
          return (
            <g key={light.id}>
              <clipPath id={`light-reach-${index}`}>
                {light.polygon ? <polygon points={points(light.polygon)} /> : <rect width={width} height={height} />}
              </clipPath>
              <radialGradient id={`light-cut-${index}`} cx={light.x} cy={light.y} r={light.dimPx} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#000" stopOpacity="1" />
                <stop offset={brightStop * 0.85} stopColor="#000" stopOpacity="1" />
                <stop offset={Math.min(1, brightStop + (1 - brightStop) * 0.45)} stopColor="#000" stopOpacity="0.55" />
                <stop offset="1" stopColor="#000" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`light-glow-${index}`} cx={light.x} cy={light.y} r={light.dimPx} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={light.color} stopOpacity={glow} />
                <stop offset={brightStop} stopColor={light.color} stopOpacity={glow * 0.45} />
                <stop offset="1" stopColor={light.color} stopOpacity="0" />
              </radialGradient>
            </g>
          );
        })}
        {seeing.map((item, index) => (
          <g key={`seeing-${index}`}>
            <clipPath id={`seeing-reach-${index}`}>{item.polygon ? <polygon points={points(item.polygon)} /> : <rect width={width} height={height} />}</clipPath>
            <radialGradient id={`seeing-cut-${index}`} cx={item.x} cy={item.y} r={item.radiusPx} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#000" stopOpacity="0.85" />
              <stop offset="0.85" stopColor="#000" stopOpacity="0.75" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </g>
        ))}
        <filter id="night-grey" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.8" />
            <feFuncG type="linear" slope="0.8" />
            <feFuncB type="linear" slope="0.85" />
          </feComponentTransfer>
        </filter>
        <mask id="night-grey-area" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          {seeing.map((item, index) => (
            <circle key={`grey-${index}`} cx={item.x} cy={item.y} r={item.radiusPx} fill="#fff" clipPath={`url(#seeing-reach-${index})`} />
          ))}
          {lights.map((light, index) => (
            <circle key={light.id} cx={light.x} cy={light.y} r={light.dimPx} fill={`url(#light-cut-${index})`} clipPath={`url(#light-reach-${index})`} />
          ))}
        </mask>
        <mask id="darkness-cut" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="#fff" />
          {lights.map((light, index) => (
            <circle key={light.id} cx={light.x} cy={light.y} r={light.dimPx} fill={`url(#light-cut-${index})`} clipPath={`url(#light-reach-${index})`} />
          ))}
          {seeing.map((item, index) => (
            <circle key={`seeing-${index}`} cx={item.x} cy={item.y} r={item.radiusPx} fill={`url(#seeing-cut-${index})`} clipPath={`url(#seeing-reach-${index})`} />
          ))}
        </mask>
      </defs>
      {image && seeing.length > 0 && felt >= 0.5 ? (
        <image href={image.url} x={image.left} y={image.top} width={image.width} height={image.height} preserveAspectRatio="none" filter="url(#night-grey)" mask="url(#night-grey-area)" />
      ) : null}
      {shade > 0 ? <rect width={width} height={height} fill="#03050a" fillOpacity={shade} mask="url(#darkness-cut)" /> : null}
      <g className="light-glow">
        {lights.map((light, index) => (
          <circle key={light.id} cx={light.x} cy={light.y} r={light.dimPx} fill={`url(#light-glow-${index})`} clipPath={`url(#light-reach-${index})`} />
        ))}
      </g>
    </svg>
  );
}
