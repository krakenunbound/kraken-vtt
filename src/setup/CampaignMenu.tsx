import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { KrakenCampaign } from "../kraken";
import "./campaign-menu.css";

// The start screen's menu for a campaign (the "more" button on its card, or a
// right-click): Rename, Duplicate, Export .zip, Backups (restore one), Open
// folder, Delete (to the recycle bin, after a confirm). The same actions as
// kraken_campaigns, through the same backend calls.
type Backup = { id: string; at: number; reason: string; files: string[]; bytes: number };
type Dialog = "rename" | "delete" | "backups" | null;
const REASONS: Record<string, string> = { play: "As it was played", hourly: "Hourly", manual: "Backed up by hand", "before-restore": "Before a restore" };

export function CampaignMenu({ campaign, onChanged, onError, open, onOpenChange, anchor }: { campaign: KrakenCampaign; onChanged: (select?: string) => void; onError: (message: string) => void; open: boolean; onOpenChange: (open: boolean) => void; anchor: { x: number; y: number } | null }) {
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [which, setWhich] = useState<Dialog>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [note, setNote] = useState("");
  const manage = window.kraken?.manageCampaign;

  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    if (open && anchor) {
      element.style.left = `${Math.max(4, Math.min(anchor.x, window.innerWidth - 230))}px`;
      element.style.top = `${Math.max(4, Math.min(anchor.y, window.innerHeight - 280))}px`;
      if (!element.matches(":popover-open")) element.showPopover();
      element.querySelector<HTMLButtonElement>("button")?.focus({ focusVisible: false } as FocusOptions);
    } else if (!open && element.matches(":popover-open")) element.hidePopover();
  }, [open, anchor]);
  useEffect(() => {
    if (which && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [which]);

  const run = async (action: "duplicate" | "export" | "folder" | "backup", after?: (value: unknown) => void) => {
    onOpenChange(false);
    try {
      const value = await manage?.({ action, id: campaign.id });
      after?.(value);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message.split(": Error: ").pop() ?? caught.message : "Could not do that.");
    }
  };
  const show = (next: Dialog) => {
    onOpenChange(false);
    setNote("");
    setWhich(next);
    if (next === "backups") {
      setBackups(null);
      void manage?.({ action: "backups", id: campaign.id }).then((value) => setBackups((value as { backups: Backup[] }).backups)).catch((caught: Error) => setNote(caught.message));
    }
  };
  const close = () => {
    dialog.current?.close();
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const list = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (at + (event.key === "ArrowUp" ? -1 : 1) + list.length) % list.length;
    event.preventDefault();
    list[next]?.focus();
  };
  const rename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    try {
      await manage?.({ action: "rename", id: campaign.id, name });
      close();
      onChanged();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message.split(": Error: ").pop() ?? "" : "Could not rename it.");
    }
  };
  const remove = async () => {
    try {
      await manage?.({ action: "delete", id: campaign.id });
      close();
      onChanged();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message.split(": Error: ").pop() ?? "" : "Could not delete it.");
    }
  };
  const restore = async (backup: Backup) => {
    try {
      await manage?.({ action: "restore", id: campaign.id, backup: backup.id });
      setNote(`Restored the copy from ${new Date(backup.at).toLocaleString()}. What was there before is kept as a backup too.`);
      const value = (await manage?.({ action: "backups", id: campaign.id })) as { backups: Backup[] };
      setBackups(value.backups);
      onChanged(campaign.id);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message.split(": Error: ").pop() ?? "" : "Could not restore it.");
    }
  };
  // Enter in an input method's composition (Chinese, Japanese, Korean) finishes the word, not the form.
  const composing = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
  };

  return (
    <>
      <div ref={menu} className="campaign-menu" popover="auto" onToggle={(event) => (event.nativeEvent as ToggleEvent).newState === "closed" && onOpenChange(false)}>
        <div role="menu" aria-label={`${campaign.name}`} onKeyDown={keys}>
          <button type="button" role="menuitem" data-menu="rename" onClick={() => show("rename")}>
            Rename…
          </button>
          <button type="button" role="menuitem" data-menu="duplicate" onClick={() => void run("duplicate", (value) => onChanged((value as KrakenCampaign).id))}>
            Duplicate
          </button>
          <button type="button" role="menuitem" data-menu="export" onClick={() => void run("export")}>
            Export .zip…
          </button>
          <button type="button" role="menuitem" data-menu="backups" onClick={() => show("backups")}>
            Backups and restore…
          </button>
          <button type="button" role="menuitem" data-menu="folder" onClick={() => void run("folder")}>
            Open folder
          </button>
          <hr />
          <button type="button" role="menuitem" className="danger" data-menu="delete" onClick={() => show("delete")}>
            Delete…
          </button>
        </div>
      </div>
      {which ? (
        <dialog
          ref={dialog}
          className="campaign-dialog glass"
          aria-labelledby={`campaign-dialog-${campaign.id}`}
          data-dialog={which}
          onClose={() => {
            setWhich(null);
            setNote("");
          }}
        >
          {which === "rename" ? (
            <form onSubmit={(event) => void rename(event)}>
              <h2 id={`campaign-dialog-${campaign.id}`}>Rename the campaign</h2>
              <label className="field">
                <span>Name</span>
                <input name="name" defaultValue={campaign.name} maxLength={80} required autoFocus onKeyDown={composing} />
              </label>
              {note ? <p className="error" role="alert">{note}</p> : null}
              <div className="dialog-buttons">
                <button type="button" className="ghost" onClick={close}>
                  Cancel
                </button>
                <button type="submit" data-action="rename-save">
                  Rename
                </button>
              </div>
            </form>
          ) : which === "delete" ? (
            <div>
              <h2 id={`campaign-dialog-${campaign.id}`}>Delete {campaign.name}?</h2>
              <p>Its table, records, adventure, backups and Map Studio pictures go to the recycle bin, where you can get them back.</p>
              {note ? <p className="error" role="alert">{note}</p> : null}
              <div className="dialog-buttons">
                <button type="button" className="ghost" autoFocus onClick={close}>
                  Keep it
                </button>
                <button type="button" className="danger" data-action="delete-confirm" onClick={() => void remove()}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h2 id={`campaign-dialog-${campaign.id}`}>Backups of {campaign.name}</h2>
              <p className="hint">A copy is kept each time you press Play and every hour while you host; the newest ten stay. Restoring keeps what is there now as a backup too.</p>
              {note ? <p className="hint" role="status">{note}</p> : null}
              {backups === null ? (
                <p className="hint">Looking…</p>
              ) : backups.length === 0 ? (
                <p className="hint">No backups yet: the first is made when you press Play.</p>
              ) : (
                <ul className="backup-list">
                  {backups.map((backup) => (
                    <li key={backup.id} data-backup={backup.id}>
                      <span>
                        <b>{new Date(backup.at).toLocaleString()}</b>
                        <small className="hint">
                          {" "}
                          {REASONS[backup.reason] ?? backup.reason} · {(backup.bytes / 1024 / 1024).toFixed(1)} MB
                        </small>
                      </span>
                      <button type="button" className="ghost" data-action="restore" onClick={() => void restore(backup)}>
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="dialog-buttons">
                <button
                  type="button"
                  className="ghost"
                  data-action="backup-now"
                  onClick={() =>
                    void manage?.({ action: "backup", id: campaign.id })
                      .then(() => manage?.({ action: "backups", id: campaign.id }))
                      .then((value) => setBackups((value as { backups: Backup[] }).backups))
                      .catch((caught: Error) => setNote(caught.message))
                  }
                >
                  Back up now
                </button>
                <button type="button" autoFocus onClick={close}>
                  Done
                </button>
              </div>
            </div>
          )}
        </dialog>
      ) : null}
    </>
  );
}
