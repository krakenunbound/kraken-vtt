import { useEffect, useRef, useState, type ReactNode } from "react";

// What each version brought, read from GitHub's releases (the same ones the
// updater installs from) and shown here, not in a browser.
const API = "https://api.github.com/repos/krakenunbound/kraken-vtt/releases?per_page=8";
type Release = { tag_name: string; name: string | null; published_at: string; body: string | null; html_url: string };

// The notes' Markdown, the little of it releases use: headings, lists, **bold**, `code`, [links](...) as their words.
function inline(text: string): ReactNode[] {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, index) => (part.startsWith("**") ? <b key={index}>{part.slice(2, -2)}</b> : part.startsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part));
}
function NotesBody({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: ReactNode[] = [];
  const flush = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items}</ul>);
    items = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const item = /^[-*] (.*)$/.exec(line);
    if (item) {
      items.push(<li key={items.length}>{inline(item[1])}</li>);
      continue;
    }
    flush();
    const head = /^#{1,6} (.*)$/.exec(line);
    if (head) blocks.push(<h4 key={blocks.length}>{inline(head[1])}</h4>);
    else if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function ReleaseNotes({ open, onClose, allUrl }: { open: boolean; onClose: () => void; allUrl: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  useEffect(() => {
    if (!open || releases) return;
    setError("");
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`GitHub answered ${response.status}`))))
      .then((list: Release[]) => setReleases(list))
      .catch((reason: Error) => setError(reason.message || "GitHub could not be reached."));
  }, [open, releases]);
  return (
    <dialog ref={dialog} className="release-notes glass" aria-labelledby="release-notes-title" {...({ closedby: "any" } as object)} onClose={onClose} data-dialog="release-notes">
      <header>
        <h2 id="release-notes-title">Release notes</h2>
        <form method="dialog">
          <button type="submit" className="ghost" aria-label="Close the release notes" autoFocus>
            ×
          </button>
        </form>
      </header>
      <div className="release-notes-list">
        {error ? (
          <p className="release-notes-error">
            {error}. <a href={allUrl} target="_blank" rel="noopener noreferrer">Read them on GitHub</a>.
          </p>
        ) : !releases ? (
          <p className="hint">Reading the releases from GitHub…</p>
        ) : (
          releases.map((release, index) => (
            <details key={release.tag_name} className="release" open={index === 0} data-release={release.tag_name}>
              <summary>
                <b>{release.name || release.tag_name}</b>
                <time dateTime={release.published_at}>{new Date(release.published_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time>
              </summary>
              <NotesBody text={release.body ?? ""} />
            </details>
          ))
        )}
      </div>
      <footer>
        <a href={allUrl} target="_blank" rel="noopener noreferrer">
          Every release on GitHub
        </a>
      </footer>
    </dialog>
  );
}
