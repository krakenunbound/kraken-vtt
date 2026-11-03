import type { TableMap } from "../session/useSession";
import { WEATHER_TYPES, type WeatherType } from "./weatherTypes";

export type SceneSettingsPatch = {
  darkness?: number | null;
  grid?: { show?: boolean; alpha?: number | null; color?: string | null };
  weather?: { type?: WeatherType; intensity?: number; direction?: number };
};

// FG's lighting presets for an image, as darkness levels.
const LIGHTING = [
  { label: "Day", value: 0 },
  { label: "Dusk", value: 0.3 },
  { label: "Night", value: 0.75 },
  { label: "Pitch black", value: 1 },
];

// The GM's map settings: lighting, line of sight, movement, grid, weather.
export function SceneSettings({
  map,
  gridDefaults,
  onSettings,
  onSight,
  onLocked,
  onClose,
}: {
  map: TableMap;
  gridDefaults: { alpha: number; color: string };
  onSettings: (patch: SceneSettingsPatch) => void;
  onSight: (on: boolean) => void;
  onLocked: (on: boolean) => void;
  onClose: () => void;
}) {
  const grid = map.settings.grid;
  const weather = map.settings.weather;
  return (
    <aside className="scene-settings" aria-label="Scene settings" onPointerDown={(event) => event.stopPropagation()}>
      <header>
        <h2>Scene</h2>
        <button type="button" onClick={onClose} aria-label="Close scene settings">
          ×
        </button>
      </header>

      <fieldset>
        <legend>Lighting</legend>
        <div className="segmented">
          {LIGHTING.map((preset) => (
            <button key={preset.label} type="button" aria-pressed={Math.abs(map.darkness - preset.value) < 0.01} onClick={() => onSettings({ darkness: preset.value })}>
              {preset.label}
            </button>
          ))}
        </div>
        <label>
          Darkness {Math.round(map.darkness * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={map.darkness} onChange={(event) => onSettings({ darkness: Number(event.target.value) })} />
        </label>
        <p className="hint">From 50% players see only lit places and what their darkvision reaches.</p>
        {map.settings.darkness != null ? (
          <button type="button" className="link" onClick={() => onSettings({ darkness: null })}>
            Use the adventure's own lighting
          </button>
        ) : null}
      </fieldset>

      <fieldset>
        <legend>Players</legend>
        <label className="check">
          <input type="checkbox" checked={map.sight} onChange={(event) => onSight(event.target.checked)} />
          Line of sight (players see what their tokens see)
        </label>
        <label className="check">
          <input type="checkbox" checked={!map.locked} onChange={(event) => onLocked(!event.target.checked)} />
          Players move their tokens at will
        </label>
      </fieldset>

      <fieldset>
        <legend>Grid</legend>
        <label className="check">
          <input type="checkbox" checked={grid.show} onChange={(event) => onSettings({ grid: { show: event.target.checked } })} />
          Show the grid
        </label>
        <label>
          Opacity {Math.round((grid.alpha ?? gridDefaults.alpha) * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={grid.alpha ?? gridDefaults.alpha} onChange={(event) => onSettings({ grid: { alpha: Number(event.target.value) } })} />
        </label>
        <label>
          Colour
          <input type="color" value={(grid.color ?? gridDefaults.color).slice(0, 7)} onChange={(event) => onSettings({ grid: { color: event.target.value } })} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Weather</legend>
        <select aria-label="Weather" value={weather.type} onChange={(event) => onSettings({ weather: { type: event.target.value as WeatherType } })}>
          {WEATHER_TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <label>
          Intensity {Math.round(weather.intensity * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={weather.intensity} onChange={(event) => onSettings({ weather: { intensity: Number(event.target.value) } })} />
        </label>
        <label>
          Wind toward {Math.round(weather.direction)}°
          <input type="range" min={0} max={359} step={5} value={weather.direction} onChange={(event) => onSettings({ weather: { direction: Number(event.target.value) } })} />
        </label>
      </fieldset>
    </aside>
  );
}
