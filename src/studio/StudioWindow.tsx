import { useEffect, useState } from "react";

// Kraken Map Studio in a window of Kraken's own: the map maker (art, walls,
// doors, lights and time of day, weather with masks, traps and regions, play
// testing, Fantasy Grounds and Foundry export), served by Kraken itself
// (electron/studio/server.cjs). The GM's alone.
// page: the editor's page Kraken made for an image (its master opens there), else Map Studio as it is.
export function StudioWindow({ project: page }: { project?: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (page && /^http:\/\/127\.0\.0\.1:\d+\//.test(page)) {
      setUrl(new URL(page).origin);
      return;
    }
    const kraken = window.kraken;
    if (!kraken?.studioUrl) {
      setError("Map Studio runs in the Kraken VTT app.");
      return;
    }
    kraken
      .studioUrl()
      .then((found) => setUrl(found.url))
      .catch((reason: Error) => setError(reason.message || "Map Studio could not start."));
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!url) return <p className="hint">Starting Map Studio…</p>;
  const src = page && page.startsWith(url) ? page : `${url}/`;
  return <iframe className="studio-frame" title="Map Studio" src={src} data-studio={url} allow="clipboard-read; clipboard-write" />;
}
