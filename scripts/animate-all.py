"""Animate every portrait in Kraken's assets folder (portraits/<race>/<name>.png),
through scripts/animate-portrait.py, with a motion line from the class. A
portrait that already has its .webm is skipped, so the batch can be stopped
and run again. Stops if ComfyUI is not running.

python scripts/animate-all.py [assets folder]
"""
import os
import sys
import time
import importlib.util

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("animate_portrait", os.path.join(here, "animate-portrait.py"))
animate_portrait = importlib.util.module_from_spec(spec)
spec.loader.exec_module(animate_portrait)

# What moves, by class: small, looping motion; the pose stays.
MOTION = {
    "Assassin": "The hood's edge stirs, shadows drift across the face, the eyes narrow and glance aside and back, a slow breath.",
    "Barbarian": "Wild hair and fur stir in a wind, the chest rises with a heavy breath, the jaw sets, a slow blink.",
    "Bard": "Hair and a feathered cap stir softly, a faint warm smile comes and goes, the eyes glint, a slow blink.",
    "Cleric": "A soft holy glow pulses around the holy symbol, the cloth of the vestments stirs, a calm breath, a slow blink.",
    "Druid": "Leaves and hair drift in a gentle breeze, faint green motes float in the air, a calm breath, a slow blink.",
    "Fighter": "Warm torchlight flickers across the face and armour, the hair stirs, a steady breath, a slow blink.",
    "Illusionist": "Swirling violet magic shimmers and twists around the hand, the light plays on the face, a breath, a slow blink.",
    "Knight": "A cloak and banner stir behind, light glints and moves on the polished armour, a steady breath, a slow blink.",
    "Monk": "Calm, steady breathing, wisps of incense smoke drift past, the robe stirs, a slow serene blink.",
    "Paladin": "A faint golden radiance pulses around the armour, the cloak stirs, a resolute breath, a slow blink.",
    "Ranger": "Hair and the cloak's hood stir in a forest breeze, dappled light shifts over the face, the eyes look out and back, a slow blink.",
    "Rogue": "Candlelight flickers across the face, a sly half smile comes and goes, the eyes glance aside and back, a slow blink.",
    "Wizard": "Faint blue arcane sparks drift around the staff and hands, the robe and beard or hair stir, a breath, a slow blink.",
}


def main():
    assets = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ["APPDATA"], "kraken-vtt", "assets")
    portraits = []
    for race in sorted(os.listdir(os.path.join(assets, "portraits"))):
        folder = os.path.join(assets, "portraits", race)
        for name in sorted(os.listdir(folder)):
            if name.lower().endswith(".png"):
                portraits.append(os.path.join(folder, name))
    todo = [p for p in portraits if not os.path.exists(os.path.splitext(p)[0] + ".webm")]
    print(f"{len(portraits)} portraits, {len(portraits) - len(todo)} already animated, {len(todo)} to go", flush=True)
    started = time.time()
    failed = []
    for index, portrait in enumerate(todo, 1):
        name = os.path.splitext(os.path.basename(portrait))[0]
        klass = name.split()[-1]
        motion = MOTION.get(klass, "The hair and clothes stir softly, a calm breath, a slow blink.")
        try:
            clip, took = animate_portrait.animate(portrait, motion, 3.0, None)
            still, token = animate_portrait.encode(clip, portrait)
            os.remove(clip)
            print(f"[{index}/{len(todo)}] {name}: {took:.0f}s, portrait {os.path.getsize(still) // 1024} KB, token {os.path.getsize(token) // 1024} KB", flush=True)
        except (Exception, SystemExit) as error:  # keep going; report at the end
            failed.append(name)
            print(f"[{index}/{len(todo)}] {name}: FAILED {error}", flush=True)
            if "Connection refused" in str(error) or "actively refused" in str(error):
                break
    minutes = (time.time() - started) / 60
    print(f"done in {minutes:.0f} min; {len(todo) - len(failed)} made, {len(failed)} failed{': ' + ', '.join(failed) if failed else ''}", flush=True)


if __name__ == "__main__":
    main()
