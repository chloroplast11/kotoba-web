# phase5/tests/test_import_anki.py
import pytest

from phase5.import_anki import (
    parse_expression,
    strip_html,
    extract_pos_and_meaning,
    parse_example_sentences,
    parse_sound_ref,
)


class TestParseExpression:
    def test_basic(self):
        word, furigana = parse_expression("相変わらず[あいかわらず]")
        assert word == "相変わらず"
        assert furigana == "あいかわらず"

    def test_pure_kana(self):
        word, furigana = parse_expression("サイン[サイン]")
        assert word == "サイン"
        assert furigana == "サイン"

    def test_no_bracket_raises(self):
        with pytest.raises(ValueError):
            parse_expression("相変わらず")


class TestStripHtml:
    def test_strip_div(self):
        assert strip_html("<div>[副]依然，照旧</div>") == "[副]依然，照旧"

    def test_strip_nested(self):
        assert strip_html("<div><br>hi<br/></div>") == "hi"

    def test_empty(self):
        assert strip_html("") == ""


class TestExtractPosAndMeaning:
    def test_simple(self):
        pos, meaning = extract_pos_and_meaning("[副]依然，照旧")
        assert pos == "副"
        assert meaning == "依然，照旧"

    def test_compound_pos(self):
        pos, meaning = extract_pos_and_meaning("[名•自他動3]信号,暗号")
        assert pos == "名•自他動3"
        assert meaning == "信号,暗号"

    def test_no_pos(self):
        pos, meaning = extract_pos_and_meaning("依然，照旧")
        assert pos == ""
        assert meaning == "依然，照旧"


class TestParseExampleSentences:
    def test_single(self):
        result = parse_example_sentences(
            "△相変わらず忙しい毎日を送っている。/每天照旧过得很忙碌。"
        )
        assert result == [
            {"jp": "相変わらず忙しい毎日を送っている。", "zh": "每天照旧过得很忙碌。"}
        ]

    def test_multiple(self):
        result = parse_example_sentences(
            "△A。/A中译。△B。/B中译。"
        )
        assert len(result) == 2
        assert result[0]["jp"] == "A。"

    def test_empty(self):
        assert parse_example_sentences("") == []


class TestParseSoundRef:
    def test_basic(self):
        s = "[sound:hypertts-a4c4ca6adc4fc4780d8bbb513c8611f9320deef06bcf51558d571ed1.mp3]"
        assert (
            parse_sound_ref(s)
            == "hypertts-a4c4ca6adc4fc4780d8bbb513c8611f9320deef06bcf51558d571ed1.mp3"
        )

    def test_no_match(self):
        assert parse_sound_ref("nothing") is None
