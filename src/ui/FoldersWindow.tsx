import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";

// The GM's Folders window (the folder button along the top): Maelstrom's folders for what a GM adds (books and
// modules as .kpack, sounds, this campaign's maps, dice, dice towers, GM icons, decals, wallpapers), each with how
// many files it holds. Drop files on one to copy them in; Open shows it in Explorer; Refresh reads everything
// again. The table stays up the whole time: no player is sent away, nothing is restarted.
type Folder = { kind: string; label: string; path: string; files: number };

const ICON: Record<string, Parameters<typeof Icon>[0]["name"]> = {
  packs: "book",
  sounds: "music",
  maps: "map",
  dice: "d20",
  towers: "tower",
  gmicons: "character",
  decals: "sparkle",
  wallpapers: "eye",
};

export function FoldersWindow() {
  const api = window.kraken;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState("");
  const load = useCallback(async () => {
    const view = (await api?.contentFolders?.()) as { folders: Folder[] } | undefined;
    if (view) setFolders(view.folders);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    try {
      const view = (await api?.contentRefresh?.()) as { folders: Folder[] } | undefined;
      if (view) setFolders(view.folders);
      setNote("Read again. New books show in Modules; the players stay connected.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not read the folders again.");
    } finally {
      setBusy(false);
    }
  };

  const drop = async (kind: string, list: FileList) => {
    setOver("");
    setBusy(true);
    try {
      const files = await Promise.all([...list].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      const done = (await api?.contentAdd?.(kind, files)) as { added: string[]; refused: string[] } | undefined;
      await load();
      const added = done?.added.length ?? 0;
      const refused = done?.refused ?? [];
      setNote(`${added ? `Added ${added}: ${done?.added.join(", ")}.` : "Nothing added."}${refused.length ? ` Not for this folder: ${refused.join(", ")}.` : ""}`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not add those files.");
    } finally {
      setBusy(false);
    }
  };

  if (!api?.contentFolders) return <p className="hint">The folders are in the GM's Maelstrom app.</p>;
  return (
    <div className="folders-window" data-window="folders">
      <div className="folders-bar">
        <button type="button" className="ghost" data-action="folders-root" title="Open Maelstrom's folder (Documents/Kraken VTT)" onClick={() => void api.contentOpen?.("")}>
          <Icon name="folder" size={16} /> Open all
        </button>
        <button type="button" data-action="folders-refresh" disabled={busy} title="Read every folder again: new books, sounds, art and dice, with the table still running" onClick={() => void refresh()}>
          <Icon name="next" size={16} /> Refresh
        </button>
      </div>
      <p className="hint">Drop files on a folder to add them. Packs go into their game's folder by themselves.</p>
      <ul className="folders-list">
        {folders.map((folder) => (
          <li
            key={folder.kind}
            className={over === folder.kind ? "is-over" : ""}
            data-folder={folder.kind}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setOver(folder.kind);
            }}
            onDragLeave={() => setOver((current) => (current === folder.kind ? "" : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length) void drop(folder.kind, event.dataTransfer.files);
            }}
          >
            <Icon name={ICON[folder.kind] ?? "folder"} size={20} />
            <span className="folders-name">
              {folder.label}
              <small title={folder.path}>
                {folder.files} file{folder.files === 1 ? "" : "s"}
              </small>
            </span>
            <button type="button" className="ghost" data-action="folder-open" title={`Open ${folder.path}`} aria-label={`Open ${folder.label}`} onClick={() => void api.contentOpen?.(folder.kind)}>
              <Icon name="open" size={16} />
            </button>
          </li>
        ))}
      </ul>
      {note ? (
        <p className="folders-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
