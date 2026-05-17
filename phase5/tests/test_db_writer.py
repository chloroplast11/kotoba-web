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
            meaningZh TEXT NOT NULL,
            level INTEGER NOT NULL,
            pos TEXT NOT NULL,
            exampleSentences TEXT NOT NULL,
            synonyms TEXT NOT NULL,
            pitchAccent TEXT,
            homophones TEXT,
            audioFile TEXT,
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
        "meaning_zh": "标题",
        "level": 2,
        "pos": "名词",
        "example_sentences": [{"ja": "本の題名", "zh": "书的标题"}],
        "synonyms": "タイトル",
        "pitch_accent": "2",
        "homophones": None,
        "audio_file": "1_daimeい.mp3",
    }
    upsert_word(db, enriched)
    row = db.execute("SELECT word, meaningZh, pitchAccent, audioFile FROM Word WHERE id=1").fetchone()
    assert row == ("題名", "标题", "2", "1_daimeい.mp3")


def test_upsert_word_replaces(db):
    enriched = {
        "word_id": 1, "word": "題名", "furigana": "だいめい",
        "meaning_zh": "old", "level": 2, "pos": "名词",
        "example_sentences": [], "synonyms": "",
    }
    upsert_word(db, enriched)
    enriched["meaning_zh"] = "new"
    upsert_word(db, enriched)
    row = db.execute("SELECT meaningZh FROM Word WHERE id=1").fetchone()
    assert row[0] == "new"


def test_upsert_question_with_listening_kanji_no_question_field(db):
    db.execute(
        "INSERT INTO Word VALUES (1,'a','a','a',2,'p','[]','',NULL,NULL,NULL,NULL,0)"
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
    db.execute("INSERT INTO Word VALUES (1,'a','a','a',2,'p','[]','',NULL,NULL,NULL,NULL,0)")
    set_word_quality(db, 1, score=85, needs_review=True)
    row = db.execute("SELECT qualityScore, needsReview FROM Word WHERE id=1").fetchone()
    assert row == (85, 1)


def test_set_question_quality(db):
    db.execute("INSERT INTO Word VALUES (1,'a','a','a',2,'p','[]','',NULL,NULL,NULL,NULL,0)")
    db.execute("INSERT INTO Question VALUES ('q1',1,'R','meaning_choice','q','[]',0,'e','ez',NULL,0)")
    set_question_quality(db, "q1", score=95, needs_review=False)
    row = db.execute("SELECT qualityScore, needsReview FROM Question WHERE id='q1'").fetchone()
    assert row == (95, 0)


def test_max_word_id_empty(db):
    assert max_word_id(db) == 0


def test_max_word_id_with_rows(db):
    db.execute("INSERT INTO Word VALUES (1,'a','a','a',2,'p','[]','',NULL,NULL,NULL,NULL,0)")
    db.execute("INSERT INTO Word VALUES (450,'b','b','b',2,'p','[]','',NULL,NULL,NULL,NULL,0)")
    db.commit()
    assert max_word_id(db) == 450
