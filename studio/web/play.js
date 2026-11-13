/* Play test: walk a stand-in token round the map as a player would, to test
 * walls, doors, windows, line of sight and lighting before exporting.
 *
 * Nothing here changes the map: doors opened, the token and its light are the
 * test's own. Distances come from the map's grid: a square is p.grid pixels and
 * p.gridDistance feet (5 by default), so a torch's 20 ft is 4 squares.
 *
 * Light and vision follow D&D 5E's numbers (most d20 games are close):
 * bright light, then dim light to twice the radius, then darkness. Darkvision
 * sees darkness as dim (in greys) and dim as bright within its range;
 * low-light vision doubles every light's radii; infravision (AD&D, Castles &
 * Crusades) sees warmth in the dark, in reds. */
window.KrakenPlay = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  const K = () => window.KrakenEditorCore;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  // id -> label, bright ft, dim ft (to this distance), cone degrees (360 = all round), colour
  const LIGHTS = {
    none: ['No light', 0, 0, 360, '#ffffff'],
    candle: ['Candle', 5, 10, 360, '#ffb35c'],
    torch: ['Torch', 20, 40, 360, '#ff9d3b'],
    lamp: ['Oil lamp', 15, 45, 360, '#ffbe6b'],
    hooded: ['Hooded lantern', 30, 60, 360, '#ffc777'],
    bullseye: ['Bullseye lantern (cone)', 60, 120, 60, '#ffd28a'],
    light: ['Light (spell / cantrip)', 20, 40, 360, '#f4f1ff'],
    continual: ['Continual flame', 20, 40, 360, '#ffcf8a'],
    dancing: ['Dancing lights', 0, 10, 360, '#ffe9a8'],
    sunrod: ['Sunrod', 30, 60, 360, '#fff6d8'],
    daylight: ['Daylight (spell)', 60, 120, 360, '#fffbe8'],
  };
  // id -> label, range ft, kind
  const VISION = {
    normal: ['Normal (human)', 0, 'normal'],
    lowlight: ['Low-light vision (elf, gnome; 3.5E/PF)', 0, 'lowlight'],
    dark60: ['Darkvision 60 ft (dwarf, elf, half-orc…)', 60, 'dark'],
    dark120: ['Darkvision 120 ft (drow, deep gnome)', 120, 'dark'],
    infra60: ['Infravision 60 ft (AD&D, C&C: dwarf, elf…)', 60, 'infra'],
    infra90: ['Infravision 90 ft (drow, duergar)', 90, 'infra'],
    devil: ['Devil\'s sight 120 ft (sees in any darkness)', 120, 'devil'],
  };
  const st = {token: null, light: 'torch', vision: 'normal', darkness: 0.85, sky: '', tint: null, snap: true, collide: true, showWalls: false,
    facing: 0, doors: {}, drag: null, project: null};
  const active = () => S().mode === 'play';

  // --- the map's grid -------------------------------------------------------
  const feetPerSquare = p => Number(p.gridDistance) > 0 ? Number(p.gridDistance) : 5;
  const px = (p, feet) => feet / feetPerSquare(p) * p.grid;
  function snapCentre(p, q) {
    const g = p.grid, ox = Number(p.gridOffset?.x) || 0, oy = Number(p.gridOffset?.y) || 0;
    return {x: Math.floor((q.x - ox) / g) * g + ox + g / 2, y: Math.floor((q.y - oy) / g) * g + oy + g / 2};
  }

  // --- walls as the test sees them (doors opened in the test count as open) --
  const flagsOf = w => new Set(w.flags || []);
  function isOpen(w) {
    const f = flagsOf(w);
    if (!f.has('toggleable')) return false;
    return w.id in st.doors ? st.doors[w.id].open : f.has('open');
  }
  function isLocked(w) {
    return w.id in st.doors ? st.doors[w.id].locked : flagsOf(w).has('locked');
  }
  function segs(w) {
    const a = []; for (let i = 0; i < w.points.length; i += 2) a.push({x: w.points[i], y: w.points[i + 1]});
    const s = a.slice(1).map((q, i) => [a[i], q]);
    if (flagsOf(w).has('closed') && a.length > 2) s.push([a.at(-1), a[0]]);
    return s.map(([m, n]) => ({kind: 'wall', x1: m.x, y1: m.y, x2: n.x, y2: n.y}));
  }
  // Which walls stop sight, light or feet for someone at `from` (FG's rules, Foundry's senses):
  // - open doors stop nothing; windows (allow vision) stop only feet; illusions (allow movement) not feet;
  // - a shadow caster stops only light;
  // - terrain is seen into but not through (a limited wall), and ignored from inside its shape;
  // - a pit only holds what is inside it: from inside, it stops sight, light and feet;
  // - a single-sided wall stops sight and light from one side only (counter-clockwise flips it).
  function insideShape(w, q) {
    const a = w.points; let hit = false;
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      if ((a[i + 1] > q.y) !== (a[j + 1] > q.y) && q.x < (a[j] - a[i]) * (q.y - a[i + 1]) / (a[j + 1] - a[i + 1]) + a[i]) hit = !hit;
    }
    return hit;
  }
  function wallsFor(p, from, sense) {
    const out = [];
    for (const w of p.walls) {
      const f = flagsOf(w);
      if (isOpen(w)) continue;
      if (f.has('pit')) { if (from && insideShape(w, from)) out.push(...segs(w)); continue; }
      if (f.has('terrain')) { if (sense !== 'move' && !(from && insideShape(w, from))) out.push(...segs(w).map(x => ({...x, limited: true}))); continue; }
      if (sense === 'move') { if (!f.has('allow_move') && !f.has('shadow')) out.push(...segs(w)); continue; }
      if (f.has('allow_vision')) continue;
      if (f.has('shadow') && sense === 'sight') continue;
      let list = segs(w);
      if (f.has('single_sided') && from) {
        const flip = f.has('counterclockwise');
        list = list.filter(x => { const c = (x.x2 - x.x1) * (from.y - x.y1) - (x.y2 - x.y1) * (from.x - x.x1); return flip ? c < 0 : c > 0; });
      }
      out.push(...list);
    }
    return out;
  }
  const sightWalls = (p, from = st.token) => wallsFor(p, from, 'sight');
  const lightWalls = (p, from) => wallsFor(p, from, 'light');
  const moveWalls = (p, from = st.token) => wallsFor(p, from, 'move');

  function blocked(p, a, b) {
    const r = {x: b.x - a.x, y: b.y - a.y};
    let best = 1;
    for (const w of moveWalls(p, a)) {
      const s = {x: w.x2 - w.x1, y: w.y2 - w.y1}, den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((w.x1 - a.x) * s.y - (w.y1 - a.y) * s.x) / den, u = ((w.x1 - a.x) * r.y - (w.y1 - a.y) * r.x) / den;
      if (t > 1e-6 && t < best && u >= -1e-6 && u <= 1 + 1e-6) best = t;
    }
    return best;
  }
  function moveTo(q) {
    const p = S().project, from = st.token;
    let to = st.snap ? snapCentre(p, q) : q;
    if (st.collide) {
      const t = blocked(p, from, to);
      if (t < 1) {
        const back = Math.max(0, t - 2 / Math.hypot(to.x - from.x, to.y - from.y || 1));
        to = {x: from.x + (to.x - from.x) * back, y: from.y + (to.y - from.y) * back};
        if (st.snap) { const c = snapCentre(p, to); if (blocked(p, from, c) >= 1) to = c; }
      }
    }
    if (Math.hypot(to.x - from.x, to.y - from.y) > 1) st.facing = Math.atan2(to.y - from.y, to.x - from.x);
    st.token = to;
  }

  // --- doors ------------------------------------------------------------------
  const doors = p => p.walls.filter(w => flagsOf(w).has('toggleable') && !flagsOf(w).has('terrain') && !flagsOf(w).has('pit'));
  function doorPoint(w) {
    const s = segs(w), m = s[Math.floor(s.length / 2)] || s[0];
    return {x: (m.x1 + m.x2) / 2, y: (m.y1 + m.y2) / 2};
  }
  const doorAt = (p, q) => doors(p).find(w => { const c = doorPoint(w); return Math.hypot(c.x - q.x, c.y - q.y) <= Math.max(10, p.grid * 0.28) / Math.max(0.3, S().zoom) * Math.min(1, S().zoom * 1.5); });

  // --- lights -----------------------------------------------------------------
  function lightsFor(p) {
    const v = VISION[st.vision], k = v[2] === 'lowlight' ? 2 : 1, list = [];
    const L = window.KrakenLighting, now = performance.now() / 1000;
    for (const l of p.lights || []) if (l.on !== false) {
      // FG's light: its strength, falloffs and flicker or pulse (reach and strength move together)
      const a = L.level(l, now);
      list.push({x: l.x, y: l.y, bright: px(p, Number(l.bright) || 0) * k * a.r, dim: px(p, Number(l.dim) || 0) * k * a.r, reach: px(p, Number(l.dim) || 0) * k, color: l.color || '#ffbb66', cone: 360,
        strength: (l.strength ?? 100) / 100 * a.k, falloff: l.falloff, dimFalloff: l.dimFalloff, inverse: !!l.inverse, key: `${l.x},${l.y},${l.bright},${l.dim}`});
    }
    const t = LIGHTS[st.light];
    if (st.token && t[2] > 0) list.push({x: st.token.x, y: st.token.y, bright: px(p, t[1]) * k, dim: px(p, t[2]) * k, color: t[4], cone: t[3], strength: 1});
    return list;
  }
  // Shapes are kept until the walls, doors or the source move: redrawing on pan or zoom costs nothing.
  const shapes = new Map();
  function shape(kind, from, radius, walls) {
    const key = `${kind}|${Math.round(from.x * 10)}|${Math.round(from.y * 10)}|${Math.round(radius)}|${wallKey}`;
    let poly = shapes.get(key);
    if (!poly) {
      if (shapes.size > 400) shapes.clear();
      poly = K().visibilityPolygon(from, radius, walls);
      shapes.set(key, poly);
    }
    return poly;
  }
  let wallKey = '';
  function trace(ctx, poly) { poly.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); }
  function cone(ctx, l) {
    if (l.cone >= 360) return;
    const half = l.cone * Math.PI / 360;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.arc(l.x, l.y, l.dim + 2, st.facing - half, st.facing + half); ctx.closePath(); ctx.clip();
  }

  let layer = null;
  function render(ctx, zoom) {
    if (!active()) return;
    const p = S().project;
    if (p !== st.project) { st.project = p; st.doors = {}; st.token = null; }
    if (!st.token) st.token = snapCentre(p, {x: p.width / 2, y: p.height / 2});
    const scale = Math.min(1, 2400 / Math.max(p.width, p.height));
    layer ||= document.createElement('canvas');
    layer.width = Math.ceil(p.width * scale); layer.height = Math.ceil(p.height * scale);
    const g = layer.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    wallKey = JSON.stringify([p.walls.length, p.walls.map(w => w.points.length + w.points[0] + w.points.at(-1)).join(','), st.doors, p.walls.filter(w => (w.flags || []).includes('open')).length]);
    const v = VISION[st.vision], sight = shape('sight', st.token, Math.hypot(p.width, p.height), sightWalls(p));
    const dark = st.darkness;
    // 0. The outdoor light's colour over the map (dawn's warmth, moonlight's blue).
    if (st.tint && dark < 1) {
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = st.tint.alpha; ctx.fillStyle = st.tint.color;
      ctx.fillRect(0, 0, p.width, p.height); ctx.restore();
    }

    // 1. Darkness everywhere, then each light takes it away inside what it reaches.
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(0,0,0,${0.94 * dark})`; g.fillRect(0, 0, p.width, p.height);
    g.globalCompositeOperation = 'destination-out';
    const lights = lightsFor(p);
    const glow = (c, l, rgb, scale) => {
      const grad = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.dim);
      for (const [pos, v] of window.KrakenLighting.profile(l, l.bright, l.dim))
        grad.addColorStop(Math.min(1, Math.max(0, pos)), `rgba(${rgb},${Math.min(1, v * scale * l.strength).toFixed(3)})`);
      c.fillStyle = grad; c.fillRect(l.x - l.dim, l.y - l.dim, l.dim * 2, l.dim * 2);
    };
    for (const l of lights) {
      if (l.dim <= 0 || l.inverse) continue;
      g.save();
      g.beginPath(); trace(g, shape('light', l, l.reach ?? l.dim, lightWalls(p, l))); g.clip();
      cone(g, l);
      glow(g, l, '0,0,0', 1);  // FG's dim light is half: the profile already says so
      g.restore();
    }
    // Darkness (FG's inverse lights) takes light back, the map's own lights included.
    g.globalCompositeOperation = 'source-over';
    for (const l of lights) {
      if (l.dim <= 0 || !l.inverse) continue;
      g.save(); g.beginPath(); trace(g, shape('light', l, l.reach ?? l.dim, lightWalls(p, l))); g.clip();
      glow(g, l, '0,0,0', 0.97); g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    // 2. Seeing in the dark, within its range and line of sight.
    const range = px(p, v[1]);
    if (range > 0 && dark > 0) {
      g.save(); g.beginPath(); trace(g, sight); g.clip();
      g.beginPath(); g.arc(st.token.x, st.token.y, range, 0, Math.PI * 2); g.clip();
      g.fillStyle = v[2] === 'devil' ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, p.width, p.height);
      g.restore();
    }
    // 3. Beyond line of sight: nothing.
    g.globalCompositeOperation = 'source-over';
    g.save(); g.beginPath(); g.rect(0, 0, p.width, p.height); trace(g, sight); g.fillStyle = '#000'; g.fill('evenodd'); g.restore();
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(layer, 0, 0, p.width, p.height); ctx.restore();

    // Light's colour, a warm wash where lights fall (under the token, over the map).
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    for (const l of lights) {
      if (l.dim <= 0 || dark === 0 || l.inverse) continue;
      ctx.save(); ctx.beginPath(); trace(ctx, shape('light', l, l.reach ?? l.dim, lightWalls(p, l))); ctx.clip(); cone(ctx, l);
      const n = parseInt(l.color.slice(1), 16);
      glow(ctx, l, `${n >> 16},${(n >> 8) & 255},${n & 255}`, 0.67); ctx.restore();
    }
    ctx.restore();
    // Darkvision in greys, infravision in reds (only where it is otherwise dark).
    if (range > 0 && dark > 0.3 && (v[2] === 'dark' || v[2] === 'infra' || v[2] === 'devil')) {
      ctx.save(); ctx.beginPath(); trace(ctx, sight); ctx.clip();
      ctx.beginPath(); ctx.arc(st.token.x, st.token.y, range, 0, Math.PI * 2); ctx.clip();
      const strength = Math.min(1, (dark - 0.3) * 1.6);
      // greys first (darkvision stops there); infravision then a dull red over the greys
      ctx.globalAlpha = strength; ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, p.width, p.height);
      if (v[2] === 'infra') { ctx.globalAlpha = strength * 0.45; ctx.globalCompositeOperation = 'color'; ctx.fillStyle = '#9c3b30'; ctx.fillRect(0, 0, p.width, p.height); }
      ctx.restore();
    }

    // Doors and windows: a handle to click, in the test's own state.
    for (const w of doors(p)) {
      const c = doorPoint(w), open = isOpen(w), locked = isLocked(w), f = flagsOf(w);
      const kind = f.has('allow_vision') ? 'window' : f.has('hidden') ? 'secret' : 'door';
      const r = Math.max(7, 11 / zoom);
      ctx.save(); ctx.lineWidth = 2 / zoom; ctx.strokeStyle = '#111';
      ctx.fillStyle = locked ? '#c0392b' : open ? '#58b368' : kind === 'window' ? '#57a8d8' : kind === 'secret' ? '#9b6bd1' : '#e0b04a';
      ctx.beginPath(); kind === 'window' ? ctx.rect(c.x - r, c.y - r * 0.7, r * 2, r * 1.4) : ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = `bold ${r * 1.1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(locked ? '🔒' : open ? '⇄' : '▮', c.x, c.y + 1 / zoom);
      ctx.restore();
    }
    // The token, with its facing.
    const t = st.token, tr = p.grid * 0.38;
    ctx.save();
    ctx.fillStyle = '#2c7be5'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 / zoom;
    ctx.beginPath(); ctx.arc(t.x, t.y, tr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.x + Math.cos(st.facing) * tr * 1.5, t.y + Math.sin(st.facing) * tr * 1.5);
    ctx.lineTo(t.x + Math.cos(st.facing + 2.5) * tr * 0.6, t.y + Math.sin(st.facing + 2.5) * tr * 0.6);
    ctx.lineTo(t.x + Math.cos(st.facing - 2.5) * tr * 0.6, t.y + Math.sin(st.facing - 2.5) * tr * 0.6); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }

  // --- input ------------------------------------------------------------------
  function pointerDown(e) {
    if (!active() || e.button !== 0) return false;
    const p = S().project, q = S().point(e);
    const d = doorAt(p, q);
    if (d) {
      const cur = {open: isOpen(d), locked: isLocked(d)};
      if (e.shiftKey) cur.locked = !cur.locked;
      else if (cur.locked) { S().toast('Locked. Shift-click to unlock it (the GM can).'); return true; }
      else cur.open = !cur.open;
      st.doors[d.id] = cur; S().draw(); return true;
    }
    if (st.token && Math.hypot(q.x - st.token.x, q.y - st.token.y) <= p.grid * 0.6) {
      st.drag = true; $('#mapCanvas').setPointerCapture(e.pointerId); return true;
    }
    moveTo(q); S().draw(); return true;
  }
  function pointerMove(e) {
    if (!active() || !st.drag) return false;
    const was = st.snap; st.snap = false; moveTo(S().point(e)); st.snap = was; S().draw(); return true;
  }
  function pointerUp() {
    if (!st.drag) return false;
    st.drag = false;
    if (st.snap) { const p = S().project, c = snapCentre(p, st.token); if (!st.collide || blocked(p, st.token, c) >= 1) st.token = c; }
    S().draw(); return true;
  }
  function keyDown(e) {
    if (!active() || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return false;
    const p = S().project, step = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1]}[e.key];
    if (step && st.token) { e.preventDefault(); moveTo({x: st.token.x + step[0] * p.grid, y: st.token.y + step[1] * p.grid}); S().draw(); return true; }
    if (e.key === 'q' || e.key === 'e') { st.facing += (e.key === 'q' ? -1 : 1) * Math.PI / 8; S().draw(); return true; }
    return false;
  }

  // --- the panel ----------------------------------------------------------------
  function describe(p) {
    const t = LIGHTS[st.light], fs = feetPerSquare(p), sq = f => (f / fs).toFixed(1).replace('.0', '');
    const light = t[2] > 0 ? `${t[0]}: bright ${t[1]} ft (${sq(t[1])} squares, ${Math.round(px(p, t[1]))} px), dim to ${t[2]} ft (${sq(t[2])} squares, ${Math.round(px(p, t[2]))} px)${t[3] < 360 ? `, a ${t[3]}° cone (Q and E turn it)` : ''}.` : 'No light of your own.';
    const v = VISION[st.vision];
    const sight = v[1] ? ` ${v[0].split(' (')[0]}: ${v[1]} ft (${sq(v[1])} squares).` : v[2] === 'lowlight' ? ' Low-light vision: every light reaches twice as far.' : '';
    return `One square is ${fs} ft (${p.grid} px). ${light}${sight}`;
  }
  function renderPanel() {
    const box = $('#playPanel'); if (!box) return;
    const p = S().project;
    box.innerHTML = `
      <div class="los-title">Play test</div>
      <p class="los-help">Drag the blue token, click where to walk, or use the arrow keys / WASD. Click a door or window to open or close it; Shift-click locks or unlocks. Nothing here changes the map.</p>
      <label class="play-row">Light source <select id="playLight">${Object.entries(LIGHTS).map(([id, l]) => `<option value="${id}" ${id === st.light ? 'selected' : ''}>${esc(l[0])}${l[2] ? ` (${l[1]}/${l[2]} ft)` : ''}</option>`).join('')}</select></label>
      <label class="play-row">Vision <select id="playVision">${Object.entries(VISION).map(([id, v]) => `<option value="${id}" ${id === st.vision ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select></label>
      <label class="play-row">Time of day <select id="playSky"><option value="">The map's own (${esc(skyName(p))})</option>${Object.entries(window.KrakenLighting?.AMBIENT || {}).filter(([id]) => id !== 'custom').map(([id, a]) => `<option value="${id}" ${id === st.sky ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>
      <label class="play-row">Darkness <span class="play-dark"><span>Day</span><input id="playDark" type="range" min="0" max="1" step="0.05" value="${st.darkness}"><span>Night</span></span></label>
      <label class="play-check"><input id="playSnap" type="checkbox" ${st.snap ? 'checked' : ''}> Snap to the squares</label>
      <label class="play-check"><input id="playCollide" type="checkbox" ${st.collide ? 'checked' : ''}> Walls stop me</label>
      <label class="play-check"><input id="playWalls" type="checkbox" ${st.showWalls ? 'checked' : ''}> Show the walls</label>
      <label class="play-row">Feet per square <input id="playFeet" type="number" min="1" max="100" step="1" value="${feetPerSquare(p)}"></label>
      <p class="los-help" id="playInfo">${esc(describe(p))}</p>
      <button class="los-action" id="playReset">Close every door again</button>`;
    const redraw = () => { $('#playInfo').textContent = describe(S().project); S().draw(); };
    $('#playLight').onchange = e => { st.light = e.target.value; redraw(); };
    $('#playVision').onchange = e => { st.vision = e.target.value; redraw(); };
    $('#playDark').oninput = e => { st.darkness = Number(e.target.value); S().draw(); };
    $('#playSky').onchange = e => { st.sky = e.target.value; sky(S().project); $('#playDark').value = st.darkness; S().draw(); };
    $('#playSnap').onchange = e => { st.snap = e.target.checked; S().draw(); };
    $('#playCollide').onchange = e => { st.collide = e.target.checked; };
    $('#playWalls').onchange = e => { st.showWalls = e.target.checked; S().draw(); };
    $('#playFeet').onchange = e => { const v = Math.max(1, Math.min(100, Number(e.target.value) || 5)); S().snapshot(); S().project.gridDistance = v; S().save(); redraw(); };
    $('#playReset').onclick = () => { st.doors = {}; S().draw(); };
  }
  // The outdoor light: the map's own (Lighting), or one picked here to try.
  function skyName(p) { return p.ambient ? window.KrakenLighting.AMBIENT[p.ambient.preset].label : 'not set'; }
  function sky(p) {
    const L = window.KrakenLighting;
    if (!L) return;
    const a = st.sky ? L.normalizeAmbient({preset: st.sky}) : p.ambient;
    const view = {...p, ambient: a};
    st.darkness = L.darkness(view); st.tint = L.tint(view);
  }
  function modeChanged(mode) {
    if (mode !== 'play') return;
    const p = S().project;
    st.sky = ''; sky(p);
    renderPanel();
    $('#canvasHint').textContent = 'Drag the token or click where to walk; click doors and windows to open them';
  }
  // While testing, the editor's own wall lines, light markers and trap outlines are hidden (players never see them).
  const hidesEditing = () => active() && !st.showWalls;
  return {render, pointerDown, pointerMove, pointerUp, keyDown, modeChanged, hidesEditing, LIGHTS, VISION, _state: st,
    // for test_play.js
    _test: {sightWalls, lightWalls, moveWalls, blocked, moveTo, px, snapCentre, isOpen, isLocked, doors, doorPoint, lightsFor, feetPerSquare}};
})();
