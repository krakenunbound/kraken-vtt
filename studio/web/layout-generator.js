/* Kraken Map Studio: turn a Battle Map Forge layout into editor geometry.
 * Dependency-free so it runs in the browser and in the Node tests. One
 * generator cell is one Map Studio grid square (5 ft). */
(function (root, factory) {
  const api = factory(root.KrakenBattleMapForge || (typeof require === "function" ? require("./vendor/battle-map-forge.js") : null));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.KrakenLayout = api;
})(typeof window !== "undefined" ? window : globalThis, function (engine) {
  "use strict";

  // Setting -> menu label and default floors (Shockbolt starter-pack names).
  const SETTINGS = [
    { id: "ancient-stronghold", label: "Ancient stronghold", room: "stone_tiles_b_01", corridor: "stone_floor_b_01" },
    { id: "buried-temple", label: "Buried temple", room: "stone_tiles_c_01", corridor: "darkgrey_floor_a_01" },
    { id: "natural-cavern", label: "Natural cavern", room: "dirt_flat_a_01", corridor: "gravel_grey_a_01" },
    { id: "dwarven-mine", label: "Dwarven mine", room: "stone_floor_b_02", corridor: "gravel_grey_a_02" },
    { id: "crypt-catacomb", label: "Crypt or catacomb", room: "darkgrey_floor_a_02", corridor: "stone_floor_b_01" },
    { id: "merchant-cellar", label: "Merchant cellar", room: "wooden_floor_a_01", corridor: "stone_floor_b_01" },
    { id: "coastal-lighthouse", label: "Coastal lighthouse", room: "stone_tiles_b_02", corridor: "sandy_floor_a_01" },
    { id: "wayside-tavern", label: "Wayside tavern", room: "wooden_floor_c_01", corridor: "wooden_floor_b_01" },
    { id: "kobold-warren", label: "Kobold warren", room: "dirt_flat_a_02", corridor: "dirt_flat_a_01" },
  ];
  // Natural caverns join rooms through open rock clefts, not doors.
  const OPEN_THRESHOLDS = new Set(["natural-cavern"]);

  function generate(options) {
    if (!engine) throw Error("The layout generator did not load.");
    const o = options || {};
    return engine.generateMap({
      seed: String(o.seed || "").trim() || "first-forge", setting: o.setting,
      composition: o.composition === "sprawling" ? "sprawling" : "compact",
      roomCount: int(o.roomCount, 8), loopCount: int(o.loopCount, 2), deadEndCount: int(o.deadEndCount, 0),
    });
  }
  function int(value, fallback) { const n = Math.round(Number(value)); return Number.isFinite(n) ? n : fallback; }

  const key = (x, y) => x + "," + y;
  // A unit edge is "h,x,y" (from x,y to x+1,y) or "v,x,y" (from x,y to x,y+1).
  function edgeBetween(a, b) {
    if (a.x !== b.x) return "v," + Math.max(a.x, b.x) + "," + a.y;
    return "h," + a.x + "," + Math.max(a.y, b.y);
  }
  function cellEdges(x, y) {
    return [
      ["h," + x + "," + y, x, y - 1], ["h," + x + "," + (y + 1), x, y + 1],
      ["v," + x + "," + y, x - 1, y], ["v," + (x + 1) + "," + y, x + 1, y],
    ];
  }
  /** Joins unit edges into the fewest straight runs, in a stable order. */
  function mergeEdges(edges) {
    const lines = new Map();
    for (const edge of edges) {
      const [dir, x, y] = edge.split(","), a = Number(x), b = Number(y);
      const line = dir === "h" ? "h," + b : "v," + a;
      if (!lines.has(line)) lines.set(line, []);
      lines.get(line).push(dir === "h" ? a : b);
    }
    const runs = [];
    for (const line of [...lines.keys()].sort(compareLines)) {
      const [dir, at] = line.split(","), fixed = Number(at);
      const steps = [...new Set(lines.get(line))].sort((p, q) => p - q);
      for (let i = 0; i < steps.length; ) {
        let j = i;
        while (j + 1 < steps.length && steps[j + 1] === steps[j] + 1) j++;
        runs.push(dir === "h" ? [steps[i], fixed, steps[j] + 1, fixed] : [fixed, steps[i], fixed, steps[j] + 1]);
        i = j + 1;
      }
    }
    return runs;
  }
  function compareLines(p, q) {
    const [dp, ap] = p.split(","), [dq, aq] = q.split(",");
    return dp === dq ? Number(ap) - Number(aq) : dp < dq ? -1 : 1;
  }

  /**
   * Map Studio geometry for a generated layout: floor regions by cell, wall
   * runs on every edge between floor and void or between different rooms
   * and corridors, a door on each canonical opening, and stair placements.
   * Coordinates are pixels in a map trimmed to the layout plus `margin` cells.
   */
  function toStudio(map, options) {
    const o = options || {}, grid = Number(o.grid) > 0 ? Number(o.grid) : 50;
    const margin = o.margin == null ? 2 : Math.max(0, int(o.margin, 2));
    const owner = new Map();
    for (const room of map.rooms) for (const c of room.cells) owner.set(key(c.x, c.y), room.id);
    for (const c of map.corridorCells) if (!owner.has(key(c.x, c.y))) owner.set(key(c.x, c.y), "corridor");
    const cells = [...owner.keys()].map(k => k.split(",").map(Number));
    if (!cells.length) throw Error("The generator returned no floor.");
    const minX = Math.min(...cells.map(c => c[0])) - margin, minY = Math.min(...cells.map(c => c[1])) - margin;
    const maxX = Math.max(...cells.map(c => c[0])) + margin, maxY = Math.max(...cells.map(c => c[1])) + margin;
    const px = v => v * grid;

    // Doors: each canonical door's opening, unless the setting uses open clefts.
    const openings = new Map();
    for (const door of map.doors) for (const [a, b] of door.openingEdges) openings.set(edgeBetween(a, b), door.id);
    const boundary = new Set();
    for (const [x, y] of cells) {
      const mine = owner.get(key(x, y));
      for (const [edge, nx, ny] of cellEdges(x, y)) if (owner.get(key(nx, ny)) !== mine) boundary.add(edge);
    }
    const shift = run => ({ x1: px(run[0] - minX), y1: px(run[1] - minY), x2: px(run[2] - minX), y2: px(run[3] - minY) });
    const walls = mergeEdges([...boundary].filter(edge => !openings.has(edge)))
      .map((run, i) => Object.assign({ id: "layout-wall-" + String(i + 1).padStart(3, "0"), kind: "wall" }, shift(run)));
    const openThresholds = OPEN_THRESHOLDS.has(map.setting);
    const doors = [];
    if (!openThresholds) for (const door of map.doors) {
      const edges = door.openingEdges.map(([a, b]) => edgeBetween(a, b)).filter(edge => boundary.has(edge));
      mergeEdges(edges).forEach((run, i, all) => doors.push(Object.assign({
        id: "layout-" + door.id + (all.length > 1 ? "-" + (i + 1) : ""), kind: "door", open: !!o.doorsOpen,
      }, shift(run))));
    }

    // Floor regions: one per room, one per connected run of corridor floor.
    const regions = map.rooms.map((room, i) => ({
      id: "layout-" + room.id, kind: "room", roomType: room.type,
      name: "Room " + (i + 1) + " floor (" + String(room.type || "room").replace(/-/g, " ") + ")",
      cells: room.cells.filter(c => owner.get(key(c.x, c.y)) === room.id).map(c => ({ x: c.x - minX, y: c.y - minY })),
    }));
    const seen = new Set();
    for (const c of map.corridorCells.slice().sort((p, q) => p.y - q.y || p.x - q.x)) {
      const start = key(c.x, c.y);
      if (owner.get(start) !== "corridor" || seen.has(start)) continue;
      const part = [], queue = [[c.x, c.y]];
      seen.add(start);
      while (queue.length) {
        const [x, y] = queue.pop();
        part.push({ x: x - minX, y: y - minY });
        for (const [, nx, ny] of cellEdges(x, y)) {
          const k = key(nx, ny);
          if (owner.get(k) === "corridor" && !seen.has(k)) { seen.add(k); queue.push([nx, ny]); }
        }
      }
      part.sort((p, q) => p.y - q.y || p.x - q.x);
      const n = regions.filter(r => r.kind === "corridor").length + 1;
      regions.push({ id: "layout-corridor-" + n, kind: "corridor", name: "Corridor " + n + " floor", cells: part });
    }
    for (const region of regions) {
      const xs = region.cells.map(c => c.x), ys = region.cells.map(c => c.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      region.bounds = { x: px(x), y: px(y), width: px(Math.max(...xs) - x + 1), height: px(Math.max(...ys) - y + 1) };
    }

    // Stairs use Battle Map Forge's footprint, in its landing room, with the
    // flight ending on the doorway where the level changes. They are laid out
    // for art whose flight runs along +x and goes down toward +x, turned so it
    // goes down toward the lower side.
    const stairs = (map.elevationTransitions || []).filter(t => t.placement && t.endpoints && t.endpoints.length === 2).map(t => {
      const p = t.placement, near = t.endpoints.find(e => e.roomId === p.roomId) || t.endpoints[0];
      const far = t.endpoints.find(e => e !== near);
      const across = { x: Math.sign(far.cell.x - near.cell.x), y: Math.sign(far.cell.y - near.cell.y) };
      const down = far.elevation < near.elevation ? across : { x: -across.x, y: -across.y };
      const edges = t.openingEdges && t.openingEdges.length ? t.openingEdges : [[near.cell, far.cell]];
      const mid = edges.reduce((sum, [a, b]) => ({ x: sum.x + (a.x + b.x + 1) / 2 / edges.length, y: sum.y + (a.y + b.y + 1) / 2 / edges.length }), { x: 0, y: 0 });
      const width = px(p.height), height = px(p.width);
      const cx = px(mid.x - minX - across.x * p.height / 2), cy = px(mid.y - minY - across.y * p.height / 2);
      return { id: "layout-" + t.id, kind: t.kind, doorId: t.doorId,
        rotation: (Math.round(Math.atan2(down.y, down.x) * 180 / Math.PI) + 360) % 360,
        x: cx - width / 2, y: cy - height / 2, width, height };
    });

    return {
      width: px(maxX - minX + 1), height: px(maxY - minY + 1), grid, origin: { x: minX, y: minY },
      regions, walls: walls.concat(doors), stairs, openThresholds,
      layout: {
        generator: map.format, seed: map.seed, setting: map.setting, composition: map.requested.composition,
        roomCount: map.requested.roomCount, loopCount: map.requested.loopCount, deadEndCount: map.requested.deadEndCount,
        valid: !!(map.validation && map.validation.valid),
      },
    };
  }

  return { SETTINGS, OPEN_THRESHOLDS, generate, toStudio, edgeBetween, mergeEdges };
});
