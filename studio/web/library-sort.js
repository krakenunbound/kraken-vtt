/* Sorting the art library: where each picture comes from (its source) and what kind of art it
 * is, the same kinds for every source, so "Walls" finds walls in the starter kit, in Battle Map
 * Forge and in every Dungeondraft pack, and a pack picked as the source narrows any kind. */
(function (root) {
  'use strict';
  const KINDS = ['Walls', 'Doors & windows', 'Floors', 'Ground & water', 'Dungeon tiles', 'Roofs', 'Paths', 'Furniture', 'Objects', 'Items',
    'Plants & trees', 'Terrain & scatter', 'Shore & sea', 'Effects & lights', 'Markers', 'Imported', 'FG map art', 'Other'];
  const OWN_PACK = 'Kraken Map Art';  // our own art: its folders are already named after the kinds
  // Things hung on a wall are not walls.
  const DECOR = /(torch|shield|sconce|banner|candle|lamp|lantern|painting|tapestry|mirror|clock|hook|trophy|plaque|shrine|relief)/i;
  const DD_KINDS = {walls: 'Walls', caves: 'Walls', portals: 'Doors & windows', roofs: 'Roofs', paths: 'Paths', lights: 'Effects & lights',
    tilesets: 'Floors', terrain: 'Floors', materials: 'Floors', patterns: 'Floors'};

  const isDD = a => a.sourcePack === 'Dungeondraft';
  const ddPack = a => String((a.tags || [])[1] || 'Dungeondraft');
  const ddKind = a => String((a.tags || [])[2] || '').toLowerCase();

  function kindOf(a) {
    const name = String(a.name || ''), cat = String(a.category || '').replace(/^images\//, '');
    if (a.sourcePack === 'Fantasy Grounds') return 'FG map art';
    if (a.sourcePack === OWN_PACK && KINDS.includes(cat)) return cat;
    if (a.sourcePack === 'Imported artwork') return /^Wall - /.test(name) ? 'Walls' : /^Path - /.test(name) ? 'Paths' : 'Imported';  // drawn with the Wall tool
    const dd = isDD(a) ? ddKind(a) : '';
    if (DD_KINDS[dd]) return DD_KINDS[dd];
    if (cat === 'Markers') return 'Markers';
    if (cat === 'Effects') return 'Effects & lights';
    if (cat === 'Items') return 'Items';
    if (cat === 'Walls' || cat === 'Tiles/Cave' || (/wall/i.test(name) && !DECOR.test(name))) return 'Walls';
    if (/door|window|gate|portcullis|bars|hatch|threshold/i.test(name)) return 'Doors & windows';
    if (dd) return 'Objects';
    if (cat === 'Tiles/Roofs') return 'Roofs';
    if (cat === 'Floors' || cat === 'Forge Floors' || cat === 'Backgrounds') return 'Floors';
    if (cat.startsWith('Tiles/')) return 'Dungeon tiles';
    if (cat === 'Terrain Objects') return 'Terrain & scatter';
    if (cat.startsWith('Forge ')) return 'Objects';
    return 'Other';
  }
  // A key for the source, and the name shown for it.
  const sourceOf = a => isDD(a) ? 'dd:' + ddPack(a) : String(a.sourcePack || 'Other');
  function sourceLabel(key) {
    if (key.startsWith('dd:')) return key.slice(3) + ' (Dungeondraft)';
    return key === 'Fantasy Grounds' ? 'Fantasy Grounds map art' : key;
  }
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {numeric: true, sensitivity: 'base'});

  const api = {KINDS, OWN_PACK, kindOf, sourceOf, sourceLabel, byName};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KrakenLibrarySort = api;
})(this);
