"""Paint the item pictures listed by games/tools/item-art.mjs with MiniMax H3
Image in a local ComfyUI (h3_image.py), one painting per kind of item, saved
as 512x512 WebP in the game that owns it (games/<game>/art/item/<key>.webp)
and copied into every other game that has the item, each keeping its own
copy. A picture that already exists is kept, so a stopped run goes on where
it left off.

Usage: node games/tools/item-art.mjs --missing > jobs.json
       python games/tools/paint_items.py jobs.json [scratch_dir]
"""
import json
import os
import shutil
import sys
import tempfile
import time

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import h3_image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SIZE = 512
QUALITY = 82


def main(jobs_path, scratch):
    jobs = json.load(open(jobs_path, encoding="utf-8"))
    os.makedirs(scratch, exist_ok=True)
    started = time.time()
    done = 0
    for index, job in enumerate(jobs, 1):
        target = os.path.join(ROOT, job["out"])
        if not os.path.exists(target):
            try:
                png, seconds = h3_image.paint(job, scratch)
            except Exception as error:  # one failed picture never stops the run
                print(f"[{index}/{len(jobs)}] {job['key']}: FAILED {str(error)[:200]}", flush=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            Image.open(png).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).save(target, "WEBP", quality=QUALITY, method=6)
            os.remove(png)
            done += 1
            print(f"[{index}/{len(jobs)}] {job['key']}: {seconds:.0f} s", flush=True)
        for copy in job.get("copies", []):
            other = os.path.join(ROOT, copy)
            if not os.path.exists(other):
                os.makedirs(os.path.dirname(other), exist_ok=True)
                shutil.copyfile(target, other)
    print(f"painted {done} in {(time.time() - started) / 60:.0f} min", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix="kraken-items-"))
