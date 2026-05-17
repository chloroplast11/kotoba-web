# phase5/import_audio.py
"""Step 2 (new): copy hypertts mp3 files from N2/ into public/audio/words/
and update n2_words.json with the audioFile filename."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Dict, Optional

from phase5.io_utils import atomic_write_json

MEDIA_MAP = Path("N2/media")
ANKI_DIR = Path("N2")
WORDS_JSON = Path("n2_words.json")
TARGET_DIR = Path("public/audio/words")
MANIFEST = Path("public/audio/manifest.json")


def build_reverse_map(media: Dict[str, str]) -> Dict[str, str]:
    return {filename: disk_id for disk_id, filename in media.items()}


def find_disk_id(reverse_map: Dict[str, str], filename: str) -> Optional[str]:
    return reverse_map.get(filename)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear", action="store_true",
                        help="clear public/audio/words/ before copy")
    args = parser.parse_args()

    if not MEDIA_MAP.exists() or not WORDS_JSON.exists():
        print(f"Missing {MEDIA_MAP} or {WORDS_JSON}", file=sys.stderr)
        sys.exit(1)

    media = json.loads(MEDIA_MAP.read_text(encoding="utf-8"))
    reverse = build_reverse_map(media)
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if args.clear:
        for f in TARGET_DIR.glob("*"):
            f.unlink()

    copied = 0
    missing = []
    for w in words:
        h = w.get("audio_hash")
        if not h:
            w["audio_file"] = None
            continue
        disk = find_disk_id(reverse, h)
        if disk is None:
            missing.append((w["word_id"], h))
            w["audio_file"] = None
            continue
        src = ANKI_DIR / disk
        if not src.exists():
            missing.append((w["word_id"], h))
            w["audio_file"] = None
            continue
        dst_name = f"{w['word_id']}.mp3"
        shutil.copyfile(src, TARGET_DIR / dst_name)
        w["audio_file"] = dst_name
        copied += 1

    atomic_write_json(WORDS_JSON, words)

    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    else:
        manifest = {"entries": {}, "failed": {}}
    for w in words:
        if w.get("audio_file"):
            manifest["entries"][f"word_{w['word_id']}"] = {
                "voice": "hypertts",
                "at": "rubybook-import",
            }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(MANIFEST, manifest)

    print(f"[import_audio] copied={copied} missing={len(missing)}")
    if missing:
        print(f"[import_audio] missing (first 10): {missing[:10]}")


if __name__ == "__main__":
    main()
