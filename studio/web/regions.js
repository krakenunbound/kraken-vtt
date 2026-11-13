/* Traps & regions: areas of the map that do something when a token enters them.
 *
 * A region is {id, kind, name, note, points: [x, y, ...], cost?}. Kinds:
 * trap (the GM is warned and the game pauses), pit (a trap you fall into),
 * difficult (difficult terrain: moving costs more). Exported to Foundry as
 * regions with behaviours, to Fantasy Grounds as a GM-only pin and note, and
 * read by Kraken VTT from either. */
window.KrakenRegions = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  // kind -> label, colour, help, default name
  const KINDS = {
    trap: ['Trap', '#e53935', 'Springs when a token enters: the game pauses and the GM sees its name and note.', 'Trap'],
    pit: ['Pit', '#8e24aa', 'A trap that drops whoever steps in. Draw invisible walls round its edge too if it should block movement.', 'Pit'],
    difficult: ['Difficult terrain', '#f9a825', 'Moving through it costs more: 2 means each square counts double.', 'Difficult terrain'],
  };
  let kind = 'trap', tool = 'rect', drawing = null, drag = null, selected = null, lastPress = null;
  const active = () => S().mode === 'regions';
  const uid = () => 'region-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const list = () => (S().project.regions ||= []);

  function normalize(r) {
    const out = {id: String(r.id || uid()), kind: KINDS[r.kind] ? r.kind : 'trap', name: String(r.name || '').slice(0, 120),
      note: String(r.note || '').slice(0, 4000), points: (r.points || []).map(Number).filter(Number.isFinite)};
    if (out.points.length < 6 || out.points.length % 2) throw Error('A region needs at least three corners.');
    if (out.kind === 'difficult') out.cost = Math.min(5, Math.max(1, Number(r.cost) || 2));
    if (!out.name) out.name = KINDS[out.kind][3];
    return out;
  }

  function inside(pts, q) {
    let hit = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
      if ((yi > q.y) !== (yj > q.y) && q.x < (xj - xi) * (q.y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  const at = q => [...list()].reverse().find(r => inside(r.points, q));

  function add(points) {
    S().snapshot();
    const r = normalize({kind, points, name: `${KINDS[kind][3]} ${list().filter(x => x.kind === kind).length + 1}`});
    list().push(r); selected = r.id;
    S().save(); S().draw(); render();
  }

  function render() {
    const box = $('#regionsPanel'); if (!box) return;
    const r = list().find(x => x.id === selected);
    box.innerHTML = `
      <div class="los-title">Traps &amp; regions</div>
      <div class="los-types">${Object.entries(KINDS).map(([id, k]) =>
        `<button class="los-type ${id === kind ? 'on' : ''}" data-region-kind="${id}" title="${esc(k[2])}"><i style="border-top:3px solid ${k[1]}"></i>${esc(k[0])}</button>`).join('')}</div>
      <div class="los-tools">
        <button class="los-tool ${tool === 'rect' ? 'on' : ''}" data-region-tool="rect" title="Drag a box.">Rectangle</button>
        <button class="los-tool ${tool === 'poly' ? 'on' : ''}" data-region-tool="poly" title="Click each corner; double-click or Enter finishes, Esc cancels.">Shape</button>
        <button class="los-tool ${tool === 'select' ? 'on' : ''}" data-region-tool="select" title="Click a region to edit it.">Select</button>
      </div>
      <p class="los-help">${esc(KINDS[kind][2])}</p>
      ${r ? `<div class="region-edit">
        <label>Name <input id="regionName" value="${esc(r.name)}"></label>
        <label>What happens (GM note) <textarea id="regionNote" rows="4">${esc(r.note)}</textarea></label>
        ${r.kind === 'difficult' ? `<label>Movement cost <input id="regionCost" type="number" min="1" max="5" step="0.25" value="${r.cost}"></label>` : ''}
        <button class="los-action" id="regionDelete">Delete this ${esc(KINDS[r.kind][0].toLowerCase())}</button>
      </div>` : ''}
      <div class="region-list">${list().map(x => `<button class="region-row ${x.id === selected ? 'on' : ''}" data-region-id="${esc(x.id)}"><i style="background:${KINDS[x.kind][1]}"></i>${esc(x.name)}</button>`).join('') || '<p class="los-help">No traps or regions yet.</p>'}</div>`;
    box.querySelectorAll('[data-region-kind]').forEach(b => b.onclick = () => { kind = b.dataset.regionKind; if (tool === 'select') tool = 'rect'; render(); hint(); });
    box.querySelectorAll('[data-region-tool]').forEach(b => b.onclick = () => { tool = b.dataset.regionTool; drawing = null; render(); hint(); S().draw(); });
    box.querySelectorAll('[data-region-id]').forEach(b => b.onclick = () => { selected = b.dataset.regionId; render(); S().draw(); });
    if (r) {
      const edit = (field, value) => { S().snapshot(); r[field] = value; Object.assign(r, normalize(r)); S().save(); S().draw(); };
      $('#regionName').onchange = e => { edit('name', e.target.value); render(); };
      $('#regionNote').onchange = e => edit('note', e.target.value);
      if ($('#regionCost')) $('#regionCost').onchange = e => edit('cost', Number(e.target.value));
      $('#regionDelete').onclick = () => remove(r.id);
    }
  }
  function remove(id) {
    S().snapshot();
    S().project.regions = list().filter(x => x.id !== id);
    if (selected === id) selected = null;
    S().save(); S().draw(); render();
  }
  function hint() {
    if (!active()) return;
    $('#canvasHint').textContent = tool === 'rect' ? `Drag a box for the ${KINDS[kind][0].toLowerCase()}` :
      tool === 'poly' ? 'Click each corner; double-click or Enter to finish' : 'Click a trap or region to edit it';
  }

  function pointerDown(e) {
    if (!active() || e.button !== 0) return false;
    const q = S().point(e);
    if (tool === 'select') { selected = at(q)?.id || null; render(); S().draw(); return true; }
    const snapped = {x: S().snap(q.x, 'x'), y: S().snap(q.y, 'y')};
    if (tool === 'rect') { drag = {a: snapped, b: snapped}; $('#mapCanvas').setPointerCapture(e.pointerId); return true; }
    // pointer-down carries no click count in Chrome: a second press soon after, close by, is a double-click
    const now = performance.now(), twice = lastPress && now - lastPress.t < 450 && Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 6;
    lastPress = twice ? null : {t: now, x: e.clientX, y: e.clientY};
    if (twice && drawing) { finish(); return true; }
    drawing ||= {points: []};
    drawing.points.push(snapped); drawing.cursor = snapped; S().draw();
    return true;
  }
  function pointerMove(e) {
    if (!active()) return false;
    const q = S().point(e), snapped = {x: S().snap(q.x, 'x'), y: S().snap(q.y, 'y')};
    if (drag) { drag.b = snapped; S().draw(); return true; }
    if (drawing) { drawing.cursor = snapped; S().draw(); return true; }
    return false;
  }
  function pointerUp() {
    if (!drag) return false;
    const {a, b} = drag; drag = null;
    if (Math.abs(b.x - a.x) > 4 && Math.abs(b.y - a.y) > 4) {
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      add([x0, y0, x1, y0, x1, y1, x0, y1]);
    } else S().draw();
    return true;
  }
  function finish() {
    const pts = drawing?.points || []; drawing = null;
    if (pts.length >= 3) add(pts.flatMap(q => [q.x, q.y])); else S().draw();
  }
  function keyDown(e) {
    if (!active()) return false;
    if (drawing && e.key === 'Enter') { e.preventDefault(); finish(); return true; }
    if (drawing && e.key === 'Escape') { drawing = null; S().draw(); return true; }
    if (selected && e.key === 'Delete' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { remove(selected); return true; }
    return false;
  }

  function draw(ctx, zoom) {
    const p = S().project;
    if (window.KrakenLayers?.groupHidden?.('regions')) return;
    ctx.save();
    for (const r of p.regions || []) {
      const color = KINDS[r.kind]?.[1] || '#e53935', on = active() && r.id === selected;
      ctx.beginPath();
      for (let i = 0; i < r.points.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](r.points[i], r.points[i + 1]);
      ctx.closePath();
      ctx.globalAlpha = on ? 0.32 : 0.18; ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = (on ? 3 : 2) / zoom; ctx.setLineDash([8 / zoom, 5 / zoom]); ctx.stroke();
      ctx.setLineDash([]);
      const xs = r.points.filter((_, i) => i % 2 === 0), ys = r.points.filter((_, i) => i % 2);
      ctx.font = `${Math.max(11, 13 / zoom)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3 / zoom;
      const label = (r.kind === 'difficult' ? '' : '⚠ ') + r.name;
      ctx.strokeText(label, Math.min(...xs) + 6 / zoom, Math.min(...ys) + 16 / zoom); ctx.fillText(label, Math.min(...xs) + 6 / zoom, Math.min(...ys) + 16 / zoom);
    }
    const color = KINDS[kind][1];
    ctx.strokeStyle = color; ctx.lineWidth = 2 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
    if (drag) ctx.strokeRect(drag.a.x, drag.a.y, drag.b.x - drag.a.x, drag.b.y - drag.a.y);
    if (drawing) {
      ctx.beginPath();
      [...drawing.points, drawing.cursor].forEach((q, i) => ctx[i ? 'lineTo' : 'moveTo'](q.x, q.y));
      ctx.stroke();
    }
    ctx.restore();
  }
  function modeChanged(mode) { drawing = null; drag = null; if (mode === 'regions') { render(); hint(); } }
  return {KINDS, normalize, pointerDown, pointerMove, pointerUp, keyDown, draw, modeChanged, render};
})();
