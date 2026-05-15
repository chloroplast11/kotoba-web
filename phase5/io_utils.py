"""Small IO helpers shared across phase5 step scripts."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List

FAILED_FILE = Path("failed_items.json")


def atomic_write_json(path: Path, data) -> None:
    """Write JSON with tmp + rename for atomicity. Crash-safe."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def append_failed(item: Dict) -> None:
    """Append a failure record to failed_items.json. Tolerant to missing/corrupt file."""
    existing: List[Dict] = []
    if FAILED_FILE.exists():
        try:
            existing = json.loads(FAILED_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = []
    existing.append(item)
    atomic_write_json(FAILED_FILE, existing)
