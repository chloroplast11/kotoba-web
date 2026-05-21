import pytest

from phase5.fix_questions import fix_ruby, is_kana_only


class TestIsKanaOnly:
    def test_hiragana(self):
        assert is_kana_only("やすやす")

    def test_katakana(self):
        assert is_kana_only("サイン")

    def test_mixed_kanji(self):
        assert not is_kana_only("立てる")

    def test_empty(self):
        assert not is_kana_only("")

    def test_with_choon(self):
        assert is_kana_only("コーヒー")


class TestFixRubyEmptyDefaultOff:
    def test_no_rt_preserved_by_default(self):
        out, c = fix_ruby("<ruby>方程式</ruby>")
        assert out == "<ruby>方程式</ruby>"
        assert c["empty_rt"] == 0

    def test_empty_rt_preserved_by_default(self):
        out, c = fix_ruby("<ruby>方程式<rt></rt></ruby>")
        assert "<ruby>" in out and "方程式" in out
        assert c["empty_rt"] == 0


class TestFixRubyEmptyOptIn:
    def test_no_rt_stripped(self):
        out, c = fix_ruby("<ruby>方程式</ruby>", fix_empty_rt=True)
        assert out == "方程式"
        assert c["empty_rt"] == 1

    def test_empty_rt_stripped(self):
        out, c = fix_ruby("<ruby>方程式<rt></rt></ruby>", fix_empty_rt=True)
        assert out == "方程式"
        assert c["empty_rt"] == 1

    def test_whitespace_rt_stripped(self):
        out, c = fix_ruby("<ruby>方程式<rt>   </rt></ruby>", fix_empty_rt=True)
        assert out == "方程式"
        assert c["empty_rt"] == 1

    def test_in_sentence(self):
        out, c = fix_ruby(
            "「<ruby>方程式</ruby>」を<ruby>解<rt>と</rt></ruby>く", fix_empty_rt=True
        )
        assert out == "「方程式」を<ruby>解<rt>と</rt></ruby>く"
        assert c["empty_rt"] == 1


class TestFixRubyKana:
    def test_hiragana_unwrap(self):
        out, c = fix_ruby("<ruby>やすやす<rt>やすやす</rt></ruby>")
        assert out == "やすやす"
        assert c["kana_wrap"] == 1

    def test_katakana_unwrap(self):
        out, c = fix_ruby("<ruby>サイン<rt>サイン</rt></ruby>")
        assert out == "サイン"
        assert c["kana_wrap"] == 1

    def test_kanji_preserved(self):
        out, c = fix_ruby("<ruby>漢字<rt>かんじ</rt></ruby>")
        assert out == "<ruby>漢字<rt>かんじ</rt></ruby>"
        assert c["kana_wrap"] == 0


class TestFixRubyNested:
    def test_nested_unwrapped(self):
        s = "<ruby>正<rt>ただ</rt>しい<ruby>漢字<rt>かんじ</rt></ruby>表記<rt>ひょうき</rt></ruby>"
        out, c = fix_ruby(s)
        assert c["nested"] == 1
        assert "<ruby>漢字<rt>かんじ</rt></ruby>" in out
        assert "正しい" in out
        assert "表記" in out
        # Outer's orphan rt content must be gone
        assert "ただ" not in out
        assert "ひょうき" not in out

    def test_simple_nested(self):
        s = "<ruby>A<ruby>B<rt>b</rt></ruby></ruby>"
        out, c = fix_ruby(s)
        assert c["nested"] == 1
        assert out == "A<ruby>B<rt>b</rt></ruby>"


class TestFixRubyPassthrough:
    def test_no_ruby(self):
        out, c = fix_ruby("ただの文章です。")
        assert out == "ただの文章です。"
        assert sum(c.values()) == 0

    def test_valid_ruby_unchanged(self):
        s = "<ruby>方程式<rt>ほうていしき</rt></ruby>を<ruby>解<rt>と</rt></ruby>く。"
        out, c = fix_ruby(s)
        assert out == s
        assert sum(c.values()) == 0
