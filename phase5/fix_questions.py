"""Fix mechanical ruby annotation breakage in n2_questions.json.

Targets three classes of broken ruby (others left for validation pass):
1. Empty ruby: <ruby>X</ruby> or <ruby>X<rt></rt></ruby> -> X (lose annotation, keep text)
2. Nested ruby: <ruby>A<rt>a</rt>...<ruby>B<rt>b</rt></ruby>...<rt>c</rt></ruby>
   -> unwrap outer (keep inner intact, outer's orphan <rt>s removed)
3. Kana wrapped in ruby: <ruby>やすやす<rt>やすやす</rt></ruby> -> やすやす

Reads n2_questions.json, rewrites in place after backup to
n2_questions.json.bak. Prints per-class counters.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, NavigableString


HIRAGANA = (0x3040, 0x309F)
KATAKANA = (0x30A0, 0x30FF)
KANA_EXTRA = set("ー・〜＝　 ")


def is_kana_only(s: str) -> bool:
    if not s:
        return False
    for ch in s:
        cp = ord(ch)
        if HIRAGANA[0] <= cp <= HIRAGANA[1]:
            continue
        if KATAKANA[0] <= cp <= KATAKANA[1]:
            continue
        if ch in KANA_EXTRA:
            continue
        return False
    return True


def fix_ruby(html: str, fix_empty_rt: bool = False) -> tuple[str, dict[str, int]]:
    counters = {"empty_rt": 0, "nested": 0, "kana_wrap": 0}
    if "<ruby" not in html:
        return html, counters
    soup = BeautifulSoup(html, "html.parser")

    # Pass 1: unwrap any outer <ruby> that contains another <ruby>.
    # Loop until none remain (handles >2 deep nesting).
    while True:
        outer = None
        for ruby in soup.find_all("ruby"):
            if ruby.find("ruby") is not None:
                outer = ruby
                break
        if outer is None:
            break
        for rt in [c for c in list(outer.children) if getattr(c, "name", None) == "rt"]:
            rt.decompose()
        outer.unwrap()
        counters["nested"] += 1

    # Pass 2: kana-wrap (and optionally empty-rt). Re-find since unwrap mutated tree.
    for ruby in list(soup.find_all("ruby")):
        rts = [c for c in ruby.children if getattr(c, "name", None) == "rt"]
        surface_parts: list[str] = []
        for c in ruby.children:
            if getattr(c, "name", None) == "rt":
                continue
            surface_parts.append(c.get_text() if hasattr(c, "get_text") else str(c))
        surface = "".join(surface_parts)
        rt_text = "".join(rt.get_text() for rt in rts).strip()

        if fix_empty_rt and (not rts or not rt_text):
            ruby.replace_with(NavigableString(surface))
            counters["empty_rt"] += 1
            continue
        if is_kana_only(surface):
            ruby.replace_with(NavigableString(surface))
            counters["kana_wrap"] += 1
            continue

    return str(soup), counters


def fix_question(
    q: dict[str, Any], counters: dict[str, int], fix_empty_rt: bool = False
) -> dict[str, int]:
    """Mutates q in place. Returns per-question delta for reporting."""
    delta = {"empty_rt": 0, "nested": 0, "kana_wrap": 0}
    for field in ("question", "explanation", "explanation_zh"):
        v = q.get(field)
        if isinstance(v, str):
            fixed, c = fix_ruby(v, fix_empty_rt=fix_empty_rt)
            if fixed != v:
                q[field] = fixed
            for k in delta:
                delta[k] += c[k]
    for opt in q.get("options", []):
        v = opt.get("text")
        if isinstance(v, str):
            fixed, c = fix_ruby(v, fix_empty_rt=fix_empty_rt)
            if fixed != v:
                opt["text"] = fixed
            for k in delta:
                delta[k] += c[k]
    for k in delta:
        counters[k] += delta[k]
    return delta


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="n2_questions.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument(
        "--fix-empty-rt",
        action="store_true",
        help="also strip <ruby>X</ruby> with no/empty <rt> (default: leave as-is, browsers render fine)",
    )
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"[fix_q] file not found: {path}")
        return 1

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        print("[fix_q] expected top-level JSON array")
        return 1

    counters = {"empty_rt": 0, "nested": 0, "kana_wrap": 0}
    touched_questions = 0
    for q in data:
        delta = fix_question(q, counters, fix_empty_rt=args.fix_empty_rt)
        if any(v > 0 for v in delta.values()):
            touched_questions += 1

    print(f"[fix_q] total questions: {len(data)}")
    print(f"[fix_q] questions touched: {touched_questions}")
    print(f"[fix_q] empty_rt fixes:   {counters['empty_rt']}")
    print(f"[fix_q] nested fixes:     {counters['nested']}")
    print(f"[fix_q] kana_wrap fixes:  {counters['kana_wrap']}")

    if args.dry_run:
        print("[fix_q] --dry-run, not writing")
        return 0

    if not args.no_backup:
        bak = path.with_suffix(path.suffix + ".bak")
        shutil.copy2(path, bak)
        print(f"[fix_q] backup written: {bak}")

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[fix_q] wrote: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
