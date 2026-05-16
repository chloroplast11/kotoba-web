# 红宝书 N2 词表全量替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 DB 内 450 个 N2 词 + 2320 道题全量替换为从 Anki 红宝书牌组（`N2/collection.anki2`）导出的 2336 个词 + AI 重新生成的题目，同时精简 schema、重构 SRS 解锁逻辑、整合音频资源、更新文档。

**Architecture:** 4 个串行批次 (A→B→C→D)：
- **Batch A** Schema 改造 + Anki 数据/音频导入；做完后 DB 含全部词但 Question 表空
- **Batch B** SRS / queue / settings 逻辑去掉 frequency 分支
- **Batch C** UI 组件适配（删旧字段、加新字段、音频接入）
- **Batch D** AI 重新生成 ~11000+ 道题 + 验证
- 文档（PRODUCT/README/CLAUDE）随相应 batch 增量更新，最后过一次

**Tech Stack:** Python 3（phase5 脚本 + sqlite3 + BeautifulSoup4）/ Prisma 7 + libSQL adapter / Next.js 15 + TS / ts-fsrs v5 / Zustand / pytest / tsx / msedge-tts

**Spec:** [docs/superpowers/specs/2026-05-16-rubybook-replacement-design.md](../specs/2026-05-16-rubybook-replacement-design.md)

---

## File Structure

### 新建

```
phase5/
├── import_anki.py              新：collection.anki2 → n2_words.json
└── import_audio.py             新：media JSON + N2/<id> → public/audio/words/

phase5/tests/
├── test_import_anki.py         新：解析器单元测试
└── test_import_audio.py        新：音频映射测试

phase5/prompts/
└── generate_questions.txt      重写：去除 meaning_en/frequency/antonyms 等输入字段

prisma/migrations/
└── <ts>_rubybook_replacement/  新：schema 字段 drop/add

n2_words.json                   新：替代 n2_enriched.json 作 seed 输入
```

### 修改

```
prisma/schema.prisma            Word/AppSettings 字段调整
prisma/seed.ts                  适配新字段（删 5/加 3）
phase5/db_writer.py             upsert_word SQL 改字段
phase5/generate_q.py            输入文件名、prompt 字段变更
phase5/run.py                   STEPS / ORDER 增删步骤
phase5/validate_q.py            如有引用旧字段需调整

src/lib/srs.ts                  isDimensionUnlocked 签名简化
src/lib/queue.ts                去除 FREQ_ORDER 及 low-freq 分支
src/lib/constants.ts            清理 frequency 相关常量
src/lib/library-query.ts        去除 frequency filter
src/lib/cram.ts                 去除 frequency 引用
src/store/settingsStore.ts      删 practiceLowFreqUsage
src/types/domain.ts             类型同步

src/app/api/settings/route.ts          删字段
src/app/api/session/today/route.ts     适配新 Word/Settings
src/app/api/review/route.ts            同上
src/app/api/words/route.ts             删 frequency 输出
src/app/api/words/[id]/route.ts        同上
src/app/page.tsx                       去 frequency 徽章
src/app/learn/[wordId]/page.tsx        删旧字段、加 pitchAccent/homophones/audioFile
src/app/cram/page.tsx                  去 frequency 引用
src/app/settings/page.tsx              删低频 U 开关 UI

src/components/learn/WordEntry.tsx     字段渲染调整
src/components/library/LibCard.tsx     字段渲染调整
src/components/library/WordDetailDrawer.tsx  同上

docs/PRODUCT.md                 字段/规则更新
README.md                       词数/管线更新
README_PHASE5.md                pipeline 重写
README_PIPELINE.md              字段说明更新
CLAUDE.md                       强制规则同步
```

### 删除

```
phase5/enrich.py
phase5/validate_enrich.py
phase5/backfill_lk.py
phase5/prompts/enrich_word.txt
phase5/prompts/validate_word.txt
phase5/prompts/backfill_lk.txt
n2.json                        # 旧输入
n2_enriched.json               # 旧富化产物
n2_questions.json              # 旧题库（会被新版覆盖，最后保留新版）
n2_questions_P.json / R.json / U.json   # 旧 split 产物
failed_items.json              # 上一轮残留
.phase5_progress/              # 进度文件目录（reset）
```

---

# Batch A — Schema 改造 + Anki 数据/音频导入

完成后状态：DB 表结构与 spec §3 一致；`n2_words.json` 含 2336 词；`public/audio/words/<id>.mp3` 已就位；Question 表为空。

---

### Task A1：写 import_anki 失败测试

**Files:**
- Test: `phase5/tests/test_import_anki.py`（新）

- [ ] **Step 1：建测试文件**

```python
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
```

