/* Lighting: the map's outdoor light (time of day, FG's ambient lighting) and its lights.
 *
 * p.ambient (absent: not set, FG's own default) is
 *   {preset: 'night'|'dawn'|'sunlight'|'dusk'|'moonlight'|'custom', color: '#rrggbb', alpha: 0..1,
 *    shadows: bool, shadowColor: '#rrggbb', shadowAlpha: 0..1, angle: 0..359 (sun direction), length: 0..20 squares}
 * Exported to FG as the image's <ambient> (the presets are CoreRPG's own), to Foundry as the
 * scene's darkness, and read by Kraken VTT from either.
 *
 * A light is FG's image light:
 *   {id, x, y, color, strength: 1..100 (%, FG's colour alpha), bright, dim (ft),
 *    falloff: 0..100 (% of the bright band that fades, FG default 25), dimFalloff: 0..100 (FG default 50),
 *    preset?, animation?: 'flicker'|'pulse', speed?: 1..100 (%), inverse?: true (darkness), on?: false}.
 * FG keeps it as <range>bright,falloff,dim,dimfalloff</range> (squares, fractions), <color>#AARRGGBB</color>,
 * animtype (1 flicker, 2 pulse), animspeed (0..1), <inverse/>; Foundry as attenuation, alpha, torch / pulse,
 * negative. (Projects before this kept animationSpeed 1..10: read as speed x 10.) */
