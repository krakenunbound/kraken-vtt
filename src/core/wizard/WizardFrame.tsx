import type { ReactNode } from "react";

// The character wizard's frame (FG's charwizard window): its title, Cancel,
// Finish (data-action="wizard-finish", greyed until every step is done), the
// steps, and the last problem. data-wizard is the game's hook, which the
// tests and the agent find the wizard by.
export function WizardFrame({ hook, aria, title, ready, finishTitle, onFinish, onCancel, problem, children }: { hook: string; aria: string; title: string; ready: boolean; finishTitle?: string; onFinish: () => void; onCancel: () => void; problem: string; children: ReactNode }) {
  return (
    <section className="wizard-5e cc-panel" aria-label={aria} data-wizard={hook}>
      <header className="cc-row">
        <b>{title}</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={!ready} title={finishTitle} onClick={onFinish}>
          Finish
        </button>
      </header>
      {children}
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
