import type { CSSProperties } from "react";
import type { MapFx } from "../session/useSession";

// An FX layer's mask as a picture in map pixels: the GM's painted areas
// (shapes and brush strokes) white on black (only inside) or black on white
// (everywhere but inside), all together, the edge faded by its soft width.
// The weather above the map uses it as its CSS mask, placed and sized with
// the camera, so overlapping areas simply add up.
export function fxMaskImage(mask: MapFx["mask"], width: number, height: number): string | null {
  const strokes = mask.strokes ?? [];
  if (!mask.use || (mask.polygons.length === 0 && strokes.length === 0) || !(width > 0) || !(height > 0)) return null;
  const inside = mask.mode !== "outside";
  const paint = inside ? "white" : "black";
  const soft = Math.max(0, Number(mask.soft ?? 12));
  const shapes = [
    ...mask.polygons.map((points) => `<polygon points="${points.join(" ")}"/>`),
    ...strokes.map((stroke) =>
      stroke.points.length === 2
        ? `<circle cx="${stroke.points[0]}" cy="${stroke.points[1]}" r="${stroke.width / 2}"/>`
        : `<polyline points="${stroke.points.join(" ")}" fill="none" stroke-width="${stroke.width}"/>`,
    ),
  ].join("");
  const blur = soft > 0 ? `<filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${soft / 2}"/></filter>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">` +
    `<defs>${blur}<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${Math.round(width)}" height="${Math.round(height)}">` +
    `<rect width="100%" height="100%" fill="${inside ? "black" : "white"}"/>` +
    `<g fill="${paint}" stroke="${paint}" stroke-linecap="round" stroke-linejoin="round"${soft > 0 ? ' filter="url(#s)"' : ""}>${shapes}</g>` +
    `</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

// Where the mask sits on screen for the camera (map pixel x, y at camera.x + x * scale).
export function fxMaskStyle(image: string, width: number, height: number, camera: { x: number; y: number; scale: number }): CSSProperties {
  const size = `${width * camera.scale}px ${height * camera.scale}px`;
  const position = `${camera.x}px ${camera.y}px`;
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskSize: size,
    WebkitMaskSize: size,
    maskPosition: position,
    WebkitMaskPosition: position,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  };
}