window.KrakenLighting = (() => {
  'use strict';
  const S = () => window.KrakenStudio, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // CoreRPG's ambient presets (gameelements.xml), plus Night (no outdoor light) and Custom.
  const AMBIENT = {
    night: {label: 'Night', help: 'No outdoor light: only the map\'s own lights (and darkvision) show anything.', darkness: 1},
    dawn: {label: 'Dawn', color: '#ffdfbd', alpha: 1, shadowColor: '#0057bd', shadowAlpha: 0x65 / 255, angle: 144, length: 2, darkness: 0.3},
    sunlight: {label: 'Daylight', color: '#fff7e6', alpha: 1, shadowColor: '#30525d', shadowAlpha: 0x91 / 255, angle: 280, length: 0.2, darkness: 0},
    dusk: {label: 'Dusk', color: '#ffc3a0', alpha: 1, shadowColor: '#3052bb', shadowAlpha: 0x31 / 255, angle: 316, length: 2, darkness: 0.4},
    moonlight: {label: 'Moonlight', color: '#c9e7ff', alpha: 0x91 / 255, shadowColor: '#195263', shadowAlpha: 0x74 / 255, angle: 220, length: 0.6, darkness: 0.7},
    custom: {label: 'Custom', color: '#8ea0c8', alpha: 0.8, shadowColor: '#202838', shadowAlpha: 0.5, angle: 225, length: 1},
  };
  // CoreRPG's light presets (manager_vision.lua; radii in feet: FG's grid units x 5, speed in %),
  // plus a campfire and a glow. FG's defaults: falloff 25% bright, 50% dim, speed 100%.
  const LIGHTS = {
    candle: ['Candle', 5, 10, '#fffcc3', 'flicker', 100],
    lamp: ['Lamp', 15, 45, '#fff3e1', 'flicker', 25],
    torch: ['Torch', 20, 40, '#fff3e1', 'flicker', 25],
    lantern: ['Lantern', 30, 60, '#f9feff', null, 100],
    bullseye: ['Bullseye lantern', 60, 120, '#f9feff', null, 100],
    spell: ['Light (spell)', 20, 40, '#fff3e1', null, 100],
    darkness: ['Darkness (spell)', 15, 15, '#000000', null, 100, {inverse: true}],
    campfire: ['Campfire', 20, 40, '#ffb36b', 'flicker', 50],
    glow: ['Magical glow', 10, 20, '#9fd4ff', 'pulse', 30],
    custom: ['Custom', 10, 20, '#ffbb66', null, 100],
  };
  const FALLOFF = 25, DIM_FALLOFF = 50;
  let tool = 'place', preset = 'torch', drag = null;
  const active = () => S().mode === 'lighting';
  const uid = () => 'light-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d;
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  function normalizeAmbient(a) {
    if (!a || typeof a !== 'object' || !AMBIENT[a.preset]) return undefined;
    if (a.preset === 'night') return {preset: 'night'};
    const d = AMBIENT[a.preset];
    return {preset: a.preset, color: hex(a.color, d.color), alpha: num(a.alpha, 0.05, 1, d.alpha),
      shadows: a.shadows !== false, shadowColor: hex(a.shadowColor, d.shadowColor), shadowAlpha: num(a.shadowAlpha, 0, 1, d.shadowAlpha),
      angle: Math.round(num(a.angle, 0, 359, d.angle)), length: Math.round(num(a.length, 0, 20, d.length) * 5) / 5};
  }
  function normalizeLight(l) {
    const out = {...l};
    if (out.speed === undefined && out.animationSpeed !== undefined) out.speed = Number(out.animationSpeed) * 10;
    delete out.animationSpeed;
    if (out.animation !== 'flicker' && out.animation !== 'pulse') delete out.animation;
    if (out.animation) out.speed = Math.round(num(out.speed, 1, 100, 100)); else delete out.speed;
    out.strength = Math.round(num(out.strength, 1, 100, 100));
    out.falloff = Math.round(num(out.falloff, 0, 100, FALLOFF));
    out.dimFalloff = Math.round(num(out.dimFalloff, 0, 100, DIM_FALLOFF));
    if (out.inverse !== true) delete out.inverse;
    if (out.on !== false) delete out.on;
    if (out.preset && !LIGHTS[out.preset]) delete out.preset;
    return out;
  }
  // How dark the map is outside its lights, 0 day .. 1 night. Not set: FG lights a map with
  // no lights fully and keeps a map with lights dark.
  function darkness(p) {
    const a = p.ambient;
    if (!a) return p.lights?.length ? 0.85 : 0;
    if (a.preset !== 'custom') return AMBIENT[a.preset].darkness;
    const n = parseInt(a.color.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return Math.round(Math.min(1, Math.max(0, 1 - lum * a.alpha)) * 100) / 100;
  }
  // The outdoor light's colour on the map (multiplied over it), or null.
  const tint = p => p.ambient && p.ambient.preset !== 'night' ? {color: p.ambient.color, alpha: 0.25 + 0.3 * p.ambient.alpha} : null;

  function change(fn) { S().snapshot(); fn(S().project); S().save(); S().draw(); render(); }
  const selectedLight = () => S().project.lights.find(l => l.id === S().selected);

  function render() {
    const box = $('#lightingPanel'); if (!box) return;
    const p = S().project, a = p.ambient, l = selectedLight();
    const pick = a?.preset || '';
    const slider = (id, label, min, max, step, value, unit, help) =>
      `<label class="fx-slider" title="${esc(help || '')}">${label}<input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"><span>${value}${unit}</span></label>`;
    box.innerHTML = `
      <div class="los-title">Outdoor light · time of day</div>
      <div class="los-types">
        <button class="los-type ${!pick ? 'on' : ''}" data-ambient="" title="FG's own default: a map with lights is dark, a map without them fully lit.">Not set</button>
        ${Object.entries(AMBIENT).map(([id, v]) => `<button class="los-type ${pick === id ? 'on' : ''}" data-ambient="${id}"${v.color ? ` title="${v.label}: Fantasy Grounds' own preset"` : ''}><i style="border-top:3px solid ${v.color || '#000'}"></i>${v.label}</button>`).join('')}
      </div>
      <p class="los-help">${!a ? (p.lights.length ? 'Not set: this map has lights, so outside them it is dark.' : 'Not set: with no lights the map is shown fully lit.')
        : a.preset === 'night' ? esc(AMBIENT.night.help)
        : `Outdoor light reaches everywhere walls don't shut it out; your lights still add to it. Fantasy Grounds uses it as its ambient lighting, Foundry as the scene's darkness (${Math.round(darkness(p) * 100)}%).`}</p>
      ${a && a.preset !== 'night' ? `
        <div class="fx-row"><label>Colour <input id="ambColor" type="color" value="${a.color}"></label></div>
        ${slider('ambAlpha', 'Strength', 5, 100, 5, Math.round(a.alpha * 100), '%', 'How much the outdoor light lights the map')}
        <label class="fx-check"><input id="ambShadows" type="checkbox" ${a.shadows ? 'checked' : ''}> Shadows (walls and art cast them, in FG)</label>
        ${a.shadows ? `${slider('ambAngle', 'Sun direction', 0, 359, 1, a.angle, '°', 'Where the light comes from (0 east, 90 south)')}
          ${slider('ambLength', 'Shadow length', 0, 20, 0.2, a.length, ' sq', 'In squares')}
          <div class="fx-row"><label>Shadow colour <input id="ambShadowColor" type="color" value="${a.shadowColor}"></label></div>
          ${slider('ambShadowAlpha', 'Shadow strength', 0, 100, 5, Math.round(a.shadowAlpha * 100), '%')}` : ''}` : ''}
      <div class="los-title">Lights</div>
      <div class="los-tools">
        <button class="los-tool ${tool === 'place' ? 'on' : ''}" data-light-tool="place" title="Click the map to put a light there.">Place light</button>
        <button class="los-tool ${tool === 'select' ? 'on' : ''}" data-light-tool="select" title="Click a light to change it; drag it to move it.">Select &amp; move</button>
      </div>
      <label class="play-row">New lights are <select id="lightPreset">${Object.entries(LIGHTS).map(([id, v]) => `<option value="${id}" ${id === preset ? 'selected' : ''}>${esc(v[0])}${id === 'custom' ? '' : ` (${v[1]}/${v[2]} ft)`}</option>`).join('')}</select></label>
      ${l ? `<div class="region-edit">
        <b>${esc(LIGHTS[l.preset]?.[0] || 'Light')}</b>
        <label>Kind <select id="lightKind">${Object.entries(LIGHTS).map(([id, v]) => `<option value="${id}" ${id === (l.preset || 'custom') ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select></label>
        <div class="fx-row"><label>Colour <input id="lightColor" type="color" value="${l.color}"></label></div>
        ${slider('lightStrength', 'Strength', 1, 100, 1, l.strength ?? 100, '%', "How strongly it lights (FG: the colour's alpha)")}
        <div class="two"><label>Bright (ft) <input id="lightBright" type="number" min="0" max="10000" step="5" value="${l.bright}"></label><label>Dim (ft) <input id="lightDim" type="number" min="0" max="10000" step="5" value="${l.dim}"></label></div>
        ${slider('lightFalloff', 'Bright falloff', 0, 100, 1, l.falloff ?? FALLOFF, '%', "How much of the bright light fades into the dim (FG's default 25%)")}
        ${slider('lightDimFalloff', 'Dim falloff', 0, 100, 1, l.dimFalloff ?? DIM_FALLOFF, '%', "How much of the dim light fades out to darkness (FG's default 50%)")}
        <label>Animation <select id="lightAnim"><option value="">None</option><option value="flicker" ${l.animation === 'flicker' ? 'selected' : ''}>Flicker (flame)</option><option value="pulse" ${l.animation === 'pulse' ? 'selected' : ''}>Pulse</option></select></label>
        ${l.animation ? slider('lightSpeed', 'Speed', 1, 100, 1, l.speed ?? 100, '%', "FG's animation speed (its torch is 25%)") : ''}
        <label class="fx-check" title="FG's inverse light: takes light away, like the Darkness spell"><input id="lightInverse" type="checkbox" ${l.inverse ? 'checked' : ''}> Darkness (inverse: takes light away)</label>
        <label class="fx-check"><input id="lightOn" type="checkbox" ${l.on !== false ? 'checked' : ''}> On (an unlit light still exports, switched off)</label>
        <button class="los-action" id="lightDelete">Delete this light</button>
      </div>` : ''}
      <div class="region-list">${p.lights.map((x, i) => `<button class="region-row ${x.id === S().selected ? 'on' : ''}" data-light-id="${esc(x.id)}"><i style="background:${x.color};opacity:${x.on === false ? 0.3 : 1}"></i>${esc(LIGHTS[x.preset]?.[0] || 'Light')} ${i + 1} · ${x.bright}/${x.dim} ft${x.animation ? ' · ' + x.animation : ''}${x.inverse ? ' · darkness' : ''}</button>`).join('') || '<p class="los-help">No lights yet. Pick a kind, then click the map.</p>'}</div>`;

    box.querySelectorAll('[data-ambient]').forEach(b => b.onclick = () => change(p => {
      const id = b.dataset.ambient;
      if (!id) delete p.ambient;
      else { const d = AMBIENT[id]; p.ambient = normalizeAmbient({...d, ...(id === 'custom' && p.ambient?.color ? p.ambient : {}), preset: id, shadows: p.ambient?.shadows ?? true}); }
      p.darkness = darkness(p);
    }));
    box.querySelectorAll('.fx-slider input').forEach(i => i.oninput = () => { i.nextElementSibling.textContent = i.value + i.dataset.unit; });
    const amb = (id, field, f = v => v) => { const el = $('#' + id); if (!el) return;
      el.onchange = ev => change(p => { p.ambient = normalizeAmbient({...p.ambient, [field]: f(el.type === 'checkbox' ? el.checked : ev.target.value)}); p.darkness = darkness(p); }); };
    amb('ambColor', 'color'); amb('ambAlpha', 'alpha', v => v / 100); amb('ambShadows', 'shadows');
    amb('ambAngle', 'angle', Number); amb('ambLength', 'length', Number); amb('ambShadowColor', 'shadowColor'); amb('ambShadowAlpha', 'shadowAlpha', v => v / 100);
    box.querySelectorAll('[data-light-tool]').forEach(b => b.onclick = () => { tool = b.dataset.lightTool; render(); hint(); });
    $('#lightPreset').onchange = e => { preset = e.target.value; tool = 'place'; render(); hint(); };
    box.querySelectorAll('[data-light-id]').forEach(b => b.onclick = () => { S().selected = b.dataset.lightId; tool = 'select'; render(); hint(); S().draw(); });
    if (l) {
      const set = (fields) => change(p => { const x = p.lights.find(v => v.id === l.id); Object.assign(x, fields); if (x.dim < x.bright) x.dim = x.bright; Object.assign(x, normalizeLight(x)); for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k]; });
      $('#lightKind').onchange = e => { set(e.target.value === 'custom' ? {preset: 'custom'} : fromPreset(e.target.value)); };
      $('#lightColor').onchange = e => set({color: e.target.value});
      $('#lightBright').onchange = e => set({bright: num(e.target.value, 0, 10000, l.bright)});
      $('#lightDim').onchange = e => set({dim: num(e.target.value, 0.01, 10000, l.dim)});
      $('#lightAnim').onchange = e => set({animation: e.target.value || undefined, speed: l.speed || 100});
      if ($('#lightSpeed')) $('#lightSpeed').onchange = e => set({speed: Number(e.target.value)});
      $('#lightStrength').onchange = e => set({strength: Number(e.target.value)});
      $('#lightFalloff').onchange = e => set({falloff: Number(e.target.value)});
      $('#lightDimFalloff').onchange = e => set({dimFalloff: Number(e.target.value)});
      $('#lightInverse').onchange = e => set({inverse: e.target.checked || undefined});
      $('#lightOn').onchange = e => set({on: e.target.checked ? undefined : false});
      $('#lightDelete').onclick = () => remove(l.id);
    }
  }
  function remove(id) { change(p => { p.lights = p.lights.filter(x => x.id !== id); if (S().selected === id) S().selected = null; }); }
  function hint() { if (active()) $('#canvasHint').textContent = tool === 'place' ? `Click to place a ${LIGHTS[preset][0].toLowerCase()}; drag a light to move it` : 'Click a light to change it; drag it to move it'; }

  // A preset's settings, FG's defaults for the rest (switching kind resets them all).
  function fromPreset(kind) {
    const v = LIGHTS[kind];
    return {preset: kind, bright: v[1], dim: v[2], color: v[3], animation: v[4] || undefined, speed: v[5], strength: 100,
      falloff: FALLOFF, dimFalloff: DIM_FALLOFF, inverse: v[6]?.inverse || undefined};
  }
  function add(x, y, kind = preset) {
    const l = normalizeLight({id: uid(), x, y, ...fromPreset(LIGHTS[kind] ? kind : 'custom')});
    change(p => { p.lights.push(l); S().selected = l.id; });
    return l;
  }
  function lightAt(q) {
    const r = 14 / S().zoom;
    return [...S().project.lights].reverse().find(l => Math.hypot(l.x - q.x, l.y - q.y) <= r);
  }
  function pointerDown(e) {
    if (!active() || e.button !== 0 || S().tool === 'pan') return false;
    const q = S().point(e), hit = lightAt(q);
    if (hit) {
      S().selected = hit.id; S().snapshot();
      drag = {id: hit.id, dx: q.x - hit.x, dy: q.y - hit.y, moved: false};
      $('#mapCanvas').setPointerCapture?.(e.pointerId); render(); S().draw(); return true;
    }
    if (tool === 'place') add(S().snap(q.x, 'x'), S().snap(q.y, 'y'));
    else { S().selected = null; render(); S().draw(); }
    return true;
  }
  function pointerMove(e) {
    if (!drag) return false;
    const q = S().point(e), l = S().project.lights.find(v => v.id === drag.id);
    if (l) { l.x = q.x - drag.dx; l.y = q.y - drag.dy; drag.moved = true; S().draw(); }
    return true;
  }
  function pointerUp() {
    if (!drag) return false;
    const l = S().project.lights.find(v => v.id === drag.id);
    if (l && drag.moved) { l.x = S().snap(l.x, 'x'); l.y = S().snap(l.y, 'y'); S().save(); S().draw(); }
    drag = null; render(); return true;
  }
  function keyDown(e) {
    if (!active() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return false;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLight()) { remove(S().selected); return true; }
    return false;
  }
  // The outdoor light in the editor (Lighting mode, with Preview Lighting on): its colour and how dark it is.
  function drawAmbient(ctx) {
    const p = S().project;
    if (!active() || !$('#previewLighting')?.checked || !p.ambient) return;
    ctx.save();
    const t = tint(p);
    if (t) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = t.alpha; ctx.fillStyle = t.color; ctx.fillRect(0, 0, p.width, p.height); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = darkness(p) * 0.7; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, p.width, p.height);
    ctx.restore();
  }
  // --- drawing a light the way FG does -------------------------------------------
  // FG's light over its dim radius: full strength until its bright falloff starts, fading to half
  // (dim light) by the bright edge, half until the dim falloff starts, out to nothing at the dim edge.
  // Returns gradient stops [position 0..1 of the dim radius, level 0..1].
  function profile(l, bright, dim) {
    if (dim <= 0) return [];
    const b = Math.min(1, Math.max(0, bright / dim)), fb = (l.falloff ?? FALLOFF) / 100, fd = (l.dimFalloff ?? DIM_FALLOFF) / 100;
    if (b >= 1) return [[0, 1], [1 - fb, 1], [1, 0]];
    const s = [[0, 1]];
    if (b > 0) s.push([b * (1 - fb), 1], [b, 0.5]); else s.push([0, 0.5]);
    s.push([b + (1 - b) * (1 - fd), 0.5], [1, 0]);
    return s;
  }
  // A light's animation at time t (seconds): k scales its strength, r its reach.
  // Flicker is a flame's quick unsteady wavering, pulse a slow swell; FG's speed (1..100%) sets the pace.
  function level(l, t = performance.now() / 1000) {
    if (!l.animation || l.on === false) return {k: 1, r: 1};
    const sp = (l.speed ?? 100) / 100, seed = [...String(l.id || `${l.x},${l.y}`)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) / 997;
    if (l.animation === 'pulse') { const v = Math.sin((t * (0.12 + 0.9 * sp) + seed) * Math.PI * 2); return {k: 0.72 + 0.28 * v, r: 0.985 + 0.015 * v}; }
    const u = t * (1.5 + 8 * sp) + seed * 50;
    const n = 0.5 * Math.sin(u * 2.1) + 0.3 * Math.sin(u * 3.7 + 1.3) + 0.2 * Math.sin(u * 7.9 + 4.1);
    return {k: 0.88 + 0.12 * n, r: 0.98 + 0.02 * n};
  }
  const rgba = (hexColor, a) => { const n = parseInt(hexColor.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`; };
  // The editor's preview of one light (radii in map px from feet: grid px per 5 ft).
  function paint(ctx, l, grid, t) {
    const a = level(l, t), dim = (l.dim * grid / 5) * a.r, bright = (l.bright * grid / 5) * a.r;
    if (dim <= 0) return;
    const k = (l.strength ?? 100) / 100 * a.k, g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, dim);
    for (const [pos, v] of profile(l, bright, dim)) g.addColorStop(Math.min(1, Math.max(0, pos)), l.inverse ? rgba('#000000', 0.85 * v * k) : rgba(l.color, 0.67 * v * k));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, dim, 0, 7); ctx.fill();
  }
  // Animated lights redraw the map on their own (unless the weather is already animating it).
  let timer = 0, cost = 0;
  function animated() {
    const s = S(), p = s?.project;
    if (!p || document.hidden || window.KrakenWeather?.animating) return false;
    const shown = s.mode === 'play' || ($('#previewLighting')?.checked && !window.KrakenLayers?.groupHidden?.('lights'));
    return !!shown && p.lights.some(l => l.animation && l.on !== false);
  }
  function tick() { timer = 0; if (!animated()) return; const t0 = performance.now(); S().draw(); cost = performance.now() - t0; }
  function schedule() { if (!timer && animated()) timer = setTimeout(() => requestAnimationFrame(tick), Math.max(50, cost * 3)); }
  // The selected light gets a ring, so it is clear which one the panel is changing.
  function draw(ctx, zoom) {
    schedule();
    const l = active() && selectedLight();
    if (!l) return;
    ctx.save(); ctx.strokeStyle = '#ffd25e'; ctx.lineWidth = 2 / zoom; ctx.setLineDash([5 / zoom, 3 / zoom]);
    ctx.beginPath(); ctx.arc(l.x, l.y, 11 / zoom, 0, 7); ctx.stroke(); ctx.restore();
  }
  function modeChanged(mode) { drag = null; if (mode === 'lighting') { render(); hint(); } }
  return {AMBIENT, LIGHTS, FALLOFF, DIM_FALLOFF, normalizeAmbient, normalizeLight, darkness, tint, profile, level, paint, add, render, pointerDown, pointerMove, pointerUp, keyDown, draw, drawAmbient, modeChanged,
    get tool() { return tool; }, set tool(v) { tool = v; }, get preset() { return preset; }, set preset(v) { preset = v; }};
})();
