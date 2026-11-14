// The pieces every settings panel is made of, so each one (the Settings
// window, each ruleset's character wizard options, the Death Markers window)
// reads the same: a titled section; a row with a short label, a quieter line
// under it saying what it does, and the control on the right; a list of
// choices to tick. The data-setting names are what the tests and the agent's
// tools use: they stay on the inputs.
import { useId, type ReactNode } from "react";

// A titled group of settings (a fieldset, so a screen reader names the group).
export function SettingsSection({ title, children, setting, note }: { title: string; children: ReactNode; setting?: string; note?: ReactNode }) {
  return (
    <fieldset className="set-section" data-setting={setting}>
      <legend>{title}</legend>
      {note ? <p className="set-note">{note}</p> : null}
      {children}
    </fieldset>
  );
}

// On or off: a switch at the right of its label. The hint, under the label,
// is the switch's description for a screen reader too.
export function Toggle({ label, hint, checked, onChange, setting, attrs, className = "" }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (on: boolean) => void; setting?: string; attrs?: Record<string, string>; className?: string }) {
  const id = useId();
  return (
    <label className={`set-row ${className}`.trim()}>
      <span className="set-text">
        <span className="set-label">{label}</span>
        {hint ? (
          <span className="set-hint" id={`${id}-hint`}>
            {hint}
          </span>
        ) : null}
      </span>
      {/* The switch attribute where a browser has it; role="switch" and our own styling everywhere else. */}
      <input type="checkbox" className="set-switch" role="switch" {...({ switch: "" } as object)} {...attrs} data-setting={setting} checked={checked} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

// A row whose control is something else (a select, a slider): the label and
// hint on the left, the control on the right.
export function SettingRow({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`set-row ${className}`.trim()}>
      <span className="set-text">
        <span className="set-label">{label}</span>
        {hint ? <span className="set-hint">{hint}</span> : null}
      </span>
      <span className="set-control">{children}</span>
    </div>
  );
}

// Several choices, each ticked or not (the ability methods players may use):
// a heading, then the boxes in as many columns as the window has room for.
export function Checklist({ label, hint, items }: { label: ReactNode; hint?: ReactNode; items: { key: string | number; label: ReactNode; detail?: ReactNode; checked: boolean; onChange: (on: boolean) => void; setting?: string }[] }) {
  return (
    <div className="set-checklist">
      <span className="set-text">
        <span className="set-label">{label}</span>
        {hint ? <span className="set-hint">{hint}</span> : null}
      </span>
      <div className="set-checks">
        {items.map((item) => (
          <label key={item.key} className="set-check">
            <input type="checkbox" data-setting={item.setting} checked={item.checked} onChange={(event) => item.onChange(event.target.checked)} />
            <span>
              {item.label}
              {item.detail ? <small>{item.detail}</small> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
