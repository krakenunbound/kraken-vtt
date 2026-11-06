"""One picture from the local ComfyUI (Z-Image Turbo), for Kraken's own art.

Usage: python games/tools/comfy_image.py out.webp WIDTH HEIGHT "prompt" [seed]

Queues a text-to-image workflow on ComfyUI (127.0.0.1:8188, or KRAKEN_COMFY),
waits for it, and saves the picture (WebP, quality 88).
"""
import io
import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

BASE = os.environ.get("KRAKEN_COMFY", "http://127.0.0.1:8188").rstrip("/")


def call(path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def workflow(prompt, width, height, seed, steps=9):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "ZImageTurbo\\zImageTurbo_turbo.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "ZImageTurbo\\zImageTurbo_textEncoder.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ZImageTurbo\\zImageTurbo_vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0], "seed": seed, "steps": steps, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "kraken-art"}},
    }


def main(out, width, height, prompt, seed=None):
    seed = int(seed) if seed is not None else random.randint(1, 2**31)
    queued = json.loads(call("/prompt", {"prompt": workflow(prompt, int(width), int(height), seed)}))
    prompt_id = queued["prompt_id"]
    deadline = time.time() + 600
    while time.time() < deadline:
        history = json.loads(call(f"/history/{prompt_id}"))
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("status_str") == "error":
                raise SystemExit(f"ComfyUI failed: {json.dumps(entry.get('status'))[:600]}")
            for node in entry.get("outputs", {}).values():
                for image in node.get("images", []):
                    query = urllib.parse.urlencode({"filename": image["filename"], "subfolder": image.get("subfolder", ""), "type": image.get("type", "output")})
                    picture = Image.open(io.BytesIO(call(f"/view?{query}"))).convert("RGB")
                    picture.save(out, "WEBP", quality=88, method=5)
                    print(f"{out}: {picture.size[0]}x{picture.size[1]}, seed {seed}")
                    return
        time.sleep(1.5)
    raise SystemExit("ComfyUI did not finish in 10 minutes")


if __name__ == "__main__":
    main(*sys.argv[1:6])