- [ ] **Step 2：跑测试确认全部 fail（模块不存在）**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m pytest phase5/tests/test_import_anki.py -v`
Expected: `ModuleNotFoundError: No module named 'phase5.import_anki'`

---

### Task A2：实现 import_anki 解析器（无 main，先纯函数）

**Files:**
- Create: `phase5/import_anki.py`

- [ ] **Step 1：写模块（仅纯函数，main 留空）**

```python
# phase5/import_anki.py
"""Step 1 (new): parse Anki collection.anki2 → n2_words.json.

Pure functions are unit-tested; main() is integration-tested by running
against the real collection.anki2 and inspecting output.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

ANKI_DB = Path("N2/collection.anki2")
OUTPUT_FILE = Path("n2_words.json")
RUBYBOOK_MID = 1452150778360  # model id for 红宝书卡牌

EXPRESSION_RE = re.compile(r"^(.+?)\[(.+?)\]$")
POS_RE = re.compile(r"^\s*\[([^\]]+)\]\s*(.*)$", re.DOTALL)
SOUND_RE = re.compile(r"\[sound:([^\]]+)\]")
SENTENCE_SPLIT_RE = re.compile(r"△")


def parse_expression(s: str) -> Tuple[str, str]:
    m = EXPRESSION_RE.match(s.strip())
    if not m:
        raise ValueError(f"Expression does not match 'word[furigana]': {s!r}")
    return m.group(1), m.group(2)


def strip_html(html: str) -> str:
    if not html:
        return ""
    return BeautifulSoup(html, "html.parser").get_text().strip()


def extract_pos_and_meaning(text: str) -> Tuple[str, str]:
    m = POS_RE.match(text)
    if not m:
        return "", text.strip()
    return m.group(1).strip(), m.group(2).strip()


def parse_example_sentences(text: str) -> List[Dict[str, str]]:
    if not text:
        return []
    parts = [p.strip() for p in SENTENCE_SPLIT_RE.split(text) if p.strip()]
    out: List[Dict[str, str]] = []
    for p in parts:
        if "/" in p:
            jp, zh = p.split("/", 1)
            out.append({"jp": jp.strip(), "zh": zh.strip()})
        else:
            out.append({"jp": p.strip(), "zh": ""})
    return out


def parse_sound_ref(text: str) -> Optional[str]:
    m = SOUND_RE.search(text or "")
    return m.group(1) if m else None


def parse_note(note_id: int, flds: str) -> Optional[Dict]:
    """flds 字段以 \\x1f 分隔，按红宝书牌组顺序：
    0=Expression 1=声调 2=中文释义 3=例句 4=惯用 5=同音 6=Pronunciation"""
    parts = flds.split("\x1f")
    if len(parts) != 7:
        return None
    try:
        word, furigana = parse_expression(parts[0])
    except ValueError:
        return None
    pitch_raw = parts[1].strip()
    pos, meaning_zh = extract_pos_and_meaning(strip_html(parts[2]))
    examples = parse_example_sentences(strip_html(parts[3]))
    synonyms = strip_html(parts[4])
    homophones = strip_html(parts[5])
    audio_hash = parse_sound_ref(parts[6])
    return {
        "word_id": note_id,
        "word": word,
        "furigana": furigana,
        "pitch_accent": pitch_raw or None,
        "meaning_zh": meaning_zh,
        "pos": pos,
        "example_sentences": examples,
        "synonyms": synonyms or None,
        "homophones": homophones or None,
        "audio_hash": audio_hash,
        "level": 2,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=ANKI_DB)
    parser.add_argument("--out", type=Path, default=OUTPUT_FILE)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if not args.db.exists():
        print(f"Missing {args.db}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(args.db))
    rows = conn.execute(
        "SELECT id, flds FROM notes WHERE mid=? ORDER BY id",
        (RUBYBOOK_MID,),
    ).fetchall()
    conn.close()

    parsed: List[Dict] = []
    skipped: List[int] = []
    for note_id, flds in rows:
        rec = parse_note(note_id, flds)
        if rec is None:
            skipped.append(note_id)
            continue
        parsed.append(rec)
        if args.limit and len(parsed) >= args.limit:
            break

    args.out.write_text(
        json.dumps(parsed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[import_anki] notes={len(rows)} parsed={len(parsed)} skipped={len(skipped)} → {args.out}")
    if skipped:
        print(f"[import_anki] skipped note ids (first 10): {skipped[:10]}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2：装 BeautifulSoup4 依赖**

Run: `pip3 install beautifulsoup4`
Expected: Success or `Requirement already satisfied`

- [ ] **Step 3：跑测试，全过**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m pytest phase5/tests/test_import_anki.py -v`
Expected: All tests PASS.

- [ ] **Step 4：跑真实数据 smoke test**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.import_anki --limit 20`
Expected:
```
[import_anki] notes=2336 parsed=20 skipped=0 → n2_words.json
```

- [ ] **Step 5：用 jq / python 抽样检查输出**

Run: `python3 -c "import json; d=json.load(open('n2_words.json')); print(json.dumps(d[0], ensure_ascii=False, indent=2))"`

Expected：word/furigana/pos/meaning_zh/example_sentences/audio_hash 各字段都有合理值，pitch_accent 含 `⓪` 之类符号。

- [ ] **Step 6：跑全量并保留**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.import_anki`
Expected: `parsed=2336 skipped=0`，若 `skipped > 0`，记录 note id 后续 case-by-case 处理（先继续）。

- [ ] **Step 7：commit**

```bash
git add phase5/import_anki.py phase5/tests/test_import_anki.py n2_words.json
git commit -m "feat(phase5): 新增 import_anki，把红宝书 Anki 牌组解析为 n2_words.json

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task A3：写 import_audio 测试

**Files:**
- Test: `phase5/tests/test_import_audio.py`（新）

- [ ] **Step 1：写测试**

```python
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
```

- [ ] **Step 2：确认测试 fail**

Run: `python3 -m pytest phase5/tests/test_import_audio.py -v`
Expected: `ModuleNotFoundError: No module named 'phase5.import_audio'`

---

### Task A4：实现 import_audio

**Files:**
- Create: `phase5/import_audio.py`

- [ ] **Step 1：写模块**

```python
# phase5/import_audio.py
"""Step 2 (new): copy hypertts mp3 files from N2/ into public/audio/words/
and update n2_words.json with the audioFile filename."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Dict, Optional

MEDIA_MAP = Path("N2/media")
ANKI_DIR = Path("N2")
WORDS_JSON = Path("n2_words.json")
TARGET_DIR = Path("public/audio/words")
MANIFEST = Path("public/audio/manifest.json")


def build_reverse_map(media: Dict[str, str]) -> Dict[str, str]:
    return {filename: disk_id for disk_id, filename in media.items()}


