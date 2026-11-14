"""Makes the games' pictures listed in games/tools/art-list.json: covers,
handouts, and a portrait for each creature with a smaller copy as its map
token. Pictures that already exist are kept (delete one to make it again).

The open games' pictures (art-list.json's "open" section: a cover for each
book, a portrait and token for each creature, NPC and pregenerated character)
come from games/tools/open-art.mjs, which builds each prompt from the record.
They are saved at the size the installer wants (portraits 768 at WebP 82,
tokens 256 at 84, covers 768x1024 at 85).

Pictures are made by the local ComfyUI (comfy_image.py: KRAKEN_COMFY, default
http://127.0.0.1:8188) or, when no ComfyUI answers, by a running Kraken Art
(kraken_art_image.py: KRAKEN_ART, default http://127.0.0.1:7780), which can
also paint the covers with Qwen-Image 2.1.

Usage: python games/tools/make_art.py [only-this-substring] [--open] [--covers|--portraits] [--art|--comfy]
  --open        only the open games' pictures
  --covers      only covers (one model at a time keeps the GPU from swapping)
  --portraits   only portraits and tokens
"""
import json
import os
import subprocess
import sys
import urllib.request
import zlib

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import comfy_image  # noqa: E402
import kraken_art_image  # noqa: E402

root = os.path.join(os.path.dirname(__file__), "..", "..")
spec = json.load(open(os.path.join(os.path.dirname(__file__), "art-list.json"), encoding="utf-8"))
flags = {arg for arg in sys.argv[1:] if arg.startswith("--")}
words = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
only = words[0] if words else ""


def comfy_up():
    try:
        urllib.request.urlopen(comfy_image.BASE + "/system_stats", timeout=5).read()
        return True
    except Exception:
        return False


# --art or --comfy picks one; else ComfyUI when it answers. (Kraken Art may run
# a ComfyUI of its own for Qwen-Image while it paints: pass --art then.)
USE_COMFY = "--comfy" in flags or ("--art" not in flags and comfy_up())
if not USE_COMFY and not kraken_art_image.reachable():
    raise SystemExit(f"Neither ComfyUI ({comfy_image.BASE}) nor Kraken Art ({kraken_art_image.BASE}) answers.")
print(f"painting with {'ComfyUI at ' + comfy_image.BASE if USE_COMFY else 'Kraken Art at ' + kraken_art_image.BASE}", flush=True)


def picture(target, width, height, prompt, seed, model="zimage"):
    if USE_COMFY:
        comfy_image.main(target, width, height, prompt, seed)
    else:
        kraken_art_image.main(target, width, height, prompt, seed, model)


# Each job: out, width, height, prompt, and optionally the saved size,
# WebP quality, model, and whether a token is made from it.
jobs = []
if "--open" not in flags:
    jobs += [{"out": p["out"], "w": p["w"], "h": p["h"], "prompt": f'{p["prompt"]}, {spec["style"][p["style"]]}'} for p in spec["pictures"]]
    GAME = {"dd": "games/descending-darkness/art", "aa": "games/apeira-astra/art"}
    for game, key, prompt in spec["creatures"]:
        jobs.append({"out": f"{GAME[game]}/npc/{key}.webp", "w": 1024, "h": 1024, "prompt": f'{prompt}, {spec["style"][game + "creature"]}', "token": True})

    # Spell cards: a picture for each spell's card (art/spells/<key>.webp), the
    # key as games/lib/fg.mjs artKey makes it.
    import re  # noqa: E402
    for game, name, prompt in spec.get("spells", []):
        key = re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))
        jobs.append({"out": f"{GAME[game]}/spells/{key}.webp", "w": 768, "h": 832, "prompt": f'{prompt}, {spec["style"][game + "spell"]}'})

    # Weapon cards: one picture for each kind of weapon (src/assets/cards/<kind>.webp),
    # bundled with the app, since weapons on a sheet are not book records.
    for kind, prompt in spec.get("weapons", []):
        jobs.append({"out": f"src/assets/cards/{kind}.webp", "w": 768, "h": 832, "prompt": f'{prompt}, {spec["style"]["ddspell"]}'})

    # Character portraits: games/portraits/<Kin>/<Kin> <Class>.webp, Kraken's
    # own pair for a new character of that kin and class (characterArt.cjs).
    n = 0
    for game, set_ in spec.get("heroes", {}).items():
        for kin, classes in set_["kin"].items():
            for cls in classes:
                n += 1
                who = "woman" if n % 2 else "man"
                prompt = f'a {set_["look"][kin]} {who}, {set_["role"][cls]}'
                jobs.append({"out": f"games/portraits/{kin}/{kin} {cls}.webp", "w": 1024, "h": 1024, "prompt": f'{prompt}, {spec["style"][game + "hero"]}', "token": True})

# The open games' pictures, from their records.
if "open" in spec:
    listing = subprocess.run(["node", os.path.join(os.path.dirname(__file__), "open-art.mjs")], capture_output=True, text=True, encoding="utf-8", check=True)
    jobs += json.loads(listing.stdout)

if "--covers" in flags:
    jobs = [job for job in jobs if not job.get("token")]
if "--portraits" in flags:
    jobs = [job for job in jobs if job.get("token")]

made = 0
for job in jobs:
    out = job["out"]
    if only not in out:
        continue
    target = os.path.join(root, out)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if not os.path.exists(target):
        seed = job.get("seed") or zlib.crc32(out.encode()) % 2**31 + 7
        try:
            picture(target, job["w"], job["h"], job["prompt"], seed, job.get("model", "zimage"))
        except SystemExit as error:
            print(f"{out}: {error}", flush=True)
            continue
        if job.get("size"):
            Image.open(target).convert("RGB").resize(tuple(job["size"]), Image.LANCZOS).save(target, "WEBP", quality=job.get("quality", 88), method=6)
        made += 1
    if job.get("token"):
        token = target.replace(os.sep + "npc" + os.sep, os.sep + "tokens" + os.sep).replace("/npc/", "/tokens/").replace("games/portraits/", "games/tokens/")
        os.makedirs(os.path.dirname(token), exist_ok=True)
        if not os.path.exists(token):
            Image.open(target).convert("RGB").resize((256, 256), Image.LANCZOS).save(token, "WEBP", quality=84 if job.get("size") else 86, method=6)
print(f"done: {made} made", flush=True)
