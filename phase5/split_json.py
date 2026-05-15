"""Step 6: Split n2_questions.json into n2_questions_{R,P,U}.json.

Usage:
    python3 -m phase5.split_json [--input PATH] [--outdir DIR]
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List

DEFAULT_INPUT = Path("n2_questions.json")
DEFAULT_OUTDIR = Path(".")
DIMS = ("R", "P", "U")


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def split_by_dimension(src: Path, outdir: Path) -> Dict[str, Path]:
    all_q: List[Dict] = json.loads(src.read_text(encoding="utf-8"))
    buckets: Dict[str, List[Dict]] = {d: [] for d in DIMS}
    for q in all_q:
        d = q.get("dimension")
        if d in buckets:
            buckets[d].append(q)
    paths: Dict[str, Path] = {}
    for d in DIMS:
        p = outdir / f"n2_questions_{d}.json"
        atomic_write_json(p, buckets[d])
        paths[d] = p
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--outdir", type=Path, default=DEFAULT_OUTDIR)
    args = parser.parse_args()
    paths = split_by_dimension(args.input, args.outdir)
    for d, p in paths.items():
        n = len(json.loads(p.read_text(encoding="utf-8")))
        print(f"[split_json] {p.name}: {n} questions")


if __name__ == "__main__":
    main()
