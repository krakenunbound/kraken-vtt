/* Named art layers (show, hide, lock, rename, reorder) plus walls, lights and effects groups. */
window.KrakenLayers = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  const GROUPS = [['walls', 'Walls & doors'], ['lights', 'Lights'], ['effects', 'Weather effects'], ['regions', 'Traps & regions']];
  const KEPT = {shortcut: 'pins', text: 'text labels', paint: 'drawings', token: 'tokens', folder: 'folders',
    fx: 'other effects', pointer: 'pointers', image: 'locked-pack art layers'};
  const open = new Set();
  let lastSignature = '';
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[m]);
  const newId = () => 'layer-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function ensure(p) {
    if (!Array.isArray(p.layers) || !p.layers.length) {
      p.layers = [{id: 'map', name: 'Map picture', visible: true, locked: false},
                  {id: 'objects', name: 'Objects', visible: true, locked: false}];
      for (const o of p.objects) {
        if (!o.layer) o.layer = o.fgLayer !== undefined || o.width * o.height >= 0.6 * p.width * p.height ? 'map' : 'objects';
      }
    }
    if (!p.layers.some(l => l.id === p.activeLayer)) p.activeLayer = p.layers.at(-1).id;
    p.groups ??= {};
    for (const [g] of GROUPS) p.groups[g] ??= {visible: true};
  }

  // Every object belongs to a layer, and the object list stays in layer order,
  // so drawing, export and saving back to FG all stack art the way the panel shows.
  function normalize(p) {
    window.KrakenLOS?.normalizeAll(p);
    ensure(p);
    const order = new Map(p.layers.map((l, i) => [l.id, i]));
    for (const o of p.objects) if (!order.has(o.layer)) o.layer = p.activeLayer;
    const sorted = p.objects.map((o, i) => [order.get(o.layer), i, o]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(v => v[2]);
    if (sorted.some((o, i) => o !== p.objects[i])) p.objects.splice(0, p.objects.length, ...sorted);
  }

  const layerOf = o => S().project.layers?.find(l => l.id === o.layer);
  const hidden = o => layerOf(o)?.visible === false;
  const locked = o => !!layerOf(o)?.locked;
  const groupHidden = g => S().project.groups?.[g]?.visible === false;

  function forExport(p) {
    const out = JSON.parse(JSON.stringify(p));
    const off = new Set((out.layers || []).filter(l => l.visible === false).map(l => l.id));
    for (const o of out.objects) if (off.has(o.layer)) o.visible = false;
    return out;
  }

  function change(fn) {
    const s = S();
    s.snapshot();
    fn(s.project);
    s.save();
    s.draw();
  }

  function render() {
    const s = S(), p = s.project;
    ensure(p);
    const sel = s.selected;
    const signature = JSON.stringify([p.layers, p.activeLayer, p.groups, sel, [...open], p.objects.map(o => [o.id, o.name, o.layer, o.visible, o.locked]),
      p.walls.length, p.lights.length, p.effects.length, (p.regions || []).length, p.fgKept]);
    if (signature === lastSignature && $('#layerList').children.length) return;
    lastSignature = signature;
    const selectedObject = p.objects.find(o => o.id === sel);
    let html = '<div class="lp-head"><button class="lp-new" title="Add a new art layer above the active one">+ New layer</button>';
    if (selectedObject && p.layers.length > 1) {
      html += `<label class="lp-move">Move selected to <select>${p.layers.slice().reverse().map(l =>
        `<option value="${esc(l.id)}" ${l.id === selectedObject.layer ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>`;
    }
    html += '</div>';
    for (const l of p.layers.slice().reverse()) {
      const items = p.objects.filter(o => o.layer === l.id).reverse();
      const isOpen = open.has(l.id);
      html += `<div class="lp-layer ${l.id === p.activeLayer ? 'active' : ''} ${l.visible === false ? 'off' : ''}" data-layer="${esc(l.id)}">
        <button class="lp-twist" title="${isOpen ? 'Hide' : 'Show'} what is on this layer">${isOpen ? '▾' : '▸'}</button>
        <span class="lp-name" title="Click to open or close it and put new art on this layer. Double-click to rename.">${esc(l.name)}</span>
        <span class="lp-count">${items.length}</span>
        <button class="lp-eye" title="${l.visible === false ? 'Show' : 'Hide'} this layer"><img src="icons/eye.svg" alt="" style="opacity:${l.visible === false ? .25 : 1}"></button>
        <button class="lp-lock" title="${l.locked ? 'Unlock' : 'Lock'} this layer (locked art can't be clicked or moved)"><img src="icons/lock.svg" alt="" style="opacity:${l.locked ? 1 : .25}"></button>
        <button class="lp-up" title="Move layer up">↑</button><button class="lp-down" title="Move layer down">↓</button>
        <button class="lp-del" title="Delete this layer">×</button></div>`;
      if (isOpen) {
        html += '<div class="lp-items">' + (items.map(o => `<button class="lp-item ${o.id === sel ? 'selected' : ''} ${o.visible === false ? 'off' : ''}" data-id="${esc(o.id)}">${o.locked ? '🔒 ' : ''}${esc(o.name || 'Artwork')}</button>`).join('')
          || '<span class="lp-empty">Nothing here yet. Make this the active layer, then place art.</span>') + '</div>';
      }
    }
    for (const [g, label] of GROUPS) {
      const list = p[g] || [], isOpen = open.has(g), off = p.groups[g].visible === false;
      html += `<div class="lp-layer lp-group ${off ? 'off' : ''}" data-group="${g}">
        <button class="lp-twist" title="${isOpen ? 'Hide' : 'Show'} the list">${isOpen ? '▾' : '▸'}</button>
        <span class="lp-name">${label}</span><span class="lp-count">${list.length}</span>
        <button class="lp-eye" title="${off ? 'Show' : 'Hide'} ${label.toLowerCase()} while editing (they still export)"><img src="icons/eye.svg" alt="" style="opacity:${off ? .25 : 1}"></button></div>`;
      if (isOpen) {
        const names = list.slice(0, 300).map(o => `<button class="lp-item ${o.id === sel ? 'selected' : ''}" data-id="${esc(o.id)}">${esc(g === 'walls' ? window.KrakenLOS.label(o) : o.name || o.type || 'Light')}</button>`).join('');
        html += `<div class="lp-items">${names || '<span class="lp-empty">None yet.</span>'}${list.length > 300 ? `<span class="lp-empty">and ${list.length - 300} more</span>` : ''}</div>`;
      }
    }
    const kept = Object.entries(p.fgKept || {}).map(([k, n]) => `${n} ${KEPT[k] || k}`);
    if (kept.length) html += `<div class="lp-kept" title="These stay exactly as they are in FG when you save back">Kept from Fantasy Grounds: ${esc(kept.join(', '))}</div>`;
    const box = $('#layerList');
    box.innerHTML = html;
    wire(box);
  }

  function wire(box) {
    const s = S();
    box.querySelector('.lp-new').onclick = () => {
      const name = prompt('Name for the new layer:', 'Layer ' + (s.project.layers.length + 1));
      if (!name) return;
      change(p => {
        const at = p.layers.findIndex(l => l.id === p.activeLayer);
        const l = {id: newId(), name: name.slice(0, 60), visible: true, locked: false};
        p.layers.splice(at + 1, 0, l);
        p.activeLayer = l.id;
      });
    };
    const move = box.querySelector('.lp-move select');
    if (move) move.onchange = () => change(p => {
      const o = p.objects.find(o => o.id === s.selected);
      if (o) o.layer = move.value;
    });
    box.querySelectorAll('.lp-layer').forEach(row => {
      const id = row.dataset.layer, group = row.dataset.group, key = id || group;
      // A click anywhere on the row opens or closes it; its own buttons (eye, lock, arrows, delete) do their own thing.
      row.onclick = e => {
        const b = e.target.closest('button');
        if (b && !b.classList.contains('lp-twist')) return;
        open.has(key) ? open.delete(key) : open.add(key); render();
      };
      if (group) {
        row.querySelector('.lp-eye').onclick = () => change(p => { p.groups[group].visible = p.groups[group].visible === false; });
        return;
      }
      const layer = () => s.project.layers.find(l => l.id === id);
      const name = row.querySelector('.lp-name');
      name.onclick = () => { s.project.activeLayer = id; s.save(); s.draw(); };
      name.ondblclick = () => {
        const next = prompt('Rename layer:', layer().name);
        if (next) change(() => { layer().name = next.slice(0, 60); });
      };
      row.querySelector('.lp-eye').onclick = () => change(() => { layer().visible = layer().visible === false; });
      row.querySelector('.lp-lock').onclick = () => change(() => { layer().locked = !layer().locked; });
      row.querySelector('.lp-up').onclick = () => change(p => {
        const i = p.layers.findIndex(l => l.id === id);
        if (i < p.layers.length - 1) [p.layers[i], p.layers[i + 1]] = [p.layers[i + 1], p.layers[i]];
      });
      row.querySelector('.lp-down').onclick = () => change(p => {
        const i = p.layers.findIndex(l => l.id === id);
        if (i > 0) [p.layers[i], p.layers[i - 1]] = [p.layers[i - 1], p.layers[i]];
      });
      row.querySelector('.lp-del').onclick = () => {
        const p = s.project, count = p.objects.filter(o => o.layer === id).length;
        if (p.layers.length < 2) { s.toast('A map needs at least one layer.', true); return; }
        if (count && !confirm(`Delete the layer "${layer().name}" and the ${count} piece(s) of art on it? Undo brings it back.`)) return;
        change(p => {
          p.objects = p.objects.filter(o => o.layer !== id);
          p.layers = p.layers.filter(l => l.id !== id);
          if (p.activeLayer === id) p.activeLayer = p.layers.at(-1).id;
        });
      };
    });
    box.querySelectorAll('.lp-item').forEach(b => {
      b.onclick = () => {
        if (b.closest('.lp-items').previousElementSibling?.dataset.group === 'walls') {
          s.switchMode('los'); window.KrakenLOS.selectWallById(b.dataset.id); s.draw();
        } else if (b.closest('.lp-items').previousElementSibling?.dataset.group === 'effects') {
          // an effect opens Weather effects with it selected, ready to paint or edit
          s.selected = b.dataset.id; s.switchMode('fx', false);
        } else s.select(b.dataset.id);
      };
    });
  }

  return {normalize, hidden, locked, groupHidden, forExport, render, ensure};
})();
