/* Wall tool: draw a path and the chosen wall art repeats along it, joined at the corners,
 * like Dungeondraft's walls. The finished wall is baked into one picture (an ordinary art
 * object, so it exports like any other) and gets a matching line-of-sight wall in its group. */
window.KrakenWallArt = (() => {
  'use strict';
  const S = window.KrakenStudio, K = window.KrakenEditorCore, $ = s => document.querySelector(s);
  const uid = k => k + '-' + crypto.randomUUID();
  const textures = new Map();  // asset id -> {tile, height, scale, cap} once the picture has loaded
  let drawing = null, busy = false, autoPicked = false, told = false;

  const on = () => S.mode === 'paint' && $('#paintTool').value === 'wall';
  const assetOf = id => S.assets.find(a => a.id === id);
  // Dungeondraft pack walls, Kraken Map Art walls and paths (roads, rivers, shorelines), and
  // Shockbolt-style wall brushes, are strips meant to repeat.
  const OWN = 'Kraken Map Art';
  const isPath = a => a?.sourcePack === OWN && /\/Paths$/.test(a.category || '');
  function isWallArt(a) {
    if (!a) return false;
    const tags = (a.tags || []).map(t => String(t).toLowerCase());
    if (a.sourcePack === 'Dungeondraft') return tags.includes('walls') && !/_end$/i.test(a.name);
    if (a.sourcePack === OWN) return (/\/Walls$/.test(a.category || '') && !/_end$/i.test(a.name)) || isPath(a);
    return /wall/i.test(a.name) && /brush/i.test(a.name);
  }
  const gridSize = a => Number(a?.gridSize) || (a?.sourcePack === 'Dungeondraft' ? 256 : 100);

  // The texture as a strip running left to right. Pictures whose wall runs top to bottom
  // (Shockbolt brushes) are turned on their side first.
  function texture(id) {
    const base = textures.get(id) || strip(id);
    if (!base) return null;
    const scale = S.project.grid / gridSize(assetOf(id));  // the map's grid can change, so not cached
    return {...base, scale, half: base.tile.height * scale / 2};
  }
  function strip(id) {
    const img = S.image(id);
    if (!img.complete || !img.naturalWidth) return null;
    const w = img.naturalWidth, h = img.naturalHeight, probe = document.createElement('canvas');
    probe.width = w; probe.height = h;
    const g = probe.getContext('2d', {willReadFrequently: true});
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const spanX = x1 - x0 + 1, spanY = y1 - y0 + 1;
    const upright = h > w * 1.2 || (Math.abs(w - h) <= 0.2 * Math.max(w, h) && spanY >= 0.95 * h && spanX < 0.9 * w);
    let tile = probe;
    if (upright) {
      tile = document.createElement('canvas'); tile.width = h; tile.height = w;
      const t = tile.getContext('2d'); t.translate(0, w); t.rotate(-Math.PI / 2); t.drawImage(img, 0, 0);
    }
    const a = assetOf(id), capAsset = (a?.sourcePack === 'Dungeondraft' || a?.sourcePack === OWN) && !upright ? S.assets.find(v => v.category === a.category && v.name === a.name + '_end') : null;
    const info = {tile, capId: capAsset?.id || null};
    if (info.capId) S.image(info.capId);  // start loading the end cap
    textures.set(id, info);
    return info;
  }
  function capImage(info) {
    if (!info.capId) return null;
    const img = S.image(info.capId);
    return img.complete && img.naturalWidth ? img : null;
  }

  // Draw the wall along `points` onto ctx (map coordinates).
  function paint(ctx, info, points, closed) {
    const segments = K.wallPathSegments(points, closed, info.half, 0.75);
    const pattern = ctx.createPattern(info.tile, 'repeat-x'), cap = capImage(info), reach = info.half * 4 + 2;
    for (const s of segments) {
      ctx.save();
      ctx.beginPath(); s.clip.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); ctx.clip();
      ctx.translate(s.a.x, s.a.y); ctx.rotate(s.angle);
      pattern.setTransform(new DOMMatrix().translate(-s.start, -info.half).scale(info.scale));
      ctx.fillStyle = pattern; ctx.fillRect(-reach, -info.half, s.length + 2 * reach, info.half * 2);
      ctx.restore();
    }
    if (cap) for (const s of segments) for (const [at, v, turn] of [[s.capStart, s.a, Math.PI], [s.capEnd, s.b, 0]]) {
      if (!at) continue;
      const w = cap.naturalWidth * info.scale, h = cap.naturalHeight * info.scale;
      ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(s.angle + turn); ctx.drawImage(cap, -w / 2, -h / 2, w, h); ctx.restore();
    }
    return segments;
  }

  function finish(closed) {
    const d = drawing; drawing = null; S.draw();
    if (!d) return;
    const points = d.points.filter((v, i) => !i || Math.hypot(v.x - d.points[i - 1].x, v.y - d.points[i - 1].y) > 0.5);
    if (points.length < 2) return;
    bake(d.assetId, points, closed && points.length > 2);
  }
  async function bake(assetId, points, closed) {
    const info = texture(assetId), a = assetOf(assetId);
    if (!info) { S.toast('The wall art has not loaded yet; try again in a moment.', true); return; }
    if (busy) return;
    busy = true;
    try {
      if (info.capId) await S.image(info.capId).decode().catch(() => {});
      const p = S.project, cap = capImage(info), pad = cap ? Math.max(cap.naturalWidth, cap.naturalHeight) * info.scale / 2 : 0;
      const corners = K.wallPathSegments(points, closed, info.half, 0.75).flatMap(s => s.clip.concat(pad ? [s.a, s.b].flatMap(v => [{x: v.x - pad, y: v.y - pad}, {x: v.x + pad, y: v.y + pad}]) : []));
      const left = Math.max(0, Math.floor(Math.min(...corners.map(v => v.x)))), top = Math.max(0, Math.floor(Math.min(...corners.map(v => v.y))));
      const right = Math.min(p.width, Math.ceil(Math.max(...corners.map(v => v.x)))), bottom = Math.min(p.height, Math.ceil(Math.max(...corners.map(v => v.y))));
      if (right - left < 1 || bottom - top < 1) throw Error('The wall is outside the map.');
      const canvas = document.createElement('canvas'); canvas.width = right - left; canvas.height = bottom - top;
      const ctx = canvas.getContext('2d'); ctx.translate(-left, -top);
      paint(ctx, info, points, closed);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92));  // WebP: our art format
      const name = (isPath(a) ? 'Path - ' : 'Wall - ') + (a?.name || 'art');
      const r = await fetch('/api/upload?name=' + encodeURIComponent(name + '.webp'), {method: 'POST', body: blob});
      if (!r.ok) throw Error((await r.json()).error);
      const {asset} = await r.json();
      S.addAsset(asset); S.snapshot();
      const groupId = uid('group'), o = {id: uid('wallart'), assetId: asset.id, name, x: left, y: top, width: canvas.width, height: canvas.height,
        rotation: 0, visible: true, groupId, wallPath: {assetId, points: points.flatMap(v => [v.x, v.y]), closed}};
      p.objects.push(o);
      if ($('#wallLos').checked && !isPath(a)) p.walls.push(window.KrakenLOS.normalizeWall({id: uid('wall'), type: 'wall', groupId, points: o.wallPath.points, flags: closed ? ['closed'] : []}));
      S.save(); S.draw();
    } catch (e) { S.toast('Wall failed: ' + e.message, true); } finally { busy = false; }
  }

  function snapped(e) {
    let q = S.point(e);
    q = {x: S.snap(q.x, 'x'), y: S.snap(q.y, 'y')};
    if (e.shiftKey && drawing?.points.length) {  // keep 45 degree angles
      const from = drawing.points.at(-1), dx = q.x - from.x, dy = q.y - from.y, r = Math.hypot(dx, dy), t = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
      q = {x: from.x + Math.cos(t) * r, y: from.y + Math.sin(t) * r};
    }
    return q;
  }
  function pointerDown(e) {
    if (!on() || e.button !== 0 || S.tool === 'pan') return false;
    if (!S.asset) { S.toast('Pick wall art in the library first (a Dungeondraft wall, or a wall brush).'); return true; }
    const q = snapped(e);
    if (!drawing) drawing = {assetId: S.asset, points: [q], cursor: q};
    else if (drawing.points.length >= 3 && Math.hypot(q.x - drawing.points[0].x, q.y - drawing.points[0].y) < 8 / S.zoom) { finish(true); return true; }
    else drawing.points.push(q);
    S.draw(); return true;
  }
  function pointerMove(e) {
    if (!drawing) return false;
    drawing.cursor = snapped(e); S.draw(); return true;
  }
  const pointerUp = () => !!drawing;
  function dblclick() {
    if (!drawing) return;
    drawing.points.pop();  // the second click of the double-click added a point
    finish(false);
  }
  function keyDown(e) {
    if (!drawing) return false;
    if (e.key === 'Enter') { drawing.points.push(drawing.cursor); finish(e.altKey); return true; }
    if (e.key === 'Escape') { drawing = null; S.draw(); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') { drawing.points.pop(); if (!drawing.points.length) drawing = null; S.draw(); return true; }
    return false;
  }

  function render(ctx, zoom) {
    const hint = $('#canvasHint');
    if (on() && hint) hint.textContent = !S.asset ? 'Pick wall art (or a road, river or shoreline) in the library'
      : drawing ? 'Click to add points · double-click or Enter to finish · click the first point to close · Esc cancels'
      : 'Click to start a wall · Shift keeps 45° angles';
    if (!drawing) return;
    const list = [...drawing.points, drawing.cursor], info = texture(drawing.assetId);
    if (info && list.length > 1) { ctx.save(); ctx.globalAlpha = 0.85; paint(ctx, info, list, false); ctx.restore(); }
    ctx.save(); ctx.strokeStyle = '#f1ca5b'; ctx.lineWidth = 1.5 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath(); list.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.stroke(); ctx.restore();
  }
  function showOptions() {
    const wall = $('#paintTool').value === 'wall';
    document.querySelectorAll('.brush-only').forEach(el => el.style.display = wall ? 'none' : '');
    $('#wallOptions').hidden = !wall;
  }
  // Picking wall art selects the Wall tool; picking other art after that goes back to stamping.
  function assetPicked(id) {
    const tool = $('#paintTool');
    if (isWallArt(assetOf(id))) {
      if (tool.value !== 'wall') { tool.value = 'wall'; autoPicked = true; }
      if (!told) { told = true; S.toast('Wall tool: click along the wall, double-click or press Enter to finish.'); }
    } else if (autoPicked && tool.value === 'wall') { tool.value = 'stamp'; autoPicked = false; }
    drawing = null; showOptions();
  }
  $('#paintTool').addEventListener('change', () => { autoPicked = false; drawing = null; showOptions(); S.draw(); });
  $('#mapCanvas').addEventListener('dblclick', dblclick);
  showOptions();
  return {pointerDown, pointerMove, pointerUp, keyDown, render, assetPicked, isWallArt, modeChanged() { drawing = null; }};
})();
