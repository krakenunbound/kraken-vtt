"""Paint pictures with MiniMax H3 Image through a local ComfyUI.

Usage: python h3_image.py jobs.json out_dir
jobs.json (see games/tools/open-art.mjs for the prompts): [{"name": "sphinx-of-wonder", "prompt": "...", "w": 2048, "h": 2048, "seed": 7}, ...]
Writes out_dir/<name>.png and prints each one's seconds.
"""
import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get("COMFY", "http://127.0.0.1:8188")


def call(path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def graph(prompt, width, height, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "minimax_h3_image_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_image_vae_fp16.safetensors"}},
        "5": {"class_type": "MiniMaxH3ImageConditioning", "inputs": {"clip": ["2", 0], "vae": ["3", 0], "prompt": prompt, "width": width, "height": height}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["5", 1], "seed": seed, "steps": 6, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "kraken-h3-trial"}},
    }


def paint(job, out_dir):
    started = time.time()
    queued = json.loads(call("/prompt", {"prompt": graph(job["prompt"], job["w"], job["h"], job.get("seed", 7))}))
    prompt_id = queued["prompt_id"]
    while True:
        history = json.loads(call(f"/history/{prompt_id}"))
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(json.dumps(status)[:800])
            images = [image for node in entry.get("outputs", {}).values() for image in node.get("images", [])]
            if images:
                image = images[0]
                query = urllib.parse.urlencode({"filename": image["filename"], "subfolder": image.get("subfolder", ""), "type": image.get("type", "output")})
                data = call(f"/view?{query}", timeout=120)
                path = os.path.join(out_dir, f"{job['name']}.png")
                with open(path, "wb") as handle:
                    handle.write(data)
                return path, time.time() - started
        time.sleep(2)


if __name__ == "__main__":
    import urllib.parse

    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for job in jobs:
        try:
            path, seconds = paint(job, out_dir)
            print(f"{job['name']}: {seconds:.0f} s -> {path}", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"{job['name']}: FAILED {error}", flush=True)
