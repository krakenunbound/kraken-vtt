/* Map Studio for agents: Kraken's kraken_map_studio tool drives the editor through here.
 *
 * Every action goes through the editor's own code (the generator, the floor fill the generator
 * uses, the Texture and Scatter brushes, the Wall tool's baked wall art, the Walls & doors tool,
 * Lights, Weather effects, Traps & regions, the play test, Save project), so what an agent makes
 * is what a GM makes with the mouse, in the map open in the editor's active tab.
 *
 * Units are squares: x to the right, y down, (0, 0) the map's top-left corner, so the centre of
 * the square in column 3, row 4 is (3.5, 4.5). Light radii are feet, as in the Lights panel.
 * KrakenStudioAgent.run(action, args) resolves to {ok: true, value} or {ok: false, error}. */
window.KrakenStudioAgent = (() => {
  'use strict';
  const S = () => window.KrakenStudio, K = window.KrakenEditorCore;
  const SHIPPED = new Set(['Kraken Map Art', 'Battle Map Forge']);
  const uid = k => k + '-' + crypto.randomUUID().slice(0, 13);
  const r2 = v => Math.round(v * 100) / 100;
  const g = () => S().project.grid;
  const px = v => Number(v) * g();
  const sq = v => r2(v / g());
  const LIGHT_PROPS = /torch|brazier|lantern|candle|candelabra|campfire|fireplace|hearth|lava|lamp|fire|reactor|console|sparking/i;
  let queue = Promise.resolve();

  // --- arguments -------------------------------------------------------------------
  const num = (v, what) => { const n = Number(v); if (!Number.isFinite(n)) throw Error(what + ' must be a number.'); return n; };
  function pt(v, what = 'A point') {
    if (Array.isArray(v) && v.length === 2) return {x: px(num(v[0], what)), y: px(num(v[1], what))};
    if (v && typeof v === 'object' && 'x' in v) return {x: px(num(v.x, what)), y: px(num(v.y, what))};
    throw Error(what + ' is [x, y] in squares.');
  }
  const pts = (list, what = 'points') => { if (!Array.isArray(list)) throw Error(what + ' is a list of [x, y] in squares.'); return list.map(v => pt(v, what)); };
  function rectPts(r) {
    const x = px(num(r.x, 'rect.x')), y = px(num(r.y, 'rect.y')), w = px(num(r.width, 'rect.width')), h = px(num(r.height, 'rect.height'));
    return [{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}];
  }
  const kindOf = a => window.KrakenLibrarySort.kindOf(a), sourceOf = a => window.KrakenLibrarySort.sourceOf(a);
  // Art by id, or by name (any case; the shipped packs' first), optionally "Pack/Name".
  function art(ref) {
    const list = S().assets, want = String(ref ?? '').trim();
    if (!want) throw Error('Name the art (its id or name from library).');
    const byId = list.find(a => a.id === want);
    if (byId) return byId;
    const [pack, name] = want.includes('/') && !list.some(a => a.name.toLowerCase() === want.toLowerCase()) ? [want.slice(0, want.indexOf('/')), want.slice(want.indexOf('/') + 1)] : ['', want];
    const named = list.filter(a => a.name.toLowerCase() === name.toLowerCase() && (!pack || (a.sourcePack || '').toLowerCase() === pack.toLowerCase()));
    if (named.length) return named.find(a => SHIPPED.has(a.sourcePack)) || named[0];
    const near = list.filter(a => a.name.toLowerCase().includes(name.toLowerCase())).slice(0, 8).map(a => a.name);
    throw Error(`There is no art "${want}" in the library.${near.length ? ' Close: ' + near.join(', ') + '.' : ' Use action library to search.'}`);
  }
  // The art's size on this map, in pixels, the way clicking it onto the map sizes it.
  function natural(a) {
    const q = S().image(a.id), size = Number(a.gridSize) || 100;
    return {w: (a.width || q.naturalWidth || 100) * g() / size, h: (a.height || q.naturalHeight || 100) * g() / size};
  }
  async function loadArt(a) { const q = S().image(a.id); try { await q.decode(); } catch { throw Error('Could not load the art ' + a.name + '.'); } return q; }
  function ensureLayer(id) {
    if (!id) return undefined;
    const p = S().project;
    window.KrakenLayers.ensure(p);
    const found = p.layers.find(l => l.id === id || l.name.toLowerCase() === String(id).toLowerCase());
    if (found) return found.id;
    const layer = {id: String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || uid('layer'), name: String(id).slice(0, 60).replace(/^./, c => c.toUpperCase()), visible: true, locked: false};
    p.layers.push(layer);
    return layer.id;
  }
  const done = () => { S().save(); S().draw(); };
  const brief = o => ({id: o.id, name: o.name, ...(o.layer ? {layer: o.layer} : {})});

  // --- reading back ----------------------------------------------------------------
  function objectView(o) {
    const c = {x: o.x + o.width / 2, y: o.y + o.height / 2};
    return {id: o.id, name: o.name, layer: o.layer, at: [sq(c.x), sq(c.y)], size: [sq(o.width), sq(o.height)], ...(o.rotation ? {rotation: r2(o.rotation)} : {}),
      ...(o.wallPath ? {wall: true} : {}), ...(o.floor ? {floor: true} : {}), ...(o.visible === false ? {hidden: true} : {})};
  }
  function wallView(w) {
    const out = []; for (let i = 0; i < w.points.length; i += 2) out.push([sq(w.points[i]), sq(w.points[i + 1])]);
    return {id: w.id, type: w.type, points: out, ...(w.flags.length ? {flags: w.flags} : {}), ...(w.groupId ? {art: true} : {})};
  }
  function summary(detail) {
    const p = S().project;
    const view = {name: p.name, squares: [sq(p.width), sq(p.height)], grid: p.grid, pixels: [p.width, p.height], background: p.background,
      ambient: p.ambient?.preset ?? null, tab: window.KrakenShell?.active,
      counts: {objects: p.objects.length, walls: p.walls.filter(w => !['door', 'secret', 'window'].includes(w.type)).length,
        doors: p.walls.filter(w => w.type === 'door' || w.type === 'secret').length, windows: p.walls.filter(w => w.type === 'window').length,
        lights: p.lights.length, effects: p.effects.length, regions: (p.regions || []).length},
      layers: (p.layers || []).map(l => ({id: l.id, name: l.name, objects: p.objects.filter(o => o.layer === l.id).length, ...(l.visible === false ? {hidden: true} : {}), ...(l.locked ? {locked: true} : {})}))};
    if (detail !== false) {
      view.objects = p.objects.map(objectView);
      view.walls = p.walls.map(wallView);
      view.lights = p.lights.map(l => ({id: l.id, at: [sq(l.x), sq(l.y)], preset: l.preset, color: l.color, bright: l.bright, dim: l.dim, ...(l.animation ? {animation: l.animation} : {}), ...(l.on === false ? {on: false} : {})}));
      view.effects = p.effects.map(e => ({id: e.id, type: e.type, name: e.name, settings: e.settings, masked: !!e.mask}));
      view.regions = (p.regions || []).map(r => ({id: r.id, kind: r.kind, name: r.name, points: r.points.reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(sq(v)) : a.push([sq(v)]), a), [])}));
    }
    return view;
  }

  // The skill's quality rules, checked on the map as it is.
  function check() {
    const p = S().project, notes = [], G = p.grid, near = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
    const ends = []; const segs = [];
    for (const w of p.walls) {
      if (['door', 'secret', 'window'].includes(w.type)) continue;
      const list = []; for (let i = 0; i < w.points.length; i += 2) list.push({x: w.points[i], y: w.points[i + 1]});
      if (w.flags.includes('closed')) list.push(list[0]);
      list.forEach(v => ends.push(v));
      for (let i = 1; i < list.length; i++) segs.push([list[i - 1], list[i]]);
    }
    const onWallLine = q => segs.some(([a, b]) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l)); return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy) < 2; });
    for (const d of p.walls.filter(w => ['door', 'secret', 'window'].includes(w.type))) {
      const a = {x: d.points[0], y: d.points[1]}, b = {x: d.points.at(-2), y: d.points.at(-1)};
      if (![a, b].every(q => ends.some(v => near(v, q, 2)) || onWallLine(q))) notes.push(`${d.type} ${d.id} at (${sq(a.x)}, ${sq(a.y)}) does not meet a wall at both ends: it should close a gap in a wall line.`);
    }
    const props = p.objects.filter(o => !o.floor && !o.wallPath && o.layer !== 'map');
    for (const l of p.lights) {
      if (l.inverse) continue;
      const source = p.objects.find(o => LIGHT_PROPS.test(o.name || '') && near({x: o.x + o.width / 2, y: o.y + o.height / 2}, l, Math.max(G * 0.75, Math.max(o.width, o.height) / 2)));
      if (!source) notes.push(`light ${l.id} at (${sq(l.x)}, ${sq(l.y)}) has no light-source art (torch, brazier, candle, campfire...) under it.`);
    }
    for (const f of p.objects.filter(o => o.floor && o.room)) {
      const inside = props.filter(o => { const c = {x: o.x + o.width / 2, y: o.y + o.height / 2}; return c.x > f.x && c.x < f.x + f.width && c.y > f.y && c.y < f.y + f.height; });
      if (!inside.length) notes.push(`room "${f.name}" has nothing in it: give every room props that tell its story.`);
    }
    for (const o of p.objects) if (o.x + o.width < 0 || o.y + o.height < 0 || o.x > p.width || o.y > p.height) notes.push(`${o.name} (${o.id}) is off the map.`);
    for (const o of p.objects.filter(o => o.wallPath)) if (!WALLART_PATH(o) && !p.walls.some(w => w.groupId === o.groupId)) notes.push(`wall art ${o.id} has no line-of-sight wall: players will see through it.`);
    const offGrid = p.walls.filter(w => w.points.some((v, i) => { const off = Number(p.gridOffset?.[i % 2 ? 'y' : 'x']) || 0, h = G / 2; return Math.abs(((v - off) / h) - Math.round((v - off) / h)) > 0.02; }));
    if (offGrid.length) notes.push(`${offGrid.length} walls have points off the half-square lines (fine for caves; for built rooms keep walls on the grid so the art lines up).`);
    if (!p.lights.length) notes.push('no lights: a dungeon with no light sources plays pitch dark.');
    // Where the art came from: maps that ship with Kraken use the shipped packs alone.
    const sources = new Set(p.objects.map(o => o.wallPath?.assetId || o.sourceArt || o.assetId));
    const outside = [...sources].map(id => S().assets.find(a => a.id === id)).filter(a => a && !SHIPPED.has(a.sourcePack) && !/^(Layout |Terrain brush|Wall - |Path - )/.test(a.name));
    const art = {shipped: [...sources].filter(id => SHIPPED.has(S().assets.find(a => a.id === id)?.sourcePack)).length, outside: outside.map(a => `${a.name} (${a.sourcePack || 'own'})`)};
    if (outside.length) notes.push(`${outside.length} pieces of art are not from the shipped packs (${art.outside.slice(0, 6).join(', ')}): fine for the GM's own maps, never in a map that ships with Kraken.`);
    if (!p.objects.some(o => !o.floor && !o.wallPath)) notes.push('no props at all: the map is bare floor.');
    return {ok: notes.length === 0, notes, art};
  }
  const WALLART_PATH = o => window.KrakenWallArt.isPath(S().assets.find(a => a.id === o.wallPath?.assetId));

  // --- the actions -----------------------------------------------------------------
  const ACTIONS = {
    library({search = '', kind = '', pack = '', shippedOnly = false, limit = 60}) {
      const q = String(search).toLowerCase(), all = S().assets;
      const pool = all.filter(a => (!pack || (a.sourcePack || sourceOf(a)).toLowerCase().includes(String(pack).toLowerCase())) && (!shippedOnly || SHIPPED.has(a.sourcePack)));
      const kinds = {}; for (const a of pool) kinds[kindOf(a)] = (kinds[kindOf(a)] || 0) + 1;
      const packs = {}; for (const a of all) packs[a.sourcePack || sourceOf(a)] = (packs[a.sourcePack || sourceOf(a)] || 0) + 1;
      const found = pool.filter(a => (!kind || kindOf(a).toLowerCase() === String(kind).toLowerCase()) && (a.name + ' ' + (a.category || '') + ' ' + (a.tags || []).join(' ')).toLowerCase().includes(q))
        .sort(window.KrakenLibrarySort.byName);
      return {total: found.length, kinds, packs, shipped: [...SHIPPED],
        art: found.slice(0, Math.max(1, Math.min(500, Number(limit) || 60))).map(a => {
          const n = natural(a);
          return {id: a.id, name: a.name, kind: kindOf(a), pack: a.sourcePack || sourceOf(a), shipped: SHIPPED.has(a.sourcePack), squares: [sq(n.w), sq(n.h)],
            ...(window.KrakenWallArt.isWallArt(a) ? {wallArt: true} : {}), ...(window.KrakenWallArt.isPath(a) ? {path: true} : {}), ...(/Floors|Ground|Backgrounds/i.test(a.category || '') ? {tiles: true} : {})};
        })};
    },
    new({name = 'New map', width = 30, height = 20, grid = 100, background = '#1b1a18'}) {
      const G = Math.round(num(grid, 'grid')), w = Math.round(num(width, 'width') * G), h = Math.round(num(height, 'height') * G);
      window.KrakenShell?.newBlank();
      S().openDocument({...S().blank(), name: String(name).slice(0, 120), width: w, height: h, grid: G, background: String(background)});
      S().switchMode('view');
      return summary(false);
    },
    async generate(args) {
      if (!window.KrakenGenerate) throw Error('The generator did not load.');
      const made = await window.KrakenGenerate.build({...args, grid: args.grid});
      const p = S().project;
      // Its floors remember the art they were made from (check reports art outside the shipped packs).
      for (const o of p.objects) if (o.layer === 'map') { o.floor = true; o.sourceArt = /^Room /.test(o.name) ? made.roomFloor : made.corridorFloor; if (/^Room /.test(o.name)) o.room = true; }
      done();
      return {...made, settings: window.KrakenGenerate.SETTINGS.map(s => s.id), map: summary(false)};
    },
    // A floor or ground filling a box or outline, tiled from the map's corner so floors join without seams.
    async floor({art: ref, rect, polygon, polygons, feather = 0, name, layer = 'map', room = false}) {
      const a = art(ref), p = S().project;
      const outlines = polygons ? polygons.map(q => pts(q, 'polygons')) : polygon ? [pts(polygon, 'polygon')] : rect ? [rectPts(rect)] : [rectPts({x: 0, y: 0, width: sq(p.width), height: sq(p.height)})];
      if (outlines.some(o => o.length < 3)) throw Error('An outline needs at least three corners.');
      const f = px(Math.max(0, Number(feather) || 0)), xs = outlines.flat().map(v => v.x), ys = outlines.flat().map(v => v.y);
      const left = Math.max(0, Math.floor(Math.min(...xs) - f)), top = Math.max(0, Math.floor(Math.min(...ys) - f));
      const right = Math.min(p.width, Math.ceil(Math.max(...xs) + f)), bottom = Math.min(p.height, Math.ceil(Math.max(...ys) + f));
      if (right - left < 1 || bottom - top < 1) throw Error('That floor is outside the map.');
      const id = uid('floor'), made = await window.KrakenGenerate.floorObject({id, name: name || a.name, bounds: {x: left, y: top, width: right - left, height: bottom - top}, polygons: outlines}, a, await loadArt(a), p.grid, f);
      S().addAsset(made.asset);
      S().snapshot();
      Object.assign(made.object, {name: name || a.name + ' floor', layer: ensureLayer(layer), floor: true, sourceArt: a.id, ...(room ? {room: true} : {}), locked: false});
      S().project.objects.push(made.object);
      done();
      return brief(made.object);
    },
    // The Texture brush: soft-edged art along a stroke (blending, worn paths, scorch, moss).
    async paint({art: ref, path, size = 2, softness = 40, name, layer = 'objects'}) {
      const a = art(ref), list = pts(path, 'path');
      await loadArt(a);
      const o = await window.KrakenBeta02.textureStroke({assetId: a.id, path: list, size: Math.min(500, Math.max(10, px(size))), softness: Number(softness), name: name || 'Paint - ' + a.name, layer: ensureLayer(layer)});
      o.sourceArt = a.id;
      return brief(o);
    },
    // The Scatter brush: copies along a stroke, turned and sized at random from the seed.
    async scatter({art: ref, path, size = 1, seed = 1, spacing, scale = [0.7, 1.3], rotation = [-180, 180], layer = 'objects'}) {
      const a = art(ref), list = pts(path, 'path');
      await loadArt(a);
      const made = window.KrakenBeta02.paintScatter({assetId: a.id, path: list, size: px(size), seed: String(seed), spacing: spacing ? px(spacing) : undefined, scaleRange: scale, rotationRange: rotation, layer: ensureLayer(layer), strict: true});
      return {placed: made.length, ids: made.map(o => o.id)};
    },
    // Art stamped on the map, as clicking it from the library does: at its own size on the grid unless told.
    async place(args) {
      const items = Array.isArray(args.items) ? args.items : [args], made = [];
      for (const it of items) await loadArt(art(it.art));
      S().snapshot();
      for (const it of items) {
        const a = art(it.art), n = natural(a), c = pt(it.at ?? [it.x, it.y], 'at'), scale = Number(it.scale) || 1;
        let w = it.width ? px(it.width) : n.w * scale, h = it.height ? px(it.height) : (it.width ? n.h * px(it.width) / n.w : n.h * scale);
        const o = {id: uid('obj'), assetId: a.id, name: String(it.name || a.name), x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rotation: Number(it.rotation) || 0, visible: true,
          layer: ensureLayer(it.layer || 'objects'), ...(it.opacity !== undefined ? {opacity: Math.max(0, Math.min(1, Number(it.opacity)))} : {})};
        S().project.objects.push(o);
        made.push(brief(o));
        if (it.light) made.at(-1).light = addLight({at: [c.x / g(), c.y / g()], ...(typeof it.light === 'object' ? it.light : {preset: it.light})}).id;
      }
      done();
      return items.length === 1 && !Array.isArray(args.items) ? made[0] : {placed: made.length, items: made};
    },
    // A wall: with art, the Wall tool's (the art repeated along the path, joined at corners, with end caps,
    // baked into one picture, and its line-of-sight wall); without, a Walls & doors line of the given type.
    async wall({art: ref, points, closed = false, los = true, type = 'wall', flags, layer = 'walls'}) {
      const list = pts(points);
      if (list.length < 2) throw Error('A wall needs at least two points.');
      if (ref) {
        const a = art(ref);
        if (!window.KrakenWallArt.isWallArt(a)) throw Error(`${a.name} is not wall art: pick art the library marks wallArt (walls, fences, hedges, paths).`);
        const made = await window.KrakenWallArt.bakeWall(a.id, list, !!closed && list.length > 2, {los: los !== false, layer: ensureLayer(layer)});
        return {art: brief(made.object), wall: made.wall?.id ?? null};
      }
      if (!window.KrakenLOS.TYPES[type] || type === 'razor') throw Error('type is one of ' + Object.keys(window.KrakenLOS.TYPES).filter(t => t !== 'razor').join(', ') + '.');
      const w = window.KrakenLOS.addShape(list, !!closed, {type, flags: flags ?? window.KrakenLOS.TYPES[type][1], split: false});
      if (!w) throw Error('That wall is too short.');
      return {wall: w.id};
    },
    // A door (or secret door, or window) across a gap in a wall line, from one end of the gap to the
    // other; walls running through the gap are cut there (the Razor). Door art is stamped on it unless art false.
    async door({from, to, kind = 'door', open = false, locked = false, art: ref, layer = 'doors'}) {
      const a = pt(from, 'from'), b = pt(to, 'to'), len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) throw Error('A door runs from one end of its gap to the other.');
      if (!['door', 'secret', 'window'].includes(kind)) throw Error('kind is door, secret or window.');
      const p = S().project, d = {x: (b.x - a.x) / len, y: (b.y - a.y) / len}, n = {x: -d.y, y: d.x}, reach = p.grid / 4;
      // Walls lying along the gap: cut at both ends, the piece inside goes.
      const along = w => { for (let i = 2; i < w.points.length; i += 2) { const p1 = {x: w.points[i - 2], y: w.points[i - 1]}, p2 = {x: w.points[i], y: w.points[i + 1]};
        const off1 = Math.abs((p1.x - a.x) * n.x + (p1.y - a.y) * n.y), off2 = Math.abs((p2.x - a.x) * n.x + (p2.y - a.y) * n.y);
        const t1 = (p1.x - a.x) * d.x + (p1.y - a.y) * d.y, t2 = (p2.x - a.x) * d.x + (p2.y - a.y) * d.y;
        if (off1 < 1 && off2 < 1 && Math.max(t1, t2) > 1 && Math.min(t1, t2) < len - 1) return true; } return false; };
      if (p.walls.some(w => !['door', 'secret', 'window'].includes(w.type) && along(w))) {
        for (const e of [a, b]) window.KrakenLOS.razor([{x: e.x - n.x * reach, y: e.y - n.y * reach}, {x: e.x + n.x * reach, y: e.y + n.y * reach}]);
        const mid = (w) => { const q = {x: 0, y: 0}, c = w.points.length / 2; for (let i = 0; i < w.points.length; i += 2) { q.x += w.points[i] / c; q.y += w.points[i + 1] / c; } return q; };
        S().project.walls = S().project.walls.filter(w => { if (['door', 'secret', 'window'].includes(w.type) || !along(w)) return true;
          const m = mid(w), t = (m.x - a.x) * d.x + (m.y - a.y) * d.y; return !(w.points.length === 4 && t > 0 && t < len); });
      }
      const flags = [...window.KrakenLOS.TYPES[kind][1], ...(open ? ['open'] : []), ...(locked ? ['locked'] : [])];
      const w = window.KrakenLOS.addShape([a, b], false, {type: kind, flags, split: false});
      const out = {door: w.id, kind};
      const pick = ref === false || (ref === undefined && kind === 'secret') ? null : art(ref ?? (kind === 'window' ? 'Window' : 'Door, wooden'));
      if (pick) {
        await loadArt(pick);
        const nat = natural(pick), h = nat.h * len / nat.w, c = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
        S().snapshot();
        const o = {id: uid('door'), assetId: pick.id, name: pick.name, x: c.x - len / 2, y: c.y - h / 2, width: len, height: h, rotation: Math.atan2(d.y, d.x) * 180 / Math.PI, visible: true, layer: ensureLayer(layer), doorId: w.id};
        S().project.objects.push(o);
        out.art = brief(o);
      }
      done();
      return out;
    },
    light(args) {
      const items = Array.isArray(args.items) ? args.items : [args];
      const made = items.map(addLight);
      return items.length === 1 && !Array.isArray(args.items) ? made[0] : {placed: made.length, lights: made.map(l => l.id)};
    },
    // Time of day: the Lights panel's outdoor light (night, dawn, sunlight, dusk, moonlight, custom; none to clear).
    ambient({preset, ...rest}) {
      const L = window.KrakenLighting, p = S().project;
      S().snapshot();
      if (!preset || preset === 'none') delete p.ambient;
      else { if (!L.AMBIENT[preset]) throw Error('preset is one of ' + Object.keys(L.AMBIENT).join(', ') + ' or none.'); p.ambient = L.normalizeAmbient({...L.AMBIENT[preset], ...rest, preset, shadows: rest.shadows ?? true}); }
      p.darkness = L.darkness(p);
      done();
      return {ambient: p.ambient ?? null, darkness: r2(p.darkness)};
    },
    // A weather effect (rain, snow, blizzard, myst (fog), clouds, water, ocean), over the whole map or only in areas.
    weather({type, settings = {}, areas, name}) {
      const W = window.KrakenWeather;
      if (!W.TYPES[type]) throw Error('type is one of ' + Object.keys(W.TYPES).join(', ') + '.');
      const clean = K.effectSettings(type, settings);
      W.add(type);
      const p = S().project, e = p.effects.find(v => v.id === S().selected) || p.effects.at(-1);
      Object.assign(e, {settings: {...(e.settings || {}), ...clean}, ...(name ? {name: String(name).slice(0, 40)} : {})});
      let now = W.normalize(e, p.width, p.height);
      p.effects[p.effects.indexOf(e)] = now;
      if (Array.isArray(areas) && areas.length) {
        W.reset(now, 'none');
        for (const area of areas) {
          now = p.effects.find(v => v.id === now.id);
          const outline = area.rect ? rectPts(area.rect) : pts(area.polygon ?? area, 'areas');
          now = W.stroke(now, {op: area.hide ? 'hide' : 'show', shape: 'poly', points: outline.flatMap(v => [v.x, v.y])});
        }
      }
      done();
      return {effect: now.id, type, name: now.name};
    },
    region({kind = 'trap', points, rect, name, note, cost}) {
      const outline = rect ? rectPts(rect) : pts(points);
      const r = window.KrakenRegions.add(outline.flatMap(v => [v.x, v.y]), {kind, name, note, cost});
      return {region: r.id, kind: r.kind, name: r.name};
    },
    // Change anything by id: art (at, size, rotation, opacity, layer, name, hidden), a light's settings,
    // a wall's type or flags (open, locked...), an effect's settings, a region's name or note.
    update({id, ...f}) {
      const p = S().project;
      const key = ['objects', 'walls', 'lights', 'effects', 'regions'].find(k => (p[k] || []).some(o => o.id === id));
      if (!key) throw Error(`Nothing on the map has id ${id}.`);
      S().snapshot();
      const o = p[key].find(v => v.id === id);
      if (key === 'objects') {
        const c = f.at ? pt(f.at) : {x: o.x + o.width / 2, y: o.y + o.height / 2};
        if (f.size) { o.width = px(f.size[0]); o.height = px(f.size[1]); }
        if (f.scale) { o.width *= Number(f.scale); o.height *= Number(f.scale); }
        o.x = c.x - o.width / 2; o.y = c.y - o.height / 2;
        if (f.rotation !== undefined) o.rotation = Number(f.rotation) || 0;
        if (f.opacity !== undefined) o.opacity = Math.max(0, Math.min(1, Number(f.opacity)));
        if (f.layer) o.layer = ensureLayer(f.layer);
        if (f.name) o.name = String(f.name);
        if (f.hidden !== undefined) o.visible = !f.hidden;
      } else if (key === 'lights') {
        const L = window.KrakenLighting;
        const at = f.at ? pt(f.at) : null;
        Object.assign(o, lightFields(f), at ? at : {});
        if (o.dim < o.bright) o.dim = o.bright;
        p.lights[p.lights.indexOf(o)] = L.normalizeLight(o);
      } else if (key === 'walls') {
        if (f.type) { if (!window.KrakenLOS.TYPES[f.type]) throw Error('Unknown wall type.'); o.type = f.type; o.flags = [...window.KrakenLOS.TYPES[f.type][1]]; }
        for (const flag of ['open', 'locked', 'hidden']) if (f[flag] !== undefined) o.flags = f[flag] ? [...new Set([...o.flags, flag])] : o.flags.filter(v => v !== flag);
        if (f.points) o.points = pts(f.points).flatMap(v => [v.x, v.y]);
        p.walls[p.walls.indexOf(o)] = window.KrakenLOS.normalizeWall(o);
      } else if (key === 'effects') {
        if (f.settings) o.settings = {...o.settings, ...K.effectSettings(o.type, f.settings)};
        if (f.name) o.name = String(f.name).slice(0, 40);
        if (f.hidden !== undefined) o.visible = !f.hidden;
        p.effects[p.effects.indexOf(o)] = window.KrakenWeather.normalize(o, p.width, p.height);
      } else {
        p.regions[p.regions.indexOf(o)] = window.KrakenRegions.normalize({...o, ...f});
      }
      done();
      return {updated: id, kind: key};
    },
    remove({ids, id}) {
      const gone = new Set((ids || [id]).map(String)), p = S().project;
      S().snapshot();
      // Wall art takes its line-of-sight wall with it; a door takes its art.
      const groups = new Set(p.objects.filter(o => gone.has(o.id) && o.wallPath && o.groupId).map(o => o.groupId));
      for (const w of p.walls) if (w.groupId && groups.has(w.groupId)) gone.add(w.id);
      for (const o of p.objects) if (o.doorId && gone.has(o.doorId)) gone.add(o.id);
      let n = 0;
      for (const k of ['objects', 'walls', 'lights', 'effects', 'regions']) if (p[k]) { const before = p[k].length; p[k] = p[k].filter(o => !gone.has(o.id)); n += before - p[k].length; }
      done();
      return {removed: n};
    },
    undo() { document.querySelector('#undoBtn').click(); return summary(false); },
    redo() { document.querySelector('#redoBtn').click(); return summary(false); },
    map({detail = true}) { return summary(detail); },
    check,
    // A picture of the map at full size: picture (what Kraken shows: the art alone), editor (with the
    // walls, grid and the lighting preview, as the editor draws it) or play (the play test: a test token
    // at token, carrying light, seeing with vision, the map's darkness or darkness 0..1).
    async render({view = 'picture', grid = true, walls = true, lighting = true, token, light = 'torch', vision = 'normal', darkness}) {
      const s = S();
      if (view === 'picture') { await s.loaded(); return {image: await s.flat(), width: s.project.width, height: s.project.height}; }
      if (view === 'editor') return {image: await s.capture({grid, walls, lighting}), width: s.project.width, height: s.project.height};
      if (view !== 'play') throw Error('view is picture, editor or play.');
      const P = window.KrakenPlay, before = s.mode;
      s.switchMode('play');
      try {
        if (token) P._state.token = pt(token, 'token');
        if (!P.LIGHTS[light]) throw Error('light is one of ' + Object.keys(P.LIGHTS).join(', ') + '.');
        if (!P.VISION[vision]) throw Error('vision is one of ' + Object.keys(P.VISION).join(', ') + '.');
        Object.assign(P._state, {light, vision, showWalls: false});
        if (darkness !== undefined) P._state.darkness = Math.max(0, Math.min(1, Number(darkness)));
        return {image: await s.capture({grid: !!grid, walls: false, lighting: false}), width: s.project.width, height: s.project.height,
          token: [sq(P._state.token.x), sq(P._state.token.y)]};
      } finally { s.switchMode(before === 'play' ? 'view' : before); }
    },
    // Map Studio's Save project (Open > Saved project finds it again).
    async save() { await window.KrakenBeta02.saveProject(true); return {project: S().project.projectId ?? null, name: S().project.name}; },
    // What export and Save to Kraken need: the project (hidden layers out) and its painted picture.
    async picture() {
      await S().loaded();
      return {project: window.KrakenLayers.forExport(S().validate(S().project)), image: await S().flat()};
    },
    open({project}) {
      if (!project || typeof project !== 'object') throw Error('Give the project.');
      S().openDocument(project);
      S().switchMode('view');
      return summary(false);
    },
    async projects() { const r = await fetch('/api/projects'); const d = await r.json(); return (d.projects || []).map(x => ({id: x.id, name: x.name, saved: x.savedAt || x.updated || null})); },
    async openDemo() { const r = await fetch('/api/demo'); const d = await r.json(); if (!r.ok) throw Error(d.error || 'No example map.'); await S().refreshAssets(); S().openDocument(d.project); S().switchMode('view'); return summary(false); },
    async openSaved({id}) { const r = await fetch('/api/projects/' + encodeURIComponent(id)); const d = await r.json(); if (!r.ok) throw Error(d.error || 'No such project.'); S().openDocument(d.project || d); S().switchMode('view'); return summary(false); },
    // The open maps (the tab bar): list them, switch to one (select: its index), close one (close: its index; discard drops unsaved changes).
    async tabs({select, close, discard = false}) {
      const sh = window.KrakenShell;
      if (select !== undefined) sh.selectTab(Number(select));
      if (close !== undefined) await sh.closeTab(Number(close), !!discard);
      return {active: sh?.active ?? 0, tabs: (sh?.tabs || []).map((t, i) => ({index: i, name: t.doc.project.name, dirty: !!t.doc.dirty}))};
    },
    // Grid & map size (and the Map settings fields): width and height in squares, the grid's size in pixels,
    // its offset, feet per square, the background, the name. Art, walls and lights stay where they are.
    grid({width, height, size, offsetX, offsetY, distance, background, name}) {
      const p = S().project, next = JSON.parse(JSON.stringify(p)), G = size ? Math.round(num(size, 'size')) : p.grid;
      if (size) next.grid = G;
      if (width) next.width = Math.round(num(width, 'width') * G);
      if (height) next.height = Math.round(num(height, 'height') * G);
      if (offsetX !== undefined || offsetY !== undefined) next.gridOffset = {x: Number(offsetX ?? p.gridOffset?.x ?? 0), y: Number(offsetY ?? p.gridOffset?.y ?? 0)};
      if (distance) next.gridDistance = num(distance, 'distance');
      if (background) next.background = String(background);
      if (name) next.name = String(name).slice(0, 120);
      S().replace(next);
      return summary(false);
    },
    // The Layers panel: a layer (its id or name) shown or hidden, locked or not, renamed, moved up or down,
    // or made the layer new art goes on; walls, lights, effects and regions groups shown or hidden.
    layer({id, name, hidden, locked, rename, move, active}) {
      const p = S().project, ref = id ?? name;
      window.KrakenLayers.ensure(p);
      S().snapshot();
      if (['walls', 'lights', 'effects', 'regions'].includes(String(ref)) && !p.layers.some(l => l.id === ref)) {
        if (hidden !== undefined) p.groups[ref].visible = !hidden;
      } else {
        const l = p.layers.find(v => v.id === ref || v.name.toLowerCase() === String(ref).toLowerCase()) || p.layers.find(v => v.id === ensureLayer(ref));
        if (hidden !== undefined) l.visible = !hidden;
        if (locked !== undefined) l.locked = !!locked;
        if (rename) l.name = String(rename).slice(0, 60);
        if (active) p.activeLayer = l.id;
        const i = p.layers.indexOf(l);
        if (move === 'up' && i < p.layers.length - 1) [p.layers[i], p.layers[i + 1]] = [p.layers[i + 1], p.layers[i]];
        if (move === 'down' && i > 0) [p.layers[i], p.layers[i - 1]] = [p.layers[i - 1], p.layers[i]];
      }
      done();
      return summary(false).layers;
    },
  };
  const lightFields = f => {
    const out = {};
    for (const k of ['color', 'bright', 'dim', 'strength', 'falloff', 'dimFalloff', 'animation', 'speed', 'inverse', 'on']) if (f[k] !== undefined) out[k] = f[k];
    return out;
  };
  function addLight(f) {
    const L = window.KrakenLighting, c = pt(f.at ?? [f.x, f.y], 'at');
    if (f.preset && !L.LIGHTS[f.preset]) throw Error('preset is one of ' + Object.keys(L.LIGHTS).join(', ') + '.');
    const l = L.add(c.x, c.y, f.preset || 'torch');
    const p = S().project, i = p.lights.findIndex(v => v.id === l.id);
    const next = {...p.lights[i], ...lightFields(f)};
    if (next.dim < next.bright) next.dim = next.bright;
    p.lights[i] = L.normalizeLight(next);
    done();
    return {id: l.id, preset: p.lights[i].preset, bright: p.lights[i].bright, dim: p.lights[i].dim};
  }

  function run(action, args) {
    const job = queue.then(async () => {
      if (!S()) throw Error('Map Studio has not loaded.');
      if (!ACTIONS[action]) throw Error(`Map Studio has no action ${action}.`);
      return ACTIONS[action](args && typeof args === 'object' ? args : {});
    });
    queue = job.catch(() => {});
    return job.then(value => ({ok: true, value}), error => ({ok: false, error: error?.message || String(error)}));
  }
  return {run, actions: Object.keys(ACTIONS)};
})();
