"""Rebuilds games/srd-5e/data/*.json from the SRD 5.2.1 PDF
(SRD_CC_v5.2.1.pdf, from https://www.dndbeyond.com/srd):

    python games/srd-5e/tools/build.py path/to/SRD_CC_v5.2.1.pdf

(tools/areas.mjs then adds each spell's area), then `npm run build-games` and
`npm run build-packs` make the books. Needs
PyMuPDF (pip install pymupdf).
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    pdf = sys.argv[1]
    with tempfile.TemporaryDirectory() as work:
        elements = os.path.join(work, "elements.json")
        subprocess.run([sys.executable, os.path.join(HERE, "extract.py"), pdf, elements], check=True)
        subprocess.run([sys.executable, os.path.join(HERE, "parse.py"), elements, os.path.join(HERE, "..", "data")], check=True)
    # Each spell's area (a Fireball's 20-foot sphere) from its words, by Kraken's
    # own parser (shared/actions/parse.mjs), so the build and the tracker read them alike.
    subprocess.run(["node", os.path.join(HERE, "areas.mjs")], check=True)


if __name__ == "__main__":
    main()
