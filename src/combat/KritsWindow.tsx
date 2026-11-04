import { useEffect } from "react";
import type { Session } from "../session/useSession";
import { OPTIONS } from "../../shared/siege/krits.mjs";

// Critical hits and fumbles, as FG's Options > Kraken Krits & Fumbles (the
// GM's extension, built into SiegeCore): the Castle Keeper's Guide option
// used on a natural 20 and a natural 1, and how its results are applied.
export function KritsWindow({ session }: { session: Session }) {
  useEffect(() => {
    session.ct("krits");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settings = session.krits;
  return (
    <div className="krits-window">
      <p className="hint">On an attack, a natural 20 is a critical hit and a natural 1 a fumble (Castle Keeper's Guide, Chapter 17). The host rolls the table and applies the result on the combat tracker.</p>
      {settings
        ? (Object.entries(OPTIONS) as [keyof typeof OPTIONS, (typeof OPTIONS)[keyof typeof OPTIONS]][]).map(([key, spec]) => (
            <label key={key} className="krits-row">
              <span>{spec.label}</span>
              <select value={settings[key] ?? spec.default} data-krit-option={key} onChange={(event) => session.ct("krits", { settings: { [key]: event.target.value } })}>
                {spec.values.map((value, index) => (
                  <option key={value} value={value}>
                    {spec.labels[index]}
                  </option>
                ))}
              </select>
            </label>
          ))
        : <p className="hint">Reading the table's settings…</p>}
    </div>
  );
}
