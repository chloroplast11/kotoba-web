"""Step 2: Validate enriched words via Qwen 2.5 72B.

Usage:
    python3 -m phase5.validate_enrich [--concurrency N] [--limit N] [--force] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List

from tqdm import tqdm

from phase5.db_writer import connect, set_word_quality
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

VALIDATOR_MODEL = os.getenv("VALIDATOR_MODEL", "qwen/qwen-2.5-72b-instruct")
INPUT_FILE = Path("n2_enriched.json")
PROMPT_FILE = Path("phase5/prompts/validate_word.txt")
REPORT_FILE = Path("validation_report.json")
REJECTED_FILE = Path("rejected_words.json")
FAILED_FILE = Path("failed_items.json")
STEP_NAME = "validate_enrich"


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def append_failed(item: Dict) -> None:
    existing: List[Dict] = []
    if FAILED_FILE.exists():
        try:
            existing = json.loads(FAILED_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = []
    existing.append(item)
    atomic_write_json(FAILED_FILE, existing)


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

    enriched: List[Dict] = json.loads(INPUT_FILE.read_text(encoding="utf-8"))
    progress = Progress(STEP_NAME)
    if args.force:
        progress.reset()
        for p in (REPORT_FILE, REJECTED_FILE):
            if p.exists():
                p.unlink()

    todo = [w for w in enriched if not progress.is_done(w["word_id"])]
    if args.limit:
        todo = todo[: args.limit]

    print(f"[validate_enrich] total={len(enriched)} todo={len(todo)} model={VALIDATOR_MODEL} concurrency={args.concurrency}")
    if args.dry_run:
        print("[validate_enrich] DRY RUN — exiting")
        return
    if not todo:
        print("[validate_enrich] nothing to do")
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
        with tqdm(total=len(todo), desc="validate_enrich") as pbar:
            for chunk_start in range(0, len(todo), chunk_size):
                chunk = todo[chunk_start:chunk_start + chunk_size]
                prompts = [
                    prompt_template.format(enriched_word_json=json.dumps(w, ensure_ascii=False, indent=2))
                    for w in chunk
                ]

                for idx, result, err in client.call_many(prompts):
                    w = chunk[idx]
                    pbar.update(1)
                    if err is not None or not isinstance(result, dict):
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "error": str(err) if err else "non-dict result"})
                        continue
                    if "quality_score" not in result or "validation_status" not in result:
                        append_failed({"step": STEP_NAME, "word_id": w["word_id"], "error": f"missing fields in validation: keys={list(result.keys())}"})
                        continue
                    score = int(result.get("quality_score", 0))
                    status = result.get("validation_status", "needs_review")
                    needs_review = status != "approved"
                    set_word_quality(db, w["word_id"], score=score, needs_review=needs_review)
                    report.append({"word_id": w["word_id"], "word": w["word"], "validation": result})
                    atomic_write_json(REPORT_FILE, report)
                    if status == "rejected":
                        rejected.append({"word_id": w["word_id"], "word": w["word"], "score": score, "issues": result.get("issues", [])})
                        atomic_write_json(REJECTED_FILE, rejected)
                    progress.mark_done(w["word_id"])
    finally:
        db.close()

    approved = sum(1 for r in report if r["validation"].get("validation_status") == "approved")
    needs = sum(1 for r in report if r["validation"].get("validation_status") == "needs_review")
    rej = sum(1 for r in report if r["validation"].get("validation_status") == "rejected")
    print(f"[validate_enrich] approved={approved} needs_review={needs} rejected={rej}")


if __name__ == "__main__":
    main()
