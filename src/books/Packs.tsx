import { useEffect, useMemo, useState } from "react";
import type { KrakenPacksView } from "../kraken";
import { Icon } from "../ui/icons";

// Kraken packs (the Books window's Packs tab, the GM's own app): the GM's FG
// books made into Kraken's own files (.kpack), one per book, in one folder
// (Documents/Kraken VTT/Packs). Copy that folder to any computer with Kraken
// and the books open there with no Fantasy Grounds and no .mod files. A pack
// is made from the FG module once; "Make again" after the module changes.
export function PacksPanel({ ruleset }: { ruleset: string }) {
  const api = window.kraken?.packs;
  const [view, setView] = useState<KrakenPacksView | null>(null);
  const [every, setEvery] = useState(false);
  const [error, setError] = useState("");
  const wanted = every ? "" : ruleset;
  useEffect(() => {
    if (!api) return;
    let live = true;
    const load = () =>
      api
        .view({ ruleset: wanted })
        .then((next) => {
          if (live) {
            setView(next);
            setError("");
          }
        })
        .catch((reason: Error) => live && setError(reason.message));
    load();
    const off = api.onEvent(load);
    // While packs are being made, how far along.
    const timer = window.setInterval(() => view?.making && load(), 1000);
    return () => {
      live = false;
      off();
      window.clearInterval(timer);
    };
  }, [api, wanted, Boolean(view?.making)]);
  const missing = useMemo(() => (view?.books ?? []).filter((book) => !book.packOnly && (!book.pack || !book.pack.current) && !book.state), [view]);
  if (!api) return null;
  const make = (ids: string[]) =>
    api
      .make(ids)
      .then(() => api.view({ ruleset: wanted }).then(setView))
      .catch((reason: Error) => setError(reason.message));
  const failedOf = (id: string) => view?.failed.find((item) => item.id === id)?.error ?? "";
  return (
    <div className="packs-panel" data-packs>
      <p className="hint">
        Your Fantasy Grounds books as <b>Kraken packs</b>: one file per book, with its pages, records, maps (walls and doors too) and pictures. Copy the packs folder to any computer with Kraken and the books open there, with no Fantasy Grounds and no .mod files. A pack is yours: keep it to yourself.
      </p>
      <div className="packs-bar">
        <button type="button" className="ghost" data-action="packs-folder" title={view?.folder ?? ""} onClick={() => void api.openFolder()}>
          <Icon name="open" size={15} /> Open the packs folder
        </button>
        <label title="Show the books of every game, not only this campaign's">
          <input type="checkbox" checked={every} data-packs-every onChange={(event) => setEvery(event.target.checked)} /> Every game
        </label>
        <button type="button" data-action="packs-make-all" disabled={missing.length === 0} title="Make a pack of each book here that has none, or an older one" onClick={() => void make(missing.map((book) => book.id))}>
          Make {missing.length || "no"} pack{missing.length === 1 ? "" : "s"}
        </button>
      </div>
      {view?.making ? (
        <p className="packs-making" data-packs-making={view.making.id}>
          Making {view.books.find((book) => book.id === view.making?.id)?.title ?? view.making.id}
          {view.making.total ? `: pictures ${view.making.done ?? 0} of ${view.making.total}` : "…"}
          {view.making.waiting ? ` (${view.making.waiting} more waiting)` : ""}
        </p>
      ) : null}
      {error ? <p className="hint">{error}</p> : null}
      <div className="packs-list" role="list">
        {!view ? <p className="hint">Looking for your books…</p> : null}
        {view && view.books.length === 0 ? <p className="hint">No Fantasy Grounds books for {wanted || "any game"} on this computer.</p> : null}
        {(view?.books ?? []).map((book) => {
          const failed = book.state === "failed" ? failedOf(book.id) : "";
          const status = book.state === "making" ? "Making…" : book.state === "waiting" ? "Waiting" : failed ? "Could not make it" : book.packOnly ? "Pack (no FG module here)" : book.pack ? (book.pack.current ? "Pack made" : "Pack older than the module") : "No pack yet";
          return (
            <div key={book.id} className={book.pack?.current ? "packs-row done" : "packs-row"} role="listitem" data-pack-book={book.id} data-pack-state={book.state || (book.pack ? (book.pack.current ? "made" : "old") : "none")}>
              <span className="packs-title">
                <b>{book.title}</b>
                <small>
                  {book.ruleset || "Any game"}
                  {book.hasBook ? "" : " · pictures and tokens"} · {status}
                </small>
                {failed ? <small className="packs-error">{failed}</small> : null}
              </span>
              {book.packOnly ? null : (
                <button type="button" className="ghost" data-pack-make={book.id} disabled={book.state === "making" || book.state === "waiting"} onClick={() => void make([book.id])}>
                  {book.pack ? "Make again" : "Make pack"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
