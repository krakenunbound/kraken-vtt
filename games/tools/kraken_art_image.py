"""One picture from a running Kraken Art (its sidecar's HTTP API), for
Kraken's own art when no ComfyUI is listening.

Usage: python games/tools/kraken_art_image.py out.webp WIDTH HEIGHT "prompt" [seed] [model]

model: "zimage" (Z-Image Turbo, the default: fast, fine for creatures) or
"qwen" (Qwen-Image 2.1: slower, for covers). The sidecar is
http://127.0.0.1:7780 unless KRAKEN_ART says otherwise. The picture is fetched,
saved as WebP (quality 88) and the copy in Kraken Art's outputs removed, so a
batch leaves its gallery as it was.
"""
import io
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

BASE = os.environ.get("KRAKEN_ART", "http://127.0.0.1:7780").rstrip("/")

MODELS = {
    "zimage": {
        "arch": "z_image",
        "diffusion_model": "ZImageTurbo/zImageTurbo_turbo.safetensors",
        "vae": "ZImageTurbo/zImageTurbo_vae.safetensors",
        "text_encoders": ["ZImageTurbo/zImageTurbo_textEncoder.safetensors"],
        "steps": 9,
        "cfg": 1.0,
        "sampler": "res_multistep",
        "scheduler": "simple",
        "flow_shift": 3.0,
    },
    "qwen": {
        "arch": "qwen_image",
        "diffusion_model": "Qwen-Image-2.1",
        "steps": 40,
        "cfg": 1.0,
        "sampler": "euler",
        "scheduler": "normal",
        "qwen_profile": "balanced",
    },
}


def call(method, path, body=None, timeout=60, tries=12):
    """One request; a dropped connection (the sidecar restarting) is tried again for about a minute."""
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(tries):
        request = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (ConnectionError, urllib.error.URLError) as error:
            if isinstance(error, urllib.error.HTTPError) or attempt == tries - 1:
                raise
            time.sleep(5)


def reachable():
    try:
        call("GET", "/api/jobs", timeout=5, tries=1)
        return True
    except Exception:
        return False


def main(out, width, height, prompt, seed=None, model="zimage"):
    seed = int(seed) if seed is not None else random.randint(1, 2**31)
    body = dict(MODELS[model or "zimage"], prompt=prompt, width=int(width), height=int(height), seed=seed, count=1, output_name="kraken-vtt")
    job = json.loads(call("POST", "/api/generate", body))["job_id"]
    deadline = time.time() + 1800
    while time.time() < deadline:
        state = json.loads(call("GET", f"/api/jobs/{job}"))
        if state["status"] in ("error", "failed", "cancelled"):
            raise SystemExit(f"Kraken Art failed: {str(state.get('error'))[:600]}")
        if state["status"] in ("succeeded",) or (state.get("result") or {}).get("outputs"):
            outputs = (state.get("result") or {}).get("outputs") or []
            if not outputs:
                raise SystemExit(f"Kraken Art made nothing: {json.dumps(state)[:600]}")
            rel = outputs[0]["rel_path"]
            picture = Image.open(io.BytesIO(call("GET", "/api/outputs/file/" + urllib.parse.quote(rel)))).convert("RGB")
            picture.save(out, "WEBP", quality=88, method=5)
            try:
                call("POST", "/api/outputs/delete", {"paths": [rel]})
            except Exception:
                pass
            print(f"{out}: {picture.size[0]}x{picture.size[1]}, seed {seed}", flush=True)
            return
        time.sleep(1)
    raise SystemExit("Kraken Art did not finish in 30 minutes")


if __name__ == "__main__":
    main(*sys.argv[1:7])
