import { useEffect } from "react";
import type { Session } from "../session/useSession";
import { OPTIONS } from "../../shared/siege/krits.mjs";
import { SettingRow, SettingsSection } from "../ui/SettingsParts";

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
    <div className="krits-window settings-window">
      <SettingsSection title="Critical hits and fumbles" note="On an attack a natural 20 is a critical hit and a natural 1 a fumble (Castle Keeper's Guide, Chapter 17). The host rolls the table and applies the result on the combat tracker.">
        {settings ? (
          (Object.entries(OPTIONS) as [keyof typeof OPTIONS, (typeof OPTIONS)[keyof typeof OPTIONS]][]).map(([key, spec]) => (
            <SettingRow key={key} label={spec.label} className="krits-row">
              <select value={settings[key] ?? spec.default} data-krit-option={key} aria-label={spec.label} title={spec.labels[spec.values.indexOf(settings[key] ?? spec.default)]} onChange={(event) => session.ct("krits", { settings: { [key]: event.target.value } })}>
                {spec.values.map((value, index) => (
                  <option key={value} value={value}>
                    {spec.labels[index]}
                  </option>
                ))}
              </select>
            </SettingRow>
          ))
        ) : (
          <p className="hint">Reading the table's settings…</p>
        )}
      </SettingsSection>
    </div>
  );
}
