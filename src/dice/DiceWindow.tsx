import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import type { Session } from "../session/useSession";
import { dicePacks } from "./dicePacks";
import { characterDice, DESIGNS, diceStore, EFFECTS, FONTS, MATERIALS, PRESETS, SET_GROUPS, type DiceLook, type DiceSet } from "./diceStore";

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

// A preset is the whole look: pips only where it has them (not left over from the set before).
// (and its picture only where it has one).
const lookOf = ({ name: _name, ...look }: { name: string } & DiceLook): DiceLook => ({ ...look, pips: Boolean(look.pips), texture: look.texture, glowTexture: look.glowTexture });
function sameLook(a: DiceLook, b: DiceLook) {
  return (["theme", "body", "ink", "accent", "material", "effect", "font", "texture", "glowTexture"] as const).every((key) => a[key] === b[key]) && Boolean(a.pips) === Boolean(b.pips);
}
// Kraken's sets, then each dice pack's (a group of its own).
type Shown = { name: string } & DiceLook;
const nameIn = (all: Shown[], look: DiceLook) => all.find((preset) => sameLook(look, preset))?.name ?? null;

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
// Two tiers: your own (the user tier: your dice and your colour, kept for you
// by the GM's app under your name) and each of your characters' (kept on the
// character: every roll made as that character uses them).
const PALETTE = ["#e8c46a", "#ff5a5a", "#ff9f43", "#ffe066", "#6ee7a0", "#4fd6d0", "#5aa9ff", "#a78bfa", "#ff7ad9", "#f4f1ea"];
export function DiceWindow({ session }: { session: Session }) {
  const settings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  // Whose dice: "" mine, else one of my characters (its record id).
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const characters = session.role === "dm" ? [] : Object.values(session.records).filter((record) => record.type === "character" && record.owner === me).sort((a, b) => a.name.localeCompare(b.name));
  const [whose, setWhose] = useState("");
  const character = whose ? (characters.find((record) => record.id === whose) ?? null) : null;
  const theirs = characterDice(character);
  // FG's dice sets: my dice; the GM's NPC dice; damage dice. A set left "as my dice" follows mine.
  const [chosen, setEditing] = useState<DiceSet>("look");
  const editing: DiceSet = character && chosen === "npc" ? "look" : chosen;
  const charSet = editing === "damage" ? "damage" : "look";
  const mineFor = editing === "damage" ? (settings.damage ?? settings.look) : settings.look;
  const own = character ? (charSet === "look" ? (theirs?.look ?? null) : (theirs?.damage ?? null)) : editing === "look" ? null : settings[editing];
  const look = own ?? (character ? (charSet === "damage" ? (theirs?.look ?? mineFor) : mineFor) : settings.look);
  const saveCharacter = (dice: Record<string, unknown>) => {
    if (character) void session.op({ op: "update", id: character.id, patch: { data: { dice } } }).catch(() => undefined);
  };
  const setLook = (patch: Partial<DiceLook>) => (character ? saveCharacter({ [charSet]: { ...look, ...patch } }) : diceStore.update({ [editing]: patch }));
  const following = character ? own === null : editing !== "look" && own === null;
  const followLabel = character ? `${character.name} uses ${charSet === "damage" ? "my damage dice" : "my dice"}` : editing === "npc" ? "NPC dice are my dice" : "Damage dice are my dice";
  const setFollowing = (on: boolean) => (character ? saveCharacter({ [charSet]: on ? null : { ...look } }) : diceStore.update({ [editing]: on ? null : { ...settings.look } }));
  const packs = useSyncExternalStore(dicePacks.subscribe, dicePacks.list);
  const all: Shown[] = [...PRESETS, ...packs.flatMap((pack) => pack.sets)];
  // Each set's group: Kraken's by name, a pack's by the pack (two packs may share a set's name).
  const groupOf = [...PRESETS.map((preset) => SET_GROUPS.find((item) => item.sets.includes(preset.name))?.name ?? ""), ...packs.flatMap((pack) => pack.sets.map(() => pack.name))];
  const groups = [...SET_GROUPS, ...packs.map((pack) => ({ name: pack.name, sets: pack.sets.map((set) => set.name), pack: pack.id }))];
  const nameOf = (shown: DiceLook) => nameIn(all, shown);
  const [group, setGroup] = useState(groups.find((item) => item.sets.includes(nameOf(look) ?? ""))?.name ?? "All");
  const tray = usePictures(() => import("./trayArt").then(({ renderTray }) => renderTray(look)), JSON.stringify(look), {} as Record<number, string>);
  const sets = usePictures(() => import("./trayArt").then(({ renderSets }) => renderSets(all.map(lookOf))), `sets|${packs.map((pack) => `${pack.id}:${pack.sets.length}`).join(",")}`, [] as string[]);
  const name = nameOf(look);
  const shown = all.map((preset, index) => ({ preset, picture: sets[index], index })).filter(({ index }) => group === "All" || groupOf[index] === group);

  return (
    <div className="dice-window">
      {characters.length > 0 ? (
        <div className="dice-groups dice-whose" role="tablist" aria-label="Whose dice">
          {[{ id: "", name: "Mine", tip: "Your own dice: every roll you make as yourself, and your characters' until they have their own" }, ...characters.map((record) => ({ id: record.id, name: record.name, tip: `${record.name}'s dice: every roll made as ${record.name}` }))].map((item) => (
            <button key={item.id || "mine"} type="button" role="tab" aria-selected={whose === item.id} className={whose === item.id ? "dice-chip on" : "dice-chip"} title={item.tip} data-dice-whose={item.id || "mine"} onClick={() => setWhose(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="dice-groups dice-which" role="tablist" aria-label="Which dice">
        {(
          [
            ["look", "My dice", "Your rolls"],
            ...(session.role === "dm" && !character ? ([["npc", "NPC dice", "Your rolls for the creatures: their attacks, saves and checks from the tracker"]] as const) : []),
            ["damage", "Damage dice", "Every damage roll you make"],
          ] as const
        ).map(([id, label, tip]) => (
          <button key={id} type="button" role="tab" aria-selected={editing === id} className={editing === id ? "dice-chip on" : "dice-chip"} title={tip} data-dice-set={id} onClick={() => setEditing(id)}>
            {label}
          </button>
        ))}
      </div>
      {editing !== "look" || character ? (
        <label className="check dice-follow">
          <input type="checkbox" checked={following} data-dice-follow onChange={(event) => setFollowing(event.target.checked)} />
          {followLabel} (untick to give them their own set)
        </label>
      ) : null}
      <section className="dice-panel active-set" data-editing={editing}>
        <h3>{character ? `${character.name}'s ${charSet === "damage" ? "damage dice" : "dice"}` : editing === "npc" ? "NPC dice" : editing === "damage" ? "Damage dice" : "Active dice set"}</h3>
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
            <p className="hint">{character ? `Every roll made as ${character.name} uses these; they stay with ${character.name}.` : editing === "npc" ? "The table sees the creatures' rolls in these." : editing === "damage" ? "The table sees your damage rolls in these." : "Everyone at the table sees your dice like this."}</p>
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
        <h3>
          Dice sets
          {session.role === "dm" && window.kraken?.openKrakenFolder ? (
            <button type="button" className="ghost dice-packs-folder" data-action="dice-packs-folder" title="Dice packs: a folder (or .zip) with dice.json and its pictures, dropped here, adds its sets for everyone at the table. The README there says how to make one." onClick={() => void window.kraken?.openKrakenFolder?.("dice")}>
              Dice packs folder
            </button>
          ) : null}
        </h3>
        <div className="dice-groups" role="tablist" aria-label="Groups">
          {["All", ...groups.map((item) => item.name)].map((item) => (
            <button key={item} type="button" role="tab" aria-selected={group === item} className={group === item ? "dice-chip on" : "dice-chip"} onClick={() => setGroup(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="dice-sets">
          {shown.map(({ preset, picture, index }) => (
            <button
              key={`${index}-${preset.name}`}
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
          A natural 20 flares gold to a fanfare, a 1 red to a sad trombone (with dice sound on)
        </label>
        <label className="check">
          <input type="checkbox" checked={Boolean(look.pips)} onChange={(event) => setLook({ pips: event.target.checked })} data-dice="pips" />
          Pips on the d6
        </label>
      </section>

      <section className="dice-panel your-colour">
        <h3>Your colour</h3>
        <p className="hint">Your pings and your ink on the map, for everyone at the table. Kept with your name.</p>
        <div className="dice-colors" role="radiogroup" aria-label="Your colour">
          <button type="button" role="radio" aria-checked={settings.color === null} className={settings.color === null ? "swatch mine on" : "swatch mine"} title="The table's colour for your name" data-ping-color="default" onClick={() => diceStore.update({ color: null })}>
            Auto
          </button>
          {PALETTE.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={settings.color === color} aria-label={`Colour ${color}`} className={settings.color === color ? "swatch on" : "swatch"} style={{ background: color }} data-ping-color={color} onClick={() => diceStore.update({ color })} />
          ))}
          <label>
            <input type="color" aria-label="Pick your colour" value={settings.color ?? "#e8c46a"} onChange={(event) => diceStore.update({ color: event.target.value })} />
            Other
          </label>
        </div>
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
