"""Phase 5 main entry. Dispatches subcommands to each step.

Usage:
    python3 -m phase5.run <step> [step-args]

Steps:
    enrich              Step 1: enrich new N2 words (DeepSeek)
    validate-enrich     Step 2: Qwen validates enriched words
    generate-q          Step 3: generate questions for new words
    backfill-lk         Step 4: backfill listening_kanji for MVP 450 words
    validate-q          Step 5: Qwen validates all questions
    split-json          Step 6: split questions JSON by dimension
    all                 Run 1-6 in sequence (NOT recommended for first run)
"""
from __future__ import annotations

import os
import sys
import subprocess

STEPS = {
    "enrich":          "phase5.enrich",
    "validate-enrich": "phase5.validate_enrich",
    "generate-q":      "phase5.generate_q",
    "backfill-lk":     "phase5.backfill_lk",
    "validate-q":      "phase5.validate_q",
    "split-json":      "phase5.split_json",
}

ORDER = ["enrich", "validate-enrich", "generate-q", "backfill-lk", "validate-q", "split-json"]


def help_msg() -> str:
    return (
        "Usage: python3 -m phase5.run <step> [args...]\n"
        "Steps:\n"
        + "\n".join(f"  {s:<18} → {m}" for s, m in STEPS.items())
        + "\n  all                run all steps in order (use with care)"
    )


def run_one(step: str, extra: list) -> int:
    if step not in STEPS:
        print(f"Unknown step: {step}\n\n{help_msg()}", file=sys.stderr)
        return 2
    cmd = [sys.executable, "-m", STEPS[step], *extra]
    print(f"$ {' '.join(cmd)}")
    return subprocess.call(cmd)


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(help_msg())
        return 0

    step = sys.argv[1]
    extra = sys.argv[2:]

    if step == "all":
        print("WARNING: running all 6 steps in sequence. Ctrl-C to abort.")
        for s in ORDER:
            rc = run_one(s, [])
            if rc != 0:
                print(f"\nStep '{s}' failed with exit code {rc}. Aborting.", file=sys.stderr)
                return rc
        return 0

    return run_one(step, extra)


if __name__ == "__main__":
    sys.exit(main())
