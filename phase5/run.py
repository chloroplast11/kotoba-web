"""Phase 5 main entry. Dispatches subcommands to each step.

Usage:
    python3 -m phase5.run <step> [step-args]

Steps:
    import-anki         Step 1: parse Anki collection.anki2 → n2_words.json
    import-audio        Step 2: copy hypertts mp3 → public/audio/words/
    generate-q          Step 3: AI generate R/P/U questions
    validate-q          Step 4: Qwen validates all questions
    split-json          Step 5: split questions JSON by dimension
    all                 Run 1-5 in sequence (use with care)
"""
from __future__ import annotations

import os
import sys
import subprocess

STEPS = {
    "import-anki":   "phase5.import_anki",
    "import-audio":  "phase5.import_audio",
    "generate-q":    "phase5.generate_q",
    "validate-q":    "phase5.validate_q",
    "split-json":    "phase5.split_json",
}

ORDER = ["import-anki", "import-audio", "generate-q", "validate-q", "split-json"]


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
        print("WARNING: running all 5 steps in sequence. Ctrl-C to abort.")
        for s in ORDER:
            rc = run_one(s, [])
            if rc != 0:
                print(f"\nStep '{s}' failed with exit code {rc}. Aborting.", file=sys.stderr)
                return rc
        return 0

    return run_one(step, extra)


if __name__ == "__main__":
    sys.exit(main())
