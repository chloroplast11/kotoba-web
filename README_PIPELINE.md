# Phase 1 数据生成管线（历史参考）

> **注意**：Phase 1 管线（`enrich_words.py` / `validate_words.py` 等）已被 Phase 5 管线取代。  
> 词表现在直接来自 Anki 红宝书牌组，不再需要 LLM 富化步骤。  
> 当前生产用管线请看 [README_PHASE5.md](./README_PHASE5.md)。

---

## 概述（历史记录）

Phase 1 管线用于将原始 N2 词表（`n2.json`，1831 词）富化为完整的学习数据库。当时的数据流程为 4 步：

1. 单词富化（`enrich_words.py`）——为每词生成例句、搭配、近义词、用法说明
2. 单词验证（`validate_words.py`）——跨模型验证富化数据
3. 题目生成（`generate_questions.py`）——生成 R/P/U 三维度题目
4. 题目验证（`validate_questions.py`）——独立答题验证答案唯一性

---

## 当前数据格式（Phase 5 / n2_words.json）

Phase 5 的 `n2_words.json` 字段集相比 Phase 1 的 `n2_enriched.json` 有所精简：

| 字段 | Phase 1 (n2_enriched.json) | Phase 5 (n2_words.json) |
|------|---------------------------|------------------------|
| `word` | ✅ | ✅ |
| `furigana` | ✅ | ✅ |
| `meaningZh` / `meaning_zh` | ✅ | ✅ |
| `level` | ✅ | ✅ |
| `pos` | ✅ | ✅ |
| `exampleSentences` | ✅ | ✅ |
| `pitchAccent` | — | ✅（新增，声调） |
| `homophones` | — | ✅（新增，同音語） |
| `audioFile` | — | ✅（新增，`public/audio/words/<id>.mp3`） |
| `romaji` | ✅ | ❌（已删除） |
| `meaningEn` / `meaning_en` | ✅ | ❌（已删除） |
| `frequency` | ✅ | ❌（已删除） |
| `usageNotes` / `usage_notes` | ✅ | ❌（已删除） |
| `antonyms` | ✅ | ❌（已删除） |
| `collocations` | ✅ | ❌（已删除） |
| `synonyms` | ✅ | ❌（已删除，近义词辨析改为题目数据） |

## 当前题目格式（n2_questions.json）

题目格式与 Phase 1 基本一致，字段含义不变：

```json
{
  "id": "word_題名_meaning_choice_1",
  "word_id": "題名",
  "dimension": "R",
  "type": "kanji_to_meaning",
  "question": "「<ruby>題名<rt>だいめい</rt></ruby>」の<ruby>意味<rt>いみ</rt></ruby>は？",
  "options": [...],
  "correct_index": 0,
  "explanation": "...",
  "explanation_zh": "..."
}
```

`listening_kanji` 题型的 4 个选项刻意保留为裸汉字（无假名注音），以防泄露读音答案。

## SRS 解锁规则（当前）

Phase 5 移除了 `frequency` 字段后，解锁规则简化为：

- **R**：始终解锁
- **P**：R.stability ≥ 3 天后解锁
- **U**：P.stability ≥ 3 天后解锁

不再有"低频词 U 维度默认锁死"的逻辑。

## 新词排序

新词候选按 `word.id` 升序排列（即红宝书章节顺序），不再依赖 `frequency` 字段做优先级排序。

## Prisma Schema 变化（Phase 1 → Phase 5）

### Word 模型

删除字段：`romaji / meaningEn / frequency / usageNotes / antonyms / collocations`

新增字段：`pitchAccent String? / homophones String? / audioFile String?`

### AppSettings 模型

删除字段：`practiceLowFreqUsage Boolean`

---

## 相关文档

- 当前管线：[README_PHASE5.md](./README_PHASE5.md)
- 项目规范：[CLAUDE.md](./CLAUDE.md)
- 产品愿景：[docs/PRODUCT.md](./docs/PRODUCT.md)
