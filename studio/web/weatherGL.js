/* Weather drawn on the GPU (WebGL), over the map, never by repainting it.
 * Every effect is a pure function of where it is on the map (in map pixels)
 * and the time: clouds and fog are noise worked out across the whole map, so
 * nothing repeats; rain and snow are scattered by a hash of the map's cells.
 * The live view is its own canvas over the map, redrawn as the effects move;
 * a still (a capture, a thumbnail) is the same drawing, tile by tile, drawn
 * into a 2D canvas. Masks (where an effect shows) are a small picture of the
 * effect's areas, made again only when they change.
 * The fragment shader is GLSL ES 1.00, so Kraken's table (three.js) can use it too. */
window.KrakenWeatherGL = (() => {
  'use strict';
  const TYPE = {clouds: 0, myst: 1, water: 2, ocean: 3, rain: 4, snow: 5, blizzard: 6};

  const VERTEX = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FRAGMENT = `
precision highp float;
uniform vec2 uRes;        // the canvas, in its pixels
uniform vec3 uView;       // the map's top-left on the canvas (pixels) and its scale (canvas pixels per map pixel)
uniform vec2 uMap;        // the map's size, map pixels
uniform float uGrid;      // a square, map pixels
uniform float uTime;
uniform int uType;
uniform vec2 uDir;        // the way it drifts
uniform vec4 uA;          // the effect's settings (see setting() in weatherGL.js)
uniform vec4 uB;
uniform float uAlpha;     // the preview's opacity (and dimming)
uniform sampler2D uMask;  // where it shows (red), over the whole map
uniform float uMasked;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p) { float n = hash(p); return vec2(n, hash(p + n + 17.17)); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 TURN = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = TURN * p * 2.02 + 3.1; a *= 0.5; }
  return v;
}
// Clouds: noise warped by noise (so the shapes billow, never a grid), slowly changing as they drift.
float cloud(vec2 w, float t) {
  vec2 p = w / (uGrid * 9.0) - uDir * t;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.04)), fbm(p + vec2(5.2, 1.3) - t * 0.03));
  return fbm(p + 1.6 * q);
}
// One layer of scattered points (flakes, drops): the nearest in its cell, its distance and its own random number.
vec3 scatter(vec2 w, float cell, float seed) {
  vec2 q = w / cell, id = floor(q), f = fract(q);
  vec2 at = 0.15 + 0.7 * hash2(id + seed);
  return vec3((f - at) * cell, hash(id + seed * 1.7));
}
vec4 over(vec4 top, vec4 under) { float a = top.a + under.a * (1.0 - top.a); return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / max(a, 1e-4), a); }

vec4 effect(vec2 w) {
  float t = uTime;
  if (uType == 0) {
    // uA: speed, clouds (density), shadows, offset
    float drift = t * (0.06 + uA.x * 0.5);
    float thr = 0.66 - uA.y * 0.26;
    float n = cloud(w, drift);
    float top = smoothstep(thr, thr + 0.2, n);
    vec2 off = vec2(1.0, 1.0) * uA.w * uGrid * 3.0;
    float shade = smoothstep(thr, thr + 0.24, cloud(w - off, drift)) * uA.z * 0.75;
    vec3 white = mix(vec3(0.78, 0.82, 0.86), vec3(1.0), smoothstep(thr, thr + 0.45, n));
    return over(vec4(white, top * 0.82), vec4(0.04, 0.06, 0.1, shade));
  }
  if (uType == 1) {
    // uA: amount, speed
    vec2 p = w / (uGrid * 7.0) - uDir * t * (0.02 + uA.y * 0.12);
    float n = fbm(p + 0.8 * fbm(p * 0.6 + t * 0.015));
    return vec4(0.84, 0.87, 0.89, (0.15 + 0.65 * smoothstep(0.25, 0.85, n)) * (0.25 + 0.75 * uA.x));
  }
  if (uType == 2) {
    // uA: horizontal (how far it flows), intensity, speed, droplet
    vec2 flow = uDir * t * (0.05 + uA.z * 0.6) * (0.3 + uA.x * 2.0);
    vec2 p = w / (uGrid * 2.2);
    float waves = fbm(p - flow + fbm(p * 0.5 + t * 0.05));
    // Light playing on it: where two drifting noise fields cross, thin bright lines (no regular pattern).
    vec2 r = w / (uGrid * 1.4) - flow * 1.5;
    float c = clamp(1.0 - abs(fbm(r + t * (0.08 + uA.z * 0.3)) - fbm(r * 1.3 + 4.0 - t * (0.06 + uA.z * 0.25))) * 6.0, 0.0, 1.0);
    c = pow(c, 5.0);
    vec3 col = mix(vec3(0.06, 0.25, 0.34), vec3(0.25, 0.58, 0.66), smoothstep(0.2, 0.85, waves)) + vec3(0.6, 0.8, 0.9) * c * (0.8 + uA.w * 1.5);
    return vec4(col, 0.45 + 0.4 * uA.y);
  }
  if (uType == 3) {
    // uA: ripples, wave width, wave height, speed
    vec2 along = uDir, across = vec2(-uDir.y, uDir.x);
    float s = dot(w, along) / (uGrid * (1.5 + uA.y * 4.0)), d = dot(w, across) / (uGrid * (1.5 + uA.z * 4.0));
    float warp = fbm(w / (uGrid * 5.0) + t * 0.05) * (1.0 + uA.x * 4.0);
    float swell = 0.5 + 0.5 * sin((s - t * (0.2 + uA.w * 1.5)) * 6.2832 + warp + sin(d * 2.0) * 0.8);
    float foam = smoothstep(0.86, 0.98, swell) * smoothstep(0.35, 0.7, fbm(w / (uGrid * 1.2) + t * 0.1));
    vec3 col = mix(vec3(0.05, 0.2, 0.32), vec3(0.14, 0.42, 0.55), swell) + foam * 0.7;
    return vec4(col, 0.55);
  }
  if (uType == 4) {
    // Rain seen from above: drops land and their rings spread. uA: amount, intensity, speed, wind; uB.x: drop size
    float k = uB.x;
    // The ground wet under it, a little darker and bluer.
    // How many drops fall: none at 0, every cell by about half way; Opacity (uA.x) alone sets how strongly they show.
    float many = 1.0 - pow(1.0 - clamp(uA.y, 0.0, 1.0), 4.0);
    vec4 col = vec4(0.12, 0.16, 0.24, 0.16 * many);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 s = scatter(w, uGrid * (0.6 + fi * 0.25) * k, fi * 31.0);
      float phase = fract(t * (0.5 + uA.z * 1.6) + s.z * 7.0);
      float live = step(s.z, many);
      float edge = uGrid * 0.025 * k, r = phase * uGrid * 0.3 * k;
      float ring = 1.0 - smoothstep(edge * 0.4, edge, abs(length(s.xy * vec2(1.0, 1.2)) - r));
      float dot0 = (1.0 - smoothstep(0.0, uGrid * 0.03 * k, length(s.xy))) * step(phase, 0.1);
      col = over(vec4(0.85, 0.92, 1.0, max(ring * (1.0 - phase), dot0) * live * 0.95), col);
    }
    col.a *= uA.x;
    return col;
  }
  // Snow (5) and blizzard (6): flakes in layers, nearer ones bigger and faster. uA: amount, intensity, speed, size
  bool storm = uType == 6;
  vec4 col = storm ? vec4(0.95, 0.97, 1.0, 0.18 * uA.x) : vec4(0.0);
  float many = storm ? 0.9 : 1.0 - pow(1.0 - clamp(uA.y, 0.0, 1.0), 4.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float pace = (storm ? 2.4 : 0.35) * (0.4 + uA.z * 1.6) * (0.6 + fi * 0.35);
    vec2 sway = vec2(sin(t * 0.7 + fi * 2.1), cos(t * 0.5 + fi)) * uGrid * (storm ? 0.05 : 0.12);
    vec2 p = w - uDir * t * pace * uGrid - sway;
    vec3 s = scatter(p, uGrid * (0.45 + fi * 0.18), fi * 13.0);
    float live = step(s.z, many);
    float size = uGrid * (0.018 + fi * 0.008) * (0.5 + uA.w);
    vec2 d = s.xy;
    if (storm) { vec2 a = uDir, b = vec2(-uDir.y, uDir.x); d = vec2(dot(d, a) / 3.5, dot(d, b)); }
    float flake = 1.0 - smoothstep(size * 0.35, size, length(d));
    col = over(vec4(1.0, 1.0, 1.0, flake * live * 0.9), col);
  }
  col.a *= uA.x;
  return col;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 w = (px - uView.xy) / uView.z;
  if (w.x < 0.0 || w.y < 0.0 || w.x > uMap.x || w.y > uMap.y) { gl_FragColor = vec4(0.0); return; }
  float shown = uMasked > 0.5 ? texture2D(uMask, w / uMap).r : 1.0;
  if (shown <= 0.003) { gl_FragColor = vec4(0.0); return; }
  vec4 c = effect(w);
  gl_FragColor = vec4(c.rgb, clamp(c.a, 0.0, 1.0) * shown * uAlpha);
}`;

  // The settings each type passes (the saved fields, their defaults).
  const DEFAULTS = {
    clouds: [['CloudSpeed', 0.75], ['CloudDensity', 0.75], ['CloudShadowDensity', 0.5], ['CloudOffset', 0.25]],
    myst: [['MystFade', 0.75], ['MystSpeed', 1]],
    water: [['WaterHorizontal', 0.15], ['WaterIntensity', 0.15], ['WaterSpeed', 0.2], ['WaterDroplet', 0.25]],
    ocean: [['OceanDistortion', 0.5], ['OceanSizeX', 0.5], ['OceanSizeY', 0.5], ['OceanSpeed', 0.4]],
    rain: [['RainFade', 1], ['RainIntensity', 0.25], ['RainSpeed', 0.6], ['RainDirection', 0.5]],
    snow: [['SnowFade', 1], ['SnowIntensity', 0.204], ['SnowSpeed', 0.55], ['SnowSize', 1]],
    // Blizzard has no Intensity (FG): always thick.
    blizzard: [['BlizzardFade', 1], ['', 1], ['BlizzardSpeed', 0.6], ['BlizzardSize', 0.5]],
  };
  function settingsOf(e) {
    const v = (DEFAULTS[e.type] || []).map(([key, def]) => Number(e.settings?.[key] ?? def));
    while (v.length < 4) v.push(0);
    return v;
  }

  // A renderer on a canvas: its program, its quad, the masks it has uploaded.
  function renderer(canvas, options) {
    const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
    if (!gl) return null;
    const shader = (kind, src) => {
      const s = gl.createShader(kind); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw Error('Weather shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw Error('Weather shader: ' + gl.getProgramInfoLog(prog));
    const u = {};
    for (const name of ['uRes', 'uView', 'uMap', 'uGrid', 'uTime', 'uType', 'uDir', 'uA', 'uB', 'uAlpha', 'uMask', 'uMasked']) u[name] = gl.getUniformLocation(prog, name);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const masks = new Map(); // effect id -> {key, texture}
    function maskFor(e, map) {
      if (!e.polygons) return null;
      const key = `${e._maskKey}|${e.settings?.maskblur ?? 0}`;
      const had = masks.get(e.id);
      if (had?.key === key) return had.texture;
      // The areas drawn small (at most 2048 across); linear sampling softens their edges.
      const k = Math.min(1, 2048 / Math.max(map.width, map.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(map.width * k)); c.height = Math.max(1, Math.round(map.height * k));
      const g = c.getContext('2d'), blur = Number(e.settings?.maskblur) || 0;
      if (blur) g.filter = `blur(${Math.max(0.5, blur * map.grid / 100 * k)}px)`;
      g.setTransform(k, 0, 0, k, 0, 0); g.fillStyle = '#f00'; g.beginPath();
      for (const q of e.polygons) { for (let i = 0; i < q.length; i += 2) g[i ? 'lineTo' : 'moveTo'](q[i], q[i + 1]); g.closePath(); }
      g.fill('evenodd');
      const texture = had?.texture || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      masks.set(e.id, {key, texture});
      return texture;
    }
    // Draw the effects. view: {x, y, z} the map's top-left on this canvas and its scale.
    function draw(effects, map, view, time, alphaOf) {
      if (gl.isContextLost()) return false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform3f(u.uView, view.x, view.y, view.z);
      gl.uniform2f(u.uMap, map.width, map.height);
      gl.uniform1f(u.uGrid, Math.max(10, map.grid || 100));
      gl.uniform1f(u.uTime, time);
      gl.uniform1i(u.uMask, 0);
      for (const e of effects) {
        if (e.visible === false || TYPE[e.type] === undefined) continue;
        if (e.polygons && !e.polygons.length) continue;
        const a = (Number(e.drift) || 0) * Math.PI / 180, s = settingsOf(e);
        gl.uniform1i(u.uType, TYPE[e.type]);
        gl.uniform2f(u.uDir, Math.cos(a), Math.sin(a));
        gl.uniform4f(u.uA, s[0], s[1], s[2], s[3]);
        gl.uniform4f(u.uB, Number(e.dropSize) || 1, 0, 0, 0);
        gl.uniform1f(u.uAlpha, alphaOf(e));
        const mask = maskFor(e, map);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mask);
        gl.uniform1f(u.uMasked, mask ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      return true;
    }
    return {gl, draw, forget: id => { const m = masks.get(id); if (m) { gl.deleteTexture(m.texture); masks.delete(id); } }};
  }

  // ---- the live view over the map ------------------------------------------------
  let live = null, liveCanvas = null, frames = 0;
  function overlay() {
    if (liveCanvas?.isConnected && live) return live;
    const host = document.querySelector('#viewport');
    if (!host) return null;
    liveCanvas = document.createElement('canvas');
    liveCanvas.id = 'weatherCanvas';
    liveCanvas.setAttribute('aria-hidden', 'true');
    liveCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
    host.querySelector('#mapCanvas')?.after(liveCanvas);
    try { live = renderer(liveCanvas, {alpha: true, premultipliedAlpha: false, antialias: false}); } catch (error) { console.warn(error); live = null; }
    liveCanvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); live = null; });
    liveCanvas.addEventListener('webglcontextrestored', () => { live = null; liveCanvas.remove(); });
    return live;
  }
  // The live view: as big as the view on screen, at most about 2.2 million pixels (it is soft weather).
  function drawLive(effects, map, view, time, alphaOf) {
    const r = overlay();
    if (!r) return false;
    const box = liveCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1, k = Math.min(dpr, Math.sqrt(2.2e6 / Math.max(1, box.width * box.height)));
    const w = Math.max(1, Math.round(box.width * k)), h = Math.max(1, Math.round(box.height * k));
    if (liveCanvas.width !== w || liveCanvas.height !== h) { liveCanvas.width = w; liveCanvas.height = h; }
    frames += 1;
    return r.draw(effects, map, {x: view.pan.x * k, y: view.pan.y * k, z: view.z * k}, time, alphaOf);
  }
  function clearLive() {
    if (live && liveCanvas) { live.gl.clearColor(0, 0, 0, 0); live.gl.clear(live.gl.COLOR_BUFFER_BIT); }
  }

  // ---- stills: the same drawing into a 2D canvas -----------------------------------------
  let still = null, stillCanvas = null;
  // ctx: a 2D context drawing the map at scale (1: the map's own pixels), its origin at the map's corner.
  function drawStill(ctx, effects, map, time, alphaOf, scale = 1) {
    if (!effects.some(e => e.visible !== false)) return true;
    if (!still || still.gl.isContextLost()) {
      stillCanvas = document.createElement('canvas');
      try { still = renderer(stillCanvas, {alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true}); } catch (error) { console.warn(error); still = null; }
    }
    if (!still) return false;
    const W = Math.ceil(map.width * scale), H = Math.ceil(map.height * scale), T = 4096;
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
      const w = Math.min(T, W - x), h = Math.min(T, H - y);
      stillCanvas.width = w; stillCanvas.height = h;
      if (!still.draw(effects, map, {x: -x, y: -y, z: scale}, time, alphaOf)) return false;
      ctx.drawImage(stillCanvas, x / scale, y / scale, w / scale, h / scale);
    }
    return true;
  }

  return {drawLive, clearLive, drawStill, forget: id => { live?.forget(id); still?.forget(id); }, get canvas() { return liveCanvas; }, get frames() { return frames; }, TYPE};
})();
