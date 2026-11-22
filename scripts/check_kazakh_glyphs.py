"""Check that a self-hosted @fontsource font covers every Kazakh Cyrillic letter.

Usage (from the repo root, needs `pip install fonttools brotli`):
    python scripts/check_kazakh_glyphs.py frontend/node_modules/@fontsource-variable/onest
Exit code 1 if any letter is missing from all of the family's .woff2 subsets.
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

KAZAKH = "ӘәҒғҚқҢңӨөҰұҮүҺһІі"


def covered(family_dir: Path) -> set[str]:
    chars = set()
    for font_file in sorted((family_dir / "files").glob("*.woff2")):
        chars |= {chr(code) for code in TTFont(font_file).getBestCmap()}
    return chars


def main(paths: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1251
    failed = False
    for path in paths:
        missing = [letter for letter in KAZAKH if letter not in covered(Path(path))]
        print(f"{path}: {'OK, all 18 Kazakh letters' if not missing else 'MISSING ' + ' '.join(missing)}")
        failed |= bool(missing)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
