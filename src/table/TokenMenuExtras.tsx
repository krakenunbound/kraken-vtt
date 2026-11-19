import { useState } from "react";
import { parseSenses } from "../../shared/map/geometry.mjs";
import type { MapToken } from "../session/useSession";

type Patch = { unidentified?: string; senses?: string; elevation?: number; noSight?: boolean; sightAngle?: number };

// A text field that sends its value on Enter or when it loses focus (never
// mid-word in a Chinese, Japanese or Korean input method).
function CommitField({ label, value, placeholder, onCommit, width = "11rem" }: { label: string; value: string; placeholder?: string; onCommit: (value: string) => void; width?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="token-menu-row">
      {label}
      <input
        type="text"
        value={shown}
        placeholder={placeholder}
        style={{ width }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) commit();
        }}
      />
    </label>
  );
}

// The token menu's own rows for the map's newer options: the name players see
// until it is known (FG's unidentified name), the token's senses, its elevation.
export function TokenMenuExtras({ token, gm, recordSenses, units, update, undo }: { token: MapToken; gm: boolean; recordSenses: string; units: string; update: (patch: Patch) => void; undo?: () => void }) {
  const line = token.senses || recordSenses;
  const senses = parseSenses(line);
  const known = Object.entries(senses).filter(([, feet]) => feet > 0);
  const names: Record<string, string> = { darkvision: "Darkvision", blindsight: "Blindsight", tremorsense: "Tremorsense", truesight: "Truesight", devilsight: "Devil's Sight" };
  return (
    <>
      {gm ? <CommitField label="Players call it" value={token.unidentified ?? ""} placeholder={token.name} onCommit={(value) => update({ unidentified: value })} /> : null}
      {gm ? <CommitField label="Senses" value={token.senses ?? ""} placeholder={recordSenses || "Darkvision 60 ft"} onCommit={(value) => update({ senses: value })} /> : null}
      {gm ? (
        // Its sight (the token vision panel): whether it shows its owner anything, and a cone on its facing.
        <label className="token-menu-row">
          <input type="checkbox" checked={!token.noSight} aria-label="Gives sight" data-field="token-sight" onChange={(event) => update({ noSight: !event.target.checked })} />
          Gives sight
        </label>
      ) : null}
      {gm && !token.noSight ? (
        <label className="token-menu-row" title="How wide it sees, centred on the way it faces (360: all round)">
          Sight angle
          <input type="number" min={10} max={360} step={15} value={token.sightAngle ?? 360} onChange={(event) => update({ sightAngle: Number(event.target.value) || 360 })} style={{ width: "4.5rem" }} aria-label="Sight angle" data-field="token-sight-angle" />
          °
        </label>
      ) : null}
      {known.length ? (
        <p className="token-menu-note" data-senses={known.map(([key, feet]) => `${key}:${feet}`).join(",")}>
          {known.map(([key, feet]) => `${names[key]} ${feet} ${units}`).join(" · ")}
        </p>
      ) : null}
      {token.undo && undo ? (
        <button type="button" role="menuitem" data-action="undo-move" title="Its last move back (Ctrl+Z)" onClick={undo}>
          Undo move
        </button>
      ) : null}
      {gm || token.mine ? (
        <label className="token-menu-row">
          Elevation
          <input type="number" step={5} value={token.elevation ?? 0} onChange={(event) => update({ elevation: Number(event.target.value) || 0 })} style={{ width: "4.5rem" }} aria-label="Elevation" />
          {units}
        </label>
      ) : null}
    </>
  );
}
