"""Step 3: Generate questions for newly enriched words via DeepSeek V4 Flash.

Usage:
    python3 -m phase5.generate_q [--concurrency N] [--limit N] [--force] [--dry-run]
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
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "deepseek/deepseek-v4-flash")
ENRICHED_FILE = Path("n2_enriched.json")
QUESTIONS_FILE = Path("n2_questions.json")
PROMPT_FILE = Path("phase5/prompts/generate_questions.txt")
STEP_NAME = "generate_q"
NEW_WORD_ID_THRESHOLD = 450  # MVP cutoff; words with id > 450 are new


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
    new_words = [w for w in enriched if w["word_id"] > NEW_WORD_ID_THRESHOLD]

    all_questions: List[Dict] = []
    if QUESTIONS_FILE.exists():
        all_questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    progress = Progress(STEP_NAME)
    if args.force:
        progress.reset()

    todo = [w for w in new_words if not progress.is_done(w["word_id"])]
    if args.limit:
        todo = todo[: args.limit]

    print(f"[generate_q] new_words={len(new_words)} todo={len(todo)} existing_questions={len(all_questions)} model={GENERATOR_MODEL} concurrency={args.concurrency}")
    if args.dry_run:
        print("[generate_q] DRY RUN — exiting")
        return
    if not todo:
        print("[generate_q] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=GENERATOR_MODEL, concurrency=args.concurrency, temperature=0.8)
    db = connect()
    chunk_size = max(args.concurrency * 4, 32)

    try:
        with tqdm(total=len(todo), desc="generate_q") as pbar:
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
                    # Spec: 5-6 questions per word (4-5 regular + 1 listening_kanji)
                    if not isinstance(result, list):
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"expected list, got {type(result).__name__}"})
                        continue
                    if not (4 <= len(result) <= 8):
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"expected 4-8 questions, got {len(result)}"})
                        continue
                    bad = []
                    has_lk = False
                    for q_idx, q in enumerate(result):
                        if not isinstance(q, dict):
                            bad.append(f"q{q_idx}: not a dict")
                            continue
                        # Required keys
                        for required in ("dimension", "type", "options", "correct_index"):
                            if required not in q:
                                bad.append(f"q{q_idx}: missing {required}")
                        # Type checks
                        if q.get("dimension") not in ("R", "P", "U"):
                            bad.append(f"q{q_idx}: invalid dimension {q.get('dimension')!r}")
                        if not isinstance(q.get("correct_index"), int):
                            bad.append(f"q{q_idx}: correct_index not int (got {type(q.get('correct_index')).__name__})")
                        opts = q.get("options")
                        if not isinstance(opts, list) or len(opts) != 4:
                            bad.append(f"q{q_idx}: options must be list of 4 (got {type(opts).__name__} len={len(opts) if hasattr(opts, '__len__') else 'N/A'})")
                        else:
                            for o_idx, o in enumerate(opts):
                                if not isinstance(o, dict) or "text" not in o:
                                    bad.append(f"q{q_idx}.opt{o_idx}: must be dict with 'text' key")
                        # correct_index range
                        ci = q.get("correct_index")
                        if isinstance(ci, int) and isinstance(opts, list) and not (0 <= ci < len(opts)):
                            bad.append(f"q{q_idx}: correct_index {ci} out of range for {len(opts) if hasattr(opts, '__len__') else 0} options")
                        if q.get("type") == "listening_kanji":
                            has_lk = True
                    if not has_lk:
                        bad.append("missing listening_kanji question")
                    if bad:
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": f"malformed questions: {bad}"})
                        continue
                    for q_idx, q in enumerate(result):
                        q["word_id"] = w["word_id"]
                        if "id" not in q or not q["id"]:
                            q["id"] = f"word_{w['word_id']}_{q.get('type', 'unknown')}_{q_idx + 1}"
                        upsert_question(db, q)
                        all_questions.append(q)
                    atomic_write_json(QUESTIONS_FILE, all_questions)
                    progress.mark_done(w["word_id"])
    finally:
        db.close()

    print(f"[generate_q] done. total questions: {len(all_questions)}")


if __name__ == "__main__":
    main()
