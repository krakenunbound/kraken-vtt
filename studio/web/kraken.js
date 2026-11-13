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

  async function open() {
    try {
      const r = await fetch('/api/kraken/open?token=' + encodeURIComponent(token));
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Could not open the image.');
      await S().refreshAssets?.();
      S().openDocument(data.project);
      S().toast(`Opened ${data.project.name} from Kraken. Save to Kraken writes it back.`);
    } catch (e) {
      S().toast(e.message, true);
    }
  }

  button.onclick = async () => {
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Saving…';
    try {
      const project = window.KrakenLayers?.forExport?.(S().project) || S().project;
      const image = await S().flat();
      const r = await fetch('/api/kraken/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, project, image }) });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Could not save.');
      S().markSaved?.();
      S().toast(`Saved to Kraken: ${data.walls} wall segments, ${data.lights} lights, ${data.fx} weather layers${data.picture ? ', and the painted map' : ''}.`);
    } catch (e) {
      S().toast('Save to Kraken failed: ' + e.message, true);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };

  // After the editor's own scripts have set up.
  if (document.readyState === 'complete') open();
  else addEventListener('load', open);
})();
