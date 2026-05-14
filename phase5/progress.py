"""Per-step resumable progress tracker. JSON file, atomic writes."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Set

PROGRESS_DIR = Path(".phase5_progress")


class Progress:
    def __init__(self, step_name: str) -> None:
        self._lock = threading.Lock()
        self._path = PROGRESS_DIR / f"{step_name}.json"
        self._done: Set[str] = set()
        PROGRESS_DIR.mkdir(exist_ok=True)
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
                self._done = set(data.get("done", []))
            except (json.JSONDecodeError, OSError):
                # corrupted progress file; start fresh but back it up
                self._path.rename(self._path.with_suffix(".json.corrupt"))

    def is_done(self, key) -> bool:
        return str(key) in self._done

    def mark_done(self, key) -> None:
        with self._lock:
            self._done.add(str(key))
            self._flush()

    def done_count(self) -> int:
        return len(self._done)

    def reset(self) -> None:
        with self._lock:
            self._done.clear()
            if self._path.exists():
                self._path.unlink()

    def _flush(self) -> None:
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps({"done": sorted(self._done)}, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(tmp, self._path)