def find_disk_id(reverse_map: Dict[str, str], filename: str) -> Optional[str]:
    return reverse_map.get(filename)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear", action="store_true",
                        help="clear public/audio/words/ before copy")
    args = parser.parse_args()

    if not MEDIA_MAP.exists() or not WORDS_JSON.exists():
        print(f"Missing {MEDIA_MAP} or {WORDS_JSON}", file=sys.stderr)
        sys.exit(1)

    media = json.loads(MEDIA_MAP.read_text(encoding="utf-8"))
    reverse = build_reverse_map(media)
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if args.clear:
        for f in TARGET_DIR.glob("*"):
            f.unlink()

    copied = 0
    missing = []
    for w in words:
        h = w.get("audio_hash")
        if not h:
            w["audio_file"] = None
            continue
        disk = find_disk_id(reverse, h)
        if disk is None:
            missing.append((w["word_id"], h))
            w["audio_file"] = None
            continue
        src = ANKI_DIR / disk
        if not src.exists():
            missing.append((w["word_id"], h))
            w["audio_file"] = None
            continue
        dst_name = f"{w['word_id']}.mp3"
        shutil.copyfile(src, TARGET_DIR / dst_name)
        w["audio_file"] = dst_name
        copied += 1

    WORDS_JSON.write_text(
        json.dumps(words, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    else:
        manifest = {"entries": {}, "failed": {}}
    for w in words:
        if w.get("audio_file"):
            manifest["entries"][f"word_{w['word_id']}"] = {
                "voice": "hypertts",
                "at": "rubybook-import",
            }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"[import_audio] copied={copied} missing={len(missing)}")
    if missing:
        print(f"[import_audio] missing (first 10): {missing[:10]}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2：测试通过**

Run: `python3 -m pytest phase5/tests/test_import_audio.py -v`
Expected: 3 passed

- [ ] **Step 3：跑真实导入（带 --clear，把旧 TTS 清掉）**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.import_audio --clear`
Expected: `copied≈2336 missing<10`

- [ ] **Step 4：核对一个 mp3 能播**

Run: `ls public/audio/words/ | head -3 && file public/audio/words/$(ls public/audio/words/ | head -1)`
Expected: `MPEG ADTS, layer III` 之类

- [ ] **Step 5：commit**

```bash
git add phase5/import_audio.py phase5/tests/test_import_audio.py n2_words.json public/audio/words public/audio/manifest.json
git commit -m "feat(phase5): 新增 import_audio，拷贝红宝书 hypertts mp3 到 public/audio/words/

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task A5：Prisma schema 改造

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1：编辑 schema**

把 `Word` 模型替换为：

```prisma
model Word {
  id               Int    @id
  word             String
  furigana         String
  meaningZh        String
  level            Int
  pos              String
  exampleSentences String
  synonyms         String
  pitchAccent      String?
  homophones       String?
  audioFile        String?
  qualityScore     Int?
  needsReview      Boolean @default(false)

  questions    Question[]
  wordStates   UserWordState[]
  wrongAnswers WrongAnswer[]
}
```

把 `AppSettings` 模型中 `practiceLowFreqUsage Boolean @default(false)` 一行删除。

- [ ] **Step 2：生成 migration（dev 环境直接重置）**

Run: `cd /Users/yuhang/kotobaWeb && rm -f dev.db && npx prisma migrate reset --force --skip-seed`

Expected: 不报错，所有旧 migration 被清掉前会提示，因为我们走 `reset` 不是 `dev`，会保留 migration 历史。如失败改用：
```
rm -rf prisma/migrations dev.db
npx prisma migrate dev --name rubybook_replacement
```

- [ ] **Step 3：重新生成 client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client (v7.x.x)`

- [ ] **Step 4：跑 TS 编译，确认全部"需删字段"对应的类型错误就位**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: 一片红，这些就是 Batch B/C 要修的引用点；**记录数量留底**。

- [ ] **Step 5：commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "refactor(schema): Word 删 6 列加 3 列；AppSettings 删 practiceLowFreqUsage

- 删除：romaji meaningEn frequency usageNotes antonyms collocations
- 新增：pitchAccent? homophones? audioFile?

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task A6：seed.ts 改造

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1：替换 `EnrichedWord` 接口和 `seedWords` 函数**

新 `EnrichedWord` 接口：

```typescript
interface EnrichedWord {
  word_id: number;
  word: string;
  furigana: string;
  meaning_zh: string;
  level: number;
  pos: string;
  example_sentences: object[];
  synonyms: string | null;
  pitch_accent: string | null;
  homophones: string | null;
  audio_file: string | null;
}
```

`seedWords` 函数体改为：

```typescript
async function seedWords(words: EnrichedWord[]) {
  assertNoWordCollisions(words);
  console.log(`Seeding ${words.length} words...`);
  await prisma.word.deleteMany();
  await prisma.word.createMany({
    data: words.map((w) => ({
      id: w.word_id,
      word: w.word,
      furigana: w.furigana,
      meaningZh: w.meaning_zh || "",
      level: w.level,
      pos: w.pos || "",
      exampleSentences: JSON.stringify(w.example_sentences || []),
      synonyms: w.synonyms ?? "",
      pitchAccent: w.pitch_accent,
      homophones: w.homophones,
      audioFile: w.audio_file,
    })),
  });
  console.log(`✓ Seeded ${words.length} words`);
}
```

`assertNoWordCollisions` 不变。删除 `normalizeFrequency` 函数。

文件底部找到读 `n2_enriched.json` 的入口改为 `n2_words.json`。如果原来还读 `n2_questions.json` 后调 `seedQuestions(questions)`，**保留**该逻辑（Batch D 会重新生成 questions.json；若不存在则跳过，加守卫）：

```typescript
const wordsPath = path.resolve(__dirname, "..", "n2_words.json");
const questionsPath = path.resolve(__dirname, "..", "n2_questions.json");

const words = JSON.parse(fs.readFileSync(wordsPath, "utf-8")) as EnrichedWord[];
await seedWords(words);

if (fs.existsSync(questionsPath)) {
  const questions = JSON.parse(fs.readFileSync(questionsPath, "utf-8")) as RawQuestion[];
  await seedQuestions(questions);
} else {
  console.log("⚠ n2_questions.json not found, skipping question seed");
}
```

`RawQuestion` 接口和 `seedQuestions` 函数本身不需要改（Question schema 不变）。

- [ ] **Step 2：跑 seed**

Run: `cd /Users/yuhang/kotobaWeb && npm run db:seed`
Expected: `Seeded 2336 words` + `⚠ n2_questions.json not found, skipping question seed`

- [ ] **Step 3：用 prisma studio / sqlite3 验证**

Run: `sqlite3 dev.db "SELECT COUNT(*) FROM Word; SELECT id,word,furigana,pitchAccent,audioFile FROM Word LIMIT 3;"`
Expected: `2336` 然后 3 行样本数据，字段非空合理。

- [ ] **Step 4：commit**

```bash
git add prisma/seed.ts
git commit -m "refactor(seed): 切换到 n2_words.json，适配新 Word 字段

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task A7：phase5 pipeline 编排更新

**Files:**
- Modify: `phase5/run.py`
- Modify: `phase5/db_writer.py`
- Delete: `phase5/enrich.py`, `phase5/validate_enrich.py`, `phase5/backfill_lk.py`
- Delete: `phase5/prompts/enrich_word.txt`, `phase5/prompts/validate_word.txt`, `phase5/prompts/backfill_lk.txt`

- [ ] **Step 1：删除旧步骤**

Run:
```bash
git rm phase5/enrich.py phase5/validate_enrich.py phase5/backfill_lk.py \
       phase5/prompts/enrich_word.txt phase5/prompts/validate_word.txt phase5/prompts/backfill_lk.txt
```

- [ ] **Step 2：更新 `phase5/run.py`**

替换 `STEPS` 与 `ORDER`：

```python
STEPS = {
    "import-anki":   "phase5.import_anki",
    "import-audio":  "phase5.import_audio",
    "generate-q":    "phase5.generate_q",
    "validate-q":    "phase5.validate_q",
    "split-json":    "phase5.split_json",
}

ORDER = ["import-anki", "import-audio", "generate-q", "validate-q", "split-json"]
```

并把 `help_msg` 中的描述同步。

- [ ] **Step 3：更新 `phase5/db_writer.py`**

`upsert_word` 改成：

```python
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
```

删除 `_FREQ_MAP` 常量与 `_norm_freq` 函数。

- [ ] **Step 4：跑 db_writer 现有测试确认无回归**

Run: `python3 -m pytest phase5/tests/test_db_writer.py -v`
Expected: 若旧测试断言了 `frequency` 等字段，更新断言到新字段。若纯通过则继续。

- [ ] **Step 5：commit**

```bash
git add phase5/run.py phase5/db_writer.py phase5/enrich.py phase5/validate_enrich.py phase5/backfill_lk.py phase5/prompts/
git commit -m "refactor(phase5): 重写 pipeline 编排，删 enrich/backfill-lk，加 import-anki/import-audio

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task A8：清理旧数据文件

**Files:**
- Delete: `n2.json`, `n2_enriched.json`, `n2_questions.json`, `n2_questions_P.json`, `n2_questions_R.json`, `n2_questions_U.json`, `failed_items.json`, `.phase5_progress/`

- [ ] **Step 1：删除**

Run:
```bash
cd /Users/yuhang/kotobaWeb && \
git rm n2.json n2_enriched.json n2_questions.json n2_questions_P.json n2_questions_R.json n2_questions_U.json failed_items.json 2>/dev/null
rm -rf .phase5_progress/
```

- [ ] **Step 2：commit**

```bash
git commit -m "chore: 删除旧 N2 数据/题目文件，进度文件夹清空

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Batch A 完成检查点

- [ ] Schema 与 spec §3 一致
- [ ] `dev.db` 含 2336 个 Word，0 个 Question
- [ ] `public/audio/words/<id>.mp3` 数量 ≈ 2336
- [ ] `n2_words.json` 存在且字段齐
- [ ] `npm run dev` 启动不崩；首页（应该会因为缺 frequency 字段引用而 500，但服务进程能起）
- [ ] **此时 Batch B 之前**先 stop，因为 TS 编译还有大量错误（Batch B/C 处理）。可以选择 `npm run dev` 跳过类型检查继续看效果，但不建议。

---

# Batch B — SRS / queue / settings 逻辑重构

完成后状态：所有 TS 编译错误消除；SRS 解锁与队列构建不再引用 frequency / practiceLowFreqUsage；测试通过。

---

### Task B1：重写 `isDimensionUnlocked` 签名

**Files:**
- Modify: `src/lib/srs.ts:91-111`

- [ ] **Step 1：编辑**

把当前 `isDimensionUnlocked` 替换为：

```typescript
// Whether a dimension is unlocked for practice.
// R 始终解锁；P 解锁要求 R.stability >= UNLOCK_THRESHOLD；U 同理依赖 P。
export function isDimensionUnlocked(
  dim: DimKey,
  dimStates: Record<DimKey, SrsData | null>
): boolean {
  if (dim === "R") return true;
  if (dim === "P") {
    const r = dimStates.R;
    return !!r && r.stability >= UNLOCK_THRESHOLD;
  }
  if (dim === "U") {
    const p = dimStates.P;
    return !!p && p.stability >= UNLOCK_THRESHOLD;
  }
  return false;
}
```

- [ ] **Step 2：扫调用方**

Run: `grep -rn "isDimensionUnlocked" src --include="*.ts" --include="*.tsx"`
Expected: 现有调用都传了 `frequency` 和 `settings`，需在 Batch B 后续 task 中逐一去掉这两个参数。

---

### Task B2：重构 `buildTodayQueue` 与 `reconcileNewWordsInQueue`

**Files:**
- Modify: `src/lib/queue.ts`

- [ ] **Step 1：删 `FREQ_ORDER` import**

把 `src/lib/queue.ts:3` 的 import 行：
```typescript
import { FREQ_ORDER } from "./constants";
```
直接删除。

- [ ] **Step 2：调整 `buildTodayQueue` 中 `isDimensionUnlocked` 调用**

`queue.ts:73` 处：
```typescript
if (!isDimensionUnlocked(dim, dimStates, word.frequency, settings)) continue;
```
改成：
```typescript
if (!isDimensionUnlocked(dim, dimStates)) continue;
```

- [ ] **Step 3：去掉新词候选按 frequency 排序**

`queue.ts:95-98` 处：
```typescript
const newCandidates = words
  .filter((w) => !learnedIds.has(w.id))
  .sort((a, b) => (FREQ_ORDER[a.frequency] ?? 99) - (FREQ_ORDER[b.frequency] ?? 99))
  .slice(0, settings.dailyNewWords);
```
改成（按 word id 升序，即 Anki note 时间顺序，对应红宝书章节顺序）：
```typescript
const newCandidates = words
  .filter((w) => !learnedIds.has(w.id))
  .sort((a, b) => a.id - b.id)
  .slice(0, settings.dailyNewWords);
```

- [ ] **Step 4：去掉 Round 2 的 low-freq 限制**

`queue.ts:127` 处：
```typescript
if (word.frequency !== "low" && remaining.length > 0) {
  round2Staged.push({ wordId: word.id, dim: "R" });
}
```
改成（始终 stage Round 2）：
```typescript
if (remaining.length > 0) {
  round2Staged.push({ wordId: word.id, dim: "R" });
}
```

- [ ] **Step 5：同样改 `reconcileNewWordsInQueue`**

`queue.ts:221` 处的 sort 改 `(a, b) => a.id - b.id`。
`queue.ts:240` 处的 low-freq 守卫与 Step 4 同样改。

- [ ] **Step 6：tsc 检查**

Run: `npx tsc --noEmit 2>&1 | grep -E "queue.ts|srs.ts" | head -20`
Expected: 此文件的错误清零（其他文件错误等 B3+ 处理）。

- [ ] **Step 7：commit**

```bash
git add src/lib/queue.ts src/lib/srs.ts
git commit -m "refactor(srs/queue): 去掉 frequency 与 practiceLowFreqUsage 分支

- isDimensionUnlocked 签名简化为 (dim, dimStates)
- 新词候选改按 word.id 升序（红宝书原顺序）
- Round 2 不再排除 low-freq

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task B3：清理 `constants.ts` 中 frequency 常量

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1：检索**

Run: `grep -n "FREQ\|frequency" src/lib/constants.ts`

- [ ] **Step 2：删除任何 `FREQ_ORDER` / 频率相关 const**

如：
```typescript
export const FREQ_ORDER: Record<string, number> = { high: 0, mid: 1, low: 2 };
```
整段删掉。`UNLOCK_THRESHOLD = 3` 保留。`DIM_NAMES` / `DIM_DESCRIPTIONS` 保留。

- [ ] **Step 3：commit**

```bash
git add src/lib/constants.ts
git commit -m "refactor(constants): 删除 FREQ_ORDER 等 frequency 常量

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task B4：settingsStore 去字段 + AppSettingsData 类型同步

**Files:**
- Modify: `src/store/settingsStore.ts`
- Modify: `src/types/domain.ts`

- [ ] **Step 1：`settingsStore`**

Run: `grep -n "practiceLowFreqUsage" src/store/settingsStore.ts`
对每一处：
- state 字段定义中删除 `practiceLowFreqUsage`
- 初始值中删除
- 任何 setter / payload 中删除

- [ ] **Step 2：`domain.ts` 中 `AppSettingsData`**

Run: `grep -n "practiceLowFreqUsage\|frequency" src/types/domain.ts`
- 删除 `AppSettingsData.practiceLowFreqUsage`
- 如有 `Word` 类型扩展（多数从 prisma 导入），改为补充 `pitchAccent / homophones / audioFile` 这三个字段（如果不直接用 `prisma.Word`）

- [ ] **Step 3：commit**

```bash
git add src/store/settingsStore.ts src/types/domain.ts
git commit -m "refactor(types/store): 移除 practiceLowFreqUsage，AppSettings 字段同步

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task B5：API 路由层适配

**Files:**
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/session/today/route.ts`
- Modify: `src/app/api/review/route.ts`
- Modify: `src/app/api/words/route.ts`
- Modify: `src/app/api/words/[id]/route.ts`

- [ ] **Step 1：逐个文件 grep + 删除/替换**

对每个文件运行：
```bash
grep -n "frequency\|practiceLowFreqUsage\|meaningEn\|antonyms\|collocations\|usageNotes\|romaji" <file>
```

修改原则：
- 任何 select / serialize 出去的 Word 字段，删除上述 6 个字段
- 加 `pitchAccent / homophones / audioFile`
- AppSettings 序列化删 `practiceLowFreqUsage`
- 任何 `isDimensionUnlocked(dim, dimStates, word.frequency, settings)` 改 `isDimensionUnlocked(dim, dimStates)`

- [ ] **Step 2：tsc 检查**

Run: `npx tsc --noEmit 2>&1 | grep "src/app/api" | head -10`
Expected: api 目录类型错误清零。

- [ ] **Step 3：commit**

```bash
git add src/app/api
git commit -m "refactor(api): 适配新 Word/AppSettings 字段，去 frequency 引用

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task B6：library-query / cram 库引用

**Files:**
- Modify: `src/lib/library-query.ts`
- Modify: `src/lib/cram.ts`

- [ ] **Step 1：library-query**

Run: `grep -n "frequency" src/lib/library-query.ts`
若有按 frequency 的 filter 选项/排序，**删除**。如果 UI 上要 fallback 一个排序，按 `id` 升序兜底。

- [ ] **Step 2：cram**

Run: `grep -n "frequency\|FREQ_ORDER" src/lib/cram.ts`
同样删除。

- [ ] **Step 3：tsc 检查**

Run: `npx tsc --noEmit 2>&1 | grep -E "library-query|cram" | head -10`
Expected: 空

- [ ] **Step 4：commit**

```bash
git add src/lib/library-query.ts src/lib/cram.ts
git commit -m "refactor(lib): library-query/cram 去 frequency 引用

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Batch B 完成检查点

- [ ] `npx tsc --noEmit` 全过
- [ ] `npm run dev` 启动不报错，首页加载（题目空所以题目区会空，但页面壳/Library 都能渲染）
- [ ] `grep -rn "frequency\|practiceLowFreqUsage" src --include="*.ts" --include="*.tsx"` 只剩历史注释/已删字段提示，无活引用

---

# Batch C — UI 组件适配

完成后状态：所有面向用户的组件正确处理「字段缺失则不渲染」；新增字段 `pitchAccent` / `homophones` / `audioFile` 有合适的展示位。

---

### Task C1：扫一遍要改的组件并列清单

- [ ] **Step 1：grep**

Run:
```bash
grep -rln "frequency\|meaningEn\|antonyms\|collocations\|usageNotes\|romaji" src/app src/components --include="*.tsx" --include="*.ts"
```

记录待改文件清单。基于 spec 与本计划，至少包括：

- `src/app/page.tsx`（首页 - frequency 徽章）
- `src/app/learn/[wordId]/page.tsx`
- `src/app/cram/page.tsx`
- `src/app/settings/page.tsx`
- `src/components/learn/WordEntry.tsx`
- `src/components/library/LibCard.tsx`
- `src/components/library/WordDetailDrawer.tsx`

---

### Task C2：单词学习/详情组件（`WordEntry` + `WordDetailDrawer`）

**Files:**
- Modify: `src/components/learn/WordEntry.tsx`
- Modify: `src/components/library/WordDetailDrawer.tsx`

- [ ] **Step 1：删除旧字段段落**

对 `meaningEn` / `antonyms` / `collocations` / `usageNotes` / `romaji` 的渲染段，**整段删除**（包括标签/section header/容器）。

- [ ] **Step 2：新增 pitchAccent 展示**

在 `furigana` 同行末尾追加一个小角标（仅当 `pitchAccent` 存在）：

```tsx
{word.pitchAccent && (
  <span className="ml-2 text-sm text-muted-foreground" title="声调（アクセント）">
    {word.pitchAccent}
  </span>
)}
```

（颜色变量沿用 `globals.css` 现有的 `--muted-foreground`，如名字不一致改为对应项。）

- [ ] **Step 3：新增 homophones 段落**

仅当存在时渲染（CLAUDE.md 规则 1：日语区文案用日语）：

```tsx
{word.homophones && (
  <section>
    <h3 className="text-sm font-medium opacity-70">同音語</h3>
    <p className="mt-1 text-sm whitespace-pre-wrap">{word.homophones}</p>
  </section>
)}
```

- [ ] **Step 4：音频按钮接入 audioFile**

如果组件之前用 `manifest` 或 `text → hash` 找 mp3，改为：
```tsx
{word.audioFile && (
  <button onClick={() => new Audio(`/audio/words/${word.audioFile}`).play()}>
    🔊
  </button>
)}
```
（emoji 仅示意，沿用项目原图标；若没图标用 `▶︎` 等纯字符。**注意 CLAUDE.md 规则：不主动加 emoji**——找一下原有的图标实现复用。）

- [ ] **Step 5：浏览器手测**

Run: `npm run dev`，访问 `http://localhost:3000/library` 打开任一词。
Expected: 不报红屏；pitchAccent 显示在假名旁；同音语区在有数据时出现。

- [ ] **Step 6：commit**

```bash
git add src/components/learn/WordEntry.tsx src/components/library/WordDetailDrawer.tsx
git commit -m "feat(ui): 单词详情删旧字段，加 pitchAccent/homophones/audioFile 渲染

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task C3：Library 卡片 (`LibCard`)

**Files:**
- Modify: `src/components/library/LibCard.tsx`

- [ ] **Step 1：删 frequency 徽章 / 颜色**

定位 `frequency` 相关 JSX（badge / icon / 颜色 className），整体移除。

- [ ] **Step 2：可选展示 pitchAccent**

如果原本卡片有"读音"行，在末尾追加 `pitchAccent`（小号灰色）。

- [ ] **Step 3：commit**

```bash
git add src/components/library/LibCard.tsx
git commit -m "feat(library): LibCard 去 frequency 徽章，加 pitchAccent

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task C4：首页 + cram + settings 页面调整

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/cram/page.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/learn/[wordId]/page.tsx`

- [ ] **Step 1：首页**

`grep -n "frequency" src/app/page.tsx`
删除任何按频率分组/着色/筛选的 UI 元素。今日队列保持原排版（CLAUDE.md 规则 1：日语区文案）。

- [ ] **Step 2：cram 页**

同上。

- [ ] **Step 3：settings 页（中文区）**

`grep -n "practiceLowFreqUsage\|低频" src/app/settings/page.tsx`
删除"低频词 U 维度手动解锁"的整段 UI（开关 + 说明）。其它中文设置项不动。

- [ ] **Step 4：learn 页**

`grep -n "frequency\|meaningEn\|antonyms\|collocations\|usageNotes\|romaji" src/app/learn/[wordId]/page.tsx`
删除引用；如果直接渲染了 Word 表中删掉的字段，去除对应 JSX。

- [ ] **Step 5：tsc 全过 + dev 启动**

Run: `npx tsc --noEmit && echo OK`
Expected: `OK`

Run: `npm run dev`（确认没有 hydration 错误）

- [ ] **Step 6：commit**

```bash
git add src/app
git commit -m "feat(ui): 首页/cram/settings/learn 去 frequency 与已删字段

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Batch C 完成检查点

- [ ] `npx tsc --noEmit` 全过
- [ ] `npm run dev` 启动；首页 / Library / 设置 / 一个词的详情都能加载
- [ ] 音频按钮能播红宝书 mp3
- [ ] 因为 Question 表为空，Practice/Learn 流程做题环节会停在"无可用题"——预期，由 Batch D 解决

---

# Batch D — AI 重新生成题目

完成后状态：每词 4-8 道题、覆盖 R/P/U、含 listening_kanji，~11000+ 道题入库，质量校验通过。

---

### Task D1：重写 generate_questions 提示词

**Files:**
- Modify: `phase5/prompts/generate_questions.txt`

- [ ] **Step 1：编辑 prompt**

原 `{enriched_word_json}` 占位符的替换文本（在 generate_q.py 中）会换成新结构。新版 prompt 内容（核心改动：输入字段说明从旧 8 字段改为新 7 字段；规则保持）：

把 prompt 中描述"输入富化单词数据"那一段，改成显式列出新字段：

```
输入单词数据（JSON）：
{enriched_word_json}

字段说明：
- word: 写法（汉字或假名）
- furigana: 假名读音
- pitch_accent: 声调（⓪①②③④ 或复合如 ⓪③）
- pos: 词性（[副] / [名•自他動3] 等）
- meaning_zh: 中文释义
- example_sentences: 例句 list，每项含 jp / zh
- synonyms: 同义/相关词（红宝书原文，可能为空）
- homophones: 同音词（可能为空）
```

其余规则（R/P/U 维度、ruby 注音强制、listening_kanji 强约束）**保留不变**。

- [ ] **Step 2：commit**

```bash
git add phase5/prompts/generate_questions.txt
git commit -m "refactor(phase5): generate_questions 提示词适配新输入字段

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task D2：generate_q.py 输入文件/阈值调整

**Files:**
- Modify: `phase5/generate_q.py`

- [ ] **Step 1：编辑常量**

```python
ENRICHED_FILE = Path("n2_words.json")        # was n2_enriched.json
NEW_WORD_ID_THRESHOLD = 0                    # was 450; 全量生成
```

- [ ] **Step 2：在 prompt 构造前，预筛掉 audio_hash 这种内部字段**

避免泄露内部字段进 prompt（且节省 tokens）。改为：

```python
def _strip_for_prompt(w: Dict) -> Dict:
    return {k: v for k, v in w.items() if k not in ("audio_hash", "audio_file")}

prompts = [
    prompt_template.format(enriched_word_json=json.dumps(_strip_for_prompt(w), ensure_ascii=False, indent=2))
    for w in chunk
]
```

- [ ] **Step 3：小规模冒烟测试**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.generate_q --limit 5 --concurrency 2`
Expected: 5 词生成、写入 `n2_questions.json`。

- [ ] **Step 4：抽查生成题目质量**

Run: `python3 -c "import json; q=json.load(open('n2_questions.json'))[:6]; print(json.dumps(q, ensure_ascii=False, indent=2))"`

检查：题干有 `<ruby>`、4 个选项、`correct_index` 0-3、含 1 道 `listening_kanji`、`dimension` 覆盖 R/P/U。

- [ ] **Step 5：commit**

```bash
git add phase5/generate_q.py
git commit -m "refactor(phase5): generate_q 切到 n2_words.json，全量生成

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task D3：全量生成（耗时，单独 task）

- [ ] **Step 1：清掉冒烟测试的 5 条进度 + n2_questions.json**

Run:
```bash
rm -f n2_questions.json failed_items.json
rm -rf .phase5_progress/generate_q.json
```

- [ ] **Step 2：跑全量**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.generate_q --concurrency 8 2>&1 | tee /tmp/generate_q.log`

预计时长：根据并发与 API 速度，30 分钟到 2 小时不等。失败的词会写入 `failed_items.json`。

- [ ] **Step 3：失败项重试**

如有 `failed_items.json`，挑一遍 → 修 prompt（必要时） → `python3 -m phase5.generate_q --force --limit <N>`（注意 `--force` 会从头跑，建议用 `progress.py` 的机制只对失败的重试；查 `phase5/progress.py` 了解）。

- [ ] **Step 4：commit**

```bash
git add n2_questions.json failed_items.json .phase5_progress
git commit -m "feat: AI 生成红宝书 2336 词的 R/P/U 题库

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task D4：题目验证（validate-q）

**Files:**
- Modify: `phase5/validate_q.py`（仅当引用旧字段时）

- [ ] **Step 1：检查 validate_q 是否引用 frequency / meaning_en**

Run: `grep -n "frequency\|meaning_en\|antonym\|collocation\|usage_note" phase5/validate_q.py`

如有，删除/替换。验证逻辑本身（用 Qwen 评分题目）不动。

- [ ] **Step 2：跑全量验证**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.validate_q --concurrency 4`
Expected: 每题 qualityScore 写入 DB，质量差的标 `needsReview=true`。

- [ ] **Step 3：人工抽查 needsReview 的题**

Run: `sqlite3 dev.db "SELECT id, type, dimension FROM Question WHERE needsReview=1 LIMIT 20;"`

- [ ] **Step 4：可选 split-json**

Run: `cd /Users/yuhang/kotobaWeb && python3 -m phase5.split_json`
Expected: 生成 `n2_questions_R.json` / `_P.json` / `_U.json`

- [ ] **Step 5：commit**

```bash
git add phase5/validate_q.py n2_questions*.json
git commit -m "chore(phase5): 题库质量验证完成

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task D5：seed 全套 + 端到端验证

- [ ] **Step 1：重新 seed（这次包含 questions）**

Run: `cd /Users/yuhang/kotobaWeb && npx prisma migrate reset --force`
（这会 reset DB 然后自动跑 seed，因为 `package.json` 配了 `prisma.seed`）
Expected: `Seeded 2336 words` + `Seeded ~11000 questions`

- [ ] **Step 2：端到端学习流程**

Run: `npm run dev`，浏览器访问：
1. 首页 → 看到 4 个新词的 Round 1 队列
2. 点进 Learn 页学一个词，看 pitchAccent / 同音語 / 音频
3. 答 Round 1 + Round 2
4. Cram 模式（如有）也试一下
5. Library 翻几页

Expected: 全流程无报错；CLAUDE.md §「多日行为模拟」打开 devStore 用 `advanceDay(4)` / `(12)` / `(30)`，确认队列演化符合规则。

- [ ] **Step 3：commit（如有调整）**

```bash
git add -u
git commit -m "test: 端到端验证红宝书替换流程

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" 2>/dev/null || echo "nothing to commit"
```

---

# Batch D 完成检查点

- [ ] DB 中 Word=2336, Question 数 ≈ 11000+
- [ ] 每词题数 ≥ 4 且含至少一道 listening_kanji（spot check 抽 10 词）
- [ ] needsReview 比例 < 10%（spec §11 上限可后续调）
- [ ] Day 1 / 4 / 12 / 30 多日模拟通过

---

# 收尾 — 文档同步

### Task E1：PRODUCT.md 更新

**Files:**
- Modify: `docs/PRODUCT.md:49`（"低频词 U 维度默认锁死"）
- Modify: `docs/PRODUCT.md:112`（"低频词只有 Round 1"）

- [ ] **Step 1：删除/重写第 49 行附近条目**

把"低频词 U 维度默认锁死（用户可手动开启）"那条删除。如果上下文还有"低频 / 中频 / 高频"三档说明，整个频率分级章节简化为：

> 词表来源：红宝书 N2 牌组，约 2336 词，按章节顺序导入。不再区分高/中/低频。

- [ ] **Step 2：删除/重写第 112 行附近段落**

"低频词只有 Round 1（减负…）"删除。Round 1/2 现在对所有新词一致：均有 Round 2。

- [ ] **Step 3：词表规模数字更新**

全文 grep `450`，凡指词表大小的，改 `2336`（或"约 2300"）。

- [ ] **Step 4：commit**

```bash
git add docs/PRODUCT.md
git commit -m "docs(PRODUCT): 同步 frequency 移除与红宝书 2336 词

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task E2：README.md / README_PHASE5.md / README_PIPELINE.md

**Files:**
- Modify: `README.md`
- Modify: `README_PHASE5.md`
- Modify: `README_PIPELINE.md`

- [ ] **Step 1：README.md**

更新：
- 词数 450 → 2336
- 数据来源描述：从手工整理 → 红宝书 Anki 牌组
- 音频：msedge-tts → 红宝书 hypertts（单词）+ msedge-tts（例句）

- [ ] **Step 2：README_PHASE5.md**

重写 pipeline 章节，反映新 5 步流程：`import-anki / import-audio / generate-q / validate-q / split-json`。删 `enrich` / `validate-enrich` / `backfill-lk` 章节。

- [ ] **Step 3：README_PIPELINE.md**

如有字段映射表，更新。

- [ ] **Step 4：commit**

```bash
git add README.md README_PHASE5.md README_PIPELINE.md
git commit -m "docs(README): 更新词表来源、字段结构、phase5 pipeline

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task E3：CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1：扫规则区与"已知技术债"**

Run: `grep -n "frequency\|低频\|高频\|中频\|practiceLowFreq" CLAUDE.md`

- 涉及 frequency 解锁逻辑描述的段落更新
- "已知技术债"清单中已消解的项目（如「Library 缺等级筛选」） 视情况更新或保留
- 词表规模描述（如有）更新

- [ ] **Step 2：commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): 同步红宝书替换后的字段与规则约定

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# 整体验收（spec §11）

- [ ] schema 与 spec §3 一致
- [ ] `n2_words.json` 含 2336 条，关键字段非空率 > 95%
- [ ] `public/audio/words/<id>.mp3` 数量 ≈ 词数（缺失 < 5）
- [ ] `n2_questions.json` 每词 4-8 题，含 listening_kanji
- [ ] `isDimensionUnlocked` 新签名；`buildTodayQueue` 无频率分池
- [ ] 多日模拟 Day 1 → Day 30 跑通
- [ ] PRODUCT.md / README*.md / CLAUDE.md 已更新
- [ ] `grep -rn "frequency\|practiceLowFreqUsage" src --include="*.ts" --include="*.tsx"` 无残留活引用
- [ ] `npx tsc --noEmit` 全过

---

_Plan 结束。_
