"""Static (deterministic) validation pass — catches mechanical violations
LLM validators tend to hallucinate on.

Checks performed:
1. `answer_leak_listening_kanji`: listening_kanji options contain `<ruby>` or `<rt>`
2. `ruby_format`: nested ruby / kana wrapped in ruby / malformed HTML
   (Re-uses phase5.fix_questions.fix_ruby for detection — counter > 0 means broken.)

Usage:
    python3 -m phase5.validate_static [--file n2_questions.json]
    -> writes static_validation_report.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from phase5.fix_questions import fix_ruby

# Matches any of the broken HTML patterns we cannot mechanically fix.
BROKEN_HTML_PATTERN = re.compile(
    r'<rubyrt|<ruby<ruby|<ruby[^>]*<ruby|<ruby[^>a-z/]|<ruby[」]|<rt[^>]*=|</rubyrt>'
)


def detect_listening_kanji_leak(q: dict) -> list[str]:
    if q.get("type") != "listening_kanji":
        return []
    leaks = []
    for i, opt in enumerate(q.get("options", [])):
        text = opt.get("text", "") if isinstance(opt, dict) else ""
        if "<ruby" in text or "<rt" in text:
            leaks.append(f"option[{i}] contains ruby/rt tag")
    return leaks


def detect_ruby_format_issues(q: dict) -> list[str]:
    """Returns list of human-readable issue descriptions for broken ruby in
    any string field of the question."""
    issues = []
    fields = ("question", "explanation", "explanation_zh")
    for f in fields:
        v = q.get(f)
        if not isinstance(v, str):
            continue
        if BROKEN_HTML_PATTERN.search(v):
            issues.append(f"{f}: broken HTML tag pattern")
            continue
        _, counters = fix_ruby(v, fix_empty_rt=False)
        if counters["nested"] > 0:
            issues.append(f"{f}: nested ruby x{counters['nested']}")
        if counters["kana_wrap"] > 0:
            issues.append(f"{f}: kana wrapped in ruby x{counters['kana_wrap']}")
    for i, opt in enumerate(q.get("options", [])):
        v = opt.get("text", "") if isinstance(opt, dict) else ""
        if not isinstance(v, str):
            continue
        if BROKEN_HTML_PATTERN.search(v):
            issues.append(f"option[{i}]: broken HTML tag pattern")
            continue
        _, counters = fix_ruby(v, fix_empty_rt=False)
        if counters["nested"] > 0:
            issues.append(f"option[{i}]: nested ruby x{counters['nested']}")
        if counters["kana_wrap"] > 0:
            issues.append(f"option[{i}]: kana wrapped in ruby x{counters['kana_wrap']}")
    return issues


def validate_static(questions: list[dict]) -> dict[str, Any]:
    report: dict[str, Any] = {
        "total_questions": len(questions),
        "answer_leak_listening_kanji": [],
        "ruby_format": [],
    }
    for q in questions:
        leaks = detect_listening_kanji_leak(q)
        if leaks:
            report["answer_leak_listening_kanji"].append(
                {"question_id": q.get("id"), "word_id": q.get("word_id"), "issues": leaks}
            )
        ruby_issues = detect_ruby_format_issues(q)
        if ruby_issues:
            report["ruby_format"].append(
                {"question_id": q.get("id"), "word_id": q.get("word_id"), "issues": ruby_issues}
            )
    report["counters"] = {
        "answer_leak_listening_kanji": len(report["answer_leak_listening_kanji"]),
        "ruby_format": len(report["ruby_format"]),
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="n2_questions.json")
    parser.add_argument("--out", default="static_validation_report.json")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"[validate_static] file not found: {path}")
        return 1

    questions = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(questions, list):
        print("[validate_static] expected top-level JSON array")
        return 1

    report = validate_static(questions)
    out = Path(args.out)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    c = report["counters"]
    print(f"[validate_static] total questions: {report['total_questions']}")
    print(f"[validate_static] answer_leak_listening_kanji: {c['answer_leak_listening_kanji']}")
    print(f"[validate_static] ruby_format issues:          {c['ruby_format']}")
    print(f"[validate_static] report written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
