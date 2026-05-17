# phase5/tests/test_import_audio.py
import json

from phase5.import_audio import build_reverse_map, find_disk_id


def test_build_reverse_map():
    media = {"0": "hypertts-aaa.mp3", "1": "hypertts-bbb.mp3"}
    rev = build_reverse_map(media)
    assert rev == {"hypertts-aaa.mp3": "0", "hypertts-bbb.mp3": "1"}


def test_find_disk_id_hit():
    rev = {"hypertts-aaa.mp3": "0"}
    assert find_disk_id(rev, "hypertts-aaa.mp3") == "0"


def test_find_disk_id_miss():
    rev = {"hypertts-aaa.mp3": "0"}
    assert find_disk_id(rev, "hypertts-zzz.mp3") is None
