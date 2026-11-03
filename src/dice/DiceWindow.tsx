import { lazy, Suspense, useSyncExternalStore } from "react";
import type { Session } from "../session/useSession";
import { DESIGNS, diceStore, EFFECTS, FONTS, MATERIALS, PRESETS, type DiceLook } from "./diceStore";

// The preview's three.js loads with the window.
const DicePreview = lazy(() => import("./DicePreview"));

const FONT_STYLE: Record<DiceLook["font"], React.CSSProperties> = {
  classic: { fontFamily: "Georgia, serif", fontWeight: 700 },
  bold: { fontFamily: '"Arial Black", "Segoe UI Black", Impact, sans-serif', fontWeight: 900 },
  runic: { fontFamily: "Cinzel, Georgia, serif", fontWeight: 700 },
  script: { fontFamily: '"Palatino Linotype", Palatino, serif', fontStyle: "italic", fontWeight: 700 },
};

function sameLook(a: DiceLook, b: DiceLook) {
  return a.theme === b.theme && a.body === b.body && a.ink === b.ink && a.accent === b.accent && a.material === b.material && a.effect === b.effect && a.font === b.font;
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

// This seat's dice, as FG's dice skins and more: a ready-made set, or the
// body, accent and number colours, a design, what they are made of, the
// lettering and an effect as they roll, with a live preview. Everyone at the
// table sees your dice as you set them here.
export function DiceWindow({ session }: { session: Session }) {
  const settings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  const look = settings.look;
  const setLook = (patch: Partial<DiceLook>) => diceStore.update({ look: patch });
  return (
    <div className="dice-window">
      <div className="dice-window-preview">
        <Suspense fallback={<div className="dice-preview" />}>
          <DicePreview look={look} />
        </Suspense>
        <p className="hint">Everyone at the table sees your dice like this.</p>
      </div>
      <div className="dice-window-controls">
        <div className="dice-field">
          <span className="dice-settings-head">Sets</span>
          <div className="dice-swatches">
            {PRESETS.map(({ name, ...preset }) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={sameLook(look, preset)}
                data-preset={name}
                style={{ background: `linear-gradient(135deg, ${preset.body} 55%, ${preset.accent} 140%)`, color: preset.ink, ...FONT_STYLE[preset.font] }}
                onClick={() => setLook(preset)}
              >
                20
              </button>
            ))}
          </div>
        </div>
        <div className="dice-colors">
          <label>
            Dice
            <input type="color" value={look.body.slice(0, 7)} onChange={(event) => setLook({ body: event.target.value })} />
          </label>
          <label>
            Accent
            <input type="color" value={(look.accent ?? "#d8b46a").slice(0, 7)} onChange={(event) => setLook({ accent: event.target.value })} />
          </label>
          <label>
            Numbers
            <input type="color" value={look.ink.slice(0, 7)} onChange={(event) => setLook({ ink: event.target.value })} />
          </label>
        </div>
        <Chips label="Design" items={DESIGNS} value={look.theme} onPick={(theme) => setLook({ theme })} />
        <Chips label="Made of" items={MATERIALS} value={look.material} onPick={(material) => setLook({ material })} />
        <Chips label="Numbers" items={FONTS} value={look.font} onPick={(font) => setLook({ font })} styleOf={(font) => FONT_STYLE[font]} />
        <Chips label="Effect" items={EFFECTS} value={look.effect} onPick={(effect) => setLook({ effect })} />
        <label className="check">
          <input type="checkbox" checked={look.crit !== false} onChange={(event) => setLook({ crit: event.target.checked })} />
          A natural 20 flares gold, a 1 red
        </label>
        <div className="dice-field table-part">
          <span className="dice-settings-head">On this screen</span>
          <label className="check">
            <input type="checkbox" checked={settings.show} onChange={(event) => diceStore.update({ show: event.target.checked })} />
            3D dice roll across the table
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.sound} onChange={(event) => diceStore.update({ sound: event.target.checked })} />
            Dice sounds
          </label>
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} disabled={!settings.sound} aria-label="Dice volume" onChange={(event) => diceStore.update({ volume: Number(event.target.value) })} />
        </div>
        {session.role === "dm" ? (
          <label className="check gm-option">
            <input type="checkbox" checked={session.options.towerReveal} onChange={(event) => session.setTableOptions({ towerReveal: event.target.checked })} />
            Dice tower: players see their own result
          </label>
        ) : null}
      </div>
    </div>
  );
}
