"""Step 5: Validate all questions via Qwen 2.5 72B (independent answering).

Batches questions by word_id (~5-6 questions per batch). Each batch is one
LLM call. Resume key = word_id.

Usage:
    python3 -m phase5.validate_q [--concurrency N] [--limit N] [--force]
                                  [--dim R|P|U] [--sample-pct PCT] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from tqdm import tqdm

from phase5.db_writer import connect, set_question_quality
from phase5.io_utils import atomic_write_json, append_failed
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

VALIDATOR_MODEL = os.getenv("VALIDATOR_MODEL", "qwen/qwen-2.5-72b-instruct")
QUESTIONS_FILE = Path("n2_questions.json")
PROMPT_FILE = Path("phase5/prompts/validate_questions.txt")
REPORT_FILE = Path("question_validation_report.json")
REJECTED_FILE = Path("rejected_questions.json")
STEP_NAME = "validate_q"

VALID_STATUSES = ("approved", "needs_review", "rejected")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None, help="limit number of word_id batches")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dim", choices=["R", "P", "U"], default=None)
    parser.add_argument("--sample-pct", type=float, default=100.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not QUESTIONS_FILE.exists() or not PROMPT_FILE.exists():
        print(f"Missing {QUESTIONS_FILE} or {PROMPT_FILE}", file=sys.stderr)
        sys.exit(1)

    all_questions: List[Dict] = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    # Optional dim filter
    if args.dim:
        all_questions = [q for q in all_questions if q.get("dimension") == args.dim]

    # Batch by word_id
    batches: Dict[int, List[Dict]] = defaultdict(list)
    for q in all_questions:
        batches[q["word_id"]].append(q)

    word_ids = sorted(batches.keys())  # deterministic order

    # Sample
    if args.sample_pct < 100.0:
        n = max(1, int(len(word_ids) * args.sample_pct / 100.0))
        random.seed(42)
        word_ids = sorted(random.sample(word_ids, n))

    progress_name = STEP_NAME + (f"_{args.dim}" if args.dim else "")
    progress = Progress(progress_name)
    if args.force:
        progress.reset()
        for p in (REPORT_FILE, REJECTED_FILE):
            if p.exists():
                p.unlink()

    todo_ids = [wid for wid in word_ids if not progress.is_done(wid)]
    if args.limit:
        todo_ids = todo_ids[: args.limit]

    print(f"[validate_q] batches={len(word_ids)} todo={len(todo_ids)} questions_in_todo={sum(len(batches[w]) for w in todo_ids)} model={VALIDATOR_MODEL}")
    if args.dry_run:
        print("[validate_q] DRY RUN — exiting")
        return
    if not todo_ids:
        print("[validate_q] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=VALIDATOR_MODEL, concurrency=args.concurrency, temperature=0.3)
    db = connect()
    chunk_size = max(args.concurrency * 4, 32)

    report: List[Dict] = []
    if REPORT_FILE.exists():
        try:
            report = json.loads(REPORT_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            report = []
    rejected: List[Dict] = []
    if REJECTED_FILE.exists():
        try:
            rejected = json.loads(REJECTED_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            rejected = []

    try:
        with tqdm(total=len(todo_ids), desc="validate_q") as pbar:
            for chunk_start in range(0, len(todo_ids), chunk_size):
                chunk_ids = todo_ids[chunk_start:chunk_start + chunk_size]
                prompts = [
                    prompt_template.format(questions_json=json.dumps(batches[wid], ensure_ascii=False, indent=2))
                    for wid in chunk_ids
                ]

                for idx, result, err in client.call_many(prompts, max_retries=3):
                    wid = chunk_ids[idx]
                    pbar.update(1)
                    if err is not None:
                        append_failed({"step": STEP_NAME, "word_id": wid, "error": str(err)})
                        continue
                    if not isinstance(result, dict):
                        append_failed({"step": STEP_NAME, "word_id": wid, "error": f"non-dict result: {type(result).__name__}"})
                        continue
                    qvals = result.get("question_validations")
                    if not isinstance(qvals, list):
                        append_failed({"step": STEP_NAME, "word_id": wid, "error": "missing or non-list question_validations"})
                        continue
                    # Process each per-question validation: DB first, then collect
                    for qval in qvals:
                        if not isinstance(qval, dict):
                            continue
                        qid = qval.get("question_id")
                        if not qid:
                            continue
                        try:
                            score = int(qval["quality_score"])
                        except (KeyError, ValueError, TypeError):
                            append_failed({"step": STEP_NAME, "word_id": wid, "question_id": qid, "error": f"bad quality_score: {qval.get('quality_score')!r}"})
                            continue
                        status = qval.get("validation_status")
                        if status not in VALID_STATUSES:
                            append_failed({"step": STEP_NAME, "word_id": wid, "question_id": qid, "error": f"unknown validation_status: {status!r}"})
                            continue
                        needs_review = status != "approved"
                        # DB first
                        set_question_quality(db, qid, score=score, needs_review=needs_review)
                        if status == "rejected":
                            rejected.append({"question_id": qid, "word_id": wid, "score": score, "issues": qval.get("issues", [])})
                    # Then JSON snapshot, then progress
                    report.append({"word_id": wid, "validation": result})
                    atomic_write_json(REPORT_FILE, report)
                    atomic_write_json(REJECTED_FILE, rejected)
                    progress.mark_done(wid)
    finally:
        db.close()

    total_q_attempted = sum(len(batches[wid]) for wid in todo_ids)
    print(f"[validate_q] processed {len(todo_ids)} batches / ~{total_q_attempted} questions. rejected={len(rejected)}")


if __name__ == "__main__":
    main()
