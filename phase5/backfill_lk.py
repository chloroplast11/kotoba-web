"""Step 4: Backfill 1 listening_kanji question for each MVP word (id <= 450)
that doesn't already have one. Uses DeepSeek V4 Flash.

Usage:
    python3 -m phase5.backfill_lk [--concurrency N] [--limit N] [--force] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List

from tqdm import tqdm

from phase5.db_writer import connect, upsert_question
from phase5.io_utils import atomic_write_json, append_failed
from phase5.llm_client import LLMClient, LLMError, parse_provider_order
from phase5.progress import Progress

GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "deepseek/deepseek-v4-flash")
GENERATOR_PROVIDER_ORDER = parse_provider_order(os.getenv("GENERATOR_PROVIDER_ORDER"))
ENRICHED_FILE = Path("n2_enriched.json")
QUESTIONS_FILE = Path("n2_questions.json")
PROMPT_FILE = Path("phase5/prompts/backfill_lk.txt")
STEP_NAME = "backfill_lk"
MVP_THRESHOLD = 450


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not ENRICHED_FILE.exists() or not PROMPT_FILE.exists():
        print(f"Missing {ENRICHED_FILE} or {PROMPT_FILE}", file=sys.stderr)
        sys.exit(1)

    enriched: List[Dict] = json.loads(ENRICHED_FILE.read_text(encoding="utf-8"))
    mvp_words = [w for w in enriched if w["word_id"] <= MVP_THRESHOLD]

    all_questions: List[Dict] = []
    if QUESTIONS_FILE.exists():
        all_questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    existing_lk_word_ids = {
        q["word_id"] for q in all_questions if q.get("type") == "listening_kanji"
    }

    progress = Progress(STEP_NAME)
    if args.force:
        progress.reset()

    todo = [
        w for w in mvp_words
        if w["word_id"] not in existing_lk_word_ids
        and not progress.is_done(w["word_id"])
    ]
    if args.limit:
        todo = todo[: args.limit]

    print(f"[backfill_lk] mvp={len(mvp_words)} already_have_lk={len(existing_lk_word_ids)} todo={len(todo)} model={GENERATOR_MODEL} concurrency={args.concurrency}")
    if GENERATOR_PROVIDER_ORDER:
        print(f"[backfill_lk] provider_order={GENERATOR_PROVIDER_ORDER}")
    if args.dry_run:
        print("[backfill_lk] DRY RUN — exiting")
        return
    if not todo:
        print("[backfill_lk] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=GENERATOR_MODEL, concurrency=args.concurrency, temperature=0.8, provider_order=GENERATOR_PROVIDER_ORDER)
    db = connect()
    chunk_size = max(args.concurrency * 4, 32)

    try:
        with tqdm(total=len(todo), desc="backfill_lk") as pbar:
            for chunk_start in range(0, len(todo), chunk_size):
                chunk = todo[chunk_start:chunk_start + chunk_size]
                prompts = [
                    prompt_template.format(enriched_word_json=json.dumps(w, ensure_ascii=False, indent=2))
                    for w in chunk
                ]

                for idx, result, err in client.call_many(prompts):
                    w = chunk[idx]
                    pbar.update(1)
                    if err is not None:
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": str(err)})
                        continue
                    if not isinstance(result, list) or len(result) != 1:
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"expected list of exactly 1 question, got {type(result).__name__} len={len(result) if hasattr(result, '__len__') else 'N/A'}"})
                        continue
                    q = result[0]
                    if not isinstance(q, dict):
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": "question is not a dict"})
                        continue
                    opts = q.get("options")
                    if not isinstance(opts, list) or len(opts) != 4:
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"options must be list of 4 (got {type(opts).__name__})"})
                        continue
                    bad_opts = [o_idx for o_idx, o in enumerate(opts) if not isinstance(o, dict) or "text" not in o]
                    if bad_opts:
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"bad option dicts at indices {bad_opts}"})
                        continue
                    ci = q.get("correct_index")
                    if not isinstance(ci, int) or not (0 <= ci < 4):
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"correct_index must be int 0-3, got {ci!r}"})
                        continue
                    q["word_id"] = w["word_id"]
                    q["type"] = "listening_kanji"
                    q["dimension"] = "R"
                    q["id"] = f"word_{w['word_id']}_listening_kanji_bf1"
                    upsert_question(db, q)
                    all_questions.append(q)
                    atomic_write_json(QUESTIONS_FILE, all_questions)
                    progress.mark_done(w["word_id"])
    finally:
        db.close()

    print(f"[backfill_lk] done. total questions: {len(all_questions)}")


if __name__ == "__main__":
    main()
