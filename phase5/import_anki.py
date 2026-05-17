# phase5/import_anki.py
"""Step 1 (new): parse Anki collection.anki2 → n2_words.json.

Pure functions are unit-tested; main() is integration-tested by running
against the real collection.anki2 and inspecting output.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

from phase5.io_utils import atomic_write_json

ANKI_DB = Path("N2/collection.anki2")
OUTPUT_FILE = Path("n2_words.json")
RUBYBOOK_MID = 1452150778360  # model id for 红宝书卡牌

EXPRESSION_RE = re.compile(r"^(.+?)\[(.+?)\]$")
POS_RE = re.compile(r"^\s*\[([^\]]+)\]\s*(.*)$", re.DOTALL)
SOUND_RE = re.compile(r"\[sound:([^\]]+)\]")
SENTENCE_SPLIT_RE = re.compile(r"△")


def parse_expression(s: str) -> Tuple[str, str]:
    m = EXPRESSION_RE.match(s.strip())
    if not m:
        raise ValueError(f"Expression does not match 'word[furigana]': {s!r}")
    return m.group(1), m.group(2)


def strip_html(html: str) -> str:
    if not html:
        return ""
    return BeautifulSoup(html, "html.parser").get_text().strip()


def extract_pos_and_meaning(text: str) -> Tuple[str, str]:
    m = POS_RE.match(text)
    if not m:
        return "", text.strip()
    return m.group(1).strip(), m.group(2).strip()


def parse_example_sentences(text: str) -> List[Dict[str, str]]:
    if not text:
        return []
    parts = [p.strip() for p in SENTENCE_SPLIT_RE.split(text) if p.strip()]
    out: List[Dict[str, str]] = []
    for p in parts:
        if "/" in p:
            jp, zh = p.split("/", 1)
            out.append({"jp": jp.strip(), "zh": zh.strip()})
        else:
            out.append({"jp": p.strip(), "zh": ""})
    return out


def parse_sound_ref(text: str) -> Optional[str]:
    m = SOUND_RE.search(text or "")
    return m.group(1) if m else None


def parse_note(note_id: int, flds: str) -> Optional[Dict]:
    """flds 字段以 \\x1f 分隔，按红宝书牌组顺序：
    0=Expression 1=声调 2=中文释义 3=例句 4=惯用 5=同音 6=Pronunciation"""
    parts = flds.split("\x1f")
    if len(parts) != 7:
        return None
    try:
        word, furigana = parse_expression(parts[0])
    except ValueError:
        return None
    pitch_raw = parts[1].strip()
    pos, meaning_zh = extract_pos_and_meaning(strip_html(parts[2]))
    examples = parse_example_sentences(strip_html(parts[3]))
    synonyms = strip_html(parts[4])
    homophones = strip_html(parts[5])
    audio_hash = parse_sound_ref(parts[6])
    return {
        "word_id": note_id,
        "word": word,
        "furigana": furigana,
        "pitch_accent": pitch_raw or None,
        "meaning_zh": meaning_zh,
        "pos": pos,
        "example_sentences": examples,
        "synonyms": synonyms or None,
        "homophones": homophones or None,
        "audio_hash": audio_hash,
        "level": 2,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=ANKI_DB)
    parser.add_argument("--out", type=Path, default=OUTPUT_FILE)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if not args.db.exists():
        print(f"Missing {args.db}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(args.db))
    rows = conn.execute(
        "SELECT id, flds FROM notes WHERE mid=? ORDER BY id",
        (RUBYBOOK_MID,),
    ).fetchall()
    conn.close()

    parsed: List[Dict] = []
    skipped: List[int] = []
    for note_id, flds in rows:
        rec = parse_note(note_id, flds)
        if rec is None:
            skipped.append(note_id)
            continue
        parsed.append(rec)
        if args.limit and len(parsed) >= args.limit:
            break

    atomic_write_json(args.out, parsed)
    print(f"[import_anki] notes={len(rows)} parsed={len(parsed)} skipped={len(skipped)} → {args.out}")
    if skipped:
        print(f"[import_anki] skipped note ids (first 10): {skipped[:10]}")


if __name__ == "__main__":
    main()
