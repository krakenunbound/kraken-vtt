import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import type { Session } from "../session/useSession";
import { DESIGNS, diceStore, EFFECTS, FONTS, MATERIALS, PRESETS, SET_GROUPS, type DiceLook } from "./diceStore";

// The preview's three.js loads with the window.
const DicePreview = lazy(() => import("./DicePreview"));

const FONT_STYLE: Record<DiceLook["font"], React.CSSProperties> = {
  classic: { fontFamily: "Georgia, serif", fontWeight: 700 },
  bold: { fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif', fontWeight: 900 },
  runic: { fontFamily: "Cinzel, Georgia, serif", fontWeight: 700 },
  script: { fontFamily: '"Palatino Linotype", Palatino, serif', fontStyle: "italic", fontWeight: 700 },
  glow: { fontFamily: "Cinzel, Georgia, serif", fontWeight: 700, textShadow: "0 0 6px currentColor" },
  metal: { fontFamily: "Cinzel, Georgia, serif", fontWeight: 700, color: "#e8c46a" },
  engrave: { fontFamily: "Cinzel, Georgia, serif", fontWeight: 700, opacity: 0.8 },
};
const TRAY_DICE = [20, 12, 10, 8, 6, 4, 100];

const lookOf = ({ name: _name, ...look }: { name: string } & DiceLook): DiceLook => look;
function sameLook(a: DiceLook, b: DiceLook) {
  return (["theme", "body", "ink", "accent", "material", "effect", "font"] as const).every((key) => a[key] === b[key]) && Boolean(a.pips) === Boolean(b.pips);
}
const nameOf = (look: DiceLook) => PRESETS.find((preset) => sameLook(look, preset))?.name ?? null;

// 3D pictures of dice (the tray's renderer), drawn when the window opens.
function usePictures<T>(load: () => Promise<T>, key: string, empty: T) {
  const [pictures, setPictures] = useState<T>(empty);
  useEffect(() => {
    let live = true;
    void load()
      .then((result) => live && setPictures(result))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return pictures;
}

function Chips<T extends string>({ label, items, value, onPick, styleOf }: { label: string; items: { id: T; name: string }[]; value: T; onPick: (id: T) => void; styleOf?: (id: T) => React.CSSProperties }) {
  return (
    <div className="dice-field">
      <span className="dice-settings-head">{label}</span>
      <div className="dice-chips" role="radiogroup" aria-label={label}>
        {items.map((item) => (
          <button key={item.id} type="button" role="radio" aria-checked={value === item.id} className={value === item.id ? "dice-chip on" : "dice-chip"} data-choice={item.id} style={styleOf?.(item.id)} onClick={() => onPick(item.id)}>
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, low, high }: { label: string; value: number; onChange: (value: number) => void; low: number; high: number }) {
  const step = (by: number) => onChange(Math.min(high, Math.max(low, Math.round((value + by) * 10) / 10)));
  return (
    <span className="dice-stepper">
      <b>{label}</b>
      <button type="button" aria-label={`Smaller ${label.toLowerCase()} dice`} onClick={() => step(-0.1)} disabled={value <= low}>
        −
      </button>
      <span>{Math.round(value * 100)}%</span>
      <button type="button" aria-label={`Bigger ${label.toLowerCase()} dice`} onClick={() => step(0.1)} disabled={value >= high}>
        +
      </button>
    </span>
  );
}

// This seat's dice, laid out as FG's Dice window: the active set (live, with
// its colours), the dice as they show in the tray with the Tray and Roll
// sizes, every set to choose from, and the parts to make a set of your own.
// Everyone at the table sees your dice as you set them here.
export function DiceWindow({ session }: { session: Session }) {
  const settings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  const look = settings.look;
  const setLook = (patch: Partial<DiceLook>) => diceStore.update({ look: patch });
  const [group, setGroup] = useState(SET_GROUPS.find((item) => item.sets.includes(nameOf(look) ?? ""))?.name ?? "All");
  const tray = usePictures(() => import("./trayArt").then(({ renderTray }) => renderTray(look)), JSON.stringify(look), {} as Record<number, string>);
  const sets = usePictures(() => import("./trayArt").then(({ renderSets }) => renderSets(PRESETS.map(lookOf))), "sets", [] as string[]);
  const name = nameOf(look);
  const shown = PRESETS.map((preset, index) => ({ preset, picture: sets[index] })).filter(({ preset }) => group === "All" || SET_GROUPS.find((item) => item.name === group)?.sets.includes(preset.name));

  return (
    <div className="dice-window">
      <section className="dice-panel active-set">
        <h3>Active dice set</h3>
        <div className="active-body">
          <Suspense fallback={<div className="dice-preview" />}>
            <DicePreview look={look} />
          </Suspense>
          <div className="active-words">
            <strong data-active-set={name ?? "custom"}>{name ?? "Your own set"}</strong>
            <span>
              {DESIGNS.find((item) => item.id === look.theme)?.name} · {MATERIALS.find((item) => item.id === look.material)?.name}
              {look.effect !== "none" ? ` · ${EFFECTS.find((item) => item.id === look.effect)?.name}` : ""}
            </span>
            <div className="dice-colors">
              <label>
                <input type="color" value={look.body.slice(0, 7)} onChange={(event) => setLook({ body: event.target.value })} />
                Dice
              </label>
              <label>
                <input type="color" value={(look.accent ?? "#d8b46a").slice(0, 7)} onChange={(event) => setLook({ accent: event.target.value })} />
                Accent
              </label>
              <label>
                <input type="color" value={look.ink.slice(0, 7)} onChange={(event) => setLook({ ink: event.target.value })} />
                Numbers
              </label>
            </div>
            <p className="hint">Everyone at the table sees your dice like this.</p>
          </div>
        </div>
      </section>

      <section className="dice-panel">
        <h3>Dice display</h3>
        <div className="dice-display" style={{ ["--tray-glow" as string]: look.accent ?? look.body }}>
          {TRAY_DICE.map((sides) => (
            <span key={sides} className="dice-display-die" title={sides === 100 ? "d100" : `d${sides}`}>
              {tray[sides] ? <img src={tray[sides]} alt={`d${sides}`} draggable={false} /> : null}
            </span>
          ))}
        </div>
        <div className="dice-sizes">
          <Stepper label="Tray" value={settings.tray ?? 1} low={0.6} high={1.6} onChange={(tray) => diceStore.update({ tray })} />
          <Stepper label="Roll" value={settings.roll ?? 1} low={0.5} high={2.5} onChange={(roll) => diceStore.update({ roll })} />
        </div>
      </section>

      <section className="dice-panel">
        <h3>Dice sets</h3>
        <div className="dice-groups" role="tablist" aria-label="Groups">
          {["All", ...SET_GROUPS.map((item) => item.name)].map((item) => (
            <button key={item} type="button" role="tab" aria-selected={group === item} className={group === item ? "dice-chip on" : "dice-chip"} onClick={() => setGroup(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="dice-sets">
          {shown.map(({ preset, picture }) => (
            <button
              key={preset.name}
              type="button"
              className={sameLook(look, preset) ? "dice-set on" : "dice-set"}
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={sameLook(look, preset)}
              data-preset={preset.name}
              style={{ ["--set-glow" as string]: preset.effect === "none" ? preset.accent : preset.effect === "fire" ? "#ff8a2a" : preset.effect === "frost" ? "#bfe8ff" : preset.effect === "shadow" ? "#7a3cff" : preset.accent }}
              onClick={() => setLook(lookOf(preset))}
            >
              {picture ? <img src={picture} alt="" draggable={false} /> : <span className="dice-set-blank" style={{ background: preset.body, color: preset.ink, ...FONT_STYLE[preset.font] }}>20</span>}
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="dice-panel">
        <h3>Make your own</h3>
        <Chips label="Design" items={DESIGNS} value={look.theme} onPick={(theme) => setLook({ theme })} />
        <Chips label="Made of" items={MATERIALS} value={look.material} onPick={(material) => setLook({ material })} />
        <Chips label="Numbers" items={FONTS} value={look.font} onPick={(font) => setLook({ font })} styleOf={(font) => FONT_STYLE[font]} />
        <Chips label="Effect" items={EFFECTS} value={look.effect} onPick={(effect) => setLook({ effect })} />
        <label className="check">
          <input type="checkbox" checked={look.crit !== false} onChange={(event) => setLook({ crit: event.target.checked })} />
          A natural 20 flares gold, a 1 red
        </label>
        <label className="check">
          <input type="checkbox" checked={Boolean(look.pips)} onChange={(event) => setLook({ pips: event.target.checked })} data-dice="pips" />
          Pips on the d6
        </label>
      </section>

      <section className="dice-panel">
        <h3>On this screen</h3>
        <label className="check">
          <input type="checkbox" checked={settings.show} onChange={(event) => diceStore.update({ show: event.target.checked })} />
          3D dice roll across the table
        </label>
        <div className="dice-sound">
          <label className="check">
            <input type="checkbox" checked={settings.sound} onChange={(event) => diceStore.update({ sound: event.target.checked })} />
            Dice sounds
          </label>
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} disabled={!settings.sound} aria-label="Dice volume" onChange={(event) => diceStore.update({ volume: Number(event.target.value) })} />
        </div>
        {session.role === "dm" ? (
          <label className="check gm-option">
            <input type="checkbox" checked={session.options.towerReveal} onChange={(event) => session.setTableOptions({ towerReveal: event.target.checked })} />
            Let players see their own dice-tower rolls (unticked: only the GM sees them, as in FG)
          </label>
        ) : null}
      </section>
    </div>
  );
}
