import pytest

from phase5.validate_static import (
    detect_listening_kanji_leak,
    detect_ruby_format_issues,
    validate_static,
)


class TestListeningKanjiLeak:
    def test_clean_options_no_leak(self):
        q = {
            "type": "listening_kanji",
            "options": [{"text": "アウト"}, {"text": "アート"}],
        }
        assert detect_listening_kanji_leak(q) == []

    def test_ruby_option_flagged(self):
        q = {
            "type": "listening_kanji",
            "options": [
                {"text": "<ruby>方々<rt>ほうぼう</rt></ruby>"},
                {"text": "方法"},
            ],
        }
        leaks = detect_listening_kanji_leak(q)
        assert len(leaks) == 1
        assert "option[0]" in leaks[0]

    def test_non_listening_type_ignored(self):
        q = {
            "type": "word_choice",
            "options": [{"text": "<ruby>方々<rt>ほうぼう</rt></ruby>"}],
        }
        assert detect_listening_kanji_leak(q) == []


class TestRubyFormatIssues:
    def test_clean_question(self):
        q = {
            "question": "<ruby>方程式<rt>ほうていしき</rt></ruby>を選びなさい",
            "options": [{"text": "方程式"}],
            "explanation": "問題ない",
        }
        assert detect_ruby_format_issues(q) == []

    def test_nested_ruby_flagged(self):
        q = {
            "question": "<ruby>正<rt>ただ</rt>しい<ruby>漢字<rt>かんじ</rt></ruby>表記<rt>ひょうき</rt></ruby>",
            "options": [],
        }
        issues = detect_ruby_format_issues(q)
        assert any("nested" in i for i in issues)

    def test_kana_wrap_flagged(self):
        q = {
            "question": "<ruby>やすやす<rt>やすやす</rt></ruby>",
            "options": [],
        }
        issues = detect_ruby_format_issues(q)
        assert any("kana wrapped" in i for i in issues)

    def test_broken_html_flagged(self):
        q = {
            "question": "<rubyrt>消<rt>け</rt>し</rubyrt>",
            "options": [],
        }
        issues = detect_ruby_format_issues(q)
        assert any("broken HTML" in i for i in issues)

    def test_option_broken_html_flagged(self):
        q = {
            "question": "OK",
            "options": [{"text": "<ruby<ruby>他<rt>ほか</rt></ruby></ruby>"}],
        }
        issues = detect_ruby_format_issues(q)
        assert any("option[0]" in i for i in issues)


class TestValidateStatic:
    def test_aggregates(self):
        questions = [
            {"id": "q1", "word_id": 1, "type": "listening_kanji",
             "options": [{"text": "<ruby>X<rt>x</rt></ruby>"}]},
            {"id": "q2", "word_id": 2, "type": "meaning_choice",
             "question": "<ruby>正<rt>ただ</rt>しい<ruby>漢字<rt>かんじ</rt></ruby></ruby>",
             "options": []},
            {"id": "q3", "word_id": 3, "type": "meaning_choice",
             "question": "<ruby>方程式<rt>ほうていしき</rt></ruby>",
             "options": [{"text": "方程式"}]},
        ]
        r = validate_static(questions)
        assert r["total_questions"] == 3
        assert r["counters"]["answer_leak_listening_kanji"] == 1
        assert r["counters"]["ruby_format"] == 1
