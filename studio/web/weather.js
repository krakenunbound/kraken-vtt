/* Weather effects, the Fantasy Grounds way: add an effect and it covers the whole
 * map; then paint where it shows and where it is hidden with a brush, a freehand
 * outline, a clicked shape or a box. Every effect is drawn on the map as you
 * work, with its own pattern, so you can see where it is.
 *
 * An effect is {id, type, name, settings, visible, previewOpacity,
 * mask: null (the whole map) | {base: 'all'|'none', ops: [...]},
 * polygons (what the mask comes to, as FG saves it), x, y, width, height (its box)}. */
window.KrakenWeather = (() => {
  'use strict';
  const S = () => window.KrakenStudio, K = () => window.KrakenEditorCore, $ = s => document.querySelector(s);
  // type -> label, colour, what it is
  const TYPES = {
    water: ['Water', '#4da6be', 'Rippling water: rivers, pools, flooded floors.'],
    ocean: ['Ocean', '#3a8fc0', 'Rolling waves on open water.'],
    clouds: ['Clouds', '#c9d6d4', 'Cloud shadows drifting over the land.'],
    myst: ['Fog', '#b8c4c2', 'Low mist or fog.'],
    snow: ['Snow', '#f2f8fb', 'Falling snow.'],
    rain: ['Rain', '#8fb0d8', 'Rain seen from above: splashes and ripples. Its Wind setting leans it.'],
    blizzard: ['Blizzard', '#ffffff', 'Driving snow and wind.'],
  };
  const TOOLS = {
    brush: ['Brush', 'Paint with a round brush. [ and ] change its size.'],
    lasso: ['Freehand', 'Drag round an area to fill it.'],
    poly: ['Shape', 'Click each corner; double-click or Enter finishes, Esc cancels.'],
    rect: ['Box', 'Drag a box.'],
    edit: ['Edit points', 'Drag a corner to reshape the area. Double-click an edge to add a corner; right-click a corner (or select it and press Delete) to remove it.'],
  };
  let paint = 'hide', tool = 'brush', radius = 60, gesture = null, cursor = null, shape = null;
  const active = () => S().mode === 'fx';
  const list = () => S().project.effects;
  const selected = () => list().find(e => e.id === S().selected) || null;
  const uid = () => 'fx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const round = v => Math.round(v * 10) / 10;

  // ---- data -------------------------------------------------------------------
  const keyOf = m => m ? JSON.stringify(m) : 'all';
  function cleanOp(o) {
    if (!o || typeof o !== 'object') throw Error('Invalid mask stroke.');
    const op = o.op === 'show' ? 'show' : 'hide', shape = o.shape;
    if (!['brush', 'poly', 'rect', 'paths'].includes(shape)) throw Error('Unknown mask stroke.');
    const nums = a => (Array.isArray(a) ? a : []).slice(0, 40000).map(Number).filter(Number.isFinite).map(round);
    const out = {op, shape};
    if (shape === 'paths') {
      out.paths = (Array.isArray(o.paths) ? o.paths : []).slice(0, 2000).map(nums).filter(p => p.length >= 6 && p.length % 2 === 0);
      if (!out.paths.length) throw Error('A mask outline needs three corners.');
      return out;
    }
    out.points = nums(o.points);
    if (out.points.length % 2) out.points.pop();
    if (shape === 'rect' && out.points.length !== 4) throw Error('A mask box needs two corners.');
    if (shape === 'poly' && out.points.length < 6) throw Error('A mask shape needs three corners.');
    if (shape === 'brush') {
      if (out.points.length < 2) throw Error('A brush stroke needs a point.');
      out.radius = Math.min(2000, Math.max(1, num(o.radius) || 30));
    }
    return out;
  }
  // Check an effect and work out its outline (kept until its mask changes).
  function normalize(e, width, height) {
    const type = e.type;
    if (!TYPES[type]) throw Error('Unknown effect type.');
    const out = {...e, id: String(e.id || uid()), type, settings: K().effectSettings(type, e.settings)};
    out.name = String(e.name || TYPES[type][0]).slice(0, 60);
    // drift: the way it moves, in degrees (0 east, 90 south). Map Studio and Kraken VTT;
    // FG and Foundry have no direction for these (rain leans with its own Wind setting).
    if (type === 'rain' || e.drift === undefined || e.drift === null) delete out.drift;
    else out.drift = ((Math.round(num(e.drift)) % 360) + 360) % 360;
    // dropSize: rain's drops (and their rings), 0.25 to 3 times; Map Studio, its Foundry rain
    // and Kraken VTT. FG's rain has no such setting.
    const size = Number(e.dropSize);
    if (type !== 'rain' || e.dropSize == null || !Number.isFinite(size) || size === 1) delete out.dropSize;
    else out.dropSize = Math.round(Math.min(3, Math.max(0.25, size)) * 20) / 20;
    if (e.visible === false) out.visible = false; else delete out.visible;
    if (!('mask' in e)) {
      // Older projects: a box, or the whole map when FG had no mask.
      const whole = e.fgWholeMap && ['x', 'y', 'width', 'height'].every((k, i) => Math.abs(num(e[k]) - e.fgWholeMap[i]) < 0.5);
      out.mask = whole ? null : {base: 'none', ops: [{op: 'show', shape: 'rect', points: [num(e.x), num(e.y), num(e.x) + num(e.width), num(e.y) + num(e.height)]}]};
    } else if (e.mask === null) out.mask = null;
    else {
      if (typeof e.mask !== 'object' || !Array.isArray(e.mask.ops || [])) throw Error('Invalid effect mask.');
      if ((e.mask.ops || []).length > 1000) throw Error('Too many strokes in an effect mask.');
      out.mask = {base: e.mask.base === 'all' ? 'all' : 'none', ops: (e.mask.ops || []).map(cleanOp)};
    }
    delete out.fgWholeMap;
    const key = keyOf(out.mask) + `@${width}x${height}`;
    if (e._maskKey !== key || !Array.isArray(e.polygons) && out.mask) {
      out.polygons = K().maskPolygons(out.mask, width, height);
    }
    out._maskKey = key;
    if (out.polygons === undefined) out.polygons = null;
    Object.assign(out, box(out, width, height));
    return out;
  }
  function box(e, width, height) {
    if (!e.polygons) return {x: 0, y: 0, width, height};
    const xs = e.polygons.flatMap(p => p.filter((_, i) => i % 2 === 0)), ys = e.polygons.flatMap(p => p.filter((_, i) => i % 2));
    if (!xs.length) return {x: 0, y: 0, width: 1, height: 1};
    const x = Math.min(...xs), y = Math.min(...ys);
    return {x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y)};
  }
  function refresh(e) {
    const p = S().project, i = list().findIndex(x => x.id === e.id);
    if (i >= 0) list()[i] = normalize(e, p.width, p.height);
    return list()[i];
  }

  // ---- editing ----------------------------------------------------------------
  function add(type) {
    S().snapshot();
    const p = S().project, n = list().filter(e => e.type === type).length;
    const e = normalize({id: uid(), type, name: TYPES[type][0] + (n ? ' ' + (n + 1) : ''), mask: null, settings: {}}, p.width, p.height);
    list().push(e); S().selected = e.id;
    paint = 'hide';
    S().save(); S().draw(); render();
    S().toast(`${TYPES[type][0]} covers the whole map. Paint Hide where it should not be, or Hide everywhere and paint Show.`);
  }
  function stroke(e, op) {
    S().snapshot();
    const mask = e.mask ? {...e.mask, ops: [...e.mask.ops]} : {base: 'all', ops: []};
    mask.ops.push(op);
    const next = refresh({...e, mask});
    S().save(); S().draw(); render();
    return next;
  }
  function reset(e, base) {
    S().snapshot();
    refresh({...e, mask: base === 'all' ? null : {base: 'none', ops: []}});
    paint = base === 'all' ? 'hide' : 'show';
    S().save(); S().draw(); render();
  }
  function undoStroke(e) {
    if (!e.mask?.ops.length) return;
    S().snapshot();
    const ops = e.mask.ops.slice(0, -1);
    refresh({...e, mask: e.mask.base === 'all' && !ops.length ? null : {...e.mask, ops}});
    S().save(); S().draw(); render();
  }
  function remove(id) {
    S().snapshot();
    S().project.effects = list().filter(e => e.id !== id);
    window.KrakenWeatherGL.forget(id);
    if (S().selected === id) S().selected = null;
    S().save(); S().draw(); render();
  }
  function setField(e, field, value) {
    S().snapshot();
    refresh({...e, [field]: value});
    S().save(); S().draw();
  }

  // ---- panel ------------------------------------------------------------------
  function coverage(e) {
    if (!e.polygons) return 'the whole map';
    if (!e.polygons.length) return 'nowhere yet';
    const p = S().project, area = Math.abs(e.polygons.reduce((a, q) => a + K().polyArea(q), 0));
    return `${Math.max(1, Math.round(100 * area / (p.width * p.height)))}% of the map`;
  }
  function render() {
    const box = $('#weatherPanel'); if (!box) return;
    // An effect added (or shown again) after the panel opened empty moves too.
    startAnimation();
    const e = selected();
    const kinds = Object.entries(TYPES).map(([id, t]) =>
      `<button class="los-type" data-fx-add="${id}" title="${esc(t[2])}"><i style="border-top:3px solid ${t[1]}"></i>${esc(t[0])}</button>`).join('');
    const rows = list().map(x => `<div class="fx-row ${e && x.id === e.id ? 'on' : ''}">
        <button class="fx-pick" data-fx-id="${esc(x.id)}" title="Select ${esc(x.name)}"><i style="background:${TYPES[x.type][1]}"></i>${esc(x.name)}<small>${esc(coverage(x))}</small></button>
        <button class="fx-eye" data-fx-eye="${esc(x.id)}" title="${x.visible === false ? 'Show' : 'Hide'} in the editor and in exports" style="opacity:${x.visible === false ? .35 : 1}">👁</button>
        <button class="fx-del" data-fx-del="${esc(x.id)}" title="Delete ${esc(x.name)}">✕</button></div>`).join('');
    let edit = '';
    if (e) {
      const settings = [...K().FX_SETTINGS[e.type], K().FX_BLUR].map(([key, label, initial, max = 1]) => {
        const scale = 100 / max, v = Math.round((e.settings?.[key] ?? initial) * scale);
        return `<label class="fx-slider">${esc(label)}<input type="range" min="0" max="100" step="1" value="${v}" data-fx-set="${key}" data-fx-scale="${scale}"><span>${v}</span></label>`;
      }).join('');
      edit = `<div class="fx-edit">
        <div class="los-title">${esc(e.name)} <small>· ${esc(coverage(e))}</small></div>
        <label class="fx-name">Name <input id="fxName" value="${esc(e.name)}"></label>
        <div class="fx-mask-title">Mask: where it shows</div>
        <div class="fx-paint">
          <button class="los-tool fx-show ${paint === 'show' ? 'on' : ''}" data-fx-paint="show" title="Paint where the effect shows.">Show</button>
          <button class="los-tool fx-hide ${paint === 'hide' ? 'on' : ''}" data-fx-paint="hide" title="Paint where the effect is hidden: roofs, rooms, dry land.">Hide</button>
        </div>
        <div class="los-tools">${Object.entries(TOOLS).map(([id, t]) =>
          `<button class="los-tool ${tool === id ? 'on' : ''}" data-fx-tool="${id}" title="${esc(t[1])}">${esc(t[0])}</button>`).join('')}</div>
        ${tool === 'brush' ? `<label class="fx-slider">Brush size<input id="fxRadius" type="range" min="5" max="400" step="5" value="${radius}"><span>${Math.round(radius * 2)} px</span></label>` : ''}
        <p class="los-help">${esc(TOOLS[tool][1])} Hold Shift to ${paint === 'show' ? 'hide' : 'show'} instead.</p>
        <div class="fx-actions">
          <button class="los-action" data-fx-reset="all" title="Start again: the effect over the whole map.">Show everywhere</button>
          <button class="los-action" data-fx-reset="none" title="Start again: the effect nowhere, then paint Show.">Hide everywhere</button>
          <button class="los-action" id="fxUndoStroke" ${e.mask?.ops.length ? '' : 'disabled'} title="Take back the last stroke (Ctrl+Z undoes anything).">Undo stroke</button>
        </div>
        <div class="fx-mask-title">${esc(TYPES[e.type][0])} settings</div>
        ${settings}
        <button class="los-action" id="fxDefaults">Defaults</button>
        ${e.type === 'rain' ? `<label class="fx-slider" title="How big the drops and their rings are.">Drop size<input id="fxDropSize" type="range" min="0.25" max="3" step="0.05" value="${e.dropSize ?? 1}"><span>${e.dropSize ?? 1}x</span></label>` : `<div class="fx-mask-title">Drift direction</div>
        <div class="fx-drift">${[['↑', 270, 'North'], ['↗', 315, 'North-east'], ['→', 0, 'East'], ['↘', 45, 'South-east'], ['↓', 90, 'South'], ['↙', 135, 'South-west'], ['←', 180, 'West'], ['↖', 225, 'North-west']].map(([arrow, deg, name]) =>
          `<button class="los-tool ${(e.drift ?? 0) === deg ? 'on' : ''}" data-fx-drift="${deg}" title="Drifts towards the ${name.toLowerCase()}">${arrow}</button>`).join('')}</div>
        <label class="fx-slider">Degrees<input id="fxDrift" type="range" min="0" max="359" step="1" value="${e.drift ?? 0}"><span>${e.drift ?? 0}°</span></label>
        <p class="los-help">The way the effect drifts.</p>`}
        <label class="fx-check"><input id="fxAnimate" type="checkbox" ${animate ? 'checked' : ''}> Animate effects here</label>
        <label class="fx-slider" title="How strongly the editor tints it; not exported.">Preview strength<input id="fxPreview" type="range" min="10" max="100" step="5" value="${Math.round((e.previewOpacity ?? 0.45) * 100)}"><span></span></label>
      </div>`;
    }
    box.innerHTML = `<div class="los-title">Weather effects</div>
      <p class="los-help">Add an effect: it covers the whole map. Then paint <b>Hide</b> where it should not be (or <b>Hide everywhere</b> and paint <b>Show</b>).</p>
      <div class="los-types fx-add">${kinds}</div>
      <div class="fx-list">${rows || '<p class="los-help">No effects on this map yet.</p>'}</div>${edit}`;
    box.querySelectorAll('[data-fx-add]').forEach(b => b.onclick = () => add(b.dataset.fxAdd));
    box.querySelectorAll('[data-fx-id]').forEach(b => b.onclick = () => { S().selected = b.dataset.fxId; S().draw(); render(); });
    box.querySelectorAll('[data-fx-eye]').forEach(b => b.onclick = () => { const x = list().find(v => v.id === b.dataset.fxEye); setField(x, 'visible', x.visible === false); render(); });
    box.querySelectorAll('[data-fx-del]').forEach(b => b.onclick = () => remove(b.dataset.fxDel));
    if (!e) return;
    box.querySelectorAll('[data-fx-paint]').forEach(b => b.onclick = () => { paint = b.dataset.fxPaint; render(); hint(); });
    box.querySelectorAll('[data-fx-tool]').forEach(b => b.onclick = () => { tool = b.dataset.fxTool; shape = null; render(); hint(); S().draw(); });
    box.querySelectorAll('[data-fx-reset]').forEach(b => b.onclick = () => reset(e, b.dataset.fxReset));
    $('#fxUndoStroke').onclick = () => undoStroke(e);
    $('#fxName').onchange = ev => { setField(e, 'name', ev.target.value || TYPES[e.type][0]); render(); };
    if ($('#fxRadius')) $('#fxRadius').oninput = ev => { radius = Number(ev.target.value); ev.target.nextElementSibling.textContent = `${radius * 2} px`; };
    box.querySelectorAll('[data-fx-set]').forEach(input => {
      input.oninput = () => { input.nextElementSibling.textContent = input.value; };
      input.onchange = () => setField(e, 'settings', {...e.settings, [input.dataset.fxSet]: Number(input.value) / Number(input.dataset.fxScale)});
    });
    $('#fxDefaults').onclick = () => { setField(e, 'settings', {}); render(); };
    $('#fxPreview').onchange = ev => setField(e, 'previewOpacity', Number(ev.target.value) / 100);
    box.querySelectorAll('[data-fx-drift]').forEach(b => b.onclick = () => { setField(e, 'drift', Number(b.dataset.fxDrift)); render(); });
    if ($('#fxDropSize')) {
      $('#fxDropSize').oninput = ev => { ev.target.nextElementSibling.textContent = ev.target.value + 'x'; };
      $('#fxDropSize').onchange = ev => { setField(e, 'dropSize', Number(ev.target.value)); render(); };
    }
    if ($('#fxDrift')) {
      $('#fxDrift').oninput = ev => { ev.target.nextElementSibling.textContent = ev.target.value + '°'; };
      $('#fxDrift').onchange = ev => { setField(e, 'drift', Number(ev.target.value)); render(); };
    }
    $('#fxAnimate').onchange = ev => { animate = ev.target.checked; if (animate) startAnimation(); else S().draw(); };
  }
  function hint() {
    if (!active()) return;
    const e = selected();
    $('#canvasHint').textContent = !e ? 'Add a weather effect, or pick one from the list' :
      `${paint === 'show' ? 'Show' : 'Hide'} ${e.name}: ${TOOLS[tool][1]}`;
  }

  // ---- pointer ----------------------------------------------------------------
  // Edit points: the area's own outlines, corner by corner. Editing turns the strokes
  // into those outlines (as FG keeps a mask), so later strokes add to or cut them.
  let edit = null, picked = null; // edit: {polys, drag: {pi, vi}} while dragging; picked: last corner touched
  const editable = e => e.polygons || [];
  function nearCorner(e, q) {
    const r = 9 / S().zoom; let best = null;
    editable(e).forEach((poly, pi) => { for (let vi = 0; vi < poly.length; vi += 2) { const d = Math.hypot(poly[vi] - q.x, poly[vi + 1] - q.y); if (d < r && (!best || d < best.d)) best = {pi, vi, d}; } });
    return best;
  }
  function nearEdge(e, q) {
    const r = 8 / S().zoom; let best = null;
    editable(e).forEach((poly, pi) => {
      for (let i = 0; i < poly.length; i += 2) {
        const j = (i + 2) % poly.length, ax = poly[i], ay = poly[i + 1], bx = poly[j], by = poly[j + 1], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / l)), x = ax + t * dx, y = ay + t * dy, d = Math.hypot(q.x - x, q.y - y);
        if (d < r && (!best || d < best.d)) best = {pi, at: i + 2, x, y, d};
      }
    });
    return best;
  }
  function setOutlines(e, polys) {
    S().snapshot();
    const kept = polys.filter(p => p.length >= 6);
    refresh({...e, mask: {base: 'none', ops: kept.length ? [{op: 'show', shape: 'paths', paths: kept.map(p => p.map(v => Math.round(v * 10) / 10))}] : []}});
    S().save(); S().draw(); render();
  }
  function removeCorner(e, c) {
    const polys = editable(e).map(p => p.slice());
    polys[c.pi].splice(c.vi, 2);
    if (polys[c.pi].length < 6) polys.splice(c.pi, 1);
    picked = null; setOutlines(e, polys);
  }
  function editDown(ev, e, q) {
    if (!e.polygons) { S().toast('This effect covers the whole map: paint Hide or Hide everywhere first, then edit its corners.'); return true; }
    const twice = doublePress(ev), c = nearCorner(e, q);
    if (ev.button === 2 || ev.altKey) { if (c) removeCorner(e, c); return true; }
    if (c) { picked = c; edit = {polys: editable(e).map(p => p.slice()), drag: c}; $('#mapCanvas').setPointerCapture(ev.pointerId); S().draw(); return true; }
    const edge = nearEdge(e, q);
    if (edge && twice) {
      const polys = editable(e).map(p => p.slice());
      polys[edge.pi].splice(edge.at, 0, edge.x, edge.y);
      picked = {pi: edge.pi, vi: edge.at};
      setOutlines(e, polys);
    }
    return true;
  }
  // Pointer-down events carry no click count in Chrome: a second press soon after, close by, is a double-click.
  let lastPress = null;
  function doublePress(ev) {
    const now = performance.now(), hit = lastPress && now - lastPress.t < 450 && Math.hypot(ev.clientX - lastPress.x, ev.clientY - lastPress.y) < 6;
    lastPress = hit ? null : {t: now, x: ev.clientX, y: ev.clientY};
    return hit;
  }
  function opFor(e) { return (e.shiftKey ? (paint === 'show' ? 'hide' : 'show') : paint); }
  function pointerDown(ev) {
    if (!active() || S().tool === 'pan') return false;
    if (ev.button === 2 && tool === 'edit' && selected()) return editDown(ev, selected(), S().point(ev));
    if (ev.button !== 0) return false;
    const e = selected(), q = S().point(ev);
    if (!e) {
      // click an effect on the map to pick it
      const hit = [...list()].reverse().find(x => x.visible !== false && (!x.polygons || K().inPolygons(x.polygons, q.x, q.y)));
      if (hit) { S().selected = hit.id; S().draw(); render(); hint(); }
      return true;
    }
    if (tool === 'edit') return editDown(ev, e, q);
    if (tool === 'poly') {
      if (doublePress(ev) && shape) { finishShape(); return true; }
      shape ||= {op: opFor(ev), points: []};
      shape.points.push(q); shape.cursor = q; S().draw();
      return true;
    }
    gesture = {op: opFor(ev), points: [q], start: q};
    $('#mapCanvas').setPointerCapture(ev.pointerId);
    S().draw();
    return true;
  }
  function pointerMove(ev) {
    if (!active()) return false;
    const q = S().point(ev);
    cursor = q;
    if (edit) {
      const {pi, vi} = edit.drag, p = S().project;
      edit.polys[pi][vi] = Math.max(0, Math.min(p.width, q.x)); edit.polys[pi][vi + 1] = Math.max(0, Math.min(p.height, q.y));
      S().draw(); return true;
    }
    if (tool === 'edit' && selected()) { S().draw(); return false; }
    if (gesture) {
      const last = gesture.points.at(-1), step = tool === 'brush' ? Math.max(2, radius / 4) : 3 / S().zoom;
      if (tool === 'rect') gesture.points = [gesture.start, q];
      else if (Math.hypot(q.x - last.x, q.y - last.y) >= step) gesture.points.push(q);
      S().draw(); return true;
    }
    if (shape) { shape.cursor = q; S().draw(); return true; }
    if (selected() && tool === 'brush') S().draw();
    return false;
  }
  function pointerUp() {
    if (edit) { const done = edit; edit = null; const e = selected(); if (e) setOutlines(e, done.polys); return true; }
    if (!gesture) return false;
    const g = gesture; gesture = null;
    const e = selected(); if (!e) return true;
    const flat = g.points.flatMap(q => [q.x, q.y]);
    if (tool === 'brush') stroke(e, {op: g.op, shape: 'brush', radius, points: flat});
    else if (tool === 'rect') {
      const [a, b] = [g.points[0], g.points.at(-1)];
      if (Math.abs(b.x - a.x) > 3 && Math.abs(b.y - a.y) > 3) stroke(e, {op: g.op, shape: 'rect', points: [a.x, a.y, b.x, b.y]});
      else S().draw();
    } else if (tool === 'lasso') {
      if (g.points.length >= 3 && Math.abs(K().polyArea(flat)) > 25) stroke(e, {op: g.op, shape: 'poly', points: flat}); else S().draw();
    }
    return true;
  }
  function finishShape() {
    const s = shape; shape = null;
    const e = selected();
    if (e && s && s.points.length >= 3 && Math.abs(K().polyArea(s.points.flatMap(q => [q.x, q.y]))) > 25) stroke(e, {op: s.op, shape: 'poly', points: s.points.flatMap(q => [q.x, q.y])});
    else S().draw();
  }
  function keyDown(ev) {
    if (!active() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return false;
    if (shape && ev.key === 'Enter') { ev.preventDefault(); finishShape(); return true; }
    if (shape && ev.key === 'Escape') { shape = null; S().draw(); return true; }
    if (ev.key === '[' || ev.key === ']') { radius = Math.min(400, Math.max(5, radius + (ev.key === ']' ? 10 : -10))); render(); S().draw(); return true; }
    if (ev.key === 'Delete' && selected() && tool === 'edit' && picked && editable(selected())[picked.pi]) { removeCorner(selected(), picked); return true; }
    if (ev.key === 'Delete' && selected()) { remove(selected().id); return true; }
    return false;
  }

  // ---- drawing on the map -----------------------------------------------------
  // The effects move on the GPU (weatherGL.js), on their own canvas over the map: the
  // map itself is never redrawn for them. While Weather effects or Play is open they
  // move every frame; otherwise they are drawn once each time the map is.
  let animate = true, timer = 0, lastCost = 0;
  const clock = () => performance.now() / 1000;
  const moving = () => (active() || S().mode === "play") && animate && !document.hidden && !window.KrakenLayers?.groupHidden?.("effects") && list().some(e => e.visible !== false);
  // How strong each effect is drawn: as players see it in Play and in stills; the preview opacity while editing.
  function alphaOf(e, full) {
    const sel = selected(), dim = active() && sel && e.id !== sel.id;
    return (dim ? 0.35 : 1) * (full || S().mode === "play" ? 1 : Math.min(1, (e.previewOpacity ?? 0.45) * 2.2));
  }
  function shown() { return window.KrakenLayers?.groupHidden?.("effects") ? [] : list(); }
  function drawLive() {
    const t0 = performance.now(), d = S().getDocument();
    const fx = shown();
    if (!fx.some(e => e.visible !== false)) window.KrakenWeatherGL.clearLive();
    else window.KrakenWeatherGL.drawLive(fx, S().project, d.view, clock(), e => alphaOf(e, false));
    lastCost = performance.now() - t0;
  }
  function tick() { timer = 0; drawLive(); if (moving()) timer = requestAnimationFrame(tick); }
  function startAnimation() { if (!timer && moving()) timer = requestAnimationFrame(tick); }
  // Back from another window or tab: moving again.
  document.addEventListener?.("visibilitychange", () => { if (!document.hidden) startAnimation(); });
  function trace(ctx, polys) { ctx.beginPath(); for (const q of polys) { for (let i = 0; i < q.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](q[i], q[i + 1]); ctx.closePath(); } }
  // still: a capture (the map as a picture), so the effects are drawn into it; else they
  // are drawn on their own canvas over the map, and only the outlines and labels here.
  function draw(ctx, zoom, still = false) {
    const p = S().project;
    if (window.KrakenLayers?.groupHidden?.('effects')) { if (!still) window.KrakenWeatherGL.clearLive(); return; }
    if (still) window.KrakenWeatherGL.drawStill(ctx, list(), p, clock(), e => alphaOf(e, true));
    else { drawLive(); startAnimation(); }
    // Play test shows the weather as players see it: no outlines, labels or shading.
    const playing = S().mode === 'play';
    const whole = [[0, 0, p.width, 0, p.width, p.height, 0, p.height]], sel = selected();
    ctx.save();
    for (const e of list()) {
      if (e.visible === false) continue;
      const on = active() && sel && e.id === sel.id, dim = active() && sel && !on;
      const polys = e.polygons || whole, col = TYPES[e.type]?.[1] || '#ccc';
      if (!polys.length || still) continue;
      trace(ctx, polys);
      ctx.globalAlpha = dim ? 0.4 : 1; ctx.strokeStyle = col; ctx.lineWidth = (on ? 2.5 : 1.5) / zoom; ctx.setLineDash(on ? [] : [8 / zoom, 5 / zoom]);
      if (e.polygons && !playing) ctx.stroke();
      ctx.setLineDash([]);
      if (!playing && (!active() || on || !sel)) {
        const b = e.polygons ? e : {x: 0, y: 0};
        ctx.globalAlpha = 1; ctx.font = `${Math.max(11, 13 / zoom)}px sans-serif`; ctx.lineWidth = 3 / zoom; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
        const label = `${e.name}${e.polygons ? '' : ' · whole map'}`, x = b.x + 8 / zoom, y = b.y + 18 / zoom;
        ctx.strokeText(label, x, y); ctx.fillText(label, x, y);
      }
    }
    if (still) { ctx.restore(); return; }
    // the selected effect: shade where it is hidden, so both sides of the mask are clear
    if (active() && sel && sel.visible !== false) {
      trace(ctx, [...whole, ...(sel.polygons || whole)]);
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.fill('evenodd');
    }
    // the stroke being drawn
    const show = op => op === 'show' ? '#5fd38a' : '#ff6b5e';
    ctx.globalAlpha = 0.5;
    if (gesture && sel) {
      const pts = gesture.points;
      ctx.strokeStyle = ctx.fillStyle = show(gesture.op);
      if (tool === 'brush') { ctx.lineWidth = radius * 2; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((q, i) => ctx[i ? 'lineTo' : 'moveTo'](q.x, q.y)); if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y); ctx.stroke(); }
      else if (tool === 'rect') { const a = pts[0], b = pts.at(-1); ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); }
      else { ctx.beginPath(); pts.forEach((q, i) => ctx[i ? 'lineTo' : 'moveTo'](q.x, q.y)); ctx.closePath(); ctx.fill(); }
    }
    if (shape) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = show(shape.op); ctx.lineWidth = 2 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath(); [...shape.points, shape.cursor].forEach((q, i) => ctx[i ? 'lineTo' : 'moveTo'](q.x, q.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (active() && sel && tool === 'edit') {
      const polys = edit ? edit.polys : editable(sel), hs = 5 / zoom, near = cursor && !edit ? nearCorner(sel, cursor) : null;
      ctx.globalAlpha = 1; ctx.lineWidth = 1.5 / zoom;
      if (edit) { trace(ctx, polys); ctx.strokeStyle = '#ffd25e'; ctx.setLineDash([6 / zoom, 4 / zoom]); ctx.stroke(); ctx.setLineDash([]); }
      polys.forEach((poly, pi) => { for (let vi = 0; vi < poly.length; vi += 2) {
        const hot = (near && near.pi === pi && near.vi === vi) || (edit && edit.drag.pi === pi && edit.drag.vi === vi) || (picked && picked.pi === pi && picked.vi === vi);
        ctx.fillStyle = hot ? '#ffd25e' : '#ffffff'; ctx.strokeStyle = '#1b1b1b';
        ctx.fillRect(poly[vi] - hs, poly[vi + 1] - hs, 2 * hs, 2 * hs); ctx.strokeRect(poly[vi] - hs, poly[vi + 1] - hs, 2 * hs, 2 * hs);
      } });
    }
    if (active() && sel && tool === 'brush' && cursor && !gesture) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = show(paint); ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.arc(cursor.x, cursor.y, radius, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
  document.addEventListener?.('contextmenu', ev => { if (active() && tool === 'edit' && ev.target?.id === 'mapCanvas') ev.preventDefault(); });
  function modeChanged(mode) {
    gesture = shape = null; edit = null; picked = null;
    if (mode === 'fx') {
      if (!selected() && list().length) S().selected = list().at(-1).id;
      render(); hint(); startAnimation();
    }
    if (mode === 'play') startAnimation();
  }
  // The map moved in the view (a pan): the weather over it follows, unless it is moving anyway.
  const place = () => { if (!timer) drawLive(); };
  return {TYPES, normalize, get animating() { return !!timer; }, get drawCost() { return lastCost; }, pointerDown, pointerMove, pointerUp, keyDown, draw, place, modeChanged, render, add,
    get paint() { return paint; }, set paint(v) { paint = v; }, get tool() { return tool; }, set tool(v) { tool = v; },
    get radius() { return radius; }, set radius(v) { radius = v; }, stroke, reset};
})();
