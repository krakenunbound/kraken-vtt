import type { Session } from "../session/useSession";
import { SettingRow, SettingsSection } from "../ui/SettingsParts";

// The GM's token and measuring options (FG's token options), for every seat:
// what players see of health and names on tokens, and how a diagonal counts.
// The host sends players only what these let them see (mapState.cjs publicToken).
const HEALTH = [
  ["bar", "Bar"],
  ["barhover", "Bar on hover"],
  ["dot", "Dot"],
  ["dothover", "Dot on hover"],
  ["numbers", "Numbers (the tracker's hit points; a bar on tokens)"],
  ["off", "Off"],
] as const;

export function TokenOptionsSection({ session }: { session: Session }) {
  const options = session.options as { healthNpc?: string; healthPc?: string; names?: string; diagonal?: string };
  const set = (patch: Record<string, string>) => session.setTableOptions(patch as never);
  return (
    <SettingsSection title="Tokens and measuring" setting="tokens">
      <SettingRow label="Creatures' health" hint="What players see of the health of your creatures (NPCs), on their tokens and in the combat tracker: a dot is its status words, a bar the share left, numbers its hit points. You always see it.">
        <select value={options.healthNpc ?? "dot"} onChange={(event) => set({ healthNpc: event.target.value })} aria-label="Creatures' health" data-setting="health-npc">
          {HEALTH.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Characters' health" hint="What players see of the characters' health on their tokens.">
        <select value={options.healthPc ?? "dot"} onChange={(event) => set({ healthPc: event.target.value })} aria-label="Characters' health" data-setting="health-pc">
          {HEALTH.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Token names" hint="Off: players see no names but their own. A token's unidentified name (its menu) is shown instead of its real one.">
        <select value={options.names ?? "hover"} onChange={(event) => set({ names: event.target.value })} aria-label="Token names" data-setting="token-names">
          <option value="hover">On hover</option>
          <option value="always">Always</option>
          <option value="off">Off</option>
        </select>
      </SettingRow>
      <SettingRow label="Diagonals" hint="How a diagonal square counts on the ruler and when dragging. A scene may set its own (the map's Scene settings).">
        <select value={options.diagonal ?? "1"} onChange={(event) => set({ diagonal: event.target.value })} aria-label="Diagonals" data-setting="diagonal">
          <option value="1">Every square counts one</option>
          <option value="1.5">5-10-5 (every second diagonal counts double)</option>
          <option value="raw">Straight line</option>
        </select>
      </SettingRow>
    </SettingsSection>
  );
}
