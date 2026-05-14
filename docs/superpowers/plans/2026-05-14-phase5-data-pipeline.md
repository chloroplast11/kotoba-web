# Phase 5 Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully resumable Python pipeline that extends N2 vocabulary from 450 MVP words to 1832 (1382 new + 450 MVP) with LLM-generated enrichment and questions, cross-validated by a different model, written simultaneously to JSON and `dev.db`.

**Architecture:** Six independent step scripts under `phase5/`, each safely Ctrl-C resumable via per-step progress files. Shared modules for OpenRouter LLM client (concurrent, retry, rate-limited), direct sqlite3 upsert, and progress tracking. Generation uses DeepSeek V4 Flash; validation uses Qwen 2.5 72B Instruct (different lineage, real cross-model validation).

**Tech Stack:** Python 3.9+, `openai` SDK (pointing at OpenRouter), Python stdlib `sqlite3`, `concurrent.futures.ThreadPoolExecutor`, `tqdm`. No new npm deps.

**Reference spec:** [`docs/superpowers/specs/2026-05-14-phase5-data-pipeline-design.md`](../specs/2026-05-14-phase5-data-pipeline-design.md)

**Schema migration:** Already applied (`20260514132833_phase5_quality_fields`). `Word` and `Question` tables now have `qualityScore Int?` and `needsReview Boolean DEFAULT false`.

---

## File Map

```
phase5/
├── __init__.py                # empty marker
├── run.py                     # CLI dispatcher
├── llm_client.py              # OpenRouter wrapper with retry + concurrency
├── db_writer.py               # sqlite3 upsert helpers
├── progress.py                # per-step resumable progress state
├── enrich.py                  # Step 1: enrich 1382 new words
├── validate_enrich.py         # Step 2: Qwen validates all 1832 words
├── generate_q.py              # Step 3: generate questions for new 1382 words
├── backfill_lk.py             # Step 4: add listening_kanji to MVP 450 words
├── validate_q.py              # Step 5: Qwen validates all questions
├── split_json.py              # Step 6: split n2_questions.json by dimension
├── prompts/
│   ├── enrich_word.txt        # revised from prompts/enrich_word.txt
│   ├── validate_word.txt      # revised
│   ├── generate_questions.txt # revised (furigana rule clarified)
│   ├── backfill_lk.txt        # NEW
│   └── validate_questions.txt # revised
└── tests/
    ├── __init__.py
    ├── test_progress.py
    ├── test_db_writer.py
    ├── test_split_json.py
    └── test_llm_client.py     # mocked

.phase5_progress/              # gitignore'd, created at runtime
└── <step_name>.json
```

Outputs (root of repo):
- `n2_enriched.json` (extended)
- `n2_questions.json` (extended)
- `n2_questions_R.json` / `_P.json` / `_U.json` (split)
- `validation_report.json`, `question_validation_report.json`
- `rejected_words.json`, `rejected_questions.json`
- `failed_items.json`

---

## Task 1: Phase5 package skeleton + .gitignore

**Files:**
- Create: `phase5/__init__.py`
- Create: `phase5/tests/__init__.py`
- Create: `phase5/prompts/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create empty package markers**

```bash
mkdir -p phase5/prompts phase5/tests .phase5_progress
touch phase5/__init__.py phase5/tests/__init__.py phase5/prompts/.gitkeep
```

- [ ] **Step 2: Update .gitignore**

Read current `.gitignore`, then append:

```
# Phase 5 pipeline runtime state
.phase5_progress/
phase5/__pycache__/
phase5/**/__pycache__/
failed_items.json
rejected_words.json
rejected_questions.json
```

- [ ] **Step 3: Commit**

```bash
git add phase5/ .gitignore
git commit -m "feat(phase5): scaffold pipeline package"
```

---

## Task 2: `phase5/progress.py` — resumable state tracker (TDD)

**Files:**
- Create: `phase5/progress.py`
- Create: `phase5/tests/test_progress.py`

**Behavior:** Per-step JSON file (e.g. `.phase5_progress/enrich.json`) storing a list of completed keys. `mark_done` writes atomically (tmp + rename). Calling `is_done(key)` returns True if the key was previously marked.

- [ ] **Step 1: Write the failing test**

`phase5/tests/test_progress.py`:

```python
import json
import os
import tempfile
from pathlib import Path

import pytest

from phase5.progress import Progress


