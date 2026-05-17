"""Direct sqlite3 upsert helpers. Each helper is a single statement that
auto-commits via connection's isolation behavior (we set isolation_level=None
in connect() for autocommit semantics)."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict

def connect(db_path: str | Path = "dev.db") -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def upsert_word(conn: sqlite3.Connection, w: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO Word (id, word, furigana, meaningZh, level, pos,
                          exampleSentences, synonyms,
                          pitchAccent, homophones, audioFile)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            word=excluded.word,
            furigana=excluded.furigana,
            meaningZh=excluded.meaningZh,
            level=excluded.level,
            pos=excluded.pos,
            exampleSentences=excluded.exampleSentences,
            synonyms=excluded.synonyms,
            pitchAccent=excluded.pitchAccent,
            homophones=excluded.homophones,
            audioFile=excluded.audioFile
        """,
        (
            w["word_id"],
            w["word"],
            w.get("furigana", ""),
            w.get("meaning_zh", "") or "",
            w.get("level", 2),
            w.get("pos", "") or "",
            json.dumps(w.get("example_sentences") or [], ensure_ascii=False),
            w.get("synonyms") or "",
            w.get("pitch_accent"),
            w.get("homophones"),
            w.get("audio_file"),
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
