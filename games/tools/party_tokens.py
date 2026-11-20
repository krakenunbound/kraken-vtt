"""Makes the party tokens (games/tokens/Party): banners, flags and adventuring groups for the GM to put on a big map
(a city, a region) where the party is. Each is a square painting, 512 px WebP; the map draws it as a round token.
Pictures that already exist are kept (delete one to make it again).

Usage: python games/tools/party_tokens.py      (ComfyUI at KRAKEN_COMFY, default http://127.0.0.1:8188)
"""
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "tokens", "Party")
STYLE = ("painterly digital fantasy illustration, rich color, strong silhouette, centered subject, readable at small size, "
         "dark muted vignette background, dramatic rim light, no text, no letters, no words, no watermark, no border")
TOKENS = [
    ("Crimson Banner", 1101, "a crimson war banner with a golden lion emblem on a tall wooden pole, cloth rippling in the wind, iron finial"),
    ("Azure Pennant", 1102, "a long blue swallowtail pennant flag with a silver dragon emblem flying from a spear tip, wind-blown cloth"),
    ("Stag Standard", 1103, "a forest green banner with a white stag emblem on a carved wooden standard, oak leaves, morning mist"),
    ("Sellsword Banner", 1104, "a black mercenary banner with a white crossed-swords emblem, battle-torn edges, on a spear shaft"),
    ("Road Companions", 1105, "four fantasy adventurers walking together seen from behind on a winding road: an armored warrior with a shield, a hooded rogue, a robed wizard with a glowing staff, a cleric with a mace"),
    ("Campfire Fellowship", 1106, "a small fantasy adventuring party gathered around a campfire at night, a knight, an elf archer, a dwarf with an axe and a wizard, warm firelight"),
    ("Caravan", 1107, "a covered wagon caravan pulled by horses with armed guards walking beside it, fantasy road, lanterns"),
    ("Lantern Investigators", 1108, "three 1920s occult investigators in long coats and hats holding lanterns, walking into thick fog, eerie cemetery gate, horror mood"),
    ("Monster Hunters", 1109, "gothic monster hunters with a crossbow, silver stakes and a lantern, wide-brimmed hats and long coats, misty moonlit graveyard, horror mood"),
    ("Omen Banner", 1110, "a tattered black banner with a single red eye sigil hanging from a twisted dead branch, crows, blood-red moon, horror mood"),
    ("Starship Crew", 1111, "four science fiction starship crew members in sleek armored spacesuits walking down a glowing starship corridor, helmets under their arms"),
    ("Mercenary Squad", 1112, "a squad of four science fiction mercenaries with rifles and power armor advancing across a rocky alien planet, twin suns in the sky"),
    ("Faction Insignia", 1113, "a science fiction faction insignia: a glowing blue chevron and star emblem engraved on a battered metal plate, holographic light, hard surface"),
    ("Compass Marker", 1114, "an ornate antique compass rose medallion in brass and gold with a red north needle, cartography map marker, parchment glow"),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    made = 0
    for name, seed, subject in TOKENS:
        target = os.path.join(OUT, f"{name}.webp")
        if os.path.exists(target):
            continue
        work = target + ".work.webp"
        prompt = f"{subject}, {STYLE}"
        result = subprocess.run([sys.executable, os.path.join(HERE, "comfy_image.py"), work, "1024", "1024", prompt, str(seed)], capture_output=True, text=True)
        if result.returncode or not os.path.exists(work):
            print(f"FAILED {name}: {(result.stderr or result.stdout).strip()[-300:]}")
            continue
        Image.open(work).convert("RGB").resize((512, 512), Image.LANCZOS).save(target, "WEBP", quality=86, method=6)
        os.remove(work)
        made += 1
        print(f"made {name}")
    print(f"{made} made, {len(TOKENS)} in all")


if __name__ == "__main__":
    main()
