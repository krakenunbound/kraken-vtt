/* Grid & map size: draw the grid over the squares printed in the map picture, and its look.
   The project keeps: grid (a cell's width, px), gridY (its height when width and height are
   unlinked; null: square), gridOffset, gridDistance and gridUnits (a square's measure),
   gridColor, gridAlpha (0-1), gridShow, gridStyle (solid, dashed, dotted). */
window.KrakenGrid = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  // Drawing is on whenever Grid & map size is open: a drag over one square sets the grid.
  let setting = false, drag = null, unlinked = null;
  const active = () => S().mode === 'grid';
  const cellY = p => (Number(p.gridY) > 0 ? Number(p.gridY) : p.grid);
  const linkedNow = p => (unlinked === null ? !(Number(p.gridY) > 0) : !unlinked);

  // The grid's look, for the canvas and Save to Kraken.
  function look(p) {
    return {
      color: /^#[0-9a-f]{6}$/i.test(p.gridColor || '') ? p.gridColor : '#ffffff',
      alpha: p.gridAlpha !== null && p.gridAlpha !== undefined && Number.isFinite(Number(p.gridAlpha)) ? Math.min(1, Math.max(0, Number(p.gridAlpha))) : 0.4,
      show: p.gridShow !== false,
      style: ['dashed', 'dotted'].includes(p.gridStyle) ? p.gridStyle : 'solid',
    };
  }
  function change(patch) {
    const p = S().project;
    S().snapshot();
    Object.assign(p, patch);
    S().save(); S().draw(); render();
  }
  function apply(size, ox, oy, sizeY = null) {
    const p = S().project, g = Math.min(1000, Math.max(5, Math.round(size * 100) / 100));
    const gy = sizeY ? Math.min(1000, Math.max(5, Math.round(sizeY * 100) / 100)) : null;
    S().snapshot();
    p.grid = g;
    p.gridY = gy;
    p.gridOffset = {x: Math.round((((ox % g) + g) % g) * 100) / 100, y: Math.round((((oy % (gy || g)) + (gy || g)) % (gy || g)) * 100) / 100};
    // The grid now matches the picture, so snapping helps: on, unless the GM has turned it off.
    if (!p.gridSnapChosen) p.wallGridSnap = true;
    S().save(); S().draw(); render();
  }

  function render() {
    const box = $('#gridPanel'); if (!box) return;
    const p = S().project, off = p.gridOffset || {x: 0, y: 0}, l = look(p), linked = linkedNow(p);
    const squaresAcross = (p.width / p.grid).toFixed(1).replace('.0', ''), squaresDown = (p.height / cellY(p)).toFixed(1).replace('.0', '');
    box.innerHTML = `
      <div class="los-title">Grid</div>
      <div class="grid-tools">
        <button class="gold grid-set ${setting ? 'on' : ''}" aria-pressed="${setting}" title="Drag from one corner of a square in the picture to the opposite corner">⌖ ${setting ? 'Drawing: drag over one square' : 'Draw the grid'}</button>
        <button class="grid-eye ${l.show ? 'on' : ''}" aria-pressed="${l.show}" aria-label="${l.show ? 'Hide the grid' : 'Show the grid'}" title="${l.show ? 'Shown: click to hide the grid (it still snaps and measures)' : 'Hidden: click to show the grid'}">${l.show ? '👁' : '◌'}</button>
      </div>
      <p class="los-help">Zoom in, then drag from one corner of a square printed in the picture to the opposite corner: the grid takes that square's size and lines up with it. Drag again to redo it.</p>
      <div class="grid-fields grid-cell">
        <label>Width <span><input type="number" id="gridSize" min="5" max="1000" step="0.1" value="${p.grid}"></span></label>
        <button class="grid-link ${linked ? 'on' : ''}" aria-pressed="${linked}" aria-label="${linked ? 'Width and height linked: click to unlink' : 'Width and height unlinked: click to link'}" title="${linked ? 'Linked: square cells. Click to set width and height apart.' : 'Unlinked: each cell its own width and height. Click to make them square.'}">${linked ? '🔗' : '⛓️‍💥'}</button>
        <label>Height <span><input type="number" id="gridSizeY" min="5" max="1000" step="0.1" value="${cellY(p)}"></span></label>
      </div>
      <div class="grid-fields">
        <label>Tint <span><input type="color" id="gridColor" value="${l.color}"></span></label>
        <label title="0 hides the lines; the grid still snaps and measures">Alpha ${Math.round(l.alpha * 255)} <span><input type="range" id="gridAlpha" min="0" max="255" step="1" value="${Math.round(l.alpha * 255)}"></span></label>
        <label>Line <span><select id="gridStyle"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></span></label>
        <label>Distance a square <span><input type="number" id="gridDistance" min="0.1" step="0.5" value="${Number(p.gridDistance) > 0 ? p.gridDistance : 5}"></span></label>
        <label>Suffix <span><input id="gridUnits" maxlength="12" value="${String(p.gridUnits || 'ft').replace(/"/g, '&quot;')}"></span></label>
      </div>
      <div class="grid-nudge">
        <span>Adjust position</span>
        <div class="grid-cross" role="group" aria-label="Adjust position">
          <button data-nudge="0,-1" class="up" aria-label="Move the grid up" title="1 px; Shift: 10 px">↑</button>
          <button data-nudge="-1,0" class="left" aria-label="Move the grid left" title="1 px; Shift: 10 px">←</button>
          <button data-nudge="1,0" class="right" aria-label="Move the grid right" title="1 px; Shift: 10 px">→</button>
          <button data-nudge="0,1" class="down" aria-label="Move the grid down" title="1 px; Shift: 10 px">↓</button>
        </div>
        <label>Across <input type="number" id="gridOx" step="0.1" value="${off.x || 0}"></label>
        <label>Down <input type="number" id="gridOy" step="0.1" value="${off.y || 0}"></label>
      </div>
      <p class="los-help">This map is ${squaresAcross} × ${squaresDown} squares. Arrow keys nudge the grid 1 px (Alt 0.1, Shift 10); Ctrl+arrows change the square size.</p>`;
    box.querySelector('#gridStyle').value = l.style;
    box.querySelector('.grid-set').onclick = () => { setting = true; render(); hint(); };
    box.querySelector('.grid-eye').onclick = () => change({gridShow: !l.show});
    box.querySelector('.grid-link').onclick = () => {
      if (linked) { unlinked = true; render(); return; }
      unlinked = false;
      apply(p.grid, off.x || 0, off.y || 0, null);
    };
    $('#gridSize').onchange = e => { const v = Number(e.target.value) || p.grid; apply(v, off.x || 0, off.y || 0, linked ? null : cellY(p)); };
    $('#gridSizeY').onchange = e => { const v = Number(e.target.value) || cellY(p); linked ? apply(v, off.x || 0, off.y || 0, null) : apply(p.grid, off.x || 0, off.y || 0, v); };
    $('#gridColor').oninput = e => change({gridColor: e.target.value});
    $('#gridAlpha').onchange = e => change({gridAlpha: Number(e.target.value) / 255});
    $('#gridStyle').onchange = e => change({gridStyle: e.target.value});
    $('#gridDistance').onchange = e => change({gridDistance: Math.min(1000, Math.max(0.1, Number(e.target.value) || 5))});
    $('#gridUnits').onchange = e => change({gridUnits: String(e.target.value || 'ft').slice(0, 12)});
    const read = () => apply(p.grid, Number($('#gridOx').value) || 0, Number($('#gridOy').value) || 0, Number(p.gridY) > 0 ? p.gridY : null);
    ['#gridOx', '#gridOy'].forEach(id => { $(id).onchange = read; });
    box.querySelectorAll('[data-nudge]').forEach(b => {
      b.onclick = e => {
        const [dx, dy] = b.dataset.nudge.split(',').map(Number), step = e.shiftKey ? 10 : 1;
        apply(p.grid, (off.x || 0) + dx * step, (off.y || 0) + dy * step, Number(p.gridY) > 0 ? p.gridY : null);
      };
    });
  }
  function hint() {
    if (!active()) return;
    $('#canvasHint').textContent = setting ? 'Drag from one corner of a square in the picture to the opposite corner' : 'Press Draw the grid, then drag over one square of the picture';
  }

  function pointerDown(e) {
    if (!active() || !setting || e.button !== 0) return false;
    const q = S().point(e);
    drag = {a: q, b: q};
    $('#mapCanvas').setPointerCapture(e.pointerId);
    return true;
  }
  function pointerMove(e) {
    if (!drag) return false;
    drag.b = S().point(e); S().draw(); return true;
  }
  function pointerUp() {
    if (!drag) return false;
    const {a, b} = drag; drag = null;
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (w < 5 || h < 5) { S().draw(); return true; }
    const p = S().project, left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
    if (!linkedNow(p)) {
      // Unlinked: the box is the cell.
      apply(w, left, top, h);
      S().toast(`Grid set to ${Math.round(w * 10) / 10} × ${Math.round(h * 10) / 10} px cells from your box.`);
      hint();
      return true;
    }
    // Linked: square cells, exactly where the box was drawn (a near-square box averages its sides).
    const size = Math.abs(w - h) / Math.max(w, h) < 0.15 ? (w + h) / 2 : Math.max(w, h);
    apply(size, left, top);
    S().toast(`Grid set to ${Math.round(size * 10) / 10} px squares from your box. Nudge it with the arrows if it drifts.`);
    hint();
    return true;
  }
  function keyDown(e) {
    if (!active()) return false;
    const d = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[e.key];
    if (!d) return false;
    e.preventDefault();
    const p = S().project, off = p.gridOffset || {x: 0, y: 0}, gy = Number(p.gridY) > 0 ? p.gridY : null;
    if (e.ctrlKey || e.metaKey) {
      const step = e.altKey ? 0.1 : 1, change = d[0] || -d[1];
      apply(p.grid + change * step, off.x, off.y, gy ? gy + change * step : null);
    } else {
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      apply(p.grid, (off.x || 0) + d[0] * step, (off.y || 0) + d[1] * step, gy);
    }
    return true;
  }
  // The grid's lines over the map, in its own tint and alpha (a line a screen pixel or more wide at any zoom).
  function paint(ctx, p, zoom) {
    const l = look(p);
    if (!l.show || l.alpha <= 0) return;
    const gx = p.grid, gy = cellY(p), ox = Number(p.gridOffset?.x) || 0, oy = Number(p.gridOffset?.y) || 0, z = zoom || 1;
    const r = parseInt(l.color.slice(1, 3), 16), g = parseInt(l.color.slice(3, 5), 16), b = parseInt(l.color.slice(5, 7), 16);
    ctx.save();
    ctx.strokeStyle = `rgba(${r},${g},${b},${l.alpha})`;
    ctx.lineWidth = Math.max(1, 1.2 / z);
    ctx.setLineDash(l.style === 'dashed' ? [6 / z, 4 / z] : l.style === 'dotted' ? [1.2 / z, 4 / z] : []);
    ctx.beginPath();
    for (let a = ((ox % gx) + gx) % gx; a <= p.width; a += gx) { ctx.moveTo(a, 0); ctx.lineTo(a, p.height); }
    for (let a = ((oy % gy) + gy) % gy; a <= p.height; a += gy) { ctx.moveTo(0, a); ctx.lineTo(p.width, a); }
    ctx.stroke();
    ctx.restore();
  }
  function draw(ctx, zoom) {
    if (!drag) return;
    ctx.save(); ctx.strokeStyle = '#ffb02e'; ctx.fillStyle = 'rgba(255, 210, 120, 0.15)'; ctx.lineWidth = 2 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.fillRect(drag.a.x, drag.a.y, drag.b.x - drag.a.x, drag.b.y - drag.a.y);
    ctx.strokeRect(drag.a.x, drag.a.y, drag.b.x - drag.a.x, drag.b.y - drag.a.y);
    ctx.setLineDash([]); ctx.font = `${14 / zoom}px sans-serif`; ctx.fillStyle = '#ffb02e';
    ctx.fillText(`${Math.round(Math.abs(drag.b.x - drag.a.x))} × ${Math.round(Math.abs(drag.b.y - drag.a.y))}`, Math.max(drag.a.x, drag.b.x) + 6 / zoom, Math.min(drag.a.y, drag.b.y) + 14 / zoom);
    ctx.restore();
  }
  function modeChanged(mode) { setting = mode === 'grid'; drag = null; unlinked = null; if (mode === 'grid') { render(); hint(); } }
  let lastSig = '';
  function refresh() {
    if (!active()) return;
    const p = S().project, sig = JSON.stringify([p.grid, p.gridY, p.gridOffset, p.width, p.height, p.gridColor, p.gridAlpha, p.gridShow, p.gridStyle, p.gridDistance, p.gridUnits, setting, unlinked]);
    if (sig !== lastSig) { lastSig = sig; render(); }
  }
  return {pointerDown, pointerMove, pointerUp, keyDown, draw, paint, look, cellY, modeChanged, refresh};
})();
