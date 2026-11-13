/* Dungeondraft packs in the asset library: pick a pack, its art appears. */
(() => {
  'use strict';
  const S = window.KrakenStudio, $ = s => document.querySelector(s);
  const select = $('#ddPack'), status = $('#ddStatus');
  let loaded = false, timer = null;

  async function refresh() {
    try {
      const r = await fetch('/api/dd/packs'), data = await r.json();
      if (!r.ok) throw Error(data.error);
      const keep = select.value;
      select.replaceChildren(new Option(data.packs.length ? `Dungeondraft packs (${data.packs.length})...` : 'Dungeondraft packs...', ''));
      for (const p of data.packs) select.add(new Option(`${p.name} (${p.images})`, p.key));
      select.value = keep;
      if (data.scanning) {
        status.textContent = `Finding Dungeondraft packs... ${data.scanned} checked`;
        clearTimeout(timer);
        timer = setTimeout(refresh, 2500);
      } else {
        status.textContent = data.folders.length ? '' : "No Dungeondraft folders yet: add yours in Kraken's Settings, under Map Studio art.";
        loaded = true;
      }
    } catch (e) { status.textContent = 'Dungeondraft packs unavailable: ' + e.message; }
  }

  select.addEventListener('focus', () => { if (!loaded) refresh(); });
  select.addEventListener('change', async () => {
    if (!select.value) return;
    const name = select.options[select.selectedIndex].text.replace(/ \(\d+\)$/, '');
    status.textContent = 'Opening ' + name + '...';
    try {
      const r = await fetch('/api/dd/pack?key=' + encodeURIComponent(select.value)), data = await r.json();
      if (!r.ok) throw Error(data.error);
      data.assets.forEach(a => S.addAsset(a));
      if (data.assets.length) {  // show the pack, keeping the kind of art already picked
        $('#categories').dataset.source = window.KrakenLibrarySort.sourceOf(data.assets[0]);
        S.showAssets();
      }
      status.textContent = `${data.assets.length} pieces of art from ${name}, shown under Source below.`;
      select.value = '';  // the pack is now a source; this list only opens packs
    } catch (e) { status.textContent = 'Could not open the pack: ' + e.message; }
  });
  refresh();
})();
