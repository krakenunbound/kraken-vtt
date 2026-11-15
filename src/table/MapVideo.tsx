import { useEffect, useRef } from "react";

type Rect = { left: number; top: number; width: number; height: number };

// An animated map (a .webm or .mp4 background, Foundry's video scenes): the
// video loops under everything, muted. Its first frame becomes a still for
// what needs a picture (the night-vision grey of Lighting.tsx).
export function MapVideo({ url, name, rect, onNatural, onStill, onFailed }: { url: string; name: string; rect: Rect; onNatural: (size: { width: number; height: number }) => void; onStill: (url: string | null) => void; onFailed: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let made: string | null = null;
    const element = video.current;
    if (!element) return;
    const grab = () => {
      if (made || !element.videoWidth) return;
      try {
        const canvas = document.createElement("canvas");
        // A still at most 2048 wide: enough for a grey night view, light on memory.
        const scale = Math.min(1, 2048 / element.videoWidth);
        canvas.width = Math.round(element.videoWidth * scale);
        canvas.height = Math.round(element.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return;
          made = URL.createObjectURL(blob);
          onStill(made);
        }, "image/webp", 0.85);
      } catch {
        /* a video from elsewhere cannot be read back: no still */
      }
    };
    element.addEventListener("loadeddata", grab);
    return () => {
      element.removeEventListener("loadeddata", grab);
      if (made) URL.revokeObjectURL(made);
      onStill(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return (
    <video
      ref={video}
      className="map-video"
      src={url}
      aria-label={name}
      autoPlay
      loop
      muted
      playsInline
      crossOrigin="anonymous"
      style={{ position: "absolute", left: rect.left, top: rect.top, width: rect.width, height: rect.height, objectFit: "fill", pointerEvents: "none" }}
      onLoadedMetadata={(event) => onNatural({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
      onError={onFailed}
    />
  );
}

// Whether a scene's picture is a video (by its flag, or the address's extension).
export function isVideoScene(scene: { video?: boolean; imageUrl: string | null }) {
  return Boolean(scene.video) || /\.(webm|mp4)(\?|#|$)/i.test(scene.imageUrl ?? "");
}
