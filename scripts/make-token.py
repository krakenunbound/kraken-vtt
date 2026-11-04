"""Makes a round token from a square portrait (as FG's tokens are): the face
cropped from the upper middle, cut to a circle with a dark rim and a gold ring,
on a transparent background, 512 px. python scripts/make-token.py <portrait> <token.png>"""
import sys
from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
SCALE = 4  # drawn large, then shrunk, for smooth edges


def make(source: str, target: str) -> None:
    image = Image.open(source).convert("RGB")
    w, h = image.size
    # The face sits in the upper middle of a head-and-shoulders portrait.
    side = int(min(w, h) * 0.72)
    left = (w - side) // 2
    top = max(0, int(h * 0.06))
    if top + side > h:
        top = h - side
    face = image.crop((left, top, left + side, top + side)).resize((SIZE * SCALE, SIZE * SCALE), Image.LANCZOS)

    big = SIZE * SCALE
    ring = int(big * 0.035)
    rim = int(big * 0.012)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((ring, ring, big - ring, big - ring), fill=255)
    out.paste(face, (0, 0), mask)
    draw = ImageDraw.Draw(out)
    # Dark rim, then the gold ring with a lighter inner edge.
    draw.ellipse((rim, rim, big - rim, big - rim), outline=(28, 20, 12, 255), width=ring)
    draw.ellipse((ring - rim, ring - rim, big - ring + rim, big - ring + rim), outline=(201, 158, 82, 255), width=int(ring * 0.75))
    draw.ellipse((ring, ring, big - ring, big - ring), outline=(244, 214, 150, 255), width=max(2, rim // 2))
    # A soft shadow inside the ring, for depth.
    shade = Image.new("L", (big, big), 0)
    ImageDraw.Draw(shade).ellipse((ring, ring, big - ring, big - ring), outline=110, width=ring)
    shade = shade.filter(ImageFilter.GaussianBlur(ring * 0.6))
    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    shadow.putalpha(Image.composite(shade, Image.new("L", (big, big), 0), mask))
    out = Image.alpha_composite(out, shadow)
    out.resize((SIZE, SIZE), Image.LANCZOS).save(target)


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2])
