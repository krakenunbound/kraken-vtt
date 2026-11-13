import { useEffect, useState } from "react";
import type { UpdaterState } from "../kraken";

// A new Kraken, on the start screen only (the GM's rule: nothing about
// updates while a campaign is open). Found when Kraken started; downloaded and
// installed only when the GM asks.
export function UpdateNotice() {
  const updater = window.kraken?.updater;
  const [state, setState] = useState<UpdaterState | null>(null);
  const [notes, setNotes] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!updater) return;
    void updater.state().then(setState).catch(() => undefined);
    return updater.onEvent(setState);
  }, [updater]);
  if (!updater || !state || !["available", "downloading", "ready", "installing"].includes(state.status)) return null;
  const act = (run: () => Promise<UpdaterState>) => {
    setError("");
    void run().then(setState).catch((reason: Error) => setError(String(reason.message ?? reason).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")));
  };
  return (
    <aside className="update-notice" data-update={state.status} aria-live="polite">
      <div className="update-line">
        <b>Kraken {state.version} is ready to install</b>
        <span className="update-current">You have {state.current}.</span>
      </div>
      {state.status === "available" ? (
        <div className="update-actions">
          <button type="button" className="play-button" data-action="update-download" onClick={() => act(updater.download)}>
            Download
          </button>
          {state.notes ? (
            <button type="button" className="ghost" data-action="update-notes" onClick={() => setNotes(!notes)}>
              {notes ? "Hide what's new" : "What's new"}
            </button>
          ) : null}
        </div>
      ) : state.status === "downloading" ? (
        <div className="update-progress" role="progressbar" aria-valuenow={state.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${state.percent ?? 0}%` }} /> <span>Downloading… {state.percent ?? 0}%</span>
        </div>
      ) : state.status === "ready" ? (
        <div className="update-actions">
          <button type="button" className="play-button" data-action="update-install" onClick={() => act(updater.install)} title="Kraken closes, the installer runs (Windows asks to allow it), and the new version opens">
            Restart and install
          </button>
        </div>
      ) : (
        <p className="hint">Installing: Kraken closes and opens again.</p>
      )}
      {notes && state.notes ? <pre className="update-notes">{state.notes}</pre> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
