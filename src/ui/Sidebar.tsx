import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { agentCommands } from "./agentCommands";
import type { WindowKind } from "./Windows";

// FG's sidebar (CoreRPG's desktop dock): a row of tools at the top, then the
// categories (Library, Player, Campaign, Character), each a header that folds
// its buttons away; a button opens its window (a list opens on its own, as
// FG's master index for that record type). The arrow at the bottom collapses
// it to icons only, the categories cut to four letters, and opens it again
// (FG has a third, thinner strip; too close to icons only to be worth it).
// The state and the folded categories are kept on this screen.

export type SidebarEntry = {
  kind: WindowKind;
  label: string;
  icon: string;
  title: string;
  payload?: string;
  // Opens with a click, never closes (Character Selection).
  openOnly?: boolean;
  badge?: number;
  // The data-launch name tests and tools use (kind, or kind:payload).
  launch?: string;
};
export type SidebarGroup = { id: string; label: string; entries: SidebarEntry[] };
export type SidebarState = 0 | 1;

export const entryId = (entry: SidebarEntry) => entry.launch ?? (entry.payload ? `${entry.kind}:${entry.payload}` : entry.kind);

const STORE = "kraken-sidebar";
type Saved = { state: SidebarState; closed: string[] };
function read(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Saved>;
    const state: SidebarState = saved.state === 1 || (saved.state as number) === 2 ? 1 : 0;
    return { state, closed: Array.isArray(saved.closed) ? saved.closed.filter((item) => typeof item === "string") : [] };
  } catch {
    return { state: 0, closed: [] };
  }
}

export function Sidebar({
  tools,
  groups,
  isOpen,
  onLaunch,
}: {
  tools: SidebarEntry[];
  groups: SidebarGroup[];
  isOpen: (entry: SidebarEntry) => boolean;
  onLaunch: (entry: SidebarEntry) => void;
}) {
  const [saved, setSaved] = useState<Saved>(read);
  const save = (next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* kept for this visit only */
    }
  };
  const { state, closed } = saved;
  const name = (label: string) => (state === 1 ? label.slice(0, 4) : label);
  // The agent's handle on it (kraken_sidebar): the state, a category folded, a button pressed.
  const live = useRef({ saved, groups, tools, onLaunch, isOpen });
  live.current = { saved, groups, tools, onLaunch, isOpen };
  useEffect(
    () =>
      agentCommands.register("sidebar", (command) => {
        if (command.kind !== "sidebar") return null;
        const { saved: now, groups: all, tools: top, onLaunch: launch, isOpen: open } = live.current;
        const view = () => ({
          state: now.state,
          states: ["icons and names", "icons"],
          tools: top.map((entry) => ({ id: entryId(entry), label: entry.label, open: open(entry) })),
          groups: all.map((group) => ({ id: group.id, label: group.label, folded: now.closed.includes(group.id), entries: group.entries.map((entry) => ({ id: entryId(entry), label: entry.label, open: open(entry) })) })),
        });
        if (command.action === "list") return view();
        if (command.action === "state") {
          const next = Number(command.state);
          if (next !== 0 && next !== 1) throw new Error("state: 0 (icons and names) or 1 (icons only).");
          save({ ...now, state: next as SidebarState });
          return { state: next };
        }
        if (command.action === "fold") {
          const group = all.find((item) => item.id === command.group || item.label.toLowerCase() === String(command.group ?? "").toLowerCase());
          if (!group) throw new Error(`No category "${command.group ?? ""}". Categories: ${all.map((item) => item.label).join(", ")}.`);
          const fold = command.folded ?? !now.closed.includes(group.id);
          save({ ...now, closed: fold ? [...new Set([...now.closed, group.id])] : now.closed.filter((id) => id !== group.id) });
          return { group: group.label, folded: fold };
        }
        if (command.action === "press") {
          const wanted = String(command.entry ?? "").toLowerCase();
          const entries = [...top, ...all.flatMap((group) => group.entries)];
          const entry = entries.find((item) => entryId(item).toLowerCase() === wanted) ?? entries.find((item) => item.label.toLowerCase() === wanted);
          if (!entry) throw new Error(`No sidebar button "${command.entry ?? ""}". Buttons: ${entries.map((item) => item.label).join(", ")}.`);
          launch(entry);
          return { pressed: entryId(entry) };
        }
        throw new Error("What should the sidebar do? list, state, fold or press.");
      }),
    [],
  );
  const button = (entry: SidebarEntry, tool = false) => (
    <button
      key={entryId(entry)}
      type="button"
      className={`${tool ? "sidebar-tool" : "sidebar-entry"} launcher${isOpen(entry) ? " open" : ""}`}
      data-launch={entryId(entry)}
      title={entry.title}
      onClick={() => onLaunch(entry)}
    >
      <span className="sidebar-icon">
        <Icon name={entry.icon} size={tool ? 18 : 20} />
      </span>
      {tool ? null : <span className="sidebar-label">{entry.label}</span>}
      {entry.badge ? <i className="launcher-badge">{entry.badge}</i> : null}
    </button>
  );
  return (
    <nav className={`sidebar sidebar-state-${state}`} aria-label="Sidebar" data-sidebar-state={state}>
      <div className="sidebar-tools">{tools.map((entry) => button(entry, true))}</div>
      <div className="sidebar-scroll">
        {groups
          .filter((group) => group.entries.length > 0)
          .map((group) => {
            const folded = closed.includes(group.id);
            return (
              <section key={group.id} className={folded ? "sidebar-group folded" : "sidebar-group"} data-sidebar-group={group.id}>
                <button
                  type="button"
                  className="sidebar-category"
                  aria-expanded={!folded}
                  title={folded ? `${group.label}: show its buttons` : `${group.label}: fold its buttons away`}
                  onClick={() => save({ ...saved, closed: folded ? closed.filter((id) => id !== group.id) : [...closed, group.id] })}
                >
                  <Icon name={folded ? "chevron-right" : "chevron-down"} size={state === 0 ? 14 : 11} />
                  <span>{name(group.label)}</span>
                </button>
                {folded ? null : <div className="sidebar-entries">{group.entries.map((entry) => button(entry))}</div>}
              </section>
            );
          })}
      </div>
      <button
        type="button"
        className="sidebar-visibility"
        data-action="sidebar-visibility"
        title={state === 0 ? "Icons only" : "Icons and names again"}
        aria-label={state === 1 ? "Expand the sidebar" : "Collapse the sidebar"}
        onClick={() => save({ ...saved, state: state === 0 ? 1 : 0 })}
      >
        <Icon name={state === 1 ? "sidebar-expand" : "sidebar-collapse"} size={18} />
      </button>
    </nav>
  );
}
