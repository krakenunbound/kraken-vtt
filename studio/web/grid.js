/* Grid & map size: line the grid up with the squares drawn in the map picture. */
window.KrakenGrid = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  let setting = false, drag = null;
  const active = () => S().mode === 'grid';

  function apply(size, ox, oy) {
    const p = S().project, g = Math.min(1000, Math.max(5, Math.round(size * 100) / 100));
    S().snapshot();
    p.grid = g;
    p.gridOffset = {x: Math.round((((ox % g) + g) % g) * 100) / 100, y: Math.round((((oy % g) + g) % g) * 100) / 100};
    p.wallGridSnap = true;  // the grid now matches the picture, so snapping helps
    S().save(); S().draw(); render();
  }

  function render() {
    const box = $('#gridPanel'); if (!box) return;
    const p = S().project, off = p.gridOffset || {x: 0, y: 0};
    box.innerHTML = `
      <div class="los-title">Line the grid up with the picture</div>
      <button class="gold grid-set ${setting ? 'on' : ''}" title="Then drag a box over exactly one square of the map picture.">${setting ? 'Now drag over one square…' : 'Set grid from the picture'}</button>
      <p class="los-help">Zoom in, click this, then drag from one corner of a square in the picture to the opposite corner. Map Studio sets the square size and lines the grid up with it.</p>
      <div class="grid-fields">
        <label>Square size <span><input type="number" id="gridSize" min="5" max="1000" step="0.1" value="${p.grid}"> px</span></label>
        <label>Offset across <span><input type="number" id="gridOx" step="0.1" value="${off.x || 0}"> px</span></label>
        <label>Offset down <span><input type="number" id="gridOy" step="0.1" value="${off.y || 0}"> px</span></label>
      </div>
      <p class="los-help">One square is 5 ft. This map is ${(p.width / p.grid).toFixed(1).replace('.0', '')} × ${(p.height / p.grid).toFixed(1).replace('.0', '')} squares.<br>
        Arrow keys nudge the grid 1 px (Alt 0.1, Shift 10); Ctrl+arrows change the square size, like Fantasy Grounds.</p>`;
    box.querySelector('.grid-set').onclick = () => { setting = !setting; render(); hint(); };
    const read = () => apply(Number($('#gridSize').value) || p.grid, Number($('#gridOx').value) || 0, Number($('#gridOy').value) || 0);
    ['#gridSize', '#gridOx', '#gridOy'].forEach(id => { $(id).onchange = read; });
  }
  function hint() {
    if (!active()) return;
    $('#canvasHint').textContent = setting ? 'Drag from one corner of a square in the picture to the opposite corner' : 'Line the grid up with the picture (Set grid from the picture)';
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
  // Look for the grid lines drawn in the map picture near the dragged size, so a
  // rough drag still gives an exact grid. Returns null when the picture has no clear grid.
  function detect(estimate, ox, oy) {
    const p = S().project, base = p.objects.find(o => o.layer === 'map') ||
      p.objects.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!base) return null;
    const img = S().image(base.assetId);
    if (!img.complete || !img.naturalWidth) return null;
    const scale = base.width / img.naturalWidth, W = Math.min(img.naturalWidth, 4096), H = Math.min(img.naturalHeight, 4096);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0, W, H);
    const k = img.naturalWidth / W * scale, data = g.getImageData(0, 0, W, H).data;
    const lum = i => data[i] * .3 + data[i + 1] * .59 + data[i + 2] * .11;
    const colP = new Float32Array(W), rowP = new Float32Array(H);
    for (let y = 0; y < H; y += 2) for (let x = 1; x < W; x++) colP[x] += Math.abs(lum((y * W + x) * 4) - lum((y * W + x - 1) * 4));
    for (let x = 0; x < W; x += 2) for (let y = 1; y < H; y++) rowP[y] += Math.abs(lum((y * W + x) * 4) - lum(((y - 1) * W + x) * 4));
    function best(P, est, guess) {
      const n = P.length, mean = P.reduce((s, v) => s + v, 0) / n || 1, at = x => { const i = Math.round(x); return i > 0 && i < n - 1 ? P[i - 1] + P[i] + P[i + 1] : 0; };
      let top = {score: 0};
      for (let T = est * 0.88; T <= est * 1.12; T += 0.05) {
        for (let ph = 0; ph < T; ph += 0.5) {
          let s = 0, m = 0; for (let x = ph; x < n; x += T) { s += at(x); m++; }
          s /= m * 3 * mean;
          if (s > top.score) top = {score: s, T, ph};
        }
      }
      return top.score > 1.6 ? top : null;  // lines must stand out clearly from the picture
    }
    const cx = best(colP, estimate / k, ox / k), cy = best(rowP, estimate / k, oy / k);
    if (!cx || !cy || Math.abs(cx.T - cy.T) / cx.T > 0.02) return null;
    const T = (cx.T + cy.T) / 2 * k;
    return {size: T, x: base.x + cx.ph * k, y: base.y + cy.ph * k};
  }
  function pointerUp() {
    if (!drag) return false;
    const {a, b} = drag; drag = null;
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (w < 5 || h < 5) { S().draw(); return true; }
    const size = Math.abs(w - h) / Math.max(w, h) < 0.15 ? (w + h) / 2 : Math.max(w, h);
    setting = false;
    let found = null;
    try { found = detect(size, Math.min(a.x, b.x), Math.min(a.y, b.y)); } catch { found = null; }
    if (found) {
      apply(found.size, found.x, found.y);
      S().toast(`Grid set to ${Math.round(found.size * 100) / 100} px squares, locked onto the grid lines in the picture.`);
    } else {
      apply(size, Math.min(a.x, b.x), Math.min(a.y, b.y));
      S().toast(`Grid set to ${Math.round(size * 10) / 10} px squares from your box. Nudge it with the arrow keys if it drifts.`);
    }
    hint();
    return true;
  }
  function keyDown(e) {
    if (!active()) return false;
    const d = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[e.key];
    if (!d) return false;
    e.preventDefault();
    const p = S().project, off = p.gridOffset || {x: 0, y: 0};
    if (e.ctrlKey || e.metaKey) {
      const step = e.altKey ? 0.1 : 1, change = d[0] || -d[1];
      apply(p.grid + change * step, off.x, off.y);
    } else {
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      apply(p.grid, (off.x || 0) + d[0] * step, (off.y || 0) + d[1] * step);
    }
    return true;
  }
  function draw(ctx, zoom) {
    if (!drag) return;
    ctx.save(); ctx.strokeStyle = '#f0dfab'; ctx.lineWidth = 2 / zoom; ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeRect(drag.a.x, drag.a.y, drag.b.x - drag.a.x, drag.b.y - drag.a.y); ctx.restore();
  }
  function modeChanged(mode) { setting = false; drag = null; if (mode === 'grid') { render(); hint(); } }
  let lastSig = '';
  function refresh() {
    if (!active()) return;
    const p = S().project, sig = JSON.stringify([p.grid, p.gridOffset, p.width, p.height, setting]);
    if (sig !== lastSig) { lastSig = sig; render(); }
  }
  return {pointerDown, pointerMove, pointerUp, keyDown, draw, modeChanged, refresh};
})();