def test_marks_and_persists(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Progress("step1")
    assert not p.is_done("a")
    assert p.done_count() == 0
    p.mark_done("a")
    p.mark_done("b")
    assert p.is_done("a")
    assert p.is_done("b")
    assert p.done_count() == 2

    # Fresh instance reads same file
    p2 = Progress("step1")
    assert p2.is_done("a") and p2.is_done("b")


def test_reset(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Progress("step1")
    p.mark_done("a")
    p.reset()
    assert not p.is_done("a")
    assert p.done_count() == 0


def test_atomic_write(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Progress("step1")
    p.mark_done("a")
    progress_file = tmp_path / ".phase5_progress" / "step1.json"
    assert progress_file.exists()
    data = json.loads(progress_file.read_text())
    assert "a" in data["done"]


def test_int_keys_normalized_to_strings(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Progress("step1")
    p.mark_done(42)
    assert p.is_done(42)
    assert p.is_done("42")
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/yuhang/kotobaWeb && python3 -m pytest phase5/tests/test_progress.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'phase5.progress'`.

- [ ] **Step 3: Implement `phase5/progress.py`**

```python
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
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
python3 -m pytest phase5/tests/test_progress.py -v
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add phase5/progress.py phase5/tests/test_progress.py
git commit -m "feat(phase5): add resumable Progress tracker"
```

---

## Task 3: `phase5/db_writer.py` — sqlite3 upsert helpers (TDD)

**Files:**
- Create: `phase5/db_writer.py`
- Create: `phase5/tests/test_db_writer.py`

**Behavior:** Direct sqlite3 connection, helpers to upsert Word, upsert Question, set quality scores, query max word_id. Uses `INSERT OR REPLACE` semantics. Single-statement transactions (autocommit on close) — no big transactions, since Ctrl-C safety matters more than throughput.

**Schema reference (from prisma/schema.prisma after migration):**
- `Word`: id INTEGER PK, word TEXT, furigana TEXT, romaji TEXT, meaningZh TEXT, meaningEn TEXT, level INTEGER, pos TEXT, frequency TEXT, usageNotes TEXT, exampleSentences TEXT (JSON), synonyms TEXT (JSON), antonyms TEXT (JSON), collocations TEXT (JSON), qualityScore INTEGER NULL, needsReview BOOLEAN DEFAULT 0
- `Question`: id TEXT PK, wordId INTEGER FK, dimension TEXT, type TEXT, question TEXT NULL, options TEXT (JSON), correctIndex INTEGER, explanation TEXT NULL, explanationZh TEXT NULL, qualityScore INTEGER NULL, needsReview BOOLEAN DEFAULT 0

- [ ] **Step 1: Write the failing tests**

`phase5/tests/test_db_writer.py`:

```python
import sqlite3
import pytest
from pathlib import Path

from phase5.db_writer import (
    connect,
    upsert_word,
    upsert_question,
    set_word_quality,
    set_question_quality,
    max_word_id,
)


@pytest.fixture
def db(tmp_path):
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE Word (
            id INTEGER PRIMARY KEY,
            word TEXT NOT NULL,
            furigana TEXT NOT NULL,
            romaji TEXT NOT NULL,
            meaningZh TEXT NOT NULL,
            meaningEn TEXT NOT NULL,
            level INTEGER NOT NULL,
            pos TEXT NOT NULL,
            frequency TEXT NOT NULL,
            usageNotes TEXT NOT NULL,
            exampleSentences TEXT NOT NULL,
            synonyms TEXT NOT NULL,
            antonyms TEXT NOT NULL,
            collocations TEXT NOT NULL,
            qualityScore INTEGER,
            needsReview INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE Question (
            id TEXT PRIMARY KEY,
            wordId INTEGER NOT NULL,
            dimension TEXT NOT NULL,
            type TEXT NOT NULL,
            question TEXT,
            options TEXT NOT NULL,
            correctIndex INTEGER NOT NULL,
            explanation TEXT,
            explanationZh TEXT,
            qualityScore INTEGER,
            needsReview INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    conn.commit()
    yield conn
    conn.close()


def test_upsert_word_inserts(db):
    enriched = {
        "word_id": 1,
        "word": "題名",
        "furigana": "だいめい",
        "romaji": "daimei",
        "meaning_zh": "标题",
        "meaning_en": "title",
        "level": 2,
        "pos": "名词",
        "frequency": "medium",
        "usage_notes": "本や映画などの名前。",
        "example_sentences": [{"ja": "本の題名", "zh": "书的标题"}],
        "synonyms": ["タイトル"],
        "antonyms": [],
        "collocations": ["題名を付ける"],
    }
    upsert_word(db, enriched)
    row = db.execute("SELECT word, frequency, meaningZh FROM Word WHERE id=1").fetchone()
    assert row == ("題名", "mid", "标题")


def test_upsert_word_replaces(db):
    enriched = {
        "word_id": 1, "word": "題名", "furigana": "だいめい", "romaji": "daimei",
        "meaning_zh": "old", "meaning_en": "title", "level": 2, "pos": "名词",
        "frequency": "high", "usage_notes": "x", "example_sentences": [],
        "synonyms": [], "antonyms": [], "collocations": [],
    }
    upsert_word(db, enriched)
    enriched["meaning_zh"] = "new"
    upsert_word(db, enriched)
    row = db.execute("SELECT meaningZh FROM Word WHERE id=1").fetchone()
    assert row[0] == "new"


def test_upsert_question_with_listening_kanji_no_question_field(db):
    db.execute(
        "INSERT INTO Word VALUES (1,'a','a','a','a','a',2,'p','high','u','[]','[]','[]','[]',NULL,0)"
    )
    q = {
        "id": "word_1_listening_kanji_1",
        "word_id": 1,
        "dimension": "R",
        "type": "listening_kanji",
        "options": [{"text": "題名"}, {"text": "大名"}, {"text": "提案"}, {"text": "代案"}],
        "correct_index": 0,
        "explanation": "...",
        "explanation_zh": "...",
    }
    upsert_question(db, q)
    row = db.execute("SELECT question, type, correctIndex FROM Question WHERE id=?", (q["id"],)).fetchone()
    assert row == (None, "listening_kanji", 0)


def test_set_word_quality(db):
    db.execute("INSERT INTO Word VALUES (1,'a','a','a','a','a',2,'p','high','u','[]','[]','[]','[]',NULL,0)")
    set_word_quality(db, 1, score=85, needs_review=True)
    row = db.execute("SELECT qualityScore, needsReview FROM Word WHERE id=1").fetchone()
    assert row == (85, 1)


def test_set_question_quality(db):
    db.execute("INSERT INTO Word VALUES (1,'a','a','a','a','a',2,'p','high','u','[]','[]','[]','[]',NULL,0)")
    db.execute("INSERT INTO Question VALUES ('q1',1,'R','meaning_choice','q','[]',0,'e','ez',NULL,0)")
    set_question_quality(db, "q1", score=95, needs_review=False)
    row = db.execute("SELECT qualityScore, needsReview FROM Question WHERE id='q1'").fetchone()
    assert row == (95, 0)


def test_max_word_id_empty(db):
    assert max_word_id(db) == 0


def test_max_word_id_with_rows(db):
    db.execute("INSERT INTO Word VALUES (1,'a','a','a','a','a',2,'p','high','u','[]','[]','[]','[]',NULL,0)")
    db.execute("INSERT INTO Word VALUES (450,'b','b','b','b','b',2,'p','high','u','[]','[]','[]','[]',NULL,0)")
    db.commit()
    assert max_word_id(db) == 450
```

- [ ] **Step 2: Run tests to verify fail**

```bash
python3 -m pytest phase5/tests/test_db_writer.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phase5/db_writer.py`**

```python
"""Direct sqlite3 upsert helpers. Each helper is a single statement that
auto-commits via connection's isolation behavior (we set isolation_level=None
in connect() for autocommit semantics)."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict

# CLAUDE.md / seed.ts compatibility: frequency "medium" → "mid"
_FREQ_MAP = {"medium": "mid", "mid": "mid", "high": "high", "low": "low"}


def connect(db_path: str | Path = "dev.db") -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _norm_freq(f: str) -> str:
    return _FREQ_MAP.get((f or "mid").lower(), "mid")


def upsert_word(conn: sqlite3.Connection, w: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO Word (id, word, furigana, romaji, meaningZh, meaningEn, level,
                          pos, frequency, usageNotes, exampleSentences, synonyms,
                          antonyms, collocations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            word=excluded.word,
            furigana=excluded.furigana,
            romaji=excluded.romaji,
            meaningZh=excluded.meaningZh,
            meaningEn=excluded.meaningEn,
            level=excluded.level,
            pos=excluded.pos,
            frequency=excluded.frequency,
            usageNotes=excluded.usageNotes,
            exampleSentences=excluded.exampleSentences,
            synonyms=excluded.synonyms,
            antonyms=excluded.antonyms,
            collocations=excluded.collocations
        """,
        (
            w["word_id"],
            w["word"],
            w.get("furigana", ""),
            w.get("romaji", ""),
            w.get("meaning_zh", "") or "",
            w.get("meaning_en", "") or "",
            w.get("level", 2),
            w.get("pos", "") or "",
            _norm_freq(w.get("frequency", "mid")),
            w.get("usage_notes", "") or "",
            json.dumps(w.get("example_sentences") or [], ensure_ascii=False),
            json.dumps(w.get("synonyms") or [], ensure_ascii=False),
            json.dumps(w.get("antonyms") or [], ensure_ascii=False),
            json.dumps(w.get("collocations") or [], ensure_ascii=False),
        ),
    )


def upsert_question(conn: sqlite3.Connection, q: Dict[str, Any]) -> None:
    options = q.get("options") or []
    options_serialized = json.dumps(
        [{"text": o["text"]} for o in options], ensure_ascii=False
    )
    conn.execute(
        """
        INSERT INTO Question (id, wordId, dimension, type, question, options,
                              correctIndex, explanation, explanationZh)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            wordId=excluded.wordId,
            dimension=excluded.dimension,
            type=excluded.type,
            question=excluded.question,
            options=excluded.options,
            correctIndex=excluded.correctIndex,
            explanation=excluded.explanation,
            explanationZh=excluded.explanationZh
        """,
        (
            q["id"],
            q["word_id"],
            q["dimension"],
            q["type"],
            q.get("question"),
            options_serialized,
            q["correct_index"],
            q.get("explanation"),
            q.get("explanation_zh"),
        ),
    )


def set_word_quality(conn: sqlite3.Connection, word_id: int, *, score: int, needs_review: bool) -> None:
    conn.execute(
        "UPDATE Word SET qualityScore=?, needsReview=? WHERE id=?",
        (score, 1 if needs_review else 0, word_id),
    )


def set_question_quality(conn: sqlite3.Connection, question_id: str, *, score: int, needs_review: bool) -> None:
    conn.execute(
        "UPDATE Question SET qualityScore=?, needsReview=? WHERE id=?",
        (score, 1 if needs_review else 0, question_id),
    )


def max_word_id(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COALESCE(MAX(id), 0) FROM Word").fetchone()
    return row[0]
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
python3 -m pytest phase5/tests/test_db_writer.py -v
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add phase5/db_writer.py phase5/tests/test_db_writer.py
git commit -m "feat(phase5): add sqlite3 upsert helpers"
```

---

## Task 4: `phase5/llm_client.py` — OpenRouter wrapper with retry + concurrency (mocked TDD)

**Files:**
- Create: `phase5/llm_client.py`
- Create: `phase5/tests/test_llm_client.py`

**Behavior:** Thin wrapper around `openai.OpenAI(base_url=...)`. Configurable model. `call(prompt) → dict | list` strips ```json fences, retries 3× on `RateLimitError`/`APIError`/`json.JSONDecodeError` with exponential backoff (1s/2s/4s + small jitter). `call_many(prompts) → Iterator[(idx, result, error)]` runs concurrently via ThreadPoolExecutor preserving input order.

- [ ] **Step 1: Write the failing test (mocked)**

`phase5/tests/test_llm_client.py`:

```python
import json
from unittest.mock import MagicMock, patch

import pytest

from phase5.llm_client import LLMClient, LLMError, _strip_json_fence


def test_strip_json_fence_with_fences():
    s = "```json\n{\"a\": 1}\n```"
    assert _strip_json_fence(s) == '{"a": 1}'


def test_strip_json_fence_no_fences():
    assert _strip_json_fence('{"a": 1}') == '{"a": 1}'


def test_strip_json_fence_lone_triple():
    assert _strip_json_fence("```\n[1,2]\n```") == "[1,2]"


def _mock_completion(content: str):
    msg = MagicMock()
    msg.content = content
    choice = MagicMock(); choice.message = msg
    resp = MagicMock(); resp.choices = [choice]
    return resp


def test_call_parses_json():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.return_value = _mock_completion('{"ok": true}')
    result = client.call("hi")
    assert result == {"ok": True}


def test_call_retries_on_bad_json_then_succeeds():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.side_effect = [
        _mock_completion("not json"),
        _mock_completion('{"ok": true}'),
    ]
    result = client.call("hi", max_retries=2, base_backoff=0.0)
    assert result == {"ok": True}
    assert client._client.chat.completions.create.call_count == 2


def test_call_raises_after_max_retries():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.return_value = _mock_completion("garbage")
    with pytest.raises(LLMError):
        client.call("hi", max_retries=2, base_backoff=0.0)


def test_call_many_preserves_order_and_returns_errors():
    client = LLMClient(model="x", api_key="k", concurrency=2)
    client._client = MagicMock()
    responses = ['{"i": 0}', "bad", '{"i": 2}']

    def side(model, messages, **kw):
        # crude: use prompt content to pick response
        idx = int(messages[0]["content"])
        return _mock_completion(responses[idx])

    client._client.chat.completions.create.side_effect = side

    results = list(client.call_many(["0", "1", "2"], max_retries=1, base_backoff=0.0))
    assert len(results) == 3
    assert results[0] == (0, {"i": 0}, None)
    assert results[1][0] == 1 and results[1][1] is None and isinstance(results[1][2], LLMError)
    assert results[2] == (2, {"i": 2}, None)
```

- [ ] **Step 2: Run tests to verify fail**

```bash
python3 -m pytest phase5/tests/test_llm_client.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phase5/llm_client.py`**

```python
"""OpenRouter LLM client wrapper. Retries with backoff, concurrent dispatch.

Env vars:
    OPENROUTER_API_KEY  required
"""
from __future__ import annotations

import json
import os
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterator, List, Tuple

from openai import OpenAI


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class LLMError(RuntimeError):
    """Raised when the LLM call exhausts all retries."""


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


class LLMClient:
    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        concurrency: int = 8,
        temperature: float = 0.7,
        timeout: float = 90.0,
    ) -> None:
        key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY not set")
        self.model = model
        self.concurrency = concurrency
        self.temperature = temperature
        self.timeout = timeout
        self._client = OpenAI(api_key=key, base_url=OPENROUTER_BASE_URL)
        self._sem = threading.Semaphore(concurrency)

    def call(
        self,
        prompt: str,
        *,
        max_retries: int = 3,
        base_backoff: float = 1.0,
        temperature: float | None = None,
    ) -> Any:
        last_err: Exception | None = None
        for attempt in range(max_retries):
            try:
                resp = self._client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature if temperature is not None else self.temperature,
                    timeout=self.timeout,
                )
                content = resp.choices[0].message.content or ""
                stripped = _strip_json_fence(content)
                if not stripped:
                    raise ValueError("empty response after stripping fence")
                return json.loads(stripped)
            except (json.JSONDecodeError, ValueError) as e:
                last_err = e
                # for JSON errors, slightly lower temperature on retry
                temperature = max(0.1, (temperature or self.temperature) - 0.2)
            except Exception as e:  # APIError, RateLimit, timeout, network
                last_err = e
            if attempt < max_retries - 1:
                delay = base_backoff * (2 ** attempt) + random.uniform(0, 0.5)
                time.sleep(delay)
        raise LLMError(f"All {max_retries} attempts failed: {last_err}")

    def call_many(
        self,
        prompts: List[str],
        *,
        max_retries: int = 3,
        base_backoff: float = 1.0,
        temperature: float | None = None,
    ) -> Iterator[Tuple[int, Any, Exception | None]]:
        """Yields (index, result_or_None, error_or_None) in completion order
        (not input order — callers should match by index)."""

        def _task(idx: int, prompt: str):
            with self._sem:
                try:
                    return idx, self.call(
                        prompt,
                        max_retries=max_retries,
                        base_backoff=base_backoff,
                        temperature=temperature,
                    ), None
                except LLMError as e:
                    return idx, None, e

        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(_task, i, p) for i, p in enumerate(prompts)]
            for fut in as_completed(futures):
                yield fut.result()
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
python3 -m pytest phase5/tests/test_llm_client.py -v
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add phase5/llm_client.py phase5/tests/test_llm_client.py
git commit -m "feat(phase5): add OpenRouter LLM client with retry + concurrency"
```

---

## Task 5: Copy and revise prompt templates

**Files:**
- Create: `phase5/prompts/enrich_word.txt`
- Create: `phase5/prompts/validate_word.txt`
- Create: `phase5/prompts/generate_questions.txt`
- Create: `phase5/prompts/backfill_lk.txt`
- Create: `phase5/prompts/validate_questions.txt`

- [ ] **Step 1: Write `phase5/prompts/enrich_word.txt`** (revised: add 自動/他動 for verbs, frequency rubric)

```
你是一位专业的日语教育专家。你的任务是将一个 N{level} 级别的日语单词进行详细富化，添加学习者需要的各种信息。

输入：
- word: {word}
- meaning: {meaning}
- furigana: {furigana}
- romaji: {romaji}
- level: {level}

请输出严格 JSON（不要任何代码块标记或解释），包含以下字段：

1. pos (词性)：「名词」「动词（他動）」「动词（自動）」「い形容词」「な形容词」「副词」「连体词」「接续词」等。动词必须标注他動/自動。
2. frequency (使用频率)：
   - "high"：日常对话/新闻常见
   - "medium"：阅读时常见，会话偶尔
   - "low"：专业/书面/古风词
3. example_sentences：2-3 个自然例句。每条包含：
   - ja: 日语原文。**所有汉字（小学一年级水平如「人」「日」「月」「火」可豁免）必须用 <ruby>漢字<rt>かんじ</rt></ruby> 标注**
   - ja_plain: 去掉 ruby 后的纯日语原文
   - zh: 中文翻译
   - en: 英文翻译
4. synonyms：2-3 个近义词（无则空数组）
5. antonyms：1-2 个反义词（无则空数组）
6. collocations：2-3 个常用搭配
7. usage_notes：简洁的使用提示（日语；汉字按规则 ruby 标注）

输出格式：
```json
{{
  "word": "{word}",
  "furigana": "{furigana}",
  "romaji": "{romaji}",
  "meaning_zh": "{meaning}",
  "meaning_en": "English translation",
  "level": {level},
  "pos": "...",
  "frequency": "high/medium/low",
  "example_sentences": [
    {{
      "ja": "<ruby>漢字<rt>かんじ</rt></ruby>を含む例文。",
      "ja_plain": "漢字を含む例文。",
      "zh": "...",
      "en": "..."
    }}
  ],
  "synonyms": [],
  "antonyms": [],
  "collocations": [],
  "usage_notes": "..."
}}
```

只输出 JSON。
```

- [ ] **Step 2: Write `phase5/prompts/validate_word.txt`** (revised: 4-axis scoring)

```
你是一位日语教育质量审核专家。请独立验证富化后的单词数据。

待验证数据：
{enriched_word_json}

请从以下四个维度各打 0-100 分：
- furigana_score: ruby 假名标注的准确性与完整性（漏标 / 错标都要扣分）
- examples_score: 例句的自然度、N2 水平的契合度、翻译准确性
- translation_score: meaning_zh / meaning_en 的准确性
- completeness_score: 词性 / frequency / synonyms / collocations / usage_notes 的完整性与合理性

整体 quality_score = 上述四项的加权平均（furigana 30% / examples 30% / translation 20% / completeness 20%）。

输出（纯 JSON）：
```json
{{
  "word": "单词",
  "scores": {{
    "furigana_score": 0,
    "examples_score": 0,
    "translation_score": 0,
    "completeness_score": 0
  }},
  "quality_score": 0,
  "issues": [
    {{"severity": "critical/warning/info", "field": "字段", "description": "问题"}}
  ],
  "suggestions": [
    {{"field": "字段", "current": "...", "suggested": "...", "reason": "..."}}
  ],
  "validation_status": "approved/needs_review/rejected"
}}
```

判定规则：
- quality_score ≥ 90 → "approved"
- quality_score 70-89 → "needs_review"
- quality_score < 70 → "rejected"

只输出 JSON。
```

- [ ] **Step 3: Write `phase5/prompts/generate_questions.txt`** (revised: furigana rule clarified)

```
你是一位专业的日语测试题目设计专家。请为一个单词生成 4-5 道常规测试题，覆盖 R / P / U 三个维度，并额外生成 1 道 listening_kanji 题（共 5-6 道）。

输入富化单词数据：
{enriched_word_json}

**三个维度定义**：
- R (Recognition 认识)：看到/听到能理解。题型：选义、近义词选择
- P (Production 产出)：从意思提取出词。题型：填空、词形变化
- U (Usage 运用)：句中正确使用。题型：语境推断、用法判断

**题型清单**：
1. meaning_choice (R)
2. word_choice (R/P)
3. synonym_choice (R)
4. fill_blank (P)
5. context_inference (U)
6. wrong_usage (U)
7. listening_kanji (R)（必出 1 道）

**核心规则**：
1. 每词生成 4-5 道常规题 + 1 道 listening_kanji = 共 5-6 题
2. 必须覆盖 R / P / U：R≥2 题（含 listening_kanji 算 1）/ P≥1 题 / U≥1 题
3. **题干、选项、解析中所有汉字必须用 `<ruby>` 标注假名**（仅小学一年级水平的汉字如「人」「日」「月」「火」「山」「川」可豁免）。listening_kanji 的 4 个选项是唯一例外。
4. 干扰项要合理且不歧义；每题只有唯一正确答案
5. correct_index 在 4 题里要分散，不要全是 0

**listening_kanji 题型专项要求**（强约束，违反即作废）：
- **不要输出 `question` 字段**（前端会注入固定提示语）
- 4 个选项 = 1 个目标词 + 3 个**读音相近**的真实日语词。相近性维度（至少命中一条）：同首拍 / 同尾拍 / 长短音差 / 清浊半浊差 / 拗音直音差 / 同音异字
- 音节数与目标词差距 ≤ 1
- 干扰项必须真实存在的常用日语词（优先 N3-N2），**不可生造**
- 干扰项不可与目标词同义/近义
- 选项 `text` **纯汉字/假名形，禁止 `<ruby>` 标签**
- 解析中按常规规则 ruby，逐一说明每个干扰项的假名读音与发音差异

**输出格式（纯 JSON 数组）**：

```json
[
  {{
    "id": "word_{{word_id}}_{{type}}_{{序号}}",
    "word_id": {{word_id}},
    "dimension": "R/P/U",
    "type": "题目类型",
    "question": "<ruby>...</ruby>",
    "options": [{{"text": "..."}}, {{"text": "..."}}, {{"text": "..."}}, {{"text": "..."}}],
    "correct_index": 0,
    "explanation": "...",
    "explanation_zh": "..."
  }}
]
```

只输出 JSON 数组。
```

- [ ] **Step 4: Write `phase5/prompts/backfill_lk.txt`** (new, only listening_kanji)

```
你是一位专业的日语测试题目设计专家。请为下面这个单词生成**恰好 1 道** listening_kanji 题。

输入富化单词数据：
{enriched_word_json}

**listening_kanji 题型要求**（强约束）：
- 题型：听单词读音，从 4 个汉字选项中选出对应词
- 归 R 维度
- **不要输出 `question` 字段**（前端会注入固定提示语）
- 4 个选项 = 1 个目标词 + 3 个**读音相近**的真实日语词。相近性维度（至少命中一条）：同首拍 / 同尾拍 / 长短音差 / 清浊半浊差 / 拗音直音差 / 同音异字
- 音节数与目标词差距 ≤ 1
- 干扰项必须真实存在的常用日语词（优先 N3-N2），**不可生造**
- 干扰项不可与目标词同义/近义
- 选项 `text` **纯汉字/假名形，禁止 `<ruby>` 标签**
- `correct_index` 不要总是 0（在 0-3 之间分散）
- 解析按 ruby 规则标注，逐一说明每个干扰项的假名读音与发音差异

输出（纯 JSON 数组，恰好 1 个元素）：

```json
[
  {{
    "id": "word_{{word_id}}_listening_kanji_1",
    "word_id": {{word_id}},
    "dimension": "R",
    "type": "listening_kanji",
    "options": [{{"text": "目标词"}}, {{"text": "干扰1"}}, {{"text": "干扰2"}}, {{"text": "干扰3"}}],
    "correct_index": 0,
    "explanation": "<ruby>...</ruby>",
    "explanation_zh": "..."
  }}
]
```

只输出 JSON 数组。
```

- [ ] **Step 5: Write `phase5/prompts/validate_questions.txt`** (revised: 独立答题指令置顶)

```
你是一位日语测试题目质量审核专家。

**首要任务：独立做题。** 在阅读任何 correct_index 之前，对每道题写下你独立选择的答案索引（your_answer）。然后再对比 correct_index：
- 你的答案与 correct_index 不一致 → critical issue (category: correctness)
- 多个选项都可能正确 → critical issue (category: uniqueness)

待验证题目集：
{questions_json}

请评估每道题：
1. 答案唯一性
2. 答案正确性（你的独立答案 vs correct_index）
3. 干扰项合理性
4. 假名标注完整性（小学一年级水平汉字豁免；listening_kanji 选项除外）
5. 维度匹配（type vs dimension）
6. 难度适配 N2
7. 语言自然度
8. 解析准确性

**listening_kanji 专项**（仅 type == "listening_kanji"）：
- L1 选项含 `<ruby>` → critical
- L2 dimension ≠ R → critical
- L3 干扰项与目标词读音完全无关 → warning
- L4 干扰项生造 → critical
- L5 干扰项与目标词同义/近义 → critical
- L6 音节数差距 > 1 → warning
- L7 解析未列出干扰项读音差异 → warning

输出（纯 JSON）：
```json
{{
  "overall_quality": 0,
  "total_questions": 0,
  "approved_count": 0,
  "needs_review_count": 0,
  "rejected_count": 0,
  "question_validations": [
    {{
      "question_id": "...",
      "quality_score": 0,
      "your_answer": 0,
      "matches_key": true,
      "issues": [
        {{"severity": "critical/warning/info", "category": "uniqueness/correctness/distractor/furigana/dimension/difficulty/naturalness/explanation", "description": "..."}}
      ],
      "suggestions": [
        {{"field": "...", "suggested_change": "...", "reason": "..."}}
      ],
      "validation_status": "approved/needs_review/rejected"
    }}
  ],
  "dimension_coverage": {{"R": 0, "P": 0, "U": 0}}
}}
```

判定规则：
- quality_score ≥ 90 → "approved"
- 70-89 → "needs_review"
- < 70 → "rejected"

只输出 JSON。
```

- [ ] **Step 6: Commit**

```bash
git add phase5/prompts/
git commit -m "feat(phase5): add revised prompt templates"
```

---

## Task 6: `phase5/enrich.py` — Step 1 (enrich new 1382 words)

**Files:**
- Create: `phase5/enrich.py`

**Behavior:** Reads `n2.json` (1831 words), filters out words already in `n2_enriched.json` by `word`, assigns new `word_id` = `max(existing) + 1, +2, ...`, calls DeepSeek concurrently, atomic-writes JSON, upserts DB, marks progress. Logs progress with tqdm.

- [ ] **Step 1: Implement `phase5/enrich.py`**

```python
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
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "deepseek/deepseek-v4-flash")
INPUT_FILE = Path("n2.json")
OUTPUT_FILE = Path("n2_enriched.json")
PROMPT_FILE = Path("phase5/prompts/enrich_word.txt")
FAILED_FILE = Path("failed_items.json")
STEP_NAME = "enrich"


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
    try:
        next_id = max_word_id(db) + 1
        # Pre-assign word_id deterministically (by input order)
        id_map = {}
        for w in todo:
            id_map[w["word"]] = next_id
            next_id += 1

        prompts = [
            prompt_template.format(
                word=w["word"],
                meaning=w["meaning"],
                furigana=w.get("furigana", ""),
                romaji=w.get("romaji", ""),
                level=w.get("level", 2),
            )
            for w in todo
        ]

        results: Dict[int, tuple] = {}
        with tqdm(total=len(todo), desc="enrich") as pbar:
            for idx, result, err in client.call_many(prompts):
                results[idx] = (result, err)
                pbar.update(1)

        # Process in deterministic order
        for idx, w in enumerate(todo):
            result, err = results.get(idx, (None, LLMError("missing")))
            if err is not None or not isinstance(result, dict):
                append_failed({"step": STEP_NAME, "word": w["word"], "error": str(err)})
                continue
            result["word_id"] = id_map[w["word"]]
            # Ensure required string fields exist
            result.setdefault("word", w["word"])
            result.setdefault("furigana", w.get("furigana", ""))
            result.setdefault("romaji", w.get("romaji", ""))
            result.setdefault("level", w.get("level", 2))
            enriched.append(result)
            atomic_write_json(OUTPUT_FILE, enriched)
            upsert_word(db, result)
            progress.mark_done(w["word"])
    finally:
        db.close()

    print(f"[enrich] done. total enriched: {len(enriched)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke test with --dry-run**

```bash
cd /Users/yuhang/kotobaWeb && OPENROUTER_API_KEY=dummy python3 -m phase5.enrich --dry-run
```
Expected: prints `[enrich] total=1831 existing=450 todo=1381 ...` and `DRY RUN — exiting`. (Note: enriched count includes the 1 word not in n2.json, so todo is 1381 not 1382.)

- [ ] **Step 3: Commit**

```bash
git add phase5/enrich.py
git commit -m "feat(phase5): step 1 — enrich new N2 words via DeepSeek"
```

---

## Task 7: `phase5/validate_enrich.py` — Step 2 (Qwen validates all 1832 words)

**Files:**
- Create: `phase5/validate_enrich.py`

- [ ] **Step 1: Implement**

```python
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
    existing = []
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
        # Also reset report files to avoid duplicates on force-rerun
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

    # Load prior report to support resume (append mode)
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
        prompts = [
            prompt_template.format(enriched_word_json=json.dumps(w, ensure_ascii=False, indent=2))
            for w in todo
        ]
        results: Dict[int, tuple] = {}
        with tqdm(total=len(todo), desc="validate_enrich") as pbar:
            for idx, result, err in client.call_many(prompts):
                results[idx] = (result, err)
                pbar.update(1)

        for idx, w in enumerate(todo):
            result, err = results.get(idx, (None, LLMError("missing")))
            if err is not None or not isinstance(result, dict):
                append_failed({"step": STEP_NAME, "word_id": w["word_id"], "error": str(err)})
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
```

- [ ] **Step 2: Smoke test**

```bash
OPENROUTER_API_KEY=dummy python3 -m phase5.validate_enrich --dry-run
```
Expected: `[validate_enrich] total=450 todo=450 ...` then DRY RUN exit. (After Task 6 has run, total would be 1832.)

- [ ] **Step 3: Commit**

```bash
git add phase5/validate_enrich.py
git commit -m "feat(phase5): step 2 — Qwen validates enriched words"
```

---

## Task 8: `phase5/generate_q.py` — Step 3 (generate 5-6 questions per new word)

**Files:**
- Create: `phase5/generate_q.py`

- [ ] **Step 1: Implement**

```python
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
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "deepseek/deepseek-v4-flash")
ENRICHED_FILE = Path("n2_enriched.json")
QUESTIONS_FILE = Path("n2_questions.json")
PROMPT_FILE = Path("phase5/prompts/generate_questions.txt")
FAILED_FILE = Path("failed_items.json")
STEP_NAME = "generate_q"
NEW_WORD_ID_THRESHOLD = 450  # MVP cutoff; words with id > 450 are "new"


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def append_failed(item: Dict) -> None:
    existing = []
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

    if not ENRICHED_FILE.exists() or not PROMPT_FILE.exists():
        print("Missing input files", file=sys.stderr)
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

    print(f"[generate_q] new_words={len(new_words)} todo={len(todo)} existing_questions={len(all_questions)}")
    if args.dry_run:
        print("[generate_q] DRY RUN — exiting")
        return
    if not todo:
        print("[generate_q] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=GENERATOR_MODEL, concurrency=args.concurrency, temperature=0.8)
    db = connect()

    try:
        prompts = [
            prompt_template.format(enriched_word_json=json.dumps(w, ensure_ascii=False, indent=2))
            for w in todo
        ]
        results: Dict[int, tuple] = {}
        with tqdm(total=len(todo), desc="generate_q") as pbar:
            for idx, result, err in client.call_many(prompts):
                results[idx] = (result, err)
                pbar.update(1)

        for idx, w in enumerate(todo):
            result, err = results.get(idx, (None, LLMError("missing")))
            if err is not None or not isinstance(result, list) or len(result) < 4:
                append_failed({"step": STEP_NAME, "word_id": w["word_id"], "word": w["word"], "error": str(err) if err else "bad output"})
                continue
            for q_idx, q in enumerate(result):
                q.setdefault("word_id", w["word_id"])
                # Ensure ID is unique / regenerate if needed
                if "id" not in q or not q["id"]:
                    q["id"] = f"word_{w['word_id']}_{q.get('type', 'unknown')}_{q_idx + 1}"
                all_questions.append(q)
                upsert_question(db, q)
            atomic_write_json(QUESTIONS_FILE, all_questions)
            progress.mark_done(w["word_id"])
    finally:
        db.close()

    print(f"[generate_q] done. total questions: {len(all_questions)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke test**

```bash
OPENROUTER_API_KEY=dummy python3 -m phase5.generate_q --dry-run
```
Expected: prints `new_words=N todo=N existing_questions=2320` then DRY RUN exit. (`N` depends on Task 6 progress; before Task 6 runs, N=0.)

- [ ] **Step 3: Commit**

```bash
git add phase5/generate_q.py
git commit -m "feat(phase5): step 3 — generate questions for new words"
```

---

## Task 9: `phase5/backfill_lk.py` — Step 4 (add listening_kanji to MVP 450 words)

**Files:**
- Create: `phase5/backfill_lk.py`

- [ ] **Step 1: Implement**

```python
"""Step 4: Backfill listening_kanji question for each MVP word (id <= 450).

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
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "deepseek/deepseek-v4-flash")
ENRICHED_FILE = Path("n2_enriched.json")
QUESTIONS_FILE = Path("n2_questions.json")
PROMPT_FILE = Path("phase5/prompts/backfill_lk.txt")
FAILED_FILE = Path("failed_items.json")
STEP_NAME = "backfill_lk"
MVP_THRESHOLD = 450


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def append_failed(item: Dict) -> None:
    existing = []
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

    if not ENRICHED_FILE.exists() or not PROMPT_FILE.exists():
        print("Missing input files", file=sys.stderr)
        sys.exit(1)

    enriched: List[Dict] = json.loads(ENRICHED_FILE.read_text(encoding="utf-8"))
    mvp_words = [w for w in enriched if w["word_id"] <= MVP_THRESHOLD]

    all_questions: List[Dict] = []
    if QUESTIONS_FILE.exists():
        all_questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    # Identify which MVP words already have a listening_kanji
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

    print(f"[backfill_lk] mvp={len(mvp_words)} already_have_lk={len(existing_lk_word_ids)} todo={len(todo)}")
    if args.dry_run:
        print("[backfill_lk] DRY RUN — exiting")
        return
    if not todo:
        print("[backfill_lk] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=GENERATOR_MODEL, concurrency=args.concurrency, temperature=0.8)
    db = connect()

    try:
        prompts = [
            prompt_template.format(enriched_word_json=json.dumps(w, ensure_ascii=False, indent=2))
            for w in todo
        ]
        results: Dict[int, tuple] = {}
        with tqdm(total=len(todo), desc="backfill_lk") as pbar:
            for idx, result, err in client.call_many(prompts):
                results[idx] = (result, err)
                pbar.update(1)

        for idx, w in enumerate(todo):
            result, err = results.get(idx, (None, LLMError("missing")))
            if err is not None or not isinstance(result, list) or len(result) != 1:
                append_failed({"step": STEP_NAME, "word_id": w["word_id"], "error": str(err) if err else "bad output"})
                continue
            q = result[0]
            q["word_id"] = w["word_id"]
            q["type"] = "listening_kanji"
            q["dimension"] = "R"
            q.setdefault("id", f"word_{w['word_id']}_listening_kanji_1")
            all_questions.append(q)
            upsert_question(db, q)
            atomic_write_json(QUESTIONS_FILE, all_questions)
            progress.mark_done(w["word_id"])
    finally:
        db.close()

    print(f"[backfill_lk] done. total questions: {len(all_questions)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke test**

```bash
OPENROUTER_API_KEY=dummy python3 -m phase5.backfill_lk --dry-run
```
Expected: `[backfill_lk] mvp=450 already_have_lk=0 todo=450` then DRY RUN exit.

- [ ] **Step 3: Commit**

```bash
git add phase5/backfill_lk.py
git commit -m "feat(phase5): step 4 — backfill listening_kanji for MVP words"
```

---

## Task 10: `phase5/validate_q.py` — Step 5 (Qwen validates all questions)

**Files:**
- Create: `phase5/validate_q.py`

- [ ] **Step 1: Implement**

```python
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
from phase5.llm_client import LLMClient, LLMError
from phase5.progress import Progress

VALIDATOR_MODEL = os.getenv("VALIDATOR_MODEL", "qwen/qwen-2.5-72b-instruct")
QUESTIONS_FILE = Path("n2_questions.json")
PROMPT_FILE = Path("phase5/prompts/validate_questions.txt")
REPORT_FILE = Path("question_validation_report.json")
REJECTED_FILE = Path("rejected_questions.json")
FAILED_FILE = Path("failed_items.json")
STEP_NAME = "validate_q"


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def append_failed(item: Dict) -> None:
    existing = []
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
    parser.add_argument("--limit", type=int, default=None, help="limit number of word_id batches")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dim", choices=["R", "P", "U"], default=None)
    parser.add_argument("--sample-pct", type=float, default=100.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not QUESTIONS_FILE.exists() or not PROMPT_FILE.exists():
        print("Missing input files", file=sys.stderr)
        sys.exit(1)

    all_questions: List[Dict] = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    # Optional dim filter
    if args.dim:
        all_questions = [q for q in all_questions if q.get("dimension") == args.dim]

    # Batch by word_id
    batches: Dict[int, List[Dict]] = defaultdict(list)
    for q in all_questions:
        batches[q["word_id"]].append(q)

    word_ids = list(batches.keys())

    # Sample
    if args.sample_pct < 100.0:
        n = max(1, int(len(word_ids) * args.sample_pct / 100.0))
        random.seed(42)
        word_ids = random.sample(word_ids, n)

    progress = Progress(STEP_NAME + (f"_{args.dim}" if args.dim else ""))
    if args.force:
        progress.reset()
        for p in (REPORT_FILE, REJECTED_FILE):
            if p.exists():
                p.unlink()

    todo_ids = [wid for wid in word_ids if not progress.is_done(wid)]
    if args.limit:
        todo_ids = todo_ids[: args.limit]

    print(f"[validate_q] batches={len(word_ids)} todo={len(todo_ids)} model={VALIDATOR_MODEL}")
    if args.dry_run:
        print("[validate_q] DRY RUN — exiting")
        return
    if not todo_ids:
        print("[validate_q] nothing to do")
        return

    prompt_template = PROMPT_FILE.read_text(encoding="utf-8")
    client = LLMClient(model=VALIDATOR_MODEL, concurrency=args.concurrency, temperature=0.3)
    db = connect()

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
        prompts = [
            prompt_template.format(questions_json=json.dumps(batches[wid], ensure_ascii=False, indent=2))
            for wid in todo_ids
        ]
        results: Dict[int, tuple] = {}
        with tqdm(total=len(todo_ids), desc="validate_q") as pbar:
            for idx, result, err in client.call_many(prompts, max_retries=3):
                results[idx] = (result, err)
                pbar.update(1)

        for idx, wid in enumerate(todo_ids):
            result, err = results.get(idx, (None, LLMError("missing")))
            if err is not None or not isinstance(result, dict):
                append_failed({"step": STEP_NAME, "word_id": wid, "error": str(err)})
                continue
            qvals = result.get("question_validations", [])
            for qval in qvals:
                qid = qval.get("question_id")
                if not qid:
                    continue
                score = int(qval.get("quality_score", 0))
                status = qval.get("validation_status", "needs_review")
                needs_review = status != "approved"
                set_question_quality(db, qid, score=score, needs_review=needs_review)
                if status == "rejected":
                    rejected.append({"question_id": qid, "word_id": wid, "score": score, "issues": qval.get("issues", [])})
            report.append({"word_id": wid, "validation": result})
            atomic_write_json(REPORT_FILE, report)
            atomic_write_json(REJECTED_FILE, rejected)
            progress.mark_done(wid)
    finally:
        db.close()

    total_q = sum(len(batches[wid]) for wid in todo_ids)
    print(f"[validate_q] processed {len(todo_ids)} batches / ~{total_q} questions. rejected={len(rejected)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke test**

```bash
OPENROUTER_API_KEY=dummy python3 -m phase5.validate_q --dry-run
```
Expected: `[validate_q] batches=450 todo=450 ...` then DRY RUN exit.

- [ ] **Step 3: Commit**

```bash
git add phase5/validate_q.py
git commit -m "feat(phase5): step 5 — Qwen validates all questions"
```

---

## Task 11: `phase5/split_json.py` — Step 6 (split questions by dimension)

**Files:**
- Create: `phase5/split_json.py`
- Create: `phase5/tests/test_split_json.py`

- [ ] **Step 1: Write the failing test**

`phase5/tests/test_split_json.py`:

```python
import json
from pathlib import Path

from phase5.split_json import split_by_dimension


def test_splits_three_dims(tmp_path):
    src = tmp_path / "q.json"
    questions = [
        {"id": "1", "dimension": "R"},
        {"id": "2", "dimension": "P"},
        {"id": "3", "dimension": "U"},
        {"id": "4", "dimension": "R"},
    ]
    src.write_text(json.dumps(questions, ensure_ascii=False), encoding="utf-8")
    paths = split_by_dimension(src, tmp_path)
    r = json.loads(paths["R"].read_text(encoding="utf-8"))
    p = json.loads(paths["P"].read_text(encoding="utf-8"))
    u = json.loads(paths["U"].read_text(encoding="utf-8"))
    assert len(r) == 2 and r[0]["id"] == "1"
    assert len(p) == 1 and p[0]["id"] == "2"
    assert len(u) == 1 and u[0]["id"] == "3"


def test_unknown_dim_ignored(tmp_path):
    src = tmp_path / "q.json"
    src.write_text(json.dumps([{"id": "1", "dimension": "X"}], ensure_ascii=False), encoding="utf-8")
    paths = split_by_dimension(src, tmp_path)
    for dim in ("R", "P", "U"):
        data = json.loads(paths[dim].read_text(encoding="utf-8"))
        assert data == []
```

- [ ] **Step 2: Run, expect FAIL**

```bash
python3 -m pytest phase5/tests/test_split_json.py -v
```

- [ ] **Step 3: Implement `phase5/split_json.py`**

```python
"""Step 6: Split n2_questions.json into n2_questions_{R,P,U}.json.

Usage:
    python3 -m phase5.split_json
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List

DEFAULT_INPUT = Path("n2_questions.json")
DEFAULT_OUTDIR = Path(".")
DIMS = ("R", "P", "U")


def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def split_by_dimension(src: Path, outdir: Path) -> Dict[str, Path]:
    all_q: List[Dict] = json.loads(src.read_text(encoding="utf-8"))
    buckets = {d: [] for d in DIMS}
    for q in all_q:
        d = q.get("dimension")
        if d in buckets:
            buckets[d].append(q)
    paths: Dict[str, Path] = {}
    for d in DIMS:
        p = outdir / f"n2_questions_{d}.json"
        atomic_write_json(p, buckets[d])
        paths[d] = p
    return paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--outdir", type=Path, default=DEFAULT_OUTDIR)
    args = parser.parse_args()
    paths = split_by_dimension(args.input, args.outdir)
    for d, p in paths.items():
        n = len(json.loads(p.read_text(encoding="utf-8")))
        print(f"[split_json] {p.name}: {n} questions")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
python3 -m pytest phase5/tests/test_split_json.py -v
```

- [ ] **Step 5: Commit**

```bash
git add phase5/split_json.py phase5/tests/test_split_json.py
git commit -m "feat(phase5): step 6 — split questions JSON by dimension"
```

---

## Task 12: `phase5/run.py` — main CLI dispatcher

**Files:**
- Create: `phase5/run.py`

- [ ] **Step 1: Implement**

```python
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
```

- [ ] **Step 2: Test help output**

```bash
python3 -m phase5.run --help
```
Expected: prints usage with 6 steps + `all`.

- [ ] **Step 3: Test dispatch (dry-run)**

```bash
OPENROUTER_API_KEY=dummy python3 -m phase5.run split-json --help 2>&1 | head -5
```
Expected: shows argparse help for split_json.

- [ ] **Step 4: Commit**

```bash
git add phase5/run.py
git commit -m "feat(phase5): main CLI dispatcher"
```

---

## Task 13: User-facing README for Phase 5

**Files:**
- Create: `README_PHASE5.md`

- [ ] **Step 1: Write `README_PHASE5.md`**

```markdown
# Phase 5 数据管线使用指南

> N2 全量词扩展 (450 → 1832) + 双模型交叉验证

## 前提条件

- Python 3.9+
- `pip install -r requirements.txt`
- OpenRouter API key（中国信用卡可付）
- Prisma migration 已执行（`20260514132833_phase5_quality_fields`）

## 环境变量

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."

# 可选覆盖
export GENERATOR_MODEL="deepseek/deepseek-v4-flash"
export VALIDATOR_MODEL="qwen/qwen-2.5-72b-instruct"
export DATABASE_PATH="./dev.db"
```

## 推荐执行顺序（每步独立、可断点续传）

```bash
# Step 1: 富化 1382 个新词，约 25 min，~$0.6
python3 -m phase5.run enrich

# Step 2: Qwen 验证全部 1832 词富化质量，约 30 min，~$2
python3 -m phase5.run validate-enrich

# Step 3: 为新词生成题目，约 30 min，~$1.5
python3 -m phase5.run generate-q

# Step 4: 为 MVP 450 词补 listening_kanji，约 10 min，~$0.2
python3 -m phase5.run backfill-lk

# Step 5: Qwen 验证所有题目，约 45 min，~$5
python3 -m phase5.run validate-q

# Step 6: 按维度切分题目 JSON，<1 min，免费
python3 -m phase5.run split-json
```

总预估：**~2.5 小时 / ~$10**（实际依 OpenRouter 限流而定）。

## 通用参数（每步通用）

- `--concurrency N`  并发数（默认 8）
- `--limit N`  只处理前 N 条（试跑）
- `--force`  忽略 progress 强制重跑
- `--dry-run`  只打印计划，不调 LLM

特定步骤参数：
- `validate-q --dim R|P|U`  只验证某维度
- `validate-q --sample-pct 20`  随机抽 20% 验证

## 断点续传

- 中途 Ctrl-C 安全，下次跑直接续上
- 进度文件：`.phase5_progress/<step>.json`
- 失败项：`failed_items.json`（手动复查）

## 输出文件

| 文件 | 内容 |
|------|------|
| `n2_enriched.json` | 全量 1832 词富化 |
| `n2_questions.json` | 全量题目（合并版） |
| `n2_questions_R/P/U.json` | 按维度切分 |
| `validation_report.json` | 富化验证报告 |
| `question_validation_report.json` | 题目验证报告 |
| `rejected_words.json` | 富化 rejected 词条（待人工） |
| `rejected_questions.json` | 题目 rejected 列表（待人工） |
| `dev.db` | 同步入库 |

## 故障排查

- **429 Rate Limit**：降并发到 4：`--concurrency 4`
- **大量 rejected**：先用 `--limit 10` 试跑看 prompt 是否需要调整
- **进度文件混乱**：删除 `.phase5_progress/<step>.json` 后用 `--force` 重跑

## 跑完后

1. 看 `rejected_*.json`，人工挑出最重要的几条修订
2. 重启 dev server：`npm run dev`（Prisma client 已在 migration 时重新生成）
3. 进 `/library` 验证新词都出现了，进度条与 R/P/U 数据正常
```

- [ ] **Step 2: Commit**

```bash
git add README_PHASE5.md
git commit -m "docs(phase5): add usage guide"
```

---

## Task 14: Final integration smoke test

**Files:** (no code changes)

- [ ] **Step 1: Run all pytest suites**

```bash
cd /Users/yuhang/kotobaWeb && python3 -m pytest phase5/tests/ -v
```
Expected: all tests pass (Tasks 2/3/4/11 contribute ~18 tests).

- [ ] **Step 2: Run all dry-runs to verify CLI wiring**

```bash
OPENROUTER_API_KEY=dummy python3 -m phase5.run enrich --dry-run
OPENROUTER_API_KEY=dummy python3 -m phase5.run validate-enrich --dry-run
OPENROUTER_API_KEY=dummy python3 -m phase5.run generate-q --dry-run
OPENROUTER_API_KEY=dummy python3 -m phase5.run backfill-lk --dry-run
OPENROUTER_API_KEY=dummy python3 -m phase5.run validate-q --dry-run
```
Expected: each prints its counts and "DRY RUN — exiting" without errors.

- [ ] **Step 3: Verify split_json works on existing data**

```bash
python3 -m phase5.run split-json
ls -lh n2_questions_R.json n2_questions_P.json n2_questions_U.json
```
Expected: three files appear with sizes proportional to dimension counts (R ≈ 41%, P ≈ 25%, U ≈ 34% of current 4.2 MB).

- [ ] **Step 4: Verify DB still works**

```bash
sqlite3 dev.db "SELECT COUNT(*) FROM Word; SELECT COUNT(*) FROM Question; SELECT COUNT(*) FROM UserWordState;"
```
Expected: 450 / 2320 / 58 (no data loss).

- [ ] **Step 5: Verify Next.js dev server still boots**

```bash
npm run dev &
SERVER_PID=$!
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
kill $SERVER_PID
```
Expected: `200`.

- [ ] **Step 6: Tag completion commit**

```bash
git add -A
git commit -m "test(phase5): smoke test verified all dry-runs + DB integrity" --allow-empty
```

---

## Coverage Check (Spec → Tasks)

- §1 Goals (extend 450 → 1832, MVP validated) → Tasks 6, 7, 8, 9, 10 ✓
- §2 Hard constraints (resumable / write JSON+DB / cross-model / no OpenAI) → Tasks 2, 3, 4 (progress, db, llm) ✓
- §3 Model selection (GENERATOR_MODEL / VALIDATOR_MODEL env vars) → Task 4 + steps ✓
- §4 Data flow (6 steps in order) → Tasks 6-11 ✓
- §5 Directory structure → Task 1 ✓
- §6 Schema changes → Already executed before plan ✓
- §7 Shared modules (llm_client / db_writer / progress) → Tasks 2, 3, 4 ✓
- §8 Per-step details → Tasks 6-11 each ✓
- §9 Main entry → Task 12 ✓
- §10 Prompt revisions → Task 5 ✓
- §11 Error handling → Task 4 (LLM retry) + per-step append_failed ✓
- §12-13 Cost / output file expectations → Documented in Task 13 README ✓
- §14 Risks → README troubleshooting section (Task 13) ✓
- §15 Acceptance criteria → Smoke test (Task 14) ✓
