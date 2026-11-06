"""Makes the games' pictures listed in games/tools/art-list.json through the
local ComfyUI (comfy_image.py): covers, handouts, and a portrait for each
creature with a smaller copy as its map token. Pictures that already exist are
kept (delete one to make it again).

Usage: python games/tools/make_art.py [only-this-substring]
"""
import json
import os
import sys
import zlib

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from comfy_image import main as picture  # noqa: E402

root = os.path.join(os.path.dirname(__file__), "..", "..")
spec = json.load(open(os.path.join(os.path.dirname(__file__), "art-list.json"), encoding="utf-8"))
only = sys.argv[1] if len(sys.argv) > 1 else ""
jobs = [(p["out"], p["w"], p["h"], f'{p["prompt"]}, {spec["style"][p["style"]]}') for p in spec["pictures"]]
GAME = {"dd": "games/descending-darkness/art", "aa": "games/apeira-astra/art"}
for game, key, prompt in spec["creatures"]:
    jobs.append((f"{GAME[game]}/npc/{key}.webp", 1024, 1024, f'{prompt}, {spec["style"][game + "creature"]}'))

# Character portraits: games/portraits/<Kin>/<Kin> <Class>.webp, Kraken's
# own pair for a new character of that kin and class (characterArt.cjs).
n = 0
for game, set_ in spec.get("heroes", {}).items():
    for kin, classes in set_["kin"].items():
        for cls in classes:
            n += 1
            who = "woman" if n % 2 else "man"
            prompt = f'a {set_["look"][kin]} {who}, {set_["role"][cls]}'
            jobs.append((f"games/portraits/{kin}/{kin} {cls}.webp", 1024, 1024, f'{prompt}, {spec["style"][game + "hero"]}'))

for out, width, height, prompt in jobs:
    if only not in out:
        continue
    target = os.path.join(root, out)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if not os.path.exists(target):
        picture(target, width, height, prompt, zlib.crc32(out.encode()) % 2**31)
    if "/npc/" in out or out.startswith("games/portraits/"):
        token = target.replace(os.sep + "npc" + os.sep, os.sep + "tokens" + os.sep).replace("/npc/", "/tokens/").replace("games/portraits/", "games/tokens/")
        os.makedirs(os.path.dirname(token), exist_ok=True)
        if not os.path.exists(token):
            Image.open(target).convert("RGB").resize((256, 256), Image.LANCZOS).save(token, "WEBP", quality=86)
print("done")
