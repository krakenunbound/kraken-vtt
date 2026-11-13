/* The workspace: tabs for open maps, a start screen, menus, opening a picture as a map, drag and drop. */
window.KrakenShell = (() => {
  'use strict';
  const S = window.KrakenStudio, $ = s => document.querySelector(s);
  const STORE = 'kraken-tabs';
  let tabs = [], active = -1, persistTimer = null, nextId = 1;
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[m]);

  const isEmpty = p => !p.objects.length && !p.walls.length && !p.lights.length && !p.effects.length;
  const current = () => tabs[active];

  function sync() {
    if (active >= 0) {
      const doc = S.getDocument();
      current().doc = {...doc, dirty: current().doc.dirty};
    }
  }

  function showStart(show) {
    $('#startScreen').hidden = !show;
    document.body.classList.toggle('no-map', show && active < 0);
    document.body.classList.toggle('start-shown', show);
  }

  function activate(i) {
    sync();
    active = i;
    S.setDocument(tabs[i].doc);
    showStart(false);
    render();
    persist();
  }

  function openDocument(project) {
    const value = S.validate(project);
    window.KrakenLayers.normalize(value);
    const doc = {project: value, undo: [], redo: [], dirty: false, view: null};
    sync();
    if (active >= 0 && isEmpty(current().doc.project) && !current().doc.dirty) {
      current().doc = doc;
      S.setDocument(doc);
      showStart(false);
      render();
      persist();
      return;
    }
    tabs.push({id: nextId++, doc});
    activate(tabs.length - 1);
  }

  function newBlank() {
    sync();
    tabs.push({id: nextId++, doc: {project: S.blank(), undo: [], redo: [], dirty: false, view: null}});
    window.KrakenLayers.normalize(tabs.at(-1).doc.project);
    activate(tabs.length - 1);
  }

  function ask(name) {
    return new Promise(resolve => {
      const d = $('#closeDialog');
      $('#closeTitle').textContent = 'Save changes to "' + name + '"?';
      $('#closeText').textContent = 'This map has changes that are not saved as a project. If you close it without saving, they are lost.';
      const done = v => { d.close(); resolve(v); };
      $('#closeSave').onclick = () => done('save');
      $('#closeDiscard').onclick = () => done('discard');
      $('#closeCancel').onclick = () => done('cancel');
      d.oncancel = () => resolve('cancel');
      d.showModal();
    });
  }

  async function close(i) {
    sync();
    const tab = tabs[i];
    if (tab.doc.dirty && !isEmpty(tab.doc.project)) {
      const choice = await ask(tab.doc.project.name);
      if (choice === 'cancel') return;
      if (choice === 'save') {
        if (i !== active) activate(i);
        await window.KrakenBeta02.saveProject(true);
        sync();
        if (tab.doc.dirty) return; // the save failed; its message is showing
      }
    }
    const index = tabs.indexOf(tab);
    tabs.splice(index, 1);
    if (!tabs.length) {
      active = -1;
      S.setDocument({project: S.blank(), undo: [], redo: [], dirty: false, view: null});
      showStart(true);
    } else {
      active = -1;
      activate(Math.min(index, tabs.length - 1));
      return;
    }
    render();
    persist();
  }

  function changed() {
    if (active < 0) {  // editing with no map open starts one
      tabs.push({id: nextId++, doc: {...S.getDocument(), dirty: true}});
      active = tabs.length - 1;
      showStart(false);
    }
    if (!current().doc.dirty) {
      current().doc.dirty = true;
      render();
    }
    persist();
  }

  function markSaved() {
    if (active >= 0) current().doc.dirty = false;
    render();
    persist();
  }

  function render() {
    const bar = $('#tabBar');
    bar.innerHTML = tabs.map((t, i) => {
      const p = i === active ? S.project : t.doc.project;
      const from = p.fgSource ? ` title="From ${esc(p.fgSource.sourceName)} in Fantasy Grounds"` : '';
      return `<div class="tab ${i === active ? 'active' : ''}" data-i="${i}"${from}><button class="tab-name">${p.fgSource ? '<i>FG</i> ' : ''}${esc(p.name || 'Untitled Map')}${t.doc.dirty ? ' •' : ''}</button><button class="tab-close" title="Close this map" aria-label="Close this map">✕</button></div>`;
    }).join('') + `<button class="tab-new ${active < 0 ? 'active' : ''}" title="Open or create another map">＋ New or open</button>`;
    bar.querySelectorAll('.tab').forEach(el => {
      const i = Number(el.dataset.i);
      el.querySelector('.tab-name').onclick = () => { if (i !== active || !$('#startScreen').hidden) activate(i); };
      el.querySelector('.tab-close').onclick = e => { e.stopPropagation(); close(i); };
    });
    bar.querySelector('.tab-new').onclick = () => { sync(); showStart(true); bar.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); bar.querySelector('.tab-new').classList.add('active'); };
  }

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      sync();
      try {
        localStorage.setItem(STORE, JSON.stringify({active, tabs: tabs.map(t => ({project: t.doc.project, dirty: t.doc.dirty}))}));
      } catch { /* very large FG maps may not fit; their recovery copies are on disk */ }
    }, 700);
  }

  function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { saved = null; }
    if (!saved) {  // carry over the single-map autosave from earlier versions
      try {
        const old = JSON.parse(localStorage.getItem('kraken-map-autosave'));
        if (old && !isEmpty(old)) saved = {active: 0, tabs: [{project: old, dirty: true}]};
      } catch { saved = null; }
    }
    for (const t of saved?.tabs || []) {
      try {
        const project = S.validate(t.project);
        window.KrakenLayers.normalize(project);
        tabs.push({id: nextId++, doc: {project, undo: [], redo: [], dirty: !!t.dirty, view: null}});
      } catch { /* skip a damaged saved tab */ }
    }
    if (tabs.length) {
      active = -1;
      activate(Math.min(Math.max(0, saved.active), tabs.length - 1));
    } else {
      S.setDocument({project: S.blank(), undo: [], redo: [], dirty: false, view: null});
      showStart(true);
      render();
    }
  }

  // --- a picture from this computer as a new map ------------------------------

  function guessGrid(w, h, name) {
    const px = name.match(/(\d{2,3})\s*(px|ppi|dpi)/i);
    if (px) return Number(px[1]);
    const cells = name.match(/(\d{1,3})\s*[x×]\s*(\d{1,3})/i);
    if (cells) {
      const a = w / Number(cells[1]), b = h / Number(cells[2]);
      if (Math.abs(a - b) < 2) return Math.round(a);
      const c = w / Number(cells[2]), d = h / Number(cells[1]);
      if (Math.abs(c - d) < 2) return Math.round(c);
    }
    for (const g of [70, 100, 140, 50, 200, 256, 128, 64, 72, 96, 150, 120, 90, 80, 75, 60]) {
      if (w % g === 0 && h % g === 0 && w / g >= 8 && w / g <= 150 && h / g >= 6) return g;
    }
    return 0;  // no evidence: the picture's squares are unknown
  }

  async function openPicture(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      S.toast('That is not a PNG, JPG or WebP picture.', true);
      return;
    }
    S.toast('Reading ' + file.name + '…');
    let asset;
    try {
      const r = await fetch('/api/upload?name=' + encodeURIComponent(file.name), {method: 'POST', body: file});
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      asset = data.asset;
    } catch (e) { S.toast('Could not open the picture: ' + e.message, true); return; }
    if (asset.width > 16384 || asset.height > 16384) {
      S.toast(`That picture is ${asset.width} × ${asset.height} pixels; Map Studio edits maps up to 16384 pixels per side.`, true);
      return;
    }
    S.addAsset(asset);
    const d = $('#pictureDialog'), stem = file.name.replace(/\.[^.]+$/, '');
    $('#picturePreview').src = '/api/asset/' + encodeURIComponent(asset.id);
    $('#pictureName').value = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Map';
    const guessed = guessGrid(asset.width, asset.height, file.name);
    $('#pictureGrid').value = guessed || 50;
    $('#pictureGrid').dataset.guessed = guessed ? '1' : '';
    $('#pictureGrid').oninput = () => { $('#pictureGrid').dataset.guessed = '1'; info(); };
    const info = () => {
      const g = Number($('#pictureGrid').value) || 50;
      $('#pictureInfo').textContent = `The picture is ${asset.width} × ${asset.height} pixels, so the map is ${(asset.width / g).toFixed(1).replace('.0', '')} × ${(asset.height / g).toFixed(1).replace('.0', '')} squares (${Math.round(asset.width / g * 5)} × ${Math.round(asset.height / g * 5)} ft).`;
    };
    info();
    $('#pictureCancel').onclick = () => d.close();
    $('#pictureForm').onsubmit = e => {
      e.preventDefault();
      const grid = Math.min(1000, Math.max(5, Math.round(Number($('#pictureGrid').value) || 50)));
      const p = S.blank();
      Object.assign(p, {name: $('#pictureName').value.trim() || 'Map', width: asset.width, height: asset.height, grid,
        layers: [{id: 'map', name: 'Map picture', visible: true, locked: true}, {id: 'objects', name: 'Objects', visible: true, locked: false}],
        activeLayer: 'objects', wallGridSnap: !!$('#pictureGrid').dataset.guessed,
        objects: [{id: 'map-picture', assetId: asset.id, name: asset.name || 'Map picture', x: 0, y: 0, width: asset.width, height: asset.height, rotation: 0, visible: true, layer: 'map'}]});
      d.close();
      openDocument(p);
      S.toast(p.wallGridSnap ? 'Map ready. The picture is locked on the "Map picture" layer; unlock it under Layers if you need to move it.'
        : 'Map ready. The square size was not clear from the picture, so walls go exactly where you click. To use grid snapping, open Grid & map size and use Set grid from the picture.');
    };
    d.showModal();
  }

  // --- menus, start screen, drag and drop ---------------------------------------

  document.querySelectorAll('.menu').forEach(menu => {
    menu.addEventListener('toggle', () => {
      if (menu.open) document.querySelectorAll('.menu').forEach(m => { if (m !== menu) m.open = false; });
    });
    menu.querySelectorAll('.menu-items button').forEach(b => b.addEventListener('click', () => { menu.open = false; }));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu')) document.querySelectorAll('.menu').forEach(m => { m.open = false; });
  });
  $('#closeMapBtn').onclick = $('#viewCloseBtn').onclick = () => { if (active >= 0 && $('#startScreen').hidden) close(active); else S.toast('No map is open.'); };
  document.querySelectorAll('.open-picture').forEach(b => { b.onclick = () => $('#mapPictureInput').click(); });
  $('#mapPictureInput').onchange = e => { openPicture(e.target.files[0]); e.target.value = ''; };
  const startActions = {picture: () => $('#mapPictureInput').click(), 
    generate: () => $('#layoutBtn').click(), blank: newBlank, project: () => $('#projectsBtn').click(),
    file: () => $('#openBtn').click()};
  document.querySelectorAll('[data-start]').forEach(b => { b.onclick = () => startActions[b.dataset.start](); });

  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (/\.(json|zip)$/i.test(file.name)) {
      const dt = new DataTransfer();
      dt.items.add(file);
      $('#fileInput').files = dt.files;
      $('#fileInput').dispatchEvent(new Event('change', {bubbles: true}));
    } else openPicture(file);
  });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#saveProjectBtn').click(); }
  });
  window.addEventListener('beforeunload', () => {
    clearTimeout(persistTimer);
    sync();
    try { localStorage.setItem(STORE, JSON.stringify({active, tabs: tabs.map(t => ({project: t.doc.project, dirty: t.doc.dirty}))})); } catch { /* see persist */ }
  });

  setTimeout(restore, 0);
  return {openDocument, newBlank, changed, markSaved, openPicture, get tabs() { return tabs; }, get active() { return active; }};
})();
