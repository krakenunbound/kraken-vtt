/* Line of sight: FG's occluder tools, types and options for drawing and editing walls. */
window.KrakenLOS = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  // type id -> label, the flags FG writes for that type (read from FG 5.1.14 saves), colour, dash, help
  const TYPES = {
    wall: ['Wall', [], '#e53935', [], 'Walls block both visibility and movement.'],
    terrain: ['Terrain', ['toggleable', 'hidden', 'single_sided', 'terrain', 'allow_move', 'closed', 'counterclockwise'], '#43a047', [], 'Tokens can see into terrain but not out of it; ignored by a token inside. Must be a closed shape. Foliage, rubble piles.'],
    door: ['Door', ['toggleable'], '#1e64e6', [], 'Blocks vision and movement. Opened and closed by the GM or players; the GM can lock it.'],
    secret: ['Toggleable Wall', ['toggleable', 'hidden'], '#1e64e6', [10, 6], 'A wall the GM can open. Secret doors.'],
    window: ['Window', ['toggleable', 'allow_vision'], '#f2c218', [], 'Blocks movement but not vision. Windows, portcullises.'],
    invisible: ['Invisible Wall', ['allow_vision'], '#b0bec5', [2, 5], 'Blocks movement but not vision or light, and cannot be opened. Glass, a force field, a ledge you can see over.'],
    illusion: ['Illusionary Wall', ['allow_move'], '#f2c218', [10, 6], 'Blocks vision but not movement. Curtains, illusions.'],
    pit: ['Pit', ['toggleable', 'hidden', 'single_sided', 'pit', 'closed', 'counterclockwise'], '#e53935', [3, 4], 'Blocks movement and vision for a token inside it. Must be a closed shape.'],
    shadow: ['Shadow Caster', ['shadow'], '#9be08f', [10, 6], 'Blocks light only; tokens ignore it.'],
    razor: ['Razor', [], '#ffffff', [4, 4], 'Splits existing walls where it crosses them. Not added to the map.'],
  };
  const FLAGS = [['toggleable', 'Toggleable', 'Can be opened and closed in play. Players can toggle it unless Hidden is set.'],
    ['hidden', 'Hidden', 'Hides the open/close control from players.'], ['open', 'Open', 'Starts open.'],
    ['locked', 'Locked', 'Players cannot open or close it.'], ['single_sided', 'Single-sided', 'Blocks vision in one direction only.'],
    ['terrain', 'Terrain', 'Ignored by a token inside the shape.'], ['pit', 'Pit', 'Only active for a token inside the shape.'],
    ['allow_move', 'Allow movement', 'Tokens can move through it.'], ['allow_vision', 'Allow vision', 'Does not block vision.'],
    ['closed', 'Closed shape', 'Joins the last point to the first.'], ['counterclockwise', 'Counter-clockwise', 'Reverses the point order (flips single-sided walls).'],
    ['shadow', 'Shadows only', 'Affects lights only; tokens ignore it.']];
  const FLAG_IDS = FLAGS.map(f => f[0]);
  const LEGACY = {wall: 'wall', door: 'door', window: 'window'};

  let tool = 'line', type = 'wall', draft = [...TYPES.wall[1]], split = false, pointSnap = true;
  let drawing = null, gesture = null, hover = null, sel = new Map(), project = null, cursorAt = null;
  let artSel = new Set();  // ids of wall art pieces selected with the Select tool
  const uid = () => 'wall-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const active = () => S().mode === 'los';

  function typeFromFlags(f) {
    const s = new Set(f);
    if (s.has('pit')) return 'pit';
    if (s.has('terrain')) return 'terrain';
    if (s.has('shadow')) return 'shadow';
    if (s.has('toggleable') && s.has('allow_vision')) return 'window';
    if (s.has('toggleable') && s.has('hidden')) return 'secret';
    if (s.has('toggleable')) return 'door';
    if (s.has('allow_move') && !s.has('allow_vision')) return 'illusion';
    if (s.has('allow_vision') && !s.has('allow_move')) return 'invisible';
    return 'wall';
  }

  // Older projects stored two-point {kind, x1..y2} walls.
  function normalizeWall(o) {
    if (o && !o.points && 'x1' in o) {
      const kind = LEGACY[o.kind] || 'wall', rest = {...o};
      ['kind', 'x1', 'y1', 'x2', 'y2', 'open'].forEach(k => delete rest[k]);
      return {...rest, type: kind, points: [o.x1, o.y1, o.x2, o.y2], flags: [...TYPES[kind][1], ...(o.open && kind !== 'wall' ? ['open'] : [])]};
    }
    if (!o || !Array.isArray(o.points) || o.points.length < 4 || o.points.length % 2) throw Error('A wall needs at least two points.');
    if (o.points.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw Error('Wall points must be numbers.');
    const flags = FLAG_IDS.filter(f => (o.flags || []).includes(f));
    return {...o, flags, type: TYPES[o.type] && o.type !== 'razor' ? o.type : typeFromFlags(flags)};
  }
  const normalizeAll = p => {
    p.walls = (p.walls || []).map(normalizeWall);
    // Maps made from a picture before the grid could be lined up: don't snap walls to a guessed grid.
    if (p.wallGridSnap === undefined && !p.gridOffset && (p.layers || []).some(l => l.id === 'map' && l.locked) &&
        p.objects.length && p.objects.every(o => o.layer === 'map' || o.layer === 'objects') && !p.fgSource && !p.layout) p.wallGridSnap = false;
  };

  const pts = w => { const a = []; for (let i = 0; i < w.points.length; i += 2) a.push({x: w.points[i], y: w.points[i + 1]}); return a; };
  const setPts = (w, list) => { w.points = list.flatMap(q => [q.x, q.y]); };
  const isClosed = w => w.flags.includes('closed') && w.points.length >= 6;
  const segsOf = w => { const a = pts(w), s = a.slice(1).map((q, i) => [a[i], q]); if (isClosed(w)) s.push([a.at(-1), a[0]]); return s; };

  // What blocks a token's view, for the Player view preview.
  function visionSegments(p) {
    return (p.walls || []).filter(w => {
      const f = new Set(w.flags || []);
      return !f.has('allow_vision') && !f.has('shadow') && !f.has('terrain') && !f.has('pit') && !(f.has('toggleable') && f.has('open'));
    }).flatMap(w => segsOf(w).map(([a, b]) => ({kind: 'wall', x1: a.x, y1: a.y, x2: b.x, y2: b.y})));
  }

  // --- geometry ---------------------------------------------------------------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function intersect(a, b, c, d) {
    const r = {x: b.x - a.x, y: b.y - a.y}, s = {x: d.x - c.x, y: d.y - c.y}, den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? {x: a.x + t * r.x, y: a.y + t * r.y, t} : null;
  }
  function simplify(list, eps) {
    if (list.length < 3) return list.map((_, i) => i);
    const keep = new Set([0, list.length - 1]);
    (function dp(i, j) {
      let best = -1, at = -1;
      for (let k = i + 1; k < j; k++) { const d = segDist(list[k], list[i], list[j]); if (d > best) { best = d; at = k; } }
      if (best > eps) { keep.add(at); dp(i, at); dp(at, j); }
    })(0, list.length - 1);
    return [...keep].sort((a, b) => a - b);
  }

  // --- snapping ----------------------------------------------------------------
  function snapPoint(q, e, exclude) {
    const p = S().project, grid = (p.wallGridSnap !== false) !== !!(e && (e.ctrlKey || e.metaKey));
    if (pointSnap) {
      const tol = Math.max(p.grid * 0.1, 6 / S().zoom);
      let best = null, bd = tol;
      for (const w of p.walls) pts(w).forEach((v, i) => {
        if (exclude && exclude.has(w.id + ':' + i)) return;
        const d = dist(v, q); if (d < bd) { bd = d; best = v; }
      });
      if (best) return {x: best.x, y: best.y};
    }
    if (!grid) return q;
    // corners, edge midpoints and centres of the squares (half-square steps), on the picture's grid
    const h = p.grid / 2, ox = Number(p.gridOffset?.x) || 0, oy = Number(p.gridOffset?.y) || 0;
    return {x: Math.round((q.x - ox) / h) * h + ox, y: Math.round((q.y - oy) / h) * h + oy};
  }
  function angle45(from, q) {
    const dx = q.x - from.x, dy = q.y - from.y, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, r = Math.hypot(dx, dy);
    return {x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r};
  }

  // --- creating ------------------------------------------------------------------
  function dedupe(list) { return list.filter((q, i) => !i || dist(q, list[i - 1]) > 0.01); }
  function addShape(list, closed) {
    const p = S().project;
    list = dedupe(list);
    if (closed && list.length > 2 && dist(list[0], list.at(-1)) < 0.01) list.pop();
    if (list.length < 2 || (list.length === 2 && dist(list[0], list[1]) < 1)) return;
    if (type === 'razor') { razor(list); return; }
    const flags = draft.filter(f => f !== 'closed');
    const needClosed = closed || flags.includes('terrain') || flags.includes('pit');
    if (needClosed && list.length >= 3) flags.push('closed');
    S().snapshot();
    const w = normalizeWall({id: uid(), type, points: list.flatMap(q => [q.x, q.y]), flags});
    if (split) splitAgainst(w);
    p.walls.push(w);
    S().save(); S().draw();
  }
  function splitAgainst(w) {  // add a point to existing walls where the new one crosses them
    const segsW = segsOf(w);
    for (const other of S().project.walls) {
      const list = pts(other), out = [];
      const segs = segsOf(other);
      segs.forEach(([a, b], i) => {
        out.push(a);
        const hits = segsW.map(([c, d]) => intersect(a, b, c, d)).filter(Boolean).sort((m, n) => m.t - n.t);
        hits.forEach(h => out.push({x: h.x, y: h.y}));
        if (i === segs.length - 1 && !isClosed(other)) out.push(b);
      });
      if (out.length !== list.length) setPts(other, out);
    }
  }
  function razor(list) {
    const p = S().project, cut = list.slice(1).map((q, i) => [list[i], q]), next = [];
    S().snapshot();
    for (const w of p.walls) {
      const segs = segsOf(w), pieces = [[]];
      segs.forEach(([a, b], i) => {
        pieces.at(-1).push(a);
        const hits = cut.map(([c, d]) => intersect(a, b, c, d)).filter(Boolean).sort((m, n) => m.t - n.t)
          .filter((h, k, all) => !k || dist(h, all[k - 1]) > 0.01);
        for (const h of hits) { pieces.at(-1).push({x: h.x, y: h.y}); pieces.push([{x: h.x, y: h.y}]); }
        if (i === segs.length - 1) pieces.at(-1).push(b);
      });
      if (pieces.length === 1) { next.push(w); continue; }
      if (isClosed(w)) { const first = pieces.shift(); pieces[pieces.length - 1] = pieces.at(-1).concat(first.slice(1)); }
      const flags = w.flags.filter(f => f !== 'closed');
      pieces.map(dedupe).filter(q => q.length >= 2).forEach((q, i) => next.push({...w, id: i ? uid() : w.id, flags, points: q.flatMap(v => [v.x, v.y])}));
    }
    p.walls = next; sel.clear();
    S().save(); S().draw();
  }
  function ellipse(a, b, center, square) {
    let cx = center ? a.x : (a.x + b.x) / 2, cy = center ? a.y : (a.y + b.y) / 2;
    let rx = center ? Math.abs(b.x - a.x) : Math.abs(b.x - a.x) / 2, ry = center ? Math.abs(b.y - a.y) : Math.abs(b.y - a.y) / 2;
    if (square) { rx = ry = Math.max(rx, ry); if (!center) { cx = a.x + Math.sign(b.x - a.x) * rx; cy = a.y + Math.sign(b.y - a.y) * ry; } }
    const n = Math.max(12, Math.min(32, Math.round((rx + ry) / 10)));
    return Array.from({length: n}, (_, i) => ({x: cx + rx * Math.cos(2 * Math.PI * i / n), y: cy + ry * Math.sin(2 * Math.PI * i / n)}));
  }
  function rect(a, b, center, square) {
    let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
    if (square) { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
    if (center) { x0 = a.x - (x1 - a.x); y0 = a.y - (y1 - a.y); }
    return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
  }
  function finishLine(closed) {
    if (!drawing) return;
    const list = drawing.points;
    drawing = null;
    addShape(list, closed);
  }

  // --- selection ----------------------------------------------------------------
  const selectedWalls = () => S().project.walls.filter(w => sel.has(w.id));
  function pointAt(q) {
    const tol = 7 / S().zoom; let best = null, bd = tol;
    for (const w of S().project.walls) pts(w).forEach((v, i) => { const d = dist(v, q); if (d < bd) { bd = d; best = {w, i}; } });
    return best;
  }
  function wallAt(q) {
    const tol = 6 / S().zoom; let best = null, bd = tol;
    for (const w of S().project.walls) for (const [a, b] of segsOf(w)) { const d = segDist(q, a, b); if (d < bd) { bd = d; best = w; } }
    return best;
  }
  // Wall art on the map (pieces placed from the library, or walls drawn with the Wall tool) can be
  // selected here too, so a wall's art and its line-of-sight lines are tidied up in one place.
  function isWallPiece(o) {
    if (o.layer === 'map' || o.visible === false || o.locked || window.KrakenLayers?.locked(o) || window.KrakenLayers?.hidden(o)) return false;
    if (o.wallPath) return true;
    const a = S().assets.find(v => v.id === o.assetId);
    const name = (o.name || '') + ' ' + (a?.name || '');
    return /wall/i.test(name) && !/(torch|shield|sconce|banner|candle|lamp|lantern|painting|tapestry|mirror|clock|hook|trophy|plaque|decor)/i.test(name);  // not things hung on a wall
  }
  const wallPieces = () => S().project.objects.filter(isWallPiece);
  const pieceAt = q => wallPieces().reverse().find(o => window.KrakenEditorCore.rotatedHitTest(o, q));
  function selectPiece(o, add) {
    if (!add) { sel.clear(); artSel.clear(); }
    const members = o.groupId ? S().project.objects.filter(v => v.groupId === o.groupId && isWallPiece(v)) : [o];
    if (add && artSel.has(o.id)) members.forEach(v => artSel.delete(v.id)); else members.forEach(v => artSel.add(v.id));
  }
  function deleteSelection() {  // the selected points (and their segments) and the selected wall art
    if (!artSel.size) { deletePoints(); return; }
    const p = S().project, groups = new Set(p.objects.filter(o => artSel.has(o.id) && o.wallPath && o.groupId).map(o => o.groupId));
    if (sel.size) deletePoints(); else S().snapshot();
    p.objects = p.objects.filter(o => !artSel.has(o.id));
    p.walls = p.walls.filter(w => !(w.groupId && groups.has(w.groupId)));  // the Wall tool's own line-of-sight wall goes with its art
    artSel.clear(); sel.clear(); S().save(); S().draw(); renderPanel();
  }
  function selectPoint(w, i, add, toggle) {
    if (!add && !toggle) sel.clear();
    const set = sel.get(w.id) || new Set();
    if (toggle && set.has(i)) set.delete(i); else set.add(i);
    set.size ? sel.set(w.id, set) : sel.delete(w.id);
  }
  function selectWall(w, add) {
    if (!add) sel.clear();
    sel.set(w.id, new Set(pts(w).map((_, i) => i)));
  }

  // --- actions on selected points ------------------------------------------------------
  function changeType() {
    if (!sel.size) { S().toast('Select walls first (Select tool), then choose a type and press Change type.', true); return; }
    S().snapshot();
    for (const w of selectedWalls()) {
      const flags = [...draft.filter(f => f !== 'closed')];
      if (isClosed(w) || ((flags.includes('terrain') || flags.includes('pit')) && w.points.length >= 6)) flags.push('closed');
      Object.assign(w, normalizeWall({...w, type, flags}));
    }
    S().save(); S().draw();
  }
  function removePoints() {  // drop the points but keep the shape joined
    if (!sel.size) return;
    S().snapshot();
    const p = S().project;
    p.walls = p.walls.flatMap(w => {
      const set = sel.get(w.id); if (!set) return [w];
      const keep = pts(w).filter((_, i) => !set.has(i));
      if (keep.length < 2) return [];
      setPts(w, keep); if (keep.length < 3) w.flags = w.flags.filter(f => f !== 'closed');
      return [w];
    });
    sel.clear(); S().save(); S().draw();
  }
  function deletePoints() {  // delete the points and the segments that use them
    if (!sel.size) return;
    S().snapshot();
    const p = S().project;
    p.walls = p.walls.flatMap(w => {
      const set = sel.get(w.id); if (!set) return [w];
      let list = pts(w).map((v, i) => ({...v, i}));
      if (isClosed(w)) {
        const first = list.findIndex(v => set.has(v.i));
        list = list.slice(first + 1).concat(list.slice(0, first));
      }
      const runs = [[]];
      for (const v of list) set.has(v.i) ? runs.push([]) : runs.at(-1).push(v);
      const flags = w.flags.filter(f => f !== 'closed');
      return runs.filter(r => r.length >= 2).map((r, k) => ({...w, id: k ? uid() : w.id, flags, points: r.flatMap(v => [v.x, v.y])}));
    });
    sel.clear(); S().save(); S().draw();
  }
  function simplifyPoints() {
    if (!sel.size) return;
    S().snapshot();
    const eps = S().project.grid * 0.1;
    for (const w of selectedWalls()) {
      const list = pts(w), set = sel.get(w.id), keep = new Set(simplify(list, eps));
      const out = list.filter((_, i) => keep.has(i) || !set.has(i));
      if (out.length >= 2) setPts(w, out);
    }
    sel.clear(); S().save(); S().draw();
  }
  function setFlag(flag, on) {
    if (sel.size) {
      S().snapshot();
      for (const w of selectedWalls()) {
        w.flags = on ? [...new Set([...w.flags, flag])] : w.flags.filter(f => f !== flag);
        if (flag === 'closed' && on && w.points.length < 6) w.flags = w.flags.filter(f => f !== 'closed');
        w.flags = FLAG_IDS.filter(f => w.flags.includes(f));
        if (flag === 'counterclockwise') setPts(w, pts(w).reverse());
        w.type = typeFromFlags(w.flags);
      }
      S().save(); S().draw();
    } else {
      draft = on ? [...new Set([...draft, flag])] : draft.filter(f => f !== flag);
      renderPanel();
    }
  }

  // --- pointer and keys ------------------------------------------------------------
  function pointerDown(e) {
    if (!active() || e.button !== 0 || S().tool === 'pan') return false;
    const raw = S().point(e), canvas = $('#mapCanvas');
    if (tool === 'select') {
      const hit = pointAt(raw);
      if (hit) {
        const set = sel.get(hit.w.id);
        if (e.ctrlKey || e.metaKey) { selectPoint(hit.w, hit.i, true, true); S().draw(); return true; }
        if (!(set && set.has(hit.i))) selectPoint(hit.w, hit.i, e.shiftKey, false);
        S().snapshot();
        gesture = {kind: 'move', start: raw, before: S().project.walls.map(w => [w.id, [...w.points]]), moved: false};
        canvas.setPointerCapture(e.pointerId); S().draw(); return true;
      }
      const w = wallAt(raw);
      if (w) {  // a wall drawn with the Wall tool: its art comes with it
        if (!e.shiftKey) artSel.clear(); selectWall(w, e.shiftKey);
        if (w.groupId) S().project.objects.filter(o => o.groupId === w.groupId && isWallPiece(o)).forEach(o => artSel.add(o.id));
        S().draw(); renderPanel(); return true;
      }
      const piece = pieceAt(raw);
      if (piece) { selectPiece(piece, e.shiftKey || e.ctrlKey); S().draw(); renderPanel(); return true; }
      if (!e.shiftKey && !e.ctrlKey) { sel.clear(); artSel.clear(); }
      gesture = {kind: 'box', start: raw, end: raw, add: e.shiftKey || e.ctrlKey};
      canvas.setPointerCapture(e.pointerId); S().draw(); return true;
    }
    const q = snapPoint(raw, e);
    if (tool === 'line') {
      if (!drawing) drawing = {points: [q], cursor: q, down: q, freehand: false};
      else {
        const first = drawing.points[0];
        if (drawing.points.length >= 3 && dist(q, first) < 8 / S().zoom) { finishLine(true); return true; }
        drawing.points.push(e.shiftKey ? angle45(drawing.points.at(-1), q) : q);
      }
      drawing.cursor = drawing.points.at(-1);
      drawing.down = raw; drawing.pressed = true;
      canvas.setPointerCapture(e.pointerId); S().draw(); return true;
    }
    gesture = {kind: tool, start: q, end: q};
    canvas.setPointerCapture(e.pointerId); S().draw(); return true;
  }
  function pointerMove(e) {
    if (!active()) return false;
    const raw = S().point(e);
    if (drawing) {
      let q = snapPoint(raw, e);
      if (e.shiftKey && drawing.points.length) q = angle45(drawing.points.at(-1), q);
      if (drawing.pressed && dist(raw, drawing.down) > 6 / S().zoom) drawing.freehand = true;
      if (drawing.pressed && drawing.freehand && dist(raw, drawing.points.at(-1)) > Math.max(4, S().project.grid * 0.15)) drawing.points.push(raw);
      drawing.cursor = q; S().draw(); return true;
    }
    if (!gesture) {
      hover = tool === 'select' ? (pointAt(raw) || null) : null;
      cursorAt = tool === 'select' ? null : snapPoint(raw, e);
      S().draw(); return false;
    }
    if (gesture.kind === 'move') {
      const moving = new Set([...sel].flatMap(([id, set]) => [...set].map(i => id + ':' + i)));
      const lead = snapPoint(raw, e, moving), dx = lead.x - gesture.start.x, dy = lead.y - gesture.start.y;
      const before = new Map(gesture.before);
      for (const w of S().project.walls) {
        const set = sel.get(w.id); if (!set) continue;
        const b = before.get(w.id); w.points = b.map((v, k) => set.has(k >> 1) ? v + (k % 2 ? dy : dx) : v);
      }
      gesture.moved = true; S().draw(); return true;
    }
    gesture.end = gesture.kind === 'box' ? raw : snapPoint(raw, e);
    gesture.alt = e.altKey; gesture.shift = e.shiftKey;
    S().draw(); return true;
  }
  function pointerUp(e) {
    if (!active()) return false;
    if (drawing) {
      drawing.pressed = false;
      if (drawing.freehand) { drawing.freehand = false; }
      return true;
    }
    if (!gesture) return false;
    const g = gesture; gesture = null;
    if (g.kind === 'move') { if (g.moved) S().save(); renderPanel(); S().draw(); return true; }
    if (g.kind === 'box') {
      const x0 = Math.min(g.start.x, g.end.x), x1 = Math.max(g.start.x, g.end.x), y0 = Math.min(g.start.y, g.end.y), y1 = Math.max(g.start.y, g.end.y);
      if (x1 - x0 > 2 / S().zoom || y1 - y0 > 2 / S().zoom) {
        for (const w of S().project.walls) pts(w).forEach((v, i) => {
          if (v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1) { const set = sel.get(w.id) || new Set(); set.add(i); sel.set(w.id, set); }
        });
        for (const o of wallPieces()) {  // wall art whose middle is inside the box
          const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) selectPiece(o, true);
        }
      }
      renderPanel(); S().draw(); return true;
    }
    if (dist(g.start, g.end) < 2) return true;
    const center = e.altKey, square = e.shiftKey;
    addShape(g.kind === 'rect' ? rect(g.start, g.end, center, square) : ellipse(g.start, g.end, center, square), true);
    return true;
  }
  function dblclick(e) {
    if (!active()) return;
    if (drawing) { drawing.points.pop(); finishLine(e.altKey); return; }  // the second click of a double-click added a point
    if (tool === 'select') { const hit = pointAt(S().point(e)) || null, w = hit ? hit.w : wallAt(S().point(e)); if (w) { selectWall(w, e.shiftKey); renderPanel(); S().draw(); } }
  }
  function keyDown(e) {
    if (!active()) return false;
    if (drawing) {
      if (e.key === 'Enter') { drawing.points.push(drawing.cursor); finishLine(e.altKey); return true; }
      if (e.key === ' ') { e.preventDefault(); drawing.points.push(drawing.cursor); S().draw(); return true; }
      if (e.key === 'Escape') { finishLine(false); return true; }
      return false;
    }
    if (tool === 'select' && (sel.size || artSel.size)) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return true; }
      if (e.key === 'Escape') { sel.clear(); artSel.clear(); renderPanel(); S().draw(); return true; }
      if (!sel.size) return false;
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1, d = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]}[e.key];
      if (d) {
        e.preventDefault(); S().snapshot();
        for (const w of selectedWalls()) { const set = sel.get(w.id); w.points = w.points.map((v, k) => set.has(k >> 1) ? v + d[k % 2] : v); }
        S().save(); S().draw(); return true;
      }
    }
    return false;
  }

  // --- drawing -------------------------------------------------------------------
  // A wall line with a dark edge under it, so it stands out on any map picture.
  function strokeShape(ctx, list, closed, color, dash, width, zoom, cased = true) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); list.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); if (closed) ctx.closePath();
    if (cased) { ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = (width + 3) / zoom; ctx.setLineDash([]); ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = width / zoom; ctx.setLineDash(dash.map(v => v / zoom)); ctx.stroke(); ctx.restore();
  }
  function render(ctx, p, zoom) {
    if (p !== project) { project = p; sel.clear(); artSel.clear(); drawing = null; gesture = null; }
    const editing = active(), groupHidden = window.KrakenLayers?.groupHidden('walls');
    if (!groupHidden || editing) {
      for (const w of p.walls) {
        const t = TYPES[w.type] || TYPES.wall, list = pts(w), open = w.flags.includes('open') && w.flags.includes('toggleable');
        if (isClosed(w) && (w.type === 'terrain' || w.type === 'pit')) { ctx.save(); ctx.globalAlpha = .12; ctx.fillStyle = t[2]; ctx.beginPath(); list.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.fill(); ctx.restore(); }
        strokeShape(ctx, list, isClosed(w), open ? t[2] + '88' : t[2], open ? [2, 6] : t[3], sel.has(w.id) ? 6 : 4.5, editing ? zoom : Math.max(zoom, .5));
        if (editing) {
          const set = sel.get(w.id), r = 4 / zoom;
          list.forEach((v, i) => {
            const on = set && set.has(i);
            ctx.fillStyle = on ? '#f0dfab' : '#ffffff'; ctx.strokeStyle = on ? '#a07f22' : '#222'; ctx.lineWidth = 1.2 / zoom;
            ctx.beginPath(); w.type === 'door' || w.type === 'secret' ? (ctx.moveTo(v.x, v.y - r * 1.3), ctx.lineTo(v.x + r * 1.3, v.y), ctx.lineTo(v.x, v.y + r * 1.3), ctx.lineTo(v.x - r * 1.3, v.y), ctx.closePath())
              : w.type === 'window' ? ctx.arc(v.x, v.y, r, 0, 7) : ctx.rect(v.x - r, v.y - r, 2 * r, 2 * r);
            ctx.fill(); ctx.stroke();
          });
        }
      }
    }
    if (!editing) return;
    for (const o of p.objects) if (artSel.has(o.id)) {
      const c = window.KrakenEditorCore.rotatedCorners(o);
      ctx.save(); ctx.strokeStyle = '#f0dfab'; ctx.lineWidth = 2 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath(); [c.nw, c.ne, c.se, c.sw].forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    const t = TYPES[type];
    const mark = drawing ? drawing.cursor : !gesture && cursorAt;
    if (mark) {  // where the next point will land
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.fillStyle = t[2]; ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.arc(mark.x, mark.y, 5 / zoom, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mark.x - 10 / zoom, mark.y); ctx.lineTo(mark.x + 10 / zoom, mark.y); ctx.moveTo(mark.x, mark.y - 10 / zoom); ctx.lineTo(mark.x, mark.y + 10 / zoom); ctx.stroke(); ctx.restore();
    }
    if (drawing) strokeShape(ctx, [...drawing.points, drawing.cursor], false, t[2], [6, 4], 2.5, zoom);
    if (gesture && (gesture.kind === 'rect' || gesture.kind === 'ellipse')) {
      const list = gesture.kind === 'rect' ? rect(gesture.start, gesture.end, gesture.alt, gesture.shift) : ellipse(gesture.start, gesture.end, gesture.alt, gesture.shift);
      strokeShape(ctx, list, true, t[2], [6, 4], 2.5, zoom);
    }
    if (gesture && gesture.kind === 'box') { ctx.save(); ctx.strokeStyle = '#f0dfab'; ctx.lineWidth = 1 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom]); ctx.strokeRect(gesture.start.x, gesture.start.y, gesture.end.x - gesture.start.x, gesture.end.y - gesture.start.y); ctx.restore(); }
  }

  // --- panel -------------------------------------------------------------------
  const esc = s => String(s).replace(/[&<>"]/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[m]);
  function swatch(id) { const t = TYPES[id]; return `<i style="border-top:3px ${t[3].length ? (t[3][0] < 5 ? 'dotted' : 'dashed') : 'solid'} ${t[2]}"></i>`; }
  function renderPanel() {
    const box = $('#losPanel'); if (!box) return;
    const p = S().project, ws = selectedWalls(), count = [...sel.values()].reduce((n, s) => n + s.size, 0);
    const shownFlags = ws.length ? FLAG_IDS.filter(f => ws.every(w => w.flags.includes(f))) : draft;
    box.innerHTML = `
      <div class="los-title">Tools</div>
      <div class="los-tools">${[['select', 'Select', 'Drag to select points. Click a wall to select it; double-click a point to select its whole shape. Shift adds, Ctrl toggles. Drag selected points to move them, or use the arrow keys. Delete removes them. Wall art (pieces of wall from the library, or walls drawn with the Wall tool) is selected the same way and Delete removes it.'],
        ['line', 'Line', 'Click to add points, or drag to draw freehand. Double-click or Enter finishes; Space adds a point and keeps going; Esc stops at the last point. Shift keeps 45° angles, Ctrl flips grid snap, Alt (or clicking the first point) closes the shape.'],
        ['rect', 'Rectangle', 'Drag a rectangle. Alt draws from the centre, Shift makes a square.'],
        ['ellipse', 'Ellipse', 'Drag an ellipse. Alt draws from the centre, Shift makes a circle.']].map(([id, label, help]) =>
          `<button data-los-tool="${id}" class="${tool === id ? 'on' : ''}" title="${esc(help)}">${label}</button>`).join('')}
        <label class="los-opt" title="Add a point to existing walls where the new one crosses them."><input type="checkbox" id="losSplit" ${split ? 'checked' : ''}> Split</label></div>
      <div class="los-title">Type</div>
      <div class="los-types">${Object.entries(TYPES).map(([id, t]) =>
        `<button data-los-type="${id}" class="${type === id ? 'on' : ''}" title="${esc(t[4])}">${swatch(id)}${t[0]}</button>`).join('')}</div>
      <button class="los-action los-change" ${ws.length ? '' : 'disabled'} title="Give the selected walls the type chosen above.">Change type of selected to ${esc(TYPES[type][0])}</button>
      <details class="los-advanced" ${$('#losPanel').dataset.adv === '1' ? 'open' : ''}><summary>Advanced options ${ws.length ? `(for the ${ws.length} selected)` : '(for new walls)'}</summary>
        <div class="los-flags">${FLAGS.map(([id, label, help]) => `<label title="${esc(help)}"><input type="checkbox" data-los-flag="${id}" ${shownFlags.includes(id) ? 'checked' : ''}> ${label}</label>`).join('')}</div></details>
      <div class="los-title">Selected: ${[ws.length ? `${count} point${count === 1 ? '' : 's'} on ${ws.length} wall${ws.length === 1 ? '' : 's'}` : '', artSel.size ? `${artSel.size} piece${artSel.size === 1 ? '' : 's'} of wall art` : ''].filter(Boolean).join(', ') || 'nothing'}</div>
      <div class="los-actions">
        <button data-los-act="remove" ${count ? '' : 'disabled'} title="Remove the points but keep the wall joined. Commonly used to simplify walls.">Remove points</button>
        <button data-los-act="delete" ${count ? '' : 'disabled'} title="Delete the points and the wall segments that use them (Delete key).">Delete points</button>
        <button data-los-act="simplify" ${count ? '' : 'disabled'} title="Reduce the number of points. Can be used more than once.">Simplify</button>
        <button data-los-act="art" ${artSel.size ? '' : 'disabled'} title="Delete the selected wall art (Delete key). A wall drawn with the Wall tool takes its line-of-sight wall with it.">Delete wall art</button></div>
      <div class="los-snaps"><label title="Snap points to the grid's corners, edge middles and square centres (Ctrl flips it while held). Line the grid up with the picture first under Grid &amp; map size."><input type="checkbox" id="losGridSnap" ${p.wallGridSnap !== false ? 'checked' : ''}> Grid snap</label>
        <label title="Snap to existing wall points within 10% of a grid square."><input type="checkbox" id="losPointSnap" ${pointSnap ? 'checked' : ''}> Point snap</label>
        <label title="How far players see past a wall, in grid squares (0.1 = a tenth of a square). Lets them see the wall's own artwork.">Peek <input type="number" id="losPeek" min="0" max="10" step="0.05" value="${Number(p.peek) || 0}"></label></div>
      <p class="los-help">${p.walls.length} wall${p.walls.length === 1 ? '' : 's'} on this map. Hover any button for how it works.</p>`;
    box.querySelectorAll('[data-los-tool]').forEach(b => b.onclick = () => { tool = b.dataset.losTool; drawing = null; renderPanel(); hint(); S().draw(); });
    box.querySelectorAll('[data-los-type]').forEach(b => b.onclick = () => { type = b.dataset.losType; draft = [...TYPES[type][1]]; if (tool === 'select' && !sel.size) tool = 'line'; renderPanel(); hint(); });
    box.querySelector('.los-change').onclick = changeType;
    box.querySelector('.los-advanced').ontoggle = ev => { box.dataset.adv = ev.target.open ? '1' : '0'; };
    box.querySelectorAll('[data-los-flag]').forEach(c => c.onchange = () => setFlag(c.dataset.losFlag, c.checked));
    box.querySelector('[data-los-act="remove"]').onclick = removePoints;
    box.querySelector('[data-los-act="delete"]').onclick = deletePoints;
    box.querySelector('[data-los-act="simplify"]').onclick = simplifyPoints;
    box.querySelector('[data-los-act="art"]').onclick = deleteSelection;
    $('#losSplit').onchange = e => { split = e.target.checked; };
    $('#losGridSnap').onchange = e => { S().project.wallGridSnap = e.target.checked; S().save(); };
    $('#losPointSnap').onchange = e => { pointSnap = e.target.checked; };
    $('#losPeek').onchange = e => { S().snapshot(); S().project.peek = Math.max(0, Math.min(10, Number(e.target.value) || 0)); S().save(); };
  }
  function hint() {
    const h = $('#canvasHint'); if (!h || !active()) return;
    h.textContent = tool === 'select' ? 'Click a wall or wall art, or drag around points and wall art to select them'
      : tool === 'line' ? `Click to add ${TYPES[type][0]} points · double-click or Enter to finish`
      : `Drag to draw a ${tool === 'rect' ? 'rectangle' : 'ellipse'} of ${TYPES[type][0]}`;
  }
  let lastSig = '';
  function refresh() {  // keep the panel in step with selection and undo
    if (!active()) return;
    const p = S().project, ids = new Set(p.walls.map(w => w.id));
    for (const id of [...sel.keys()]) if (!ids.has(id)) sel.delete(id);
    const objs = new Set(p.objects.map(o => o.id)); for (const id of [...artSel]) if (!objs.has(id)) artSel.delete(id);
    const sig = JSON.stringify([p.walls.length, [...artSel], [...sel].map(([k, s]) => [k, [...s]]), type, tool, p.peek, p.wallGridSnap, selectedWalls().map(w => w.flags)]);
    if (sig !== lastSig) { lastSig = sig; renderPanel(); }
    hint();
  }
  function modeChanged(mode) { drawing = null; gesture = null; if (mode === 'los') { renderPanel(); hint(); } else { sel.clear(); artSel.clear(); } }

  const canvas = $('#mapCanvas');
  canvas.addEventListener('dblclick', dblclick);
  return {normalizeWall, normalizeAll, visionSegments, render, pointerDown, pointerMove, pointerUp, keyDown, modeChanged, refresh,
    selectWallById(id) { const w = S().project.walls.find(v => v.id === id); if (w) { selectWall(w); tool = 'select'; } }, TYPES,
    label: w => (TYPES[w.type] || TYPES.wall)[0]};
})();
