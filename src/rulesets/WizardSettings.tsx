import type { Session } from "../session/useSession";
import { Checklist, SettingRow, SettingsSection, Toggle } from "../ui/SettingsParts";

// Settings rows a ruleset adds to the Settings window (its manifest's
// settings: { component }), each only in its own game.

// The D&D 3.5E character wizard's options, as the GM's FG extension has them
// (CW35M1-4, CW35RL, CW35LOW, CW35VOTK): for every player who makes a character.
const WIZARD35_METHODS: [number, string, string][] = [
  [1, "PHB default", "4d6 drop lowest, arrange"],
  [2, "Classic", "3d6 in order"],
  [3, "Standard array", "15, 14, 13, 12, 10, 8"],
  [4, "Manual entry", "Type the scores"],
];
export function Wizard35Setting({ session }: { session: Session }) {
  const options = session.options.wizard35 ?? { methods: [1, 2, 3, 4], rollLock: false, lowReroll: false, vault: false };
  const set = (patch: Partial<typeof options>) => session.setTableOptions({ wizard35: { ...options, ...patch } });
  return (
    <SettingsSection title="D&D 3.5E character wizard" setting="wizard35" note="For every player who makes a character.">
      <Checklist
        label="Ability methods players may use"
        items={WIZARD35_METHODS.map(([id, label, detail]) => ({
          key: id,
          label,
          detail,
          setting: `wizard35-method-${id}`,
          checked: options.methods.includes(id),
          onChange: (on: boolean) => set({ methods: on ? [...options.methods, id].sort() : options.methods.filter((item) => item !== id) }),
        }))}
      />
      <Toggle label="Lock ability scores" hint="After the first roll; no rolling again." setting="wizard35-roll-lock" checked={options.rollLock} onChange={(on) => set({ rollLock: on })} />
      <Toggle label="Reroll a low score" hint="House rule: a 4d6 score under 8 may be rerolled once with 3d6, and the new result stands." setting="wizard35-low-reroll" checked={options.lowReroll} onChange={(on) => set({ lowReroll: on })} />
      <Toggle label="Vault of the Kraken hand-me-downs" hint="Its poor or secondhand gear is free in the wizard's shop." setting="wizard35-vault" checked={options.vault} onChange={(on) => set({ vault: on })} />
    </SettingsSection>
  );
}

// The AD&D 2E character wizard's options, as the FG extension's (Options >
// Kraken Character Wizard): ability rolls once only, the PHB methods players
// may pick from, starting gold above 1st level.
const METHOD_NAMES: [string, string][] = [
  ["Method I", "3d6, in order"],
  ["Method II", "3d6 twice each, keep the higher"],
  ["Method III", "3d6 six times, arrange"],
  ["Method IV", "3d6 twelve times, keep the best 6"],
  ["Method V", "4d6, drop the lowest"],
  ["Method VI", "All 8s, then place 7d6"],
];
export function Wizard2eSetting({ session }: { session: Session }) {
  const options = session.options.wizard2e ?? { rollLock: false, methods: [1, 2, 3, 4, 5, 6], gold: "phb" as const };
  const set = (patch: Partial<typeof options>) => session.setTableOptions({ wizard2e: { ...options, ...patch } });
  return (
    <SettingsSection title="AD&D 2E character wizard" setting="wizard2e" note="For every player who makes a character.">
      <Checklist
        label="Ability methods players may use"
        hint="From the Player's Handbook."
        items={METHOD_NAMES.map(([label, detail], index) => ({
          key: label,
          label,
          detail,
          setting: `wizard2e-method${index + 1}`,
          checked: options.methods.includes(index + 1),
          onChange: (on: boolean) => set({ methods: on ? [...options.methods, index + 1].sort() : options.methods.filter((n) => n !== index + 1) }),
        }))}
      />
      <Toggle label="Lock ability rolls" hint="One roll only; no rolling again." setting="wizard2e-lock" checked={options.rollLock} onChange={(on) => set({ rollLock: on })} />
      <SettingRow label="Starting gold above 1st level" hint="For a character who starts at a higher level.">
        <select value={options.gold} aria-label="Starting gold above 1st level" data-setting="wizard2e-gold" onChange={(event) => set({ gold: event.target.value as typeof options.gold })}>
          <option value="phb">PHB (one roll)</option>
          <option value="perlevel">One roll per level</option>
          <option value="xlevel">Roll x level</option>
        </select>
      </SettingRow>
    </SettingsSection>
  );
}
