import type { BookkeepingOptions, Session } from "../session/useSession";
import { rulesetFor } from "../../shared/rulesets/registry.mjs";
import { SettingsSection, Toggle } from "../ui/SettingsParts";

// Settings > Bookkeeping (the GM's): each part of the bookkeeping switched on or off for the whole
// table, as the GM asked ("a DM option to disable so that the nice dm's can have a fun mode where
// they hand-wave off that stuff"). Only the parts this game counts are shown.
const PARTS: { key: keyof BookkeepingOptions; decl: "ammo" | "consumables" | "rations" | "light" | "encumbrance"; label: string; hint: string }[] = [
  { key: "ammo", decl: "ammo", label: "Ammunition", hint: "An attack with a bow, crossbow, sling or firearm spends its arrows, bolts, bullets or rounds; with none left it is refused. After a fight, part of it can be picked up (5E: half)." },
  { key: "consumables", decl: "consumables", label: "Consumables", hint: "Potions, scrolls, a wand's charges and a kit's uses are used up from the sheet or by dragging them onto a creature." },
  { key: "rations", decl: "rations", label: "Rations and water", hint: "Each day that ends on the calendar, and each long rest, eats a ration and drinks a day's water; going without brings the game's penalty (5E: Exhaustion)." },
  { key: "light", decl: "light", label: "Light from the pack", hint: "Lighting a torch takes one from the pack, a lantern a flask of oil; a player with none cannot light it." },
  { key: "encumbrance", decl: "encumbrance", label: "Encumbrance and bag space", hint: "The load, containers' capacity and the game's penalties (speed, checks) on the sheet and on the creature. Off: carried weight is shown, nothing is penalised." },
];

export function BookkeepingSettings({ session }: { session: Session }) {
  const decl = rulesetFor(session.ruleset ?? "").bookkeeping;
  const now: BookkeepingOptions = { ammo: true, consumables: true, rations: true, light: true, encumbrance: true, variant: false, ...(session.options.bookkeeping ?? {}) };
  const shown = PARTS.filter((part) => decl && decl[part.decl]);
  if (!decl || shown.length === 0) return null;
  const set = (patch: Partial<BookkeepingOptions>) => session.setTableOptions({ bookkeeping: { ...now, ...patch } });
  const variant = decl.encumbrance ? decl.encumbrance.variant : undefined;
  return (
    <SettingsSection title="Bookkeeping" setting="bookkeeping" note="Switch off what your table would rather hand-wave.">
      {shown.map((part) => (
        <Toggle key={part.key} label={part.label} hint={part.hint} checked={now[part.key]} onChange={(on) => set({ [part.key]: on })} setting={`bookkeeping-${part.key}`} />
      ))}
      {variant && decl.encumbrance ? (
        <Toggle label={decl.encumbrance.variantLabel ?? "Variant encumbrance"} hint="Encumbered and heavily encumbered at lower loads, with their speed and disadvantage." checked={now.variant} onChange={(on) => set({ variant: on })} setting="bookkeeping-variant" />
      ) : null}
    </SettingsSection>
  );
}
