// A new character's portrait and token (no sheet without them): what the
// wizard chose (spec.portrait, spec.token: ids from the GM's collection), or
// else Kraken's own race and class pair ("Dwarf Fighter"), or else one of
// that race's from any folder (FG's portraits/Dwarf). art: (kind) => the
// collection's items ({ id, group, name }).

function pick(items, race, cls) {
  const r = String(race ?? "").trim().toLowerCase();
  const c = String(cls ?? "").trim().toLowerCase();
  if (!r) return null;
  const inRace = items.filter((item) => item.group.toLowerCase().endsWith(`· ${r}`));
  const kraken = inRace.filter((item) => item.group.startsWith("Kraken"));
  return (
    kraken.find((item) => item.name.toLowerCase() === `${r} ${c}`) ??
    inRace.find((item) => c && item.name.toLowerCase().includes(c)) ??
    kraken[0] ??
    // Not a video: an animated portrait is the player's to choose.
    inRace.find((item) => !item.video) ??
    null
  );
}

function withArt(data, spec, art) {
  if (typeof art !== "function") return data;
  const out = { ...data };
  const race = out.race ?? out.species ?? spec?.race ?? spec?.species;
  const cls = spec?.class ?? spec?.cls ?? "";
  for (const kind of ["portrait", "token"]) {
    const items = art(kind) ?? [];
    const chosen = typeof spec?.[kind] === "string" ? items.find((item) => item.id === spec[kind]) : null;
    if (chosen) out[kind] = chosen.id;
    else if (typeof out[kind] !== "string" || !out[kind]) {
      const found = pick(items, race, cls);
      if (found) out[kind] = found.id;
    }
  }
  return out;
}

module.exports = { withArt, pickArt: pick };
