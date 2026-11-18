/* Map Studio inside Kraken VTT: an image Kraken opened here (?kraken=<token>)
 * is loaded from its master (its picture, walls, doors, lights and weather),
 * and Save to Kraken writes the work back into that master: walls, lights and
 * weather, and, when art was painted, the rendered map as the image's picture.
 * The image is the same wherever Kraken shows it. */
(() => {
  const token = new URLSearchParams(location.search).get('kraken');
  const S = () => window.KrakenStudio;
  const actions = document.querySelector('.actions');
  if (!token || !actions) return;
  document.body.classList.add('in-kraken');

  const button = document.createElement('button');
  button.className = 'gold';
  button.id = 'saveKrakenBtn';
  button.textContent = 'Save to Kraken';
  button.title = 'Write this map into its image in Kraken: walls, doors, windows, lights and weather, and the painted art as its picture';
  actions.prepend(button);

  // The tab of the image Kraken opened here: what Map Studio saves into its master.
  let bound = null;
  const shell = () => window.KrakenShell;
  const inFront = () => bound !== null && shell()?.tabs?.[shell().active]?.id === bound;

  async function open() {
    try {
      const r = await fetch('/api/kraken/open?token=' + encodeURIComponent(token));
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Could not open the image.');
      await S().refreshAssets?.();
      S().openDocument(data.project);
      bound = shell()?.tabs?.[shell().active]?.id ?? null;
      S().toast(`Opened ${data.project.name} from the campaign: what you do here is that map, wherever it is shown.`);
    } catch (e) {
      S().toast(e.message, true);
    }
  }

  // Into the image's master: walls, doors, lights, weather, and the painted map as its picture.
  let saving = null;
  let again = false;
  async function save(quiet) {
    if (!inFront()) {
      if (!quiet) S().toast('This tab is not the campaign map Kraken opened here.', true);
      return;
    }
    if (saving) { again = true; return saving; }
    button.disabled = true;
    const label = button.textContent;
    if (!quiet) button.textContent = 'Saving…';
    saving = (async () => {
      try {
        const project = window.KrakenLayers?.forExport?.(S().project) || S().project;
        const image = await S().flat();
        const r = await fetch('/api/kraken/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, project, image }) });
        const data = await r.json();
        if (!r.ok) throw Error(data.error || 'Could not save.');
        S().markSaved?.();
        button.dataset.saved = String(Date.now());
        if (!quiet) S().toast(`Saved to Kraken: ${data.walls} wall segments, ${data.lights} lights, ${data.fx} weather layers${data.picture ? ', and the painted map' : ''}.`);
      } catch (e) {
        S().toast('Save to Kraken failed: ' + e.message, true);
      } finally {
        button.disabled = false;
        button.textContent = label;
        saving = null;
        if (again) { again = false; save(true); }
      }
    })();
    return saving;
  }
  button.onclick = () => save(false);
  // As FG's: an edit is the map's, wherever the campaign shows it. Saved by itself a moment after each change.
  let soon = 0;
  const watch = () => {
    const sh = shell();
    if (!sh || sh.changed.krakenWatched) return;
    const changed = sh.changed;
    sh.changed = (...args) => {
      changed(...args);
      clearTimeout(soon);
      soon = setTimeout(() => save(true), 2000);
    };
    sh.changed.krakenWatched = true;
  };

  // After the editor's own scripts have set up.
  if (document.readyState === 'complete') { watch(); open(); }
  else addEventListener('load', () => { watch(); open(); });
})();
