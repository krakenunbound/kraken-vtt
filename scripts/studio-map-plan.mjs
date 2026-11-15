// Shared by the scripts/studio-map-*.mjs build scripts: a map planned as boxes of
// floor (areas) turned into wall lines for Map Studio's Wall tool, and the end of
// every build (check, renders, export).
//
// wallRuns(areas, doors, { zones, open }):
//   areas: [{ zone, x, y, w, h, group }] in squares (halves allowed). Cells of the
//     same group are one space (no wall between them); group defaults to the zone.
//   zones: { name: { wall: "wall art" | null, outer } }, the wall art drawn on that zone's
//     edges (outer, if given, on its edges to the outside: a building's outer walls).
//   doors: [{ from, to, kind }]: wall lines stop at a door's gap (a secret door's
//     line carries on, so its wall art crosses it).
//   open(edge): true for an edge to the outside (no floor, or a zone with no wall
//     art) left open: a mouth, a yard gate, a shore.
// Returns [{ art, closed, points }], each wall line as one path (corners only).
import path from "node:path";

const S = 2; // half squares

export function wallRuns(areas, doors, { zones, open = () => false } = {}) {
  const cells = new Map();
  for (const a of areas) for (let cx = a.x * S; cx < (a.x + a.w) * S; cx++) for (let cy = a.y * S; cy < (a.y + a.h) * S; cy++) cells.set(`${cx},${cy}`, { zone: a.zone, group: a.group ?? a.zone });
  const doorEdges = new Set();
  const secretEdges = new Set();
  for (const d of doors) {
    const [x1, y1] = d.from.map((v) => v * S), [x2, y2] = d.to.map((v) => v * S);
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i < steps; i++) {
      const a = [x1 + Math.sign(x2 - x1) * i, y1 + Math.sign(y2 - y1) * i], b = [a[0] + Math.sign(x2 - x1), a[1] + Math.sign(y2 - y1)];
      (d.kind === "secret" ? secretEdges : doorEdges).add(`${a}|${b}`).add(`${b}|${a}`);
    }
  }
  const drawn = new Set();
  const edges = [];
  for (const [key, cell] of cells) {
    const art = zones[cell.zone]?.wall;
    if (!art) continue;
    const [cx, cy] = key.split(",").map(Number);
    for (const [dx, dy, a, b] of [[0, -1, [cx, cy], [cx + 1, cy]], [1, 0, [cx + 1, cy], [cx + 1, cy + 1]], [0, 1, [cx + 1, cy + 1], [cx, cy + 1]], [-1, 0, [cx, cy + 1], [cx, cy]]]) {
      const k = `${a}|${b}`;
      if (doorEdges.has(k) || drawn.has(k)) continue;
      const other = cells.get(`${cx + dx},${cy + dy}`);
      if (other && other.group === cell.group) continue;
      if ((!other || !zones[other.zone]?.wall) && open({ a: a.map((v) => v / S), b: b.map((v) => v / S), zone: cell.zone })) continue;
      drawn.add(k).add(`${b}|${a}`);
      const outside = !other || !zones[other.zone]?.wall;
      edges.push({ a, b, art: (outside && zones[cell.zone].outer) || art });
    }
  }
  return chains(edges);
}

// Edges joined into the longest paths of one wall art each (the Wall tool mitres the corners).
function chains(list) {
  const out = [];
  const byArt = new Map();
  for (const e of list) (byArt.get(e.art) ?? byArt.set(e.art, []).get(e.art)).push(e);
  for (const [art, group] of byArt) {
    const from = new Map();
    for (const e of group) (from.get(String(e.a)) ?? from.set(String(e.a), []).get(String(e.a))).push(e);
    const used = new Set();
    const starts = group.filter((e) => !group.some((f) => String(f.b) === String(e.a))).concat(group);
    for (const first of starts) {
      if (used.has(first)) continue;
      const pts = [first.a];
      let e = first;
      while (e && !used.has(e)) {
        used.add(e);
        pts.push(e.b);
        const next = (from.get(String(e.b)) ?? []).filter((f) => !used.has(f));
        e = next.length === 1 ? next[0] : next.find((f) => (f.b[0] - f.a[0]) * (e.b[1] - e.a[1]) - (f.b[1] - f.a[1]) * (e.b[0] - e.a[0]) < 0) ?? next[0];
      }
      const closed = String(pts[0]) === String(pts.at(-1));
      const corners = pts.filter((p, i) => {
        if (i === 0 || i === pts.length - 1) return true;
        const [a, b] = [pts[i - 1], pts[i + 1]];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      if (closed) corners.pop();
      out.push({ art, closed, points: corners.map(([x, y]) => [x / S, y / S]) });
    }
  }
  return out;
}

// A build step with its label in any error.
export const stepper = (k) => async (label, action, args) => {
  try {
    return await k.studio(action, args);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
};

// The end of every build: check (no art outside the shipped packs), renders
// (picture, editor, each play test), the export into the book's maps folder.
// plays: [{ token, light, vision, name }]
export async function finish(step, { name, out, renders, plays = [] }) {
  const check = await step("check", "check", {});
  console.log("check:", JSON.stringify(check, null, 1));
  if (check.art?.outside?.length) throw new Error(`art outside the shipped packs: ${check.art.outside.join(", ")}`);
  const views = [["picture", {}], ["editor", { lighting: true }], ...plays.map((p) => ["play", { token: p.token, light: p.light ?? "none", vision: p.vision ?? "normal", file: path.join(renders, `play-${p.name}.png`) }])];
  for (const [view, extra] of views) {
    const made = await step(`render ${view}`, "render", { view, file: extra.file ?? path.join(renders, `${view}.png`), ...extra });
    console.log("render:", made.file, made.width, made.height);
  }
  const exported = await step("export", "export", { folder: out, name, portable: false });
  console.log("export:", JSON.stringify(exported));
  const portable = await step("portable", "export", { folder: renders, name });
  console.log("portable:", portable.project);
  return check;
}
