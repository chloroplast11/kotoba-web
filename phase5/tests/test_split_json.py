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
