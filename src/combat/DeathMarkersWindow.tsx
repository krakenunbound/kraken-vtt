import type { Session } from "../session/useSession";
import { DeathMarkerArt } from "../table/MapView";
import { creatureTypes, DEFAULT_BY_TYPE, MARKER_SETS } from "../../shared/map/deathMarkers.mjs";

// FG's Death Markers, the GM's: when a creature dies on the combat tracker it
// leaves a marker where its token stood. Each creature type of this game takes
// a set (blood in a colour, skulls, tombstones, bones, a scorch mark); a type
// left on "As the default" takes the default's. Below, every set's pictures.
export function DeathMarkersWindow({ session }: { session: Session }) {
  const settings = session.options.deathMarkers ?? { on: true, default: "blood-red", byType: {} };
  const set = (patch: Partial<typeof settings>) => session.setTableOptions({ deathMarkers: { ...settings, ...patch } });
  const setType = (type: string, value: string) => set({ byType: { ...settings.byType, [type]: value } });
  const types = creatureTypes(session.ruleset);
  const preview = (id: string) => (
    <svg className="marker-preview" viewBox="0 0 100 100" width="34" height="34" aria-hidden="true">
      <DeathMarkerArt set={id} variant={0} />
    </svg>
  );
  return (
    <div className="death-markers-window">
      <label className="settings-check">
        <input type="checkbox" data-setting="death-markers-on" checked={settings.on !== false} onChange={(event) => set({ on: event.target.checked })} />
        A creature that dies on the combat tracker leaves a marker on the map (characters and friends leave none)
      </label>
      <table className="marker-types">
        <thead>
          <tr>
            <th>Creature type</th>
            <th>Marker set</th>
          </tr>
        </thead>
        <tbody>
          <tr data-marker-type="default">
            <td>« Default »</td>
            <td>
              <select aria-label="The default marker set" value={settings.default} onChange={(event) => set({ default: event.target.value })}>
                {MARKER_SETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {preview(settings.default)}
            </td>
          </tr>
          {types.map((type) => {
            const key = type.toLowerCase();
            const chosen = settings.byType[key];
            // Not chosen yet: Kraken's suggestion (undead violet, constructs black...), else the default's.
            const value = chosen ?? (DEFAULT_BY_TYPE as Record<string, string>)[key] ?? "";
            return (
              <tr key={type} data-marker-type={key}>
                <td>{type}</td>
                <td>
                  <select aria-label={`${type} marker set`} value={value} onChange={(event) => setType(key, event.target.value)}>
                    <option value="">As the default</option>
                    {MARKER_SETS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {preview(value || settings.default)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 className="marker-sets-head">Marker sets</h3>
      <div className="marker-sets">
        {MARKER_SETS.map((item) => (
          <div key={item.id} className="marker-set" data-marker-set={item.id}>
            <span className="marker-set-name">
              <i style={{ background: item.tint }} /> {item.name}
            </span>
            <span className="marker-set-pictures">
              {Array.from({ length: item.count }, (_, variant) => (
                <svg key={variant} viewBox="0 0 100 100" width="44" height="44" aria-hidden="true">
                  <DeathMarkerArt set={item.id} variant={variant} />
                </svg>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
