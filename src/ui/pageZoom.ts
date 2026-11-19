// A player's UI scale is a CSS zoom on the page (src/ui/chatCommands.ts applyUiScale; the GM app zooms the window
// instead). Under it a pointer's clientX/clientY and getBoundingClientRect() are in zoomed pixels, while every style
// and the map's camera are in CSS pixels: anything that turns one into the other divides by the zoom first.

// The page's zoom (1 without one). Read from the inline style applyUiScale sets, so it costs no layout.
export function pageZoom(): number {
  const zoom = Number.parseFloat(document.documentElement.style.zoom);
  return zoom > 0 ? zoom : 1;
}

// An element's box in CSS pixels.
export function cssRect(element: Element): DOMRect;
export function cssRect(element: Element | null | undefined): DOMRect | undefined;
export function cssRect(element: Element | null | undefined): DOMRect | undefined {
  if (!element) return undefined;
  const box = element.getBoundingClientRect();
  const zoom = pageZoom();
  return zoom === 1 ? box : new DOMRect(box.x / zoom, box.y / zoom, box.width / zoom, box.height / zoom);
}

// A pointer's position in CSS pixels.
export const cssX = (clientX: number) => clientX / pageZoom();
export const cssY = (clientY: number) => clientY / pageZoom();
