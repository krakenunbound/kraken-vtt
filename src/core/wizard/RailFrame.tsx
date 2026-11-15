import type { ReactNode } from "react";

// The page-rail wizard frame (FG's charwizard window as its d20 rulesets have
// it): the title, Next and Cancel; the tab rail, one tab per page with its
// badge (a tick when the page is done, the game's alert when not); a note to
// dismiss; then the page. The game's pages sit inside it as children
// (docs/core-ui-design.md 7.13), as every sheet sits in SheetFrame. The hooks
// are the ones tests and agents use: data-wizard, data-wizard-next,
// data-wizard-tab.

export interface RailTab {
  id: string;
  label: ReactNode;
  attrs?: Record<string, string>; // data-* on the tab (2E's data-done)
  // The badge after the label: a tick once done, else the game's todo mark; none for a tab without.
  badge?: { done: boolean; todo: ReactNode; title?: string; attrs?: Record<string, string> };
}

// One plate heading a page's part (FG's wizard plate), an action button before its words.
export function WizardPlate({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ccw-plate">
      {action}
      <span>{children}</span>
    </div>
  );
}

export function RailFrame({
  className,
  attrs,
  aria,
  heading,
  next,
  onCancel,
  top,
  tabs,
  page,
  onPage,
  note,
  onNote,
  children,
}: {
  className: string;
  attrs: Record<string, string>; // data-wizard, data-page
  aria: string;
  heading: ReactNode; // the title, an h2
  next: { label: ReactNode; title: string; disabled: boolean; onClick: () => void };
  onCancel: () => void;
  top?: ReactNode; // between the header and the rail (2E's ready-made characters)
  tabs: RailTab[] | null; // null: no rail (a ready-made character's single page)
  page: string;
  onPage: (id: string) => void;
  note?: string;
  onNote?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={className} {...attrs} aria-label={aria}>
      <header className="ccw-head">
        {heading}
        <span className="ccw-head-buttons">
          <button type="button" className="wizard-next" data-wizard-next disabled={next.disabled} onClick={next.onClick} title={next.title}>
            {next.label}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </span>
      </header>
      {top}
      {tabs ? (
        <nav className="ccw-tabs" role="tablist">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={page === tab.id} data-wizard-tab={tab.id} {...tab.attrs} onClick={() => onPage(tab.id)}>
              {tab.label}
              {tab.badge ? (
                <span className={tab.badge.done ? "ccw-tab-badge done" : "ccw-tab-badge todo"} {...tab.badge.attrs} title={tab.badge.title}>
                  {tab.badge.done ? "✓" : tab.badge.todo}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}
      {tabs && note ? (
        <p className="ccw-note" role="status">
          {note}
          <button type="button" aria-label="Dismiss" onClick={onNote}>
            ×
          </button>
        </p>
      ) : null}
      {children}
    </section>
  );
}
