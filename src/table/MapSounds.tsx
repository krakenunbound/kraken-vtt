import { useEffect, useState } from "react";
import type { MapSound, SoundItem, SoundLibrary } from "../session/useSession";
import { Icon } from "../ui/icons";

type Point = { x: number; y: number };

// The GM's sounds placed on the map (Scene settings): a library sound looping
// at a point, heard by each player whose token is within its radius, louder
// nearer, muffled through walls that stop sound (each player's browser plays it).
export function MapSoundsPanel({ sounds, units, list, act, viewCenter }: { sounds: MapSound[]; units: string; list?: () => Promise<SoundLibrary>; act?: (action: string, payload?: Record<string, unknown>) => void; viewCenter: () => Point | null }) {
  const [library, setLibrary] = useState<SoundItem[]>([]);
  const [pick, setPick] = useState("");
  useEffect(() => {
    let live = true;
    list?.()
      .then((found) => {
        if (!live) return;
        const loops = found.sounds.filter((item) => item.kind === "ambience" || item.kind === "sfx");
        setLibrary(loops);
        setPick((current) => current || loops[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [list]);
  if (!act) return null;
  return (
    <fieldset className="map-sounds">
      <legend>Sounds on this map</legend>
      <p className="hint">A sound loops where you put it; players hear it near their tokens, muffled through walls. You hear it in the player vision preview.</p>
      <div className="map-sound-add">
        <select aria-label="Sound to place" value={pick} onChange={(event) => setPick(event.target.value)} data-setting="map-sound-pick">
          {library.map((item) => (
            <option key={item.id} value={item.id}>
              {item.group ? `${item.group} · ` : ""}
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="tool"
          data-action="map-sound-add"
          aria-label="Place it in the middle of the view"
          title="Place it in the middle of the view"
          disabled={!pick}
          onClick={() => {
            const at = viewCenter();
            if (at && pick) act("add", { sound: { sound: pick, x: at.x, y: at.y, name: library.find((item) => item.id === pick)?.name } });
          }}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      {sounds.map((placed) => (
        <div key={placed.id} className="map-sound-row" data-map-sound={placed.id}>
          <span className="map-sound-name" title={placed.sound}>
            {placed.name}
          </span>
          <label>
            <input type="number" min={5} step={5} value={placed.radius} aria-label={`${placed.name}: how far it carries`} onChange={(event) => act("update", { id: placed.id, patch: { radius: Number(event.target.value) } })} style={{ width: "4rem" }} /> {units}
          </label>
          <input type="range" min={0} max={1} step={0.05} value={placed.volume} aria-label={`${placed.name}: volume`} onChange={(event) => act("update", { id: placed.id, patch: { volume: Number(event.target.value) } })} />
          <button type="button" className={placed.on ? "tool on" : "tool"} aria-pressed={placed.on} aria-label={placed.on ? "Playing: switch it off" : "Off: switch it on"} title={placed.on ? "Playing: switch it off" : "Off: switch it on"} onClick={() => act("update", { id: placed.id, patch: { on: !placed.on } })}>
            <Icon name="sound" size={16} />
          </button>
          <button
            type="button"
            className="tool"
            aria-label="Move it to the middle of the view"
            title="Move it to the middle of the view"
            onClick={() => {
              const at = viewCenter();
              if (at) act("update", { id: placed.id, patch: { x: at.x, y: at.y } });
            }}
          >
            <Icon name="locate" size={16} />
          </button>
          <button type="button" className="tool" aria-label={`Remove ${placed.name}`} title="Remove it" onClick={() => act("remove", { id: placed.id })}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
    </fieldset>
  );
}

// Where the GM's placed sounds are, and how far they carry (a faint ring).
export function MapSoundMarkers({ sounds, perFoot, width, height, scale }: { sounds: MapSound[] | undefined; perFoot: number; width: number; height: number; scale: number }) {
  if (!sounds?.length) return null;
  return (
    <svg className="overlay map-sound-markers" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {sounds.map((placed) => (
        <g key={placed.id} data-map-sound-marker={placed.id} opacity={placed.on ? 1 : 0.45}>
          <circle cx={placed.x} cy={placed.y} r={placed.radius * perFoot} fill="#5ac8ff" fillOpacity={0.05} stroke="#5ac8ff" strokeOpacity={0.6} strokeWidth={1.5 / scale} strokeDasharray={`${6 / scale} ${6 / scale}`} />
          <circle cx={placed.x} cy={placed.y} r={9 / scale} fill="#0d2233" stroke="#5ac8ff" strokeWidth={2 / scale} />
          <text x={placed.x} y={placed.y + 4 / scale} textAnchor="middle" fontSize={11 / scale} fill="#bfe3ff">
            ♪
          </text>
          <text x={placed.x} y={placed.y + 24 / scale} textAnchor="middle" fontSize={11 / scale} fill="#fff" stroke="#000" strokeWidth={3 / scale} paintOrder="stroke">
            {placed.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
