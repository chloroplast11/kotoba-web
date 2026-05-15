"""Step 1: Enrich new N2 words via DeepSeek V4 Flash.

Usage:
    python3 -m phase5.enrich [--concurrency N] [--limit N] [--force] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List

from tqdm import tqdm

from phase5.db_writer import connect, max_word_id, upsert_word
from phase5.io_utils import atomic_write_json, append_failed
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "deepseek/deepseek-v4-flash")
INPUT_FILE = Path("n2.json")
OUTPUT_FILE = Path("n2_enriched.json")
PROMPT_FILE = Path("phase5/prompts/enrich_word.txt")
STEP_NAME = "enrich"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not INPUT_FILE.exists() or not PROMPT_FILE.exists():
        print(f"Missing {INPUT_FILE} or {PROMPT_FILE}", file=sys.stderr)
        sys.exit(1)

    all_words: List[Dict] = json.loads(INPUT_FILE.read_text(encoding="utf-8"))
    enriched: List[Dict] = []
    if OUTPUT_FILE.exists():
        enriched = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    existing_words = {w["word"] for w in enriched}

    progress = Progress(STEP_NAME)
    if args.force:
        progress.reset()

    todo = [w for w in all_words if w["word"] not in existing_words and not progress.is_done(w["word"])]
    if args.limit:
        todo = todo[: args.limit]

    print(f"[enrich] total={len(all_words)} existing={len(existing_words)} todo={len(todo)} model={GENERATOR_MODEL} concurrency={args.concurrency}")

    if args.dry_run:
        print("[enrich] DRY RUN — exiting")
        return

    if not todo:
        print("[enrich] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=GENERATOR_MODEL, concurrency=args.concurrency)
    db = connect()
    chunk_size = max(args.concurrency * 4, 32)

    try:
        next_id = max_word_id(db) + 1
        id_map: Dict[str, int] = {}
        for w in todo:
            id_map[w["word"]] = next_id
            next_id += 1

        with tqdm(total=len(todo), desc="enrich") as pbar:
            for chunk_start in range(0, len(todo), chunk_size):
                chunk = todo[chunk_start:chunk_start + chunk_size]
                prompts = [
                    prompt_template.format(
                        word=w["word"],
                        meaning=w["meaning"],
                        furigana=w.get("furigana", ""),
                        romaji=w.get("romaji", ""),
                        level=w.get("level", 2),
                    )
                    for w in chunk
                ]

                for idx, result, err in client.call_many(prompts):
                    w = chunk[idx]
                    pbar.update(1)
                    if err is not None or not isinstance(result, dict):
                        append_failed({"step": STEP_NAME, "word": w["word"], "error": str(err) if err else "non-dict result"})
                        continue
                    result["word_id"] = id_map[w["word"]]
                    result.setdefault("word", w["word"])
                    result.setdefault("furigana", w.get("furigana", ""))
                    result.setdefault("romaji", w.get("romaji", ""))
                    result.setdefault("level", w.get("level", 2))
                    # Validate critical fields are non-empty (LLM sometimes returns empty/null)
                    required_fields = ("meaning_zh", "pos", "frequency")
                    missing = [f for f in required_fields if not result.get(f)]
                    if missing:
                        append_failed({"step": STEP_NAME, "word": w["word"], "error": f"missing fields: {missing}"})
                        continue
                    upsert_word(db, result)
                    enriched.append(result)
                    atomic_write_json(OUTPUT_FILE, enriched)
                    progress.mark_done(w["word"])
    finally:
        db.close()

    print(f"[enrich] done. total enriched: {len(enriched)}")


if __name__ == "__main__":
    main()
