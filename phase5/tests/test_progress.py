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
