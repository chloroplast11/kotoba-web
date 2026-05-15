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
